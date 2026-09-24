# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-24 整批对齐后）：形式工件已在起草者本机执行一次；规范场景一条都没演练。**
> `capability.asset-transfer` v1 是 `candidate`，**未经独立评审、未接受**；尚无提供者设计、尚无源码。
> 下表登记的是**已经触发的证据义务**。模型那几条「无反例」**之所以有内容**，是因为同一次执行里五个去保护配置都按预期给出了反例；
> 两条按构造成立的性质（`EndedStable`、`EffectsOnlyFromConfirmation`）**不作为证据**，理由在 [formal 入口](v1/formal/README.md#本版选用什么)。
> **原始输出与输入快照没有存进 `record/evidence/`**：起草者对那一区没有写权限，下面「实际执行」一节只是摘要，**正式证据 run 待主线落盘**。

## 证据义务

### 形式工件

| 规范条款与性质 | 模型／配置 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| [S-7](v1/contract.md#s-7-两类待确认件共用的过期语义) · [S-10](v1/contract.md#s-10-复制血缘怎么判怎么记) · [S-8](v1/contract.md#s-8-分享) · [S-12](v1/contract.md#s-12-流转边界团队资产不出那棵树) · [S-17](v1/contract.md#s-17-每道准入现读确认时再判一遍) · [S-18](v1/contract.md#s-18-确认是一次提交同一落点的确认序列化) · [S-31](v1/contract.md#s-31-隶属解除分享在使用时失效不靠事件) | TLC 对 [`Transfer.tla`](v1/formal/Transfer.tla)，配置 [`Transfer.cfg`](v1/formal/Transfer.cfg)；formal task `asset-transfer-v1-transfer` | **已执行**（[下文](#实际执行)）：**无反例**，345,600 个不同状态、完整穷尽、深度 18 | 结论只在模型的固定规模内、**且存储真的兑现同提交与序列化**这个前提下成立；跨进程不自动成立（[S-34](v1/contract.md#s-34-装配给的保证-vs-协议须给的保证)） |
| 同上的**有效性**（五处保护各自去掉） | 五个 `Transfer_No*.cfg`，**预期找到反例** | **已执行**：五个都**按预期违反**，轨迹对得上各配置注释写的局面（[结果与反例](#结果与反例)） | **必须与上一行成对报告**。它们**不登记为 formal task**——期望失败的检查与该清单的语义相反（检查器按退出码判成败，这次都退出 12） |
| [G-4](v1/contract.md#十一已知缺口)：解除后恢复同树会重新生效 | [`Transfer_Revival.cfg`](v1/formal/Transfer_Revival.cfg)，**预期找到反例** | **已执行**：**按预期违反** `NoRevival` | 不是一条被检查通过的性质，是缺口的可执行陈述；产品裁定后按裁定改写 |

### 规范场景

**九条全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-39 两类待确认件的三种收场](v1/contract.md#s-39-两类待确认件的三种收场) | 演练，**关掉后台清理**，能操纵时间源 | **未开始** | 三路同值必须**同一次**对比；**可与 `data.offer-expiry` 的 S-23～S-25 一次执行两边兑现**，两边各自记结果 |
| [S-40 首次、重复、撞标识无血缘](v1/contract.md#s-40-首次重复撞标识无血缘) | 演练 | **未开始** | 落地走资产治理的组合入口（`capability.asset-governance/v1#S-46`，原 G-10 闭合）；需要一个实现 |
| [S-41 覆盖不碰配值](v1/contract.md#s-41-覆盖不碰配值) | 演练 | **未开始** | **这是「覆盖不碰配值」唯一的证据**——模型里它是 `UNCHANGED`，被建模方式吸收 |
| [S-42 边界在每条路径上都挡住](v1/contract.md#s-42-边界在每条路径上都挡住) | 演练，**发起者一律用超级管理员** | **未开始** | 发起者不是超管就区分不了结构性禁止与权限判定 |
| [S-43 分享的建立、跟随与三种结束](v1/contract.md#s-43-分享的建立跟随与三种结束) | 演练，**跨契约**（本契约 ＋ 资产求值） | **未开始** | 「下一次求值就用到新版本」「撤销后下一次使用被拒」由求值兑现，只跑本契约这一半证明不了 |
| [S-44 隶属解除之后](v1/contract.md#s-44-隶属解除之后分享失效复制留着) | 演练，**关掉 `affiliation.dissolved` 的派发再跑一遍** | **未开始** | 两次结果必须相同——那是「不靠事件」唯一的实现侧证据；G-4 那一支如实记录 |
| [S-45 资产被移除即过期](v1/contract.md#s-45-资产被移除即过期) | 演练 | **未开始** | 「移除后再持有」那一支在 [G-3](v1/contract.md#十一已知缺口) 闭合前可能失败；**可与 `data.offer-expiry` 的 S-26 一次执行两边兑现** |
| [S-46 plugin 随行与引用告知](v1/contract.md#s-46-plugin-随行与引用告知) | 演练 | **未开始** | 受阻：[G-5](v1/contract.md#十一已知缺口) |
| [S-47 不可用时明确失败](v1/contract.md#s-47-不可用时明确失败) | **故障注入** | **未开始** | 最容易被「读不到就当没有」抹掉的一条，必须真跑 |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| basis 为 shared 的持有**在使用那一刻**按 (资产, 被分享方) 判可用，读不到即失败 | [S-9](v1/contract.md#s-9-分享此刻是否生效) | `capability.asset-evaluation` | 那份契约的场景；本契约 S-43／S-44 跨契约演练 |
| 求值取持有记录**当前发布的那一版**（追随当前版的持有） | [S-11](v1/contract.md#s-11-复制的收场)、[十二](v1/contract.md#十二消费者核对) | `data.asset-model`（S-18 第 6 条）＋ `capability.asset-evaluation`（C9） | 同上 |
| 落地的写集合能进本契约确认的同一次提交 | [S-18](v1/contract.md#s-18-确认是一次提交同一落点的确认序列化) | 同一提供者（拆分提案 PA-3）经 `capability.asset-governance` 的组合入口 ＋ 装配 | 提供者设计须指出事务覆盖的全部存储对象 |
| 资产记录号不复用、持有可辨实例 | [S-7](v1/contract.md#s-7-两类待确认件共用的过期语义) | `data.asset-model`（S-4 已给前一半）、`capability.asset-governance` | 后一半仍在 [G-3](v1/contract.md#十一已知缺口) |

## 实际执行

**2026-09-23，起草者本机，run 未落进 `record/evidence/`。**

- **工具**：TLC2 Version 2026.09.12.025210（rev 867aefb），`/opt/tlaplus/tla2tools.jar`；OpenJDK 21.0.12.1（Temurin），`/usr/local/bin/java`
- **工作目录**：设计根 `.meta_harness/design`（与 `formal-tasks.json` 的 runner 相同）
- **输入**：本分支工作树里的 `v1/formal/Transfer.tla` 与七个配置（**未提交前的同内容文件**；提交之后以提交修订为准）
- **命令**（主配置，逐字即 `formal-tasks.json` 的 `asset-transfer-v1-transfer`）：
  `java -cp tla2tools.jar tlc2.TLC -metadir tmp/tlc/asset-transfer-v1-transfer -cleanup -noGenerateSpecTE -workers 1 -config spec/capabilities/asset-transfer/v1/formal/Transfer.cfg spec/capabilities/asset-transfer/v1/formal/Transfer.tla`；
  六个有效性核对同一命令形制，只换 `-config` 与 `-metadir`

| 配置 | 退出码 | 结果 | 规模 |
|---|---|---|---|
| `Transfer.cfg` | **0** | `Model checking completed. No error has been found.` | 2,741,521 generated · **345,600 distinct** · 0 left · 深度 18 · 21 s |
| `Transfer_NoSameCommit_Settle.cfg` | 12 | `Invariant NoLateOrDoubleSettle is violated.` | 轨迹 6 步 |
| `Transfer_NoSameCommit_Lineage.cfg` | 12 | `Invariant AtMostOneLineageTarget is violated.` | 轨迹 8 步 |
| `Transfer_NoSameCommit_Sharing.cfg` | 12 | `Invariant AtMostOneActiveSharingPerPair is violated.` | 轨迹 8 步 |
| `Transfer_NoConfirmRecheck.cfg` | 12 | `Invariant CopyLandsInsideBoundary is violated.` | 轨迹 5 步 |
| `Transfer_NoUseTimeCheck.cfg` | 12 | `Invariant UseInsideBoundary is violated.` | 轨迹 6 步 |
| `Transfer_Revival.cfg` | 12 | `Temporal property NoRevival was violated.` | 轨迹 6 步 |

同日另经 `make design-check FORMAL=run` 由检查器按 `formal-tasks.json` 执行了一次主配置，结果记在本页[变化的影响](#变化的影响)。

## 结果与反例

五个去保护配置与一个缺口配置的反例轨迹，**逐一对到了配置注释里写的局面**：

| 配置 | 轨迹（动作序列） | 对应的契约局面 |
|---|---|---|
| `NoSameCommit_Settle` | `Affiliate(t2,t1)` → `Issue(s1)` → `ConfirmBegin(s1)` → `Tick(s1)` → `ConfirmEnd(s1)` | 读到 `pending` 之后时间走过 `expiresAt`，第二步照写 `accepted`——[S-18](v1/contract.md#s-18-确认是一次提交同一落点的确认序列化) 要关的那个窗口 |
| `NoSameCommit_Lineage` | `Affiliate` → `Issue(c1)` → `ConfirmBegin(c1)` → `Issue(c2)` → `ConfirmBegin(c2)` → `ConfirmEnd(c1)` → `ConfirmEnd(c2)` | 两次都判成首次，同一 (源, 目标) 出现两份带血缘的记录——[S-10](v1/contract.md#s-10-复制血缘怎么判怎么记) |
| `NoSameCommit_Sharing` | `Affiliate` → `Issue(s1)` → `ConfirmBegin(s1)` → `Issue(s2)` → `ConfirmBegin(s2)` → `ConfirmEnd(s1)` → `ConfirmEnd(s2)` | 同一对两份 `active`——[S-8](v1/contract.md#s-8-分享) |
| `NoConfirmRecheck` | `Affiliate(t2,t1)` → `Issue(c1)` → `Dissolve(t2)` → `Confirm(c1)` | 发起时同树、确认时已不同树，团队资产在树外落地——[S-12](v1/contract.md#s-12-流转边界团队资产不出那棵树)、[S-17](v1/contract.md#s-17-每道准入现读确认时再判一遍) |
| `NoUseTimeCheck` | `Affiliate(t2,t1)` → `Issue(s1)` → `Confirm(s1)` → `Dissolve(t2)` → `Use(s1)` | 解除之后事件反应没发生，使用照旧成立——[S-31](v1/contract.md#s-31-隶属解除分享在使用时失效不靠事件) 禁止的做法 |
| `Revival` | `Affiliate(t2,t1)` → `Issue(s1)` → `Confirm(s1)` → `Dissolve(t2)` → `Affiliate(t1,t2)` | 解除后反向重建隶属，那份分享重新生效——[G-4](v1/contract.md#十一已知缺口) |

**「无反例」离「已验证」还差一大截**：模型只覆盖交错；写集合、失败值、投影、跨契约的求值与落地面全在规范场景里，**九条一条都没跑**。

## 变化的影响

- **2026-09-23 起草**：首版，没有旧证据可作废。
- **同日 `make design-check FORMAL=run`**：检查器执行 `asset-transfer-v1-transfer`，退出 0（检查器只记退出码，TLC 的完整输出以上一节为准）。
- **2026-09-24 整批对齐（简报 S23；主线裁定 2026-09-23，待产品负责人确认）：原地改了候选，模型与配置未动。**
  - 失败值改名：确认路径 `expired` → **`offerNoLongerValid`**，撤回路径 `alreadyConfirmed`／`expired` → **`alreadyConcluded`**，与 `capability.organization-governance` v1 同名（账本 T-1）；[S-7](v1/contract.md#s-7-两类待确认件共用的过期语义)、[S-19](v1/contract.md#s-19-这一节每个操作写全九件事)、S-21～S-26、第七节、S-39、S-45、S-47 与实例第 7 节随之改。**派生状态 `expired`（`OfferState`）不变。**
  - 新操作 [S-48 `listPendingForOrganization`](v1/contract.md#s-48-列出组织收到的待确认件)（T-2，G-1 闭合）；G-6、G-10 闭合，G-3、G-4、G-9 改写；依赖 `data.asset-model`、`capability.asset-governance` 按条款号登记；[S-18](v1/contract.md#s-18-确认是一次提交同一落点的确认序列化) 写明同一提供者同一提交（PA-3）；[S-34](v1/contract.md#s-34-装配给的保证-vs-协议须给的保证) 加隶属哨兵一行（PA-4）；[S-8](v1/contract.md#s-8-分享) 写明已分享出去的记录不能被提升、[S-9](v1/contract.md#s-9-分享此刻是否生效) 写明租户格的 `organization` 持有随分享判（S11-G2）；[S-4](v1/contract.md#s-4-依赖方向与被消费的面) 更正「求值读本契约」为组输入的一方读。
  - **对证据的影响**：TLC 那一次运行对应的模型与配置未改，结论不受影响（它只看效果，不看失败值名）；本轮 `make design-check FORMAL=run` 重跑 `asset-transfer-v1-transfer`，结果记在整批对齐的交付里。
- 此后模型或任一配置改动，**上表全部重跑**：主配置与五个去保护配置必须成对重跑，否则「无反例」失去有效性支撑。
