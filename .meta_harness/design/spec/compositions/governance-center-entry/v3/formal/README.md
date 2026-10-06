# Entry v3 形式映射与未闭合范围

本版将入口暂定分类、事务终结、预期身份比较分成三个有限模型；没有把三者组合为一个端到端精化证明。

| 模型 | 对应条款与检查 | 前提与未覆盖 |
|---|---|---|
| [EntryDecision](EntryDecision.tla) / [正配置](EntryDecision.cfg)及Validity_*负控 | S8/10/11/12/13/14/18/19/33，版本→信封→认人→载荷→授权→领域的分类顺序、不可用/拒绝/缺陷分流 | 四类路由、一个请求；decision是临时分类。invalidated是时效/准备间隙的抽象输入，不表示共同事务中其他写者可提交。WF(Pipeline)只保证EventuallyClassified；不证明发送、业务完成、G优先或SQL隔离 |
| [EntryCommit](EntryCommit.tla) / [正配置](commit-valid.cfg)、两项commit-bad负控 | S49：最终时间不可用不提交、通知只在已确认提交后释放；含实际已提交但回执未知分支 | 原子commit是前提，stageActivity是布尔抽象，不能证明有效必touch或失效不复活；无进展/排空证明 |
| [ExpectedTenant](ExpectedTenant.tla) / [正配置](valid.cfg)、两项bad负控 | S51：真实checked/effect/expected推导AppliedExpected、CheckedSameCommit | 两个租户，一个业务及一个外部切换；保护是抽象守卫，未证明成员授权、ABA或SQL |

三个模型均关闭终点死锁检查；不存在“全部性质已由形式化证明”的声明。AI3的LoginCommit/CredentialRevision提供独立登录/代际有限检查，S52最终G优先与实际路径仍需SQL验证。Schema检查具体逐路由值，不证明行为。

继承的v2业务模型历史运行见EntryCommit/EntryDecision证据及ExpectedTenant证据。这些是相应输入修订的历史证据，不陈述v2当前采用状态，也不把旧证据提升为v3维护验证；v3仍为candidate，运行与采用状态分别见版本外verification和registry。

## 维护模型

[Maintenance.tla](Maintenance.tla) 是 S-55/S-58 发布与 S-59 属主、取消、隔离的有限行为模型。
没有新的关系结构证明义务，维护增量不增 Alloy 工件。 实际执行输入和结果放执行工作树 `tmp/<task>/`。
一个源属主、一个已接纳工作、一个输出、一次取消/断连/停止/崩溃；布尔持久确认代表介质结果。
Init 从工作已接纳开始，尚未创建明文。普通操作不再创建第二任务；**排他准入、busy、固定观察与真实摘要不是此模型覆盖**，它们需真实组合场景。
S-59的准入作用域为在线部署属主单槽、离线调用作用域单槽及同一工作区跨进程互斥；不同工作区只读同一封装可以并行。模型只保留一个已接纳工作，不验证这些准入范围、跨工作区并行或恢复目标竞争，也不能推出全机源文件排他；这些范围不由现有模型或配置覆盖。
`handles` 抽象所有尚未释放的观察/句柄；`job` 表示尚未结算的工作；`owner` 是本次工作必须持续持有的所有权：在线对应源部署属主，离线对应本次工作区属主，不表示离线源封装的全机排他权。
`KeepResidual` 中发布耐久未知优先保留 outcome-unknown；已确认发布但清理失败也答 unavailable，保留输出和隔离残余，unavailable 不证明无效果。
`protected` 是已持久成立且生产打开者遵循的隔离，`deleted` 记录曾删除明文，Crash 可让删除回退。
后者使“清理撤销拒绝依据”的错误能失败，而不是把安全吸收进模型。Crash 结束原进程工作，允许明文残留；不作为正常关闭证明。

| 配置 | 条款/可失败断言 | 常量/公平性/限制 |
|---|---|---|
| [maintenance-valid.cfg](maintenance-valid.cfg) | S-59 `OwnerUntilRealEnd`、`IsolatedPlaintext`、`EndedReleasedHandles`；S-55/S-58 `ConfirmedSuccess`；S-59 `CancelledUnpublished` | Fault=none；无公平性；无序列化开关，一个已接纳工作，不声称验证准入排他 |
| [maintenance-progress.cfg](maintenance-progress.cfg) | S-59 `EventuallySettled`：执行继续取得进展时，工作最终真实结束；同时检查上述安全性质 | Fault=none；对 Advance 弱公平；有限单向阶段。公平性是假设执行可进展，不覆盖卡死介质，也不证明5分钟、24小时或关闭有界 |

`TypeOK` 只做模型值域校验，不登记为领域覆盖。成功位必须受独立 durable/published 约束；plaintext 可以由故障动作/崩溃出现，必须受独立 protected 断言约束。
模型将副本检查简化在 FinishExport 中，不证明完整性、同一观察、数据不变、无秘密或全部生产打开路径；这些由 S-59 真实组合证据承担。

### 维护 validity-check

以下配置**不登记 formal task**，仅作预期反例：

| 配置 | 被取消的保护与预期失败 |
|---|---|
| [MaintenanceValidity_releaseEarly.cfg](MaintenanceValidity_releaseEarly.cfg) | Stop 后提前释放 owner，`OwnerUntilRealEnd` 失败 |
| [MaintenanceValidity_unknownSuccess.cfg](MaintenanceValidity_unknownSuccess.cfg) | published 后 durable=false 仍 completed，`ConfirmedSuccess` 失败 |
| [MaintenanceValidity_plaintextEarly.cfg](MaintenanceValidity_plaintextEarly.cfg) | 未建立 protected 就 Export，`IsolatedPlaintext` 失败 |
| [MaintenanceValidity_removeProtection.cfg](MaintenanceValidity_removeProtection.cfg) | Cleanup 删除明文并撤销保护，Crash 使删除回退，`IsolatedPlaintext` 失败 |

保留 v2 三个业务模型及其原有配置；仅包坐标变为 v3，行为未变。原运行证据仍只支持旧输入范围，不能为维护增量背书。
