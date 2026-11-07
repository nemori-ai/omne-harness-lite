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

## 来源身份与历史配值

`SettingsSourceIdentity.tla` 对应 [本地来源绑定](../../settings-local/SPEC.md#source-identity-and-persisted-provenance)。它枚举两个来源的重排、同ID换拥有者、换作用域种类、换主体，以及未知历史、资格刷新、准备、写入和重整。稳定身份不含资格修订。模型将完整来源布局和值都纳入准备依据。

| 性质 | 负控 |
| --- | --- |
| ReadUsesSameIdentity | read-by-id允许来源身份变化后读旧值 |
| WriteUsesSameIdentity | write-by-id允许沿用旧绑定写值 |
| RetainUsesSameIdentity | retain-by-id允许异源保留 |
| UnknownIdentityIsNotAuthority | legacy-reuse把未知历史视作已知 |
| CommitUsesCurrentBasis | ignore-authority与ignore-value-revision分别跳过一个依据轴 |
| RebindingChangesRevision | no-revision-bump让绑定变化不推进修订 |

每个布局修改推进资格修订，每次重整采用变化的绑定推进配值修订。在这两个前提下，单独移除准备布局比较可能仍受其他比较保护。因此不把它登记为一个必然失败的负控。`UNCHANGED x`允许有限动作耗尽后静止。此模型只检查安全性，不声称无死锁或业务最终完成。

来源只能由真实拥有者提供，事务在模型中是原子的。模型不证明拥有者诚实、外部资格核验、远程认证或任意规模。`source-layout.ts`、`participant.ts`、`snapshot-participant.ts`和`rebase-participant.ts`兑现稳定身份与值归属检查。`source-provenance.spec.ts`验证真实独立目标、Identity和SQLite组合，Assets的`settings-governance.spec.ts`验证资产拥有者组合。准备依据的完整实现仍须由准备提交提供者兑现，不能由这些读写测试推定完成。

## 原操作与准备尝试

`SettingsIntentAttempts.tla` 对应[准备与根结果协议](../docs/protocol.md#准备提交与根操作结果)。一个根保持原命令和唯一业务结果，attempt承载一次当前依据。模型分别枚举普通根与组织源修改根，最多分配两次合法尝试，并为越界负控保留第三个候选身份。源码预算仍为64。模型把来源资格与原调用者认证作为前提，不验证它们的取得过程。

| 不变量 | 具名负控 |
| --- | --- |
| ImmutableCommand | change-command允许重新准备改命令 |
| TerminalRootCannotRevive | revive-root重开已有根终态 |
| AtMostOneActiveAttempt | replace-live在旧尝试尚未终结时分配后继 |
| OnlyCurrentAttemptCommits | late-attempt使用已封口尝试，ignore-basis跳过当前依据 |
| QueryIsReadOnly | query-cancels让查询终结根 |
| OrdinarySealKeepsPendingRoot | abort-ordinary-root把普通尝试封口当成业务取消 |
| SourceSealTerminatesRoot | keep-source-root保留已被封口的组织源修改根 |
| AttemptBudgetIsBounded | ignore-limit实际分配第三次尝试 |
| OneBusinessEffect | 与根不可复活、精确尝试共同检查，无单独负控 |

只有Prepare可分配尝试，且要求根未终结、没有活跃尝试、命令不变和预算未耗尽。Commit要求当前attempt和当前basis，原子建立根与attempt的成功事实。Seal区分普通根与组织源修改根，Cancel终结尚未完成的根。Query保持持久状态不变。由这些转换可逐步推出终态不可复活、至多一个活跃尝试和至多一次业务效果。

submitted表示持久进度，不表示调用者已取得结果。unknown是观察状态，不放进数据库；模型没有把unknown当成许可分配后继的转换。允许静止只用于有限安全性检查，不证明最终进展、无死锁、网络重试或任意规模。关系迁移由settings-local的intent-migration.ts拥有，约束测试为intent-migration.spec.ts。迁移安装与有限模型通过都不代表真实准备提交提供者已经完成，转换必须由后续持久写者和真实并发测试继续兑现。

## 准备途中重启与外部保留

`SettingsPreparationBootstrap.tla` 展开单个attempt取得外部保留的窗口。原操作模型中的Prepare抽象了整个准备过程，不能据它证明外部reserve与本地持久化之间没有缺口。本模型固定一个attempt、Identity和来源两个保留拥有者，以及至多一次进程崩溃。

Allocate先保存恢复身份并进入preparing。StartReserve只能在该身份已保存后发起。FinishReserve独立于调用进程推进，因此可以在进程退出或attempt被封口后迟到。Publish只有在两个保留均held时才能原子保存basis并进入prepared。对外prepared答复只允许来自该状态；恢复查询不能冒充准备成功。

Seal可以终结preparing、prepared或submitted。不可逆终态阻止迟到Publish或Commit。迟到的保留仍按原身份认回，只有终态成立后才能释放。Crash不修改持久身份或阶段，Restart后的恢复仍处理同一个attempt，不重新分配身份。

| 不变量 | 具名负控 |
| --- | --- |
| DurableRouteBeforeReservation | reserve-before-save先请求外部保留，再保存恢复地址 |
| AttemptSurvivesRestart | lose-attempt让崩溃删除持久尝试 |
| PreparedHasAllHolds | publish-without-holds在保留未齐时标记prepared |
| ReplyRequiresReadyAttempt | reply-before-ready把preparing回复为准备完成 |
| TerminalBeforeRelease | early-release在目的终态前释放保留 |
| TerminalCannotPublishAgain | late-publish允许已封口尝试重新变prepared |
| OnlyReadyAttemptCommits | commit-before-ready允许未完成准备的尝试提交 |
| OneBusinessEffect | 与不可逆终态共同检查，无单独负控 |

本模型只检查有限安全性。外部拥有者的reserve/settle原子性、真实资格、来源绑定、SQL隔离和固定恢复地址是前提；它不证明这些提供者实现、完整跨模型精化、清理最终完成或任意规模。SourceRetention负责来源版本保持，IntentAttempts负责根命令、预算和后继身份。提供者还必须验证准备中取消、迟到保留回包、答复丢失和数据库重开。当前关系表与私有分配写者已经保存preparing身份，实际资格和来源保留、ready及恢复组合仍未完成。不能将模型或分配测试通过报告为完整运行时完成。

## 外部请求与保管回执

`SettingsReservationCustody.tla`进一步展开Identity保留请求。模型固定一个目的操作和两个候选请求身份。Plan保存原请求，Start记录可能已发起调用，Reserve建立外部held。LoseReply丢弃未保存的回包，Retry仍使用原请求。目的终态不可逆，只有该终态存在时Settle才能结束外部保留。ReceiveHeld不得覆盖已settled的本地检查点。

| 不变量 | 具名负控 |
| --- | --- |
| RequestDurableBeforeCall | reserve-before-request在请求检查点前实际发起保留 |
| ImmutableReservationRequest | replace-request替换已经保存的请求 |
| ReceiptBindsOriginalRequest | misbound-receipt接受另一请求的回包 |
| SettledCannotBecomeHeld | late-held-revives把settled退回held |
| TerminalBeforeRelease | release-before-terminal在目的终态前释放 |
| OneReservationIdentity | 与不可变请求、先持久后调用共同检查，无单独负控 |

`standing-custody.ts`及其具名迁移保存完整请求、requested检查点及回执。实际reserve和settle由Identity服务负责，公开准备协调器按持久请求和回执推进。`standing-custody.spec.ts`包含真实Identity认回与SQLite重开，也包含合成终态回执。两类证据不能互换。

模型把外部回包真实性、Identity幂等性、目的终态和持久存储原子性作为前提。它只检查有限安全性，不证明任意规模、活性、生产调用顺序或完整恢复提供者。保管关系的存在不表示当前公共准备服务已经接线。


来源保留模型的关系实现归 settings-local 的 source-retention-schema、source-retention-migration 与 source-retention-records。门、held 上限、精确清门和独立 pending 枚举由真实 SQL 测试守护。公开来源服务另以实际快照和准备目的端验证终态前保留，见下文实现映射。组织管理更新与全部应用消费者仍未接齐，完整 SourceHoldsProtectRevision 尚不能声明为已接受的系统运行保证。


source-snapshot的真实读取增量验证了模型中源快照的部分精化。实际拥有者、配值及锁来自同一SQL事务，事实绑定完整目的请求。真实来源保留、直接 Settings 失效写者、组织读取资格和准备目的端终态已接通。组织管理员更新组合仍待实际应用验证，不能单凭读取测试推出完整系统保证。


`source-custody.ts` 将同一保管状态机用于目的侧的每个来源请求。先在一个事务中固定完整集合，再按 `(attempt_id, source_key)` 分区推进。清单不可追加或替换，各成员只写自己的键，因此交错推进不改变其他成员的请求或终态。OneReservationIdentity按单一来源请求解释，不限制整个attempt只能有一个来源。

来源清单原子性、完整绑定和SQL键分区由实际数据库测试守护；现有单请求TLA模型没有枚举1024项清单或证明哈希无碰撞。进入prepared仍须核对全部必需成员，属于bootstrap模型及后续真实协调器的责任。丢包/重开测试使用实际来源快照和保留参与者；终态回执及旧attempt仍有夹具边界。不能把这些局部结论写成完整恢复服务已交付。


`SettingsIntentAttempts` 的普通 seal、根取消、终态不复活与旧 attempt 隔离，现由 settings-local 私有 `intent-settlement.ts` 落实关系写入，测试入口为 `intent-settlement.spec.ts`。`SettingsPreparationBootstrap` 的 preparing 禁止成功也有对应反例。当前依据检查、terminal 原子组合及源门同提交由公开准备协调器和真实 Worker 组合兑现。组织管理 current、应用切换及完整独立验收仍未完成；模型通过和私有关系测试不能替代这些义务。


`SettingsSourceRetention` 的源根封口及精确清门同提交，现有 `settings-local/tests/recovery-combination.spec.ts` 使用实际六参与者组合验证。来源保留仍为held时可以取消源修改，但不得顺便结算这些保留；下游失败须回滚terminal、门和根。初始准入与来源门使用夹具，实际业务成功提交、Identity恢复装配和物理断电仍不在这组证据内。


## 尚未到达源端的 Standing 请求

`StandingRequestSettlement.tla` 补充 Identity ID-19 的源端围栏协议。模型保留一个原请求、两个候选绑定、一次迟到或丢失的 reserve 和一次重启。它检查终态前不能完成结算、已完成不能重新 held、完成必须绑定原请求。在弱公平结算和可用目的地的前提下，原请求最终完成。四个反例分别取消围栏、跳过终态、错配绑定和把缺行当作无需处理。

模型放在现有跨域 Standing 验证组，源预留和围栏仍由 Identity 拥有。SQL 封套不变、受信目的地以及原子数据库事务是模型前提。有限模型不证明真实实现、物理持久性、无限故障下进展或远程认证。实际提供者须用 SQLite 竞争、丢失响应和重开测试验证映射。


### 来源服务与目的请求的实现映射

`settings-local/source-service.ts` 将保留与收尾接到实际来源 SQL。`preparation-source-destination.ts` 在新保留前核对目的端已经持久化的完整请求，并通过原恢复组合封口精确 attempt。识别只读，不授予业务权限。识别后发生封口的竞争由不可逆终态处理：迟到来源保留不能使已封口目的重新提交，只能认回并结算该终态。

`source-service.spec.ts` 覆盖实际目的提交与封口的两种顺序、丢失来源回复、旧 attempt 与后继分离、重开、关闭排空及不存在的目的请求。`identity-sources.spec.ts` 覆盖真实成员资格、组织和租户绑定与撤回后的原责任恢复。`source-pagination.spec.ts` 验证长合法引用下按字节缩短页面仍不漏项；扫描只取元数据，保留现有 keyset 索引。

这些证据精化了 TerminalBeforeRelease、SealedDestinationCannotCommit 与固定身份前提。组织管理员更新、真实共享上界求值和应用消费者接线仍有未完成项，不能把库组合测试写成完整 C3b 接受。

`source-update-service.spec.ts` 对来源等待补充生产协调器反例。旧协调器在 held 时提交确定性 SQL，随后因回滚把原更新封口。现协调器先读取精确 pending 更新及 held 数；等待不产生业务 SQL 或终态。该读取只是调度判断，提交守卫仍在原事务内核验。用例覆盖等待后同一 preparation 提交、按来源恢复隔离、未知结果保留、取消与分页。来源与目的事务均为真实 SQLite 组合；Identity 和 current 在这些用例中是声明过的夹具，因此它们不证明完整组织管理员装配。

这项细化保留现有来源模型的终态后释放和旧目的不可复活条件。它不增加新的模型状态或释放规则，也不承诺永久不可用目的最终恢复。`source-retention.spec.ts` 检查按 source_key 筛选的实际查询计划使用 st_source_held，且不增加排序临时树。
