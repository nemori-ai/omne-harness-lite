# capability.tool-execution-runtime v1

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.tool-execution-runtime, 1)`
- **状态**：`candidate`（2026-09-23 起草，2026-09-24 按第一轮独立评审修订，2026-09-25 按第二轮修订、同日按实现映射反推修订，同日修复波 3 跨批对齐落 N-22 T-16），**未接受、未冻结**；接受与采用只从 [catalog](../../../../registry/README.md) 读
- **设计依据**（PF-006 rev 19；2026-09-24 由 rev 17 升上来，见[验证入口](../verification.md#变化的影响)）：
  [§4 Tool Execution](../../../../product/PF-006-tools-and-skills/design.md#tool-execution)、
  [§5.3 多命令工具的定义里带多少](../../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)（带了完整参数，系统据它校验交上来的参数）、
  [§6.6 前台上限与并发上限](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限)、
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
- **相邻依据**（2026-09-24 逐版复核，见[验证入口](../verification.md#变化的影响)）：PF-012 rev 14 [§5.7 三个运行时](../../../../product/PF-012-agent-loop-and-run/design.md#三个运行时停机之后各算什么)、
  [§5.7 先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)、
  [§5.8 一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个)、
  [§5.10 卸载那一关](../../../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)、
  [§6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)、[§6.14](../../../../product/PF-012-agent-loop-and-run/design.md#614-停止有两级)、
  [§6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号)、[§6.17](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)；
  PF-009 rev 8 [ToolInternalMessage](../../../../product/PF-009-context-message-types/design.md#toolinternalmessage)、
  [§6.9 用户看见了的，会话日志里必须有](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)、
  [§9.2 在途状态](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)；
  PF-007 rev 18 [§6.4 `Shell()`](../../../../product/PF-007-meta-capabilities/design.md#64-shell通向命令行)、[§6.10 `BkgJobs()`](../../../../product/PF-007-meta-capabilities/design.md#610-bkgjobs通向自己发起的执行)、[§6.11 `Ask()`](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人)；
  PF-008 rev 7 [等待态的两个维度](../../../../product/PF-008-human-in-the-loop/design.md#等待态的两个维度)、[§6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)、[§6.4](../../../../product/PF-008-human-in-the-loop/design.md#64-两个答复入口一张卡片只能答一次)；
  PF-014 rev 7 [§5.4 插队停在哪就怎么办](../../../../product/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办)；
  PF-015 rev 11 [§6.3](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态)、[§6.4](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#64-撤销归档只还给你状态)、[§6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)；
  PF-005 rev 5 [§6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)；
  PF-000 rev 1 [§5.5](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段)；
  PF-011 rev 4 [非常态](../../../../product/PF-011-off-nominal-handling/design.md#非常态)、[上交](../../../../product/PF-011-off-nominal-handling/design.md#上交)、[§6.2 上交即打断](../../../../product/PF-011-off-nominal-handling/design.md#62-上交即打断)；
  [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)、
  [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md#sys-observability全链路可观测与日志完备)
- **决定**：[D-032](../../../../record/decisions/tool-execution-runtime-baseline/decision.md)（自研；两源已知失败情形列为测试义务，
  来源见[提案](../../../../record/proposals/tool-execution-runtime-baseline/alternatives.md#a--fork-dsh-jobsjobsjobs-localtool-jobs-再改造)）、
  [D-035](../../../../record/decisions/message-and-stream-baseline/decision.md)（帧与模型回复同一到达语法）、
  [D-037](../../../../record/decisions/mcp-client-adoption/decision.md)（MCP 挂起调用断开即落失败、不重放）、
  [D-038](../../../../record/decisions/message-and-shape-rulings/decision.md)（Q15：真实结果落哪种消息只看有没有占位；Q18：在途状态由运行时持有）
- **主线裁定**：没有产品行、或产品正文只给了方向的条款，依据逐条落在[设计依据表](#设计依据表)下的第二张表
- **精确语义依赖**（十三项，消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)，catalog 按它登记）：
  - `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.call-accounts · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.messages · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.tool-definition · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`（accepted，只取时刻 `Instant`）
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`（accepted）
  - `omne-harness-lite-design-2026-09-15 · data.arrival-events · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · capability.stream-assembly · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · capability.tool-admission · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · capability.asset-registry · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · capability.loop-extension-runner · v1`（candidate）
  - `omne-harness-lite-design-2026-09-15 · capability.mcp-bridge · v1`（candidate）
  - 后六项已登记进 catalog，引名逐字核过各自正文（[S-4](#s-4-依赖方向与被消费的面)）。**这六份都不反向登记本契约**：它们提到本契约处只是指路（谁执行、谁是宿主），依赖图无环
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
| PF-006 [§5.3 多命令工具的定义里带多少](../../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡) | S-11、S-23 |
| PF-006 [§6.6 前台上限与并发上限](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限) | S-43、S-44 |
| PF-006 [§5.5 参数说完了却解析不了的调用](../../../../product/PF-006-tools-and-skills/design.md#参数说完了却解析不了的调用不执行以失败回给-agent) | S-11、S-23 |
| PF-006 [§6.12](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来) · [停机之后它不重来](../../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来) · [它的宿主是谁](../../../../product/PF-006-tools-and-skills/design.md#它的宿主是谁决定了什么会带走它) | S-17、S-20、S-25、S-27、S-28、S-29、S-48 |
| PF-006 flows [§1.5](../../../../product/PF-006-tools-and-skills/flows.md#15-一次工具执行的生命周期) · [§1.6](../../../../product/PF-006-tools-and-skills/flows.md#16-一次执行跨越了多轮) · [§1.7](../../../../product/PF-006-tools-and-skills/flows.md#17-用户中断一次执行) · [§二](../../../../product/PF-006-tools-and-skills/flows.md#二异常分支) · [§3.2](../../../../product/PF-006-tools-and-skills/flows.md#32-一次工具执行) · [§四](../../../../product/PF-006-tools-and-skills/flows.md#四谁决定什么) | S-8、S-13、S-19、S-20、S-25、S-27、S-28、S-29、S-38、S-39 |
| PF-012 [三个运行时](../../../../product/PF-012-agent-loop-and-run/design.md#三个运行时停机之后各算什么) · [先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程) | S-20、S-32 |
| PF-012 [一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个) · [改参数先落一条生效参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数) | S-6、S-23 |
| PF-012 [§5.10](../../../../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关) | S-36、S-42 |
| PF-012 [§5.8 系统自带的几件各站在哪](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪) · [不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法) | S-42、S-63 |
| PF-012 [§6.13](../../../../product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走) · [§6.14](../../../../product/PF-012-agent-loop-and-run/design.md#614-停止有两级) · [§6.15](../../../../product/PF-012-agent-loop-and-run/design.md#615-取消先落日志再发信号) | S-14、S-28 |
| PF-012 [§6.17](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)（I-11 的收窄） | S-13 |
| PF-009 [ToolInternalMessage](../../../../product/PF-009-context-message-types/design.md#toolinternalmessage) · [在途状态](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) | S-33、S-39 |
| PF-009 [§6.9 用户看见了的，会话日志里必须有](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) | S-39、S-48、S-62 |
| PF-007 [§6.4](../../../../product/PF-007-meta-capabilities/design.md#64-shell通向命令行) | S-11、S-23 |
| PF-007 [§6.10](../../../../product/PF-007-meta-capabilities/design.md#610-bkgjobs通向自己发起的执行) | S-25、S-33、S-34 |
| PF-007 [§6.11](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人) | S-12、S-31 |
| PF-008 [等待态的两个维度](../../../../product/PF-008-human-in-the-loop/design.md#等待态的两个维度) · [§6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答) · [§6.4](../../../../product/PF-008-human-in-the-loop/design.md#64-两个答复入口一张卡片只能答一次) | S-12、S-20、S-30 |
| PF-014 [§5.4](../../../../product/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办) | S-31 |
| PF-015 [§6.3](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态) · [§6.4](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#64-撤销归档只还给你状态) | S-29 |
| PF-015 [§6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) | S-6、S-21 |
| PF-000 [§5.5](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段) | S-14、S-21、S-22 |
| PF-011 [非常态](../../../../product/PF-011-off-nominal-handling/design.md#非常态) · [上交](../../../../product/PF-011-off-nominal-handling/design.md#上交) | S-9、S-47 |
| PF-011 [§6.2 上交即打断](../../../../product/PF-011-off-nominal-handling/design.md#62-上交即打断) | S-41、S-47、S-48 |

**没有产品行、或产品正文只给了方向的条款，依据各落在哪**（产品负责人尚未逐条追认的主线裁定汇编在 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md)）：

| 条款 | 依据 |
|---|---|
| [S-5](#s-5-一次执行以会话里的-callid-指认)：以 `CallId` 指认，不另立执行标识 | 本契约推导：`CallId` 在一份会话日志内唯一（`data.content-blocks/v1#S-14`），一次调用恰一次执行 |
| [S-8](#s-8-姿态与阶段两个维度)：宿主恒为会话、转后台不换宿主；本版等待只在前台 | [PF-006 §6.5](../../../../product/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上) · [§6.6](../../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)（rev 18 本版限定）· [D-038](../../../../record/decisions/message-and-shape-rulings/decision.md) Q15 |
| [S-9](#s-9-两个收场)、[S-20](#s-20-恢复扫描与停机不重来)：停机收场是 `failed`、原因 `abnormal_interruption` | [PF-006 停机之后它不重来](../../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来)（rev 17） |
| [S-9](#s-9-两个收场)、[S-11](#s-11-失败的种类)、[S-23](#s-23-提交一批)：注册表判为不可用一律收场 `unavailable` | 主线裁定，见 [D-040 §S13 S13-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的) |
| [S-10](#s-10-占位原因)：三个补上的占位原因 | [PF-006 §6.7](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因)（rev 18）；[D-040 §S13 S13-h](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的) |
| [S-13](#s-13-账)：运行终结之后才结束的后台执行照样落账、标 `late` | 主线裁定，见 [D-040 §S2 S2-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s2call-accounts报回的)（PF-012 I-11 的收窄） |
| [S-13](#s-13-账)、[S-14](#s-14-停止与外部效果分开说)：外部效果、停止时刻与 `late` 的投影；收场之后的费用走补账 | 主线裁定，见 [D-040 §S13 S13-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的) |
| [S-19](#s-19-送达)：工具执行被中断不另补提醒；消息与记录不只成一半、两种承接形状不选 | 主线裁定，见 [D-040 §S13 S13-d、S13-g](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的) |
| [S-20](#s-20-恢复扫描与停机不重来) 第 4 步：恢复时把阻塞执行已终局的卡片关成已作废（`superseded`） | [PF-008 §6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)（rev 7）；产品负责人裁定 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md) U-6 |
| [S-23](#s-23-提交一批)：放行核对不了即整批不执行 | [PF-012 §5.8 系统自带的几件，不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)（rev 12：放行判断不在时一律拒） |
| [S-23](#s-23-提交一批)：核对面 `verifyToken(token, call, session)` | 主线裁定，见 [D-040 §S14 S14-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s14tool-admission报回的) |
| [S-30](#s-30-答复等待)：答复者是人或另一个 agent、同一入口 | [PF-006 等待态](../../../../product/PF-006-tools-and-skills/design.md#等待态)「谁来应答不是这个概念的一部分」 |
| [S-36](#s-36-存一份原始结果)、[S-42](#s-42-结果落成消息之前的那一关)：声明卸载的原始结果由本能力总是存下 | 主线裁定，见 [D-040 §S13 S13-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的) |
| [S-37](#s-37-执行者登记与撤下)：MCP 动作随桥换代落 `failed{abnormal_interruption}` | 主线裁定，见 [D-040 §S19 S19-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的) |
| [S-42](#s-42-结果落成消息之前的那一关)：落盘前那一关不可用 = 只记可见 | [PF-012 §5.8 系统自带的几件，不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)（卸载判定由指定挂件顶上：只记一笔） |
| [S-43](#s-43-一批依次与同一工具的并发上限)、[S-44](#s-44-前台上限与转后台阈值)：前台上限、并发上限按会话计、等待不计时 | [PF-006 §6.6 前台上限与并发上限](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限)（rev 18）；推导的两条（超时与阈值只计前台运行时间、并发按会话计）见 [D-040 §S13 S13-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的) |
| [S-43](#s-43-一批依次与同一工具的并发上限)：一批依次执行；[S-37](#s-37-执行者登记与撤下)：本地实现撤下不影响在途；[S-11](#s-11-失败的种类)：执行时才发现落点不到位落 `failed{environment_unavailable}` | 主线裁定，见 [D-040 §六 N-8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（G-13 七条；原 G-13 闭合） |
| [S-11](#s-11-失败的种类)、[S-23](#s-23-提交一批)：参数不合即刻失败并带用法；未知键一律拒；单函数工具同一规则；即刻收场的次序 | [研究 V-5](../../../../../research/tool-definition-shape-sources/evidence.md) 结论 ③；主线裁定，见 [D-040 §六 N-8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)（G-13 七条） |
| [S-23](#s-23-提交一批)、[S-38](#s-38-起执行者)：逆转写在本能力 | 主线裁定，见 [D-040 §五 K10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [S-39](#s-39-发帧)、[S-19](#s-19-送达)：帧流结局按 `data.messages/v1#S-14` 的对应表；`ToolInternalMessage` 只在交出的 `blocks` 非空时有 | 主线裁定，见 [D-040 §五 K2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [S-62](#s-62-工具侧到达装配前提的承诺)：工具侧到达装配前提逐条承诺 | 主线裁定，见 [D-040 §五 K23](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [S-23](#s-23-提交一批)、[S-64](#s-64-参数收齐却解析不了)：参数解析不了的调用归本能力收场 | 主线裁定，见 [D-040 §五 K24](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [G-16](#十二已知缺口)：整批被拒之后落什么收场 | 主线裁定，见 [D-040 §五 K25](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [S-23](#s-23-提交一批) ②：凭据核对按（会话，`CallId`，生效参数） | 主线裁定，见 [D-040 §五 K27](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [S-63](#s-63-卸载判定这一件)：卸载判定的能力标识，卸载判定这一件归本契约 | 主线裁定，见 [D-040 §五 K29](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [S-6](#s-6-执行记录)、[S-23](#s-23-提交一批)、[S-38](#s-38-起执行者)：MCP 动作的接入点持有取自可用性报告 | 主线裁定，见 [D-040 §五 K30](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [S-23](#s-23-提交一批)：发起即后台被拒只是收场、判重先于其余判定、租户核对（`crossTenant`）；[S-13](#s-13-账)：丢失在途状态时 `frames` 写 `"unknown"`；[S-12](#s-12-等待)、[S-39](#s-39-发帧)～[S-41](#s-41-交回)：四个原语的返回与失败集合 | 主线裁定，见 [D-040 §五 K50](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)；原语返回值与失败值的名字（`notInForeground`、`AdmittedCall`／`UnparseableCall`、`reportedCost`、四原语交回值）、租户核对先于判重、交回写不下去 `escalated`、报告写「没有持有」却提交了动作按读不到处理，见 [D-040 §六 N-8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) |
| [S-23](#s-23-提交一批) ② 第 6 条、④：以 `call.tool` 原样（`ModelToolName`）查注册表，逆转写只为找执行者；注册表答「没有」的那一项即刻收场 `unavailable{no_such_entry}`；报告里查不到条目、没进放行判断的调用以 `UnlistedCall` 交来 | 主线裁定，见 [D-040 §七 M8、M10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；`UnlistedCall` 这个名字由本契约取（[报给主线](../verification.md#报给主线) R-34） |
| [S-48](#s-48-本能力自己的撤除与换代)、[S-39](#s-39-发帧)、[S-62](#s-62-工具侧到达装配前提的承诺) 第 6 条：有序撤下之前对每个开着的装配状态调 `abandon`（帧流落 `lost`），账取 `abandon` 交出的 `frames`；停机仍写 `"unknown"` | 主线裁定，见 [D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) |
| [S-41](#s-41-交回) ⑤、[S-47](#s-47-依赖的提供者不可用)、[S-48](#s-48-本能力自己的撤除与换代)：上交之后本任撤下、不再服务，下一任恢复扫描按停机处置 | 主线裁定，见 [D-040 §七 M13](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；[PF-011 §6.2 上交即打断](../../../../product/PF-011-off-nominal-handling/design.md#62-上交即打断) |
| [S-62](#s-62-工具侧到达装配前提的承诺) 第 1、9 条：按（会话，目标）路由，只推给本会话的观察者 | 主线裁定，见 [D-040 §七 M16](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) |
| [S-23](#s-23-提交一批) ② 第 5 条：多项凭据结果不同时取最左失败值；[S-39](#s-39-发帧) ⑧：形状不合的事件交给 `accept`、按原名交回；[S-40](#s-40-报账) ⑥：收 `invalidInput` | 主线裁定，见 [D-040 §七 M29](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) |
| [S-23](#s-23-提交一批) ①②⑥⑧、[S-46](#s-46-装配给的保证-vs-协议须给的保证)、[S-47](#s-47-依赖的提供者不可用)：`submit` 带 `report`，与 runner `admission.report` 同一份值，接收边界核会话、运行、尝试三者、不现算 | 主线裁定，见 [D-040 §八 M33、M46](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；核对不上收成 `invalidInput`、`report` 缺席即 `invalidInput`（全是 `UnparseableCall` 的一批也必带）原为本契约的推导，已经 N-20 接受，与 runner 同一条 |
| [S-45](#s-45-送达通知)、[S-46](#s-46-装配给的保证-vs-协议须给的保证) 末行：送达通知只在本进程内、不跨进程广播，监听者按载荷自筛 | 主线裁定，见 [D-040 §八 M42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) |
| [G-6](#十二已知缺口) 放宽、[G-17](#十二已知缺口)～[G-19](#十二已知缺口)：`after_action` 的交回面、观察者订阅面、`late` 读面、模型调用成本的来路本程不补 | 主线裁定，见 [D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) |
| [S-11](#s-11-失败的种类)、[S-23](#s-23-提交一批) ④⑤：参数判不了——编不出、超出实现登记的上限，或判定超时——即刻收场 `failed{schema_unsupported}`，带说明，不牵连同批；作者写的工具与 MCP 动作同此（`data.tool-definition` 的 G-15 据此关闭） | 主线裁定，见 [D-040 §八 N-22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16 |

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
| **卸载判定这一件**的能力标识、站位与它不在时怎么办（判据归实现） | [S-63](#s-63-卸载判定这一件) |
| **参数收齐却解析不了的调用**：提交时收下，不执行，即刻收场 `failed`、回一条 `ToolMessage` | [S-23](#s-23-提交一批)、[S-64](#s-64-参数收齐却解析不了) |
| **模型面名字到定义名的逆转写**：收下调用时做一次，只为找执行者用定义名；查注册表用 `call.tool` 原样（模型面名字） | [S-23](#s-23-提交一批)、[S-37](#s-37-执行者登记与撤下) |
| **报告里查不到条目的调用**：没进放行判断，提交时收下，查一次注册表，「没有」即刻收场 `unavailable{no_such_entry}` | [S-23](#s-23-提交一批) |
| **工具一侧[到达装配](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)的宿主**：持有帧流的装配状态，兑现 `capability.stream-assembly` v1 要宿主兑现的前提 | [S-39](#s-39-发帧)、[S-62](#s-62-工具侧到达装配前提的承诺) |

**MCP 动作与本地工具走同一条执行路径**：桥是那条工具定义的「自带实现」、是一个执行者（[S-37](#s-37-执行者登记与撤下)）。

### S-2 本契约不拥有什么

| 不拥有 | 归谁 | 本契约怎么用它 |
|---|---|---|
| 放行判断（四步、卡片、授权表达） | `capability.tool-admission`（接口）；实现是系统自带拓展件 | **只核凭据**：执行前核 `AdmissionToken` 与这次调用相符（[S-23](#s-23-提交一批) ②） |
| 工具定义的形状与校验 | `data.tool-definition` v1 | 读 `allowBackground`、`settings.timeout`／`concurrency`／`backgroundThreshold`、单函数的 `input` 与各命令的 `input`（据以判一次调用的参数，[S-23](#s-23-提交一批) ④）、输出声明 |
| 注册表、可用性、替换件、依赖解析 | `capability.asset-registry` | 以模型面名字查这次尝试里的条目：可用、替换件、不可用，或「没有」（[S-23](#s-23-提交一批) ②④） |
| 执行环境与落点求值 | PF-005（**无契约**） | 调用带一个不透明的执行环境引用；落点到不了位 = 失败，不降级（[S-38](#s-38-起执行者)，[G-4](#十二已知缺口)） |
| 段推进、放行之前的一切、结果落盘前那一关的派发 | agent loop（PF-012）、`capability.loop-extension-runner` | 那一关的结论改写的是本能力待落盘的结果块（[S-42](#s-42-结果落成消息之前的那一关)） |
| 卸载判定的判据（多大算大、摘要怎么写、兜底截断留多少） | 实现（卸载判定这一件的提供者） | 本能力**不因结果大小改变任何东西**；它这一件的身份与站位归本契约（[S-63](#s-63-卸载判定这一件)），存原始结果见 [S-36](#s-36-存一份原始结果) |
| 帧的语法、到达装配本身（状态怎样前进、收尾交出什么） | `data.arrival-events`、`capability.stream-assembly` | 本能力是工具一侧的发出方与装配状态的持有者（[S-39](#s-39-发帧)、[S-62](#s-62-工具侧到达装配前提的承诺)） |
| 会话日志与记录条目的壳 | 会话日志的 owner（loop 与会话那一程，**未起草**） | 本能力往里追加消息与记录条目（[S-19](#s-19-送达)、[S-22](#s-22-关键转换留记录)，[G-1](#十二已知缺口)） |
| 决策卡片（出卡、答卡、关卡） | PF-008（**无契约**） | 等待可以挂一张卡的标识；恢复时请求关闭（[S-20](#s-20-恢复扫描与停机不重来)，[G-5](#十二已知缺口)） |
| 模态两端的判定 | `capability.modality-projection` | 不复述 |
| 十三扇门的具体动作 | PF-007 | 它们是工具，照同一条路径执行 |
| 参数收齐却解析不了的调用**被标记**（封口那一下落成 `unparseable`） | `capability.stream-assembly`（它的 S-11） | 标记之后的收场归本能力（[S-64](#s-64-参数收齐却解析不了)） |
| 整批被拒之后那些调用落什么收场、由谁写 | agent loop 契约（未起草，[G-16](#十二已知缺口)） | 整批被拒时本能力什么都不写 |
| 报告里查不到条目的调用**不进放行判断**、那一次经过记 `observed{no_such_entry}` | `capability.loop-extension-runner`、`capability.tool-admission` | 它以 `UnlistedCall` 交来，收场归本能力（[S-23](#s-23-提交一批)） |

### S-3 本契约明确不承诺什么

- **不承诺外部效果可撤销、可补偿。**停止只是不再继续；已经做了的事留在世界里。本能力记下「外部效果的确定性」（[S-14](#s-14-停止与外部效果分开说)），不替它收拾。
- **不承诺重来。**任何情形下都不自动重发一次执行，包括「能证明它还没开始」的情形（[S-20](#s-20-恢复扫描与停机不重来)）。
- **不承诺帧到达。**帧发得出发不出都不改变这次执行（[S-39](#s-39-发帧)）。
- **不承诺送达通知到达。**权威是会话日志里的那条消息（[S-45](#s-45-送达通知)）。
- **不承诺限时停下。**停止信号发出之后，执行者实际停下的时刻只受 `execution_stop_grace` 之后的强制停止约束；强制停止在不同执行环境里能做到什么，归执行环境（[S-18](#s-18-收场先落停止后发)）。
- **不承诺替工具作者判断「这次算没成」**：作者以正常返回表达失败的写法本版没有（[G-9](#十二已知缺口)）。
- **不解释结果内容**：不读文字推收场，不因结果大小改姿态、不转后台、不截断（PF-006 §6.10）。

### S-4 依赖方向与被消费的面

**依赖单向**：本契约 → 下列数据契约与并行的能力契约；agent loop、`BkgJobs()`、会话归档流程、插队处置、读账的一方读本契约。

| 依赖 | 消费的条款 | 据以写出什么 |
|---|---|---|
| `data.content-blocks` v1 | [S-12](../../../data/content-blocks/v1/contract.md#s-12-完整的工具调用)、[S-14](../../../data/content-blocks/v1/contract.md#s-14-callid)、[S-15](../../../data/content-blocks/v1/contract.md#s-15-工具结果块)、[S-17](../../../data/content-blocks/v1/contract.md#s-17-六种收场)、[S-18](../../../data/content-blocks/v1/contract.md#s-18-占位原因与它落在哪一格)、[S-21](../../../data/content-blocks/v1/contract.md#s-21-attachmentref)、[S-22](../../../data/content-blocks/v1/contract.md#s-22-落盘之后整块不变) | 调用块（含参数解析不了的那一种：`unparseable`、`rawArguments`）、`CallId` 的唯一范围、结果块的形状、六种收场与后台段四种、占位原因与落格、存原始结果得到的引用、落盘不变 |
| `data.call-accounts` v1 | [S-9](../../../data/call-accounts/v1/contract.md#s-9-costitem一次工具执行里的一笔)、[S-10](../../../data/call-accounts/v1/contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)、[S-11](../../../data/call-accounts/v1/contract.md#s-11-toolcallaccount一次工具执行的账)、[S-14](../../../data/call-accounts/v1/contract.md#s-14-wallclock)、[S-17](../../../data/call-accounts/v1/contract.md#s-17-costcorrection事后补账)、[S-18](../../../data/call-accounts/v1/contract.md#s-18-原账不改)、[S-20](../../../data/call-accounts/v1/contract.md#s-20-缺账或被拒收记未知不伪造)、[S-21](../../../data/call-accounts/v1/contract.md#s-21-账进日志不进给模型看的上下文)、[S-25](../../../data/call-accounts/v1/contract.md#s-25-按尝试记明细按-run-汇总)、[S-37](../../../data/call-accounts/v1/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid)、[S-38](../../../data/call-accounts/v1/contract.md#s-38-两种归属用量归凭据那一格成本归发起者)、[S-39](../../../data/call-accounts/v1/contract.md#s-39-晚到的账) | 一次执行恰一份账、何时写、起止时刻、被拒的一笔怎么记、补账、账不进上下文、按运行归属；`RunId`、`AttemptId` 的家；成本归发起者；外部效果与停止时刻的投影；晚到的账标 `late`；在途状态丢了时 `frames` 写 `"unknown"`（S-11） |
| `data.messages` v1 | [S-11](../../../data/messages/v1/contract.md#s-11-toolmessage)、[S-12](../../../data/messages/v1/contract.md#s-12-真实结果落哪种消息只看有没有占位)、[S-13](../../../data/messages/v1/contract.md#s-13-toolinternalmessage)、[S-14](../../../data/messages/v1/contract.md#s-14-toolinternalmessage-怎么收的尾)、[S-19](../../../data/messages/v1/contract.md#s-19-后台执行的两种收场提醒)、[S-21](../../../data/messages/v1/contract.md#s-21-中断之后必补一条)、[S-22](../../../data/messages/v1/contract.md#s-22-系统发起的等待答复回来)、[S-30](../../../data/messages/v1/contract.md#s-30-悬着的占位)、[S-31](../../../data/messages/v1/contract.md#s-31-收齐却解析不了的调用)、[S-32](../../../data/messages/v1/contract.md#s-32-会话日志里的配对与唯一) | 落哪种消息、两种后台收场提醒、工具执行被中断不另补提醒（占位承载）、工具说过程那条消息成立的判据（交出的块非空）与帧流结局到 `ending` 的对应表、工具等待的答复不落消息、解析不了的调用回一条 `failed` 的 `ToolMessage`、日志里的配对与次序 |
| `data.tool-definition` v1 | [S-4](../../../data/tool-definition/v1/contract.md#s-4-单函数工具)、[S-5](../../../data/tool-definition/v1/contract.md#s-5-多命令工具)、[S-6](../../../data/tool-definition/v1/contract.md#s-6-模型面只有一个条目)、[S-7](../../../data/tool-definition/v1/contract.md#s-7-多命令-input-的生成规则)、[S-10](../../../data/tool-definition/v1/contract.md#s-10-设置项声明)、[S-12](../../../data/tool-definition/v1/contract.md#s-12-后台许可与转后台阈值)、[S-13](../../../data/tool-definition/v1/contract.md#s-13-超时与并发)、[S-14](../../../data/tool-definition/v1/contract.md#s-14-时长的表示)、[S-20](../../../data/tool-definition/v1/contract.md#s-20-两种写法与等价规则)、[S-21](../../../data/tool-definition/v1/contract.md#s-21-toolresult-的三样)、[S-22](../../../data/tool-definition/v1/contract.md#s-22-结果内容里没有工具调用)、[S-23](../../../data/tool-definition/v1/contract.md#s-23-卸载)、[S-24](../../../data/tool-definition/v1/contract.md#s-24-结果与声明对得上)、[S-25](../../../data/tool-definition/v1/contract.md#s-25-toolresult-不是收场)、[S-18](../../../data/tool-definition/v1/contract.md#s-18-名字的表示与相等)、[S-26](../../../data/tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序)（第 13 行）、[CS-1](../../../data/tool-definition/v1/contract.md#cs-1-派发一次多命令调用) | **调用块里的 `tool` 与 `definition.name` 是模型面名字 `ModelToolName`，查注册表就用它原样；逆转写（`__` → `:`）由本能力做、只为找执行者，名字限制使它唯一**（S-6、S-18）；设置项不声明即没有、后台许可、超时/并发/阈值的语义（替它的 G-6 落地，产品语义见 PF-006 §6.6）、返回值两种写法的归一、结果检查与违反声明的收场（替它的 G-15 落地）、**参数按单函数的 `input` 或所选命令的 `commands[c].input` 校验、`args` 缺席按 `{}`、命令名只来自 `commands`、用法取自命令说明与参数说明**（[S-11](#s-11-失败的种类)、[S-23](#s-23-提交一批) ④）；**`format` 只作注解、编不出或超出上限即判不了、不退成不判**（S-4 末段、S-26 第 13 行；判不了的收场 `failed{schema_unsupported}` 是本能力的，[D-040 §八 N-22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16） |
| `data.loop-extension` v1 | [S-7](../../../data/loop-extension/v1/contract.md#s-7-name-是身份)、[S-14](../../../data/loop-extension/v1/contract.md#s-14-按位置的-subject) | 卸载判定这一件的能力标识（S-7：身份是 `{ category: loop_extension, name }`）；`after_action`（`each`）的 subject：什么收场之下有待落盘的结果块（替它留给本能力的那一句落地） |
| `data.offer-expiry` v1 | [S-22](../../../data/offer-expiry/v1/contract.md#s-22-schema-的范围) | 时刻 `Instant`：账的起止、等待的到点 |
| `data.identity-values` v1 | [S-5](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等)、[S-17](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)、[S-18](../../../data/identity-values/v1/contract.md#s-18-缺席即拒绝)、[S-19](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败)、[S-30](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证)、[S-31](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示)、[S-33](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) | 执行记录带的租户身份与相等；身份参数没有默认值；缺席即拒；判不出即明确失败；表示层校验与判定分开 |
| `data.arrival-events` v1 | [S-5](../../../data/arrival-events/v1/contract.md#s-5-信封与目标)、[S-14](../../../data/arrival-events/v1/contract.md#s-14-砍)、[S-16](../../../data/arrival-events/v1/contract.md#s-16-收尾)、[S-23](../../../data/arrival-events/v1/contract.md#s-23-执行帧的另外四条)、[S-29](../../../data/arrival-events/v1/contract.md#s-29-表示层拒绝不是判定也不修补) | 帧的信封 `{ target, event }` 与目标 `{ kind: tool_execution, callId }`、帧流的收尾 `finish` 四值、帧里媒体只许引用与帧不给模型看；`trim` 的形状与「被拒的增量由宿主紧接着以 `rejected` 说出」（[S-39](#s-39-发帧)、[S-62](#s-62-工具侧到达装配前提的承诺)） |
| `capability.stream-assembly` v1 | [S-18](../../stream-assembly/v1/contract.md#s-18-start开一份状态)、[S-19](../../stream-assembly/v1/contract.md#s-19-accept接一个事件)、[S-20](../../stream-assembly/v1/contract.md#s-20-snapshot读快照)、[S-21](../../stream-assembly/v1/contract.md#s-21-closeout收尾结算)、[S-22](../../stream-assembly/v1/contract.md#s-22-abandon放弃)、[S-23](../../stream-assembly/v1/contract.md#s-23-本能力自己的失败值)、[S-24](../../stream-assembly/v1/contract.md#s-24-表示层拒绝值原名引用)、[S-28](../../stream-assembly/v1/contract.md#s-28-宿主要兑现的前提) | 装配状态的开、接、读、收尾与放弃——`start`、`accept`、`snapshot`、`closeOut`、`abandon`；工具说过程那条消息由收尾结算产出（[S-39](#s-39-发帧)、[S-33](#s-33-读一次执行)）；`accept` 拒收时的判定失败值与表示层拒绝值原名，发帧原语原样交回给执行者（[S-39](#s-39-发帧) ⑤⑧）；宿主要兑现的前提逐条由本能力承诺（[S-62](#s-62-工具侧到达装配前提的承诺)） |
| `capability.tool-admission` v1 | [S-16](../../tool-admission/v1/contract.md#s-16-admissiontoken-与参数相等)、[S-25](../../tool-admission/v1/contract.md#s-25-verifytoken) | `AdmissionToken`；`verifyToken(token, call, session) → valid \| invalid{reason}`，失败 `invalidInput` · `unavailable`——在本能力收成 `notAdmitted{why}`（`why` 原样取 `reason`）与 `admissionUnavailable`（[S-23](#s-23-提交一批) ②⑧） |
| `capability.asset-registry` v1 | [S-8](../../asset-registry/v1/contract.md#s-8-当下可用性的三个取值)、[S-9](../../asset-registry/v1/contract.md#s-9-按命令的可用性)、[S-10](../../asset-registry/v1/contract.md#s-10-替换件同形只换说明)、[S-11](../../asset-registry/v1/contract.md#s-11-一次执行尝试的可用性报告)、[S-25](../../asset-registry/v1/contract.md#s-25-lookup查一条) | **按名字查一条**（S-25，`within = run{report}`，`report` 是 `submit` 交来的这次尝试的可用性报告，[S-23](#s-23-提交一批) ①；`tool` 类的查找键是模型面名字 `ModelToolName`，本能力以 `call.tool` 原样查）：答那一条、答「没有」（一个结论，本能力落 `unavailable{no_such_entry}`），或读不到（`unavailable`，本能力整批 `dependencyUnavailable{registry}`）（[S-23](#s-23-提交一批) ②④）；条目的 `availability ∈ available · stand_in{for} · unavailable{reason}` 与按命令的可用性；替换件同形只换说明；一次尝试内不变——判为不可用的一律落 `unavailable`（[S-23](#s-23-提交一批) ④）；**报告里钉住的每个接入点的接入点持有**（`endpointHoldings`），MCP 动作的执行由它寻址（[S-23](#s-23-提交一批) ②、[S-38](#s-38-起执行者)）；**报告带的会话、运行与尝试**：`submit` 据以核对交来的 `report` 属于这个会话、这个运行、这一次尝试（[S-23](#s-23-提交一批) ⑥ 的 `invalidInput`；[D-040 §八 M46](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） |
| `capability.loop-extension-runner` v1 | [S-17](../../loop-extension-runner/v1/contract.md#s-17-系统自带件不可用时一律关门)、[S-21](../../loop-extension-runner/v1/contract.md#s-21-dispatch一次经过) | `after_action`（`each`）的一次经过；卸载判定不可用 = 只记可见（[S-42](#s-42-结果落成消息之前的那一关)） |
| `capability.mcp-bridge` v1 | [S-19](../../mcp-bridge/v1/contract.md#s-19-invoke)、[S-21](../../mcp-bridge/v1/contract.md#s-21-失败值与收场的对应)、[S-27](../../mcp-bridge/v1/contract.md#s-27-桥被替换或卸载) | 桥作为执行者：`invoke` 的输入（接入点持有、动作名、参数）；它交回的失败值怎样落收场与失败种类（[S-11](#s-11-失败的种类)）、「请求是否已发出」怎样定外部效果的确定性（[S-14](#s-14-停止与外部效果分开说)）、桥换代或卸载时经它挂起的调用各自落 `failed{abnormal_interruption}`（[S-37](#s-37-执行者登记与撤下)） |

**消费者**：agent loop（段停在「等工具」：`awaitForeground`；尝试开始时 `reconcile`；落盘前那一关）、`BkgJobs()`（`listBackground`、`readExecution`、`interrupt{agent}`）、
会话归档流程（`archiveSession`）、运行取消（`cancelForRun`）、插队处置（`preempt`）、卡片与 `Agents()` 回应（`answerWait`）、
卸载判定（`storeRaw`）、`capability.mcp-bridge`（作为执行者）、读账的一方（读执行记录上的账，按运行汇总，`data.call-accounts/v1#S-25`）。

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
| `call` | 必 | 那个完整的工具调用块，原样——`tool` 是模型面名字；**参数是放行时的生效参数**，解析不了的那一种带原文，没经放行的（`UnlistedCall`）是模型交来的那一份；此后不变（PF-012 [改参数先落一条生效参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)） |
| `definition` | `AdmittedCall` 才有 | 工具定义的引用（`ToolDefinitionRef`，`data.loop-extension` v1 的 `$defs`；名字是模型面名字），外加本能力逆转写得到的**定义名**（[S-23](#s-23-提交一批)） |
| `admission` | `AdmittedCall` 才有 | 放行凭据 `AdmissionToken`（不透明）；参数解析不了的调用、查不到条目的调用都不经放行，没有凭据（[S-64](#s-64-参数收齐却解析不了)、[S-69](#s-69-查不到条目的调用即刻收场不可用)） |
| `environment` | `AdmittedCall` 才有 | 执行环境引用（不透明，[G-4](#十二已知缺口)） |
| `endpointHolding` | MCP 动作才有 | 这次执行寻址对端用的接入点持有，**提交那一刻**取自 `submit` 交来的这次尝试的可用性报告（[S-23](#s-23-提交一批) ①②）；此后不变——凭据改了只对下一次尝试生效 |
| `batch` | 必 | 这一批的 `CallId` 序列与它在其中的位置（[S-43](#s-43-一批依次与同一工具的并发上限)） |
| `posture` | 必 | `foreground` ／ `background`，以及转后台的原因（[S-8](#s-8-姿态与阶段两个维度)、[S-10](#s-10-占位原因)） |
| `phase` | 必 | `queued` ／ `running` ／ `waiting` ／ `ended`（[S-8](#s-8-姿态与阶段两个维度)） |
| `wait` | 在等时 | 当前这一次等待：第几次（`waitIndex`）、等什么形状、可选的到点、可选的卡片（[S-12](#s-12-等待)） |
| `callOutcome` | 落定后 | 前台那一次调用的收场与原因（[S-9](#s-9-两个收场)） |
| `outcome` | 收场后 | 这次执行的收场、原因、失败的种类（[S-11](#s-11-失败的种类)）、**发起者**（中断时：谁叫停的）；`unavailable` 的原因是替换件的说明、注册表给的原因，或 `no_such_entry`（这次尝试里没有这个名字，[S-23](#s-23-提交一批) ④）——记录上的事实，不是块上的 `reason.code` |
| `reportedCost` | 报过账时 | 执行者在收场之前报来、校验通过的那几笔 `CostItem`（[S-40](#s-40-报账)）；收场那一次提交并进账 |
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
- **本版等待只在前台**（[PF-006 §6.6](../../../../product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度) rev 18 本版限定；[D-038](../../../../record/decisions/message-and-shape-rulings/decision.md) Q15 原话「目前我们应该只定了要等待答复的工具只能阻塞在前台」）：
  在等的执行不能转后台（[S-27](#s-27-转后台) 返回 `backgroundNotAllowed`），后台的执行进不了等待（[S-12](#s-12-等待)：等待原语对它回 `notInForeground`）。
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
| `failed` | 执行者交回的失败（抛出、实现出错、MCP 对端报错）；参数解析不了、参数不合（提交时，[S-23](#s-23-提交一批) ④）；起不来（[S-38](#s-38-起执行者)）；交回违反声明；发起即后台被拒；停机（恢复时追补）；本能力有序撤下（[S-48](#s-48-本能力自己的撤除与换代)）；MCP 桥换代 | 只有停机、有序撤下与桥换代那三路带 `abnormal_interruption`；其余**不带**，原因写进 `blocks`（[`data.content-blocks/v1#S-18`](../../../data/content-blocks/v1/contract.md#s-18-占位原因与它落在哪一格)） | 执行者交回的失败：执行者给的说明；其余：本能力写 | 执行者交回的失败**有**；其余**无** |
| `unavailable` | 注册表把这次尝试里这个名字判为不可用（[S-23](#s-23-提交一批) ④）：条目是**替换件**，或所选的那条命令被关掉，或条目 `unavailable{reason}`；**或这次尝试的注册表里没有这个名字**（记录上的原因 `no_such_entry`） | 不带 | 本能力写：替换件给的「现在用不了 + 原因」、注册表给的原因，或「这次尝试里没有这个工具」 | 无 |
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
| 发起时就在后台（[S-23](#s-23-提交一批)） | `backgrounded` | `backgrounded_at_start` | 有（补） |
| 用户直接叫停这一次执行（[S-25](#s-25-中断一次执行)、[S-26](#s-26-成批中断)） | `interrupted` | `user_interrupted` | 有 |
| 插队，工具不允许转后台，或在等但等的不是卡片（[S-31](#s-31-插队处置)） | `interrupted` | `interrupted_by_preemption` | 有 |
| 插队时这次执行停在一张卡片上等人（[S-31](#s-31-插队处置)） | `interrupted` | `human_declined` | 有 |
| agent 经 `BkgJobs()` 掐掉（[S-25](#s-25-中断一次执行)）——**只落后台执行收场提醒的结果块，不作占位**：agent 只能掐已转后台的执行，那次调用的占位早在转后台时写下（以 PF-006 §6.7 为准） | `interrupted` | `terminated_by_agent` | 有（补） |
| 这一次运行被取消而它还在前台（[S-28](#s-28-取消一次运行)） | `interrupted` | `run_cancelled` | 有（补） |
| 会话被归档（[S-29](#s-29-会话归档)） | `interrupted` | `session_archived` | 有 |
| 前台上限到点且不许转后台（[S-44](#s-44-前台上限与转后台阈值)） | `interrupted` | `foreground_timeout`（产品正文的「前台超时」，[PF-006 §6.6](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限)） | 有（补，原 [G-3](#十二已知缺口)） |
| 停机，恢复时追补；本能力有序撤下（[S-48](#s-48-本能力自己的撤除与换代)）；MCP 桥换代 | `failed` | `abnormal_interruption` | 有 |

**三个补上的取值**（`backgrounded_at_start`、`terminated_by_agent`、`run_cancelled`）已进 `data.content-blocks` v1 候选的 [S-18](../../../data/content-blocks/v1/contract.md#s-18-占位原因与它落在哪一格)（原 G-2 闭合）。
**`foreground_timeout`** 同样已进那一条（原 G-3 闭合）：前台超时**不借** `user_interrupted`——那个值说的是用户叫停这一次执行，不是声明的上限到了。

### S-11 失败的种类

**收场是 `failed` 的执行，记录上另带一个失败的种类**（无词条），闭合：

| 种类 | 什么时候 | 执行者跑过吗 |
|---|---|---|
| `unparseable` | 参数收齐却解析不了（提交时收下即落，[S-64](#s-64-参数收齐却解析不了)）：调用块是 `data.content-blocks/v1#S-12` 里标了 `unparseable` 的那一种 | 没有 |
| `arguments_invalid` | 参数不合（提交时判，[S-23](#s-23-提交一批) ④）：单函数工具的参数不合它的 `input`；多命令工具的参数不是对象、`command` 缺席或不是命令表里的一个名字、`args` 在却不是对象、调用带了 `command`／`args` 以外的成员，或 `args`（缺席按 `{}`）不合所选命令的 `commands[c].input`（[`data.tool-definition/v1#S-7`](../../../data/tool-definition/v1/contract.md#s-7-多命令-input-的生成规则) 第 3、4 条、[CS-1](../../../data/tool-definition/v1/contract.md#cs-1-派发一次多命令调用)）——缺 `required` 里的键、带了 `input` 不收的键、类型或取值不合都算 | 没有 |
| `schema_unsupported` | 参数**判不了**（提交时判，[S-23](#s-23-提交一批) ④）：这个实现编不出那一份参数 schema，或其中某个 `pattern` 超出实现登记的上限（[`data.tool-definition/v1#S-26`](../../../data/tool-definition/v1/contract.md#s-26-表示层拒绝值与判定次序) 第 13 行、它的 S-4 末段），**或这一次判定超出实现登记的判定时限**——三者同一个种类（主线裁定，见 [D-040 §八 N-22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16）。上限与时限的值不在本契约（那份契约的 G-16） | 没有 |
| `environment_unavailable` | 执行时才发现落点到不了位；**不降级**（PF-005 §6.9） | 没有 |
| `background_start_refused` | 发起即后台，而工具不允许后台（PF-007 §6.4「声明不允许后台的，`run_in_background` 也起不来」） | 没有 |
| `start_failed` | 执行者起不来（没有登记的执行者、起进程失败）——**不是被中断**（DSH「spawn 失败被记成 killed」那一条，[verification](../verification.md#两源已知失败情形)） | 没有 |
| `implementation_error` | 执行者交回失败：抛出、实现自己炸了、MCP 对端报错；MCP 桥 `invoke` 交回 `bridgeWithdrawn` 以外的失败值 | 跑过 |
| `result_rejected` | 交回的东西不合形状，或违反声明（[S-41](#s-41-交回)） | 跑过 |
| `abnormal_interruption` | 停机后恢复时追补；本能力有序撤下时写下（[S-48](#s-48-本能力自己的撤除与换代)）；MCP 桥换代或卸载（桥交回 `bridgeWithdrawn`） | 跑过或不确定 |

- **九个种类，闭合**。注册表判为不可用**不在这里**：它落收场 `unavailable`，不是 `failed`（主线裁定，见 [D-040 §S13 S13-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)）——`failed` 会让 agent 以为可以重试，而条目此刻就是用不了（PF-006 §6.3）。
- **MCP 桥的失败值怎样落**，按 [`capability.mcp-bridge/v1#S-21`](../../mcp-bridge/v1/contract.md#s-21-失败值与收场的对应) 的对照：应答里对端报了出错 → `implementation_error`、内容照样进结果；
  `endpointUnreachable`、`credentialUnavailable`、`oauthRequired`、`actionUnknown`、`protocolError`、`callTimedOut`、`dependencyUnavailable`、`invalidInput` → `implementation_error`；`bridgeWithdrawn` → `abnormal_interruption`；桥从不交回「不可用」（不可用只出自尝试开始时的判定）。
- **这是记录上的事实，不是块上的原因**：块上 `failed` 只能带 `abnormal_interruption`，其余种类写进 `blocks` 给 agent 读（文案归实现）。
- **`unparseable` 的块上写明「参数解析不了」**，措辞归实现（`data.messages/v1#S-31` 第 3 条）；**不附用法、不猜参数**——那一次的原文就是模型给的，交回去让它看到自己写坏了什么。
- **`schema_unsupported` 的块上带说明**（[D-040 §八 N-22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16）：写明这个工具的参数在这个实现上判不了、是哪一种（编不出、超出上限、判定超时），措辞归实现。**它不是 `arguments_invalid`**：判不了不是判为不合，块上不说「参数不合」、不附「哪里不合」（本契约推导：判不出来与判为拒绝是两个值）；**更不退成「不判参数、照常执行」**（`data.tool-definition/v1#S-4` 末段「缺席即拒绝」）。作者写的工具与 MCP 动作同此收场——MCP 动作在投影时就判出编不出或超上限的，早已是替换件（`capability.mcp-bridge/v1#S-17`），走到这里的是判定时才超时的那一种，或投影与判参数两处登记的上限不同（`data.tool-definition` 的 G-16）。
- **`arguments_invalid` 的块上必带用法**（[研究 V-5](../../../../../research/tool-definition-shape-sources/evidence.md) 结论 ③：模型猜错参数名时，判定层必须把「未知键／缺必填」明确拒回并附该命令的用法，不能静默忽略）。本能力写的那个结果块恰带三样，措辞归实现：
  1. **哪里不合**：缺了哪些必填键、带了哪些 `input` 不收的键、哪些键的值不合；
  2. **这个命令的用法**：**一行说明**——多命令工具是 `<命令名> — commands[c].description`（与模型面前命令清单里那一行同文，`data.tool-definition/v1#S-7` 第 2 条），单函数工具是它的 `description`——
     ＋ **参数表**：`input` 顶层 `properties` 的每个成员一行，写参数名、类型、是否在 `required` 里、它的 `description`（参数说明必填，`data.tool-definition/v1#S-4` 第 2 条）；`properties` 为空时参数表为空，写明这个命令没有声明参数；
  3. `command` 缺席或不在命令表里时没有「所选命令」：以**这个工具的命令清单**（每个命令一行，同模型面前那一份）代替第 2 样。

  **这份用法与 `Tools().inspect` 对同一个命令（工具）答出的用法出自同一份定义、内容一致**——同一个命令的用法有两处说法，对不上 agent 就分不出该信哪个（[PF-006 §5.3](../../../../product/PF-006-tools-and-skills/design.md#多命令工具的定义里带多少是工具作者的权衡)对 `help` 的同一条理由）。
- **未知键一律拒**（主线裁定，见 [D-040 §六 N-8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）：判参数时 `input` 顶层**没写** `additionalProperties` 按 `false` 读——顶层 `properties` 以外的键都是「`input` 不收的键」；作者在 `input` 顶层显式写了 `"additionalProperties": true` 才收下，写的是一份 schema 就按那份 schema 判。
  这是 [`data.tool-definition/v1#S-5`](../../../data/tool-definition/v1/contract.md#s-5-多命令工具) 末条定的读法（不是 Draft 2020-12 的原义），本能力照它判、不另立规矩；只管顶层，嵌套的对象 schema 按原义读（同那一条）。
  依据：[研究 V-5](../../../../../research/tool-definition-shape-sources/evidence.md) 结论 ③——没有 `Tools().inspect` 时 `openai/gpt-5.6-sol` 臆造了 `ignore_case` 并据错误结果作答，静默收下未知键就是这个后果。
  所以「只带命令清单」的写法是 `{"type": "object", "properties": {}, "additionalProperties": true}`：收任何一个对象，参数对不对由工具自己判（PF-006 §5.3 那张表第一行）；只写 `{"type": "object", "properties": {}}` 的命令不收任何参数键。
- **单函数工具与多命令工具同一种类、同一规则**（主线裁定，见 [D-040 §六 N-8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）：单函数工具按它的 `input` 判，块上同样带用法（一行说明是工具的 `description`）——否则 MCP 条目与单函数工具的坏参数会原样交给执行者，与多命令工具成两套规矩。
- 「执行者跑过吗」决定[外部效果的确定性](#s-14-停止与外部效果分开说)：没跑过的是「已确定未发生」。

### S-12 等待

**等待是执行者在执行中途调用的一个原语：停下来，说清自己等什么形状的应答，拿到之后接着跑**（PF-006 [等待态](../../../../product/PF-006-tools-and-skills/design.md#等待态)；[工具等待态](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state)）。

| 执行者给出 | 必 | 含义 |
|---|---|---|
| 等什么形状 | 必 | 一份 JSON Schema（`data.tool-definition` v1 `$defs/JsonSchema` 同一规则）；答复按它校验 |
| 到点 | 否 | 这次等待最晚等到什么时刻（`Instant`）。**只给占着资源的等待**（PF-006 §6.6 判据）；不给就一直等，**本能力不替它设** |
| 卡片 | 否 | 这次等待挂的那张决策卡片的标识（卡片由 PF-008 那一侧出，[G-5](#十二已知缺口)）。挂了卡的等待，插队时原因是 `human_declined` |

**这个原语由执行者在自己那次执行里调用**，九件事：

| # | 内容 |
|---|---|
| ① | 上表三样；调用者是这次执行的执行者（本能力交给它的原语只作用于它自己那一次执行，不带身份参数） |
| ② | 这次执行还没收场，阶段是 `running`，**姿态是前台** |
| ③ | **有**：这次执行在后台 → `notInForeground`（本版，[S-8](#s-8-姿态与阶段两个维度)） |
| ④ | **单次提交**：阶段改 `waiting`、`waitIndex` 加一、记下这一次等什么 ＋ 条目（[S-22](#s-22-关键转换留记录)）；之后这次执行停在这里 |
| ⑤ | 等待结束时恰交回一个：`answered{ value, by }`（答复解除了这一次，[S-30](#s-30-答复等待)；阶段回 `running`，执行者接着跑）；或 `ended{ outcome }`（这次执行在等待中收场了：到点 `no_answer`、被中断、会话归档、运行取消、插队、本能力有序撤下——**执行者应当就此停下**，停止随后发出，[S-18](#s-18-收场先落停止后发)） |
| ⑥ | `invalidInput`（形状不是一份 JSON Schema、到点不是时刻）· `notInForeground` · `alreadyEnded`（这次执行已经收场，执行者还在跑） · `runtimeStopped` · `dependencyUnavailable{storage}`（进入等待写不下去：**不进入等待**，执行者照原样接着跑或自行收尾） |
| ⑦ | **不幂等**：每调一次就是新的一次等待，`waitIndex` 各不相同 |
| ⑧ | 到点缺席 → 一直等；卡片缺席 → 这次等待没挂卡（插队时原因不是 `human_declined`） |
| ⑨ | 不发 |

- **每次进入等待，记录上的 `waitIndex` 加一**（从 1 起）；答复必须指明它答的是第几次（[S-30](#s-30-答复等待)）。**一次执行可以等多次**。
- **到点即收场 `no_answer`**：不是失败、不是被拒（[S-9](#s-9-两个收场)）。到点与答复竞争同一行，首胜（[S-16](#s-16-首胜收场只写一次)）。
- **前台上限与转后台阈值在等待期间不走**（[S-44](#s-44-前台上限与转后台阈值)）：一段不占资源的等待不该被一个为「跑太久」设的上限替人签字（PF-006 §6.6、PF-007 §6.11 (一)）。
- **后台的执行进不了等待**（本版，[S-8](#s-8-姿态与阶段两个维度)）：原语对它回 `notInForeground`，执行者自己决定怎么办；**不隐式转回前台**（转后台是单向的）。
- **agent runtime 被回收不影响等待**：卡片照样挂着，答复照样进来，协程重建后接着等那次调用（[S-24](#s-24-等前台那一次调用落定)）。

### S-13 账

**一次执行恰一份 `ToolCallAccount`**（[`data.call-accounts/v1#S-11`](../../../data/call-accounts/v1/contract.md#s-11-toolcallaccount一次工具执行的账)），**在收场的那一次提交里写下**，此后不改（[S-18](../../../data/call-accounts/v1/contract.md#s-18-原账不改)）。

| 成员 | 本能力怎么填 |
|---|---|
| `callId` | 这次执行的 |
| `initiator` | 提交这次执行时的租户身份（[S-23](#s-23-提交一批) ① 的 `tenant`）——成本归它（[`S-38`](../../../data/call-accounts/v1/contract.md#s-38-两种归属用量归凭据那一格成本归发起者)） |
| `credentialScope` | 这次执行的自有费用经哪一格上的凭据产生；执行者怎样把这一格报给本能力、没报时缺席是否可信，本版没有答案（[G-15](#十二已知缺口)） |
| `externalEffect` | 由 [S-14](#s-14-停止与外部效果分开说) 的外部效果确定性投出：「不可确定」→ `unknown`，其余 → `confirmed` |
| `stoppedAt` | 写账之前已观察到执行者停下的时刻；没观察到就缺席（[`S-14`](../../../data/call-accounts/v1/contract.md#s-14-wallclock)） |
| `late` | 落账时它归属的尝试已被取代或运行已经终结 → `true`；否则缺席（[`S-39`](../../../data/call-accounts/v1/contract.md#s-39-晚到的账)）。这两件事本能力从哪里读，本版没有读面（[G-18](#十二已知缺口)） |
| `cost.items` | 执行者报的（`tool_reported`，收场之前已记在记录的 `reportedCost` 上）与本能力从它管得着的服务收来的（`service_reported`、`model_response`），见 [S-40](#s-40-报账) |
| `usage` | 这次执行经本系统调模型的用量汇总；一次都没调就缺席。那几份 `ModelResponse` 怎样到本能力，本版没有来路（[G-19](#十二已知缺口)） |
| `frames` | 这次执行发了几帧、砍了多少：装配状态收尾时交出的那一份（[S-39](#s-39-发帧)）；执行者从没起过的是 `emitted = 0`、`trims` 各项为零；**本能力有序撤下时**取对那份状态调 `abandon` 交出的那一份（[S-48](#s-48-本能力自己的撤除与换代)：计数的一方还在，不写 `"unknown"`）；**装配状态随活体丢了**（停机后恢复追补，含撤下时写不下去、由下一任追补的）写 `"unknown"`，**不写 0**（[`data.call-accounts/v1#S-11`](../../../data/call-accounts/v1/contract.md#s-11-toolcallaccount一次工具执行的账)） |
| `wallClock.startedAt` | **执行记录落下的时刻**（提交那一刻）——从那一刻起它就是一次执行，排队也算在内 |
| `wallClock.endedAt` | **收场那一刻**；恢复时追补的（停机）**缺席**——结束那一刻没被观察到，**不补成扫描时刻**（[S-14](../../../data/call-accounts/v1/contract.md#s-14-wallclock)） |

- **归属**：账挂在执行记录上，经 `(run, attempt)` 归到提交它的那次运行的那次尝试（[`S-25`](../../../data/call-accounts/v1/contract.md#s-25-按尝试记明细按-run-汇总)）。
  **运行已经终结之后才结束的后台执行，照样落账并归该运行，标 `late`**（主线裁定，见 [D-040 §S2 S2-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s2call-accounts报回的)：PF-012 I-11 的收窄；[`data.call-accounts/v1#S-39`](../../../data/call-accounts/v1/contract.md#s-39-晚到的账)）。
- **不受尝试栅栏约束**：执行的结果与账不属于哪一次尝试的推进，旧尝试发起的执行照样落。
- **收场之后才到的费用**（停止与交回交错、晚到的报账）**不改那份账**：原账不改；它们作为一条记录条目留下（[S-22](#s-22-关键转换留记录)），
  进有效费用走 `CostCorrection{ target: tool_execution }`（主线裁定，见 [D-040 §S13 S13-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)；[`S-17`](../../../data/call-accounts/v1/contract.md#s-17-costcorrection事后补账)）——但那份补账的 `obtainedVia` 只有 `manual` 配得上工具执行，**执行者晚报的一笔没有对应取值**（[G-8](#十二已知缺口)）。
- **账不进给模型看的上下文**（[`S-21`](../../../data/call-accounts/v1/contract.md#s-21-账进日志不进给模型看的上下文)）：它随执行记录的收场条目进会话日志，不进任何消息的块。

### S-14 停止与外部效果分开说

**一次被停下的执行，记录上分开记三件事，不说成一件**（PF-012 [§6.14](../../../../product/PF-012-agent-loop-and-run/design.md#614-停止有两级)）：

| 事实 | 取值 | 什么时候写 |
|---|---|---|
| **逻辑停止** | 就是收场（`interrupted`、`failed` 等） | 收场那一刻，先于任何停止动作（[S-18](#s-18-收场先落停止后发)） |
| **实际停止** | `stopping`（停止已发出，还没观察到停下）· `stopped`（观察到停下）· `unconfirmed`（没法观察到，例如停机后回收） | 停止动作之后，可以晚于收场 |
| **外部效果的确定性** | PF-000 §5.5 三值：**已确定发生** · **已确定未发生** · **不可确定** | 收场时给出；执行者从没跑过（[S-11](#s-11-失败的种类)「没有」那几行、排队中被中断）是「已确定未发生」；**执行者跑过而被停下、停机、或收场之后又有完成到达的，一律「不可确定」**——本能力看不全它在外面做过什么（PF-006 §6.12）；**MCP 桥交回的失败写明请求是否已经发出**（[`capability.mcp-bridge/v1#S-19`](../../mcp-bridge/v1/contract.md#s-19-invoke) ⑥）：未发出 ⇒ 已确定未发生，已发出 ⇒ 不可确定 |

- **「已经停止」不等于「外部效果已经撤销」**；本能力不补偿、不撤销（[S-3](#s-3-本契约明确不承诺什么)）。
- 正常跑完的执行（`completed`、执行者交回的 `failed`）的外部效果确定性，**本能力不判**：执行者没有报它，而本能力看不见（留空，不填默认值）。
- **三件事在执行记录上；账上带它们的投影**（主线裁定，见 [D-040 §S13 S13-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)；[`data.call-accounts/v1#S-11`](../../../data/call-accounts/v1/contract.md#s-11-toolcallaccount一次工具执行的账)）：
  `externalEffect` 取 `unknown` 当且仅当这里是「不可确定」，「已确定发生」「已确定未发生」与本能力不判的正常收场都取 `confirmed`（它说的是「在外面的动作收场时已经了结」）；实际停止的时刻进 `stoppedAt`，只在写账之前已观察到停下时出现（[S-13](#s-13-账)）。

---

## 三、贯穿全部操作的规矩

### S-15 缺席时的默认答案

**缺席一律是拒绝或明确失败；「判不出来」与「判为拒绝」是两个值。**

| 缺席或判不出的是什么 | 默认答案 | 为什么不是别的 |
|---|---|---|
| 身份参数（租户、会话、`CallId`、运行、尝试）缺席或不合形状 | `invalidInput`，**不写入任何东西** | 身份参数没有默认值（[`data.identity-values/v1#S-17`](../../../data/identity-values/v1/contract.md#s-17-身份参数没有默认值)） |
| `submit` 的 `report` 缺席，或它带的会话、运行、尝试任一不是本次的 | `invalidInput`，**整批不执行、不写入任何东西**（[S-23](#s-23-提交一批) ⑥⑧） | 不替那一次尝试现算一份、不取注册表「最近一次」的那份：那会让本能力与放行判断各用一份报告（[D-040 §八 M33](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） |
| 给出的租户不是会话持有的那一个（提交时，还没有记录） | `crossTenant`，**整批不执行** | 不按调用方说的租户写记录：记录与账会归错租户（PF-015 §6.12） |
| 放行凭据缺席，或核对为不符；以 `UnlistedCall` 交来、注册表里却查得到条目（它没经放行） | `notAdmitted`，**整批不执行** | 放行之后参数不许再变；缺凭据等于没放行（[放行判断不在时一律拒](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)的同一方向） |
| 放行核对**判不出来**（核对面不可用） | `admissionUnavailable`，**整批不执行** | 与「核对为不符」分开：一个是没放行，一个是现在查不了 |
| 注册表**读不到**（查这次尝试里这个名字的条目，查询本身失败），或 MCP 动作所属接入点的接入点持有读不到 | `dependencyUnavailable{registry}`，整批不执行 | 读不到不等于可用，也不等于不可用，也不等于「没有」 |
| 注册表答**「没有」**这个名字（这次尝试的 `tool` 表里查不到） | **不是缺席**：那一项即刻收场 `unavailable{no_such_entry}`，同批其他项照常（[S-23](#s-23-提交一批) ④） | 「没有」是注册表给的结论（`capability.asset-registry/v1#S-25` 末段），不是判不出来；按「读不到」整批拒会让一个模型编造的名字牵连同批 |
| 执行记录或会话日志**读写不了** | `dependencyUnavailable{storage}`；已开始的执行照跑，收场写不下去时**上交**（PF-011），**上交之后本任撤下、不再服务**（[S-47](#s-47-依赖的提供者不可用)） | 不把「没写进去」当成「写进去了」 |
| 恢复扫描还没完成 | `runtimeNotReady` | 扫描之前「找不到」不可信（[S-7](#s-7-活体与找得到)） |
| 工具定义里没有 `allowBackground: true` | **不能转后台**：手动切 → `backgroundNotAllowed`；阈值、插队 → 不转（插队时改为中断）；发起即后台 → 收场 `failed{background_start_refused}` | PF-006 §6.6「不声明就是不能后台」 |
| 工具定义没有 `settings.timeout`、`backgroundThreshold`、`concurrency` | **没有这一项限制**：不到点、不自动转后台、不设并发上限 | 定义不声明＝这个工具没有这一项设置（[`data.tool-definition/v1#S-10`](../../../data/tool-definition/v1/contract.md#s-10-设置项声明)）；**本能力不补一个值** |
| 等待没给到点 | **一直等** | PF-006 §6.6：不花钱的等待没有理由到点 |
| 结果落盘前那一关（卸载判定）不可用 | **只记可见**：`content` 照落，声明卸载的 `raw` 位置上只落引用、摘要缺席，并留一条记录条目（[S-42](#s-42-结果落成消息之前的那一关)） | 卸载判定不在时由指定挂件顶上、只记一笔（[PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)）；原始结果由本能力先存下（[D-040 §S13 S13-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)），不因那一关不在而丢 |
| 这次执行的执行者没登记 | 收场 `failed{start_failed}` | 不是不可用：可用性是注册表判的，那时它是可用的 |
| `cancelForRun` 的停止级别缺席 | `invalidInput` | 两级的代价不同，不替调用方选 |

#### 输入不合形状是第三类，收成 `invalidInput`

表示层校验在任何判定之前做，口径取 [`data.identity-values/v1#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开)：
**`invalidInput` 不表示「该执行不存在」或「这次调用没被放行」，也不得被记成一次判定结果。**
答复的值不合那次等待声明的形状，同样是 `invalidInput`（它是按声明做的形状校验，不是一次判定）。

### S-16 首胜收场只写一次

**同一次执行的收场只写一次：写的条件是「这条记录还没有收场」，写下之后不再改。**
正常交回、中断、转后台之后的完成、等待到点、取消运行、会话归档、恢复追补、本能力有序撤下、MCP 桥换代——**任何几路竞争同一次执行，先写成的那一路是收场**，其余的丢弃。

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
| 帧流收尾时交出的 `blocks` **非空** | 另有一条 `ToolInternalMessage`（[S-13](../../../data/messages/v1/contract.md#s-13-toolinternalmessage)），**排在它那一段的结果消息之前**；`ending` 按 [`data.messages/v1#S-14`](../../../data/messages/v1/contract.md#s-14-toolinternalmessage-怎么收的尾) 那张对应表取 | 收尾交出的块；**交出的 `blocks` 为空就没有这条**（一帧没发，或发过的块都没交出内容） |

- **一次调用至多一条工具消息；一段后台执行至多一条收场提醒；收场提醒排在占位之后**（[`data.messages/v1#S-32`](../../../data/messages/v1/contract.md#s-32-会话日志里的配对与唯一) ②④）——本能力在追加时守住，模型性质 `AtMostOneToolMessage`、`AtMostOneReminder`；**「排在占位之后」在模型里按构造成立、不作证据**（`ReminderAfterPlaceholder`，见[第八节](#安全性质绝不能发生)），证据是场景 [S-52](#s-52-自动转后台后完成落一条提醒)。
- **工具执行被中断不另补一条 `interrupted` 提醒**：占位（`outcome: interrupted`、原因写在块上）已经承载它（[`data.messages/v1#S-21`](../../../data/messages/v1/contract.md#s-21-中断之后必补一条) 第二段；[D-040 §S13 S13-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)；原 G-14 闭合）。
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
   账里的 `frames` 写 `"unknown"`（装配状态随活体没了，[S-13](#s-13-账)），执行者已报的那几笔（记录上的 `reportedCost`）照样入账；
   从没起过执行者的（`queued`）外部效果是「已确定未发生」，实际停止不适用，`frames` 是零。
3. **同一次提交里交付追补的消息**：前台的，一条 `ToolMessage`（`failed`、`abnormal_interruption`）；后台的，一条 `background_execution_interrupted` 提醒（[S-19](#s-19-送达)）。
4. **同一次处置里请求关闭**这次执行挂着的决策卡片，状态 `superseded`——产品正文的「已作废」（[PF-008 §6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答) rev 7；产品负责人裁定 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md) U-6；卡片契约未建立，[G-5](#十二已知缺口)）：
   卡片等的那次执行已经没了，人答了也没人收；`superseded` 不是替人作答，是「等它的对象没了」。
5. **不重起任何执行者**——**没有例外**：哪怕能证明它还没来得及做任何事（PF-006 [停机之后它不重来](../../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来)）。要不要再调一次，由 agent 看着「失败」决定。

- **已交付未追加的消息**（发件箱形状下）在扫描之后照常追加，**不重复追加**（按 `(CallId, 段)` 幂等）。
- **扫描之后，在服务中每条未收场的记录都有活体**（[S-7](#s-7-活体与找得到)）；只处置「有协程要恢复的会话」或只处置前台的，后台的那些会永远悬着（模型否定配置 `RecoverAll = FALSE`）。
- **MCP 动作的执行在桥换代或卸载时同样落 `failed{abnormal_interruption}`**，由 `capability.mcp-bridge` 兑现、经本能力写收场（[S-37](#s-37-执行者登记与撤下)）。

### S-21 租户与会话范围

- **每条执行记录带租户身份，是会话持有的那一个**（SYS-TENANT；PF-015 §6.12）。它随每一条记录条目进会话日志（PF-000 §5.5 租户身份无条件必填）。
- **每个操作都带租户与会话**：给出的租户与记录上的不等，**按找不到处理**（`executionNotFound`）——不回「属于别的租户」，那会让调用方据失败值探出别人的执行。
- **提交时还没有记录**：给出的租户与**会话持有的那一个**不等 → 整批 `crossTenant`（[S-23](#s-23-提交一批) ②），什么都不写。提交的调用方是这个会话自己的 loop，不是一个探查面；会话持有的租户从哪里读归会话那一程（[G-12](#十二已知缺口)），读不到 → `dependencyUnavailable{storage}`。
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

**失败值全集**（十四个，每个操作与执行者原语取其子集；原 `notAvailable{reason}` 已删——注册表判为不可用是收场 `unavailable`，不是失败值，[D-040 §S13 S13-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)）：
`invalidInput` · `crossTenant` · `notAdmitted{why}` · `admissionUnavailable` · `backgroundNotAllowed` · `notInBackground` · `notInForeground` · `callIdConflict` ·
`executionNotFound` · `notWaiting` · `alreadyEnded` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{which}`（`which ∈ storage · registry`）。
**`runtimeNotReady`（恢复扫描还没完成）与 `runtimeStopped`（本能力正在撤除或已撤除）分开**：前者稍后重试即可，后者要换到下一任。
**每个操作的⑥都含 `invalidInput`、`runtimeNotReady`、`runtimeStopped`；除只读活体表的 [S-35](#s-35-列出活体) 外都含 `dependencyUnavailable{storage}`**，下面逐条列出、不省略。

### S-23 提交一批

`submit(tenant, session, run, attempt, report, batch)`

| # | 内容 |
|---|---|
| ① | 租户、会话、运行、尝试；**`report`：这一次尝试的可用性报告**（`capability.asset-registry/v1#S-11` 的 `AvailabilityReport`，无词条）——**与 runner 那一次 `dispatch` 的 `admission.report` 是同一份值**（`capability.loop-extension-runner/v1#S-21` ①②），由调用方交来，本能力**不现算、不另取一份**；它带的会话、运行、尝试须恰是本次的 `session`、`run`、`attempt`（⑥）（主线裁定，见 [D-040 §八 M33、M46](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；必带；`batch`：一批项，**按调用块在回复里的次序**，每项是下面三种之一：`AdmittedCall = { call: ToolCallBlock, admission: AdmissionToken, environment: 执行环境引用, definition: ToolDefinitionRef, startInBackground?: 布尔 }`——参数解析成功、经过放行的调用，`call.tool` 与 `definition.name` 是模型面名字；`UnparseableCall = { call }`——**参数收齐却解析不了**的调用（`call` 是 `data.content-blocks/v1#S-12` 里标了 `unparseable` 的那一种），它不经放行，没有凭据、定义与执行环境；`UnlistedCall = { call }`——参数解析成功、而**这次尝试的可用性报告里查不到它的名字**（模型编造的名字、失去生效持有的接入点的动作），所以没进放行判断的调用（`capability.tool-admission/v1#S-7`；那一次经过由 runner 记 `observed{no_such_entry}`，[D-040 §七 M10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)），同样没有凭据、定义与执行环境。`startInBackground` 缺席＝否（它不是身份参数；来源见 [G-11](#十二已知缺口)） |
| ② | **按这个次序判，第一个不成立的就是整批的结果**：1. 本能力在服务（扫描已完成、没在撤除）；2. 给出的租户就是**会话持有的那一个**（[S-21](#s-21-租户与会话范围)）；3. **判重**：批里每一项按 `(会话, CallId)` 查已有记录——已有而调用块不同 → 整批 `callIdConflict`；已有且相同的那几项按幂等返回（⑦），**批里全部已有就到此为止**；4. 以下只对还没有记录的那几项：会话没归档、这个运行没被取消（[S-28](#s-28-取消一次运行)）；5. 每一个 `AdmittedCall` 的凭据都核对为相符：`verifyToken(admission, call, session)`——**凭据本身不含会话，核对按（会话，`CallId`，生效参数）**，少一样都会留缝（`CallId` 只在一份会话日志内唯一）；`UnparseableCall`、`UnlistedCall` 不核对。**各项的核对结果不同时，整批取 ⑥ 里最左的那个失败值**（`invalidInput` > `notAdmitted` > `admissionUnavailable`），`notAdmitted` 的 `why` 取批内次序最前的那个核对为不符的项的 `reason`（[D-040 §七 M29](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）；6. 每一个 `AdmittedCall` 与 `UnlistedCall` 在这次尝试的注册表里都**查得到答复**——以 `call.tool` **原样**查，即模型面名字 `ModelToolName`（[`data.tool-definition/v1#S-6`](../../../data/tool-definition/v1/contract.md#s-6-模型面只有一个条目)；[`capability.asset-registry/v1#S-25`](../../asset-registry/v1/contract.md#s-25-lookup查一条)，`within = run{report}`，即 ① 交来的那一份）：答那一条、答「没有」都算查得到，读不到（`unavailable`）即整批 `dependencyUnavailable{registry}`；答「没有」的那一项在 ④ 即刻收场 `unavailable{no_such_entry}`；**`UnlistedCall` 却查得到条目 → 整批 `notAdmitted`**（它没经放行判断，这个名字却有一条可执行的条目——与缺凭据同一种，本能力不执行没放行的调用）。查到条目的 `AdmittedCall`，本能力把 `call.tool` 逆转写一次得到**定义名**（每个 `__` 换回 `:`；[S-18](../../../data/tool-definition/v1/contract.md#s-18-名字的表示与相等) 的名字限制使它唯一），记进执行记录，找执行者用它（[S-37](#s-37-执行者登记与撤下)）；执行记录里的调用块原样保留模型面名字；**MCP 动作还要读得到它所属接入点的接入点持有**——① 交来的 `report` 里钉住的那一份（`endpointHoldings`，[`capability.asset-registry/v1#S-11`](../../asset-registry/v1/contract.md#s-11-一次执行尝试的可用性报告)），原样记进执行记录（[S-6](#s-6-执行记录)）——**本能力不自己解析或另找一份持有**：报告对那个接入点写明「没有」生效的持有，按读不到处理（⑧），不拿装配那一次或上一次尝试的那份补上 |
| ③ | 无 |
| ④ | **整批一次提交**（只对还没有记录的那几项）：每一项一条执行记录（`queued`，姿态前台或后台）＋ 下面几种**即刻收场**的项的收场、账、消息交付 ＋ 发起即后台的项的占位交付 ＋ 各自的提交条目。**这次提交之前，任何一项的执行者都没起**（[S-17](#s-17-持久意图先于外部效果)）。**`UnparseableCall` 一律即刻收场 `failed{unparseable}`**，块上写明参数解析不了（[S-11](#s-11-失败的种类)、[S-64](#s-64-参数收齐却解析不了)），执行者不起、外部效果「已确定未发生」。**`UnlistedCall`（注册表答了「没有」）一律即刻收场 `unavailable{no_such_entry}`**：块上写明这次尝试里没有这个工具（措辞归实现），执行者不起、外部效果「已确定未发生」；`{no_such_entry}` 是执行记录上的原因，块上不带 `reason`（`data.content-blocks/v1#S-18`：`unavailable` 不带）。其余即刻收场的几种，**对每一个 `AdmittedCall` 按这个次序判，第一个成立的就是它的收场**：① 注册表对这一项答「没有」→ `unavailable{no_such_entry}`（同上）；或把这一项判为**不可用**——条目是替换件（`stand_in{for}`）、条目 `unavailable{reason}`、或所选的那条命令在 `commandAvailability` 里是 `unavailable{reason}`——→ `unavailable`（替换件给的说明或注册表给的原因，执行者不起）；② 参数判定（按那一份定义的 `input` 或所选命令的 `commands[c].input` 判）：**判不了**——这个实现编不出那份参数 schema、其中某个 `pattern` 超出实现登记的上限，或判定超出实现登记的时限——→ `failed{schema_unsupported}`，块上带说明（[S-11](#s-11-失败的种类)；主线裁定，见 [D-040 §八 N-22](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) T-16）；**判得了而参数不合** → `failed{arguments_invalid}`，块上带用法（[S-11](#s-11-失败的种类)）；判不了先于判不合——判定没走完就以 `schema_unsupported` 收场，不拿已判出的那一部分报 `arguments_invalid`（本契约推导：同一份输入在同一份登记的上限下恒得同一个收场）；**两种都只落这一项，不牵连同批**；③ `startInBackground` 而工具不许后台 → `failed{background_start_refused}`。发起即后台且允许的 → 姿态后台，前台那次调用收场 `backgrounded{backgrounded_at_start}` |
| ⑤ | 每一项一行：`{ callId, disposition }`，`disposition` ∈ `accepted{posture}` · `ended{outcome}`（即刻收场的那几项：`failed`——种类 `unparseable`、`schema_unsupported`、`arguments_invalid` 或 `background_start_refused`——或 `unavailable`，含 `no_such_entry`；它们的消息已交付，调用方不必另补结果）。**没有逐条失败值**。按幂等返回的项给它**首次提交时**的 `disposition`；此后的变化读 [S-33](#s-33-读一次执行) |
| ⑥ | **整批失败**（什么都不写），按 ② 的次序：`invalidInput`（本操作输入的表示层校验，先于一切；**`report` 带的会话、运行、尝试三者任一不是本次的 `session`、`run`、`attempt`** 也收成它——同一运行上一次尝试的报告同样对不上；只比对交来的几个值、不读任何东西，所以同样先于一切，与 runner 核 `admission.report` 是同一条（`capability.loop-extension-runner/v1#S-21` ⑥），[D-040 §八 M33、M46](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)；第 5 步里 `verifyToken` 对某项答 `invalidInput` 也收成它，在那一步里排最左） · `runtimeNotReady` · `runtimeStopped` · `crossTenant` · `callIdConflict` · `alreadyEnded`（会话已归档或运行已取消） · `notAdmitted{why}`（第 5 步；`UnlistedCall` 查得到条目时在第 6 步，`why` 缺席） · `admissionUnavailable` · `dependencyUnavailable{registry}`；任一步读写存储不成 → `dependencyUnavailable{storage}` |
| ⑦ | **幂等边界 = `(租户, 会话, CallId)`，判重先于归档、取消、凭据与注册表**（② 第 3 条）：同一个调用再提交一次（同一个调用块：同一份生效参数，或同一段原文），返回首次的 `disposition`，**不起第二次执行者**——运行被取消、会话归档、凭据此后作废之后重放也一样，因为那一次已经收下了；一批里部分项已登记，登记过的按幂等返回、没登记的照 ② 第 4 步起判，**它们整批失败时已登记的那几项不受影响**。**同一个 `CallId` 带不同的调用块** → 整批 `callIdConflict`（登记方的唯一性被违反，[`data.content-blocks/v1#S-14`](../../../data/content-blocks/v1/contract.md#s-14-callid)） |
| ⑧ | 凭据核对面不可用（`verifyToken` 给 `unavailable`，[`capability.tool-admission/v1#S-25`](../../tool-admission/v1/contract.md#s-25-verifytoken) ⑧）→ `admissionUnavailable`，**不执行任何一项**（放行判断不在时一律拒）；`verifyToken` 给 `invalid{reason}` → `notAdmitted{why}`，`why` 原样取那个 `reason`；`verifyToken` 给 `invalidInput`（某项的凭据、调用块或会话不合形状）→ 整批 `invalidInput`；`AdmittedCall` 缺凭据 → `notAdmitted`；注册表或接入点持有读不到 → `dependencyUnavailable{registry}`；注册表答「没有」→ 那一项 `unavailable{no_such_entry}`，**不是整批失败**（「没有」是结论，读不到才是缺席）；会话持有的租户读不到 → `dependencyUnavailable{storage}`；身份参数缺席 → `invalidInput`；**`report` 缺席 → `invalidInput`**——本能力不替这次尝试现算一份报告，也不向注册表要「最近一次」的那份（`capability.asset-registry/v1#S-11` 第 3 条：对此后的读，前一份就不再是最近一次），一批里全是 `UnparseableCall` 也一样必带（缺席即拒，不因用不着就放过） |
| ⑨ | 即刻收场的每一项送达后发 `execution.delivered` |

- **整批校验、整批拒**：一条凭据不符就整批不执行（[PF-012 一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个)），**不执行已核对的那几条**——那一批是一起判的，也一起执行。
  整批被拒时这些调用在日志里还没有结果，**由调用方处置**（它们没进本能力，本能力不替它们落消息）；落什么收场、由谁写，是 [G-16](#十二已知缺口)。
- **放行之后参数不许再变**：执行记录里的调用块就是核对过的那一份；本能力之后任何一步都不改它。
- **注册表判为不可用的，一律收场 `unavailable`**（主线裁定，见 [D-040 §S13 S13-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)）：
  替换件（注册表放在原位上、同形的那一件，[`capability.asset-registry/v1#S-10`](../../asset-registry/v1/contract.md#s-10-替换件同形只换说明)）、条目 `unavailable{reason}`、关掉的命令（[S-9](../../asset-registry/v1/contract.md#s-9-按命令的可用性)）三支同归此，
  块上写替换件给的说明或注册表给的原因。**`unavailable` 告诉 agent「绕路、别重试」，`failed` 会让它重试**（PF-006 §6.3、[flows §二](../../../../product/PF-006-tools-and-skills/flows.md#二异常分支)：依赖的外部服务连不上、执行环境给不了、MCP 接入点连不上都是「换替换件」）。
  **哪些情形不可用，由注册表判**（一次尝试内不变，[S-11](../../asset-registry/v1/contract.md#s-11-一次执行尝试的可用性报告)）；本契约不另判。
  **注册表答「没有」也落这里**：`unavailable{no_such_entry}`（[D-040 §七 M8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）——这次尝试里没有这个名字，agent 该绕路；它与「读不到」（整批 `dependencyUnavailable{registry}`）是两个值。
  **执行时才发现落点到不了位不在此列**：那是这一次执行的 `failed{environment_unavailable}`（[S-38](#s-38-起执行者)），注册表在尝试开始时判的是另一件事。
- **参数不合是这一次调用的收场，不是操作的失败值**：批照样成立，那一项 `ended{failed}`、消息已交付，调用方不必另补结果；它也**不是 `invalidInput`**——`invalidInput` 说的是本操作的输入不合形状，
  参数合不合 `input` 是对这一次调用的判定（`data.identity-values/v1#S-33`：表示层校验与判定分开）。
  它也**不是**「参数说完了却解析不了」：那种调用走 `UnparseableCall`，收场 `failed{unparseable}`（[S-64](#s-64-参数收齐却解析不了)）；到 ② 这一步的都是解析成功的 JSON 值（`data.content-blocks/v1#S-12`），**不是对象的**同样按参数不合判。
  **在提交时判**：参数在放行时已定、此后不变，定义随调用带来，判定不依赖轮没轮到它；拖到起执行者时才判，一次注定失败的调用要白排在前一项与并发上限后面。
  **次序 ① 先于 ②**：条目此刻用不了，告诉 agent「绕路」比告诉它「改参数」有用；**② 先于 ③**：参数不合是 agent 改得了的错。这两个次序是主线裁定，见 [D-040 §六 N-8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)。
- **参数解析不了的调用为什么在这里收场**：它收齐了、登记了，不能被当作没发生，也不能被猜一个参数去执行（[PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#参数说完了却解析不了的调用不执行以失败回给-agent)）。标记它的是到达装配（`capability.stream-assembly/v1#S-11`）；**不执行、以一条 `failed` 的结果回给模型的是本能力**——它是唯一写工具消息的一方（[S-19](#s-19-送达)），这一次也不例外。它不经放行（没有参数可判），**不进 `admit`**（`capability.tool-admission/v1#S-7`），在这里也不查注册表：它不会被执行。
- **查不到条目的调用为什么也在这里收场**（[D-040 §七 M10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：它登记了、要有一条结果，而本能力是唯一写工具消息的一方；它不在这次尝试的 `tool` 表里，放行判断无从判它的执行权限，所以不进 `admit`，以 `UnlistedCall` 交来。
  **本能力照样查一次注册表**：交来的一方说「查不到」不算数——「没有」才落 `unavailable{no_such_entry}`；查得到就是一次没经放行、却有可执行条目的调用，按缺凭据整批 `notAdmitted`（本契约的推导：宁拒不执行）。
- **判重为什么在最前（租户核对之后）**：重放同一批的调用方要的是「那一次收下了什么」，不是「现在还收不收」——运行取消之后重放，按「已取消」拒会让调用方以为那一批从没进来过，再去补一条结果，**同一次调用就有了两条结果**。租户核对在判重之前，是为了不让别的租户的调用方据幂等返回读到这个会话里有什么。

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
- `terminated_by_agent` 是 `data.content-blocks` v1 候选补上的取值（[S-10](#s-10-占位原因)；原 G-2 闭合）：`initiator = agent` 的中断**只落在后台那段执行收场的提醒里**（`background_execution_finished{outcome: interrupted}` 的结果块），**不落占位**——那次调用的占位早在转后台时写下（以 [PF-006 §6.7](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因) 为准；主线裁定，见 [D-040 §七 M23](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。

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
- `run_cancelled` 是 `data.content-blocks` v1 候选补上的取值（[S-10](#s-10-占位原因)；原 G-2 闭合）。

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
| ① | 租户、会话、`CallId`、`waitIndex`（答的是第几次等待）、`answer = { value, by }`：`value` 须合那次等待声明的形状；`by` 是答复者——**人**（经卡片）或**另一个 agent**（经 `Agents()` 回应），同一入口（[PF-006 等待态](../../../../product/PF-006-tools-and-skills/design.md#等待态)「谁来应答不是这个概念的一部分」；形状见 [G-10](#十二已知缺口)） |
| ② | 记录存在；**这次执行此刻在等待，且正是第 `waitIndex` 次** |
| ③ | 无 |
| ④ | **单次提交**：解除这次等待（阶段回 `running`）＋ 条目；答复交给执行者。**与到点（`no_answer`）、中断等竞争同一行，首胜** |
| ⑤ | `{ resumed: waitIndex }` |
| ⑥ | `invalidInput`（身份缺席；`value` 不合声明的形状——**判得出「不合」才是它**；校验判不了不在此，见表下） · `executionNotFound` · `notWaiting`（没在等，或 `waitIndex` 不是当前这一次） · `alreadyEnded` · `runtimeNotReady` · `runtimeStopped` · `dependencyUnavailable{storage}` |
| ⑦ | **同一次等待只解除一次**：第二个答给同一次的答复 → `notWaiting`。**一次执行可以等多次**，每次用自己的 `waitIndex` |
| ⑧ | `waitIndex` 缺席 → `invalidInput`：**不替它猜「答的是当前这一次」**——迟到的、答给上一次的答复会因此解除这一次（模型否定配置 `CheckWaitIndex = FALSE`） |
| ⑨ | 不发 |

- **形状校验判不了不是答复不合**：声明的形状编不出、超出 `data.tool-definition/v1` G-16 登记的上限或校验超时，都是「判不出」而不是「判为拒绝」（[S-15](#s-15-缺席时的默认答案)「判不出来与判为拒绝是两个值」）——这一次答复照 ④ 受理、等待解除，**这一次执行随即以 `failed{schema_unsupported}` 收场**（说明写明「答复形状校验超时」或「编不出」），与参数判定 T-16 同口径；不以 `invalidInput` 回给答复者、不让人反复重答（[D-040 §八 M75](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)，覆盖 N-25 的后半）。
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
  否则一次插队之后，同一批里排在后面的调用会接着在前台起来，agent 还得等它（本契约的推导，主线采纳，见 [D-040 §S13 S13-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)）。
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
| ⑦ | **不幂等**：每次一份新引用；落盘前那一关对一次执行至多调一次 |
| ⑧ | 媒体类型缺席 → `invalidInput`：不猜（`data.tool-definition/v1#S-23`「内联形式必带媒体类型」同一理由） |
| ⑨ | 不发 |

- **声明了卸载的原始结果，本能力总是自己存下**（主线裁定，见 [D-040 §S13 S13-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)）：交回检查通过、结果进落盘前那一关**之前**，`offload.raw` 是内联的，本能力照本条的语义把它存下、换成引用；是引用的照收（[S-42](#s-42-结果落成消息之前的那一关)）。
  **存不存不看卸载判定在不在**——PF-006 §6.10「原始结果存着，没丢」是本能力的义务。**存不下**（存储读写不了）按 [S-15](#s-15-缺席时的默认答案)「执行记录或会话日志读写不了」同一处置：收场照写，落盘写不下去时**上交**（PF-011），不把没存下的当成存下了（本契约的推导）。
- **这个操作面留给另一条来路**：系统兜底截断（单条超限、首尾保留，PF-012 §5.10）时，站在 `after_action` 的那一件调它存下原文。
- **卸载判定不在本能力**：给模型看什么——占位里写什么、摘要怎么放——归站在 `after_action` 的卸载判定；本能力只把字节存下、交回地址。
- **存在哪个存储、留多久**，全系统尚未定义（[G-7](#十二已知缺口)）；拿到引用不等于有权读它。

---

## 五、执行者一侧

### S-37 执行者登记与撤下

**执行者**（无词条）是一份工具定义的实现在本能力这里的登记：本地工具的实现、MCP 动作的桥、技能脚本的执行都是执行者。

- **按定义名找执行者**：起执行者时按提交时逆转写得到的定义名找这次该用的那一个（[S-23](#s-23-提交一批) ②、[S-38](#s-38-起执行者)）；找不到 → `failed{start_failed}`。
- **本地工具：撤下一个执行者不影响在途执行**（主线裁定，见 [D-040 §六 N-8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）——已经起了的照常跑完；撤下只影响之后的起执行者。
- **MCP 动作例外**：桥被替换或卸载时，经它挂起的调用**各自落 `failed{abnormal_interruption}`**，**不迁移、不重发**（D-037；主线裁定，见 [D-040 §S19 S19-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s19mcp-endpoint--mcp-bridge报回的)）。
  桥那一侧的承诺是 [`capability.mcp-bridge/v1#S-27`](../../mcp-bridge/v1/contract.md#s-27-桥被替换或卸载)：先给每一次在途 `invoke` 交出 `bridgeWithdrawn`，再收口连接；本能力收到 `bridgeWithdrawn` 照首胜写收场（[S-11](#s-11-失败的种类)、[S-16](#s-16-首胜收场只写一次)）。
  理由在那边写明：MCP 条目能交回应答的那一端在桥名下的连接里，桥不在了这一次就没有了交回应答的一方。
- **替换件不是执行者**：调用替换件不进任何执行者，本能力直接收场 `unavailable`（[S-23](#s-23-提交一批) ④）。

### S-38 起执行者

**一次执行从 `queued` 到 `running`，按这个次序判，第一个不成立的就是收场：**

1. 轮到它（[S-43](#s-43-一批依次与同一工具的并发上限)：同一批前面的调用都已落定前台那一次收场；同一工具有空位）；
2. 执行环境到位（落点求值归 PF-005，[G-4](#十二已知缺口)）——到不了位 → `failed{environment_unavailable}`，**不降级**；
3. 找得到执行者并起得来——按定义名找；**MCP 动作的执行者是桥**，本能力以执行记录上的接入点持有、条目的 `origin.remoteName` 与生效参数调它的 `invoke`（[`capability.mcp-bridge/v1#S-19`](../../mcp-bridge/v1/contract.md#s-19-invoke) ①），连同中断请求与发帧原语；找不到或起不来 → `failed{start_failed}`；
4. 起来了 → `running`，记起的时刻（[S-22](#s-22-关键转换留记录)），**同时为它开一份帧流的装配状态**（`start`，目标 `{ kind: tool_execution, callId }`，[S-62](#s-62-工具侧到达装配前提的承诺) 第 1 条）。

- **参数不在这里判**：到这里的调用参数都已在提交时判过（[S-23](#s-23-提交一批) ④ 第 ② 条；不合的已收场 `failed{arguments_invalid}`、判不了的已收场 `failed{schema_unsupported}`、解析不了的已收场 `failed{unparseable}`，都不排队）。
- 第 2～3 步收场的执行**执行者从没跑过**，外部效果「已确定未发生」。
- **起不来不是被中断**：DSH 把 spawn 失败记成 killed，agent 会以为有人叫停了它（[verification](../verification.md#两源已知失败情形)）。
- **执行环境每次执行现算**：换了执行环境权限，下一次执行按新值落（PF-006 §6.8）；本能力不缓存上一次的落点。

### S-39 发帧

**执行者在执行中途可以发帧**（[发帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission)）；帧是这次执行那条 `ToolInternalMessage` 的到达增量（[执行帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)），走与模型回复同一套到达语法（D-035）。

- **信封由本能力给**：`ArrivalEnvelope.target = { kind: tool_execution, callId }`，执行者只给事件；帧的形状归 `data.arrival-events`，[到达装配](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)归 `capability.stream-assembly`。
- **装配状态由本能力持有**（D-038 Q18；[在途状态](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)）：不进日志、不是消息；读面在 [S-33](#s-33-读一次执行)；宿主要兑现的前提逐条见 [S-62](#s-62-工具侧到达装配前提的承诺)。
- **发帧不阻塞、不让这次执行失败**：帧追加不上、被砍、被丢，都不改变这次执行怎么跑、怎么收场（PF-006 §4「它不承诺任何事」）；本能力不按工具定义去决定解析不解析帧。
- **帧流在收场时收尾**，按 [`data.messages/v1#S-14`](../../../data/messages/v1/contract.md#s-14-toolinternalmessage-怎么收的尾) 那张对应表（本契约不另写一份）：执行交回（`completed`，或执行者自己交回的 `failed`）→ 本能力交 `finish{ reason: end }`；**有意停下，即收场为 `interrupted` 的全部**（[S-10](#s-10-占位原因) 里 `interrupted` 那几行：用户叫停、agent 经 `BkgJobs()` 掐掉、插队、人拒绝回复、会话归档、运行取消、前台上限到点）→ `finish{ reason: interrupted }`；
  **执行者没有回答**（等待到点，`no_answer`）、**执行者换了代**（MCP 桥换代或卸载）、**本能力有序撤下**（撤除、替换，[S-48](#s-48-本能力自己的撤除与换代)；[D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）→ 调 `abandon`、不带缘由（[`capability.stream-assembly/v1#S-22`](../../stream-assembly/v1/contract.md#s-22-abandon放弃)：等于接受 `finish{ reason: lost }` 再结算）；**停机** → 装配状态随活体一起没了，恢复时**不补**帧流，那条消息写不出来。执行者从没起过的（即刻收场、排队中收场、起不来）没有装配状态，也就没有帧流。
- **`ToolInternalMessage` 成立的判据只有一条：收尾交出的 `blocks` 非空**（[`data.messages/v1#S-13`](../../../data/messages/v1/contract.md#s-13-toolinternalmessage)）；非空就与结果消息一起送达、排在它前面（[S-19](#s-19-送达)），`ending` 按上面那张表；空的（一帧没发，或发过的块都没交出内容）就没有这条消息。`frames` 进账（[S-13](#s-13-账)）。
- **帧里的媒体块只许引用**（到达语法那一侧的规则）：执行者要给图，先把字节存进存储再给引用。

**发帧这个原语，九件事**（执行者调用，只作用于它自己那一次执行）：

| # | 内容 |
|---|---|
| ① | 一个到达事件（不带信封） |
| ② | 无前置：任何时刻都可以调，**调了不会让这次执行失败** |
| ③ | **有**：`trim`、`finish`、`account` 不是帧（`data.arrival-events/v1#S-23`：工具只交 `open`、`fill`、`close`）——**不交给装配**，交回 `dropped{ notAFrame }` |
| ④ | 无持久提交：它改的是装配状态（`accept`），装配状态不进日志 |
| ⑤ | 恰交回一个：`accepted`（进了装配状态）；或 `dropped{ why }`，`why ∈ rejected{ value }`（`accept` 拒收，`value` 是那个拒绝值原名，[`capability.stream-assembly/v1#S-23`](../../stream-assembly/v1/contract.md#s-23-本能力自己的失败值)、[`#S-24`](../../stream-assembly/v1/contract.md#s-24-表示层拒绝值原名引用)；事件缺席时 `value` 是 `malformed`，见 ⑧）· `notAFrame` · `executionEnded`（这次执行已收场、帧流已收尾）。**`accept` 拒掉的每一帧本能力都以 `rejected` 的 `trim` 说出来**（[S-62](#s-62-工具侧到达装配前提的承诺) 第 4 条），执行者不必另报；事件缺席不是一帧，不补 |
| ⑥ | **没有失败值**：`dropped` 是交代，不是失败；原语从不抛出、不阻塞 |
| ⑦ | **不幂等**：同一帧发两次，追加片段会被接两次（`capability.stream-assembly/v1#S-19` ⑤）；去重不归这个原语 |
| ⑧ | **事件缺席** → `dropped{ rejected{ malformed } }`：没有东西可交给装配，**不补 `trim`**（没交出任何一帧，`emitted` 不计）。**事件在、却不合形状的**（认不出种类、成员不合、嵌着的块或账不合）**一律交给 `accept`**，按它给的拒绝值**原名**交回 `dropped{ rejected{ value } }`，并照 [S-62](#s-62-工具侧到达装配前提的承诺) 第 4 条紧接着补那一个 `rejected` 的 `trim`；**本能力自己只在事件缺席时给 `malformed`**，不把形状问题收成它——`accept` 判出的 `malformed` 同样照原名交回、照样补 `trim`（[D-040 §七 M29](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。认得出是 `trim`、`finish`、`account` 的走 ③ |
| ⑨ | 不发契约事件；推给观察者的是出站那一侧，只推被接受的帧（[S-62](#s-62-工具侧到达装配前提的承诺) 第 9 条） |

### S-62 工具侧到达装配前提的承诺

**本能力是工具一侧的到达装配宿主**：[`capability.stream-assembly/v1#S-28`](../../stream-assembly/v1/contract.md#s-28-宿主要兑现的前提) 要宿主兑现的前提，本能力逐条承诺如下（编号与那边相同；第 5 条已不是宿主前提，第 8 条只对模型一侧）：

1. **路由**：一次执行至多一份装配状态，目标 `{ kind: tool_execution, callId }`，在起执行者那一下开（[S-38](#s-38-起执行者)）；执行者的帧按它自己那次执行交给那一份。**路由键是（会话，目标）**：本能力同时承载多个会话，`CallId` 只在一份会话日志内唯一、目标不带会话（`data.arrival-events/v1#S-5`），只按目标路由会让两个会话里相同的 `CallId` 撞到一份状态上（[D-040 §七 M16](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。**收场之后不再开新状态**：此后到达的帧交回 `dropped{ executionEnded }`、不交给任何状态，并留一条记录条目（[S-22](#s-22-关键转换留记录)）。
2. **串行**：同一份装配状态按执行者交出帧的次序逐个 `accept`，每次用上一次交出的新状态——执行者并发地调发帧，也在本能力的帧入口排成一个次序，**一份状态不分叉**。
3. **谁发什么**：执行者经发帧只交 `open`、`fill`、`close`（别的交回 `dropped{ notAFrame }`）；`trim` 与 `finish` 由本能力发，帧流上没有 `account`（`data.arrival-events/v1#S-23`）。
4. **砍了要说**：本能力的帧入口若合并、截短或限额，每一次都以 `trim` 交给同一份状态，截短的那个 `trim` 紧挨在被截短的那一帧之前交；**`accept` 拒掉的每一帧，本能力紧接着（交下一个事件之前）以一个 `reason: rejected` 的 `trim` 说出来，只说一次**；本能力自己发的 `trim`、`finish` 被拒不补 `rejected`（那是本能力的缺陷，留一条记录条目）；收场之后到达的帧不进状态、在记录条目里看得见（第 1 条）。帧入口节不节流、阈值多少是部署政策，本契约不定。
6. **结束一条流**：收场时按 [S-39](#s-39-发帧) 那几种收尾：交 `finish`，或调 `abandon`。**本能力有序撤下（撤除、替换）之前，对每一份还开着的装配状态调 `abandon`**，帧流以 `lost` 收尾，交出的块与 `frames` 随那次执行的收场一起落下（[S-48](#s-48-本能力自己的撤除与换代)；[D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）——**不把撤下当作停机、放着在途的流不收**。**不让一份装配状态永远不收尾**；只有停机（进程没了）时状态随活体没了，不经本能力。
7. **包消息与记账**：收尾交出的 `blocks` 非空 ⇒ 一条 `ToolInternalMessage`，`ending` 按 [`data.messages/v1#S-14`](../../../data/messages/v1/contract.md#s-14-toolinternalmessage-怎么收的尾)；为空 ⇒ 没有这条消息；交出的 `frames` 进这次执行的账，**恰一次**（与收场同一次提交，[S-19](#s-19-送达)）。
9. **快照与增量衔接**：读面给的在途帧是那一刻的快照（带位置，[S-33](#s-33-读一次执行)）；推给观察者的增量只有被接受的帧，与快照数的是同一串被接受的事件；**被拒的帧不推给观察者**；**只推给这次执行所在会话的观察者**（[D-040 §七 M16](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。观察者怎样按（租户，会话）订阅，本版没有操作（[G-17](#十二已知缺口)）。
   被拒而无处可说的（收场之后到达的帧、本能力自己发的 `trim`、`finish` 被拒）照旧**留一条记录条目**（[S-22](#s-22-关键转换留记录)），不改成别的观测形式。

- **做不到会怎样**写在那边（`capability.stream-assembly/v1#S-29`）：状态分叉，一支的帧静默丢失；被拒的帧不说，`frames.emitted` 少算、「砍了要说」落空；执行者自己发的 `trim` 被当成本能力发的收下，`emitted` 的算式失效。
- 证据：规范场景 [S-66](#s-66-帧被拒报一次收场之后的帧不进)、[S-68](#s-68-有序撤下收尾在途的帧流上交之后撤下)。

### S-40 报账

**执行者可以在执行中途报它花掉的钱**：一笔或多笔 `CostItem`（[`data.call-accounts/v1#S-9`](../../../data/call-accounts/v1/contract.md#s-9-costitem一次工具执行里的一笔)），`source` 为 `tool_reported`。

- **被拒的那一笔不进 `items`，也不以零进**（[`S-20`](../../../data/call-accounts/v1/contract.md#s-20-缺账或被拒收记未知不伪造)）；**本能力把「报了但被拒」记成一条记录条目**，不把它变成一笔 `source: none` 的未知——
  那会在账上凭空多一笔「知道有、不知多少」的钱，而被拒的原因是它不合形状、不是金额未知（替 call-accounts 的 G-5 落地，本契约的推导）。
- **经本系统调模型的那几次**，本能力按 `ModelResponse` 记 `model_call` 镜像（[`S-10`](../../../data/call-accounts/v1/contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)），并汇总 `usage`；那几份 `ModelResponse` 经什么到本能力，本版没有来路（[G-19](#十二已知缺口)）。
- **收场之后才报的**：不改那份账（[S-13](#s-13-账)），留一条记录条目。

**报账这个原语，九件事**（执行者调用，只作用于它自己那一次执行）：

| # | 内容 |
|---|---|
| ① | 一笔或多笔 `CostItem` |
| ② | 无前置：执行中任何时刻都可以报 |
| ③ | **有**：`source` 不是 `tool_reported`、`service` 是保留值 `model_call` → 这一笔不收（`model_call` 那一笔只由本能力按 `ModelResponse` 记，[`data.call-accounts/v1#S-10`](../../../data/call-accounts/v1/contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)） |
| ④ | **单次提交**：校验通过的那几笔追加到执行记录的 `reportedCost` ＋ 一条记录条目（被拒的那几笔只进条目）；收场那一次提交把 `reportedCost` 并进账（[S-13](#s-13-账)）。**停机也不丢**：恢复追补的账照样带它们（[S-20](#s-20-恢复扫描与停机不重来)） |
| ⑤ | 逐笔一行：`recorded` · `rejected{ value }`（`data.call-accounts` 的表示层拒绝值原名，或 `notToolReported`——③ 那两种）· `executionEnded`（这次执行已经收场：不改那份账，只进条目） |
| ⑥ | `invalidInput`（一笔也没有，见 ⑧；[D-040 §七 M29](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)） · `runtimeStopped` · `dependencyUnavailable{storage}`（写不下去：**这几笔没有记下**，执行者可以再报一次；本能力不在内存里假装记下）。集合闭合：单笔不合形状不是失败值，是 ⑤ 的 `rejected{ value }` |
| ⑦ | **不幂等**：同一笔报两次就是两笔；去重归执行者 |
| ⑧ | 一笔也没有 → `invalidInput`（整次，什么都不记） |
| ⑨ | 不发 |

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

**交回这个原语，九件事**（执行者调用，只作用于它自己那一次执行；抛出也走这里）：

| # | 内容 |
|---|---|
| ① | 一个 `ToolReturn`，或一次抛出（带执行者的说明） |
| ② | 无前置：执行者任何时刻都可以交回 |
| ③ | 无 |
| ④ | 交回检查（上表）→ **首胜写收场**（[S-16](#s-16-首胜收场只写一次)）→ 落盘前那一关（[S-42](#s-42-结果落成消息之前的那一关)）→ 与账、消息同一次提交送达（[S-19](#s-19-送达)） |
| ⑤ | 恰交回一个：`settled{ outcome }`——这次交回成了这次执行的收场；`discarded`——收场已由别的一路写下（中断、到点、归档……），这次交回丢弃，外部效果记「不可确定」、留一条记录条目（[S-16](#s-16-首胜收场只写一次)）；`escalated`——收场写不下去，已上交（PF-011），这次执行此刻没有收场；**本任随即撤下、不再服务**，下一任恢复扫描按停机处置（[S-47](#s-47-依赖的提供者不可用)；[D-040 §七 M13](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。**交回的结果随本任一起丢弃**：下一任只见一条未收场的记录，收场是 `failed{abnormal_interruption}`，不是这次交回的那一个 |
| ⑥ | **没有失败值**：执行者交回之后无事可做，写不下去的情形以 `escalated` 交代、由本能力上交，不让执行者重交 |
| ⑦ | 同一次执行只有第一次交回可能成为收场；此后的交回一律 `discarded` |
| ⑧ | 交回的东西缺席（既没有 `ToolReturn` 也没有抛出）→ 按「不合形状」收场 `failed{result_rejected}` |
| ⑨ | 送达后发 `execution.delivered`（[S-45](#s-45-送达通知)） |

### S-42 结果落成消息之前的那一关

**有待落盘结果块的收场，送达之前先经过 `after_action`（`each`）那一关**（PF-012 §5.10；[`data.loop-extension/v1#S-14`](../../../data/loop-extension/v1/contract.md#s-14-按位置的-subject)）；卸载判定站在那里。

- **什么收场有待落盘的结果块**（替 loop-extension 留给本能力的那一句落地）：**`completed`，与执行者交回的 `failed`（`implementation_error`、`result_rejected`）**——
  它们的块来自执行者；**其余收场**（`unavailable`、`backgrounded` 占位、`interrupted`、`no_answer`、执行者没跑过的 `failed`——`unparseable`、`schema_unsupported`、`arguments_invalid`、`environment_unavailable`、`background_start_refused`、`start_failed`——、`abnormal_interruption`）的块由本能力写，**不经改写**：`subject.result` 缺席。
  **`arguments_invalid` 的用法文本同样不经这一关**：它是本能力按定义写的（[S-11](#s-11-失败的种类)），卸载判定不裁它、不截它——让模型自纠的那份用法不能被截掉一半。
- **原始结果在这一关之前已经存下**（[S-36](#s-36-存一份原始结果)；[D-040 §S13 S13-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)）：那一关拿到的 `offload.raw` 已是引用。
  **那一关只决定给模型看什么**：结论改写的是待落盘的结果块，本能力照结论落；系统兜底截断那一路要存原文时，它调 [S-36](#s-36-存一份原始结果)。
- **那一关不可用**（卸载判定这一件不在，由指定挂件顶上：只记一笔，[S-63](#s-63-卸载判定这一件)）：**只记可见**，留一条记录条目。落进消息的是 `content`，**`raw` 的位置上只落它的引用，摘要缺席**（[D-040 §S13 S13-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)）——
  原始结果存着、没丢（PF-006 §6.10 这一次照样成立），只是 agent 看到的是一条不带摘要的引用。**摘要缺席**的意思是：作者写的 `summary` 与运行时给的占位说明这一次都不落，因为把它们排进占位的是那一关（本契约的推导）。
- **经过那一关与收场不在同一刻**：收场先写下（首胜，之后不再有别的收场），那一关之后才送达；**这段时间停机**，恢复时它是一条已收场、未送达的记录——
  按 [S-19](#s-19-送达) 它的消息必须还在（发件箱形状）或已在（同事务形状）；**若那一关的结论还没落，按「那一关不可用」同一形状送达并留条目**（本契约的推导）。
- **谁来驱动这一关**——前台的由等它的那副协程所在的 loop，**后台的、运行已终结的、协程已回收的，由谁**——本版没有答案；**那一关的结论经什么交回本能力**，前台的也没有答案（[G-6](#十二已知缺口)）。

### S-63 卸载判定这一件

**站在 `after_action`（`each`）上决定「给模型看什么」的那一件系统自带拓展件，身份与站位归本契约**（卸载是 PF-006 的维度，[§6.10](../../../../product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)）：

| 项 | 取值 |
|---|---|
| 能力标识 | **`{ category: loop_extension, name: omne-official:offload-judgment }`**（`data.loop-extension/v1#S-7`：结论记录的 `extension` 就是这个 name） |
| 位置 | `after_action`（`each`）（[PF-012 §5.8 系统自带的几件，各站在哪](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪)） |
| 干预力 | `rewrite`：把待落盘的结果块改写成带摘要的占位；**不否决、不改收场** |
| 不可用时 | 由指定挂件顶上：**只记一笔**——那一次按「那一关不可用」落（[S-42](#s-42-结果落成消息之前的那一关)）；不跳过、不假装判过（[PF-012 §5.8 不可用时各有定法](../../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件不可用时各有定法)、[拓展件不可用处置](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy)） |

- **它只决定给模型看什么**：原始结果在它之前已由本能力存下（[S-36](#s-36-存一份原始结果)）；它拿到的 `offload.raw` 已是引用。
- **判据归实现**：多大算大、摘要怎么写、兜底截断留多少，本契约不定；本契约只要求它的改写**不改收场、不碰本能力写的块**（[S-42](#s-42-结果落成消息之前的那一关)：`subject.result` 缺席的那几种它拿不到）。
- **这个名字只属于装配钉死的那一件**：同名即同标识，另一份实现以这个名字出现就是替换；系统自带件能不能被替换，照 PF-012 §5.8 那一节（本件不在「不能被替换」的那一件之列——那是放行判断）。

---

## 六、次序、并发与时限

### S-43 一批依次与同一工具的并发上限

- **一批依次**（主线裁定，见 [D-040 §六 N-8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）：同一批里后一项的执行者，**要等前一项前台那一次调用落定之后才起**——落定包括它转了后台。
  所以一项转后台之后，下一项接着起；一项被用户单独中断之后，下一项也接着起（中断的是那一次执行，不是这一步；要停这一步，走 [S-28](#s-28-取消一次运行) 或 [S-31](#s-31-插队处置)）。**本版不做批内并发。**
- **同一工具的并发上限**（`settings.concurrency`；产品正文 [PF-006 §6.6「前台上限与并发上限」](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限)）：**同一个会话里**、同一个工具名下 `running` 与 `waiting` 的执行（不论姿态，前台后台一起算）不超过这个数；超出的排队，**按提交的先后**起，不拒绝。
  没有这项设置就不设上限（[S-15](#s-15-缺席时的默认答案)）。
- **并发位置在收场那一刻释放**，不等实际停下（[S-18](#s-18-收场先落停止后发)）。

### S-44 前台上限与转后台阈值

两项都是偏好类设置（`data.tool-definition/v1#S-12`、`#S-13`），**都只数这次执行在前台 `running` 的时间**，**等待期间不走、转了后台不再数**（[S-12](#s-12-等待)；[PF-006 §6.6「前台上限与并发上限」](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限)：停在等待态上的时间不算，否则它成了替人签字的到点）。

| 设置 | 到点时 |
|---|---|
| `settings.backgroundThreshold` | 前台那一次调用还没落定 → 转后台 `backgrounded_auto`（阈值只在 `allowBackground: true` 时存在，`data.tool-definition/v1#S-12`） |
| `settings.timeout`（产品正文的**前台上限**，PF-006 §6.6） | 允许转后台 → 转后台 `backgrounded_auto`；**不允许 → 中断 `foreground_timeout`**（产品正文的「前台超时」，[S-10](#s-10-占位原因)）；超时被中断不是失败（PF-006 §6.6） |

- **转后台之后两项都不再计**：后台的执行没有「让 run 等太久」的问题；它自己的上限只有等待的到点。
- **`PT0S`**：到点即刻发生——`backgroundThreshold: PT0S` 等于一开跑就转后台，`timeout: PT0S` 等于一开跑就到点。本契约不禁止，也不另作解释。
- 两者同时到点，**阈值那一路先**（两者结果相同时不产生两次转移；不同时，能保留的就保留）。

---

## 七、事件

### S-45 送达通知

**`execution.delivered { tenant, session, callId, segment ∈ call · background, outcome }`**（事件名本契约取）——一段消息追加进会话日志之后发。

- **它是通知，不是控制**：没有监听者也不影响任何事；监听者抛错不回滚那次送达。
- **不承诺到达**、**不承诺次序**、**不承诺恰一次**：权威是会话日志里那条消息；谁要知道「后台执行 X 结束了没」，读日志（`data.messages/v1#S-19` 末段）。
- **没有任何后果依赖它**：空闲会话里一条后台收场提醒要不要开一次新运行，由 loop 按日志判断，不由这条通知触发。
- **本版不开控制类事件**：没有「将要中断」「将要转后台」这类可否决的事件；要介入执行，走拓展点。
- **只在本进程内发，不跨进程广播**；进程内的监听者按载荷的 `tenant`、`session` 自己筛（[S-46](#s-46-装配给的保证-vs-协议须给的保证) 末行，[D-040 §八 M42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。

---

## 八、性质与前提

### 不变量

| 性质 | 条款 | 谁保护 | 前提 | 模型里 |
|---|---|---|---|---|
| 一次执行的收场写下后不变；前台那一次调用的收场写下后不变 | [S-16](#s-16-首胜收场只写一次)、[S-9](#s-9-两个收场) | 同一行条件写 | 存储兑现条件写（[S-46](#s-46-装配给的保证-vs-协议须给的保证)） | `OutcomeStable`、`CallOutcomeStable` |
| 前台到后台单向 | [S-8](#s-8-姿态与阶段两个维度) | 转移守卫 | —— | `PostureOneWay`（按构造） |
| 收场只在六种里；后台段只在四种里；`unavailable` 只出自注册表判为不可用的项；执行的收场不是 `backgrounded` | [S-9](#s-9-两个收场) | 转移表 | —— | `BackgroundSegmentOutcome`、`UnavailableOnlyFromStandIn`、`NoExecutionBackgrounded`（按构造） |
| 一次执行恰一份账，只在收场时落 | [S-13](#s-13-账) | 收场那一次提交 | —— | `OneAccountPerEnded` |
| 等待只在前台 | [S-8](#s-8-姿态与阶段两个维度) | 等待原语、转后台的前置 | 本版限定 | `WaitOnlyForeground`（按构造） |
| 在服务中每条未收场的记录都有活体 | [S-7](#s-7-活体与找得到)、[S-20](#s-20-恢复扫描与停机不重来)、[S-47](#s-47-依赖的提供者不可用) | 恢复扫描先于服务；上交之后本任撤下 | 停机时活体随进程一起没（执行者资源在扫描时回收） | `ServingConsistent`（上交与撤下不在模型里，证据是场景 [S-68](#s-68-有序撤下收尾在途的帧流上交之后撤下)） |

### 安全性质（绝不能发生）

| 性质 | 条款 | 模型里 |
|---|---|---|
| 同一次执行起两次执行者；停机后重来 | [S-17](#s-17-持久意图先于外部效果)、[S-20](#s-20-恢复扫描与停机不重来) | `AtMostOneStart` |
| 一次调用两条工具消息；一段后台执行两条收场提醒 | [S-19](#s-19-送达) | `AtMostOneToolMessage`、`AtMostOneReminder` |
| 收场提醒早于占位 | [S-19](#s-19-送达) | `ReminderAfterPlaceholder`（**按构造，不作证据**：`Drain` 一步追加全部待追加消息，模型表达不了两条消息的先后）；证据是场景 [S-52](#s-52-自动转后台后完成落一条提醒) |
| 执行记录收场了而那段消息既不在日志里、也没有耐久地等着追加；转了后台而占位同样丢了 | [S-19](#s-19-送达) | `EndedIsLanded`、`BackgroundHasPlaceholder` |
| 被中断的执行落成别的收场 | [S-18](#s-18-收场先落停止后发) | `InterruptHonored` |
| 答给上一次等待的答复解除了这一次 | [S-30](#s-30-答复等待) | `NoStaleAnswer` |
| 取消一次运行停了后台的执行 | [S-28](#s-28-取消一次运行) | `RunCancelSparesBackground`（按构造） |
| 会话归档之后还有未收场的执行；归档之后还有新的送达 | [S-29](#s-29-会话归档) | `ArchiveSettlesAll`（**按构造，不作证据**：`Archive` 一步把未收场的全部写成收场；证据是场景 [S-56](#s-56-归档之后到达的完成不送达)）、`NoNewDeliveryAfterArchive` |
| 批内前一项还没落定就起了后一项；同一工具超过并发上限 | [S-43](#s-43-一批依次与同一工具的并发上限) | `SequentialBatch`、`ConcurrencyCap`（按构造） |
| 没放行（凭据不符或核对不了）的调用被执行 | [S-23](#s-23-提交一批) | **不在模型里**：场景 [S-60](#s-60-凭据不符与核对不了都整批不执行) |
| 参数不合 `input` 的调用起了执行者；或它以别的收场、不带用法、被当成操作失败值落下 | [S-23](#s-23-提交一批) ④、[S-11](#s-11-失败的种类) | **不在模型里**：场景 [S-61](#s-61-参数不合即刻失败并带用法) |
| 参数解析不了的调用起了执行者、被猜参数，或没有结果 | [S-23](#s-23-提交一批) ④、[S-64](#s-64-参数收齐却解析不了) | **不在模型里**：场景 [S-64](#s-64-参数收齐却解析不了) |
| 重放一批起了第二次执行者、或因运行已取消被拒；租户不符的提交落下记录或读到已登记的调用 | [S-23](#s-23-提交一批) ②⑦、[S-21](#s-21-租户与会话范围) | **不在模型里**：场景 [S-65](#s-65-重放同一批返回首次的结果)、[S-67](#s-67-租户不符整批不收) |
| 被拒的帧没说出来，或说了两次；收场之后的帧进了状态 | [S-62](#s-62-工具侧到达装配前提的承诺) | **不在模型里**：场景 [S-66](#s-66-帧被拒报一次收场之后的帧不进) |
| 丢了在途状态的执行，账上 `frames` 写成零 | [S-13](#s-13-账) | **不在模型里**：场景 [S-54](#s-54-停机后前台与后台各追补一条) |
| 有序撤下时放着开着的帧流不收、计数还在却写 `"unknown"`；上交之后本任仍在服务、事后改写那次收场 | [S-48](#s-48-本能力自己的撤除与换代)、[S-47](#s-47-依赖的提供者不可用)、[S-62](#s-62-工具侧到达装配前提的承诺) 第 6 条 | **不在模型里**：场景 [S-68](#s-68-有序撤下收尾在途的帧流上交之后撤下) |
| 查不到条目的调用被执行，或它的「没有」牵连整批；把「读不到」当成「没有」 | [S-23](#s-23-提交一批) ②④ | **不在模型里**：场景 [S-69](#s-69-查不到条目的调用即刻收场不可用) |
| 不允许后台的工具被转到后台（任何触发源） | [S-27](#s-27-转后台)、[S-31](#s-31-插队处置)、[S-44](#s-44-前台上限与转后台阈值) | 守卫（按构造）；场景 [S-58](#s-58-插队三行) |

### 进展性质（全部有前提）

| 性质 | 条款 | 前提 | 模型里 |
|---|---|---|---|
| 停机后找不到活体的未收场执行，终会被落定 | [S-20](#s-20-恢复扫描与停机不重来) | 本能力终会重新起来并完成扫描 | `LostSettles`（`FairSpec`） |
| 交付了的消息终会进日志 | [S-19](#s-19-送达) | 日志追加终会成功（存储可用） | `HandoffLands`（`FairSpec`） |
| 发出停止的执行者终会实际停下 | [S-18](#s-18-收场先落停止后发) | `execution_stop_grace` 之后的强制停止在那个执行环境里确实生效（提案 X-5，未核） | `StopsTakeEffect`（`FairSpec`） |
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
| **`submit` 用的可用性报告就是这一次尝试的那一份，与放行判断用的是同一份**（[S-23](#s-23-提交一批) ①②⑥；[D-040 §八 M33](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | agent loop 在这一次尝试开始时拿到报告，把同一份值交给 runner 的 `dispatch`（`admission.report`）与本能力的 `submit`（`report`）；本能力核它带的会话、运行与尝试 | **报告随 `submit` 请求传递**，在接收边界核对它属于这个会话、这个运行、这一次尝试（[D-040 §八 M46](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；**接收一侧不得替那一次尝试现算一份，也不得向注册表要「最近一次」的那份**（与 runner 那一侧同一条，`capability.loop-extension-runner/v1#S-21` ②） | 本能力判不可用、寻址 MCP 用的与放行判断看到的出自两份报告（一次尝试内两套新鲜度口径）：放行判断按那一份放行了一个 MCP 动作，本能力按另一份读不到它的持有（整批不执行），或拿一份已被撤的持有去调对端；拿别的运行、或同一运行上一次尝试的报告，此后已收回的条目照样执行 |
| **本能力不随依赖换代而停下**（前提） | 本能力的依赖只有存储与时钟，**本版不换代**（装配前提） | 不适用 | 依赖一换代，本能力撤除、全部在途执行按 [S-48](#s-48-本能力自己的撤除与换代) 落 `failed{abnormal_interruption}`（撤下时写得下就当场写、帧流以 `lost` 收尾；写不下去的由下一任扫描按停机处置）——**正确，但每换代一次就是一次停机** |
| **执行者的资源随停机一起失去**（[S-20](#s-20-恢复扫描与停机不重来)） | 恢复扫描先回收登记过的进程组，再写失败 | 执行节点失联时由那个节点的看护者回收；回收不了的，外部效果「不可确定」 | 记录说失败而世界里它还在跑、还在做事（提案 X-5，未核） |
| **时刻取自同一个时间源**（[S-13](#s-13-账)、[S-12](#s-12-等待)） | 本机时钟 | 起止时刻与到点取自同一个时间源 | `endedAt < startedAt`，账被拒收；或到点提前、滞后 |
| **送达通知只在本进程内，且只带标识与收场**（[S-45](#s-45-送达通知)；[D-040 §八 M42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | `execution.delivered` 在本能力所在的进程内发出；进程内的监听者**不按租户分开收**，每个监听者按载荷里的 `tenant`、`session` 自己筛掉不属于它的；载荷只有 S-45 列的那几项（标识与收场），不带结果内容 | **不得跨进程广播**：别的进程要知道一次执行结束了，读会话日志（权威，按调用方租户身份重验），或经一份按（租户，会话）订阅的面——本版没有这份面（[G-17](#十二已知缺口)） | 一个租户的会话里哪个调用、何时、以什么收场，被广播给别的租户的进程；或监听者不自筛，把别的会话的收场当成自己的，据它去读别人的日志 |

---

## 十、交接、缺席与恢复

### S-47 依赖的提供者不可用

| 依赖 | 不可用时 |
|---|---|
| 存储（执行记录、会话日志） | 读写操作 `dependencyUnavailable{storage}`；**在跑的执行照跑**，收场写不下去时上交（PF-011），**不在内存里假装写成了**。**上交之后本任撤下、不再服务**（此后一切操作 `runtimeStopped`，等着的 `awaitForeground` 同样返回它；[PF-011 §6.2 上交即打断](../../../../product/PF-011-off-nominal-handling/design.md#62-上交即打断)；[D-040 §七 M13](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)），**不等存储回来再补写**：写不下去的那些收场、连同这一任其余在途的执行，由下一任恢复扫描按停机处置（[S-20](#s-20-恢复扫描与停机不重来)、[S-41](#s-41-交回) ⑤）。所以 [S-7](#s-7-活体与找得到)「在服务中每条未收场的记录都有活体」不因上交而破：上交的那一任已不在服务中 |
| 放行核对面 | `submit` 整批 `admissionUnavailable`；**不执行任何一项** |
| 注册表（按名字查一条；交来的报告对某个接入点写明「没有」生效的持有，同样按读不到处理） | `submit` 整批 `dependencyUnavailable{registry}`。**报告本身不是一个会不可用的依赖**：它随 `submit` 交来，缺席或不属于这个会话、这个运行是 `invalidInput`（[S-23](#s-23-提交一批) ⑥⑧） |
| 执行者（本地实现撤下） | 在途的照跑（[S-37](#s-37-执行者登记与撤下)）；之后起不来的落 `failed{start_failed}` |
| MCP 桥（换代或卸载） | 经它挂起的调用落 `failed{abnormal_interruption}`（[S-37](#s-37-执行者登记与撤下)） |
| `capability.stream-assembly`（帧） | 帧追加不上：不影响执行（[S-39](#s-39-发帧)）；被拒的帧以 `rejected` 说出（[S-62](#s-62-工具侧到达装配前提的承诺)） |
| 落盘前那一关（卸载判定） | 指定挂件顶上：只记可见并留条目（[S-42](#s-42-结果落成消息之前的那一关)、[S-63](#s-63-卸载判定这一件)） |
| 时钟 | 到点与阈值不触发，记录上的时刻写不下：收场写不下去时上交；**不用一个猜的时刻填** |

### S-48 本能力自己的撤除与换代

- **撤除时不再接受新的提交**，此后一切操作 `runtimeStopped`。
- **有序撤下（撤除、替换）时收掉在途的**（[D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：对每一条还没收场、有活体的执行，**先**对它开着的装配状态调 `abandon`（帧流以 `lost` 收尾，[S-39](#s-39-发帧)、[S-62](#s-62-工具侧到达装配前提的承诺) 第 6 条），**再**首胜写下与恢复扫描同一种收场（[S-20](#s-20-恢复扫描与停机不重来) 第 2～4 步那一份：`failed{abnormal_interruption}`，外部效果、追补的消息与挂着的卡片同样处置）——账的 `frames` 取 `abandon` 交出的那一份（计数的一方还在，**不写 `"unknown"`**），交出的 `blocks` 非空就有一条 `ending: lost` 的 `ToolInternalMessage`，与结果消息同一次交付（[S-19](#s-19-送达)）；之后照 [S-18](#s-18-收场先落停止后发) 发停止、收口。**次序照 S-18，不照恢复扫描的「先回收、再写」**：执行者此刻还在跑，先发停止，它因停止而退出就会被当成一次交回抢在前面。
  **为什么不放到下一任**：装配状态随这一任一起没了——用户已经看见的帧写不进日志（[PF-009 §6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)），账上只能写 `"unknown"`，而这时计数的一方明明还在（`data.call-accounts/v1#S-11`：那是它违约）。
- **正确性不依赖撤下这一步写成**：写不下去的（存储不可用，含 [S-47](#s-47-依赖的提供者不可用) 上交之后的那一次撤下），留给下一任恢复扫描按停机处置——那时装配状态已随上一任没了，`frames` 写 `"unknown"`、那条 `ToolInternalMessage` 写不出来，这正是「持有者失去连续性」的那一种情形。
- **停机**（进程没了，不是有序撤下）：什么都来不及写，下一任扫描把它们落 `failed{abnormal_interruption}`、`frames` 写 `"unknown"`。
- **换代等于一次停机**：上一任的活体全部失去（有序时先按上面收掉在途的），下一任接手，**不重起**任何执行者。
- **上交之后本任撤下**（[S-47](#s-47-依赖的提供者不可用)、[S-41](#s-41-交回) ⑤；[PF-011 §6.2](../../../../product/PF-011-off-nominal-handling/design.md#62-上交即打断)）：上交的那一任不再服务，也不等存储回来补写。
- **回收 agent runtime、取消一次运行、会话归档都不是本能力的撤除**，各有各的操作。

---

## 十一、规范表达与验证义务

### S-49 本版选用哪些形式工件

- **TLA+ 行为模型 [`formal/Execution.tla`](formal/Execution.tla)**：一个会话、两批四次调用、一次停机；主配置六处保护全开，一个进展配置，六个去保护的否定配置；另有三份补充否定配置与七个可达性探针，在验证入口的证据里（不进版本目录）。
  条款与性质的对应、每一处保护被去掉时的反例、模型盖不到什么，见 [formal 入口](formal/README.md)。
- **不建 Alloy**：本契约的结构约束（一次调用一条记录、一条工具消息）都随行为出现，在 TLA+ 里已有能失败的断言；没有独立的结构性质需要它。
- **不建 Schema**：见开头「表示」。
- 模型之外的性质（凭据、注册表、参数判定、交回检查、账的内容、帧、落盘前那一关、租户隔离）的证据是下面的规范场景与 [verification](../verification.md) 登记的故障注入。
  **提交时因参数不合、参数解析不了即刻收场的两支不在模型里**：它们在提交上与「判为不可用即刻收场」同形，但模型对它们没有任何断言，**不写成已由模型覆盖**；证据是场景 [S-61](#s-61-参数不合即刻失败并带用法)、[S-64](#s-64-参数收齐却解析不了)。
  **判重的次序、租户核对、执行者一侧四个原语、帧流收尾与到达装配前提的承诺**同样不在模型里；证据是场景 [S-65](#s-65-重放同一批返回首次的结果)～[S-67](#s-67-租户不符整批不收)。
  **有序撤下、上交之后撤下、查不到条目的调用**也不在模型里：模型只有停机（`Crash`）与下一任扫描（`Recover`），有序撤下写下的收场与恢复扫描同形，但帧流、账的 `frames` 与「上交」这一步模型都没有断言，**不写成已由模型覆盖**；证据是场景 [S-68](#s-68-有序撤下收尾在途的帧流上交之后撤下)、[S-69](#s-69-查不到条目的调用即刻收场不可用)。

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

一次前台在跑、一次已转后台时据点停机 → 重启扫描完成前一切操作 `runtimeNotReady`；扫描把两条都落 `failed{abnormal_interruption}`：前台的一条 `ToolMessage`、后台的一条 `background_execution_interrupted` 提醒；**执行者都不重起**；两份账的 `frames` 都写 `"unknown"`（装配状态随活体没了，不写 0），停机前报过的钱照样进账；那条前台执行挂的卡片请求关闭为 `superseded`。

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

#### S-61 参数不合即刻失败并带用法

一批两项：多命令工具的一次调用 `args` 多带了一个所选命令 `properties` 里没有的键，**所选命令的 `input` 顶层没写 `additionalProperties`**，另一次合格 → 批成立；前一项在提交那一次写里收场 `failed`、种类 `arguments_invalid`，`ToolMessage` 的块写明那个键不收，并带该命令的一行说明与参数表，与 `Tools().inspect` 对同一命令答的一致；**它的执行者从没起过**，外部效果「已确定未发生」；后一项照常排队、起执行者。
再各跑一次：同一个未知键、`input` 显式写 `additionalProperties: false` → 同样拒；缺 `required` 里的键；`command` 不在命令表里（块上带命令清单）；单函数工具带未知键（块上的一行说明是工具的 `description`）→ 同样拒；「只带命令清单」写法（`additionalProperties: true`）的命令收到任意对象 → **不拒**，照常起执行者。
**反例**：实现静默丢掉那个未知键照常执行（研究 V-5 里模型因此答错）；或把它报成整批 `invalidInput`；或块上只写「参数错误」不带用法。

#### S-64 参数收齐却解析不了

一批两项：一项是 `UnparseableCall`（调用块标了 `unparseable`，参数原文少一个右括号），另一项是合格的 `AdmittedCall` → 批成立；前一项在提交那一次写里收场 `failed`、种类 `unparseable`，`ToolMessage` 的块写明参数解析不了，**它的执行者从没起过**，外部效果「已确定未发生」；这一项**没有凭据、不查注册表**——它的工具名在这次尝试里查不到也一样是这个收场；后一项照常排队、起执行者。
**反例**：实现猜一份参数交给执行者；或把它报成整批 `invalidInput`；或不写结果、留给 loop 自己补；或因为它没有凭据而整批 `notAdmitted`。
（[examples 第 9 节](examples.md#9-提交判重解析不了与租户)）

#### S-65 重放同一批返回首次的结果

一批三项 `call_a`（合格，起来在跑）、`call_e`（参数不合）、`call_u`（解析不了）提交之后：① 原样再提交一次；② 再加一项凭据不符的新调用 `call_n` 一起提交；③ 运行被取消（`call_a` 收场 `interrupted{run_cancelled}`）之后再原样提交一次；④ 把 `call_a` 的参数改一处再提交。
**必须观察到**：①③ 批成立，三行 `disposition` 与首次**逐字相同**（`accepted{foreground}`、`ended{failed}`、`ended{failed}`），**没有第二次执行者、没有多一条记录或消息**——③ 不是 `alreadyEnded`，`call_a` 此刻的收场从 [S-33](#s-33-读一次执行) 读；② 整批 `notAdmitted`，`call_n` 没有记录，**已登记的三项不受影响**；④ 整批 `callIdConflict`，什么都不写。
（[examples 第 9 节](examples.md#9-提交判重解析不了与租户)）

#### S-66 帧被拒报一次，收场之后的帧不进

一次前台执行，执行者依次发帧：开文本块 0（追加）、填「a」、**再开一次块 0**、一个 `trim`、填「b」、封块 0；然后交回；交回之后又发一帧填「c」。另跑两次：一帧不发就交回；执行进一次等待、到点。
**必须观察到**：发帧依次交回 `accepted`、`accepted`、`dropped{ rejected{ index_reused } }`、`dropped{ notAFrame }`、`accepted`、`accepted`，交回之后那一帧 `dropped{ executionEnded }` 并留一条记录条目；装配状态里**紧跟被拒的那一帧恰有一个 `reason: rejected` 的 `trim`**，`trim` 那一帧没有进状态；观察者收到的增量里没有交回 `dropped` 的那两帧；收场时交 `finish{ reason: end }`，收尾交出的块非空 ⇒ 一条 `ToolInternalMessage`，`ending: complete`，与 `ToolMessage` 同一次送达、排在它前面，`frames` 进账恰一次。
一帧不发的那次：**没有** `ToolInternalMessage`，账上 `frames.emitted` 为零。等待到点的那次：收场 `no_answer`，帧流以 `abandon` 收尾，有块时 `ending: lost`（[`data.messages/v1#S-14`](../../../data/messages/v1/contract.md#s-14-toolinternalmessage-怎么收的尾)）——**不是 `interrupted`**。
（[examples 第 10 节](examples.md#10-帧接受被拒与收场之后)）

#### S-67 租户不符整批不收

会话 `ses_1` 持有租户 `T`：以 `T'` 提交一批（其中一项的 `CallId` 在 `ses_1` 里已登记，另一项的 `CallId` 已登记而调用块不同）；再让会话持有的租户读不到时以 `T` 提交。
**必须观察到**：第一次整批 `crossTenant`，**什么都不写，也不按幂等返回已登记那一项的 `disposition`**、不报 `callIdConflict`——租户核对在判重之前；第二次整批 `dependencyUnavailable{storage}`，不放行、也不当作租户相符。
（[examples 第 9 节](examples.md#9-提交判重解析不了与租户)）

#### S-68 有序撤下收尾在途的帧流，上交之后撤下

① 一次前台执行发过两帧（开块、填）、还在跑时，本能力被有序撤下（替换）。② 另跑一次：执行者交回时执行记录写不下去（存储注入失败）。
**必须观察到**：① 撤下之前那份装配状态经 `abandon` 收尾，收场 `failed{abnormal_interruption}`、外部效果「不可确定」，账的 `frames.emitted = 2`（**不是** `"unknown"`），一条 `ending: lost` 的 `ToolInternalMessage` 与那条 `ToolMessage` 同一次送达、排在它前面；执行者不重起。
② 交回得到 `escalated`；此后这一任的每个操作都是 `runtimeStopped`（含正在等的 `awaitForeground`），**存储恢复之后它也不补写那次交回的收场**；下一任扫描把这次执行落 `failed{abnormal_interruption}`、`frames` 写 `"unknown"`，交回的结果不出现。
**反例**：撤下时放着开着的帧流不收、账上写 `"unknown"`（计数的一方明明还在）；上交之后本任继续服务、存储回来后把交回的结果写成 `completed`——同一次执行在两任手里有两种收场。
（[examples 第 6 节](examples.md#6-停机前台与后台各追补一条)末段、[第 10 节](examples.md#10-帧接受被拒与收场之后)）

#### S-69 查不到条目的调用即刻收场不可用

一批两项：合格的 `AdmittedCall` 一项；`UnlistedCall` 一项，名字是模型编造的、这次尝试的 `tool` 表里没有。另一次提交里交一个 `UnlistedCall`，名字在表里查得到。再让注册表此刻读不到，以新的 `CallId` 重交第一批那两项。
**必须观察到**：第一批成立，`UnlistedCall` 那一项 `ended{unavailable}`、记录上的原因 `no_such_entry`，`ToolMessage` 的块写明这次尝试里没有这个工具、块上不带 `reason`，**它没有凭据、执行者不起**，外部效果「已确定未发生」；合格那一项照常排队。查得到条目的 `UnlistedCall` 整批 `notAdmitted`、什么都不写。注册表读不到时整批 `dependencyUnavailable{registry}`——**不把「读不到」当成「没有」**。
**反例**：因为「没有」而整批 `dependencyUnavailable{registry}`，一个编造的名字牵连同批；或信了交来一方说的「查不到」，执行了一次没放行的调用。
（[examples 第 8 节](examples.md#8-每个失败值一个反例)）

---

## 十二、已知缺口

**缺口不填默认值。**消费者读到这里应当知道哪里在等裁决。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-1** | **会话日志的追加口与记录条目的壳未定义**：追加是否能加入本能力的事务、按 `(CallId, 段)` 幂等的追加口、记录条目带什么——执行记录与会话日志之间**当前没有共同的存储对象** | [S-19](#s-19-送达) 两种承接形状选哪一种；[S-22](#s-22-关键转换留记录) 条目的形状 | **主线／loop 与会话那一程**（会话日志的 owner）；形状选择随后归本能力的提供者设计 |
| **G-2** | **已闭合**：`run_cancelled`、`backgrounded_at_start`、`terminated_by_agent` 已进 `data.content-blocks` v1 候选的 [S-18](../../../data/content-blocks/v1/contract.md#s-18-占位原因与它落在哪一格)（主线裁定，见 [D-040 §S13 S13-h](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)） | — | — |
| **G-3** | **已闭合（主线 2026-09-24）**：[PF-006 rev 18 §6.6「前台上限与并发上限」](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限)与 §6.7 定了占位原因「前台超时」、收场是被中断；主线定名 `foreground_timeout`，已进 `data.content-blocks` v1 的 [S-18](../../../data/content-blocks/v1/contract.md#s-18-占位原因与它落在哪一格)（[S-10](#s-10-占位原因) 那一行） | — | — |
| **G-4** | **执行环境引用的家与落点求值**：PF-005 没有契约；引用的形状、「到不了位」由谁判 | [S-38](#s-38-起执行者) 第 2 步、`AdmittedCall.environment` | **PF-005 的 owner**（后续一程） |
| **G-5** | **收窄：决策卡片没有契约**——卡片标识的形状、关卡的请求面、谁能答卡。**「已作废」这个关闭状态产品已定**（[PF-008 §6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答) rev 7），本契约写作 `superseded` | [S-12](#s-12-等待) 的卡片成员、[S-20](#s-20-恢复扫描与停机不重来) 第 4 步怎样请求关卡、[S-31](#s-31-插队处置) `human_declined` 的判据 | **卡片契约**（后续一程，PF-008 的规格） |
| **G-6** | **落盘前那一关由谁驱动、结论怎样交回本能力**：后台执行收场时、运行已终结时、协程已回收时，`after_action`（`each`）由哪一方派发、在谁的宿主里跑；**前台的也缺一半**——那一关由 loop 派发，而本能力**没有一个接收那一关结论的操作**，结论（改写后的结果块、卸载的取舍）经什么交回、交回之前本能力等不等，本版都没有写（实现映射反推 T-2 并入本缺口，[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。在它闭合之前，兑现本契约的一方只能对每一个有待落盘结果块的收场按「那一关不可用」落（S-42 那一支）——**那是一个明确的降级，不是这一关已被兑现**。**原「那一关不可用时原始结果丢失」一半已闭合**：原始结果由本能力先存下（[D-040 §S13 S13-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)） | [S-42](#s-42-结果落成消息之前的那一关) 全部（前台与后台）；`after_action` 上的拓展件——卸载判定（[S-63](#s-63-卸载判定这一件)）、导入的 PostToolUse 改写、租户件 | **主线**（PF-012 与 `capability.loop-extension-runner`）；**本程不补、下一程闭合**（[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；闭合条件：一份契约写明驱动方与交回面 |
| **G-7** | **存储未定义**：`storeRaw` 存进哪个存储、留多久、解引用时谁判能不能读（同 `data.content-blocks` 的 G-1） | [S-36](#s-36-存一份原始结果)、帧里的媒体引用 | **PF-006 的 owner** 与存储那一程 |
| **G-8** | **收窄**：外部效果、实际停止、`late` 三件已进 `data.call-accounts` v1 候选（S-11、S-39；[D-040 §S13 S13-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)），投影写在 [S-13](#s-13-账)、[S-14](#s-14-停止与外部效果分开说)。**仍缺一件**：收场之后执行者晚报的一笔进有效费用走 `CostCorrection`，而它的 `obtainedVia` 对工具执行只有 `manual`，没有「执行者报的」那个取值（即那份契约的 G-7）；在那之前 [S-40](#s-40-报账) 收场之后才报的只进记录条目 | [S-13](#s-13-账)、[S-40](#s-40-报账) | **`data.call-accounts` 的 owner**：`obtainedVia` 补一值，或写明晚报的只留记录条目 |
| **G-9** | **工具作者以正常返回表达失败的写法**（`data.tool-definition` 的 G-9） | [S-41](#s-41-交回)：本版只有抛出一条路 | **`data.tool-definition` 的 owner** |
| **G-10** | **答复的形状**：答复者（人：哪个租户成员；agent：`AgentRef` 的家在 `data.messages` 的 G-7）怎样表示；「明确拒绝回复」怎样作为一次答复进来 | [S-30](#s-30-答复等待) | **PF-008 的 owner**（卡片契约）与 PF-007 `Agents()` 的 owner |
| **G-11** | **发起即后台的请求从哪来**：`Shell()` 的 `run_in_background` 是它自己的一个参数；一般的调用怎样表达「发起时就在后台」、由谁置 `startInBackground` | [S-23](#s-23-提交一批) ① | **PF-007 的 owner** 与 loop 那一程 |
| **G-12** | **会话标识的类型、会话持有的租户从哪里读、撤销归档之后的提交**：`SessionRef` 的家（`data.messages` 的 G-7）；[S-23](#s-23-提交一批) ② 第 2 条要读会话持有的租户，读面归会话那一侧；撤销归档之后同一会话能否再提交执行 | [S-6](#s-6-执行记录)、[S-21](#s-21-租户与会话范围)、[S-23](#s-23-提交一批) ②、[S-29](#s-29-会话归档) | **会话那一程**（PF-015） |
| **G-13** | **已闭合（修复波 2）**：那七条主线裁定（一批依次、本地实现撤下不影响在途、执行时才发现落点不到位落 `failed{environment_unavailable}`、参数不合即刻失败并带用法、未知键一律拒、单函数工具同一规则、即刻收场的次序）已登进 [D-040 §六 N-8](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)，正文各处改链它 | — | — |
| **G-14** | **已闭合**：工具执行被中断不另补 `interrupted` 提醒，占位承载（主线裁定，见 [D-040 §S13 S13-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)；`data.messages/v1#S-21` 已写明，本契约 [S-19](#s-19-送达)） | — | — |
| **G-15** | **账上的 `credentialScope` 从哪来**：`data.call-accounts/v1#S-38` 要这次执行的自有费用经哪一格上的凭据产生；执行者（本地工具、MCP 桥）怎样把这一格报给本能力、没报时缺席（=「没经范围上的凭据」）是否可信，本版没有答案 | [S-13](#s-13-账) | **主线**（`data.call-accounts` S-38 与 `capability.mcp-bridge` 的报账面） |
| **G-16** | **整批被拒之后那些调用落什么收场**：[S-23](#s-23-提交一批) 整批失败时（`notAdmitted`、`admissionUnavailable`、`alreadyEnded`、`dependencyUnavailable` 等）那一批调用在日志里没有结果，本能力不替它们落；由谁写 `ToolMessage`、写哪一种收场，本版没有答案（主线裁定登为缺口，见 [D-040 §五 K25](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)） | [CS-1](#cs-1-agent-loop-等一次前台调用)；这些调用在下一次模型请求里是否成对 | **agent loop 契约**（PF-012 那一程）；闭合条件：loop 契约写明由谁写 `ToolMessage` 与哪种收场 |
| **G-17** | **推给观察者的帧没有订阅面**：[S-62](#s-62-工具侧到达装配前提的承诺) 第 9 条承诺增量「只推给这次执行所在会话的观察者」，但本契约没有一个让观察者按（租户，会话）订阅的操作，也没有写观察者是谁、怎样验它的租户身份；[S-45](#s-45-送达通知) 的送达通知不能代替它（只在本进程内、只带标识与收场）。在它闭合之前，**帧的增量不推给任何观察者**，要看在途的帧只能读 [S-33](#s-33-读一次执行) 的快照——不推是缺一项能力，推给没订阅、没验过身份的一方是越界（实现映射反推 T-3，[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | [S-62](#s-62-工具侧到达装配前提的承诺) 第 9 条；交付面实时看帧（PF-009 §6.9） | **主线**（交付面与会话那一程，PF-016、PF-009）；**本程不补、下一程闭合**（[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；闭合条件：一份契约给出按（租户，会话）订阅的面 |
| **G-18** | **`late` 判不出来**：[S-13](#s-13-账) 要在落账那一刻知道提交它的尝试是否已被取代、运行是否已终结；本契约没有这两件事的读面，它们的权威在 agent loop 与运行一侧。**判不出不等于「不晚」**：`late` 缺席在 `data.call-accounts/v1#S-39` 里是确定的「不晚」，不是「判不出」——在它闭合之前 S-13 的这一格**兑现不了**，照写缺席就是替判不出的事写了一个结论（实现映射反推 T-4，[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | [S-13](#s-13-账) 的 `late`；`data.call-accounts/v1#S-39` | **主线**（agent loop 与运行的契约，PF-012）；**本程不补、下一程闭合**（[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；闭合条件：尝试是否被取代、运行是否终结的读面有家 |
| **G-19** | **执行经本系统调模型的那几次，`ModelResponse` 与服务报的费用怎样到本能力**：[S-13](#s-13-账) 的 `cost.items`（`service_reported`、`model_response`）与 `usage`、[S-40](#s-40-报账) 的 `model_call` 镜像，都要本能力拿得到那几份 `ModelResponse`；执行者一侧的原语（[S-39](#s-39-发帧)～[S-41](#s-41-交回)）里没有这一路，模型请求运行时一侧也没有写把它交给谁。在它闭合之前这几项**兑现不了**：`usage` 缺席在 S-13 里的意思是「一次都没调」，照写缺席就是把判不出写成没调；按 `data.call-accounts/v1#S-20` 记未知，又要本能力先知道有过那几次，而它不知道（实现映射反推 T-5，[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | [S-13](#s-13-账)、[S-40](#s-40-报账)；按运行汇总的成本 | **主线**（模型请求运行时与执行者接口）；**本程不补、下一程闭合**（[D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）；闭合条件：写明这一路的来路 |

---

## 十三、消费者核对

#### CS-1 agent loop 等一次前台调用

loop 提交一批之后，依赖 [S-23](#s-23-提交一批) ⑤、[S-24](#s-24-等前台那一次调用落定)、[S-43](#s-43-一批依次与同一工具的并发上限)：对每一项 `awaitForeground`，返回时那条 `ToolMessage` 已在日志里；
协程被回收后新协程照 Run 里记的 `CallId` 再等一次，得到同一个结果。**整批被拒时**（`notAdmitted` 等），这些调用在日志里没有结果，本能力不替它落；由谁落、落什么是 [G-16](#十二已知缺口)。
**报告里查不到条目的调用**（没进放行判断）以 `UnlistedCall` 同批交来，收场 `unavailable{no_such_entry}`、消息已交付，loop 不必另补结果（[S-23](#s-23-提交一批)）。
**`submit` 带的 `report`** 是 loop 在这一次尝试开始时拿到、交给 runner `dispatch` 的那一份（[S-23](#s-23-提交一批) ①）：loop 手里要留着它直到这一批交完；带错了运行或尝试的（含同一运行上一次尝试的那份）、没带的，整批 `invalidInput`、什么都没写，loop 须拿对的那份重交（[D-040 §八 M33](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。**够**；报告跨恢复拿不回时怎样重来，归 `capability.asset-registry/v1#S-11` 第 4 条与 loop 那一程。

#### CS-2 `BkgJobs()` 三命令

`list` → [S-34](#s-34-列出后台执行)；`output` → [S-33](#s-33-读一次执行)（已收场的看收场，没收场的看在途帧）；`terminate` → [S-25](#s-25-中断一次执行) `initiator = agent`——
`terminated_by_agent` 已有取值（[S-10](#s-10-占位原因)），这一支落得下消息。

#### CS-3 会话归档流程

「先停活儿」那一步调 [S-29](#s-29-会话归档)，返回之后这个会话没有未收场的执行；之后才落归档状态。撤销归档不接回（[G-12](#十二已知缺口)）。

#### CS-4 插队

intake 在 loop 停在「等工具」时对当前这一步的调用调 [S-31](#s-31-插队处置)；不自己挑转后台还是中断。

#### CS-5 卸载判定

站在 `after_action`（`each`），拿到 `subject.result`（有才带，[S-42](#s-42-结果落成消息之前的那一关)）；声明卸载的 `offload.raw` 到它手里已是引用（本能力先存下），它只决定把什么写进改写后的结果块；
系统兜底截断要存原文时调 [S-36](#s-36-存一份原始结果)。**本版停在 [G-6](#十二已知缺口)**（后台结果那一支）与 [G-7](#十二已知缺口)（存储）。

#### CS-6 MCP 桥

桥作为执行者被起（[S-38](#s-38-起执行者)），对端报错或 `invoke` 交回失败值 → `failed{implementation_error}`（按 `capability.mcp-bridge/v1#S-21` 的对照，[S-11](#s-11-失败的种类)）、外部效果按「请求是否已发出」定（[S-14](#s-14-停止与外部效果分开说)）；
桥换代 → 挂起的调用 `failed{abnormal_interruption}`（[S-37](#s-37-执行者登记与撤下) ↔ `capability.mcp-bridge/v1#S-27`）；接入点在尝试开始时连不上是注册表那一侧的不可用 → 收场 `unavailable`（[S-23](#s-23-提交一批) ④），不到执行。

---

## 十四、版本差异

v1 是首版，无前版。**候选；经第一轮（2026-09-24）、第二轮（2026-09-25）独立评审后原地修订，同日按实现映射反推（D-040 §八）原地修订；未接受。**
