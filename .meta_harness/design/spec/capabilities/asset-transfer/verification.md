# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-24 独立评审第一轮修订后）：形式工件已在起草者本机按当前模型整组重跑一次（2026-09-24d）；规范场景一条都没演练。**
> `capability.asset-transfer` v2 是 `candidate`，经独立评审第一轮（[处置表](#独立评审)），**未接受**；尚无提供者设计、尚无源码。
> 下表登记的是**已经触发的证据义务**。三个正例配置的「无反例」**之所以有内容**，是因为同一次执行里十三个去保护配置都按预期给出了反例；
> 两条按构造成立的性质（`EndedStable`、`EffectsOnlyFromConfirmation`）**不作为证据**，理由在 [formal 入口](v2/formal/README.md#本版选用什么)。
> **原始输出与输入快照在主检出的任务区** `tmp/formal-runs/asset-transfer-v2-2026-09-24d/`（`input/`、`input.sha256`、`run.sh`、`logs/`、`summary.txt`），**没有存进 `record/evidence/`**：起草者对那一区没有写权限，**正式证据 run 待主线落盘**。
> **不复活要的两个时刻由 `capability.organization-governance` v3 给出**——那份也是 `candidate`；[S-9](v2/contract.md#s-9-分享此刻是否生效) 两读的先后被模型吸收，**只有场景能给证据**。

## 证据义务

### 形式工件

| 规范条款与性质 | 模型／配置 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| [S-7](v2/contract.md#s-7-两类待确认件共用的过期语义) · [S-10](v2/contract.md#s-10-复制血缘怎么判怎么记) · [S-12](v2/contract.md#s-12-流转边界团队资产不出那棵树) · [S-17](v2/contract.md#s-17-每道准入现读确认时再判一遍) · [S-18](v2/contract.md#s-18-确认是一次提交同一落点的确认序列化) · [S-22](v2/contract.md#s-22-确认复制) · [S-49](v2/contract.md#s-49-方向与落点矩阵逐格)（复制） | TLC 对 [`Transfer.tla`](v2/formal/Transfer.tla)，配置 [`Transfer.cfg`](v2/formal/Transfer.cfg)；formal task `asset-transfer-v2-transfer` | **已执行**（2026-09-24d，[下文](#实际执行)）：**无反例**，195,984 个不同状态、完整穷尽、深度 16 | 结论只在模型的固定规模内、**且存储真的兑现同提交与序列化**这个前提下成立；跨进程不自动成立（[S-34](v2/contract.md#s-34-装配给的保证-vs-协议须给的保证)） |
| [S-7](v2/contract.md#s-7-两类待确认件共用的过期语义) · [S-8](v2/contract.md#s-8-分享) · [S-9](v2/contract.md#s-9-分享此刻是否生效) · [S-31](v2/contract.md#s-31-隶属解除分享在使用时失效不靠事件) · [S-32](v2/contract.md#s-32-成员关系解除复制执行不了已确认的不动) · [S-49](v2/contract.md#s-49-方向与落点矩阵逐格) · [S-52](v2/contract.md#s-52-分享方删除资产或所有权易手分享随之结束)（分享） | 同一模型，配置 [`Transfer_Share.cfg`](v2/formal/Transfer_Share.cfg)；formal task `asset-transfer-v2-share` | **已执行**（2026-09-24d）：**无反例**，1,179,208 个不同状态、完整穷尽、深度 20 | 同上；另：`MaxClock = 2`。上午那次扩到 3 的未登记运行对应旧模型，**已作废、本轮未重跑** |
| **不复活**：[S-9](v2/contract.md#s-9-分享此刻是否生效) 第三个合取项 · [S-31](v2/contract.md#s-31-隶属解除分享在使用时失效不靠事件) · [S-32](v2/contract.md#s-32-成员关系解除复制执行不了已确认的不动) | 同一模型，配置 [`Transfer_Revival.cfg`](v2/formal/Transfer_Revival.cfg)（时序性质 `NoRevival`）；formal task `asset-transfer-v2-revival` | **已执行**（2026-09-24d）：**无反例**，状态数同上一行 | 前提：两个时刻与确认时刻同源、严格递增（`capability.organization-governance/v3#S-42` 末行，candidate），使用时的判定是一步原子读；两读的先后被这一建模方式吸收，**按构造，不作证据**——证据形式是场景 [S-44](v2/contract.md#s-44-隶属解除之后分享失效复制留着不复活) 的读序一支 |
| 上面三行的**有效性**（七处保护各自去掉） | 十三个 `Transfer_No*.cfg`，**预期找到反例** | **已执行**（2026-09-24d）：十三个都**按预期违反**，轨迹对得上 [formal 入口](v2/formal/README.md#tla-与-tlc)写的局面（[结果与反例](#结果与反例)）。[S-52](v2/contract.md#s-52-分享方删除资产或所有权易手分享随之结束) 的两个去保护配置都走删除那一支；**提升那一支没有配置核对它，按构造，不作证据**——它的证据只有场景 [S-53](v2/contract.md#s-53-分享方删除与提升分享随之结束) | **必须与上面三行成对报告**。它们**不登记为 formal task**——期望失败的检查与该清单的语义相反（这次都退出 12） |

### 规范场景

**十二条全部未开始**——它们要的是真实实现，而实现不存在。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-39 两类待确认件的三种收场](v2/contract.md#s-39-两类待确认件的三种收场) | 演练，**关掉后台清理**，能操纵时间源 | **未开始** | 三路同值必须**同一次**对比；**可与 `data.offer-expiry` 的 S-23～S-25 一次执行两边兑现**，两边各自记结果 |
| [S-40 首次、重复、撞标识无血缘、按层找](v2/contract.md#s-40-首次重复撞标识无血缘按层找) | 演练 | **未开始** | 落地走资产治理的组合入口（`capability.asset-governance/v2#S-46`）；本人型落租户级已不受阻（`data.asset-model` 第二轮修订，原 [G-14](v2/contract.md#十一已知缺口) 闭合）；**尝试键认回那一支是它唯一的证据**（模型不看版本数） |
| [S-41 覆盖不碰配值](v2/contract.md#s-41-覆盖不碰配值) | 演练 | **未开始** | **这是「覆盖不碰配值」唯一的证据**——模型里它是 `UNCHANGED`，被建模方式吸收 |
| [S-42 边界在每条路径上都挡住](v2/contract.md#s-42-边界在每条路径上都挡住) | 演练，**发起者一律用超级管理员** | **未开始** | 发起者不是超管就区分不了结构性禁止与权限判定 |
| [S-43 分享的建立、跟随与结束](v2/contract.md#s-43-分享的建立跟随与结束) | 演练，**跨契约**（本契约 ＋ 资产求值） | **未开始** | 「下一次求值就用到新版本」「撤销后下一次使用被拒」由求值兑现 |
| [S-44 隶属解除之后](v2/contract.md#s-44-隶属解除之后分享失效复制留着不复活) | 演练，**关掉 `affiliation.dissolved` 的派发再跑一遍**；解除与重建之间不做任何读 | **未开始** | 两次结果必须相同——那是「不靠事件」唯一的实现侧证据；**读序那一支（两读之间注入解除—重建，颠倒先后应当看到复活）是 [S-9](v2/contract.md#s-9-分享此刻是否生效) 两读先后唯一的证据**——模型把两读写成一步 |
| [S-45 资产被移除即过期](v2/contract.md#s-45-资产被移除即过期) | 演练 | **未开始** | 「移除后再持有」那一支在 [G-3](v2/contract.md#十一已知缺口) 闭合前可能失败；**可与 `data.offer-expiry` 的 S-26 一次执行两边兑现** |
| [S-46 plugin 随行与引用告知](v2/contract.md#s-46-plugin-随行与引用告知) | 演练 | **未开始** | 受阻：[G-5](v2/contract.md#十一已知缺口) |
| [S-47 不可用时明确失败](v2/contract.md#s-47-不可用时明确失败) | **故障注入** | **未开始** | 最容易被「读不到就当没有」抹掉的一条，必须真跑；两个时刻的读面（`capability.organization-governance/v3#S-22`、`#S-59`）要单独注入故障 |
| [S-50 组织内分享与成员关系](v2/contract.md#s-50-组织内分享与成员关系) | 演练，**跨契约**（本契约 ＋ 组织治理 ＋ 资产求值） | **未开始** | 不再受阻：租户格的 `shared` 持有已放开（原 [G-14](v2/contract.md#十一已知缺口) 闭合）；读两个时刻的调用主体按 [S-9](v2/contract.md#s-9-分享此刻是否生效) ② 由运行时代行 |
| [S-51 方向矩阵逐格](v2/contract.md#s-51-方向矩阵逐格) | 演练，普通成员与超管各一遍 | **未开始** | 矩阵在模型里只建了「不落别人的租户级」「组织级只经目标超管」两格，**其余各格只有这一条证据** |
| [S-53 分享方删除与提升](v2/contract.md#s-53-分享方删除与提升分享随之结束) | 演练，**跨契约**（本契约 ＋ 资产治理），含故障注入一支 | **未开始** | 结束**原因**、写下者、持有留着、提升不被挡——模型里都没有，**只有这一条证据**；原先受阻的 [G-15](v2/contract.md#十一已知缺口)（删除）与 [G-14](v2/contract.md#十一已知缺口)（租户格）都已闭合；**提升那一支在模型里按构造成立、没有配置核对，这一条是它唯一的证据**；分享结束不通知，被分享方经 [S-30](v2/contract.md#s-30-列出组织的分享) 读结束原因（[S-33](v2/contract.md#s-33-本版不发本契约自己的事件)），演练要核这一读 |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| basis 为 shared 的持有（组织格或租户格）**在使用那一刻**按 (资产, 被分享方) 与三个合取项判可用，读不到即失败 | [S-9](v2/contract.md#s-9-分享此刻是否生效) | `capability.asset-evaluation`（PRE-2 已对齐三个合取项、租户格与 [S-9](v2/contract.md#s-9-分享此刻是否生效) 的读序，D-060 §三 R2-12；前提依赖、不进 catalog，本条改了须回头核对它） | 那份契约的场景；本契约 S-43／S-44／S-50 跨契约演练 |
| 隶属建立时刻、成员关系生效时刻有读面，与确认时刻同源且严格递增 | [S-9](v2/contract.md#s-9-分享此刻是否生效)、[S-34](v2/contract.md#s-34-装配给的保证-vs-协议须给的保证) | `capability.organization-governance` v3（`#S-7`、`#S-8`、`#S-22`、`#S-59`、`#S-42` 末行；candidate） | 那份的验证入口（它的 S-61 场景）；本契约 S-44／S-50 跨契约演练 |
| 删除与提升那一次提交里一并写下 [S-52](v2/contract.md#s-52-分享方删除资产或所有权易手分享随之结束) 的结束 | [S-52](v2/contract.md#s-52-分享方删除资产或所有权易手分享随之结束)、[S-34](v2/contract.md#s-34-装配给的保证-vs-协议须给的保证) | `capability.asset-governance`（`#S-27`、`#S-28` ④⑧ 都已列进，原 [G-15](v2/contract.md#十一已知缺口) 闭合；反向义务，不进 catalog，本条改了须回头核对它们）＋ 同一提供者 | 本契约 S-53 |
| 求值取持有记录**当前发布的那一版**（追随当前版的持有） | [S-11](v2/contract.md#s-11-复制的收场)、[十二](v2/contract.md#十二消费者核对) | `data.asset-model`（S-18 第 6 条）＋ `capability.asset-evaluation`（C9） | 同上 |
| 落地的写集合能进本契约确认（本人型：发起）的同一次提交 | [S-18](v2/contract.md#s-18-确认是一次提交同一落点的确认序列化) | 同一提供者（主线裁定 D-060 §一 PA-3）经 `capability.asset-governance` 的组合入口 ＋ 装配；落地记录的 `byAgent` 取发起那次调用的上下文，由装配如实给 | 提供者设计须指出事务覆盖的全部存储对象 |
| 资产记录号不复用、持有可辨实例 | [S-7](v2/contract.md#s-7-两类待确认件共用的过期语义) | `data.asset-model`（S-4 已给前一半）、`capability.asset-governance` | 后一半仍在 [G-3](v2/contract.md#十一已知缺口) |

## 实际执行

**2026-09-24d（独立评审第一轮修订之后），修复 drafter 本机；输入快照与原始输出在主检出 `tmp/formal-runs/asset-transfer-v2-2026-09-24d/`，未落进 `record/evidence/`。**
与上一次（2026-09-24c）的差别只在 `Transfer.tla` 三行注释（组织治理的坐标 `v2#` → `v2#`，AT-3），配置未动；**本次十六个配置全部重跑**，状态数与十三条反例轨迹逐一与 2026-09-24c 相同。2026-09-24c 那次的输入文件已不是当前文件，**以本次为准**；上午那一次（`asset-transfer-v2-2026-09-24/`）对应的模型已改，**结论作废**，只留作历史。

- **工具**：TLC2 Version 2026.09.12.025210（rev 867aefb），`/opt/tlaplus/tla2tools.jar`；Eclipse Adoptium 21.0.12.1（`/usr/local/bin/java`），Linux 5.15 amd64，8 核
- **工作目录**：设计根 `.meta_harness/design`（与 `formal-tasks.json` 的 runner 相同）；`-Djava.io.tmpdir=tmp/java`，`-metadir tmp/tlc/asset-transfer-ev-d-<名>`
- **输入**：本分支工作树里的 `v2/formal/Transfer.tla` 与十六个配置（**未提交前的同内容文件**，SHA-256 见快照的 `input.sha256`；`Transfer.tla` 为 `699bedc5…4c50`）；提交之后以提交修订为准
- **命令**（每个配置一次，形制同 `formal-tasks.json`，脚本是快照里的 `run.sh`）：
  `java -cp tla2tools.jar tlc2.TLC -metadir tmp/tlc/<名> -cleanup -noGenerateSpecTE -workers <n> -config spec/capabilities/asset-transfer/v2/formal/<配置> spec/capabilities/asset-transfer/v2/formal/Transfer.tla`；
  正例按登记的 worker 数（`Transfer.cfg`、`Transfer_Share.cfg` 为 1，`Transfer_Revival.cfg` 为 4），去保护配置一律 1 个 worker（广度优先，给出最短反例）

| 配置 | worker | 退出码 | 结果 | 规模 |
|---|---|---|---|---|
| `Transfer.cfg` | 1 | **0** | `Model checking completed. No error has been found.` | 925,185 generated · **195,984 distinct** · 0 left · 深度 16 · 11 s |
| `Transfer_Share.cfg` | 1 | **0** | 同上 | 8,445,161 generated · **1,179,208 distinct** · 0 left · 深度 20 · 1 min 50 s |
| `Transfer_Revival.cfg` | 4 | **0** | 同上 | 8,445,161 generated · **1,179,208 distinct** · 0 left · 深度 20 · 3 min 30 s |
| `Transfer_NoSameCommit_Settle.cfg` | 1 | 12 | `Invariant NoLateOrDoubleSettle is violated.` | 轨迹 6 个状态 |
| `Transfer_NoSameCommit_Lineage.cfg` | 1 | 12 | `Invariant AtMostOneLineageTarget is violated.` | 轨迹 6 个状态 |
| `Transfer_NoSameCommit_Sharing.cfg` | 1 | 12 | `Invariant AtMostOneLiveSharingPerPair is violated.` | 轨迹 8 个状态 |
| `Transfer_NoConfirmRecheck.cfg` | 1 | 12 | `Invariant CopyLandsInsideBoundary is violated.` | 轨迹 5 个状态 |
| `Transfer_NoUseTimeCheck.cfg` | 1 | 12 | `Invariant UseInsideBoundary is violated.` | 轨迹 5 个状态 |
| `Transfer_NoUseTimeCheck_Member.cfg` | 1 | 12 | `Invariant UseOnlyWhileMembersEffective is violated.` | 轨迹 5 个状态 |
| `Transfer_NoSinceCheck.cfg` | 1 | 12 | `Temporal property NoRevival was violated.` | 轨迹 5 个状态，此后停住 |
| `Transfer_NoSinceCheck_Use.cfg` | 1 | 12 | `Invariant NoRevivedUse is violated.` | 轨迹 6 个状态 |
| `Transfer_NoLayerCheck.cfg` | 1 | 12 | `Invariant NoForeignTenantLanding is violated.` | 轨迹 3 个状态 |
| `Transfer_NoLayerCheck_Share.cfg` | 1 | 12 | `Invariant NoForeignTenantLanding is violated.` | 轨迹 3 个状态 |
| `Transfer_NoConfirmerCheck.cfg` | 1 | 12 | `Invariant OrgLevelLandingByTargetAdmin is violated.` | 轨迹 4 个状态 |
| `Transfer_NoSourceEnd.cfg` | 1 | 12 | `Invariant NoUseAfterSourceGone is violated.` | 轨迹 5 个状态 |
| `Transfer_NoSourceEnd_Record.cfg` | 1 | 12 | `Invariant SharingEndsWithSource is violated.` | 轨迹 4 个状态 |

**本次不跑 2026-09-24c 快照 `variant/` 里那个不登记的「只提升」变体**：它不在版本目录、没有登记，那次的结果只是起草时的观察；提升那一支改记为「按构造，不作证据；证据只有场景 S-53」（AT-4）。

检查器按 `formal-tasks.json` 执行三个登记任务的结果记在本页[变化的影响](#变化的影响)。

## 结果与反例

十三个去保护配置的反例轨迹，**逐一对到了 formal 入口写的局面**：

| 配置 | 轨迹（动作序列） | 对应的契约局面 |
|---|---|---|
| `NoSameCommit_Settle` | `Affiliate(t2,t1)` → `Issue(c1)` → `ConfirmBegin(c1)` → `Tick(c1)` → `ConfirmEnd(c1)` | 读到 `pending` 之后时间走过 `expiresAt`，第二步照写 `accepted`——[S-18](v2/contract.md#s-18-确认是一次提交同一落点的确认序列化) 要关的那个窗口 |
| `NoSameCommit_Lineage` | `Affiliate(t2,t1)` → `OwnBegin(k1)` → `OwnBegin(k2)` → `OwnEnd(k1)` → `OwnEnd(k2)` | 两次本人型发起都判成首次，同一 (源, 落进的那一层) 出现两份带血缘的记录——[S-10](v2/contract.md#s-10-复制血缘怎么判怎么记) |
| `NoSameCommit_Sharing` | `Affiliate(t2,t1)` → `Issue(s1)` → `ConfirmBegin(s1)` → `Issue(s2)` → `ConfirmBegin(s2)` → `ConfirmEnd(s1)` → `ConfirmEnd(s2)` | 同一对两份生效——[S-8](v2/contract.md#s-8-分享) |
| `NoConfirmRecheck` | `Affiliate(t2,t1)` → `Issue(c1)` → `Dissolve(t2)` → `ConfirmCopy(c1,B2)` | 发起时同树、确认时已不同树，团队资产在树外落地——[S-12](v2/contract.md#s-12-流转边界团队资产不出那棵树)、[S-17](v2/contract.md#s-17-每道准入现读确认时再判一遍) |
| `NoUseTimeCheck` | `Affiliate(t2,t1)` → `OwnShare(A2)` → `Dissolve(t2)` → `Use(o1)` | 解除之后事件反应没发生，使用照旧成立——[S-31](v2/contract.md#s-31-隶属解除分享在使用时失效不靠事件) 禁止的做法 |
| `NoUseTimeCheck_Member` | `Affiliate(t2,t1)` → `OwnShare(A2)` → `Leave(A1)` → `Use(o1)` | 分享方那一端的成员关系解除，使用照旧成立——[S-32](v2/contract.md#s-32-成员关系解除复制执行不了已确认的不动) |
| `NoSinceCheck` | `Affiliate(t1,t2)` → `OwnShare(A2)` → `Dissolve(t1)` → `Affiliate(t2,t1)`，此后停在「生效」 | 断开之后**反方向**重建隶属（t2 挂到 t1 下），那份分享重新生效——**不复活**要挡的正是这一条（[S-9](v2/contract.md#s-9-分享此刻是否生效)）；上午那次的轨迹是同方向重建，两者都是「新写下的一条隶属关系」 |
| `NoSinceCheck_Use` | `Affiliate(t2,t1)` → `OwnShare(A2)` → `Dissolve(t2)` → `Affiliate(t2,t1)` → `Use(o1)` | 同上（同方向重建），且被使用 |
| `NoLayerCheck` | `Affiliate(t2,t1)` → `OwnCopy(B2)` | 本人型复制落进另一个组织里别人的租户级——[S-49](v2/contract.md#s-49-方向与落点矩阵逐格) `targetLayerNotSelf` |
| `NoLayerCheck_Share` | `Affiliate(t2,t1)` → `OwnShare(B2)` | 同上，分享 |
| `NoConfirmerCheck` | `Affiliate(t2,t1)` → `Issue(c1)` → `ConfirmCopy(c1,A1)` | 源侧超管替目标组织点头，组织级落地没经目标超管——[S-22](v2/contract.md#s-22-确认复制) ② |
| `NoSourceEnd` | `Affiliate(t2,t1)` → `OwnShare(A2)` → `DeleteAsset(w)` → `Use(o1)` | 分享方删除了那份资产、分享没结束，被分享方照用——[S-52](v2/contract.md#s-52-分享方删除资产或所有权易手分享随之结束) 要挡的 |
| `NoSourceEnd_Record` | `Affiliate(t2,t1)` → `OwnShare(A2)` → `DeleteAsset(w)` | 同上，记录停在 `active` |

**不复活与删除的反例都走本人型分享 o1**（提升那一支没有配置核对，见上）：它是分享那一组里最短的局面；组织—组织的 s1、s2 与组织内的 s3 用的是同一个 `Stale` 与同一个 `EndOf`，正例配置对它们一并穷尽。

**「无反例」离「已验证」还差一大截**：模型只覆盖交错；写集合、失败值、结束原因、投影、跨契约的求值与落地面、矩阵的其余各格、两读的先后、尝试键全在规范场景里，**十二条一条都没跑**。

## 独立评审

**第一轮**：spec-reviewer（只读），2026-09-24，基线 HUB `765b01dc`（批 R3：本契约与 `data.asset-model`、`capability.asset-evaluation`、`capability.asset-governance`、`capability.organization-governance` v3 同批）。
处置按主线的修复简报（2026-09-24，裁定 K37、K38、K39——已收进 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)——与全局规矩 G1～G6）；**评审意见不代替接受**，本契约仍是 candidate。

| 发现 | 处置 | 落点 |
|---|---|---|
| AT-1（G-14／G-15 已闭合，多处仍写「待」「受阻」「如实记失败」） | **改**：全篇扫到闭合状态；按 G-14 的闭合条件逐条对过 catalog 里对 `data.asset-model` 的 clauses（`S-4`～`S-9`、`S-18`、`S-19`、`S-21`、`S-22`），与 S-4 表一致、不改 | 契约 S-4 两行与资产治理 `#S-28` 一行、第七节安全性质一行、S-50 末句、G-14 行、第十二节三行；本页 S-40、S-50、S-53 三行与「由别处承担」两行；examples 第 7、10 节 |
| AT-2（读 S-59 的调用主体两份说法不一、没有授权依据） | **改**（K37）：调用主体是运行时代行，单机装配给、可串行化读即满足，跨进程由获授权的服务身份兑现（协议给）；与组织治理 v2 第十二节同句；S-34 加一行，写明「服务身份未获授权」与「那个租户已不在默认档」必须可分辨 | [S-9](v2/contract.md#s-9-分享此刻是否生效) ②、[S-34](v2/contract.md#s-34-装配给的保证-vs-协议须给的保证)、S-4 `#S-59` 一行、第十二节组织治理一行 |
| AT-3（模型注释引组织治理 v1） | **改**：三行注释改指 v2；**模型文件变了，十六个配置全部重跑**（2026-09-24d），结果与轨迹同上一次 | [`Transfer.tla`](v2/formal/Transfer.tla)、[实际执行](#实际执行) |
| AT-4（「另一个不登记的变体核对了提升那一支」无处可查） | **改为明写**：提升那一支在版本目录里没有配置核对，**按构造，不作证据**；证据只有场景 S-53 | [formal 入口](v2/formal/README.md#本版选用什么) S-52 一行、本页形式工件第四行与 S-53 行 |
| X-2（资产求值 PRE-2 → S-9、资产治理 S-27／S-28 → S-52 不在 catalog） | **改为明写，不登记**（登记会成环）：第十二节逐条列出这两个读者，写明「本条改了须回头核对它们」 | [第十二节](v2/contract.md#十二消费者核对)资产求值、资产治理删除与提升两行 |
| 走查（本契约钉组织治理 v2、资产治理钉 v1） | 不在本契约：相容性写进组织治理 v2 第十三节（OG-2） | — |

**本轮另落的主线裁定**：复制落地的 `byAgent` 由 [S-11](v2/contract.md#s-11-复制的收场) 写集合给（K38；组织型要在复制通知上记下这一项，[S-5](v2/contract.md#s-5-复制通知) 加一个字段——**这一半是据 K38 推出的**，已报主线）；分享结束不通知（K39；[S-33](v2/contract.md#s-33-本版不发本契约自己的事件)，与资产治理 S-27／S-28 ⑨ 同句）。
**G1**：相邻依据 PF-002 rev 19 → 20，按 changelog 核过——rev 20 改的是连接件事件目录与订阅、治理类设置、拓展件不可用处置，不碰本契约引的那几节。**G2**：页首主线裁定改引 D-060（§一 PA-3、§二 S-U24-3b、§三 R2-1～R2-8、R2-12、§五 K37～K39）与 D-059，D-060 未收录的几条列成一段并注明已报主线；正文里的账本编号与施工标签删去。

**第二轮**：spec-reviewer（只读），2026-09-25，基线 HUB `8ad37c50`（批 R3，发现表 `tmp/assets-runtimes/reviews/r2-R3.md`）；修复波 2 处置，主线裁定见 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)（M1～M29）。

| 编号 | 发现 | 处置 | 落点 |
|---|---|---|---|
| 应修 4 | S-9 ②、S-34 两行、第七节「不复活」都以组织治理 v2 `#S-42` 为依据（时刻可比且严格递增、调用方身份已核实——K37 代行的依据），S-4 表与 catalog 都没登 | **改**：S-4「组织治理 v2 侧」表加 `#S-42` 一行，写明用在哪、那一行改了要核哪两处；catalog 本契约 → OG v2 的 clauses 补 `S-42` | [S-4](v2/contract.md#s-4-依赖方向与被消费的面)；`registry/catalog.json` |
| 应修 5 | 组织型发起时调用上下文缺 `byAgent` 没有收场；S-11 把失败放在「落地」，对组织型就是确认那一步 | **改**（M27）：S-20 ⑧ 加「组织型：缺 `byAgent` ⇒ `unavailable`、不写通知」；S-11 末段限本人型、组织型改指 S-20 ⑧；S-5 那一行同句 | [S-20](v2/contract.md#s-20-发起复制) ⑧、[S-11](v2/contract.md#s-11-复制的收场) 末段、[S-5](v2/contract.md#s-5-复制通知) |
| 应修 6（本契约那一半） | 页首「下列几条 D-060 尚未收录」所列各项已在 [D-060 §六 N-7](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) | **改**：改链 N-7，注明各项在 N-7 的哪一段 | 页首主线裁定 |
| （AG-3、AT-2、AT-3 核对） | 评审核为兑现（`#S-42` 未登记另记为应修 4） | 不改 | — |

**对证据的影响**：`Transfer.tla` 不含 `byAgent`、不含调用上下文，M27 不进模型；`#S-42` 的登记不改任何判定。**本轮不重跑 TLC**，十六个配置的上一次结果仍适用于未改的那几条性质。

### 实现映射反推（2026-09-25，节点独立评审 N2）

| 编号 | 发现 | 处置 | 落点 |
|---|---|---|---|
| OG-2（N2） | S-34「读两个时刻的调用主体」行把单机路径写成「运行时代行读 `#S-59`／`#S-22`」，节点实现是事务内直读（D-060 §八 N-19 已接受）；两者语义重合、文字不同 | 装配给列加半句「同一存储内一次可串行化读（含事务内直读）即满足，不要求经服务面代行」（[D-060 §八 M59](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | [S-34](v2/contract.md#s-34-装配给的保证-vs-协议须给的保证) |
| AG-2（N2） | 「不复活」的前提「同一时间源且在串行提交之间严格递增」本版由 `infra/clock` 兑现，该节点尚未修订（C-15，[D-060 §八 M58](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | 契约不改；提供者侧登缺口，闭合前 asset-governance 节点把 S-9／S-31／S-32 标「有前提」 | [asset-governance](../../../realization/packages/assets/asset-governance/README.md) |

## 变化的影响

- **2026-09-23 起草**：首版，没有旧证据可作废。
- **同日 `make design-check FORMAL=run`**：检查器执行 `asset-transfer-v2-transfer`，退出 0（检查器只记退出码）。
- **2026-09-24 整批对齐（简报 S23；主线裁定 2026-09-23，待产品负责人确认）：原地改了候选，模型与配置未动。**
  - 失败值改名：确认路径 `expired` → **`offerNoLongerValid`**，撤回路径 `alreadyConfirmed`／`expired` → **`alreadyConcluded`**，与 `capability.organization-governance` v2 同名（账本 T-1）；[S-7](v2/contract.md#s-7-两类待确认件共用的过期语义)、[S-19](v2/contract.md#s-19-这一节每个操作写全九件事)、S-21～S-26、第七节、S-39、S-45、S-47 与实例第 7 节随之改。**派生状态 `expired`（`OfferState`）不变。**
  - 新操作 [S-48 `listPendingForOrganization`](v2/contract.md#s-48-列出组织收到的待确认件)（T-2，G-1 闭合）；G-6、G-10 闭合，G-3、G-4、G-9 改写；依赖 `data.asset-model`、`capability.asset-governance` 按条款号登记；[S-18](v2/contract.md#s-18-确认是一次提交同一落点的确认序列化) 写明同一提供者同一提交（PA-3）；[S-34](v2/contract.md#s-34-装配给的保证-vs-协议须给的保证) 加隶属哨兵一行（PA-4）；[S-8](v2/contract.md#s-8-分享) 写明已分享出去的记录不能被提升、[S-9](v2/contract.md#s-9-分享此刻是否生效) 写明租户格的 `organization` 持有随分享判（S11-G2）；[S-4](v2/contract.md#s-4-依赖方向与被消费的面) 更正「求值读本契约」为组输入的一方读。
  - **对证据的影响**：TLC 那一次运行对应的模型与配置未改，结论不受影响（它只看效果，不看失败值名）。
- **2026-09-24 按 PF-003 rev 5 原地修订（简报 spec-revision-2026-09-24 第一节；产品负责人同日裁定 U-24-3、U-3 乙）：候选语义、模型与配置全部改动。**
  - **改了的条款**：头部依据（PF-003 rev 5、PF-002 rev 19、PF-001 rev 19）与裁定两行；[S-1](v2/contract.md#s-1-本契约拥有什么)、[S-2](v2/contract.md#s-2-本契约不拥有什么)、S-3、[S-4](v2/contract.md#s-4-依赖方向与被消费的面)（加 `data.identity-values#S-11`，注明组织治理 v2 缺两个时刻）、S-5（组织型才有复制通知，落点恒是目标组织级）、S-6（被分享方是一层，本人型没有邀请）、S-7（组织内分享的邀请同类默认值）、[S-8](v2/contract.md#s-8-分享)（四种分享；「生效」而非 `active` 的同对唯一）、[S-9](v2/contract.md#s-9-分享此刻是否生效)（**三个合取项**；租户格；G-11 之前的收场）、[S-10](v2/contract.md#s-10-复制血缘怎么判怎么记)（**按 (源, 落进的那一层) 找**；`importedBy` 是落地那一侧；提升之后）、[S-11](v2/contract.md#s-11-复制的收场)（所有者是那一层的所有者、作者是落地的行为人）、[S-12](v2/contract.md#s-12-流转边界团队资产不出那棵树)（两式；组织内不求）、[S-13](v2/contract.md#s-13-发起者一侧的资产)（所有者决定是哪一种）、S-14～S-18、[S-19](v2/contract.md#s-19-这一节每个操作写全九件事)（失败值总表、谁能做）、S-20～S-30、S-48（全部两支化或补租户那一类）、[S-31](v2/contract.md#s-31-隶属解除分享在使用时失效不靠事件)、[S-32](v2/contract.md#s-32-成员关系解除复制执行不了已确认的不动)（**不复活**；租户一端退出即结束）、S-33、第七节、[S-34](v2/contract.md#s-34-装配给的保证-vs-协议须给的保证)（三个时刻可比一行）、S-35、S-37、[S-38](v2/contract.md#s-38-本版选用哪些形式工件)、S-39～S-47、十一、十二、十三。
  - **新增条款**：[S-49 方向与落点：矩阵逐格](v2/contract.md#s-49-方向与落点矩阵逐格)、[S-50](v2/contract.md#s-50-组织内分享与成员关系)、[S-51](v2/contract.md#s-51-方向矩阵逐格)。
  - **失败值**：新增 `targetLayerNotSelf`、`layerNotAllowed`、`recipientNotMember`；**取消 `organizationAssetNotCopyable`**（它挡的那一格随 rev 5 不存在了）；简报举例的 `cross_tree`、`org_copy_requires_admin` 就是已有的 `outsideTree`、`notPermitted`，不另起。
  - **缺口**：G-2、G-4、G-7 闭合（编号保留）；新增 G-11（两个时刻的读面，**阻断**团队组织之间与有租户一端的分享的使用）、G-12（本人型重放）、G-13（组织型目标侧投影要不要带源组织）、G-14（`data.asset-model` 两处形状）。
  - **场景标题改动**：S-40、S-43、S-44 的标题改了措辞，锚点随之变；本包外没有引用这三个锚点（已核）。
  - **模型重写**：`Transfer.tla` 按 rev 5 重建——两条复制通则、组织内分享、本人型分享、[S-9](v2/contract.md#s-9-分享此刻是否生效) 的三个合取项（`PathLinks`、`affSince`、`effSince`）、落点与确认者判定；六个保护开关（新增 `SinceCheck`、`LayerCheck`、`ConfirmerCheck`）；按 `Scene` 分复制与分享两组。配置由七个变成十四个：旧的 `Transfer_NoSameCommit_*`、`Transfer_NoConfirmRecheck`、`Transfer_NoUseTimeCheck` 按新模型重写，新增 `Transfer_Share`、`Transfer_NoUseTimeCheck_Member`、`Transfer_NoSinceCheck`、`Transfer_NoSinceCheck_Use`、`Transfer_NoLayerCheck`、`Transfer_NoLayerCheck_Share`、`Transfer_NoConfirmerCheck`；**`Transfer_Revival.cfg` 由反例改为正例**并登记为 formal task。不变量 `AtMostOneActiveSharingPerPair` 改为 `AtMostOneLiveSharingPerPair`（按「生效」计）。
  - **对证据的影响**：**2026-09-23 那一次运行（345,600 个不同状态）与同日检查器的那次执行全部作废**——模型与配置都换了；那一次按新模型的整组重跑在 `tmp/formal-runs/asset-transfer-v2-2026-09-24/`，**又被下面第二轮的重跑取代**。formal task `asset-transfer-v2-transfer` 的配置内容变了（同名，现在只查复制那一组），新增 `asset-transfer-v2-share`、`asset-transfer-v2-revival`。
    同日在工作树根跑 `make design-check FORMAL=run`：检查器按 `formal-tasks.json` 执行三个任务，**各退出 0**，整棵设计树 `PASS`（检查器只记退出码；输出存于同一快照的 `design-check.log`）。
- **2026-09-24 第二轮修订（简报 spec-revision-2-2026-09-24 A 节；主线裁定 R2-2～R2-8，R2-6、R2-7 待产品负责人过目）：候选语义、模型与配置都改了。**
  - **依赖改钉**：`capability.organization-governance` 由 v2 改为 **v2**（candidate，v1 的加法版）；本契约里指向它的坐标一律改为 `v2#S-n`（用到的 v2 条款在 v2 里逐字相同），新消费 `#S-7`、`#S-8`、`#S-22`、`#S-59`；`capability.asset-governance` 新消费 `#S-28`、`#S-64`，`#S-27` 的用法改写。
  - **改了的条款**：头部（状态、依赖、裁定一行、无词条概念那段：本人型／组织型／组织内分享指向 UL-asset-copy 注意 ⑤、UL-asset-sharing 注意 ⑤，两个时刻的英文名 `parentEstablishedAt`、`membershipEffectiveSince`）；S-1、S-2、[S-4](v2/contract.md#s-4-依赖方向与被消费的面)（组织治理 v2 表、删除与提升的交汇、身份值 `#S-13` 的 CS-3 读法、资产治理三行）；S-5、S-6（词条链接）；[S-8](v2/contract.md#s-8-分享)（`revoked` 的三个结束原因、**提升不被分享挡住**）；[S-9](v2/contract.md#s-9-分享此刻是否生效)（`revoked` 一行、两个时刻读 v2 的哪一面、**两读的先后**、个人—个人那一种；删去 G-11 之前的收场）；S-10（R2-3、R2-6）；S-16（尝试键缺席一行）；[S-18](v2/contract.md#s-18-确认是一次提交同一落点的确认序列化)（尝试键登记同提交、S-52 同提交）；S-19（R2-8 三个值入账本）；[S-20](v2/contract.md#s-20-发起复制)（①④⑥⑦⑧：尝试键 `attemptKey`、保留期 `copy_attempt_key_retention`，两支都认回）；[S-23](v2/contract.md#s-23-读复制通知)（目标侧投影带源组织）；S-28 ④（原因 `sharerRevoked`）；[S-30](v2/contract.md#s-30-列出组织的分享) ⑤（结束原因、已删除的资产）；[S-31](v2/contract.md#s-31-隶属解除分享在使用时失效不靠事件) 末段；[S-34](v2/contract.md#s-34-装配给的保证-vs-协议须给的保证)（时刻一行改依据，新增两读先后、删除与提升同提交、尝试键登记三行）；S-37（尝试键登记在存储里）；第七节（不复活的前提、目标侧不拿源资产本身，新增两条安全性质）；[S-38](v2/contract.md#s-38-本版选用哪些形式工件)；S-40（组织型投影、尝试键一支）；S-44（读序一支，删去 G-11 受阻）；S-50；十一、十二、十三。
  - **新增条款**：[S-52 分享方删除资产、或所有权易手：分享随之结束](v2/contract.md#s-52-分享方删除资产或所有权易手分享随之结束)、[S-53 场景](v2/contract.md#s-53-分享方删除与提升分享随之结束)。实例新增第 10 节，第 2、4、5、7、9 节随之改。
  - **缺口**：G-9（R2-4）、G-11（R2-1、R2-2）、G-12（R2-5）、G-13（R2-6）闭合，编号保留；G-14 改为「已交 `data.asset-model` 修订（R2-10）」；**新增 G-15**（资产治理的删除还没把 S-52 的写入列进它那次提交）。
  - **模型**：`live` 换成 `src`（`held`／`removed`／`promoted`／`deleted`）；新增第七个保护开关 `SourceEndCheck`、动作 `DeleteAsset(a)` 与 `Promote`（只在分享那一组）、`Use` 在资产已删除或易手时记 `"gone"`、不变量 `SharingEndsWithSource` 与 `NoUseAfterSourceGone`。十四个旧配置都加了 `SourceEndCheck = TRUE`，`Transfer_Share.cfg` 加查两条新不变量；新增去保护配置 `Transfer_NoSourceEnd.cfg`、`Transfer_NoSourceEnd_Record.cfg`（十六个）。
  - **对证据的影响**：**上午那次整组运行（`asset-transfer-v2-2026-09-24/`，691,760 个不同状态）与同日检查器的执行全部作废**——模型与全部配置都改了；本页[实际执行](#实际执行)是按改过的模型整组重跑（`asset-transfer-v2-2026-09-24c/`）。三个 formal task 的 id 与命令不变、配置内容变了；`formal-tasks.json` 没有证据字段，任务与新证据的对应就记在本页。**不复活由组织治理 v2 兑现前提**，那份 v2 也未接受——本契约的接受要在它之后或与它同批。
- **2026-09-24 独立评审第一轮修订（[处置表](#独立评审)；候选未冻结，原地改）：语义改了三处，模型只改注释。**
  - **改了的条款**：页首（状态、相邻依据 PF-002 rev 20、组织治理 v2 那一条依赖的相容性说法、主线裁定改引 D-060／D-059）；[S-4](v2/contract.md#s-4-依赖方向与被消费的面)（组织治理 v2 表头一段、`#S-59` 一行、资产模型两行、资产治理 `#S-27`／`#S-28` 两行）；[S-5](v2/contract.md#s-5-复制通知)（**新字段**：发起是不是 agent 产出）；[S-9](v2/contract.md#s-9-分享此刻是否生效) ②（调用主体）；[S-11](v2/contract.md#s-11-复制的收场)（写集合加 `byAgent`）；[S-33](v2/contract.md#s-33-本版不发本契约自己的事件)（分享结束不通知）；[S-34](v2/contract.md#s-34-装配给的保证-vs-协议须给的保证)（新行：读两个时刻的调用主体）；[S-38](v2/contract.md#s-38-本版选用哪些形式工件)（组织治理 Alloy 那一句收窄）；第七节安全性质一行、S-50 末句、G-14 行、第十二节四行；正文账本编号与施工标签。
  - **表示改变**：复制通知多一个字段（组织型）；本契约没有 Schema，读面投影不带它。**失败值集合不变**，操作不变，条款号只改内容、不增删。
  - **对证据的影响**：`Transfer.tla` 三行注释改了、语义未改；**十六个配置全部重跑**（`tmp/formal-runs/asset-transfer-v2-2026-09-24d/`），状态数与反例轨迹同 2026-09-24c，[实际执行](#实际执行)已换成本次；2026-09-24c 的输入已不是当前文件。**新增义务**：S-40 演练要核组织型落地的 `byAgent` 取自发起那一次；S-53 演练要核被分享方经 S-30 读到结束原因（不通知）；S-47 的故障注入要把「服务身份未获授权」与「那个租户已不在默认档」分开（跨进程之后才适用，本版单机记下即可）。
  - **对消费者**：资产治理 S-46 照收 `byAgent`、S-27／S-28 ⑨ 写同一句「不通知」（同批已改）；组织治理 v2 第十二节写同一句「代行」（同批已改）。
- 此后模型或任一配置改动，**上表全部重跑**：三个正例与十三个去保护配置必须成对重跑，否则「无反例」失去有效性支撑。
- **2026-09-25 第二轮独立评审的处置（修复波 2；候选未冻结，原地改）**：逐条见[独立评审](#独立评审)第二轮。
  **语义改变一处**（M27）：组织型复制在发起时缺 `byAgent` 从「照发通知、确认时 `unavailable`」变为「发起即 `unavailable`、不写通知」——失败值集合不变，失败提前到发起。**表示不变**。
  **registry**：catalog 本契约 → `capability.organization-governance` v3 的 clauses 补 `S-42`（原先漏登，第一轮也漏报）。**依据改链**：页首改链 D-060 §六 N-7。
  **对消费者**：没有已采用的消费者，无迁移；组织治理 v2 的 `#S-42` 那两行从此在它的消费者传播里点得到本契约。
