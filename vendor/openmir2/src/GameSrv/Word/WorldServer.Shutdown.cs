using GameSrv.Services;
using SystemModule.Actors;

namespace GameSrv.Word
{
    public partial class WorldServer
    {
        private int _monsterStopRequested;
        private int _shutdownFrozen;
        private int _shutdownSnapshotPhaseStarted;
        private readonly object _shutdownGate = new object();
        private IPlayerActor[] _shutdownPlayers;
        private readonly HashSet<IPlayerActor> _shutdownCancelledTrades = new HashSet<IPlayerActor>();
        private readonly HashSet<IPlayerActor> _shutdownSnapshots = new HashSet<IPlayerActor>();

        private bool MonsterStopRequested => Volatile.Read(ref _monsterStopRequested) != 0;
        public bool IsShutdownFrozen => Volatile.Read(ref _shutdownFrozen) != 0;
        private bool ShutdownSnapshotPhaseStarted => Volatile.Read(ref _shutdownSnapshotPhaseStarted) != 0;

        public int PendingShutdownWorkCount
        {
            get
            {
                lock (LoadPlaySection)
                    return NewHumanList.Count + LoadPlayerQueue.Count + ChangeHumanDbGoldList.Count +
                        ListOfGateIdx.Count + ListOfSocket.Count;
            }
        }

        public int PendingShutdownGoldCount
        {
            get { lock (LoadPlaySection) return ChangeHumanDbGoldList.Count; }
        }

        public bool ShutdownFinalSnapshotsComplete
        {
            get
            {
                if (!Monitor.TryEnter(_shutdownGate)) return false;
                try { return _shutdownPlayers != null && _shutdownPlayers.All(_shutdownSnapshots.Contains); }
                finally { Monitor.Exit(_shutdownGate); }
            }
        }

        private void RequestMonsterStop()
        {
            Interlocked.Exchange(ref _monsterStopRequested, 1);
            lock (_locker) Monitor.PulseAll(_locker);
        }

        public async Task StopMonsterThreadsAsync()
        {
            RequestMonsterStop();
            Thread[] threads = MobThreading?.ToArray() ?? Array.Empty<Thread>();
            foreach (Thread thread in threads)
            {
                if (thread != null && thread != Thread.CurrentThread && thread.IsAlive)
                    await Task.Run(() => thread.Join()).ConfigureAwait(false);
            }
        }

        public void FreezeForShutdown()
        {
            lock (_shutdownGate)
            {
                if (MobThreading?.Any(thread => thread != null && thread.IsAlive) == true)
                    throw new InvalidOperationException("Monster threads have not stopped.");
                Interlocked.Exchange(ref _shutdownFrozen, 1);
            }
        }

        public void ProcessShutdownLoads()
        {
            if (!IsShutdownFrozen || ShutdownSnapshotPhaseStarted) return;
            // ProcessHumans shares the genuine login-initialization path but returns
            // before free-list/player ticks while frozen.
            ProcessHumans();
        }

        public void FinalizeShutdownSnapshots()
        {
            lock (_shutdownGate)
            {
                if (!IsShutdownFrozen) throw new InvalidOperationException("World is not frozen.");
                if (_shutdownPlayers == null)
                {
                    var participants = new HashSet<IPlayerActor>(PlayObjectList.Where(player => player != null));
                    var pending = new Queue<IPlayerActor>(participants);
                    while (pending.TryDequeue(out IPlayerActor player))
                        if (player.DealCreat != null && participants.Add(player.DealCreat)) pending.Enqueue(player.DealCreat);
                    _shutdownPlayers = participants.Where(player => !player.IsRobot).ToArray();
                    Interlocked.Exchange(ref _shutdownSnapshotPhaseStarted, 1);
                }

                // Trade cancellation may refund both players. Finish every refund
                // before taking any character's final immutable snapshot.
                foreach (IPlayerActor player in _shutdownPlayers)
                {
                    if (_shutdownCancelledTrades.Contains(player)) continue;
                    player.DealCancelA();
                    if (player.Dealing || player.DealGolds != 0 || player.DealItemList.Count != 0)
                        throw new InvalidOperationException("Player escrow has not been returned.");
                    _shutdownCancelledTrades.Add(player);
                }
                foreach (IPlayerActor player in _shutdownPlayers)
                {
                    if (_shutdownSnapshots.Contains(player)) continue;
                    SaveHumanRcdCore(player);
                    _shutdownSnapshots.Add(player);
                }
            }
        }
    }
}
