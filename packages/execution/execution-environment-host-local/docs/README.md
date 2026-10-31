# docs

本目录承载 `@omne-harness/execution-environment-host-local` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。`architecture.md` 的「宿主文件使用」标题被领域页链接，改名前先同步[领域交接设计](../../../../docs/domains/execution-environments/architecture.md#文件使用的交接)。这一节已被接受，改它的含义要经原接受入口。

## 本包事实

六个固定专题都有正文，没有按需专题。本成员是 `service-provider` 变体，`cordis.md` 是核心页。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [cordis.md](cordis.md) | 插件与配置、服务子类、登记即效应、撤除顺序、isolate 绑定、调用方类与块发布的现状、IC 符合性映射、机制读数、验证义务 |
| [architecture.md](architecture.md) | 两个入口与模块、包外依赖、五条关键机制的理由、宿主文件使用（已接受）、模块层的 SOLID 选择 |
| [flows.md](flows.md) | F-EEH01 装载、F-EEH02 宿主文件使用（已接受的图）、F-EEH03 卸载与关闭 |
| [object-model.md](object-model.md) | 服务实例、宿主文件责任域、提供者、获取记录、租约原件与句柄代际 |
| [public-api.md](public-api.md) | 根入口四个函数与三个类型族、`./cordis` 四个导出 |
| [context.md](context.md) | 装配、点名对象、一次文件使用、独立使用与定位 |

当前缺口：Runtime Context 两条块的发布、调用方类核对、授予根限制、平台前提探测，以及重复装载与配置校验失败的测试。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
