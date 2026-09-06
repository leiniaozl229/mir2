using System.Net.WebSockets;
using Mir2.WebGateway;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(20) });
app.MapGet("/health", () => Results.Json(new { status = "ready", protocol = 1 }));
app.Map("/ws", async context =>
{
    if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 400; return; }
    string origin = context.Request.Headers.Origin.ToString();
    string[] allowed = (Environment.GetEnvironmentVariable("MIR2_WEB_ORIGINS") ?? "http://127.0.0.1:5173,http://localhost:5173").Split(',');
    if (origin.Length > 0 && !allowed.Contains(origin)) { context.Response.StatusCode = 403; return; }
    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    using var session = new GatewaySession(socket);
    await session.Run(context.RequestAborted);
});
app.Run();
