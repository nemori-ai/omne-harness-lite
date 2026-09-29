# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`data.call-accounts` v2 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> **七条规范场景（S-30～S-36）一条都未执行，四条静态检查一条都未执行**——文件存在不代替结果。
> 唯一跑过的是起草时对 [`examples.md`](v2/examples.md) 正反实例的**本地自检**（未登记、未进 `record/evidence/`），
> 范围与局限见[下节](#结果与反例)；它**不支持**任何一条规范场景。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～8 节的正反实例逐条过 Schema，比对「Schema」一列。第 9 节没有「校验对象」，不参与 | Draft 2020-12 校验器 ＋ 按节绑定的 `$defs` | [S-4](v2/contract.md#s-4-未知是一个值不是零也不是缺席)～[S-17](v2/contract.md#s-17-costcorrection事后补账)、[S-29](v2/contract.md#s-29-判别式与枚举闭合) 的**形状那一面** | **本地自检，未登记**（[下节](#结果与反例)，三次）。**正式覆盖未开始**。`CallId` 自整批对齐起按真身解析（[G-1](v2/contract.md#十已知缺口) 已闭合），不再用替身 |
| V-2 | **拒绝值与判定次序**：同一批反例交给边界上的校验方，比对「契约判定」一列——**逐字相同**，含 `malformed` 的组合约束那一半（Schema 放过、契约拒绝的那些行） | 边界校验方的单元测试（形式归 realization）＝ 规范场景 [S-36](v2/contract.md#s-36-拒绝值逐个) | [S-27](v2/contract.md#s-27-表示层拒绝值闭合)、[S-28](v2/contract.md#s-28-表示层校验与判定分开)、[S-29](v2/contract.md#s-29-判别式与枚举闭合) | **未开始。**需要一个实现了校验的提供者。起草时有一次**脚本对照**（下节），它只证明本页的判定列与 S-27 的次序自洽，**不是符合性证据** |
| V-3 | **缺账记未知**（[S-30](v2/contract.md#s-30-缺账记未知)）：流在「记一次账」之前断；另一支载荷里有负数 | 规范场景演练 ＋ 故障注入 | [S-19](v2/contract.md#s-19-每条到达流恰一份账两次发出两份)、[S-20](v2/contract.md#s-20-缺账或被拒收记未知不伪造)、[S-28](v2/contract.md#s-28-表示层校验与判定分开) | **未开始。**落点：`capability.stream-assembly` 与模型调用一侧（均未成稿）。**必须核存储里那份账**，只看返回值会漏掉「写了 0 却返回失败」 |
| V-4 | **两次发出两笔钱**（[S-31](v2/contract.md#s-31-首-token-之前重发两笔都记)） | 规范场景演练；上游计费要能控制（受控上游或替身） | [S-19](v2/contract.md#s-19-每条到达流恰一份账两次发出两份)、[S-23](v2/contract.md#s-23-汇总已知之和与未知笔数) | **未开始。**上游对首 token 之前被中断的请求是否计费，研究尚未核实（[G-6](v2/contract.md#十已知缺口)）；演练断言的是**本系统照报回的记**，不断言上游的计费行为 |
| V-5 | **补账改读数、不改原账；平局失败**（[S-32](v2/contract.md#s-32-补账改读数不改原账)） | 规范场景演练，**核原响应体的字节** | [S-17](v2/contract.md#s-17-costcorrection事后补账)、[S-18](v2/contract.md#s-18-原账不改)、[S-22](v2/contract.md#s-22-有效费用)、[S-23](v2/contract.md#s-23-汇总已知之和与未知笔数) | **未开始。**需要补账的写入者与汇总的读面（均未成稿）。平局那一支最容易被「取第一条」糊过去，**必须真跑** |
| V-6 | **镜像不重复计**（[S-33](v2/contract.md#s-33-工具执行三笔一笔未知一笔镜像)） | 规范场景演练；逐项对照 [`examples.md` 第 9 节](v2/examples.md#9-手算汇总规则) 的手算 | [S-10](v2/contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)、[S-12](v2/contract.md#s-12-总额未知不当零加)、[S-22](v2/contract.md#s-22-有效费用)～[S-25](v2/contract.md#s-25-按尝试记明细按-run-汇总) | **未开始。**另须演练第 9.5 节第四行（镜像所指的响应没归进同一组）——**它不会报错，只会少一笔钱**，归属的前提在 [G-3](v2/contract.md#十已知缺口) |
| V-7 | **账不进给模型看的上下文**（[S-34](v2/contract.md#s-34-账不进给模型看的上下文)） | 规范场景演练，**核组装的输入**，不只核组装出的消息 | [S-21](v2/contract.md#s-21-账进日志不进给模型看的上下文) | **未开始。**落点：上下文组装与 `capability.stream-assembly` |
| V-8 | **砍了要说**（[S-35](v2/contract.md#s-35-砍了要说)） | 规范场景演练：节流 ＋ 一帧超长 ＋ 撞额度 | [S-11](v2/contract.md#s-11-toolcallaccount一次工具执行的账)、[S-15](v2/contract.md#s-15-trimreason-与-trimsummary砍了要说) | **未开始。**落点：做砍的那一方（到达语法的装配）。**「送达的 + merged + cut = emitted」要逐帧对**，只核三式会漏掉一帧哪一项都没计上 |
| V-9 | **装配给的保证**（[S-26](v2/contract.md#s-26-装配给的保证-vs-协议须给的保证) 左列六行） | 装配设计对十进制处理、幂等落盘、时间源与条目归属的选型声明 ＋ 架构评审 | [S-5](v2/contract.md#s-5-金额美元十进制不截断)、[S-14](v2/contract.md#s-14-wallclock)、[S-17](v2/contract.md#s-17-costcorrection事后补账)、[S-19](v2/contract.md#s-19-每条到达流恰一份账两次发出两份)、[S-24](v2/contract.md#s-24-汇总不重复计) | **未开始。**不是可跑的义务；它们失效的形态都是**静默算错**，上面七条场景大多测不出 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。**本版全部状态为「未开始」**，检查器形式归 realization。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 上下文组装的输入类型里不出现本契约的任何值（`Usage`、`Cost`、`ToolCallAccount`、`CostCorrection`、汇总结果） | [S-21](v2/contract.md#s-21-账进日志不进给模型看的上下文) | 未开始 |
| SC-2 | 汇总的实现只从权威位置取：不读 `total_usd`、不读 `service = model_call` 的那几笔、不读 `ToolCallAccount.usage` | [S-24](v2/contract.md#s-24-汇总不重复计) | 未开始 |
| SC-3 | 任何存储与交换形状里不出现 `cache_tokens`、`total_tokens`；不存在把有效费用或汇总写回成账或补账的路径 | [S-7](v2/contract.md#s-7-派生量cache_tokens-与-total_tokens)、[S-18](v2/contract.md#s-18-原账不改) | 未开始 |
| SC-4 | 写 `Cost.cost_usd` 的路径上不读任何价目表或估算；写原账的路径上不产生 `source: later_correction` | [S-8](v2/contract.md#s-8-cost一次发出的费用)、[S-18](v2/contract.md#s-18-原账不改) | 未开始 |

## 结果与反例

### 已执行：起草时的本地自检（2026-09-23）

| 项 | 值 |
|---|---|
| 对象 | 本包 `v2/call-accounts.schema.json` 与 `v2/examples.md`，起草当时的内容（未冻结，无 hash 可绑） |
| 工具 | CPython 3.12.13 ＋ `jsonschema` 4.26.0（`Draft202012Validator`）、`referencing`；工作区锁定环境，未另装依赖 |
| 替身 | **`data.content-blocks` v2 尚未成稿**，`$defs/CallId` 用一个替身代入：`data.identity-values` v2 的 `OpaqueIdentifier` 形状（非空、首尾无那个显式空白集合的码点）。**`examples.md` 第 7、8 节没有一行靠 `callId` 的形状决定通过与否**，所以替身不影响结论；但它**不等于**对 `CallId` 真实形状的校验 |
| 做了什么 | ① `check_schema` 通过；Schema 内嵌的 8 条 `examples` 全部通过。② 第 1～8 节的 104 行逐条按「校验对象」求值，比对「Schema」一列。③ 同 104 行交给一个按 [S-27](v2/contract.md#s-27-表示层拒绝值闭合) 次序写的独立分类脚本（结构那一半用去掉 `minimum` 与条件约束的 Schema，其余四步与组合约束手写），比对「契约判定」一列 |
| 结果 | ② **104/104** 与标注一致；③ **104/104** 与标注一致 |
| 脚本在哪 | 会话暂存区，**未入库**。复现只需上面三步，输入就是本包两个文件与 `data.offer-expiry` v1、`data.identity-values` v2 的 Schema |
| 范围与局限 | ② 只覆盖形状；③ 只证明本页的判定列与 S-27 的文字**自洽**——分类脚本是起草者照自己写的条款写的，**不是独立实现，也不是符合性证据**。两者都**不支持** S-18～S-25（写入、流、组装、求值）的任何一条 |

### 已执行：整批对齐时的本地自检（2026-09-23）

| 项 | 值 |
|---|---|
| 对象 | 对齐波改过之后的 `v2/call-accounts.schema.json` 与 `v2/examples.md`（未冻结，无 hash 可绑） |
| 工具 | 同上一次：`jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing`，锁定 uv 环境；**这一次不用替身**——设计根下全部 `*.schema.json` 按 `$id` 登进同一个解析表，`CallId`、`TenantId`、`ScopeLayerIdentity`、`Instant` 都解析到真身 |
| 做了什么 | 第 1～8 节逐行按「校验对象」求值，比对「Schema」一列（上一次的 ③ 分类脚本**这一次没跑**） |
| 结果 | **113/113** 与「Schema」列一致（通过 45、拒绝 68；比上一次多的 9 行是第 7 节 T-4 与六个反例、第 8 节 K-5 与一个反例） |
| 范围与局限 | 同上一次的 ②；「契约判定」一列这一次未机核 |

### 已执行：第一轮评审修复后的本地自检（2026-09-24）

| 项 | 值 |
|---|---|
| 对象 | 第一轮评审修复之后的 `v2/call-accounts.schema.json` 与 `v2/examples.md`（未冻结，无 hash 可绑） |
| 工具 | 同上一次：`jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing`，锁定 uv 环境（`uv run --offline`）；设计根下全部 `*.schema.json` 按 `$id` 登进同一个解析表，全部 `$ref` 解析到真身 |
| 做了什么 | 第 1～8 节逐行按「校验对象」求值，比对「Schema」一列 |
| 结果 | **116/116** 与「Schema」列一致（通过 46、拒绝 70）。比上一次多的 3 行：2026-09-24 凭据对齐加的组织那一格一行；本轮第 7 节加的 T-5（`frames: "unknown"`）与「只把帧数写成未知」一个反例 |
| 范围与局限 | 同上一次；「契约判定」一列未机核；**不支持**任何规范场景 |

### 尚无的记录

规范场景 S-30～S-36、静态检查 SC-1～SC-4 尚无执行记录。首次执行时在此记录工具与版本、环境、配置、输入范围、
可复现步骤与原始结果位置；原始产物归 [record/evidence/](../../../record/evidence/README.md)。
记录时分开陈述：Schema 校验的结果、边界校验方的拒绝值、规范场景演练的结果、真实组合的符合性。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建**；理由在[包入口](README.md#版本包)与[契约第十二节](v2/contract.md#十二版本差异与规范工件)。
**这不是把义务省掉**：它们被改写成上表的 V-1～V-9 与 SC-1～SC-4。**「未运行」如实登记**：本契约没有任何形式工件，因此也没有任何形式任务在 `formal-tasks.json` 里。

## 变化的影响

- **整批对齐（2026-09-23，候选未冻结，原地改）**：
  - **G-1 闭合**：`data.content-blocks` v2 成稿，`$defs/CallId` 名字未变、定义在它的 S-14，catalog 补登依赖（`S-14`）；`CallId` 的唯一范围是一份会话日志——S-17 那句据此改写。替身不再需要，[上节自检](#已执行整批对齐时的本地自检2026-09-23)按真身重跑。
  - **G-2 闭合**：三句裁决链到 D-058。
  - **与块 C 对齐**：`ResponseId` 的产生时刻改为「那一次发出出门时由模型请求运行时定下」（与 `capability.model-request-runtime` S-8 一致）；`ModelCallId` 的唯一范围由「运行内」改为「会话内」——不属于任何运行的调用也有它。形状不变，自检不受影响。
  - **新增**：`ToolCallAccount` 加 `initiator`（必填）、`credentialScope`（可缺席）、`externalEffect`（必填）、`stoppedAt`（可缺席）、`late`（只取 `true`）；`CostCorrection` 加 `late`；新条款 S-38（两种归属）、S-39（晚到的账）。
    **表示改变**：旧的 `ToolCallAccount` 实例缺 `initiator` 与 `externalEffect`，按新 Schema 一律被拒。**消费者影响**：`capability.tool-execution-runtime` 的 S-13 与 G-8（三件事装不下）、`data.model-response`（`route.credentialScope` 与 `late` 由它携带）、`capability.model-request-runtime`（它 G-1 里的 `late`）。
  - **收窄**：G-3（三种边界情形按主线裁定归组，剩「同组」一项）、G-4（接入点规范串已定）、G-10（落点契约已成稿）；新增 G-11（主线裁定无决定记录）、G-12（一次发出的发起者不另记）。
  - S-15 的帧数一式改写成「做砍的一方每帧至多计一次」的前提下成立。
- **2026-09-24 跨契约对齐：凭据只在租户层与出厂格（候选，未冻结，原地改）**。依据 [PF-013 rev 10 裁决 33](../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--组织那一层不持有凭据每人租户层自取)（组织那一层不持有模型凭据）与 [PF-002 rev 18](../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)（组织那一层不持有 MCP 凭据），主线派发：
  - [S-38](v2/contract.md#s-38-两种归属用量归凭据那一格成本归发起者) 表「用量归凭据那一格」一行重写：成员限 `ScopeLayerIdentity` 的租户那一支（模型调用那边另有出厂格一支，形状归 `data.model-response`）；例子由「租户用组织那一把」改为「租户用官方档案走了出厂格那一把：用量落在出厂格，钱仍归发起租户」。「落在哪」一条写明 MCP 凭据只在租户那一格。
  - P-12 违例示例改为「走了出厂格那一把，钱却记到了出厂格头上」。
  - **Schema**：`ToolCallAccount.credentialScope` 由 `$ref ScopeLayerIdentity` 改为 `allOf [$ref ScopeLayerIdentity, layer = tenant]`；**表示变更**：带组织那一格的旧实例按新 Schema 被拒（`malformed`）。
  - **实例**：第 7 节 T-4 的凭据改在发起租户那一格；新增一行组织那一格 ⇒ `malformed`；工作区那一行的理由改写。本地自检：第 7 节 17 行可机检的实例逐行过 `$defs/ToolCallAccount`，全部与预期相符。
  - **分记的理由改写**（主线裁定 2026-09-24）：S-38 引言、表中那一行与第一节「唯一的例外」一句写明**出厂格那一把是唯一分叉点**——用租户自己那一把时用量那一格就是发起租户，只有走出厂格那一把时两项归属不同。C-12 本身不变。
  - **catalog 不变**：仍消费 `data.identity-values` S-5、S-11。**covers 新增一条**：PF-013 §5.6（裁决 33 所在）→ S-38，`reviewed: false`。
  - **头部产品依据对到 PF-013 rev 11**：核 changelog rev 9–11——rev 9 的费用未知与迟到补记归那个 Run 整批对齐时已按主线账本落入；rev 10 只有裁决 33 触及本契约（即本条）；rev 11 不涉及。
  - **消费者影响**：`capability.tool-execution-runtime`（写 `ToolCallAccount`）若曾允许把组织那一格报上来，须收窄；它的 G-15（这一格从哪来）不受影响。
- **`data.content-blocks` v2 尚未定型，`$ref` 目标以其 v2 为准**（2026-09-23 起草时；**已由上一条闭合**）。
  本契约 Schema 两处 `$ref` 它的 `$defs/CallId`（`ToolCallAccount.callId`、补账的工具执行目标）；**在它成稿并登进 catalog 之前，
  设计检查器会报这两处引用解析不到**，catalog 也暂不登这条依赖（[G-1](v2/contract.md#十已知缺口)）。它成稿之后须核：
  ① `$defs/CallId` 这个名字没有变；② 定义它的条款号——据此补登 catalog 依赖；
  ③ **它的唯一范围**——若窄于一个部署，[S-17](v2/contract.md#s-17-costcorrection事后补账) 的补账目标与 [S-23](v2/contract.md#s-23-汇总已知之和与未知笔数) 的「重复的账」按那个范围读，本页 V-5、V-6 的演练同步收窄；
  ④ 若它的形状比本自检的替身更严，第 7、8 节的 `call_…` 占位要重核，[上节的自检](#已执行起草时的本地自检2026-09-23)须重跑。
- **`data.arrival-events`（第二波）照抄 `TrimReason` 的四个值**，其「记一次账」那一步的载荷引用本契约的 `Usage`、`Cost`、`TrimSummary`。
  它若要第五个原因、或要「砍了多少」出现未知，都是本契约的语义变更，**不在那边另列**。
- **G-3 余项裁定之后**（工具执行替自己发出的模型调用怎样与它同组）：若结论改变「补账跟着目标分组」或归组规则（[S-25](v2/contract.md#s-25-按尝试记明细按-run-汇总)），属语义变更。
  本契约仍是 candidate，**未冻结之前原地改并在此记录**；冻结之后发布新版本。
- **G-7、G-12 裁定之后**：`obtainedVia` 加值、或响应体上另起「发起者」一项，都是表示改变，冻结之后出新版本。
- **跨进程演化**（[G-8](v2/contract.md#十已知缺口)）：[S-26](v2/contract.md#s-26-装配给的保证-vs-协议须给的保证) 的六行从「装配给」转为「协议给」，**语义边界改变，须发布新版本**；本版的全部证据只保留其单机范围。
- **（2026-09-24 核 PF-013 rev 12，不改语义）**：头部产品依据保持 rev 11，注明 rev 12（同名按层覆盖、设置记路由名）不改本契约条款。对证据无影响。

- **2026-09-24 第一轮独立评审修复（候选未冻结，原地改）**——逐条处置见[独立评审](#独立评审)：
  - **产品依据逐 topic 复核到当前 rev**（按各 topic changelog 逐版读）：
    PF-001 rev 16→17（权限界与挑选、提升不动持有）——**无影响**；
    PF-006 rev 17→19（rev 18 §5.5「被中断」写全、§6.6 发起即后台、§6.7 前台超时、§6.12 五个来处；rev 19 §5.3 说明必填）——本契约只取 §5.4「每次执行留一份账」，**无影响**；
    PF-009 rev 7→8（`SystemMessage` 不落日志、在途快照含已到片段、**「已经开口」记进那次模型调用的账**、工具帧出错照常收尾）——「这次尝试的账」统一为「那次模型调用的账」与本契约的挂法一致；「已开口」落成 `data.messages` 的一条日志记录，**不是 `Usage`／`Cost` 的成员**，第二节写明；
    PF-012 rev 10→14（**rev 11 把 I-11 收窄进正文**；rev 12 拓展件不可用处置；rev 13–14 转换件）——S-39、P-11 的依据由「主线裁定」改引 PF-012 §6.17 I-11，G-3 的产品那一半随之闭合；其余无影响；
    PF-013 rev 11→12（呈现责任、路由名按层覆盖）——**无影响**；
    PF-002 rev 18→20（锁的是界、谁可以使用它、连接件事件目录；**MCP 凭据仍只在租户层**）——S-38 的「组织那一层不持有 MCP 凭据」到 rev 20 仍成立，改写成「rev 18 起」；
    PF-000 rev 1 未变。
  - **K1**：S-11 `externalEffect` 只定两值的含义，判据改为以坐标指向 `capability.tool-execution-runtime/v2#S-14`（本契约不再列判据）；Schema 描述同步。
  - **K5**：S-17 表写明两种目标的身份（`model_response`：`responseId`；`tool_execution`：会话日志归属 ＋ `callId`），S-22、S-23 第 4 行、S-25 按租户跨会话分组都按这对键判重与找目标。
  - **K14**：S-39 写明 `ModelResponse` 的 `late` 与本条同一含义、同一写法（可选、只取 `true`、缺席 = 不晚），依据改引 PF-012 I-11 与 D-060 §一 S2-d。
  - **K50（本契约部分）**：`frames` 改为 `FrameAccount | "unknown"`，新定义项 `$defs/FrameAccount`；`"unknown"` 只在持有帧计数的在途状态丢了时写；S-15、S-27 的帧数一式只对 `FrameAccount` 核。**表示改变**：`frames: "unknown"` 旧 Schema 拒、新 Schema 收；其余旧实例不变。**消费者影响**：`capability.tool-execution-runtime`（丢失在途状态时写 `"unknown"`，由它判）；读帧数的读面须处理未知一支。
  - **依赖补登**：`data.identity-values` v2 加 `S-17`（`initiator` 不从当前租户补）；新依赖 `data.asset-model` v2 `S-3`（接入点的规范串）。`data.arrival-events` S-23 ① 是定义性引用、不登（那份契约依赖本契约，登了成环）；TER S-14、stream-assembly S-14 是落点、不登。头部与 catalog 一致。
  - **依据链接化**：「主线裁定 2026-09-23，待产品负责人确认」一律改为 D-060 §一 对应小节的链接（S2-d、S2-e、S4-b、S8-c、S13-f、S16-f）；**两种归属分记**（原「C-12」）当时在 D-060 里没有原文，改以 PF-001 §6.4 与 UL-model-credential 两条产品事实加规格层推导为依据（S-38、P-12、设计依据倒数第二行）；此后主线已在 [D-060 §六 N-5](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) 接受它（修复波 2 补了链接）。**G-11 闭合**。本轮落的 K 各项，契约正文的依据链到 D-060 §五（K1～K50，2026-09-24 夜追加）。
  - 「一次发出」链到 UL-upstream-send；§十一 补上 `initiator` 这一处租户身份的例外；S-38 写明本契约的 `initiator`（成本归属租户）与 `data.messages`／`data.model-response` 的 `initiator`（中断发起方）同名不同义。
  - 本地自检重跑（上节，116/116）。

- **2026-09-25 修复波 2（主线裁定 [D-060 §七 M25](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) 与 [§四](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#四被推翻或被覆盖的项追加登记)「K14」那一行；候选未冻结，原地改）**——逐条处置见[独立评审「第二轮」](#第二轮2026-09-25)：
  - **M25**：[S-39](v2/contract.md#s-39-晚到的账) 首句的「归属的那次尝试」改为「锚定的那次尝试」，并按账的种类写明锚点：`ToolCallAccount` 与 `CostCorrection` 看归属的尝试（条目给）；`ModelResponse` 看发出**所在**的尝试（它自己的 `attemptId`），不看条目把它归到哪一次。补一句对账补写的例子（在 n+1 次里补写 n 次出门的那一条仍是晚的）。`ModelResponse` 那一条的「所属尝试」同改。**表示不变**（Schema 与实例不动）；**语义**：`ModelResponse` 的 `late` 的触发锚与 `data.model-response/v2#S-35` 从此是同一句（原先两份各按「所在」「归属」读）。
  - **CB2-3（M2）**：抬头两处「会成环所以不登」（`ResponseId`、`data.arrival-events` S-23 ①）改链 registry「互引成环的登记口径」与 D-060 §七 M2；登记不变。
  - **CA2-1**：对齐义务第 3 条的 S2-e 改链 D-060 §四（已被 asset-model S-3 取代），删去「已报主线核对」。
  - **CA2-2**：设计依据「两种归属分记」一行补链 D-060 §六 N-5；第一轮修复条目里「D-060 里没有原文」加注此后已接受。依据本身不变。
  - **证据**：Schema 与实例未改，V-1 不重跑。

结果不改写规范。发现语义问题回到来源设计（PF-006／PF-009／PF-012／PF-013），不在这里改契约。

## 独立评审

| 评审 | 日期 | 基线 | 发现 | 处置 | 落点 |
|---|---|---|---|---|---|
| spec-reviewer，S25 第一轮批 R1 | 2026-09-24 | HUB `765b01dc` | CA-1 产品依据 rev 过时 | **改**：六个 topic 逐版复核（PF-012 rev 11 的 I-11 收窄与 PF-009 rev 8 的「开口是账」两处有实质，已跟上），抬头对到当前 rev；S-38 的 PF-002 引用改为「rev 18 起」并核到 rev 20 | 抬头；S-38、S-39、第二节；[变化的影响](#变化的影响)本轮一条 |
| 同上 | 同上 | 同上 | CA-2 外部效果判据两处定义且已不一致 | **改**（主线 K1）：本契约只定两值含义，判据以坐标指向 TER S-14，删掉本地判据与「判据同一」的说法 | S-11；Schema `ToolCallAccount.description` |
| 同上 | 同上 | 同上 | CA-3 `CallId` 判重与补账目标跨会话会错配 | **改**（主线 K5）：目标身份 = 会话日志归属 ＋ `callId`，写进条款 | S-17、S-22、S-23 第 4 行、S-25 |
| 同上 | 同上 | 同上 | CA-4 identity-values S-17、asset-model S-3 未登依赖 | **改**：依赖表与 catalog 补登两条 | 头部依赖表；`registry/catalog.json`；README |
| 同上 | 同上 | 同上 | CA-5 「一帧」单位的依赖只有一侧登记 | **改**：带坐标引用 `data.arrival-events/v2#S-23` 第 1 条；**不登 catalog**——那份契约依赖本契约，登记会成环；头部、README 写明「定义性引用，不登 catalog 依赖」，[对齐义务](#对齐义务)登了复核 | S-11；头部；README |
| 同上 | 同上 | 同上 | CA-6 §十一「账里没有租户」与 `initiator` 字面冲突 | **改**：§十一 写明唯一例外 | §十一 |
| 同上 | 同上 | 同上 | CA-7 「一次发出」说无词条 | **改**：链 UL-upstream-send，本页对齐义务改写 | 第二节、设计依据「正式名」行 |
| 同上 | 同上 | 同上 | CA-8 `initiator` 跨契约同名不同义 | **改**（在两处写明区分的那一种）：S-38 加一条说明；**不登 conflicts**——两处各有精确定义，不是同一概念的两种说法；是否给一方改名（本契约 G-12 的「另起一个名字」）留主线 | S-38；G-12 |
| 同上 | 同上 | 同上 | CA-9 V-1 仍说 `CallId` 解析不到 | **改** | 本页 V-1 |

### 第二轮（2026-09-25）

reviewer：spec-reviewer，S25 第二轮批 R1（另含批 R2b 转来的一条）；基线 HUB `8ad37c50`。本批对本契约的总判是「可进 F 反向核对」。依据一律是 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)。

| # | 发现（等级） | 处置 | 落点 |
|---|---|---|---|
| CA2-1 | 对齐义务第 3 条仍写 S2-e「已报主线核对」（建议） | **改**：改链 D-060 §四「S2-e」那一行；以 asset-model S-3 为准 | 本页对齐义务 |
| CA2-2 | 第一轮修复条目写「C-12 在 D-060 里没有原文」，而 §六 N-5 已登记（建议） | **改**：设计依据那一行补链 N-5；修复条目加注。依据不变 | 设计依据倒数第二行；本页变化的影响 |
| CB2-3（本契约那一半） | 抬头所列的 `data.arrival-events` S-23 ① 与 `ResponseId` 都是「会成环所以不登」，这条口径没有持久落点（应修） | **改**（M2）：口径已由主线写进 registry README；抬头改链它与 D-060 §七 M2。登记不变 | 抬头依赖说明 |
| R2b R2-MR-3（本契约那一半） | S-39 首句按「归属」锚、`data.model-response` S-35 按「所在」锚，E-10 那种补写在两处判得不同（应修） | **改**（M25；D-060 §四 K14 读作「发出所在的尝试」）：S-39 首句写明按账的种类定锚，`ModelResponse` 看它自己的 `attemptId` | S-39 |

## 对齐义务

- **定义性引用与落点的复核**（本契约引用、不登 catalog 依赖的三处）：`data.arrival-events/v2#S-23` 第 1 条改了「一帧」的单位，本契约 [S-11](v2/contract.md#s-11-toolcallaccount一次工具执行的账)、[S-15](v2/contract.md#s-15-trimreason-与-trimsummary砍了要说) 同轮复核；`capability.tool-execution-runtime/v2#S-14` 改了外部效果确定性的三值或投影，本契约 S-11 的两值含义同轮复核；`capability.stream-assembly/v2#S-14` 不再兑现「每帧至多计一次」，S-15 的不等式失去前提。
- **`ModelResponse.late`**：`data.model-response` 的 `late` 须与 [S-39](v2/contract.md#s-39-晚到的账) 同一含义、同一写法（可选、只取 `true`、缺席 = 不晚），**锚是发出所在的尝试**（`attemptId`，M25）；那份契约改写法或改锚时本条同轮复核。
- **接入点规范串的分隔符**：本契约与实例按 `data.asset-model/v2#S-3` 写 `<category>/<name>`；[D-060 §一 S2-e](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s2call-accounts报回的) 原文的 `"<category>:<name>"` 已由 [D-060 §四](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#四被推翻或被覆盖的项追加登记)「S2-e」那一行登记为被 asset-model S-3 取代（早期笔误）。


## CA3 本批候选验证（2026-09-29）

变化和未开始的真实义务见[v3/verification](v3/verification.md)。实际工具运行：Schema检查57/57形状实例；RT11三个新增TLC正配置均exit0（ReferenceLifecycle:2206 generated/621 distinct；Publication:147/60；OpenedOrder:254/166），九个负控均exit12且命中目标不变量。未重跑继承形式工件，不将其旧结果算成本批覆盖。原始日志位于任务worktree的`tmp/model-registry-design/spec-draft/`（schema-check.log及tlc/）；提供者/装配/真实网络/权限/存储故障与性能测量均未开始。设计检查最终结果由本批交接记录，不预写通过。

本批最终登记/文档检查：`check_design.py --root .meta_harness/design --formal registered` 实际exit0，输出 `PASS: design tree ... passed gate=internal; formal=registered.`（design-check-locked.log）。本树`.venv/bin/omne-docs-check`实际exit0，`PASS: 1836 Markdown files; local links and skill mirrors.`（docs-check.log）。852份原frozen资源逐项SHA匹配，frozen.json与4edf6cdc原字节相同。未运行release gate，不声称接受。
