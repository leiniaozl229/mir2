using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

if (args.Length != 1 || !int.TryParse(args[0], out var processId) || processId <= 0)
{
    Console.Error.WriteLine("Usage: NativeWindowFix <mir.dat process id>");
    return 2;
}

using var instanceLock = new Mutex(true, $@"Local\MirDrawFix-{processId}", out var acquired);
if (!acquired)
{
    return 0;
}

Process client;
try
{
    client = Process.GetProcessById(processId);
}
catch (ArgumentException)
{
    Console.Error.WriteLine("Client process has exited.");
    return 1;
}

using (client)
{
    using var loginText = new LoginTextOverlay(processId);
    var deadline = DateTime.UtcNow.AddSeconds(25);
    var repaired = false;
    while (!client.HasExited)
    {
        var main = NativeWindow.FindMainWindow(processId);
        if (main != IntPtr.Zero)
        {
            var draw = NativeWindow.FindDrawWindow(main);
            if (draw != IntPtr.Zero && NativeWindow.GetClientRect(main, out var area))
            {
                var width = area.Right - area.Left;
                var height = area.Bottom - area.Top;
                if (width > 0 && height > 0)
                {
                    var origin = new NativeWindow.Point();
                    if (!NativeWindow.ClientToScreen(main, ref origin))
                    {
                        Console.Error.WriteLine("Could not read the game client origin.");
                        return 1;
                    }

                    if (!NativeWindow.GetWindowRect(draw, out var current))
                    {
                        Console.Error.WriteLine("Could not read the DirectDraw child window.");
                        return 1;
                    }

                    var needsRepair = current.Left != origin.X || current.Top != origin.Y ||
                                      current.Right - current.Left != width ||
                                      current.Bottom - current.Top != height;
                    if (needsRepair)
                    {
                        // The packed client leaves TDXDraw at 386x327 while dgVoodoo renders
                        // an 800x600 image. Mouse messages outside TDXDraw reach the form.
                        if (!NativeWindow.SetWindowPos(draw, IntPtr.Zero, 0, 0, width, height,
                                NativeWindow.SwpNoZOrder | NativeWindow.SwpNoActivate))
                        {
                            Console.Error.WriteLine($"Could not resize TDXDraw (Win32 {Marshal.GetLastWin32Error()}).");
                            return 1;
                        }
                        Console.WriteLine($"Resized TDXDraw to {width}x{height} for PID {processId}.");
                    }
                    repaired = true;
                }
            }
        }

        if (!repaired && DateTime.UtcNow >= deadline)
        {
            Console.Error.WriteLine("The game window or TDXDraw child did not appear.");
            return 1;
        }
        Thread.Sleep(250);
        client.Refresh();
    }
}

instanceLock.ReleaseMutex();
return 0;

internal static class NativeWindow
{
    public const uint SwpNoZOrder = 0x0004;
    public const uint SwpNoActivate = 0x0010;

    [StructLayout(LayoutKind.Sequential)]
    public struct Point
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private delegate bool WindowVisitor(IntPtr handle, IntPtr context);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(WindowVisitor callback, IntPtr context);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, WindowVisitor callback, IntPtr context);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr window, int index);

    [DllImport("user32.dll", EntryPoint = "SendMessageTimeoutA", CharSet = CharSet.Ansi, SetLastError = true)]
    private static extern IntPtr ReadEditText(IntPtr window, uint message, IntPtr capacity,
        StringBuilder text, uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int capacity);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder name, int capacity);

    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr window, ref Point point);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y,
        int width, int height, uint flags);

    public static IntPtr FindMainWindow(int processId)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((window, _) =>
        {
            GetWindowThreadProcessId(window, out var owner);
            if (owner == processId && ClassName(window) == "TFrmMain" && IsWindowVisible(window))
            {
                var title = new StringBuilder(64);
                GetWindowText(window, title, title.Capacity);
                if (title.ToString() == "legend of mir2" && GetClientRect(window, out var client) &&
                    client.Right - client.Left >= 780 && client.Bottom - client.Top >= 580)
                {
                    found = window;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static IntPtr FindDrawWindow(IntPtr main)
    {
        IntPtr found = IntPtr.Zero;
        EnumChildWindows(main, (window, _) =>
        {
            if (ClassName(window) == "TDXDraw")
            {
                found = window;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static bool IsForeground(IntPtr main) => GetForegroundWindow() == main && !IsIconic(main);

    public static (Rect bounds, string text)[] ReadLoginFields(IntPtr main)
    {
        var edits = new List<(IntPtr handle, Rect bounds)>();
        EnumChildWindows(main, (window, _) =>
        {
            if (ClassName(window) == "TEdit" && IsWindowVisible(window) &&
                GetWindowRect(window, out var rect) && rect.Right - rect.Left >= 100 &&
                rect.Bottom - rect.Top >= 15)
            {
                edits.Add((window, rect));
            }
            return true;
        }, IntPtr.Zero);
        if (edits.Count != 2)
        {
            return [];
        }

        edits.Sort((first, second) => first.bounds.Top.CompareTo(second.bounds.Top));
        var result = new (Rect bounds, string text)[2];
        for (var index = 0; index < edits.Count; index++)
        {
            var value = new StringBuilder(128);
            if (ReadEditText(edits[index].handle, 0x000D, new IntPtr(value.Capacity), value,
                    0x0002, 200, out _) == IntPtr.Zero)
            {
                return [];
            }
            var text = (GetWindowLong(edits[index].handle, -16) & 0x20) != 0
                ? new string('*', value.Length)
                : value.ToString();
            result[index] = (edits[index].bounds, text);
        }
        return result;
    }

    private static string ClassName(IntPtr window)
    {
        var text = new StringBuilder(64);
        GetClassName(window, text, text.Capacity);
        return text.ToString();
    }
}
