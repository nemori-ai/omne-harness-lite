## v8 失败经过执行上下文候选（2026-09-29）

2026-09-29：D106同日后继已技术采用runner v8精确受审修订；原候选字节保留，实际来源接口、全部消费者迁移及正反验收尚未完成。此次修复noRun失败挪用为Run的已确认缺陷，不升级为完整Run交付。

[v8-failure-execution-design.md](v8-failure-execution-design.md)补实际 RunnerPass.execution 到失败来源 verify 的显式交接，拒绝 noRun／另一 Run 失败被挪作当前经过，保留合法跨 attempt 重演。**语义接受：沿既有 Runner5/LC6/RT10；本技术增补尚未采用。可实施：候选与 runtime 同批上下文待共同评审采用。绑定：新增0。实际验证：R8-V1～V6 本身尚无独立记录；runtime F18-V4 的执行记录（runPass 第三参被伪造时 R8 服务例检出、README 字面 `failurePort` 编译执行）见 [runtime M17／F18 实际执行](../../model/model-request-runtime/verification.md#m17f18-实现检查映射)。** 已有源码或旧服务验收不证明此反例已修；受信示例借同一物理日志 owner，不新增完整 Run 产品。验收与缺口见 [R8](verification.md#v8-失败经过执行上下文)。

## v7 模型路径服务接线候选（2026-09-29）

**2026-09-29 模型路径窄增量已技术采用**：D106后继采用本节点新候选的精确受审字节及有限消费接续。语义沿现行接受规范；可实施范围见该决定；新增绑定0；实际源码和相应验收尚待，不把起草时candidate标签或旧checkpoint当现行采用结论。

[v7-model-service-design.md](v7-model-service-design.md)接续已接受 Runner5/LC6 和 D106 公共执行面。**语义接受：既有契约有；本服务接线增量随 runtime v17（M17）于 2026-09-29 由 D106 后继技术采用，2026-09-30 实施与主线验收见 runtime 节点 verification.md 的 M17 两段**；**可实施：候选明确同 E 链读取、精确历史正文、登记/注销代际、同一公共 runPass 及纯 replay 核，待独立评审和采用**；**新增绑定：0**；**实际验证：R7-V1～V10 本身尚无独立记录；runtime M17-V9／V10 涉及的 P5 登记代际与缺席不发布见 [runtime M17／F18 实际执行](../../model/model-request-runtime/verification.md#m17f18-实现检查映射)**。当前源码已有公共 runPass/log adapter/task owner，既有 427 项函数证据不证明 Cordis 服务已经交付。

本轮仅模型必要经过与 P5 登记组合，不建设通用资产、完整 Run、卡片等待或工具执行。MF4/AR4 实际来源的有限接续、既有 MF 公开投影到 Runner5 S-6 的窄映射及真实 Cordis/manifest/JSONL 验收义务见 [R7 验证与缺口](verification.md#v7-模型路径服务接线)。不增加 registry API；外部 waiting/生产 Run 来源缺席仍 unavailable，不用假值放行。以下段落是各自历史观察时点，公共函数的当前实施事实不反写旧采用正文。

## 2026-09-29 公共执行面采用增量

D106 追加 已技术采用 v6 revision1 及继承的公共 runPass／日志适配／任务 owner 范围；独立窄复核原 B1 闭合。可实施完整条件函数，尚未实施或验证。生产等待、Run、G3/G5、P-5 及 Cordis 服务装配未因采用关闭。下方候选状态是起草时事实，当前采用范围以该决定为准；V6-1～9 仍待执行。

## 公共 runPass 执行面候选（2026-09-29）

- 新入口：[v6-run-pass-design.md](v6-run-pass-design.md)，文档 revision1；契约仍为已接受 Runner5/LC6，不是 Runner6。
- **语义接受**：沿 D100/D104 的精确输入；**可实施**：本增量尚未技术采用，补全 readAskState 与受控 replay 调用、四种可区分等待世界、unknown owner 与完整分支，未实施 runPass。
- D106 五纯构件采用范围保持，v5 revision3 字节不改。源码已存在的纯构件不代表 runPass/服务已完成。
- **绑定证据**：新增0、总数0。**实际验证**：本次只有设计检查，无产品执行。生产卡片/等待、Run、G3/G5 仍由实际 owner 接线验证；有条件函数组合和生产服务分别报告。
- 验收与缺口：[V6 公共执行义务](verification.md#v6-公共-runpass-执行面)。

# loop-extension-runner

## v5 当前提供者增补（2026-09-28）

入口：[v5-current-design.md](v5-current-design.md)，revision 3，**candidate，尚未技术采用**。节点仍为 `packages/agent-loop/loop-extension-runner`，尚未建包；下方历史 v3/v2 状态按各自版本读取，不覆盖接受记录。

- **语义接受：有。**D-100 已接受 Runner5 全 S-1～S-54、LC6/MS6；catalog 与 contract SHA 已核对。D-076 接受旧 v3 provider，不等于本稿被接受。Runner5 的冻结依赖仍为 RT7/MR7/SL2，本稿的 RT9/MR8/SL3 实现绑定须显式技术采用。
- **可实施范围：当前投影已起草，采用／接线门未闭。**RUN5-P1～P8 保留完整 dispatch/replay 控制并补 LC6 Conclusion、modelCallId 同次落盘、共享提醒键、同 prefix 重试历史、P-5、未知结果及资源收口。**RUN5-G1：Runner5 S-21①②与 LC6 S-11 均禁止 noRun after_model_call，公开 runPass 和服务均拒绝**；纯 codec/历史解释/效果合成，以及合法 before_persist_message 组合可独立推进。composeEffect 显式接原主体；有 Run 的函数测试不替代生产 Run 来源。RUN5-G6 的 Run 终结认法／RT9 G-28 另阻 withRun late 与恢复。G2～G5 的技术采用、失败来源接线、贡献者与真实停止分别登记；同 prefix 调用级闭包和任务 owner 已给候选端口/所有权，跨 runtime 及日志宿主接线仍待采用，不把各缺口扩大为所有纯构件受阻。
- **绑定证据：新增 0，总数 0。**现有纯值包、codec、日志及规格有限模型均不代证真实 runner。必要组合、故障与并发义务见 [v5 验证](verification.md#v5-当前投影验证义务)。
- **实际验证：尚无 runner 实现或运行验证。**本轮只作精确来源核对和文档静态检查，实际命令／输出见 [v5 实际检查](verification.md#v5-实际检查)。完整纵线装配未由本任务建立；demo 的封闭域空历史不能扩为生产有 runner 时的空历史。

## v3 候选增量（2026-09-27）

节点仍为 `provider`，路径 `packages/agent-loop/loop-extension-runner`，**尚未建包**。增量入口为 [v3-design.md](v3-design.md)；旧 [design.md](design.md) 与下方 v2 接受事实保持原坐标。

- **语义接受：本节点无。**runner3/runtime3 在 catalog 为 candidate；LC4/MS4/MR4/AE4/AR3/MF3 已 accepted，不能由依赖接受推出本节点接受。技术接受仍待 G3-0；旧 v2 接受不覆盖本版。
- **可实施范围：完整两操作控制投影已起草；生产实施受候选接受门约束。**RUN3-P1～P8 对应 `dispatch`/`replay`、真实链读取、重试守卫与记录交接；不执行工具或 AgentLoop。S-6/S-19/S-14/S-26 的候选补齐已投影，默认重试件按 runtime3 S-67 识别。模态转换/循环探测身份、公开函数契约及实际来源接线等仍见 G3-1～G3-7，服务闭环尚未验证。
- **绑定与证据：0 条。**规格侧 Runner.tla 已记录 4 组正向、10 组反例的实际结果，仅覆盖明确有限模型；没有本节点实现测试。范围及未覆盖项见 [verification.md](verification.md#v3-形式证据的有限范围)；其他节点证据不移作本节点证据。
- **实际验证：尚无生产验证。**本稿检查命令及实际结果见 [verification.md](verification.md#v3-实际执行)；静态检查不证明运行时控制语义。

公开函数、插件边界、共同日志对象与装卸配对见新设计；缺口、受阻消费者与验收反例见 [v3 验证义务](verification.md#v3-候选证据义务)。下方保留历史 v2 状态，不因本候选覆盖范围扩展而提升。

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿；兑现 `omne-harness-lite-design-2026-09-15 · capability.loop-extension-runner · v2`（[契约](../../../../spec/capabilities/loop-extension-runner/v2/contract.md)，状态 `accepted`、已冻结）。插件边界、inject 边与贡献的形状取自 D-059 接受的 tools 拆分候选 C 的装配草图（派发器）
- 源码位置：`packages/agent-loop/loop-extension-runner`——尚未建包。第二层 `agent-loop` 由 D-059 拍板，布局见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是 `runPass`（对一次经过逐件求值，调用方交链、锚键与端口）、`composeEffect`、三张处置表与 `passKeys`（候选名），不依赖 Cordis、会话、租户或存储；**Cordis 服务面** `dispatch` 就是 `runPass` 加绑好的端口——每件恰一条结论、回放、尝试栅栏、句柄只及本会话只在这一层成立，函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：一个插件（候选插件名 `loop-extension-runner`），**只必需 inject 会话日志**（`capability.session-log` v2）；provide `loopExtensionRunner`（`dispatch`、`replay`）与受限的实现登记面 `loopExtensionImplementations`（系统自带实现按 `builtinName` 登记、兼容件的外部命令执行器登记一个；执行环境句柄的两个解析方法也在这个面上）——都是候选名。一次经过跑在调用方（agent runtime，或入站受理方）的协程上，本插件不持有运行实例里的状态（契约 S-8）；装配清单（`capability.assembly-manifest` v2 的 `readHead` 与 `dependencyPresence` 查询）、模型请求运行时的两个判定、放行判断、句柄解析的两个来路（`sessionTenancy`；执行环境先经它取租户、再经 `executionEnvironments`）都在求值那一刻调用时取用，缺席即那一件不可用或这一次 `unavailable`，**不是 runner 不可用**。控制全是逐个 `await` 的直接调用，不走 Cordis 事件。Cordis 采用版本 4.0.4（D-025）

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，D-062；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-5（一次经过；锚是调用方交来的不透明键，D-063 R-12）～S-19（链、系统自带件、读面、逐件求值、不可用与报错、合法性、效果、关门表、只跑一轮、提醒）、S-21（`dispatch`，含 `admission.report` 三者核对与 `cancelled`）、S-22（`replay`）、S-50（执行环境句柄的读面）、S-23～S-30 里 runner 这一侧的交接、S-31、S-32 左列、S-33、S-34（含 runner 自身被撤除时在途 `dispatch` 不继续，D-060 §八 M63）。原「有前提地能：G-1」的四条（S-5、S-18、S-21、S-22）随 R-12 解除：锚由调用方给，**锚的算法**归 loop 那一程（契约 G-1 收窄后的那一半），本节点兑现不了调用方的两条义务。逐条落点见 [design.md](design.md#操作落点)。**尚未建包，没有任何实现。**
  受阻（[缺口](design.md#实施缺口与消费者影响)）：会话日志**接口已定、真承接者未到**——结论、栅栏、判重、提醒全落在 `capability.session-log` v2 的条款上，真承接者未到，最小提供者节点 `session-log-jsonl` 已立（accepted，RUN-N1）；装配清单**接口已定、读链未约定**——`readHead` 交得回记录，但链与四样值从记录内容里怎样取是 `capability.assembly-manifest` v2 的 G-4，服务面每一次 `dispatch` 在它闭合前 `unavailable`，**函数面 `runPass` 由调用方交链、不受挡**（RUN-N2）；依赖在场判定改为 `assemblyManifest.dependencyPresence` 查询，事实没有来源（那份契约 G-2，RUN-N5）；执行环境句柄两样**真承接者未到、接口已定**（契约 G-20）：产品装配里会话持有租户没有写入方 ⇒ 解析一律失败 ⇒ 兼容件全部「起不来」、含要转的块的消息被否决，兼容件另受阻于宿主机允许（execution-environments G-3）。函数层的行为没有契约条款（RUN-N7）。RUN-N3、RUN-N4 已随 D-060 §八 M38、M39 闭合。
  2026-09-25 修订波（公开面）：处置见 [verification](verification.md#修订波2026-09-25-公开面)
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **空表**——回放的行为模型 `Runner.tla` 已触发、尚未建（契约 G-14），没有登记的 formal task 可绑；规范场景 S-36～S-49、S-51、S-52 没有实现可跑，登记在 [verification.md](verification.md#证据义务)
- 实际验证：无

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| #44 限定试点的公开收束、端口、内部信号、catch与租户身份边界 | [已签失败边界清单](failure-boundary.md)（方案A；源码实施与验证待阶段8交付） |
| 一个插件两个服务面、实现怎样登记与撤下、一次经过怎样求值与落结论、共同存储对象、装配给怎样兑现 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空）与[验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，获准采用的终态写回当前承诺拥有者；比较与接受过程留本工作树 tmp。

## 2026-09-27 最终技术采用

D-076接受对应精确规格与本节点投影。旧候选读数和验证历史保留。此事件不代替源码、真实故障/停止或37模型生产认证；新增实际绑定另附运行证据。

## 2026-09-28 当前纯构件技术采用

D-106精确采用v5 revision3的passKeys、完整结论codec、composeEffect及retry历史解释器。候选抬头保留原稿事实，当前可施工范围以D-106为准。源码尚待本轮实施；绑定0，未有本节点实现证据。完整服务及G3/G5/G28未随采用关闭。
