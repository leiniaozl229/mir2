using System;
namespace OpenMir2;
public static class ProtocolTrace
{
    public static void Write(string stage)
    {
        if (Environment.GetEnvironmentVariable("MIR2_PROTOCOL_TRACE") == "1")
            LogService.Info("[protocol] " + stage);
    }
}
