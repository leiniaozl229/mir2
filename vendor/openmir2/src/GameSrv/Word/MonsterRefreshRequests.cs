using System.Collections.Concurrent;

namespace GameSrv.Word;

// NPC requests cross into each map's owning monster thread; never touch its
// actor lists from the NPC/world thread. Each owner observes every revision.
public sealed class MonsterRefreshRequests
{
    private readonly ConcurrentDictionary<string, (long Revision, long Tick)> requests = new(StringComparer.OrdinalIgnoreCase);
    private long revision;
    public bool Request(string map, long tick)
    {
        while (true)
        {
            if (requests.TryGetValue(map, out var previous))
            {
                if (tick - previous.Tick < 30_000) return false;
                if (requests.TryUpdate(map, (Interlocked.Increment(ref revision), tick), previous)) return true;
            }
            else if (requests.TryAdd(map, (Interlocked.Increment(ref revision), tick))) return true;
        }
    }
    public bool Observe(string map, IDictionary<string, long> observed)
    {
        if (!requests.TryGetValue(map, out var request)) return false;
        if (observed.TryGetValue(map, out long last) && last == request.Revision) return false;
        observed[map] = request.Revision;
        return true;
    }
}
