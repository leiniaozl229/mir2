using GameSrv.Services;
using GameSrv.Word;
using McMaster.Extensions.CommandLineUtils;
using SystemModule.Enums;

using Microsoft.Extensions.Hosting;

namespace GameSrv
{
    public class AppService : IHostedLifecycleService, IDisposable
    {
        private readonly GameApp _mirApp;
        private int? _exitCode;
        private readonly CancellationTokenSource _cancellationTokenSource;
        private readonly CommandLineApplication _application;
        private PeriodicTimer _timer;
        private readonly object _shutdownGate = new object();
        private readonly ShutdownOptions _shutdownOptions;
        private readonly IHostApplicationLifetime _applicationLifetime;
        private Task<ShutdownResult> _shutdownAttempt;
        private Task _shutdownNotice;
        private ShutdownResult _completedShutdown;
        private int _admissionStopped;

        public ShutdownResult LastShutdownResult { get; private set; }

        public AppService(GameApp serverApp, IHostApplicationLifetime applicationLifetime = null,
            ShutdownOptions shutdownOptions = null)
        {
            _mirApp = serverApp;
            _applicationLifetime = applicationLifetime;
            _shutdownOptions = shutdownOptions ?? new ShutdownOptions();
            if (_shutdownOptions.AttemptTimeout <= TimeSpan.Zero || _shutdownOptions.PollInterval <= TimeSpan.Zero ||
                _shutdownOptions.AdmissionDelay < TimeSpan.Zero || _shutdownOptions.HostRetryDelay <= TimeSpan.Zero)
                throw new ArgumentOutOfRangeException(nameof(shutdownOptions));
            _application = new CommandLineApplication();
            LogService.Debug($"Starting with arguments: {string.Join(" ", Environment.GetCommandLineArgs())}");

            _cancellationTokenSource = new CancellationTokenSource();

            _application.HelpOption("-?|-h|-help");
            _application.OnExecute(() =>
            {
                _application.ShowHelp();
                return 0;
            });
            _application.Command("reloadconf", command =>
            {
                command.Description = "重新读取配置文件";
                command.OnExecute(() =>
                {
                    Console.WriteLine("重新读取所有配置文件");
                });
            });
            _application.Command("save", command =>
            {
                command.Description = "立即保存游戏数据";
                command.OnExecuteAsync(async cancellationToken =>
                {
                    await SavePlayersAsync(cancellationToken);
                });
            });
            _application.Command("drainstatus", command =>
            {
                command.Description = "显示停服前的玩家、载入和存档队列数量";
                command.OnExecute(() =>
                {
                    ShutdownDrainState state = GameShare.CharacterDataProcessor.ObserveShutdownDrain();
                    LogService.Info($"MIR2_DRAIN_STATUS players={SystemShare.WorldEngine.PlayObjectCount} loading={state.QueuedLoads + state.NativeLoads + state.WorldLoads} saves={state.Saves} nativeSaves={state.NativeSaves} unknown={state.UnknownSaves} gold={state.GoldChanges} work={state.RuntimeWork} frozen={state.Frozen} finalSnapshots={state.FinalSnapshotsComplete}");
                });
            });
            _application.Command("gamestatus", command =>
            {
                command.Description = "查看游戏网关状况";
                command.OnExecuteAsync(async (cancellationToken) =>
                {
                    await ShowGateStatus(cancellationToken);
                });
            });
            _application.Command("exit", command =>
            {
                command.Description = "停止游戏服务";
                command.OnExecuteAsync(async cancellationToken =>
                {
                    ShutdownResult result = await RequestShutdownAsync(cancellationToken);
                    if (result.Succeeded) _applicationLifetime?.StopApplication();
                });
            });
            _application.Command("quit", command =>
            {
                command.Description = "退出程序";
                command.OnExecuteAsync(async cancellationToken =>
                {
                    if (!AnsiConsole.Confirm("Do you really want to exit?")) return;
                    ShutdownResult result = await RequestShutdownAsync(cancellationToken);
                    if (result.Succeeded) _applicationLifetime?.StopApplication();
                });
            });
            _application.Command("status", command =>
            {
                command.Description = "查看系统状态";
                command.OnExecute(() =>
                {
                    ShowWordStatus(_cancellationTokenSource.Token);
                });
            });
        }

        public Task StartingAsync(CancellationToken cancellationToken)
        {
            try
            {
                LogService.Info("正在读取配置信息...");
                LogService.Info("读取游戏引擎数据配置文件...");
                GameShare.GeneratorProcessor.Initialize(cancellationToken);
                M2Share.FrontEngine = new FrontEngine();
                GameShare.LoadConfig();
                _mirApp.LoadServerTable();
                LogService.Info("初始化游戏引擎数据配置文件完成...");
                LogService.Info("初始化游戏基础数据...");
                _mirApp.Initialize(cancellationToken);
                LogService.Info("初始化游戏基础数据完成...");
            }
            catch (Exception ex)
            {
                _exitCode = 1;
                LogService.Error("初始化游戏基础数据失败...", ex);
                throw;
            }
            return Task.CompletedTask;
        }

        public Task StartAsync(CancellationToken stoppingToken)
        {
            try
            {
                LogService.Info("初始化游戏世界服务...");
                _mirApp.InitializeWorld(_cancellationTokenSource.Token);
                LogService.Info("初始化游戏世界服务完成...");
            }
            catch (Exception ex)
            {
                LogService.Error("初始化游戏世界服务失败...", ex);
            }
            return Task.CompletedTask;
        }

        public async Task StartedAsync(CancellationToken cancellationToken)
        {
            _exitCode = 0;
            await _mirApp.StartUp(cancellationToken);
            LogService.Info("初始化游戏世界服务线程完成...");
            LogService.Info("欢迎使用翎风系列游戏软件...");
            LogService.Info("网站:http://www.gameofmir.com");
            LogService.Info("论坛:http://bbs.gameofmir.com");
            _ = Task.Run(ProcessLoopAsync);
        }

        public async Task StopAsync(CancellationToken stoppingToken)
        {
            await StoppingAsync(stoppingToken);
            LogService.Debug($"Exiting with return code: {_exitCode}");
        }

        public async Task<bool> SavePlayersAsync(CancellationToken cancellationToken = default)
        {
            if (((WorldServer)SystemShare.WorldEngine).IsShutdownFrozen)
                throw new InvalidOperationException("The world is frozen for shutdown.");
            foreach (var play in SystemShare.WorldEngine.GetPlayObjects().ToArray())
                WorldServer.SaveHumanRcd(play);
            long deadline = Environment.TickCount64 + 10_000;
            while ((!M2Share.FrontEngine.IsIdle() || PlayerDataService.PendingSaveCount != 0) && Environment.TickCount64 < deadline)
                await Task.Delay(_shutdownOptions.PollInterval, cancellationToken);
            bool saved = M2Share.FrontEngine.IsIdle() && PlayerDataService.PendingSaveCount == 0;
            LogService.Info(saved ? "Player save queue confirmed." : "Player save queue is still pending.");
            return saved;
        }

        public async Task<ShutdownResult> RequestShutdownAsync(CancellationToken cancellationToken = default)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                string reason;
                lock (_shutdownGate)
                {
                    if (_completedShutdown != null) return _completedShutdown;
                    reason = _shutdownAttempt == null ? "not_started" : "caller_result_unknown";
                }
                return new ShutdownResult(ShutdownOutcome.Cancelled,
                    GameShare.CharacterDataProcessor.ObserveShutdownDrain(), reason);
            }
            Task<ShutdownResult> attempt;
            lock (_shutdownGate)
            {
                if (_completedShutdown != null) return _completedShutdown;
                if (_shutdownAttempt == null || _shutdownAttempt.IsCompleted)
                    _shutdownAttempt = ExecuteShutdownAttemptAsync();
                attempt = _shutdownAttempt;
            }
            try
            {
                return cancellationToken.CanBeCanceled
                    ? await attempt.WaitAsync(cancellationToken).ConfigureAwait(false)
                    : await attempt.ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Cancellation only stops this waiter; an in-flight save cannot be rolled back here.
                return new ShutdownResult(ShutdownOutcome.Cancelled,
                    GameShare.CharacterDataProcessor.ObserveShutdownDrain(), "caller_result_unknown");
            }
        }

        private async Task<ShutdownResult> ExecuteShutdownAttemptAsync()
        {
            await Task.Yield();
            using var timeout = new CancellationTokenSource(_shutdownOptions.AttemptTimeout);
            ShutdownOutcome outcome;
            string reason;
            try
            {
                M2Share.StartReady = false;
                ((FrontEngine)M2Share.FrontEngine).BeginShutdown();
                if (Interlocked.Exchange(ref _admissionStopped, 1) == 0)
                    M2Share.NetChannel.SendServerStopMsg();
                await _mirApp.FreezeForShutdownAsync().WaitAsync(timeout.Token).ConfigureAwait(false);
                lock (_shutdownGate) _shutdownNotice ??= NotifyShutdownAsync();
                await _shutdownNotice.WaitAsync(timeout.Token).ConfigureAwait(false);
                while (true)
                {
                    timeout.Token.ThrowIfCancellationRequested();
                    await GameShare.CharacterDataProcessor.TryFinalizeShutdownSnapshotsAsync()
                        .WaitAsync(timeout.Token).ConfigureAwait(false);
                    ShutdownDrainState state = GameShare.CharacterDataProcessor.ObserveShutdownDrain();
                    if (state.Drained)
                    {
                        await _mirApp.CompleteShutdownAsync().WaitAsync(timeout.Token).ConfigureAwait(false);
                        var result = new ShutdownResult(ShutdownOutcome.Stopped, state, "confirmed");
                        lock (_shutdownGate) _completedShutdown = result;
                        LastShutdownResult = result;
                        _cancellationTokenSource.Cancel();
                        LogService.Info("Player data confirmed; game service stopped. goodbye!");
                        return result;
                    }
                    await Task.Delay(_shutdownOptions.PollInterval, timeout.Token).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) when (timeout.IsCancellationRequested)
            {
                outcome = ShutdownOutcome.TimedOut;
                reason = "pending_data_or_shutdown_work";
            }
            catch (Exception ex)
            {
                outcome = ShutdownOutcome.Failed;
                reason = ex.GetType().Name;
            }
            ShutdownDrainState failedState = GameShare.CharacterDataProcessor.ObserveShutdownDrain();
            if (outcome == ShutdownOutcome.TimedOut && failedState.GoldChanges != 0)
                reason = "unsupported_gold_operation";
            else if (outcome == ShutdownOutcome.TimedOut && failedState.UnknownSaves != 0)
                reason = "native_save_result_unknown";
            var failed = new ShutdownResult(outcome, failedState, reason);
            LastShutdownResult = failed;
            LogService.Error($"Shutdown unresolved: {outcome}; reason={reason}; saves={failed.State.Saves}; nativeSaves={failed.State.NativeSaves}; unknown={failed.State.UnknownSaves}; loads={failed.State.QueuedLoads + failed.State.NativeLoads + failed.State.WorldLoads}; gold={failed.State.GoldChanges}; work={failed.State.RuntimeWork}; frozen={failed.State.Frozen}.");
            return failed;
        }

        private async Task NotifyShutdownAsync()
        {
            await Task.Delay(_shutdownOptions.AdmissionDelay).ConfigureAwait(false);
            int seconds = Math.Max(0, SystemShare.Config.ShutdownSeconds);
            while (seconds > 0)
            {
                // Existing load initialization can still add actors before the final snapshot phase.
                // A notice is advisory; it must not race final snapshot generation or end a save barrier.
                try
                {
                    foreach (var play in SystemShare.WorldEngine.GetPlayObjects().ToArray())
                        play.SysMsg($"服务器关闭倒计时[{seconds}].", MsgColor.Red, MsgType.Notice);
                }
                catch (Exception)
                {
                    LogService.Debug("Shutdown notice deferred while existing players finish loading.");
                }
                await Task.Delay(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
                seconds--;
            }
        }

        private void ProcessLoopAsync()
        {
            while (!_cancellationTokenSource.IsCancellationRequested)
            {
                string cmdline = Console.ReadLine();
                if (cmdline == null) break;
                if (string.IsNullOrEmpty(cmdline))
                {
                    continue;
                }
                try
                {
                    _application.Execute(cmdline);
                }
                catch
                {
                    // ignored
                }
            }
        }

        private static Task ClearConsole()
        {
            Console.Clear();
            AnsiConsole.Clear();
            return Task.CompletedTask;
        }

        private void ShowWordStatus(CancellationToken cancellationToken)
        {
            if (_timer != null)
            {
                _timer.Dispose();
                _timer = null;
            }
            _timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
            AnsiConsole.Status()
                .AutoRefresh(true)
                .Spinner(Spinner.Known.Star)
                .SpinnerStyle(Style.Parse("green bold"))
                .Start("Thinking...", async ctx =>
                {
                    while (await _timer.WaitForNextTickAsync(cancellationToken))
                    {
                        int monsterCount = 0;
                        /*for (var i = 0; i < SystemShare.WorldEngine.MobThreads.Length; i++)
                        {
                            monsterCount += SystemShare.WorldEngine.MobThreads[i].MonsterCount;
                        }*/
                        AnsiConsole.MarkupLine($"Monsters:{monsterCount}");
                        GameShare.Statistics.ShowServerStatus();
                        ctx.Refresh();
                    }
                });
        }

        private static Task ShowGateStatus(CancellationToken cancellationToken)
        {
            //GateShare.ShowLog = false;
            //_timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
            //var serverList = ServerManager.Instance.GetServerList();
            //var table = new Table().Expand().BorderColor(Color.Grey);
            //table.AddColumn("[yellow]Address[/]");
            //table.AddColumn("[yellow]Port[/]");
            //table.AddColumn("[yellow]Status[/]");
            //table.AddColumn("[yellow]Online[/]");
            //table.AddColumn("[yellow]Send[/]");
            //table.AddColumn("[yellow]Revice[/]");
            //table.AddColumn("[yellow]Queue[/]");

            //await AnsiConsole.Live(table)
            //     .AutoClear(true)
            //     .Overflow(VerticalOverflow.Crop)
            //     .Cropping(VerticalOverflowCropping.Bottom)
            //     .StartAsync(async ctx =>
            //     {
            //         foreach (var _ in Enumerable.Range(0, 10))
            //         {
            //             table.AddRow(new[] { new Markup("-"), new Markup("-"), new Markup("-"), new Markup("-"), new Markup("-"), new Markup("-") });
            //         }

            //         while (await _timer.WaitForNextTickAsync(cts.Token))
            //         {
            //             for (int i = 0; i < serverList.Count; i++)
            //             {
            //                 var (serverIp, serverPort, Status, playCount, reviceTotal, sendTotal, queueCount) = serverList[i].GetStatus();

            //                 table.UpdateCell(i, 0, $"[bold]{serverIp}[/]");
            //                 table.UpdateCell(i, 1, ($"[bold]{serverPort}[/]"));
            //                 table.UpdateCell(i, 2, ($"[bold]{Status}[/]"));
            //                 table.UpdateCell(i, 3, ($"[bold]{playCount}[/]"));
            //                 table.UpdateCell(i, 4, ($"[bold]{sendTotal}[/]"));
            //                 table.UpdateCell(i, 5, ($"[bold]{reviceTotal}[/]"));
            //                 table.UpdateCell(i, 6, ($"[bold]{queueCount}[/]"));
            //             }
            //             ctx.Refresh();
            //         }
            //     });
            return Task.CompletedTask;
        }

        public void Dispose()
        {

        }

        public async Task StoppingAsync(CancellationToken cancellationToken)
        {
            // A host timeout cannot truthfully complete shutdown while native saves are unknown.
            // ACK processing has an independent lifetime and remains active for a late correlated reply.
            while (!(await RequestShutdownAsync(CancellationToken.None).ConfigureAwait(false)).Succeeded)
            {
                LogService.Error("Host stop is waiting for unresolved player data or work; admission remains closed.");
                await Task.Delay(_shutdownOptions.HostRetryDelay).ConfigureAwait(false);
            }
        }

        public Task StoppedAsync(CancellationToken cancellationToken)
        {
            return Task.CompletedTask;
        }
    }
}
