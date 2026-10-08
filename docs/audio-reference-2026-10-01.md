# 原版声音映射与 Web 生命周期

本批按锁定 Delphi 参考与本机国服 Wav/sound.lst 接入声音；目标可执行程序的实际混音、音量、焦点行为和逐场景听音仍待验收。生产事实文件为 `content/classic-176/audio-playback.json`，实际播放入口为 `apps/web/src/game-audio.ts`。

## 原文件和触发依据

SoundUtil.PlayBGM 249–265 先调用 SilenceSound，再循环播放背景声；SilenceSound 286–290 调用 g_Sound.Clear。IntroScn 登录打开 518 使用 log-in-long2.wav，关闭 527 清声；选角打开 1136 启用计时器，1152 使用 sellect-loop2.wav，关闭 1145 清声。创建角色属于选角场景，不重复启动背景声。进入地图清除选角音乐。

Actor.RunActSound 2397–2426 的普通、重击、大幅与四种专属近战均在零基 frame2 播武器声，攻杀另分男130/女131，刺杀132、半月133、烈火137。sound.lst 把这些编号映射到 m7-1.wav、m7-2.wav、m12-1.wav、m25-1.wav、m26-3.wav，编号不能直接当作 WAV 文件名。武器 feature byte 除2后按 Actor2253–2261 分组，对应50–57.wav。挖矿重击保留零基 frame5 的91.wav与原碎屑触发。

DXSounds.TSoundEngine.EffectWave 1852–1880 创建独立缓冲，Timer1905–1914 回收结束缓冲，Clear1818–1824 清空全部。本批使用独立 HTMLAudioElement voices，结束与媒体错误回收；并发数未增加参考源码没有规定的硬上限。

自身预测只播正常武器声。实际 SM 与当前 actionId 匹配后可以接专属声；同 frame2 确认时只补专属声，不重复武器声，超过该帧不重放过去的冲击。真实服务端攻击种类决定剑光和声效，技能开关与接受 ACK 均不会自行生成专属声。

## Web 生命周期与明确适配

ClassicAuth 的登录、选角、创建、进入世界切换驱动 AudioPhase。重复场景不重启背景音乐；死亡、换图与断线清除在途声音，旧异步 play 完成不复活已清除音轨。静音保存现有偏好并清声，恢复后仅恢复当前场景背景声。

浏览器 autoplay 拒绝后，可信 pointerdown/keydown 只重试当前背景声；过去的一次性效果不排队补播。失焦、隐藏与 pagehide 暂停背景声并清除一次性声；可见与重新获得焦点时续播当前背景声。这属于 Web 适配，尚无目标原端运行证明。现有单个开关同时控制音乐与效果，原版独立选项 UI 仍待复刻。

默认全音量映射参考默认 DirectSound 0衰减；移动、受击等现有调用的显式音量尚未逐场景核对。地图背景声、game over2 与 Field2 的实际触发没有从仅有常量推断；本机包也没有 Field2 文件，继续保留缺口。

## 验证范围

`tests/audio_playback_regression.mjs` 执行生产 GameAudio 与实际 ClassicAuth/play 回调，覆盖场景、并发回收、静音、过期异步、autoplay、媒体错误、焦点、销毁和近战文件选择。使用 fake media/events，不是浏览器实际声音输出。原 WAV 字节与资源副本核验由 `tools/validate-native-audio.py` 记录；真实浏览器听音、目标原端混音及动态对照单独验收。
