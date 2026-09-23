# 形式工件与论证映射

`composition.governance-center-entry` v1（候选）选用的形式工件：一个 TLA+ 行为模型，检查**判定次序 × 四种入口答复 × 「判不了优先于无效」**。
为什么触发、为什么不选 Alloy，见[契约 S-37](../contract.md#s-37-本版选用的形式工件)。执行记录在版本外的[验证入口](../../verification.md#实际执行)，本页不填通过状态。

## 本版本选用什么

| 规范性质／条款 | 表达 | 模型里的定义 | 未覆盖范围与相应义务 |
|---|---|---|---|
| [S-7](../contract.md#s-7-答复集合闭合) 答复集合闭合 | TLA+ 不变量 ＋ JSON Schema | `DefectIsUnavailable`（失败集合之外的东西一律收成 `unavailable`，不成为第四类答复）；Schema `EntryAnswer`、`RouteFailureName`、`RouteSuccess` | 模型把全部路由结果收成一个 `result`；具名值的枚举闭合归 Schema 与[样例](../examples.md)。`AnsweredClosed`（答了就恰是六类之一）由 `TypeOK` 的两个合取项直接推出，**不单独绑定本条** |
| [S-8](../contract.md#s-8-协议版本与跨版本不变的两样)、[S-10](../contract.md#s-10-判定次序) ① 版本先于一切 | TLA+ 不变量 | `VersionFirst` | 「跨版本不变的两样」是表示承诺，不在模型里 |
| [S-10](../contract.md#s-10-判定次序) ①′ 信封先于 ② 认人 | TLA+ 不变量 | `EnvelopeBeforeAuth` | 信封里哪一个成员不合格、重复成员落到哪一步（[S-4](../contract.md#s-4-请求信封)）不在模型里：模型只有「信封合不合格」一个布尔 |
| [S-10](../contract.md#s-10-判定次序) 载荷先于身份推导与补授权 | TLA+ 不变量 | `PayloadBeforeDerive` | — |
| [S-18](../contract.md#s-18-公开体检) 公开体检不受挡 | TLA+ 不变量 | `HealthUnconditional` | 三样的内容与来源（启动时载入）不在模型里；规范场景 [S-44](../contract.md#s-44-规范场景中心标识) |
| [S-19](../contract.md#s-19-免认人的两条路由注册登录) 免认人路由不看出示物、载荷不用查就判 | TLA+ 不变量 | `ExemptIgnoresPresentation`、`ExemptInputWithoutLookup` | 注册的四个终结结果原样呈现，模型收成 `result`；归实现符合性测试 |
| [S-10](../contract.md#s-10-判定次序)、[S-11](../contract.md#s-11-认人) 判不了优先于无效 | TLA+ 不变量 | `CannotJudgeIsUnavailable`、`RejectionOnlyWhenJudged` | — |
| [S-11](../contract.md#s-11-认人) 六种不认情形同一个答复 | TLA+ 不变量 | `RejectionUniform` | **只检查到「同一个答复值」**。「整个线上答复逐字节相同」是表示承诺，被「一个答复就是一个值」这种建模方式吸收了，**不算由模型覆盖**；证据在规范场景 [S-39](../contract.md#s-39-规范场景拒绝逐字相同) |
| [S-33](../contract.md#s-33-认出人之后登录状态被撤销)、[S-14](../contract.md#s-14-失败映射) 认人之后才读到撤销 | TLA+ 不变量 | `LateRevocationUniform` | 同上一行，只到值 |
| [S-10](../contract.md#s-10-判定次序) 先认人后看输入 | TLA+ 不变量 | `InputAfterAuth` | — |
| [S-10](../contract.md#s-10-判定次序)、[S-13](../contract.md#s-13-补授权) 领域调用前各关都过 | TLA+ 不变量 | `NoDomainWithoutGates` | 补授权判的是**哪个组织**、每条路由推的是**哪个身份值**不在模型里；归实现符合性测试与规范场景 [S-43](../contract.md#s-43-规范场景身份推导与补授权) |
| [S-13](../contract.md#s-13-补授权) 补授权读不到不收成 `notAuthorized` | TLA+ 不变量 | `CannotJudgeIsUnavailable`（`Gate` 的读不到分支） | **多个组织「全部读完、不短路」不在模型里**：模型的 `Gate` 是一次读、结果由环境任选，表达不了「先读到 `ineffective` 就停」这种改坏——它不会留下一个读不到的痕迹让断言去抓。证据在规范场景 [S-40](../contract.md#s-40-规范场景三个出口不合并) 的第三句 |
| [S-12](../contract.md#s-12-身份推导)、[S-13](../contract.md#s-13-补授权)、[S-14](../contract.md#s-14-失败映射) 缺陷一律 `unavailable` | TLA+ 不变量 | `DefectIsUnavailable`（`Derive`、`Gate`、`Dispatch` 各有一个缺陷分支） | 缺陷是**哪一种**（集合之外、结构上到不了、矛盾清单四项）被收成一个分支；「缺陷计入 `defectCount`」不在模型里；规范场景 [S-40](../contract.md#s-40-规范场景三个出口不合并) |
| [S-10](../contract.md#s-10-判定次序) 的进展、[S-32](../contract.md#s-32-进展性质与前提) 的「这一次就得到答复」 | TLA+ 时序性质 | `EventuallyAnswered` | 前提见下；前提不成立时来者看到什么，模型不覆盖（那是 P1 不成立：问不到） |

**不在本模型里、也不假装被它覆盖的**：

- **中心一侧 δ = 0**（[S-15](../contract.md#s-15-δ--0每个请求现读入口不跨请求缓存)）。模型一次行为只有一个请求，「跨请求缓存」在其中无从表达；证据在规范场景 [S-42](../contract.md#s-42-规范场景只认登录状态不认客户端)。
- **路由表封闭、运维面没有治理路由**（[S-17](../contract.md#s-17-路由表封闭每条路由的九件事从哪读)、[S-24](../contract.md#s-24-有意不投影)、[S-25](../contract.md#s-25-运维面只在中心所在的机器上且没有治理路由)）。这是代码结构的事实，由静态检查守（[SC-1～SC-3](../../verification.md#静态检查义务)）。
- **列表句柄、中心标识、秘密不进输出、工程记录边界**（[S-9](../contract.md#s-9-列表句柄)、[S-27](../contract.md#s-27-governancecenterid-的形状与相等)～[S-30](../contract.md#s-30-工程记录)）。归 Schema、规范场景与实现符合性测试。
- **起来即整体、两张面同起同停、面缺席只在启动／停机／换代、启动以钟可读为条件、停机次序**（[S-34](../contract.md#s-34-起来即整体停机时在途请求归谁)）。归承载装配的启动与撤除测试。
- **多个请求之间的交错**。本组合的并发只有一种与判定相关：认人之后、办事之前的一次撤销（`Revoke`），已建模；其余交错由各领域契约自己的提交保证处理。

## TLA+ 与 TLC

- **模型文件**：[`EntryDecision.tla`](EntryDecision.tla)。
- **语义映射**：
  - 一个行为 = 一个请求从到达走到答复。请求的形状——路由类别（`publicHealth`／`exempt`／`auth`／`authGated`）、版本对不对得上、信封合不合格、出示物的七种情形、载荷合不合格——在初始状态里任取。
  - 七种出示物情形：`absent`、`multiple`、`malformed` 三种不用查（`LookupFree`）；`valid`、`revoked`、`neverIssued`、`otherCenter` 要现读 AI S-17。
  - `CheckVersion` ＝ [S-10](../contract.md#s-10-判定次序) ①；`CheckEnvelope` ＝ ①′；`Authenticate` ＝ ②（[S-11](../contract.md#s-11-认人)）；`CheckPayload` ＝ 载荷；`Derive` ＝ 身份推导（[S-12](../contract.md#s-12-身份推导)）；`Gate` ＝ 补授权（[S-13](../contract.md#s-13-补授权)）；`Dispatch` ＝ ③（[S-14](../contract.md#s-14-失败映射)）。
  - `Derive` 对全部要认人的路由都走一次：真实路由里只有需要行事 `TenantId` 的才现读，不读的那些的行为是模型行为的子集（只走「通过」那一支），安全性质对子集照样成立。
  - `Derive`、`Gate`、`Dispatch` 各有一个**缺陷分支**：`Derive` 对应 OG S-36 返回 `invalidInput` 或返回的 `account` 分量不等于认人所得 `AccountId`；`Gate` 对应补授权那次现读返回 `invalidInput` 或集合之外的东西；`Dispatch` 对应 [S-14](../contract.md#s-14-失败映射) 的其余缺陷情形。变量 `postAuthRead` 记「身份推导或补授权做过一次现读」，供 `PayloadBeforeDerive` 判次序。
  - 每一次现读读得到、读不到由环境任选；`Revoke` 是环境，在答复之前的任何时刻让出示的那个有效登录状态被撤销。
- **TLC 检查输入**：[`EntryDecision.cfg`](EntryDecision.cfg)，登记为 formal task 的**唯一**配置。常量 `Mutation = "none"`；不变量 `TypeOK` 与十四条（上表十三条，加上由 `TypeOK` 推出、只作回归的 `AnsweredClosed`）；时序性质 `EventuallyAnswered`；关死锁检查（答复之后没有后继动作）。
- **前提**：
  1. `Mutation = "none"`：不改坏任何次序或映射。
  2. 一次行为只有一个请求。
  3. 环境不受公平性约束：现读读不到、撤销发生与否都由环境任选。
  4. 流水线动作带弱公平 `WF_vars(Pipeline)`，`Revoke` 不带——这是「入口层不排队、不等待」在模型里的样子，对应 [S-32](../contract.md#s-32-进展性质与前提) 的 **P1**（中心在运行）。**模型只用到 P1**：P2～P4 不是模型的前提——读不到、版本对不上在模型里是答复分支，`EventuallyAnswered` 在它们不成立时照样成立（答的是 `unavailable`／`version-mismatch`）。
- **有效性核对**（否定配置，**不登记为 formal task**，预期出反例）：
  - [`Validity_Reachability.cfg`](Validity_Reachability.cfg)：九条「从不」谓词——六类答复各一条、「认人之后才读到撤销」「记了缺陷」「补授权通过」各一条——全部预期被违反，证明每一类答复与三处关键分支都可达，正配置下的「无反例」不是平凡的。**要用 `-continue` 跑**；TLC 对每个违反状态只报第一条，所以文件里的谓词次序是有意的。
  - 八个变异配置，各改坏一处次序或映射，断言集合与时序性质都与正配置相同：

    | 配置 | 改坏的是 | 预期被违反的断言 |
    |---|---|---|
    | [`Validity_passthroughStateNotValid.cfg`](Validity_passthroughStateNotValid.cfg) | ③ 读到「出示的登录状态已不作数」时原样透传 | `LateRevocationUniform` |
    | [`Validity_unavailableAsRejected.cfg`](Validity_unavailableAsRejected.cfg) | ② 读不到时答「无效」 | `CannotJudgeIsUnavailable` |
    | [`Validity_readPresentationBeforeVersion.cfg`](Validity_readPresentationBeforeVersion.cfg) | 核版本之前先看出示物 | `VersionFirst`（`-continue` 下另见 `EnvelopeBeforeAuth`：同一改坏也让出示物先于信封被看） |
    | [`Validity_inputBeforeAuth.cfg`](Validity_inputBeforeAuth.cfg) | 要认人的路由先看载荷再认人 | `RejectionUniform`（`-continue` 下另见 `InputAfterAuth`） |
    | [`Validity_gateUnavailableAsDenied.cfg`](Validity_gateUnavailableAsDenied.cfg) | 补授权读不到时答成拒绝 | `CannotJudgeIsUnavailable` |
    | [`Validity_defectAsResult.cfg`](Validity_defectAsResult.cfg) | 缺陷原样当结果交出 | `DefectIsUnavailable` |
    | [`Validity_authBeforeEnvelope.cfg`](Validity_authBeforeEnvelope.cfg) | 要认人的路由先认人再核信封 | `EnvelopeBeforeAuth` |
    | [`Validity_deriveBeforePayload.cfg`](Validity_deriveBeforePayload.cfg) | 先做身份推导与补授权，再核载荷 | `PayloadBeforeDerive` |

  - **没有专门变异的断言**：`HealthUnconditional`、`ExemptIgnoresPresentation`、`ExemptInputWithoutLookup`、`RejectionOnlyWhenJudged`、`NoDomainWithoutGates`。它们的前件在可达性核对里都能被走到（公开体检、免认人路由、「无效」、领域调用四类答复与分支都可达），但**没有一个变异证明它们会失败**；这是本版有效性核对的已知缺口，记在[验证入口](../../verification.md#证据义务)。`AnsweredClosed` 由 `TypeOK` 推出，不列入。
- **结果入口**：[验证入口 · 实际执行](../../verification.md#实际执行)。

TLA+ 描述行为规格，TLC 对给定模型做有限状态检查；在已检查范围内未发现反例，不自动成为任意范围的证明。

## Alloy：未选用

本契约要检查的是次序与映射，是行为。「路由表封闭」「运维面不引用治理能力」是代码结构的事实，由静态检查守；
身份值的结构约束归 `data.identity-values` v1。没有需要结构模型才能反驳的性质。

## 版本与证据边界

模型、正配置与九个否定配置随本版本一同登记为规范工件；**接受之后**增改它们须发新版本。
执行命令、原始输出与反例在版本外保存，由[验证入口](../../verification.md)导航。
