"""Plan/prepare exactly one newly created mining fixture; never change mining rules.

Default is plan, with no database access. Apply requires a normally stopped native
engine and a checksummed backup containing this newly created fixture.
Stage purchase supplies gold/level near the existing merchant; buy/equip happens
through the real gateway. Stage mine moves only the saved fixture to D401.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile

from map_tool import ClassicMap

ROOT = Path(__file__).resolve().parents[1]
OFFSETS = ((0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1))


def validate_fixture(manifest):
    fixtures = manifest.get("fixtures")
    if manifest.get("cleaned") or not isinstance(fixtures, list) or len(fixtures) != 1:
        raise ValueError("Preparation requires exactly one uncleaned mining fixture")
    fixture = fixtures[0]
    account = fixture.get("account")
    if not isinstance(account, str) or not re.fullmatch(r"m[0-9a-f]{8}", account):
        raise ValueError("Fixture account is outside the mining namespace")
    if fixture.get("character") != "M" + account[1:]:
        raise ValueError("Fixture character is outside the mining namespace")
    created = datetime.fromisoformat(fixture["createdAt"].replace("Z", "+00:00"))
    if created.tzinfo is None:
        raise ValueError("Fixture creation time must have a timezone")
    return fixture, created


def validate_backup(archive, fixture, created):
    """Verify without extracting database credentials or printing dump contents."""
    with tarfile.open(archive, "r:gz") as bundle:
        members = {}
        for member in bundle.getmembers():
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or member.issym() or member.islnk() or member.isdev():
                raise ValueError("Unsafe backup member")
            if member.name in members:
                raise ValueError("Duplicate backup member")
            members[member.name] = member
        if "manifest.json" not in members or "database.sql" not in members:
            raise ValueError("Backup is missing its manifest or database")
        manifest = json.load(bundle.extractfile(members["manifest.json"]))
        if manifest.get("schemaVersion") != 1 or set(manifest.get("databases", [])) != {"mir2_account", "mir2_db", "mir2_data"}:
            raise ValueError("Unsupported or incomplete backup manifest")
        backup_created = datetime.fromisoformat(manifest["createdAt"].replace("Z", "+00:00"))
        if backup_created.tzinfo is None or backup_created < created or backup_created > datetime.now(timezone.utc):
            raise ValueError("Backup must be created after the isolated fixture and before preparation")
        digest = hashlib.sha256()
        size = 0
        owned = {key: False for key in ("account", "character")}
        tail = b""
        stream = bundle.extractfile(members["database.sql"])
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
            data = tail + chunk
            for key in owned:
                owned[key] |= fixture[key].encode("ascii") in data
            tail = data[-64:]
        if digest.hexdigest() != manifest.get("databaseSha256") or size != manifest.get("databaseBytes") or not size:
            raise ValueError("Backup database checksum or size mismatch")
        if not all(owned.values()):
            raise ValueError("Backup does not contain the newly created isolated fixture")
        for name, expected in manifest.get("fileSha256", {}).items():
            if name not in members or not members[name].isfile():
                raise ValueError("Backup state file is missing")
            checksum = hashlib.sha256(bundle.extractfile(members[name]).read()).hexdigest()
            if checksum != expected:
                raise ValueError("Backup state checksum mismatch")
    return manifest


def spawn_for_stage(root, stage):
    map_id = "0" if stage == "purchase" else "D401"
    if stage == "mine":
        text = (root / ".runtime/server/Mir200/Envir/MapInfo.txt").read_text(encoding="utf-8-sig")
        if not any(line.startswith("[D401 ") and re.search(r"\bMINE\b", line) for line in text.splitlines()):
            raise ValueError("D401 is not an existing native MINE map")
    raw = (root / f".runtime/server/Mir200/Map/{map_id}.map").read_bytes()
    world = ClassicMap(raw)
    in_bounds = lambda x, y: 0 <= x < world.width and 0 <= y < world.height
    walk = lambda x, y: in_bounds(x, y) and not world.blocked(x, y)
    if stage == "purchase":
        merchant = (root / ".runtime/server/Mir200/Envir/MerChant.txt").read_text(encoding="utf-8-sig")
        positions = []
        for line in merchant.splitlines():
            fields = line.split()
            if len(fields) >= 5 and fields[1] == "0" and fields[4] == "\u7efc\u5408\u5546\u4eba":
                positions.append((int(fields[2]), int(fields[3])))
        if not positions:
            raise ValueError("Existing map 0 general merchant was not found")
        mx, my = min(positions, key=lambda xy: (xy[0] - 329) ** 2 + (xy[1] - 270) ** 2)
        for direction, (dx, dy) in enumerate(OFFSETS):
            if walk(mx + dx, my + dy):
                return dict(map=map_id, x=mx + dx, y=my + dy, direction=(direction + 4) % 8,
                            sourceSha256=hashlib.sha256(raw).hexdigest())
        raise ValueError("Existing merchant has no adjacent walkable cell")
    cells = sorted(((x, y) for x in range(world.width) for y in range(world.height)),
                   key=lambda xy: (xy[0] - 25) ** 2 + (xy[1] - 25) ** 2)
    for x, y in cells:
        if not walk(x, y):
            continue
        for direction, (dx, dy) in enumerate(OFFSETS):
            if in_bounds(x + dx, y + dy) and not walk(x + dx, y + dy):
                return dict(map=map_id, x=x, y=y, direction=(direction + 4) % 8,
                            miningDirection=direction, sourceSha256=hashlib.sha256(raw).hexdigest())
    raise ValueError("Existing MINE map has no accessible internal wall")


def preparation_sql(fixture, spawn, level):
    account, character = fixture["account"], fixture["character"]
    # All identifiers are validated fixed namespaces and all numeric fields were
    # obtained from validated server map bytes. No client item/reward is inserted.
    gold = ",Gold=100000" if spawn["map"] == "0" else ""
    return "\n".join((
        "START TRANSACTION;",
        f"SET @mining_player=(SELECT Id FROM mir2_db.characters WHERE LoginID='{account}' AND ChrName='{character}');",
        f"UPDATE mir2_db.characters SET Level={level},MapName='{spawn['map']}',CX={spawn['x']},CY={spawn['y']},Dir={spawn['direction']}{gold} WHERE Id=@mining_player AND LoginID='{account}' AND ChrName='{character}';",
        f"UPDATE mir2_db.characters_ablity SET Level={level} WHERE PlayerId=@mining_player;",
        "COMMIT;",
    ))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", choices=("purchase", "mine"), default="purchase")
    parser.add_argument("--mysql", default="mysql")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    manifest_path = ROOT / ".runtime/mining-fixtures.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    fixture, created = validate_fixture(manifest)
    spawn = spawn_for_stage(ROOT, args.stage)
    plan = dict(mode="apply" if args.apply else "plan", stage=args.stage, fixtures=1, spawn=spawn,
                level=35, gold=100000 if args.stage == "purchase" else "unchanged",
                minimumPickaxeRawDurability=5000, maximumSampleSwings=240,
                changes="isolated character level/gold/position only; buy/equip remains real protocol")
    if not args.apply:
        print(json.dumps(plan))
        return
    state = json.loads((ROOT / ".runtime/native-server.json").read_text(encoding="utf-8"))
    if state.get("status") != "stopped":
        raise SystemExit("Stop the native engine normally before fixture preparation")
    if args.backup is None:
        raise SystemExit("--apply requires --backup with a valid archive created after this isolated fixture")
    backup = validate_backup(args.backup.resolve(), fixture, created)

    def execute(sql):
        result = subprocess.run(
            [args.mysql, f"--defaults-extra-file={ROOT / '.runtime/mysql-client.ini'}",
             f"--port={args.port}", "--default-character-set=utf8mb4", "--batch", "--skip-column-names"],
            input=sql.encode("utf-8"), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        if result.returncode:
            raise SystemExit("Mining preparation database operation failed; private manifest preserved")
        return result.stdout.decode("utf-8").strip()

    account, character = fixture["account"], fixture["character"]
    ownership = execute(
        f"SELECT (SELECT COUNT(*) FROM mir2_db.characters WHERE LoginID='{account}' AND ChrName='{character}'),"
        f"(SELECT COUNT(*) FROM mir2_db.characters WHERE LoginID='{account}' AND ChrName<>'{character}'),"
        f"(SELECT COUNT(*) FROM mir2_db.characters_indexes WHERE Account='{account}' AND ChrName='{character}'),"
        f"(SELECT COUNT(*) FROM mir2_db.characters_indexes WHERE Account='{account}' AND ChrName<>'{character}'),"
        f"(SELECT COUNT(*) FROM mir2_db.characters_ablity a JOIN mir2_db.characters c ON a.PlayerId=c.Id WHERE c.LoginID='{account}' AND c.ChrName='{character}');"
    )
    if ownership.split("\t") != ["1", "0", "1", "0", "1"]:
        raise SystemExit("Fixture must own exactly one native character/index/ability; preparation refused")
    if args.stage == "mine":
        tools = execute(
            "SELECT COUNT(*) FROM ("
            f"SELECT b.StdIndex,b.Dura FROM mir2_db.characters_bagitem b JOIN mir2_db.characters c ON b.PlayerId=c.Id WHERE c.LoginID='{account}' AND c.ChrName='{character}' "
            "UNION ALL "
            f"SELECT b.StdIndex,b.Dura FROM mir2_db.characters_item b JOIN mir2_db.characters c ON b.PlayerId=c.Id WHERE c.LoginID='{account}' AND c.ChrName='{character}') owned "
            "JOIN mir2_data.stditems s ON owned.StdIndex=s.Id WHERE s.Shape=19 AND s.StdMode IN (5,6) AND owned.Dura>=5000;"
        )
        if not tools.isdigit() or int(tools) < 1:
            raise SystemExit("Buy a real native pickaxe with >=5000 raw durability before mine-stage preparation")
    execute(preparation_sql(fixture, spawn, 35))
    verified = execute(
        f"SELECT c.Level,c.MapName,c.CX,c.CY,c.Dir,a.Level FROM mir2_db.characters c JOIN mir2_db.characters_ablity a ON a.PlayerId=c.Id WHERE c.LoginID='{account}' AND c.ChrName='{character}';"
    ).split("\t")
    if verified != ["35", spawn["map"], str(spawn["x"]), str(spawn["y"]), str(spawn["direction"]), "35"]:
        raise SystemExit("Isolated preparation could not be verified; backup and manifest preserved")
    fixture["preparedStage"] = args.stage
    fixture["preparedAt"] = datetime.now(timezone.utc).isoformat()
    fixture["preparationBackupSha256"] = hashlib.sha256(args.backup.read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    plan.update(verified=True, backupCreatedAt=backup["createdAt"], completedAt=fixture["preparedAt"])
    report_path = ROOT / f".runtime/reports/mining-prepare-{args.stage}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(plan))


if __name__ == "__main__":
    main()
