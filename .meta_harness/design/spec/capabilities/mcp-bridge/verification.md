# 验证义务与方法

本页维护验证义务、方法、前提与范围。采用与接受状态从专题入口/registry 读取；实际实现从成员入口读取。执行输入、配置、结果和反例留工作树 tmp，不维护运行台账。义务列出与日志移除均不能代替符合性或关闭缺口。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 |责任与限制|
|---|---|---|---|---|
| V-1 | **实例里的值过各自的 Schema**：[`examples.md`](v2/examples.md) 第 4.1 节两份工具定义过 `data.tool-definition/v2` 的 `SingleFunctionTool`；第 5 节的 `ToolResult` 与块过 `ToolResult`／`ContentBlock`；第 7 节的绑定过 `data.mcp-endpoint/v2` 的 `OAuthBinding` | Draft 2020-12 校验器（能按 `$id` 解析到四份数据契约的 Schema） | [S-17](v2/contract.md#s-17-projectactions)、[S-20](v2/contract.md#s-20-对端结果怎样成为-toolresult)、[S-8](v2/contract.md#s-8-oauth-绑定状态与迁移) 的**形状那一面** | 具体值按所属数据Schema核，手核只支持自洽，不验证边界行为。 |
| V-2 | **投影与结果映射的逐项取值**：实例第 4、5 节每一行，给定输入、比对输出 | 投影函数与结果映射的表驱动测试（纯函数，不需要对端） | [S-17](v2/contract.md#s-17-projectactions)、[S-20](v2/contract.md#s-20-对端结果怎样成为-toolresult) | 投影/结果映射提供者逐行核真实函数，包括normalized、standInOnly及原因。 |
| V-3 | **操作结局**：实例第 1、3、6、7 节每一行，在受控的对端（可编排的 MCP 测试服务端：可拉不起、可超时、可分页、可发坏项、可断线、可要 OAuth）上复现 | 集成测试；存储、保管方、时间源可注入不可用 | [S-5](v2/contract.md#s-5-接入点持有的寻址)～[S-9](v2/contract.md#s-9-凭据的出示与取用)、[S-16](v2/contract.md#s-16-refreshactions)、[S-18](v2/contract.md#s-18-availability)、[S-19](v2/contract.md#s-19-invoke)、[S-22](v2/contract.md#s-22-beginoauth)～[S-24](v2/contract.md#s-24-续期清值与作废) | 真实受控对端与可故障注入依赖组合验证。 |
| V-4 | **规范场景** [S-32](v2/contract.md#s-32-连不上时照上一份清单装替换件)～[S-38](v2/contract.md#s-38-桥换代时在途调用落异常中断)：每条一个正例、一个反例 | 规范场景演练；**反例要能让一个故意写错的实现失败** | [S-7](v2/contract.md#s-7-动作清单持久副本)、[S-9](v2/contract.md#s-9-凭据的出示与取用)、[S-19](v2/contract.md#s-19-invoke)、[S-23](v2/contract.md#s-23-completeoauth)、[S-24](v2/contract.md#s-24-续期清值与作废)、[S-27](v2/contract.md#s-27-桥被替换或卸载) | S-35/S-38在对端数请求，S-36观察配值写记录。S-36无感续期受阻custodian G-4/G-2：续期本体写回与静态凭据来源须由owner闭合，不能以别场景代替；拒绝续期⇒revoked另验。 |
| V-5 | **进程与环境**：P-8（环境白名单）与 P-12（进程组收口） | 在真实操作系统上拉起一个会再拉子进程、会打印环境的测试服务端；收口后查进程表 | [S-6](v2/contract.md#s-6-连接归桥不上签名不跨租户)、[S-26](v2/contract.md#s-26-连接的收口次序)、[S-28](v2/contract.md#s-28-据点停机与重启) | 只能由真实进程、后代与环境观察验证，模型不能替代。 |
| V-6 | **秘密不进呈现**：P-3 | 以已知秘密串驱动全部操作与失败路径，扫描返回值、失败值 `raw`、日志、帧、结果、stderr 留存 | [S-13](v2/contract.md#s-13-凭据与引用不进任何呈现) | 真实秘密扫描不证明对端变形过的秘密也被遮掉，按S-13限域。 |
| V-7 | **消费者路径走查**（[CS-1～CS-4](v2/contract.md#十一消费者核对)） | 结构化走查；有提供者之后升级为真实演练 | [S-12](v2/contract.md#s-12-每次执行尝试重新列举尝试内不变)、[S-14](v2/contract.md#s-14-桥不做放行判断)、[S-16](v2/contract.md#s-16-refreshactions)、[S-19](v2/contract.md#s-19-invoke)、[S-22](v2/contract.md#s-22-beginoauth)、[S-23](v2/contract.md#s-23-completeoauth) | CS-1消费asset-registryS-12，CS-3消费asset-governance assign；其他owner的结果不能当本桥组合检查。 |
| V-8 | **静态检查**（[SC-1～SC-6](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | 实现拥有者提供可失败静态检查，含负控。 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。义务列出与文件存在均不能代替实际检查。

| # | 检查什么 | 对应条款 |责任|
|---|---|---|---|
| SC-1 | 任何操作的签名里没有连接句柄；连接的取用键恰是 (租户, 接入点, 持有, 连接目标值, 凭据引用)——引用本身，不是解引用出的秘密 | [S-6](v2/contract.md#s-6-连接归桥不上签名不跨租户) | 验证义务 |
| SC-2 | 副本的写入只有一处，且是按 `fetchedAt` 的条件写；`fetchedAt` 在发出第一页列举请求之前取；不存在把列举失败或 `not_fetched` 写成空清单的路径 | [S-7](v2/contract.md#s-7-动作清单持久副本)、[S-16](v2/contract.md#s-16-refreshactions) | 验证义务 |
| SC-3 | `invoke` 的发送路径上没有重试、没有重连后重发、没有把在途请求交给另一份桥的路径 | [S-19](v2/contract.md#s-19-invoke)、[S-26](v2/contract.md#s-26-连接的收口次序)、[S-27](v2/contract.md#s-27-桥被替换或卸载) | 验证义务 |
| SC-4 | 投影函数只读三个输入与实现登记的参数 schema 上限（`data.tool-definition` 的 G-16），不读时间、环境、持有方；产出的定义里不存在 `settings`、`allowBackground`、`needs`、`help`、`composes`；**规范化只有三样**（补占位说明、剥 `$schema`／`title`、恰 `{"type": "object"}` 补空 `properties`），没有别的改写 `inputSchema` 的路径，也没有回写副本的路径；**`excluded` 的 `rejection` 取不到 `schema_unsupported`**——只在 S-26 第 13 行被拒的动作走「只能以替换件出现」那一支（M37） | [S-17](v2/contract.md#s-17-projectactions) | 验证义务 |
| SC-5 | stdio 拉起不经 shell；子进程环境由白名单、正文、凭据三部分显式拼出，不以据点进程环境为底 | [S-6](v2/contract.md#s-6-连接归桥不上签名不跨租户) | 验证义务 |
| SC-6 | 本契约的任何类型里，凭据本体与令牌只出现在「出示」那一处；凭据引用只出现在 `completeOAuth` 的返回 | [S-13](v2/contract.md#s-13-凭据与引用不进任何呈现) | 验证义务 |

## 结果与反例

### MCP 投影的校验方法与限制

投影按 S-17 最小规范化规则重算，与规范实例按 JSON 值比较，并分别检查成条目/排除、排除原因、normalized、description 与 input；工具定义按官方元 schema及 S-4/S-26 的完整表示层要求检查。此方法不判 standInOnly 或其他操作，也不证明规范化前后同次调用参数判定相同；后者归 P-14 的表驱动测试 V-2，投影自检不替代 V-1～V-8 场景。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建**。逐条理由在[契约 S-31](v2/contract.md#s-31-本版选用哪些形式工件)。
`formal-tasks.json` 里没有、也不应有本契约的任务。
**若多据点续期协议立项**（[S-30](v2/contract.md#s-30-装配给与协议给) 那一行的右列），那时要建 TLA+ 模型并登记 formal task：它有真正的并发与失联。

## 对齐义务

- mcp-endpoint拥有按持有存放的副本、凭据与OAuth绑定；asset-evaluation S-40给provenance Layer值，凭据仅租户格可解引用，未取为缺席。注册表报告钉住实际动作集、执行持有和逐动作权限；桥不自做放行。
- tool-execution-runtime映射invoke失败：bridgeWithdrawn为abnormal_interruption，其他具名桥失败为implementation_error；桥不重发，报告查不到与not_in_composition的边界按runner/registry/admission/执行owner核。
- 逆转写在工具执行运行时，桥只收origin.remoteName，不见模型面名；投影名字需tool-definition窄字符/保留串/长度，参数最小规范化后须完整表示校验。规范化仅补占位说明、剥$schema/title、恰object补空properties，任一做过即normalized，不修改副本。
- schema_unsupported 不进excluded，只能同形stand_in；名字→前十二步定义→第十三步→执行方式顺序，两原因同时成立优先schema_unsupported。纯投影对第十三步仅在同一份登记实现上限下成立；通用Schema不能判该行。
- command input顶层未知键默认拒归tool-definition，桥不能补删additionalProperties；参数模态按当前工具定义S-24 owner核，不照过时投影状态另造标准。

## 变化的影响

规范内容归 [v2 contract](v2/contract.md)。持有寻址与连接键、fetchedAt开始时刻、条件写副本、尝试内动作集不变、OAuth绑定状态和失败映射变化时同步实际消费者及V-1～V-8，不维护修订账本。

credential-custodian v2 resolve的notResolvable映射credentialUnavailable，unavailable/custodianWithdrawn映射dependencyUnavailable。OAuth对外同成同败由两次提交、待生效交不出、绑定granted及孤儿清扫共同兑现；不能改回同一数据库提交的字面承诺，也不能拿custodian有限模型证明实际共同约束域。

静态凭据接入点和续期写回若custodian G-2/G-4未闭合，仍是明确产品缺口，令牌到期需重新取；退出登录不能清OAuth令牌，寿命跟绑定。EnvAllowlist形状归execution-environments S-13，stdioEnvAllowlist与hookEnvAllowlist各自配置，桥只借形状，不经执行环境起进程。

绑定过期严格为now > since + oauthPendingTtl，恰等于不算；now在完成操作锁绑定后读。桥与custodian的实现必须同谓词。S-5/S-8/S-9/S-23/S-30或清扫交出判据变化时互相复核，依赖环不因指路制造。多据点续期协议立项再建立其并发失联模型，单机协议保证不可外推。
