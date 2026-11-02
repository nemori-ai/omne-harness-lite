# docs

本目录承载 `@omne-harness/session-cordis` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。也可以按实际阅读任务增加指南、参考、配置或维护专题，以及文本图源与图片。

## 边界

非类型行为的唯一正文是包根 [SPEC.md](../SPEC.md)，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可以升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。SPEC 的性质编号改变时，同步本目录里引用性质编号的地方。

## 本包事实

六个固定专题都有正文，没有按需专题。本成员是 `service-provider` 变体，承担会话组里「Service 实现、端口接线、扫描者绑定与撤除」这一主题，`cordis.md` 是核心页。

| 专题 | 本成员里承载什么 |
| --- | --- |
| [cordis.md](cordis.md) | 插件与服务、`inject`、端口现取、配置、生命周期、调用方类核对、提交通知的派发与订阅、扫描者绑定、撤除顺序、登记与撤除、IC 符合性映射、机制读数与假设、验证义务 |
| [architecture.md](architecture.md) | 两个入口、六个模块、包外依赖、六条关键机制的理由、SOLID 与扩展边界 |
| [flows.md](flows.md) | FC-01 装载与启动、FC-02 端口换代、FC-03 撤除、FC-04 扫描者接管 |
| [object-model.md](object-model.md) | 服务实例、插件配置、端口接线、组合通知者与租户维护表。领域对象与机制对象指向各自拥有者 |
| [public-api.md](public-api.md) | 两个入口。根入口为空，`./cordis` 导出 `SessionProvider`；经服务键可见的两种附加结果 |
| [context.md](context.md) | 装配与独立使用两条路径，以及定位 |

当前缺口：受理槽与来源变化通知的服务键在服务定义成员里还没有定义，租户集合也没有来源，见 [SPEC 的明确缺项](../SPEC.md#明确缺项)。具名维护者由负责人指定。
