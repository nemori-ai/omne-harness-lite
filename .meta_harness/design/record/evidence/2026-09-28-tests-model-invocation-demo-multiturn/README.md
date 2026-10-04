# 真实终端多轮模型调用（2026-09-28）

本次为主线实际执行的有限验收，不是独立 QA 或完整纵线签收。冻结源码为 `1623a0af83219e78be50b49e9aca065137754b94`；Node 24.18.0。输入、命令脚本原字节及文件哈希见 [inputs](demo-paid-multiturn/inputs.json)、[runner](demo-paid-multiturn/runner.mjs.txt)、[manifest](demo-paid-multiturn/manifest.json)。

真实 CLI 经 PTY 启动，同一进程发送两轮；正常退出，使用同一私有数据目录重新启动，再发第三轮。固定 DeepSeek V4 Pro-0813／DeepInfra fp8，OpenRouter 实际网络，无自动重试或供应商回退。三次均保留先前约定的 `ORCHID-742`，每次回复与模型响应体在同一 JSONL 批次，关闭均为 exit0。终端原输出与增量到达时刻保存在 [首进程](demo-paid-multiturn/terminal-first.json)及[重开进程](demo-paid-multiturn/terminal-reopened.json)。它们记录多次终端增量，不据 chunk 数推断模型 token 个数。

[结果原文](demo-paid-multiturn/result.json)：实际费用分别 USD 0.000078、0.0001911、0.0004238，共 **0.0006929**；第三轮终端累计 input151/output191，缓存读写均0。真实响应中的费用均进入原唯一测试账本；此前一笔历史未知费用仍为未知，以独立预算预留处理，没有改成0或伪造对账。缓存读0不构成命中证据。

复跑需要检出上述提交、按锁文件安装并构建本例依赖，将保存的 runner 原件放回仓库 `tmp/model-request-runtime/demo-paid-multiturn.mjs`，money 原件放回同目录下 `m1-real/artifact/money.mjs`，并显式传入自己的私有环境凭据文件。runner 使用已存在、已授权的唯一预算账本；不要为绕过限额建立替代账本。每次复跑会实际计费并创建新的私有会话目录。凭据、签名密钥、副本密钥、账号口令和 SQLite 文件不在此证据包中。

范围只有固定首模型的文本、多轮、实际流式交互、关闭重开、耐久同批与累计账单。没有注入进程崩溃／磁盘故障；未覆盖37模型、十三操作完整服务、图片／视频／音频、模型切换、工具执行或 TTL 到期。相关失败和多轮受控回归另有原测试；本次没有运行形式工具。
