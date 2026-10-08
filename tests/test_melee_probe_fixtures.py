"""No database/network: ownership, preparation and cleanup safety regressions."""
import contextlib
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
import melee_probe_fixtures as ownership
import prepare_melee_probe as prepare
import cleanup_melee_probe as cleanup
from prepare_mining_probe import validate_backup


def manifest():
    now=(datetime.now(timezone.utc)-timedelta(minutes=2)).isoformat()
    return dict(schemaVersion=1,probe=ownership.PROBE,fixtures=[dict(account="p11111111",character="P11111111",role="attacker",createdAt=now,registered=True,characterCreated=True,password="fake-test-only"),dict(account="p22222222",character="P22222222",role="observer",createdAt=now,registered=True,characterCreated=True,password="fake-test-only")])


def backup(path, fixtures, corrupt=False):
    body=("test backup "+" ".join(f["account"]+" "+f["character"] for f in fixtures)).encode()
    meta=dict(schemaVersion=1,databases=["mir2_account","mir2_db","mir2_data"],createdAt=datetime.now(timezone.utc).isoformat(),databaseSha256="0"*64 if corrupt else hashlib.sha256(body).hexdigest(),databaseBytes=len(body),fileSha256={})
    with tarfile.open(path,"w:gz") as tar:
        for name,data in [("manifest.json",json.dumps(meta).encode()),("database.sql",body)]:
            info=tarfile.TarInfo(name);info.size=len(data);tar.addfile(info,io.BytesIO(data))


class FixtureRegression(unittest.TestCase):
    def test_valid_owned_namespace(self):
        self.assertEqual(len(ownership.validate_fixtures(manifest(),prepared=True)),2)

    def test_wrong_domain_or_namespace(self):
        for mutate in (lambda m:m.update(probe="other"),lambda m:m["fixtures"][0].update(account="m11111111"),lambda m:m["fixtures"][0].update(character="old-player")):
            m=manifest();mutate(m)
            with self.assertRaises(ValueError):ownership.validate_fixtures(m)

    def test_duplicate_role_or_identity(self):
        for field in ("role","account"):
            m=manifest();m["fixtures"][1][field]=m["fixtures"][0][field]
            with self.assertRaises(ValueError):ownership.validate_fixtures(m)

    def test_preparation_refuses_pending_or_cleaned(self):
        for field in ("registered","characterCreated"):
            m=manifest();m["fixtures"][0][field]=False
            with self.assertRaises(ValueError):ownership.validate_fixtures(m,prepared=True)
        m=manifest();m["cleaned"]=True
        with self.assertRaises(ValueError):ownership.validate_fixtures(m,prepared=True)

    def test_future_or_naive_time(self):
        for value in ((datetime.now(timezone.utc)+timedelta(days=1)).isoformat(),"2026-10-01T10:00:00"):
            m=manifest();m["fixtures"][0]["createdAt"]=value
            with self.assertRaises(ValueError):ownership.validate_fixtures(m)

    def test_actual_original_trainer_and_walkable_positions(self):
        spawns,evidence=prepare.trainer_spawns(ROOT)
        self.assertNotEqual(spawns["attacker"],spawns["observer"])
        self.assertEqual((evidence["trainerX"],evidence["trainerY"]),(284,609))
        self.assertEqual(len(evidence["mapSha256"]),64)
        world=prepare.ClassicMap((ROOT/".runtime/server/Mir200/Map/0.map").read_bytes())
        self.assertTrue(all(not world.blocked(p["x"],p["y"]) for p in spawns.values()))

    def test_learn_sql_cannot_grant_items_or_skills(self):
        sql=prepare.preparation_sql(manifest()["fixtures"],"learn",dict(attacker=dict(x=283,y=608,direction=0),observer=dict(x=284,y=608,direction=0)))
        self.assertIn("LoginID='p11111111' AND ChrName='P11111111'",sql)
        self.assertIn("LoginID='p22222222' AND ChrName='P22222222'",sql)
        self.assertNotIn("INSERT",sql);self.assertNotIn("characters_magic",sql);self.assertNotIn("characters_item",sql);self.assertNotIn("Mp=",sql);self.assertNotIn("Level=",sql)

    def test_low_mp_sql_only_touches_attacker_saved_mp(self):
        sql=prepare.preparation_sql(manifest()["fixtures"],"low-mp",{})
        self.assertIn("Mp=0 WHERE PlayerId=@melee_player",sql)
        self.assertNotIn("p22222222",sql);self.assertNotIn("MaxMP",sql);self.assertNotIn("Hp=",sql);self.assertNotIn("characters_magic",sql)

    def test_backup_for_both_namespaces_and_tamper(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"backup.tar.gz";m=manifest();backup(path,m["fixtures"])
            for f in m["fixtures"]:validate_backup(path,f,datetime.fromisoformat(f["createdAt"]))
            backup(path,m["fixtures"],corrupt=True)
            with self.assertRaises(ValueError):validate_backup(path,m["fixtures"][0],datetime.fromisoformat(m["fixtures"][0]["createdAt"]))

    def test_default_prepare_plan_never_calls_database_or_reads_server_state(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/".runtime").mkdir();(root/".runtime/melee-fixtures.json").write_text(json.dumps(manifest()))
            with patch.object(prepare,"ROOT",root),patch.object(prepare,"trainer_spawns",return_value=({},{})),patch.object(prepare.subprocess,"run",side_effect=AssertionError("DB attempted")),patch.object(sys,"argv",["prepare"]),contextlib.redirect_stdout(io.StringIO()) as out:
                prepare.main()
            self.assertEqual(json.loads(out.getvalue())["mode"],"plan")

    def test_cleanup_rejects_running_engine_before_db(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/".runtime").mkdir();(root/".runtime/melee-fixtures.json").write_text(json.dumps(manifest()));(root/".runtime/native-server.json").write_text('{"status":"ready"}')
            with patch.object(cleanup,"ROOT",root),patch.object(cleanup.subprocess,"run",side_effect=AssertionError("DB attempted")),patch.object(sys,"argv",["cleanup","--apply"]):
                with self.assertRaises(SystemExit):cleanup.main()

    def test_cleanup_guard_and_verified_exact_namespace(self):
        for others in (1,0):
            with tempfile.TemporaryDirectory() as d:
                root=Path(d);(root/".runtime").mkdir();m=manifest();(root/".runtime/melee-fixtures.json").write_text(json.dumps(m));(root/".runtime/native-server.json").write_text('{"status":"stopped"}');archive=root/"backup.tar.gz";backup(archive,m["fixtures"]);queries=[]
                def execute(args,**kwargs):
                    sql=kwargs["input"].decode();queries.append(sql)
                    return SimpleNamespace(returncode=0,stdout=str(others if "ChrName<>" in sql else 0).encode(),stderr=b"")
                with patch.object(cleanup,"ROOT",root),patch.object(cleanup.subprocess,"run",side_effect=execute),patch.object(sys,"argv",["cleanup","--apply","--backup",str(archive)]),contextlib.redirect_stdout(io.StringIO()):
                    if others:
                        with self.assertRaises(SystemExit):cleanup.main()
                    else:cleanup.main()
                if others:self.assertFalse(any("DELETE" in q for q in queries))
                else:
                    result=json.loads((root/".runtime/reports/melee-cleanup.json").read_text());self.assertTrue(result["verified"]);self.assertEqual(result["remainingAccountsCharactersIndexes"],0)
                    self.assertTrue(all("password" not in f for f in json.loads((root/".runtime/melee-fixtures.json").read_text())["fixtures"]))
                    deletes=next(q for q in queries if "DELETE" in q);self.assertIn("ChrName='P11111111'",deletes);self.assertNotIn("MakeMine",deletes)


if __name__=="__main__":unittest.main(verbosity=2)
