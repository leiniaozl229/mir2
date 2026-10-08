using M2Server.Monster;
using M2Server.Monster.Monsters;
using M2Server.Items;
using OpenMir2.Enums;
using SystemModule.Actors;
using ThreadState = System.Threading.ThreadState;

namespace GameSrv.Word
{
    public partial class WorldServer
    {
        /// <summary>
        /// 怪物刷新列表
        /// Key:线程ID
        /// Value:怪物列表
        /// </summary>
        public readonly Dictionary<int, IList<MonGenInfo>> MonGenInfoThreadMap;
        /// <summary>
        /// 怪物刷新列表
        /// </summary>
        public readonly IList<MonGenInfo> MonGenList;
        /// <summary>
        /// 怪物线程索引Map
        /// </summary>
        private readonly Dictionary<string, int> MonsterThreadMap;

        public MonsterThread[] MobThreads;
        private Thread[] MobThreading;
        private readonly object _locker = new object();
        private readonly MonsterRefreshRequests monsterRefreshRequests = new();

        public int RequestMonsterRefresh(string mapName)
        {
            if (SystemShare.Config.VentureServer || string.IsNullOrWhiteSpace(mapName)) return -1;
            int groups = MonGenInfoThreadMap.Values.Sum(list => list.Count(gen => gen?.Envir != null &&
                gen.Race > 0 && !string.IsNullOrEmpty(gen.MonName) &&
                string.Equals(gen.MapName, mapName, StringComparison.OrdinalIgnoreCase)));
            if (groups == 0) return -1;
            if (!monsterRefreshRequests.Request(mapName, Environment.TickCount64)) return -2;
            ProtocolTrace.Write($"MonsterRefresh requested map={mapName} groups={groups}");
            return groups;
        }

        public void InitializeMonster()
        {
            Dictionary<string, IList<MonGenInfo>> monsterGenMap = new Dictionary<string, IList<MonGenInfo>>(StringComparer.OrdinalIgnoreCase);//临时存放怪物刷新映射,便于计算怪要创建几个和统计

            for (int i = 0; i < MonGenList.Count; i++)
            {
                string monName = MonGenList[i].MonName;
                if (monsterGenMap.TryGetValue(monName, out IList<MonGenInfo> monGenList))
                {
                    monGenList.Add(MonGenList[i]);
                }
                else
                {
                    monsterGenMap.Add(monName, new List<MonGenInfo>()
                    {
                        MonGenList[i]
                    });
                }
            }

            if (monsterGenMap.Count <= 0)
            {
                for (int i = 0; i < SystemShare.Config.ProcessMonsterMultiThreadLimit; i++)
                {
                    if (MonGenInfoThreadMap.ContainsKey(i))
                    {
                        continue;
                    }
                    MonGenInfoThreadMap.Add(i, new List<MonGenInfo>());
                }
            }
            else
            {
                string[] monsterNames = monsterGenMap.Keys.ToArray();
                for (int i = 0; i < monsterNames.Length; i++)
                {
                    int threadId = M2Share.RandomNumber.Random(SystemShare.Config.ProcessMonsterMultiThreadLimit);
                    string monName = monsterNames[i];
                    if (MonGenInfoThreadMap.ContainsKey(threadId))
                    {
                        for (int j = 0; j < monsterGenMap[monName].Count; j++)
                        {
                            MonGenInfoThreadMap[threadId].Add(monsterGenMap[monName][j]);
                        }
                    }
                    else
                    {
                        List<MonGenInfo> monsterList = new List<MonGenInfo>();
                        for (int j = 0; j < monsterGenMap[monName].Count; j++)
                        {
                            monsterList.Add(monsterGenMap[monName][j]);
                        }
                        MonGenInfoThreadMap.Add(threadId, monsterList);
                    }
                    if (!MonsterThreadMap.ContainsKey(MonGenList[i].MonName))
                    {
                        MonsterThreadMap.Add(MonGenList[i].MonName, threadId);
                    }
                }
            }

            List<MonsterInfo> monsterName = MonsterList.Values.ToList();
            for (int i = 0; i < monsterName.Count; i++)
            {
                int threadId = M2Share.RandomNumber.Random(SystemShare.Config.ProcessMonsterMultiThreadLimit);
                if (!MonsterThreadMap.ContainsKey(MonsterList[monsterName[i].Name].Name))
                {
                    MonsterThreadMap.Add(MonsterList[monsterName[i].Name].Name, threadId);
                }
            }

            for (int i = 0; i < MonGenInfoThreadMap.Count; i++)
            {
                for (int j = 0; j < MonGenInfoThreadMap[i].Count; j++)
                {
                    if (MonGenInfoThreadMap[i] != null)
                    {
                        if (string.IsNullOrEmpty(MonGenInfoThreadMap[i][j].MonName))
                        {
                            continue;
                        }
                        MonGenInfoThreadMap[i][j].Race = (short)GetMonRace(MonGenInfoThreadMap[i][j].MonName);
                    }
                }
            }

            MonGenList.Clear();
        }

        public void Stop()
        {
            RequestMonsterStop();
        }

        /// <summary>
        /// 初始化怪物线程
        /// </summary>
        public void InitializationMonsterThread()
        {
            LogService.Debug($"Run monster threads:[{SystemShare.Config.ProcessMonsterMultiThreadLimit}]");

            int monsterThreads = SystemShare.Config.ProcessMonsterMultiThreadLimit;//处理线程+预留线程

            MobThreads = new MonsterThread[monsterThreads];
            MobThreading = new Thread[monsterThreads];

            for (byte i = 0; i < monsterThreads; i++)
            {
                MobThreads[i] = new MonsterThread() { Id = i };
            }

            for (int i = 0; i < monsterThreads; i++)
            {
                MonsterThread mobThread = MobThreads[i];
                MobThreading[i] = new Thread(() => ProcessMonsters(mobThread))
                {
                    IsBackground = true
                };
                MobThreading[i].Start();
            }
            LogService.Info($"怪物线程初始化完成...[{SystemShare.Config.ProcessMonsterMultiThreadLimit}]");
        }

        /// <summary>
        /// 取怪物刷新时间
        /// </summary>
        /// <returns></returns>
        public int GetMonstersZenTime(int dwTime)
        {
            if (dwTime < 30 * 60 * 1000)
            {
                int d10 = (PlayObjectCount - SystemShare.Config.UserFull) / HUtil32._MAX(1, SystemShare.Config.ZenFastStep);
                if (d10 > 0)
                {
                    if (d10 > 6)
                    {
                        d10 = 6;
                    }
                    return dwTime - HUtil32.Round((dwTime / 10.0) * d10);
                }
                else
                {
                    return dwTime;
                }
            }
            return dwTime;
        }

        /// <summary>
        /// 刷新怪物和怪物行动
        /// </summary>
        private void ProcessMonsters(MonsterThread monsterThread)
        {
            if (monsterThread == null)
            {
                return;
            }
            if (!MonGenInfoThreadMap.TryGetValue(monsterThread.Id, out IList<MonGenInfo> mongenList))
            {
                return;
            }
            LogService.Debug($"MonsterProcess Thread:{monsterThread.Id} Monsters:{mongenList.Count} starting work.");

            // Keep occupied maps independent from the round-robin over every map.
            // With thousands of MonGen rows, that round-robin can take minutes.
            var spawnGroupsByMap = mongenList
                .Where(gen => gen?.Envir != null)
                .GroupBy(gen => gen.MapName, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);
            var previousMapPopulation = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var occupiedSpawnQueue = new Queue<MonGenInfo>();
            var queuedSpawns = new HashSet<MonGenInfo>();
            var forcedSpawns = new HashSet<MonGenInfo>();
            var observedRefreshes = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            int occupiedScanTick = 0;
            bool firstOccupiedScan = true;

            while (!MonsterStopRequested)
            {
                MonGenInfo monGen = null;
                int spawnTick = HUtil32.GetTickCount();
                if (firstOccupiedScan || unchecked(spawnTick - occupiedScanTick) >= 500)
                {
                    firstOccupiedScan = false;
                    occupiedScanTick = spawnTick;
                    foreach (var (mapName, spawns) in spawnGroupsByMap)
                    {
                        if (monsterRefreshRequests.Observe(mapName, observedRefreshes))
                        {
                            foreach (var spawn in spawns)
                            {
                                forcedSpawns.Add(spawn);
                                if (queuedSpawns.Add(spawn)) occupiedSpawnQueue.Enqueue(spawn);
                            }
                        }
                        int population = spawns[0].Envir.HumCount;
                        previousMapPopulation.TryGetValue(mapName, out int previousPopulation);
                        previousMapPopulation[mapName] = population;
                        if (population <= 0)
                        {
                            continue;
                        }

                        bool playerEntered = population > previousPopulation;
                        foreach (MonGenInfo spawn in spawns)
                        {
                            int delay = MonsterSpawnPolicy.OccupiedDelay(GetMonstersZenTime(spawn.ZenTime));
                            if ((playerEntered || spawn.StartTick == 0 || spawnTick - spawn.StartTick >= delay)
                                && queuedSpawns.Add(spawn))
                            {
                                occupiedSpawnQueue.Enqueue(spawn);
                            }
                        }
                    }
                }

                // Small batches fill a newly entered map promptly without pausing AI.
                for (int priority = 0; priority < 2 && occupiedSpawnQueue.Count > 0; priority++)
                {
                    MonGenInfo occupiedSpawn = occupiedSpawnQueue.Dequeue();
                    queuedSpawns.Remove(occupiedSpawn);
                    if (forcedSpawns.Remove(occupiedSpawn))
                    {
                        RefreshMonsterGroup(occupiedSpawn, spawnGroupsByMap[occupiedSpawn.MapName].Count);
                    }
                    else if (occupiedSpawn.Envir.HumCount > 0)
                    {
                        TryRegenMonsters(occupiedSpawn, true, spawnGroupsByMap[occupiedSpawn.MapName].Count);
                    }
                }

                if ((HUtil32.GetTickCount() - monsterThread.RegenMonstersTick) > SystemShare.Config.RegenMonstersTime)
                {
                    monsterThread.RegenMonstersTick = HUtil32.GetTickCount();
                    if (monsterThread.CurrMonGenIdx < mongenList.Count)
                    {
                        monGen = mongenList[monsterThread.CurrMonGenIdx];
                    }
                    else if (mongenList.Count > 0)
                    {
                        monGen = mongenList[0];
                    }
                    if (monsterThread.CurrMonGenIdx < mongenList.Count - 1)
                    {
                        monsterThread.CurrMonGenIdx++;
                    }
                    else
                    {
                        monsterThread.CurrMonGenIdx = 0;
                    }
                    if (monGen != null && monGen.Envir?.HumCount <= 0 && !string.IsNullOrEmpty(monGen.MonName) && !SystemShare.Config.VentureServer)
                    {
                        if (monGen.StartTick == 0 || ((HUtil32.GetTickCount() - monGen.StartTick) > GetMonstersZenTime(monGen.ZenTime)))
                        {
                            TryRegenMonsters(monGen, false, 0);
                        }
                    }
                }

                int dwRunTick = HUtil32.GetTickCount();
                try
                {
                    bool processLimit = false;
                    int currentTick = HUtil32.GetTickCount();
                    int monProcTick = HUtil32.GetTickCount();
                    monsterThread.MonsterProcessCount = 0;
                    int i = 0;
                    for (i = monsterThread.MonGenListPosition; i < mongenList.Count; i++)
                    {
                        monGen = mongenList[i];
                        int processPosition = monsterThread.MonGenCertListPosition < monGen.CertList.Count ? monsterThread.MonGenCertListPosition : 0;
                        monsterThread.MonGenCertListPosition = 0;
                        while (true)
                        {
                            if (processPosition >= monGen.CertList.Count)
                            {
                                break;
                            }
                            IMonsterActor monster = monGen.CertList[processPosition];
                            if (monster != null)
                            {
                                if (!monster.Ghost)
                                {
                                    if ((currentTick - monster.RunTick) > monster.RunTime)
                                    {
                                        monster.RunTick = dwRunTick;
                                        if (monster.Death && monster.CanReAlive && monster.Invisible && (monster.MonGen != null))
                                        {
                                            if ((HUtil32.GetTickCount() - monster.ReAliveTick) > GetMonstersZenTime(monster.MonGen.ZenTime))
                                            {
                                                RespawnMonster(monster);
                                            }
                                        }
                                        if (!monster.IsVisibleActive && (monster.ProcessRunCount < SystemShare.Config.ProcessMonsterInterval))
                                        {
                                            monster.ProcessRunCount++;
                                        }
                                        else
                                        {
                                            if (monster.IsSlave || (monster.Race is ActorRace.Guard or ActorRace.ArcherGuard or ActorRace.SlaveMonster))// 守卫和下属主动搜索附近的精灵
                                            {
                                                if ((currentTick - monster.SearchTick) > monster.SearchTime)
                                                {
                                                    monster.SearchTick = HUtil32.GetTickCount();
                                                    //怪物主动搜索视觉范围，修改为人物视野被动激活，从而大幅度降低CPU使用率
                                                    //区分哪些怪物是主动攻击，哪些怪物是被动攻击
                                                    //被动攻击怪物主要代表为 鹿 鸡 祖玛雕像（石化状态）
                                                    //其余怪物均为主动攻击
                                                    //修改为被动攻击后，由玩家或者下属才执行SearchViewRange方法,找到怪物之后加入到怪物视野范围
                                                    //由玩家找出附近的怪物，然后添加到怪物视野范围
                                                    monster.SearchViewRange();
                                                }
                                            }
                                            monster.ProcessRunCount = 0;
                                            monster.Run();
                                        }
                                    }
                                    monsterThread.MonsterProcessPostion++;
                                }
                                else
                                {
                                    if ((HUtil32.GetTickCount() - monster.GhostTick) > 5 * 60 * 1000)
                                    {
                                        monGen.CertList.RemoveAt(processPosition);
                                        //monGen.CertCount--;
                                        monster = null;
                                        continue;
                                    }
                                }
                            }
                            processPosition++;
                            if ((HUtil32.GetTickCount() - monProcTick) > M2Share.MonLimit)
                            {
                                processLimit = true;
                                monsterThread.MonGenCertListPosition = processPosition;
                                break;
                            }
                        }
                        if (processLimit)
                        {
                            break;
                        }
                    }
                    if (MonGenInfoThreadMap.Count <= i)
                    {
                        monsterThread.MonGenListPosition = 0;
                        monsterThread.MonsterCount = monsterThread.MonsterProcessPostion;
                        monsterThread.MonsterProcessPostion = 0;
                    }
                    monsterThread.MonGenListPosition = !processLimit ? 0 : i;
                }
                catch (Exception e)
                {
                    LogService.Error(e.StackTrace);
                }
                finally
                {
                    Thread.Sleep(20);
                }
            }
        }

        private bool RespawnMonster(IMonsterActor monster)
        {
            if (!monster.ReAliveEx(monster.MonGen)) return false;
            // ReAliveEx clears the old bag/gold; each life needs fresh drop rolls.
            MonGetRandomItems(monster);
            monster.ProcessRunCount = 0;
            monster.ReAliveTick = HUtil32.GetTickCount();
            return true;
        }

        private void RefreshMonsterGroup(MonGenInfo spawn, int mapSpawnGroups)
        {
            // Reuse dead natural spawns (including bosses), preserving the
            // existing count and rerolling loot through the normal revive path.
            foreach (var monster in spawn.CertList)
            {
                if (monster == null || !monster.Death || monster.Ghost || !monster.CanReAlive ||
                    monster.MonGen != spawn || monster.Envir != spawn.Envir || monster.Master != null) continue;
                if (!monster.Invisible) monster.MakeGhost();
                RespawnMonster(monster);
            }
            TryRegenMonsters(spawn, true, mapSpawnGroups, force: true);
            ProtocolTrace.Write($"MonsterRefresh processed map={spawn.MapName} monster={spawn.MonName} slots={spawn.ActiveCount}");
        }

        private void TryRegenMonsters(MonGenInfo monGen, bool occupied, int mapSpawnGroups, bool force = false)
        {
            if (SystemShare.Config.VentureServer || string.IsNullOrEmpty(monGen.MonName))
            {
                return;
            }
            SystemModule.Maps.IEnvirnoment map = monGen.Envir;
            if (map == null || !force && map.Flag.boNOHUMNOMON && map.HumCount <= 0)
            {
                return;
            }

            int baseTarget = HUtil32._MAX(1, HUtil32.Round(HUtil32._MAX(1, monGen.Count) / (SystemShare.Config.MonGenRate / 10.0)));
            int target = MonsterSpawnPolicy.TargetCount(baseTarget, monGen.ZenTime, mapSpawnGroups, occupied);
            bool regenerated = monGen.ActiveCount >= target || RegenMonsters(monGen, target - monGen.ActiveCount);
            if (regenerated || occupied)
            {
                // A blocked spawn point must not retry every half-second.
                monGen.StartTick = HUtil32.GetTickCount();
            }
        }

        /// <summary>
        /// 获取刷怪数量
        /// </summary>
        /// <param name="monGen"></param>
        /// <returns></returns>
        private static int GetGenMonCount(MonGenInfo monGen)
        {
            int nCount = 0;
            for (int i = 0; i < monGen.CertList.Count; i++)
            {
                IMonsterActor baseObject = monGen.CertList[i];
                if (!baseObject.Death && !baseObject.Ghost)
                {
                    nCount++;
                }
            }
            return nCount;
        }

        public IActor RegenMonsterByName(string sMap, short nX, short nY, string sMonName)
        {
            int nRace = GetMonRace(sMonName);
            IMonsterActor baseObject = CreateMonster(sMap, nX, nY, nRace, sMonName);
            if (baseObject != null)
            {
                int threadId = GetMonsterThreadId(sMonName);
                // Summons and scripted monsters may have a thread id that was never
                // given a MonGen list.  Reuse an existing monster thread instead of
                // dropping the actor.
                if (threadId < 0 || !MonGenInfoThreadMap.ContainsKey(threadId))
                {
                    if (MonGenInfoThreadMap.Count == 0)
                    {
                        return null;
                    }
                    threadId = MonGenInfoThreadMap.Keys.Min();
                    MonsterThreadMap[sMonName] = threadId;
                }
                if (threadId >= 0)
                {
                    MonGenInfo MonGenInfo = new MonGenInfo();
                    MonGenInfo.MapName = sMap;
                    MonGenInfo.X = nX;
                    MonGenInfo.Y = nY;
                    MonGenInfo.MonName = sMonName;
                    MonGenInfo.Range = 0;
                    MonGenInfo.Count = 1;
                    MonGenInfo.ZenTime = 0;
                    MonGenInfo.MissionGenRate = 0;// 集中座标刷新机率 1 -100
                    MonGenInfo.CertList = new List<IMonsterActor>();
                    MonGenInfo.Envir = SystemShare.MapMgr.FindMap(MonGenInfo.MapName);
                    if (MonGenInfo.TryAdd(baseObject))
                    {
                        // This is a one-off scripted/summoned actor, not an
                        // empty spawn slot. Without the active count the
                        // generator recreates one copy every refresh tick.
                        MonGenInfo.ActiveCount = 1;
                    }
                    MonGenInfoThreadMap[threadId].Add(MonGenInfo);

                    //var n18 = MonGenInfoThreadMap[threadId].Count - 1;
                    //if (n18 < 0) n18 = 0;
                    //if (MonGenInfoThreadMap[threadId].Count > n18)
                    //{
                    //    var monGen = MonGenInfoThreadMap[threadId][n18];
                    //    if (monGen.TryAdd(baseObject))
                    //    {
                    //        monGen.CertCount++;
                    //    }
                    //    else
                    //    {
                    //        threadId = SystemShare.Config.ProcessMonsterMultiThreadLimit + 1;
                    //        MonGenInfoThreadMap.Add(threadId, new List<MonGenInfo> { monGen.Clone() });//todo 启动线程
                    //    }
                    //}
                    baseObject.Envir.AddObject(baseObject);
                    baseObject.AddToMaped = true;
                }
                else
                {
                    return null;
                }
            }
            return baseObject;
        }

        /// <summary>
        /// 计算怪物掉落物品
        /// 即创建怪物对象的时候已经算好要掉落的物品和属性
        /// </summary>
        /// <returns></returns>
        private void MonGetRandomItems(IMonsterActor mon)
        {
            if (MonsterList.TryGetValue(mon.ChrName, out MonsterInfo monster))
            {
                IList<MonsterDropItem> itemList = monster.ItemList;
                if (itemList != null && itemList.Count > 0)
                {
                    mon.ItemList = new List<UserItem>(itemList.Count);
                    for (int i = 0; i < itemList.Count; i++)
                    {
                        MonsterDropItem monItem = itemList[i];
                        if (M2Share.RandomNumber.Random(monItem.MaxPoint) <= monItem.SelPoint)
                        {
                            if (string.Compare(monItem.ItemName, Grobal2.StringGoldName, StringComparison.OrdinalIgnoreCase) == 0)
                            {
                                mon.Gold = mon.Gold + monItem.Count / 2 + M2Share.RandomNumber.Random(monItem.Count);
                            }
                            else
                            {
                                UserItem userItem = null;
                                if (SystemShare.ItemSystem.CopyToUserItemFromName(monItem.ItemName, ref userItem))
                                {
                                    userItem.Dura = (ushort)HUtil32.Round(userItem.DuraMax / 100.0 * (20 + M2Share.RandomNumber.Random(80)));
                                    StdItem stdItem = SystemShare.ItemSystem.GetStdItem(userItem.Index);
                                    if (stdItem == null)
                                    {
                                        continue;
                                    }

                                    if (M2Share.StdModeMap.Contains(stdItem.StdMode))
                                    {
                                        if (stdItem.Shape == 130 || stdItem.Shape == 131 || stdItem.Shape == 132)
                                        {
                                            SystemShare.ItemSystem.RandomSetUnknownItem(stdItem, userItem);
                                        }
                                    }
                                    int quality = GameItemSystem.MonsterDropQualityMin +
                                        M2Share.RandomNumber.Random(GameItemSystem.MonsterDropQualityMax -
                                            GameItemSystem.MonsterDropQualityMin + 1);
                                    int FlatRoll() => GameItemSystem.MonsterDropFlatMin +
                                        M2Share.RandomNumber.Random(GameItemSystem.MonsterDropFlatMax -
                                            GameItemSystem.MonsterDropFlatMin + 1);
                                    GameItemSystem.ApplyMonsterDropBonusRoll(stdItem, userItem,
                                        quality, FlatRoll(), FlatRoll(), FlatRoll(), FlatRoll(), FlatRoll());
                                    mon.ItemList.Add(userItem);
                                }
                            }
                        }
                    }
                }
            }
        }

        /// <summary>
        /// 创建对象
        /// </summary>
        /// <returns></returns>
        private IMonsterActor CreateMonster(string sMapName, short nX, short nY, int nMonRace, string sMonName, bool avoidSafeZone = false)
        {
            IMonsterActor cert = null;
            SystemModule.Maps.IEnvirnoment map = SystemShare.MapMgr.FindMap(sMapName);
            if (map == null)
            {
                return null;
            }

            if (avoidSafeZone && !MoveSpawnOutsideSafeZone(map, ref nX, ref nY))
            {
                return null;
            }

            switch (nMonRace)
            {
                case ActorRace.Supreguard:
                    cert = new SuperGuard();
                    break;
                case ActorRace.Petsupreguard:
                    cert = new PetSuperGuard();
                    break;
                case ActorRace.ArcherPolice:
                    cert = new ArcherPolice();
                    break;
                case ActorRace.AnimalChicken:
                    cert = new MonsterObject
                    {
                        Animal = true,
                        MeatQuality = (ushort)(M2Share.RandomNumber.Random(3500) + 3000),
                        BodyLeathery = 50
                    };
                    break;
                case ActorRace.AnimalDeer:
                    if (M2Share.RandomNumber.Random(30) == 0)
                    {
                        cert = new ChickenDeer
                        {
                            Animal = true,
                            MeatQuality = (ushort)(M2Share.RandomNumber.Random(20000) + 10000),
                            BodyLeathery = 150
                        };
                    }
                    else
                    {
                        cert = new MonsterObject()
                        {
                            Animal = true,
                            MeatQuality = (ushort)(M2Share.RandomNumber.Random(8000) + 8000),
                            BodyLeathery = 150
                        };
                    }
                    break;
                case ActorRace.AnimalWolf:
                    cert = new AtMonster
                    {
                        Animal = true,
                        MeatQuality = (ushort)(M2Share.RandomNumber.Random(8000) + 8000),
                        BodyLeathery = 150
                    };
                    break;
                case ActorRace.Trainer:
                    cert = new Trainer();
                    break;
                case ActorRace.MonsterOma:
                    cert = new MonsterObject();
                    break;
                case ActorRace.MonsterOmaknight:
                    cert = new AtMonster();
                    break;
                case ActorRace.MonsterSpitspider:
                    cert = new SpitSpider();
                    break;
                case 83:
                    cert = new SlowAtMonster();
                    break;
                case 84:
                    cert = new Scorpion();
                    break;
                case ActorRace.MonsterStick:
                    cert = new StickMonster();
                    break;
                case 86:
                    cert = new AtMonster();
                    break;
                case ActorRace.MonsterDualaxe:
                    cert = new DualAxeMonster();
                    break;
                case 88:
                    cert = new AtMonster();
                    break;
                case 89:
                    cert = new AtMonster();
                    break;
                case 90:
                    cert = new GasAttackMonster();
                    break;
                case 91:
                    cert = new MagCowMonster();
                    break;
                case 92:
                    cert = new CowKingMonster();
                    break;
                case ActorRace.MonsterThonedark:
                    cert = new ThornDarkMonster();
                    break;
                case ActorRace.MonsterLightzombi:
                    cert = new LightingZombi();
                    break;
                case ActorRace.MonsterDigoutzombi:
                    cert = new DigOutZombi();
                    if (M2Share.RandomNumber.Random(2) == 0)
                    {
                        ((MonsterObject)cert).BoFearFire = true;
                    }

                    break;
                case ActorRace.MonsterZilkinzombi:
                    cert = new ZilKinZombi();
                    if (M2Share.RandomNumber.Random(4) == 0)
                    {
                        ((MonsterObject)cert).BoFearFire = true;
                    }

                    break;
                case 97:
                    cert = new CowMonster();
                    if (M2Share.RandomNumber.Random(2) == 0)
                    {
                        ((MonsterObject)cert).BoFearFire = true;
                    }

                    break;
                case ActorRace.MonsterWhiteskeleton:
                    cert = new WhiteSkeleton();
                    break;
                case ActorRace.MonsterSculture:
                    cert = new ScultureMonster
                    {
                        BoFearFire = true
                    };
                    break;
                case ActorRace.MonsterScultureking:
                    cert = new ScultureKingMonster();
                    break;
                case ActorRace.MonsterBeequeen:
                    cert = new BeeQueen();
                    break;
                case 104:
                    cert = new ArcherMonster();
                    break;
                case 105:
                    cert = new GasMothMonster();
                    break;
                case 106: // 楔蛾
                    cert = new GasDungMonster();
                    break;
                case 107:
                    cert = new CentipedeKingMonster();
                    break;
                case ActorRace.SabukDoor:
                    cert = new CastleDoor();
                    break;
                case ActorRace.SabukWall:
                    cert = new WallStructure();
                    break;
                case ActorRace.MonsterArcherguard:
                    cert = new ArcherGuard();
                    break;
                case ActorRace.MonsterElfmonster:
                    cert = new ElfMonster();
                    break;
                case ActorRace.MonsterElfwarrior:
                    cert = new ElfWarriorMonster();
                    break;
                case 115:
                    cert = new BigHeartMonster();
                    break;
                case 116:
                    cert = new SpiderHouseMonster();
                    break;
                case 117:
                    cert = new ExplosionSpider();
                    break;
                case 118:
                    cert = new HighRiskSpider();
                    break;
                case 119:
                    cert = new BigPoisionSpider();
                    break;
                case 120:
                    cert = new SoccerBall();
                    break;
                case 130:
                    cert = new DoubleCriticalMonster();
                    break;
                case 131:
                    cert = new RonObject();
                    break;
                case 132:
                    cert = new SandMobObject();
                    break;
                case 133:
                    cert = new MagicMonObject();
                    break;
                case 134:
                    cert = new BoneKingMonster();
                    break;
                case 200:
                    cert = new ElectronicScolpionMon();
                    break;
                case 201:
                    cert = new CloneMonster();
                    break;
                case 203:
                    cert = new TeleMonster();
                    break;
                case 206:
                    cert = new Khazard();
                    break;
                case 208:
                    cert = new GreenMonster();
                    break;
                case 209:
                    cert = new RedMonster();
                    break;
                case 210:
                    cert = new FrostTiger();
                    break;
                case 214:
                    cert = new FireMonster();
                    break;
                case 215:
                    cert = new FireballMonster();
                    break;
            }

            if (cert == null)
            {
                return null;
            }

            ApplyMonsterAbility(cert, sMonName);
            cert.Envir = map;
            cert.MapName = sMapName;
            cert.CurrX = nX;
            cert.CurrY = nY;
            cert.Dir = M2Share.RandomNumber.RandomByte(8);
            cert.ChrName = sMonName;
            cert.WAbil = cert.Abil;
            cert.OnEnvirnomentChanged();
            MonGetRandomItems(cert);
            if (M2Share.RandomNumber.Random(100) < cert.CoolEyeCode)
            {
                cert.CoolEye = true;
            }

            cert.Initialize();
            if (cert.AddtoMapSuccess)
            {
                bool outofrange = false;
                short n20 = cert.Envir.Width < 50 ? (short)2 : (short)3;
                short n24;
                if (cert.Envir.Height < 250)
                {
                    n24 = cert.Envir.Height < 30 ? (short)2 : (short)20;
                }
                else
                {
                    n24 = 50;
                }
                int n1C = 0;
                while (true)
                {
                    if (!cert.Envir.CanWalk(cert.CurrX, cert.CurrY, false) ||
                        avoidSafeZone && M2Server.Actor.BaseObject.IsSafeZonePosition(cert.Envir, cert.CurrX, cert.CurrY))
                    {
                        if ((cert.Envir.Width - n24 - 1) > cert.CurrX)
                        {
                            cert.CurrX += n20;
                        }
                        else
                        {
                            cert.CurrX = (short)(M2Share.RandomNumber.Random(cert.Envir.Width / 2) + n24);
                            if (cert.Envir.Height - n24 - 1 > cert.CurrY)
                            {
                                cert.CurrY += n20;
                            }
                            else
                            {
                                cert.CurrY = (short)(M2Share.RandomNumber.Random(cert.Envir.Height / 2) + n24);
                            }
                        }
                    }
                    else
                    {
                        outofrange = cert.Envir.AddMapObject(cert.CurrX, cert.CurrY, CellType.Monster, cert.ActorId, cert);
                        break;
                    }
                    n1C++;
                    if (n1C >= 31)
                    {
                        break;
                    }
                }
                if (!outofrange)
                {
                    //LogService.Error($"创建怪物失败 名称:{sMonName} 地图:[{sMapName}] X:{nX} Y:{nY} ");
                    return null;
                }
            }
            return cert;
        }

        private static bool MoveSpawnOutsideSafeZone(SystemModule.Maps.IEnvirnoment map, ref short nX, ref short nY)
        {
            return M2Server.Actor.BaseObject.TryFindMonsterSpawnPosition(map, ref nX, ref nY);
        }

        /// <summary>
        /// 创建怪物对象
        /// 在指定时间内创建完对象，则返加TRUE，如果超过指定时间则返回FALSE
        /// </summary>
        /// <returns></returns>
        private bool RegenMonsters(MonGenInfo monGen, int nCount)
        {
            IMonsterActor cert;
            const string sExceptionMsg = "[Exception] WorldEngine::RegenMonsters";
            bool result = true;
            int dwStartTick = HUtil32.GetTickCount();
            try
            {
                if (monGen.Race > 0)
                {
                    short nX;
                    short nY;
                    if (monGen.MissionGenRate > 0 && M2Share.RandomNumber.Random(100) < monGen.MissionGenRate)
                    {
                        nX = (short)(monGen.X - monGen.Range + M2Share.RandomNumber.Random(monGen.Range * 2 + 1));
                        nY = (short)(monGen.Y - monGen.Range + M2Share.RandomNumber.Random(monGen.Range * 2 + 1));
                        for (int i = 0; i < nCount; i++)
                        {
                            cert = CreateMonster(monGen.MapName, (short)(nX - 10 + M2Share.RandomNumber.Random(20)), (short)(nY - 10 + M2Share.RandomNumber.Random(20)), monGen.Race, monGen.MonName, M2Server.Actor.BaseObject.IsAggressiveMonsterRace(monGen.Race));
                            if (cert != null)
                            {
                                cert.CanReAlive = true;
                                cert.ReAliveTick = HUtil32.GetTickCount();
                                cert.MonGen = monGen;
                                monGen.ActiveCount++;
                                monGen.TryAdd(cert);
                            }
                            else
                            {
                                return false;
                            }
                            if ((HUtil32.GetTickCount() - dwStartTick) > M2Share.ZenLimit)
                            {
                                result = false;
                                break;
                            }
                        }
                    }
                    else
                    {
                        for (int i = 0; i < nCount; i++)
                        {
                            nX = (short)((monGen.X - monGen.Range) + M2Share.RandomNumber.Random(monGen.Range * 2 + 1));
                            nY = (short)((monGen.Y - monGen.Range) + M2Share.RandomNumber.Random(monGen.Range * 2 + 1));
                            cert = CreateMonster(monGen.MapName, nX, nY, monGen.Race, monGen.MonName, M2Server.Actor.BaseObject.IsAggressiveMonsterRace(monGen.Race));
                            if (cert != null)
                            {
                                cert.CanReAlive = true;
                                cert.ReAliveTick = HUtil32.GetTickCount();
                                cert.MonGen = monGen;
                                monGen.ActiveCount++;
                                monGen.TryAdd(cert);
                            }
                            else
                            {
                                return false;
                            }
                            if (HUtil32.GetTickCount() - dwStartTick > M2Share.ZenLimit)
                            {
                                result = false;
                                break;
                            }
                        }
                    }
                }
            }
            catch
            {
                LogService.Error(sExceptionMsg);
                result = false;
            }
            return result;
        }

        private void ApplyMonsterAbility(IMonsterActor monsterActor, string sMonName)
        {
            if (!MonsterList.TryGetValue(sMonName, out MonsterInfo monster))
            {
                return;
            }

            monsterActor.Race = monster.Race;
            monsterActor.RaceImg = monster.RaceImg;
            monsterActor.Appr = monster.Appr;
            monsterActor.Abil.Level = monster.Level;
            monsterActor.LifeAttrib = monster.btLifeAttrib;
            monsterActor.CoolEyeCode = monster.CoolEye;
            monsterActor.FightExp = monster.Exp;
            monsterActor.Abil.HP = monster.HP;
            monsterActor.Abil.MaxHP = monster.HP;
            monsterActor.Abil.MP = 0;
            monsterActor.Abil.MaxMP = monster.MP;
            monsterActor.Abil.AC = HUtil32.MakeWord(monster.AC, monster.AC);
            monsterActor.Abil.MAC = HUtil32.MakeWord(monster.MAC, monster.MAC);
            monsterActor.Abil.DC = HUtil32.MakeWord(monster.DC, monster.MaxDC);
            monsterActor.Abil.MC = HUtil32.MakeWord(monster.MC, monster.MC);
            monsterActor.Abil.SC = HUtil32.MakeWord(monster.SC, monster.SC);
            monsterActor.MonsterWeapon = HUtil32.LoByte(monster.MP);
            monsterActor.SpeedPoint = monster.Speed;
            monsterActor.HitPoint = monster.HitPoint;
            monsterActor.WalkSpeed = monster.WalkSpeed;
            monsterActor.WalkStep = monster.WalkStep;
            monsterActor.WalkWait = monster.WalkWait;
            monsterActor.NextHitTime = monster.AttackSpeed;
            monsterActor.NastyMode = monster.boAggro;
            monsterActor.NoTame = monster.boTame;
        }
    }

    public static class MonsterSpawnPolicy
    {
        public static int TargetCount(int baseTarget, int originalDelay, int mapSpawnGroups, bool occupied)
        {
            if (!occupied || originalDelay >= 60 * 60 * 1000 && baseTarget <= 2)
            {
                // Long-cycle bosses retain their original cap.
                return baseTarget;
            }
            // A small map may have dozens of one-monster points. Applying a
            // per-point minimum there would flood the map and stall its AI.
            int minimum = mapSpawnGroups <= 3 && originalDelay < 20 * 60 * 1000 ? 6 : 0;
            return Math.Min(ushort.MaxValue, Math.Min(baseTarget + 24, Math.Max(minimum, baseTarget * 2)));
        }

        public static int OccupiedDelay(int originalDelay)
        {
            return Math.Max(15_000, originalDelay / 4);
        }
    }
}
