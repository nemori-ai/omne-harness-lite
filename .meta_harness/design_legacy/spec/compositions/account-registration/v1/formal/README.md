# 账号建立与个人范围激活模型

[AccountRegistration.tla](AccountRegistration.tla) 表达 [ACR-01～06](../contract.md) 的
单机共同链：受信 init、耐久凭据绑定、不可变 F 直读、T 单目标流提交、本代可消费后
激活，以及后续 signup。依据为[本地创建候选 B](../../../../../proposals/account-personal-local-creation/design.md)。
本坐标仍为候选；模型与有限检查不自动构成接受、发布或提供者验证。

## 条款与动作

| 条款 | 动作及检查性质 |
|---|---|
| AI-08、ACR-01/02 | `AcceptAccount` 耐久占首位；`InitOnce/InitIsFirst` 保护唯一 init，`SignupAfterInit` 要求初始账号已 active。pending 不因 unknown 释放。 |
| AI-02a/04、ACR-01/03 | 独立的 `ConfirmCredentialBinding` 后才有 `IssueSource`；`CredentialBeforeSource` 禁止 pending 或未确认凭据发行 F。 |
| TG-01、ACR-03 | `Fact/Operation/Canonical/Target` 表达稳定绑定；`ReadSource` 只接受当前可信读面，`Crash` 清空准备；`CommitTenant` 一次写 tenant 与唯一 owner，第二 T 明确 conflict。`OnePersonalPerUser/CommittedOwnsStream` 检查唯一性。 |
| ACR-05/06、CC-06 | `ObserveUnknown/ResolveUnknown/Recover` 保留原身份与结果；完整前缀核实后认回或同键重备。恢复 publication 不重提事实。 |
| AI-02/05、ACR-04 | `Publish/Activate/ReportSuccess` 区分耐久提交、当前代可消费、active 与对外确认；`ActivationSafe/SuccessSafe` 检查屏障。 |
| ACR-06 | `Fairness/EventualResolution` 表达 pending 枚举与原 T 查询的持续推进，冲突也属于可辨收口。 |

## 有限检查范围

四项任务登记于 [formal-tasks.json](../../../../../formal-tasks.json)。工作目录为
`.meta_harness/design`，`${JAVA_BIN}` 为实际 Java 可执行文件，`${TLA2TOOLS_JAR}` 为
实际 TLC JAR，`${TLC_STATE_ROOT}` 为检查器状态目录。每条登记给出完整 argv；共同选项
为 `-XX:+UseParallelGC -Xmx768m -workers 1 -seed 1 -fp 0`，无状态裁剪或深度上限。

| CFG | 实际枚举 | 检查 | 不同状态数 |
|---|---|---|---|
| [basic.cfg](basic.cfg) | 一个 init、一个后续 signup，不同 UserRef | 安全与条件进展 | 436 |
| [same-user.cfg](same-user.cfg) | 一个 init 后，两个 F 争同一个 signup UserRef/target | 安全与条件进展 | 7,216 |
| [init-race.cfg](init-race.cfg) | 两个 init 争 Account 首位 | 安全与条件进展 | 116 |
| [credential-blocked.cfg](credential-blocked.cfg) | init 完成后 signup 的凭据一直未获耐久确认 | 安全；不要求该 signup 成功 | 96 |

2026-09-16 在上述规范路径以 TLC `2026.09.12.025210 (867aefb)`、Temurin JRE
`21.0.12.1` 执行四项任务，均退出 0、完整状态空间无反例。模型和 CFG 的精确修订由
包含本次工件的 Git 提交固定。`SharedSources/SharedUser` 仅表达检查输入中的同账号；
同 UserRef 多 F 是 Tenant 防御性消费检查，不表示 Account 正常允许重复分配身份。

## 前提与未覆盖范围

- `ConfirmCredentialBinding` 假设 Account provider 已真实核实规范凭据唯一绑定及
  A/UserRef 的耐久认回；超时和碰撞不能执行此动作。模型不选择认证库、不实现密码
  或数据库事务，也没有把两个本地存储当作同一事务。
  Account 原 A 与 provider subject 的耐久幂等绑定，以及 provider 已写而 Account 映射
  未写时的崩溃认回，是这里的未验证前提，不能由 `credentialBound` 反推已闭合。
- Tenant 确定冲突在 `outcomes[r]="conflict"` 中显式建模并作为条件进展的可辨结果；
  Account 的终局/阻断分类及其从可继续 pending 枚举中移除未建模。`CredentialEligible`
  只阻止未确认/不可用凭据发行 F，不区分临时 unknown 与确定 credential conflict；
  `credential-blocked.cfg` 不构成凭据冲突终局收口的证据。
- Init 假设 Account 空根与 Records 空前缀均在独占权下真实核实；`Recover`、
  `ResolveUnknown`、`Publish` 抽象完整前缀、旧 writer 隔离、占位安全解除及全部 owner
  根安装。文件缺失与 fresh 的区分、坏前缀、真实 fsync/字节、部分发布及 fencing 未验证。
- `CommitTenant` 压缩逻辑排位与耐久写入，没有展开 DR 的 reserved/pending_durability
  内部阶段。unknown 不换键；安全重备依赖完整核实，不由临时 not_seen 授权。
- tuple/record 是稳定身份与 canonical JSON 的数学抽象；空 sequence 代指空 JSON
  object。UTF-8、base64url、OpaqueId、JSON/SHA-256 与错来源拒绝仍需编码和 Schema 测试。
- 进展假设最终 host/Account 持续可用，一般推进和恢复弱公平；反复 unknown 可令提交
  间歇可用，因此 `CommitTenant` 另需强公平，即无限次可执行不能永远被错过。
- `activationEvidence` 是检查历史变量，不要求新增产品持久表。active/reported 保留
  历史事实，published 只表示本代可消费；不据此授后续业务权限。logout、租户关闭、
  组织入会、CLI、无限数量账号及真实提供者符合性不在本模型范围。
