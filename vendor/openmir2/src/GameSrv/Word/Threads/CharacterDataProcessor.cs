using GameSrv.Services;

namespace GameSrv.Word.Threads
{
    public class CharacterDataProcessor : TimerScheduledService
    {

        private readonly object UserCriticalSection = new object();
        private readonly object _processingGate = new object();
        private WorldServer _shutdownWorld;
        private readonly object _finalizeGate = new object();
        private Task<bool> _finalizeTask;
        private ShutdownDrainState _lastDrainState;

        public void EnterShutdownMode(WorldServer world)
        {
            lock (_processingGate)
            {
                if (!world.IsShutdownFrozen) throw new InvalidOperationException("World is not frozen.");
                _shutdownWorld = world;
            }
        }

        public bool TryFinalizeShutdownSnapshots()
        {
            if (!Monitor.TryEnter(_processingGate)) return false;
            try
            {
                if (_shutdownWorld == null) return false;
                FrontEngine front = (FrontEngine)M2Share.FrontEngine;
                if (front.PendingLoadCount != 0 || front.PendingGoldCount != 0 ||
                    PlayerDataService.PendingLoadCount != 0 || _shutdownWorld.LoadPlayCount != 0 ||
                    _shutdownWorld.PendingShutdownWorkCount != 0) return false;
                _shutdownWorld.FinalizeShutdownSnapshots();
                return true;
            }
            finally { Monitor.Exit(_processingGate); }
        }

        public Task<bool> TryFinalizeShutdownSnapshotsAsync()
        {
            lock (_finalizeGate)
            {
                if (_finalizeTask == null || _finalizeTask.IsCompleted)
                    _finalizeTask = Task.Run(TryFinalizeShutdownSnapshots);
                return _finalizeTask;
            }
        }

        public ShutdownDrainState ObserveShutdownDrain()
        {
            if (!Monitor.TryEnter(_processingGate))
            {
                // A running load/finalization has not been drained. Counts are the last
                // sampled values, explicitly marked processing, rather than blocking a
                // console deadline or treating an unobserved queue as empty.
                ShutdownDrainState previous = Volatile.Read(ref _lastDrainState) ??
                    new ShutdownDrainState(0, 0, 0, 0, 0, 0, 0, 0, false, false);
                return previous with { Processing = true, RuntimeWork = Math.Max(1, previous.RuntimeWork),
                    Frozen = _shutdownWorld?.IsShutdownFrozen == true, FinalSnapshotsComplete = false };
            }
            try
            {
                FrontEngine front = (FrontEngine)M2Share.FrontEngine;
                var state = new ShutdownDrainState(front.SaveListCount(), PlayerDataService.PendingSaveCount,
                    PlayerDataService.UnknownSaveCount, front.PendingLoadCount, PlayerDataService.PendingLoadCount,
                    _shutdownWorld?.LoadPlayCount ?? (SystemShare.WorldEngine as WorldServer)?.LoadPlayCount ?? 0,
                    front.PendingGoldCount + ((_shutdownWorld ?? SystemShare.WorldEngine as WorldServer)?.PendingShutdownGoldCount ?? 0),
                    (_shutdownWorld ?? SystemShare.WorldEngine as WorldServer)?.PendingShutdownWorkCount ?? 0,
                    _shutdownWorld?.IsShutdownFrozen == true, _shutdownWorld?.ShutdownFinalSnapshotsComplete == true);
                Volatile.Write(ref _lastDrainState, state);
                return state;
            }
            finally { Monitor.Exit(_processingGate); }
        }

        public bool ConfirmShutdownDrained()
        {
            lock (_processingGate) return ObserveShutdownDrain().Drained;
        }

        public CharacterDataProcessor() : base(TimeSpan.FromMilliseconds(500), "StorageProcessor")
        {

        }

        public override void Initialize(CancellationToken cancellationToken)
        {
            throw new NotImplementedException();
        }

        protected override void Startup(CancellationToken stoppingToken)
        {
            LogService.Info("玩家数据数据线程启动...");
        }

        protected override void Stopping(CancellationToken stoppingToken)
        {
            LogService.Info("玩家数据数据线程停止...");
        }

        protected override Task ExecuteInternal(CancellationToken stoppingToken)
        {
            lock (_processingGate)
            {
                const string sExceptionMsg = "[Exception] StorageProcessor::ExecuteInternal";
                try
                {
                    M2Share.FrontEngine.ProcessGameDate();
                    // A disconnected DB does not discard snapshots or release the reload barrier.
                    // Pending replies are still processed; other characters can progress independently.
                    ProcessSaveStorage();
                    ProcessReadStorage();
                    _shutdownWorld?.ProcessShutdownLoads();
                }
                catch (Exception ex)
                {
                    LogService.Error(sExceptionMsg);
                    LogService.Error(ex.StackTrace);
                }
                return Task.CompletedTask;
            }
        }

        private static void ProcessSaveStorage()
        {
            IList<SavePlayerRcd> saveRcdTempList = M2Share.FrontEngine.GetTempSaveRcdList();
            HashSet<string> characters = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < saveRcdTempList.Count; i++)
            {
                SavePlayerRcd saveRcd = saveRcdTempList[i];
                if (saveRcd == null)
                {
                    continue;
                }
                // Only the oldest snapshot for a character may be sent. A failed or unknown
                // outcome must not let a newer snapshot overtake it.
                if (!characters.Add(saveRcd.ChrName) || saveRcd.IsSaveing)
                {
                    continue;
                }
                PlayerDataService.SaveCharacterData(saveRcd, ref saveRcd.QueryId);
            }
            M2Share.FrontEngine.ClearSaveRcdTempList();
            PlayerDataService.ProcessSaveQueue();
        }

        private void ProcessReadStorage()
        {
            bool boReTryLoadDb = false;
            IList<LoadDBInfo> loadRcdTempList = M2Share.FrontEngine.GetLoadTempList();
            for (int i = 0; i < loadRcdTempList.Count; i++)
            {
                LoadDBInfo loadDbInfo = loadRcdTempList[i];
                if (loadDbInfo.SessionID == 0)
                {
                    continue;
                }
                if (!LoadCharacterData(loadDbInfo, ref boReTryLoadDb))
                {
                    M2Share.NetChannel.CloseUser(loadDbInfo.GateIdx, loadDbInfo.SocketId);
                    LogService.Debug("读取用户数据失败，踢出用户.");
                }
                else
                {
                    if (boReTryLoadDb)// 如果读取人物数据失败(数据还没有保存),则重新加入队列
                    {
                        HUtil32.EnterCriticalSection(UserCriticalSection);
                        try
                        {
                            ((FrontEngine)M2Share.FrontEngine).RequeueExistingLoad(loadDbInfo);
                        }
                        finally
                        {
                            HUtil32.LeaveCriticalSection(UserCriticalSection);
                        }
                    }
                }
            }
            M2Share.FrontEngine.ClearLoadRcdTempList();
            PlayerDataService.ProcessQueryQueue();
        }

        private static bool LoadCharacterData(LoadDBInfo loadUser, ref bool reTry)
        {
            ProtocolTrace.Write("character load processing");
            int queryId = 0;
            bool result = false;
            reTry = false;
            if (M2Share.FrontEngine.InSaveRcdList(loadUser.ChrName))
            {
                ProtocolTrace.Write("character load waiting for save");
                reTry = true;// 反回TRUE,则重新加入队列
                return true;
            }
            /*if (SystemShare.WorldEngine.GetPlayObjectEx(loadUser.ChrName) != null)
            {
                SystemShare.WorldEngine.KickPlayObjectEx(loadUser.ChrName);
                boReTry = true;// 反回TRUE,则重新加入队列
                return false;
            }*/
            if (!PlayerDataService.QueryCharacterData(loadUser.Account, loadUser.ChrName, loadUser.sIPaddr, ref queryId, loadUser.SessionID))
            {
                M2Share.NetChannel.SendOutConnectMsg(loadUser.GateIdx, loadUser.SocketId, loadUser.GSocketIdx); // 获取数据失败,发送连接断开消息
            }
            else
            {
                UserOpenInfo userOpenInfo = new UserOpenInfo
                {
                    ChrName = loadUser.ChrName,
                    LoadUser = loadUser,
                    HumanRcd = null,
                    QueryId = queryId
                };
                ProtocolTrace.Write("character database query queued");
                SystemShare.WorldEngine.AddUserOpenInfo(userOpenInfo);
                result = true;
            }
            return result;
        }
    }
}
