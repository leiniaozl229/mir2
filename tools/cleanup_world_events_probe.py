"""Remove only the generated world-events probe fixtures after normal engine shutdown."""
import argparse
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--mysql', default='mysql')
parser.add_argument('--port', type=int, default=3306)
args = parser.parse_args()
state = json.loads((root / '.runtime/native-server.json').read_text(encoding='utf-8'))
if state.get('status') != 'stopped':
    raise SystemExit('Stop the native engine normally before removing probe fixtures')
manifest_path = root / '.runtime/world-events-fixtures.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
if manifest.get('cleaned'):
    raise SystemExit('Probe fixtures are already cleaned')

def execute(sql):
    result = subprocess.run([args.mysql, f'--defaults-extra-file={root / ".runtime/mysql-client.ini"}',
                             f'--port={args.port}', '--batch', '--skip-column-names'],
                            input=sql.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise SystemExit('Probe cleanup database command failed; fixtures manifest preserved')
    return result.stdout.decode('utf-8').strip()

for fixture in manifest['fixtures']:
    account, character = fixture['account'], fixture['character']
    if not re.fullmatch(r'e[0-9a-f]{8}', account) or character != 'E' + account[1:]:
        raise SystemExit('Manifest contains an identity outside the generated probe namespace')
    count = int(execute(f"SELECT COUNT(*) FROM mir2_db.characters WHERE LoginID='{account}' AND ChrName<>'{character}';"))
    indexes = int(execute(f"SELECT COUNT(*) FROM mir2_db.characters_indexes WHERE Account='{account}' AND ChrName<>'{character}';"))
    if count or indexes:
        raise SystemExit('Generated account owns another character; cleanup refused')

tables = ['characters_ablity', 'characters_bagitem', 'characters_bonusability', 'characters_item',
          'characters_item_attr', 'characters_magic', 'characters_quest', 'characters_status', 'characters_storageitem']
statements = ['START TRANSACTION;']
for fixture in manifest['fixtures']:
    account, character = fixture['account'], fixture['character']
    statements += [f"SET @probe_player=(SELECT Id FROM mir2_db.characters WHERE LoginID='{account}' AND ChrName='{character}');",
                   f"SET @probe_account=(SELECT Id FROM mir2_account.account WHERE Account='{account}');"]
    statements += [f'DELETE FROM mir2_db.{table} WHERE PlayerId=@probe_player;' for table in tables]
    statements += ["DELETE FROM mir2_account.account_friend WHERE AccountId=@probe_account OR FriendId=@probe_account;",
                   "DELETE FROM mir2_account.account_protection WHERE AccountId=@probe_account;",
                   f"DELETE FROM mir2_account.tbl_connectlogs WHERE Account='{account}';",
                   f"DELETE FROM mir2_account.tbl_conncheckuser WHERE FLD_ID='{account}';",
                   f"DELETE FROM mir2_db.characters_indexes WHERE Account='{account}' AND ChrName='{character}';",
                   f"DELETE FROM mir2_db.characters WHERE Id=@probe_player AND LoginID='{account}' AND ChrName='{character}';",
                   f"DELETE FROM mir2_account.account WHERE Id=@probe_account AND Account='{account}';"]
statements += ['COMMIT;']
execute('\n'.join(statements))
remaining = 0
for fixture in manifest['fixtures']:
    account, character = fixture['account'], fixture['character']
    remaining += int(execute(f"SELECT (SELECT COUNT(*) FROM mir2_account.account WHERE Account='{account}') + "
                            f"(SELECT COUNT(*) FROM mir2_db.characters WHERE LoginID='{account}') + "
                            f"(SELECT COUNT(*) FROM mir2_db.characters_indexes WHERE Account='{account}');"))
if remaining:
    raise SystemExit('Fixture cleanup could not be verified; manifest preserved')
manifest['cleaned'] = True
for fixture in manifest['fixtures']:
    fixture.pop('password', None)
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
result = {'removedFixtures': len(manifest['fixtures']), 'remainingAccountsCharactersIndexes': remaining, 'verified': True}
(root / '.runtime/reports/world-events-cleanup.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
