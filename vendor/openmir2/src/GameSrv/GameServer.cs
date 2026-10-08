using GameSrv.Maps;

using GameSrv.Services;
using GameSrv.Word;
using M2Server.Net.TCP;

namespace GameSrv
{
    public class ServerBase
    {
        private readonly IServiceProvider serviceProvider;
        private readonly CancellationTokenSource _worldLifetime = new CancellationTokenSource();
        private readonly CancellationTokenSource _storageLifetime = new CancellationTokenSource();
        private readonly CancellationTokenSource _networkLifetime = new CancellationTokenSource();
        private readonly object _shutdownGate = new object();
        private Task _freezeTask;
        private Task _completeStopTask;
        private readonly HashSet<IModuleInitializer> _stoppedModules = new HashSet<IModuleInitializer>();
        private readonly HashSet<TimerScheduledService> _stoppedProcessors = new HashSet<TimerScheduledService>();
        private bool _connectionsStopped;
        private bool _dataServerStopped;

        protected ServerBase(IServiceProvider serviceProvider)
        {
            this.serviceProvider = serviceProvider;
        }

        public async Task StartUp(CancellationToken stoppingToken)
        {
            stoppingToken.ThrowIfCancellationRequested();
            // Host cancellation must not cancel DB reply processing before drain.
            await GameShare.GeneratorProcessor.StartAsync(_worldLifetime.Token);
            await GameShare.SystemProcess.StartAsync(_worldLifetime.Token);
            await GameShare.UserProcessor.StartAsync(_worldLifetime.Token);
            await GameShare.MerchantProcessor.StartAsync(_worldLifetime.Token);
            await GameShare.EventProcessor.StartAsync(_worldLifetime.Token);
            await GameShare.CharacterDataProcessor.StartAsync(_storageLifetime.Token);
            await GameShare.TimedRobotProcessor.StartAsync(_worldLifetime.Token);
            await GameShare.ActorBuffProcessor.StartAsync(_worldLifetime.Token);
            Map.StartMakeStoneThread();

            IEnumerable<IModuleInitializer> modules = serviceProvider.GetServices<IModuleInitializer>();

            foreach (IModuleInitializer module in modules)
            {
                module.Startup(_worldLifetime.Token); //启动模块
            }

            await StartConnectionsAsync();
        }

        protected virtual Task StartConnectionsAsync()
        {
            GameShare.DataServer.Start();
            GameShare.PlanesService.Start();
            _ = M2Share.Authentication.Start();
            return M2Share.NetChannel.Start(_networkLifetime.Token);
        }

        public Task FreezeForShutdownAsync()
        {
            lock (_shutdownGate)
            {
                if (_freezeTask == null || _freezeTask.IsFaulted || _freezeTask.IsCanceled)
                    _freezeTask = Task.Run(FreezeCoreAsync);
                return _freezeTask;
            }
        }

        private async Task FreezeCoreAsync()
        {
            FrontEngine front = (FrontEngine)M2Share.FrontEngine;
            WorldServer world = (WorldServer)SystemShare.WorldEngine;
            front.BeginShutdown();
            if (M2Share.NetChannel is not TCPNetChannel nativeChannel)
                throw new InvalidOperationException("Game channel does not support a shutdown barrier.");
            await nativeChannel.QuiesceAsync().ConfigureAwait(false);
            _worldLifetime.Cancel();
            world.Stop();
            await StopProcessorOnceAsync(GameShare.GeneratorProcessor);
            await StopProcessorOnceAsync(GameShare.SystemProcess);
            await StopProcessorOnceAsync(GameShare.UserProcessor);
            await StopProcessorOnceAsync(GameShare.MerchantProcessor);
            await StopProcessorOnceAsync(GameShare.EventProcessor);
            await StopProcessorOnceAsync(GameShare.TimedRobotProcessor);
            await StopProcessorOnceAsync(GameShare.ActorBuffProcessor);
            await world.StopMonsterThreadsAsync().ConfigureAwait(false);
            IEnumerable<IModuleInitializer> modules = serviceProvider.GetServices<IModuleInitializer>();
            foreach (IModuleInitializer module in modules)
            {
                if (_stoppedModules.Contains(module)) continue;
                module.Stopping(CancellationToken.None);
                _stoppedModules.Add(module);
            }
            world.FreezeForShutdown();
            GameShare.CharacterDataProcessor.EnterShutdownMode(world);
        }

        public Task CompleteShutdownAsync(CancellationToken cancellationToken = default)
        {
            Task task;
            lock (_shutdownGate)
            {
                if (_completeStopTask == null || _completeStopTask.IsFaulted || _completeStopTask.IsCanceled)
                    _completeStopTask = Task.Run(CompleteStopCoreAsync);
                task = _completeStopTask;
            }
            return cancellationToken.CanBeCanceled ? task.WaitAsync(cancellationToken) : task;
        }

        private async Task CompleteStopCoreAsync()
        {
            if (!GameShare.CharacterDataProcessor.ConfirmShutdownDrained())
                throw new InvalidOperationException("Shutdown has unresolved player data.");
            _storageLifetime.Cancel();
            await StopProcessorOnceAsync(GameShare.CharacterDataProcessor);
            await M2Share.NetChannel.StopAsync(CancellationToken.None);
            if (!_connectionsStopped)
            {
                await StopConnectionsAsync();
                _connectionsStopped = true;
            }
            if (!_dataServerStopped)
            {
                GameShare.DataServer.Stop();
                _dataServerStopped = true;
            }
            _networkLifetime.Cancel();

            LogService.Info("游戏世界服务线程停止...");
        }

        protected virtual Task StopConnectionsAsync()
        {
            M2Share.Authentication.Close();
            return Task.CompletedTask;
        }

        private async Task StopProcessorOnceAsync(TimerScheduledService processor)
        {
            if (_stoppedProcessors.Contains(processor)) return;
            await processor.StopAsync(CancellationToken.None);
            _stoppedProcessors.Add(processor);
        }

        public Task Stopping(CancellationToken cancellationToken) => CompleteShutdownAsync(cancellationToken);
    }
}
