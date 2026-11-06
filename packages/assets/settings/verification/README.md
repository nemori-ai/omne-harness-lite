# 设置组合的验证资源

本目录验证[组模型](../../docs/settings-composition.md#性质与证明义务)中的协议性质。模型同时适用于独立目标和资产目标：`live` 抽象目标有效性，资产策略以合法持有兑现它；模型不要求两种目标共享存储或生命周期。

## 有限模型

`SettingsComposition.tla` 枚举两个目标/资格/声明变化、一次配值变化、两个读取者和一次准备/提交。`epoch` 是已获得一致性的目标依据抽象，不是声称生产环境已有一个全系统版本。外域真实变化必须进入相应 guard；未进入的变化不在此模型保证内。

| 性质 | 正控保证 | 负控破坏 |
| --- | --- | --- |
| BasisTracksSources | 配值来源变化与目标变化均进入读取依据 | unversioned_commit 漏记配值版本 |
| GuardedCommit | 提交时目标、声明、资格和编辑依据仍有效 | stale_commit 跳过提交核验 |
| FreshPublication | 采用时依据仍当前，旧结果不覆盖较新结果 | stale_publish 接受过期读取 |
| FrozenInput | 已捕获调用输入保持原值 | rewrite_call 随新快照改写旧输入 |
| RecoverableCommit | 提交结果与来源计数、outbox 同时成立 | missing_outbox 丢弃恢复事实 |
| UnloadPreservesValue | 撤除运行提供者不删除已提交配值 | erase_on_unload 把卸载误当删除业务数据 |

`commitValid` 和 `publicationValid` 记录各动作线性化时的条件，而非要求历史事实永远符合当前权限。撤权不改写历史成功；新操作另查资格。模型不把持有结束后留存历史记录等同于仍有生效资格。

## 执行

仓库根运行：

```sh
python3 packages/assets/settings/verification/check.py --self-test
python3 packages/assets/settings/verification/check.py
```

复用项目已安装的 TLC，通过 `TLA2TOOLS_JAR`、可选 `JAVA_BIN` 定位。每例 45 秒、单 worker、512 MiB；工具缺失、超时、解析失败都不是通过。检查器要求正控完成标识，安全负控必须退出12并命中 models.json 指定的 invariant；活性负控只配置一个具名PROPERTY，必须退出13并输出Temporal properties were violated。输入/JAR 摘要、Java/TLC 输出、命令与判读写到执行树 `tmp/formal/settings/<时间与进程>/`，不把运行日志写入正式文档。

## 结论边界与后续映射

有限检查是模型检查，不是机器归纳证明，也不是实际源码符合性。SettingsComposition 和 StandingCommit 没有检查 liveness。新增来源模型的条件进展范围见下节。所有模型均不验证目录分页、租户非干扰、Schema 完整性、覆盖算法、秘密保管、操作幂等、真实跨进程事务、物理断电或最终 UI。

实现时必须把每项性质对应到公开命令、参与者和真实采用入口，并运行反例。纯全化用有界性质测试验证；分页绑定、撤权后续页、分组冲突、必要语义元数据用目录契约测试验证。未建立映射前，不能把此模型结果写成 真实 Settings 联调完成。

配值提交使来源修订和读取依据共同变化；因此提交前后捕获的两个读取不同代。后提交结果先采用时，先前读取不得晚到覆盖。`BasisTracksSources` 负控专门检出漏将配值变化纳入读取依据的模型错误。

## 资格协调模型

`StandingCommit.tla` 枚举同一成员的两个原操作和一次治理变更。模型把每个存储域的事务抽象为原子动作；消息可以延迟到 seal 之后，完成观察可以延迟。持久状态的保持是崩溃恢复前提，不是物理故障验证。

| 性质 | 检查内容 | 具名负控 |
| --- | --- | --- |
| CurrentAtCommit | 新设置效果出现时资格仍有效且原操作仍被保护 | 与下列门和释放负控共同覆盖 |
| TerminalBeforeRelease | 释放前必须有目标终态 | timeout_release |
| TerminalImmutable | 已终止操作不能被迟到写覆盖 | ignore_seal |
| NoHeldAfterRevocation | 撤权完成时没有相关 held | bypass_writer_gate |
| NoNewReservationsDuringDrain | 排空开始后不接受新的重叠预留 | no_admission_gate |
| FreshGovernanceAuthorization | 排空后的治理阶段采用新的授权依据 | stale_actor |
| AtMostOneEffect | 每个原操作至多有一次目标效果 | 终态约束 |

FreshGovernanceAuthorization 检查的是等待期间资格变化后重新取依据，不把它解释为新的“真实墙钟提交时登录有效”政策。具体时钟采用规则仍归 Identity。模型没有表示 SQL 阶段摘要、旧执行尝试退休、多个租户、目的地认证或每个真实成员 writer。这些义务须在源码测试中覆盖。

实现的目标封口对应 `terminal-participant.ts`，正常消费与设置值同事务，seal 与迟到消费竞争同一记录。Identity 的 held、待决门与所有成员变更路径须另行兑现。参见 [本地协调与推导](../../settings-local/docs/coordination.md)。

## 源码符合性入口

| 模型义务 | 实现位置 | 可复跑反例 |
| --- | --- | --- |
| BasisTracksSources / FrozenInput | settings/application.ts 与 settings-local/snapshot-participant.ts | settings 测试 application.spec.ts；settings-local 测试 catalog.spec.ts 的写后旧页与输入冻结 |
| GuardedCommit / RecoverableCommit | settings-local/participant.ts、target-guard.ts、terminal-participant.ts | settings-local 的 persistence、boundaries、terminals 测试；assets-local 的 guards 测试 |
| UnloadPreservesValue | registry.ts 与目录可用性捕获 | settings-local/catalog.spec.ts 的卸载后重装读回 |
| CurrentAtCommit / TerminalBeforeRelease | settings-local/identity.ts 与 identity-sql/coordination.ts | settings-local/identity.spec.ts；identity-sql/standing-reservations.spec.ts |
| 当前目标拥有者事实 | assets-local/projection.ts 与 settings-local/standalone-participant.ts | assets-local/settings-governance.spec.ts 的真实三域组合 |

FreshPublication 的最终消费者采用仍由消费者负责。目录返回有限依据并拒绝过期续页，不代表最终 UI 或执行实例已经采用。显式维护 rebase 不属于租户资格模型，部署拥有者应保护其能力引用。表内位置省略各成员的 src/ 或 tests/ 前缀，精确测试命令见各成员 README。


## 组织来源保留与源修改恢复

`SettingsSourceRetention.tla` 是 [动态治理共同协议](../../docs/governance-contributions.md#组织来源与原修改终结) 的有限行为守护。可用 `python3 packages/assets/settings/verification/check.py --models SettingsSourceRetention` 只运行这一模型；不带选择参数仍运行全部登记模型。

模型有两个目的操作、两个源修改和一次崩溃。revision=0包括尚无配值的来源，首次设置仍经过保留门。Reserve共同记录当前来源和held；目的Commit与Seal竞争唯一终态；Settle按终态释放。源修改先关门，排空held后同事务写配值、原结果及清门。最终拒绝或外部SealUpdate终结根操作并清精确门。Crash不改持久事实，Restart重新枚举pending，包含零held的源。

| 性质 | 必须保护的动作 | 负控 |
| --- | --- | --- |
| SourceHoldsProtectRevision / CurrentAtDestinationCommit | held期间不修改来源，目的提交仍受保留 | ignore-source-holds |
| NoNewReservationsDuringDrain | 源修改关门后不增加重叠held | admit-during-drain |
| TerminalBeforeRelease / SealedDestinationCannotCommit | 只有目的终态可释放，sealed不晚交 | release-without-terminal / ignore-destination-seal |
| GateHasPendingOwner / PendingHasGate | 根终态与门释放共同成立 | leave-pending-gate |
| ExactGateRelease | 旧根收尾不能清后继修改的门 | inexact-clear |
| CurrentManagementAuthority | 源写仍受原管理资格约束 | ignore-admin |
| CurrentWriteConditions | 已确认业务条件失效时终结待决根，不再写值 | ignore-write-conditions |
| PendingProgress | 可恢复时持续推进，零held的pending不能遗漏 | scan-held-only |

归纳依据是只有Reserve增加held并记录当前revision，只有Apply改revision且要求held空。目的提交要求原terminal开放，而释放前先不可逆终结，所以来源变化后迟到目的不能写入。根终结与精确清门共同提交，故已终结根不占门，旧根不能释放新根的门。

PendingProgress以数据库最终可用、重启恢复与相应步骤弱公平为前提；不要求永久失联时仍可更新组织规则。身份绑定在模型中固定，单次源SQL提交抽象为原子动作。模型不证明真实参与者组合、任意规模、网络认证、Cordis收尾或物理断电。实现必须将settings.terminal、intent-plan、source-retention和persistence映射到同一次真实提交，并验证登记途中卸载、SQL依赖消失与旧引用调用。模型和负控通过不代表这些生产义务已完成。

来源模型的conditions位抽象已确认的最终业务条件。InvalidateConditions可在等待期间使其失效；Apply要求其成立，Reject与清门共同提交。它不代表来源暂时不可读，也不证明定义、修订、锁或动作资格的实际SQL判断。具体失败分类归[准备协议](../docs/protocol.md#失败对请求attempt及根的后果)，提供者须逐项验证，并保留unknown与rejected的观察边界。
