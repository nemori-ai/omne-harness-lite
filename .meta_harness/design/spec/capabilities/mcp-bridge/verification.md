# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`capability.mcp-bridge` v1 是 `candidate`，未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。
> 七条规范场景、四条消费者核对场景、六条静态检查**一条都未执行**；[`examples.md`](v1/examples.md) 里的值**没有过任何校验器**——文件存在不代替结果。
> 起草时跑过的是 `make design-check`：它核对了 Markdown 链接与锚点、registry 登记——**它不校验任何实例、不执行任何场景**。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 实际状态 |
|---|---|---|---|---|
| V-1 | **实例里的值过各自的 Schema**：[`examples.md`](v1/examples.md) 第 4.1 节两份工具定义过 `data.tool-definition/v1` 的 `SingleFunctionTool`；第 5 节的 `ToolResult` 与块过 `ToolResult`／`ContentBlock`；第 7 节的绑定过 `data.mcp-endpoint/v1` 的 `OAuthBinding` | Draft 2020-12 校验器（能按 `$id` 解析到四份数据契约的 Schema） | [S-17](v1/contract.md#s-17-projectactions)、[S-20](v1/contract.md#s-20-对端结果怎样成为-toolresult)、[S-8](v1/contract.md#s-8-oauth-绑定状态与迁移) 的**形状那一面** | **未运行。**起草者手核（[实例第 9 节](v1/examples.md#9-起草者逐条自核)）；**手核不是证据** |
| V-2 | **投影与结果映射的逐项取值**：实例第 4、5 节每一行，给定输入、比对输出 | 投影函数与结果映射的表驱动测试（纯函数，不需要对端） | [S-17](v1/contract.md#s-17-projectactions)、[S-20](v1/contract.md#s-20-对端结果怎样成为-toolresult) | **未开始**；需要提供者 |
| V-3 | **操作结局**：实例第 1、3、6、7 节每一行，在受控的对端（可编排的 MCP 测试服务端：可拉不起、可超时、可分页、可发坏项、可断线、可要 OAuth）上复现 | 集成测试；存储、保管方、时间源可注入不可用 | [S-5](v1/contract.md#s-5-接入点持有的寻址)～[S-9](v1/contract.md#s-9-凭据的出示与取用)、[S-16](v1/contract.md#s-16-refreshactions)、[S-18](v1/contract.md#s-18-availability)、[S-19](v1/contract.md#s-19-invoke)、[S-22](v1/contract.md#s-22-beginoauth)～[S-24](v1/contract.md#s-24-续期清值与作废) | **未开始** |
| V-4 | **规范场景** [S-32](v1/contract.md#s-32-连不上时照上一份清单装替换件)～[S-38](v1/contract.md#s-38-桥换代时在途调用落异常中断)：每条一个正例、一个反例 | 规范场景演练；**反例要能让一个故意写错的实现失败** | [S-7](v1/contract.md#s-7-动作清单持久副本)、[S-9](v1/contract.md#s-9-凭据的出示与取用)、[S-19](v1/contract.md#s-19-invoke)、[S-23](v1/contract.md#s-23-completeoauth)、[S-24](v1/contract.md#s-24-续期清值与作废)、[S-27](v1/contract.md#s-27-桥被替换或卸载) | **未执行。**S-35 与 S-38 **必须在对端观察请求次数**：只看收场会漏掉重发；S-36 **必须观察配值的写入记录**：只看凭据可用会漏掉「续期被写成了改值」 |
| V-5 | **进程与环境**：P-8（环境白名单）与 P-12（进程组收口） | 在真实操作系统上拉起一个会再拉子进程、会打印环境的测试服务端；收口后查进程表 | [S-6](v1/contract.md#s-6-连接归桥不上签名不跨租户)、[S-26](v1/contract.md#s-26-连接的收口次序)、[S-28](v1/contract.md#s-28-据点停机与重启) | **未开始。**这两条**只能**由真实进程观察，模型检查给不出更强的证据（[S-31](v1/contract.md#s-31-本版选用哪些形式工件)） |
| V-6 | **秘密不进呈现**：P-3 | 以已知秘密串驱动全部操作与失败路径，扫描返回值、失败值 `raw`、日志、帧、结果、stderr 留存 | [S-13](v1/contract.md#s-13-凭据与引用不进任何呈现) | **未开始**；扫描**不证明**对端变形过的秘密也被遮掉（S-13 已声明不承诺） |
| V-7 | **消费者路径走查**（[CS-1～CS-4](v1/contract.md#十一消费者核对)） | 结构化走查；有提供者之后升级为真实演练 | [S-12](v1/contract.md#s-12-每次执行尝试重新列举尝试内不变)、[S-14](v1/contract.md#s-14-桥不做放行判断)、[S-16](v1/contract.md#s-16-refreshactions)、[S-19](v1/contract.md#s-19-invoke)、[S-22](v1/contract.md#s-22-beginoauth)、[S-23](v1/contract.md#s-23-completeoauth) | **未开始。**走查**不需要提供者**；CS-1 停在注册表、CS-3 停在资产治理，二者不在本工作树——停在别的契约不算走不通 |
| V-8 | **静态检查**（[SC-1～SC-6](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | **未开始；检查器尚不存在** |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。本版全部状态为「未开始」，**不得以「已列出」充当「已通过」**。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 任何操作的签名里没有连接句柄；连接的取用键恰是 (租户, 接入点, 持有, 连接目标值, 凭据值) | [S-6](v1/contract.md#s-6-连接归桥不上签名不跨租户) | 未开始 |
| SC-2 | 副本的写入只有一处，且是按 `fetchedAt` 的条件写；不存在把列举失败或 `not_fetched` 写成空清单的路径 | [S-7](v1/contract.md#s-7-动作清单持久副本)、[S-16](v1/contract.md#s-16-refreshactions) | 未开始 |
| SC-3 | `invoke` 的发送路径上没有重试、没有重连后重发、没有把在途请求交给另一份桥的路径 | [S-19](v1/contract.md#s-19-invoke)、[S-26](v1/contract.md#s-26-连接的收口次序)、[S-27](v1/contract.md#s-27-桥被替换或卸载) | 未开始 |
| SC-4 | 投影函数只读三个输入，不读时间、环境、持有方；产出的定义里不存在 `settings`、`allowBackground`、`needs`、`help`、`composes` | [S-17](v1/contract.md#s-17-projectactions) | 未开始 |
| SC-5 | stdio 拉起不经 shell；子进程环境由白名单、正文、凭据三部分显式拼出，不以据点进程环境为底 | [S-6](v1/contract.md#s-6-连接归桥不上签名不跨租户) | 未开始 |
| SC-6 | 本契约的任何类型里，凭据本体与令牌只出现在「出示」那一处；凭据引用只出现在 `completeOAuth` 的返回 | [S-13](v1/contract.md#s-13-凭据与引用不进任何呈现) | 未开始 |

## 对齐义务

**这些是本契约与同批或上游契约之间要在整批对齐时处理的事**，不是本契约自己的证据义务。

| 对齐什么 | 涉及 | 现状 |
|---|---|---|
| 副本、凭据、OAuth 绑定的住处 | 起草简报账本、主线 A-M11；`data.mcp-endpoint` 同一处 | 本契约与 `data.mcp-endpoint` 按持有存、不在正文，**已报主线改判**（[G-1](v1/contract.md#十已知缺口)） |
| 失败值多出四个（`callTimedOut`、`oauthNotApplicable`、`dependencyUnavailable`、`bridgeWithdrawn`）；`oauthDenied` 收四种来由 | 起草简报账本 | 已报主线确认（[S-15](v1/contract.md#s-15-这一节每个操作写全九件事)） |
| `abnormal_interruption` 多了「桥被替换或卸载」这条来路 | `data.content-blocks` v1 的 S-18 那一行；`capability.tool-execution-runtime`「实现被撤下不影响在途」 | 两边都未改（[G-16](v1/contract.md#十已知缺口)） |
| MCP 条目的结果端模态 | `data.tool-definition` v1 的 S-24 | 按现行规则带图片的 MCP 结果「违反声明」（[G-3](v1/contract.md#十已知缺口)） |
| 投影规则就是 `data.tool-definition` 那边 G-8 的答案 | `data.tool-definition` v1 的 G-8 | 那边待把 G-8 改成指向本契约 [S-17](v1/contract.md#s-17-projectactions) |
| 求值交出 `provenance` | `capability.asset-evaluation` | 那边未建立；在它交出之前本契约不出示凭据（[G-9](v1/contract.md#十已知缺口)） |
| 注册表、工具执行运行时、交付面对本契约操作的消费登记 | 同批三份 | 依赖方向是它们 → 本契约，由它们各自登记 |

## 结果与反例

### 尚无的记录

V-1～V-8 **一条执行记录也没有**。起草时的手核只保证 `examples.md` 的值与它们的标注在起草者眼里不互相矛盾，
**不支持**任何一条规范场景、任何一个操作的实现、任何一条消费者走查。

首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；原始产物归 [record/evidence/](../../../record/evidence/README.md)。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建**（起草简报：形式工件不触发）。逐条理由在[契约 S-31](v1/contract.md#s-31-本版选用哪些形式工件)。
`formal-tasks.json` 里没有、也不应有本契约的任务——**「未运行」如实登记**。
**若多据点续期协议立项**（[S-30](v1/contract.md#s-30-装配给与协议给) 那一行的右列），那时要建 TLA+ 模型并登记 formal task：它有真正的并发与失联。

## 变化的影响

- **起草（2026-09-23）**：首版候选，建在 PF-002 rev 16、PF-006 rev 17 上（PF-012 rev 10、PF-016 rev 5、PF-005 rev 5、PF-001 rev 16、PF-008 rev 5 只引）。
  **依赖 `data.identity-values` v1**（已接受、已冻结），引用目标不会漂移。
  **依赖 `data.mcp-endpoint`、`data.tool-definition`、`data.content-blocks`、`data.asset-model` 四份 v1**（`candidate`，未冻结）：那边若在评审中改了被消费条款的名字或形状，
  本契约的 [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 依赖表、[S-17](v1/contract.md#s-17-projectactions) 投影表、[S-20](v1/contract.md#s-20-对端结果怎样成为-toolresult) 映射表与实例第 4、5 节须同轮复核。
- **同轮追加：桥被替换或卸载**（主线据块 B 拆分提案 PB-4 追加）：新增 [S-27](v1/contract.md#s-27-桥被替换或卸载) 与失败值 `bridgeWithdrawn`；原 S-27～S-36 顺延为 S-28～S-37，新增规范场景 S-38；
  [S-21](v1/contract.md#s-21-失败值与收场的对应) 对照表、[S-26](v1/contract.md#s-26-连接的收口次序) 的在途规则、[S-30](v1/contract.md#s-30-装配给与协议给) 表各加一处。**候选未冻结，原地改**；尚无外部引用本契约的条款号。
- **主线改判副本与凭据的住处**（[G-1](v1/contract.md#十已知缺口)）：若维持「在正文」，[S-7](v1/contract.md#s-7-动作清单持久副本)、[S-8](v1/contract.md#s-8-oauth-绑定状态与迁移)、[S-16](v1/contract.md#s-16-refreshactions) 的写入对象改变 ⇒ 语义改变；接受前改则原地改并重做 V-3、V-4，接受后改则出 v2。
- **[G-2](v1/contract.md#十已知缺口) 被裁决**（stdio 拉起要不要单列确认）：若加一道确认，[S-6](v1/contract.md#s-6-连接归桥不上签名不跨租户) 第 3 条与 [S-16](v1/contract.md#s-16-refreshactions) ② 加一个前置与一个失败值 ⇒ 语义改变。
- **[G-5](v1/contract.md#十已知缺口) 就位**（elicitation）：出 v2，[S-25](v1/contract.md#s-25-对端来的通知与请求) 那一行与 [S-21](v1/contract.md#s-21-失败值与收场的对应) 的 `no_answer` 一起改。
- **跨进程演化启动**：[S-30](v1/contract.md#s-30-装配给与协议给) 右列从「待兑现」转为「须由协议兑现」；本版的全部证据只保留其单机范围，不得外推。

结果不改写规范。发现语义问题回到来源设计（PF-002／PF-006），不在这里改契约。
