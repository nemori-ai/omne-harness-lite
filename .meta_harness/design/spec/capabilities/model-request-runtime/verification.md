# 验证覆盖与实际证据

`capability.model-request-runtime` v1（candidate）的证据义务与执行状态。本文件可更新，位于规范版本目录之外；
结果始终绑定实际规范、模型与实现修订。

**当前状态**：行为模型已在起草者本机跑过一次（下文「实际执行」）；**没有实现，没有执行过任何规范场景或测试**。
模型检查的结论只对所列常量成立，**不是无条件证明**，也不代表任何实现符合本契约。

## 证据义务

### 形式工件

模型、配置与断言 ↔ 条款的映射在 [formal 入口](v1/formal/README.md)。

| 条款与性质 | 模型／配置 | 前提 | 状态 |
|---|---|---|---|
| [S-15](v1/contract.md#s-15-两个锚点先写后行) 两个锚点先写后行；[S-17](v1/contract.md#s-17-结算一处按序幂等先到者赢) 结算幂等、先到者赢；[S-22](v1/contract.md#s-22-同一次调用的发出序列) 发出序列（含跨尝试开口之后不再发出、续接同一家）；[S-30](v1/contract.md#s-30-dispatchagain) 守卫；[S-31](v1/contract.md#s-31-interrupt) 意图先落；[S-33](v1/contract.md#s-33-reconcile) 对账（失联发出被追补且不重发）；[S-5](v1/contract.md#s-5-一次调用一次发出) 序号跨尝试连续 | `Invocation.tla` ＋ `Invocation.cfg`（允许回退）、`Invocation_NoFallback.cfg`（不允许回退）；formal task `model-request-runtime-v1-invocation`、`model-request-runtime-v1-invocation-no-fallback` | 常量：2 家、至多 3 次发出、至多 2 次停机；对「出网、首 token、四种收场、中止、撤除结算、对账」弱公平；写下一条响应体是原子的 | **起草者本机跑过，退出 0、无反例**（2026-09-23，见下） |
| 同上各断言**能失败** | 六份 `Invocation_Validity_*.cfg`（各拧反一个开关） | 同上 | **起草者本机跑过，六份均按预期出反例**（退出 12）；不登记为 formal task |
| 续接、换家两条路可达 | 两份 `Invocation_Reach_*.cfg` | 同上 | **跑过，均按预期报出见证**（退出 12）；不登记 |

**模型没有覆盖、不得写成「已由模型覆盖」的**：追加口的原子性与按 `ResponseId` 幂等、回复消息与响应体同一提交、成因分类表的内容、脱敏、凭据取值、合法目标与展示列表、投影、拓展件与 loop 的行为（见 [formal 入口「模型吸收了什么」](v1/formal/README.md#模型吸收了什么不写成已由模型覆盖)）。它们的证据在下两表。

### 规范场景与测试

| 条款与性质 | 场景／测试 | 证据形式与前提 | 状态 |
|---|---|---|---|
| [S-22](v1/contract.md#s-22-同一次调用的发出序列)、[S-17](v1/contract.md#s-17-结算一处按序幂等先到者赢) 发出序列与一次发出一条响应体 | [S-41](v1/contract.md#s-41-两家发出第一家-429-未开口第二家完成) | 脚本化传输 → 真实会话日志；核两条响应体、两份账 | 未开始 |
| [S-15](v1/contract.md#s-15-两个锚点先写后行)、[S-33](v1/contract.md#s-33-reconcile) 停机前后 | [S-42](v1/contract.md#s-42-开口之后断流不重发)、[S-47](v1/contract.md#s-47-用户叫停之后停机不再发出) | **故障注入**：在两个锚点前后各杀一次进程，新进程对账 | 未开始 |
| [S-27](v1/contract.md#s-27-selectmodel)、[S-7](v1/contract.md#s-7-一次调用绑定了什么) 切换先落后生效、不作用于在途 | [S-43](v1/contract.md#s-43-切换先落事实后生效) | 集成；另一支让切换事实写不进 | 未开始 |
| [S-11](v1/contract.md#s-11-合法目标集合)、[S-12](v1/contract.md#s-12-展示列表)、[S-9](v1/contract.md#s-9-选中模型) 已下架、恢复在册后自然接上、模态挡在这一刻 | [S-44](v1/contract.md#s-44-已下架的档案)（含恢复一支）、[S-45](v1/contract.md#s-45-模态不兼容挡在算合法目标那一刻) | 纯计算的表驱动测试 ＋ 集成 | 未开始 |
| [S-12](v1/contract.md#s-12-展示列表) 每条带来源、同路由名分得开；[S-19](v1/contract.md#s-19-凭据每次发出现取取值只交给传输适配) 按来源取凭据、自建档案不用出厂格那一把 | [S-48](v1/contract.md#s-48-同路由名的两条来源不同取凭据也不同)；[examples §9](v1/examples.md#9-同路由名的两条来源不同取凭据也不同场景-s-48) | 集成：目录替身配两种部署（有无出厂格那一把）、租户配与不配两种；核 `route.credentialScope` | 未开始 |
| [S-18](v1/contract.md#s-18-成因按来源分类三类事实由守卫兑现) 成因按来源、[S-20](v1/contract.md#s-20-写入之前脱敏) 脱敏 | [S-46](v1/contract.md#s-46-成因按来源分类与脱敏) | 哨兵串扫全部记录；前提：`status_cause_table` 与三个脱敏参数有值（G-5、G-6） | 未开始（被 G-5、G-6 阻断） |
| [S-13](v1/contract.md#s-13-模态投影读到的必须追到日志尾) 投影追到日志尾 | **性质测试**：任意日志前缀上，追补之后的读 = 对全日志重算；**伸缩测量**：读的代价与历史长度无关 | 随机日志生成器 | 未开始 |
| [S-35](v1/contract.md#s-35-默认重试件可替换) 默认件逐家一遍、不允许回退时同家至多再试一次 | 表驱动测试（它是一个纯函数） | —— | 未开始 |
| [S-14](v1/contract.md#s-14-缺席时的默认答案与失败集合) 失败值闭合与判定次序 | [examples §8](v1/examples.md#8-每个失败值一个反例) 与次序回归例 | —— | 未开始 |
| [S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配九条 | 适配层的契约测试（脚本化上游）：单家、禁止回退、不开库重试、状态码、首 token 映射、不回落环境变量、不送会话标识、不换占位文本、固定 base URL | 前提：G-10 的 basis 条目 | 未开始 |

### 由别处承担、本契约只写明要求的

| 要求 | 由谁承担 | 本契约位置 |
|---|---|---|
| 回复消息与响应体同一提交、追加按 `ResponseId` 幂等、结算不受栅栏拒收 | 会话日志追加口（loop 那一程） | [S-17](v1/contract.md#s-17-结算一处按序幂等先到者赢)、[S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) |
| 上交条目、中断提醒、宿主停止前先中断 | loop | [S-3](v1/contract.md#s-3-本契约明确不承诺什么)、[S-36](v1/contract.md#s-36-宿主停止与撤除) |
| 跨进程的新鲜度、秘密送达、转发链不越过锚点 | 组合契约（尚未立） | [S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证)、[G-12](v1/contract.md#十二已知缺口) |

## 实际执行

### 2026-09-23 起草者本机：TLC 十份配置

- **模型修订**：本分支 `panqiwei/assets-runtimes-spec-modelrt` 上首次提交的 `v1/formal/Invocation.tla`（提交号见 `git log`，本页不填哈希）
- **工具**：TLC2 Version 2026.09.12.025210 (rev: 867aefb)；openjdk 21.0.12.1；`-workers 1`，工作目录 `.meta_harness/design`
- **命令形状**：`java -cp tla2tools.jar tlc2.TLC -metadir tmp/tlc/<id> -cleanup -noGenerateSpecTE -workers 1 -config <cfg> Invocation.tla`

| 配置 | 退出码 | 结果 |
|---|---|---|
| `Invocation.cfg` | 0 | 29,521 states generated，15,802 distinct，深度 21；20 条不变量与进展性质 `SentEventuallySettled` 无违反；无死锁 |
| `Invocation_NoFallback.cfg` | 0 | 13,861 generated，7,420 distinct；同上 |
| `Invocation_Validity_NoGuard_Spoke.cfg` | 12 | `NoDispatchAfterSpoke` 违反：OpenPass → Dispatch → Send → FirstToken → FailAfter → DispatchAgain |
| `Invocation_Validity_NoGuard_Fact.cfg` | 12 | `ContinuationOnlyAfterStrategyOrSilentLoss` 违反：OpenPass → Dispatch → Send → FailBefore(事实类) → DispatchAgain |
| `Invocation_Validity_SpokeAfterObserve.cfg` | 12 | `NoDispatchAfterSeen` 违反：… → FirstToken（先交观察者）→ Crash → Reconcile（当成没开口）→ Dispatch → Send |
| `Invocation_Validity_SendBeforeAnchor.cfg` | 12 | `QuiescentSettled` 违反：… → Send（锚点未写）→ Crash → Reconcile（找不到这次发出） |
| `Invocation_Validity_AbortBeforeIntent.cfg` | 12 | `NoDispatchAfterInterrupt` 违反：… → Interrupt（未写意图）→ Crash → Reconcile（当成失联）→ Dispatch → Send |
| `Invocation_Validity_NonIdempotentSettle.cfg` | 12 | `AtMostOneBodyPerDispatch` 违反：… → HostStop → FailBefore → TeardownWrite（第二条） |
| `Invocation_Reach_ResumeThenComplete.cfg` | 12 | 见证 `NotResumeThenComplete` 被报出：续接路径可达 |
| `Invocation_Reach_FallbackThenComplete.cfg` | 12 | 见证 `NotFallbackThenComplete` 被报出：换家路径可达 |

原始输出只留在起草者本机的临时目录，**没有入库**；复跑以 `make design-check FORMAL=run`（两份登记配置）或上面的命令形状（其余八份）为准。

## 结果与反例

**正向配置无反例。**否定配置的反例都是预期的，形状见上表；它们说明的是「对应开关拧反时断言会失败」，**不是契约的缺陷**。

## 变化的影响

- **2026-09-23 起草**：首版，无旧证据。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在主线的裁定清单（账本 S16-b～S16-i、U-11）。
  - **G-1 闭合**：`data.model-response` 的 `interrupted{initiator}` 三值、`attemptId` 在每一次发出上、`route.profileSnapshot`／`route.credentialScope`，`data.call-accounts` 的 `late` 与 `initiator` 都已落；「首 token 之前失联之后能否再发」的口径与本契约一致（那边 S-23 第 2 条）。**模型不变**：`lost_silent`／`lost_spoken`、`int_user`／`int_cancel` 正是那几支，`ContinuationOnlyAfterStrategyOrSilentLoss` 与对账表第三行不改。
  - **G-2 闭合**：五种记录的形状归 `data.messages/v1#S-49`、`#S-50`；场景的核对对象改为那里的成员名。不影响模型。
  - **G-3 闭合**：`ModelCallRequest` 定形（`parameters`、`tools: CapabilityId[]`、`targetChangedBy?`，与 `data.loop-extension` 的 `ModelRequest` 同名成员逐字相同）。
  - **`retryRefused{call_ended}` 删去**（S16-b）：已终结的调用在 `dispatch`／`dispatchAgain` 上一律 `alreadyEnded`；`why` 剩三值、守卫重新编号。模型里守卫是谓词、不带这个名字，**不需重跑**。
  - **默认重试件**：不允许回退的档案同家至多再试一次（S16-g）；它不在模型里（模型把 `dispatchAgain` 建成非确定选择，守卫是唯一约束），`Invocation_NoFallback.cfg` 的 `ProviderAllowed`（每一次都是第一家）照旧成立。实例第 7 节已改写。
  - **G-7 闭合**（S16-g：首 token 之后停机 = `interrupted{runtime_lost}`）；**G-8、G-9 收窄**；**G-4 改为产品缺口**（「范围允许」的输入是 asset-evaluation 求值结果里「用哪个模型」那一项的允许集合，S16-i）；**G-14 闭合**（三份并行契约登进 catalog；runner 只指路，它消费本契约、反向登记会成环）。
  - **凭据链多一格**（`capability.model-profile-directory` 同轮改，账本 S16-f）：S-19 取「最具体的一把」末尾加出厂格那一把，S-12 的 `credential_missing` 改为三格都没有；模型不含凭据取值，不受影响。
  - **对证据的影响**：没有既有证据失效；两个登记任务在本轮 `FORMAL=run` 重跑。
- **2026-09-24 规格修订批（PF-013 rev 10 之后；候选，未冻结，原地改）**。依据：PF-013 rev 10 裁决 33–38、decisions P33–P37，主线施工简报第三节：
  - **取凭据次序同步目录**：[S-19](v1/contract.md#s-19-凭据每次发出现取取值只交给传输适配) 删「否则组织层」——发起租户有自己那一把就用它（不论档案建在哪一层），否则只有官方档案取出厂格那一把，自建档案没有就是 `credential_unavailable`；取用时带有效模型引用的 `origin`，不另填。[S-12](v1/contract.md#s-12-展示列表) 的 `credential_missing` 按每一条的来源各问一次；[S-28](v1/contract.md#s-28-opencall) 出门前检查第 4 行、[S-29](v1/contract.md#s-29-dispatch) ⑧ 措辞随改。
  - **展示列表每条带来源**（裁决 36）：[S-12](v1/contract.md#s-12-展示列表)、[S-25](v1/contract.md#s-25-displaylist) ⑤ 写明来源即条目 `ref` 里的 `origin` 与 `scope`，不另立成员；[S-11](v1/contract.md#s-11-合法目标集合) 补一句同路由名可有几条。
  - **撤回可恢复**（裁决 37）：[S-9](v1/contract.md#s-9-选中模型) 补恢复之后自然接上；进展性质加一行；[S-44](v1/contract.md#s-44-已下架的档案) 加恢复一支；实例第 5 节加两行。
  - **新增场景 [S-48](v1/contract.md#s-48-同路由名的两条来源不同取凭据也不同)** 与实例第 9 节；上表加一行。
  - [S-38](v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) 两行改写（在册状态两个方向都要单调读；秘密送达去掉账本 U-1 与「组织层那一把」，来源须如实到达）；安全性质加「自建档案用上出厂格那一把」一行；catalog 本契约对 `data.model-profile` 增 S-4。
  - **对证据的影响**：没有既有证据失效——行为模型不含凭据取用、在册状态与展示列表，**十份配置不需重跑，本轮未运行 TLC**；场景全部未开始，S-44、S-48 首次执行按新内容。
