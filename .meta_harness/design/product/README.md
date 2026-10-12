# 产品设计入口

本区维护产品需求、关键用户旅程、能力定义与实现状态，以及版本阶段的支持承诺和有效未决。系统以 Harness 框架提供可配置、可组合、可扩展的能力。产品设计服从[项目要求](../../../docs/requirements.md)、[系统架构](../../../docs/architecture/README.md)及适用工程约定。

## 正文与采用状态

下表直接进入正式维护位置。每份正文保留四块，依次为产品需求描述、能力定义与实现状态记录表、阶段与版本支持承诺、未决问题与待定事项。关键旅程在需求块展开；技术问题在末块说明使用者后果，并链接唯一技术拥有者。

已明确的产品及阶段决定继续有效，整体待审范围见各 topic 入口。正式落位、产品接受、技术采用、实现支持和验证通过分别判断。身份、资产及会话的已定阶段保持，其他正文中尚待选择的阶段范围由负责人决定。

## 产品阅读地图

| 产品问题 | 当前未决 | 领域关系 | 工程拥有者 |
| --- | --- | --- | --- |
| [身份与授权](identity-and-authorization/design.md) | [未决](identity-and-authorization/design.md#未决问题与待定事项) | [领域](../../../docs/domains/identity-and-authorization/README.md) | [工程与规格](../../../packages/identity/README.md) |
| [资产与规则](assets-and-rules/design.md) | [未决](assets-and-rules/design.md#未决问题与待定事项) | [领域](../../../docs/domains/assets-and-rules/README.md) | [工程与规格](../../../packages/assets/README.md) |
| [会话与工作的产品设计](sessions-and-work/design.md) | [未决](sessions-and-work/design.md#未决问题与待定事项) | [领域](../../../docs/domains/sessions-and-work/README.md) | [工程与规格](../../../packages/session/README.md) |
| [Agent 定义与工作推进](agent-progression/design.md) | [未决](agent-progression/design.md#未决问题与待定事项) | [领域](../../../docs/domains/agent-progression/README.md) | [工程与规格](../../../packages/agent/README.md) |
| [模型调用的产品设计](model-invocation/design.md) | [未决](model-invocation/design.md#未决问题与待定事项) | [领域](../../../docs/domains/model-invocation/README.md) | [工程与规格](../../../packages/model/README.md) |
| [工具执行](tool-execution/design.md) | [未决](tool-execution/design.md#未决问题与待定事项) | [领域](../../../docs/domains/tool-execution/README.md) | [工程与规格](../../../packages/tool/README.md) |
| [运行感知与一次模型请求](runtime-context/design.md) | [未决](runtime-context/design.md#未决问题与待定事项) | [领域](../../../docs/domains/runtime-context/README.md) | [工程与规格](../../../packages/context/README.md) |
| [工作区产品设计](workspaces/design.md) | [未决](workspaces/design.md#未决问题与待定事项) | [领域](../../../docs/domains/workspaces/README.md) | [工程与规格](../../../packages/workspace/README.md) |
| [执行环境产品设计](execution-environments/design.md) | [未决](execution-environments/design.md#未决问题与待定事项) | [领域](../../../docs/domains/execution-environments/README.md) | [工程与规格](../../../packages/execution/README.md) |
| [Skill产品设计](skills/design.md) | [未决](skills/design.md#未决问题与待定事项) | [领域](../../../docs/domains/skills/README.md) | [工程与规格](../../../packages/skills/README.md) |
| [Slash Command产品设计](slash-commands/design.md) | [未决](slash-commands/design.md#未决问题与待定事项) | [领域](../../../docs/domains/slash-commands/README.md) | [工程与规格](../../../packages/slash-command/README.md) |
| [MCP产品设计](mcp/design.md) | [未决](mcp/design.md#未决问题与待定事项) | [领域](../../../docs/domains/mcp/README.md) | [工程与规格](../../../packages/mcp/README.md) |
| [人在回路产品设计](human-intervention/design.md) | [未决](human-intervention/design.md#未决问题与待定事项) | [领域](../../../docs/domains/human-intervention/README.md) | [工程与规格](../../../packages/human-intervention/README.md) |
| [日历产品设计](calendars/design.md) | [未决](calendars/design.md#未决问题与待定事项) | [领域](../../../docs/domains/calendars/README.md) | [工程与规格](../../../packages/calendar/README.md) |
| [通知产品候选](notifications/design.md) | [未决](notifications/design.md#未决问题与待定事项) | [领域](../../../docs/domains/notifications/README.md) | [工程与规格](../../../packages/notification/README.md) |
| [日程与作业产品候选](schedules-and-jobs/design.md) | [未决](schedules-and-jobs/design.md#未决问题与待定事项) | [领域](../../../docs/domains/schedules-and-jobs/README.md) | [工程与规格](../../../packages/schedule/README.md) |

Skill、Slash Command、MCP 的工程分解已维护在对应能力组，完整行为候选尚未分配正式成员。其产品末块与组入口继续显示承接缺项，不以组根 SPEC 或空包替代。

## 旧PF与点位来源

旧 PF 原文封存在 [product.0.0.1.legacy](../product.0.0.1.legacy/README.md)，不作为本表正文的并列现行源。原始点位按封存入口及各 topic 维护的来源引用核对；原坐标、哈希和评审快照只证明各自历史范围。尚未承接的 PF 内容由后续专项处理，不据旧源补项目要求或改写已接受架构。

## 维护路径

topic 按独立产品问题、读者和变化原因组织，不要求与工程能力组一一对应。新 topic 使用[模板](.templates/topic/README.md)。产品拥有者维护需求、旅程、能力、阶段和未决；实现拥有者依据绑定版本与覆盖的证据维护状态。配置范围、生效条件、领域职责和阶段版本写明确，没有实现证据时记录未核实。

起草沿 `product-design`。写前加载 `asd-ste100`、`pstack:technical-writing`、`pstack:unslop`，写后按实际正文复核。概念沿[统一语言](../ubiquitous_language/README.md)，有身份的对象沿[领域对象](../domain_objects/README.md)。已答问题落实正文并退出活动问题；原问答与评审留任务 tmp。技术细节在所属组或成员维护，产品末块保留必要影响与跳转。

活动交付按[agent交付操作](../../../docs/engineering/agent-delivery.md)，正式提案从[RFC入口](../../../docs/rfcs/README.md)进入。长期规格承载当前决定版行为，不以单次任务材料替代；本区不保存过程账本或第二份技术契约。

## 未决问题与待定事项

跨产品来源尚无完整现行拥有位置时，在本节登记承接待办。专题已有的产品政策与阶段决定由各自正文维护，本节不代选新的业务规则。

<a id="product-e01"></a>
### PRODUCT-E01 发生与记录条目的跨产品承接

本项为来源承接待办。发生的事是否留下记录、条目性质、可见性、推进依据、干预力及寿命归属的共同产品范围尚未完整分配到现行正文。各业务事实仍由实际领域拥有者负责，本页只登记共同来源的承接缺项，不取得这些领域的业务所有权。

产品维护者须会同 Agent、Session、消息及各产生记录的领域逐项核对责任，确认唯一正文和仍缺的采用依据。具体产品拥有位置及完整承接范围仍待确定。它影响跨系统约定与扩展记录来源的完整对账，不阻止有明确现行承诺的分支继续设计；不能据此采用统一事件流、选择字段或保留策略，也不重新裁定已接受架构。

[封存来源](../product.0.0.1.legacy/PF-000-occurrences-and-record-entries/design.md)只用于核对引用范围与原始依据，不作为并列现行产品规则，也不表示完整旧 PF 已接受或已承接。

<a id="product-e02"></a>
### PRODUCT-E02 治理中心秘密处理的产品承接

本项为来源承接待办。治理中心秘密呈现、持久数据和备份暴露的产品责任尚未完整落位，具名应用产品正文及实际承接成员仍待确定。本项只登记数据保护入口引用的范围，不将整个治理中心产品责任交给身份或模型领域。

应用交付与部署产品维护者须会同身份、Model 及数据保护拥有者核对产品输出、持久表示、部署密钥生成交付的例外与原始数据及备份中的可读范围。未闭合来源限制完整产品承接的声明，不授予运维者账号治理或秘密读取通道，不将产品不呈现解释为静态数据不可读，也不重开已有取舍。已接受的[数据保护与隐私架构](../../../docs/architecture/security/data-and-privacy.md)继续有效。

[封存来源](../product.0.0.1.legacy/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)只用于核对引用范围与原始依据，不作为并列现行产品规则，也不表示完整旧 PF 已接受或已承接。
