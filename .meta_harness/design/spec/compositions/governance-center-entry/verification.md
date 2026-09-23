# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：候选；形式模型与否定核对在起草时跑过一次，规范场景与静态检查一条都没开始。**
> `composition.governance-center-entry` v1 是 `candidate`，主责产品依据 PF-017 rev 1 仍是 `draft`。
> 入口层没有提供者设计、没有源码、没有装配，所以一切要真实组合的证据都「未开始」。
> 形式模型的原始输出**没有入库**：`record/` 不在起草者的可写范围内，下面给出重现命令与文件哈希，入库由主线决定。

## 证据义务

| 规范条款与性质 | 证据形式与抽象映射 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| **V-1** 判定次序 × 四种入口答复 × 「判不了优先于无效」：[S-6](v1/contract.md#s-6-四种入口答复)、[S-7](v1/contract.md#s-7-答复集合闭合)、[S-8](v1/contract.md#s-8-协议版本与跨版本不变的两样)、[S-10](v1/contract.md#s-10-判定次序)、[S-11](v1/contract.md#s-11-认人)、[S-13](v1/contract.md#s-13-补授权)、[S-14](v1/contract.md#s-14-失败映射)、[S-18](v1/contract.md#s-18-公开体检)、[S-19](v1/contract.md#s-19-免认人的两条路由注册登录)、[S-33](v1/contract.md#s-33-认出人之后登录状态被撤销) | TLC：[`EntryDecision.cfg`](v1/formal/EntryDecision.cfg) 的十二条不变量；映射见 [formal/README](v1/formal/README.md#本版本选用什么) | **已执行**（[下表](#实际执行)）：无反例，完整穷尽 | 范围：一次行为一个请求、模型抽象之内。**逐字节相同不在模型里**（V-5）；**哪个身份值、哪个组织**不在模型里（V-9、V-13） |
| **V-2** [S-10](v1/contract.md#s-10-判定次序) 的进展、[S-32](v1/contract.md#s-32-进展性质与前提) 的「这一次就得到答复」 | TLC：`EventuallyAnswered`，前提 `WF_vars(Pipeline)`（中心在运行）、环境不受公平性约束 | **已执行**：时序性质在 752 个状态上检查完，无反例 | 前提 P1～P4 在真实系统里由运维者兑现，不是被证明的事实 |
| **V-3** 模型断言不平凡 | 有效性核对 [`Validity_Reachability.cfg`](v1/formal/Validity_Reachability.cfg) ＋ 六个变异配置 | **已执行**：八条「从不」全部被违反；六个变异各得预期反例 | **六条断言没有专门变异**：`AnsweredClosed`、`HealthUnconditional`、`ExemptIgnoresPresentation`、`ExemptInputWithoutLookup`、`RejectionOnlyWhenJudged`、`NoDomainWithoutGates`。它们的前件可达，但没有证明它们会失败。责任：本契约的下一轮修订 |
| **V-4** Schema 与样例一致 | 逐节把 [examples.md](v1/examples.md) 的第一列喂给 `$defs`，与第二列比对 | **已执行**：221 条实例，0 条不符；27 条路由的载荷与成功返回各至少一条通过、一条拒绝 | `format: date-time` 按校验器默认只作注解，本 Schema 内联的 `startedAt` 与 `issuedAt` 的时间点形状没有被断言（`data.offer-expiry` 的 `Instant` 另有 pattern，断言得到） |
| **V-5** [S-6](v1/contract.md#s-6-四种入口答复)、[S-11](v1/contract.md#s-11-认人) 整个线上答复逐字节相同 | 规范场景 [S-39](v1/contract.md#s-39-规范场景拒绝逐字相同)：六种不认情形 ＋ 撤销落在认人与办事之间，比较传输层状态、头与体 | **未开始。**需要入口层提供者与一个具体的传输落地 | 受阻消费者：据点一侧的客户端代理。**TLC 的「同一个答复值」不能替代这一条** |
| **V-6** [S-10](v1/contract.md#s-10-判定次序) 答复的先后（真实组合） | 规范场景 [S-38](v1/contract.md#s-38-规范场景答复的先后) | **未开始** | 同上 |
| **V-7** [S-6](v1/contract.md#s-6-四种入口答复)、[S-14](v1/contract.md#s-14-失败映射) 三个出口不合并；缺陷在完整体检里可见 | 规范场景 [S-40](v1/contract.md#s-40-规范场景三个出口不合并)：故障注入让存储读不到、让领域给出集合外的值 | **未开始** | 责任：入口层提供者 ＋ 承载装配 |
| **V-8** [S-9](v1/contract.md#s-9-列表句柄)、[S-20](v1/contract.md#s-20-登录状态的两条路由撤销列出) 列表不给能直接用的东西；句柄撤销 | 规范场景 [S-41](v1/contract.md#s-41-规范场景列表不给能直接用的东西) | **未开始** | 备份那一半本版不满足（[G-1](v1/contract.md#十三已知缺口)），**不写场景去「验证」它** |
| **V-9** [S-12](v1/contract.md#s-12-身份推导)、[S-13](v1/contract.md#s-13-补授权) 身份推导与补授权 | 规范场景 [S-43](v1/contract.md#s-43-规范场景身份推导与补授权) | **未开始** | — |
| **V-10** [S-15](v1/contract.md#s-15-δ--0每个请求现读入口不跨请求缓存)、[S-16](v1/contract.md#s-16-不记住来访不区别对待来者) 只认登录状态；中心一侧 δ = 0 | 规范场景 [S-42](v1/contract.md#s-42-规范场景只认登录状态不认客户端)：撤销之后**立刻**再来 | **未开始** | 模型表达不了跨请求缓存，**只能靠这条** |
| **V-11** [S-27](v1/contract.md#s-27-governancecenterid-的形状与相等)、[S-28](v1/contract.md#s-28-铸造存放与不变) 中心标识 | 规范场景 [S-44](v1/contract.md#s-44-规范场景中心标识)，含「标识那一格启动时读不出来 ⇒ 起不来、不铸新的」 | **未开始** | 责任：入口层提供者。**读不到当作还没有**这一支必须真跑——它最容易被一个「查不到就新建」抹掉 |
| **V-12** [S-24](v1/contract.md#s-24-有意不投影)、[S-25](v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由) 两张面没有第三张 | 规范场景 [S-45](v1/contract.md#s-45-规范场景两张面没有第三张) ＋ 静态检查 SC-1～SC-3 | **未开始** | — |
| **V-13** [S-19](v1/contract.md#s-19-免认人的两条路由注册登录)～[S-23](v1/contract.md#s-23-当前租户身份的两条路由) 路由表逐条映射 | 实现符合性测试：对 27 条路由的每一个可达失败值，观察线上答复等于路由表所写；含 `interrupted` 不改写、`identifier-held-by-expired-record` 不出现、空列表记缺陷。**成员名以本契约 Schema 为准**：每条路由的请求过 `Envelope`、成功答复连同 `operation` 过 `Exchange`，再逐条对照参与条款 ①／⑤ 的散文，确认 [S-17 命名表](v1/contract.md#路由的线上成员命名表)的每一格都指得到一项 | **未开始** | 命名表待主线认可（[G-7](v1/contract.md#十三已知缺口)）；`credential` 的形状推不出，这一格只能核「原样交给账号能力」 |
| **V-14** [S-29](v1/contract.md#s-29-秘密不进任何输出)、[S-30](v1/contract.md#s-30-工程记录) 输出里搜不到秘密；工程记录边界 | 规范场景 [S-46](v1/contract.md#s-46-规范场景输出里搜不到秘密) | **未开始** | Schema 挡得住完整体检里多出的成员（`FullHealthReply` 已封闭）；答复、公开体检之外的输出与工程记录里的秘密只能靠场景 |
| **V-15** [S-34](v1/contract.md#s-34-起来即整体停机时在途请求归谁) 起来即整体；停机先停收、再等在途、再关闭 | 装配的启动与撤除测试：让任一参与方的面缺席，观察客户端一面不应答；停机时注入在途请求 | **未开始** | 责任：承载装配 |

### 静态检查义务

| # | 检查什么 | 守的条款 | 状态 |
|---|---|---|---|
| SC-1 | 客户端一面的路由表**恰为** [S-17](v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读) 列出的 27 条加公开体检，没有泛化分派；入口层不引用 `capability.account-identity` v1 的 S-13／S-14／S-18／S-38、`capability.organization-governance` v1 的 S-20／S-53、`composition.account-registration` v1 清除链的任何面 | [S-17](v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读)、[S-24](v1/contract.md#s-24-有意不投影)、[S-36](v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) | 未开始 |
| SC-2 | 运维面所在的单元不引用任何治理能力（账号、登录状态、组织、成员资格、邀约、清除、注册）的面；运维面上恰有完整体检一个操作；两张面不共用通道 | [S-25](v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由)、[S-36](v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) | 未开始 |
| SC-3 | 客户端一面没有读完整体检或写任何部署事实的路由；公开体检答复只由启动时载入的三样构造 | [S-18](v1/contract.md#s-18-公开体检)、[S-24](v1/contract.md#s-24-有意不投影) | 未开始 |

## 实际执行

**2026-09-23，起草者在工作树 `panqiwei/tenancy-leg-2` 上执行**，工作目录为 `design/`。原始输出未入库（见页首）。

| 配置 | 命令要点 | 结果 |
|---|---|---|
| [`EntryDecision.cfg`](v1/formal/EntryDecision.cfg)（formal task `governance-center-entry-v1-decision`） | 与 [formal-tasks 登记](../../../registry/README.md)的命令相同：`-workers 1 -cleanup -noGenerateSpecTE`，无 `-continue` | **退出 0，无反例**；初始 224 个状态；778 generated · 752 distinct · 0 left on queue · 深度 9；时序性质 `EventuallyAnswered` 在 752 个状态上检查完 |
| [`Validity_Reachability.cfg`](v1/formal/Validity_Reachability.cfg)（否定配置，不登记） | 加 `-continue` | 退出 0（`-continue` 下 TLC 不以违反为失败退出）；**八条全部被违反**：`NeverVersionMismatch` 96、`NeverInvalidInput` 70、`NeverHealth` 64、`NeverUnavailable` 44、`NeverRejected` 28、`NeverResult` 12、`NeverGatePassed` 10、`NeverLateRevocation` 4（违反状态数）；状态空间与正配置相同 |
| `Validity_passthroughStateNotValid.cfg` | 无 `-continue` | 退出 12，`LateRevocationUniform` 被违反 |
| `Validity_unavailableAsRejected.cfg` | 同上 | 退出 12，`CannotJudgeIsUnavailable` 被违反 |
| `Validity_readPresentationBeforeVersion.cfg` | 同上 | 退出 12，`VersionFirst` 被违反 |
| `Validity_inputBeforeAuth.cfg` | 同上；另以 `-continue` 跑一次 | 退出 12，`RejectionUniform` 被违反；`-continue` 下 `RejectionUniform` 12 次、`InputAfterAuth` 4 次 |
| `Validity_gateUnavailableAsDenied.cfg` | 同上 | 退出 12，`CannotJudgeIsUnavailable` 被违反 |
| `Validity_defectAsResult.cfg` | 同上 | 退出 12，`DefectIsUnavailable` 被违反 |
| 同一 formal task，经设计检查器执行 | `check_design.py --root .meta_harness/design --formal run`（在工作树根） | `FORMAL governance-center-entry-v1-decision: executed; exit=0`；检查器整体 `PASS`（同次另执行了已登记的四个任务，均 exit 0） |
| [examples.md](v1/examples.md) 对 [Schema](v1/governance-center-entry.schema.json) 自检 | jsonschema 4.26.0 ＋ referencing 0.37.0，Draft 2020-12，注册表含本 Schema 与 `data.identity-values` v1 的 Schema | 首稿 70 条、0 条不符；按主线裁决修订后重跑（同日）84 条、0 条不符；线上形状定稿后再跑（同日，注册表加入 `data.offer-expiry` v1 的 Schema）221 条、0 条不符；三次 `check_schema` 都通过 |

**工具与环境**：TLC2 Version 2026.09.12.025210（rev 867aefb），OpenJDK Temurin 21.0.12.1，1 worker，Linux 5.15 amd64。

**被检查文件的 SHA-256**（结果只绑定这些修订）：

| 文件 | SHA-256 |
|---|---|
| `v1/formal/EntryDecision.tla` | `43af758cd240b5aa51c7d47df4707a07cc990038ca986125dd7c3a2bafa68df5` |
| `v1/formal/EntryDecision.cfg` | `08a3f7f7a248f3bb50d2c6fa709758e72d1eb5e5ec7f35759e8c059c6213c5ae` |
| `v1/formal/Validity_Reachability.cfg` | `81ce4c35204089811313bb5efd9dce61326431354fcf49833692f07c12db61f5` |
| `v1/formal/Validity_passthroughStateNotValid.cfg` | `580f499c01b572e4648eb18ead1beaafa93b8f7627136c62d947c1b00dd6b91d` |
| `v1/formal/Validity_unavailableAsRejected.cfg` | `46eafe6cbe1546f18ee1d0464703b58974df307db2d11a8d83d78b38a1c29326` |
| `v1/formal/Validity_readPresentationBeforeVersion.cfg` | `e1bde2b587836915f7dc39dbe6db891e549f38d690e65820e628430431bf0602` |
| `v1/formal/Validity_inputBeforeAuth.cfg` | `4d909b2057ca3a3bab6f3e9b642032c556d2a0f5ff97f2f372e401f8972eed94` |
| `v1/formal/Validity_gateUnavailableAsDenied.cfg` | `7d57aa10bb12e9c33f618097796e8ca8c88d2f4bd46f423cc9f4cb993d28f47a` |
| `v1/formal/Validity_defectAsResult.cfg` | `ae9adc2064adf996f59ea8ce01328cf69864fd0b4831a830e555cd6448fc8a1b` |

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
