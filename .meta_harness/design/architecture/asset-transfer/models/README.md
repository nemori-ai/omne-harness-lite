# Transfer有限模型

[领域设计](../design.md)维护复制、分享、当前关系/持续关系和来源结束的技术承诺；[验证义务](../verification/README.md)区分未实现业务。

模型固定成员/组织树、两个同落点动作、离开/重新加入、隶属解除/重建、源移除/删除/提升和有限时钟。确认、血缘、分享、来源结束在一个模型动作中表示同提交；负控拆开相应步骤。src离开后不恢复：原holding缺实例身份的未决没有被模型证明。

关系读取、当前成员资格及确认以来不断条件均为使用判定前提。clock同源，在隶属建立/重新加入间严格递增，不表示真实数据库时间实现。模型的有限参数不能证明IO失败、完整权限矩阵、两次读的实际顺序、跨进程提交或恢复。

所有配置关闭deadlock检查，因为未承诺进展；没有公平性假设。NoRevival是断开后不得再生效的安全时序性质，不是liveness。SettledStable/EndedStable是状态稳定性质。不能用日志事件反应代替使用时现读。

## 配置与预期

保留原模型/16配置及常量，3正控与13定点负控。负控须实际报告指定性质的反例；非零退出本身不能当通过。

  | 配置 | 常量 | 检查什么 | 预期  |
  |---|---|---|--- |
  | [`Transfer.cfg`](Transfer.cfg) | 七个开关全 `TRUE`，`Scene = "copy"`，`MaxClock = 3` | `TypeOK`、`NoLateOrDoubleSettle`、`CopyLandsInsideBoundary`、`NoForeignTenantLanding`、`OrgLevelLandingByTargetAdmin`、`AtMostOneLineageTarget`、`EffectsOnlyFromConfirmation`；`SettledStable` | **本范围内无反例**  |
  | [`Transfer_Share.cfg`](Transfer_Share.cfg) | 全 `TRUE`，`Scene = "share"`，`MaxClock = 2` | `TypeOK`、`NoLateOrDoubleSettle`、`UseInsideBoundary`、`UseOnlyWhileMembersEffective`、`NoRevivedUse`、`NoForeignTenantLanding`、`AtMostOneLiveSharingPerPair`、`EffectsOnlyFromConfirmation`、`SharingEndsWithSource`、`NoUseAfterSourceGone`；`SettledStable`、`EndedStable` | **本范围内无反例**  |
  | [`Transfer_Revival.cfg`](Transfer_Revival.cfg) | 同上 | `NoRevival` | **本范围内无反例**  |
  | [`Transfer_NoSameCommit_Settle.cfg`](Transfer_NoSameCommit_Settle.cfg) | `SameCommit = FALSE`，copy | `NoLateOrDoubleSettle`、`SettledStable` | **找到反例**：拆步确认的读—写之间过期  |
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

逐个使用上表cfg，不缩scope或改断言求通过；保存工具版本、实际输入和输出到任务tmp。执行超时与发现反例分别记录。
