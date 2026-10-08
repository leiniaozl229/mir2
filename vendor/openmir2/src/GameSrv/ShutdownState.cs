namespace GameSrv
{
    public enum ShutdownOutcome { Stopped, TimedOut, Cancelled, Failed }

    public sealed record ShutdownDrainState(int Saves, int NativeSaves, int UnknownSaves,
        int QueuedLoads, int NativeLoads, int WorldLoads, int GoldChanges, int RuntimeWork,
        bool Frozen, bool FinalSnapshotsComplete, bool Processing = false)
    {
        public bool Drained => !Processing && Frozen && FinalSnapshotsComplete && Saves == 0 && NativeSaves == 0 &&
            QueuedLoads == 0 && NativeLoads == 0 && WorldLoads == 0 && GoldChanges == 0 && RuntimeWork == 0;
    }

    public sealed record ShutdownResult(ShutdownOutcome Outcome, ShutdownDrainState State, string Reason)
    {
        public bool Succeeded => Outcome == ShutdownOutcome.Stopped;
    }

    public sealed class ShutdownOptions
    {
        public TimeSpan AttemptTimeout { get; init; } = TimeSpan.FromSeconds(30);
        public TimeSpan AdmissionDelay { get; init; } = TimeSpan.FromSeconds(5);
        public TimeSpan PollInterval { get; init; } = TimeSpan.FromMilliseconds(50);
        public TimeSpan HostRetryDelay { get; init; } = TimeSpan.FromSeconds(1);
    }
}
