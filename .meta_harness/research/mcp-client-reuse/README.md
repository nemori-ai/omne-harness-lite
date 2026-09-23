# MCP 客户端能不能「原则上直接复用」：DSH mcp-client 与 Codex rmcp-client 对照产品要求

本项目产品正文把 [MCP](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp)
定成一类资产：**接入点是资产，它带来的动作不是**，动作随接入点一起被持有、配置与授权，
对端漂移不是故障。本调查要区分的是：两份现成客户端的对象模型里，**哪些做法直接承载得住这些要求，
哪些要改，哪些在结构上承载不了，哪些根本没覆盖**；以及「直接复用 DSH 的包」实际会连带进来什么。

主参照是 DSH 的 `@deepseek-ai/dsh-mcp-client`（TypeScript，可被 fork 复用）；
第二参照是 Codex 的 `codex-rmcp-client` 及其会话层（Rust，**只能对形状，不能复用**）。
Pi 明确不做 MCP，不作参照。

- 调查对象与基线：DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`（`@deepseek-ai/dsh-mcp-client@0.1.5-rc.2`，
  `@modelcontextprotocol/sdk` 声明 `^1.12.0`、锁定 `1.29.0`）；Codex `5c5308fc9a9ee789049d646ef11e5400384b9c6f`
  （`codex-rs/{rmcp-client,core/src,protocol,hooks}`，`rmcp` 版本在钉住的归档里取不到）；
  Codex 官方文档离线副本 2026-09-20 抓取。全部取自主检出 `tmp/sources/`，2026-09-23 取证。
- 第二轮（2026-09-23）：产品负责人裁定走「官方 SDK 上自写薄桥」后，追加看同行**在 SDK 之上额外封装了什么、自己记下了什么坑、带进来哪些依赖**。
  对象：DSH `c291e796`（补读决策记录）、pi `3390bd9`（核实本体不做 MCP）、pi 生态第三方 `pi-mcp-adapter@2.37.0`、Codex 同 commit 的 `codex-mcp` 与 `Cargo.lock`（补首轮缺件）、
  LangChain Python `52a4535f` 与 JS `@langchain/mcp-adapters` 1.1.4、OpenAI Agents Python `32edd3c3`、Vercel `@ai-sdk/mcp` 2.0.56、Claude Agent SDK 与 Claude Code `2.1.280` 文档及 CHANGELOG；
  远程源均记精确 commit 或发布版本。只给事实与「撞上会怎样」，不给推荐。
- 消费者：提案 [MCP 客户端采用](../../design/record/proposals/mcp-client-adoption/README.md)（首轮读数已被其 design.md 与 alternatives.md 引用；第二轮待其作者处置）。
- 最近核对：2026-09-23（首轮）；2026-09-23（第二轮，见 [changelog](changelog.md) rev 1）。

## 准入核对

精确版本、取得方式、每条观察的 `路径:行号` 与来源立场在 [证据记录](evidence.md)。
本轮有四处必须随结论一起传下去的限制：

- **两源都是单用户系统**。DSH 的连接挂在 Cordis 插件作用域上，Codex 的凭据挂在本机钥匙串上；
  本轮证据**不支持**任何「多租户下 MCP 连接与凭据该怎么分」的正面结论，只能说两源**没有**这个维度。
- **Codex 的连接管理层 `codex_mcp` crate 不在钉住的归档里**（只有 `rmcp-client` 与 `core/src`
  对它的调用面）。凡涉及「服务起不来时它的工具在不在目录里」「目录缓存怎么失效」的 Codex 说法，
  都是从调用面与配置文档推断，**已在正文逐条标注**。
- **官方 SDK 的版本事实只取自两源的 manifest 与 lockfile，没有上网**。DSH 所锁 SDK `1.29.0`
  支持哪些 MCP 协议版本，钉住的源里没有答案（`node_modules` 不在归档中）。
- 产品正文是对照输入，不是本调查的来源证据；引用处标了 rev。

本家族不拥有方案选择：结论只写到「这条事实让什么变得不可能、什么要额外付出代价」为止，
**不写建议采用哪一份**。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么（含产品条款 × 两源对照表） | [研究正文](research.md) |
| 来源、行号与来源立场是否可复核 | [证据记录](evidence.md) |
| 首轮逐行论证、失败的推断与未取得的来源 | [2026-09-23 报告](reports/2026-09-23-mcp-client-reuse.md) |
| 同行在 SDK 之上加了什么、踩过什么坑、依赖总表（第二轮） | [研究正文第二轮一节](research.md#第二轮同行封装的借鉴与依赖)；逐源与逐主题论证见 [第二轮报告](reports/2026-09-23-round2-wrapper-lessons.md) |
| 结论为什么变成现在这样 | [changelog](changelog.md) |

只读研究正文就知道当前该信什么；要追某一格为什么判成「需改」而不是「可承载」时，展开报告。
