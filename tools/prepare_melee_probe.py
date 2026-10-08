"""Plan or prepare only private melee fixtures after normal stop and verified backup.

Default plan performs no DB access. Learn stage changes only fixture position;
original NPC warriorset teaches skills and gives its original sword online.
Low-MP stage changes only the attacker's saved Mp to zero, preserving all rules.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
from map_tool import ClassicMap
from prepare_mining_probe import validate_backup
from melee_probe_fixtures import validate_fixtures

ROOT = Path(__file__).resolve().parents[1]
DIRECTIONS = ((0,-1),(1,-1),(1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-1))


def trainer_spawns(root):
    merchant = (root / ".runtime/server/Mir200/Envir/MerChant.txt").read_text(encoding="utf-8-sig")
    found = [line.split() for line in merchant.splitlines() if line.split()[:2] == ["测试/技能导师", "0"]]
    if not found:
        raise ValueError("No existing map 0 skill trainer")
    row = min(found, key=lambda f: (int(f[2])-284)**2+(int(f[3])-609)**2)
    x, y = int(row[2]), int(row[3])
    raw = (root / ".runtime/server/Mir200/Map/0.map").read_bytes()
    world = ClassicMap(raw)
    candidates = [(x+dx,y+dy) for dx,dy in DIRECTIONS if 0<=x+dx<world.width and 0<=y+dy<world.height and not world.blocked(x+dx,y+dy)]
    if len(candidates)<2:
        raise ValueError("Existing trainer has fewer than two walkable neighboring cells")
    script = root / ".runtime/server/Mir200/Envir/Market_Def/测试/技能导师-0.txt"
    source = script.read_bytes()
    text = source.decode("gbk")
    if "[@warriorset]" not in text or any("ADDSKILL " + name + " 3" not in text for name in ("攻杀剑术","刺杀剑术","半月弯刀","烈火剑法")) or "GIVE 木剑 1" not in text:
        raise ValueError("Existing trainer does not expose original classic warrior set")
    return {role:dict(map="0",x=candidates[i][0],y=candidates[i][1],direction=0) for i,role in enumerate(("attacker","observer"))}, dict(mapSha256=hashlib.sha256(raw).hexdigest(),trainerScriptSha256=hashlib.sha256(source).hexdigest(),trainerX=x,trainerY=y)


def preparation_sql(fixtures, stage, spawns):
    statements=["START TRANSACTION;"]
    for fixture in fixtures:
        if stage == "low-mp" and fixture["role"] != "attacker":
            continue
        account, character=fixture["account"],fixture["character"]
        statements += [f"SET @melee_player=(SELECT Id FROM mir2_db.characters WHERE LoginID='{account}' AND ChrName='{character}');"]
        if stage == "learn":
            p=spawns[fixture["role"]]
            statements += [f"UPDATE mir2_db.characters SET MapName='0',CX={p['x']},CY={p['y']},Dir={p['direction']} WHERE Id=@melee_player AND LoginID='{account}' AND ChrName='{character}';"]
        else:
            statements += ["UPDATE mir2_db.characters_ablity SET Mp=0 WHERE PlayerId=@melee_player;"]
    return "\n".join(statements+["COMMIT;"])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage",choices=("learn","low-mp"),default="learn")
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--backup",type=Path)
    parser.add_argument("--mysql",default="mysql")
    parser.add_argument("--port",type=int,default=3306)
    args=parser.parse_args()
    manifest_path=ROOT/".runtime/melee-fixtures.json"
    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    fixtures=validate_fixtures(manifest,prepared=True)
    spawns,evidence=trainer_spawns(ROOT)
    plan=dict(mode="apply" if args.apply else "plan",stage=args.stage,fixtures=2,changes="positions only; original NPC learning/equip online" if args.stage=="learn" else "attacker saved Mp=0 only",spawns=spawns if args.stage=="learn" else {},source=evidence)
    if not args.apply:
        print(json.dumps(plan));return
    state=json.loads((ROOT/".runtime/native-server.json").read_text(encoding="utf-8"))
    if state.get("status")!="stopped":
        raise SystemExit("Normally stop native engine before isolated fixture preparation")
    if args.backup is None:
        raise SystemExit("Apply requires a verified backup created after both protocol fixtures")
    for fixture in fixtures:
        validate_backup(args.backup.resolve(),fixture,datetime.fromisoformat(fixture["createdAt"].replace("Z","+00:00")))
    def execute(sql):
        result=subprocess.run([args.mysql,f"--defaults-extra-file={ROOT/'.runtime/mysql-client.ini'}",f"--port={args.port}","--default-character-set=utf8mb4","--batch","--skip-column-names"],input=sql.encode("utf-8"),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode:
            raise SystemExit("Melee preparation DB operation failed; private evidence preserved")
        return result.stdout.decode("utf-8").strip()
    for f in fixtures:
        a,c=f["account"],f["character"]
        counts=execute(f"SELECT (SELECT COUNT(*) FROM mir2_db.characters WHERE LoginID='{a}' AND ChrName='{c}'),(SELECT COUNT(*) FROM mir2_db.characters WHERE LoginID='{a}' AND ChrName<>'{c}'),(SELECT COUNT(*) FROM mir2_db.characters_indexes WHERE Account='{a}' AND ChrName='{c}'),(SELECT COUNT(*) FROM mir2_db.characters_indexes WHERE Account='{a}' AND ChrName<>'{c}'),(SELECT COUNT(*) FROM mir2_db.characters_ablity b JOIN mir2_db.characters p ON b.PlayerId=p.Id WHERE p.LoginID='{a}' AND p.ChrName='{c}');")
        if counts.split("\t") != ["1","0","1","0","1"]:
            raise SystemExit("Fixture must own exactly one character, index and ability")
        if args.stage=="low-mp" and f["role"]=="attacker":
            skills=execute(f"SELECT COUNT(DISTINCT b.MagicId) FROM mir2_db.characters_magic b JOIN mir2_db.characters p ON b.PlayerId=p.Id WHERE p.LoginID='{a}' AND p.ChrName='{c}' AND b.MagicId IN (7,12,25,26);")
            if skills!="4":
                raise SystemExit("Learn the four original skills online before low-MP stage")
    execute(preparation_sql(fixtures,args.stage,spawns))
    for f in fixtures:
        a,c=f["account"],f["character"]
        if args.stage=="learn":
            p=spawns[f["role"]]
            actual=execute(f"SELECT MapName,CX,CY,Dir FROM mir2_db.characters WHERE LoginID='{a}' AND ChrName='{c}';").split("\t")
            expected=["0",str(p["x"]),str(p["y"]),str(p["direction"])]
        elif f["role"]=="attacker":
            actual=[execute(f"SELECT b.Mp FROM mir2_db.characters_ablity b JOIN mir2_db.characters p ON b.PlayerId=p.Id WHERE p.LoginID='{a}' AND p.ChrName='{c}';")];expected=["0"]
        else:continue
        if actual!=expected:
            raise SystemExit("Isolated preparation could not be verified; backup preserved")
        f["preparedStage"]=args.stage;f["preparedAt"]=datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    plan.update(verified=True,backupSha256=hashlib.sha256(args.backup.read_bytes()).hexdigest(),finishedAt=datetime.now(timezone.utc).isoformat())
    report=ROOT/f".runtime/reports/melee-prepare-{args.stage}.json";report.parent.mkdir(parents=True,exist_ok=True);report.write_text(json.dumps(plan,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(plan))


if __name__=="__main__":main()
