"""Plan or remove only isolated mining_probe fixtures after normal native shutdown.

Create a runtime backup before using --apply. The ignored private manifest owns
the generated m[8 hex]/M[8 hex] namespace; no existing account may be included.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
TABLES = (
    "characters_ablity", "characters_bagitem", "characters_bonusability",
    "characters_item", "characters_item_attr", "characters_magic",
    "characters_quest", "characters_status", "characters_storageitem",
)


def validate_fixtures(manifest):
    fixtures = manifest.get("fixtures")
    if not isinstance(fixtures, list):
        raise ValueError("Private fixture manifest must contain a fixtures array")
    seen = set()
    for fixture in fixtures:
        account, character = fixture.get("account"), fixture.get("character")
        if not isinstance(account, str) or not re.fullmatch(r"m[0-9a-f]{8}", account):
            raise ValueError("Manifest contains an account outside the probe namespace")
        if character != "M" + account[1:] or account in seen:
            raise ValueError("Manifest contains an invalid or repeated probe identity")
        seen.add(account)
    return fixtures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mysql", default="mysql")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--apply", action="store_true", help="Apply cleanup; default only validates and plans")
    args = parser.parse_args()
    manifest_path = ROOT / ".runtime/mining-fixtures.json"
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
            f"SET @mining_player=(SELECT Id FROM mir2_db.characters WHERE LoginID='{account}' AND ChrName='{character}');",
            f"SET @mining_account=(SELECT Id FROM mir2_account.account WHERE Account='{account}');",
        ]
        statements += [f"DELETE FROM mir2_db.{table} WHERE PlayerId=@mining_player;" for table in TABLES]
        statements += [
            "DELETE FROM mir2_account.account_friend WHERE AccountId=@mining_account OR FriendId=@mining_account;",
            "DELETE FROM mir2_account.account_protection WHERE AccountId=@mining_account;",
            f"DELETE FROM mir2_account.tbl_connectlogs WHERE Account='{account}';",
            f"DELETE FROM mir2_account.tbl_conncheckuser WHERE FLD_ID='{account}';",
            f"DELETE FROM mir2_db.characters_indexes WHERE Account='{account}' AND ChrName='{character}';",
            f"DELETE FROM mir2_db.characters WHERE Id=@mining_player AND LoginID='{account}' AND ChrName='{character}';",
            f"DELETE FROM mir2_account.account WHERE Id=@mining_account AND Account='{account}';",
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
    report_path = ROOT / ".runtime/reports/mining-cleanup.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
