# docs

本目录承载 `@omne-harness/session-storage-sql` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的章节标题或条款编号改变时，同步本目录里指向它的链接。

## 本包事实

六个固定专题都有正文，没有按需专题。

| 专题 | 本包里承载什么 |
| --- | --- |
| [architecture.md](architecture.md) | 七个模块、依赖方向、六条关键机制的理由、SOLID 选择、设计限制、验证与维护规则 |
| [flows.md](flows.md) | 两条写路径、压缩提交、epoch 视图读取、派生重建的时序，以及失败与生命周期 |
| [object-model.md](object-model.md) | 权威表、派生索引、进程内对象、领域类型到列的对应、生命周期 |
| [public-api.md](public-api.md) | 两个入口。现有导出为空，候选导出与配置随实现进入 |
| [context.md](context.md) | 装配选用、独立使用、初始化与释放，以及消费者与定位 |
| [cordis.md](cordis.md) | 插件提供服务键 `sessionTransactions`、依赖与配置、加载与组合登记、撤除、IC 符合性 |

当前缺口：`src/` 没有任何实现，SPEC 的义务都没有测试。存储契约没有可依赖的 workspace 成员，SPEC 的 XP-1 至 XP-6 是缺项，见 [Cordis 集成的尚未固定的事项](cordis.md#尚未固定的事项)。具名维护者由负责人指定，见[组入口](../../README.md)。
