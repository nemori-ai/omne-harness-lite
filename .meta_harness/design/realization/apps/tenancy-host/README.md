# tenancy-host 应用节点

- kind：`assembly`
- 对象与设计修订：租户领域（限界上下文 `tenancy`，[D-024](../../../record/decisions/tenancy-domain-name/README.md)）六个 provider 与四个基础设施 provider 在**一台机器、一个进程**里的采用型装配；**候选**，2026-09-22 首稿，同日按一轮独立评审的裁决回填。**节点名 `tenancy-host` 与基础设施组名 `infra` 都是候选**——产品负责人尚未就名字作答（[D-026 明写](../../../record/decisions/infrastructure-persistence-choices/README.md#准入核对)），拍板后若改名是搬目录，不改本节点语义
- 源码位置：`apps/tenancy-host`——**尚未建包**
- 交付面：[PF-001 身份、范围与对 Agent 的约束](../../../product/PF-001-identity-scope-and-agent-constraints/README.md)（rev 15）——本节点承接的是它的[投影 v1 第 3 步「装配」](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#8-实施顺序)与未决项 [Q-16](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)。**它不是一个终端交付面的 PF**（那一类是 PF-016）：承载租户领域事实的那个可部署应用（PF-016 所称的[治理中心](../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)）**尚无交付面 PF**，`apps/cli` 节点已按准入不为它建节点；本节点据 D-026「SQL 存储提供者进第一程」建立，与[「没有 PF 的应用不建节点」](../../README.md#应用节点比提供者节点多什么)之间的张力**主线不裁、已上报产品负责人**（准入例外或为治理中心开题），本节点先以 candidate 存在；记在[实施缺口](design.md#实施缺口与消费者影响)
- 契约采用与边界依据：本节点**不拥有任何契约条款**。它消费五份 `accepted` 契约（[D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md)）的提供者，并只做**三件半事**：① **存储装配**——装 [`infra/storage-sql`](../../packages/infra/storage-sql/README.md)（开发期 sqlite 文件库，pg 只接线）；**迁移由 owner 导出片段、本节点合成**：AI、OG、[`infra/clock`](../../packages/infra/clock/README.md) 三个包各自导出自己表的迁移片段，本节点定次序并给出跨 owner 那条真实外键 `organization_owner_account_fk`（[AI R-7](../../packages/tenancy/account-identity/design.md#对存储提供者的要求清单) ⇔ [OG R-6](../../packages/tenancy/organization-governance/design.md#对存储提供者的要求清单) 是同一条外键的两侧）的目标与名字，合成一份 `MigrationProvider`；每个唯一约束显式命名、主键恒名 `<table>_pkey`；② **时钟装配**——装 `infra/clock`，只 provide 一个实例；启动期检出回拨或启动判定写失败都是启动失败；③ **密钥装配**——两对 Ed25519 密钥（`activation`、`purge`）作为部署配置输入经环境变量或文件路径下发，私钥只到产出方、公钥只到核实方，**起 Context 之前签一次、核一次的配对自检**，不配对 ⇒ 启动失败；一次生成，**本版不轮换**；③½ **入口层身份核实——不写**，它取决于客户端与据点进程之间尚未起草的契约，明写为缺口。**配置错误一个政策**：缺、非法、二义、不配对、清单错误 ⇒ **启动失败**，整个装配不半开。Cordis 采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../record/decisions/cordis-adoption-version/README.md)）

## 分层状态

四项分别陈述，**不互相补齐**。

- **语义接受范围：本节点自己没有条款。**它消费的五份契约 v1 全部条款已被 [D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md) 接受并冻结；查询层、驱动、无 in-memory、提供者进第一程被 [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md) 接受；Cordis 版本被 [D-025](../../../record/decisions/cordis-adoption-version/decision.md) 接受；交付面 PF-001 `status: active`（rev 15）。**四个基础设施节点（`core/kernel-basis`、`core/storage`、`infra/storage-sql`、`infra/clock`）的设计尚未被接受**，本节点对它们的每一处采用都以此为前提。契约里「装配给」的各行（[AI S-30](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) 九行、[OG S-42](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 九行、[AR S-25](../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 八行、[OE S-17](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 五行、[IV 第六节](../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)）是本节点的规格来源；哪一行由本节点承接、哪一行转交给某个提供者，逐行在 [design.md「归装配」承接表](design.md#归装配的事项逐条承接)
- **可实施范围：三件半里的三件。**本节点声称给出：一个 Context 与六条 fiber 的装载清单、顺序与 `PENDING` 的结构判定、迁移的合成规则（次序、跨 owner 外键的目标与名字、合成后的全貌）、config 的来源与解析（方言、四份 PEM 与配对自检、四个时长、凭据政策）、启动失败的整体收场、撤除次序、密钥生成函数；逐条见 [design.md](design.md)。**不给出**：入口层身份核实（登录态如何从客户端到达本进程、`LoginStateId` 换成身份值再调治理面——[OG S-42 末两行](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)、[AI S-30 第 6 行](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)）、进程形态（第一程只有测试内嵌的 `boot()`，无独立进程）、pg 上的任何运行、密钥轮换、当前租户身份残留清扫的定时器（[OG G-13](../../../spec/capabilities/organization-governance/v1/contract.md#十一已知缺口)，只登记为将来事项）、清扫提供者（[AR G-6](../../../spec/compositions/account-registration/v1/contract.md#九已知缺口)，无枚举读面）。**源码状态**：`apps/tenancy-host` 尚未建包；`packages/infra/storage-sql` 与 `packages/infra/clock` 已建包并通过包内测试（见各自 README「实际验证」，尚未登记 evidence run）；`core/*` 四个包已建（含 `kernel-basis` 与 `offer-expiry` 的 `./testing`）；四个 tenancy 包只有服务面类型骨架（AI 的 config 已含两把公钥字段），**它们的迁移片段第二程才有**；`tools/ts-checks` 已建，三条规则接进 `pnpm run check`。本节点里每一处「提供者」仍是设计名与责任声明，[不从文件名或接口形状推断已兑现](../../AGENTS.md#红线)
- **绑定与证据：[`bindings.yaml`](bindings.yaml) 的 `bindings` 是空表。**本节点能否登记绑定**待裁**（准入张力已上报产品负责人）；且即便可以，现在也没有一条已存在、且会失败、且登记过 run 的证据可指：`tools/ts-checks` 的 `restricted-call-sites` 规则已存在（含「故意违反就失败」自测），**但它的运行尚未登记为 evidence run，登记前不进绑定**；真实外键存在性、迁移合成、缺密钥与错配启动失败、撤除次序等测试都还没写；四条 basis probe 证的是内核语义，不是本节点的任何条款。十八条证据义务登记在 [verification.md](verification.md)，全部「未开始」「受阻」或「已写、run 未登记」
- **实际验证：尚无。**本节点没有任何运行；[verification.md 实际执行表](verification.md#实际执行)为空。两个 infra 包的包内测试是它们自己节点的转述，不是本节点的证据

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 这个应用是什么形状：进程、边、交互面入口、分层、技术栈、分发 | [应用形状](architecture.md) |
| 装了哪些提供者、按什么顺序、config 从哪来、迁移怎么合成、密钥怎么到持钥插件且怎么核配对、启动失败与撤除怎么收口、每条「归装配」在哪一行承接或转交 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持、前提是什么 | [绑定表](bindings.yaml)（当前为空） |
| 要证什么、实际跑过什么、还缺什么 | [验证与证据](verification.md) |
| 为什么是 Kysely + `node:sqlite`、为什么无 in-memory | [D-026](../../../record/decisions/infrastructure-persistence-choices/README.md) 与[研究](../../../../research/agent-harness-persistence-and-identity-infra/research.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../spec/README.md)，采用选择回 [record/decisions](../../../record/decisions/README.md)。
