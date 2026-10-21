# docs

本目录承载 `@omne-harness/request-context-contract` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的条款编号或标题改变时，同步本目录里指向条款的链接。组的[协作入口](../../docs/key-flows.md)引用本目录的 F-RQ01 至 F-RQ03，流程编号改变时一并同步。

## 本包事实

六个固定专题都有正文，没有按需专题。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [architecture.md](architecture.md) | 根入口的十个模块、包外依赖、六条关键机制的理由、模块层的 SOLID 选择 |
| [flows.md](flows.md) | F-RQ01 至 F-RQ06 六条协议级流程，以及共用的失败与生命周期规则 |
| [object-model.md](object-model.md) | 对象的身份、拥有者、生命周期、状态与对象层的 SOLID 选择 |
| [public-api.md](public-api.md) | 导出入口，以及随实现进入的值类型、纯操作、端口与常量索引 |
| [context.md](context.md) | 独立消费与托管消费、邻域交接、协调者端口的字段对应、适配方案与上层页面指针 |
| [cordis.md](cordis.md) | 本成员不适用 Cordis 集成的理由，在 `documentation.json` 里记为 `not-applicable` |

当前缺口：SPEC 点名的全部类型与操作都还不在 `src/` 里，见[公开接口页](public-api.md#随实现进入的导出)。字段对应里有几项两边对不上，见[对不上的字段](context.md#对不上的字段)。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
