# docs

本目录承载 `@omne-harness/session-adapters` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

唯一的行为正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。会话的命令与条款归 [session-contract SPEC](../../session-contract/SPEC.md)，邻域的操作归各邻域契约。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的插件编号（AD）、缺口编号（NP）或验证编号（VA）改变时，同步本目录里引用这些编号的地方。

## 本包事实

本成员是 `cordis-module` 变体。SPEC 是核心页，本目录的专题按插件编号组织。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [architecture.md](architecture.md) | 为什么只有本成员导入邻域契约、边界、模块、关键机制与 SOLID 选择 |
| [flows.md](flows.md) | 每个插件一条流程，以及共同的失败与生命周期 |
| [object-model.md](object-model.md) | 插件、端口实现与翻译函数三类运行对象；身份对应 |
| [public-api.md](public-api.md) | 两个入口。现有导出为空，随实现进入的导出单列 |
| [context.md](context.md) | 装配步骤、消费者与定位 |
| [cordis.md](cordis.md) | 每个插件的 `inject`、提供的键、登记与撤除、依赖换代、配置与 IC 符合性 |

当前缺口：两个入口都没有源码。八项具名缺口见 [SPEC](../SPEC.md#具名前提与明确缺项)。具名维护者由负责人指定，见[组入口](../../README.md)。
