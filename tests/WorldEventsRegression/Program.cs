using SystemModule.MagicEvent;
using System.Collections.Concurrent;
using System.Text;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
SystemModule.SystemShare.ActorMgr = new SystemModule.ActorMgr();

var events = new ConcurrentBag<MapEvent>();
Parallel.For(0, 1000, index => events.Add(new MapEvent(null, (short)index, 600, 5, 1000, false)));
if (events.Any(item => item.Id == 0) || events.Select(item => item.Id).Distinct().Count() != events.Count)
    throw new InvalidOperationException("Concurrent map events share a native protocol identity");
foreach (var item in events) item.Dispose();
Console.WriteLine("PASS 1000 concurrent native map events have distinct nonzero protocol identities");

using var queue = new QueueProbe();
for (int step = 1; step <= 4; step++) queue.Put(new SystemModule.Data.SendMessage { nParam1 = step }, 20);
queue.Put(new SystemModule.Data.SendMessage { nParam1 = 99 }, 1);
if (queue.Take().nParam1 != 99) throw new Exception("Message priority changed");
for (int step = 1; step <= 4; step++)
    if (queue.Take().nParam1 != step) throw new Exception("Equal priority rush positions arrived out of order");
Console.WriteLine("PASS message priority is preserved and equal priority displacement messages remain FIFO");

sealed class QueueProbe : M2Server.Actor.ActorEntity
{
    public void Put(SystemModule.Data.SendMessage message, byte priority) => EnqueueMessage(message, priority);
    public SystemModule.Data.SendMessage Take() => MsgQueue.Dequeue();
}
