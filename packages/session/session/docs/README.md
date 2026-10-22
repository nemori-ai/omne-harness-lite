# docs

本目录承载 `@omne-harness/session` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture/`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的章节标题改变时，同步本目录里指向它的链接。

## 本包事实

六个固定专题都有正文，没有按需专题。`architecture` 已升级为目录，含 `README.md`、`index.md` 与 `mechanisms.md`。本成员是会话组里「治理机制」主题的拥有者，`architecture/` 承载这一主题。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [architecture/](architecture/README.md) | 模块与状态责任、与 Agent Loop 的分界、设计理由、SOLID 选择、包与安装边界；[mechanisms.md](architecture/mechanisms.md) 写日志与提交的事件模型、各主题的取舍与三项技术兑现义务 |
| [flows.md](flows.md) | 命令处理器的一次提交、C1 至 C5 协调器的流程、S1 至 S7 调度器的接续 |
| [object-model.md](object-model.md) | 构造对象、调度与协调的内存项、缓存项、一次调用的临时对象、持久游标与内存游标 |
| [public-api.md](public-api.md) | 根入口。现有导出为空；工厂、实例、依赖与 `SchedulingPolicy` 随实现进入 |
| [context.md](context.md) | 独立装配与框架装配两条路径，以及本成员在会话组中的位置 |
| [cordis.md](cordis.md) | 本成员不加载 Cordis 的理由，在 `documentation.json` 里按必需文档登记 |

当前缺口：工厂与全部模块都还没有进入 `src/`。SPEC 的验证义务都没有测试。预求值请求的候选采用材料、受理拓展点的槽形状，已在[公开入口页](public-api.md#尚未闭合的输入)标为尚未闭合。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
