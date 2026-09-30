using System.Threading;

namespace M2Server.Player
{
    // The local window helper writes this file atomically. Missing or invalid settings
    // leave the normal server pickup behavior unchanged.
    internal static class NativeHelperSettings
    {
        private static readonly string SettingsPath =
            Environment.GetEnvironmentVariable("MIR2_NATIVE_HELPER_SETTINGS");
        private static long _nextReadTick;
        private static bool _autoPickup;

        public static bool AutoPickup
        {
            get
            {
                if (string.IsNullOrWhiteSpace(SettingsPath)) return false;
                long now = Environment.TickCount64;
                if (now < Volatile.Read(ref _nextReadTick)) return _autoPickup;
                Volatile.Write(ref _nextReadTick, now + 500);
                try
                {
                    _autoPickup = File.ReadLines(SettingsPath)
                        .Any(line => line.Trim().Equals("AutoPickup=1", StringComparison.OrdinalIgnoreCase));
                }
                catch (IOException)
                {
                    _autoPickup = false;
                }
                catch (UnauthorizedAccessException)
                {
                    _autoPickup = false;
                }
                return _autoPickup;
            }
        }
    }
}
