# docs

本目录承载 `@omne-harness/runtime-context` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的章节标题改变时，同步本目录里指向它的链接。

## 本包事实

六个固定专题都有正文，没有按需专题。本成员是组内「供给机制与缓存」主题的唯一拥有者，`architecture.md` 承载这一主题。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [architecture.md](architecture.md) | 六个模块、包外依赖、七条关键机制的理由、模块层的 SOLID 选择 |
| [flows.md](flows.md) | F-RCI01 至 F-RCI05 五条机制流程，以及共用的失败与生命周期规则 |
| [object-model.md](object-model.md) | 表的条目、观察链、读者游标与机制实例的身份与生灭 |
| [public-api.md](public-api.md) | 根入口。现有导出为空，工厂、实例与配置随实现进入 |
| [context.md](context.md) | 经 Cordis 使用与独立使用两条路径，以及定位 |
| [cordis.md](cordis.md) | 本成员不适用 Cordis 集成的理由，在 `documentation.json` 里记为 `not-applicable` |

当前缺口：工厂与全部机制都还没有进入 `src/`。SPEC 的持续验证场景都没有测试。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
