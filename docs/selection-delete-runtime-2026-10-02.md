# 第十四批选角删除：测试网关运行补充

本补充发生在`replication-selection-v14-batch.json`封存后。该档案、[原实施记录](selection-delete-implementation-2026-10-02.md)、此前延后切换的回执全部保留，作为对应时点的事实。

18801连接随后释放，启动护栏再次确认0活跃连接后切换自有测试网关，PID12516→17432。新网关使用此前已完整测试的publish，WebGateway.dll SHA256为`32498ec4e54cb9262d0c1e7ae804cea5d81712d922f4fa6e5913c616967e02eb`；上一版publish保留。Vite14700继续运行，实际5173/ws仍指向18801。

`selection-v14-runtime-live.json`确认5个选角原图/清单源、HTTP与dist相同，6个当前页面/模块可取；实际Node通过5173/ws读取characterDeletion=true，未登录删除请求携带requestId被明确拒绝，退出仍正常拒绝，三条代次0信封及正常关闭通过。它证明已启用的新网关能力和未登录保护，不证明真实角色删除、原服等级/旧名限制、数据库持久化或浏览器点击。

源码、前端、协议及测试二进制均未再改。复用同一字节输入的42网页脚本497PASS标记、80实际网关组、384Python和4校准分支，不宣称本次重新执行所有组；新执行仅此处HTTP/WS、进程/端口身份与指纹核对。原服、数据库、生产账号和角色未操作，195项仍5implemented/184partial/6missing/0verified。

选角页现在可以根据新网关能力显示原帧删除入口；[UI校准页](http://127.0.0.1:5173/ui-calibration.html)可先检查四种离线结果。真实隔离角色删除、同版动画/热区/字体/按钮状态、制作群目标版本结论和完整复刻全部待办仍开放。最终当前指纹使用`replication-selection-live-v14-batch.json`，前一档案继续保留。
