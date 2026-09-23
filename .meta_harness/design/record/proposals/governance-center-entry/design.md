# 治理中心入口层与运维面：落在 Cordis 装配的哪里、由谁拥有

- 状态：**候选**。主线裁定的方向是[候选 A](alternatives.md#候选-a)，**尚无接受**；本包不产生接受。
- 需求基准：[PF-017](../../../product/PF-017-governance-center-as-deployable-application/README.md) **rev 1，草稿，尚未接受**；
  本包对着的是它 2026-09-23 第二轮修订之后的正文（草稿内修订，不升 rev，见其 changelog）。
  依赖它的每一条都是候选依据，PF-017 接受之前不得驱动已接受设计。
  主线 2026-09-23 的产品层裁定已落进 PF-017 正文，本包直接引 PF 条款；标「主线裁定」的只剩契约层与实现层的裁定。
- 编号：本包的 INV-／SAF-／LIV-／P- 只在本包内有效，不进契约，也不对应任何别处的编号。
- 用词：「入口层」「运维面」「登录状态的出示物」「登录状态列表句柄」**尚无词条**，首次出现处标「（无词条）」。
  它们是本包对机制对象的描述，不是正式名；立词条还是作契约内部技术名，归统一语言的维护者判断。
  「客户端」「版本」「数据所在」按 PF-017 的日常义使用（该 topic 的 decisions §五有意不为它们立词条）。

## 需要作出的选择

[治理中心](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)作为一个应用有两张面，没有第三张
（[PF-017 §5.1](../../../product/PF-017-governance-center-as-deployable-application/design.md#51-中心有两张面没有第三张)）：
左边是客户端以一个[登录状态](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state)的名义进出治理事实的那一面，
右边是[运维者](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)在中心所在的机器上看部署事实的那一面。
本包要选的是：**这两张面的实现在 Cordis 装配里落在哪、由哪个节点拥有。**它分两个轴：

| 轴 | 问题 | 候选 |
|---|---|---|
| **入口层**（无词条） | 客户端 ↔ 中心的接入与身份核实——版本关、认人、按契约办事、答复映射——落在哪个运行单元、由哪个节点兑现 | [A](alternatives.md#候选-a) 独立 fiber，落 `packages/tenancy/governance-center-entry/`；[B](alternatives.md#候选-b) 并入 `apps/tenancy-host` 装配；[C](alternatives.md#候选-c) 拆成三扇门，各归一个领域插件 |
| **运维面**（无词条） | [治理中心体检](../../../ubiquitous_language/terms/reach-and-availability.md#ul-governance-center-health-check--治理中心体检--governance-center-health-check)的完整部分（只在中心所在机器上可读）落在哪 | A 同包内另一条 fiber，走只在本机可达的通道；[D](alternatives.md#候选-d) 进程内不设，由本机命令在进程外读状态记录并自己探存储 |

**受影响的可观察结果**：客户端对任何请求得到的是哪一种答复、四种不认的情形能不能被区分、中心会不会「能登录却答不出成员资格」、
运维者在中心所在的机器上能不能摸到任何一扇通向治理事实的门、完整体检说的是不是中心自己此刻看到的。

够不够得到入口层，由运维者把中心放在哪决定，产品不另设门槛（[PF-017 §2 部署前提](../../../product/PF-017-governance-center-as-deployable-application/design.md#部署前提)）。
所以入口层上除了认人没有别的门，本选择的任何候选也不得引入别的门。

**必须保留**：[下一节](#本选择要承载的性质)的性质表；五份已接受契约 v1 的公开面（[D-023](../../decisions/tenant-domain-design-acceptance/README.md)）；
Cordis 4.0.4 的内核语义（[D-025](../../decisions/cordis-adoption-version/README.md)）。
**可调整**：代码落在 `packages/` 还是 `apps/`、几条 fiber、运维面在不在进程内、[中心标识](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center-identifier--治理中心标识--governance-center-identifier)由谁铸造。

## 本选择要承载的性质

性质取自本批双盲领域读数（先于任何机制视角完成并封存），逐条追到右列的产品或契约条款；
读数本身是任务区过程材料，**依据是右列条款**。下表只列**保护点会随本选择移动**的那些。

| 编号 | 性质 | 观察者 | 依据 |
|---|---|---|---|
| INV-1 | **两张面，没有第三张**：读或改治理事实都经入口层并带恰一个登录状态（注册、登录与公开体检除外）；部署事实只经运维面；不存在「内部」「管理」「脚本专用」入口 | 运维者、同事、脚本 | [PF-017 §5.1](../../../product/PF-017-governance-center-as-deployable-application/design.md#51-中心有两张面没有第三张)、[§6.2](../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)；[PF-016 §6.5](../../../product/PF-016-cli-tui-delivery-surface/design.md#65-人能做的脚本能做脚本能做的人能做) |
| INV-2 | **中心标识**第一次启动成功时定下，此后不变，跟着数据走；两次从零首启得到不同的标识 | 客户端、同事 | [PF-017 §4 中心标识](../../../product/PF-017-governance-center-as-deployable-application/design.md#中心标识)、[§5.2](../../../product/PF-017-governance-center-as-deployable-application/design.md#52-中心的一生)、[§6.12](../../../product/PF-017-governance-center-as-deployable-application/design.md#612-同一个中心换了地址还是它另一个中心必须被认出来) |
| INV-3 | 中心的来往里**没有会话**，且来往总由据点一侧发起 | 同事 | [PF-016 §4 治理中心](../../../product/PF-016-cli-tui-delivery-surface/design.md#治理中心)、[§5.1](../../../product/PF-016-cli-tui-delivery-surface/design.md#51-三处地方各自拥有什么) |
| INV-4 | 过期与到期**只量中心的钟**：请求里不带任何参与判定的时间 | 同事 | [PF-017 §5.4](../../../product/PF-017-governance-center-as-deployable-application/design.md#54-中心自己的时间) |
| INV-5 | 完整体检是**中心此刻的自述**：数据所在够不够得着、时钟正不正常（含开着时往回倒了）、有没有遇到中心自身的故障，说的都是中心自己看到的 | 运维者 | [PF-017 §4 中心体检](../../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检)、[§6.6 末两段](../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)、[§6.10](../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走) |
| SAF-1 | **版本先行**：版本对不上只答「版本对不上」，不读出示物；公开体检不受这一关挡，且它与「版本对不上」的格式跨协议版本不变 | 客户端 | [PF-017 §6.4 ①](../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)、[§6.16](../../../product/PF-017-governance-center-as-deployable-application/design.md#616-版本对不上就明说)、[§6.17](../../../product/PF-017-governance-center-as-deployable-application/design.md#617-体检只说部署不说里面有谁)；格式不变是主线裁定（契约条款） |
| SAF-2 | **认人只有一条路**：三个出口，没有第四个；「客户端验过了」「刚才有效」「运维者放行」、来者的机器、程序与网络位置都不作数 | 同事、客户端 | [PF-017 §5.3](../../../product/PF-017-governance-center-as-deployable-application/design.md#53-认出一个来者只有一条路)、[§6.2](../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)、[§6.3](../../../product/PF-017-governance-center-as-deployable-application/design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数)；[IV S-21](../../../spec/data/identity-values/v1/contract.md#s-21-判定依据的构成封闭) |
| SAF-3 | **每次重看**：不跨请求缓存认人结果，撤销提交之后的下一次请求就被拒 | 持有者、撤销它的人 | [PF-017 §6.3](../../../product/PF-017-governance-center-as-deployable-application/design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数)；[AI S-17 幂等边界](../../../spec/capabilities/account-identity/v1/contract.md#s-17-校验登录状态)、[AI S-30 第 3 行](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) |
| SAF-4 | **判不了不下结论**：哪一步要查的东西此刻查不了（数据所在够不着、时钟读不到或往回倒了、中心自身的故障），就停在那一步答「答不出」；「答不出」优先于「无效」，绝不改说成「无效」或放行；不用查就判得了的照判 | 同事、客户端 | [PF-017 §6.4 ②④](../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)、[§6.6 末两段](../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来) |
| SAF-5 | **拒绝同形**：版本对得上、判得了时，入口四种不认的情形答复逐字相同，登录失败三种情形逐字相同 | 任何够得到中心的人 | [PF-017 §6.5](../../../product/PF-017-governance-center-as-deployable-application/design.md#65-拒绝的时候什么都不多说)；[PF-001 flows §2](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)、[AI S-22](../../../spec/capabilities/account-identity/v1/contract.md#s-22-账号存在性不从登录路径泄漏) |
| SAF-6 | **认出来者不削弱隔离**：交给领域操作的身份值只从认人结果推出，线上载荷里的身份值不作授权依据 | 同事、超管 | [SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant)；[PF-001 §6.4](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)；[OG S-42 第 8、9 行](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) |
| SAF-7 | **运维者没有门，超管没有部署的门**：运维面上没有任何治理操作；入口层上没有任何部署写操作，也读不到完整体检 | 运维者、超管 | [PF-017 §6.13](../../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)、[§5.5](../../../product/PF-017-governance-center-as-deployable-application/design.md#55-运维者与超级管理员两条线不交叉) |
| SAF-8 | **体检不越界，秘密不经产品的任何呈现与输出交出去**：公开部分恰三样；完整部分只在中心所在机器上可读；两部分都没有治理事实；任何答复与体检里都没有出示物、凭据与密钥的值；列出登录状态时给的是认得出是哪一个的条目，不是可以拿去用的东西；工程记录里不出现对端地址，账号与租户只以不可逆的关联号出现 | 运维者、任何读到输出的人 | [PF-017 §6.14](../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)、[§6.13 末段](../../../product/PF-017-governance-center-as-deployable-application/design.md#613-运维者没有任何一扇门通向账号能做的事)、[§6.17](../../../product/PF-017-governance-center-as-deployable-application/design.md#617-体检只说部署不说里面有谁)、[§8 两条硬要求](../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)；[PF-016 §6.11](../../../product/PF-016-cli-tui-delivery-surface/design.md#611-秘密不进任何一份呈现) |
| SAF-9 | **不半开**：中心要么答一切它拥有的事，要么整个问不到；缺一样就不起来 | 运维者、同事、客户端 | [PF-017 §6.6](../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来) |
| SAF-10 | **停机不留半个**：已确认的都在，没确认的等于没发生；运维者任何时刻都可以停 | 同事、超管 | [PF-017 §6.8](../../../product/PF-017-governance-center-as-deployable-application/design.md#68-停机已确认的都在没确认的等于没发生) |
| SAF-11 | **能力间内部面不直接暴露**：五份契约的服务面不是终端 API；只流向组合的操作与值到不了网络上 | 任何够得到中心的人 | [OG S-42 末段与第 4 行](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)；[AI S-30 第 6、8 行](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)；[AR S-25 第 7 行](../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) |
| LIV-1 | 带着有效登录状态来问事的人最终得到 PF-001 的答复。**前提**：中心在运行且够得着、数据所在够得着、时钟可读、版本对得上 | 同事 | [PF-017 §5.3](../../../product/PF-017-governance-center-as-deployable-application/design.md#53-认出一个来者只有一条路) |
| LIV-2 | 答过「答不出」之后，只要数据所在与时钟恢复，同一个登录状态照常能用，不需要重新登录。**前提**：同上，恢复之后成立 | 同事 | [PF-017 §6.4](../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复) |

**保护点不随本选择移动的**（不论选哪个候选都由同一个承载者兑现，本包不再比较）：
登录状态的效力只由退出与撤销改变、重启与升级后照旧（[AI v1](../../../spec/capabilities/account-identity/v1/contract.md#s-23-登录状态失效持久且只及被指定的那一个)；入口层不持有按请求保存的状态即可）；
到期只进不退（OE v1、AI v1 与 `infra/clock`）；部署密钥与部署参数的缺即不起（tenancy-host 的 config 政策）；
中心生来是空的（账号只从 AR v1 的注册主链产生，迁移不带种子数据）；一个中心一个部署（IV v1、AI v1 的存储唯一约束）；
升级整体成或整体不成（[PF-017 §6.9](../../../product/PF-017-governance-center-as-deployable-application/design.md#69-升级同一个中心要么整体成要么整体不成)；主线裁定由 tenancy-host 与 storage-sql 修订兑现）；
任何判定都不用比中心用过的最晚时刻更早的时刻，含开着时钟往回倒（[PF-017 §6.10](../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走)；主线裁定由 clock 节点补运行中判定）；
另一个中心必须被说出来、三类现读不拿副本放行（据点一侧，PF-016）。入口层对它们只做一件事：把各自的「不可用」映射成「答不出」。

## 现有能力如何承载

调查范围：五份已接受契约 v1（[D-023](../../decisions/tenant-domain-design-acceptance/README.md)），
[tenancy-host 节点](../../../realization/apps/tenancy-host/README.md)（candidate），
[apps/cli 节点](../../../realization/apps/cli/architecture.md#与其他应用的边)的两条待立边，basis 四条条目。范围之外没有调查，不据此断言别处没有承载。

| 要求 | 现有能力与精确契约 | 怎样组合、谁交接 | 未覆盖的承诺或缺口 |
|---|---|---|---|
| 认人：本中心签发、此刻有效 | [AI S-17](../../../spec/capabilities/account-identity/v1/contract.md#s-17-校验登录状态)：通过得 AccountId；失败恰为 `login-state-rejected`／`invalid-input`／`storage-unavailable`；不得缓存跨越一次准入 | 入口层对每个非豁免请求调一次，把结果映射成线上答复 | 「没带」在 S-17 没有对应输入，由入口层判；出示物表示层不合格与带了多个出示物，在线上并进「无效」（主线裁定）；把 S-17 的 `invalid-input` 并进「无效」这件事要在入口契约里写明与 [IV S-33](../../../spec/data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) 的关系——出示物是身份，不是输入 |
| 行事的身份值 | [OG S-36](../../../spec/capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)（LoginStateId → 当前租户身份）、AI S-17（→ AccountId） | 入口层先推导，再带身份值调领域面——正是 [OG S-42 第 8 行](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)写给入口层的那一步 | 按登录状态上**当前选中**的租户身份行事（[PF-017 §6.2](../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)）；请求显式带的租户身份与之不一致时怎么答，是 [PF-017 §9](../../../product/PF-017-governance-center-as-deployable-application/design.md#九未决项) 的未决项，归 PF-001 |
| 各操作的授权 | 各契约操作自己的前置 | 以推导出的身份值调用 | [OG S-22](../../../spec/capabilities/organization-governance/v1/contract.md#s-22-读组织)、[S-26](../../../spec/capabilities/organization-governance/v1/contract.md#s-26-成员资格判定)、[S-34](../../../spec/capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级)、[S-35](../../../spec/capabilities/organization-governance/v1/contract.md#s-35-层身份) 没有授权前置。主线裁定：线上投影补「调用方在该组织有效」，否则映射为 `notAuthorized`（依据 [PF-001 §6.4](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)） |
| 登录状态的列表与撤销 | [AI S-37](../../../spec/capabilities/account-identity/v1/contract.md#s-37-列出本账号有效登录状态) 返回 LoginStateId；[AI S-16](../../../spec/capabilities/account-identity/v1/contract.md#s-16-撤销登录状态) | — | 线上出示物若就是可列出的 LoginStateId，一次列表读就能拿走同账号其他设备的出示物——[PF-017 §8](../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)「不交出能直接用的凭证」这条硬要求正挡它。提案时的形状（线上出示物就是 LoginStateId，列表换成句柄）只挡得住线上那一半；同一条硬要求还说「中心存下来的登录状态，读到数据或备份的人不能直接拿去用」（[§6.14](../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者) 登录状态那一行同口径），AI 存下来的 LoginStateId 就是可用的出示物，那一半不成立。**已闭合**：产品负责人裁按业界做法办（PF-017 [INT-011](../../../product/PF-017-governance-center-as-deployable-application/interviews/2026-09-23-rulings.md)），[AI v2](../../../spec/capabilities/account-identity/v2/contract.md)（`candidate`）把出示物与 LoginStateId 分开——出示物是高熵秘密、只在签发那一次返回，存储里只有它的不可逆形式 LoginStateId，线上认人走 [S-44](../../../spec/capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)；列表句柄即 LoginStateId。它不随本选择的落点移动 |
| 内部面不直接暴露 | OG S-42 末段与第 4 行、AI S-30 第 6、8 行、AR S-25 第 7 行 | tenancy-host [已写明这句话](../../../realization/apps/tenancy-host/design.md#归装配的事项逐条承接) | **没有入口层，这句话没有承载者**；tenancy-host 把它记为缺口 |
| 版本关、公开体检、答复的先后 | 无 | — | **无承载者**：五份契约都不拥有线上版本，也不拥有「先核版本」这条次序 |
| 中心标识 | 无 | — | **无持有者、无铸造点**。约束：必须与治理事实在同一个存储里（放在库旁的文件里，只备份库就会丢掉它，「跟着数据走」不成立）；不得从部署密钥、地址或 fiber 的运行时身份派生 |
| 完整体检 | 无；`storage`、`clock` 两个现有服务面可以现读 | — | **无承载者**；「只在中心所在机器上可读」这条授权没有任何契约覆盖 |
| 不半开 | tenancy-host 的启动整体性：同步查 `PENDING` 判清单错误，任一 fiber 失败全撤、退出非零（[装载清单](../../../realization/apps/tenancy-host/design.md#装载清单与顺序)） | 入口层若是一条 inject 全部所需服务、排在最后的 fiber，就纳入同一整体性 | 取决于入口层是不是 fiber、排在哪 |
| 运维者没有门 | 无；内核在进程内不给访问边界（P-8） | — | 只能靠通道分离、静态检查、路由封闭三者一起 |

## 剩余责任与能力演化

| 剩余问题 | 关系 | 归属理由与消费者影响 |
|---|---|---|
| 把 AI、OG、AR 三份契约的操作投影到线上，并对每个请求施加同一条判定次序 | **组合 + 读面投影**。整体性质——判定次序、封闭的答复集合、拒绝同形——无法归属任一单方，因此是**一份组合契约**（主线裁定：`composition.governance-center-entry` v1） | 为什么不是三份能力条款、也不是一份 data 契约，见 [alternatives](alternatives.md#入口契约为什么是一份-composition-契约)。消费者：据点一侧的客户端代理（[apps/cli 两条待立边](../../../realization/apps/cli/architecture.md#与其他应用的边)），它们的契约坐标改指这一份 |
| 中心标识的形状、铸造点与持有者 | 随同一份组合契约（主线裁定：入口层持有一张一行的表，由入口层包导出迁移片段、装配合成） | 代价：一个投影层持有一条持久的部署事实，且面向网络的单元因此握着存储——见[候选 A 的反例](alternatives.md#候选-a) |
| 完整体检 | 同一份组合契约的运维面条款；提供者是同包内另一个插件 | 只读，不写任何持久事实 |
| 四条读面补授权 | 同一份组合契约的路由条款 | 不改 OG v1，补的是线上投影的前置 |
| 按登录标识指认被邀请者 | **不在本选择内**：要 AI 新版本加一个解析面 | 主线裁定：本程在入口契约里列为显式缺口，线上的邀请路由收 AccountId |

**为什么不是一个新的能力维度**：入口层有独立的变化原因（线上协议、版本、传输会独立地变），
但**进程内没有任何消费者 inject 它**——它的消费者在进程外，经协议来、不经 ctx；它也不拥有任何治理事实（中心标识是部署事实）。
所以它是一份组合契约的提供者：一条**不 provide 任何服务**的 fiber，契约是一份线上投影，不是一个 ctx 服务面。
正交性：它与三份领域契约之间只有单向依赖（它消费它们的服务面，它们不知道它），变化隔离在「线上怎么说」这一侧，
领域语义的变化以领域契约的新版本进来、在入口契约里以一条路由的增改体现。

## 取舍入口

四个候选的承载、失去的保护点、反查信号与可计数代价，以及推荐与改票条件，在 [alternatives.md](alternatives.md)。
**推荐不是接受。**

## 装配草图

本节可独立引用。它描述**候选 A**——主线裁定的方向，尚未接受——在 tenancy-host 进程里的形状。
服务名、插件名、表名都是候选名，沿各节点现有的候选；精确形状归将立的提供者节点。

### 装载顺序

```text
tenancy-host 进程（一个根 Context；本版单机、一个进程、一个存储）
│
├─ [起 Context 之前]  解析配置：存储方言与位置；部署密钥（四份 PEM + 配对自检）；
│                     五项部署参数（缺一不可）；入口层与运维面的监听配置
│                     —— 任何一项失败都不启动，不留下任何东西
├─ [迁移之前]         只读核对：数据格式版本能否接手、时钟有没有倒退（主线裁定的 tenancy-host 修订）
├─ [迁移]             合成的迁移：AI、OG、clock 的片段 + 入口层包导出的 governance_center 片段
│                     —— 整体成或整体不成（同一修订）
├─ storage-sql        provide storage
├─ clock              inject storage          ; provide clock
├─ credential-verif.  provide credentials
├─ account-identity   inject storage, clock   ; provide accounts, logins
├─ org-governance     inject storage, clock, accounts, logins
│                     ; provide organizations, memberships, offers, organization-purge
├─ account-registr.   inject accounts, organizations, organization-purge ; provide registration
├─ 运维面              inject storage, clock   ; effect：只在本机可达的通道
└─ 入口层              inject logins, registration, organizations, memberships, offers, storage,
                             credentials（只为等它就位）, clock（只为启动时等钟就位）
                      插件体：绑定监听（先不分派）→ 读或铸中心标识 ＝【首次启动的提交点】→ 开始分派
                      判定：公开体检 → ① 版本 → ② 认人 → 身份推导 → ③ 办事 → 答复映射
```

- **入口层排在最后，是有意的**：它开始分派的那一刻，就是「中心起来了」的那一刻（[PF-017 §6.6](../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)）。
  在它之前任何一步失败，外面看到的都只是「问不到」，没有半开的中心。
- **运维面排在入口层之前**：反过来排，运维面失败时入口层已经在分派了，就是半开。
- 各领域 fiber 的 inject 列表按各自节点的依赖表原样；本草图只新增最后两行。
- **入口层 inject 八个服务**，其中 `credentials`、`clock` 两个只为让门等它们就位。代价：这八个提供者任一换代，都会让入口层这一面关门再开；本版装配不换代。

### 入口层与六条领域 fiber 的关系

| fiber | 入口层是否 inject | 投影到线上的 | **有意不投影的**（依据） |
|---|---|---|---|
| `storage` | 是，**只为中心标识那一张表** | 无 | 不开任何存储级的面 |
| `clock` | 是，**只为启动时等钟就位**；入口层自己不读钟 | 无 | 客户端的钟不参与判定（INV-4） |
| `credentials` | 是，**只为等它就位**：AI 在调用时才解析 `credentials`、不 inject 它，入口层 inject 它，门就不会在凭据校验缺席时开着；入口层自己不调用它 | 无 | 经 AI 间接使用 |
| AI（`accounts`、`logins`） | 只 inject `logins` | [S-15](../../../spec/capabilities/account-identity/v1/contract.md#s-15-验证凭据并签发登录状态) 登录（不经 ②）；S-16 退出与撤销、S-37 列出（线上给句柄，不给出示物）；S-17 作为 ② 来用（[AI v2](../../../spec/capabilities/account-identity/v2/contract.md) 起 ② 改走 S-44，判定同 S-17） | [S-13](../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)、[S-14](../../../spec/capabilities/account-identity/v1/contract.md#s-14-激活账号)、[S-38](../../../spec/capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 只归 AR；[S-18](../../../spec/capabilities/account-identity/v1/contract.md#s-18-读账号) 不上线（AI S-30 第 6 行靠不暴露兑现）；「按登录标识找账号」没有这个面 |
| OG（四个面） | 三个面：`organizations`、`memberships`、`offers` | 除下列两条外的全部 23 个操作；四条读面补授权 | [S-20](../../../spec/capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 只归 AR 的注册主链——它与别的操作同在 `organizations` 面上，只能靠路由表封闭加结构检查；[S-53](../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)（`organization-purge`）不 inject、不引用；残留清扫一类方法不上线 |
| AR（`registration`） | 是 | 注册（不经 ②）；入口层负责表示层校验（[AR S-2 注册入口那一行](../../../spec/compositions/account-registration/v1/contract.md#s-2-参与方与精确承诺)） | 清除链不上线 |

**路由规模**（以 v1 契约操作计）：27 条契约操作投影（AI 3、AR 1、OG 23）加公开体检 1 条；其中注册、登录、公开体检 3 条不经 ②。

### 判定次序与答复

线上答复是一个封闭集合：「版本对不上」「无效」「答不出」「输入不合格」四种，加上领域操作原样透传的具名结果。
候选字面 `version-mismatch`、`login-state-rejected`（沿用 AI S-17 的字面）、`unavailable`、`invalid-input`，由入口契约定稿。

1. **公开体检**：不看版本，也不看出示物；答在不在（只说中心在应答）、中心标识、版本三样——数据所在够不着时照样答得出，
   标识与版本在中心起来时就已载入（[PF-017 §4 中心体检](../../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检)、[§6.17](../../../product/PF-017-governance-center-as-deployable-application/design.md#617-体检只说部署不说里面有谁)）。
2. **① 版本**：对不上就只答「版本对不上」，**连出示物都不读**（[§6.4 ①](../../../product/PF-017-governance-center-as-deployable-application/design.md#64-无效与答不出是两个不同的答复)）。
3. **注册与登录**：过了 ① 先看输入的格式，不合格 ⇒ 「输入不合格」；合格就办。带了出示物也不看，不因它放行，也不因它拒绝
   （[§6.2 例外的边界](../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)、§6.4 ④）。
4. **② 认人**（AI S-17）：
   - 没带、从没签发过、已退出或撤销、别的中心签的、出示物在表示层就不合格、带了不止一个 ⇒ **逐字相同的「无效」**
     （后两种并进「无效」是主线裁定，契约条款）；
   - `storage-unavailable` ⇒ 「答不出」；
   - 「没带」不用查就判得了，所以中心别的都判不了的期间，没带出示物的来者照样得「无效」，带了的一律得「答不出」（§6.4 ②、[§6.5](../../../product/PF-017-governance-center-as-deployable-application/design.md#65-拒绝的时候什么都不多说)）。
5. **身份推导**：推导时判不了 ⇒ 「答不出」。
6. **③ 办事**：认出人之后才看输入，格式不合格 ⇒ 「输入不合格」——它属于第 ③ 步，**不是认人的第四个出口**（§6.4 ④、[§5.3 末段](../../../product/PF-017-governance-center-as-deployable-application/design.md#53-认出一个来者只有一条路)）；
   领域操作返回的「不可用」⇒ 「答不出」；其余具名结果按 PF-001 原样呈现；
   中心自身的故障（不是「不可用」）⇒ 对来者答「答不出」，在完整体检里可见（[§6.6](../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)）。

**不论在哪一步，要查的查不了就停在那一步答「答不出」，绝不改说成「无效」；不用查就判得了的照判**（看格式、看带没带都不用查）。
「答不出」对来者不带原因——「此刻能不能答」只在完整体检里（§4 中心体检、§6.17）。
「逐字相同」覆盖协议层可观察的整份答复，不只是一句文案；时序侧信道与 [AI S-3](../../../spec/capabilities/account-identity/v1/contract.md#s-3-明确不承诺什么) 同口径不在承诺内（主线裁定）。

在 ② 与 ③ 之间登录状态被撤销：领域操作照常执行——撤销只影响下一道尚未通过的准入（[AI S-29](../../../spec/capabilities/account-identity/v1/contract.md#s-29-撤销不等于强制停止)）。
若 ③ 本身又现读了登录状态（OG S-36、S-37），就按它的 `loginStateNotValid` 映射成「无效」。

### 身份推导

交给领域操作的每一个身份值，**都从认人的结果推出来**：AccountId 取自 ② 的结果；
租户身份经 OG S-36 取登录状态上当前选中的那一项（[PF-017 §6.2](../../../product/PF-017-governance-center-as-deployable-application/design.md#62-中心只认登录状态不认客户端)）。
**线上载荷里的身份值本身从不当作授权依据。**线上的 TenantId 按 [IV S-7](../../../spec/data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式) 的规范形式传，
带判别式的身份原样保留、不压平成两个可空字段（[IV S-16](../../../spec/data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值)）；
请求里显式带来的捕获值只核对、不替换，也不在下游就地重取当前租户身份（[IV S-28](../../../spec/data/identity-values/v1/contract.md#s-28-当前租户身份在创建那一刻捕获)）。

### 「能力间内部面不直接暴露」怎样在结构上成立

1. **进程里只有一个网络监听，它属于入口层。**领域包不持有任何监听。候选检查：`tenancy/*` 不得引入网络监听一类的模块，入口层包除外。
2. **路由表是一张封闭的、逐条写明的映射**：每条路由对应一个契约操作，附身份推导、补授权与失败映射。
   **不设泛化的分派器**（「按名字调 ctx 里某个服务的某个方法」）——有了它就等于把服务面直接暴露出去。
   候选检查：入口层里没有以动态名字解析服务的调用。证据：一个遍历全部路由的测试，断言除三条豁免路由外，不带出示物的请求一律得到「无效」。
3. **每条非豁免路由都在分派之前经过 ②**。形状上，分派函数只接受一个「已核实的调用方」值，而这个值只能由 AI S-17 的结果映射构造出来。
4. **排除清单靠结构检查守**。现有 `restricted-call-sites` 规则把 `.produce(` 与 `'organization-purge'` 限定在 AR，
   但**它只扫 `packages/`**（[tenancy-host 承接表 AI S-30 第 8 行](../../../realization/apps/tenancy-host/design.md#归装配的事项逐条承接)）。
   入口层放在 `packages/` 下即被覆盖；主线已排扩展：覆盖入口层包，再加 `createPersonal(`、`activate(`、`purge(` 三个方法的限定。
5. **运维面是另一条通道**，上面没有任何治理路由。

### 运维面

- **只 inject `storage` 与 `clock`**，用来现读「数据所在够不够得着」「时钟正不正常」；**不 inject、也不引用任何治理服务**。能承受重跑。
- **一个 effect 打开只在中心所在机器上可达的通道**，disposer 关闭它。候选机制是用文件权限挡住非运维者的本机套接字——机制归将立的提供者节点。
  **不用「按对端地址放行」**：那是把网络位置当资格（IV S-21；PF-017 §6.2），所以运维面不能是入口层监听上的一条路由。
- **启动时就定的常量由装配作为 config 传进来**：这次什么时候起来的、部署密钥在不在与完整不完整（启动时载入的结果，[PF-017 §6.14](../../../product/PF-017-governance-center-as-deployable-application/design.md#614-产品不把任何秘密的值交给运维者)）、每一项部署参数此刻的值。
  **秘密的值不在传入之列**。要现读的是「此刻能不能答」那一组：数据所在够不够得着、时钟正不正常（含开着时往回倒了）、有没有遇到中心自身的故障（[§4 中心体检](../../../product/PF-017-governance-center-as-deployable-application/design.md#中心体检)）。
- **它不写任何持久事实。**
- **说实话的一点**：Cordis 在进程内不给访问边界——同一棵 Context 树里任何插件都能解析到根层 provide 的服务（P-8），
  用 isolate 做访问控制是冒充隔离（[`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md)；[IV S-23](../../../spec/data/identity-values/v1/contract.md#s-23-不得冒充隔离)）。
  所以「运维者没有门」**靠的不是内核**，而是三件事一起：通道分离；运维面插件的传递 import 图里不出现任何治理服务名或类型（静态检查）；通道上没有任何映射到治理操作的路由。
- **入口层遇到的「中心自身的故障」怎样到达完整体检，承载者未定**（见[交接缺口](#交接缺口)）。

### 启动与撤除的提交点

- **首次启动的提交点**：入口层插件体里「铸中心标识」那一次存储写。之前任何一步失败，就还没有中心标识，下次启动仍算第一次。
  迁移可能已建好空表——产品上看不见，但要算进「整体成或整体不成」（主线裁定的 tenancy-host 修订）。
- **后续启动**：读到中心标识就不再铸，同一份数据就是同一个中心。插件体因此可重复执行（读或铸是幂等的），重跑不会换标识。
- **插件体失败**：绑定监听或读铸标识失败 ⇒ 插件体抛出 ⇒ fiber `FAILED` ⇒ 已注册的 effect 收回、监听关闭 ⇒ 整个装配启动失败（P-6）。
- **撤除次序**：入口层（停止接收 → 有界地等在途请求 → 关闭，**三步放在同一个 effect 里**，因为不同 effect 之间的释放是并发的，P-2）
  → 运维面 → 六条领域 fiber 按清单逆序（[tenancy-host 已有](../../../realization/apps/tenancy-host/design.md#成对的装载与撤除)）。
  「运维者任何时刻都可以停它」由那个有界的等待兑现；等待上界沿用 tenancy-host 的撤除总超时（候选常量，未定）。
- **撤除之后仍然为真的**：全部治理事实与中心标识都在存储里；入口层没有任何按请求保存的状态。
  在途请求里的领域操作按各自那一次提交收场（[AI S-28](../../../spec/capabilities/account-identity/v1/contract.md#s-28-依赖不可用撤除与重启时的在途归属)、[OG S-43](../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)）；
  客户端可能收不到确认——这正是 [PF-017 §6.8](../../../product/PF-017-governance-center-as-deployable-application/design.md#68-停机已确认的都在没确认的等于没发生) 那张表写的「要么在、要么不在」。
- **崩溃**：入口层没有需要恢复的东西；领域侧按 tenancy-host 原样处理。

### 跨进程这条边：哪些保证要由协议重新兑现

**这条边只把「调用方」搬到了进程外，领域没有被拆开。**六条领域 fiber 仍在一个进程、一个存储、一口钟里，
所以那些靠「同一存储、同一提交、同一时钟」给出的保证在这条边上**不失效**，仍由装配给。
需要协议重新兑现的，只有**和调用方身份有关、和流向调用方的值有关**的那几行，逐行写进入口契约的「装配给／协议给」表：

| 契约与行 | 协议要做什么 |
|---|---|
| [AI S-30](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) 第 3 行（撤销立刻生效） | 中心一侧 δ＝0：每个请求现读 S-17，入口层不跨请求缓存认人结果——写成协议条款。据点上的副本是 PF-016 已接受的代价，不属于 δ |
| AI S-30 第 6 行（持有 AccountId 即可读） | 靠不暴露兑现：S-18 不上线，线上任何 AccountId 都不作行事依据。只要线上不出现 S-18，本版不必为这一行发 AI v2 |
| AI S-30 第 8 行（`identifier-held-by-expired-record` 只流向组合） | 结构上兑现：入口层从不调 S-13，`restricted-call-sites` 覆盖入口层 |
| [OG S-42](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 第 4 行、[AR S-25](../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 第 7 行（S-53 只由清除链调用） | 结构上兑现：入口层不投影 S-53，也不引用 `organization-purge` |
| OG S-42 第 5、6 行（成员资格与当前租户身份的可见性） | 中心一侧 δ＝0：入口层不缓存 |
| OG S-42 第 8、9 行（调用方身份已核实，含十一条读面） | **这条边的核心**：每个请求都带出示物，入口层重新鉴别，身份值按上文推导规则得出；四条没有授权前置的读面由协议补授权 |
| AR S-2 注册入口那一行 | 表示层校验归入口层；`identifier-held-by-expired-record` 在结构上到不了入口层；四个终结结果原样呈现，`interrupted` 不改写 |
| [IV 第六节](../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)：S-7、S-16、S-28 | 见上文「身份推导」 |
| IV S-19（读不到即明确失败） | 「答不出」是一个显式的线上答复；客户端代理把传输层故障映射到同一个分支——那一侧不在本程实施边界内，协议条款仍要写 |
| IV S-20、S-23 | 入口层是远端接收边界，每个请求重新鉴别（[IV S-30](../../../spec/data/identity-values/v1/contract.md#s-30-跨边界须重新验证)）；**判定仍在各 owner 的数据访问层**，入口层不替它们判，也不声称自己提供了隔离 |
| IV S-21 | 对端地址、客户端程序、机器一律不作资格 |
| [IV S-27](../../../spec/data/identity-values/v1/contract.md#s-27-每道准入现读) | 入口层不缓存授权判定；将来要缓存，须写明失效条件与最大陈旧窗口 |
| IV S-33 | 入口层有自己的表示层校验（版本信封、出示物形状、载荷形状）；出示物那一支按 PF-017 §6.5 并进「无效」，与 S-33 的关系在入口契约里写明 |
| [OE S-17](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 五行 | **不触发**：钟与存储都没有拆开，客户端的钟不参与判定 |

其余各行（标识唯一、激活后立刻可见、前置与写入同提交、释放后立刻可再注册、至少一位超管、上级链不成环、个人组织一一、交接凭证不可伪造、IV 第六节的唯一性各行）
在这条边上仍由装配给，协议不必做任何事——前提是入口层不做「先查再写」的预检，注册只经 AR。

## 为什么不拆、为什么不并

下面每一条可以单独引用。

1. **入口层是一条 fiber，不按契约拆成 AI 门、OG 门、AR 门。**
   PF-017 §5.3 规定「认出一个来者，只有一条路」，§5.1 说「多一张面，就多一条没人复核的路」。
   版本关、认人、「答不出优先于无效」这几条次序必须对**每一个**请求都一样；拆成三扇门就要三份同样的次序，只要有一份漏了 ① 或 ②，就没人看得见。
   OG 的门反正要调 AI S-17 来推导身份，拆开以后三扇门也不独立；它们也没有各自独立的消费者或变化原因——协议版本一变，三扇一起变。
   完整的比较见[候选 C](alternatives.md#候选-c)。
2. **监听与判定不拆成两条 fiber。**没有判定，监听什么都答不了；没有监听，判定无事可做。两者没有独立的生命周期。
   换传输（HTTP 换成别的）是包内一道适配边界的事，不是 fiber 边界的事。
3. **入口层不并进 tenancy-host 作为装配的一节。**
   (a) 它承载必须写进契约的语义——三个出口、拒绝同形、判定次序、身份推导、补授权、失败映射；
   应用节点不持有能力语义、装配胶水不得暗中拥有未定义能力（[realization 准入](../../../realization/README.md#准入门槛与停止条件)、[红线](../../../realization/AGENTS.md#红线)）。
   (b) 变化原因不同：入口层随线上协议变，装配随存储、时钟、密钥与清单变。
   (c) `restricted-call-sites` 只扫 `packages/`，入口层放进 `apps/` 就脱离了守 AI S-30 第 8 行与 OG S-42 第 4 行的那道检查——
   **这一条是可计数代价，不是排除理由**：把规则的扫描范围扩到 `apps/tenancy-host` 就补回来了。排除靠的是 (a) 与 (b)。
   「由 tenancy-host 的装载清单装它、排在最后」仍然是装配的事。完整的比较见[候选 B](alternatives.md#候选-b)。
4. **入口层不并进 AI、OG、AR 中任何一个插件。**它横跨三份契约；并进任何一个，门就随那个 owner 的重跑掉线，
   而且 OG S-42 那条「内部面」保证要求门**在各 owner 之外**。
5. **运维面不并进入口层的 fiber。**§5.1 规定两张面，§5.5 规定两条线不交叉。
   「没有门」只有在运维面所在的单元不引用任何治理服务时才检查得了，而 Cordis 在进程内不给访问边界（P-8）。
   运维面走另一条通道，变化原因也不同（部署事实，不是治理契约）。
6. **中心标识不作为服务进 ctx。**它运行期间不变，没有行为；启动时读或铸一次，当常量交给入口层（公开体检）与运维面（完整体检）。
7. **认人不走事件，是入口层里一次显式的、会被等待结果的调用。**判定只有一个权威（AI），没有一组可插拔的监听者；
   一个派发点在零监听者时要解释成放行还是拒绝，这本身就是第四个出口；显式调用的失败集合是封闭的，事件没有；
   [OG S-41](../../../spec/capabilities/organization-governance/v1/contract.md#s-41-本版不开控制类事件) 写明本版不开控制类事件。
   将来若出现参与放行的扩展点（例如限流，本版非目标），只能用 `serial`，不得用 `bail` 或 `emit`（[`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md)）。
8. **入口层必须 inject 它所依赖的服务，不能改成调用时再解析。**inject 让门**只在这些服务的提供者全部就位时才开**，
   否则停在 `PENDING`，tenancy-host 把它判为清单错误，「要么整个起来」于是有了结构上的支撑（P-5）。
   运行中要分清两件事：
   - **换代**（某个被 inject 服务的提供者被换掉，或离开 `ACTIVE`）⇒ 入口层卸载重跑，门关上再开（[`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）；
   - **不可用**（提供者仍在 `ACTIVE`，只是这一次调用返回「不可用」，例如存储此刻读不到）只表现为返回值，不卸载任何东西 ⇒ 门开着，答 `unavailable`（「答不出」）。

   改成调用时解析，门可以在某个服务的提供者缺席时照样开着，就是半开。
   入口层能承受重跑：插件体只做「读或铸标识、打开监听」两件事，请求之间没有闭包状态；重跑时在途请求握着旧的服务引用，按旧实例的返回收场。

## 依赖的上游机制语义

| # | 主张 | basis 条目 | 状态 |
|---|---|---|---|
| P-1 | 必需服务换了提供者，插件体先卸载再重跑（入口层、运维面能承受重跑；门随被消费服务的缺席关上） | [`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md) | 条目，probe 在 4.0.4 上通过 |
| P-2 | 不同 effect 之间的释放是并发的，只有同一个 effect 内部逆序；「停止接收 → 等 → 关闭」要放在一个 effect 里 | [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) | 条目，probe 通过 |
| P-3 | 异步控制不能用 `bail`，要用 `serial`；`emit` 丢弃返回值 | [`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md) | 条目，probe 通过 |
| P-4 | isolate 隔离实例的可见性，不隔离数据；不能拿它做访问控制 | [`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md) | 条目，probe 通过 |
| P-5 | `inject` 没有可选形式；必需服务缺席即停在 `PENDING` | 无 | **待核对主张**：`core/kernel-basis` 的 probe `inject-has-no-optional-form` 已在 4.0.4 上通过，尚未升格为 basis 条目（主线已排升格） |
| P-6 | 插件体或 config 抛出 ⇒ fiber `FAILED`，不 provide | 无 | **待核对主张**：probe `plugin-throw-fails-fiber` 已通过，尚未升格（同上） |
| P-8 | 同一棵 Context 树里任何插件都能解析到别处 provide 的服务；进程内没有访问边界 | 部分见 P-4 条目的解析规则 | **待核对主张**：kernel-basis 的 probe 覆盖了「解析兄弟插件 provide 的服务」，尚未升格（主线已排） |
| P-9 | 内核不提供跨进程身份与可见性、权限边界、可靠投递、背压 | 无 | **假设**：出自 handbook 的内核负面清单，basis 没有条目 |
| P-10 | fiber 的运行时身份只在本次注册表内有效，不能当持久身份（中心标识不能从它派生） | 无 | **假设**：同上 |
| P-11 | 本机套接字可以用文件权限只让运维者访问 | 无 | **假设**：与平台有关；本版不承诺 Windows，与 apps/cli 同口径 |

## 证据义务与受阻消费

| 依赖的性质与前提 | 保护者 | 所需证据 | 当前结果与闭合条件 |
|---|---|---|---|
| SAF-1、SAF-2、SAF-4、SAF-5 判定次序、三个出口、拒绝同形 | 入口层 | 遍历全部路由：除三条豁免外，不带出示物一律「无效」；四种不认情形的整份线上答复逐字比较；判不了时带有效与带已撤销出示物都得「答不出」；版本对不上时四种来者都只得「版本对不上」、公开体检照常 | 未开始。受阻：入口契约未立、包未建、PF-017 未接受 |
| SAF-9 不半开 | tenancy-host + 入口层 | 拿掉任一被 inject 的服务 ⇒ 入口层 `PENDING` ⇒ 启动失败；插件体抛出 ⇒ 启动失败；入口层开始分派时六条领域 fiber 与运维面都已 `ACTIVE` | 未开始；前提 P-5、P-6 升格 |
| SAF-11 内部面不直接暴露 | 结构检查 | `restricted-call-sites` 覆盖入口层包；加三个方法限定；「`tenancy/*` 不引入网络监听模块」新规则；各带「故意违反就失败」自测 | 未开始（主线已排） |
| SAF-7 运维者没有门 | 运维面插件 + 结构检查 | 运维面插件的传递 import 图不出现治理服务名与类型；本机通道上的操作枚举不含治理操作 | 未开始 |
| INV-2 中心标识 | 入口层 | 首启铸造、重启不变、从备份恢复后相同；两次从零首启不同（有界场景） | 未开始 |
| SAF-8 秘密不进输出 | 入口层、运维面、观测 | 线上答复与两部分体检的字段枚举；日志中搜出示物、凭据与密钥的值 | 未开始 |
| SAF-10 停机不留半个 | 入口层的撤除 effect | 在途请求有界等待后关闭；回执到达前停机，那份邀请要么完整在、要么完全不在 | 未开始 |

以上全部以 PF-017 被接受为消费前提；在那之前可以起草契约与节点、跑独立于它的结构检查，但不登记绑定。

## 交接缺口

- **PF-017 rev 1 已于 2026-09-23 由产品负责人接受**（[decisions §一](../../../product/PF-017-governance-center-as-deployable-application/decisions.md)）；本包引用的锚点与措辞以接受时的正文为准，它再升 rev 时要重核。
- **存下来的登录状态能不能直接拿去用——已闭合**：[PF-017 §8](../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖)「不交出能直接用的凭证」有两半——
  线上不交出，以及「中心存下来的登录状态，读到数据或备份的人不能直接拿去用」。提案时的形状（线上出示物就是 LoginStateId）只满足前一半，
  而 AI v1 的 S-37 要在进程内返回 LoginStateId，提供者也就不能只存它的摘要。这不是本选择的落点问题，三个入口层候选都一样。
  闭合方式：产品负责人裁按业界做法办（[INT-011](../../../product/PF-017-governance-center-as-deployable-application/interviews/2026-09-23-rulings.md)），
  发 [AI v2](../../../spec/capabilities/account-identity/v2/contract.md)（`candidate`）把出示物与 LoginStateId 分开，入口契约钉 v2。
- **入口层遇到的「中心自身的故障」怎样到达完整体检，承载者未定**。候选：入口层以通知类事件（`emit`）报告、运维面计数；或由装配提供一个诊断汇。
  选哪一个归将立的提供者节点；若走事件，它是通知不是控制。
- **入口层持有 `storage` 的访问范围**：它是进程里唯一面向网络的单元，只为一张一行的表而握着存储。
  建议加一条结构检查——入口层包只触碰 `governance_center` 表；否则它握着一条绕过 AI、OG 的原始存储通路。
- **请求显式带的租户身份与所选不一致时怎么答**：[PF-017 §9](../../../product/PF-017-governance-center-as-deployable-application/design.md#九未决项) 的未决项，归 PF-001；入口契约在它裁定之前按当前选中的办，并把这一格写成显式缺口。
- **按登录标识发邀请**：要 AI 新版本的解析面（授权条件：调用方已过认人）；标识上挂着一条未激活记录时发邀请的人看到什么，报 PF-001／PF-016。
- **PF-003 的两项部署参数没有消费者**：主线裁定由装配校验并保存，记为入口契约之外的契约缺口。
- **传输选择未定**：HTTP/1.1 + JSON、本机套接字是 realization 的候选，由将立的提供者节点定并记候选；与 [cli-tui 提案 D11](../cli-tui/alternatives.md#d11-线上协议与认证) 的候选同向，二者都未被接受。
- **防冒充**：[PF-017 §8](../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖) 把它定为对技术设计的硬要求——客户端必须能确认连上的真是那个中心，确认不了就不交出登录状态、不接答复。
  契约写这条性质；机制归 realization，主线裁定它的材料是部署配置输入（与 TLS 证书同类），不算部署密钥。确认失败时客户端怎么呈现归 PF-016。
- **撤除总超时的值**：沿用 tenancy-host 的候选常量，未定。
- **P-5、P-6、P-8 升格为 basis 条目**：主线已排；升格前绑定只能引 kernel-basis 的 probe 作待核对主张。
