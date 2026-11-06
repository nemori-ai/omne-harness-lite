# docs

本目录承载 `@omne-harness/skill-cordis-contract` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`；按实际阅读任务增加的指南、参考、配置或维护专题；文本图源与图片。

## 边界

非类型行为的唯一正文是包根 `SPEC.md`，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。

## 本包事实

六个固定专题都有正文，没有按需专题。本成员是 `service-contract` 变体，`cordis.md` 是核心页。

| 专题                               | 本成员里承载什么                            |
| ---------------------------------- | ------------------------------------------- |
| [cordis.md](cordis.md)             | 服务定义、依赖分类、IC 符合性映射、机制读数 |
| [architecture.md](architecture.md) | 两个入口、包外依赖、关键机制的理由          |
| [flows.md](flows.md)               | 服务的装载与撤除、端口现取                  |
| [object-model.md](object-model.md) | 五个技术对象与一项类型增补                  |
| [public-api.md](public-api.md)     | 两个入口与 `./cordis` 的导出                |
| [context.md](context.md)           | 各类依赖方的用法与定位                      |

具名维护者由负责人指定，见[组页](../../README.md#维护)。
