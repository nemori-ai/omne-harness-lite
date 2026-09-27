# 块 A 资产的能力拆分：几份能力、几个 Cordis 插件、落在哪

- 状态：**候选**。主线裁定的方向是[候选 B](alternatives.md#候选-b)，**尚无评审、尚无接受**；本包不产生接受，接受走 [record/decisions](../../decisions/README.md)。
- 需求基准：[PF-002](../../../product/PF-002-assets-settings-and-permissions/README.md) rev 16、[PF-003](../../../product/PF-003-asset-transfer-and-sharing/README.md) rev 4、
  [PF-001](../../../product/PF-001-identity-scope-and-agent-constraints/README.md) rev 16（§6.1、§6.7 为主责）；
  邻接 [PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md) rev 5（§5.6、§6.9、§6.17）与 [PF-017](../../../product/PF-017-governance-center-as-deployable-application/README.md) rev 2（§6.6）。
- 编号：本包的 INV-／SAF-／LIV-／P-／O-／N-／H-／MR-／X- **只在本包内有效**，不进契约，也不对应任何别处的编号。
  O-1～O-22 与 N-1～N-7 沿用本批机制读数的序号以便对照，**含义以本包为准**；N-8 是本包新增。
- 用词：本包的「插件」**一律指 Cordis 插件**；资产的那一类写作 `plugin` 类资产（[UL-plugin](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-plugin--插件--plugin)，不是 Cordis 插件）。
  **尚无词条**、首次出现处标「（无词条）」的：资产提供者（本包对中心那个插件的候选称呼）、求值输入快照、据点上的中心事实副本、注册表、
  复制通知、分享邀请、分享（确认之后那份获权记录）、落地。它们是本包对机制对象的描述，不是正式名；立词条还是作契约内部技术名，归统一语言的维护者判断。
  复制通知与分享邀请是[邀约](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-offer--邀约--offer)四样中的两样；本包说「邀约」时只指这两样（资产流转契约里写作「待确认件」）。

## 需要作出的选择

[PF-002](../../../product/PF-002-assets-settings-and-permissions/README.md) 与 [PF-003](../../../product/PF-003-asset-transfer-and-sharing/README.md) 带进来的对象，
经机制分解之后（[对象与落点](#对象与落点可独立引用)）只有两个落在 #8——**具体资产**与[资产持有](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-holding--资产持有--asset-holding)；
[资产复制](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-copy--资产复制--asset-copy)与[资产分享](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-sharing--资产分享--asset-sharing)是挂在它们上面的显式扩展（#2），其余全是数据与纯计算。
本包要选的是：**这些责任切成几份能力契约、由几个 Cordis 插件兑现、各自落在哪一处进程与哪个包。**它有三个轴：

| 轴 | 问题 | 候选 |
|---|---|---|
| 纯部分的落点 | 数据形状与四步求值做成两侧都 import 的纯模块，还是做成某个插件的服务 | 纯模块（B、C、E）；中心插件的服务（A）；据点插件的服务（D） |
| 中心插件的切线 | 中心那一侧的治理与流转是一个插件还是两个；两个的话沿什么切 | 一个（A、B、D）；沿契约切成治理与流转（C）；沿对象切成记录与持有（E） |
| 契约数 | 资产治理与资产流转是两份能力契约还是一份 | 两份（A～E）；一份（[B 的契约层变体](alternatives.md#候选-b-的契约层变体两份能力契约并成一份)） |

**受影响的可观察结果**：一次复制或分享被确认之后，目标组织看到的是完整的一份还是什么都没有；再复制会不会冲掉目标组织自己的配置；
目标组织能不能从任何读面推出源；治理中心问不到时已经开着的会话还能不能照常求值；设置页上与 agent 眼前的「这份来自哪一层」是不是同一个答案。

**必须保留**：[下一节](#本选择要承载的性质)的性质表；已接受契约的公开面——`data.identity-values` v1、`data.offer-expiry` v1、`capability.organization-governance` v1（[D-023](../../decisions/tenant-domain-design-acceptance/README.md)）与
`composition.governance-center-entry` v1（[D-028](../../decisions/governance-center-design-acceptance/README.md)）；Cordis 4.0.4 的内核语义（[D-025](../../decisions/cordis-adoption-version/README.md)）；不提供 in-memory 实现（[D-026](../../decisions/infrastructure-persistence-choices/README.md)）。
**可调整**：契约数、插件数与切线、纯部分做模块还是服务、包布局与名字（领域名待拍板，见[下文](#待产品负责人拍板领域名与包布局)）。

## 本选择要承载的性质

性质取自本批双盲领域读数（先于任何机制视角完成并封存），逐条追到右列的产品或契约条款；读数本身是任务区过程材料，**依据是右列条款**。
下表只列**保护点会随本选择移动**的那些。

| 编号 | 性质 | 观察者 | 依据 |
|---|---|---|---|
| INV-1 | **确认一次成立，撤回、到期、资产没了之后什么都没有**：一份复制通知（无词条）被确认，目标组织要么同时得到那一版（首次另加血缘与持有）且通知成为已确认，要么两样都没有；一份分享邀请（无词条）被确认，分享（无词条）记录、被分享方那一层的持有与邀请的已确认同成同败 | 目标组织超管、发起者 | [PF-003 flows §3.4](../../../product/PF-003-asset-transfer-and-sharing/flows.md#34-一份待确认的邀约复制通知与分享邀请同形)、[§3.2](../../../product/PF-003-asset-transfer-and-sharing/flows.md#32-一段分享关系)；[AT S-18](../../../spec/capabilities/asset-transfer/v2/contract.md#s-18-确认是一次提交同一落点的确认序列化)、[S-22](../../../spec/capabilities/asset-transfer/v2/contract.md#s-22-确认复制) ④、[S-26](../../../spec/capabilities/asset-transfer/v2/contract.md#s-26-确认分享) ④ |
| INV-2 | **资产记录与持有的结构不变量**：已发布版本不变、版本线只增且编号连续；所有者至多变一次；一格一个能力标识至多一份持有 | 选用某一版的消费方、审计者、目标组织 | [PF-002 flows §3.3](../../../product/PF-002-assets-settings-and-permissions/flows.md#33-一个资产定义的版本)；[PF-001 §6.7](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)；[AM S-9](../../../spec/data/asset-model/v2/contract.md#s-9-版本线)、[S-7](../../../spec/data/asset-model/v2/contract.md#s-7-所有者至多变一次)、[S-18](../../../spec/data/asset-model/v2/contract.md#s-18-资产持有) |
| INV-3 | （推导）**持有的使用权来路与记录此刻的所有者对得上**：一份资产从租户提升到组织，原租户那一格不再以「自己拥有」持有它 | 设置页上的成员、审计者 | [PF-001 §6.7](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#67-创作与归属)（提升是一次交付，所有权易手）；[AM S-19](../../../spec/data/asset-model/v2/contract.md#s-19-使用权来路)（`owned` 只在所有者那一格）；使用权来路的五支（[MR-8](#本包依赖的主线裁定尚无决定记录)）。**产品正文没写提升时持有怎么变**，本行是推导（[X-2](alternatives.md#仍待区分的事项)） |
| INV-4 | **目标侧拿不到源**：复制下来的那份对目标组织只显示「由某租户在某时送进来第几版」；任何读面都给不出源记录号与源组织 | 目标组织 | [PF-003 §4 复制血缘](../../../product/PF-003-asset-transfer-and-sharing/design.md#复制血缘)；[AT S-10](../../../spec/capabilities/asset-transfer/v2/contract.md#s-10-复制血缘怎么判怎么记)、[S-34](../../../spec/capabilities/asset-transfer/v2/contract.md#s-34-装配给的保证-vs-协议须给的保证) 末行；[AM S-22](../../../spec/data/asset-model/v2/contract.md#s-22-血缘号与分享号) |
| INV-5 | （推导）**同一份输入，两处给同一个答案**：设置页上看到的「这份来自哪一层、替换了哪一层、这一项取什么值」，与据点装配时实际用上的，在输入相同时一致 | 成员、管理员、经 meta 能力查看的 agent | [PF-002 §5.5](../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)（替换在设置页与 meta 能力两处都必须可见）、[「组织的设置」是视图](../../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)、[§6.1](../../../product/PF-002-assets-settings-and-permissions/design.md#61-设置页是长出来的不是画出来的) |
| SAF-1 | **指向已不在的资产的邀约确认不下去**：资产被删除、或被所有者那一层移除之后，确认被拒且说它已失效；不出现「先确认成功、再当场失败」 | 接收方 | [PF-003 §6.14](../../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)、[flows §二](../../../product/PF-003-asset-transfer-and-sharing/flows.md#二分支与异常)；[AT S-7](../../../spec/capabilities/asset-transfer/v2/contract.md#s-7-两类待确认件共用的过期语义)、S-18；[`data.offer-expiry/v1#S-10`](../../../spec/data/offer-expiry/v1/contract.md#s-10-接受操作在同一提交内重新求值) |
| SAF-2 | **再复制不碰目标组织的配置**：不改目标侧任何持有与配值（含 immutable），不覆盖无血缘的同标识资产 | 目标组织 | [PF-003 §6.7](../../../product/PF-003-asset-transfer-and-sharing/design.md#67-覆盖的范围内容覆盖配置不动)、[§6.8](../../../product/PF-003-asset-transfer-and-sharing/design.md#68-能力标识撞车但没有血缘)；[AT S-11](../../../spec/capabilities/asset-transfer/v2/contract.md#s-11-复制的收场) |
| SAF-3 | **被分享方移除，一并干净**：分享的结束与被分享方那一层的持有、配值消失同成同败 | 被分享方 | [PF-003 flows §1.7](../../../product/PF-003-asset-transfer-and-sharing/flows.md#17-结束一段分享)；[AT S-29](../../../spec/capabilities/asset-transfer/v2/contract.md#s-29-移除收到的分享) ④；[资产移除](../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-removal--资产移除--asset-removal) |
| LIV-1 | **治理中心问不到时，已经开着的会话照常求值**：装配、reload、每一次使用前的权限读照常进行，用据点上的副本。**前提**：副本存在（据点装配给，[MR-3](#本包依赖的主线裁定尚无决定记录)）；它可能已旧，这是已接受的代价 | 会话里的人 | [PF-016 §6.17](../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)、[§6.9](../../../product/PF-016-cli-tui-delivery-surface/design.md#69-需要现读成员资格的那几件事不拿副本放行)（会话里的一切不问中心）、[§5.6](../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧)；[PF-002 §4 工作区](../../../product/PF-002-assets-settings-and-permissions/design.md#工作区)（目录在据点）；[治理中心](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)「它不知道任何会话」 |

**保护点不随本选择移动的**（五个候选都由同一个承载者兑现，本包不再比较）：

- 同一 (源记录, 目标组织) 至多一份带血缘的目标记录、同一 (资产, 被分享方) 至多一份生效分享——同键写入由存储序列化（AT S-18；P-1）；
- 团队 → 团队复制的确认与隶属解除——确认事务取组织治理的隶属哨兵（[MR-2](#本包依赖的主线裁定尚无决定记录)），五个候选都要组织治理节点配合（[X-1](alternatives.md#仍待区分的事项)）；
- 分享在使用时失效、不靠事件（[AT S-9](../../../spec/capabilities/asset-transfer/v2/contract.md#s-9-分享此刻是否生效)、[S-31](../../../spec/capabilities/asset-transfer/v2/contract.md#s-31-隶属解除分享在使用时失效不靠事件)；[og S-40](../../../spec/capabilities/organization-governance/v1/contract.md#s-40-事件都是通知)）——读时谓词，求值那一侧判；
- 中心不半开（[PF-017 §6.6](../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)；[gce S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)）——入口层 inject 全部面；
  **C、E 多出来的插件同样被入口层 inject，任一个缺席中心整个不起来**，这使它们的「失败隔离」在本版没有可观察的收益（[alternatives](alternatives.md#候选-c)）；
- 没有只活在运行实例里的事实、没有定时器承担正确性（[AT S-37](../../../spec/capabilities/asset-transfer/v2/contract.md#s-37-本能力自己被撤除替换或重启)；[`data.offer-expiry/v1#S-9`](../../../spec/data/offer-expiry/v1/contract.md#s-9-读时派生且派生状态不回退)、[`#S-18`](../../../spec/data/offer-expiry/v1/contract.md#s-18-后台清理不担正确性)；D-026）；
- 治理变化只作用于下一道尚未通过的准入（[PF-001 §6.6](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止)）；
- 确认成功之后目标组织下一次求值即用到落地的内容（[AT 第七节](../../../spec/capabilities/asset-transfer/v2/contract.md#七性质与前提)）——前提在求值一侧（持有上的版本选用，[MR-7](#本包依赖的主线裁定尚无决定记录)）。

## 对象与落点（可独立引用）

对象从[领域对象条目](../../../domain_objects/objects.md)起步（UL-asset、UL-asset-version、UL-workspace、UL-tenant、UL-organization）；
条目以外的按需补入。落点**从 0 往 8 问，第一个「是」就停**；下表只写有信息量的否定理由，#3～#7 对持久记录一律否的理由写在 O-2 一行。

| # | 对象 | 落点 | 为什么是这个落点 | 存放侧 |
|---|---|---|---|---|
| O-1 | 能力标识 | #1 数据 | 纯值，无生灭、无可见性边界 | 两侧 |
| O-2 | 具体资产（记录：所有者、作者、来源、血缘、当前草稿） | **#8**（锚：资产提供者） | #1 否：有写路径与不可逆转移（提升、删除），有所有权边界。#2 否：没有现成服务覆盖创作、发布、提升，组织治理不拥有资产。#3 否：持久事实，不随 fiber 生灭（basis [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)「已知的误用」）。#4 否：它是事实不是通知。#5 否：不是依赖边。#6 否：各组织、各租户的记录是数据不同，不是实现不同（basis [`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md)）。#7 否：没有独立于存储的运行期资源，生灭是数据状态。**#8 是**：变化原因独立（PF-001 §6.7、PF-002 §4、[flows §1.7](../../../product/PF-002-assets-settings-and-permissions/flows.md#17-创作一个资产)），消费者独立（中心治理面、据点经快照取、流转） | 中心 |
| O-3 | 资产版本 | #1 | 生灭包含在 O-2 之内；「发布」是 O-2 服务的条款 | 中心；据点可按 (记录, 版本号) 长期缓存（推导：已发布不可变） |
| O-4 | 资产正文（八类） | #1 | 形状归各类正文契约 | 随 O-3 |
| O-5 | 属性声明 | #1 | 由正文按确定规则推出；**MCP 的逐动作权限项另要对端动作清单的快照**，投影的输入不止正文 | 纯派生 |
| O-6 | 资产持有 | **#8**，与 O-2 **同一插件**（[N-1](#n-1-资产治理与资产流转契约两份提供者一个插件)、[N-8](#n-8-具体资产与资产持有不拆成两个插件)） | #1 否：同一份资产被多个范围各自持有、各自加入、禁用、移除，有自己的生灭、写路径与范围可见性边界。#2～#7 同 O-2。#8 判据成立，但与 O-2 之间有同一提交（提升、复制落地、「资产没了」），不单立插件 | 组织层、租户层在中心；工作区层见 O-14 |
| O-7 | 属性配值 | #1 | 生灭包含在 O-6 之内（持有没了配值跟着没）；配值、清除、加锁、解锁是 O-6 服务的条款 | 随 O-6 |
| O-8 | 官方件集合 | #1 | 随产品版本发布的数据；由装配启动时登记进中心存储，不是运行时操作（[MR-5](#本包依赖的主线裁定尚无决定记录)） | 中心登记；据点随程序带同一份（推导） |
| O-9 | 一次资产复制（复制通知及其落地） | **#2**：资产提供者上一个以独立契约文本公开的面 | #1 否：有待确认段、会过期、有终结。#2 是：效果写在 O-2、O-6 的存储事实上，授权前提与失败模式是新条款、单独公开，不是悄悄扩大服务责任。**不到 #8**：消费者与 O-2、O-6 是同一批（中心治理面经入口层），且有同一提交 | 中心 |
| O-10 | 复制血缘 | #1 | O-2 上的字段，首次复制时写、此后血缘号不变 | 中心 |
| O-11 | 一段资产分享 | **#2**（同 O-9） | 同 O-9；**此刻是否生效是读时谓词**（[AT S-9](../../../spec/capabilities/asset-transfer/v2/contract.md#s-9-分享此刻是否生效)；[iv CS-4](../../../spec/data/identity-values/v1/contract.md#cs-4-分享边界有共同上级)），不是存储状态 | 中心 |
| O-12 | 成员资格效力与上级链判定 | #0 | 指得出原文：[og S-26](../../../spec/capabilities/organization-governance/v1/contract.md#s-26-成员资格判定)、[S-34](../../../spec/capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级)；块 A 只消费 | 中心（组织治理） |
| O-13 | 工作区登记（无词条） | 块外 | 没有登记动作：工作区在会话创建时指定即存在；据点上一份「用过的工作区」清单只供交付面给默认值，不是治理事实（[MR-10](#本包依赖的主线裁定尚无决定记录)） | 据点 |
| O-14 | 承载清单与工作区层读入结果 | #1 | 文件内容与由它派生的值；读文件是装配里的一段 I/O。**不建文件监听**：产品只认装配与 reload 两个时刻 | 据点 |
| O-15 | 会话层设置值 | #1 | 会话记录上的字段（PF-015 的 owner），块 A 只消费；带能力标识（[MR-4](#本包依赖的主线裁定尚无决定记录)） | 据点 |
| O-16 | 求值（四步）与生效结果 | #1 | 纯计算。**#1 在 #8 之前问**：无生命周期、无可见性边界，所以不因为「有独立变化原因、有多个消费者」升到 #8——那是 #8 的判据，前面全否才轮到它 | 两侧，同一份代码 |
| O-17 | 求值输入快照（无词条） | 中心半 #2（快照面）；据点半块外 | 中心半在一次读事务里取齐持有、记录与分享此刻是否生效；据点半（副本 ＋ 工作区读入 ＋ 会话值 ＋ MCP 动作清单）归据点装配（MR-3） | 中心／据点 |
| O-18 | 属性投影视图（「组织的设置」） | #1 | 持有集合上的函数；建成对象就是第二份权威 | 读面 |
| O-19 | 资产领域的变化通知 | #4 通知，`emit` | 不是事实本身；没有谁凭返回值放行；到不了据点（H-2） | 中心进程内 |
| O-20 | 据点上的中心事实副本（无词条） | 块外 | 归据点装配，读面 ＝ 入口契约的查询面 ＋ 本地缓存（MR-3） | 据点 |
| O-21 | MCP 凭据 | 引用 #1；本体块外 | 配值里是不透明引用（[AM S-23](../../../spec/data/asset-model/v2/contract.md#s-23-凭据引用)）；本体存哪、怎么续期归 MCP 桥接的提供者设计 | 引用随 O-7 |
| O-22 | 过期邀约与休眠持有的后台整理 | #9 | 可见性整理与存储回收，不担正确性（`data.offer-expiry/v1#S-18`）；若建，也走与读写同一个判定 | 中心 |

**分布**：#0 ×1 · #1 ×12（O-1、3、4、5、7、8、10、14、15、16、18、O-21 的引用）· #2 ×3（O-9、O-11、O-17 中心半）· #4 ×1 · **#8 ×2（O-2、O-6，同一插件）** · #9 ×1 · 块外 ×2 又两个半（O-13、O-20；O-17 据点半、O-21 本体）。**共 22 个对象。**
#3、#5、#6、#7 为零是有意的：租户、组织、工作区之间的差别全是数据。块 A 的结构性改动只有**中心侧一个新插件**；其余是数据与纯计算，两侧共用。

## 现有能力如何承载

调查范围：本工作树的 `spec/`、`realization/`、`record/decisions/`（2026-09-23）。**范围外**：同批起草、不在本工作树的 `capability.asset-governance` v2 与 `capability.asset-evaluation` v2（本包只按契约身份称呼、不链接），块 B/C/D 的契约。

| 要求 | 现有能力与精确契约 | 怎样组合、谁交接 | 未覆盖的承诺或缺口 |
|---|---|---|---|
| 记录、版本、持有、配值、血缘、承载清单的形状 | [`data.asset-model` v2](../../../spec/data/asset-model/README.md)（candidate） | 三份能力契约引用它的 `$defs` 名 | 它的 [G-2（版本选用）与 G-3（使用权来路）](../../../spec/data/asset-model/v2/contract.md#八已知缺口)挡住求值第 3 步与工作区读入；主线已给出形状（MR-7、MR-8），尚未落进契约 |
| 复制与分享：两类邀约、分享、血缘判定、流转边界 | [`capability.asset-transfer` v2](../../../spec/capabilities/asset-transfer/README.md)（candidate） | 确认的落地写在资产治理的存储对象上 | [S-2](../../../spec/capabilities/asset-transfer/v2/contract.md#s-2-本契约不拥有什么) 与 [S-4](../../../spec/capabilities/asset-transfer/v2/contract.md#s-4-依赖方向与被消费的面) 末两表把落地写成「组合资产治理的写面」，[G-10](../../../spec/capabilities/asset-transfer/v2/contract.md#十一已知缺口)登记对方的落地面未定——**这正是本选择要回答的** |
| 创作、发布、提升、删除、持有与配值的写面与读面 | `capability.asset-governance` v2（起草中，不在本工作树） | — | 无可引用条款 |
| 四步求值与承载清单读入 | `capability.asset-evaluation` v2（起草中，不在本工作树） | — | 无可引用条款 |
| 成员资格、角色、组织变体、上级链 | [og v1](../../../spec/capabilities/organization-governance/README.md) [S-22](../../../spec/capabilities/organization-governance/v1/contract.md#s-22-读组织)、[S-26](../../../spec/capabilities/organization-governance/v1/contract.md#s-26-成员资格判定)、[S-34](../../../spec/capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级)（accepted） | 资产一侧 inject 读面，每道准入现读（[iv S-27](../../../spec/data/identity-values/v1/contract.md#s-27-每道准入现读)） | 团队 → 团队复制与隶属解除要一个共同存储对象：[og 节点](../../../realization/packages/tenancy/organization-governance/design.md#对存储提供者的要求清单) R-3b 的隶属哨兵只为它自己的 S-32／S-33 设（MR-2、X-1） |
| 邀约的过期 | [`data.offer-expiry` v1](../../../spec/data/offer-expiry/README.md)（accepted） | 整块引用，读时派生 | 存在性读面归持有该对象的契约（AT S-7 已承担） |
| 身份值与隔离 | [`data.identity-values` v1](../../../spec/data/identity-values/README.md)（accepted） | 纯函数 `shareAncestor` 等 | — |
| 中心装配、迁移合成、同一存储 | [apps/tenancy-host](../../../realization/apps/tenancy-host/README.md)（assembled） | 装载清单、owner 导出迁移片段由装配合成 | 装载清单与迁移合成里没有资产一侧；官方件的启动登记没有步骤 |
| 客户端到中心的路由 | [gce v1](../../../spec/compositions/governance-center-entry/README.md)（accepted） | 入口层 inject 领域面、逐条投影 | [路由表封闭](../../../spec/compositions/governance-center-entry/v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读)，资产各面要 v2 |
| 据点侧的装配、注册表、放行与副本 | 无（候选 `apps/runtime-host` 未建） | — | 求值契约的「装配给」各行（副本新鲜度、两侧同一份代码）没有承接者 |

## 剩余责任与能力演化

| 剩余问题 | 关系 | 归属理由与消费者影响 |
|---|---|---|
| 资产记录与持有的治理：创作、发布、提升、删除、加入、移除、禁用、锁替换、配值 | **新增** `capability.asset-governance` | 组织治理不拥有资产（它的事实是组织、成员关系、邀约、当前租户身份）；把资产写进 og 等于让 PF-002 的变化原因改一份已冻结的 v1。消费者：入口层（中心治理面）、据点副本经快照面 |
| 跨组织流动：复制通知、分享邀请、分享、血缘判定、流转边界 | **新增** `capability.asset-transfer`（已有候选契约） | 变化原因是 PF-003；**与资产治理由同一个提供者兑现**（[N-1](#n-1-资产治理与资产流转契约两份提供者一个插件)） |
| 四步求值与承载清单读入 | **新增** `capability.asset-evaluation`，提供者是**纯模块** | handbook [能力覆盖与演化](../../../../agents/skills/harness-design-handbook/canonical/references/decompose.md#新维度怎样获得依据)：纯计算可通过输入输出关系定义契约；同输入同输出，两侧 import（[N-2](#n-2-求值不做插件不进-ctx)） |
| 静态形状 | `data.asset-model`（已有候选） | 数据契约，不需要插件（[AM「这份契约拥有什么」](../../../spec/data/asset-model/v2/contract.md#这份契约拥有什么)） |
| 中心那一半求值输入 | **读面投影**：资产治理的快照面 | 在一次读事务里取齐持有、记录与分享（N-3） |
| 据点那一半求值输入、中心事实副本 | **组合**：据点装配（MR-3），不另立契约 | 另一半输入（工作区文件、会话值、MCP 动作清单、离线副本）都在据点（N-3、N-7） |
| 客户端够得到资产各面 | **组合**：入口契约出 v2 追加路由 | 五个候选共有，不影响本选择 |

**正交性**（按 [能力维度的正交性](../../../../agents/skills/harness-design-handbook/canonical/references/architecture/modeling/capabilities.md#能力维度的正交性)四条）：
责任可分别定义——资产治理拥有记录与持有，资产流转拥有邀约、分享与血缘对应，求值不拥有任何事实；
变化可被边界隔离——PF-002 的规则、PF-003 的规则、求值的层序各自变；
交互明确——资产流转的确认要与资产治理的写**共一次提交**，这是两者之间**唯一**的正交性上限，也正是它们由同一个提供者兑现的理由；
独立演化——两份契约各自出版本，提供者共用。**契约切分不等于插件切分**：正交是契约层的判断，插件边界还要看同一提交落在哪。

## 取舍入口

五个候选的承载、失去的保护点、反查信号与可计数代价，以及推荐与改票条件，在 [alternatives.md](alternatives.md)。**推荐不是接受。**

## 装配草图（可独立引用）

本节可独立引用。它描述**候选 B**——主线裁定的方向，尚未接受——在两处进程里的形状。
服务名、插件名、表名、节点名都是候选名；精确形状归将立的提供者节点。依赖上游机制的每一处引 [basis](../../../basis/README.md) 条目或标假设（[下文](#依赖的上游机制语义)）。

### 两处进程，块 A 落在哪

```text
治理中心进程（apps/tenancy-host 装配；PF-017）
  root
  ├─ storage-sql · clock                                                   [已存在]
  ├─ credential-verification · account-identity
  │  · organization-governance · account-registration                      [已存在]
  ├─ ★ 资产提供者（无词条；一个 Cordis 插件、一条 fiber；节点候选 packages/assets/asset-governance）
  │     inject ：storage · clock · memberships · organizations
  │     provide：同一实例的四个服务面（名字待定）：资产面 · 持有面 · 流转面 · 快照面
  │     emit   ：资产领域的变化通知（提交之后、包一层）
  │     import ：core/asset-model · core/asset-evaluation（设置视图用）· core/offer-expiry · core/identity-values
  │     迁移   ：导出资产表的迁移片段，由装配合成（追加在序列末尾）
  ├─ governance-center-ops                                                 [已存在]
  └─ governance-center-entry：inject 追加资产提供者的四个面（入口契约出 v2）   [已存在]
  装配启动时：登记官方件（MR-5）

会话据点进程（候选 apps/runtime-host，未建；块 B/C/D 的装配节点）
  ├─ 装配（PF-004）· 注册表（无词条）· 放行判断          各自的 fiber，不属块 A
  │     import：core/asset-evaluation（四步求值、承载清单读入的纯半）· core/asset-model
  └─ 据点上的中心事实副本（无词条；归据点装配，MR-3）
```

tenancy-host 的装载次序里，资产提供者排在组织治理之后（它 inject `memberships`、`organizations`）、运维面与入口层之前
（[装载清单与顺序](../../../realization/apps/tenancy-host/design.md#装载清单与顺序)）；迁移片段追加在合成序列末尾（[合成规则](../../../realization/apps/tenancy-host/design.md#合成规则)「编号名只追加」）。
**资产表不建指向组织治理表的外键**，理由与 tenancy-host [「为什么只建一条外键」](../../../realization/apps/tenancy-host/design.md#为什么只建一条外键)相同：
每多一条 `RESTRICT` 就多一条组织治理没列进失败集合的拒绝路径，[og S-53](../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 首当其冲。

### 不进 ctx 的：纯数据与纯计算

| 东西 | 形式 | 两侧 |
|---|---|---|
| 能力标识、记录与版本的形状、属性声明、属性配值、持有、血缘、承载清单的形状（O-1、O-3、O-4、O-5、O-7、O-10、O-14 形状） | 数据契约的类型与校验（`data.asset-model`） | 两侧 |
| 四步求值（O-16）；「组织的设置」投影（O-18）；承载清单 → 工作区层持有的读入（O-14 纯半） | 纯函数（`capability.asset-evaluation` 的提供者） | 两侧，同一份代码 |
| 官方件集合（O-8） | 随程序发布的数据；中心在装配启动时登记 | 两侧 |
| 邀约过期的派生 | 已有纯模块 `core/offer-expiry` | 中心 |
| 上级链与「有共同上级」的判定式 | 已有纯模块 `core/identity-values`；**读记录那一半在组织治理** | 中心 |

**旁注（给据点副本的 owner，不是本包的裁决）**：已发布版本不可变，据点可以按 (记录, 版本号) 永久缓存正文；
会变的只有持有、配值、版本选用、分享此刻是否生效这几样小事实，副本同步因此只需搬小事实（推导）。

### 资产提供者内部：一个插件、四个服务面

形状照[组织治理节点的先例](../../../realization/packages/tenancy/organization-governance/design.md#实现路径与来源)：一个插件、一条 fiber、几个服务面——几个服务面是**同一实例的几个入口，不是几个变化原因**。

| 面（名字待定） | 承载 | 契约 |
|---|---|---|
| 资产面 | 创作、修订草稿、发布、提升、删除、读 | 资产治理 |
| 持有面 | 加入、移除、禁用与启用、锁替换与解锁、配值与清除、锁值与解锁、读、「组织的设置」视图、列出引用方 | 资产治理 |
| 流转面 | 复制通知与分享邀请的发起、撤回、确认、读、列出；分享的撤销、移除、列出 | 资产流转 |
| 快照面 | 某个租户的组织层与租户层求值输入（持有、被选版本的正文、分享此刻是否生效）；据点副本从这里取 | 资产治理的读面（MR-3） |

**插件内两条写路径碰同样三张表**（记录、版本、持有）：资产治理的操作，与资产流转确认时的落地（MR-1：落地直接写，不经资产治理的公开操作）。
两者在**同一个 owner 内**，共用插件内部的写函数守 INV-2——版本号接着自己的线往下数、持有键唯一、所有者至多变一次。
**血缘对应**（(源记录, 目标组织) ↔ 血缘号）只由流转那一半读写；资产面与持有面的读查询不触及它（INV-4 在本形状下的保护点，[X-3](alternatives.md#仍待区分的事项)）。

### 谁 inject 谁

| 消费者 → 提供者 | 必需？ | 换代或不可用时 | 能承受重跑吗 |
|---|---|---|---|
| 资产提供者 → `storage` | 必需 | 重跑；缺席即 `PENDING` | 能：没有内存事实（basis [`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md)「关键推论」） |
| 资产提供者 → `clock` | 必需 | 同上；时间源答不可用 ⇒ 涉过期判定的操作「不可用」 | 能 |
| 资产提供者 → `memberships`（og S-26 效力与角色） | 必需 | 同上 | 能 |
| 资产提供者 → `organizations`（og S-22 组织变体、S-34 上级链） | 必需 | 同上 | 能 |
| 入口层 → 资产提供者四个面 | 必需 | 重跑；资产提供者不在 ⇒ 入口层 `PENDING` ⇒ 中心整个不起来（PF-017 §6.6） | 能：请求级 |
| 据点的装配、注册表、放行 → 块 A | 不 inject | —— | 纯 import |

**块 A 没有长时操作**：每个写操作恰一次存储提交，复制确认也是一次提交（N-1），所以不存在「中途换代、从头重跑、外部效果不回滚」。
本版没有可选依赖；将来若要「资产提供者缺席时快照面答不可用、而不是整体 `PENDING`」，走 `ctx.get`（basis [`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md)）。

### 事件派发

| 事件（候选） | 类 | 派发 | 发出点 | 进程内消费者 | 送不到会怎样 |
|---|---|---|---|---|---|
| 资产已发布／已提升／已删除；持有变了；配值变了；流转状态变了（名字归资产治理契约；资产流转本版不发自己的事件，[AT S-33](../../../spec/capabilities/asset-transfer/v2/contract.md#s-33-本版不发本契约自己的事件)） | 通知 | `emit`，提交之后，发出方包一层 | 中心，资产提供者 | 本版无必需的进程内消费者；可能有审计、给据点发同步提示的那一方 | **什么都不会错**：正确性来自存储与读时求值；据点那边的注册表与副本各有自己的刷新时刻 |

**包一层**：监听者同步抛出会穿回发出方并截断本轮派发（basis [`emit-listener-throw-propagates`](../../../basis/cordis/emit-listener-throw-propagates.md)），不包就会出现「调用方看到失败、存储里已经变了」；`emit` 丢弃返回值（basis [`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md)）。
**没有控制事件**：锁截断、禁用析取、组合环、放行判断都在数据与纯函数里判。将来若开「发布前」「加入持有前」这类拓展点，异步判定必须 `serial`，不得 `bail`。
**红线**：这批事件里任何一个被实现成「删除、迁移或改键」的触发器，就破了 [iv S-26](../../../spec/data/identity-values/v1/contract.md#s-26-成员无效使租户级持有不可达但不销毁)「不可达但不销毁」；分享结束、隶属解除同理——隶属解除之后的分享失效**只能**是读时谓词（AT S-31）。

### 装卸配对

| 取得的资源／登记的贡献 | 拥有者与对外可用时点 | 部分初始化失败 | 撤除、交接与保留 |
|---|---|---|---|
| config 校验：两类邀约的默认时长为正（加载时校验，配错即启动失败） | Config 在插件体之前校验；不过即 fiber `FAILED`、一个面都不 provide（basis [`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md)） | 无部分状态 | —— |
| 四个 `ctx.provide` | 本 fiber；`ACTIVE` 后可解析 | 任一 provide 失败 ⇒ 抛出，已 provide 的随 fiber 撤（H-1） | 服务消失，消费者重跑或 `PENDING`；**在途调用跑完**，每个调用的收场由它那一次存储提交决定；**保留**全部记录——没有只活在运行实例里的事实 |
| 迁移片段（表与约束，交给装配合成） | 装配期 | 迁移失败即启动失败（tenancy-host 升级的整体性） | 表与数据不随插件撤除 |
| 官方件登记（装配启动时，MR-5） | 装配 | 失败即启动失败（与 tenancy-host 配置错误同一政策） | 登记的事实在存储里 |
| 定时器、监听者、文件监听 | **一个都没有** | —— | —— |

### 同一提交与共同存储对象

内核不提供跨 fiber 事务；而 [core/storage 的消费者义务 P-13](../../../realization/packages/core/storage/design.md#协议)规定：**事务的 `fn` 里不得调用任何经同一 `storage` 的服务面，包括别的插件的操作**——
所以跨 owner 的「同一提交」只能由两个写入者共同触碰的存储对象兑现，不能由「在我的事务里调你的面」兑现。

| 要一起成立的 | 涉及的事实 | 本草图怎么承接 | 若拆成两个插件 |
|---|---|---|---|
| **复制确认 ⇒ 落地** | 通知的终结记录；新记录或新版本；血缘；目标组织层持有（首次且那一格还没有这个能力标识时）；过期重判与再判（`data.offer-expiry/v1#S-10`、AT S-17） | 同一插件、一次提交 | 流转的事务只能直接写治理的三张表（P-13），见[候选 C](alternatives.md#候选-c) |
| **分享确认 ⇒ 使用权建立** | 邀请的终结记录；分享记录新建或认回；被分享方组织层持有 | 同上 | 同上 |
| **资产没了 ⇒ 指着它的邀约过期** | 记录上的删除事实，或所有者那一层移除持有（AT S-7 ③）；确认 | 同一插件：确认事务与删除／移除事务**锁同一行**（记录行；所有者那一层的持有行），两者在一行上排出次序。删除落成记录行上的一列（推导：MR-9 定删除之后内容保留为归档，删除是一个事实而不是一次物理删除） | 一方的事务锁另一方的行、读另一方的列 |
| **被分享方移除** | 分享记录写 `removed`；被分享方持有与配值删除（AT S-29 ④） | 同一提交 | 跨 owner |
| **提升到组织** | 记录的所有者；原租户那一格持有的来路（推导，INV-3） | 同一提交 | 跨 owner，见[候选 E](alternatives.md#候选-e) |
| **团队 → 团队复制 vs 隶属解除** | 复制确认；组织治理的隶属写（[og S-33](../../../spec/capabilities/organization-governance/v1/contract.md#s-33-解除隶属)） | **跨 owner**（MR-2）：确认事务取组织治理的隶属哨兵 `lockSentinel('organization-governance/affiliation')`——sqlite 上由库级写锁兑现，pg 上是事务级 advisory lock，都在存储里、不在进程里——**并在同一事务里直接读组织治理的上级链列**，用 `core/identity-values` 的纯函数判「有共同上级」（P-13 不许在事务里调 og 的面）。两者在哨兵上排出次序；**装配给**（同一存储、同一约束域，P-1），跨进程由协议重兑（[AT S-34](../../../spec/capabilities/asset-transfer/v2/contract.md#s-34-装配给的保证-vs-协议须给的保证) 第三行） | 五个候选相同；需组织治理节点配合（X-1） |
| 成员资格、上级链的读 与 资产写（其余操作） | og S-26、S-34 的读；资产提交 | **不要求同一提交**：单次调用内的窗口按 [iv S-27](../../../spec/data/identity-values/v1/contract.md#s-27-每道准入现读)「影响的是下一道尚未通过的准入」读成可接受（组织治理节点对它自己的 S-36 同法） | —— |

**不算数的三个替身**：时间谓词（`now` 不参与冲突检测）；进程内锁（随插件实例生灭，basis `plugin-body-reruns-on-provider-change`）；没落盘的「单调事实」。

### 草图携带的前提

供对账与契约取用，不是对账结论。

- **P-1 同一存储提供者、同一约束域**（装配给；tenancy-host [「同一存储、同一约束域」](../../../realization/apps/tenancy-host/design.md#同一存储同一约束域本节点要保证的三件事)）：资产表之间的行锁与唯一约束、MR-2 对隶属哨兵的锁与对上级链列的读都靠它；跨进程后由协议重新兑现（AT S-34、[AM 第四节](../../../spec/data/asset-model/v2/contract.md#四装配给与协议给)）。
- **P-2 据点副本**：会话内的权限求值与 reload 用的是副本（PF-016 §6.9、§6.17），离线时新鲜度没有上界——这是已接受的产品取舍（MR-3），与 iv S-27「缓存须写明失效条件与最大陈旧窗口」的字面有张力，求值契约的「装配给」表须写明读法。
- **P-3 分享此刻是否生效是读时谓词**：每组一次中心快照都要读上级链，读不到 ⇒ 整份快照不可用（[iv S-19](../../../spec/data/identity-values/v1/contract.md#s-19-不可用即明确失败)），不交一份缺了分享的快照。
- **P-4 求值确定、可重放**：输入里要有被选版本的正文、工作区文件内容的指纹、MCP 动作清单的快照。
- **P-5 装配清单记下每份被用资产的版本**（以及工作区资产的内容指纹），否则 PF-004 的「依据的定义版本」与事后复现落空。
- **P-6 中心写面经入口层到达，送达不去重**：创建类操作带幂等键、配值写带基准修订守卫（MR-6）。

## 为什么不拆、为什么不合（可独立引用）

下面每一条可以单独引用。

### N-1 资产治理与资产流转：契约两份，提供者一个插件

**结论**：`capability.asset-governance` 与 `capability.asset-transfer` 两份契约分开，由**同一个插件、同一条 fiber** 提供，各自一个或几个服务面。

**理由**：

1. [同一提交表](#同一提交与共同存储对象)的五处同一提交（复制确认、分享确认、资产没了使邀约过期、被分享方移除、提升——最后一处是推导）。内核不提供跨 fiber 事务；
   组织治理节点在同一处境下做了同一选择，理由原文是「三处跨组的同提交在拆成多个 fiber 后都做不到」（[og 节点](../../../realization/packages/tenancy/organization-governance/design.md#实现路径与来源)）。
2. **拆开也隔不开表**：[core/storage P-13](../../../realization/packages/core/storage/design.md#协议) 不许在事务里调用别的插件的面，确认若由流转插件开事务，它就**只能直接写**治理插件的记录、版本与持有三张表——
   拆成两个插件并不能把治理的事实封装起来，只多出一个写他人表的写入者。
3. [`data.offer-expiry/v1#S-10`](../../../spec/data/offer-expiry/v1/contract.md#s-10-接受操作在同一提交内重新求值) 与 AT S-7 要求「资产已不存在」的读数与写入确认效果落在同一次提交内。资产记录与邀约分属两个插件时，这一条只能靠一方锁另一方的行。
4. 用「幂等组合」代替同一提交（落地按通知号幂等、再单独提交确认）会暴露中间态：**已落地却仍待确认，此时发起方还能撤回**——与 [PF-003 flows §3.4](../../../product/PF-003-asset-transfer-and-sharing/flows.md#34-一份待确认的邀约复制通知与分享邀请同形)「撤回之后什么都没有」相抵。
5. 落地要的写与治理的公开操作对不上：「创建草稿」让所有者等于作者的租户，复制要的是所有者为目标组织、作者为 (目标组织, 发起者)（[PF-003 §6.5](../../../product/PF-003-asset-transfer-and-sharing/design.md#65-首次复制)）；
   公开操作的授权是「在组织范围创作」那一格，复制的授权是「目标侧能替它确认的人」（[PF-003 flows §四](../../../product/PF-003-asset-transfer-and-sharing/flows.md#四角色与操作)）。硬用公开操作，要么授权判错，要么再加一条内部入口——那本来就是同一个 owner 的事。

**契约为什么仍分两份**：变化原因不同（PF-002 对 PF-003），读者不同；服务面分开即可。**契约切分不等于插件切分。**

**改票条件**：产品接受「确认之后异步落地」并给出一个可见的中间态；或复制改成「在目标侧产生一份草稿、由目标方另行发布」（落地不再写版本与持有）；
或中心演化为多存储、流转与资产记录不在同一约束域——那时要的是协议级的同一提交，不是再拆插件。

### N-2 求值不做插件、不进 ctx

**结论**：四步求值（O-16）是纯函数模块，两侧 import；契约是 `capability.*`，提供者是纯模块。

**理由**：同输入同输出，无资源、无生命周期，0→8 在 #1 停。没有要并存的第二份实现：层序与合成语义是产品定死的（[PF-002 §5.5](../../../product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级)～[§5.8](../../../product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题)）；
要并存两份才轮得到 isolate，本版没有这个需要。两侧用同一份代码，中心的设置视图与据点的装配、放行对同一输入给同一个答案（INV-5）。
做成中心服务则不行：据点离线时用不了（PF-016 §6.17），工作区与会话值也送不进中心（中心不知道任何会话）。
**设置层序是数据层次，不是装配链**（出厂 < 组织 < 租户 < 工作区 < 会话）：不得用 `ctx.intercept` 承载（H-4）。

**改票条件**：出现按部署或按组织替换求值策略的需求。

### N-3 求值输入的收集不并进资产提供者

**结论**：资产提供者只出「某个租户的组织层与租户层快照」（O-17 中心半）；拼成完整求值输入是据点上装配那一步的事（MR-3）。

**理由**：另一半输入——工作区文件、会话值、MCP 动作清单、离线时的副本——都在据点，中心拿不到。

**改票条件**：工作区换成中心看得见的承载形态（[PF-002 非目标](../../../product/PF-002-assets-settings-and-permissions/design.md#非目标)「目录之外的承载形态」开题）。

### N-4 资产提供者不与组织治理合并

**结论**：两个插件。

**理由**：变化原因不同；组织治理 v1 已冻结（[D-023](../../decisions/tenant-domain-design-acceptance/README.md)）；跨 owner 的需要只有三个读面（og S-22、S-26、S-34），不要求同一提交——
唯一例外是团队 → 团队复制与隶属解除（MR-2），它要的是一个**共同存储对象**（隶属哨兵加上级链列），不是合并。

**改票条件**：组织治理节点不肯让另一个 owner 在它的事务里取隶属哨兵、读上级链列，也没有别的可用对象（X-1）——那时再评估把「流转边界判定 ＋ 复制确认」的序列化责任放在哪一侧。

### N-5 不为租户、组织、工作区开 isolate

**理由**：没有一处需要并存两份实现（basis [`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md)）。为租户、组织或工作区开标签，那条目「已知的误用」里的后果都会发生：
隔离不及于数据；实例数随租户数涨，租户增删伴随服务装卸；多出一类没人列过的差异。隔离的实施位置是中心的**数据访问层**（iv S-16、S-20）；据点副本同理，以租户身份为键。

**改票条件**：某个租户或组织真要一份不同的**实现**（不是不同的数据）。

### N-6 不建文件监听、过期定时器、分享失效监听者

**理由**：产品只认装配与 reload 两个时刻（[PF-002 §4 工作区「挂上之后」](../../../product/PF-002-assets-settings-and-permissions/design.md#挂上之后它的内容在装配时自动进来)）；
邀约过期读时派生、派生状态不回退，后台清理不担正确性（`data.offer-expiry/v1#S-9`、`#S-18`）；分享此刻是否生效是读时谓词（iv CS-4、AT S-31）。
这三样都建成运行时对象的话，就是用 effect 承载本该落盘或读时求值的事实（basis `effect-disposal-concurrent-not-ordered`「已知的误用」）。

**改票条件**：产品要求工作区文件改动自动生效；或产品负责人把「隶属重建之后分享是否复活」（[AT G-4](../../../spec/capabilities/asset-transfer/v2/contract.md#十一已知缺口)）裁成「不复活」，而组织治理愿意给一个持久的解除事实——那时监听者也只能作缓存，权威仍在存储。

### N-7 工作区不进中心

**理由**：[PF-016 §5.6](../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧) 把「工作区那个目录本身」与会话层的值放在据点；目录是本机位置；中心不知道会话。

**改票条件**：同 N-3。

### N-8 具体资产与资产持有不拆成两个插件

**结论**：O-2 与 O-6 各自都满足 #8 的判据，但由同一个插件提供。

**理由**：两者之间有三处与流转无关的同一提交或互读——**提升**（记录的所有者与原租户那一格持有的来路同时改，INV-3，推导）；
**加入持有 vs 删除记录**（加入要在同一提交里看到记录此刻未删、能力标识相符（[AM S-18](../../../spec/data/asset-model/v2/contract.md#s-18-资产持有) ②）；删除前要列出持有它的引用方）；
**「资产没了」**（AT S-7 的存在性同时看记录与所有者那一层的持有）。再加上复制与分享的落地同时写两边。
拆开之后两个插件互相要读，inject 成环——必需依赖缺席即 `PENDING`（basis `inject-has-no-optional-form`），两个插件都等对方先 provide（推导），一条边只能退成调用时 `ctx.get`。完整比较见[候选 E](alternatives.md#候选-e)。

**改票条件**：见 [alternatives 改票条件表](alternatives.md#推荐与改票条件)的 E 一行。

## 依赖的上游机制语义

| # | 主张 | basis 条目 | 状态 |
|---|---|---|---|
| — | isolate 隔离实例的可见性，不隔离数据 | [`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md) | 条目，probe 在 4.0.4 上通过 |
| — | 异步控制不能用 `bail`；`emit` 丢弃返回值 | [`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md) | 同上 |
| — | 必需服务换提供者，插件体先卸载再重跑；进程内锁不是正确性机制 | [`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md) | 同上 |
| — | 不同 effect 的释放并发、无序；持久状态放进 effect 重启即失 | [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) | 同上 |
| — | `inject` 没有可选形式，缺席即 `PENDING`；可选依赖只能走 `ctx.get` | [`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md) | 同上 |
| — | 插件体或 config 抛出 ⇒ fiber `FAILED`，不 provide | [`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md) | 同上 |
| — | `emit` 的监听者同步抛出会传回发出方 | [`emit-listener-throw-propagates`](../../../basis/cordis/emit-listener-throw-propagates.md) | 同上 |
| H-1 | `ctx.provide` 由 effect 纳管，fiber 撤除时服务一并消失 | 无 | **待核对主张**：`core/kernel-basis` 的 probe `provide-is-effect-managed` 已通过，未升格为条目（[basis 当前状态](../../../basis/README.md#当前状态)） |
| H-2 | Cordis 事件不跨进程——fiber 树只在一个进程内 | 无 | **假设**：出自 handbook 的内核负面清单 |
| H-3 | `lockRow`／`lockSentinel` 在 sqlite 与 pg 下都给出「同一对象上排出次序」 | 无（本项目节点，不是上游） | [`core/storage`](../../../realization/packages/core/storage/README.md) 协议 P-4、P-5 与一致性套件；**本包没核那套测试的覆盖** |
| H-4 | `ctx.intercept` 的合并顺序是装配链（祖先在先、近者在后） | 无 | **假设**：handbook 基线 4.0.2 的源码读数，未对 4.0.4 立条目 |
| H-5 | 资产表与组织治理的表在同一存储、同一约束域 | 无 | **装配给**：tenancy-host 迁移合成；[D-026](../../decisions/infrastructure-persistence-choices/README.md) 定了 SQL 存储 |
| H-6 | 记录与持有两个插件互相 inject 会双双停在 `PENDING` | 无 | **推导**：由 `inject-has-no-optional-form`（缺席即 `PENDING`、插件体不跑）与「provide 在插件体里发生」合读；只影响候选 E |

## 本包依赖的主线裁定（尚无决定记录）

下列裁定由主线在 2026-09-23 给出，**还没有落进任何决定或产品正文**；本包据它们画草图。它们的可追溯性是一个交接缺口（[下文](#交接缺口)第 1 行）。

| # | 裁定 | 本包用在哪 |
|---|---|---|
| MR-1 | 资产治理与资产流转由同一个插件提供（一条 fiber、几个服务面，照组织治理节点先例）；复制与分享的落地在确认的同一次提交里**直接写**记录、版本与持有，不经资产治理的公开操作 | 候选 B 就是它；C、E 推翻它 |
| MR-2 | 团队 → 团队复制的确认事务取组织治理的隶属哨兵（同一约束域，装配给） | 同一提交表；X-1 |
| MR-3 | 据点上的中心事实副本归据点装配（候选 `apps/runtime-host`），读面 ＝ 入口契约的查询面 ＋ 本地缓存；新鲜度无上界是 PF-016 §6.17 已接受的取舍；不另立契约 | LIV-1；D 推翻它 |
| MR-4 | 权限层序的「会话」格归块 B 的放行判断，求值契约的权限计算只到租户层；会话层设置值带能力标识 | O-15；据点侧 |
| MR-5 | 官方件由装配启动时登记，不是运行时操作；主体是部署（治理中心装配） | O-8；tenancy-host 修订 |
| MR-6 | 创建类操作带幂等键；配值写带基准修订守卫 | P-6 |
| MR-7 | 持有上有版本选用（追随当前发布版，或钉一个版本号）；分享来的只能追随当前发布版 | 进展性质的前提 |
| MR-8 | 使用权来路五支：自己拥有、所在组织拥有、官方、分享来的、承载目录带来的 | INV-3 |
| MR-9 | 分享结束后被分享方那份持有保留但不可用；删除之后已发布版本的内容保留为不可解引用的归档；邀约所指的「资产不存在」取记录删除 | 同一提交表；**最后半句与 [PF-003 §6.14](../../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)「被移除、被删除」、AT S-7 ③ 相左**（X-4） |
| MR-10 | 工作区没有登记动作；据点侧一份「用过的工作区」清单只供交付面给默认值，不是治理事实 | O-13 |

## 待产品负责人拍板：领域名与包布局

[realization 的两层布局](../../../realization/README.md#packages-的两层布局)只定形状：`core/` 放 `data.*` 纯模块与被两个以上领域消费、没有自己领域事实的构造；`<domain>/` 按限界上下文聚合；
**领域名由产品负责人拍板**，新领域在拍板前标候选（租户领域的 `tenancy` 由 [D-024](../../decisions/tenancy-domain-name/README.md) 拍板）。下面全部是**候选，待产品负责人拍板**：

| 待拍板项 | 候选 | 依据与备选 |
|---|---|---|
| **领域名** | `assets`：PF-002 与 PF-003 这一个限界上下文（资产、设置与权限、资产的流动） | 备选「并入 `tenancy`」**不推荐**：D-024 的 `tenancy` 是租户领域，资产的变化原因（PF-002、PF-003）与租户治理（PF-001）不同，且「一个节点只属于一个领域」 |
| 资产提供者的节点与包 | `packages/assets/asset-governance`：一个插件，兑现 `capability.asset-governance` 与 `capability.asset-transfer` 两份契约 | 节点名随它的主契约（组织治理节点同名同法）；它也兑现资产流转，这一点写在节点入口 |
| 数据形状 | `packages/core/asset-model`（`data.asset-model`） | `data.*` 契约的纯模块归 `core` |
| 求值 | `packages/core/asset-evaluation`（`capability.asset-evaluation` 的纯模块） | 没有自己的领域事实；消费者是资产领域的设置视图，**加上**据点一侧的装配（PF-004）、注册表与放行（块 B）。后者若归另一个领域，它本批就被两个领域消费，归 `core`；**若块 B、PF-004 的那几个节点也划进 `assets`**，这条理由不成立，按「拿不准先按领域放」放 `packages/assets/asset-evaluation`，被第二个领域消费的那天再搬。哪一种取决于块 B 与 PF-004 的领域划分，那也未拍板 |
| 中心侧装配 | `apps/tenancy-host` 装入资产提供者（装载清单在组织治理之后、运维面与入口层之前；迁移片段追加；官方件启动登记；两类邀约的默认时长配置） | **名实张力**：`tenancy-host` 这个名字（[D-027](../../decisions/infrastructure-names-and-sqlite-durability/README.md)）按租户领域取，而它承载的是治理中心这个应用（PF-017）；装入 `assets` 领域之后，维持原名还是改成反映「治理中心」的名字，归产品负责人 |
| 据点侧装配 | 候选 `apps/runtime-host`（未建，块 B 的装配节点）只 import 形状与求值两个纯模块，**不 import 资产提供者的包** | 这一条可以写成结构检查（[alternatives 候选 B 的代价](alternatives.md#候选-b)） |

**不列为候选的布局**：资产另起一个中心应用进程（例如一个单独的 assets host）——跨进程之后，MR-2 要的共同存储对象（组织治理的隶属哨兵与上级链列）不在同一约束域；
[PF-016 §5.6](../../../product/PF-016-cli-tui-delivery-surface/design.md#56-哪些东西在中心一侧哪些在据点一侧) 把组织层、租户层的资产放在「中心」这一处，[治理中心](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)一次部署一个。

## 证据义务与受阻消费

| 依赖的性质与前提 | 保护者 | 所需证据 | 当前结果与闭合条件 |
|---|---|---|---|
| INV-1 确认一次成立 | 资产提供者的确认事务 | 故障注入：在落地写与终结记录之间让事务失败，两者都不在；契约层已有 [AT formal](../../../spec/capabilities/asset-transfer/v2/formal/README.md) 的「去掉同一提交」有效性核对作模型证据（期望反例，不登记为 formal task） | 未开始；受阻：提供者节点未立、资产治理契约未定 |
| SAF-1 删除／移除与确认交错 | 记录行、持有行上的锁（插件内） | 两连接同一库真并发：删除与确认交错，只有「先删后拒」「先确认后删」两种终态 | 未开始 |
| INV-4 目标侧拿不到源 | 读面投影（候选 B 下） | 每个资产面、持有面的读面一条反例：构造有血缘的记录，读出的任何字段都推不出源（X-3） | 未开始 |
| INV-5 两处同答 | 同一份纯模块 | 同一输入在中心设置视图与据点装配两处求值比对 | 未开始；受阻：据点装配未建 |
| 据点侧不 import 资产提供者的包 | 结构检查 | `tools/ts-checks` 一条规则，带「故意违反即失败」的自测 | 未开始 |
| 团队 → 团队复制 vs 隶属解除 | 隶属哨兵 ＋ 事务内读上级链列 | 两连接交错演练：解除与确认交错，复制不落在树外 | 未开始；受阻：X-1 |
| 插件体可重跑、无内存事实 | 资产提供者 | 换一次 `storage` 提供者，插件体重跑，事实不丢 | 未开始 |

以上全部以本包被接受、资产治理与求值两份契约定稿为消费前提；在那之前可以起草节点、跑独立于它们的结构检查，**不登记绑定**。

## 交接缺口

| # | 缺口 | 影响谁 | 负责产物／拥有者 | 闭合条件 |
|---|---|---|---|---|
| 1 | 本包依赖的十条主线裁定（MR-1～MR-10）尚无决定记录，设计链内无处可链 | 提供者设计、三份能力契约的对齐 | 主线 → [record/decisions](../../decisions/README.md) | 落一份决定（可与本包的接受同一份） |
| 2 | AT 契约仍把落地写成「组合资产治理的写面」：[S-2](../../../spec/capabilities/asset-transfer/v2/contract.md#s-2-本契约不拥有什么) 第 2 行、S-4 末两表、S-18 正文、S-29 ④「组合资产治理的 `unhold`」、G-10 | 资产流转与资产治理两份契约的起草者 | 对齐 | 改写为「写集合由同一提供者在确认的同一次提交内完成」；资产治理契约写「落地写入由 asset-transfer 在同一提交内完成」 |
| 3 | MR-2 的兑现要求资产一侧在确认事务里取组织治理的隶属哨兵，**并直接读 `organization.parent`**（P-13 不许在事务里调 og 的面）——og 节点的锁对象与表形状由此成为另一个 owner 的依赖 | og 节点、资产提供者节点 | og 节点 owner（X-1） | og 节点登记这两项外部依赖；或给出一个可在调用方事务里求值的只读函数（会改 og 节点的公开入口，不改 og 契约） |
| 4 | 入口契约 v1 的路由表封闭 | 资产各面对外可达 | 主线 | 入口契约出 v2 追加路由；入口层 inject 追加资产提供者 |
| 5 | tenancy-host 修订：装载清单 ＋1、迁移合成 ＋1 组片段、官方件启动登记、两类邀约的默认时长配置 | 中心装配 | tenancy-host 节点 | 节点修订（名字见上节待拍板） |
| 6 | 据点装配未建：求值契约「装配给」各行（副本新鲜度、两侧同一份代码）与 MR-3 的副本没有承接者 | 据点求值（LIV-1） | 主线（块 B 装配节点） | 节点建立 |
| 7 | 个人组织被清除（og S-53）时，其资产与持有的去向产品未述；本草图不建指向 og 表的外键 | 资产提供者 | PF-001／PF-002 的 owner | 产品写明 |
| 8 | 「资产不存在」的范围：MR-9 取记录删除，PF-003 §6.14 与 AT S-7 ③ 写「被移除、被删除」 | SAF-1 的共同存储对象（只锁记录行，还是加锁持有行） | PF-003 的 owner（X-4） | 产品确认；本草图先按正文两者都锁 |
| 9 | 提升时原租户那一格持有怎么变（INV-3，推导） | 资产治理契约、提供者 | PF-002 的 owner／主线（X-2） | 写明 |
| 10 | 领域名、节点名、tenancy-host 名 | 包路径 | 产品负责人 | 拍板（上节） |
| 11 | 官方件在中心由装配启动时登记（MR-5），据点随程序带同一份（O-8，推导）——中心与据点的程序版本不一致时，出厂格取哪一份、记录号怎样对应 | 求值第 1 步的出厂格；INV-5 | 主线（求值契约的「装配给」表） | 写明出厂格的来源与版本不一致时的收场 |

评审处置见 [review.md](review.md)；实际决定与下游入口从 [README](README.md#后续消费) 导航。
