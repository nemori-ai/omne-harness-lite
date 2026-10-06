# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`capability.mcp-bridge` v2 是 `candidate`，经过两轮独立评审（处置见独立评审；2026-09-25 修复波 2 原地改，同日修复波 3 跨批对齐按 M37 改 S-17），未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> 七条规范场景、四条消费者核对场景、六条静态检查**一条都未执行**；[`examples.md`](v2/examples.md) 里的值**没有过任何校验器**——文件存在不代替结果。
> 起草时跑过的是 `make design-check`：它核对了 Markdown 链接与锚点、registry 登记——**它不校验任何实例、不执行任何场景**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **实例里的值过各自的 Schema**：[`examples.md`](v2/examples.md) 第 4.1 节两份工具定义过 `data.tool-definition/v2` 的 `SingleFunctionTool`；第 5 节的 `ToolResult` 与块过 `ToolResult`／`ContentBlock`；第 7 节的绑定过 `data.mcp-endpoint/v2` 的 `OAuthBinding` | Draft 2020-12 校验器（能按 `$id` 解析到四份数据契约的 Schema） | [S-17](v2/contract.md#s-17-projectactions)、[S-20](v2/contract.md#s-20-对端结果怎样成为-toolresult)、[S-8](v2/contract.md#s-8-oauth-绑定状态与迁移) 的**形状那一面** | **未运行。**起草者手核（[实例第 9 节](v2/examples.md#9-起草者逐条自核)）；**手核不是证据** |
| V-2 | **投影与结果映射的逐项取值**：实例第 4、5 节每一行，给定输入、比对输出 | 投影函数与结果映射的表驱动测试（纯函数，不需要对端） | [S-17](v2/contract.md#s-17-projectactions)、[S-20](v2/contract.md#s-20-对端结果怎样成为-toolresult) | **未开始**；需要提供者 |
| V-3 | **操作结局**：实例第 1、3、6、7 节每一行，在受控的对端（可编排的 MCP 测试服务端：可拉不起、可超时、可分页、可发坏项、可断线、可要 OAuth）上复现 | 集成测试；存储、保管方、时间源可注入不可用 | [S-5](v2/contract.md#s-5-接入点持有的寻址)～[S-9](v2/contract.md#s-9-凭据的出示与取用)、[S-16](v2/contract.md#s-16-refreshactions)、[S-18](v2/contract.md#s-18-availability)、[S-19](v2/contract.md#s-19-invoke)、[S-22](v2/contract.md#s-22-beginoauth)～[S-24](v2/contract.md#s-24-续期清值与作废) | **未开始** |
| V-4 | **规范场景** [S-32](v2/contract.md#s-32-连不上时照上一份清单装替换件)～[S-38](v2/contract.md#s-38-桥换代时在途调用落异常中断)：每条一个正例、一个反例 | 规范场景演练；**反例要能让一个故意写错的实现失败** | [S-7](v2/contract.md#s-7-动作清单持久副本)、[S-9](v2/contract.md#s-9-凭据的出示与取用)、[S-19](v2/contract.md#s-19-invoke)、[S-23](v2/contract.md#s-23-completeoauth)、[S-24](v2/contract.md#s-24-续期清值与作废)、[S-27](v2/contract.md#s-27-桥被替换或卸载) | **未执行。**S-35 与 S-38 **必须在对端观察请求次数**：只看收场会漏掉重发；S-36 **必须观察配值的写入记录**：只看凭据可用会漏掉「续期被写成了改值」。**S-36 第一段（续上、不打扰任何人——[PF-002 acceptance §一](../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)「续期不打扰任何人」）受阻 custodian [G-4](../credential-custodian/v2/contract.md#十一已知缺口)／[G-2](../credential-custodian/v2/contract.md#十一已知缺口)**：本版续出来的本体没有地方写回、静态凭据接入点连不上，这一段本版**不能通过、也不以别的场景代替**；第二段（拒绝续期 ⇒ `revoked`）不受阻（主线裁定 D-060 §八 N-39：本版已知缺口，已报产品负责人） |
| V-5 | **进程与环境**：P-8（环境白名单）与 P-12（进程组收口） | 在真实操作系统上拉起一个会再拉子进程、会打印环境的测试服务端；收口后查进程表 | [S-6](v2/contract.md#s-6-连接归桥不上签名不跨租户)、[S-26](v2/contract.md#s-26-连接的收口次序)、[S-28](v2/contract.md#s-28-据点停机与重启) | **未开始。**这两条**只能**由真实进程观察，模型检查给不出更强的证据（[S-31](v2/contract.md#s-31-本版选用哪些形式工件)） |
| V-6 | **秘密不进呈现**：P-3 | 以已知秘密串驱动全部操作与失败路径，扫描返回值、失败值 `raw`、日志、帧、结果、stderr 留存 | [S-13](v2/contract.md#s-13-凭据与引用不进任何呈现) | **未开始**；扫描**不证明**对端变形过的秘密也被遮掉（S-13 已声明不承诺） |
| V-7 | **消费者路径走查**（[CS-1～CS-4](v2/contract.md#十一消费者核对)） | 结构化走查；有提供者之后升级为真实演练 | [S-12](v2/contract.md#s-12-每次执行尝试重新列举尝试内不变)、[S-14](v2/contract.md#s-14-桥不做放行判断)、[S-16](v2/contract.md#s-16-refreshactions)、[S-19](v2/contract.md#s-19-invoke)、[S-22](v2/contract.md#s-22-beginoauth)、[S-23](v2/contract.md#s-23-completeoauth) | **未开始。**走查**不需要提供者**；CS-1 接到 `capability.asset-registry/v2#S-12`、CS-3 接到 `capability.asset-governance` v2 的 `assign`——停在别的契约不算走不通 |
| V-8 | **静态检查**（[SC-1～SC-6](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | **未开始；检查器尚不存在** |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 任何操作的签名里没有连接句柄；连接的取用键恰是 (租户, 接入点, 持有, 连接目标值, 凭据引用)——引用本身，不是解引用出的秘密 | [S-6](v2/contract.md#s-6-连接归桥不上签名不跨租户) | 未开始 |
| SC-2 | 副本的写入只有一处，且是按 `fetchedAt` 的条件写；`fetchedAt` 在发出第一页列举请求之前取；不存在把列举失败或 `not_fetched` 写成空清单的路径 | [S-7](v2/contract.md#s-7-动作清单持久副本)、[S-16](v2/contract.md#s-16-refreshactions) | 未开始 |
| SC-3 | `invoke` 的发送路径上没有重试、没有重连后重发、没有把在途请求交给另一份桥的路径 | [S-19](v2/contract.md#s-19-invoke)、[S-26](v2/contract.md#s-26-连接的收口次序)、[S-27](v2/contract.md#s-27-桥被替换或卸载) | 未开始 |
| SC-4 | 投影函数只读三个输入与实现登记的参数 schema 上限（`data.tool-definition` 的 G-16），不读时间、环境、持有方；产出的定义里不存在 `settings`、`allowBackground`、`needs`、`help`、`composes`；**规范化只有三样**（补占位说明、剥 `$schema`／`title`、恰 `{"type": "object"}` 补空 `properties`），没有别的改写 `inputSchema` 的路径，也没有回写副本的路径；**`excluded` 的 `rejection` 取不到 `schema_unsupported`**——只在 S-26 第 13 行被拒的动作走「只能以替换件出现」那一支（M37） | [S-17](v2/contract.md#s-17-projectactions) | 未开始 |
| SC-5 | stdio 拉起不经 shell；子进程环境由白名单、正文、凭据三部分显式拼出，不以据点进程环境为底 | [S-6](v2/contract.md#s-6-连接归桥不上签名不跨租户) | 未开始 |
| SC-6 | 本契约的任何类型里，凭据本体与令牌只出现在「出示」那一处；凭据引用只出现在 `completeOAuth` 的返回 | [S-13](v2/contract.md#s-13-凭据与引用不进任何呈现) | 未开始 |

## 对齐义务

**这些是本契约与同批或上游契约之间要在整批对齐时处理的事**，不是本契约自己的证据义务。

| 对齐什么 | 涉及 | 现状 |
|---|---|---|
| 副本、凭据、OAuth 绑定的住处 | 起草简报账本、主线 A-M11；`data.mcp-endpoint` 同一处 | **已对齐（2026-09-24）**：主线裁定采纳按持有存放（账本 S19-a），G-1 闭合 |
| 失败值多出四个（`callTimedOut`、`oauthNotApplicable`、`dependencyUnavailable`、`bridgeWithdrawn`）；`oauthDenied` 收四种来由 | 起草简报账本；`capability.tool-execution-runtime` 的收场映射 | **已对齐（2026-09-24）**：主线裁定采纳（账本 S19-b）；工具执行运行时 S-11 对 `invoke` 能交回的全部失败值都有映射（`bridgeWithdrawn` → `abnormal_interruption`，其余 → `implementation_error`） |
| `abnormal_interruption` 多了「桥被替换或卸载」这条来路 | `data.content-blocks` v2 的 S-18 那一行；`capability.tool-execution-runtime`「实现被撤下不影响在途」 | **已对齐（2026-09-24）**：两边都已改（G-16 闭合） |
| MCP 条目的结果端模态 | `data.tool-definition` v2 的 S-24 | **已对齐（2026-09-24）**：那边第 3 条按本契约的投影判，投不出即「任意」（账本 S19-e），G-3 闭合 |
| 投影规则就是 `data.tool-definition` 那边 G-8 的答案 | `data.tool-definition` v2 的 G-8 | **已对齐（2026-09-24）**：那边 G-8 已关闭并指向本契约 [S-17](v2/contract.md#s-17-projectactions) |
| 求值交出 `provenance` | `capability.asset-evaluation` | **已对齐（2026-09-24）**：那边 S-40 交出（`Layer` 值），本契约 S-5 的 `provenance` 改为照它，G-9 闭合 |
| 投影出的定义要过 `data.tool-definition` 的名字收窄与参数 schema 三条硬要求（产品负责人 2026-09-24 要求） | `data.tool-definition` v2 的 S-4、S-18；`data.mcp-endpoint` v2 的 S-11 | **已对齐（2026-09-24）**：[S-17](v2/contract.md#s-17-projectactions) 两种排除原因改写；**同日主线裁定由桥做最小规范化**，[G-18](v2/contract.md#十已知缺口) 关闭；接入点 name 在登记时收窄（`data.mcp-endpoint/v2#S-26`），条目名拼不出只可能因为对端动作名 |
| 会话资产注册表、工具执行运行时、交付面对本契约操作的消费登记 | `capability.asset-registry`、`capability.tool-execution-runtime`；交付面尚无契约 | 依赖方向是它们 → 本契约，由它们各自登记（2026-09-24 两份已登 catalog；会话资产注册表同日加登本契约 S-5） |
| 逐动作执行权限与执行时的接入点持有从哪来（第一轮评审 X2、X3） | `capability.asset-registry` S-11、S-24；`capability.asset-evaluation` S-6；`capability.tool-admission` S-8；`capability.tool-execution-runtime` S-23 | **已对齐（2026-09-24，D-060 §五 K30）**：会话资产注册表以此刻的求值得出持有、钉住动作集后再求一次值，二者钉进报告；本契约 [S-14](v2/contract.md#s-14-桥不做放行判断)、[S-19](v2/contract.md#s-19-invoke) ②、P-9、CS-2、CS-4 改引报告 |
| 报告里查不到条目的 MCP 调用怎样收场；`not_in_composition` 适用面（第二轮评审 B2、M-b） | `capability.loop-extension-runner` S-29 第 5 条、S-48；`capability.asset-registry` S-11、S-12；`capability.tool-admission` S-8；`capability.tool-execution-runtime` S-23 ④ | **已对齐（2026-09-25，D-060 §七 M10）**：本契约 [CS-4](v2/contract.md#cs-4-放行判断需要知道本契约做什么) 只指路；runner、会话资产注册表同为丁所写已同句；执行运行时 S-23 ② 第 6 条、④ 已读到；tool-admission S-8 已读到（2026-09-25，丙批） |

## 结果与反例

### MCP 投影的校验方法与限制

投影按 S-17 最小规范化规则重算，与规范实例按 JSON 值比较，并分别检查成条目/排除、排除原因、normalized、description 与 input；工具定义按官方元 schema及 S-4/S-26 的完整表示层要求检查。此方法不判 standInOnly 或其他操作，也不证明规范化前后同次调用参数判定相同；后者归 P-14 的表驱动测试 V-2，投影自检不替代 V-1～V-8 场景。

### 尚无的记录

V-1～V-8 **一条执行记录也没有**。起草时的手核只保证 `examples.md` 的值与它们的标注在起草者眼里不互相矛盾，
**不支持**任何一条规范场景、任何一个操作的实现、任何一条消费者走查。

本页维护验证义务、方法、前提与覆盖限制。单次执行的工具与版本、环境、配置、输入范围、步骤和原始结果留本工作树 `tmp/`，不建立永久运行索引。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建**（起草简报：形式工件不触发）。逐条理由在[契约 S-31](v2/contract.md#s-31-本版选用哪些形式工件)。
`formal-tasks.json` 里没有、也不应有本契约的任务——**「未运行」如实登记**。
**若多据点续期协议立项**（[S-30](v2/contract.md#s-30-装配给与协议给) 那一行的右列），那时要建 TLA+ 模型并登记 formal task：它有真正的并发与失联。

## 变化的影响

- **2026-09-25 修复波 3 跨批对齐（drafter 丑；候选，未冻结，原地改）**：见[实现映射反推](#实现映射反推2026-09-25)。**语义改变**：参数 schema 只在 `data.tool-definition` S-26 第 13 行被拒的对端动作，由「进 `excluded`、对 agent 不可见」改为「成条目、只能以替换件出现、原因 `schema_unsupported`」；「只能以替换件出现」的原因由一种变为闭合的两种。**操作、失败值集合与条款编号都没有变。**
- **2026-09-25 修复波 2（候选，未冻结，原地改）**：裁定出处 D-060 §七 M8、M10；评审发现处置见第二轮。
  - **语义改变**：没有——S-5 首句改正的是依据的读法（持有取此刻），S-12、S-19 ②、P-9 早已按此写；S-12 补的例外原本就在 S-16 ⑤；CS-4 只指路别的契约的收场。
  - **registry**：catalog、covers、formal-tasks、id-namespaces 不变（CS-4 引 runner、执行运行时只是指路，不登依赖；S-5 引 asset-registry S-11 也是指路——依赖方向是会话资产注册表 → 本契约，反向登记会成环）。
  - **对证据的影响**：没有既有证据；V-7 走查 CS-4 时多两支（查不到键、`not_in_composition` 不出现），仍「未开始」。
- **2026-09-25 修复波 1b（候选，未冻结，原地改）**：裁定出处 D-060 §六（L1、N-10）。
  - **L1**：设计依据表 `data.content-blocks` 那一行 S-8 的锚点随那份契约的标题改为「文本块与来路标记」（`#s-8-文本块与来路标记`）；本契约引它的语义不变。
  - **N-10，G-14 闭合**：`ConnectionHandle` 不上签名、`invoke` 按持有寻址、连接的收口次序、OAuth 落据点、由桥做最小规范化五条已登 D-060 §六；页首两行与 [S-8](v2/contract.md#s-8-oauth-绑定状态与迁移) 的「尚未汇编」改链，G-14 行改为已闭合。
  - **registry**：catalog、covers、formal-tasks、id-namespaces 不变（对 `data.content-blocks` 的消费 clauses 不变，只是锚点文字变了）。
  - **对证据的影响**：没有既有证据；场景全部仍「未开始」。

- **2026-09-24 第一轮独立评审处置（候选，未冻结，原地改）**：处置逐条见上表。
  - **产品依据 rev 复核**：PF-002 rev 17（MCP 按尝试重算进正文）→ S-12、P-7 改引正文；rev 18（组织层不持有 MCP 凭据）→ 早已落在 S-5、S-9、S-22；rev 19（「谁可以使用它」）、rev 20（连接件、拓展件不可用处置）→ 不涉本契约。PF-012 rev 11～14 → 只引的 §5.7「每一次尝试开始都要做四件事」无变化。PF-016 rev 8（组织层不持有模型凭据）→ 本契约引的 §5.6、§6.11、§6.17、§6.20 无语义变化。PF-001 rev 19 → 引的 §6.6 无变化。PF-008 rev 6～7（§6.1 清卡第三条路）→ 「不替人作答」不变，S-25 那一行照旧。
  - **语义改变**：`fetchedAt` 由列举完成时刻改为开始时刻——并发刷新留下的是后开始的那一次；`excluded` 的原因由两句散文改为两个带拒绝值的闭合取值；`beginOAuth` 的 `scope` 改按 S-5 读（被拒的情形与先前相同：都是 `scope` 不是租户格）。**操作、失败值集合与条款编号都没有变。**
  - **依据链**：账本名一律改引 D-060（§块 B PB-4、§S19、§五 K30／K34）；按尝试重算改引产品正文；仍未汇编的三条（连接不上签名、OAuth 落点、最小规范化）留在 G-14。
  - **对证据的影响**：投影实例的本地自检只判「成条目还是排除」与规范化，排除原因的新写法**未重跑**；第 3、7 节改的几行未机检（行为条款，只对读）。
  - **消费者要知道的**：执行运行时从会话资产注册表的报告取接入点持有（CS-2）；放行判断的逐动作权限同样从报告取（CS-4）。
- **起草（2026-09-23）**：首版候选，建在 PF-002 rev 16、PF-006 rev 17 上（PF-012 rev 10、PF-016 rev 5、PF-005 rev 5、PF-001 rev 16、PF-008 rev 5 只引）。
  **依赖 `data.identity-values` v1**（已接受、已冻结），引用目标不会漂移。
  **依赖 `data.mcp-endpoint`、`data.tool-definition`、`data.content-blocks`、`data.asset-model` 四份 v1**（`candidate`，未冻结）：那边若在评审中改了被消费条款的名字或形状，
  本契约的 [S-4](v2/contract.md#s-4-依赖方向与被消费的面) 依赖表、[S-17](v2/contract.md#s-17-projectactions) 投影表、[S-20](v2/contract.md#s-20-对端结果怎样成为-toolresult) 映射表与实例第 4、5 节须同轮复核。
- **同轮追加：桥被替换或卸载**（主线据块 B 拆分提案 PB-4 追加）：新增 [S-27](v2/contract.md#s-27-桥被替换或卸载) 与失败值 `bridgeWithdrawn`；原 S-27～S-36 顺延为 S-28～S-37，新增规范场景 S-38；
  [S-21](v2/contract.md#s-21-失败值与收场的对应) 对照表、[S-26](v2/contract.md#s-26-连接的收口次序) 的在途规则、[S-30](v2/contract.md#s-30-装配给与协议给) 表各加一处。**候选未冻结，原地改**；尚无外部引用本契约的条款号。
- **副本与凭据的住处**：主线已裁定按持有存放（账本 S19-a）；产品负责人若不确认而改回「在正文」，[S-7](v2/contract.md#s-7-动作清单持久副本)、[S-8](v2/contract.md#s-8-oauth-绑定状态与迁移)、[S-16](v2/contract.md#s-16-refreshactions) 的写入对象改变 ⇒ 语义改变；接受前改则原地改并重做 V-3、V-4，接受后改则出 v2。
- **2026-09-24 整批对齐（简报 S23；主线裁定 2026-09-23，待产品负责人确认，账本 S19-a～g）：原地改了候选。**
  - 凭据「还没取」由 `{ "kind": "not_fetched" }` 改为**缺席**（[S-5](v2/contract.md#s-5-接入点持有的寻址)、[S-9](v2/contract.md#s-9-凭据的出示与取用) 第 1 条、[S-24](v2/contract.md#s-24-续期清值与作废) 第 3 条；与 `data.mcp-endpoint/v2#S-13`、连接件同一种拼法）。
  - `provenance` 改为 `capability.asset-evaluation/v2#S-40` 交出的 `Layer` 值，不合形状即 `invalidInput`；来处比较改按设置层序；`provenance.credential` 不是组织或租户那一格即不出示（[S-9](v2/contract.md#s-9-凭据的出示与取用) 第 2、3 条）。新增依赖 `capability.asset-evaluation` v2（S-5、S-17、S-40）。
  - 工作区提供的 stdio 接入点由求值禁用（[S-6](v2/contract.md#s-6-连接归桥不上签名不跨租户) 第 3 条）；两端模态的投影写进 [S-17](v2/contract.md#s-17-projectactions)、[S-20](v2/contract.md#s-20-对端结果怎样成为-toolresult)；保管方作装配给（[S-2](v2/contract.md#s-2-本契约不拥有什么)、[S-30](v2/contract.md#s-30-装配给与协议给)）；OAuth 凭据跟机器（[S-8](v2/contract.md#s-8-oauth-绑定状态与迁移)）；[S-21](v2/contract.md#s-21-失败值与收场的对应) 注明失败种类由运行时定。
  - G-1、G-2、G-3、G-8、G-9、G-16 闭合；G-7、G-14、G-15 改写；新缺口 G-17。实例第 1、5、7 节随之改（`provenance` 写成 `Layer` 值、凭据缺席、第二台机器一行）。
  - **操作、失败值集合与条款编号都没有变**；消费者（注册表、工具执行运行时）引的条款号不受影响。
- **2026-09-24 随 `data.tool-definition` 的供应商 payload 要求（产品负责人 2026-09-24 要求；候选，未冻结，原地改）**：
  [S-17](v2/contract.md#s-17-projectactions) 的两种排除原因改写——条目名按 `data.mcp-endpoint/v2#S-11`（即 `data.tool-definition/v2#S-18` 的收窄）拼不出；参数 schema 过不了 `data.tool-definition` 的 S-4 与三条硬要求（`input_not_schema`、`parameter_description_missing`、M26、M27）。**不替对端补说明、不删关键字**；新缺口 G-18（要不要由桥规范化）。
  实例第 4 节：4.1 两个动作的参数补上说明（随 `data.mcp-endpoint` 实例 3.1），表里各行的 `inputSchema` 补上空 `properties`，加五行（`.`、拼接处 `:_`、顶层无 `properties`、参数无说明、`$schema`）。
  **语义改变**：常见 MCP 服务端的许多动作（参数无说明、带 `$schema`／`title`、名字带 `.`）从成条目变为被排除、对 agent 不可见——后果已报主线。操作、失败值集合与条款编号都没有变。
- **2026-09-24 修订批第五节：主线裁定 G-18（候选，未冻结，原地改）**：
  [S-17](v2/contract.md#s-17-projectactions) 加「最小规范化」一段——缺说明的动作与参数补固定占位 `对端未提供说明`、剥 `$schema`／`title`、顶层恰 `{"type": "object"}` 补空 `properties`，做过任一样的条目标 `normalized: true`（`entries` 每项恒带这个布尔）；`description` 的兜底由 `d.name` 改为占位；两种排除原因改写（名字那一种注明接入点 name 已在登记时收窄；参数 schema 那一种按规范化之后判）；**G-18 关闭**；新性质 P-14。
  抬头：PF-006 升到 rev 19、补 §5.3「说明必填」链接与主线裁定一条；[S-12](v2/contract.md#s-12-每次执行尝试重新列举尝试内不变) 的「产品修订待落」改为指 PF-006 rev 18 §6.13；S-4 对 `data.mcp-endpoint` 加 S-26。
  实例第 4 节：4.1 两项加 `normalized: false`；表里六行由「排除」或 `d.name` 兜底改为规范化后成条目，另加四行（`title` 剥掉而同名参数留着、`$ref`／`$defs` 仍排除、布尔成员 schema 仍排除、`additionalProperties` 而无 `properties` 仍排除）。
  **语义改变**：参数无说明、带 `$schema`／`title`、只写 `{"type": "object"}` 的常见 MCP 动作从「被排除、对 agent 不可见」变为成条目；缺说明的动作在 agent 面前的说明由它的名字变为「对端未提供说明」。**操作、失败值集合与条款编号都没有变**；注册表不因 `normalized` 改变行为（`capability.asset-registry/v2#S-12` 未消费它）。
  **证据**：投影实例的本地自检重跑，18 处 0 不符（见[结果与反例](#本地自检最小规范化之后的投影实例修订批2026-09-24)）。
  **已按 `data.tool-definition/v2#S-6` 维持**（主线 2026-09-24 裁定：简报那句「反向转写由桥拥有」作废）：逆转写由收到调用的一方做，桥的 `invoke` 拿到的是 `origin.remoteName`、从不见模型面前的名字；本契约不动。
- **2026-09-24 主线对修订批报回项的裁定（候选，未冻结，原地改）**：
  - **G-13 关闭**（PF-002 rev 18「组织那一层不持有 MCP 凭据」，主线 2026-09-24 落）：[S-9](v2/contract.md#s-9-凭据的出示与取用) 第 2 条只按租户格解引用、`provenance.credential` 不是 `tenant` 即 `credentialUnavailable`；[S-5](v2/contract.md#s-5-接入点持有的寻址) 那一句同步；[S-22](v2/contract.md#s-22-beginoauth) ① 只收租户格、③ 对 `organization` 也给 `oauthNotApplicable`，表下「组织格」一段改写；抬头注明 PF-002 这一行按 rev 18。
    实例第 7.1 节组织格那一行由「照常发起」改为 `oauthNotApplicable`；第 1 节的表加一行（`provenance.credential` 是 `"organization"` → `credentialUnavailable`）。**语义收紧**：原先对组织格照常发起 OAuth、按组织格解引用凭据，现在两处都拒。失败值集合不变（都是已有的值）。
  - **`normalized` 的判据**（三样里做了任一样即真）主线确认，[S-17](v2/contract.md#s-17-projectactions) 那一条标注。
  - **未知键一律拒**（`data.tool-definition/v2#S-5` 末条，主线裁定）：S-17「三样都不改变参数 schema 收哪些值」补一句按那条读法同样成立，另写明它对 MCP 条目的后果（对端不写 `additionalProperties` 的动作，未知键由执行运行时拒回、不送对端；桥不补不删）。S-4 与 catalog 对 `data.tool-definition` 的依赖加 S-5。
  - **反向转写**：已按 `data.tool-definition/v2#S-6` 维持（上一条末项）。
  - **证据**：第 4 节投影实例未改，18 处本地自检结果仍适用；第 1、7 节改的两行未机检（行为条款，只对读）。
- **[G-5](v2/contract.md#十已知缺口) 就位**（elicitation）：出 v2，[S-25](v2/contract.md#s-25-对端来的通知与请求) 那一行与 [S-21](v2/contract.md#s-21-失败值与收场的对应) 的 `no_answer` 一起改。
- **跨进程演化启动**：[S-30](v2/contract.md#s-30-装配给与协议给) 右列从「待兑现」转为「须由协议兑现」；本版的全部证据只保留其单机范围，不得外推。

结果不改写规范。发现语义问题回到来源设计（PF-002／PF-006），不在这里改契约。

## 实现映射反推（2026-09-25）

起因：修复波 3 里 `data.tool-definition` 按 D-060 §八 M37 加了拒绝值 `schema_unsupported`、给 MCP 来源开了「以同形替换件出现」的口子，`data.mcp-endpoint` S-10 同步；打标记的一方是本契约的投影，那一轮没有 drafter 负责本契约，主线在跨批对齐简报里交给丑。**裁定不代替接受**，本契约仍是 candidate。

| 裁定 | 落点 | 本契约推导的部分（已报主线） |
|---|---|---|
| **M37** 远端参数 schema 编不出或 `pattern` 超出实现上限 ⇒ `schema_unsupported`；MCP 动作条目据此 `stand_in{for: schema_unsupported}` | [S-17](v2/contract.md#s-17-projectactions)：「只能以替换件出现」改写为闭合的两种原因（执行方式；`schema_unsupported`）；`excluded` 第 2 种原因注明 `rejection` 从不是 `schema_unsupported`；判定次序补第三步（名字 → 前十二行 → 第 13 行）；⑦ 写明第 13 行依实现登记的上限；头部补一行主线裁定；[S-4](v2/contract.md#s-4-依赖方向与被消费的面) 对 `data.tool-definition` 补 S-27；G-6 一行注明只涉第 1 种原因；SC-4；examples §4 加四行 | ① **两种原因同时成立报 `schema_unsupported`**：先判定义、后判执行方式，与「先名字、后参数」同向，同一份输入同一个原因；② **⑦ 的纯函数性对第 13 行只在同一份登记的上限下成立**——照 `data.tool-definition` S-26 那条具名例外写，不另立规矩 |

**registry**：`registry/catalog.json` 本契约 → `data.tool-definition` 的 clauses 补 `S-27`（S-17 据它的末段写出「不排除、只能以替换件出现」）；covers、formal-tasks、id-namespaces 不变（没有新的产品小节链接）。
**对证据的影响**：投影实例的本地自检（2026-09-24 两次）**不判 `standInOnly`**，新加的四行未进那两次；本轮以暂存区脚本（`jsonschema` 4.26.0，Draft 2020-12，设计根下全部 Schema 按 `$id` 登表）核了第 4 节的值的**形状**：4.1 两份定义过 `SingleFunctionTool`、表里 19 份对端动作描述过 `McpToolDescriptor`，**21 处 0 不符**；投影结局本身（成条目、排除、只能以替换件出现、原因）仍只经起草者对读——第 13 行依实现登记的上限，通用校验器给不出，V-2 仍「未开始」。
**对消费者**：`capability.asset-registry` 照 S-12「原因取桥给的」装 `stand_in{for: schema_unsupported}`，不必改；`capability.tool-execution-runtime` 对替换件落「不可用」，不必改。

## 修订波（2026-09-25 公开面）

依据链：D-063 R-1（替身改为接口契约 ＋ 最小提供者）；D-060 §八 N-37 ⑤（保管方最小提供者：条目以密文落在绑定所在的同一存储，与桥 R-B5、C-1～C-3 同一约束域）、⑦（退出登录不丢 OAuth 令牌，寿命跟绑定走）、⑩（桥 C-4～C-6 本版不收）。候选未冻结，原地改。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| **凭据保管方改指 `capability.credential-custodian` v2**：解引用即它的 `resolve`，`notResolvable` ⇒ `credentialUnavailable`、`unavailable`／`custodianWithdrawn` ⇒ `dependencyUnavailable` | R-1 | [S-2](v2/contract.md#s-2-本契约不拥有什么) 那一行、[S-9](v2/contract.md#s-9-凭据的出示与取用) 第 2 条 | 不改语义，只把「保管方说……」的两种答复对上那份契约的值 |
| **S-23 ④ 的「同一提交」落成保管方的两次提交**：先收成「待生效」、绑定迁 `granted` 并记下之前交不出、迁不成的由清扫丢——对外仍「同成同败」 | 那份契约 S-16～S-18（桥节点 C-1～C-3）；N-37 ⑤ | [S-23](v2/contract.md#s-23-completeoauth) ④ ⑧ | **性质不变、表述改**：原文「两件落在同一提交里」在那份接口契约之下不再字面成立，保证改由「交不出」的判据与清扫兑现（那份契约的形式模型 `GrantedResolvable`、`OrphanEventuallySwept` 已按有限常量跑过，见它的验证入口）。**本契约的推导**，报主线确认 |
| **三项本版不收**（C-4～C-6 ↔ 那份契约 G-2～G-4）：静态凭据按持有交出（要静态凭据的接入点以 `credentialUnavailable` 连不上）、续期写回（S-24 第 1 条本版兑现不了，令牌到期人要重新取）、静态凭据出示名 | N-37 ⑩ | [G-7](v2/contract.md#十已知缺口) 再收窄、[S-9](v2/contract.md#s-9-凭据的出示与取用) 第 2、4 条、[S-24](v2/contract.md#s-24-续期清值与作废) 第 1 条下注 | **如实写出本版兑现不了的两处**；不给过渡值 |

**对齐义务（与 `capability.credential-custodian` v2）**：那份契约以坐标依赖本契约（S-5、S-8、S-9、S-23、S-30），本契约只作定义引用、**不登 catalog 依赖**（登了成环）。本契约 S-5 持有的成员、S-8 绑定的状态与迁移、`oauthPendingTtl` 一改，那份契约的 S-16～S-18 要跟着改；那份契约的交出判据或清扫三种一改，本契约 S-23 ④ 的「对外同成同败」要复核。谁先改谁在自己的「变化的影响」里点名另一边。

**没有证据因此作废**——本契约此前没有执行证据。

**报主线**：① S-23 ④ 由「同一提交」改写为「两次提交 ＋ 交不出 ＋ 清扫」（上表第二行，推导）；② S-24 第 1 条「续期不要人」本版兑现不了，**OAuth 接入点每到令牌到期都要人重新取一次**，这是产品可见的退化（PF-002 acceptance §一「续期不打扰任何人」），请主线确认本版接受；③ 要静态凭据的 MCP 接入点本版一律连不上。

**已裁（主线，2026-09-25）**：① S-23 ④ 的改写**接受**；②③ **记为本版已知缺口、报产品负责人**（主线上账本 ⑰），**契约不改**；证据一侧把那条验收标「受阻 custodian G-4／G-2」——见上 [V-4](#证据义务) 状态栏 S-36 第一段。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| **`stdioEnvAllowlist` 是一份 `EnvAllowlist`**：形状与取法定在 `capability.execution-environments/v2#S-13` 一次，与兼容件的 `hookEnvAllowlist` 两个策略点、同一个形状，各自配值 | 主线裁定（2026-09-25；候选名 `EnvAllowlist` 由主线给，无词条） | [S-6](v2/contract.md#s-6-连接归桥不上签名不跨租户) 第 3 条、[S-4](v2/contract.md#s-4-依赖方向与被消费的面) 首句与新一行 | **不改语义**：白名单原本就只取名字在上面、且环境里有的那几个；本契约**不经执行环境起进程**，只借形状。registry：本契约 → `capability.execution-environments` [S-13] 新登一条（那边不以坐标依赖本契约，无环） |
| **S-36 第一段标「受阻 custodian G-4／G-2」** | 同上裁定 | [V-4](#证据义务) 状态栏 | 证据义务不撤；本版不能通过的如实写出 |
| **绑定过期的谓词写死**：过期 ⇔ `now > since + oauthPendingTtl`（严格大于、恰等于不算，`now` 取完成那一次锁到绑定之后读的时刻），与保管方清扫同一个谓词、两边共用同一份实现（装配给，那份契约 S-19 第 2 行） | 主线裁定（D-060 §八 N-42，N7 评审） | [S-8](v2/contract.md#s-8-oauth-绑定状态与迁移) 迁移表 `pending → revoked` 一行 | **收紧表述**：原「过了」不说开闭；不改绑定的状态与迁移。对齐义务（与 `capability.credential-custodian` v2）：那边 S-18 第 2 条同一式，谁改谁点名另一边 |
