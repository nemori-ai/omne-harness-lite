# docs

本目录承载 `@omne-harness/session-contract` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows/`、`object-model/`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。`flows/` 与 `object-model/` 已是目录。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的条款编号或标题改变时，同步本目录里指向条款的链接。

## 本包事实

六个固定专题都有正文，没有按需专题。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [architecture.md](architecture.md) | 依赖方向、值与行为的归属、当前设计限制 |
| [flows/](flows/README.md) | 跨成员的业务与数据流，失败分支，生命周期与验证入口 |
| [object-model/](object-model/README.md) | 对象与生命周期、日志事件目录、状态转移与归约 |
| [public-api.md](public-api.md) | 候选定义与导出索引，现有导出为空 |
| [context.md](context.md) | 各类消费者的使用顺序、换代与控制、系统定位 |
| [cordis.md](cordis.md) | 本成员没有 Cordis 入口的理由，以及 Cordis 相关责任所在的成员 |

当前缺口：SPEC 点名的类型、四个面、端口、领域服务与 `reduce` 都不在 `src/` 里，见[公开接口页](public-api.md)。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
