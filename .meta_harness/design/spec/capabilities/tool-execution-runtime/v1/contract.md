# capability.tool-execution-runtime v1

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.tool-execution-runtime, 1)`
- **设计依据**（PF-006 rev 17）：
  [§4 Tool Execution](../../../../product/PF-006-tools-and-skills/design.md#tool-execution)、
  [§4 两个原语](../../../../product/PF-006-tools-and-skills/design.md#工具跟外面通信的两个原语)（[等待态](../../../../product/PF-006-tools-and-skills/design.md#等待态)、[发帧](../../../../product/PF-006-tools-and-skills/design.md#发帧)、[帧长什么样由一份协议约定](../../../../product/PF-006-tools-and-skills/design.md#帧长什么样由一份协议约定不由工具定义声明)）、
  [§4 工具的产出](../../../../product/PF-006-tools-and-skills/design.md#工具的产出)、[§4 卸载](../../../../product/PF-006-tools-and-skills/design.md#卸载)、
  [§5.2](../../../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)、
  [§5.4 两种写法](../../../../product/PF-006-tools-and-skills/design.md#54-返回值两种写法一种模型)、[§5.4 每一次执行都留一份账](../../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账)、
  [§5.5 六种收场](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)、
  [§6.3 替换件](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)、
  [§6.5](../../../../product/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)、
  [§6.6](../../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)、
  [§6.7](../../../../product/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败)、
  [§6.8](../../../../product/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求)、
  [§6.10](../../../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)、
  [§6.12](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)、
  [§6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)；
  [flows §1.5](../../../../product/PF-006-tools-and-skills/flows.md#15-一次工具执行的生命周期)～[§1.7](../../../../product/PF-006-tools-and-skills/flows.md#17-用户中断一次执行)、
  [flows §二](../../../../product/PF-006-tools-and-skills/flows.md#二异常分支)、[flows §3.2](../../../../product/PF-006-tools-and-skills/flows.md#32-一次工具执行)、[flows §四](../../../../product/PF-006-tools-and-skills/flows.md#四谁决定什么)
- **相邻依据**：PF-012 rev 10 [§5.7 三个运行时](../../../../product/PF-012-agent-loop-and-run/design.md#三个运行时停机之后各算什么)、
  [§5.7 先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)、
  [§5.8 一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个)、
  [§5.10 卸载那一关](../../../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)、
  [§6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)、[§6.14](../../../../product/PF-012-agent-loop-and-run/design.md#614-停止有两级)、
  [§6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号)、[§6.17](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)；
  PF-009 rev 7 [ToolInternalMessage](../../../../product/PF-009-context-message-types/design.md#toolinternalmessage)、
  [§9.2 在途状态](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)；
  PF-007 rev 16 [§6.4 `Shell()`](../../../../product/PF-007-meta-capabilities/design.md#64-shell通向命令行)、[§6.10 `BkgJobs()`](../../../../product/PF-007-meta-capabilities/design.md#610-bkgjobs通向自己发起的执行)、[§6.11 `Ask()`](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人)；
  PF-008 rev 5 [等待态的两个维度](../../../../product/PF-008-human-in-the-loop/design.md#等待态的两个维度)、[§6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)、[§6.4](../../../../product/PF-008-human-in-the-loop/design.md#64-两个答复入口一张卡片只能答一次)；
  PF-014 rev 5 [§5.4 插队停在哪就怎么办](../../../../product/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办)；
  PF-015 rev 11 [§6.3](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态)、[§6.4](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#64-撤销归档只还给你状态)、[§6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)；
  PF-005 rev 5 [§6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)；
  PF-000 rev 1 [§5.5](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段)；
  PF-011 rev 4 [非常态](../../../../product/PF-011-off-nominal-handling/design.md#非常态)、[上交](../../../../product/PF-011-off-nominal-handling/design.md#上交)；
  [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)、
  [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md#sys-observability全链路可观测与日志完备)
- **决定**：[D-032](../../../../record/decisions/tool-execution-runtime-baseline/decision.md)（自研；两源已知失败情形列为测试义务，
  来源见[提案](../../../../record/proposals/tool-execution-runtime-baseline/alternatives.md#a--fork-dsh-jobsjobsjobs-localtool-jobs-再改造)）、
  [D-035](../../../../record/decisions/message-and-stream-baseline/decision.md)（帧与模型回复同一到达语法）、
  [D-037](../../../../record/decisions/mcp-client-adoption/decision.md)（MCP 挂起调用断开即落失败、不重放）、
  [D-038](../../../../record/decisions/message-and-shape-rulings/decision.md)（Q15：真实结果落哪种消息只看有没有占位；Q18：在途状态由运行时持有）
- **主线裁定，转述自主线施工简报，决定记录落地中**（设计链里暂无处可链，见 [G-13](#十二已知缺口)）：
  宿主恒为会话、没有换手；停机收场是 `failed`、原因 `abnormal_interruption`；以 `CallId` 指认、不另立执行标识；
  卸载判定在本能力之外、本能力只存原始结果；答复者是人或另一个 agent、同一入口；超时是前台上限、并发是同一工具同时执行的上限、超出排队；
  一批依次执行；执行时才发现落点不到位落 `failed`；实现撤下不影响在途、**MCP 动作例外**（随桥换代落异常中断，由 `capability.mcp-bridge` 兑现）；
  恢复对账同时关闭其阻塞执行已终局的决策卡片（`superseded`，**待产品负责人确认**）；执行记录与会话日志的「不得只成一半」由装配给、不在契约里选形状；
  占位原因新增 `run_cancelled`、`backgrounded_at_start`、`terminated_by_agent`；放行判断缺席即全拒；
  执行前核凭据的面是 `verifyToken(token, call, session)`；注册表判为不可用的条目被调用时落 `failed` 并带注册表给的原因；
  运行终结之后结束的后台执行照样落账并归该运行（PF-012 I-11 的收窄）
- **精确语义依赖**（七项已登记，消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)）：
  - `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1`
  - `omne-harness-lite-design-2026-09-15 · data.call-accounts · v1`
  - `omne-harness-lite-design-2026-09-15 · data.messages · v1`
  - `omne-harness-lite-design-2026-09-15 · data.tool-definition · v1`
  - `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1`
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`
  - **另六项与本契约并行起草、本基线里没有坐标**（检查器拒绝未知坐标，合流对齐时补登）：
    `data.arrival-events` v1、`capability.stream-assembly` v1、`capability.tool-admission` v1、
    `capability.asset-registry` v1、`capability.loop-extension-runner` v1、`capability.mcp-bridge` v1。
    **引到的名字按各自施工简报的账本或主线转达**，未定型；它们一改，本契约随之对齐（[verification](../verification.md#变化的影响)）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `capability.tool-execution-runtime/v1#S-23`。
  **编号在本版本内只追加，不重排**
- **表示**：能力契约**不发布 Schema**（[线上形状归组合契约](../../../README.md)）；操作的输入输出用散文定含义，值类型引数据契约的 `$defs`

### 设计依据表

**产品小节 → 据以写出的条款**（`registry/covers.json` 按这张表登记）：

| 产品小节 | 条款 |
|---|---|
| PF-006 [§4 Tool Execution](../../../../product/PF-006-tools-and-skills/design.md#tool-execution) · [§5.2](../../../../product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同) · [前台后台说的是 agent runtime 在不在等它](../../../../product/PF-006-tools-and-skills/design.md#前台后台说的是-agent-runtime-在不在等它) · [§6.5](../../../../product/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上) | S-1、S-5、S-6、S-8、S-24、S-29 |
| PF-006 [两个原语](../../../../product/PF-006-tools-and-skills/design.md#工具跟外面通信的两个原语) · [等待态](../../../../product/PF-006-tools-and-skills/design.md#等待态) · [§6.6](../../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度) | S-8、S-12、S-27、S-44 |
| PF-006 [发帧](../../../../product/PF-006-tools-and-skills/design.md#发帧) · [帧长什么样由一份协议约定](../../../../product/PF-006-tools-and-skills/design.md#帧长什么样由一份协议约定不由工具定义声明) · [工具的产出](../../../../product/PF-006-tools-and-skills/design.md#工具的产出) | S-39、S-41 |
| PF-006 [卸载](../../../../product/PF-006-tools-and-skills/design.md#卸载) · [§6.10](../../../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度) | S-8、S-36、S-42 |
| PF-006 [§5.4](../../../../product/PF-006-tools-and-skills/design.md#54-返回值两种写法一种模型) · [两种写法到 agent-loop 那里只剩一种](../../../../product/PF-006-tools-and-skills/design.md#两种写法到-agent-loop-那里只剩一种) | S-41 |
| PF-006 [每一次执行都留一份账](../../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账) | S-13 |
| PF-006 [§5.5](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种) · [转后台是前台那一次调用的收场](../../../../product/PF-006-tools-and-skills/design.md#转后台是前台那一次调用的收场后台执行另有自己的收场) · [非常态边界](../../../../product/PF-006-tools-and-skills/design.md#这张表同时划出了这一层的非常态边界) | S-9、S-19、S-27、S-47 |
| PF-006 [§6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装) · [§6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作) | S-23、S-37 |
| PF-006 [§6.7](../../../../product/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败) · [占位消息一律要说清原因](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因) | S-10、S-18、S-20、S-25 |
| PF-006 [§6.8](../../../../product/PF-006-tools-and-skills/design.md#68-工具怎么提执行环境的要求)；PF-005 [§6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级) | S-11、S-38 |
| PF-006 [§6.12](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来) · [停机之后它不重来](../../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来) · [它的宿主是谁](../../../../product/PF-006-tools-and-skills/design.md#它的宿主是谁决定了什么会带走它) | S-17、S-20、S-25、S-27、S-28、S-29 |
| PF-006 flows [§1.5](../../../../product/PF-006-tools-and-skills/flows.md#15-一次工具执行的生命周期) · [§1.6](../../../../product/PF-006-tools-and-skills/flows.md#16-一次执行跨越了多轮) · [§1.7](../../../../product/PF-006-tools-and-skills/flows.md#17-用户中断一次执行) · [§二](../../../../product/PF-006-tools-and-skills/flows.md#二异常分支) · [§3.2](../../../../product/PF-006-tools-and-skills/flows.md#32-一次工具执行) · [§四](../../../../product/PF-006-tools-and-skills/flows.md#四谁决定什么) | S-8、S-13、S-19、S-20、S-25、S-27、S-28、S-29、S-38、S-39 |
| PF-012 [三个运行时](../../../../product/PF-012-agent-loop-and-run/design.md#三个运行时停机之后各算什么) · [先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程) | S-20、S-32 |
| PF-012 [一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个) · [改参数先落一条生效参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数) | S-6、S-23 |
| PF-012 [§5.10](../../../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关) | S-36、S-42 |
| PF-012 [§6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走) · [§6.14](../../../../product/PF-012-agent-loop-and-run/design.md#614-停止有两级) · [§6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) | S-14、S-28 |
| PF-012 [§6.17](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)（I-11 的收窄） | S-13 |
| PF-009 [ToolInternalMessage](../../../../product/PF-009-context-message-types/design.md#toolinternalmessage) · [在途状态](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) | S-33、S-39 |
| PF-007 [§6.4](../../../../product/PF-007-meta-capabilities/design.md#64-shell通向命令行) | S-11、S-23 |
| PF-007 [§6.10](../../../../product/PF-007-meta-capabilities/design.md#610-bkgjobs通向自己发起的执行) | S-25、S-33、S-34 |
| PF-007 [§6.11](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人) | S-12、S-31 |
| PF-008 [等待态的两个维度](../../../../product/PF-008-human-in-the-loop/design.md#等待态的两个维度) · [§6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答) · [§6.4](../../../../product/PF-008-human-in-the-loop/design.md#64-两个答复入口一张卡片只能答一次) | S-12、S-20、S-30 |
| PF-014 [§5.4](../../../../product/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办) | S-31 |
| PF-015 [§6.3](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态) · [§6.4](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#64-撤销归档只还给你状态) | S-29 |
| PF-015 [§6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) | S-6、S-21 |
| PF-000 [§5.5](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段) | S-14、S-21、S-22 |
| PF-011 [非常态](../../../../product/PF-011-off-nominal-handling/design.md#非常态) · [上交](../../../../product/PF-011-off-nominal-handling/design.md#上交) | S-9、S-47 |

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**承载[工具执行](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)的那一项能力**——
产品正文里「在工具执行运行时里找得到／找不到它」的那个「工具执行运行时」（无词条：词表把单次执行自己的运行时并进了工具执行，
承载全部执行的这一项能力本身没有词条，见[报给主线](../verification.md#报给主线)）。具体是：

| 拥有 | 条款 |
|---|---|
| 接一批已放行的调用、依次起执行者、收场、落账 | [S-23](#s-23-提交一批)、[S-38](#s-38-起执行者)、[S-43](#s-43-一批依次与同一工具的并发上限) |
| 一次执行的状态：前台/后台姿态 × 阶段（排队、在跑、等待、已收场）；两个收场（前台那一次调用的、这次执行的） | [S-8](#s-8-姿态与阶段两个维度)、[S-9](#s-9-两个收场) |
| 单独动它的手段：转后台、中断、成批中断、插队处置、取消一次运行、会话归档 | [S-25](#s-25-中断一次执行)～[S-31](#s-31-插队处置) |
| 等待这个原语的系统一侧：它在等、等的是什么形状、答复进来的入口 | [S-12](#s-12-等待)、[S-30](#s-30-答复等待) |
| **结果落成哪种消息的判断，以及落下去这件事**（本能力是唯一送达方） | [S-19](#s-19-送达) |
| 停机不重来：恢复扫描、对账、异常中断的追补 | [S-20](#s-20-恢复扫描与停机不重来)、[S-32](#s-32-对账) |
| 执行者一侧的三件事：发帧、报账、交回 | [S-39](#s-39-发帧)～[S-41](#s-41-交回) |
| 被卸载的原始结果存进存储的那一步 | [S-36](#s-36-存一份原始结果) |

**MCP 动作与本地工具走同一条执行路径**：桥是那条工具定义的「自带实现」、是一个执行者（[S-37](#s-37-执行者登记与撤下)）。

### S-2 本契约不拥有什么

| 不拥有 | 归谁 | 本契约怎么用它 |
|---|---|---|
| 放行判断（四步、卡片、授权表达） | `capability.tool-admission`（接口）；实现是系统自带拓展件 | **只核凭据**：执行前核 `AdmissionToken` 与这次调用相符（[S-23](#s-23-提交一批) ②） |
| 工具定义的形状与校验 | `data.tool-definition` v1 | 读 `allowBackground`、`settings.timeout`／`concurrency`／`backgroundThreshold`、各命令的 `input` 与输出声明 |
| 注册表、可用性、替换件、依赖解析 | `capability.asset-registry` | 读这次尝试里这个名字的条目是可用、替换件还是不可用（[S-23](#s-23-提交一批) ②④） |
| 执行环境与落点求值 | PF-005（**无契约**） | 调用带一个不透明的执行环境引用；落点到不了位 = 失败，不降级（[S-38](#s-38-起执行者)，[G-4](#十二已知缺口)） |
| 段推进、放行之前的一切、结果落盘前那一关的派发 | agent loop（PF-012）、`capability.loop-extension-runner` | 那一关的结论改写的是本能力待落盘的结果块（[S-42](#s-42-结果落成消息之前的那一关)） |
| 卸载判定（两条来路都算） | 系统自带拓展件，站在 `after_action` | 本能力**不因结果大小改变任何东西**；只提供存原始结果（[S-36](#s-36-存一份原始结果)） |
| 帧的语法、在途状态的拼装、帧流的收尾 | `data.arrival-events`、`capability.stream-assembly` | 本能力是工具一侧的生产者与在途状态的持有者（[S-39](#s-39-发帧)） |
| 会话日志与记录条目的壳 | 会话日志的 owner（loop 与会话那一程，**未起草**） | 本能力往里追加消息与记录条目（[S-19](#s-19-送达)、[S-22](#s-22-关键转换留记录)，[G-1](#十二已知缺口)） |
| 决策卡片（出卡、答卡、关卡） | PF-008（**无契约**） | 等待可以挂一张卡的标识；恢复时请求关闭（[S-20](#s-20-恢复扫描与停机不重来)，[G-5](#十二已知缺口)） |
| 模态两端的判定 | `capability.modality-projection`（块 C） | 不复述 |
| 十三扇门的具体动作 | PF-007 | 它们是工具，照同一条路径执行 |
| 参数收齐却解析不了的调用 | `capability.stream-assembly` 与 loop | **不进本能力**：它不被执行（`data.messages/v1#S-31`） |

### S-3 本契约明确不承诺什么

- **不承诺外部效果可撤销、可补偿。**停止只是不再继续；已经做了的事留在世界里。本能力记下「外部效果的确定性」（[S-14](#s-14-停止与外部效果分开说)），不替它收拾。
- **不承诺重来。**任何情形下都不自动重发一次执行，包括「能证明它还没开始」的情形（[S-20](#s-20-恢复扫描与停机不重来)）。
- **不承诺帧到达。**帧发得出发不出都不改变这次执行（[S-39](#s-39-发帧)）。
- **不承诺送达通知到达。**权威是会话日志里的那条消息（[S-45](#s-45-送达通知)）。
- **不承诺限时停下。**停止信号发出之后，执行者实际停下的时刻只受 `execution_stop_grace` 之后的强制停止约束；强制停止在不同执行环境里能做到什么，归执行环境（[S-18](#s-18-收场先落停止后发)）。
- **不承诺替工具作者判断「这次算没成」**：作者以正常返回表达失败的写法本版没有（[G-9](#十二已知缺口)）。
- **不解释结果内容**：不读文字推收场，不因结果大小改姿态、不转后台、不截断（PF-006 §6.10）。

### S-4 依赖方向与被消费的面

**依赖单向**：本契约 → 下列数据契约与并行的能力契约；agent loop、`BkgJobs()`、会话归档流程、插队处置、装配与账本读本契约。

| 依赖（已登记） | 消费的条款 | 据以写出什么 |
|---|---|---|
| `data.content-blocks` v1 | [S-12](../../../data/content-blocks/v1/contract.md#s-12-完整的工具调用)、[S-14](../../../data/content-blocks/v1/contract.md#s-14-callid)、[S-15](../../../data/content-blocks/v1/contract.md#s-15-工具结果块)、[S-17](../../../data/content-blocks/v1/contract.md#s-17-六种收场)、[S-18](../../../data/content-blocks/v1/contract.md#s-18-占位原因与它落在哪一格)、[S-21](../../../data/content-blocks/v1/contract.md#s-21-attachmentref)、[S-22](../../../data/content-blocks/v1/contract.md#s-22-落盘之后整块不变) | 调用块、`CallId` 的唯一范围、结果块的形状、六种收场与后台段四种、占位原因与落格、存原始结果得到的引用、落盘不变 |
| `data.call-accounts` v1 | [S-9](../../../data/call-accounts/v1/contract.md#s-9-costitem一次工具执行里的一笔)、[S-10](../../../data/call-accounts/v1/contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)、[S-11](../../../data/call-accounts/v1/contract.md#s-11-toolcallaccount一次工具执行的账)、[S-14](../../../data/call-accounts/v1/contract.md#s-14-wallclock)、[S-17](../../../data/call-accounts/v1/contract.md#s-17-costcorrection事后补账)、[S-18](../../../data/call-accounts/v1/contract.md#s-18-原账不改)、[S-20](../../../data/call-accounts/v1/contract.md#s-20-缺账或被拒收记未知不伪造)、[S-21](../../../data/call-accounts/v1/contract.md#s-21-账进日志不进给模型看的上下文)、[S-25](../../../data/call-accounts/v1/contract.md#s-25-按尝试记明细按-run-汇总)、[S-37](../../../data/call-accounts/v1/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) | 一次执行恰一份账、何时写、起止时刻、被拒的一笔怎么记、补账、账不进上下文、按运行归属；`RunId`、`AttemptId` 的家 |
| `data.messages` v1 | [S-11](../../../data/messages/v1/contract.md#s-11-toolmessage)、[S-12](../../../data/messages/v1/contract.md#s-12-真实结果落哪种消息只看有没有占位)、[S-13](../../../data/messages/v1/contract.md#s-13-toolinternalmessage)、[S-14](../../../data/messages/v1/contract.md#s-14-toolinternalmessage-怎么收的尾)、[S-19](../../../data/messages/v1/contract.md#s-19-后台执行的两种收场提醒)、[S-22](../../../data/messages/v1/contract.md#s-22-系统发起的等待答复回来)、[S-30](../../../data/messages/v1/contract.md#s-30-悬着的占位)、[S-32](../../../data/messages/v1/contract.md#s-32-会话日志里的配对与唯一) | 落哪种消息、两种后台收场提醒、工具说过程那条消息与它的收尾、工具等待的答复不落消息、日志里的配对与次序 |
| `data.tool-definition` v1 | [S-10](../../../data/tool-definition/v1/contract.md#s-10-设置项声明)、[S-12](../../../data/tool-definition/v1/contract.md#s-12-后台许可与转后台阈值)、[S-13](../../../data/tool-definition/v1/contract.md#s-13-超时与并发)、[S-14](../../../data/tool-definition/v1/contract.md#s-14-时长的表示)、[S-20](../../../data/tool-definition/v1/contract.md#s-20-两种写法与等价规则)、[S-21](../../../data/tool-definition/v1/contract.md#s-21-toolresult-的三样)、[S-22](../../../data/tool-definition/v1/contract.md#s-22-结果内容里没有工具调用)、[S-23](../../../data/tool-definition/v1/contract.md#s-23-卸载)、[S-24](../../../data/tool-definition/v1/contract.md#s-24-结果与声明对得上)、[S-25](../../../data/tool-definition/v1/contract.md#s-25-toolresult-不是收场)、[CS-1](../../../data/tool-definition/v1/contract.md#cs-1-派发一次多命令调用) | 设置项不声明即没有、后台许可、超时/并发/阈值的语义（替它的 G-6 落地）、返回值两种写法的归一、结果检查与违反声明的收场（替它的 G-15 落地）、参数按所选命令校验 |
| `data.loop-extension` v1 | [S-14](../../../data/loop-extension/v1/contract.md#s-14-按位置的-subject) | `after_action`（`each`）的 subject：什么收场之下有待落盘的结果块（替它留给本能力的那一句落地） |
| `data.offer-expiry` v1 | [S-22](../../../data/offer-expiry/v1/contract.md#s-22-schema-的范围) | 时刻 `Instant`：账的起止、等待的到点 |
| `data.identity-values` v1 | [S-5](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等)、[S-17](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)、[S-18](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝)、[S-19](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败)、[S-30](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)、[S-31](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)、[S-33](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) | 执行记录带的租户身份与相等；身份参数没有默认值；缺席即拒；判不出即明确失败；表示层校验与判定分开 |

| 依赖（并行起草，未登记） | 引到的名字（按账本，未定型） | 据以写出什么 |
|---|---|---|
| `data.arrival-events` | `ArrivalEnvelope`、`target = { kind: tool_execution, callId }`、`finish` 的四个 `reason` | 帧的信封与收尾（[S-39](#s-39-发帧)） |
| `capability.stream-assembly` | `open_target`、`accept`、`snapshot`、`close_out`、`abandon` | 在途状态的持有、帧流的收尾、工具说过程那条消息的产出（[S-39](#s-39-发帧)） |
| `capability.tool-admission` | `AdmissionToken`；`verifyToken(token, call, session) → valid \| invalid{why} \| unavailable` | 执行前核凭据（[S-23](#s-23-提交一批) ②） |
| `capability.asset-registry` | 条目的 `availability ∈ available · unavailable{reason} · stand_in{for}` | 替换件与不可用条目的处置（[S-23](#s-23-提交一批) ④） |
| `capability.loop-extension-runner` | `after_action`（`each`）的派发；卸载判定不可用 = 只记可见 | 落盘之前那一关（[S-42](#s-42-结果落成消息之前的那一关)） |
| `capability.mcp-bridge` | 桥作为执行者；桥换代或卸载时经它挂起的调用各自落 `failed{abnormal_interruption}` | MCP 动作的撤下例外（[S-37](#s-37-执行者登记与撤下)） |

**消费者**：agent loop（段停在「等工具」：`awaitForeground`；尝试开始时 `reconcile`；落盘前那一关）、`BkgJobs()`（`listBackground`、`readExecution`、`interrupt{agent}`）、
会话归档流程（`archiveSession`）、运行取消（`cancelForRun`）、插队处置（`preempt`）、卡片与 `Agents()` 回应（`answerWait`）、
卸载判定（`storeRaw`）、`capability.mcp-bridge`（作为执行者）、装配与账本（读执行记录上的账）。

---

## 二、概念、身份与状态

### S-5 一次执行以会话里的 CallId 指认

**一次执行的身份是 `(租户, 会话, CallId)`**——`CallId` 是模型发起的那个完整工具调用块上的标识
（[`data.content-blocks/v1#S-14`](../../../data/content-blocks/v1/contract.md#s-14-callid)：在一份会话日志内两两不同）。**不另立执行标识**。

- **三样一起才指得到**：`CallId` 只在一份会话日志内唯一，**不带会话就指认不了**；不带租户就守不住跨租户默认拒绝（[S-21](#s-21-租户与会话范围)）。
- **一次调用恰一次执行**：同一个 `(会话, CallId)` 至多一条执行记录，由提交的幂等兑现（[S-23](#s-23-提交一批) ⑦）。
- 活体句柄、进程、实现实例都不是身份；换了一个实例、换了一个进程，那还是同一次执行，或者它已经不存在了（[S-7](#s-7-活体与找得到)）。

### S-6 执行记录

**`ExecutionRecord` 是一次执行的持久事实，本能力是它唯一的写入者。**成员（「必」＝从提交那一刻起就有）：

| 成员 | 必 | 含义 |
|---|---|---|
| `tenant` | 必 | 会话的租户身份（`TenantId`，[`data.identity-values/v1#S-5`](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等)），**即会话持有的那一个**（PF-015 §6.12） |
| `session` | 必 | 宿主与收件人（会话标识的类型归会话那一程，[G-12](#十二已知缺口)） |
| `callId` | 必 | [S-5](#s-5-一次执行以会话里的-callid-指认) |
| `run`、`attempt` | 必 | 提交它的运行与第几次尝试（`RunId`、`AttemptId`，家在 `data.call-accounts` v1）。**只作来历与账的归属，不绑生命周期**；发起的 agent runtime 由 `(run, attempt)` 定，不另存 |
| `call` | 必 | 那个完整的工具调用块，**参数是放行时的生效参数**；此后不变（PF-012 [改参数先落一条生效参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)） |
| `definition` | 必 | 工具定义的引用（`ToolDefinitionRef`，`data.loop-extension` v1 的 `$defs`） |
| `admission` | 必 | 放行凭据 `AdmissionToken`（不透明） |
| `environment` | 必 | 执行环境引用（不透明，[G-4](#十二已知缺口)） |
| `batch` | 必 | 这一批的 `CallId` 序列与它在其中的位置（[S-43](#s-43-一批依次与同一工具的并发上限)） |
| `posture` | 必 | `foreground` ／ `background`，以及转后台的原因（[S-8](#s-8-姿态与阶段两个维度)、[S-10](#s-10-占位原因)） |
| `phase` | 必 | `queued` ／ `running` ／ `waiting` ／ `ended`（[S-8](#s-8-姿态与阶段两个维度)） |
| `wait` | 在等时 | 当前这一次等待：第几次（`waitIndex`）、等什么形状、可选的到点、可选的卡片（[S-12](#s-12-等待)） |
| `callOutcome` | 落定后 | 前台那一次调用的收场与原因（[S-9](#s-9-两个收场)） |
| `outcome` | 收场后 | 这次执行的收场、原因、失败的种类（[S-11](#s-11-失败的种类)）、**发起者**（中断时：谁叫停的） |
| `account` | 收场后 | 这次执行的 `ToolCallAccount`（[S-13](#s-13-账)） |
| `stop` | 被停时 | 逻辑停止、实际停止、外部效果的确定性三件事（[S-14](#s-14-停止与外部效果分开说)） |

- **记录与会话日志是两样东西**：记录是「这次执行现在怎样」的当前事实，会话日志只追加。每一次关键转换另以记录条目进会话日志（[S-22](#s-22-关键转换留记录)）。
- **记录上的收场一旦写下就不变**（[S-16](#s-16-首胜收场只写一次)）；`stop` 里的实际停止与外部效果可以在收场之后补写——它们是收场之后才观察到的事实，**不改收场**。

### S-7 活体与找得到

**活体**（无词条）是本能力此刻在这个进程里为一次执行持有的东西：执行者的句柄、停止的手段、在途状态。**「在工具执行运行时里找得到它」＝ 有它的活体。**

- **活体不持久，停机就没了**；持久的只有执行记录与会话日志。
- **只有恢复扫描完成之后，「找不到」才可信**：扫描之前，一条未收场的记录找不到活体，可能只是还没被处置（[S-20](#s-20-恢复扫描与停机不重来)）。
  **所以在服务中，每一条未收场的记录都找得到活体**——这条是本能力对 PF-012「找不到才追补、找得到就接着等」的兑现（模型性质 `ServingConsistent`）。
- 单机时「找得到」由同一进程的活体表给出；分布式时要改成租约或心跳（[S-46](#s-46-装配给的保证-vs-协议须给的保证)）。

### S-8 姿态与阶段两个维度

**一次执行在任一时刻有一个姿态、一个阶段。**

| 维度 | 取值 | 怎么变 |
|---|---|---|
| **姿态** | `foreground`（agent runtime 阻塞在它上面）· `background`（不再阻塞） | **只从前台到后台，单向**（[flows §3.2](../../../../product/PF-006-tools-and-skills/flows.md#32-一次工具执行)）；发起即后台的一开始就是后台（[S-23](#s-23-提交一批)） |
| **阶段** | `queued`（记录已落、执行者还没起）· `running` · `waiting`（停在等待上）· `ended` | `queued → running`（[S-38](#s-38-起执行者)）；`running ⇄ waiting`（[S-12](#s-12-等待)、[S-30](#s-30-答复等待)）；任一未收场阶段 → `ended`；**`ended` 之后不再变** |

- **宿主永远是会话**，姿态变化不换宿主（PF-012 §6.13「转后台不换宿主」）。
- **本版等待只在前台**（主线裁定 C-B-M3；[D-038](../../../../record/decisions/message-and-shape-rulings/decision.md) Q15 原话「目前我们应该只定了要等待答复的工具只能阻塞在前台」）：
  在等的执行不能转后台（[S-27](#s-27-转后台) 返回 `backgroundNotAllowed`），后台的执行进不了等待（[S-12](#s-12-等待)：等待原语对它明确拒绝）。
  PF-006 §6.6 四种组合里「后台在等待」一格本版不出现；**将来放开时，[S-19](#s-19-送达) 的判据不改**——结果落哪种消息只看有没有占位。
- **等待不读也不写 Run 的任何状态**：Run 记「协程在等哪一次调用」归 loop；本能力的 `waiting` 是这次执行自己在等外面（PF-006 [等待态](../../../../product/PF-006-tools-and-skills/design.md#等待态)），两者互不引用。
- **卸载与这两个维度正交**：本能力不因结果大小改变姿态或阶段（PF-006 §6.10）。

### S-9 两个收场

**前台那一次调用有它的收场，这次执行有它的收场；两者都只从 `ExecutionOutcome` 的六种里出**（[`data.content-blocks/v1#S-17`](../../../data/content-blocks/v1/contract.md#s-17-六种收场)）。

| | 从哪几种里出 | 什么时候落定 |
|---|---|---|
| **前台那一次调用**（`callOutcome`） | 六种都可能；`backgrounded` **只在这里** | 转后台的那一刻（`backgrounded`），或这次执行在前台收场的那一刻（与执行的收场相同） |
| **这次执行**（`outcome`） | `completed`、`failed`、`unavailable`、`interrupted`、`no_answer`；**转过后台的只在 `completed`、`failed`、`interrupted`、`no_answer` 里** | 收场那一刻（[S-16](#s-16-首胜收场只写一次)） |

**每种收场从哪来、落什么：**

| 收场 | 触发 | 原因（`reason.code`） | 结果块由谁写 | 有没有待落盘的结果块（[S-42](#s-42-结果落成消息之前的那一关)） |
|---|---|---|---|---|
| `completed` | 执行者交回，且通过交回的检查（[S-41](#s-41-交回)） | 不带 | 执行者交回的内容 | **有** |
| `failed` | 执行者交回的失败（抛出、实现出错、MCP 对端报错）；起不来（[S-38](#s-38-起执行者)）；交回违反声明；注册表判为不可用；发起即后台被拒；停机（恢复时追补）；MCP 桥换代 | 只有停机与桥换代那两路带 `abnormal_interruption`；其余**不带**，原因写进 `blocks`（[`data.content-blocks/v1#S-18`](../../../data/content-blocks/v1/contract.md#s-18-占位原因与它落在哪一格)） | 执行者交回的失败：执行者给的说明；其余：本能力写 | 执行者交回的失败**有**；其余**无** |
| `unavailable` | 这次尝试里这个名字的条目是**替换件**（[S-23](#s-23-提交一批) ④） | 不带 | 本能力写：替换件给的「现在用不了 + 原因」 | 无 |
| `backgrounded` | 前台那一次调用在转后台时落定（[S-27](#s-27-转后台)、[S-31](#s-31-插队处置)、[S-44](#s-44-前台上限与转后台阈值)、[S-23](#s-23-提交一批)） | 必带，见 [S-10](#s-10-占位原因) | 本能力写：占位说明 | 无 |
| `interrupted` | 用户、插队、agent 掐掉、运行取消、会话归档、前台上限到点且不许转后台 | 必带，见 [S-10](#s-10-占位原因) | 本能力写：占位说明 | 无 |
| `no_answer` | 等待到了它自己声明的到点（[S-12](#s-12-等待)） | 不带 | 本能力写 | 无 |

- **六种都以一条正常的消息到达**，没有一种以报错抛给 agent（PF-006 §5.5「这张表同时划出了这一层的非常态边界」）；
  本层了结不了的（执行记录写不进去、日志追加不上）**上交**（PF-011），不在这张表里造第七种。
- **「停机」只落 `failed`**：不落 `interrupted`（没有人叫停它），也不落「状态不明」（PF-006 [停机之后它不重来](../../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来)）。

### S-10 占位原因

**`backgrounded` 与 `interrupted` 必带原因，按下表取；每个值只配它那一格收场**（[`data.content-blocks/v1#S-18`](../../../data/content-blocks/v1/contract.md#s-18-占位原因与它落在哪一格)）。

| 触发 | 收场 | `reason.code` | 取值在 `data.content-blocks` v1 里有吗 |
|---|---|---|---|
| 前台跑到转后台阈值，或前台上限到点且允许转后台（[S-44](#s-44-前台上限与转后台阈值)） | `backgrounded` | `backgrounded_auto` | 有 |
| 用户手动切（[S-27](#s-27-转后台)） | `backgrounded` | `backgrounded_by_user` | 有 |
| 插队，工具允许转后台且没在等（[S-31](#s-31-插队处置)） | `backgrounded` | `backgrounded_by_preemption` | 有 |
| 发起时就在后台（[S-23](#s-23-提交一批)） | `backgrounded` | `backgrounded_at_start` | **没有**（[G-2](#十二已知缺口)） |
| 用户直接叫停这一次执行（[S-25](#s-25-中断一次执行)、[S-26](#s-26-成批中断)） | `interrupted` | `user_interrupted` | 有 |
| 插队，工具不允许转后台，或在等但等的不是卡片（[S-31](#s-31-插队处置)） | `interrupted` | `interrupted_by_preemption` | 有 |
| 插队时这次执行停在一张卡片上等人（[S-31](#s-31-插队处置)） | `interrupted` | `human_declined` | 有 |
| agent 经 `BkgJobs()` 掐掉（[S-25](#s-25-中断一次执行)） | `interrupted` | `terminated_by_agent` | **没有**（[G-2](#十二已知缺口)） |
| 这一次运行被取消而它还在前台（[S-28](#s-28-取消一次运行)） | `interrupted` | `run_cancelled` | **没有**（[G-2](#十二已知缺口)；content-blocks 的 G-2） |
| 会话被归档（[S-29](#s-29-会话归档)） | `interrupted` | `session_archived` | 有 |
| 前台上限到点且不许转后台（[S-44](#s-44-前台上限与转后台阈值)） | `interrupted` | **本版没有取值**（[G-3](#十二已知缺口)） | —— |
| 停机，恢复时追补；MCP 桥换代 | `failed` | `abnormal_interruption` | 有 |

**表里标「没有」的四行，本版没有合法的消息表示**：写到这里的一方**停下并上交**，不借用相近的值（`user_interrupted` 说的是用户叫停这一次执行，不是运行被取消或 agent 掐掉）。
执行记录上的收场与原因照写——记录不受块的取值集约束——**只是那条消息落不下去**，直到 `data.content-blocks` 下一版补齐（主线已裁三值）。

### S-11 失败的种类

**收场是 `failed` 的执行，记录上另带一个失败的种类**（无词条），闭合：

| 种类 | 什么时候 | 执行者跑过吗 |
|---|---|---|
| `arguments_rejected` | 参数不合所选命令的 `input`（[`data.tool-definition/v1` CS-1](../../../data/tool-definition/v1/contract.md#cs-1-派发一次多命令调用)） | 没有 |
| `environment_unavailable` | 执行时才发现落点到不了位（主线裁定 C-B-M8）；**不降级**（PF-005 §6.9） | 没有 |
| `not_available` | 注册表把这次尝试里这个名字判为不可用，带注册表给的原因（[S-23](#s-23-提交一批) ④） | 没有 |
| `background_start_refused` | 发起即后台，而工具不允许后台（PF-007 §6.4「声明不允许后台的，`run_in_background` 也起不来」） | 没有 |
| `start_failed` | 执行者起不来（没有登记的执行者、起进程失败）——**不是被中断**（DSH「spawn 失败被记成 killed」那一条，[verification](../verification.md#两源已知失败情形)） | 没有 |
| `implementation_error` | 执行者交回失败：抛出、实现自己炸了、MCP 对端报错 | 跑过 |
| `result_rejected` | 交回的东西不合形状，或违反声明（[S-41](#s-41-交回)） | 跑过 |
| `abnormal_interruption` | 停机后恢复时追补；MCP 桥换代或卸载 | 跑过或不确定 |

- **这是记录上的事实，不是块上的原因**：块上 `failed` 只能带 `abnormal_interruption`，其余种类写进 `blocks` 给 agent 读（文案归实现）。
- 「执行者跑过吗」决定[外部效果的确定性](#s-14-停止与外部效果分开说)：没跑过的是「已确定未发生」。

### S-12 等待

**等待是执行者在执行中途调用的一个原语：停下来，说清自己等什么形状的应答，拿到之后接着跑**（PF-006 [等待态](../../../../product/PF-006-tools-and-skills/design.md#等待态)；[工具等待态](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state)）。

| 执行者给出 | 必 | 含义 |
|---|---|---|
| 等什么形状 | 必 | 一份 JSON Schema（`data.tool-definition` v1 `$defs/JsonSchema` 同一规则）；答复按它校验 |
| 到点 | 否 | 这次等待最晚等到什么时刻（`Instant`）。**只给占着资源的等待**（PF-006 §6.6 判据）；不给就一直等，**本能力不替它设** |
| 卡片 | 否 | 这次等待挂的那张决策卡片的标识（卡片由 PF-008 那一侧出，[G-5](#十二已知缺口)）。挂了卡的等待，插队时原因是 `human_declined` |

- **每次进入等待，记录上的 `waitIndex` 加一**（从 1 起）；答复必须指明它答的是第几次（[S-30](#s-30-答复等待)）。**一次执行可以等多次**。
- **到点即收场 `no_answer`**：不是失败、不是被拒（[S-9](#s-9-两个收场)）。到点与答复竞争同一行，首胜（[S-16](#s-16-首胜收场只写一次)）。
- **前台上限与转后台阈值在等待期间不走**（[S-44](#s-44-前台上限与转后台阈值)）：一段不占资源的等待不该被一个为「跑太久」设的上限替人签字（PF-006 §6.6、PF-007 §6.11 (一)）。
- **后台的执行进不了等待**（本版，[S-8](#s-8-姿态与阶段两个维度)）：原语对它明确拒绝，执行者自己决定怎么办；**不隐式转回前台**（转后台是单向的）。
- **agent runtime 被回收不影响等待**：卡片照样挂着，答复照样进来，协程重建后接着等那次调用（[S-24](#s-24-等前台那一次调用落定)）。

### S-13 账

**一次执行恰一份 `ToolCallAccount`**（[`data.call-accounts/v1#S-11`](../../../data/call-accounts/v1/contract.md#s-11-toolcallaccount一次工具执行的账)），**在收场的那一次提交里写下**，此后不改（[S-18](../../../data/call-accounts/v1/contract.md#s-18-原账不改)）。

| 成员 | 本能力怎么填 |
|---|---|
| `callId` | 这次执行的 |
| `cost.items` | 执行者报的（`tool_reported`）与本能力从它管得着的服务收来的（`service_reported`、`model_response`），见 [S-40](#s-40-报账) |
| `usage` | 这次执行经本系统调模型的用量汇总；一次都没调就缺席 |
| `frames` | 这次执行发了几帧、砍了多少（[S-39](#s-39-发帧)） |
| `wallClock.startedAt` | **执行记录落下的时刻**（提交那一刻）——从那一刻起它就是一次执行，排队也算在内 |
| `wallClock.endedAt` | **收场那一刻**；恢复时追补的（停机）**缺席**——结束那一刻没被观察到，**不补成扫描时刻**（[S-14](../../../data/call-accounts/v1/contract.md#s-14-wallclock)） |

- **归属**：账挂在执行记录上，经 `(run, attempt)` 归到提交它的那次运行的那次尝试（[`S-25`](../../../data/call-accounts/v1/contract.md#s-25-按尝试记明细按-run-汇总)）。
  **运行已经终结之后才结束的后台执行，照样落账并归该运行**（主线裁定，PF-012 I-11 的收窄）；「终结之后落的账」怎样标注，等 `data.call-accounts` 下一版（[G-8](#十二已知缺口)）。
- **不受尝试栅栏约束**：执行的结果与账不属于哪一次尝试的推进，旧尝试发起的执行照样落。
- **收场之后才到的费用**（停止与交回交错、晚到的报账）**不改那份账**：原账不改；它们作为一条记录条目留下（[S-22](#s-22-关键转换留记录)），
  能否以补账进入有效费用——`CostCorrection` 对工具执行只收 `manual`——等 `data.call-accounts` 下一版（[G-8](#十二已知缺口)）。
- **账不进给模型看的上下文**（[`S-21`](../../../data/call-accounts/v1/contract.md#s-21-账进日志不进给模型看的上下文)）：它随执行记录的收场条目进会话日志，不进任何消息的块。

### S-14 停止与外部效果分开说

**一次被停下的执行，记录上分开记三件事，不说成一件**（PF-012 [§6.14](../../../../product/PF-012-agent-loop-and-run/design.md#614-停止有两级)）：

| 事实 | 取值 | 什么时候写 |
|---|---|---|
| **逻辑停止** | 就是收场（`interrupted`、`failed` 等） | 收场那一刻，先于任何停止动作（[S-18](#s-18-收场先落停止后发)） |
| **实际停止** | `stopping`（停止已发出，还没观察到停下）· `stopped`（观察到停下）· `unconfirmed`（没法观察到，例如停机后回收） | 停止动作之后，可以晚于收场 |
| **外部效果的确定性** | PF-000 §5.5 三值：**已确定发生** · **已确定未发生** · **不可确定** | 收场时给出；执行者从没跑过（[S-11](#s-11-失败的种类)「没有」那几行、排队中被中断）是「已确定未发生」；**执行者跑过而被停下、停机、或收场之后又有完成到达的，一律「不可确定」**——本能力看不全它在外面做过什么（PF-006 §6.12） |

- **「已经停止」不等于「外部效果已经撤销」**；本能力不补偿、不撤销（[S-3](#s-3-本契约明确不承诺什么)）。
- 正常跑完的执行（`completed`、执行者交回的 `failed`）的外部效果确定性，**本能力不判**：执行者没有报它，而本能力看不见（留空，不填默认值）。
- `ToolCallAccount` 没有承载这三件事的成员；它们在执行记录上。要不要进账，等 `data.call-accounts` 下一版（[G-8](#十二已知缺口)）。

---

## 三、贯穿全部操作的规矩

### S-15 缺席时的默认答案

**缺席一律是拒绝或明确失败；「判不出来」与「判为拒绝」是两个值。**

| 缺席或判不出的是什么 | 默认答案 | 为什么不是别的 |
|---|---|---|
| 身份参数（租户、会话、`CallId`、运行、尝试）缺席或不合形状 | `invalidInput`，**不写入任何东西** | 身份参数没有默认值（[`data.identity-values/v1#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)） |
| 放行凭据缺席，或核对为不符 | `notAdmitted`，**整批不执行** | 放行之后参数不许再变；缺凭据等于没放行（C-B-M4 的 fail-closed） |
| 放行核对**判不出来**（核对面不可用） | `admissionUnavailable`，**整批不执行** | 与「核对为不符」分开：一个是没放行，一个是现在查不了 |
| 注册表**读不到**这次尝试里这个名字的条目 | `dependencyUnavailable{registry}`，整批不执行 | 读不到不等于可用，也不等于不可用 |
| 执行记录或会话日志**读写不了** | `dependencyUnavailable{storage}`；已开始的执行照跑，收场写不下去时**上交**（PF-011） | 不把「没写进去」当成「写进去了」 |
| 恢复扫描还没完成 | `runtimeNotReady` | 扫描之前「找不到」不可信（[S-7](#s-7-活体与找得到)） |
| 工具定义里没有 `allowBackground: true` | **不能转后台**：手动切 → `backgroundNotAllowed`；阈值、插队 → 不转（插队时改为中断）；发起即后台 → 收场 `failed{background_start_refused}` | PF-006 §6.6「不声明就是不能后台」 |
| 工具定义没有 `settings.timeout`、`backgroundThreshold`、`concurrency` | **没有这一项限制**：不到点、不自动转后台、不设并发上限 | 定义不声明＝这个工具没有这一项设置（[`data.tool-definition/v1#S-10`](../../../data/tool-definition/v1/contract.md#s-10-设置项声明)）；**本能力不补一个值** |
| 等待没给到点 | **一直等** | PF-006 §6.6：不花钱的等待没有理由到点 |
| 结果落盘前那一关（卸载判定）不可用 | **原样落，并留一条记录条目** | 主线裁定：卸载判定不可用 = 只记可见（C-7／C-8） |
| 这次执行的执行者没登记 | 收场 `failed{start_failed}` | 不是不可用：可用性是注册表判的，那时它是可用的 |
| `cancelForRun` 的停止级别缺席 | `invalidInput` | 两级的代价不同，不替调用方选 |

#### 输入不合形状是第三类，收成 `invalidInput`

表示层校验在任何判定之前做，口径取 [`data.identity-values/v1#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开)：
**`invalidInput` 不表示「该执行不存在」或「这次调用没被放行」，也不得被记成一次判定结果。**
答复的值不合那次等待声明的形状，同样是 `invalidInput`（它是按声明做的形状校验，不是一次判定）。

### S-16 首胜收场只写一次

**同一次执行的收场只写一次：写的条件是「这条记录还没有收场」，写下之后不再改。**
正常交回、中断、转后台之后的完成、等待到点、取消运行、会话归档、恢复追补、MCP 桥换代——**任何几路竞争同一次执行，先写成的那一路是收场**，其余的丢弃。

- **前台那一次调用的收场同样只落一次**：转后台落下 `backgrounded` 之后，这次执行后来的收场不再改它（模型性质 `CallOutcomeStable`）。
- **收场之后到达的交回一律丢弃**：不改收场、不再送达、不再落账；外部效果记「不可确定」（[S-14](#s-14-停止与外部效果分开说)），并留一条记录条目。
  这正是「停止与交回交错」（local-execution 那组反例）的收口（[verification](../verification.md#两源已知失败情形)）。
- **丢弃是按「这条记录已有收场」判的，不是按活体判的**：一个换了实例的执行者交回，只要记录已收场就丢弃（DSH「同 id 换实例不串台」那一条）。
- 首胜由**同一存储里同一行上的条件写**兑现（装配给，[S-46](#s-46-装配给的保证-vs-协议须给的保证)）；进程内的锁不算。

### S-17 持久意图先于外部效果

**执行记录落下之后，才起执行者；同一次执行至多起一次执行者。**

- 提交的那一次提交把记录写成 `queued`（[S-23](#s-23-提交一批)）；起执行者发生在那之后（[S-38](#s-38-起执行者)）。
  **没有「执行者已经在跑、记录还没落」的时刻**——停机时，凡是可能已经在外面做了事的执行，存储里都有它的记录，恢复扫描找得到它。
- **至多起一次**：恢复不重起（[S-20](#s-20-恢复扫描与停机不重来)）；重复提交不重起（[S-23](#s-23-提交一批) ⑦）；本能力换代不重起（[S-48](#s-48-本能力自己的撤除与换代)）。

### S-18 收场先落停止后发

**中断、取消运行、会话归档、插队中断：先把收场写下，再发停止。**

- **反过来会怎样**：停止先发，执行者因停止而退出，它的退出被当成一次交回（多半是失败）抢在中断之前落定——agent 读到「失败」、会重试，
  而用户刚刚叫停了它（PF-006 §6.7）。模型的否定配置 `WriteBeforeStop = FALSE` 给出的就是这条反例。
- **停止分两步**：发停止，等 **`execution_stop_grace`**（具名参数，部署配置，**本契约不填值**）；到点还没停下，强制停止。
  取消运行的强制那一级不等宽限（[S-28](#s-28-取消一次运行)）。
- **收口的次序是义务**：收场落定 → 发停止 → 宽限 → 强制停止 → 回收执行者占用的资源（进程组、执行环境里的句柄）→ 释放并发位置。
  **收口的任何一步出错，记进记录与记录条目，不改收场。**
- **并发位置在收场那一刻释放**（[S-43](#s-43-一批依次与同一工具的并发上限)），不等实际停下：被停下的执行不再是一次在跑的执行。

### S-19 送达

**本能力是一次执行的消息唯一的送达方。送达 = 追加进会话日志成功**；别的都不算。

**落哪种消息，只看这次调用有没有占位**（[`data.messages/v1#S-12`](../../../data/messages/v1/contract.md#s-12-真实结果落哪种消息只看有没有占位)，[D-038](../../../../record/decisions/message-and-shape-rulings/decision.md) Q15）——
「有占位」指这次调用的占位**已经追加，或已经与执行记录一起交付、等待追加**；等价地说，看执行记录的姿态：

| 这一段 | 落成 | 块 |
|---|---|---|
| 前台那一次调用落定（含 `backgrounded`） | `ToolMessage`（[S-11](../../../data/messages/v1/contract.md#s-11-toolmessage)） | 恰一个结果块，`outcome = callOutcome` |
| 转过后台的执行收场 | `SystemReminderMessage`，`source.kind = background_execution_finished`（[S-19](../../../data/messages/v1/contract.md#s-19-后台执行的两种收场提醒)） | 恰一个结果块，`outcome` ∈ 后台段四种 |
| 转过后台的执行停机，恢复时追补 | `SystemReminderMessage`，`source.kind = background_execution_interrupted` | `outcome: failed`、`reason.code: abnormal_interruption` |
| 这次执行发过帧 | 另有一条 `ToolInternalMessage`（[S-13](../../../data/messages/v1/contract.md#s-13-toolinternalmessage)），**排在它那一段的结果消息之前** | 帧封口之后的块；一帧没发就没有这条 |

- **一次调用至多一条工具消息；一段后台执行至多一条收场提醒；收场提醒排在占位之后**（[`data.messages/v1#S-32`](../../../data/messages/v1/contract.md#s-32-会话日志里的配对与唯一) ②④）——本能力在追加时守住，模型性质 `AtMostOneToolMessage`、`AtMostOneReminder`、`ReminderAfterPlaceholder`。
- **消息的追加与执行记录的那次写不得只成一半**：占位或结果落进日志，与执行记录的收场（或转后台）写下，**要么都成，要么都不成，停机也不能把它们拆开**。
  两种承接形状——日志追加并入本能力的那次事务；或本能力在事务内写执行记录与一条出站项、日志追加消费出站项并按 `(CallId, 段)` 幂等——
  **由提供者设计选，契约不选**（[S-46](#s-46-装配给的保证-vs-协议须给的保证)）。
  反过来会怎样：记录说「收场了」而日志里永远没有那条消息，agent 永远等一个不会来的结果（模型的否定配置 `DurableHandoff = FALSE`）。
- **账随收场一起**：`ToolCallAccount` 与收场、那条消息同成同败（[S-13](#s-13-账)）。
- **会话归档之后不再有新的送达**（[S-29](#s-29-会话归档)）。
- 送达之后发一条通知（[S-45](#s-45-送达通知)）；**通知不是送达**。

### S-20 恢复扫描与停机不重来

**本能力起来时，先做完恢复扫描，才对外服务**（在此之前一切操作返回 `runtimeNotReady`）。

1. **范围**：存储里**全部未收场的执行记录**，不论会话、不论姿态、**不论那个会话此刻有没有协程要恢复**（PF-012 §5.7「没有协程要恢复的会话也要走到这一步」）。
2. **每一条**：先回收它登记过的执行者资源（进程组等），**再**首胜写收场 `failed`、种类 `abnormal_interruption`、外部效果「不可确定」、实际停止 `unconfirmed`、`endedAt` 缺席；
   从没起过执行者的（`queued`）外部效果是「已确定未发生」，实际停止不适用。
3. **同一次提交里交付追补的消息**：前台的，一条 `ToolMessage`（`failed`、`abnormal_interruption`）；后台的，一条 `background_execution_interrupted` 提醒（[S-19](#s-19-送达)）。
4. **同一次处置里请求关闭**这次执行挂着的决策卡片，状态 `superseded`（主线裁定 C-B-M5，**待产品负责人确认**；卡片契约未建立，[G-5](#十二已知缺口)）：
   卡片等的那次执行已经没了，人答了也没人收；`superseded` 不是替人作答，是「等它的对象没了」。
5. **不重起任何执行者**——**没有例外**：哪怕能证明它还没来得及做任何事（PF-006 [停机之后它不重来](../../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来)）。要不要再调一次，由 agent 看着「失败」决定。

- **已交付未追加的消息**（发件箱形状下）在扫描之后照常追加，**不重复追加**（按 `(CallId, 段)` 幂等）。
- **扫描之后，在服务中每条未收场的记录都有活体**（[S-7](#s-7-活体与找得到)）；只处置「有协程要恢复的会话」或只处置前台的，后台的那些会永远悬着（模型否定配置 `RecoverAll = FALSE`）。
- **MCP 动作的执行在桥换代或卸载时同样落 `failed{abnormal_interruption}`**，由 `capability.mcp-bridge` 兑现、经本能力写收场（[S-37](#s-37-执行者登记与撤下)）。

### S-21 租户与会话范围

- **每条执行记录带租户身份，是会话持有的那一个**（SYS-TENANT；PF-015 §6.12）。它随每一条记录条目进会话日志（PF-000 §5.5 租户身份无条件必填）。
- **每个操作都带租户与会话**：给出的租户与记录上的不等，**按找不到处理**（`executionNotFound`）——不回「属于别的租户」，那会让调用方据失败值探出别人的执行。
- 读面（[S-33](#s-33-读一次执行)～[S-35](#s-35-列出活体)）只返回这个 `(租户, 会话)` 下的执行。
- **跨边界重验**：分布式时，核凭据与答复进来的那一侧都要按调用方的租户身份重验（[`data.identity-values/v1#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)）。
- **不按租户、会话或运行开实例**：它们之间差的是数据，不是实现。

### S-22 关键转换留记录

**下列转换各在会话日志里留一条[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)**（SYS-OBSERVABILITY：不得以缺少终态记录冒充仍在运行），条目壳归会话日志的 owner（[G-1](#十二已知缺口)）：

| 转换 | 条目要带的 |
|---|---|
| 提交（记录落下） | 运行、尝试、`CallId`、姿态、放行凭据的引用 |
| 起执行者 | 起的时刻 |
| 转后台 | 原因 |
| 进入等待、答复解除等待 | 第几次、答复者 |
| 中断请求 | 发起者、级别 |
| 收场 | 收场、原因、失败的种类、**账** |
| 实际停止、外部效果的确定性 | 三件事（[S-14](#s-14-停止与外部效果分开说)） |
| 恢复追补 | 同收场；另标「恢复扫描」 |
| 收场之后到达的交回、落盘前那一关不可用 | 丢弃了什么、原样落了什么 |

- 收场那一条**与收场同一次提交**（[S-19](#s-19-送达)）；其余可以晚于它描述的转换，但**不早于**。
- 这些条目只说事，不带给模型读的文本；它们不进给模型看的上下文。

---

## 四、操作

### 这一节每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | **输入** |
| ② | **前置与授权** |
| ③ | **结构性禁止**（不适用写「无」） |
| ④ | **提交点与原子性** |
| ⑤ | **成功返回** |
| ⑥ | **失败集合**（枚举封闭，**没有「其他」**） |
| ⑦ | **幂等与重复** |
| ⑧ | **缺席时的默认答案**（[S-15](#s-15-缺席时的默认答案)） |
| ⑨ | **事件**（[S-45](#s-45-送达通知)） |

**失败值全集**（十三个，每个操作取其子集）：
`invalidInput` · `notAdmitted{why}` · `admissionUnavailable` · `notAvailable{reason}` · `backgroundNotAllowed` · `notInBackground` · `callIdConflict` ·
`executionNotFound` · `notWaiting` · `alreadyEnded` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{which}`（`which ∈ storage · registry`）。
**`runtimeNotReady`（恢复扫描还没完成）与 `runtimeStopped`（本能力正在撤除或已撤除）分开**：前者稍后重试即可，后者要换到下一任。
**每个操作的⑥都含 `invalidInput`、`runtimeNotReady`、`runtimeStopped`；除只读活体表的 [S-35](#s-35-列出活体) 外都含 `dependencyUnavailable{storage}`**，下面逐条列出、不省略。

### S-23 提交一批

`submit(tenant, session, run, attempt, batch)`

| # | 内容 |
|---|---|
| ① | 租户、会话、运行、尝试；`batch`：一批 `AdmittedCall`，**按调用块在回复里的次序**。每项 `{ call: ToolCallBlock, admission: AdmissionToken, environment: 执行环境引用, definition: ToolDefinitionRef, startInBackground?: 布尔 }`；`startInBackground` 缺席＝否（它不是身份参数；来源见 [G-11](#十二已知缺口)） |
| ② | **按这个次序判，第一个不成立的就是结果**：本能力在服务（扫描已完成、没在撤除）；会话没归档、这个运行没被取消（[S-28](#s-28-取消一次运行)）；**批里每一项的凭据都核对为相符**：`verifyToken(admission, call, session)`——凭据绑定的是 `(会话, CallId, 生效参数)`，少一样都会留缝（`CallId` 只在一份会话日志内唯一）；**批里每一项在这次尝试的注册表里都读得到条目** |
| ③ | 无 |
| ④ | **整批一次提交**：每一项一条执行记录（`queued`，姿态前台或后台）＋ 下面几种**即刻收场**的项的收场、账、消息交付 ＋ 发起即后台的项的占位交付 ＋ 各自的提交条目。**这次提交之前，任何一项的执行者都没起**（[S-17](#s-17-持久意图先于外部效果)）。即刻收场的几种：条目是**替换件** → `unavailable`（替换件给的说明，执行者不起）；条目**不可用** → `failed{not_available}`，带注册表给的原因；`startInBackground` 而工具不许后台 → `failed{background_start_refused}`。发起即后台且允许的 → 姿态后台，前台那次调用收场 `backgrounded{backgrounded_at_start}`（[G-2](#十二已知缺口)） |
| ⑤ | 每一项一行：`{ callId, disposition }`，`disposition` ∈ `accepted{posture}` · `ended{outcome}`（即刻收场的那几项）；**逐条失败**同样出现在这里：`notAvailable{reason}`、`backgroundNotAllowed`——它们的调用已经收场、消息已交付，调用方不必另补结果 |
| ⑥ | **整批失败**（什么都不写）：`invalidInput` · `notAdmitted{why}` · `admissionUnavailable` · `callIdConflict` · `alreadyEnded`（会话已归档或运行已取消） · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage \| registry}`。**逐条失败**（这一批照样成立）：`notAvailable{reason}` · `backgroundNotAllowed` |
| ⑦ | **幂等边界 = `(租户, 会话, CallId)`**：同一个调用再提交一次（同一份生效参数），返回已有那条记录的 `disposition`，**不起第二次执行者**；一批里部分项已登记，登记过的按幂等返回、没登记的照常。**同一个 `CallId` 带不同的生效参数** → 整批 `callIdConflict`（登记方的唯一性被违反，[`data.content-blocks/v1#S-14`](../../../data/content-blocks/v1/contract.md#s-14-callid)） |
| ⑧ | 凭据核对面不可用 → `admissionUnavailable`，**不执行任何一项**（放行判断缺席即全拒，主线裁定 C-B-M4）；注册表读不到 → `dependencyUnavailable{registry}`；身份参数缺席 → `invalidInput` |
| ⑨ | 即刻收场的每一项送达后发 `execution.delivered` |

- **整批校验、整批拒**：一条凭据不符就整批不执行（[PF-012 一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个)），**不执行已核对的那几条**——那一批是一起判的，也一起执行。
  整批被拒时这些调用在日志里还没有结果，**由调用方处置**（它们没进本能力，本能力不替它们落消息）。
- **放行之后参数不许再变**：执行记录里的调用块就是核对过的那一份；本能力之后任何一步都不改它。
- **不可用与替换件是两回事**：替换件是注册表放在原位上、同形的那一件，调用它收场 `unavailable`（PF-006 §6.3）；
  注册表把条目判为不可用（`unavailable{reason}`）而**没有**替换件顶上，调用它收场 `failed{not_available}`、原因来自注册表（主线裁定）。
  **哪些情形是哪一支，由注册表判，本契约只按它给的那一支走。**PF-006 [flows §二](../../../../product/PF-006-tools-and-skills/flows.md#二异常分支)
  把「依赖的外部服务连不上」「执行环境给不了」「MCP 接入点连不上」都写成「换替换件」——按产品正文它们是 `unavailable`（绕路、别重试），
  不是 `failed`（可以重试）；主线转达的裁定把其中几种列在 `failed` 一支下，两者对不上，[报给主线](../verification.md#报给主线)。

### S-24 等前台那一次调用落定

`awaitForeground(tenant, session, callId)`

| # | 内容 |
|---|---|
| ① | 租户、会话、`CallId` |
| ② | 记录存在 |
| ③ | 无 |
| ④ | 只读，无提交 |
| ⑤ | **前台那一次调用已落定、且它的 `ToolMessage` 已在会话日志里**时返回 `{ callOutcome, reason? }`；还没落定就等到落定 |
| ⑥ | `invalidInput` · `executionNotFound` · `runtimeNotReady` · `runtimeStopped`（等着的时候本能力开始撤除） · `dependencyUnavailable{storage}` |
| ⑦ | **幂等，可重复等**：同一次调用任何时刻、任何次数、由任何一副协程来等，得到同一个结果——agent runtime 被回收后，新协程照 Run 里记的「在等这一次」再调一次即可（PF-006 §5.2） |
| ⑧ | 身份参数缺席 → `invalidInput` |
| ⑨ | 不发 |

- **它不改变任何东西**：等的一方没了，执行照跑、照等（PF-006 §6.5）。
- **返回时消息已在日志里**，调用方接着从日志读结果；返回值不是结果的第二份权威。
- 等待中本能力撤除：返回 `runtimeStopped`；下一任扫描后再等，读到的是恢复追补的 `failed{abnormal_interruption}`。

### S-25 中断一次执行

`interrupt(tenant, session, callId, initiator)`

| # | 内容 |
|---|---|
| ① | 租户、会话、`CallId`；`initiator ∈ user · agent`（插队走 [S-31](#s-31-插队处置)，运行取消走 [S-28](#s-28-取消一次运行)，归档走 [S-29](#s-29-会话归档)） |
| ② | 记录存在；这次执行还没收场；`initiator = agent` 时这次执行在后台 |
| ③ | **有**：`initiator = agent` 而这次执行在前台 → `notInBackground`。agent 掐掉的是自己发起、已转后台的执行（PF-007 §6.10）；前台的那一次正阻塞着它自己 |
| ④ | **单次提交**：收场 `interrupted`（原因 `user_interrupted` 或 `terminated_by_agent`，发起者）＋ 账 ＋ 那一段的消息交付 ＋ 条目；**之后**发停止（[S-18](#s-18-收场先落停止后发)） |
| ⑤ | `{ logical: interrupted, physical: stopping \| stopped, externalEffect }`——**三件事分开说**（[S-14](#s-14-停止与外部效果分开说)）；`queued` 的执行 `physical` 不适用、外部效果「已确定未发生」 |
| ⑥ | `invalidInput` · `executionNotFound` · `alreadyEnded` · `notInBackground` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | 已收场 → `alreadyEnded`，**不改收场、不再送达**；重复中断不产生第二条消息 |
| ⑧ | 身份参数或 `initiator` 缺席 → `invalidInput` |
| ⑨ | 送达后发 `execution.delivered` |

- **中断不是失败**（PF-006 §6.7）：收场是 `interrupted`，不是 `failed`，哪怕执行者因停止而以错误退出（那次退出按 [S-16](#s-16-首胜收场只写一次) 丢弃）。
- 前台的执行被中断，落 `ToolMessage`；后台的执行被中断，落 `background_execution_finished{outcome: interrupted}` 提醒（[S-19](#s-19-送达)）。
- `terminated_by_agent` 在 `data.content-blocks` v1 里还没有取值（[S-10](#s-10-占位原因)，[G-2](#十二已知缺口)）：本版 `initiator = agent` 的中断**写得下记录、落不下消息**，按 [S-10](#s-10-占位原因) 末段上交。

### S-26 成批中断

`interruptBatch(tenant, session, callIds, initiator)`

| # | 内容 |
|---|---|
| ① | 租户、会话、一组 `CallId`（非空）、`initiator ∈ user · agent` |
| ② | 每个 `CallId` 都有记录 |
| ③ | 同 [S-25](#s-25-中断一次执行)，逐条判 |
| ④ | **一次提交**：组里每一条**还没收场**的执行，按 [S-25](#s-25-中断一次执行) ④ 收场；**已收场的跳过**，不算失败 |
| ⑤ | 每个 `CallId` 一行：`interrupted{logical, physical, externalEffect}` 或 `alreadyEnded` |
| ⑥ | `invalidInput`（空组、重复 `CallId`、身份缺席） · `executionNotFound`（组里有一条找不到，**整组不动**） · `notInBackground`（`agent` 而组里有前台的，整组不动） · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | 重复调用：已收场的逐条报 `alreadyEnded`，不再产生消息 |
| ⑧ | 同 [S-25](#s-25-中断一次执行) |
| ⑨ | 每一条送达后各发一次 `execution.delivered` |

**为什么要成批**：同一时刻叫停几次执行，逐条调用之间会有别的收场插进来；一次提交里全部判完，结果只取决于那一刻。

### S-27 转后台

`background(tenant, session, callId)`——**用户手动切**。自动转后台（[S-44](#s-44-前台上限与转后台阈值)）、插队顺带（[S-31](#s-31-插队处置)）、发起即后台（[S-23](#s-23-提交一批)）是同一个转移的另三个触发源。

| # | 内容 |
|---|---|
| ① | 租户、会话、`CallId` |
| ② | 记录存在；**前台那一次调用还没落定**；工具定义 `allowBackground: true`；**阶段是 `queued` 或 `running`，不在等待**（本版，[S-8](#s-8-姿态与阶段两个维度)） |
| ③ | 无 |
| ④ | **单次提交**：姿态改后台 ＋ 前台那一次调用收场 `backgrounded{backgrounded_by_user}` ＋ 占位 `ToolMessage` 交付 ＋ 条目。**执行本身不受打扰**：执行者照跑，宿主不变 |
| ⑤ | `{ callOutcome: backgrounded }` |
| ⑥ | `invalidInput` · `executionNotFound` · `alreadyEnded`（前台那一次已落定：已转过后台，或执行已收场） · `backgroundNotAllowed`（工具不许，或正在等待） · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | 已转过后台 → `alreadyEnded`；**单向**，不产生第二条占位 |
| ⑧ | 工具定义没有 `allowBackground: true` → `backgroundNotAllowed`（「不声明就是不能」） |
| ⑨ | 占位送达后发 `execution.delivered` |

- **转后台收掉的是前台那一次调用**：agent runtime 不再等它；这次执行跑到头另有收场，以提醒到达（[S-19](#s-19-送达)）。
- 排队中的执行也可以转后台：它之后照常按次序与并发上限起执行者，只是没人等它。

### S-28 取消一次运行

`cancelForRun(tenant, session, run, level)`

| # | 内容 |
|---|---|
| ① | 租户、会话、运行；`level ∈ graceful · forced`（PF-012 §6.14 两级） |
| ② | 无（取消请求已由调用方**先落日志**，PF-012 §6.15；本操作是那之后发的信号） |
| ③ | 无 |
| ④ | **一次提交**：这个运行名下**姿态为前台**、还没收场的每一次执行，收场 `interrupted{run_cancelled}` ＋ 账 ＋ 占位交付 ＋ 条目；**并记下这个运行已取消**（此后同一运行的提交 → `alreadyEnded`）。之后发停止：`graceful` 按 [S-18](#s-18-收场先落停止后发) 的宽限，`forced` 不等宽限 |
| ⑤ | 被中断的每一条 `{ callId, physical, externalEffect }`；**已转后台的一条都不动**，也不出现在结果里 |
| ⑥ | `invalidInput` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | **幂等**：再调一次，没有新的前台执行可中断，返回空；级别从 `graceful` 升到 `forced` 时，对还在 `stopping` 的执行立即强制停止 |
| ⑧ | `level` 缺席 → `invalidInput` |
| ⑨ | 每一条送达后各发一次 `execution.delivered` |

- **取消跟着宿主走**：前台的跟着停，因为那一步不要了；**后台的不停**（PF-012 §6.13）。**两级的范围相同**，只有停得多快不同（§6.14）。
- **回收 agent runtime 不是取消**，不调本操作；执行一个都不受影响。
- `run_cancelled` 在 `data.content-blocks` v1 里还没有取值（[G-2](#十二已知缺口)）：本版这些中断写得下记录、落不下消息，按 [S-10](#s-10-占位原因) 末段上交。

### S-29 会话归档

`archiveSession(tenant, session)`

| # | 内容 |
|---|---|
| ① | 租户、会话 |
| ② | 无。**调用方在归档流程里「先停活儿」那一步调它**（PF-015 §6.3），会话日志此刻仍可追加 |
| ③ | 无 |
| ④ | **一次提交**：这个会话**全部**还没收场的执行，不论姿态，收场 `interrupted{session_archived}` ＋ 账 ＋ 各自那一段的消息交付 ＋ 条目；**并记下这个会话已归档**。之后按宽限发停止 |
| ⑤ | 被中断的每一条 `{ callId, physical, externalEffect }` |
| ⑥ | `invalidInput` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | **幂等**：再调一次返回空 |
| ⑧ | 身份参数缺席 → `invalidInput` |
| ⑨ | 每一条送达后各发一次 `execution.delivered` |

- **这一刀不可逆**：撤销归档不把任何一次执行接回来（PF-006 §6.5、PF-015 §6.4）；已记下的「已归档」不因撤销归档而清掉，**此后同一会话的提交 → `alreadyEnded`**。
  **撤销归档之后能不能再提交新的执行，本版不承诺**——那要看撤销归档还给会话的是什么，归会话那一程（[G-12](#十二已知缺口)）。
- **归档之后到达的完成：不送达、不改收场、不再落账**；留一条记录条目，外部效果「不可确定」（[S-16](#s-16-首胜收场只写一次)）。模型性质 `NoNewDeliveryAfterArchive`。
- 归档流程里「停活儿」的次序（工具执行与模型请求谁先）归会话那一程；本操作只保证调用之后没有未收场的执行（模型性质 `ArchiveSettlesAll`）。

### S-30 答复等待

`answerWait(tenant, session, callId, waitIndex, answer)`

| # | 内容 |
|---|---|
| ① | 租户、会话、`CallId`、`waitIndex`（答的是第几次等待）、`answer = { value, by }`：`value` 须合那次等待声明的形状；`by` 是答复者——**人**（经卡片）或**另一个 agent**（经 `Agents()` 回应），同一入口（主线裁定 B-M13；形状见 [G-10](#十二已知缺口)） |
| ② | 记录存在；**这次执行此刻在等待，且正是第 `waitIndex` 次** |
| ③ | 无 |
| ④ | **单次提交**：解除这次等待（阶段回 `running`）＋ 条目；答复交给执行者。**与到点（`no_answer`）、中断等竞争同一行，首胜** |
| ⑤ | `{ resumed: waitIndex }` |
| ⑥ | `invalidInput`（身份缺席；`value` 不合声明的形状） · `executionNotFound` · `notWaiting`（没在等，或 `waitIndex` 不是当前这一次） · `alreadyEnded` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | **同一次等待只解除一次**：第二个答给同一次的答复 → `notWaiting`。**一次执行可以等多次**，每次用自己的 `waitIndex` |
| ⑧ | `waitIndex` 缺席 → `invalidInput`：**不替它猜「答的是当前这一次」**——迟到的、答给上一次的答复会因此解除这一次（模型否定配置 `CheckWaitIndex = FALSE`） |
| ⑨ | 不发 |

- **本能力不判谁有资格答**：人能不能答这张卡（「能访问这个会话的人」）归卡片那一侧与会话访问控制；本能力只要求 `by` 的租户与记录上的相同，不同按 `executionNotFound`（[S-21](#s-21-租户与会话范围)）。
- **答复不落成一条消息**：它是那次执行的输入（`data.messages/v1#S-22` 末段）；卡片上的答复记录归 PF-008。
- **「明确拒绝回复」怎样作为一次答复进来**，本版没有表示（[G-10](#十二已知缺口)）；插队时的「人拒绝回复」走 [S-31](#s-31-插队处置)，那是一次中断，不是一次答复。

### S-31 插队处置

`preempt(tenant, session, callIds)`

| # | 内容 |
|---|---|
| ① | 租户、会话、**当前这一步的调用**（非空一组 `CallId`，由插队那一侧给出） |
| ② | 每个 `CallId` 都有记录 |
| ③ | 无 |
| ④ | **一次提交**，对组里每一条**姿态为前台、还没收场**的执行按 PF-014 §5.4 那张表处置：允许转后台且不在等待 → 转后台 `backgrounded_by_preemption`；在等一张卡片 → 中断 `human_declined`；其余（不允许转后台，或在等而等的不是卡片）→ 中断 `interrupted_by_preemption`。**已收场的与已在后台的跳过** |
| ⑤ | 每个 `CallId` 一行：`backgrounded` · `interrupted{reason, physical, externalEffect}` · `skipped` |
| ⑥ | `invalidInput` · `executionNotFound`（整组不动） · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | 重复调用：已处置的都跳过 |
| ⑧ | 身份参数缺席 → `invalidInput` |
| ⑨ | 每一条送达后各发一次 `execution.delivered` |

- **为什么由本能力按表处置，而不是调用方挑 `background` 或 `interrupt`**：选哪一行取决于「许不许后台」「此刻在不在等、等的是不是卡片」——这些是执行记录上的现值。
  调用方先读后动，中间这次执行可能刚进了等待，原因就落错一格；**一次提交里读、判、写**，才守得住「能保留的就保留」（PF-014 §5.3）。
- **排队中的执行同样处置**：允许后台的转后台（之后照常起执行者），不允许的中断（执行者从没起过，外部效果「已确定未发生」）——
  否则一次插队之后，同一批里排在后面的调用会接着在前台起来，agent 还得等它（主线未明写，[报给主线](../verification.md#报给主线)）。
- **插队不动模型请求、不动运行**：那些归 loop 与模型请求运行时。

### S-32 对账

`reconcile(tenant, session)`——**尝试开始时由 loop 调用**（PF-012 §5.7「先对账」）。

| # | 内容 |
|---|---|
| ① | 租户、会话 |
| ② | **本能力的恢复扫描已完成**（否则 `runtimeNotReady`）——扫描之前「找不到」不可信 |
| ③ | 无 |
| ④ | 对这个会话里**每一条还没收场、却找不到活体**的记录，按 [S-20](#s-20-恢复扫描与停机不重来) 第 2～4 步处置（一次提交）。**恢复扫描完成之后这一类本应为空**；它是扫描的兜底，不是第二条恢复路径 |
| ⑤ | `{ settled: CallId[] }`：这次追补了哪几条（通常为空） |
| ⑥ | `invalidInput` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | **幂等**：追补过的已收场，再调不会再追补 |
| ⑧ | 身份参数缺席 → `invalidInput` |
| ⑨ | 每一条追补送达后发 `execution.delivered` |

- **找得到的不追补**：在跑的、在等的都照常，尾巴本来就是方程认得的形状（PF-012 §5.7 最后一行）。
- 对账只看本能力的记录与活体；**日志里「登记了调用却没有工具消息」而本能力没有记录**的那种尾巴（调用从没提交进来），不归本能力处置——那是 loop 那一侧的尾巴。

### S-33 读一次执行

`readExecution(tenant, session, callId)`

| # | 内容 |
|---|---|
| ① | 租户、会话、`CallId` |
| ② | 记录存在 |
| ③ | 无 |
| ④ | 只读 |
| ⑤ | 执行记录（[S-6](#s-6-执行记录)）；另附**此刻的在途帧**（`capability.stream-assembly` 的 `snapshot`，只在有活体且发过帧时） |
| ⑥ | `invalidInput` · `executionNotFound` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | 只读，天然可重复 |
| ⑧ | 读不到 → `dependencyUnavailable{storage}`，**不得返回 `executionNotFound`**：读不到不等于不存在 |
| ⑨ | 不发 |

**`BkgJobs().output` 读的就是这里**：已收场的读收场与结果的去处，没收场的读在途帧。**在途帧不是日志、不是消息**（PF-009 §9.2），读它不改变任何东西。

### S-34 列出后台执行

`listBackground(tenant, session)`

| # | 内容 |
|---|---|
| ① | 租户、会话 |
| ② | 无 |
| ③ | 无 |
| ④ | 只读 |
| ⑤ | 这个会话里**姿态为后台、还没收场**的执行：每条 `{ callId, phase, run, startedAt }` |
| ⑥ | `invalidInput` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | 只读 |
| ⑧ | 读不到 → `dependencyUnavailable{storage}`，**不返回空表** |
| ⑨ | 不发 |

**范围是会话，不是发起它的运行或 agent runtime**（PF-007 §6.10「看得见的范围 = 当前 session」）。

### S-35 列出活体

`listLive(tenant, session)`

| # | 内容 |
|---|---|
| ① | 租户、会话 |
| ② | **恢复扫描已完成** |
| ③ | 无 |
| ④ | 只读 |
| ⑤ | 这个会话里此刻**找得到活体**的执行的 `CallId` |
| ⑥ | `invalidInput` · `runtimeNotReady` · `runtimeStopped` |
| ⑦ | 只读 |
| ⑧ | 扫描前 → `runtimeNotReady`，**不返回空表**：扫描前的空表会被读成「全都没了」 |
| ⑨ | 不发 |

**单机时这是进程内的精确答案；分布式时要改成租约**（[S-46](#s-46-装配给的保证-vs-协议须给的保证)）。它是对账与排查的读面，不是「执行存在」的权威——权威是执行记录。

### S-36 存一份原始结果

`storeRaw(tenant, session, callId, bytes, mediaType) → AttachmentRef`

| # | 内容 |
|---|---|
| ① | 租户、会话、`CallId`、一份字节、它的媒体类型 |
| ② | 记录存在；**这次执行的结果还没落进日志**（落盘前那一关里调用） |
| ③ | 无 |
| ④ | 字节写进存储；**不进会话日志**（PF-012 §5.10：原始结果从头到尾没进过日志）。一次调用存一份 |
| ⑤ | 一个 `AttachmentRef`（[`data.content-blocks/v1#S-21`](../../../data/content-blocks/v1/contract.md#s-21-attachmentref)），`mediaType` 与输入相同、`bytes` 为长度 |
| ⑥ | `invalidInput`（缺媒体类型、身份缺席） · `executionNotFound` · `alreadyEnded`（结果已落进日志） · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | **不幂等**：每次一份新引用；落盘前那一关只调一次 |
| ⑧ | 媒体类型缺席 → `invalidInput`：不猜（`data.tool-definition/v1#S-23`「内联形式必带媒体类型」同一理由） |
| ⑨ | 不发 |

- **卸载判定不在本能力**：要不要卸载、占位写什么，归站在 `after_action` 的卸载判定；本能力只把字节存下、交回地址。
  **两条来路都用它**：工具自己声明卸载而 `raw` 是内联的，与系统兜底截断时存下原文。
- **存在哪个存储、留多久**，全系统尚未定义（[G-7](#十二已知缺口)）；拿到引用不等于有权读它。

---

## 五、执行者一侧

### S-37 执行者登记与撤下

**执行者**（无词条）是一份工具定义的实现在本能力这里的登记：本地工具的实现、MCP 动作的桥、技能脚本的执行都是执行者。

- **按名字找执行者**：起执行者时按 `definition.name` 找这次该用的那一个（[S-38](#s-38-起执行者)）；找不到 → `failed{start_failed}`。
- **本地工具：撤下一个执行者不影响在途执行**（主线裁定 C-B-M9）——已经起了的照常跑完；撤下只影响之后的起执行者。
- **MCP 动作例外**：桥被替换或卸载时，经它挂起的调用**各自落 `failed{abnormal_interruption}`**，**不迁移、不重发**（D-037；由 `capability.mcp-bridge` 兑现，本能力照首胜写收场）。
- **替换件不是执行者**：调用替换件不进任何执行者，本能力直接收场 `unavailable`（[S-23](#s-23-提交一批) ④）。

### S-38 起执行者

**一次执行从 `queued` 到 `running`，按这个次序判，第一个不成立的就是收场：**

1. 轮到它（[S-43](#s-43-一批依次与同一工具的并发上限)：同一批前面的调用都已落定前台那一次收场；同一工具有空位）；
2. 参数合所选命令的 `input`（[`data.tool-definition/v1` CS-1](../../../data/tool-definition/v1/contract.md#cs-1-派发一次多命令调用)）——不合 → `failed{arguments_rejected}`；
3. 执行环境到位（落点求值归 PF-005，[G-4](#十二已知缺口)）——到不了位 → `failed{environment_unavailable}`，**不降级**；
4. 找得到执行者并起得来——找不到或起不来 → `failed{start_failed}`；
5. 起来了 → `running`，记起的时刻（[S-22](#s-22-关键转换留记录)）。

- 第 2～4 步收场的执行**执行者从没跑过**，外部效果「已确定未发生」。
- **起不来不是被中断**：DSH 把 spawn 失败记成 killed，agent 会以为有人叫停了它（[verification](../verification.md#两源已知失败情形)）。
- **执行环境每次执行现算**：换了执行环境权限，下一次执行按新值落（PF-006 §6.8）；本能力不缓存上一次的落点。

### S-39 发帧

**执行者在执行中途可以发帧**（[发帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission)）；帧是这次执行那条 `ToolInternalMessage` 的到达增量（[执行帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)），走与模型回复同一套到达语法（D-035）。

- **信封由本能力给**：`ArrivalEnvelope.target = { kind: tool_execution, callId }`，执行者只给事件；帧的形状与装配的义务归 `data.arrival-events`、`capability.stream-assembly`。
- **在途状态由本能力持有**（D-038 Q18；[在途状态](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)）：不进日志、不是消息；读面在 [S-33](#s-33-读一次执行)。
- **发帧不阻塞、不失败**：帧追加不上、被砍、被丢，都不改变这次执行怎么跑、怎么收场（PF-006 §4「它不承诺任何事」）；本能力不按工具定义去决定解析不解析帧。
- **帧流在收场时收尾**：`completed` 与执行者交回的 `failed` → `finish{end}`；`interrupted`、`no_answer`、归档 → `finish{interrupted}`；停机 → 那份在途状态随活体一起没了，恢复时**不补**帧流（`data.messages/v1#S-14`「持有在途状态的一方也没了时，这条消息写不出来」）；
  发过帧的，`ToolInternalMessage` 与结果消息一起送达、排在它前面（[S-19](#s-19-送达)）；一帧没发就没有这条消息。
- **帧里的媒体块只许引用**（到达语法那一侧的规则）：执行者要给图，先把字节存进存储再给引用。

### S-40 报账

**执行者可以在执行中途报它花掉的钱**：一笔或多笔 `CostItem`（[`data.call-accounts/v1#S-9`](../../../data/call-accounts/v1/contract.md#s-9-costitem一次工具执行里的一笔)），`source` 为 `tool_reported`。

- **被拒的那一笔不进 `items`，也不以零进**（[`S-20`](../../../data/call-accounts/v1/contract.md#s-20-缺账或被拒收记未知不伪造)）；**本能力把「报了但被拒」记成一条记录条目**，不把它变成一笔 `source: none` 的未知——
  那会在账上凭空多一笔「知道有、不知多少」的钱，而被拒的原因是它不合形状、不是金额未知（替 call-accounts 的 G-5 落地，本契约的推导）。
- **经本系统调模型的那几次**，本能力按 `ModelResponse` 记 `model_call` 镜像（[`S-10`](../../../data/call-accounts/v1/contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)），并汇总 `usage`。
- **收场之后才报的**：不改那份账（[S-13](#s-13-账)），留一条记录条目。

### S-41 交回

**执行者跑完，交回一个 `ToolReturn`（字符串或 `ToolResult`），或者抛出。**

| 交回 | 本能力怎么收 |
|---|---|
| 字符串 | 归一成只含一个文本块的 `ToolResult`（[`data.tool-definition/v1#S-20`](../../../data/tool-definition/v1/contract.md#s-20-两种写法与等价规则)：文本块两边都给，块标识由本能力按 `data.content-blocks` 的唯一范围给） |
| `ToolResult`，合形状、合声明 | 收场 `completed`；`content` 成为待落盘结果块的 `blocks`，`attachments` 随之（[S-42](#s-42-结果落成消息之前的那一关)）；`offload` 交给落盘前那一关 |
| `ToolResult`，不合形状（含 `result_call_in_content`，[`S-22`](../../../data/tool-definition/v1/contract.md#s-22-结果内容里没有工具调用)） | 收场 `failed{result_rejected}`；`blocks` 里写清哪里不合（**不修补、不删掉坏的那一块留下其余的**） |
| `ToolResult`，违反声明（带附件而没声明附件存储；某块的模态不在输出模态里，[`S-24`](../../../data/tool-definition/v1/contract.md#s-24-结果与声明对得上)） | 收场 `failed{result_rejected}`（替 tool-definition 的 G-15 落地，本契约的推导）：违反声明的东西不进日志 |
| 抛出、实现自己炸了、MCP 对端报错 | 收场 `failed{implementation_error}`；`blocks` 里写执行者给的说明 |

- **交回检查在收场之前做**：检查不过的，收场就是 `failed`，不存在「先 `completed` 后改判」。
- **`ToolResult` 不是收场**（[`S-25`](../../../data/tool-definition/v1/contract.md#s-25-toolresult-不是收场)）：本能力不读内容推收场；工具作者以正常返回表达失败的写法本版没有（[G-9](#十二已知缺口)）。
- 两种写法到这里只剩一种：之后的每一步只见 `ToolResult`（PF-006 [两种写法到 agent-loop 那里只剩一种](../../../../product/PF-006-tools-and-skills/design.md#两种写法到-agent-loop-那里只剩一种)）。

### S-42 结果落成消息之前的那一关

**有待落盘结果块的收场，送达之前先经过 `after_action`（`each`）那一关**（PF-012 §5.10；[`data.loop-extension/v1#S-14`](../../../data/loop-extension/v1/contract.md#s-14-按位置的-subject)）；卸载判定站在那里。

- **什么收场有待落盘的结果块**（替 loop-extension 留给本能力的那一句落地）：**`completed`，与执行者交回的 `failed`（`implementation_error`、`result_rejected`）**——
  它们的块来自执行者；**其余收场**（`unavailable`、`backgrounded` 占位、`interrupted`、`no_answer`、起不来的 `failed`、`abnormal_interruption`）的块由本能力写，**不经改写**：`subject.result` 缺席。
- **那一关的结论改写的是待落盘的结果块**，本能力照结论落；它存原始结果用 [S-36](#s-36-存一份原始结果)。
- **那一关不可用**（卸载判定这一件不在）：**原样落，并留一条记录条目**（主线裁定 C-7／C-8：卸载判定不可用 = 只记可见）。
  **后果要说清**：作者在 `ToolResult.offload` 里声明的卸载此时无人兑现——落进块的是 `content`，`offload.raw` 不进消息、**也没有人把它存下**，
  PF-006 §6.10「原始结果存着，没丢」这一次不成立；条目里写明「原始结果未存」（[G-6](#十二已知缺口)）。
- **经过那一关与收场不在同一刻**：收场先写下（首胜，之后不再有别的收场），那一关之后才送达；**这段时间停机**，恢复时它是一条已收场、未送达的记录——
  按 [S-19](#s-19-送达) 它的消息必须还在（发件箱形状）或已在（同事务形状）；**若那一关的结论还没落，按原样送达并留条目**（本契约的推导）。
- **谁来驱动这一关**——前台的由等它的那副协程所在的 loop，**后台的、运行已终结的、协程已回收的，由谁**——本版没有答案（[G-6](#十二已知缺口)）。

---

## 六、次序、并发与时限

### S-43 一批依次与同一工具的并发上限

- **一批依次**（主线裁定 C-B-M15）：同一批里后一项的执行者，**要等前一项前台那一次调用落定之后才起**——落定包括它转了后台。
  所以一项转后台之后，下一项接着起；一项被用户单独中断之后，下一项也接着起（中断的是那一次执行，不是这一步；要停这一步，走 [S-28](#s-28-取消一次运行) 或 [S-31](#s-31-插队处置)）。**本版不做批内并发。**
- **同一工具的并发上限**（`settings.concurrency`，主线裁定 B-M08）：**同一个会话里**、同一个工具名下 `running` 与 `waiting` 的执行（不论姿态）不超过这个数；超出的排队，**按提交的先后**起。
  计数范围取会话（本契约的推导：执行的宿主是会话；[报给主线](../verification.md#报给主线)）。没有这项设置就不设上限（[S-15](#s-15-缺席时的默认答案)）。
- **并发位置在收场那一刻释放**，不等实际停下（[S-18](#s-18-收场先落停止后发)）。

### S-44 前台上限与转后台阈值

两项都是偏好类设置（`data.tool-definition/v1#S-12`、`#S-13`），**都只数这次执行在前台 `running` 的时间**，**等待期间不走**（[S-12](#s-12-等待)；本契约的推导，替 tool-definition 的 G-6 落地）。

| 设置 | 到点时 |
|---|---|
| `settings.backgroundThreshold` | 前台那一次调用还没落定 → 转后台 `backgrounded_auto`（阈值只在 `allowBackground: true` 时存在，`data.tool-definition/v1#S-12`） |
| `settings.timeout`（**前台等待上限**，主线裁定 B-M08） | 允许转后台 → 转后台 `backgrounded_auto`；**不允许 → 中断**（原因本版没有取值，[G-3](#十二已知缺口)） |

- **转后台之后两项都不再计**：后台的执行没有「让 run 等太久」的问题；它自己的上限只有等待的到点。
- **`PT0S`**：到点即刻发生——`backgroundThreshold: PT0S` 等于一开跑就转后台，`timeout: PT0S` 等于一开跑就到点。本契约不禁止，也不另作解释。
- 两者同时到点，**阈值那一路先**（两者结果相同时不产生两次转移；不同时，能保留的就保留）。

---

## 七、事件

### S-45 送达通知

**`execution.delivered { tenant, session, callId, segment ∈ call · background, outcome }`**（事件名本契约取，[报给主线](../verification.md#报给主线)）——一段消息追加进会话日志之后发。

- **它是通知，不是控制**：没有监听者也不影响任何事；监听者抛错不回滚那次送达。
- **不承诺到达**、**不承诺次序**、**不承诺恰一次**：权威是会话日志里那条消息；谁要知道「后台执行 X 结束了没」，读日志（`data.messages/v1#S-19` 末段）。
- **没有任何后果依赖它**：空闲会话里一条后台收场提醒要不要开一次新运行，由 loop 按日志判断，不由这条通知触发。
- **本版不开控制类事件**：没有「将要中断」「将要转后台」这类可否决的事件；要介入执行，走拓展点。

---

## 八、性质与前提

### 不变量

| 性质 | 条款 | 谁保护 | 前提 | 模型里 |
|---|---|---|---|---|
| 一次执行的收场写下后不变；前台那一次调用的收场写下后不变 | [S-16](#s-16-首胜收场只写一次)、[S-9](#s-9-两个收场) | 同一行条件写 | 存储兑现条件写（[S-46](#s-46-装配给的保证-vs-协议须给的保证)） | `OutcomeStable`、`CallOutcomeStable` |
| 前台到后台单向 | [S-8](#s-8-姿态与阶段两个维度) | 转移守卫 | —— | `PostureOneWay`（按构造） |
| 收场只在六种里；后台段只在四种里；`unavailable` 只出自替换件；执行的收场不是 `backgrounded` | [S-9](#s-9-两个收场) | 转移表 | —— | `BackgroundSegmentOutcome`、`UnavailableOnlyFromStandIn`、`NoExecutionBackgrounded`（按构造） |
| 一次执行恰一份账，只在收场时落 | [S-13](#s-13-账) | 收场那一次提交 | —— | `OneAccountPerEnded` |
| 等待只在前台 | [S-8](#s-8-姿态与阶段两个维度) | 等待原语、转后台的前置 | 本版限定 | `WaitOnlyForeground`（按构造） |
| 在服务中每条未收场的记录都有活体 | [S-7](#s-7-活体与找得到)、[S-20](#s-20-恢复扫描与停机不重来) | 恢复扫描先于服务 | 停机时活体随进程一起没（执行者资源在扫描时回收） | `ServingConsistent` |

### 安全性质（绝不能发生）

| 性质 | 条款 | 模型里 |
|---|---|---|
| 同一次执行起两次执行者；停机后重来 | [S-17](#s-17-持久意图先于外部效果)、[S-20](#s-20-恢复扫描与停机不重来) | `AtMostOneStart` |
| 一次调用两条工具消息；一段后台执行两条收场提醒；收场提醒早于占位 | [S-19](#s-19-送达) | `AtMostOneToolMessage`、`AtMostOneReminder`、`ReminderAfterPlaceholder` |
| 执行记录收场了而那段消息既不在日志里、也没有耐久地等着追加；转了后台而占位同样丢了 | [S-19](#s-19-送达) | `EndedIsLanded`、`BackgroundHasPlaceholder` |
| 被中断的执行落成别的收场 | [S-18](#s-18-收场先落停止后发) | `InterruptHonored` |
| 答给上一次等待的答复解除了这一次 | [S-30](#s-30-答复等待) | `NoStaleAnswer` |
| 取消一次运行停了后台的执行 | [S-28](#s-28-取消一次运行) | `RunCancelSparesBackground`（按构造） |
| 会话归档之后还有未收场的执行；归档之后还有新的送达 | [S-29](#s-29-会话归档) | `ArchiveSettlesAll`、`NoNewDeliveryAfterArchive` |
| 批内前一项还没落定就起了后一项；同一工具超过并发上限 | [S-43](#s-43-一批依次与同一工具的并发上限) | `SequentialBatch`、`ConcurrencyCap`（按构造） |
| 没放行（凭据不符或核对不了）的调用被执行 | [S-23](#s-23-提交一批) | **不在模型里**：场景 [S-60](#s-60-凭据不符与核对不了都整批不执行) |
| 不允许后台的工具被转到后台（任何触发源） | [S-27](#s-27-转后台)、[S-31](#s-31-插队处置)、[S-44](#s-44-前台上限与转后台阈值) | 守卫（按构造）；场景 [S-58](#s-58-插队三行) |

### 进展性质（全部有前提）

| 性质 | 条款 | 前提 | 模型里 |
|---|---|---|---|
| 停机后找不到活体的未收场执行，终会被落定 | [S-20](#s-20-恢复扫描与停机不重来) | 本能力终会重新起来并完成扫描 | `LostSettles`（`FairSpec`） |
| 交付了的消息终会进日志 | [S-19](#s-19-送达) | 日志追加终会成功（存储可用） | `HandoffLands`（`FairSpec`） |
| 发出停止的执行者终会实际停下 | [S-18](#s-18-收场先落停止后发) | `execution_stop_grace` 之后的强制停止在那个执行环境里确实生效（X-5 未核） | `StopsTakeEffect`（`FairSpec`） |
| 前台那一次调用终会落定 | [S-24](#s-24-等前台那一次调用落定) | 执行者终会交回，或到点、被中断、停机之一发生——**本能力不保证执行者终止**：没有 `timeout` 的工具可以一直跑 | 不在模型里 |
| 在等的执行终会被解除 | [S-12](#s-12-等待) | 有到点，或有人答复（PF-008：人终将作答不是系统保证） | 不在模型里 |

---

## 九、装配给的保证 vs 协议须给的保证

### S-46 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版单机，语义不变地可扩展为分布式。
**本表只列跨部署形态会变的保证**——左列由单机装配顺带给出，右列是分布式后必须由协议重新兑现的，末列是做不到时会怎样。
**这张表是契约的一部分**：装配给的那些，演化到分布式时不会自动成立。

| 保证 | 单机由谁给（装配给） | 分布式必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **agent runtime 被回收不影响任何执行**（[S-8](#s-8-姿态与阶段两个维度)、PF-006 §6.5） | 本能力不由 agent runtime 承载：执行的宿主不在 agent runtime 之下 | 天然成立；但**等一次前台调用**（[S-24](#s-24-等前台那一次调用落定)）要改成按 `CallId` 的协议等待（读日志或订阅），不能是进程内的一次等待 | 回收一次协程就带走一批前台执行；或新协程等不回结果 |
| **「找得到／找不到」**（[S-7](#s-7-活体与找得到)） | 同一进程的活体表，恢复扫描先于服务 | 租约或心跳决定「找不到」；**执行节点失联 = 这些执行失去连续性 = `failed{abnormal_interruption}`** | 在的判成不在：追补一条失败，真实结果又回来——双结果；不在的判成在：agent 永远等 |
| **收场首胜**（[S-16](#s-16-首胜收场只写一次)） | **同一存储里同一行上的条件写**（执行记录那一行） | 存储仍须对这一行单写者可串行化；不能按节点各写各的行 | 两个收场、两条消息，agent 读到的取决于先看到哪条 |
| **消息的追加与执行记录的写不得只成一半**（[S-19](#s-19-送达)） | **两种承接形状，提供者设计二选一，契约不选**：① 会话日志的追加口能加入本能力的事务（由 loop 那一程给出）；② 发件箱——本能力在事务内写执行记录与一条出站项，日志追加消费出站项、按 `(CallId, 段)` 幂等。**当前两者都还没有共同的存储对象**（跨 owner），[G-1](#十二已知缺口) | 发件箱形状，按 `(CallId, 段)` 幂等追加；出站项与执行记录在同一个可串行化的存储里 | 记录说收场了而日志里永远没有那条消息，agent 永远等；或日志有了消息而记录说还在跑，恢复时再追补一条——**两条结果** |
| **结果只送达一次、送到对的调用上**（[S-19](#s-19-送达)） | 本能力是唯一送达方；`CallId` 在会话日志内唯一（[`data.content-blocks/v1#S-14`](../../../data/content-blocks/v1/contract.md#s-14-callid)） | 送达按 `(CallId, 段)` 幂等；`CallId` 的登记跨节点串行化或按节点分域 | 结果指回错的调用，agent 据别人的结果行动 |
| **放行凭据可核对**（[S-23](#s-23-提交一批)） | 凭据是日志里放行结论的引用，本能力读同一份日志 | 任何节点读日志即可核对；核对面按调用方租户身份重验 | 核对不了 → `admissionUnavailable`，整批不执行（fail-closed 的方向） |
| **本能力不随依赖换代而停下**（前提） | 本能力的依赖只有存储与时钟，**本版不换代**（装配前提） | 不适用 | 依赖一换代，本能力撤除、全部在途执行按停机处理（落 `failed{abnormal_interruption}`）——**正确，但每换代一次就是一次停机** |
| **执行者的资源随停机一起失去**（[S-20](#s-20-恢复扫描与停机不重来)） | 恢复扫描先回收登记过的进程组，再写失败 | 执行节点失联时由那个节点的看护者回收；回收不了的，外部效果「不可确定」 | 记录说失败而世界里它还在跑、还在做事（提案 X-5，未核） |
| **时刻取自同一个时间源**（[S-13](#s-13-账)、[S-12](#s-12-等待)） | 本机时钟 | 起止时刻与到点取自同一个时间源 | `endedAt < startedAt`，账被拒收；或到点提前、滞后 |

---

## 十、交接、缺席与恢复

### S-47 依赖的提供者不可用

| 依赖 | 不可用时 |
|---|---|
| 存储（执行记录、会话日志） | 读写操作 `dependencyUnavailable{storage}`；**在跑的执行照跑**，收场写不下去时上交（PF-011），**不在内存里假装写成了**；存储回来后照常写。停机后由恢复扫描接管 |
| 放行核对面 | `submit` 整批 `admissionUnavailable`；**不执行任何一项** |
| 注册表 | `submit` 整批 `dependencyUnavailable{registry}` |
| 执行者（本地实现撤下） | 在途的照跑（[S-37](#s-37-执行者登记与撤下)）；之后起不来的落 `failed{start_failed}` |
| MCP 桥（换代或卸载） | 经它挂起的调用落 `failed{abnormal_interruption}`（[S-37](#s-37-执行者登记与撤下)） |
| 流装配（帧） | 帧追加不上：不影响执行（[S-39](#s-39-发帧)） |
| 落盘前那一关 | 原样落并留条目（[S-42](#s-42-结果落成消息之前的那一关)） |
| 时钟 | 到点与阈值不触发，记录上的时刻写不下：收场写不下去时上交；**不用一个猜的时刻填** |

### S-48 本能力自己的撤除与换代

- **撤除时不再接受新的提交**（`runtimeStopped`）；**不在撤除时写收场**——那是下一任恢复扫描的事；撤除时可以顺手按 [S-20](#s-20-恢复扫描与停机不重来) 写同一个首胜收场，**但正确性不依赖它**。
- **换代等于一次停机**：上一任的活体全部失去，下一任扫描把它们落 `failed{abnormal_interruption}`，**不重起**。
- **回收 agent runtime、取消一次运行、会话归档都不是本能力的撤除**，各有各的操作。

---

## 十一、规范表达与验证义务

### S-49 本版选用哪些形式工件

- **TLA+ 行为模型 [`formal/Execution.tla`](formal/Execution.tla)**：一个会话、两批四次调用、一次停机；主配置六处保护全开，一个进展配置，六个去保护的否定配置。
  条款与性质的对应、每一处保护被去掉时的反例、模型盖不到什么，见 [formal 入口](formal/README.md)。
- **不建 Alloy**：本契约的结构约束（一次调用一条记录、一条工具消息）都随行为出现，在 TLA+ 里已有能失败的断言；没有独立的结构性质需要它。
- **不建 Schema**：见开头「表示」。
- 模型之外的性质（凭据、注册表、交回检查、账的内容、帧、落盘前那一关、租户隔离）的证据是下面的规范场景与 [verification](../verification.md) 登记的故障注入。

### 规范场景

**每条场景都要在真实实现上演练；[examples](examples.md) 给出对应的走查。**

#### S-50 前台完成

一次前台调用跑完交回 `ToolResult` → 收场 `completed`，过落盘前那一关，一条 `ToolMessage`、一份账、一条收场条目，**同成同败**；`awaitForeground` 在消息进日志之后返回。

#### S-51 前台被用户中断

前台执行中用户叫停 → **先**写 `interrupted{user_interrupted}`、交付占位，**再**发停止；执行者随后以错误退出，**那次退出被丢弃**；返回里逻辑停止、实际停止、外部效果「不可确定」三件事分开。

#### S-52 自动转后台后完成，落一条提醒

允许后台、有阈值的工具前台跑过阈值 → 占位 `backgrounded{backgrounded_auto}`；同一批下一项随即起来；它跑完 → 一条 `background_execution_finished{completed}` 提醒，排在占位之后；运行已终结也照落，账归原运行。

#### S-53 等待、再次等待与迟到的答复

执行进第 1 次等待 → 答复 `waitIndex = 1` 解除 → 进第 2 次等待 → 一个迟到的 `waitIndex = 1` 答复被拒 `notWaiting`，第 2 次等待不受影响；到点则 `no_answer`。

#### S-54 停机后前台与后台各追补一条

一次前台在跑、一次已转后台时据点停机 → 重启扫描完成前一切操作 `runtimeNotReady`；扫描把两条都落 `failed{abnormal_interruption}`：前台的一条 `ToolMessage`、后台的一条 `background_execution_interrupted` 提醒；**执行者都不重起**；那条前台执行挂的卡片请求关闭为 `superseded`。

#### S-55 找得到的不追补

执行在跑时 loop 做一次对账 → 什么都不追补，日志里那个 `CallId` 只有它自己跑完之后的那一条结果（故障注入 ①：在的误判成不在）。

#### S-56 归档之后到达的完成不送达

归档中断了一次在跑的后台执行 → 一条 `background_execution_finished{interrupted}`；执行者随后交回 → 不送达、不改收场、不再落账，留一条条目，外部效果「不可确定」。

#### S-57 取消运行不动后台

一个运行名下一前台一后台 → `cancelForRun(graceful)` 只中断前台那条（`run_cancelled`），后台那条照跑；强制那一级范围相同。

#### S-58 插队三行

三种局面各演练一次：允许后台且在跑的 → `backgrounded_by_preemption`；不允许后台的（在跑的，与同一批里还排着的）→ `interrupted_by_preemption`；停在一张卡片上等人的 → `human_declined`。
一批里前一项被转后台、后一项还排着时，一次 `preempt` 之后后一项**不在前台起来**。

#### S-59 停止与交回交错

中断的收场写下之后、实际停下之前，执行者交回了一个完成 → 丢弃，外部效果「不可确定」；日志里只有中断那一条占位。

#### S-60 凭据不符与核对不了都整批不执行

一批两项，一项凭据与生效参数不符 → 整批 `notAdmitted`，两项都没有记录；核对面不可用 → 整批 `admissionUnavailable`，同样都没有记录。

---

## 十二、已知缺口

**缺口不填默认值。**消费者读到这里应当知道哪里在等裁决。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-1** | **会话日志的追加口与记录条目的壳未定义**：追加是否能加入本能力的事务、按 `(CallId, 段)` 幂等的追加口、记录条目带什么——执行记录与会话日志之间**当前没有共同的存储对象** | [S-19](#s-19-送达) 两种承接形状选哪一种；[S-22](#s-22-关键转换留记录) 条目的形状 | **主线／loop 与会话那一程**（会话日志的 owner）；形状选择随后归本能力的提供者设计 |
| **G-2** | **三个占位原因在 `data.content-blocks` v1 里没有取值**：`run_cancelled`、`backgrounded_at_start`、`terminated_by_agent`（主线已裁要加） | [S-10](#s-10-占位原因) 那三行、[S-23](#s-23-提交一批)、[S-25](#s-25-中断一次执行)、[S-28](#s-28-取消一次运行)：**记录写得下、消息落不下** | **主线**：`data.content-blocks` 下一版补三值；PF-006 §6.7／§6.12 产品修订 |
| **G-3** | **前台上限到点而不许转后台时的中断原因没有取值** | [S-44](#s-44-前台上限与转后台阈值) 那一行 | **PF-006 的 owner**：补一行原因（「超时被中断」一类），或明说超时对不许后台的工具不适用 |
| **G-4** | **执行环境引用的家与落点求值**：PF-005 没有契约；引用的形状、「到不了位」由谁判 | [S-38](#s-38-起执行者) 第 3 步、`AdmittedCall.environment` | **PF-005 的 owner**（后续一程） |
| **G-5** | **决策卡片没有契约**：卡片标识的形状、`superseded` 这个关闭状态（主线裁定 C-B-M5 **待产品负责人确认**）、谁能答卡 | [S-12](#s-12-等待) 的卡片成员、[S-20](#s-20-恢复扫描与停机不重来) 第 4 步、[S-31](#s-31-插队处置) `human_declined` 的判据 | **PF-008 的 owner**（产品补一句）；卡片契约归后续一程 |
| **G-6** | **落盘前那一关由谁驱动**：后台执行收场时、运行已终结时、协程已回收时，`after_action`（`each`）由哪一方派发、在谁的宿主里跑；**那一关不可用时作者声明的卸载无人兑现、原始结果丢失**（「只记可见」的后果） | [S-42](#s-42-结果落成消息之前的那一关)：后台结果与停机后的送达；带 `offload` 的交回 | **主线**（PF-012 与 `capability.loop-extension-runner`） |
| **G-7** | **存储未定义**：`storeRaw` 存进哪个存储、留多久、解引用时谁判能不能读（同 `data.content-blocks` 的 G-1） | [S-36](#s-36-存一份原始结果)、帧里的媒体引用 | **PF-006 的 owner**（B-M14 已指向 `core/storage` ＋ 保留期设置，待落） |
| **G-8** | **`ToolCallAccount` 装不下的三件事**：外部效果的确定性与实际停止（[S-14](#s-14-停止与外部效果分开说)）、「运行终结之后落的账」的标注（主线裁定 `late`）、收场之后才到的费用怎样进有效费用（补账对工具执行只收 `manual`） | [S-13](#s-13-账)、[S-40](#s-40-报账) | **主线**：`data.call-accounts` 下一版 |
| **G-9** | **工具作者以正常返回表达失败的写法**（`data.tool-definition` 的 G-9） | [S-41](#s-41-交回)：本版只有抛出一条路 | **`data.tool-definition` 的 owner** |
| **G-10** | **答复的形状**：答复者（人：哪个租户成员；agent：`AgentRef` 的家在 `data.messages` 的 G-7）怎样表示；「明确拒绝回复」怎样作为一次答复进来 | [S-30](#s-30-答复等待) | **PF-008 的 owner**（卡片契约）与 PF-007 `Agents()` 的 owner |
| **G-11** | **发起即后台的请求从哪来**：`Shell()` 的 `run_in_background` 是它自己的一个参数；一般的调用怎样表达「发起时就在后台」、由谁置 `startInBackground` | [S-23](#s-23-提交一批) ① | **PF-007 的 owner** 与 loop 那一程 |
| **G-12** | **会话标识的类型与撤销归档之后的提交**：`SessionRef` 的家（`data.messages` 的 G-7）；撤销归档之后同一会话能否再提交执行 | [S-6](#s-6-执行记录)、[S-29](#s-29-会话归档) | **会话那一程**（PF-015） |
| **G-13** | **主线裁定没有落成决定记录**：开头「主线裁定」一条列的各项，设计链里暂无处可链 | 本契约接受时这些依据的可追溯性 | **主线**：落一份决定（`record/decisions/message-and-shape-rulings-2026-09-23/` 或新决定） |
| **G-14** | **工具执行被中断时要不要另补一条 `interrupted` 提醒**（`data.messages/v1#S-21`「只要中断就补」）：占位已经说清原因，再补一条是否重复；若要补，由谁补 | [S-19](#s-19-送达)：本版**不补**，只落占位 | **主线**（PF-009 §6.13 与 `data.messages` S-21 的适用范围） |

---

## 十三、消费者核对

#### CS-1 agent loop 等一次前台调用

loop 提交一批之后，依赖 [S-23](#s-23-提交一批) ⑤、[S-24](#s-24-等前台那一次调用落定)、[S-43](#s-43-一批依次与同一工具的并发上限)：对每一项 `awaitForeground`，返回时那条 `ToolMessage` 已在日志里；
协程被回收后新协程照 Run 里记的 `CallId` 再等一次，得到同一个结果。**整批被拒时**（`notAdmitted` 等），这些调用在日志里没有结果，loop 自己处置——本能力不替它落。

#### CS-2 `BkgJobs()` 三命令

`list` → [S-34](#s-34-列出后台执行)；`output` → [S-33](#s-33-读一次执行)（已收场的看收场，没收场的看在途帧）；`terminate` → [S-25](#s-25-中断一次执行) `initiator = agent`——
**本版停在 [G-2](#十二已知缺口)**：`terminated_by_agent` 没有取值，记录写得下、消息落不下。

#### CS-3 会话归档流程

「先停活儿」那一步调 [S-29](#s-29-会话归档)，返回之后这个会话没有未收场的执行；之后才落归档状态。撤销归档不接回（[G-12](#十二已知缺口)）。

#### CS-4 插队

intake 在 loop 停在「等工具」时对当前这一步的调用调 [S-31](#s-31-插队处置)；不自己挑转后台还是中断。

#### CS-5 卸载判定

站在 `after_action`（`each`），拿到 `subject.result`（有才带，[S-42](#s-42-结果落成消息之前的那一关)）；要存原文调 [S-36](#s-36-存一份原始结果)，把占位写进改写后的结果块。**本版停在 [G-6](#十二已知缺口)**（后台结果那一支）与 [G-7](#十二已知缺口)（存储）。

#### CS-6 MCP 桥

桥作为执行者被起（[S-38](#s-38-起执行者)），对端报错 → 交回失败（`implementation_error`）；桥换代 → 挂起的调用 `failed{abnormal_interruption}`（[S-37](#s-37-执行者登记与撤下)）；接入点连不上是注册表那一侧的不可用（[S-23](#s-23-提交一批) ④），不到执行。

---

## 十四、版本差异

v1 是首版，无前版。**候选、未经独立评审、未接受。**
