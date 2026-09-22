# tenancy-host 的形状

每一节都是「引用 + 本应用的选择」。**租户领域在产品上是什么归
[PF-001](../../../product/PF-001-identity-scope-and-agent-constraints/README.md)；边上的保证归五份契约；
采用理由归[决定](../../../record/decisions/README.md)。本页不复述它们，也不在它们之外另立一份语义。**

**本页对本应用进程的称呼「tenancy-host 进程」是本页给进程起的名字，不是概念**；
它与 PF-016 所称的[治理中心](../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)（「治理事实所在的那一处」，不是进程）
之间的关系**未裁**，见[非目标](#交付面与非目标)末行。

## 交付面与非目标

本节点承接 [PF-001 身份、范围与对 Agent 的约束](../../../product/PF-001-identity-scope-and-agent-constraints/README.md)（rev 15）
的[投影 v1 第 3 步](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#8-实施顺序)：
把租户领域的六个 provider 与四个基础设施 provider 装进**一台机器上的一个进程**，给它们真实的存储、时钟与密钥。
**它是一个采用型装配**：不选产品政策，不拥有能力语义，每一处选择都指向决定或某个 provider 节点。

**与形状相关的非目标**：

| 本节点不做什么 | 为什么 |
| --- | --- |
| **不写入口层身份核实** | 登录态怎样从客户端到达本进程、`LoginStateId` 怎样换成身份值再调治理面，取决于客户端与据点进程之间**尚未起草的契约**（`apps/cli` 节点已标「待立」）。这半件事阻断的是把本进程暴露成终端 API 的那一步，**不阻断第一程**——第一程的消费者是各节点的场景演练，它们在进程内直接调服务面 |
| **不跑 pg** | [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md#选择与范围)：pg 方言本程只接线；第一次跑 pg 归第二程或更晚 |
| **不做密钥轮换** | 无需求；[identity-values 节点](../../packages/core/identity-values/design.md#交接凭证走签名不走进程内登记)把「不轮换」记为本版选择。重生密钥的后果写在 [design.md](design.md#密钥装配两对-ed25519-密钥作为部署配置输入) |
| **不建任何定时器** | 残留清扫（[OG G-13](../../../spec/capabilities/organization-governance/v1/contract.md#十一已知缺口)）与清扫提供者（[AR G-6](../../../spec/compositions/account-registration/v1/contract.md#九已知缺口)）本版都不建；后者连枚举读面都没有 |
| **不切进程、不做远端代理** | 本版单机一个进程（[SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)）；跨进程的全部保证归各契约「协议给」那一列（投影 [Q-8](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)） |
| **不裁本应用与治理中心的关系** | 承载治理中心的应用无交付面 PF，`apps/cli` 节点已把它记为缺口。本节点是租户领域提供者在单机上的宿主装配；它是否就是那个应用（或其一部分），等产品为治理中心开题。**在此之前本节点不与 `apps/cli` 建边的对端身份** |
| **不画拓扑总图** | 总图由 [views](../../../views/README.md) 从各节点 join，[不手写](../../AGENTS.md#红线) |

## 拓扑与进程模型

**进程模型：待交付面 PF。**第一程没有独立进程——本节点交付的是一个 `boot()`／`dispose()`（候选名），
**只在各节点的测试进程里被内嵌调用**；怎么起（systemd／容器／手动）、怎么停、信号处理、退出码，都等承载治理中心的应用开题后随它的 PF 定。
下表写的是「有进程时它是什么样」，**本版没有一行是已存在的**。

| 进程 | 生命周期与所有者 | 承载什么 | 崩溃或退出时谁收口 |
| --- | --- | --- | --- |
| **tenancy-host 进程**（待交付面 PF） | **本版不存在**；有进程时由运维起、运维停。启动是一个整体：任一 fiber 启动失败或清单错误（`PENDING`）⇒ 撤除已装的、退出非零（[design.md](design.md#成对的装载与撤除)） | 一个 Cordis `Context`，按顺序装 `storage` → `clock` → `credentials` → `account-identity` → `organization-governance` → `account-registration`；一个 sqlite 文件库（WAL）；四份密钥 PEM 只在两个持钥插件与一个核实插件的 config 里。**租户领域的全部事实都在存储里**，进程不持有任何只活在内存里的领域事实（[AI S-28](../../../spec/capabilities/account-identity/v1/contract.md#s-28-依赖不可用撤除与重启时的在途归属)、[OG S-43](../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)） | 在途调用按各自那一次存储提交收场（内核不取消在途调用）；sqlite 由 WAL 恢复到最后一个完整提交；`clock_lease` 未收回 ⇒ 下次启动至多等一个租约宽度（[clock 节点](../../packages/infra/clock/design.md#状态并发与失败映射)）。**退出不是取消、不是失败** |

**没有子进程、没有工作线程。**`scrypt` 是 CPU 密集计算，credential-verification 节点把并发上限归装配的运维关注点；本版不做限流，记在[实施缺口](design.md#实施缺口与消费者影响)。

### 与其他应用的边

**只写本侧。**对端由对端节点写；`apps/cli` 节点在它那一侧写了「据点 → 治理中心」两条边并把对端记为「尚无节点」——本节点**不认领**那个对端身份（见非目标末行），下表因此只有一行，且契约坐标之外的部分全是「待立」。

| 边 | 对端 | 契约坐标 | 本侧责任 |
| --- | --- | --- | --- |
| 进程外调用方 → 本进程：账号身份、注册、组织治理与邀约 | **尚无节点**——谁是调用方（`apps/cli` 的据点进程或别的应用）取决于治理中心开题；线上协议**待立：治理契约线上投影协议**（拟议名，与 `apps/cli` 节点同名） | `capability.account-identity/v1`、`composition.account-registration/v1`、`capability.organization-governance/v1`、`data.identity-values/v1`、`data.offer-expiry/v1` | 本侧是提供方。**本版这条边不存在**：五份契约的服务面是能力间内部面，[OG S-42 末两行](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)明写它们**不得被直接暴露成终端 API**，前面必须有一层做身份核实的入口——那层本版不写。协议立起来时，AI S-30、OG S-42、AR S-25、OE S-17 右列的每一行都要在这条边上由协议重新兑现，[IV S-30](../../../spec/data/identity-values/v1/contract.md#s-30-跨边界须重新验证) 要求接收边界重新鉴别 |

## 交互面

**本版没有人用的面，也没有脚本用的领域面**——五份契约的服务面只在进程内被解析。本节登记两个入口与归属：

| 面 | 入口 | 语义归谁 | 精确形状归谁 |
| --- | --- | --- | --- |
| **领域操作的入口层**（人或脚本经客户端到达本进程） | **本版无** | 各契约的操作；产品含义归 [PF-001](../../../product/PF-001-identity-scope-and-agent-constraints/README.md) 与相关 PF | **待立：治理契约线上投影协议**（拟议名）——含入口层的身份核实。在它之前本进程没有对外入口 |
| **运维用**：一次性密钥生成 | 第一程是一个导出函数（候选 `generateKeyFiles(dir)`），调 identity-values 的 `generateHandoffKeyPair()` 两次，写四份 PEM 文件；命令形态 `tenancy-host keygen` 随进程形态一起等交付面 PF（[design.md](design.md#密钥装配两对-ed25519-密钥作为部署配置输入)） | 密钥是部署配置输入（[identity-values 节点](../../packages/core/identity-values/design.md#依赖作用域与绑定)）；本函数不持有语义 | **待立：不是契约**——它是本应用的运维入口，形状随源码定，本节点只登记它存在与它产出什么 |

**调试流与结构化日志不在上表**：启动失败要落一条结构化记录（哪条 fiber、什么原因、**不含密钥材料**），责任归
[可观测要求](../../../foundation/observability-and-logging/requirements.md)，不归本页新立一套。

## 包分层与依赖规则

产品包按 `packages/<能力族>/<职责包>/` 两层；第一层 `core`／`tenancy`／`infra` 的判据在
[realization README](../../README.md#packages-的两层布局)。下表是本应用的装配对象；**各包内部的设计归它自己的节点**。

| 层 | 包 | 可以依赖 | 不可以依赖 |
| --- | --- | --- | --- |
| 应用装配 | `apps/tenancy-host`：装载清单、config 解析与密钥配对自检、**迁移合成**（次序 + 跨 owner 外键的目标与名字）、密钥生成函数 | 下面各层全部 | 被任何包反向依赖 |
| 领域 · 组合 | `packages/tenancy/account-registration` | `tenancy/account-identity`、`tenancy/organization-governance` 的服务面类型、`core/identity-values`、`core/kernel-basis` | `infra/*`、存储协议 |
| 领域 · 能力 | `packages/tenancy/account-identity`、`packages/tenancy/organization-governance`、`packages/tenancy/credential-verification`；**AI、OG 第二程各导出自己表的迁移片段**（OG 的是工厂，收外键目标与名字作参数，**不 import AI 的包**） | `core/*`（含 `core/storage` 的协议与错误类型） | `infra/*`——它们 inject 的是**服务名**，不 import 提供者包；彼此之间不 import 对方的迁移 |
| 基础设施提供者 | `packages/infra/storage-sql`、`packages/infra/clock`（后者导出 `clockLeaseMigration`） | `core/storage`、`core/kernel-basis`、`core/offer-expiry`（`Clock`／`Instant` 形状） | `tenancy/*`；任何业务表 |
| 核心与共享 | `packages/core/identity-values`、`core/offer-expiry`、`core/storage`、`core/kernel-basis` | 彼此之间按各节点依赖表 | `tenancy/*`、`infra/*`；`kernel-basis/testing` 不得被产品代码 import |
| 内核 | `@deepseek-ai/cordis` 4.0.4 官方包 | — | — |

**三条依赖方向的规矩：**

1. **迁移片段在各 owner 包，合成在 `apps/tenancy-host`**——表是 owner 事实的存储形状，列跟着 owner 变，片段放在 owner 包里让「迁移随 owner 列变化同步修改」这条代价落在同一个包、同一次修改；跨 owner 那条外键与合成次序只有装配同时看得见两边（[core/storage 节点](../../packages/core/storage/design.md#表结构不在协议里由装配层迁移建立两节点同一约束域)、[design.md 迁移的所有权](design.md#迁移的所有权)）。代价不因此消失：被外键引用的列改名不在编译期暴露，靠本节点的外键存在性与约束名测试在 CI 里挡。
2. **密钥只出现在三个 config 对象里**：`account-registration` 的 config 持 `activation` 私钥，`organization-governance` 的持 `purge` 私钥，`account-identity` 的持两把公钥；**不经任何服务、不进 ctx**。
3. **`tenancy/*` 与 `infra/*` 之间没有 import 边**，只有 Cordis 服务名（`storage`、`clock`）——换提供者只改本应用的装载清单。

## 技术栈采用

**下表每一行的状态都不是「已经这么做了」，而是「这一版装配选了什么」。**「已采用」只到采用方向：
没有一行的实现存在，也没有一行被验证。精确版本从承载仓库根 `pnpm-workspace.yaml` 的 catalog 读（纯文本指认）。

| 选型点 | 采用 | 精确版本 | 状态 | 依据 |
| --- | --- | --- | --- | --- |
| 内核 | `@deepseek-ai/cordis` 官方发布包，直接采用；插件形态经 `core/kernel-basis` 的 `definePlugin` | 4.0.4 | 已采用 | [D-025](../../../record/decisions/cordis-adoption-version/decision.md) |
| 查询层与迁移 API | Kysely（含它的 `Migrator`／`MigrationProvider`），只因「只改配置切 pg」这一条要求 | 0.29.6 | 已采用 | [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md) |
| 开发期存储 | sqlite 文件库，驱动 Node ≥ 24 内置 `node:sqlite`（`infra/storage-sql` 自写薄 Driver）；WAL、`synchronous=NORMAL`、`foreign_keys=ON` | 随 Node `>=24 <25`（承载仓库 engines） | 已采用 | [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md) |
| 生产期存储 | PostgreSQL 经 Kysely 内置方言 + `pg`；**本程只接线不跑** | `pg` 8.23.0 | 已采用 | [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md) |
| in-memory 存储 | **不提供**；测试对着 sqlite 临时文件库 | — | 已采用 | [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md) |
| 时间源提供者 | `packages/infra/clock`（单调钟锚定 + 存储里写在前的租约；机制归该节点，**该节点尚未被接受**） | — | 已采用 | [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md) |
| 交接凭证的不可伪造 | 签名而非进程内登记，原语 Node 内置 `crypto`（Ed25519 由 identity-values 节点定） | 随 Node 24 | 已采用 | [D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md) |

**不在上表、因为既无决定也无提案的选择**（本节点只能记为候选，理由与落选方在 design.md）：
密钥下发路径（环境变量 / 文件路径，`_FILE` 惯例）、config 校验库（zod，经 `definePlugin`；kernel-basis 节点记「采用版本无决定」）、
测试运行器（vitest，仓库统一）。闭合条件：主线立提案或决定后本表加行。

## 分发与升级

- **安装渠道与进程管理：未钉。**本版无分发承诺；第一程的消费者是各节点的场景演练，它们在测试进程里起本装配。
- **平台**：随 `node:sqlite` 与 Node `>=24 <25`；WAL 要求同一主机、共享内存可用（[研究](../../../../research/agent-harness-persistence-and-identity-infra/research.md#sqlite-运行参数在三家-tsrust-实现里一致)）。
- **存储带迁移登记**：Kysely `Migrator` 的登记表在库里，启动时在 `provide('storage')` 之前跑合成后的迁移；**本节点不提供回滚**——片段带不带 `down` 归各 owner（clock 的带），合成后只调 `migrateToLatest`；sqlite 的 DDL 不在事务里，失败靠幂等重跑收口。
- **升级时的语义保证不归本页**：撤除次序与在途工作的收场在 [design.md](design.md#成对的装载与撤除)；跨版本的协议协商归那份待立的契约。
- **密钥文件与库文件的备份、权限与迁移是运维约定**；本节点只规定文件权限的检查（[design.md](design.md#密钥装配两对-ed25519-密钥作为部署配置输入)）。
