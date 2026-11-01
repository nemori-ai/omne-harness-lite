# docs

本目录承载 `@omne-harness/request-context-cordis-contract` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的性质编号改变时，同步本目录里引用性质编号的地方。

## 本包事实

六个固定专题都有正文，没有按需专题。本成员是 `service-contract` 变体，`cordis.md` 是核心页，也是组内「服务键、intercept 配置与事件」主题在 Request Context 一侧的唯一拥有者（[组架构](../../docs/architecture.md#主题与唯一拥有者)）。

| 专题                               | 本成员里承载什么                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [cordis.md](cordis.md)             | 服务定义、intercept 配置与作用域、事件、依赖分类、登记与撤除协议、策略选择、IC 符合性映射、机制读数与假设 |
| [architecture.md](architecture.md) | 三个入口、包外依赖、五条关键机制的理由、模块层的 SOLID 选择                                               |
| [flows.md](flows.md)               | F-RQD01 贡献登记与撤除、F-RQD02 变化事件按作用域到达                                                      |
| [object-model.md](object-model.md) | 三个技术对象。领域对象指向契约的对象模型                                                                  |
| [public-api.md](public-api.md)     | 三个入口。根类型重导出、Cordis 定义、测试导出与导出库存                                                    |
| [context.md](context.md)           | 各类依赖方的用法与定位                                                                                    |

三个入口的公开定义已进入[源码](../src/cordis.ts)。经 Cordis 的来源登记 `register`、`replace` 与组装入口 `assembly(target)`、全局层的表达 `scope: null` 与事件由监听者按载荷过滤已在 SPEC 写定。`ScopeRef` 从 Runtime Context 契约原样复用。这几项见 [Cordis 说明](cordis.md)。一条机制读数还没有进入 basis。具名维护者由负责人指定，见[组入口](../../README.md#维护)。
