# 产品包的目标维护入口

本树按[产品包组织](../docs/package-organization.md)维护目标能力组、具名成员的规格与设计文档。源码、成员 manifest 和运行支持尚未建立；文档目录不是 workspace 成员。领域责任从[领域设计](../docs/domains/README.md)进入，组与成员文档按[成员文档规范](../docs/member-documentation.md)维护。

## 目标能力组

| 能力组 | 责任 | 具名目标成员 |
| --- | --- | --- |
| [access](access/README.md) | 系统接入 | `public-contract`, `sdk`, `server-entry` |
| [identity](identity/README.md) | 身份与授权 | `identity`, `authorization` |
| [assets](assets/README.md) | 资产与规则 | `assets`, `settings`, `permissions` |
| [workspace](workspace/README.md) | 工作区 | `workspace` |
| [session](session/README.md) | 会话与工作 | `session` |
| [assembly](assembly/README.md) | 装配交接 | `assembly` |
| [agent](agent/README.md) | Agent推进 | `agent` |
| [model](model/README.md) | 模型调用 | `model` |
| [tool](tool/README.md) | 工具执行 | `tool` |
| [context](context/README.md) | Runtime Context | `runtime-context`, `request-context` |
| [human-intervention](human-intervention/README.md) | 人工介入 | `human-intervention` |
| [execution](execution/README.md) | 执行环境 | `execution-environment` |
| [calendar](calendar/README.md) | 日历 | `calendar` |
| [schedule](schedule/README.md) | 日程与Job | `schedule` |
| [notification](notification/README.md) | 通知 | `notification` |
| [slash-command](slash-command/README.md) | Slash Command | 待具名 |
| [skills](skills/README.md) | Skill | 待具名 |
| [mcp](mcp/README.md) | MCP | 待具名 |
| [storage](storage/README.md) | 存储 | 待具名 |
| [time](time/README.md) | 时间 | 待具名 |
| [telemetry](telemetry/README.md) | 遥测 | 待具名 |
| [common](common/README.md) | 共同纯表示 | `json-text`, `legal-identity`, `utc-instant`, `content-block`, `message`, `stream-arrival` |
| [util](util/README.md) | 纯文本格式化 | `unix-format`, `xml-format` |

## 阅读与维护

先按责任进入组入口，再定位目标成员。表中名称不授予建包或采用资格；普通新增包仍须具名消费者、已接受公开承诺及真实实施任务。SPEC完整表达持续行为，内部设计解释实现机制，二者不复制领域与系统正文。未来新增组与成员沿[扩展指导](../docs/domains/extending-the-system.md)及包组织规则。

组登记维护必要文件与章节。已落位的规格和设计不再计缺文件；未写目标继续显示缺项。access 的三个目标和 assembly 的目标已有 README、SPEC 与内部设计入口，精确内容仍是占位；它们不是可安装成员。Skill、Slash Command、MCP 的正式成员与行为规格承接仍未确定，组入口保留这一缺项。inventory 只观察登记文件与章节，不能判断成员归属；承接状态另按具名拥有者核对。没有 package.json 的文档目标不算 workspace 成员。time 和 telemetry 是条件性位置，成员未定；预留目录不授予准入。common 已有 `json-text`、`legal-identity`、`utc-instant`、`content-block`、`message` 和 `stream-arrival`。

## 旧实现及工具依赖

旧实现保持于[packages.0.0.1.legacy](../packages.0.0.1.legacy/README.md)。现有开发工具仍可依赖这些显式登记的legacy成员。它们不属于本树的新实现，不构成目标架构符合证据。新增实现必须遵循docs已接受要求和架构，不继承旧布局政策。
