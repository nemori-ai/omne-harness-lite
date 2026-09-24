# 形式化工件与论证映射

本页拥有**条款 → 性质 → 模型 → 检查配置**这一层对应关系，以及工件**盖不到什么**。
它不是模型，也不是证明，**不填通过状态**——实际执行的工具、配置、范围与结果在[验证入口](../../verification.md)。

本版只选一个工件：TLA+ 行为模型 [`Transfer.tla`](Transfer.tla)，理由在[契约 S-38](../contract.md#s-38-本版选用哪些形式工件)。
**不建 Alloy、不建 Schema**：边界判据的结构性质已有 `capability.organization-governance` v1 的 Alloy 覆盖，
数据形状归 `data.asset-model` 与 `data.offer-expiry`。

## 本版选用什么

| 契约条款 | 性质 | 模型里的定义 | 去掉哪一处保护会被反驳 | 未覆盖范围与相应义务 |
|---|---|---|---|---|
| [S-7](../contract.md#s-7-两类待确认件共用的过期语义) · [S-18](../contract.md#s-18-确认是一次提交同一落点的确认序列化) | 过期、已撤回、已确认的待确认件被确认后**不产生效果**；终结记录**不改写** | 不变量 `NoLateOrDoubleSettle`；动作性质 `SettledStable` | `SameCommit = FALSE`（[`Transfer_NoSameCommit_Settle.cfg`](Transfer_NoSameCommit_Settle.cfg)） | 失败**值**是什么（`offerNoLongerValid` 三路同值）不在模型里——模型只看效果。证据形式是[规范场景 S-39](../contract.md#s-39-两类待确认件的三种收场) |
| [S-10](../contract.md#s-10-复制血缘怎么判怎么记) · [S-18](../contract.md#s-18-确认是一次提交同一落点的确认序列化) | 同一 (源记录, 目标组织) **至多一份**带对应血缘的目标记录 | `AtMostOneLineageTarget`（`lineage <= 1`） | `SameCommit = FALSE`（[`Transfer_NoSameCommit_Lineage.cfg`](Transfer_NoSameCommit_Lineage.cfg)） | 首次／重复的**写集合**（所有者、作者、版本号、血缘四项）不在模型里——`lineage` 只是份数。证据形式是[规范场景 S-40](../contract.md#s-40-首次重复撞标识无血缘) |
| [S-8](../contract.md#s-8-分享) · [S-18](../contract.md#s-18-确认是一次提交同一落点的确认序列化) | 同一 (资产, 被分享方) **至多一份** `active` 的分享 | `AtMostOneActiveSharingPerPair` | `SameCommit = FALSE`（[`Transfer_NoSameCommit_Sharing.cfg`](Transfer_NoSameCommit_Sharing.cfg)） | 「认回那一份」返回的是**哪个** `SharingId`，是场景的事（[S-43](../contract.md#s-43-分享的建立跟随与三种结束)） |
| [S-12](../contract.md#s-12-流转边界团队资产不出那棵树) · [S-17](../contract.md#s-17-每道准入现读确认时再判一遍) · [S-32](../contract.md#s-32-成员关系解除复制执行不了已确认的不动) | 复制**只在**发起者两侧成员资格有效、且源与目标同树时落地 | `CopyLandsInsideBoundary`（落地那一刻 `CopyOK` 不成立就记一次 `"copy"`） | `ConfirmRecheck = FALSE`（[`Transfer_NoConfirmRecheck.cfg`](Transfer_NoConfirmRecheck.cfg)） | 所有者被提升到组织（`organizationAssetNotCopyable` 那一支）**没建模**——它与隶属解除是同一种「发起之后条件变了」，由场景 [S-42](../contract.md#s-42-边界在每条路径上都挡住) 承担 |
| [S-9](../contract.md#s-9-分享此刻是否生效) · [S-12](../contract.md#s-12-流转边界团队资产不出那棵树) · [S-31](../contract.md#s-31-隶属解除分享在使用时失效不靠事件) | 分享**只在此刻同树时**被使用；失效**不靠事件** | `UseInsideBoundary`（`Use` 发生时不同树就记一次 `"use"`） | `UseTimeCheck = FALSE`：使用只看一个由**可能丢失**的事件反应写下的标记（[`Transfer_NoUseTimeCheck.cfg`](Transfer_NoUseTimeCheck.cfg)） | 求值那一侧是否真的按 [S-9](../contract.md#s-9-分享此刻是否生效) 判——**模型假设它判**，这条前提归 `capability.asset-evaluation` |
| [S-9](../contract.md#s-9-分享此刻是否生效) | 撤销与移除是**终态**记录 | 动作性质 `EndedStable` | 无对应的有效性核对：守卫就是「记录为 `active` 才写」，去掉它是改模型，不是去掉一处契约保护 | **这一条因此只说明模型没写错，不单独作为证据**；证据形式是场景 [S-43](../contract.md#s-43-分享的建立跟随与三种结束) 的「不改写已有结束记录」一支 |
| [S-7](../contract.md#s-7-两类待确认件共用的过期语义) | 效果只来自一次确认 | `EffectsOnlyFromConfirmation` | 同上，按构造成立 | **不作为证据**：在模型里效果与终结记录写在同一个动作里，它被建模方式吸收了 |
| [S-31](../contract.md#s-31-隶属解除分享在使用时失效不靠事件) · [G-4](../contract.md#十一已知缺口) | **本契约不承诺**：因解除而失效的分享此后永不再生效 | 时序性质 `NoRevival` | —— [`Transfer_Revival.cfg`](Transfer_Revival.cfg) 三处保护全在位，**预期给出反例** | 这是缺口的可执行陈述，**不是**一条被检查通过的性质 |

**`TypeOK` 只约束模型自己变量的值域**，不绑任何条款。

## TLA+ 与 TLC

- **模型文件**：[`Transfer.tla`](Transfer.tla)。固定场景：三个团队组织；复制发起者在 t1、t2 各有一个租户身份；
  两份复制通知 c1、c2 都把 t1 里他租户级的 a1 复制到 t2（**同源同目标，才测得出首次被判两次**）；
  两份分享邀请 s1、s2 都把 t1 的 a2 分享给 t2（**同一对，才测得出至多一份 `active`**）。
- **语义映射**：

  | 模型里的 | 契约里的 |
  |---|---|
  | `Affiliate` / `Dissolve` | `capability.organization-governance/v1#S-32` / `#S-33`（环境动作） |
  | `Leave` / `Rejoin` | 发起者的成员资格失效与恢复（同一租户身份，`data.identity-values/v1#S-26`） |
  | `Tick(o)` | 时间走过 `expiresAt`；`RemoveAsset(a)`：指向的资产被移除或删除，**不回来**——这正是[缺口 G-3](../contract.md#十一已知缺口) 要求实现兑现的前提，模型把它当作已兑现 |
  | `Expired(o)` | `data.offer-expiry/v1#S-8` |
  | `SelfAndAncestors`、`ShareAncestor` | `data.identity-values/v1#S-14`、`#S-15`（三个组织两跳即到头） |
  | `Confirm(o)` 是**一个不可分割的动作** | [S-18](../contract.md#s-18-确认是一次提交同一落点的确认序列化) 的同提交与同落点序列化 |
  | `ConfirmBegin` / `ConfirmEnd` | **没有** S-18 时必然存在的「读—写」窗口 |
  | `ConfirmRecheck => Ok(o)` | [S-17](../contract.md#s-17-每道准入现读确认时再判一遍) 的再判 |
  | `Use(s)` 的守卫 | [S-9](../contract.md#s-9-分享此刻是否生效) 的使用时判定；`Materialize` 是 S-31 **禁止**的那种「靠事件记下已解除」 |

- **公平性与进展**：不带公平性假设，**不检查进展**。契约的进展性质都是有界的「不迟于 `expiresAt`」「下一次使用」，
  证据形式是规范场景（[S-39](../contract.md#s-39-两类待确认件的三种收场)、[S-43](../contract.md#s-43-分享的建立跟随与三种结束)、[S-44](../contract.md#s-44-隶属解除之后分享失效复制留着)）。
- **检查输入**：

  | 配置 | 常量 | 检查什么 | 预期 | 登记为 formal task |
  |---|---|---|---|---|
  | [`Transfer.cfg`](Transfer.cfg) | 三者全 `TRUE` | `TypeOK`、`NoLateOrDoubleSettle`、`CopyLandsInsideBoundary`、`UseInsideBoundary`、`AtMostOneLineageTarget`、`AtMostOneActiveSharingPerPair`、`EffectsOnlyFromConfirmation`；`SettledStable`、`EndedStable` | **本范围内无反例** | **是**：`asset-transfer-v1-transfer` |
  | [`Transfer_NoSameCommit_Settle.cfg`](Transfer_NoSameCommit_Settle.cfg) | `SameCommit = FALSE` | `NoLateOrDoubleSettle`、`SettledStable` | **找到反例** | 否（期望失败） |
  | [`Transfer_NoSameCommit_Lineage.cfg`](Transfer_NoSameCommit_Lineage.cfg) | `SameCommit = FALSE` | `AtMostOneLineageTarget` | **找到反例** | 否 |
  | [`Transfer_NoSameCommit_Sharing.cfg`](Transfer_NoSameCommit_Sharing.cfg) | `SameCommit = FALSE` | `AtMostOneActiveSharingPerPair` | **找到反例** | 否 |
  | [`Transfer_NoConfirmRecheck.cfg`](Transfer_NoConfirmRecheck.cfg) | `ConfirmRecheck = FALSE` | `CopyLandsInsideBoundary` | **找到反例** | 否 |
  | [`Transfer_NoUseTimeCheck.cfg`](Transfer_NoUseTimeCheck.cfg) | `UseTimeCheck = FALSE` | `UseInsideBoundary` | **找到反例** | 否 |
  | [`Transfer_Revival.cfg`](Transfer_Revival.cfg) | 三者全 `TRUE` | `NoRevival` | **找到反例**（缺口 G-4） | 否 |

  全部关掉死锁检查：本模型不承诺进展。

- **有效性核对**（**主配置与五个去保护配置一起才成立**）：
  - 初始状态存在；关键路径可达——隶属可建可断、成员可退可回、时间可走、资产可移除，所以守卫**不是**靠「没人动得了」成立的。
  - **五个去保护配置都必须给出反例**，且反例轨迹要对得上配置注释里写的那个局面；给不出，说明对应条款在本模型里是平凡的，**不能记作已验证**。
- **规模**：三个组织、两份同源同目标的通知、两份同对的邀请——每条反例需要的最小局面都在内。
  **更大的规模是另一次检查**，结果按它自己的范围陈述。

TLA+ 描述行为规格，TLC 对给定模型进行检查；**在已检查范围内未发现反例，不自动成为任意范围的证明**。

## 版本与证据边界

模型与配置随本版本冻结（接受之后）；执行命令、原始输出与反例轨迹在版本外，入口是[验证入口](../../verification.md)。
