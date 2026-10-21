# docs

本目录承载 `@omne-harness/runtime-context-cordis` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的性质编号改变时，同步本目录里引用性质编号的地方。

## 本包事实

六个固定专题都有正文，没有按需专题。本成员是 `service-provider` 变体，也是组内「Service 实现、撤除与资源清理」主题的唯一拥有者，`cordis.md` 是核心页。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [cordis.md](cordis.md) | 插件与服务、配置、isolate 绑定、消费者类读取、生产者登记、唤醒、撤除顺序、存储端口缺席、IC 符合性映射、验证义务 |
| [architecture.md](architecture.md) | 两个入口、四个模块、包外依赖、四条关键机制的理由、模块层的 SOLID 选择 |
| [flows.md](flows.md) | F-RCP01 装载与卸载、F-RCP02 生产者插件卸载后登记撤除、F-RCP03 唤醒到达作用域监听者 |
| [object-model.md](object-model.md) | 服务实例与插件配置。领域对象与机制对象指向各自拥有者 |
| [public-api.md](public-api.md) | 两个入口。现有导出为空，随实现进入的导出单列 |
| [context.md](context.md) | 装配与独立使用两条路径，以及定位 |

当前缺口：两个入口都没有源码。机制实例通知投影变化的方式还没有定义。监听者的作用域标记键（`scope`，由 runtime-context-cordis-contract 定义）与根入口工厂的分工（只重导出机制工厂）已在 SPEC 写定。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
