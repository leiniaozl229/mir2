using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

if (args.Length != 3) throw new ArgumentException("Usage: LegacyTextRepertoire gateway.dll output.json LegacyCodec.cs");
var assembly = Assembly.LoadFrom(args[0]);
var codec = assembly.GetType("Mir2.WebGateway.LegacyCodec", throwOnError: true)!;
var encoding = (Encoding)codec.GetField("Gbk", BindingFlags.Static | BindingFlags.Public)!.GetValue(null)!;
if (encoding.CodePage != 936 || encoding.DecoderFallback is not DecoderExceptionFallback)
    throw new InvalidOperationException("The gateway must use strict CP936 decoding");
var values = new SortedSet<int>();
void Decode(byte[] bytes)
{
    try { var value = encoding.GetString(bytes); if (value.Length == 1) values.Add(value[0]); }
    catch (DecoderFallbackException) { }
}
for (int single = 0; single < 256; single++) Decode([(byte)single]);
for (int lead = 0x81; lead <= 0xfe; lead++)
    for (int trail = 0; trail < 256; trail++) Decode([(byte)lead, (byte)trail]);
var codepoints = values.ToArray();
string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
var sha256 = Hash(Encoding.ASCII.GetBytes(string.Join(",", codepoints)));
var result = new {
    schemaVersion = 1, encoding = "CP936",
    source = "Actual built LegacyCodec.Gbk; strict single-byte and double-byte decoding",
    sourceAssemblySha256 = Hash(File.ReadAllBytes(args[0])), sourceCodecSha256 = Hash(File.ReadAllBytes(args[2])),
    count = codepoints.Length, sha256, codepoints
};
File.WriteAllText(args[1], JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine(JsonSerializer.Serialize(new { count = codepoints.Length, sha256 }));
