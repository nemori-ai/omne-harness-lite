# 统一 model runtime service 的真实交互验收

2026-09-28，主线执行的有限验收。正常路径源码 `1b2a6a0b`，其中产品源码最后修订 `776989fd`；Node v24.18.0。精确命令、显式余量、96份源码/锁文件摘要见 [inputs](inputs.json)，原始输出清单见 [manifest](manifest.json)。这是 demo 消费统一 service 的实测，不是独立 QA、完整十三操作或37模型认证。

## 实际结果

[成功 run](success/result.json)通过真实 PTY 向固定 DeepSeek V4 Pro-0813／OpenRouter／DeepInfra fp8 发出三次请求：同进程两轮，正常退出后重开第三轮。三次均答回历史中的 ORCHID-742；每轮回复与响应体同批持久化，重开后仍能读回上下文。终端见[首进程](success/terminal-first.json)和[重开进程](success/terminal-reopened.json)，逐轮 durable JSON 保存原响应及账。

三次上游实际费用分别为 USD 0.0001352、0.0001833、0.0002262，合计 **0.0005447**，已写入原唯一预算账本。tokenMargin 显式为 multiplier=1.1、reserveTokens=256；估算不代替实际账。缓存读取均为上游返回的0，本次没有证明 prefix cache 命中。PTY 分块记录证明可观察输出；流结束前内容可见的因果门由本地受控 TLS 测试单独覆盖，不能从终端 chunk 数反推 token 数。

此前一次同版本产品调用收到上游429，CLI记下失败响应后退出、未自动重试。保留[原失败终端](upstream-429/turn-1-failure.json)、[耐久值有限投影](upstream-429/durable-projection.json)和[generation查询404](upstream-429/generation-query.json)。费用仍未知；[维护凭证](upstream-429/budget-hold.json)保留原预算占用 USD1.3658112，不写actualUsd、不将费用当0。约八分钟后由主线显式启动上述新run；demo本身没有重试或路由回退。

## 本地验证与边界

当前demo [build](demo-current-recovery-build.log)、[typecheck](demo-current-recovery-typecheck.log)、[20文件85项测试](demo-current-recovery-tests.log)通过，runtime [build](recovery-facts-build.log)、[typecheck](recovery-facts-typecheck.log)、[43文件628项测试](recovery-facts-tests.log)通过。demo旧直接调用入口已删除，CLI由真实认证会话组合统一service；本地场景含受控TLS、跨租户拒绝、锚点先于可见内容、多轮重开、停止及未知JSONL回执，范围按原测试读取。

未验证真实崩溃恢复、L1/L2交接、withRun、全部十三操作、模型切换、工具执行、多模态或其他36模型；恢复未知任务留存增补的后续源码尚未进入本run。测试成功不证明任意输入计数精确。

复跑使用 [runner原件](runner.mjs.txt) 与 [money辅助](money.mjs.txt)，还原到 inputs 中的路径，按锁文件构建，再提供自己的私有凭据文件和既有授权账本。此命令实际计费，不可另建账本绕过预算。API密钥、签名私钥、凭据副本密钥和SQLite库不在此包；失败耐久原文仅以本地hash定位，公开投影明示非原文。本文未声称独立验收或最终交付签收。
