# tenancy-host 应用节点

## 工作区接入的适用范围

已完成治理入口与 Docker 部署不因本轮产品修订需要重做；工作区登记／关系解除／销毁级联尚未有对应协议。旧身份与资产契约中的工作区限制不能被当成新工作区服务的设计，Git 托管也不能从当前中心进程或数据库拓扑推定。后续工作区边完成后才接续其应用绑定。

依据：[工作区关系规则](../../../product/PF-020-workspace/design.md#租户工作区关系)；[中心产品范围](../../../product/PF-017-governance-center-as-deployable-application/design.md)。

**共享实例来源复核（2026-09-27）**：PF-001 rev 22 将实例本地来源与租户层私有内容分开；本节点现有账号与治理契约不以工作区实例单租户为前提，工作区关系和实例装配仍是未承接的产品增量。更新当前产品引用，不修改冻结契约、节点装配或原接受与验证范围。

**工作区组织限制复核（2026-09-27）**：PF-001 rev 21 接入 PF-020 的组织参与限制与共享／本地内容边界；本节点既有采用契约尚未承诺该新增规则的配置入口和执行路径。本次只更新产品依赖坐标并登记消费缺口，不扩大可实施、已实现或已验证范围。

**跨 PF 工作区一致性复核（2026-09-27）**：PF-017 rev 6 明确工作区关系沿 PF-020 治理；现有身份治理入口尚未提供该关系协议，Git 托管拓扑也未因此确定。当前仅更新产品引用并登记消费缺口，保留原已接受契约、部署、实现与验证范围。

**工作区增量复核（2026-09-27）**：当前 PF 引用已对齐本会话的工作区概念修订；本节点的治理交付范围不变。PF-020 的工作区身份、实例、地址与参与关系仍是产品草稿，不因本次引用更新成为已接受契约、实现或验证声明。

**外部仓库参与规则来源复核（2026-09-29）**：PF-001 rev 23 依据[产品负责人裁决](../../../product/PF-001-identity-scope-and-agent-constraints/decisions.md#2026-09-27-外部仓库仅参与者裁决)，区分 Omne Host 托管工作区的治理归属与外部仓库登记的参与关系；外部仓库不因首次登记产生 Omne 治理所有者，组织限制启用时不授予其工作区身份或加载其装配来源。普通目录访问仍沿原权限，不增加文件系统隔离或运行中会话立即终止保证。本节点尚无工作区登记、参与关系及来源装载协议；该增量仍由 PF-020 及后续条件阶段 PU 接续。本次只复核产品引用与保留消费缺口，不改变既有治理/Docker 的冻结契约、采用、实现或验证范围。

## 当前采用与历史结构读法

新增的 [Docker 部署映射](docker.md) R5 已由 [D-071](../../../record/decisions/governance-docker-stop-adoption/decision.md)采用，继承 D-070 的 Docker R4 范围，健康探针由[D-072](../../../record/decisions/governance-docker-health-binding/decision.md)精化为同进程调用原公开main。实现、I4 制品正常治理与实际外层取消验证、Fable 定向复审已完成，root 已作出[M0 限定技术验收](../../../record/proposals/governance-docker-deployment/review.md#i4-定向复审与-m0-技术验收--2026-09-27)。[I3 的逐项有限验收](verification.md#docker-最终制品的已运行范围--2026-09-27)及[I4 的变更验证](../../../record/evidence/2026-09-27-tests-docker-health-i4/README.md)保持各自源码、制品与运行范围，不把历史场景称作 I4 全部重跑。实际公司部署、原生 amd64、专门的 TUI 到 Docker 操作与独立整机灾备等未覆盖范围沿验收记录读取；下列历史原生部署证据不扩大 Docker 保证。

本节点当前消费D040～D044、D055/D056：AI3、OG2、AR2、OE2、EC3/HT3与IV1，SQLite由D039显式FULL；应用仍按D028的存储/时钟/密钥/入口装配责任组合，没有新增治理授权规则。有限登录、共同业务/活动提交、主动改密全失效与真实排空均已实现。源码/现有运行见下方接续和[当前CLI](../cli/README.md)。

下方D023/D028/D029基线段保留装配推导与历史修订坐标；其中旧契约版本、实验期范围与旧完成状态只描述当时，不是当前消费者登记。当前版本与接受依据以前段和registry为准。治理CLI/TUI已有实现与有限跨OS/GUI证据；维护工具与限定 Linux 服务安装验证已完成；恢复只保持隔离，实际员工安装与整机损毁灾备仍须相应环境验收，不从有限测试推导全量生产保证。

- kind：`assembly`
- **承载已超出租户领域**（[D-059](../../../record/decisions/assets-runtimes-split-and-rulings/README.md)，2026-09-24）：本程之后它还装资产治理与模型档案目录的中心侧，名字与承载内容不再一致；产品负责人裁定**现在不改名**，改名待中心侧装配内容稳定后一次做。**2026-09-25 修订（设计已接受，尚未实现）**：装载清单追加 [asset-governance](../../packages/assets/asset-governance/README.md) 与模型档案目录的中心插件 P-1（`packages/model/model-profile-directory` 节点，本批并行起草），组织治理按 v3 采用；迁移末尾追加三组片段、官方件与官方档案清单随本应用发布并在启动时交进插件、新增几项 config——全部在 [design「本程追加」](design.md#本程追加资产治理与模型档案目录的中心侧候选尚未实现)。
- 对象与设计修订：[治理中心](../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)作为一个可部署应用的采用型装配——租户领域（限界上下文 `tenancy`，[D-024](../../../record/decisions/tenancy-domain-name/README.md)）五个 provider、四个基础设施 provider 与入口层所在的一个包，在**一台机器、一个进程**里；状态 `assembled`（源码修订 HUB `c9b5850`；**本程追加的部分是 `accepted`，没有源码**），2026-09-22 首稿，2026-09-23 按 PF-017 与 `composition.governance-center-entry/v1` 修订（加入口层与运维面、升级的整体性）。节点名 `tenancy-host` 与组名 `infra` 由 [D-027](../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板
- 源码位置：`apps/tenancy-host`——**已实现（HUB `c9b5850`）**：`src/boot.ts`（`boot()`、两步开闸、确认、逆序撤除）、`src/manifest.ts`（装载清单与三个时长常量）、`src/migrations.ts`（迁移合成、数据格式核对、外键名）、`src/config.ts`（环境变量与文件来源）、`src/keys.ts`（配对自检、`generateKeyFiles`）、`src/log.ts`（JSONL 日志汇）、`src/failure.ts`（启动失败的具名阶段）、`src/main.ts` 与 `src/cli.ts`（进程入口：`keygen <dir>`、`serve`）；公开入口 `src/index.ts`
- 交付面：[PF-017 治理中心作为一个可部署应用](../../../product/PF-017-governance-center-as-deployable-application/README.md)（rev 7）——PF-017 为治理中心这个应用开题（[拍板记录](../../../product/PF-017-governance-center-as-deployable-application/decisions.md#一拍板记录)的开题原话即「先立 apps/tenancy-host PF」），并**有意不在治理中心身上用「交付面」这个词**，本行只沿用节点字段名；另承接 [PF-001](../../../product/PF-001-identity-scope-and-agent-constraints/README.md)（rev 25）的[投影 v1 第 3 步「装配」](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#8-实施顺序)与未决项 [Q-16](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)。**PF-017 rev 2（rev 1 于 2026-09-23 接受、同日升 rev 2）**；按[准入](../../README.md#应用节点比提供者节点多什么)本节点可以登记绑定（见下「绑定与证据」）
- 契约采用与边界依据：本节点**不拥有任何契约条款**。它消费五份租户契约——四份 v1 `accepted`（[D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md)）、账号能力按 `capability.account-identity/v2`（`accepted`，[D-028](../../../record/decisions/governance-center-design-acceptance/README.md)）——与 `composition.governance-center-entry/v1`（下称入口契约，`accepted`，D-028，[契约](../../../spec/compositions/governance-center-entry/v1/contract.md)）的提供者，只做**四件事**：① **存储装配**——装 [`infra/storage-sql`](../../packages/infra/storage-sql/README.md)（开发期 sqlite 文件库，pg 只接线）；**迁移由 owner 导出片段、本节点合成**：AI、OG、[`infra/clock`](../../packages/infra/clock/README.md)、[`tenancy/governance-center-entry`](../../packages/tenancy/governance-center-entry/README.md) 四个包各自导出自己表的迁移片段，本节点定次序并给出跨 owner 那条真实外键 `organization_owner_account_fk`（[AI R-7](../../packages/tenancy/account-identity/design.md#对存储提供者的要求清单) ⇔ [OG R-6](../../packages/tenancy/organization-governance/design.md#对存储提供者的要求清单) 是同一条外键的两侧）的目标与名字，合成一份 `MigrationProvider`；**升级整体成或整体不成**：迁移前只读核对数据格式版本与时钟回拨、sqlite 迁移前建快照、确认之前的任何启动失败都恢复快照、pg 迁移一个事务——机制作为对存储提供者的要求（R-U1～R-U8）交给 storage-sql；② **时钟装配**——装 `infra/clock`，只 provide 一个实例；启动期检出回拨或启动判定写失败都是启动失败；③ **密钥装配**——两对 Ed25519 密钥（`activation`、`purge`，即本装配的[部署密钥](../../../product/PF-017-governance-center-as-deployable-application/design.md#部署密钥)）作为部署配置输入经环境变量或文件路径下发，私钥只到产出方、公钥只到核实方，**起插件之前签一次、核一次的配对自检**，不配对 ⇒ 启动失败；一次生成，**本版不轮换**；④ **入口层与运维面的装配**——两者由 governance-center-entry 节点兑现，本节点把它们装在清单最后（运维面先于入口层）、给出监听地址与 TLS 材料、启动等钟可读的上界（大于时钟的租约宽度）、套接字目录、部署密钥载入结果与五项部署参数、日志汇。**配置错误一个政策**：缺、非法、二义、不配对、清单错误、只读核对不过、等钟超界 ⇒ **启动失败并说明原因**，整个装配不半开。Cordis 采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../record/decisions/cordis-adoption-version/README.md)）

## 当前采用

当前 draft 治理装配采用 AI3/OG2/OE2/AR2/EC3/HT3；#9 的资产、模型和 OG3 时刻增量为已接受设计，尚未实现。历史基础采用及其证据保留原范围，未来资产/据点入口版本未分配。

## 分层状态

四项分别陈述，**不互相补齐**。

- **语义接受范围：本节点自己没有条款；主责产品依据 PF-017 rev 2；入口契约 v1、账号能力 v2 与本节点本程的设计（两步开闸、升级守卫对象、占位行片段、运维约定）已由 [D-028](../../../record/decisions/governance-center-design-acceptance/decision.md) 接受（产品负责人，2026-09-23），接受不提升下面三层。**PF-017 `status: active`（rev 2）；它消费的五份租户契约 v1 全部条款已被 [D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md) 接受并冻结——账号能力本节点按 **v2** 装（下一行）；查询层、驱动、无 in-memory、提供者进第一程被 [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md) 接受；名字与共享默认 `synchronous=NORMAL` 被 [D-027](../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md) 接受；[D-039](../../../record/decisions/governance-sqlite-full/decision.md) 增加同步档位并由本中心显式选 FULL；Cordis 版本被 [D-025](../../../record/decisions/cordis-adoption-version/decision.md) 接受；PF-001 `status: active`（rev 19）。
  **已由 D-028 接受的**：`capability.account-identity/v2`（九个操作；入口契约认人所用的 S-44 与出示物 S-45 只在 v2 里）、`composition.governance-center-entry/v1`（含它依据的[提案](../../../record/proposals/governance-center-entry/README.md)候选 A 与 governance-center-entry 节点）；**仍未接受的**：四个基础设施节点（`core/kernel-basis`、`core/storage`、`infra/storage-sql`、`infra/clock`）的设计只随 D-023／D-028 作为实现路径接受，没有契约条款可接受。本节点对它们的每一处采用都以此为前提。
  契约里「装配给」的各行（[AI v2 S-30](../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证) 十四行，其中第 11 行是提供者义务、不是装配给、[OG S-42](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 九行、[AR S-25](../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 八行、[OE S-17](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 五行、[IV 第六节](../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)、入口契约 [S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)）是本节点的规格来源；哪一行由本节点承接、哪一行转交给某个提供者、客户端这条边上哪一行改由协议给，逐行在 [design.md「归装配」承接表](design.md#归装配的事项逐条承接)。
  **本程追加：设计已接受。**四份追加契约由 D-061 接受并冻结，本节点追加装配设计由 D-062 接受；存量源码与本程未实现范围分别保留。
- **可实施范围：四件事与升级的整体性都已实现（HUB `c9b5850`），存储提供者、时钟与入口层三侧的对应部分也已实现。**本节点声称给出：一个 Context 与八条 fiber 的装载清单、顺序（运维面与入口层最后、运维面在前）与 `PENDING` 的结构判定、迁移的合成规则（次序、只追加的编号名、跨 owner 外键的目标与名字、合成后的十张表）、升级整体性的编排（显式开启存储提供者的升级守卫、传三项迁移前核对（数据格式、`clockPreflight()`、`governanceCenterPreflight`）、确认、撤完之后核查未确认的快照）与对存储提供者的八条要求、两步开闸（全部 `ACTIVE` 且快照确认之后才经 `openSignal` 放行入口层开闸）、config 的来源与解析（方言、四份 PEM 与配对自检、五项部署参数与其余时长、凭据政策、入口层的监听与 TLS 材料及等钟可读的上界、运维面的套接字目录）、启动失败的整体收场与原因说明、撤除次序与三个时长常量（撤除总超时 `DISPOSE_TIMEOUT_MS`、排空上界 `DRAIN_TIMEOUT_MS`、等 `serving` 的余量 `SERVING_GRACE_MS`）、密钥生成函数与进程入口（`keygen <dir>`、`serve`，信号与退出码）；逐条见 [design.md](design.md)。「内核原样传递 config」（`openSignal` 与守卫对象都靠它）已取证，前提写在 [design.md「守卫对象」](design.md#守卫对象确认绑在实例上不绑在-config-上)；开闸到确认之间的窗口（U-1）已闭合。
  **不给出或兑现不了**：pg 的会话锁在锁连接断开时的收场未定（U-2 的 pg 一支）；
  **pg 上 [PF-017 §6.9](../../../product/PF-017-governance-center-as-deployable-application/design.md#69-升级同一个中心要么整体成要么整体不成) 本程不兑现**（U-3，显式缺口：「迁移单事务」成立，「迁移后装配失败回滚」不成立；闭合条件是 pg 首跑前定手段——候选：升级前逻辑备份钩子，或老版本可对新 schema 运行的兼容窗口；**受阻消费者：pg 部署**）；
  确认之后到开闸之间的失败支（U-4，**已接受的残余情形（裁 (b)）：无已确认提交丢失、老版本不能再起、核过钟再重启**——入口层在开闸时再读钟、超界即放弃；本节点有界等 `serving`、等不到即启动失败、快照已确认不恢复，说明写「钟读不到或回拨：重启前先核钟」）；进程怎么被拉起（systemd／容器／手动）、pg 作部署目标（pg 上的装配演练只在测试里跑）、密钥轮换、当前租户身份残留清扫的定时器（[OG G-13](../../../spec/capabilities/organization-governance/v1/contract.md#十一已知缺口)）、清扫提供者（[AR G-6](../../../spec/compositions/account-registration/v1/contract.md#九已知缺口)，无枚举读面）。客户端一侧（据点的客户端代理、防冒充的确认）不在本节点。
  声称给出的各项**已实现（HUB `c9b5850`）**；本节点的函数、常量、环境变量名都是实名（公开入口 `src/index.ts`），它装配的九个包也都已实现（各节点 README「源码位置」）。`tools/ts-checks` 的规则扫 `packages/` 与 `apps/`，接进 `pnpm run check`。
  **本程追加（设计已接受，尚未实现）声称给出**：装载清单再装两条 fiber 与新的撤除次序；迁移末尾追加三组片段（OG v3 单独导出）、不新增外键；两份官方清单随本应用发布并在启动时交进插件、登记或装入失败即启动失败（`manifestNotNewer` 按 P-1 的收场记 error、照常服务）；两个保留期与出厂格凭据**引用**的来源；P-1 在中心不 provide 取值面（`serveBaseFaces: false`）；钉 v1／v2 的服务名绑定；中心进程里没有 `asset.*` 订阅者的结构保护（AG S-48 末条，两条检查）；AG S-50、AT S-34、OG v3 S-42 两行、MPD S-22 左列的逐组承接（[design](design.md#本程追加资产治理与模型档案目录的中心侧候选尚未实现)）。**不给出**：中心各面对外可达（U-6，未来资产/据点入口（版本未分配））；时刻严格递增（U-7，`infra/clock` 的 C-15）；清单序号跨发布单调（U-8，发布流程）；凭据取值（U-9，保管方）；官方件清单的内容（U-10）
- **绑定与证据**：本节点的装配测试（`tests/` 下 `lifecycle`、`migrations`、`upgrade`、`config`、`process`、`slow`、`pg`）与 `tools/ts-checks` 的 `restricted-call-sites` 等规则都已存在；[`bindings.yaml`](bindings.yaml) 的绑定与 [verification.md](verification.md) 的逐条状态待回填。basis probe 证的是内核语义，入口契约的 formal task 证的是契约模型，都不是本节点的条款。**本程追加：0 条绑定**——没有会失败的证据；verification 里五条候选义务未开始
- **实际验证**：运行 `2026-09-23-tests-tenancy-leg-2`（证据登记在 [`record/evidence/2026-09-23-tests-tenancy-leg-2/`](../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md)，HUB）：本包测试随十三个 TS 成员 build／typecheck／test 在 sqlite 下全过（真实 sqlite 文件库、真实 TLS 连接与 Unix 套接字、八个真实插件、两进程真并发与子进程 `SIGKILL`）；pg 16 容器上本包的 pg 用例 11／11 通过——pg 仍不是本版部署目标。逐条覆盖待 verification 回填。**本程追加：无**（源码不存在）

## 按当前问题展开

| 当前问题                                                                                                                                                                                          | 阅读入口                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 这个应用是什么形状：进程、边、交互面入口、分层、技术栈、分发                                                                                                                                      | [应用形状](architecture.md)                                                                                                                                             |
| 装了哪些提供者、按什么顺序、config 从哪来、迁移怎么合成、升级怎么整体成或整体不成、密钥怎么到持钥插件且怎么核配对、入口层与运维面怎么装、启动失败与撤除怎么收口、每条「归装配」在哪一行承接或转交 | [实现设计](design.md)                                                                                                                                                   |
| 入口层与运维面自己怎么工作（路由、判定次序、中心标识、传输、防冒充）                                                                                                                              | [governance-center-entry 节点](../../packages/tenancy/governance-center-entry/README.md)                                                                                |
| 哪条承诺由哪份证据支持、前提是什么                                                                                                                                                                | [绑定表](bindings.yaml)                                                                                                                                                 |
| 要证什么、实际跑过什么、还缺什么                                                                                                                                                                  | [验证与证据](verification.md)                                                                                                                                           |
| 为什么是 Kysely + `node:sqlite`、为什么无 in-memory                                                                                                                                               | [D-026](../../../record/decisions/infrastructure-persistence-choices/README.md) 与[研究](../../../../research/agent-harness-persistence-and-identity-infra/research.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../spec/README.md)，采用选择回 [record/decisions](../../../record/decisions/README.md)。

D052已采用[宿主分发与共享开发工具](packaging.md)限定路径，尚待实现与实际归档验证；[跨OS现有宿主闭包实测](../../../record/evidence/2026-09-25-tests-tui-cross-os/README.md)不是最终打包器验证。

D055/D056 已采用并实施的维护提供者精化：[maintenance-binding](maintenance-binding.md)。

D055采用维护绑定和PF017 projection/v5；EC3/HT3已接受，维护源码与有限部署验证已完成，见[维护运行证据](../../../record/evidence/2026-09-26-tests-governance-maintenance/README.md)；实际公司部署与整机损毁灾备不在该验收范围。


## 2026-09-26 终审修补与最终制品

[最终固定输入、运行与独立QA](../../../record/evidence/2026-09-26-tests-governance-review-fixes/README.md)接续D055/D056与D057：生产闭包移除测试运行器，初始化未收场责任与叠加故障诊断修复，领域契约不变。18成员最终合并1926通过/34跳过，host最终单独重跑；两包清单、严格独立类型消费、47项独立制品旅程及真实首启故障恢复、三组跨OS与systemd通过。最终host r3、CLI r2的SHA/BUILD_ID在该run；旧记录不提升到新制品。Fable三轮及主线处置均有公开记录，未发现本期阻断。

限定：首次工作根创建须串行；原位源变动精确hash/fstat分支未独立验到；TUI仍限D054 profile，不是任意终端支持；恢复只隔离，同机备份不覆盖整机/磁盘毁损。公司实际部署、Agent工作会话与Web/desktop不属于本次验证。
