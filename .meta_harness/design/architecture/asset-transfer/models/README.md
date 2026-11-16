# Transfer 有限模型

[设计](../design.md)给出复制、分享、当前关系与持续关系、来源结束的规则，[验证义务](../verification/README.md)列出做出来时要验的场景。本模型检查其中同提交、确认时重判、使用时现读与来源结束这几条。

模型固定成员与组织树、两个落到同一落点的动作、离开与重新加入、隶属解除与重建、来源的移除、删除与提升，以及有限的时钟。确认、血缘、分享与来源结束在一个模型动作里表示同提交，负控把相应步骤拆开。来源离开之后不恢复：设计的未决「原所有者持有的实例身份」没有被模型证明。

关系读取、当前成员资格以及确认以来不断开，都是使用判定的前提。时钟只有一个来源，在隶属建立与重新加入之间严格递增，不代表真实数据库时间怎样实现。模型的有限参数不能证明 IO 失败、完整权限矩阵、两次读的实际顺序、跨进程提交或恢复。

所有配置都关掉死锁检查，因为设计没有承诺进展，也没有公平性假设。`NoRevival` 是断开后不得再生效的安全时序性质，不是活性。`SettledStable` 与 `EndedStable` 是状态稳定性质。不能用日志事件的反应代替使用时的现读。

## 配置与预期

16 个配置：3 个正控，13 个定点负控。负控必须实际报告指定性质的反例，非零退出本身不能算通过。

  | 配置 | 常量 | 检查什么 | 预期  |
  |---|---|---|--- |
  | [`Transfer.cfg`](Transfer.cfg) | 七个开关全 `TRUE`，`Scene = "copy"`，`MaxClock = 3` | `TypeOK`、`NoLateOrDoubleSettle`、`CopyLandsInsideBoundary`、`NoForeignTenantLanding`、`OrgLevelLandingByTargetAdmin`、`AtMostOneLineageTarget`、`EffectsOnlyFromConfirmation`；`SettledStable` | **本范围内无反例**  |
  | [`Transfer_Share.cfg`](Transfer_Share.cfg) | 全 `TRUE`，`Scene = "share"`，`MaxClock = 2` | `TypeOK`、`NoLateOrDoubleSettle`、`UseInsideBoundary`、`UseOnlyWhileMembersEffective`、`NoRevivedUse`、`NoForeignTenantLanding`、`AtMostOneLiveSharingPerPair`、`EffectsOnlyFromConfirmation`、`SharingEndsWithSource`、`NoUseAfterSourceGone`；`SettledStable`、`EndedStable` | **本范围内无反例**  |
  | [`Transfer_Revival.cfg`](Transfer_Revival.cfg) | 同上 | `NoRevival` | **本范围内无反例**  |
  | [`Transfer_NoSameCommit_Settle.cfg`](Transfer_NoSameCommit_Settle.cfg) | `SameCommit = FALSE`，copy | `NoLateOrDoubleSettle`、`SettledStable` | **找到反例**：拆步确认的读与写之间过期  |
  | [`Transfer_NoSameCommit_Lineage.cfg`](Transfer_NoSameCommit_Lineage.cfg) | `SameCommit = FALSE`，copy | `AtMostOneLineageTarget` | **找到反例**：两次本人型发起都读到「还没有」  |
  | [`Transfer_NoSameCommit_Sharing.cfg`](Transfer_NoSameCommit_Sharing.cfg) | `SameCommit = FALSE`，share | `AtMostOneLiveSharingPerPair` | **找到反例**：s1、s2 的两次拆步确认各建一份  |
  | [`Transfer_NoConfirmRecheck.cfg`](Transfer_NoConfirmRecheck.cfg) | `ConfirmRecheck = FALSE`，copy | `CopyLandsInsideBoundary` | **找到反例**：发起后解除隶属再确认  |
  | [`Transfer_NoUseTimeCheck.cfg`](Transfer_NoUseTimeCheck.cfg) | `UseTimeCheck = FALSE`，share | `UseInsideBoundary` | **找到反例**：解除隶属、事件反应没发生、照用  |
  | [`Transfer_NoUseTimeCheck_Member.cfg`](Transfer_NoUseTimeCheck_Member.cfg) | `UseTimeCheck = FALSE`，share | `UseOnlyWhileMembersEffective` | **找到反例**：分享方退出、照用  |
  | [`Transfer_NoSinceCheck.cfg`](Transfer_NoSinceCheck.cfg) | `SinceCheck = FALSE`，share | `NoRevival` | **找到反例**：解除隶属再重建，分享重新生效  |
  | [`Transfer_NoSinceCheck_Use.cfg`](Transfer_NoSinceCheck_Use.cfg) | `SinceCheck = FALSE`，share | `NoRevivedUse` | **找到反例**：同上，并被使用  |
  | [`Transfer_NoLayerCheck.cfg`](Transfer_NoLayerCheck.cfg) | `LayerCheck = FALSE`，copy | `NoForeignTenantLanding` | **找到反例**：本人型复制落进 B2  |
  | [`Transfer_NoLayerCheck_Share.cfg`](Transfer_NoLayerCheck_Share.cfg) | `LayerCheck = FALSE`，share | `NoForeignTenantLanding` | **找到反例**：本人型分享给 B2  |
  | [`Transfer_NoConfirmerCheck.cfg`](Transfer_NoConfirmerCheck.cfg) | `ConfirmerCheck = FALSE`，copy | `OrgLevelLandingByTargetAdmin` | **找到反例**：源侧超管替目标组织确认  |
  | [`Transfer_NoSourceEnd.cfg`](Transfer_NoSourceEnd.cfg) | `SourceEndCheck = FALSE`，share | `NoUseAfterSourceGone` | **找到反例**：本人型分享成立、分享方删除（或提升）那份资产、分享照用  |
  | [`Transfer_NoSourceEnd_Record.cfg`](Transfer_NoSourceEnd_Record.cfg) | `SourceEndCheck = FALSE`，share | `SharingEndsWithSource` | **找到反例**：同上，分享记录停在 `active`  |

```sh
java -XX:+UseParallelGC -Xmx2g -cp "$TLA2TOOLS_JAR" tlc2.TLC -workers 1 -config Transfer.cfg Transfer.tla
```

上表每个配置都照这条命令跑，把 `Transfer.cfg` 换成那个配置。不缩小范围，不改断言来求通过。执行超时与发现反例分开报告。
