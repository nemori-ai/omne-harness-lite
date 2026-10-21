# docs

本目录承载 `@omne-harness/session-cordis-contract` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

唯一的行为正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、领域行为条款或系统架构。领域行为归 [session-contract SPEC](../../session-contract/SPEC.md)。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的性质编号改变时，同步本目录里引用性质编号的地方。

## 本包事实

本成员是 `service-contract` 变体，`cordis.md` 是核心页，其余页只说明本成员在各专题上的范围并指向拥有者。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [cordis.md](cordis.md) | 服务定义、intercept 配置、端口服务键、事件、依赖分类、IC 符合性映射、机制读数与假设 |
| [architecture.md](architecture.md) | 两个入口、包外依赖、关键选择的理由、模块层的 SOLID 选择 |
| [context.md](context.md) | 谁安装本成员、各类依赖方的用法与定位 |
| [flows.md](flows.md) | 不适用：本成员没有自己的流程。写明理由并指向流程的拥有者 |
| [object-model.md](object-model.md) | 不适用：本成员没有领域对象。指向领域对象的拥有者 |
| [public-api.md](public-api.md) | 两个入口。现有导出为空，随实现进入的导出单列 |

当前缺口：两个入口都没有源码。intercept 配置的机制读数还只有源码读数，见 [Cordis 说明](cordis.md#机制读数与假设)。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
