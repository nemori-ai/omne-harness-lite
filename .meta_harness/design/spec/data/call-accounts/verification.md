# 验证义务与方法

本页维护验证义务、方法、前提与限制。采用版本与接受状态从本专题入口和 registry 读取；实现状态从实际成员入口读取。单次输入、配置、结果与反例留本工作树 `tmp/`，不维护运行台账。各表的责任与缺口不因移除旧日志而关闭。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 责任与限制 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～8 节的正反实例逐条过 Schema，比对「Schema」一列。第 9 节没有「校验对象」，不参与 | Draft 2020-12 校验器 ＋ 按节绑定的 `$defs` | [S-4](v2/contract.md#s-4-未知是一个值不是零也不是缺席)～[S-17](v2/contract.md#s-17-costcorrection事后补账)、[S-29](v2/contract.md#s-29-判别式与枚举闭合) 的**形状那一面** | 只支持形状；真实引用、跨字段判定与行为须按对应义务独立核对。 |
| V-2 | **拒绝值与判定次序**：同一批反例交给边界上的校验方，比对「契约判定」一列——**逐字相同**，含 `malformed` 的组合约束那一半（Schema 放过、契约拒绝的那些行） | 边界校验方的单元测试（形式归 realization）＝ 规范场景 [S-36](v2/contract.md#s-36-拒绝值逐个) | [S-27](v2/contract.md#s-27-表示层拒绝值闭合)、[S-28](v2/contract.md#s-28-表示层校验与判定分开)、[S-29](v2/contract.md#s-29-判别式与枚举闭合) | 接收边界提供者：分类脚本只验证规则自洽，不能当成独立实现符合性。 |
| V-3 | **缺账记未知**（[S-30](v2/contract.md#s-30-缺账记未知)）：流在「记一次账」之前断；另一支载荷里有负数 | 规范场景演练 ＋ 故障注入 | [S-19](v2/contract.md#s-19-每条到达流恰一份账两次发出两份)、[S-20](v2/contract.md#s-20-缺账或被拒收记未知不伪造)、[S-28](v2/contract.md#s-28-表示层校验与判定分开) | 落点：`capability.stream-assembly` 与模型调用一侧。**必须核存储里那份账**，只看返回值会漏掉「写了 0 却返回失败」 |
| V-4 | **两次发出两笔钱**（[S-31](v2/contract.md#s-31-首-token-之前重发两笔都记)） | 规范场景演练；上游计费要能控制（受控上游或替身） | [S-19](v2/contract.md#s-19-每条到达流恰一份账两次发出两份)、[S-23](v2/contract.md#s-23-汇总已知之和与未知笔数) | 上游对首 token 之前被中断的请求是否计费，按当前 research 和该 gap 的 owner 核实（[G-6](v2/contract.md#十已知缺口)）；演练断言的是**本系统照报回的记**，不断言上游的计费行为 |
| V-5 | **补账改读数、不改原账；平局失败**（[S-32](v2/contract.md#s-32-补账改读数不改原账)） | 规范场景演练，**核原响应体的字节** | [S-17](v2/contract.md#s-17-costcorrection事后补账)、[S-18](v2/contract.md#s-18-原账不改)、[S-22](v2/contract.md#s-22-有效费用)、[S-23](v2/contract.md#s-23-汇总已知之和与未知笔数) | 需要补账的写入者与汇总的读面。平局那一支最容易被「取第一条」糊过去，**必须真跑** |
| V-6 | **镜像不重复计**（[S-33](v2/contract.md#s-33-工具执行三笔一笔未知一笔镜像)） | 规范场景演练；逐项对照 [`examples.md` 第 9 节](v2/examples.md#9-手算汇总规则) 的手算 | [S-10](v2/contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)、[S-12](v2/contract.md#s-12-总额未知不当零加)、[S-22](v2/contract.md#s-22-有效费用)～[S-25](v2/contract.md#s-25-按尝试记明细按-run-汇总) | 另须演练第 9.5 节第四行（镜像所指的响应没归进同一组）——**它不会报错，只会少一笔钱**，归属的前提在 [G-3](v2/contract.md#十已知缺口) |
| V-7 | **账不进给模型看的上下文**（[S-34](v2/contract.md#s-34-账不进给模型看的上下文)） | 规范场景演练，**核组装的输入**，不只核组装出的消息 | [S-21](v2/contract.md#s-21-账进日志不进给模型看的上下文) | 落点：上下文组装与 `capability.stream-assembly` |
| V-8 | **砍了要说**（[S-35](v2/contract.md#s-35-砍了要说)） | 规范场景演练：节流 ＋ 一帧超长 ＋ 撞额度 | [S-11](v2/contract.md#s-11-toolcallaccount一次工具执行的账)、[S-15](v2/contract.md#s-15-trimreason-与-trimsummary砍了要说) | 落点：做砍的那一方（到达语法的装配）。**「送达的 + merged + cut = emitted」要逐帧对**，只核三式会漏掉一帧哪一项都没计上 |
| V-9 | **装配给的保证**（[S-26](v2/contract.md#s-26-装配给的保证-vs-协议须给的保证) 左列六行） | 装配设计对十进制处理、幂等落盘、时间源与条目归属的选型声明 ＋ 架构评审 | [S-5](v2/contract.md#s-5-金额美元十进制不截断)、[S-14](v2/contract.md#s-14-wallclock)、[S-17](v2/contract.md#s-17-costcorrection事后补账)、[S-19](v2/contract.md#s-19-每条到达流恰一份账两次发出两份)、[S-24](v2/contract.md#s-24-汇总不重复计) | 不是可跑的义务；它们失效的形态都是**静默算错**，上面七条场景大多测不出 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。检查器形式归 realization。

| # | 检查什么 | 对应条款 | 责任 |
|---|---|---|---|
| SC-1 | 上下文组装的输入类型里不出现本契约的任何值（`Usage`、`Cost`、`ToolCallAccount`、`CostCorrection`、汇总结果） | [S-21](v2/contract.md#s-21-账进日志不进给模型看的上下文) | 验证义务 |
| SC-2 | 汇总的实现只从权威位置取：不读 `total_usd`、不读 `service = model_call` 的那几笔、不读 `ToolCallAccount.usage` | [S-24](v2/contract.md#s-24-汇总不重复计) | 验证义务 |
| SC-3 | 任何存储与交换形状里不出现 `cache_tokens`、`total_tokens`；不存在把有效费用或汇总写回成账或补账的路径 | [S-7](v2/contract.md#s-7-派生量cache_tokens-与-total_tokens)、[S-18](v2/contract.md#s-18-原账不改) | 验证义务 |
| SC-4 | 写 `Cost.cost_usd` 的路径上不读任何价目表或估算；写原账的路径上不产生 `source: later_correction` | [S-8](v2/contract.md#s-8-cost一次发出的费用)、[S-18](v2/contract.md#s-18-原账不改) | 验证义务 |

## 结果与反例

### 调用账形状的校验方法与限制

Schema 和跨契约引用解析到实际公共定义，逐行比对实例的 Schema 列；契约判定与拒绝次序由对应行为检查验证。以 OpaqueIdentifier 代替 CallId 的形状不能证明真实 CallId 校验。按条款另写分类脚本只检查自洽，不是独立实现符合性；两者均不证明 S-18～S-25 的写入、流、组装或求值。

Schema、具名拒绝、规范场景、静态检查与真实组合分别判读，不能互相冒充。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建**；理由在[包入口](README.md#版本包)与[契约第十二节](v2/contract.md#十二版本差异与规范工件)。
**这不是把义务省掉**：它们被改写成上表的 V-1～V-9 与 SC-1～SC-4。本契约的值与判定义务按上表验证，不建立没有性质价值的平行形式模型。

## 变化的影响

规范内容归 [v2 contract](v2/contract.md)，不在本页维护形成过程。CallId 的实际形状与会话日志唯一范围从 content-blocks 的 S-14 消费；补账目标、判重与归组须按目标的精确身份范围检查，不用不透明字符串替身替代。

TrimReason、Usage、Cost、TrimSummary 的拥有者仍是本契约；arrival-events 引用这些定义，不能另加第五个原因或未知分支而保持此处不变。按 S-38/S-39 验证用量归凭据格、成本归发起租户；出厂格是两种归属分叉点。MCP凭据只在租户格，镜像费用不得重复汇总；late 的锚按账种类区分，ModelResponse 按发出所在 attemptId。

G-3 同组/归组、G-6 上游计费、G-7/G-12 obtainedVia或发起者表示、G-8跨进程等未决面按现行contract的owner接续。跨进程时S-26六条装配前提须由协议兑现，单机范围不得外推。

## 后继版本的验证入口

[v3 验证义务](v3/verification.md) 与 [v4 验证义务](v4/verification.md) 维护后继引用、发布、ACK和清理责任，不能由旧输入上的形状或模型结果宣称它们已兑现。
## 对齐义务

- **定义性引用与落点的复核**（本契约引用、不登 catalog 依赖的三处）：`data.arrival-events/v2#S-23` 第 1 条改了「一帧」的单位，本契约 [S-11](v2/contract.md#s-11-toolcallaccount一次工具执行的账)、[S-15](v2/contract.md#s-15-trimreason-与-trimsummary砍了要说) 同轮复核；`capability.tool-execution-runtime/v2#S-14` 改了外部效果确定性的三值或投影，本契约 S-11 的两值含义同轮复核；`capability.stream-assembly/v2#S-14` 不再兑现「每帧至多计一次」，S-15 的不等式失去前提。
- **`ModelResponse.late`**：`data.model-response` 的 `late` 须与 [S-39](v2/contract.md#s-39-晚到的账) 同一含义、同一写法（可选、只取 `true`、缺席 = 不晚），**锚是发出所在的尝试**（`attemptId`）；那份契约改写法或改锚时本条同轮复核。
- **接入点规范串的分隔符**：本契约与实例按 `data.asset-model/v2#S-3` 写 `<category>/<name>`，不另造接入点规范串。
