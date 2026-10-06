# 身份与治理能力整改的限定产品接受

状态：本切片产品实现已技术接受，完整身份领域整改未完成。

负责人 panqiwei 在本会话授权实施整改、按增量验收并合入。主会话于 2026-10-04 22:24:01 UTC 在该委托内接受产品候选 `cf4ce5874100c4271bd3b01327da7b81c443a39a`，实施 BASE 为 `67eecc1ae53be30efec473206e5d1926dd5d500f`。这不表示负责人已亲自逐条审阅，也不表示系统级验收完成。

设计依据为[身份领域限定设计采用](../identity-integration-design/decision.md)、[绑定坐标补充](../identity-t2-binding-coordinates/decision.md)、[启动期投影补差](../identity-startup-lifecycle/decision.md)、[D-114](../cordis-integration-conventions/decision.md)和[D-115](../actual-architecture-and-thin-spec/decision.md)。来源研究为 [architecture-judgment-aids](../../../../research/architecture-judgment-aids/research.md)。实际输入、原失败、独立 L3 及保全见[本次运行](../../evidence/2026-10-04-tests-identity-capabilities/README.md)。

## 接受范围与业务保持

- AI/CV/AR/OG 的公共形状与正式 Service 由各 core 定义拥有，提供者使用限定名称。纯根与 `./cordis` 分离；独立调用继续可用。原 75 个公开导出、105 个业务函数与数据身份有逐项对应。
- `assembly-lifecycle`、正式 `startAssemblyWork`、八个管理绑定及手写 tenancy-host 共同表达单代接管、同步资格失效、独立 ready、实际 ACTIVE 和逆序完成观察。EntryOpening 由两网络面共用。资源在已准入工作真正完成后关闭。
- 账号、登录、凭据验证、注册、组织与成员的既有成功/拒绝/失败、同提交、持久化和通知语义保持。注册三步不合为单次提交。AI/OG 参与对象的寿命继续归调用方 StorageUnit，工厂 close 不撤销借用事务。
- 原提供者包、根绑定和重复键/旧事件名在本批取代范围内删除，实际消费者同步。治理 entry 提供者本批只提前物理改名及管理绑定接入；剩余根分面、资源服务化和插件树继续归 T4。

本次不增加租户权限、不引入跨库事务，不把隔离端口当授权，也不交付 Agent/Session 协调。

## 接受依据与问题处置

独立 QA 的 38 项冻结标准全部 Pass，适用原套件及消费者 1189 passed、19 skipped。真实 SQLite、TLS、Unix、OS scrypt、双 host 隔离、BASE 库重开和 13 个实际 tarball 均有观察。独立实施审阅及最终补审没有剩余代码阻断。完整构建/类型、最终 host 216 passed/11 skipped、必要跨域回归和四共同硬线完成。

两项迁移缺陷已修复并独立复验：重入 close 在登记前调用依赖导致过早完成，以及 managed SQL inject 首个空槽导致宿主 PENDING。原反例与 99 个失败保留。IR-CC-1 已按固定合法盐、完整材料判据及真实泄漏负控完成对齐，不靠随机重采样通过。

AI/OG/AR 及 EC 受影响原模型实际运行，输入散列保持。有限边界、公平性及故障配置仍约束结论，不把模型当作 SQLite 细化证明。原包装器及 QA 设施失败按原件保留，成熟闭包设施经独立正负控取得替代观察。

静态视图有 17 个 unknown。实际绑定/失败/完成观察补充其静态局限，不删除 unknown 或放宽规则。变化 CC、既存超线、克隆、依赖、旧映射和 IC-4 共六组逐项交代。EC 的 22 个新 IC-4 路径由 T4/T5 整改，前端/CLI 由 T3，模型及必要共享边界由 R2；这些责任尚未完成。

## 保留前提与接续

原 A5/QA-N4-I1 的 45 秒失败原因、EIS 原 5000ms 超时、完整 W6/QA-FAC-1 与 OG2/AR2 formal README 登记缺口继续开放。17 个冷恢复场景通过不关闭根因。19 个显式跳过、完整 PostgreSQL 治理部署、全工作区测试和完整基准未由本次验证。没有运行 make check、队列或付费模型。

这些保留事项未遮蔽 T2 冻结标准的必需观察，因此不阻断本切片接受。它们不能被转写为已知问题来关闭后继必要验收。原业务契约、模型及 N5/N6 验证责任仍有效，旧集成实现的取代不等于整份旧规格退役。

本事件接续此前设计采用的待实现状态，只接受上述精确候选。N1～N4、R1-T1 和 D0 的历史记录不改写。T2 完成还须实际合入与保全读回；之后从最新 main 固定 T3，先独立冻结行为输入和 QA 资源，再实施公共操作、客户端与 CLI 迁移。R1-T5、R2、R3 和 N5～N8 仍保留原完成门。
