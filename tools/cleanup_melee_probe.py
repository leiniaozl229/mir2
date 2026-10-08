"""Plan or remove only isolated melee_probe fixtures after normal native shutdown.

Create a runtime backup before using --apply. The ignored private manifest owns
the generated p[8 hex]/P[8 hex] namespace; no existing account may be included.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from melee_probe_fixtures import validate_fixtures
from prepare_mining_probe import validate_backup
import subprocess

ROOT = Path(__file__).resolve().parents[1]
TABLES = (
    "characters_ablity", "characters_bagitem", "characters_bonusability",
    "characters_item", "characters_item_attr", "characters_magic",
    "characters_quest", "characters_status", "characters_storageitem",
)



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mysql", default="mysql")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--apply", action="store_true", help="Apply cleanup; default only validates and plans")
    args = parser.parse_args()
    manifest_path = ROOT / ".runtime/melee-fixtures.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    fixtures = validate_fixtures(manifest)
    if manifest.get("cleaned"):
        print(json.dumps({"alreadyCleaned": True, "fixtures": len(fixtures)}))
        return
    if not args.apply:
        print(json.dumps({
            "mode": "plan", "fixtures": len(fixtures), "applied": False,
            "requiredState": "normal native engine shutdown; create a backup before --apply",
        }))
        return

    state = json.loads((ROOT / ".runtime/native-server.json").read_text(encoding="utf-8"))
    if state.get("status") != "stopped":
        raise SystemExit("Stop the native engine normally before removing probe fixtures")

    def execute(sql):
        result = subprocess.run(
            [args.mysql, f"--defaults-extra-file={ROOT / '.runtime/mysql-client.ini'}",
             f"--port={args.port}", "--batch", "--skip-column-names"],
            input=sql.encode("utf-8"), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        if result.returncode:
            # Driver output may contain credentials or generated SQL.
            raise SystemExit("Probe cleanup database command failed; private manifest preserved")
        return result.stdout.decode("utf-8").strip()

    if args.backup is None:
        raise SystemExit("Apply requires a verified backup created after protocol registration")
    for fixture in fixtures:
        if fixture.get("registered"):
            validate_backup(args.backup.resolve(), fixture if fixture.get("characterCreated") else dict(fixture, character=fixture["account"]), datetime.fromisoformat(fixture["createdAt"].replace("Z", "+00:00")))
    # Never remove a collided or rejected registration: its namespace was not
    # acquired through this probe's actual accepted protocol operation.
    fixtures = [fixture for fixture in fixtures if fixture.get("registered")]

    # Preflight ALL identities before starting a transaction or deleting rows.
    for fixture in fixtures:
        account, character = fixture["account"], fixture["character"]
        others = int(execute(
            f"SELECT (SELECT COUNT(*) FROM mir2_db.characters WHERE LoginID='{account}' AND ChrName<>'{character}') + "
            f"(SELECT COUNT(*) FROM mir2_db.characters_indexes WHERE Account='{account}' AND ChrName<>'{character}');"
        ))
        if others:
            raise SystemExit("Generated account owns another character; cleanup refused")

    statements = ["START TRANSACTION;"]
    for fixture in fixtures:
        account, character = fixture["account"], fixture["character"]
        statements += [
            f"SET @melee_player=(SELECT Id FROM mir2_db.characters WHERE LoginID='{account}' AND ChrName='{character}');",
            f"SET @melee_account=(SELECT Id FROM mir2_account.account WHERE Account='{account}');",
        ]
        statements += [f"DELETE FROM mir2_db.{table} WHERE PlayerId=@melee_player;" for table in TABLES]
        statements += [
            "DELETE FROM mir2_account.account_friend WHERE AccountId=@melee_account OR FriendId=@melee_account;",
            "DELETE FROM mir2_account.account_protection WHERE AccountId=@melee_account;",
            f"DELETE FROM mir2_account.tbl_connectlogs WHERE Account='{account}';",
            f"DELETE FROM mir2_account.tbl_conncheckuser WHERE FLD_ID='{account}';",
            f"DELETE FROM mir2_db.characters_indexes WHERE Account='{account}' AND ChrName='{character}';",
            f"DELETE FROM mir2_db.characters WHERE Id=@melee_player AND LoginID='{account}' AND ChrName='{character}';",
            f"DELETE FROM mir2_account.account WHERE Id=@melee_account AND Account='{account}';",
        ]
    statements.append("COMMIT;")
    execute("\n".join(statements))

    remaining = 0
    for fixture in fixtures:
        account = fixture["account"]
        remaining += int(execute(
            f"SELECT (SELECT COUNT(*) FROM mir2_account.account WHERE Account='{account}') + "
            f"(SELECT COUNT(*) FROM mir2_db.characters WHERE LoginID='{account}') + "
            f"(SELECT COUNT(*) FROM mir2_db.characters_indexes WHERE Account='{account}');"
        ))
    if remaining:
        raise SystemExit("Fixture cleanup could not be verified; private manifest preserved")
    manifest["cleaned"] = True
    manifest["cleanedAt"] = datetime.now(timezone.utc).isoformat()
    for fixture in fixtures:
        fixture.pop("password", None)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    result = {
        "removedFixtures": len(fixtures), "remainingAccountsCharactersIndexes": remaining,
        "verified": True, "finishedAt": manifest["cleanedAt"],
    }
    report_path = ROOT / ".runtime/reports/melee-cleanup.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
