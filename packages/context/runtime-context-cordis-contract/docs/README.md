# docs

本目录承载 `@omne-harness/runtime-context-cordis-contract` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的性质编号改变时，同步本目录里引用性质编号的地方。

## 本包事实

六个固定专题都有正文，没有按需专题。本成员是 `service-contract` 变体，`cordis.md` 是核心页。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [cordis.md](cordis.md) | 服务定义、intercept 配置、事件、依赖分类、登记与撤除协议、IC 符合性映射、机制读数与假设 |
| [architecture.md](architecture.md) | 两个入口、包外依赖、四条关键机制的理由、模块层的 SOLID 选择 |
| [flows.md](flows.md) | F-RCD01 生产者登记与撤除、F-RCD02 唤醒按作用域过滤 |
| [object-model.md](object-model.md) | 三个技术对象。领域对象指向契约的对象模型 |
| [public-api.md](public-api.md) | 两个入口。现有导出为空，随实现进入的导出单列 |
| [context.md](context.md) | 各类依赖方的用法与定位 |

当前缺口：两个入口都没有源码。监听者标记作用域所用的属性键已定为 `scope`，见 [Cordis 说明的事件](cordis.md#事件)。三条机制读数还没有进入 basis。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
