using OpenMir2.NativeList.Utils;

namespace GameSrvTest;

public class NativeListTests
{
    [Test]
    public void RemoveAtWorksWhenTheBufferIsFull()
    {
        using var list = new NativeList<int>(2);
        list.Add(10);
        list.Add(20);

        list.RemoveAt(0);
        Assert.That(list.Count, Is.EqualTo(1));
        Assert.That(list[0], Is.EqualTo(20));

        list.Add(30);
        list.RemoveAt(1);
        Assert.That(list.Count, Is.EqualTo(1));
        Assert.That(list[0], Is.EqualTo(20));

        list.RemoveAt(0);
        Assert.That(list.Count, Is.Zero);
        list.Add(40);
        Assert.That(list[0], Is.EqualTo(40));
    }

    [Test]
    public void RemoveAtWorksWithTheSingleElementCapacity()
    {
        using var list = new NativeList<int>(1);
        list.Add(7);

        list.RemoveAt(0);

        Assert.That(list.Count, Is.Zero);
        list.Add(8);
        Assert.That(list[0], Is.EqualTo(8));
    }
}
