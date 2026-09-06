#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
elif docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
else
  echo 'docker compose is required' >&2
  exit 1
fi

db_password="$(sed -n 's/^MYSQL_ROOT_PASSWORD=//p' .runtime/db.env)"
mysql_query() {
  local sql="$1"
  "${compose[@]}" exec -T db bash -lc "MYSQL_PWD='$db_password' mysql -uroot -N -B mir2_db -e \"$sql\""
}

red_account="$(jq -r '.account' .runtime/web-ui-test.json)"
blue_account="$(jq -r '.account' .runtime/probe-account.json)"
red_donor="$(mysql_query "SELECT Id FROM characters WHERE ChrName='WebCheck';" | tr -d '\r')"
blue_donor="$(mysql_query "SELECT Id FROM characters WHERE ChrName='Mirf98b3e81';" | tr -d '\r')"
if [[ ! "$red_donor" =~ ^[0-9]+$ || ! "$blue_donor" =~ ^[0-9]+$ ]]; then
  echo 'known donor characters are unavailable' >&2
  exit 1
fi
stamp="$(date +%s)"
short_stamp="$(printf '%s' "$stamp" | tail -c 8)"
red_character="Wr$short_stamp"
blue_character="Wb$short_stamp"
red_guild="ProbeR$short_stamp"
blue_guild="ProbeB$short_stamp"
red_id=0
blue_id=0
castle_attack_file='.runtime/server/Mir200/Castle/0/AttackSabukWall.txt'
castle_attack_backup=''
castle_attack_existed=0
mkdir -p .runtime/reports
if [[ -f "$castle_attack_file" ]]; then
  castle_attack_backup="$(mktemp .runtime/reports/guild-war-castle.XXXXXX)"
  cp -- "$castle_attack_file" "$castle_attack_backup"
  castle_attack_existed=1
fi

cleanup() {
  exit_status=$?
  set +e
  if [[ "$exit_status" != 0 ]]; then
    mkdir -p .runtime/reports
    cp -- .runtime/logs/GameSrv.log ".runtime/reports/guild-war-failure-${stamp}-GameSrv.log" 2>/dev/null
    cp -- .runtime/logs/GameGate.log ".runtime/reports/guild-war-failure-${stamp}-GameGate.log" 2>/dev/null
    "${compose[@]}" logs --no-color --timestamps --tail=500 web-gateway > ".runtime/reports/guild-war-failure-${stamp}-WebGateway.log" 2>/dev/null
  fi
  "${compose[@]}" stop -t 30 web-gateway engine >/dev/null 2>&1
  for attempt in {1..30}; do
    "${compose[@]}" ps --status running --services 2>/dev/null | grep -Fxq engine || break
    sleep 1
  done
  if [[ "$castle_attack_existed" == 1 && -n "$castle_attack_backup" ]]; then
    cp -- "$castle_attack_backup" "$castle_attack_file"
  elif [[ "$castle_attack_existed" == 0 ]]; then
    rm -f -- "$castle_attack_file"
  fi
  if [[ -n "$castle_attack_backup" ]]; then
    rm -f -- "$castle_attack_backup"
  fi
  if [[ "$red_id" =~ ^[0-9]+$ && "$blue_id" =~ ^[0-9]+$ && "$red_id" != 0 && "$blue_id" != 0 ]]; then
    cleanup_sql="DELETE FROM characters_item_attr WHERE PlayerId IN ($red_id,$blue_id); DELETE FROM characters_bagitem WHERE PlayerId IN ($red_id,$blue_id); DELETE FROM characters_item WHERE PlayerId IN ($red_id,$blue_id); DELETE FROM characters_storageitem WHERE PlayerId IN ($red_id,$blue_id); DELETE FROM characters_magic WHERE PlayerId IN ($red_id,$blue_id); DELETE FROM characters_quest WHERE PlayerId IN ($red_id,$blue_id); DELETE FROM characters_status WHERE PlayerId IN ($red_id,$blue_id); DELETE FROM characters_ablity WHERE PlayerId IN ($red_id,$blue_id); DELETE FROM characters_bonusability WHERE PlayerId IN ($red_id,$blue_id); DELETE FROM characters_indexes WHERE ChrName IN ('$red_character','$blue_character'); DELETE FROM characters WHERE Id IN ($red_id,$blue_id);"
    mysql_query "$cleanup_sql" >/dev/null 2>&1
  fi
  guild_list='.runtime/server/Mir200/GuildBase/GuildList.txt'
  if [[ -f "$guild_list" ]]; then
    sed -i.bak "/^$red_guild$/d; /^$blue_guild$/d" "$guild_list"
    rm -f -- "$guild_list.bak"
  fi
  rm -f -- ".runtime/server/Mir200/GuildBase/Guilds/$red_guild.txt" ".runtime/server/Mir200/GuildBase/Guilds/$blue_guild.txt" ".runtime/server/Mir200/GuildBase/Guilds/$red_guild.ini" ".runtime/server/Mir200/GuildBase/Guilds/$blue_guild.ini"
  "${compose[@]}" up -d engine web-gateway >/dev/null 2>&1
  python3 scripts/wait-ready.py >/dev/null 2>&1
}
trap cleanup EXIT

insert_sql="INSERT INTO characters (ServerIndex,LoginID,ChrName,MapName,CX,CY,Level,Dir,Hair,Sex,Job,Gold,GamePoint,HomeMap,HomeX,HomeY,PkPoint,ReLevel,AttatckMode,FightZoneDieCount,BodyLuck,IncHealth,IncSpell,IncHealing,CreditPoint,BonusPoint,HungerStatus,PayMentPoint,LockLogon,MarryCount,AllowGroup,AllowGroupReCall,GroupRcallTime,AllowGuildReCall,IsMaster,MasterName,DearName,StoragePwd,Deleted,CREATEDATE,LASTUPDATE) SELECT ServerIndex,'$red_account','$red_character','0122',28,32,Level,2,Hair,Sex,Job,1100000,GamePoint,'0122',28,32,PkPoint,ReLevel,AttatckMode,FightZoneDieCount,BodyLuck,IncHealth,IncSpell,IncHealing,CreditPoint,BonusPoint,HungerStatus,PayMentPoint,LockLogon,MarryCount,AllowGroup,AllowGroupReCall,GroupRcallTime,AllowGuildReCall,IsMaster,MasterName,DearName,StoragePwd,0,NOW(),NOW() FROM characters WHERE Id=$red_donor; INSERT INTO characters (ServerIndex,LoginID,ChrName,MapName,CX,CY,Level,Dir,Hair,Sex,Job,Gold,GamePoint,HomeMap,HomeX,HomeY,PkPoint,ReLevel,AttatckMode,FightZoneDieCount,BodyLuck,IncHealth,IncSpell,IncHealing,CreditPoint,BonusPoint,HungerStatus,PayMentPoint,LockLogon,MarryCount,AllowGroup,AllowGroupReCall,GroupRcallTime,AllowGuildReCall,IsMaster,MasterName,DearName,StoragePwd,Deleted,CREATEDATE,LASTUPDATE) SELECT ServerIndex,'$blue_account','$blue_character','0122',30,32,Level,6,Hair,Sex,Job,1100000,GamePoint,'0122',30,32,PkPoint,ReLevel,AttatckMode,FightZoneDieCount,BodyLuck,IncHealth,IncSpell,IncHealing,CreditPoint,BonusPoint,HungerStatus,PayMentPoint,LockLogon,MarryCount,AllowGroup,AllowGroupReCall,GroupRcallTime,AllowGuildReCall,IsMaster,MasterName,DearName,StoragePwd,0,NOW(),NOW() FROM characters WHERE Id=$blue_donor; INSERT INTO characters_indexes (Account,ChrName,SelectID,IsDeleted,CreateDate,ModifyDate) VALUES ('$red_account','$red_character',0,0,NOW(),NOW()),('$blue_account','$blue_character',0,0,NOW(),NOW());"
mysql_query "$insert_sql" >/dev/null
red_id="$(mysql_query "SELECT Id FROM characters WHERE ChrName='$red_character';" | tr -d '\r')"
blue_id="$(mysql_query "SELECT Id FROM characters WHERE ChrName='$blue_character';" | tr -d '\r')"
if [[ ! "$red_id" =~ ^[0-9]+$ || ! "$blue_id" =~ ^[0-9]+$ ]]; then
  echo 'temporary characters were not created' >&2
  exit 1
fi

state_sql="INSERT INTO characters_ablity (PlayerId,Level,Ac,Mac,Dc,Mc,Sc,Hp,Mp,MaxHP,MAxMP,Exp,MaxExp,Weight,MaxWeight,WearWeight,MaxWearWeight,HandWeight,MaxHandWeight,ModifyTime) SELECT $red_id,Level,Ac,Mac,Dc,Mc,Sc,Hp,Mp,MaxHP,MAxMP,Exp,MaxExp,Weight,MaxWeight,WearWeight,MaxWearWeight,HandWeight,MaxHandWeight,ModifyTime FROM characters_ablity WHERE PlayerId=$red_donor; INSERT INTO characters_ablity (PlayerId,Level,Ac,Mac,Dc,Mc,Sc,Hp,Mp,MaxHP,MAxMP,Exp,MaxExp,Weight,MaxWeight,WearWeight,MaxWearWeight,HandWeight,MaxHandWeight,ModifyTime) SELECT $blue_id,Level,Ac,Mac,Dc,Mc,Sc,Hp,Mp,MaxHP,MAxMP,Exp,MaxExp,Weight,MaxWeight,WearWeight,MaxWearWeight,HandWeight,MaxHandWeight,ModifyTime FROM characters_ablity WHERE PlayerId=$blue_donor; INSERT INTO characters_bonusability (PLAYERID,AC,MAC,DC,MC,SC,HP,MP,HIT,SPEED,RESERVED) SELECT $red_id,AC,MAC,DC,MC,SC,HP,MP,HIT,SPEED,RESERVED FROM characters_bonusability WHERE PLAYERID=$red_donor; INSERT INTO characters_bonusability (PLAYERID,AC,MAC,DC,MC,SC,HP,MP,HIT,SPEED,RESERVED) SELECT $blue_id,AC,MAC,DC,MC,SC,HP,MP,HIT,SPEED,RESERVED FROM characters_bonusability WHERE PLAYERID=$blue_donor; INSERT INTO characters_magic (PlayerId,MagicId,Level,UseKey,CurrTrain) SELECT $red_id,MagicId,Level,UseKey,CurrTrain FROM characters_magic WHERE PlayerId=$red_donor; INSERT INTO characters_magic (PlayerId,MagicId,Level,UseKey,CurrTrain) SELECT $blue_id,MagicId,Level,UseKey,CurrTrain FROM characters_magic WHERE PlayerId=$blue_donor; INSERT INTO characters_item (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) SELECT $red_id,Position,MakeIndex,StdIndex,Dura,DuraMax FROM characters_item WHERE PlayerId=$red_donor; INSERT INTO characters_item (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) SELECT $blue_id,Position,MakeIndex,StdIndex,Dura,DuraMax FROM characters_item WHERE PlayerId=$blue_donor; INSERT INTO characters_bagitem (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) SELECT $red_id,Position,MakeIndex,StdIndex,Dura,DuraMax FROM characters_bagitem WHERE PlayerId=$red_donor; INSERT INTO characters_bagitem (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) SELECT $blue_id,Position,MakeIndex,StdIndex,Dura,DuraMax FROM characters_bagitem WHERE PlayerId=$blue_donor; INSERT INTO characters_storageitem (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) SELECT $red_id,Position,MakeIndex,StdIndex,Dura,DuraMax FROM characters_storageitem WHERE PlayerId=$red_donor; INSERT INTO characters_storageitem (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) SELECT $blue_id,Position,MakeIndex,StdIndex,Dura,DuraMax FROM characters_storageitem WHERE PlayerId=$blue_donor; INSERT INTO characters_status (PlayerId,Status0,Status1,Status2,Status3,Status4,Status5,Status6,Status7,Status8,Status9,Status10,Status11,Status12,Status13,Status14,Status15) SELECT $red_id,Status0,Status1,Status2,Status3,Status4,Status5,Status6,Status7,Status8,Status9,Status10,Status11,Status12,Status13,Status14,Status15 FROM characters_status WHERE PlayerId=$red_donor; INSERT INTO characters_status (PlayerId,Status0,Status1,Status2,Status3,Status4,Status5,Status6,Status7,Status8,Status9,Status10,Status11,Status12,Status13,Status14,Status15) SELECT $blue_id,Status0,Status1,Status2,Status3,Status4,Status5,Status6,Status7,Status8,Status9,Status10,Status11,Status12,Status13,Status14,Status15 FROM characters_status WHERE PlayerId=$blue_donor; INSERT INTO characters_quest (PLAYERID,QUESTOPENINDEX,QUESTFININDEX,QUEST) SELECT $red_id,QUESTOPENINDEX,QUESTFININDEX,QUEST FROM characters_quest WHERE PLAYERID=$red_donor ORDER BY Id DESC LIMIT 1; INSERT INTO characters_quest (PLAYERID,QUESTOPENINDEX,QUESTFININDEX,QUEST) SELECT $blue_id,QUESTOPENINDEX,QUESTFININDEX,QUEST FROM characters_quest WHERE PLAYERID=$blue_donor ORDER BY Id DESC LIMIT 1; UPDATE characters_bagitem SET MakeIndex=100000001,StdIndex=58,Dura=1,DuraMax=1 WHERE PlayerId=$red_id AND Position=8; UPDATE characters_bagitem SET MakeIndex=100000002,StdIndex=59,Dura=1,DuraMax=1 WHERE PlayerId=$red_id AND Position=9; UPDATE characters_bagitem SET MakeIndex=100000003,StdIndex=60,Dura=1,DuraMax=1 WHERE PlayerId=$red_id AND Position=10; UPDATE characters_bagitem SET MakeIndex=100000004,StdIndex=58,Dura=1,DuraMax=1 WHERE PlayerId=$blue_id AND Position=8; UPDATE characters_bagitem SET MakeIndex=100000005,StdIndex=59,Dura=1,DuraMax=1 WHERE PlayerId=$blue_id AND Position=9; UPDATE characters_bagitem SET MakeIndex=100000006,StdIndex=60,Dura=1,DuraMax=1 WHERE PlayerId=$blue_id AND Position=10; UPDATE characters_ablity SET Hp=1000,MaxHP=1000,Mp=1000,MaxMP=1000 WHERE PlayerId IN ($red_id,$blue_id);"
mysql_query "$state_sql" >/dev/null
mysql_query "UPDATE characters SET Level=35,CX=28,CY=31,HomeMap='0122',HomeX=28,HomeY=31 WHERE Id=$red_id; UPDATE characters SET Level=35,CX=28,CY=32,HomeMap='0122',HomeX=28,HomeY=32 WHERE Id=$blue_id; UPDATE characters_ablity SET Level=35,Hp=539,MaxHP=539,Mp=134,MaxMP=134 WHERE PlayerId IN ($red_id,$blue_id);" >/dev/null

"${compose[@]}" stop -t 30 web-gateway engine >/dev/null
"${compose[@]}" up -d engine web-gateway >/dev/null
python3 scripts/wait-ready.py >/dev/null
sleep 8

MIR2_GUILD_RED_NAME="$red_guild" \
MIR2_GUILD_BLUE_NAME="$blue_guild" \
MIR2_GUILD_RED_CREDENTIALS='.runtime/web-ui-test.json' \
MIR2_GUILD_BLUE_CREDENTIALS='.runtime/probe-account.json' \
MIR2_GUILD_RED_CHARACTER="$red_character" \
MIR2_GUILD_BLUE_CHARACTER="$blue_character" \
MIR2_GUILD_EXPECT_CASTLE_SUBMISSION="${MIR2_GUILD_EXPECT_CASTLE_SUBMISSION:-0}" \
node tools/guild_war_probe.mjs

if [[ "${MIR2_GUILD_EXPECT_CASTLE_SUBMISSION:-0}" == 1 ]] && ! grep -Fq -- "$red_guild" "$castle_attack_file"; then
  echo "castle application was not persisted for $red_guild" >&2
  exit 1
fi

echo "PASS guild-war regression ($red_character/$blue_character)"
