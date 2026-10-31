# docs

本目录承载 `@omne-harness/execution-environment` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的章节改名时，同步本目录里指向 SPEC 章节的链接。

## 本包事实

六个固定专题都有正文，没有按需专题。本成员是 `module` 变体，`cordis.md` 写明不适用的理由，在 `documentation.json` 里记为 `not-applicable`。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [architecture.md](architecture.md) | 六个模块、包外依赖、十一条关键机制的理由、模块层的 SOLID 选择 |
| [flows.md](flows.md) | F-EER01 落点到租约、F-EER02 设施操作过门、F-EER03 释放与重试、F-EER04 作用域释放与恢复、F-EER05 退役与关闭、F-EER06 丢失答复与原获取查询 |
| [object-model.md](object-model.md) | 表的条目、获取记录、租约视图与实例的生灭 |
| [public-api.md](public-api.md) | 根入口的四个导出与 `EnvironmentRegistry` 的方法 |
| [context.md](context.md) | 经 Cordis 使用、独立使用、调用方要提供的端口与定位 |
| [cordis.md](cordis.md) | 不适用 Cordis 集成的理由 |

当前缺口：SPEC [明确缺项](../SPEC.md#明确缺项)的各项。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
