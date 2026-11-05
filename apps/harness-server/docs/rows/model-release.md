# Model 生产接线：`model-records`、`model-host` 与宿主权威

本页说明发行树里 Model 的三行真件怎样接上成员工厂：`model-records`、`model-host`、`model-request-preparation`，
以及入口对象 `modelHostAuthority`。系统责任归[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)。
接口事实归 Model 线的成员：[model-storage-sql](../../../../packages/model/model-storage-sql/SPEC.md)、
[model-host-local](../../../../packages/model/model-host-local/SPEC.md)、[model 的首次执行记录](../../../../packages/model/model/SPEC.md)。
本页依据 Reduce 裁定 R2-D6、R2-D30、R2-D33（含自查收窄）、R2-D65、R2-D98 与 B3-M 简报。
应用自己的 Model 模块在 `src/model/`。

## 三行与配置

| 行 | 成员工厂 | 行给的对象 | 配置（只放数据，全部由运维者层给，发行层不写数值） |
| --- | --- | --- | --- |
| `model-records` | `createSqlModelRecordsPlugin`；行体以子 fiber 装 `createModelSendStagePlugin`，`coordinator` 只经闭包交给它 | `authority`、`evidence`、`send.sources`、`initialRun`、`manifestDigest`（本页下文） | 成员部分 `owners`（`work` 取 `exempt`）、`limits`、`maxCallBytes`、`maxCommandBytes`、`combinationVersion`、`send`；应用部分 `initial`（首次执行记录的三项上限）与 `sendStage`（`maxRetainedAttempts`、`materialization.maxRecords`、`factoryQueryId`、`profiles`、`preparation`、`network`、`routes`、`transportLimits`） |
| `model-host` | `createModelRuntimeLocalPlugin` 加 `createModelRuntime` | `executionChannel`、`releaseExecution`、`qualifyObservation`、`send`（按调用现取 `modelSendBoundary`）、`retry`（恒 `unavailable`）、推送账本 | `host` 四项、`runtime` 八项、`results` 五项，行体自校验 |
| `model-request-preparation` | `createModelRequestPreparationPlugin` | OpenAI 家族 | `maxCitedCalls`、`openai.limits`、`openai.margin` |

`combinationVersion` 与 `session-storage` 行相等，发行值是 `session-composite/4`（R2-D65 换到 `/2`；Tool B 段并入 `tool` 参加者后换到 `/3`；Agent Journal 事实族加入状态分块与执行事实迁移后换到 `/4`，R2-D342）；两行都用 `compositeManifestDigest(storageCatalog())` 的同一摘要。
换版本不为已登记租户补登记，开发环境清存储根（R2-D98）。

装载时（`serve` 的配置边界，任何插件装载之前）核四条跨行相等，不等即退出 2 并写明哪两行哪一项：

1. `model-records.limits.resultPageTargetBytes`、`readIdleMs` = `model-host.runtime` 同名值。
2. `model-records.combinationVersion` = `session-storage.combinationVersion`。
3. `model-records.sendStage.preparation` = `model-request-preparation` 的整份配置。
4. `model-records.sendStage.profiles` = `model-profiles` 的 `retryPolicy` 与 `compactionTriggerPercent`（发送来源的档案采用摘要由同一定义算出）。

只有两行都是真件时才核；缺项由各行自己的 schema 报。

`compactionTriggerPercent` 对全部官方档案生效，`coding` 等单个定义不能另设。运维者层的推荐值是 `"80"`（R2-D124：出厂 coding agent 的压缩阈值 80%）；r9 与 serve 的测试运维层用这个值。发行层仍不写它。

## 两类主体与 ActorRef

| 主体 | 形状 | 签发 | 核验 |
| --- | --- | --- | --- |
| W | `acting-for-tenant`，`actor.component === 'sessionWorkPrincipals'`，`work.owner === 'session'` | 入口 `sessionWorkPrincipals` | `principalVerifier` 核为本运行签发，租户与 access 相等 |
| M | `acting-for-tenant`，actor 是系统主体 `modelHostAuthority`，`work.owner === 'model'`，`work.work` 是 call id | `modelHostAuthority.resolve` 内的窄签发闭包（actor 与 `work.owner` 固定） | 只有 `resolve` 登记过的对象才算 M；同形对象没有登记项 |

`ActorRef` 的来源（model-contract SPEC「ActorRef 是身份拥有者生成的可核验原事实引用」）：

- `authorize` 返回的原主体引用：`owner` 是 `tenantStanding`（能重读同一记录的 standing 来源的服务键），`subject` 是 `standing.evidence.record`，`revision` 是 `standing.evidence.revision`。W 与 M 都指向租户账号的 standing 记录；M 代该账号行事。这是租户级的记录：同一租户的全部 W 与 M 共用一个 ActorRef（见已知限制）。
- `execution(ExecutionRef)` 返回的绑定引用：`owner` 是 `modelHostAuthority`，`subject` 是 `instance`，`revision` 是 `generation`。通道 gate 已核这两项属于本绑定记录，本模块再核 `instance` 等于 `resolve` 时 `channel.prepare` 返回的 instance。

没有可核验来源的字段不编造：M 没有自己的签发记录修订，所以不另造 M 专用的 `revision`。

## `modelHostAuthority.resolve`

前提：`model-records` 行已把本次激活的 `initial` 与资格登记表交给入口的运行级组合；`model-host` 行已绑定。缺任一项答 `unavailable`。

1. 打开本 `(tenant, call)` 的 origin 读许可，调 `initial.readAcceptance`，finally 关许可。`checkOriginRead` 只放行许可里的键，别的调用方拿着 `initial` 读不到。`not-found` 原样返回，`commit-unknown` 答 `unavailable`。
2. 用入口受信读取的 `principalIssuer`（安装时读一次，照 `agent-host-principal.ts`）签 M。签发者缺席或拒绝答 `unavailable`。
3. 核关系：受理记录的租户与调用等于请求；`tenantStanding.read` 为 `member`（`not-member` 答 `denied`，不可用答 `unavailable`）；原发起者的 `owner` 是 `tenantStanding` 且 `subject` 等于当前 standing 记录，否则 `denied`。通过后把 M 登记进资格表。
4. `channel.prepare({tenant, call, principal: M})`。失败撤掉 M 的登记并原样返回。成功后记录 `{instance, operation}`，供 `execution` 与 `current`。

任一步失败都不跳过后面的步骤去补造结果。诊断不回显调用身份。

## 同步资格桥

`ModelCommandsAuthority.authorize`、`execution` 与 `ModelSendSource.current` 是同步的，`principalVerifier.verify` 与 `tenantStanding.read` 是异步的。应用不把异步读口塞进同步回调：

- W 的受理点是 `model-host` 行交给 runtime 的命令包装（`src/model/commands-qualifying.ts`）：每个方法先核验主体、读 standing、把结果登记在表里，调用真件，finally 释放。捕获只活在这一次调用里。`qualifyObservation` 同法。
- M 的受理点是 `resolve`。登记项随 `model-host` 行的 fiber 退役失效（`currentForReader` 的代次闭包）。
- `authorize` 查表：没有登记项答 `unavailable`（`model-access-qualification`）；核验拒绝、不是成员、租户不符答 `denied`；核验或 standing 不可用答 `unavailable`；再按 R2-D33 方案 A 的九动作矩阵判：`admit`、`control` 只 W；`facts`、`content`、`handoff`、`account`、`observe` W 与 M；`recovery`、`send` 只 M 且限它绑定的那一个调用；租户级 `recovery`（`scanPending`）答 `unavailable`。
- `current(demand)`：`demand.principal` 是登记过的 M、租户与调用相等、宿主 fiber 未退役时 `authorized: true`；`noTenantBinding` 等于 `demand.supplier.credential.kind === 'factory'`（见已知限制：这使成员的工厂围栏永不拒绝）。

## 运行级组合与释放次序

入口对象 `modelHostAuthority` 在自己的闭包里持有本运行的 Model 组合（`src/model/composition.ts`）。组合不挂在任何服务实例上：`ctx.get('modelHostAuthority')` 只拿到 `resolve`。两行各经 `src/model/ports.ts` 按运行的根上下文取自己的窄口：`model-records` 拿 `checkOriginRead` 与 `attach`（附着句柄给出本次附着的通道、发送子 fiber 的登记与 `detach`），`model-host` 拿 `bindHost`（绑定给出 `executionChannel`、`releaseExecution`、`qualify`、`qualifyObservation` 与推送账本）。`grantOriginRead`、`attached`、宿主退役闭包与通道的直接读口只有入口的 `resolve` 读得到。组合持有 origin 读许可、一次记录激活的附着（`initial` 与资格表；第二次附着被拒）、唯一的执行通道（附着时以随机 `minst_` 打开，宿主与发送子插件的 `executionChannel` 都返回它）、宿主绑定与推送账本。无关插件经 `ctx.get` 拿不到签发者、standing 读口、登记表的写口（`captureHost`、`recordHostBinding`）、`initial`，也拿不到通道；`tests/entry/model-authorities.spec.ts` 有这条反例。

`model-host` 是 `business` 阶段的行体承载：宿主插件跑在行的子 fiber 里，业务停止 dispose 该子 fiber，这就是成员的有序关闭（关观察、quiesce、停派发等 drive 交还、停推送、`releaseExecution`）。`releaseExecution` 由入口组合兑现：先 dispose 记录行的发送子 fiber，等发送资源关闭，再关 channel 并结束附着，之后任何一方取 `executionChannel` 都答 `unavailable`（`records-not-attached`），不交出已关闭的通道；宿主 finally 与记录行的 effect 再关一次都是幂等的。期间 `model-records` 父 fiber 存活。期限内未完成答 `incomplete`。

资格表的宿主绑定项（`execution` 查的 `{instance, operation}`）有界：通道关闭（附着结束）与宿主 fiber 退役时整表清空，每次登记先丢掉 `current()` 已为假的项；上界是一个通道、一代宿主内不同调用的数量。宿主插件没有按调用结束的回调，所以一代宿主内同一调用的项保留到通道关闭。

## 模型凭据

租户可以经公开契约的[模型凭据](../../../../packages/access/public-contract/SPEC.md#模型凭据)操作自带、更换、解绑和查看自己的模型凭据。本节写本应用怎样兑现它。

**键。** 本宿主按租户一份绑定。凭据身份是 `tenant-model-send:<组织>/<账号>`，由 `src/model/tenant-credential.ts` 的 `tenantCredentialId` 派生。发行内置的官方档案都发往 `openrouter`，所以一份绑定覆盖本宿主能发出的全部调用。按接收方区分的键要等新的接入契约（模型调用产品设计 MODEL-M04）。

**管理。** `model-credential` 行以子 fiber 装 model-host-local 的受管凭据插件，自己提供受信名 `modelCredentialCustody`。每次调用先经 `src/rows/authorization/model-credential-access.ts` 准入：

- 只有 `work.owner` 为 `identity-login`、代同一租户行事的登录主体可以管理。
- 准入经 authorization 的参考准入核验（AU-11，`requires` 为空），核验器与租户存续按调用现取。
- 会话工作主体、系统主体、伪造或复制的主体与他租户都答 `denied`。
- 依据不可得答 `basis-unavailable`。

通过后按派生的身份读写保管库，配置时刻取宿主系统时间。

**解析。** `model-request-preparation` 行的供应商补全按调用现取 `modelCredential`，对该租户的身份调用 `presentFor`：

- 绑定存在时给租户引用。绑定读不出时也给租户引用，发送在围栏内得到 `unreadable`，不退回工厂。
- 没有绑定时给工厂引用。
- `presentFor` 答 `denied` 或 `unavailable`，或凭据服务不在树里时，准备失败，不给工厂引用。

`model-records` 行发送子插件自带的准备租约用同一个补全，读子 fiber 注入的 `modelCredential`。工厂秘密是空字符串时，保管库把工厂解析答成 `absent`。

**缺凭据的结局。** 发送在围栏内得到 `absent` 或 `unreadable` 时，不向上游发字节。Model 的产品发送边界把本次调用终结为失败，`cause` 为 `credential`，`diagnostic` 为 `credential-missing` 或 `credential-unreadable`，`upstreamStatus` 为 null（[Model SPEC「产品发送边界」](../../../../packages/model/model/SPEC.md#产品发送边界)）。调用随即 settled，Agent 的这一轮以失败结束，不等待。租户之后再绑定，下一轮照常发送。

## 已知限制

- **`revoked` 绑定在查看里显示为 `unreadable`**：公开操作不产生 `revoked`，只有保管库自己的 `revoke` 会写它。两者对发送都不可用。
- **实时撤权（#677）**：M 的登记项只随宿主 fiber 退役失效；W 只在每次调用时重读 standing。撤权确认与下一次调用之间没有同步来源。
- **直接经 `modelCommands` 服务的 W 调用没有受理点**，一律 `unavailable`（`principal-not-qualified`）。M2 树里这样的消费者只有 `model-request-preparation` 的世系读取，首次调用没有世系。
- **`noTenantBinding` 等于 `demand.supplier.credential.kind === 'factory'`，所以成员的工厂围栏永不拒绝**：对工厂回退的全部防护依赖保管库的 `resolveFor`，它按 facts a.4 核对该租户是否持有任何绑定。供应商补全只在 `presentFor` 答该租户没有绑定时给工厂引用，见[模型凭据](#模型凭据)。
- **ActorRef 是租户级的 standing 记录**：同一租户的全部 W 与 M 共用一个 ActorRef，`resolve` 第 3 步对原发起者的核对退化为「同一租户」。M2 是个人租户，按 R2-D33 方案 A 接受；按主体区分的 ActorRef 由入口签发者在波 3 给出。
- **W 的受理捕获以调用为期，不以入口为期**：一个 W 在宿主包装的命令调用进行中时，拿同一个 W 直接经 `modelCommands` 服务发起的调用也被放行（`authorize` 只查表里有没有这个对象的捕获）。调用结束后捕获释放，直接调用回到 `unavailable`。记录，不修。
- **s0 树不变**：`config/s0.distribution.json` 与 s0 允许表没有改动，s0 只装 `stubPlugin`；真件只进 `serve.distribution.json`。
- **`receive`、`lateFact`、`retry` 证据恒 `unavailable`**：首内容保持 `none-proven`，重试收场 `policy-unavailable`（首内容前停顿长期 `running`，用户仍可取消），晚到账目不补录。
- **`handoff` 证据按耐久接收记录核验（R2-D257）**：Agent consumer owner 的证据适配器（`@omne-harness/agent` 的 `createAgentCustodyEvidence`）经受信名 `agentReceivedRecords`（`agent-journal` 行提供，只对本行可见）读结果接收方提交的 `received` 记录，租户、调用引用与结果版本、完整 consumer 与 saved 证据完全一致才确认；记录已提交但交付键、consumer 或 saved 证据不一致，或证据不是 Agent 位置的 retained 证据，按伪证据拒绝，答 `handoff-invalid`（R2-D260）；读面缺席、记录不存在、读失败答 `unavailable`，可以重试。两种失败都不写，结果与份额保留，同一 ACK operation 以后再确认。M2 发行只有一个 Model 调用的 consumer owner，`@omne-harness/agent`（运维者层 `model-records.owners` 只给这一个）；别的 owner 的 ACK 不进 Agent 适配器，答 `unavailable`（`owner-not-wired`），不当作伪证据（R2-D262）。ACK 与清理完成后该调用的份额归还，同一租户的下一次调用才放得下（发行份额 1000000 字节、每次调用 524288 字节，R2-D256）。已知限制：推送台账在进程内。成员已经能在启动时扫描耐久 custody，接续已 saved、未 ACK 的调用（model-host-local SPEC「启动扫描」，R2-D260），但发行不传 `results.recovery`。原因有两个：宿主主体按调用签发，资格表对不带调用的恢复扫描答 `unavailable`（`tenant-scan-not-provided`）；宿主接管记录只在进程内，重启前受理的调用 `resolve` 答 `unavailable`（见下一条）。所以发行里进程重启后，已 saved、未 ACK 的调用仍不会被重新推送与确认，份额要等跨进程恢复（波 3）。
- **目录发布权威恒 `denied`**：不挡本地 host 的 drive（R2-D33 §5.3）。
- **官方档案采用摘要规则是 model-host-local 私有规则的复制**，由 `tests/model/sources.spec.ts` 对真实 `ModelProfilesLocalPlugin` 守护。
- **数值没有测量依据**：r9 与 serve 测试的运维者层是测试值，E9 首测后按曲线改运维者层配置。
- **宿主接管记录只在进程内**：重启后答 `unavailable`（R2-D33 自查收窄）。

## 持续验证

- [资格登记表](../../tests/model/qualification.spec.ts)：W 与 M 的九动作矩阵、核验失败与 standing 的各答法、ActorRef 三字段来源、执行引用、`current`、fiber 退役后永远为假、绑定表清空与丢弃退役项。
- [宿主权威](../../tests/entry/model-authorities.spec.ts)：`resolve` 的四步与每步失败、origin 读许可只在读内、签发者缺席、宿主未绑定、prepare 不被跳过、二次附着被拒、`releaseExecution` 后不交出已关闭的通道、无关插件经 `ctx.get` 只拿到 `resolve`。
- [跨行断言](../../tests/model/consistency.spec.ts)：四条相等各一条反例，装载前退出 2。
- [发送来源](../../tests/model/sources.spec.ts)：档案采用与真实档案插件相等。
- [两行真件](../../tests/rows/model/records-host.spec.ts)：真实 SQLite 与 session-storage 上装两行，经 runtime 的受理点放行 W、拒绝未核验主体，直接命令口 `unavailable`，宿主 `resolve` 读到未受理调用，缺凭据配置时发送 `unavailable`，业务阶段 `settled`。
- [凭据管理的准入与保管](../../tests/rows/model/credential-custody.spec.ts)：真实参考准入与真实文件保管库上，只有代同一租户行事的登录主体能绑定、查看、解绑；他租户、会话工作主体与伪造主体在触到保管库之前答 `denied`；非成员租户答 `denied`，成员资格未知答 `basis-unavailable`；保管库读不出时答 `basis-unavailable` 且字节不变；插件卸载后写入答 `basis-unavailable`；宿主时钟读不出时不写。
- [凭据保管的答复映射](../../tests/rows/model/credential-mapping.spec.ts)：保管端口对存储的每种答复（写入未确认、未存时间的绑定、时间无法解析、凭据端口抛出或拒绝）各有一个映射；供应商补全在任何情况下都不退回工厂引用。
- `tests/serve.spec.ts` 的发行树：25 个真实行装载、接受、停止，退出 0。

这些用例证明接线与失败关闭，不证明一次真实的 OpenRouter 发送（S2-3，联调 B）。
