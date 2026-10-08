"""Mining preparation ownership/backup boundaries; no MySQL or engine access."""
import contextlib
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
spec = importlib.util.spec_from_file_location("mining_prep", ROOT / "tools/prepare_mining_probe.py")
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)
cleanup_spec = importlib.util.spec_from_file_location("mining_cleanup", ROOT / "tools/cleanup_mining_probe.py")
cleanup = importlib.util.module_from_spec(cleanup_spec)
cleanup_spec.loader.exec_module(cleanup)


class MiningPreparationTests(unittest.TestCase):
    def fixture(self):
        return dict(account="m0123abcd", character="M0123abcd", password="private-test-value",
                    createdAt="2026-01-01T00:00:00+00:00")

    def world(self, root):
        data = bytearray(52 + 4 * 4 * 12)
        struct.pack_into("<HH", data, 0, 4, 4)
        struct.pack_into("<H", data, 52 + (2 * 4 + 1) * 12, 0x8000)
        path = root / ".runtime/server/Mir200/Map"
        path.mkdir(parents=True)
        (path / "D401.map").write_bytes(data)
        (path / "0.map").write_bytes(data)
        envir = root / ".runtime/server/Mir200/Envir"
        envir.mkdir(parents=True)
        (envir / "MapInfo.txt").write_text("[D401 mine] MINE\n", encoding="utf-8")
        (envir / "MerChant.txt").write_text("test/store 0 1 1 \u7efc\u5408\u5546\u4eba 0 5 0\n", encoding="utf-8")
        (root / ".runtime/mining-fixtures.json").write_text(json.dumps({"fixtures":[self.fixture()]}), encoding="utf-8")

    def backup(self, root, *, corrupt=False, before=False, owned=True, traversal=False):
        archive = root / "backup.tar.gz"
        database = b"private dump m0123abcd M0123abcd" if owned else b"other save"
        manifest = dict(schemaVersion=1, databases=["mir2_account","mir2_db","mir2_data"],
                        createdAt="2025-12-01T00:00:00+00:00" if before else datetime.now(timezone.utc).isoformat(),
                        databaseBytes=len(database),databaseSha256="bad" if corrupt else hashlib.sha256(database).hexdigest(),
                        fileSha256={})
        with tarfile.open(archive,"w:gz") as bundle:
            for name,raw in [("database.sql",database),("manifest.json",json.dumps(manifest).encode())]:
                member=tarfile.TarInfo(name);member.size=len(raw);bundle.addfile(member,io.BytesIO(raw))
            if traversal:
                member=tarfile.TarInfo("../outside");member.size=1;bundle.addfile(member,io.BytesIO(b"x"))
        return archive

    def test_strict_single_owned_namespace(self):
        fixture, _ = prep.validate_fixture({"fixtures":[self.fixture()]})
        self.assertEqual(fixture["character"],"M0123abcd")
        for manifest in [{"fixtures":[]},{"fixtures":[self.fixture(),self.fixture()]},
                         {"fixtures":[dict(self.fixture(),account="existing")]},
                         {"fixtures":[dict(self.fixture(),character="Existing")]},
                         {"fixtures":[self.fixture()],"cleaned":True}]:
            with self.subTest(manifest=manifest),self.assertRaises(ValueError):
                prep.validate_fixture(manifest)
        cleanup.validate_fixtures({"fixtures":[self.fixture()]})
        with self.assertRaises(ValueError):
            cleanup.validate_fixtures({"fixtures":[dict(self.fixture(),account="s0123abcd")]})

    def test_plan_no_database_write_or_credential_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);self.world(root)
            original=(root/".runtime/mining-fixtures.json").read_bytes();output=io.StringIO()
            with patch.object(prep,"ROOT",root),patch.object(sys,"argv",["prepare"]),\
                 patch.object(prep.subprocess,"run") as run,contextlib.redirect_stdout(output):
                prep.main()
            run.assert_not_called()
            self.assertEqual((root/".runtime/mining-fixtures.json").read_bytes(),original)
            self.assertNotIn("private-test-value",output.getvalue());self.assertNotIn("m0123abcd",output.getvalue())

    def test_apply_requires_stopped_engine_before_database_access(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);self.world(root)
            (root/".runtime/native-server.json").write_text('{"status":"ready"}',encoding="utf-8")
            with patch.object(prep,"ROOT",root),patch.object(sys,"argv",["prepare","--apply"]),\
                 patch.object(prep.subprocess,"run") as run,self.assertRaises(SystemExit):
                prep.main()
            run.assert_not_called()

    def test_checksums_fixture_inclusion_date_and_archive_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);fixture,created=prep.validate_fixture({"fixtures":[self.fixture()]})
            self.assertEqual(prep.validate_backup(self.backup(root),fixture,created)["schemaVersion"],1)
            for kwargs in [dict(corrupt=True),dict(before=True),dict(owned=False),dict(traversal=True)]:
                with self.subTest(kwargs=kwargs),self.assertRaises(ValueError):
                    prep.validate_backup(self.backup(root,**kwargs),fixture,created)

    def test_map_flags_and_wall_source_are_authoritative(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);self.world(root)
            spawn=prep.spawn_for_stage(root,"mine")
            world=prep.ClassicMap((root/".runtime/server/Mir200/Map/D401.map").read_bytes())
            self.assertFalse(world.blocked(spawn["x"],spawn["y"]))
            dx,dy=prep.OFFSETS[spawn["miningDirection"]]
            self.assertTrue(world.blocked(spawn["x"]+dx,spawn["y"]+dy))
            (root/".runtime/server/Mir200/Envir/MapInfo.txt").write_text("[D401 mine]\n",encoding="utf-8")
            with self.assertRaises(ValueError):prep.spawn_for_stage(root,"mine")

    def test_preparation_changes_only_character_fields(self):
        fixture,_=prep.validate_fixture({"fixtures":[self.fixture()]})
        sql=prep.preparation_sql(fixture,dict(map="D401",x=1,y=1,direction=6),35)
        self.assertEqual(sql.count("UPDATE "),2)
        self.assertIn("LoginID='m0123abcd' AND ChrName='M0123abcd'",sql)
        for forbidden in ["INSERT ","DELETE ","stditems","characters_bagitem","Dura=","MakeMine","Gold="]:
            self.assertNotIn(forbidden,sql)
        self.assertIn("Gold=100000",prep.preparation_sql(fixture,dict(map="0",x=1,y=1,direction=6),35))

    def test_foreign_character_ownership_refuses_before_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);self.world(root)
            (root/".runtime/native-server.json").write_text('{"status":"stopped"}',encoding="utf-8")
            backup=self.backup(root);sql=[]
            def fake_run(*args,**kwargs):
                sql.append(kwargs["input"].decode("utf-8"))
                return type("Result",(),{"returncode":0,"stdout":b"1\t1\t1\t0\t1"})()
            with patch.object(prep,"ROOT",root),patch.object(sys,"argv",["prepare","--apply","--backup",str(backup)]),\
                 patch.object(prep.subprocess,"run",side_effect=fake_run),self.assertRaises(SystemExit):
                prep.main()
            self.assertEqual(len(sql),1);self.assertTrue(sql[0].startswith("SELECT "))

    def test_mine_stage_refuses_missing_real_purchased_tool(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);self.world(root)
            (root/".runtime/native-server.json").write_text('{"status":"stopped"}',encoding="utf-8")
            backup=self.backup(root);sql=[]
            def fake_run(*args,**kwargs):
                sql.append(kwargs["input"].decode("utf-8"))
                output=b"1\t0\t1\t0\t1" if len(sql)==1 else b"0"
                return type("Result",(),{"returncode":0,"stdout":output})()
            with patch.object(prep,"ROOT",root),patch.object(sys,"argv",["prepare","--stage","mine","--apply","--backup",str(backup)]),\
                 patch.object(prep.subprocess,"run",side_effect=fake_run),self.assertRaises(SystemExit):
                prep.main()
            self.assertEqual(len(sql),2);self.assertTrue(all(s.startswith("SELECT ") for s in sql))


if __name__=="__main__":
    unittest.main()
