# Web 网关目标运行时冒烟记录（2026-10-02）

## 构建

本机原先只有.NET 8工具链。通过微软官方安装脚本，把.NET SDK 10.0.401及运行时装到仓库忽略目录`.runtime/dotnet10`，没有改系统PATH。使用隔离中间目录构建：

```powershell
$dotnet = Join-Path (Get-Location).Path '.runtime/dotnet10/dotnet.exe'
$obj = Join-Path (Get-Location).Path '.runtime/gateway-net10/obj/'
$out = Join-Path (Get-Location).Path '.runtime/gateway-net10/bin'
& $dotnet build services/web-gateway/WebGateway.csproj --configuration Release --no-restore --output $out -p:BaseIntermediateOutputPath=$obj
```

构建目标为`net10.0`，0警告、0错误。新网关程序集SHA-256：`E5B210C9207648D101D9EE38FD5D8E54EAFDC54F2FD2EAE59E47A096F47F0D17`。

## 隔离运行检查

新程序集使用本机后端配置（Login/Selection/Game Gate分别为7001、17101、17201），监听`127.0.0.1:18802`：

- `GET /health`返回`{"status":"ready","protocol":1}`。
- 带`Origin: http://127.0.0.1:5173`的WebSocket `/ws`握手返回101，并收到`connected`消息、协议版本1和功能列表。
- 临时18802进程已关闭，端口复查无监听。

这只验证目标运行时能启动、HTTP路由可用、允许来源能建立WebSocket；未发送登录或游戏命令，未验证身份认证、角色/存档操作、原服业务和浏览器画面。

## 当前18801状态与限制

端口18801仍由旧工作树的.NET 8进程PID 17432监听，`/health`返回ready。连接复查曾在0与1条客户端连接之间变化，最终检查为0；旧程序集runtimeconfig目标为`net8.0`，程序集SHA-256为`D5ECA1269AB7202185C2BEEA81C19CC9DF056054705C6D2200257B8611FCC186`。原地更新需先停止此进程，但执行策略拒绝了停止命令，所以保留原服务；没有再次尝试停止，也没有绕过执行策略。

完整机器可读结果：`.runtime/reports/web-gateway-net10-smoke-2026-10-02.json`。这项基础设施验证不改变复刻台账状态，也不能替代同版浏览器和真实玩法验收。
