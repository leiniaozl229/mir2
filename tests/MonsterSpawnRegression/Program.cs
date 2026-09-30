using GameSrv.Word;

static void Require(bool condition, string description)
{
    if (!condition) throw new Exception(description);
}

const int minute = 60_000;
Require(MonsterSpawnPolicy.TargetCount(2, 5 * minute, 1, false) == 2,
    "unoccupied maps keep the configured target");
Require(MonsterSpawnPolicy.TargetCount(1, 3 * minute, 1, true) == 6,
    "a sparse ordinary spawn fills a playable group when occupied");
Require(MonsterSpawnPolicy.TargetCount(1, 3 * minute, 60, true) == 2,
    "maps with many small spawn groups do not flood with the per-point minimum");
Require(MonsterSpawnPolicy.TargetCount(2, 30 * minute, 1, true) == 4,
    "slower spawns double without the ordinary minimum");
Require(MonsterSpawnPolicy.TargetCount(1, 6 * 60 * minute, 1, true) == 1,
    "long-cycle single bosses are not duplicated");
Require(MonsterSpawnPolicy.TargetCount(50, 3 * minute, 10, true) == 74,
    "large groups cannot gain more than 24 monsters");
Require(MonsterSpawnPolicy.OccupiedDelay(1 * minute) == 15_000,
    "short respawn intervals stop at the safety floor");
Require(MonsterSpawnPolicy.OccupiedDelay(20 * minute) == 5 * minute,
    "occupied maps respawn at one quarter of the configured interval");

Console.WriteLine("Monster spawn policy regression passed.");
