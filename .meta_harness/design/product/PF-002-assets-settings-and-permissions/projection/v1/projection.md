# PF-002 设置、权限与资产的展开 · 设计投影 v1

- 对应需求：[PF-002](../../README.md) 全部条款——八类资产与「类别 ＋ name」身份、设置与权限是资产的两种属性、四类设置项、「谁可以使用它」、默认与强制（界与挑选）、资产替换与锁、四步求值、工作区、三条层序、设置页与「组织的设置」视图、移除与禁用、各类资产自带的属性项（Skill、MCP、Connector、Slash Command、Loop Extension、Tool 的规则只取本需求用到的那几条）。**不含**：资产的复制与分享（[PF-003](../../../PF-003-asset-transfer-and-sharing/README.md)）、工具定义与执行、会话资产注册表的换表与可用性（[PF-006](../../../PF-006-tools-and-skills/README.md)）、模型档案（[PF-013](../../../PF-013-model-profiles-and-invocation/README.md)）、Agent Definition 正文（PF-004，无契约）。
- 本版依据的需求修订：**PF-002 rev 20**（`README.md` front-matter `revision: 20`）。PF-001 rev 17 只作为四层作用域、三种合成语义与角色矩阵的来源。
- 状态：**当前，`post-review`，未接受。**七份候选契约全部 `candidate`、未冻结，接受待 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)；九个节点设计全部候选、**没有一行源码**，接受待 [D-042](../../../../record/decisions/assets-runtimes-node-acceptance/README.md)。节点已过独立架构评审并按 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M49～M75 处置。[provenance.json](provenance.json) 里全部来源 `sha256` 为 `null`：**本页每一节都可能漂移，据它实施之前逐项核对坐标。**
- 未决：契约缺口 **40** 条、节点缺口 **23** 条、产品未决 **1** 项（另指路 1 处），产品负责人账本待裁 **9** 项（全部见[第 7 节](#7-未决项与已回询项)）。

**读法**：第 1～4 节回答「必须为真的是什么」，来源是契约与产品正文；第 5～6 节回答「用哪些原语兑现、有什么证据」，来源是节点；第 7 节是等裁决的东西；第 8 节是先做什么、做到什么算完。
**条款坐标缩写**（全部 v1、`candidate`，除注明）：
`am` = [`data.asset-model/v1`](../../../../spec/data/asset-model/v1/contract.md)，
`ae` = [`capability.asset-evaluation/v1`](../../../../spec/capabilities/asset-evaluation/v1/contract.md)，
`ag` = [`capability.asset-governance/v1`](../../../../spec/capabilities/asset-governance/v1/contract.md)，
`sp` = [`data.skill-package/v1`](../../../../spec/data/skill-package/v1/contract.md)，
`sc` = [`data.slash-command/v1`](../../../../spec/data/slash-command/v1/contract.md)，
`me` = [`data.mcp-endpoint/v1`](../../../../spec/data/mcp-endpoint/v1/contract.md)，
`cn` = [`data.connector/v1`](../../../../spec/data/connector/v1/contract.md)，
`td` = [`data.tool-definition/v1`](../../../../spec/data/tool-definition/v1/contract.md)（本投影只用 S-15 的档序、S-16、S-31），
`le` = [`data.loop-extension/v1`](../../../../spec/data/loop-extension/v1/contract.md)（只用 S-4、S-40），
`og2` = [`capability.organization-governance/v2`](../../../../spec/capabilities/organization-governance/v2/contract.md)（只用 S-42 与 S-22、S-59、S-36 三个读面），
`og1` = [`capability.organization-governance/v1`](../../../../spec/capabilities/organization-governance/v1/contract.md)（`accepted`；资产治理的直接入口钉它的 S-22、S-26），
`iv` = [`data.identity-values/v1`](../../../../spec/data/identity-values/v1/contract.md)（`accepted`）。
节点缩写：`N:am`、`N:ae`、`N:sp`、`N:sc`、`N:me`、`N:cn` = `realization/packages/core/` 下同名节点，`N:ag` = [`assets/asset-governance`](../../../../realization/packages/assets/asset-governance/design.md)，`N:th` = [`apps/tenancy-host`](../../../../realization/apps/tenancy-host/design.md#本程追加资产治理与模型档案目录的中心侧候选尚未实现) 资产段，`N:ar` = [`tools/asset-registry`](../../../../realization/packages/tools/asset-registry/design.md)。

## 1. 本版覆盖的需求条款

确认状态取自 PF-002 `README.md`「状态」段与 [changelog](../../changelog.md)：rev 16 及以前**已确认**；rev 17 的主线裁定与 rev 18 的连接件鉴权绑定推导**待产品负责人确认**；rev 19（D-2～D-4）与 rev 20 连接件四点是产品负责人当场裁定，**已确认**；rev 20 里两项设置的类别与 D-5 是主线裁定，**待确认**。
覆盖关系登记在 [`covers.json`](../../../../registry/README.md#covers)：PF-002 共 177 条，**全部 `reviewed: false`**。

| 需求 | 确认状态 | 契约落点 | 备注 |
|---|---|---|---|
| [§4 八类资产](../../design.md#八类资产)、[身份是「类别 ＋ name」](../../design.md#身份是类别--name其余归实现) | 已确认；「一层对一个身份至多持有一份」rev 17 待确认 | `am#S-1`～`#S-4`（类别、名字词法、规范串 `<category>/<name>`、记录号）、`#S-8`～`#S-10`、`#S-18`；`ag#S-5`、`#S-30` | 具体资产靠 `AssetRecordId` 标识是规格层给的（领域对象条目记为正文未述） |
| [§5.2 设置与权限是资产的两种属性](../../design.md#52-设置与权限是资产的两种属性)、[组织的设置是视图](../../design.md#组织的设置是视图不是对象) | 已确认 | `am#S-12`（声明由正文推出）、`#S-14`（配值挂在持有上）；`ag#S-10`、`#S-12`、`#S-44` | 属性声明从正文推，不另存一份 |
| [设置项分四类](../../design.md#设置项分四类资产声明每一项时必须标类别) | 已确认；rev 20 两项的类别待确认 | `am#S-13`；各正文契约的推出规则（`sp#S-17`、`me#S-14`、`cn#S-11`、`td#S-31`、`le#S-40`、`sc#S-11`） | 类别由正文契约定死，作者不选 |
| [「谁可以使用它」](../../design.md#谁可以使用它是各类资产共用的一项权限) | rev 19 已确认（D-2） | `am#S-36`（保留项 `usableBy`）；`ae#S-39`（第一步之二） | 「自己」= 作者本人；工作区提供的 = 挂上工作区的租户 |
| [§5.3 两种合成](../../design.md#53-两个例子两种合成)、[§5.4 默认与强制](../../design.md#54-默认与强制一个机制三处适用) | rev 17 待确认（界与挑选、「禁止」恒为界、落档规则） | `ae#S-22`（设置覆盖）、`#S-23`（权限界与挑选）；`ag#S-38`～`#S-41` 写时守卫 | 账本 ⚑4、⚑5 |
| [§5.5 资产替换的层级](../../design.md#55-资产替换的层级)、[替换是一条路径](../../design.md#替换是一条路径不是一扇后门) | 替换可见、三例外已确认；「界跟身份、值跟资产」rev 17 待确认 | `ae#S-18`（锁截断）、`#S-19`（官方件是下界）、`#S-22`（设置按资产）、`#S-23`（权限按标识）、`#S-26` | — |
| [§5.6 四步](../../design.md#56-四步资产求值--组装--投影--层级计算) | 已确认；第一步三小步次序 rev 19 已确认 | `ae#S-15`、`#S-17`、`#S-39`、`#S-18`、`#S-20`、`#S-21`、`#S-22`～`#S-25` | — |
| [§5.7 工作区不参与权限计算](../../design.md#57-工作区那一级不参与权限计算) | 已确认；「本地命令型默认不启用」rev 17 待确认（⚑6） | `ae#S-17` 第三条、`#S-24`、`#S-25`；`am#S-20`；`me#S-17` | 租户「逐件打开」没有写面：`ag` G-26 |
| [§5.8 三条层序](../../design.md#58-三条层序各答一个问题) | 已确认 | `ae#S-5` | — |
| [§4 工作区](../../design.md#工作区)、[挂上之后自动进来](../../design.md#挂上之后它的内容在装配时自动进来) | 已确认 | `am#S-17`（`WorkspaceKey`）、`#S-24`（承载清单）；`ae#S-16`、`#S-27`、`#S-28` | 挂在哪次会话上归 PF-015（`ae` PRE-5） |
| [§6.1 设置页长出来](../../design.md#61-设置页是长出来的不是画出来的)、[§6.2 分两块](../../design.md#62-设置页分两块) | 已确认 | `ag#S-44`；`am#S-12` | 设置页本身是交付面的事（PF-016） |
| [§6.3 组合的引用指向能力标识](../../design.md#63-组合的引用指向能力标识)、[谁能组合谁](../../design.md#谁能组合谁) | 已确认；「Skill⇄Tool 不算环」rev 17 待确认 | `ae#S-20`、`#S-15` ⑥（`compositionCycle`）；`td#S-16` | — |
| [§6.4 移除与禁用](../../design.md#64-移除与禁用是两个动作)、[禁用任一层为真即不可见](../../design.md#禁用是逐层配的布尔设置任一层为真即不可见) | 已确认 | `am#S-15`（保留项 `disabled`）；`ag#S-11`、`#S-31`～`#S-33`；`ae#S-17` | — |
| [§4 Skill](../../design.md#skill) | rev 19 已确认（D-3：本版无系统规定的设置项） | `sp#S-1`～`#S-19`、`#S-32`；`sp#S-17` | — |
| [§4 MCP](../../design.md#mcp)、[MCP 凭据](../../design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) | 已确认；组织层不持有凭据 rev 18 已确认（D-1）；按尝试重算 rev 17 待确认 | `me#S-1`～`#S-17`、`#S-26`；`ag#S-38` ②（`layerNotAllowed`） | — |
| [§4 Connector](../../design.md#connector)、[事件目录](../../design.md#事件目录与事件订阅)、[两种投递方式](../../design.md#两种投递方式动作主体不同)、[触发会话的默认运行模式](../../design.md#触发会话的默认运行模式) | rev 19～20 已确认；鉴权绑定只在租户层（rev 18 推导）待确认 | `cn#S-1`～`#S-19`；**契约只落了 `triggeredSessionRunMode` 一项**（`cn` G-10） | 事件目录、订阅、第 ② 路没有契约形状，见第 7 节 |
| [§4 Loop Extension](../../design.md#loop-extension)、[不可用处置](../../design.md#不可用处置是这一件自己的声明) | D-5 主线裁定待确认 | `le#S-4`（干预力三档）、`#S-40`（推出规则） | 拓展件的运行归 PF-006 投影 |
| [§4 Slash Command](../../design.md#slash-command)、[会话认得哪些命令](../../design.md#会话认得哪些命令什么时候变) | 已确认；「绑定目标不是设置」rev 17 待确认 | `sc#S-1`～`#S-29` | 注册表的换表时机归 PF-006 投影 |
| [§4 Plugin](../../design.md#plugin)、[§4 Agent Definition](../../design.md#agent-definition) | 已确认 | `am#S-11`；**本版求值走到它们即 `categoryUnsupported`**（`ae#S-15` ⑥） | `am` G-6、G-9；`ae` G-3、G-21 |
| [flows §3.1](../../flows.md#31-一个资产在某个范围里)、[§3.2](../../flows.md#32-一份持有上一个属性项的属性配值)、[§3.3](../../flows.md#33-一个资产定义的版本)、[§四角色与操作](../../flows.md#四角色与操作) | 已确认 | `ag#S-16`（四种资格）、`#S-24`～`#S-45`、`#S-64`、`#S-65` | 普通成员在组织范围创作：`ag` G-3 |
| [acceptance §二 绝不能发生](../../acceptance.md#二绝不能发生的事) | 同对应正文 | 本页第 3.2 节 | — |

## 2. 涉及的领域对象

取自 [`domain_objects/objects.md`](../../../../domain_objects/objects.md)，带它标明的未裁；[`pending.md`](../../../../domain_objects/pending.md) 里没有本需求的待裁项。

| 对象 | 领域含义 | 生命周期 | 规格落点 | 条目里的未裁 |
|---|---|---|---|---|
| [资产](../../../../domain_objects/objects.md#ul-asset--资产) | 能力标识（类别 ＋ name）下的一份具体实现 | 草稿 → 发布 → 再发新版；租户 → 组织的提升不可逆、只换所有者；删除先告知、不级联 | 资产记录（`am#S-8`、`ag#S-5`～`#S-7`），`AssetRecordId` 提交内生成、不回收（`am#S-4`） | 具体资产靠什么标识（规格给 `AssetRecordId`）；**删除之后如何**（`ag` G-7） |
| [资产版本](../../../../domain_objects/objects.md#ul-asset-version--资产版本) | 一份资产版本线上的一个号 | 草稿不是版本；发布后不可变 | `am#S-9`；`ag#S-6`、`#S-26`；持有上的 `versionSelection`（`current`｜`pinned{number}`，`am#S-18`） | **版本有没有终结**（`am` G-1） |
| [工作区](../../../../domain_objects/objects.md#ul-workspace--工作区) | 租户持有的一级归属，由目录承载 | 会话创建时指定即在；无登记、撤销动作 | `WorkspaceKey`（`am#S-17`）、承载清单 `<dir>/.omne/workspace.json`（`am#S-24`） | 靠什么标识目录（节点取**字面规范化、不解析符号链接**，`N:am` AM-3）；何时算不在 |
| [meta 能力](../../../../domain_objects/objects.md#ul-meta-capability--meta-能力) | 十三个恒在的常驻槽位 | 装配 → 在位 | 出厂格持有 `immutable` 当且仅当 meta（`am#S-20`、`ag#S-29`） | 与「工具」的关系（归 PF-007／PF-006） |
| [装配清单](../../../../domain_objects/objects.md#ul-assembly-manifest--装配清单) | 为一个会话求值的结果（本需求是它的输入方） | 只追加 | 无契约（PF-004）；求值结果 `EffectiveAssembly`（`ae#S-8`）是它的内容来源 | 标识方式 |
| [组织](../../../../domain_objects/objects.md#ul-organization--组织)、[租户](../../../../domain_objects/objects.md#ul-tenant--租户) | 持有方（组织层、租户层） | 见 PF-001 投影 | `ag#S-9`、`#S-16` | — |

**不是对象、是属性的**（条目 C-17 已判「属性」，形态不是存储）：资产持有、属性配值、禁用。规格把它们落成值（`am#S-14`、`#S-18`），节点把它们存成行（`N:ag`「持久记录」：`asset_holding`、`attribute_assignment`）——**存成行是架构决定，不改变它们的领域形态**。
规格层另有的值对象：`HoldingBasis` 五支（`owned`／`organization`／`official`／`shared`／`carrier`，`am#S-19`）、`CredentialRef`（`am#S-23`）、`ActionSnapshot`（`me#S-9`）、`OAuthBinding`（`me#S-12`）、`EffectiveAssembly`（`ae#S-8`）。

## 3. 不变量与性质

行标只在本表内有效；每条的原始出处是契约第七／八节的性质表。**「检查」一列列的是会失败的证据形式，全部未执行**（第 6 节）。

### 3.1 不变量

| 编号 | 内容 | 谁维护 | 检查 |
|---|---|---|---|
| INV-1 | 同一范围 × 能力标识至多一份持有 | `ag#S-30` `alreadyHeld` ＋ 存储唯一索引（`N:ag` R-2） | 规范场景 `am#S-33`；并发插入撞唯一索引后按 `ag#S-30` ⑦ 收场（`N:ag` 操作表） |
| INV-2 | 版本号从 1 起逐一连续；已发布版本不可变、无就地改写路径 | `ag#S-26` `expected` 比对（L-4 记录行锁下）；`am#S-9` | `ag#S-59`、D-3（两方同 `expected` 恰一方成） |
| INV-3 | 来源产生时定、此后不变；official 只由登记产生；每个能力标识至多一份 official 记录 | `ag#S-5`、`#S-29`；`asset_record` 上 `origin='official'` 的部分唯一索引 | `ag#S-57`（另跑 S-29 连登两次） |
| INV-4 | 作者不变；所有者只从租户变成它所在的组织，且只一次 | `ag#S-7`、`#S-27`（写所有者的唯一路径） | `ag#S-60` |
| INV-5 | 任何一层都没有为官方件配过 `disabled = 真`；出厂层持有只增不减；出厂层持有带锁当且仅当 meta | `ag#S-8`、`#S-9`、`#S-29`；写面构造不出出厂层 | `ag#S-57` |
| INV-6 | 配值只存在于存在的持有上 | `ag#S-31` 同提交删配值；`#S-38` 要求持有在 | `ag#S-56` |
| INV-7 | 每个能力标识至多一份生效资产；生效资产只来自输入的持有 | `ae#S-18` ＋ C4 | 规范场景 `ae#S-33`（多带一份定义那一支） |
| INV-8 | **官方件是下界**：出厂持有的每个能力标识都有生效资产 | `ae#S-19`；前提 PRE-4 | Alloy (v)（不是 formal task）；`ae#S-41` |
| INV-9 | 权限项、落点与身份类设置、治理类（`disabled` 除外）的值从不来自工作区那一格 | `ae#S-23`～`#S-25` | Alloy (iv)(iv′)(iv″)；`ae#S-33` |
| INV-10 | 除「谁可以使用它」外，权限项的值不改变 `assets` 与 `composition` | `ae#S-20`：第 2 步先于第 4 步 | `ae#S-33`（改一项权限重求，比对前两列） |
| INV-11 | 每份持有在结果里恰有一处交代 | `ae#S-26` | `ae#S-33`～`#S-35` |
| INV-12 | 求值同输入同输出 | `ae#S-11`；纯计算、不读存储时钟文件 | `ae#S-33` 重放支 ＋ 静态检查 |

**写明一条不是不变量的**：「每份持有指向的记录都存在」**不成立**——删除不级联（`ag#S-22`），被删记录的持有方可能还没移除它；求值怎样对待这种持有是缺口（`ag` G-7）。

### 3.2 安全性质（绝不能发生）

| 编号 | 绝不能发生 | 谁维护 | 检查 |
|---|---|---|---|
| SAF-1 | 一个租户写进或读到另一个租户那一层（含超管读写成员租户层） | `ag#S-15` `crossTenant`：纯值比较，先于一切读取；`ae#S-7` C3 | `ag#S-54`、`ae#S-37` |
| SAF-2 | 普通成员写组织层 | `ag#S-16` 管理者资格 | `ag#S-54` |
| SAF-3 | 组织加了替换锁或项锁之后，租户层的替换、改版本、覆盖设置项写得进去；租户层把权限值写到组织的界外（界含执行权限上不锁的 `{forbid}`） | `ag#S-30`、`#S-36`、`#S-38` `lockedAbove`，与组织层写入在 L-3 上串行化（`ag#S-21`） | `ag#S-55`、D-1（sqlite 与 pg） |
| SAF-4 | 锁以里换进了另一份；一条不锁的「禁止」被更里面的挑选挑掉；换一份实现就逃出外层的界 | `ae#S-18`、`#S-23` | Alloy (ii)(vi)(vii)(x)；`ae#S-36` |
| SAF-5 | 一份被禁用的资产出现在结果里；工作区借「同名替换再禁用」藏掉租户的资产 | `ae#S-17` 先于 `#S-18` | Alloy (iii)；`ae#S-34` |
| SAF-6 | 这个租户用不了的自定义件出现在 `assets` 里；「谁可以使用它」让一个有 official 的标识空着；用不了外层那份就甩掉外层的界 | `ae#S-39`、`#S-19`、`#S-23`「在效」 | Alloy (viii)(v)(ix)；`ae#S-41` |
| SAF-7 | 仓库改了治理类的项、给自己提权、改别人的落点、锁死更里面的一格 | `ae#S-24`、`#S-25` | Alloy (iv)(iv′)(iv″)；`ae#S-33` |
| SAF-8 | 仓库带来的、会在本机起命令的东西（stdio 接入点、命令型拓展件）未经租户启用就装上 | `ae#S-17` 第三条 | 规范场景未建（`ae` G-19） |
| SAF-9 | 租户配在自己那份资产上的凭据被仓库带来的同名接入点拿到 | `ae#S-22`「指向 `A` 才给值」 | `ae#S-33` |
| SAF-10 | 一个求不出的引用被静默略去；一份展开不完或读不了正文的组合交出结果；一份不合法输入产出半份结果 | `ae#S-13`、`#S-15` ⑥、`#S-20` | `ae#S-37`、`#S-43`、`#S-44` |
| SAF-11 | 没告知就移除或删除了一份有引用方的资产；静默级联删除引用方 | `ag#S-22`：提交内现求引用方 ⊆ `acknowledged` | `ag#S-58`、D-2（L-3 谓词保护的唯一实证） |
| SAF-12 | 过期的编辑静默盖掉别人已发布的修改 | `ag#S-25` `basedOn`、`#S-26` `expected` | `ag#S-59` |
| SAF-13 | 官方件被禁用、编辑、删除，或出厂层那份被移除 | `ag#S-8` 五条 `officialImmutable` | `ag#S-57` |
| SAF-14 | agent 产出被记成人产出 | `ag#S-24` `byAgent` 必填、无默认 | 前提 `byAgent` 如实（`N:ag` N-6） |
| SAF-15 | ①② 型斜杠命令带系统保留前缀 `omne-official:` 创建或发布成功 | `ag#S-24`、`#S-25`、`#S-29` 按 `sc#S-4` 收 `invalidInput` | `N:sc` V-3（保留区拒绝行）；资产治理一侧无专门场景，随 `N:ag` 的 `S-24`／`S-25` 演练补一支 |
| SAF-16 | 读不到被说成「没有」「无权」或空列表；从拒绝值里试探出别人的私有记录在不在 | `ag#S-18` `unavailable`；`ag#S-14`、`#S-19`「调用方有效」先于「记录可见」 | `ag#S-61`、`#S-62`（两组逐字比对）、F-3 |
| SAF-17 | 拒绝之后留下部分效果 | 全部写操作 ④：依据与写入同提交 | F-2、F-3 |
| SAF-18 | 解除成员把他的租户级持有清掉 | `ag#S-47`：没有这条写路径；插件不订阅成员事件 | 静态：插件里没有监听者 |
| SAF-19 | 组织层配了 MCP 凭据或连接件鉴权绑定 | `ag#S-38` ② `layerNotAllowed`（`am#S-23` 第 7 条） | `N:ag` 场景（未开始） |

### 3.3 进展性质（有界，前提写明）

| 编号 | 内容 | 上界 | 前提与责任方 |
|---|---|---|---|
| LIV-1 | 加入、移除、禁用、启用、锁、配值成功返回之后，下一次读面即反映它 | 下一次读 | 存储可用（`storage-sql`，`N:ag` R-4） |
| LIV-2 | 提升成功返回之后，下一道准入按组织所有判 | 下一道准入 | 同上 |
| LIV-3 | 被拒的操作立即返回一个具名值，且不留部分效果 | 该次返回 | 存储原子性（`N:ag` R-1） |
| LIV-4 | 状态改变的每次提交之后恰发一次对应事件 | 提交之后 | 发出方存活到派发；**不约束送达**（`ag#S-48`） |
| LIV-5 | 求值两个操作对任何输入都在一次调用内返回 | 那一次调用 | 各类正文契约的两条规则在有限步内返回（PRE-6） |

### 3.4 有前提地能：前提与责任方

以下保证在本版「能」，**只在所列前提成立时**；前提不由保证它的那份契约检查。

| 前提 | 保护的是什么 | 谁兑现 | 本版状态 |
|---|---|---|---|
| `ae` PRE-1：四格的持有、配值、定义与选用版本是同一时刻的一致读 | 锁截断不被新持有与旧锁的混合绕过 | 组输入的一方：中心是 `N:ag` 快照面（一次读事务）；据点是中心事实副本读面 | 中心：设计（N-4，无契约条款）；**据点：无提供者**（`N:ar` A-2、`apps/cli` C-3） |
| `ae` PRE-2：交进来的每份持有此刻仍然成立（`shared` 支按 `capability.asset-transfer/v1#S-9` 判） | 团队资产不出那棵树 | 组输入的一方；判据与锁归 PF-003 投影 | 见 PF-003 投影；本版存量记录无时刻时整份 `unavailable`（`N:ag` N-11） |
| `ae` PRE-3：`tenant` 此刻是有效成员、调用方有权以它求值 | 不替别人算出别人的生效配置 | 组输入的一方（`og1#S-26`） | 设计 |
| `ae` PRE-4：出厂格齐全，meta 的出厂持有带锁 | 官方件是下界；meta 不可替换 | 装配：`N:th` 下发官方件清单，`N:ag` 插件体按 `ag#S-29` 登记 | **清单没有产品内容**（`N:ag` N-10、`N:th` U-10）：出厂格为空时下界空真 |
| `ae` PRE-5：`workspace` 归会话租户持有、确实挂在这次会话上 | 读进来的不是别人目录里的东西 | 会话创建（PF-015） | 无契约 |
| `ae` PRE-6：各类正文的两条规则确定、可重放 | 同输入同输出 | 各正文契约；节点端口的组合根只在 `N:ae` 一处（`defaultBodyContracts`，D-040 §八 M51） | 设计 |
| `ae` PRE-7：清单就是那份工作区承载目录里读出来的 | 伪造清单塞不进资产 | 读文件的一方（`N:am` AM-4、`N:ae` AE-4） | **读方未指派** |
| `ae` PRE-8：`mcpActionSets` 是这次尝试钉住的那一份 | 逐动作权限与条目对得上 | 会话资产注册表（PF-006 投影） | 注册表 `PENDING`（装配清单无提供者） |
| `ae` PRE-9：`root.references` 就是根那份生效资产所选版本正文里的引用 | 装出来的就是这个 agent | 装配清单的读方（PF-004） | **无契约**（`ae` G-3、`N:ae` AE-5） |
| `ag#S-50`「调用方身份已经核实过」 | 全部授权判定 | 装配：入口层先认人再带身份值来调 | 入口契约 v1 路由表封闭，资产各面**对外不可达**（`N:ag` N-5、`N:th` U-6） |
| `ag#S-50`「`byAgent` 如实」 | SAF-14 | 入口层按调用来路定 | 无来路（`N:ag` N-6） |
| `ag#S-50`「读到的依据与写入同提交、可串行化（含谓词读）」 | SAF-3、SAF-11、INV-1 | `N:ag` 锁 L-3、L-4、L-5 ＋ 存储 R-2、R-3 | 设计；pg 上只能靠真并发演练（D-1～D-3） |
| `ag#S-50`「成员资格与角色的新鲜度」 | 撤销只影响下一道准入 | `og1` 服务面现读（写后即可被下一次读看到） | 已实现的 OG 节点 |
| `og2#S-42`「调用方身份已经核实过」（全部写操作与读面） | `S-22` 读组织、`S-59` 列出组织成员的授权依据 | 装配（入口层） | 资产治理直接入口钉 `og1`；`og2` 的两个时刻只由流转那一半经事务内读函数读，归 PF-003 投影 |
| `og2#S-36` 当前租户身份查询自带登录状态校验 | 入口层换出的身份值 | OG 自身 | 已实现（v1 同条） |

## 4. 业务规则（开发者不该自己决定的，这里都有）

### 4.1 身份、值与表示层（`am`）

- **类别恰八类**（`am#S-1`）；名字词法禁 `/`、许 `:`，空白码点集合与 `iv#S-31` 同一份（`am#S-2`；`N:am` AM-1：identity-values 包须补导出，不自抄）；规范串 `<category>/<name>`（`am#S-3`）。
- **持有键是（持有方, 能力标识）**；持有带 `basis`（五支）、`versionSelection`、替换锁 `immutable`、配值与 `since`（`am#S-18`、`#S-19`）。`shared` 的持有只能 `current`。
- **出厂格**：`basis` 恒 `official`；`immutable` 当且仅当 meta；`assignments` 恒空（`am#S-20`）。**工作区格**：`basis` 只 `official`／`organization`／`carrier`；持有与配值的 `immutable` 恒 `false`；权限、落点与身份类、治理类（`disabled` 除外）的配值**不良构但不是 `malformed`**——读入时或第 4 步丢弃并留痕（`am#S-20`、`ae#S-24`、`#S-28`）。
- **保留项**：`disabled`（布尔）与 `usableBy`（取值 `superAdministrator`／`member`／`self`，作者默认 `self`，八类共用；`am#S-15`、`#S-36`）。正文契约的推出规则**不得产出**这两项。
- **凭据只以 `CredentialRef` 出现**（`am#S-23`）：「还没取」是缺席，不是一个值；组织层配不了（第 7 条）；解引用归凭据保管方（本版无，`N:am` AM-6）。
- **工作区承载清单**：`<dir>/.omne/workspace.json`，格式 `1`，三个列表 `assets`、`assignments`、`disabled` **都必须在**（缺一个即拒，不当空列表）；`source` 不得越出承载目录（`am#S-24`）。清单文本必须经 `parseWorkspaceManifestText`（`readJsonStrict`：同一对象里重复成员名可见）读，**不得用普通 `JSON.parse`**（`N:am` 契约责任表 S-24 行、AM-4）。
- **工作区提供的资产的记录号**：`wsc1.` ＋ base64url(`[org, account, dir, category, name]`)，单射编码、不用摘要（`N:am`「工作区提供的资产的记录号用单射编码」）；目录**只做字面规范化**（AM-3）。
- **表示层拒绝值与次序**（`am#S-27`）：`manifest_format_unsupported` > `category_unknown` > `origin_unknown` > `owner_kind_unknown` > `name_invalid` > 〔嵌着的正文拒绝值，原名携带〕 > `plugin_member_is_plugin` > `version_sequence_broken` > `assignment_item_duplicate` > `manifest_source_escapes` > `malformed`。**拒绝不是判定、不修补**（`am#S-28`）；恰给一个值，不抛异常（`N:am`「状态、并发与失败映射」）。
- **内容相等**按 JSON 值相等（对象成员无序、数组有序、数值按数值、字符串逐码点；`ag#S-26` ⑦），`contentFingerprint` 是 SHA-256（`N:am`）。

### 4.2 三条层序（`ae#S-5`）

| 层序 | 次序（外 → 里） | 答什么 |
|---|---|---|
| 资产归属 | 出厂 < 组织 < 租户 < 工作区 | 同标识取哪一份（替换） |
| 设置 | 出厂 < 组织 < 租户 < 工作区 < 会话 | 值覆盖 |
| 权限 | 出厂 · 组织 · 租户 · 会话（**工作区不在其中**） | 界取交集、挑选由里往外 |

### 4.3 `ae#S-15` evaluate（纯计算，无提交）

- **前置**：无授权前置；前提 PRE-1～PRE-9（第 3.4 节）。**输入**：`tenant`、`standing`、`workspace?`、`holdings`、`definitions`、`session?`、`mcpActionSets?`、`root{definition, references}`；一致性条件 C1～C14（`ae#S-6`、`#S-7`）。
- **四步**（次序是结果的一部分）：
  1. **第一步**：之一按禁用滤（`ae#S-17`：组织或租户格 `disabled` 为真；工作区格对**它自己提供的**资产 `disabled` 为真；工作区提供的 stdio 接入点与命令型拓展件**恒为禁用**）→ 之二按「谁可以使用它」滤（`ae#S-39`：用不了的**不装**、退出替换次序、标识退回下一层；**official 不参与这一滤**）→ 之三取最具体的一份，锁在最外那一把处截断（`ae#S-18`：锁以里指向同一份资产的留下，指向别的退出并记 `locked_below`）。
  2. **第二步组装**（`ae#S-20`）：根没有生效资产 ⇒ 根进 `unresolved`、`composition` 空；否则从 `root.references` 起沿生效资产所选版本正文的引用走；plugin「启用哪些成员」在这一步就地求值（但本版 plugin 读不了，见下）。
  3. **第三步投影**（`ae#S-21`）：用生效资产所选版本正文推属性项；`mcp` 的逐动作项另用 `mcpActionSets` 里 (c, `from`) 那一份。
  4. **第四步**：**设置**按设置层序由外到里，第一条带 `immutable` 的截断，否则取最里给了值的一格；**只有持有指向生效资产 `A` 的格才给值**（设置按资产，`ae#S-22`）。**权限**按能力标识跨层求（`ae#S-23`）：界 = 带锁的配值 ＋ 执行权限上恰 `{forbid}` 的配值（锁不锁都是）；`X` = 声明域 ∩ 各格界；值 = 由里到外第一条落在界内的挑选 `P` 的 `P ∩ X`；**没有挑选落在界内**时，分档项取 `X` 里离最具体挑选最近的一档、一样近取严的（`X` 空则空集），其余项取 `X`。档序：执行权限 `auto` → `ask` → `forbid`（`td#S-15`）；干预力 `veto` → `rewrite` → `observe`（`le#S-4`），干预力的取值域收到声明档及以下（`le#S-40`）。替换件缺外层锁过的权限项 ⇒ 按最严值 ∩ 那些界。**工作区**只贡献设置（`ae#S-24`，丢弃的留 `workspace_permission`／`workspace_placement`／`workspace_governance`）；工作区提供的资产的权限项以最严值为出厂格的界、出厂格不给挑选（`ae#S-25`：执行权限 `{ask}`、干预力 `{observe}`、`usableBy` `{self}` = 挂上工作区的租户；表外项取空集）。
- **成功返回** `EffectiveAssembly` = `root`、`assets`、`composition`、`values`、`filteredOut`、`unresolved`（`ae#S-8`）；`FilterReason` 恰六值：`disabled`、`not_usable`、`locked_below`、`workspace_permission`、`workspace_placement`、`workspace_governance`。落点与身份类的值另带 `provenance`（`ae#S-40`）；执行权限项另带 `tenantAutoWritable`（`ae#S-42`，`mcp` 的 `execute:*` 上恒为假）；`tool`／`skill` 另带 `resident`（`ae#S-38`，几个 plugin 标得不一致时**缺席**）。
- **失败集合与判定次序**：`invalidInput` → `compositionCycle{cycle}` → `categoryUnsupported{category}`（`ae#S-13`、`#S-15` ⑥）。**`filteredOut` 与 `unresolved` 不是失败**；不得把 `unresolved` 升成失败，也不得把失败降成空结果。`cycle` 与 `category` 只作说明，**不作判定、不比较**。
- **本版走到 `plugin` 或根以外的 `agent_definition` 即 `categoryUnsupported`**——组合里有 plugin 或 sub-agent 的 agent 本版一个也求不出来（`ae#S-15` 末段、G-3、G-21）。
- **缺席时的默认答案**（`ae#S-12`，择要）：`tenant`、`standing` 缺或 `ineffective` ⇒ `invalidInput`（不从环境补、不当普通成员）；`workspace` 缺 ⇒ 工作区格为空、不找任何目录；某项各格都没配 ⇒ 取声明默认值、`from = factory`；**没有声明默认值 ⇒ `values` 里没有这一项**（例：接入点凭据、连接件 `triggeredSessionRunMode`）；版本选用确定不了 ⇒ `invalidInput`，不以别的版本代替；`mcpActionSets` 缺 ⇒ 没有 `execute:*` 项，**不是**「对端没有动作」；根自己的属性项 ⇒ `values` 里没有（G-21）。
- **原子性**：不读不写任何存储，不改输入。**幂等**：同输入同输出；结果可缓存，**缓存键必须是整份输入**（`N:ae`「给消费者一个整份输入的指纹」：`evaluationInputFingerprint`），不得只以 (`tenant`, `root.definition`) 为键。
- **装配拿到非空 `unresolved`、`compositionCycle` 或 `categoryUnsupported` 必须失败**；其余消费者可以用 `assets` 与 `values`，但不得把 `unresolved` 里的标识当作有生效资产（`ae#S-31`）。

### 4.4 `ae#S-16` readWorkspaceCarrier（纯计算，不读文件）

- **输入**：已解析的清单值 ＋ `WorkspaceKey`。前提 PRE-5、PRE-7。
- **返回** `{ holdings, dropped }`：持有只缺 `since`（持有上的和每条配值上的都由调用方以读到文件的时刻补上）；`DropReason` 恰两值 `immutable_flag`、`unknown_asset`（`ae#S-28`）。
- **失败**：只有 `invalidInput`——形状不合（含清单表示层拒绝，作诊断附带）、`assets` 里同标识两次、`assignments` 里同（标识, 项）两次、`assignments` 里出现 `disabled`。
- **判不出种类的配值照常读入**，由第 4 步丢弃并留痕（不是放行）。工作区给别层提供的资产配设置本版读不出（C8 ＋ `unknown_asset`，`ae` G-4）。

### 4.5 资产治理的贯穿规矩（`ag`）

- **四种资格**（`ag#S-16`）：范围的管理者（组织层 = 有效超管；租户层 = 本人）、组织范围创作权（有效超管；**普通成员一律 `notPermitted`**，G-3）、租户范围创作权（本人）、读者（出厂层 = 任何有效调用方；组织层 = 有效成员；租户层 = 本人）。依据只有（身份值, 持有记录, 成员资格效力），经 `og1#S-26` 现读；四种资格是一个纯函数（`N:ag` 操作表首行）。
- **缺席时的默认答案**（`ag#S-17`）：身份参数（`caller`、`owner`、`scope`、`organization`、`asset`、`capability`、`item`）缺即 `invalidInput`，**不从当前租户身份补**；`acknowledged` 缺 = 空集（只会拒）；`creationKey` 缺 = 不去重；`lineage`、`sharing` 缺 = 不是流转落地（直接入口**永远**缺）；`versionSelection` 缺 = `current`；**`byAgent`、`meta` 必填、不得默认 `false`**；`immutable` 缺 = 不随值加锁；`basedOn`、`expected`、`number`、`value`、`content` 必填。
- **失败值闭合十九个**（`ag#S-18`）：`invalidInput`、`crossTenant`、`scopeNotFound`、`notPermitted`、`assetNotFound`、`holdingNotFound`、`assignmentNotFound`、`alreadyHeld`、`lockedAbove`、`lockedHere`、`officialImmutable`、`notOwner`、`hasReferrers`（随失败返回此刻的引用方集合）、`versionSequenceBroken`、`versionNotPublished`、`valueOutOfDomain`（含凭据位写了非引用值）、`layerNotAllowed`、`selectionNotSingleTier`、`unavailable`。**`lockedAbove` 不能收成 `notPermitted`**；`unavailable` 不得折成 `notPermitted`、`…NotFound` 或空列表。三样一律以返回值承载。
- **判定次序**（`ag#S-19`，取第一个成立的）——**按范围定位**：表示层 `invalidInput`（任何读取之前）→ `crossTenant`（纯值比较）→ 范围所在组织在不在（`og1#S-22`；出厂层跳过）→ 资格 `notPermitted` → 记录／持有／配值的存在（先判用来定位的）→ `officialImmutable` → `notOwner` → 状态前置（按各操作 ⑥ 的先后）。**按记录定位**：表示层 → 调用方此刻有效 → 记录可见 → `officialImmutable` → `notOwner` → 角色 → **要先读出记录才判得出的 `invalidInput`**（类别、正文校验、保留区、名字收窄）→ 状态前置。**任何一步读不到 ⇒ `unavailable` 并停在那一步。**「调用方有效」先于「记录可见」：失效身份永远拿 `notPermitted`，问不出记录在不在。
- **每道准入现读**（`ag#S-20`）：成员资格、角色、持有、锁、引用方每次现读；缓存读面结果的地方必须写明失效条件，读面 `unavailable` 时不写缓存。
- **同一提交**（`ag#S-21`）与共同存储对象（`N:ag`「锁次序与插件内的同一提交」）：每个写事务**开头按全序一次取齐锁**，锁下重读、再判、再写；锁前读到的键在锁下变了 ⇒ 放掉事务按新键重来。本需求用到的三把：**L-3** 组织级持有哨兵 `asset-governance/holdings/<组织标识>`（按标识排序；序列化同一组织内组织层与全部成员租户层的持有写入与**引用方谓词读**——唯一性、`lockedAbove`、`lockedHere`、依据的第二种来路、引用方集合）；**L-4** 资产记录行（所有者、存在、版本线、`basedOn`）；**L-5** 创建键哨兵（调用方, 键）。L-1、L-2、L-6 与跨 owner 的 X-1～X-3 只用于流转，归 PF-003 投影。**不加进程内锁**；sqlite 上 `lockRow`／`lockSentinel` 是空操作、写事务库级串行。
- **先告知再移除或删除**（`ag#S-22`）：调用方先读 `S-45`，带上确认过的集合 `acknowledged`；提交内现求，**此刻集合 ⊆ `acknowledged`**（份数不大于确认过的份数）才写，否则 `hasReferrers` 连同此刻集合返回、不写。**不级联**：移除只删那一份持有与它的配值，删除只删那一份记录。**提升不收 `hasReferrers`**。组合引用缺规则的那一类（`agent_definition`）⇒ 求引用方 `unavailable`，不当「没有」（G-5）。
- **不开控制事件**（`ag#S-49`）；将来开必须 `serial`。

### 4.6 资产治理的操作（`ag` 第四节）

「面」是 `N:ag` 的候选服务面。**每个写操作恰一次 `storage.write`**，锁、读、判、写在同一事务；事件在提交返回之后发。⑥ 是 `ag#S-18` 的子集，**按 `ag#S-19` 的次序**排。

| 操作 | 面 | 前置（择要） | 成功返回 | 失败集合 ⑥ | 幂等 ⑦ | 锁 |
|---|---|---|---|---|---|---|
| `S-24 createDraft` | `assets` | 租户所有 ⇒ 租户范围创作权；组织所有 ⇒ 组织范围创作权；`byAgent` 必填 | `AssetRecordId` | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `unavailable` | 带键：（`caller`, `creationKey`）在保留期内重放 ⇒ 返回首次的号、不写，**其余输入不同仍认回首次**；不带键不去重 | L-5 创建键 |
| `S-25 updateDraft` | `assets` | 有效；可见；对所有者有创作权；`basedOn` = 版本线末尾 | `ok` | `invalidInput` · `notPermitted` · `assetNotFound` · `officialImmutable` · `notOwner` · `versionSequenceBroken` · `unavailable` | 同内容重放 `ok`；`basedOn` 落后 ⇒ `versionSequenceBroken` | L-4 |
| `S-26 publish` | `assets` | 同上，最后一条换成 `expected` = 末尾 ＋ 1；**不判组合图成环**（G-6） | 版本号 | 同 `S-25` | 版本 `expected` 已存在、`publishedBy` 是 caller、内容与草稿相等 ⇒ 认回；其余 ⇒ `versionSequenceBroken` | L-4 |
| `S-27 promoteToOrganization` | `assets` | 组织范围创作权；所有者是 `{tenant: caller}`；**不看还有谁持有**（不收 `hasReferrers`） | `ok` | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `assetNotFound` · `officialImmutable` · `notOwner` · `unavailable` | 已是组织所有 ⇒ `ok`（仍过创作权） | L-3、L-4（与分享结束同提交，PF-003 投影） |
| `S-28 delete` | `assets` | 有效；可见；对所有者有创作权；此刻引用方 ⊆ `acknowledged` | `ok` | `invalidInput` · `notPermitted` · `assetNotFound` · `officialImmutable` · `notOwner` · `hasReferrers` · `unavailable` | 重放 ⇒ `assetNotFound` | L-3、L-4 |
| `S-29 registerOfficial` | **无面**（插件体按 `officialManifest` 登记） | 无授权前置：只有装配够得着；`meta` 必填 | （`AssetRecordId`, 版本号） | `invalidInput` · `unavailable` | 同内容同标记重放不写、不多出版本 | — |
| `S-30 hold` | `asset-holdings` | 范围管理者；记录至少一版已发布；该范围尚无该标识的持有；依据按 `ag#S-9` 自上而下自动定（调用方不给）；租户层遇组织替换锁只收同一份记录、`current` | `ok` | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `assetNotFound` · `officialImmutable` · `notOwner` · `versionNotPublished` · `alreadyHeld` · `lockedAbove` · `unavailable` | 同记录同依据同选用 ⇒ `ok`（即使此后加了锁）；另一份或不同选用 ⇒ `alreadyHeld` | L-3、L-4；撞唯一索引 ⇒ 提交内重读按 ⑦ 收场 |
| `S-31 unhold` | `asset-holdings` | 范围管理者；持有在；范围内组合引用方 ⊆ `acknowledged` | `ok` | `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted` · `holdingNotFound` · `hasReferrers` · `unavailable` | 重放 ⇒ `holdingNotFound` | L-3（同提交删配值） |
| `S-32 disable` | `asset-holdings` | 范围管理者；持有在 | `ok` | … · `holdingNotFound` · `officialImmutable` · `unavailable` | 已为真 ⇒ `ok` | L-3 |
| `S-33 enable` | `asset-holdings` | 同上 | `ok` | … · `holdingNotFound` · `unavailable` | 本来不为真 ⇒ `ok` | L-3 |
| `S-34`／`S-35` 加／解替换锁 | `asset-holdings` | 同上 | `ok` | … · `holdingNotFound` · `unavailable` | 已是目标状态 ⇒ `ok` | L-3 |
| `S-36 pinVersion` | `asset-holdings` | 持有在；所指记录存在；`number` 已发布；依据不是 `shared`；租户层时组织层没加替换锁 | `ok` | … · `holdingNotFound` · `assetNotFound` · `notOwner` · `versionNotPublished` · `lockedAbove` · `unavailable` | 已钉同号 ⇒ `ok` | L-3、L-4 |
| `S-37 unpinVersion` | `asset-holdings` | 持有在 | `ok` | … · `holdingNotFound` · `unavailable` | 本来 `current` ⇒ `ok` | L-3 |
| `S-38 assign` | `asset-holdings` | （项, 值）在选用那一版推出的声明里；不带锁时这一层该项没锁；**带 `immutable` 时替换这一层自己的锁**（新界须在外层界内） | `ok` | … · `holdingNotFound` · `lockedHere` · `valueOutOfDomain` · `layerNotAllowed` · `selectionNotSingleTier` · `lockedAbove` · `unavailable` | 同值同锁 ⇒ `ok`、`since` 不动、不发事件 | L-3 |
| `S-39 clearAssignment` | `asset-holdings` | 这一层该项没锁 | `ok` | … · `holdingNotFound` · `lockedHere` · `unavailable` | 本来没配 ⇒ `ok` | L-3 |
| `S-40 lockAssignment` | `asset-holdings` | 这一层该项有配值 | `ok` | … · `holdingNotFound` · `assignmentNotFound` · `unavailable` | 已上锁 ⇒ `ok` | L-3 |
| `S-41 unlockAssignment` | `asset-holdings` | 解锁后若成分档权限的挑选，必须恰一档 | `ok` | … · `holdingNotFound` · `selectionNotSingleTier` · `unavailable`（推不出声明） | 没锁或没配 ⇒ `ok` | L-3 |
| `S-42 listHoldings`、`S-43 readHolding` | `asset-holdings` | 该范围的读者 | 持有（带依据、选用、配值与锁）；列表可为空 | … · （`S-43` 另有 `holdingNotFound`）· `unavailable` | 只读；一次读事务 | — |
| `S-44 organizationSettingsView` | `asset-holdings` | 该组织的有效成员 | 每份持有 ＋ 表单（选用那一版推出的声明）；**已禁用的照样在、标着**；plugin 另列成员；推不出或记录已删的那份**显式标「推不出」** | … · `unavailable` | 只读；**不经 `evaluate`** | — |
| `S-45 listReferrers` | `asset-holdings` | 所有者一侧，或某个持有它的范围的管理者 | 持有方、组合引用方（只含 caller 列入的范围）、租户层持有份数（**只给所有者一侧；不给时是缺席，不是 0**） | `invalidInput` · `notPermitted` · `assetNotFound` · `unavailable` | 只读；一次读数，写以提交时现求为准 | — |
| `S-64 readAsset` | `assets` | 有效；可见 | 能力标识、来源、所有者与作者、`byAgent`、血缘、版本线元数据；**不含正文**；草稿只给有创作权的调用方 | `invalidInput` · `notPermitted` · `assetNotFound` · `unavailable` | 只读 | — |
| `S-65 readVersion` | `assets` | 有效；可见；`number` 已发布 | 那一版；记录已删而 caller 仍持有 ⇒ 「已删除」、不返回正文 | … · `versionNotPublished` · `unavailable` | 只读；唯一失效条件是删除或不再可见 | — |

「…」= `invalidInput` · `crossTenant` · `scopeNotFound` · `notPermitted`。
**写时守卫与求值是同一份实现**（`N:ag` 操作表 S-38～S-41 行、`N:ae`「S-23 的界与挑选单独导出」）：权限项上 `classifyPermissionAssignment` 判界还是挑选与档序、`boundOf` 求外层界 `X`、`pickWithinBound(value, X)` 为假 ⇒ `lockedAbove`；设置项上组织层该项带锁 ⇒ `lockedAbove`。**资产治理不调 `evaluate`**。
**配值写没有过期编辑守卫**：同一项并发配值，后提交的照写（`ag` G-21）。
**`mcp` 的 `execute:*` 项写面 `unavailable`**（`ag` G-5，动作集输入未定）。

### 4.7 各类正文里本需求用到的规则

| 类别 | 属性项（推出规则） | 类别与默认 | 表示层与其他 |
|---|---|---|---|
| Skill（`sp`） | 声明 = 定义记录 `.omne/skill.json` 的 `settings`（`sp#S-17`）；**系统不另规定设置项** | 作者自声明；作者自定义权限项本版不收 | `{manifest, body, definition?, resources}`；`SKILL.md` 按 YAML 1.2、键重复即 `malformed`、`body` 逐字（`sp#S-20`）；拒绝值与次序 `sp#S-24`；执行环境要求是定义记录的固定成员、不是设置（`sp#S-32`） |
| MCP（`me`） | `connectionTarget`、`credential`（落点与身份类）；`connectTimeout`、`callTimeout`（偏好）；每个动作一条 `execute:<对端动作名>`（权限，`forbid`／`auto`／`ask`）（`me#S-14`） | `credential` 不带默认（没取 = 缺席）；其余默认取正文 | 逐动作项按**动作名**键，动作消失配值照留、再出现照旧生效（`me#S-16`）；`not_fetched` 不是空清单（`me#S-15`）；工作区格只能配两项超时（`me#S-17`）；接入点 name 登记时收窄，否则 `name_not_projectable`（`me#S-26`） |
| Connector（`cn`） | `source`、`target`、`credential`（落点与身份类）、`triggeredSessionRunMode`（治理类）、`install`、`processingIdentity`（权限，**取值未定**）（`cn#S-11`） | 后三项设置不带默认；`triggeredSessionRunMode` 作者默认也不算，没给就开不出新会话 | **整组声明判不出**：推出规则交回 `underivable`，**不交前四项当全部**（`N:cn` CN-1）；信封不带归属（`cn#S-8`）；拒绝值 `target_unknown` > `channel_empty` > `envelope_empty` > `malformed`（`cn#S-18`） |
| Slash Command（`sc`） | **恒为空**（`sc#S-11`）：绑定目标与参数声明是正文 | — | 保留前缀 `omne-official:` 只归系统提供的命令型（`sc#S-3`、`#S-4`）；三种绑定 prompt／skill／command（`sc#S-6`）；只识别交付面输入（`sc#S-12`）；**名字只按会话命令集认，没有权限与不存在同一回答**（`sc#S-16`）；位置按**码点**计（`N:sc`）；解析失败什么都不发（`sc#S-24`） |
| Tool（`td`，只取两条） | `targetEnvironment`（落点）、`backgroundThreshold`／`timeout`／`concurrency`（偏好）、`execute`（权限）（`td#S-31`） | 见 PF-006 投影 | 组合引用 `composes.skills`（`td#S-16`） |
| Loop Extension（`le`，只取两条） | `position`、`dimension`（绑定）、`power`（权限，取值域 = 声明档及以下）；`usableBy` 即「谁可以安装」（`le#S-40`） | 见 PF-006 投影 | 干预力三档 `observe`／`rewrite`／`veto`（`le#S-4`） |

**正文端口的组合根只有一处**：`N:ae` 导出 `defaultBodyContracts`，资产治理插件体与据点注册表都 import 它构造 `N:am` 的判定对象、**不各自组端口**（D-040 §八 M51；`N:am` AM-5）——「同一值在每个接收边界得同一个拒绝值」由此保证。

## 5. Cordis 建模

### 5.1 插件与服务面

| 单元 | 形态 | 服务面 | 依据 |
|---|---|---|---|
| `core/asset-model`、`skill-package`、`slash-command`、`mcp-endpoint`、`connector`（以及丙的 `tool-definition`、`loop-extension`） | **纯模块，不是插件**：无服务键、无 `inject`、无 effect、不发不听事件、无存储 | 公开入口（候选名）：`createAssetModelJudge`／`judgeAssetValue`、`carrierRecordId`、`contentFingerprint`、`normalizeWorkspaceDirectory`、`parseWorkspaceManifestText`、`attributeDeclarationsOf`；`readSkillMd`、`readSkillPackage`、`judgeSkillPackage`；`recognize`、`parseInvocation`、`judgeSlashCommand`、`judgeInvocation`；`judgeMcpEndpoint`、`actionEntryName`；`judgeConnector`、`judgeEnvelope`；各自的 `*BodyContract` | 各节点「Cordis 原语：本节点一样也不用」表；契约没有操作与提交点 |
| `core/asset-evaluation` | **纯计算模块**，`evaluate`、`readWorkspaceCarrier`；另导出 `classifyPermissionAssignment`、`boundOf`、`pickWithinBound`、`evaluationInputFingerprint`、`defaultBodyContracts` | 无 | `N:ae`；D-039（assets 取候选 B） |
| `assets/asset-governance` | **一个插件 `asset-governance`、一条 fiber**，同一实例四个服务面：`assets`、`asset-holdings`（本需求）、`asset-transfer`、`asset-snapshot`（快照面，无契约条款，N-4） | 见第 4.6 节 | `N:ag`「能力到 Cordis 的投影」；[D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3)；不拆的理由：五处同一提交在一个 owner 内 |
| `tools/asset-registry` | 一个插件一条 fiber，服务 `assetRegistry`（本需求只用它的据点读面与求值消费；换表规则归 PF-006 投影） | — | `N:ar`「插件边界与服务面」 |

**不在任何服务面上的两件**：`ag#S-29` 官方件登记（插件体按 config 登记，「只有装配够得着」是结构性的）；`ag#S-46` 组合入口（插件内部写函数，公开方法签名里没有 `lineage`、`sharing`，由类型测试 C-4 守）。

### 5.2 依赖与重载

| 消费者 | `inject`（必需） | 其余依赖 | 换代时 |
|---|---|---|---|
| `asset-governance` | `storage`、`clock`、`memberships`、`organizations`（后两个是 `og1` 的服务名） | 包依赖：`core/asset-model`、`core/asset-evaluation`（只取 S-23 三函数与 `defaultBodyContracts`）、`core/offer-expiry`、`core/identity-values`、`core/storage`、OG 包的事务内读入口 `./tx-reads`（只由流转那一半用） | 任一提供者换代 ⇒ 插件体重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）；插件体只校验 config、登记官方件、`provide`，可重跑；缺席 ⇒ `PENDING`（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)） |
| `asset-registry` | `assemblyManifest`、`clock`；**不 inject `storage`** | 纯 import `core/asset-evaluation`、`core/asset-model`；据点读面 `evaluationInputs` 等是**调用时现取的可选依赖**（`resolveOptional`） | 装配清单无提供者 ⇒ 整批 `PENDING`（`N:ar` A-1） |

**不用 `isolate`**：租户、组织之间的差别全是数据（basis [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md)）；设置层序是数据层次，**不用 `ctx.intercept`**（H-4）。
**config**（`asset-governance`，五项）：`copyNoticeTtlDefault`、`sharingInvitationTtlDefault`、`assetCreationKeyRetention`、`copyAttemptKeyRetention`、`officialManifest`；任一不合法 ⇒ **启动失败**（不做成运行期 `unavailable`），值由 `N:th` 下发。

### 5.3 effect 装卸配对（`N:ag`「成对的装载与撤除」）

| 取得的资源 | 何时 | 部分失败 | 撤除与保留 |
|---|---|---|---|
| config 校验 | 插件体之前 | 不过 ⇒ fiber `FAILED`、一个面都不 provide（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)） | — |
| 正文判定对象（以 `defaultBodyContracts` 构造） | 插件体第一步；普通值，**不是 effect** | 端口缺一类 ⇒ 构造抛出 ⇒ `FAILED` | 随实例丢弃；重跑同一结果 |
| 官方件登记（逐条一次写事务） | 插件体、`provide` 之前；**持久写，不是 effect** | 任一条失败 ⇒ 抛出 ⇒ `FAILED`；已登记的留在存储里；有迁移的启动随升级快照撤回，**无迁移只改清单的启动靠幂等 ＋ 重登**（D-040 §八 M62） | 撤除时不做任何事；官方件只加不删 |
| 四个 `ctx.provide` | `ACTIVE` 后可解析 | 抛出则已 provide 的随 fiber 撤（H-1，probe 已过、未升 basis） | 服务消失；**在途调用跑完**、按各自那一次提交收场；无锁要放、无补偿；全部记录保留 |
| 迁移片段 | 装配期，`provide('storage')` 之前 | 失败 ⇒ 整体启动失败、快照恢复 | 表与数据不随插件撤除 |
| 定时器、监听者、连接 | **一个都没有**：不订阅成员与隶属事件（`ag#S-47`） | — | — |

纯模块与 `asset-evaluation` 装卸表为 0 行。

### 5.4 事件（都是通知，`emit`）

| 事件（`ag#S-48`） | 候选事件名 | 何时 |
|---|---|---|
| AssetPublished、AssetPromoted、AssetDeleted | `asset.published`、`asset.promoted`、`asset.deleted` | 对应写操作提交返回之后 |
| HoldingChanged | `asset.holding-changed` | 持有类写操作提交之后 |
| AssignmentChanged | `asset.assignment-changed` | 配值类写操作提交之后 |

- **派发**：`ctx.emit`，同步、丢弃返回值；不用 `serial`／`bail`／`waterfall`；**不设 `thisArg`、不用 `global`**（basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md)）。提交失败不发。审计条目在同一写事务里写 `asset_audit_entry`，不靠事件（`ag#S-3`）。
- **包一层**：监听者同步抛出会穿回发出方（basis [`emit-listener-throw-propagates`](../../../../basis/cordis/emit-listener-throw-propagates.md)），`notify` 捕获后记 error 级日志，已提交的事实不变、调用照常返回。
- **过滤**：`emit` 按租户过滤不了——`ag#S-48` 末条「租户层的事件只给那个租户的订阅者」**本版由结构给**：中心进程里没有 `asset.*` 的订阅者，写成两条会失败的检查（D-040 §八 M60，`N:th` verification）：`tools/ts-checks` 规则（`packages/` 除本包与 `apps/tenancy-host` 内不得订阅 `asset.*`）＋ 启动期断言监听者集合为空。**任何新增订阅者必须在推送边上按订阅资格过滤**（`N:ag` N-7）。
- **不开控制事件**；注册表不发不听任何事件（`N:ar`「事件与过滤器」）；纯模块不发不听。

### 5.5 装配草图

**中心（`apps/tenancy-host`）**，装载次序（`N:th`「装载清单与撤除次序」）：`storage` → `clock` → CV → AI → OG → AR → **`asset-governance`** → P-1 → 运维面 → 入口层；逆序撤除。

- 资产提供者、OG、P-1 解析到**同一个 `storage` 实例**，清单里只有一个 `storageSqlPlugin`、不用 `isolate`——X-1～X-3 唯一的装配前提（`N:th`「同一存储、同一约束域」，实现后第一波必跑）。
- 只装一份 `clock`；严格递增归 `infra/clock` C-15（流转用，PF-003 投影）。
- 迁移：资产片段追加在合成序列末尾；**不新增外键**（全库仍只有 `organization_owner_account_fk`）；唯一约束一律显式命名。
- config：`OMNE_TENANCY_COPY_NOTICE_TTL_DEFAULT`、`OMNE_TENANCY_SHARING_INVITATION_TTL_DEFAULT`（与运维面同一组值只解析一次）、`OMNE_TENANCY_ASSET_CREATION_KEY_RETENTION`、`OMNE_TENANCY_COPY_ATTEMPT_KEY_RETENTION`（缺或非正 ⇒ 启动失败）；官方件清单**不是环境变量**，随本应用发布（`N:th`「追加的 config」）。
- **入口层 v1 不 inject 资产四个面**：进程外没有任何一条路到达它们（`N:th` U-6）。

**据点（`apps/cli`）**：注册表 import `evaluate`，求值输入经据点读面 `evaluationInputs` 现取；**据点不 import `asset-governance`**（结构检查未写，`N:ag` N-12）。本版据点清单装不起来（装配清单、会话日志无提供者）；验收装配用替身，见第 8 节。

## 6. 绑定与证据

| 节点 | `bindings.yaml` | 已执行的证据 | 未执行的义务 |
|---|---|---|---|
| `core/asset-model` | 空 | 无 | V-1～V-5、V-7（SC-6）全部未开始 |
| `core/asset-evaluation` | 空 | 无（Alloy 见下） | V-1～V-11 全部未开始 |
| `core/skill-package`、`slash-command`、`mcp-endpoint`、`connector` | 空 | 无 | 各自 V-1～V-3（`sc` V-2 是 examples 第 4 节五十行）、消费者走查，全部未开始 |
| `assets/asset-governance` | 20 条，**全部绑 `capability.asset-transfer/v1`**（归 PF-003 投影）；`capability.asset-governance` 不建形式工件，**资产治理那一半 0 条** | 无 | `ag#S-54`～`#S-63` 十条规范场景、D-1～D-3、F-2、F-3、C-1、C-3、C-4、P-1～P-3，全部未开始 |
| `apps/tenancy-host` 资产段 | 无 | 无 | M-9 迁移合成、装载清单纳入新 fiber、config 政策、官方件登记整体性两支、同一存储结构检查（第一波必跑）、无订阅者两条检查，全部未开始 |
| `tools/asset-registry` | 空 | 无 | 见 PF-006 投影 |

| 证据 run | 与本需求的关系 |
|---|---|
| [`2026-09-25-formal-assets-runtimes`](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md) | 八个已登记 formal task 全部退出 0、无反例；**其中没有一个建模资产形状、求值或资产治理**。三个 `asset-transfer-v1-*` 任务是 PF-003 的证据 |
| [`2026-09-25-node24-json-probe`](../../../../record/evidence/2026-09-25-node24-json-probe/README.md) | Node ≥ 24.18.0 上 `JSON.parse` reviver 的 `context.source` 与 `JSON.rawJSON` 可用：这是 `N:am` 用 `readJsonStrict` 读承载清单、算内容指纹那条实现路径的**运行时前提**，不是任何条款的绑定 |
| [`2026-09-25-validity-stream-assembly`](../../../../record/evidence/2026-09-25-validity-stream-assembly/README.md) | 与本需求无关（stream-assembly 的有效性核对） |

- **`ae` 的 Alloy 模型 `formal/Evaluation.als` 不是 formal task**（`alloy exec` 退出码与断言无关），不可绑定；契约验证入口记了一次重跑（十八条命令、十三个变异体与预期一致），**原始输出未入 `record/evidence`**。它盖到的 (i)～(x) 要在实现上写成性质测试才落得到实现（`N:ae` V-1）。
- **basis 条目**（Cordis 4.0.4，[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）：`plugin-body-reruns-on-provider-change`、`inject-has-no-optional-form`、`plugin-throw-fails-fiber`、`emit-listener-throw-propagates`、`async-control-not-bail`、`effect-disposal-concurrent-not-ordered`、`isolate-hides-instances-not-data`、`logger-level-order-error-lowest`。**待核对主张** H-1（`ctx.provide` 由 effect 纳管）；**假设** H-2（Cordis 事件不跨进程）、H-4（`intercept` 合并顺序是装配链）；**本项目前提** H-3（`lockRow`／`lockSentinel` 在 sqlite 与 pg 下都给出次序，`core/storage` 一致性套件是否覆盖 pg 上的 `lockSentinel` 未核）。
- **covers.json**：PF-002 177 条全部 `reviewed: false`。

## 7. 未决项与已回询项

**缺口不填默认值**：下表每一项都写了本版怎么收——照「本版怎么收」实施，**不照一个看起来合理的猜测实施**。

### 7.1 契约缺口（40 条）

| 契约 | 缺口 | 本版怎么收 | owner |
|---|---|---|---|
| `am` | G-1 已发布版本能否退役或撤下 | 没有删除已发布版本的路径 | PF-002 的 owner |
| `am` | G-6 Agent Definition 正文无契约 | 不透明壳 | PF-004 |
| `am` | G-9 plugin 正文不完整（成员实现落在哪、是否随版本定死；plugin 自己的项与常驻标记） | 求值走到 plugin 即 `categoryUnsupported` | PF-002／主线 |
| `am` | G-12 项还在、取值域变了的留存配值怎么求值 | 未定 | `ae` ＋ PF-003 |
| `am` | G-15 Connector 的 `install` 与 `usableBy` 怎样对应 | 两个「谁能用」项并存，求值与写入面不知以哪个为准 | 主线 ＋ `cn` 收口 |
| `ae` | G-3 引用列表怎样从 Agent Definition 正文读出（根与 sub-agent） | 根由输入给 `root.references`；sub-agent ⇒ `categoryUnsupported` | PF-004 |
| `ae` | G-4 工作区给别层提供的资产配设置 | C8 ＋ `unknown_asset` 挡下 | 主线 |
| `ae` | G-6 清单 `source` 指向的包怎样解析成正文（闭合时读入也判 `name_not_projectable`） | 未定 | 各正文契约 |
| `ae` | G-7 会话创建参数之外的会话格写面 | 只有会话创建参数 | PF-015／PF-016 |
| `ae` | G-8 `S-25` 表外权限项的最严值 | 空集 | PF-002 的 owner |
| `ae` | G-9 落在界内的挑选多于一档或空集时落哪一档 | `P ∩ X` 原样交给放行判定 | PF-007／PF-002；或写入面挡 |
| `ae` | G-14 跨进程读快照一致性、清单完整性依据 | 单机不阻断 | 架构 |
| `ae` | G-18 几个 plugin 对同一成员常驻标记不一致 | `resident` 缺席 | PF-006 的 owner |
| `ae` | G-19 租户怎样显式启用工作区提供的 stdio 接入点与命令型拓展件 | **恒为禁用** | 主线（`am` 表示 ＋ `ag` 写面） |
| `ae` | G-21 Agent Definition 与 plugin 的属性项 | 根的属性项不在 `values`；plugin ⇒ `categoryUnsupported` | PF-004；`am` |
| `ag` | G-3 普通成员「按被授予的权限」在组织范围创作 | 一律 `notPermitted` | PF-002／PF-001 产品负责人 |
| `ag` | G-5 正文规则缺的那几格（`agent_definition` 属性项与组合引用、plugin 自己的项；`mcp` 逐动作项写时用哪份动作集） | `S-38` `unavailable`；`S-44` 标「推不出」；范围里有 `agent_definition` 时求引用方 `unavailable`；`execute:*` 写 `unavailable` | PF-004；`am`；`me` G-4 |
| `ag` | G-6 组合图成环在定义时拒绝 | `S-26` 不判环；环只在求值侧以 `compositionCycle` 发现 | 主线 ＋ G-5 |
| `ag` | G-7 删除之后仍指向它的持有，求值怎样对待 | `S-28` 不动它们，`S-31` 能移除，`S-38` 对它们给 `valueOutOfDomain` | `ae` ＋ PF-002 的 owner |
| `ag` | G-12 plugin 成员的表单与配值挂在哪 | `S-44` 只列成员能力标识；成员配值写不进来 | `am` ＋ `ae` |
| `ag` | G-13 资产之外的引用方（日程等） | `S-13` 不列 | 产品负责人 |
| `ag` | G-16 跨进程协调、传播上界与谓词读一致性 | 单机不阻断 | 架构 |
| `ag` | G-20 替换锁之下同一份记录的版本选用能否与组织层不同 | 锁下 `S-30` 只收 `current`、`S-36` `lockedAbove`；组织钉版而租户追随时两层用的版本不同 | PF-002 的 owner ＋ `ae` |
| `ag` | G-21 配值写的过期编辑守卫 | 不收 `expectedVersion`，后提交的照写——PF-001 §6.8 在配值上本版不兑现 | 主线 ＋ `am` |
| `ag` | G-22 个人组织被清除后它名下的资产去向 | 没有写路径；按范围操作收 `scopeNotFound` | PF-001／PF-002 产品负责人 |
| `ag` | G-26 租户逐件打开工作区提供的本地命令型 MCP 接入点与命令型 hook | **没有写面**，恒为禁用 | 主线 |
| `sp` | G-6 资源字节的携带与核对（无内联、无摘要） | 版本不可变对字节由持有方兑现 | 主线 |
| `sp` | G-7 研究盘点里未收的扩展字段 | 不收 | 主线 |
| `sp` | G-9 `Skills()` 跑脚本时两份执行环境声明怎样合并 | 未定 | PF-005／PF-006 |
| `sc` | G-7 系统业务流程（③ 型）的登记处 | 未定 | 主线 |
| `sc` | G-8 ③ 型留痕条目与受理面具名拒绝条目的形状 | 未定 | 受理契约（PF-014）＋ PF-000 |
| `sc` | G-9 命令与附件同一次提交怎样一起走 | 未定 | 受理契约（PF-014） |
| `me` | G-2 动作条目名跨接入点、跨作者工具撞名 | 未定 | 主线 |
| `me` | G-4 设置页呈现逐动作项用哪份动作集 | 未定；组织格没有自己的副本 | 主线 |
| `me` | G-7 逐动作项按名字键、不看内容（对端换掉同名动作） | 配值照旧适用（已接受的代价） | 主线 |
| `me` | G-8 是否禁止明文 `http` 连外网 | 本版不禁 | 产品负责人 |
| `cn` | G-4 `install`、`processingIdentity` 的取值域与默认；组织格能否配鉴权绑定 | 整组声明判不出；受理求不出处理身份 | PF-002 的 owner |
| `cn` | G-5 接入端与交接协议无契约 | 未定 | PF-014 |
| `cn` | G-7 外部消息被编辑后算不算同一件事 | 未定 | PF-014 的 owner |
| `cn` | G-10 PF-002 rev 19～20 的连接件改动只落了 `triggeredSessionRunMode` 一项（事件目录、订阅、第 ② 路、处理身份改为固定规则、`install` 并入 `usableBy` 未落） | 等连接件专项讨论后收口 | 主线 ＋ 产品负责人 |

### 7.2 节点缺口（23 条）

| 节点 | 缺口 | 挡住什么 | owner |
|---|---|---|---|
| `N:am` | AM-1 空白码点集合未从 identity-values 导出（同 `N:sc` SLC-1） | 名字词法 | identity-values 落包时（D-040 §八 M44） |
| `N:am` | AM-3 目录只做字面规范化，经符号链接的两条路径是两份工作区 | 同一目录两份工作区 | 会话创建一侧（PF-015） |
| `N:am` | AM-4 清单文本的读入方未指派（须用 `parseWorkspaceManifestText`） | PRE-7 | 主线指派据点侧读工作区的节点 |
| `N:am` | AM-6 `CredentialRef` 解引用方 `infra/secrets` 本程不补 | 凭据取值 | 下一程（M43 C-5） |
| `N:ae` | AE-4 清单读入的上一步（读文件、防符号链接逃逸）归读文件的一方 | PRE-7 | 据点侧读工作区的节点 |
| `N:ae` | AE-5 `root.references`（PF-004）与据点上的一致读（入口 v2）本程不补 | PRE-9、PRE-1 | 主线（M43 C-2、C-3） |
| `N:sp` | SP-1 `yaml` 依赖进 catalog、三条行为待核 | `SKILL.md` 读法 | 本节点落包时 |
| `N:sp` | SP-2 读目录、判符号链接的一方 | 目录形式读法 | 主线指派 |
| `N:sc` | SLC-1 同 AM-1 | — | 同 AM-1 |
| `N:cn` | CN-1 推出规则等 `cn` G-4，本版交回 `underivable` | 连接件的属性项一项也用不了，`triggeredSessionRunMode` 也配不了 | PF-002 的 owner |
| `N:ag` | N-2 运行期换代时重登官方件读不到存储 ⇒ `FAILED` 而非 `unavailable` | 本版无（不换代） | 本节点 |
| `N:ag` | N-3 OG `./tx-reads` 的导入限定规则未写 | 任何包可绕过 OG 服务面读表 | `tools/ts-checks` ＋ OG 节点 |
| `N:ag` | N-4 快照面没有契约条款，跨进程形状未定 | 据点求值组输入的中心那一半 | 主线（随入口 v2） |
| `N:ag` | N-5 资产四个面对外不可达 | **治理中心与 CLI/TUI 的全部资产流程** | 主线（入口契约 v2） |
| `N:ag` | N-6 `byAgent` 与调用上下文没有来路 | 本版无调用者 | 入口契约 v2 |
| `N:ag` | N-7 `emit` 无按租户过滤 | 任何新增订阅者会收到全部租户的变化 | 本版靠结构检查；将来的推送边 |
| `N:ag` | N-8 审计条目的形状与读面无契约 | 审计读不出来 | 主线（PF-000 记录条目） |
| `N:ag` | N-10 官方件清单没有产品内容；中心与据点版本不一致取哪份未定 | 出厂层为空时下界空真 | 产品负责人（内容）；主线（版本） |
| `N:ag` | N-12 「据点不 import 本包」的结构检查未写 | 候选 B 的代价 | `tools/ts-checks` ＋ `apps/cli` |
| `N:th` | U-6 中心资产各面对外不可达（同 N-5） | 同 N-5 | 入口契约 v2 |
| `N:th` | U-10 官方件清单没有产品内容（同 N-10） | 同 N-10 | 同 N-10 |
| `N:ar` | A-2 据点读面（求值输入、版本正文、会话事实）没有 provider 节点 | 注册表要求值的操作 `unavailable` | 装配（`apps/cli` C-3，下一程） |
| `N:ar` | A-3 资产变化转发者不存在 | `onAssetChange` 本批无调用方；再授予要等 reload | 装配（`apps/cli`） |

**已定形状、落包时兑现、不计为缺口**：端口组合根只在 `N:ae`（AM-5、SLC-2、CN-2、ME-2、AE-7，D-040 §八 M51）。**归 PF-003 投影**：`N:ag` N-1（时刻严格递增，`infra/clock` C-15）、N-9（血缘对应私有性）、N-11（存量记录无时刻）、`N:th` U-7。

### 7.3 产品未决与已回询项

- **产品未决（1 项）**：[PF-002 §九](../../design.md#九未决项) D-6——同一份连接件送来的一条事件走两种投递方式的哪一路。**不裁**，按 [decisions §三](../../decisions.md#三待裁决) 等产品负责人。
- **指路（不归本 topic）**：连接件的事件开出的新会话以哪个 agent definition、哪个租户身份建——归 PF-015。
- **产品负责人账本待裁**（`tmp/assets-runtimes/pending-user-rulings.md`，按编号只列、不裁）：
  1. 「批 4b 报回后新增的小待裁」表 **PF-002 D-6**；
  2. 产品修订批 **⚑4**（不锁的是挑选、「禁止」锁不锁都是界）；
  3. **⚑5**（界内谁都没挑到时取离最具体挑选最近的一档）；
  4. **⚑6**（仓库带来的本地命令型 MCP 接入点默认不启用）；
  5. **S19-c** 与「D-033 推迟的 G1–G11」段的工作区来源 command hook 默认禁用（「产品面，你回来看一眼」）；
  6. 修复波 1 **⑤**（PF-004 rev 12 §6.3「构成变小下一次运行起生效」vs PF-002 §4「命令集变化要人发 reload」）；
  7. 第二轮复评 **⑧ M5**（MCP 逐动作第四档在写面落地前不摆出来）；
  8. **D-040 逐条追认**（本页引的全部主线裁定）；
  9. 「二″ 你预告的专项讨论」：connector、channel、tag、schedule/routine（`cn` G-10 的收口依赖它）。
- **rev 17～18 与 rev 20 两项类别、D-5 待确认**：见第 1 节确认状态一列。

## 8. 实施顺序

**前提**：D-041、D-042 未签之前，据本页实施就是实施候选设计；签字后以 v2 为准。第 1～3 步不依赖任何未决项；第 4～5 步依赖存储与 OG 节点（已实现）；第 6 步挂在下一程缺口上。
每一步的判据都对到第 3 节的编号或第 6 节的义务；**验收替身与真承接者分开写**。

| 步 | 做什么 | 完成判据（可检查） | 依赖 |
|---|---|---|---|
| 0 | identity-values 包补空白码点集合的导出（AM-1／SLC-1） | 导出存在；`N:am`、`N:sc` 不自抄常量（代码审查） | 无 |
| 1 | 建 `packages/core/asset-model`：类型、`judgeAssetValue`、承载清单读法、记录号编码、指纹、属性声明推出端口 | `N:am` V-1（examples 第 1～14 节、Schema 逐字节相同）、V-2（第 13 节十四行次序）、V-3 通过；V-4 的 `am#S-29`～`#S-32` 单元级演练通过；SC-6 规则落 `tools/ts-checks` | 0；content-blocks 的 `readJsonStrict`（运行时前提已由 node24 probe 取证） |
| 2 | 建四个正文包 `skill-package`、`slash-command`、`mcp-endpoint`、`connector`（`tool-definition`、`loop-extension` 按 PF-006 投影同步建） | 各自 V-1～V-3 通过；`sc` V-2 五十行按码点逐行跑通；`cn` 推出规则对任意正文返回 `underivable`（CN-1）且不返回前四项；`sp` V-4 同时核 `yaml` 三条行为（SP-1） | 1 |
| 3 | 建 `packages/core/asset-evaluation`：`evaluate`、`readWorkspaceCarrier`、S-23 三函数、`evaluationInputFingerprint`、`defaultBodyContracts` | `N:ae` V-2～V-11 通过（对应 INV-7～INV-12、SAF-4～SAF-10）；V-1：把 Alloy (i)～(x) 写成随机持有／锁／禁用组合的性质测试，含 plugin 或 sub-agent 时断言 `categoryUnsupported` | 1、2 |
| 4 | 建 `packages/assets/asset-governance` 的资产面与持有面（流转面按 PF-003 投影同一包实施）：迁移片段、四种资格、判定流水、L-3／L-4／L-5 锁、写时守卫、官方件登记、事件包一层 | `ag#S-54`～`#S-63` 十条场景在真实 `storage-sql` 与真实 OG 上通过（INV-1～INV-6、SAF-1～SAF-3、SAF-11～SAF-19）；D-1、D-2、D-3 在 sqlite 与 pg 各一遍（D-2 是 L-3 谓词保护的唯一实证）；F-2、F-3 故障注入；C-4 类型测试（去掉 `@ts-expect-error` 即红）；P-1～P-3 | 3；已实现的 OG v1、`storage-sql`、`clock` |
| 5 | `apps/tenancy-host` 资产段：装载清单、迁移合成、config、两条无订阅者检查 | `assembly.manifest-shape` 纳入新 fiber 且只有一个 `storageSqlPlugin`（第一波必跑）；M-9 升级成功、全库外键仍只一条；config 缺或非法各一支启动失败且说明不含值；官方件登记整体性两支；`tools/ts-checks` 规则与启动期监听者为空断言，各带「故意违反即失败」自测 | 4 |
| 6 | 据点消费：注册表经 `evaluationInputs` 取输入、调 `evaluate`（换表规则按 PF-006 投影） | **验收替身**（只在 `apps/cli` 测试代码，产品清单里出现即结构检查失败）：装配清单替身、中心事实副本 `evaluationInputs` 替身、会话持有租户读面替身、凭据保管方替身——它们的行为**不进任何 bindings**。**真承接者**：装配清单契约（PF-004，C-2）、中心事实副本读面与入口契约 v2（C-3、C-4；`N:ag` N-4、N-5）、会话那一程（C-13）、`infra/secrets`（C-5）；每立一个，对应替身撤掉、场景改跑真承接者 | 3；下一程缺口 |

**本版端到端交付不了的**（不是实施遗漏，是缺口的直接后果）：用户经治理中心或 CLI/TUI 走任何资产流程（N-5／U-6）；组合里有 plugin 或 sub-agent 的 agent（`categoryUnsupported`）；连接件的任何属性项（CN-1）；租户打开仓库带来的本地命令型接入点与 hook（`ag` G-26）；普通成员在组织范围创作（`ag` G-3）。
