# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-24 按 PF-003 rev 5 原地修订后）：形式工件已在起草者本机按新模型执行一次；规范场景一条都没演练。**
> `capability.asset-transfer` v1 是 `candidate`，**未经独立评审、未接受**；尚无提供者设计、尚无源码。
> 下表登记的是**已经触发的证据义务**。三个正例配置的「无反例」**之所以有内容**，是因为同一次执行里十一个去保护配置都按预期给出了反例；
> 两条按构造成立的性质（`EndedStable`、`EffectsOnlyFromConfirmation`）**不作为证据**，理由在 [formal 入口](v1/formal/README.md#本版选用什么)。
> **原始输出与输入快照在主检出的任务区** `tmp/formal-runs/asset-transfer-v1-2026-09-24/`（`input/`、`input.sha256`、`run.sh`、`logs/`、`summary.txt`），**没有存进 `record/evidence/`**：起草者对那一区没有写权限，**正式证据 run 待主线落盘**。
> **不复活在 [G-11](v1/contract.md#十一已知缺口) 闭合之前只在模型里成立**：实现拿不到那两个时刻，[S-9](v1/contract.md#s-9-分享此刻是否生效) 按缺口收场（用不上）。

## 证据义务

### 形式工件

| 规范条款与性质 | 模型／配置 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| [S-7](v1/contract.md#s-7-两类待确认件共用的过期语义) · [S-10](v1/contract.md#s-10-复制血缘怎么判怎么记) · [S-12](v1/contract.md#s-12-流转边界团队资产不出那棵树) · [S-17](v1/contract.md#s-17-每道准入现读确认时再判一遍) · [S-18](v1/contract.md#s-18-确认是一次提交同一落点的确认序列化) · [S-22](v1/contract.md#s-22-确认复制) · [S-49](v1/contract.md#s-49-方向与落点矩阵逐格)（复制） | TLC 对 [`Transfer.tla`](v1/formal/Transfer.tla)，配置 [`Transfer.cfg`](v1/formal/Transfer.cfg)；formal task `asset-transfer-v1-transfer` | **已执行**（[下文](#实际执行)）：**无反例**，195,984 个不同状态、完整穷尽、深度 16 | 结论只在模型的固定规模内、**且存储真的兑现同提交与序列化**这个前提下成立；跨进程不自动成立（[S-34](v1/contract.md#s-34-装配给的保证-vs-协议须给的保证)） |
| [S-7](v1/contract.md#s-7-两类待确认件共用的过期语义) · [S-8](v1/contract.md#s-8-分享) · [S-9](v1/contract.md#s-9-分享此刻是否生效) · [S-31](v1/contract.md#s-31-隶属解除分享在使用时失效不靠事件) · [S-32](v1/contract.md#s-32-成员关系解除复制执行不了已确认的不动) · [S-49](v1/contract.md#s-49-方向与落点矩阵逐格)（分享） | 同一模型，配置 [`Transfer_Share.cfg`](v1/formal/Transfer_Share.cfg)；formal task `asset-transfer-v1-share` | **已执行**：**无反例**，691,760 个不同状态、完整穷尽、深度 20 | 同上；另：`MaxClock = 2`。扩到 3 的一次**未登记**运行也无反例（7,311,792 个不同状态，[下文](#实际执行)） |
| **不复活**：[S-9](v1/contract.md#s-9-分享此刻是否生效) 第三个合取项 · [S-31](v1/contract.md#s-31-隶属解除分享在使用时失效不靠事件) · [S-32](v1/contract.md#s-32-成员关系解除复制执行不了已确认的不动) | 同一模型，配置 [`Transfer_Revival.cfg`](v1/formal/Transfer_Revival.cfg)（时序性质 `NoRevival`）；formal task `asset-transfer-v1-revival` | **已执行**：**无反例**（2026-09-24 由缺口的反例改为正例） | 前提：两个时刻与确认时刻同源、严格递增——实现侧受阻于 [G-11](v1/contract.md#十一已知缺口) |
| 上面三行的**有效性**（六处保护各自去掉） | 十一个 `Transfer_No*.cfg`，**预期找到反例** | **已执行**：十一个都**按预期违反**，轨迹对得上 [formal 入口](v1/formal/README.md#tla-与-tlc)写的局面（[结果与反例](#结果与反例)） | **必须与上面三行成对报告**。它们**不登记为 formal task**——期望失败的检查与该清单的语义相反（这次都退出 12） |

### 规范场景

**十一条全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-39 两类待确认件的三种收场](v1/contract.md#s-39-两类待确认件的三种收场) | 演练，**关掉后台清理**，能操纵时间源 | **未开始** | 三路同值必须**同一次**对比；**可与 `data.offer-expiry` 的 S-23～S-25 一次执行两边兑现**，两边各自记结果 |
| [S-40 首次、重复、撞标识无血缘、按层找](v1/contract.md#s-40-首次重复撞标识无血缘按层找) | 演练 | **未开始** | 落地走资产治理的组合入口（`capability.asset-governance/v1#S-46`）；本人型落租户级受阻于 [G-14](v1/contract.md#十一已知缺口)（`data.asset-model` 的血缘所有者限组织） |
| [S-41 覆盖不碰配值](v1/contract.md#s-41-覆盖不碰配值) | 演练 | **未开始** | **这是「覆盖不碰配值」唯一的证据**——模型里它是 `UNCHANGED`，被建模方式吸收 |
| [S-42 边界在每条路径上都挡住](v1/contract.md#s-42-边界在每条路径上都挡住) | 演练，**发起者一律用超级管理员** | **未开始** | 发起者不是超管就区分不了结构性禁止与权限判定 |
| [S-43 分享的建立、跟随与结束](v1/contract.md#s-43-分享的建立跟随与结束) | 演练，**跨契约**（本契约 ＋ 资产求值） | **未开始** | 「下一次求值就用到新版本」「撤销后下一次使用被拒」由求值兑现；组织—组织那一种的「使用」受阻于 [G-11](v1/contract.md#十一已知缺口) |
| [S-44 隶属解除之后](v1/contract.md#s-44-隶属解除之后分享失效复制留着不复活) | 演练，**关掉 `affiliation.dissolved` 的派发再跑一遍**；解除与重建之间不做任何读 | **未开始** | 两次结果必须相同——那是「不靠事件」唯一的实现侧证据；「重建之后仍 `dissolved`」受阻于 [G-11](v1/contract.md#十一已知缺口) |
| [S-45 资产被移除即过期](v1/contract.md#s-45-资产被移除即过期) | 演练 | **未开始** | 「移除后再持有」那一支在 [G-3](v1/contract.md#十一已知缺口) 闭合前可能失败；**可与 `data.offer-expiry` 的 S-26 一次执行两边兑现** |
| [S-46 plugin 随行与引用告知](v1/contract.md#s-46-plugin-随行与引用告知) | 演练 | **未开始** | 受阻：[G-5](v1/contract.md#十一已知缺口) |
| [S-47 不可用时明确失败](v1/contract.md#s-47-不可用时明确失败) | **故障注入** | **未开始** | 最容易被「读不到就当没有」抹掉的一条，必须真跑；两个时刻的读面在 G-11 之前恒不可用，这一支天然成立、**不算证据** |
| [S-50 组织内分享与成员关系](v1/contract.md#s-50-组织内分享与成员关系) | 演练，**跨契约**（本契约 ＋ 组织治理 ＋ 资产求值） | **未开始** | 受阻：[G-14](v1/contract.md#十一已知缺口)（租户格的 `shared` 持有）、[G-11](v1/contract.md#十一已知缺口)（使用与不复活） |
| [S-51 方向矩阵逐格](v1/contract.md#s-51-方向矩阵逐格) | 演练，普通成员与超管各一遍 | **未开始** | 矩阵在模型里只建了「不落别人的租户级」「组织级只经目标超管」两格，**其余各格只有这一条证据** |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| basis 为 shared 的持有（组织格或租户格）**在使用那一刻**按 (资产, 被分享方) 与三个合取项判可用，读不到即失败 | [S-9](v1/contract.md#s-9-分享此刻是否生效) | `capability.asset-evaluation`（PRE-2 待对齐，已报主线） | 那份契约的场景；本契约 S-43／S-44／S-50 跨契约演练 |
| 隶属建立时刻、成员关系生效时刻有读面，与确认时刻同源且严格递增 | [S-9](v1/contract.md#s-9-分享此刻是否生效)、[S-34](v1/contract.md#s-34-装配给的保证-vs-协议须给的保证) | `capability.organization-governance` 新版本 | [G-11](v1/contract.md#十一已知缺口) |
| 求值取持有记录**当前发布的那一版**（追随当前版的持有） | [S-11](v1/contract.md#s-11-复制的收场)、[十二](v1/contract.md#十二消费者核对) | `data.asset-model`（S-18 第 6 条）＋ `capability.asset-evaluation`（C9） | 同上 |
| 落地的写集合能进本契约确认（本人型：发起）的同一次提交 | [S-18](v1/contract.md#s-18-确认是一次提交同一落点的确认序列化) | 同一提供者（拆分提案 PA-3）经 `capability.asset-governance` 的组合入口 ＋ 装配 | 提供者设计须指出事务覆盖的全部存储对象 |
| 资产记录号不复用、持有可辨实例 | [S-7](v1/contract.md#s-7-两类待确认件共用的过期语义) | `data.asset-model`（S-4 已给前一半）、`capability.asset-governance` | 后一半仍在 [G-3](v1/contract.md#十一已知缺口) |

## 实际执行

**2026-09-24，起草者本机；输入快照与原始输出在主检出 `tmp/formal-runs/asset-transfer-v1-2026-09-24/`，未落进 `record/evidence/`。**

- **工具**：TLC2 Version 2026.09.12.025210（rev 867aefb），`/opt/tlaplus/tla2tools.jar`；Eclipse Adoptium 21.0.12.1（`/usr/local/bin/java`），Linux 5.15 amd64，8 核
- **工作目录**：设计根 `.meta_harness/design`（与 `formal-tasks.json` 的 runner 相同）；`-Djava.io.tmpdir=tmp/java`，`-metadir tmp/tlc/asset-transfer-ev-<名>`
- **输入**：本分支工作树里的 `v1/formal/Transfer.tla` 与十四个配置（**未提交前的同内容文件**，SHA-256 见快照的 `input.sha256`；`Transfer.tla` 为 `4bb32d3e…04c0`）；提交之后以提交修订为准
- **命令**（每个配置一次，形制同 `formal-tasks.json`）：
  `java -cp tla2tools.jar tlc2.TLC -metadir tmp/tlc/<名> -cleanup -noGenerateSpecTE -workers <n> -config spec/capabilities/asset-transfer/v1/formal/<配置> spec/capabilities/asset-transfer/v1/formal/Transfer.tla`；
  正例按登记的 worker 数（`Transfer.cfg`、`Transfer_Share.cfg` 为 1，`Transfer_Revival.cfg` 为 4），去保护配置一律 1 个 worker（广度优先，给出最短反例）

| 配置 | worker | 退出码 | 结果 | 规模 |
|---|---|---|---|---|
| `Transfer.cfg` | 1 | **0** | `Model checking completed. No error has been found.` | 925,185 generated · **195,984 distinct** · 0 left · 深度 16 · 10 s |
| `Transfer_Share.cfg` | 1 | **0** | 同上 | 4,058,557 generated · **691,760 distinct** · 0 left · 深度 20 · 55 s |
| `Transfer_Revival.cfg` | 4 | **0** | 同上 | 4,058,557 generated · **691,760 distinct** · 0 left · 深度 20 · 1 min 54 s |
| `Transfer_NoSameCommit_Settle.cfg` | 1 | 12 | `Invariant NoLateOrDoubleSettle is violated.` | 轨迹 6 个状态 |
| `Transfer_NoSameCommit_Lineage.cfg` | 1 | 12 | `Invariant AtMostOneLineageTarget is violated.` | 轨迹 6 个状态 |
| `Transfer_NoSameCommit_Sharing.cfg` | 1 | 12 | `Invariant AtMostOneLiveSharingPerPair is violated.` | 轨迹 8 个状态 |
| `Transfer_NoConfirmRecheck.cfg` | 1 | 12 | `Invariant CopyLandsInsideBoundary is violated.` | 轨迹 5 个状态 |
| `Transfer_NoUseTimeCheck.cfg` | 1 | 12 | `Invariant UseInsideBoundary is violated.` | 轨迹 5 个状态 |
| `Transfer_NoUseTimeCheck_Member.cfg` | 1 | 12 | `Invariant UseOnlyWhileMembersEffective is violated.` | 轨迹 5 个状态 |
| `Transfer_NoSinceCheck.cfg` | 1 | 12 | `Temporal property NoRevival was violated.` | 轨迹 5 个状态 ＋ 回环 |
| `Transfer_NoSinceCheck_Use.cfg` | 1 | 12 | `Invariant NoRevivedUse is violated.` | 轨迹 6 个状态 |
| `Transfer_NoLayerCheck.cfg` | 1 | 12 | `Invariant NoForeignTenantLanding is violated.` | 轨迹 3 个状态 |
| `Transfer_NoLayerCheck_Share.cfg` | 1 | 12 | `Invariant NoForeignTenantLanding is violated.` | 轨迹 3 个状态 |
| `Transfer_NoConfirmerCheck.cfg` | 1 | 12 | `Invariant OrgLevelLandingByTargetAdmin is violated.` | 轨迹 4 个状态 |
| `Transfer_Share_MaxClock3.cfg`（**只在快照里、不在版本目录、未登记**：`Transfer_Share.cfg` 把 `MaxClock` 改为 3 并加查 `NoRevival`） | 4 | **0** | `No error has been found.` | 47,003,569 generated · **7,311,792 distinct** · 0 left · 深度 22 · 3 min 46 s |

检查器按 `formal-tasks.json` 执行三个登记任务的结果记在本页[变化的影响](#变化的影响)。

## 结果与反例

十一个去保护配置的反例轨迹，**逐一对到了 formal 入口写的局面**：

| 配置 | 轨迹（动作序列） | 对应的契约局面 |
|---|---|---|
| `NoSameCommit_Settle` | `Affiliate(t2,t1)` → `Issue(c1)` → `ConfirmBegin(c1)` → `Tick(c1)` → `ConfirmEnd(c1)` | 读到 `pending` 之后时间走过 `expiresAt`，第二步照写 `accepted`——[S-18](v1/contract.md#s-18-确认是一次提交同一落点的确认序列化) 要关的那个窗口 |
| `NoSameCommit_Lineage` | `Affiliate(t2,t1)` → `OwnBegin(k1)` → `OwnBegin(k2)` → `OwnEnd(k1)` → `OwnEnd(k2)` | 两次本人型发起都判成首次，同一 (源, 落进的那一层) 出现两份带血缘的记录——[S-10](v1/contract.md#s-10-复制血缘怎么判怎么记) |
| `NoSameCommit_Sharing` | `Affiliate(t2,t1)` → `Issue(s1)` → `ConfirmBegin(s1)` → `Issue(s2)` → `ConfirmBegin(s2)` → `ConfirmEnd(s1)` → `ConfirmEnd(s2)` | 同一对两份生效——[S-8](v1/contract.md#s-8-分享) |
| `NoConfirmRecheck` | `Affiliate(t2,t1)` → `Issue(c1)` → `Dissolve(t2)` → `ConfirmCopy(c1,B2)` | 发起时同树、确认时已不同树，团队资产在树外落地——[S-12](v1/contract.md#s-12-流转边界团队资产不出那棵树)、[S-17](v1/contract.md#s-17-每道准入现读确认时再判一遍) |
| `NoUseTimeCheck` | `Affiliate(t2,t1)` → `OwnShare(A2)` → `Dissolve(t2)` → `Use(o1)` | 解除之后事件反应没发生，使用照旧成立——[S-31](v1/contract.md#s-31-隶属解除分享在使用时失效不靠事件) 禁止的做法 |
| `NoUseTimeCheck_Member` | `Affiliate(t2,t1)` → `OwnShare(A2)` → `Leave(A1)` → `Use(o1)` | 分享方那一端的成员关系解除，使用照旧成立——[S-32](v1/contract.md#s-32-成员关系解除复制执行不了已确认的不动) |
| `NoSinceCheck` | `Affiliate(t2,t1)` → `OwnShare(A2)` → `Dissolve(t2)` → `Affiliate(t2,t1)`，此后停在「生效」 | 断开之后重建隶属，那份分享重新生效——**不复活**要挡的正是这一条（[S-9](v1/contract.md#s-9-分享此刻是否生效)） |
| `NoSinceCheck_Use` | 同上 → `Use(o1)` | 同上，且被使用 |
| `NoLayerCheck` | `Affiliate(t2,t1)` → `OwnCopy(B2)` | 本人型复制落进另一个组织里别人的租户级——[S-49](v1/contract.md#s-49-方向与落点矩阵逐格) `targetLayerNotSelf` |
| `NoLayerCheck_Share` | `Affiliate(t2,t1)` → `OwnShare(B2)` | 同上，分享 |
| `NoConfirmerCheck` | `Affiliate(t2,t1)` → `Issue(c1)` → `ConfirmCopy(c1,A1)` | 源侧超管替目标组织点头，组织级落地没经目标超管——[S-22](v1/contract.md#s-22-确认复制) ② |

**不复活的反例都走本人型分享 o1**：它是分享那一组里最短的「断开—重建」局面；组织—组织的 s1、s2 与组织内的 s3 用的是同一个 `Stale`，正例配置对它们一并穷尽。

**「无反例」离「已验证」还差一大截**：模型只覆盖交错；写集合、失败值、投影、跨契约的求值与落地面、矩阵的其余各格全在规范场景里，**十一条一条都没跑**。

## 变化的影响

- **2026-09-23 起草**：首版，没有旧证据可作废。
- **同日 `make design-check FORMAL=run`**：检查器执行 `asset-transfer-v1-transfer`，退出 0（检查器只记退出码）。
- **2026-09-24 整批对齐（简报 S23；主线裁定 2026-09-23，待产品负责人确认）：原地改了候选，模型与配置未动。**
  - 失败值改名：确认路径 `expired` → **`offerNoLongerValid`**，撤回路径 `alreadyConfirmed`／`expired` → **`alreadyConcluded`**，与 `capability.organization-governance` v1 同名（账本 T-1）；[S-7](v1/contract.md#s-7-两类待确认件共用的过期语义)、[S-19](v1/contract.md#s-19-这一节每个操作写全九件事)、S-21～S-26、第七节、S-39、S-45、S-47 与实例第 7 节随之改。**派生状态 `expired`（`OfferState`）不变。**
  - 新操作 [S-48 `listPendingForOrganization`](v1/contract.md#s-48-列出组织收到的待确认件)（T-2，G-1 闭合）；G-6、G-10 闭合，G-3、G-4、G-9 改写；依赖 `data.asset-model`、`capability.asset-governance` 按条款号登记；[S-18](v1/contract.md#s-18-确认是一次提交同一落点的确认序列化) 写明同一提供者同一提交（PA-3）；[S-34](v1/contract.md#s-34-装配给的保证-vs-协议须给的保证) 加隶属哨兵一行（PA-4）；[S-8](v1/contract.md#s-8-分享) 写明已分享出去的记录不能被提升、[S-9](v1/contract.md#s-9-分享此刻是否生效) 写明租户格的 `organization` 持有随分享判（S11-G2）；[S-4](v1/contract.md#s-4-依赖方向与被消费的面) 更正「求值读本契约」为组输入的一方读。
  - **对证据的影响**：TLC 那一次运行对应的模型与配置未改，结论不受影响（它只看效果，不看失败值名）。
- **2026-09-24 按 PF-003 rev 5 原地修订（简报 spec-revision-2026-09-24 第一节；产品负责人同日裁定 U-24-3、U-3 乙）：候选语义、模型与配置全部改动。**
  - **改了的条款**：头部依据（PF-003 rev 5、PF-002 rev 19、PF-001 rev 17）与裁定两行；[S-1](v1/contract.md#s-1-本契约拥有什么)、[S-2](v1/contract.md#s-2-本契约不拥有什么)、S-3、[S-4](v1/contract.md#s-4-依赖方向与被消费的面)（加 `data.identity-values#S-11`，注明组织治理 v1 缺两个时刻）、S-5（组织型才有复制通知，落点恒是目标组织级）、S-6（被分享方是一层，本人型没有邀请）、S-7（组织内分享的邀请同类默认值）、[S-8](v1/contract.md#s-8-分享)（四种分享；「生效」而非 `active` 的同对唯一）、[S-9](v1/contract.md#s-9-分享此刻是否生效)（**三个合取项**；租户格；G-11 之前的收场）、[S-10](v1/contract.md#s-10-复制血缘怎么判怎么记)（**按 (源, 落进的那一层) 找**；`importedBy` 是落地那一侧；提升之后）、[S-11](v1/contract.md#s-11-复制的收场)（所有者是那一层的所有者、作者是落地的行为人）、[S-12](v1/contract.md#s-12-流转边界团队资产不出那棵树)（两式；组织内不求）、[S-13](v1/contract.md#s-13-发起者一侧的资产)（所有者决定是哪一种）、S-14～S-18、[S-19](v1/contract.md#s-19-这一节每个操作写全九件事)（失败值总表、谁能做）、S-20～S-30、S-48（全部两支化或补租户那一类）、[S-31](v1/contract.md#s-31-隶属解除分享在使用时失效不靠事件)、[S-32](v1/contract.md#s-32-成员关系解除复制执行不了已确认的不动)（**不复活**；租户一端退出即结束）、S-33、第七节、[S-34](v1/contract.md#s-34-装配给的保证-vs-协议须给的保证)（三个时刻可比一行）、S-35、S-37、[S-38](v1/contract.md#s-38-本版选用哪些形式工件)、S-39～S-47、十一、十二、十三。
  - **新增条款**：[S-49 方向与落点：矩阵逐格](v1/contract.md#s-49-方向与落点矩阵逐格)、[S-50](v1/contract.md#s-50-组织内分享与成员关系)、[S-51](v1/contract.md#s-51-方向矩阵逐格)。
  - **失败值**：新增 `targetLayerNotSelf`、`layerNotAllowed`、`recipientNotMember`；**取消 `organizationAssetNotCopyable`**（它挡的那一格随 rev 5 不存在了）；简报举例的 `cross_tree`、`org_copy_requires_admin` 就是已有的 `outsideTree`、`notPermitted`，不另起。
  - **缺口**：G-2、G-4、G-7 闭合（编号保留）；新增 G-11（两个时刻的读面，**阻断**团队组织之间与有租户一端的分享的使用）、G-12（本人型重放）、G-13（组织型目标侧投影要不要带源组织）、G-14（`data.asset-model` 两处形状）。
  - **场景标题改动**：S-40、S-43、S-44 的标题改了措辞，锚点随之变；本包外没有引用这三个锚点（已核）。
  - **模型重写**：`Transfer.tla` 按 rev 5 重建——两条复制通则、组织内分享、本人型分享、[S-9](v1/contract.md#s-9-分享此刻是否生效) 的三个合取项（`PathLinks`、`affSince`、`effSince`）、落点与确认者判定；六个保护开关（新增 `SinceCheck`、`LayerCheck`、`ConfirmerCheck`）；按 `Scene` 分复制与分享两组。配置由七个变成十四个：旧的 `Transfer_NoSameCommit_*`、`Transfer_NoConfirmRecheck`、`Transfer_NoUseTimeCheck` 按新模型重写，新增 `Transfer_Share`、`Transfer_NoUseTimeCheck_Member`、`Transfer_NoSinceCheck`、`Transfer_NoSinceCheck_Use`、`Transfer_NoLayerCheck`、`Transfer_NoLayerCheck_Share`、`Transfer_NoConfirmerCheck`；**`Transfer_Revival.cfg` 由反例改为正例**并登记为 formal task。不变量 `AtMostOneActiveSharingPerPair` 改为 `AtMostOneLiveSharingPerPair`（按「生效」计）。
  - **对证据的影响**：**2026-09-23 那一次运行（345,600 个不同状态）与同日检查器的那次执行全部作废**——模型与配置都换了；本页[实际执行](#实际执行)是按新模型的整组重跑。formal task `asset-transfer-v1-transfer` 的配置内容变了（同名，现在只查复制那一组），新增 `asset-transfer-v1-share`、`asset-transfer-v1-revival`。
    同日在工作树根跑 `make design-check FORMAL=run`：检查器按 `formal-tasks.json` 执行三个任务，**各退出 0**，整棵设计树 `PASS`（检查器只记退出码；输出存于同一快照的 `design-check.log`）。
- 此后模型或任一配置改动，**上表全部重跑**：三个正例与十一个去保护配置必须成对重跑，否则「无反例」失去有效性支撑。
