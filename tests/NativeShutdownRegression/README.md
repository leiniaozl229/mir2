# Native shutdown regression

The executable calls the production `AppService`, `ServerBase`, `WorldServer`,
`CharacterDataProcessor`, `FrontEngine`, `PlayerDataService`, `TCPNetChannel` and
`DataQueryServer`. Each scenario runs in a separate process because the native
static timers have a single lifetime. Database replies use private loopback TCP,
the actual packet codec and current query identities. Actor data and map fixtures
exist only in the test process. No SQL, runtime accounts or production services
are used.

The subclass overrides only the external authentication/planes transport startup
and final transport stop. The actual freeze, worker joins, two-pass trade refunds,
snapshot serialization, queue ordering, native ACK handling and connection-stop
ordering remain production code. The transport seam can throw to verify stage
retry. Real production locks control specific producer/loader interleavings;
their operations and native replies are not replaced by assertions over source.

Run from an isolated working directory, using an isolated `--artifacts-path`:

```powershell
dotnet build tests/NativeShutdownRegression/NativeShutdownRegression.csproj --artifacts-path <stage>/artifacts -p:Mode=Dev
dotnet <stage>/artifacts/bin/NativeShutdownRegression/debug/NativeShutdownRegression.dll
```

`RequestShutdownAsync` returns a known stopped result only after quiescence,
existing load completion, all trade refunds, final snapshots and correlated
1102/1 save confirmations. 1100/0 is a known rejection, eligible for the existing
bounded retry. A five-second native timeout is unknown and is never automatically
resent. Caller cancellation cancels only its waiter. `StoppingAsync` keeps the
host lifecycle pending until a genuine drain; it does not turn host cancellation
into success. Faulted stages retry, completed stages remain idempotent, and an
in-flight timed-out stage is joined rather than duplicated.

`ShutdownDrainState.Processing` means an actual worker currently owns the gate;
the other counts are the last sampled diagnostics and cannot prove an empty
queue. Existing front/world deferred gold operations currently have no write
implementation, so stopping preserves them as unsupported barriers instead of
claiming execution. No test clears such a barrier as a substitute for a native
success. Failed scenarios end only their owned in-memory fixture process.

The tests do not prove native-host startup, production deployment, SQL durability,
authentication/planes/send-pump joins, or browser/native-client fidelity. There
is no durable pending-save journal: an external supervisor or forced process
kill can still interrupt an unknown save. This remains an explicit limitation.
