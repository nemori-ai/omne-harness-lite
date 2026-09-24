# 主流 AI 助手产品里与「连接件」相近的功能：完整产品设计是什么样

以 [PF-002 §4 Connector](../../design/product/PF-002-assets-settings-and-permissions/design.md#connector) 与候选契约
`data.connector` v1（随本程规格批次入库，坐标见[身份清单](../../design/registry/README.md)）定义的连接件（唯一方向朝里、无读取面无管理面、带身份鉴权、
来源标识／投递目标／鉴权绑定是持有上的配值）为对照基准，核对 Anthropic 与 OpenAI 两家产品里方向相近的功能怎么设计，
并取 Slack Events API、GitHub Webhooks、Zapier、IFTTT 作为「事件目录 + 订阅」的成熟范式参照。

这项调查要区分三件事：各家叫 connector 的东西**方向是拉还是推**；真正的推型入口**事件长什么样、agent 事先知道什么、订阅由谁配**；
以及这些先例**明确不做什么、要付什么代价**。它能回答产品负责人设想的「连接件声明可订阅的事件类型目录，订阅是持有上的配值，
agent 上下文里有被订阅类型的说明」**有没有先例、先例怎么做、代价是什么**；**不能**回答本项目该不该这样做——那归 record 家族。

- 调查对象与基线：2026-09-24 线上文档。Anthropic：support.claude.com 四篇、claude.com/docs 五页（Connectors、Claude Tag）、code.claude.com 四页（channels、channels-reference、routines、slack）；
  本机 Claude Code `2.1.281`（只记版本，未实测）。OpenAI：learn.chatgpt.com 五页、developers.openai.com 五页；**help.openai.com 五篇与 openai.com 博客本轮全部 HTTP 403，只记待验证命题**。
  参照：docs.slack.dev 三页、docs.github.com 三页、docs.zapier.com 三页、ifttt.com 一页。可钉字节的页面随包保存在 [sources/](sources/)。
- 消费者：PF-002 连接件「事件类型目录与订阅」方向的产品裁决（待出现）；其后的架构读数可引 C-2、C-3、C-7。
- 最近核对：2026-09-24 / 上述线上版本。

## 准入核对

- **对象与版本**：全部是当日线上文档，两家的推型入口都标 research preview／public beta，文档不标发布版本；页内出现的版本 token 集中记在 [evidence.md 头部](evidence.md)，上游升级时 grep。
- **取得方式**：`.md` 直出的页面 `curl` 原样字节钉在 `sources/`（`sha256sum -c SHA256SUMS`）；只有 HTML 的页面去标签后保存，`provenance.json` 逐条标 `normalization`；
  仅经 WebFetch 模型摘要取得的观察在 evidence 里单独标「仅 WebFetch 摘要」。
- **来源立场**：全部为厂商／平台方自述；短板与代价取自各页自己的「不支持」「限制」「Warning」段与协议规则（不 ack、静默丢弃、上限、重新授权），未检索 issue tracker 与第三方批评——这是本轮的已知缺口。
- **局限**：未实测任何一家（含本机 Claude Code）；ChatGPT 事件触发的 payload 形状与模型上下文内容**未述**；OpenAI help center 原文不可访问，OpenAI 侧事实全部改由 learn.chatgpt.com 与 developers.openai.com 承载；
  OpenAI Pulse 没有可引用的第一方原文。负面结论都是「读遍了没找到」级别，未构造反例。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么（含两张对照表与十条结论 C-1～C-10） | [研究正文](research.md) |
| 每条原文出自哪个 URL、怎么抓的、支持到哪 | [证据记录](evidence.md) |
| 原样字节与校验 | [sources/](sources/)（`provenance.json`、`SHA256SUMS`） |

只读研究正文就知道当前该信什么；要核某句原文或某页当时长什么样，再进证据记录与 `sources/`。
