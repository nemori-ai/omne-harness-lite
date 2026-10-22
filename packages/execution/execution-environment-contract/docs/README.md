# docs

本目录承载 `@omne-harness/execution-environment-contract` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。

SPEC 点名由本目录承载三项内容：

- 设施协议的规则归 [SPEC](../SPEC.md#设施协议)，逐设施的展开与理由在 [architecture.md](architecture.md#设施协议)。
- 技术后续设计与来源缺项归 [architecture.md](architecture.md#技术后续设计与来源缺项)。
- Tool 契约的适配映射归 [context.md](context.md#邻域交接)。

专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的条款编号或标题改变时，同步本目录里指向条款的链接。产品正文的 Q-EE02 至 Q-EE06 链接到 `architecture.md`，改那一节的小节标题时同步产品正文。

## 本包事实

六个固定专题都有正文，没有按需专题。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [architecture.md](architecture.md) | 源模块、包外依赖、关键机制的理由、三个核心设施的协议、模块层的 SOLID 选择、Q-EE02 至 Q-EE06 |
| [flows.md](flows.md) | F-EEC01 至 F-EEC09 九条协议级流程，以及共用的失败与生命周期规则 |
| [object-model.md](object-model.md) | 角色、对象的身份与关系、获取、受管资源与设施请求的状态 |
| [public-api.md](public-api.md) | 全部导出的索引，工具环境声明的 schema 与采用身份，两条块声明 |
| [context.md](context.md) | 独立消费与经集成方消费、提供者与设施拥有者的做法、三个端口、邻域交接与 Tool 契约的适配映射 |
| [cordis.md](cordis.md) | 本成员不适用 Cordis 集成的理由，在 `documentation.json` 里记为 `not-applicable` |

三面八操作 schema 与 `./testing` 套件已实现。设施自身逐操作 schema、块发布与生产者读口仍留后续，见 SPEC 的[明确缺项](../SPEC.md#明确缺项)。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
