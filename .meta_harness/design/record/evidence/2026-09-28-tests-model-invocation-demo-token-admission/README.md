# 显式 token 估算余量后的真实多轮调用

2026-09-28，主线实际执行的有限验收；不是独立 QA 或完整纵线签收。源码 `52314aaf0a26db273cf2364838ddb7a226ac8931`，Node 24.18.0；[输入与源码哈希](demo-paid-multiturn/inputs.json)、[runner 原件](demo-paid-multiturn/runner.mjs.txt)、[逐文件清单](demo-paid-multiturn/manifest.json)。采用 [D101](../../decisions/model-token-estimate-adoption/decision.md) 的 MP6／RT8 计量政策。

[实际结果](demo-paid-multiturn/result.json)：DeepSeek V4 Pro-0813 经 OpenRouter 固定 DeepInfra fp8，无回退或自动重试。CLI 显式传入 multiplier=1.1、reserveTokens=256，官方固定 tokenizer 的估算经过余量与项目上限检查。真实 PTY 同进程两轮，正常关闭再重开第三轮；三次均保持前文 ORCHID-742，回复与响应体同批写入 JSONL，终端显示累计用量和费用。原始输出见[首进程](demo-paid-multiturn/terminal-first.json)和[重开](demo-paid-multiturn/terminal-reopened.json)。终端增量记录不等于模型 token 数。

三轮上游实际费用 USD 0.0001508、0.0001729、0.0004316，合计 **0.0007553**，均记入原唯一预算账本；未将历史未知费用改成零。估算输入没有被当作实际 usage 或账单。缓存统计仅保留上游原值，本次不作 prefix cache 命中认证。

本例[构建](demo-paid-multiturn/demo-current-final-build.log)、[类型检查](demo-paid-multiturn/demo-current-typecheck-2.log)和[15 文件／80 项本地测试](demo-paid-multiturn/demo-current-tests.log)通过。本地测试使用受控 TLS，付费三轮另有[原命令结果](demo-paid-multiturn/demo-current-paid.log)。未注入崩溃／磁盘故障，未覆盖其余36模型、完整十三操作服务、withRun、自动恢复、模型切换或多模态发送；不是计数等于上游的保证或形式证明。

复跑须检出上述源码、按锁文件构建，将 runner 原件放回 `tmp/model-request-runtime/demo-paid-multiturn-rt8.mjs`，money 原件放回 `tmp/model-request-runtime/m1-real/artifact/money.mjs`，显式提供自己的私有凭据文件。runner 使用已有、已授权的唯一预算账本（总额100美元），会实际计费并创建新的私有会话目录；不能建立替代账本绕过预算。凭据、账号口令、签名与副本密钥、SQLite 原文件均不入此证据包。
