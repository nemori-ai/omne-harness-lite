# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：候选；形式模型与否定核对在改钉 `capability.account-identity` v2 之后重跑过（下表），规范场景与静态检查一条都没开始。**
> `composition.governance-center-entry` v1 是 `candidate`，主责产品依据 PF-017 rev 1 仍是 `draft`，所依赖的 `capability.account-identity` v2 也是 `candidate`。
> 入口层的提供者设计是候选（[实现映射节点](../../../realization/packages/tenancy/governance-center-entry/README.md)），没有源码、没有装配，所以一切要真实组合的证据都「未开始」。
> 形式模型的原始输出**没有入库**：`record/` 不在起草者的可写范围内，下面给出重现命令与文件哈希，入库由主线决定。

## 证据义务

| 规范条款与性质 | 证据形式与抽象映射 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| **V-1** 判定次序 × 四种入口答复 × 「判不了优先于无效」：[S-6](v1/contract.md#s-6-四种入口答复)、[S-7](v1/contract.md#s-7-答复集合闭合)、[S-8](v1/contract.md#s-8-协议版本与跨版本不变的两样)、[S-10](v1/contract.md#s-10-判定次序)、[S-11](v1/contract.md#s-11-认人)、[S-12](v1/contract.md#s-12-身份推导)、[S-13](v1/contract.md#s-13-补授权)、[S-14](v1/contract.md#s-14-失败映射)、[S-18](v1/contract.md#s-18-公开体检)、[S-19](v1/contract.md#s-19-免认人的两条路由注册登录)、[S-33](v1/contract.md#s-33-认出人之后登录状态被撤销) | TLC：[`EntryDecision.cfg`](v1/formal/EntryDecision.cfg) 的十三条绑定条款的不变量（另有 `AnsweredClosed`，由 `TypeOK` 推出、只作回归）；映射见 [formal/README](v1/formal/README.md#本版本选用什么) | **已执行**（[下表](#实际执行)）：无反例，完整穷尽 | 范围：一次行为一个请求、模型抽象之内。**S-7 只到「失败集合之外的东西收成 `unavailable`、不成为第四类答复」**（`DefectIsUnavailable`），具名值的枚举闭合归 Schema（V-4）。**逐字节相同不在模型里**（V-5）；**哪个身份值、哪个组织**不在模型里（V-9、V-13）；补授权多个组织「不短路」不在模型里（V-7） |
| **V-2** [S-10](v1/contract.md#s-10-判定次序) 的进展、[S-32](v1/contract.md#s-32-进展性质与前提) 的「这一次就得到答复」 | TLC：`EventuallyAnswered`，前提只有 **P1**（中心在运行）——模型里是 `WF_vars(Pipeline)`；环境不受公平性约束 | **已执行**：时序性质在 756 个状态上检查完，无反例 | **模型只用到 P1**：P2～P4 在模型里是答复分支（读不到答 `unavailable`、版本对不上答 `version-mismatch`），不是前提；P1 在真实系统里由运维者兑现，不是被证明的事实 |
| **V-3** 模型断言不平凡 | 有效性核对 [`Validity_Reachability.cfg`](v1/formal/Validity_Reachability.cfg) ＋ 八个变异配置（断言集合与时序性质都与正配置相同） | **已执行**：九条「从不」全部被违反；八个变异各得预期反例 | **五条断言没有专门变异**：`HealthUnconditional`、`ExemptIgnoresPresentation`、`ExemptInputWithoutLookup`、`RejectionOnlyWhenJudged`、`NoDomainWithoutGates`。它们的前件可达，但没有证明它们会失败。责任：本契约的下一轮修订 |
| **V-4** Schema 与样例一致 | 逐节把 [examples.md](v1/examples.md) 的第一列喂给 `$defs`，与第二列比对 | **已执行**：255 条实例，0 条不符；85 个定义项里 73 个被直接校验、各至少一条通过一条拒绝，27 条路由的载荷与成功返回都在其中 | 其余 12 个定义项只被间接求值（清单在 [examples.md](v1/examples.md) 页首）。`issuedAt`、`startedAt` 引用 `data.offer-expiry` v1 的 `Instant`，时间点形状由它的 pattern 断言；`format: date-time` 仍只作注解。**`credential` 的内部格式不在 Schema 里**，归凭据方案 owner 的解析规则（V-13） |
| **V-5** [S-6](v1/contract.md#s-6-四种入口答复)、[S-11](v1/contract.md#s-11-认人) 整个线上答复逐字节相同 | 规范场景 [S-39](v1/contract.md#s-39-规范场景拒绝逐字相同)：六种不认情形 ＋ 撤销落在认人与办事之间，比较传输层状态、头与体 | **未开始。**需要入口层提供者与一个具体的传输落地 | 受阻消费者：据点一侧的客户端代理。**TLC 的「同一个答复值」不能替代这一条** |
| **V-6** [S-10](v1/contract.md#s-10-判定次序) 答复的先后（真实组合） | 规范场景 [S-38](v1/contract.md#s-38-规范场景答复的先后) | **未开始** | 同上 |
| **V-7** [S-6](v1/contract.md#s-6-四种入口答复)、[S-13](v1/contract.md#s-13-补授权)、[S-14](v1/contract.md#s-14-失败映射) 三个出口不合并；补授权多个组织全部读完、不短路；缺陷在完整体检里可见 | 规范场景 [S-40](v1/contract.md#s-40-规范场景三个出口不合并)：故障注入让存储读不到、让领域给出集合外的值、让两个组织一个读不到一个「无效」并交换读的先后 | **未开始** | 责任：入口层提供者 ＋ 承载装配。`defectCount` 只计入口层自己记的缺陷（[S-26](v1/contract.md#s-26-完整体检)），场景只核这一层 |
| **V-8** [S-9](v1/contract.md#s-9-列表句柄)、[S-20](v1/contract.md#s-20-登录状态的两条路由撤销列出) 列表不给能直接用的东西；按 `LoginStateId` 撤销；备份里的值用不了 | 规范场景 [S-41](v1/contract.md#s-41-规范场景列表不给能直接用的东西)：列表那一半、撤销的幂等与查不到、备份那一半（含两个仍有效出示物的正对照） | **未开始** | 备份那一半在账号能力一侧另有 [AI S-46](../../capabilities/account-identity/v2/contract.md#s-46-存储里翻不出能用的出示物)；**本条从线上再验一次，不以那边的结果代替**；反过来，「三种形式都不出现在持久内容里」那一搜只归 AI S-46，本条的通过也不代替它。责任：入口层提供者 ＋ 承载装配（做备份） |
| **V-9** [S-12](v1/contract.md#s-12-身份推导)、[S-13](v1/contract.md#s-13-补授权) 身份推导与补授权 | 规范场景 [S-43](v1/contract.md#s-43-规范场景身份推导与补授权) | **未开始** | — |
| **V-10** [S-15](v1/contract.md#s-15-δ--0每个请求现读入口不跨请求缓存)、[S-16](v1/contract.md#s-16-不记住来访不区别对待来者) 只认登录状态；中心一侧 δ = 0 | 规范场景 [S-42](v1/contract.md#s-42-规范场景只认登录状态不认客户端)：撤销之后**立刻**再来 | **未开始** | 模型表达不了跨请求缓存，**只能靠这条** |
| **V-11** [S-27](v1/contract.md#s-27-governancecenterid-的形状与相等)、[S-28](v1/contract.md#s-28-铸造存放与不变) 中心标识 | 规范场景 [S-44](v1/contract.md#s-44-规范场景中心标识)，含「标识那一格启动时读不出来 ⇒ 起不来、不铸新的」与「有治理事实而无标识 ⇒ 起不来、不铸新的」 | **未开始** | 责任：入口层提供者。**读不到当作还没有**、**没有标识就当作从零开始**这两支必须真跑——它们最容易被一个「查不到就新建」抹掉 |
| **V-12** [S-24](v1/contract.md#s-24-有意不投影)、[S-25](v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由) 两张面没有第三张 | 规范场景 [S-45](v1/contract.md#s-45-规范场景两张面没有第三张) ＋ 静态检查 SC-1～SC-3 | **未开始** | — |
| **V-13** [S-4](v1/contract.md#s-4-请求信封) 重复成员、[S-14](v1/contract.md#s-14-失败映射) 缺陷清单、[S-19](v1/contract.md#s-19-免认人的两条路由注册登录)～[S-23](v1/contract.md#s-23-当前租户身份的两条路由) 路由表逐条映射 | 实现符合性测试：对 27 条路由的每一个可达失败值，观察线上答复等于路由表所写；含 `interrupted` 不改写、`identifier-held-by-expired-record` 不出现、空列表记缺陷、OG S-21／S-25 就调用方本人给出的 `accountNotActivated`／`accountDoesNotExist` 记缺陷、矛盾清单三项各记缺陷；撤销路由把 `loginStateHandle` 原样交给 AI S-16、不先读列表，已撤销的再撤一次得 `ok`、AI S-16 的 `not-authorized` 上线为 `login-state-rejected`、`invalid-input` 上线为 `invalid-input`；信封四个成员各重复一次，答复落在 S-4 那张表写的那一步。**成员名以本契约 Schema 为准**：每条路由的请求过 `Envelope`、成功答复连同 `operation` 过 `Exchange`，再逐条对照参与条款 ①／⑤ 的散文，确认 [S-17 命名表](v1/contract.md#路由的线上成员命名表)的每一格都指得到一项 | **未开始** | `credential`：核「凭据方案 owner 的解析规则判不过 ⇒ `invalid-input`，且那个值从不被交给领域」（注册、登录两条）；解析规则本身不在本契约里 |
| **V-14** [S-29](v1/contract.md#s-29-秘密不进任何输出)、[S-30](v1/contract.md#s-30-工程记录) 输出里搜不到秘密；工程记录边界 | 规范场景 [S-46](v1/contract.md#s-46-规范场景输出里搜不到秘密)：出示物按 AI S-46 的三种形式（原样、base64url 带／不带填充、十六进制大小写）逐一搜；另核工程记录只写入口层观察到的失败值，只有入口层自己的读（中心标识、`startedAt` 读钟、运维面现探）区分存储与钟 | **未开始** | Schema 挡得住完整体检里多出的成员（`FullHealthReply` 已封闭）；答复、公开体检之外的输出与工程记录里的秘密只能靠场景 |
| **V-15** [S-34](v1/contract.md#s-34-起来即整体停机时在途请求归谁) 起来即整体（两张面同起同停）；面缺席只在启动／停机／换代；启动以钟可读为条件；停机先停收、再等在途、再关闭 | 装配的启动与撤除测试：让任一参与方的面缺席，观察两张面都不应答；让存储或钟不可用，观察答复是 `unavailable` 而不是问不到；换代一个参与方的提供者，观察在途请求答完、新请求问不到、`defectCount` 不变；启动时让钟读不到，观察等到界内读到即起来、超界即起不来并点名是钟；停机时注入在途请求 | **未开始** | 责任：承载装配；「存储或钟不可用不表现为面缺席」由存储与时钟的提供者兑现 |
| **V-16** [S-8](v1/contract.md#s-8-协议版本与跨版本不变的两样) 跨版本不变的两样在传输上也稳定 | 两个协议版本的传输绑定工件逐项比对：`version-mismatch` 的识别方式与公开体检请求的发法相同 | **未开始**，受阻于 [G-10](v1/contract.md#十三已知缺口)（传输绑定还没有版本化工件） | 责任：入口层的实现映射节点 |

### 静态检查义务

| # | 检查什么 | 守的条款 | 状态 |
|---|---|---|---|
| SC-1 | 客户端一面的路由表**恰为** [S-17](v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读) 列出的 27 条加公开体检，没有泛化分派；入口层不引用 `capability.account-identity` v2 的 S-13／S-14／S-17／S-18／S-38（认人只走 S-44，线上来的 `LoginStateId` 不进 S-17）、`capability.organization-governance` v1 的 S-20／S-53、`composition.account-registration` v1 清除链的任何面 | [S-17](v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读)、[S-24](v1/contract.md#s-24-有意不投影)、[S-36](v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) | 未开始 |
| SC-2 | 运维面所在的单元不引用任何治理能力（账号、登录状态、组织、成员资格、邀约、清除、注册）的面；运维面上恰有完整体检一个操作；两张面不共用通道 | [S-25](v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由)、[S-36](v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) | 未开始 |
| SC-3 | 客户端一面没有读完整体检或写任何部署事实的路由；公开体检答复只由启动时载入的三样构造 | [S-18](v1/contract.md#s-18-公开体检)、[S-24](v1/contract.md#s-24-有意不投影) | 未开始 |

## 实际执行

**2026-09-23，起草者在工作树 `panqiwei/tenancy-leg-2` 上执行**，工作目录为 `design/`；本表是**改钉 `capability.account-identity` v2 之后**的重跑：这一轮模型文件只改了一行注释（「现读 AI S-17」改为「现读 AI S-44」并注明拿 `LoginStateId` 当出示物归 `neverIssued`），十个配置字节未变；因 `.tla` 的哈希变了，全部配置照样重跑，数字与上一轮逐项相同。此前各次的结果随哈希变更作废。原始输出未入库（见页首）。

| 配置 | 命令要点 | 结果 |
|---|---|---|
| [`EntryDecision.cfg`](v1/formal/EntryDecision.cfg)（formal task `governance-center-entry-v1-decision`） | 与 [formal-tasks 登记](../../../registry/README.md)的命令相同：`-workers 1 -cleanup -noGenerateSpecTE`，无 `-continue` | **退出 0，无反例**；初始 224 个状态；784 generated · 756 distinct · 0 left on queue · 深度 9；十五条不变量（含 `TypeOK`）逐状态检查；时序性质 `EventuallyAnswered` 在 756 个状态上检查完 |
| [`Validity_Reachability.cfg`](v1/formal/Validity_Reachability.cfg)（否定配置，不登记） | 加 `-continue` | 退出 0（`-continue` 下 TLC 不以违反为失败退出）；**九条全部被违反**：`NeverVersionMismatch` 96、`NeverInvalidInput` 70、`NeverHealth` 64、`NeverUnavailable` 34、`NeverRejected` 28、`NeverDefect` 16、`NeverResult` 12、`NeverGatePassed` 8、`NeverLateRevocation` 4（违反状态数）；状态空间与正配置相同 |
| [`Validity_passthroughStateNotValid.cfg`](v1/formal/Validity_passthroughStateNotValid.cfg) | 无 `-continue`；另以 `-continue` 跑一次 | 退出 12，`LateRevocationUniform` 被违反；`-continue` 下只有它（2 次） |
| [`Validity_unavailableAsRejected.cfg`](v1/formal/Validity_unavailableAsRejected.cfg) | 同上 | 退出 12，`CannotJudgeIsUnavailable` 被违反；`-continue` 下只有它（20 次） |
| [`Validity_readPresentationBeforeVersion.cfg`](v1/formal/Validity_readPresentationBeforeVersion.cfg) | 同上 | 退出 12，`VersionFirst` 被违反；`-continue` 下 `VersionFirst` 64 次、`EnvelopeBeforeAuth` 64 次 |
| [`Validity_inputBeforeAuth.cfg`](v1/formal/Validity_inputBeforeAuth.cfg) | 同上 | 退出 12，`RejectionUniform` 被违反；`-continue` 下 `RejectionUniform` 12 次、`InputAfterAuth` 4 次 |
| [`Validity_gateUnavailableAsDenied.cfg`](v1/formal/Validity_gateUnavailableAsDenied.cfg) | 同上 | 退出 12，`CannotJudgeIsUnavailable` 被违反；`-continue` 下只有它（2 次） |
| [`Validity_defectAsResult.cfg`](v1/formal/Validity_defectAsResult.cfg) | 同上 | 退出 12，`DefectIsUnavailable` 被违反；`-continue` 下只有它（16 次） |
| [`Validity_authBeforeEnvelope.cfg`](v1/formal/Validity_authBeforeEnvelope.cfg)（评审第一轮修订新增） | 同上 | 退出 12，`EnvelopeBeforeAuth` 被违反；`-continue` 下只有它（64 次） |
| [`Validity_deriveBeforePayload.cfg`](v1/formal/Validity_deriveBeforePayload.cfg)（评审第一轮修订新增） | 同上 | 退出 12，`PayloadBeforeDerive` 被违反；`-continue` 下只有它（22 次） |
| 同一 formal task，经设计检查器执行 | `make design-check FORMAL=run`（即 `check_design.py --root .meta_harness/design --formal run`，在工作树根） | `FORMAL governance-center-entry-v1-decision: executed; exit=0`（同次另执行了已登记的四个任务，均 exit 0）。**那一次检查器整体是 `FAIL`，3 条错误全在本包之外**：`realization/packages/infra/storage-sql/design.md` 指向 `../clock/design.md#迁移前的只读回拨核对` 的锚点不存在——那两份节点当时正由别的修订在途改动。那边改完之后，本包最终改动之后再跑 `make design-check`（`formal=registered`，不重跑 TLC；`.tla` 与配置在 TLC 那次之后没有再改）：`PASS: design tree … passed gate=internal; formal=registered.`；`make docs-check`：`PASS: 801 Markdown files; local links and skill mirrors.` |
| [examples.md](v1/examples.md) 对 [Schema](v1/governance-center-entry.schema.json) 自检 | jsonschema 4.26.0 ＋ referencing 0.37.0，Draft 2020-12，注册表含本 Schema、`data.identity-values` v1 与 `data.offer-expiry` v1 的 Schema | 首稿 70 条；主线裁决修订后 84 条；线上形状定稿后 221 条；评审第一轮修订后 245 条；**改钉账号能力 v2 后 255 条、0 条不符**（`LoginStateHandle` 一节换成出示物 `LoginStatePresentation` 一节，含空串、首尾空白、尾随换行、前导 U+FEFF、孤立代理码点五个反例与一个成对代理的正例；1024 的上界另以 1024／1025 个码点各一次手工探测，结果为通过／拒绝，未写进样例表；信封加「AI S-44 不是路由」「v1 的路由标识不在表里」两例；句柄改按 `LoginStateId` 校验）；AI v2 评审修订之后的牵连核对再跑一次，仍是 255 条、0 条不符；每次 `check_schema` 都通过 |

**工具与环境**：TLC2 Version 2026.09.12.025210（rev 867aefb），OpenJDK Temurin 21.0.12.1，1 worker，Linux 5.15 amd64。

**被检查文件的 SHA-256**（结果只绑定这些修订）：

| 文件 | SHA-256 |
|---|---|
| `v1/formal/EntryDecision.tla` | `f280e3ff2ed471d0c517099b94b857cbbe9dbcf7f37427bb6df3fc1117a3d777` |
| `v1/formal/EntryDecision.cfg` | `12cd556423baedc91761f932ee2e686a1fb4bbf1cb1278d78de1d9c4e0cd4e26` |
| `v1/formal/Validity_Reachability.cfg` | `9949177bb351b7c7ada65ed7b1686de145a15f65085903e350829ace1acccdc8` |
| `v1/formal/Validity_passthroughStateNotValid.cfg` | `3701c37d37fd09db78ae46660fd225669f75e610e6a17f91c4faefdf573e9af4` |
| `v1/formal/Validity_unavailableAsRejected.cfg` | `e50939eb0ce697cc8591f3cbe7c7bece61c9f073b6b750c4ea4272483fda8a88` |
| `v1/formal/Validity_readPresentationBeforeVersion.cfg` | `2029dbcf6d0dc12e610e7daff161f884698e34c1f890f7736bea6511edc3ca5d` |
| `v1/formal/Validity_inputBeforeAuth.cfg` | `45ba38425a16981c50b027f9823ac32991a92fdf0e6f0b6827e4090ea83f7315` |
| `v1/formal/Validity_gateUnavailableAsDenied.cfg` | `60b7d27b324765a917985b2148b97dadd87fb2d1742ef6a154f1abf6bd0704dc` |
| `v1/formal/Validity_defectAsResult.cfg` | `d6fa442ff09cba54fdf367e7a1fefef94c60983e417297df9a04fef6fdde19bf` |
| `v1/formal/Validity_authBeforeEnvelope.cfg` | `d1580671536a87d03bb7d943be14c9c0fadaccf9774ee696a3c7762b1917e28b` |
| `v1/formal/Validity_deriveBeforePayload.cfg` | `97be78b86fc6a3855c63da980a9466a460f8606852bf3f1e35188cb00641ca91` |

**重现**：在 `design/` 下导出 `JAVA_BIN` 与 `TLA2TOOLS_JAR`，正配置用登记的命令；否定配置把 `-config` 换成对应文件，可达性那一个另加 `-continue`。

## 结果与反例

- 正配置：**没有反例**。范围是模型抽象之内、一次行为一个请求；不外推到多请求交错、传输落地或真实存储。
- 否定配置：反例都是**预期的**，它们证明对应断言有内容，不是缺陷。
- 必须分开陈述的三类结果：**模型检查**（上表）、**样例自检**（上表末行）、**真实组合的符合性**（一条都没有）。前两类通过不说明第三类。

## 变化的影响

| 时间 | 变化 | 对证据的影响 |
|---|---|---|
| 2026-09-23 | 首稿：v1 候选包成稿，登记 catalog、covers、formal-tasks | 上表为首次执行。此后模型或任一配置改动，按哈希判断上表是否仍适用，不适用的整行作废重跑 |
| 2026-09-23 | 按主线裁决原地修订（未冻结）：表示名与交换表示定稿（原 G-5 闭合），载荷与返回的成员名改为规则（沿参与方契约的 Schema，入口不改名），登录成功返回 `{ loginState, loginStateHandle }`、列表项 `{ loginStateHandle, issuedAt }` 进 Schema；完整体检加 `defectCount` 并封闭成员集合（原 G-6 闭合）；缺口重编号 G-7→G-5、G-8→G-6 | **形式模型与七个配置字节未变，上表 TLC 结果仍适用**（哈希不变）。Schema 与样例变了：自检已重跑，结果见「实际执行」末行 |
| 2026-09-23 | 按主线裁决原地修订（未冻结）：线上载荷与成功返回的形状归本契约——S-17 加命名表（27 行）与三类「推导／推不出」说明；Schema 新增 67 个定义（每条路由 `Payload_<路由>`／`Result_<路由>`、五个共用形状、七个值定义、`Exchange`），`Envelope.payload` 按 `operation` 判别；`data.offer-expiry` v1 登为依赖（S-4、S-7、S-14）；新开 G-7（命名表待主线认可） | **形式模型与七个配置字节未变，TLC 结果仍适用**：模型把路由结果收成一个 `result`，不涉成员名。样例自检已重跑（221 条）。V-13 改为以本契约 Schema 为准逐条对照参与条款散文 |
| 2026-09-23 | 主线通读并认可 S-17 命名表（当时编为 G-7 并删行，缺口回到 G-1～G-6）；`offerTtl`「不是整数」答 `invalid-input` 的说明改为定稿措辞 | Schema、examples、模型与配置均未改动，V-4 与 TLC 结果仍适用 |
| 2026-09-23 | **按 spec-reviewer 第一轮评审的主线裁决原地修订（未冻结）**：`credential` 线上为非空字符串、表示层用凭据方案 owner 的解析规则（登 AI S-26）；缩写与全部跨契约引用改为坐标或链接，路由表用「认人所得 `AccountId`」「推导所得 `TenantId`」；S-34 起来即整体覆盖两张面、面缺席只在启动／停机／换代、存储与钟不可用只表现为返回值、启动以钟可读为条件；S-8 两样在传输上也跨版本稳定；补授权 `invalidInput` ⇒ 缺陷、多个组织全部读完不短路；S-14 按「交给领域的输入里有没有来自载荷的项」分支、矛盾清单封闭为四项、OG S-21／S-25 调用方本人的两个值记缺陷；`defectCount` 收窄为入口层自记；S-28 只在治理事实为空时铸造；S-30 工程记录只写入口层观察到的失败值；S-4 四个成员重复各归一步；S-9 句柄跨重启与换密钥稳定；S-36 残余暴露、OE S-17 第 4 行单列、出示物不可伪造改写为前提；各路由表补第 9 件事一列；正文补齐 covers 对应的产品小节链接。**缺口编号按 id-namespaces 规矩恢复**：G-5、G-6 标已闭合；原「效力不变」回到 G-7、「多进程」回到 G-8；上一行误编为 G-7 的命名表改为 G-9（已闭合）；新开 G-10 传输绑定、G-11 防冒充。Schema：`CredentialMaterial` 非空字符串、`OfferTtl` 上界 2⁵³−1、三个不透明标识自定值定义（不再 `$ref` IV 内部基定义）、`issuedAt`／`startedAt` 改引 OE `Instant`、`GovernanceCenterId` 标题改 Identifier；catalog 登 AI S-26、OE S-17 与 S-22 | **模型与全部配置已改**：新增 `EnvelopeBeforeAuth`、`PayloadBeforeDerive` 两条断言与 `authBeforeEnvelope`、`deriveBeforePayload` 两个变异；`Derive`／`Gate` 加缺陷分支；可达性核对加 `NeverDefect`；八个变异配置都带 `PROPERTIES EventuallyAnswered`。**此前的 TLC 结果全部作废**，「实际执行」一节是重跑结果，哈希随之更新。样例自检重跑（245 条）。V-1、V-2、V-3、V-4、V-7、V-11、V-13、V-14、V-15 改写，新增 V-16 |
| 2026-09-23 | **按主线指令改钉 `capability.account-identity` v2 原地修订（未冻结）**：依赖由 v1 改为 v2（`candidate`），S-2 消费面加 S-44、S-45（S-17 保留，作 S-44 判定的来源，本组合不调用它）；S-5 出示物改为 AI S-45 的登录状态出示物，交换表示**直接取 AI S-45 的「交换表示」一行**（Unicode 标量值序列、非空、至多 1024 个标量值、首末不在 IV S-31 空白码点表里），INT-011 链接；S-9 列表句柄就是 `LoginStateId`，入口层不再派生句柄，「跨重启换密钥稳定」改由 AI S-45 派生式保证；S-11 认人改调 AI S-44，六种不认情形不变，拿 `LoginStateId` 当出示物归「查不到」；S-12 新增「认人所得 `LoginStateId`」，OG S-36／S-37、AI S-16／S-37 用它；S-14 矛盾清单由四项减为三项（「按句柄匹配到不止一项」随句柄派生一并消失）；S-20 撤销把载荷里的 `LoginStateId` 原样交给 AI S-16、一次调用，已撤销的再撤一次得 `ok`，AI S-16 的 `invalid-input` 上线为 `invalid-input`；S-31 前提与 S-36 改写：「出示物不可伪造」改为「出示物猜不中」（安全性在出示物的熵上，由 AI 兑现），新增「只有 AI S-44 认出示物」「出示物只交到调用方手里」两行，第 2 行加 INT-012 链接；S-10、S-13 加 INT-013、INT-014 链接；S-41 覆盖备份那一半并加正对照；**G-1 闭合**（号保留）；S-2 消费者一栏改为节点与 tenancy-host 的现状。**派生后果**：账号能力三条路由的标识随被投影条款坐标变为 `capability.account-identity/v2#S-15`／`#S-16`／`#S-37`（线上可见）。Schema：删 `LoginStateHandle`，新增 `LoginStatePresentation`（`minLength` 1、`maxLength` 1024、`not.pattern` 排除孤立代理码点、首末空白 pattern 与 IV S-31 同一张表），`presentedLoginState` 与 `LoginResult.loginState` 引用它，三处 `loginStateHandle` 改引 IV `LoginStateId`，`EnvelopeRouteId` 与两处按路由判别的 `if` 改为 v2 坐标。catalog：对 AI 的依赖改钉 v2，clauses 加 S-44、S-45；covers：PF-017 §8 与 acceptance §三两条的 note 去掉「本版不满足」 | **模型只改注释**（`PresKinds` 上一行「现读 AI S-17」→「现读 AI S-44」，并注明拿 `LoginStateId` 当出示物与 `neverIssued` 同一答复）：七种出示物情形与 AI S-44 的三个出口一一对应，出示物的形状、句柄与路由标识本来就不在模型里，**不需要改断言或配置**；因 `.tla` 哈希变了，正配置、可达性核对与八个变异全部重跑，数字与上一轮逐项相同（见「实际执行」）。样例自检重跑（255 条、0 条不符）。V-8、V-13、SC-1 改写；V-4 条数更新 |
| 2026-09-23 | **AI v2 评审修订（5041f4e）之后的牵连核对（未冻结）**：S-36「只有 AI S-44 认出示物」行左列按 AI S-30 第 10 行改为「用来认人的那个 `LoginStateId`（S-17 输入、S-16 发起方、S-37 调用方）来自 AI 自己的结果，S-16 的目标不在此列」，右列补「OG S-36／S-37 的那个也是认人所得」；「出示物猜不中」行与 S-31 写明是 AI 的**提供者义务**；S-2 的 AI S-16／S-37 两处消费说明补来源规则（目标可来自线上、发起方与调用方按来源读）；S-20 撤销一行引 AI S-16「目标可以来自线上载荷」；S-9 交换表示一行写明句柄的表示层只用 IV S-31、不收紧到 64 个十六进制字符（AI S-45）；S-5 删去「那一行变了本条跟着变」，保留「上界 1024 是 AI S-45 的候选值，随它的接受一起定」；S-36 第 2 行残余暴露的理由改写——「`AccountId` 猜不出、枚举不了」是前提，归 AI G-2 的 `AccountId` 那一半（该半已退回为开放）；S-41 写明与 AI S-46 的分工；S-46 出示物按 AI S-46 的三种形式搜 | **Schema、样例、模型与全部配置未改**：S-45 交换表示与本包 `LoginStatePresentation` 逐项一致（标量值序列、非空、≤1024、首末空白），不需要改；TLC 结果与哈希仍适用。样例自检重跑确认（见「实际执行」）。V-8、V-14 改写 |
