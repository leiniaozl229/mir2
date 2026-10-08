using Mir2.WebGateway;
using System.Security.Cryptography;
using System.Text;

int groups = 0;
void Equal(string expected, string actual)
{
    if (actual != expected) throw new Exception($"Expected {expected}, got {actual}");
}
void Reject(Action action)
{
    try { action(); } catch (InvalidOperationException) { return; } catch (EncoderFallbackException) { return; }
    throw new Exception("Expected validation rejection");
}
void Pass(string name) { groups++; Console.WriteLine($"PASS {name}"); }

foreach (string raw in new[] { "!喊话", "!!组队消息", "!~行会消息", "/张三 私聊内容", "@AttackMode", "@拒绝私聊", "@@加速处理" })
    Equal(raw, ChatCommand.Build("raw", raw, "ignored"));
Equal("@AttackMode  1", ChatCommand.Build(" RAW ", "  @AttackMode  1  ", null));
Pass("raw preserves native prefixes, @ commands, argument spacing and existing outer Trim");

foreach (string text in new[] { "!hello", "!!hello", "!~hello", "/Alice hi", "@Rest" })
    Equal(text, ChatCommand.Build("raw", text, null));
Reject(() => ChatCommand.Build("local", "@Rest", null));
Reject(() => ChatCommand.Build("local", "!hello", null));
Equal("!hello", ChatCommand.Build("shout", "hello", null));
Equal("!!hello", ChatCommand.Build("group", "hello", null));
Equal("!~hello", ChatCommand.Build("guild", "hello", null));
Equal("/Alice hello", ChatCommand.Build("whisper", "hello", "Alice"));
Equal("hello", ChatCommand.Build("local", "hello", null));
Pass("existing structured channels remain intact while raw performs no extra prefixing");

foreach (string? text in new string?[] { null, "", "   ", "a\nb", "a\0b", "a\tb", "a\u007fb", "a\u0085b" })
    Reject(() => ChatCommand.Build("raw", text, null));
Reject(() => ChatCommand.Build("unknown", "hello", null));
Pass("raw shares strict nonempty and control-character validation without an unknown-channel bypass");

Equal(new string('a', 180), ChatCommand.Build("raw", new string('a', 180), null));
Reject(() => ChatCommand.Build("raw", new string('a', 181), null));
Equal(new string('中', 90), ChatCommand.Build("raw", new string('中', 90), null));
Reject(() => ChatCommand.Build("raw", new string('中', 91), null));
Equal("!"+new string('中', 89), ChatCommand.Build("shout", new string('中', 89), null));
Reject(() => ChatCommand.Build("shout", new string('中', 90), null));
Reject(() => ChatCommand.Build("raw", "emoji😀", null));
Pass("production GBK enforces ASCII/CJK limits, structured prefix bytes and unencodable input");

string command = ChatCommand.Build("raw", "/张三  你好", null);
byte[] bytes = LegacyCodec.Gbk.GetBytes(command);
Equal(command, LegacyCodec.Gbk.GetString(LegacyCodec.Decode(LegacyCodec.Encode(bytes))));
foreach (string recipient in new[] { "", "two words", "/Alice", "!Alice", "@Alice", "abcdefghijk" })
    Reject(() => ChatCommand.Build("whisper", "hi", recipient));
Pass("raw original TCP string survives actual legacy codec and structured whisper recipient guards remain strict");

if (groups != 5) throw new Exception("Unexpected group count");
Console.WriteLine($"{groups} production chat gateway groups passed; no native/browser/server chat delivery claim.");
string repo = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
foreach (string source in new[] { "services/web-gateway/ChatCommand.cs", "services/web-gateway/LegacyCodec.cs", "tests/ChatGatewayRegression/Program.cs" })
    Console.WriteLine($"SHA256 {Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(Path.Combine(repo, source)))).ToLowerInvariant()} {source}");
