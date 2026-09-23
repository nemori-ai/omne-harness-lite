# tenancy-host 应用节点

- kind：`assembly`
- 对象与设计修订：[治理中心](../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)作为一个可部署应用的采用型装配——租户领域（限界上下文 `tenancy`，[D-024](../../../record/decisions/tenancy-domain-name/README.md)）五个 provider、四个基础设施 provider 与入口层所在的一个包，在**一台机器、一个进程**里；**候选**，2026-09-22 首稿，2026-09-23 按 PF-017 与 `composition.governance-center-entry/v1` 修订（加入口层与运维面、升级的整体性）。节点名 `tenancy-host` 与组名 `infra` 由 [D-027](../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板
- 源码位置：`apps/tenancy-host`——**尚未建包**
- 交付面：[PF-017 治理中心作为一个可部署应用](../../../product/PF-017-governance-center-as-deployable-application/README.md)（rev 1，**draft**）——PF-017 为治理中心这个应用开题（[拍板记录](../../../product/PF-017-governance-center-as-deployable-application/decisions.md#一拍板记录)的开题原话即「先立 apps/tenancy-host PF」），并**有意不在治理中心身上用「交付面」这个词**，本行只沿用节点字段名；另承接 [PF-001](../../../product/PF-001-identity-scope-and-agent-constraints/README.md)（rev 15）的[投影 v1 第 3 步「装配」](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#8-实施顺序)与未决项 [Q-16](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)。**PF-017 仍是 draft，按[准入](../../README.md#应用节点比提供者节点多什么)本节点不得登记任何绑定**
- 契约采用与边界依据：本节点**不拥有任何契约条款**。它消费五份 `accepted` 契约（[D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md)）与 `composition.governance-center-entry/v1`（下称入口契约，**`candidate`**，[契约](../../../spec/compositions/governance-center-entry/v1/contract.md)）的提供者，只做**四件事**：① **存储装配**——装 [`infra/storage-sql`](../../packages/infra/storage-sql/README.md)（开发期 sqlite 文件库，pg 只接线）；**迁移由 owner 导出片段、本节点合成**：AI、OG、[`infra/clock`](../../packages/infra/clock/README.md)、[`tenancy/governance-center-entry`](../../packages/tenancy/governance-center-entry/README.md) 四个包各自导出自己表的迁移片段，本节点定次序并给出跨 owner 那条真实外键 `organization_owner_account_fk`（[AI R-7](../../packages/tenancy/account-identity/design.md#对存储提供者的要求清单) ⇔ [OG R-6](../../packages/tenancy/organization-governance/design.md#对存储提供者的要求清单) 是同一条外键的两侧）的目标与名字，合成一份 `MigrationProvider`；**升级整体成或整体不成**：迁移前只读核对数据格式版本与时钟回拨、sqlite 迁移前建快照、确认之前的任何启动失败都恢复快照、pg 迁移一个事务——机制作为对存储提供者的要求（R-U1～R-U8）交给 storage-sql；② **时钟装配**——装 `infra/clock`，只 provide 一个实例；启动期检出回拨或启动判定写失败都是启动失败；③ **密钥装配**——两对 Ed25519 密钥（`activation`、`purge`，即本装配的[部署密钥](../../../product/PF-017-governance-center-as-deployable-application/design.md#部署密钥)）作为部署配置输入经环境变量或文件路径下发，私钥只到产出方、公钥只到核实方，**起 Context 之前签一次、核一次的配对自检**，不配对 ⇒ 启动失败；一次生成，**本版不轮换**；④ **入口层与运维面的装配**——两者由 governance-center-entry 节点兑现，本节点把它们装在清单最后（运维面先于入口层）、给出监听地址与 TLS 材料、启动等钟可读的上界（大于时钟的租约宽度）、套接字目录、部署密钥载入结果与五项部署参数、日志汇。**配置错误一个政策**：缺、非法、二义、不配对、清单错误、只读核对不过、等钟超界 ⇒ **启动失败并说明原因**，整个装配不半开。Cordis 采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../record/decisions/cordis-adoption-version/README.md)）

## 分层状态

四项分别陈述，**不互相补齐**。

- **语义接受范围：本节点自己没有条款；它依据的新东西一样都没被接受。**它消费的五份契约 v1 全部条款已被 [D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md) 接受并冻结；查询层、驱动、无 in-memory、提供者进第一程被 [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md) 接受；名字与 `synchronous=NORMAL` 被 [D-027](../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md) 接受；Cordis 版本被 [D-025](../../../record/decisions/cordis-adoption-version/decision.md) 接受；PF-001 `status: active`（rev 15）。
  **未接受的**：主责产品依据 PF-017 rev 1 `draft`；`composition.governance-center-entry/v1` `candidate`（catalog 已登记、`acceptance` 为空）；它依据的[提案](../../../record/proposals/governance-center-entry/README.md)候选 A 与 governance-center-entry 节点；四个基础设施节点（`core/kernel-basis`、`core/storage`、`infra/storage-sql`、`infra/clock`）的设计。本节点对它们的每一处采用都以此为前提。
  契约里「装配给」的各行（[AI S-30](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) 九行、[OG S-42](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 九行、[AR S-25](../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 八行、[OE S-17](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 五行、[IV 第六节](../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)、入口契约 [S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)）是本节点的规格来源；哪一行由本节点承接、哪一行转交给某个提供者、客户端这条边上哪一行改由协议给，逐行在 [design.md「归装配」承接表](design.md#归装配的事项逐条承接)
- **可实施范围：四件事都有设计，其中升级的整体性要存储提供者补写之后才可实施。**本节点声称给出：一个 Context 与八条 fiber 的装载清单、顺序（运维面与入口层最后、运维面在前）与 `PENDING` 的结构判定、迁移的合成规则（次序、只追加的编号名、跨 owner 外键的目标与名字、合成后的十张表）、升级整体性的编排与对存储提供者的八条要求、两步开闸（全部 `ACTIVE` 且快照确认之后才经 `openSignal` 放行入口层开闸）、config 的来源与解析（方言、四份 PEM 与配对自检、五项部署参数与其余时长、凭据政策、入口层的监听与 TLS 材料及等钟可读的上界、运维面的套接字目录）、启动失败的整体收场与原因说明、撤除次序与三个候选常量（撤除总超时、排空上界、等 `serving` 的余量）、密钥生成函数；逐条见 [design.md](design.md)。
  **不给出或兑现不了**：R-U1～R-U8 在 storage-sql 还没有对应设计，clock 包还没有迁移前的只读回拨核对；开闸到确认之间的窗口（U-1）只在设计上闭合，两边都未建包；同一份库的排他（U-2）；
  **pg 上 [PF-017 §6.9](../../../product/PF-017-governance-center-as-deployable-application/design.md#69-升级同一个中心要么整体成要么整体不成) 本程不兑现**（U-3，显式缺口：「迁移单事务」成立，「迁移后装配失败回滚」不成立；闭合条件是 pg 首跑前定手段——候选：升级前逻辑备份钩子，或老版本可对新 schema 运行的兼容窗口；**受阻消费者：pg 部署**）；
  确认之后到开闸之间的失败支（U-4：入口层在开闸时再读钟、超界即放弃；本节点有界等 `serving`、等不到即启动失败，但快照已确认、不恢复，那一支上 §6.9 不成立，待主线裁）；运行中墙钟回拨的检出（归 clock 节点）；进程形态（本版只有测试内嵌的 `boot()`，无独立进程）、pg 上的任何运行、密钥轮换、当前租户身份残留清扫的定时器（[OG G-13](../../../spec/capabilities/organization-governance/v1/contract.md#十一已知缺口)）、清扫提供者（[AR G-6](../../../spec/compositions/account-registration/v1/contract.md#九已知缺口)，无枚举读面）。客户端一侧（据点的客户端代理、防冒充的确认）不在本节点。
  **源码状态**：`apps/tenancy-host` 尚未建包；`packages/tenancy/governance-center-entry` 尚未建包；`packages/infra/storage-sql` 与 `packages/infra/clock` 已建包并通过包内测试（见各自 README「实际验证」，尚未登记 evidence run）；`core/*` 四个包已建（含 `kernel-basis` 与 `offer-expiry` 的 `./testing`）；四个 tenancy 包只有服务面类型骨架（AI 的 config 已含两把公钥字段），**AI、OG 的迁移片段第二程才有**；`tools/ts-checks` 已建，三条规则接进 `pnpm run check`。本节点里每一处「提供者」仍是设计名与责任声明，[不从文件名或接口形状推断已兑现](../../AGENTS.md#红线)
- **绑定与证据：[`bindings.yaml`](bindings.yaml) 的 `bindings` 是空表。**PF-017 是 `draft`，按准入本节点**不得登记任何绑定**（检查器据 README 的「交付面」行核这一条）；即便 PF-017 接受，现在也没有一条已存在、且会失败、且登记过 run 的证据可指：`tools/ts-checks` 的 `restricted-call-sites` 规则已存在（含「故意违反就失败」自测），**但它的运行尚未登记为 evidence run**；真实外键存在性、迁移合成、升级整体性、缺密钥与错配启动失败、撤除次序等测试都还没写；basis probe 证的是内核语义，入口契约的 formal task 证的是契约模型，都不是本节点的条款。证据义务登记在 [verification.md](verification.md)，全部「未开始」「受阻」或「已写、run 未登记」
- **实际验证：尚无。**本节点没有任何运行；[verification.md 实际执行表](verification.md#实际执行)为空。两个 infra 包的包内测试是它们自己节点的转述，不是本节点的证据

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 这个应用是什么形状：进程、边、交互面入口、分层、技术栈、分发 | [应用形状](architecture.md) |
| 装了哪些提供者、按什么顺序、config 从哪来、迁移怎么合成、升级怎么整体成或整体不成、密钥怎么到持钥插件且怎么核配对、入口层与运维面怎么装、启动失败与撤除怎么收口、每条「归装配」在哪一行承接或转交 | [实现设计](design.md) |
| 入口层与运维面自己怎么工作（路由、判定次序、中心标识、传输、防冒充） | [governance-center-entry 节点](../../packages/tenancy/governance-center-entry/README.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml)（当前为空） |
| 要证什么、实际跑过什么、还缺什么 | [验证与证据](verification.md) |
| 为什么是 Kysely + `node:sqlite`、为什么无 in-memory | [D-026](../../../record/decisions/infrastructure-persistence-choices/README.md) 与[研究](../../../../research/agent-harness-persistence-and-identity-infra/research.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../spec/README.md)，采用选择回 [record/decisions](../../../record/decisions/README.md)。
