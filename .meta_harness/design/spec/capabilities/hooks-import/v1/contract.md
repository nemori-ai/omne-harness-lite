# capability.hooks-import v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.hooks-import, 1)`——
  `family = capabilities`、`topic = hooks-import`、规范路径 `spec/capabilities/hooks-import/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`（2026-09-23 起草，2026-09-24 整批对齐，同日按第一轮独立评审修订，2026-09-25 修复波 1b 闭合 G-14，同日修复波 2 按第二轮独立复评改 S-19、S-27 两处措辞，同日修复波 3 按实现映射反推改 S-4、S-17、S-18、S-19、S-26、S-27 与第十二节；同日「公开面」修订波把执行环境改指 `capability.execution-environments` v1 并写进起子进程的四件事，见[验证入口](../verification.md#修订波2026-09-25-公开面)）——**未接受、未冻结**，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-012 rev 14**、**PF-002 rev 20**、**PF-008 rev 7**、**PF-005 rev 5** 为准（2026-09-24 逐版复核到当前 rev，变化与落点记在[验证入口](../verification.md#变化的影响)）；来源产品事实以研究包 [loop-extension-hooks-compat](../../../../../research/loop-extension-hooks-compat/research.md)（首轮 2026-09-23，映射按 PF-012 rev 7 作出；本契约 2026-09-24 按 rev 14 复核了映射用到的位置、维度与否决含义）为准
- **精确语义依赖**（消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)；全部是**候选**，定型后复核）：

  | 坐标 | 取它的什么 | 状态 |
  |---|---|---|
  | `omne-harness-lite-design-2026-09-15 · capability.loop-extension-runner · v1` | 兼容件被求值的方式：链与放行判断钉末位、不可用与报错两分、不可用处置、报错策略、合法性判断、`ask` 与回放、答复只认自己的卡、中途撤下按报错；执行环境句柄的读面；运行被取消时 `dispatch` 以 `cancelled` 收场 | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1` | 声明（含不可用处置 `unavailability`）、干预力、位置与维度、输入与主体（含执行环境句柄）、结论、合法组合、卡片草稿的 `proposedRewrite`、表示层拒绝值、`implementation` 的 `command` 一支（兼容件载荷的家） | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.asset-model · v1` | 能力标识名的词法、拓展件正文的外壳、`disabled` 保留项 | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.messages · v1` | 兼容件追加的提醒（`source.kind = extension`） | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | 完整的工具调用、工具结果块 | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | 身份参数无默认值、缺席即拒绝、表示层校验与判定分开 | 已接受、已冻结 |
  | `omne-harness-lite-design-2026-09-15 · capability.tool-admission · v1` | 放行判断定死的四档选项、四档只在它出的卡上带授权 | 候选 |
  | `omne-harness-lite-design-2026-09-15 · capability.execution-environments · v1` | 执行环境引用；拓展件子进程的落点判断；进程组；起子进程、取结果、按组停（2026-09-25 修订波登记，[D-043](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1） | 候选（窄口接口契约） |
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `capability.hooks-import/v1#S-11`。缺口 `G-n`、性质 `P-n` 同此

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 别的 harness 的 hook 可以导入成拓展件；按输出能力定干预力；`allow` 译成「无意见」并在导入时明示 | [PF-002 §4 Loop Extension](../../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension) | [S-8](#s-8-干预力声明与上限)、[S-12](#s-12-导入报告) |
| 工作区那一级不参与权限计算；**仓库带来的命令型 hook 默认不启用，由持有工作区的租户逐件打开** | [PF-002 §5.7](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) | [S-9](#s-9-工作区来源的-hook导入即禁用) |
| 拓展件不可用处置：租户挂上的默认跳过、注册时可声明否决；它是这一件自己的声明 | [PF-012 可插拔的服务](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略) · [PF-002 不可用处置是这一件自己的声明](../../../../product/PF-002-assets-settings-and-permissions/design.md#不可用处置是这一件自己的声明) · [UL-extension-unavailability-policy](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy) | [S-10](#s-10-兼容件要带的东西)、[S-19](#s-19-起不来与报错) |
| 搬来的 hook 出的卡借四档样子但不带授权含义，样式上与系统拦下来的分得开 | [PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) | [S-21](#s-21-ask-与回放) |
| 禁用是逐层配的布尔设置，任一层为真即不可见 | [PF-002 禁用](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见) | [S-9](#s-9-工作区来源的-hook导入即禁用) |
| 身份是类别 + name | [PF-002 身份](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) | [S-7](#s-7-能力标识怎样导出) |
| 十一个位置、两个维度、三档干预力；没有放宽；可插拔服务；瀑布 | [PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点) · [没有放宽](../../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档) · [三种形态](../../../../product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半) | [S-20](#s-20-输出怎样译回)、[S-23](#s-23-claude-code-映射表)、[S-24](#s-24-codex-映射表) |
| 挂件自己花的钱算它插手的那个运行 | [PF-012 §5.8](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run) | [S-18](#s-18-子进程在哪跑钱记在哪) |
| 只能靠改日志起作用；检测状态从日志派生 | [PF-012 §6.9](../../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) · [§6.7](../../../../product/PF-012-agent-loop-and-run/design.md#67-检测状态从日志派生不另存) | [S-17](#s-17-输入怎样译成来源产品的原生输入)、[S-21](#s-21-ask-与回放) |
| 系统不替人作答；三种来源的卡片 | [PF-008 §6.1](../../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答) · [§6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) | [S-21](#s-21-ask-与回放) |
| 会话级沙箱；落点不可用就是拒绝 | [PF-005 §6.3](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存) · [§6.9](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级) | [S-18](#s-18-子进程在哪跑钱记在哪)、[S-19](#s-19-起不来与报错) |
| 兼容层起点：fork 无运行时的一半；runner 不继承「执行器被拒 → 非阻断」；非法 matcher 让整份配置导入失败；注入的上下文标来源；导入报告 | [D-033](../../../../record/decisions/hooks-compat-baseline/decision.md) ← [提案 P1–P10](../../../../record/proposals/hooks-compat-baseline/design.md#必须保留的性质) | 全文；[S-11](#s-11-importhosthooks) ⑥ |
| 两家的事件、输入、输出、退出码、配置来源 | [研究报告 §一、§二、§五～§七、§十](../../../../../research/loop-extension-hooks-compat/reports/2026-09-23-hooks-to-positions.md#五事件--位置映射表) · [CC 笔记](../../../../../research/loop-extension-hooks-compat/notes/claude-code.md) · [Codex 笔记](../../../../../research/loop-extension-hooks-compat/notes/codex.md) | [S-23](#s-23-claude-code-映射表)、[S-24](#s-24-codex-映射表) |
| **主线裁定**（D-033 推迟的交接缺口 G1–G11）：G1 定档；G2 `ask`／`defer`；G3 改资产的输出；G4 不可用与报错；G5 一条 command 一件、配置顺序即清单顺序；G6 子进程落点与账；G7 工作区来源导入即禁用；G8 不设 Stop 续跑上限；G9 非 loop 事件；G10 重新导入；G11 钉来源产品版本——见 [D-040 §D-033 推迟的 G1–G11](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#d-033-推迟的-g1g11hooks-兼容层) | D-040 | 逐条见各条款的「依据」（正文以「G1」…「G11」指这一组） |
| **主线裁定**：兼容件载荷的家（S15-b）、`degraded` 带资产与十四个降级 token（S15-a）、导入来源由导入者声明不核实（S15-f）、PostToolUse 干预力按研究「可改写」（S15-g）——见 [D-040 §S15](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s15loop-extension-runner--hooks-import报回的) | D-040 | [S-5](#s-5-来源产品方言版本与配置来源)、[S-10](#s-10-兼容件要带的东西)、[S-12](#s-12-导入报告)、[S-13](#s-13-降级说明)、[S-23](#s-23-claude-code-映射表) |
| 兼容件复用四档选项的卡，答复不带授权、不交给放行判断 | `capability.tool-admission` v1 S-15、S-28 | [S-21](#s-21-ask-与回放) |
| **主线裁定**（第一轮独立评审的修复波）：导入的兼容件不可用处置取 `skip`、「宿主」改称来源产品（K47）；`ask` 带改写时改写放进卡片草稿的 `proposedRewrite`、答复允许之后生效（K32）——见 [D-040 §五](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) | D-040 | [S-10](#s-10-兼容件要带的东西)、[S-20](#s-20-输出怎样译回)、[S-21](#s-21-ask-与回放) |
| **主线裁定**（修复波 3，实现映射反推）：子进程要落的执行环境经统一输入的执行环境句柄取（M38）；运行被取消时在途的兼容件收到停止信号、那一次求值不留记录（M39）；装配是 `apps/cli`（M40，[D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 已裁）——见 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) | D-040 | [S-4](#s-4-依赖方向与被消费的面)、[S-17](#s-17-输入怎样译成来源产品的原生输入)、[S-18](#s-18-子进程在哪跑钱记在哪)、[S-19](#s-19-起不来与报错)、[S-26](#s-26-装配给的保证-vs-协议须给的保证)、[S-27](#s-27-缺席撤下与重新导入)、[第十二节](#十二消费者核对) |
| **主线裁定**（2026-09-25「公开面」修订波）：执行环境改指窄口接口契约 `capability.execution-environments` v1（[D-043](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1）；起子进程的四件事——带租户、解释器写成 `program`、交全环境变量、拿到结果之后停组（[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩）；拓展件子进程要一项产品允许、闭合之前兼容件 fail-closed（N-37 ⑧，账本 ⑭） | D-043、D-040 | [S-2](#s-2-本契约不拥有什么)、[S-4](#s-4-依赖方向与被消费的面)、[S-18](#s-18-子进程在哪跑钱记在哪)、[S-19](#s-19-起不来与报错)、[S-26](#s-26-装配给的保证-vs-协议须给的保证)、[S-27](#s-27-缺席撤下与重新导入) |
| 统一语言 | [UL-loop-extension](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension) · [UL-loop-extension-point](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point) · [UL-capability-identifier](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) · [UL-decision-card](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card) · [UL-replay](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-replay--回放--replay) · [UL-execution-environment](../../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-execution-environment--执行环境--execution-environment) · [UL-assembly-manifest](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest) · [UL-extension-unavailability-policy](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy) · [UL-extension-point-pass](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-point-pass--一次经过--extension-point-pass) | 全部正式名 |

> **依据行里的「主线裁定」**：D-033 明写「G1–G11 推迟到协议起草时一并讨论裁决」，那一组裁定的长期落点是 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md)（产品负责人尚未逐条追认；追认或推翻由后续决定取代对应编号）。
> 本版依据里的主线裁定都已有长期落点（原 G-12 闭合）。

**正文用到、词表里没有的概念（无词条）**——本契约**不给它们下正式定义**：
**兼容件**（`implementation.kind = command` 的拓展件，`data.loop-extension/v1#S-8` 的描述性说法）、**兼容层**、**导入报告**（D-033 明写两者不是词条）、
**来源产品**（Claude Code 或 Codex 这两个外部 harness；规格用语，不立词条——与 runner 所说的「宿主」、统一语言里的「宿主机」都不是一回事）、**方言**（一家来源产品某一版的 hook 协议）、**干预力上限**（一个来源产品事件的输出最多要求到哪一档）。

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**把 Claude Code 与 Codex 的 hooks 配置导入成拓展件，并规定这些兼容件被调到时怎样把来源产品的一次 hook 翻成统一的输入与结论。**七件事：

| # | 拥有的事 | 正文 |
|---|---|---|
| 1 | 两家来源产品、钉住的方言版本、可导入的配置来源 | [S-5](#s-5-来源产品方言版本与配置来源) |
| 2 | 一件兼容件是什么（一条 command）；它的能力标识怎样从配置导出；干预力怎样定；工作区来源怎样处置 | [S-6](#s-6-一条-command-一件兼容件)～[S-10](#s-10-兼容件要带的东西) |
| 3 | 操作 `importHostHooks` 与**导入报告**的内容 | [S-11](#s-11-importhosthooks)～[S-15](#s-15-报告里的次序) |
| 4 | 兼容件被调到时：情形筛选、输入翻译、在哪跑、起不来与报错的分界、输出翻译 | [S-16](#s-16-情形筛选)～[S-20](#s-20-输出怎样译回) |
| 5 | 来源产品的 `ask` 怎样落成卡片；回放时不重跑来源产品 hook | [S-21](#s-21-ask-与回放) |
| 6 | 越档输出的处置 | [S-22](#s-22-越档的输出) |
| 7 | **两张方言映射表**：每个来源产品事件 → 位置、维度、情形、干预力上限、输出与退出码怎样译，逐行标研究来源 | [S-23](#s-23-claude-code-映射表)、[S-24](#s-24-codex-映射表) |

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| 一个位置上多件怎样逐件求值、结论怎样落、效果怎样合成、回放的总规则 | `capability.loop-extension-runner` v1。**兼容件对它与原生件没有区别** |
| 声明、结论、输入的形状与合法组合 | `data.loop-extension` v1 |
| 把导入结果**落成资产**：写进哪一层、成为新资产还是新版本的写入、持有、配值、禁用的求值 | 资产治理（`capability.asset-governance`）与资产模型（`data.asset-model` v1）。**本操作只翻译，不写任何东西** |
| 装配清单里各件的次序 | 装配（PF-004）；本契约只给出一份配置内部的相对次序（[S-15](#s-15-报告里的次序)） |
| 放行判断的四档选项与各档含义 | `capability.tool-admission` v1 |
| 卡片落池、陈列、答复形状 | PF-008 的卡片契约（未起草） |
| 子进程所在的执行环境、它的生灭与权限 | 本版的窄口：`capability.execution-environments` v1（落点判断、起停进程组）；沙箱、会话执行环境的存活与其余：PF-005 那一程（那份契约 G-1） |
| 非 loop 事件（会话生灭、子代理、环境与设置变化、呈现、模型切换、工具私有、MCP 表单） | 各自的 PF（[S-14](#s-14-不导入的理由)） |

### S-3 本契约明确不承诺什么

- **不承诺与来源产品行为一致。**导入后的行为按本项目的拓展点协议走；**与来源产品不一致的每一处都写进导入报告**（[S-13](#s-13-降级说明)），不在运行时静默补偿。
- **不承诺来源产品真按文档执行。**映射依据是研究包记下的文档与源码；Claude Code 只有文档证据、没有跑过探针（[研究局限](../../../../../research/loop-extension-hooks-compat/reports/2026-09-23-hooks-to-positions.md#本轮局限)）。
- **不承诺来源产品 hook 脚本的副作用可逆**：一条 command 在执行环境里写了文件、发了请求，本契约既不知道也不撤销。
- **不导入**：插件目录与技能、子代理 frontmatter 里的 hook（[S-5](#s-5-来源产品方言版本与配置来源)）；`command` 以外的 handler；异步 handler（[S-14](#s-14-不导入的理由)）。
- **不开任何事件**（[S-25](#s-25-本契约不开事件)）。
- **不附 Schema**：导入报告与兼容件载荷的线上形状归投影它们的那份组合契约；本契约写的是内容与规则。

### S-4 依赖方向与被消费的面

**依赖方向单向：本契约 → runner、数据半边、资产模型、消息、块、身份值、执行环境。**它们都不得反向依赖本契约。
资产治理（落地导入结果）、装配、`apps/cli`（让兼容件的实现在场；[D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 不立 `apps/runtime-host`，[D-040 §八 M40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）依赖本契约。

**下表每个 `#S-n` 的完整坐标是 `omne-harness-lite-design-2026-09-15 · <契约> · v1 · S-n`**；catalog 的 `clauses` 以它为准。

| 契约 | 被消费的条款 | 用在哪 |
|---|---|---|
| `capability.loop-extension-runner` | `#S-6` 链从装配清单来（放行判断钉 `before_action` 链末）、`#S-9` 日志只读句柄的读面、`#S-12` 不可用与报错怎么分（含不可用处置）、`#S-13` 报错处置策略的执行、`#S-14` 结论合不合法、`#S-21` dispatch（⑥ `cancelled`：运行被取消）、`#S-27` ask、`#S-28` 回放、`#S-29` 一批动作（第 8 条：别的件出的卡的答复不交给放行判断）、`#S-34` 实现在求值中途被撤下按报错、运行被取消时在途的件停下且不留记录、`#S-50` 执行环境句柄的读面 | [S-15](#s-15-报告里的次序)、[S-16](#s-16-情形筛选)、[S-18](#s-18-子进程在哪跑钱记在哪)、[S-19](#s-19-起不来与报错)、[S-21](#s-21-ask-与回放)、[S-22](#s-22-越档的输出)、[S-27](#s-27-缺席撤下与重新导入) |
| `data.loop-extension` | `#S-1`、`#S-2` 位置与维度，`#S-4` 干预力，`#S-5` 报错策略，`#S-6` 声明（含 `unavailability`），`#S-7` name 是身份，`#S-8` 原生件与兼容件，`#S-11`、`#S-14` 输入与主体，`#S-41` 执行环境句柄，`#S-19`～`#S-29` 结论与合法组合（`#S-28` 卡片草稿的 `proposedRewrite`），`#S-31` 三种记录形状，`#S-33` 不可用与报错两分，`#S-35` 跨过等待只带已落日志的，`#S-37` 表示层拒绝值（`output_not_allowed_for_power`） | 全文；[S-10](#s-10-兼容件要带的东西)、[S-21](#s-21-ask-与回放)、[S-22](#s-22-越档的输出)；[S-23](#s-23-claude-code-映射表)、[S-24](#s-24-codex-映射表) 每一格 |
| `data.asset-model` | `#S-2` 能力标识名的词法、`#S-10` 八类正文的外壳、`#S-15` `disabled` 是保留项名 | [S-7](#s-7-能力标识怎样导出)、[S-9](#s-9-工作区来源的-hook导入即禁用)、[S-10](#s-10-兼容件要带的东西) |
| `data.messages` | `#S-15` SystemReminderMessage、`#S-26` 拓展件追加的提醒 | [S-20](#s-20-输出怎样译回) 的 `inject` |
| `data.content-blocks` | `#S-12` 完整的工具调用、`#S-15` 工具结果块 | [S-17](#s-17-输入怎样译成来源产品的原生输入)、[S-20](#s-20-输出怎样译回) |
| `data.identity-values` | `#S-17` 身份参数没有默认值、`#S-18` 缺席即拒绝、`#S-33` 表示层校验与判定分开 | [S-11](#s-11-importhosthooks) |
| `capability.tool-admission` | `#S-15` 定死的四档选项、`#S-28` 四档选项只在它出的卡上带授权含义 | [S-21](#s-21-ask-与回放) |
| `capability.execution-environments` | `#S-5` 执行环境引用、`#S-6` 落点判断（末段：拓展件子进程只凭那一项允许落宿主机）、`#S-7` 进程组、`#S-9` 失败值、`#S-13` startProcess（③ 不经解释器、不继承环境变量）、`#S-14` processOutcome、`#S-15` stopProcessGroup（`notConfirmed` 不算停下） | [S-18](#s-18-子进程在哪跑钱记在哪)、[S-19](#s-19-起不来与报错)、[S-26](#s-26-装配给的保证-vs-协议须给的保证)、[S-27](#s-27-缺席撤下与重新导入) |

---

## 二、概念与身份

### S-5 来源产品、方言版本与配置来源

**来源产品恰两家**：`claude_code`、`codex`。**方言版本钉死**（主线裁定 G11）：

| 来源产品 | 钉住的版本 | 研究来源 |
|---|---|---|
| `claude_code` | **`2.1.280`**（官方 hooks 参考页 2026-09-23 快照；页内最高提到 v2.1.274） | [CC 笔记](../../../../../research/loop-extension-hooks-compat/notes/claude-code.md) |
| `codex` | **`5c5308fc`**（源码提交 `5c5308fc9a…`，文档副本 2026-09-20） | [Codex 笔记](../../../../../research/loop-extension-hooks-compat/notes/codex.md) |

**升级复核由实施计划触发**；在那之前，本契约只按这两版译。配置里出现这两版不认识的事件名，那一条**不导入**（[S-14](#s-14-不导入的理由)），不猜它的语义。

**可导入的配置来源**（导入者在调用时说明它来自哪一种，[S-11](#s-11-importhosthooks) ①）：

| 来源产品 | 来源 | 典型位置 | 工作区来源 |
|---|---|---|---|
| `claude_code` | `user` | `~/.claude/settings.json` | 否 |
| `claude_code` | `project` | `.claude/settings.json` | **是** |
| `claude_code` | `local` | `.claude/settings.local.json` | **是** |
| `claude_code` | `managed` | 托管策略设置 | 否 |
| `codex` | `user` | `~/.codex/hooks.json`、`~/.codex/config.toml` 的 hooks 表 | 否 |
| `codex` | `project` | `<仓库>/.codex/hooks.json`、`<仓库>/.codex/config.toml` 的 hooks 表 | **是** |
| `codex` | `managed` | 托管配置 | 否 |

- **不收的来源**：Claude Code 插件的 `hooks/hooks.json`、技能与子代理 frontmatter 里的 hook——它们的作用范围（插件启用时、技能被调之后、子代理运行时）在本项目里没有对应的持有方式；给了即 `invalidInput`。
- **来源由导入者声明，本操作不核实**：一份 `project` 配置被说成 `user`，工作区来源的保护（[S-9](#s-9-工作区来源的-hook导入即禁用)）就被绕开。**本版不核实**：导入来源由导入者声明、资产治理照收（主线裁定，见 [D-040 §S15 S15-f](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s15loop-extension-runner--hooks-import报回的)）——这是写明的已知边界，不是遗漏。
- **配置文档的结构**：两家都是「事件 → matcher 组 → handler」三层（CC 文档 doc:237-241）。**Codex 两种文件里 hooks 那一段的逐字结构研究包没有记下**，本契约按与 CC 同构读（[G-5](#十一已知缺口)）。

### S-6 一条 command 一件兼容件

**来源产品配置里的每一个 `command` 类 handler，导入成恰一件兼容件**（主线裁定 G5）。

- **一个 matcher 组里的几条 handler 是几件**，不折成一件。它们在来源产品里并行跑、按优先级折叠；搬进来之后是**逐件顺序求值**（[PF-012 三种形态](../../../../product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半)），次序见 [S-15](#s-15-报告里的次序)。
- **同一条 handler 在同一份配置里出现两次**（来源产品会合并去重）：本契约不合并，导入成两件、各自报告。去重是装配或落地那一侧的选择。
- **`command` 以外的 handler 类型不导入**（[S-14](#s-14-不导入的理由)）：`http` 要一个本项目没有登记的出站面，`mcp_tool` 要一个已连上的 MCP 服务器，`prompt`／`agent` 要在拓展件里发起模型调用——三者都不在 G6 裁定的「子进程在会话级执行环境里跑」之内。

### S-7 能力标识怎样导出

**一件兼容件的能力标识是 `{ category: loop_extension, name }`，`name` 由下式唯一导出**（主线裁定 G10）：

```text
name = "hooks." + host + "." + pathDigest + "." + event + "." + g + "." + h
```

| 分量 | 取值 |
|---|---|
| `host` | `claude_code` 或 `codex` |
| `pathDigest` | 导入者给出的**配置文件路径串**（[S-11](#s-11-importhosthooks) ①）按 UTF-8 编码后的 SHA-256，**64 位小写十六进制** |
| `event` | 来源产品事件名，原样（如 `PreToolUse`） |
| `g` | 这条 handler 所在的 matcher 组在该事件数组里的序号，**从 1 起**，十进制无前导零 |
| `h` | 这条 handler 在该组 `hooks` 数组里的序号，**从 1 起**，十进制无前导零 |

- **满足能力标识名的词法**（`data.asset-model/v1#S-2`）：没有空白、没有冒号；也不含斜杠（路径只以摘要出现）。
- **同一路径串、同一事件、同一序号 ⇒ 同一个 name**：重新导入同一份配置，得到的是**同一件资产的新版本**，不是新资产。
- **路径串逐码点比较**：`./.claude/settings.json` 与 `.claude/settings.json` 是两个不同的路径串，导出两个不同的 name。**路径怎样规范化，本契约不定**——同一份配置被用两种写法导入，会成为两件资产（[G-6](#十一已知缺口)）。
- **序号跟着配置走**：在配置里插入或删掉一条 handler，其后各条的序号就变了——**原来的第 3 条成了第 2 条，它将作为「第 2 条」那件资产的新版本出现**。这是「序号导出」的直接代价（S-35 记下它；路径规范化见 [G-6](#十一已知缺口)）。
- **源配置的哈希只作留痕**（[S-10](#s-10-兼容件要带的东西)），不参与 name，也不做任何信任判定。

### S-8 干预力：声明与上限

1. **每个来源产品事件有一个干预力上限**：它的输出最多要求到哪一档，逐事件写在映射表的「上限」列（[S-23](#s-23-claude-code-映射表)、[S-24](#s-24-codex-映射表)），按 [PF-002 的定档表](../../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension)：否决或阻断 → 可否决；改写输入、追加上下文 → 可改写；其余 → 只观察。
2. **导入产出的声明，`power` 等于这条 handler 所属事件的上限**（主线裁定 G1：由安装者在声明里定，上限为事件的输出上限）。
   安装者可以在落地之前把它**往低改**；**任何一件兼容件的声明 `power` 高于它的事件上限，都不是合法的兼容件声明**——这条由落地那一侧拒收（[G-7](#十一已知缺口)）。各层照常收窄。
3. **不按 hook 脚本「实际会输出什么」定档**：一条 `PreToolUse` 的 command 可能只打日志，但 shell 命令不声明输出，本契约不猜；定档就是事件上限，想要更低由安装者改。
4. **越档输出按报错处置**（[S-22](#s-22-越档的输出)）。

### S-9 工作区来源的 hook：导入即禁用

**来源是工作区的（Claude Code `project`／`local`、Codex `project`，[S-5](#s-5-来源产品方言版本与配置来源)），导入出的每一件都带「须禁用、须由租户层显式启用」的要求**（主线裁定 G7；产品正文已写成[「仓库带来的命令型 hook 默认不启用，由持有工作区的租户逐件打开」](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)）：

- **落地时，这件资产在租户层那一格的 `disabled` 配为真**（`data.asset-model/v1#S-15`）；启用 ＝ 租户层自己把那一格改回假。
- **这一格必须在租户层**：禁用按析取合成、真不可被更具体的格撤销（[PF-002](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)）。若把「真」配在组织层，租户就再也开不回来；若配在会话层，它就只管一个会话。**落在哪一格由落地那一侧兑现**（[G-8](#十一已知缺口)）。
- **理由**：[能力可以从项目里来，权力不行](../../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)——一条来自仓库的 command 即使定档只观察，它的子进程照样执行任意命令（提案交接缺口 G7）。只观察档管住了它对日志的权力，管不住它对执行环境的权力；**让一个有资格的人看过再开**，是本版唯一的保守读法。
- 报告里这样的每一条都带降级说明 `requires_tenant_enablement`（[S-13](#s-13-降级说明)）。

### S-10 兼容件要带的东西

**一件兼容件被调到时要能完成 [S-16](#s-16-情形筛选)～[S-21](#s-21-ask-与回放)，所以它的资产必须带着下列内容**（本契约定内容，不定表示）：

| 内容 | 来自 |
|---|---|
| 声明：`name`、`position`、`dimension`（按映射表）、`power`（[S-8](#s-8-干预力声明与上限)）、**`unavailability: skip`**（显式写出，见下）；不带 `onError`（按干预力取默认）、不带 `needs` | 映射表；不可用处置见下 |
| `implementation = { kind: command, host, dialect, event, command, matcher?, timeout? }`（`data.loop-extension/v1#S-8`）：`command` 是来源产品 handler 条目里的命令原样，`timeout` 缺席即那一家那一事件的默认，`matcher` 原样、缺席即全匹配，`dialect` 是钉住的方言版本（[S-5](#s-5-来源产品方言版本与配置来源)） | 配置 ＋ 本契约钉的版本 |
| **导出时的情形**：该事件映射到这个位置时的情形筛选（如 `producer = user`、`outcome = success`、「压缩刚发生」）——**不另存**：由 `(host, dialect, event)` 查本契约的映射表得出（[S-16](#s-16-情形筛选)） | 映射表 |
| 留痕：来源（来源产品、来源种类、路径串）、源配置的 SHA-256 | 导入输入 |

- **导入的兼容件不可用时一律跳过**：它们是租户挂上的拓展件，[拓展件不可用处置](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-extension-unavailability-policy--拓展件不可用处置--extension-unavailability-policy)取租户件的缺省 `skip`（[PF-012 可插拔的服务](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略)；主线裁定，[D-040 §五](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) K47）。
  **导入产出的声明显式写 `unavailability: skip`、不靠缺席**，报告里每一件兼容件都看得见这一项；与「可否决档挂了就拦」（`fails_closed_on_error`，报错那一侧）**不是一回事**：程序不存在、执行环境落不了位时（[S-19](#s-19-起不来与报错)），那道闸这一次就没了，唯一的兜底是那条可见的不可用记录。
  **它是注册时的声明**（[PF-002 不可用处置是这一件自己的声明](../../../../product/PF-002-assets-settings-and-permissions/design.md#不可用处置是这一件自己的声明)）：安装者要「不在就不许跑」，在落地之前把它改为 `veto`——只对求得可否决档、站在「之前」位置的那几件生效（`data.loop-extension/v1#S-6`）；本操作不替他选。
- **兼容件的载荷有了家**：`data.loop-extension/v1#S-8` 的 `command` 一支，`data.asset-model` 的 `loop_extension` 壳 `$ref` 它（主线裁定，见 [D-040 §S15 S15-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s15loop-extension-runner--hooks-import报回的)）。来源产品 handler 条目里被本契约忽略的成员（如 `statusMessage`）**不带**。
- **留痕还没有家**：来源与源配置摘要不在拓展件声明里，也不在资产记录的成员里（[G-1](#十一已知缺口)）；兼容件照样跑得起来，只是「这件是从哪份配置导入的」要靠导入报告回答。
- **没有 matcher 就是全匹配**；不存在「matcher 缺失所以不跑」。

---

## 三、导入

### S-11 importHostHooks

`importHostHooks(host, config) → ImportReport`，`config = { document, path, scope }`

| # | 内容 |
|---|---|
| ① | `host ∈ { claude_code, codex }`；`config.document`：来源产品配置文件的全文；`config.path`：导入者给出的这份文件的路径串（非空，用于 [S-7](#s-7-能力标识怎样导出)）；`config.scope`：[S-5](#s-5-来源产品方言版本与配置来源) 表里该来源产品的一种来源。**四项都是必带、没有默认值**（`data.identity-values/v1#S-17`） |
| ② | **无授权前置**：本操作不读任何存储、不写任何东西，只做翻译；谁能调用它、谁能把结果落成资产，归落地那一侧 |
| ③ | 无 |
| ④ | **无提交**。它是纯函数：同一份输入，逐字节同一份报告 |
| ⑤ | `ImportReport`：**配置里每一条 handler 恰一项**，`imported`、`degraded`、`skipped` 之一（[S-12](#s-12-导入报告)） |
| ⑥ | `invalidInput`（**唯一的失败值**），在下列任一情形：`host` 不是两家之一；`scope` 不是该来源产品的一种来源或是不收的来源；`path` 为空；`document` 按该来源产品的格式解析不出来，或 hooks 那一段不是三层结构；**任何一个 matcher 在该来源产品方言下不合法**（正则写坏了）——**整份配置导入失败，不导入其余各条**（D-033 采纳的「非法 matcher 让整份配置导入失败」） |
| ⑦ | 纯函数，天然可重复；**重复导入同一份配置得到同样的 name**（[S-7](#s-7-能力标识怎样导出)） |
| ⑧ | 缺任一输入即 `invalidInput`；**不从文件名猜来源、不从文档猜来源产品** |
| ⑨ | 不发 |

- **为什么非法 matcher 让整份失败，而不是只跳过那一条**：一条写坏的 matcher 多半是一道闸写坏了；跳过它、其余照导，导入者拿到的是「大部分成功」，**那道闸静默没了**——正是研究记下的来源产品那条警告「a mistyped path leaves the gate silently disabled」的同形。整份失败逼他先修好。
- **表示层拒绝不是判定**：`invalidInput` 只说「这份输入不合形状」，**不说**其中哪些 hook 可以导入（`data.identity-values/v1#S-33`）。失败的说明应点到出问题的事件与组序号。

### S-12 导入报告

**`ImportReport` 是逐条的列表**；每一项都指得出它来自哪一条来源产品 handler（事件名、组序号 `g`、handler 序号 `h`），并且恰是下面三种之一：

| 项 | 含义 | 带什么 |
|---|---|---|
| `imported { asset }` | **这一条导入了，而且与来源产品语义没有已知差异** | 那件兼容件（[S-10](#s-10-兼容件要带的东西) 的全部内容） |
| `degraded { note }` | **这一条导入了，但与来源产品语义有差异**，差异逐条列出 | **那件兼容件**，以及一条或多条降级说明（[S-13](#s-13-降级说明)） |
| `skipped { reason }` | **这一条没有导入** | 理由（[S-14](#s-14-不导入的理由)）；`non_loop_event` 时另带它归哪个 PF |

- **一条都不许丢**：配置里的每一条 handler 在报告里恰出现一次（P-1）。来源产品不认识的成员、本项目不支持的 handler 类型，都以 `skipped` 出现，**不是不出现**。
- **`degraded` 带着资产**：降级的那一条是**导入了的**，不带资产就无从落地（主线裁定，见 [D-040 §S15 S15-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s15loop-extension-runner--hooks-import报回的)）。
- **`imported` 与 `degraded` 带的兼容件，声明里都显式带 `unavailability: skip`**（[S-10](#s-10-兼容件要带的东西)）：导入者从报告就看得出「它不在时这一关没了」。
- **一条 handler 能否导入、导入后有哪些差异，全部在导入时判定**：凡是只有运行时才知道的（这一次 hook 交回了 `defer`），不进报告，按 [S-20](#s-20-输出怎样译回) 处置；它们的**可能性**以降级说明写进报告（例如 `defer_not_supported`）。

### S-13 降级说明

**降级说明是闭合的一组**；一条 `degraded` 可以带多条。**下列十四个 token 由本契约命名**（D-040 S15-a 采纳；与 `capability.loop-extension-runner` 的报错处置、`data.loop-extension` 的结论逐项核过，一致）：

| 说明 | 什么时候带 | 差在哪 |
|---|---|---|
| `fails_closed_on_error` | 干预力上限为可否决、且导入后仍是可否决的每一条 | 来源产品对超时、崩溃、非零非 2 退出**放行**；这里按报错处置，可否决档默认当否决（[S-19](#s-19-起不来与报错)） |
| `allow_as_no_opinion` | 来源产品的「允许」能跳过权限确认的事件（CC `PreToolUse`、两家 `PermissionRequest`） | `allow` 只译成无意见，**放行判断照样要过**（[PF-002](../../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension)） |
| `ask_uses_admission_options` | CC `PreToolUse` | 来源产品的 `ask` 弹它自己的权限框；这里落一张四档卡，**那四档不带任何授权**（[S-21](#s-21-ask-与回放)） |
| `defer_not_supported` | CC `PreToolUse` | `defer` 按报错处置（主线裁定 G2） |
| `asset_changing_output_ignored` | CC `PermissionRequest` | `updatedPermissions`、改权限模式的输出被忽略（主线裁定 G3） |
| `runs_on_every_matching_call` | 两家 `PermissionRequest` | 来源产品只在「即将问人」时调它；这里放行判断在链末、它在放行判断之前，**只能对每一次匹配的调用都调** |
| `nonzero_exit_json_not_read` | Claude Code 的每一条 | CC 在所有退出码上都读 JSON；这里非零非 2 退出就是报错（主线裁定 G4） |
| `single_output_per_pass` | 来源产品一次输出能同时带几样东西的事件（改写 ＋ 上下文、否决 ＋ 上下文） | 一次只取优先级最高的一样（[S-20](#s-20-输出怎样译回)），其余不生效 |
| `block_reason_not_recorded` | 映射到 `before_persist_message` 的 | 来源产品给的拒绝理由可能引用了被拦的原文，**不写进日志**，换成一句固定的话 |
| `no_host_continuation_cap` | CC `Stop` | CC 连续 8 次后强制结束；这里没有这个上限，只靠循环守卫（主线裁定 G8） |
| `broader_trigger` | CC `StopFailure` | CC 只在 API 错误结束时调；这里每一次以「失败」落终态都调 |
| `stop_as_cancelled` | 带 `continue: false` 而被译成停止的事件 | 来源产品没说是完成、失败还是取消；这里一律译成「被取消」（提案 P6） |
| `partial_matcher_imported` | 一个 matcher 组同时匹配 loop 情形与非 loop 情形（CC／Codex `SessionStart` 的 `compact` 与其余来源） | 只导入 loop 那一部分，其余不导入 |
| `requires_tenant_enablement` | 工作区来源的每一条 | 导入即禁用，须租户层显式启用（[S-9](#s-9-工作区来源的-hook导入即禁用)） |

**没有「其他」**：一处新的差异要进报告，先在这里加一行（本契约的新版本）。

### S-14 不导入的理由

**`skipped.reason` 恰三种**：

| 理由 | 什么时候 | 例子 |
|---|---|---|
| `non_loop_event` | 事件不是 loop 的状态点，**另带它归哪个 PF**（主线裁定 G9：「未导入，归 PF-0xx」） | 映射表「非 loop」各行 |
| `no_mapping` | 事件或 handler 在本项目里没有对应：<br>① handler 类型不是 `command`；② 异步 handler（`async: true`）——它控制不了任何东西，而本项目没有「不等结论」的拓展件；③ 带 `if` 条件——本版不求值它（[G-9](#十一已知缺口)）；④ matcher 要比对的那个值本项目取不到，且 matcher 不是全匹配（映射表「情形取值」列）；⑤ 事件在映射表里标为「无对应」；⑥ 方言版本不认识的事件名 | `type: "prompt"`；`PreCompact` 的 matcher `manual`；`PermissionDenied` |
| `defer` | 保留。**本版导入不会产出它**：`defer` 是 hook 在运行时交回的东西，导入时看不出一条 hook 会不会交回它；运行时交回即按报错处置（[S-20](#s-20-输出怎样译回)） | —— |

- **`no_mapping` 的六种来路要在那一项里说清是哪一种**——对导入者，「handler 类型不支持」与「条件没法求值」的补救完全不同。
- **`defer` 这一格留而不用**：主线裁定 G2 写了「defer 不导入、报告列未导入」，而导入时判定不了；这个值照 G2 的字面留着、本版从不产出，删不删由主线定（报给主线）。

### S-15 报告里的次序

- **报告按配置里的次序排**：事件按在文档里出现的次序，事件内按组序号，组内按 handler 序号。
- **同一位置的几件兼容件，装配清单里的相对次序 ＝ 它们在报告里的相对次序**（主线裁定 G5：同事件多条按配置顺序 ＝ 装配清单顺序）。**这是交给装配的义务**；本契约兑现不了它（[G-10](#十一已知缺口)）。
- **不同配置之间、兼容件与原生件之间谁先谁后**，本契约不定——来源产品里它们并行，没有次序可以继承。
- **放行判断仍在 `before_action` 链末**（`capability.loop-extension-runner/v1#S-6`）：导入的 `PreToolUse`、`PermissionRequest` 件一律排在它之前。

---

## 四、兼容件被调到时

**这一节不是一个服务操作**：它规定一件兼容件被 runner 调到、交回一条结论的过程，runner 看它与原生件没有区别（`data.loop-extension/v1#S-8`）。

### S-16 情形筛选

1. **先筛情形，再决定跑不跑**：这一次经过不满足映射表给这一事件定的情形（例如 `UserPromptSubmit` 只对 `producer = user`）、或 matcher 不匹配，**交回 `observed`，不起子进程**。
2. **matcher 按那一家的方言求值**：Claude Code——`*`、空串或缺席全匹配；只含字母、数字、`_`、`-`、空格、`,`、`|` 时按「精确串或精确串的列表」；否则按**不锚定**的 JavaScript 正则（CC 文档 doc:287-301）。Codex——一律正则（Codex 文档 doc:405）；`UserPromptSubmit`、`Stop`、`Interrupt` 不读 matcher。
3. **matcher 比对的值**从这一次的输入取，逐事件写在映射表「情形取值」列（工具名取 `subject.call.tool`；`after_action` 上从日志取那次调用的工具名）。
4. **这个值此刻取不到**（例如日志读不到）：**不当作匹配，也不当作不匹配**——这一次按报错处置（`capability.loop-extension-runner/v1#S-12`）。导入时就知道取不到的，那一条根本不导入（[S-14](#s-14-不导入的理由) ④）。

### S-17 输入怎样译成来源产品的原生输入

1. **按那一家那一事件的原生输入造**：公共字段与事件字段，逐项从这一次的输入与日志取（工具名、`tool_input`＝`subject.call.arguments`、`tool_use_id`＝`CallId`、`prompt` 取 `subject.message` 的文本……）。
2. **取不到的字段不造**：本项目没有来源产品的 transcript 文件，`transcript_path` 不给；没有「权限模式」这个值，`permission_mode` 不给；
   **统一输入里没有会话标识**（`data.loop-extension/v1#S-11` 的成员里没有它，日志句柄与执行环境句柄都不交出它），`session_id` 不给；租户标识同样不给——执行环境句柄解析得出的租户身份只用来取执行环境、起子进程（[S-18](#s-18-子进程在哪跑钱记在哪)），**不造成来源产品输入里的字段**（主线裁定：统一输入不加会话标识，见 [D-040 §六 L9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；原 G-14 闭合）。**宁可让 hook 因为缺字段报错，也不给它一个编出来的值**——也不经一条没有声明的通道去取。
3. **`stop_hook_active` 从日志数**（提案 P10、[PF-012 §6.7](../../../../product/PF-012-agent-loop-and-run/design.md#67-检测状态从日志派生不另存)）：这一运行里**上一次 `before_terminal` 经过以否决收场**时为真，否则为假。**不另存计数**，崩溃后重算得到同一个值。

### S-18 子进程在哪跑，钱记在哪

- **子进程在这一次会话的执行环境里跑，经 `capability.execution-environments/v1#S-13` 的 `startProcess` 起**。主线裁定 G6 要的是会话级沙箱（[PF-005 §6.3](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#63-会话级沙箱到点销毁数据不留存)）；**本版那份接口契约只有宿主机一种落点**，拓展件子进程只在「拓展件子进程的宿主机允许」（无词条）在场时落宿主机（那份契约 [S-6](../../execution-environments/v1/contract.md#s-6-落点判断本版只有宿主机) 末段）。**那一项产品还没给**（那份契约 G-3，产品问题账本 ⑭，[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑧）——**闭合之前每一件兼容件都「起不来」**（fail-closed，与 N-26 一致）。
  **不回退**（提案 P8）：落不了位不换别的落点，没有那一项允许不落宿主机；落不了位就是「起不来」（[S-19](#s-19-起不来与报错)），[不降级](../../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级)。
- **那个执行环境从这一次统一输入的执行环境句柄取**（`environment`，`data.loop-extension/v1#S-41`；读面 `capability.loop-extension-runner/v1#S-50`；主线裁定，见 [D-040 §八 M38](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：解析得到恰两样——会话持有的租户与执行环境引用（runner S-50 第 1 条）；**不经别的通道**——兼容件拿不到会话标识，也不需要它。
  **句柄在起子进程之前就解析不出执行环境，与落不了位同一处置：起不来**（S-19 第一行；runner S-50 第 4 条「还没开始就取不到的是起不来」）；不拿别的会话的执行环境、不回退宿主机。
- **起子进程的四件事**（主线已接受，[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩）：
  1. **带租户**：`startProcess`、`processOutcome`、`stopProcessGroup` 都带句柄解析出的那个租户与执行环境引用（那份契约 S-13～S-15 ①）；这个租户不造成来源产品输入里的字段（[S-17](#s-17-输入怎样译成来源产品的原生输入) 第 2 条）。
  2. **把解释器写成 `program`**：来源产品把一条 command 交给命令解释器执行（Claude Code 在 macOS 与 Linux 上是 `sh -c`，[CC 文档 doc:472](../../../../../research/loop-extension-hooks-compat/sources/claude-code-hooks-2026-09-23.txt)；Codex 按与 CC 同构读，[G-5](#十一已知缺口)）；那份接口契约不经解释器、不做插值（S-13 ③），所以 **`program` 是那个解释器，`arguments` 恰是它「执行下一个参数」的开关加 command 原文这一个参数**——原文不拆、不改、不预先展开变量，展开留给解释器，与来源产品一致。
  3. **交全环境变量**：子进程只看得到交去的 `launch.environment`，不继承据点进程的任何变量（那份契约 S-13 ③）。交去的恰是：据点进程环境里**名字在白名单上**的那几个变量（具名参数 `hookEnvAllowlist`，值未定，[G-15](#十一已知缺口)；解释器要靠其中的程序搜索路径找到）。**来源产品给 hook 导出的变量，本项目给不出的不造**（CC 的 `CLAUDE_PROJECT_DIR`、`CLAUDE_PLUGIN_ROOT`、`CLAUDE_PLUGIN_DATA`，CC 文档 doc:497），与 [S-17](#s-17-输入怎样译成来源产品的原生输入) 第 2 条同一口径；用到它们的 command 因展开成空而失败，按 [S-19](#s-19-起不来与报错) 处置。`launch.workingDirectory` 那份契约要求必带，**本版没有来路**（[G-15](#十一已知缺口)）——交不出它就不起，是「起不来」。
  4. **拿到结果之后停组**：`processOutcome` 交回之后，对这个进程组调 `stopProcessGroup`——起的那个进程已经结束，停的是它留下的子孙。**停组的答复不改这一次的结论**：结论只从起的那个进程的结果译出（[S-19](#s-19-起不来与报错)、[S-20](#s-20-输出怎样译回)）；答 `notConfirmed` 的组由执行环境接着停（那份契约 [S-15](../../execution-environments/v1/contract.md#s-15-stopprocessgroup) 末条）。**到 `timeout` 那一支不同**：先停组，按报错收场（P-11）；`notConfirmed` 时说明写「已请求停止、未确认退出」，不当成停下了。
- **时间上界**取 handler 的 `timeout`；缺席即那一家那一事件的默认（CC：`command` 600 秒，`UserPromptSubmit` 30 秒，doc:430；Codex：600 秒，doc:182-184）。**这是来源产品的出厂值，照搬以保语义；不是本契约另定的政策值。**
- **资源算进它插手的那个运行**（[PF-012 挂件自己花的钱](../../../../product/PF-012-agent-loop-and-run/design.md#挂件自己花的钱算它插手的那个-run)）；`before_persist_message` 上没有运行可记——那一处记在哪、账上怎样有「拓展件」这一种条目，本版没有答案（[G-2](#十一已知缺口)）。

### S-19 起不来与报错

**一次来源产品 hook 的结果，恰归进下面一行**（主线裁定 G4；分界照 `capability.loop-extension-runner/v1#S-12`「起不来只能在开始之前说」）：

| 情形 | 归哪一类 |
|---|---|
| **起子进程在开始之前就被拒**：`startProcess` 答 `noLanding`（没有那一项允许）、`unavailable`（那一项读不到）、`startFailed{ programNotFound }`（解释器找不到）、`startFailed{ launchRefused }`、`referenceNotValid` 或 `environmentsWithdrawn`（`capability.execution-environments/v1#S-13` ⑥）；执行环境句柄在起子进程之前解析不出执行环境；交不出工作目录（[S-18](#s-18-子进程在哪跑钱记在哪)） | **不可用**：按它声明的不可用处置——**导入产出的声明恒为 `skip`**（[S-10](#s-10-兼容件要带的东西)；运行时读的是落地时的声明，不是导入那一刻的），这一次这个位置没有它，记录带 `unavailability: skip`，**看得见**（`capability.loop-extension-runner/v1#S-12`）；安装者在落地前改成 `veto` 的，按否决处置 |
| 退出码 0，输出合这一家这一事件的形状 | 按 [S-20](#s-20-输出怎样译回) 译出结论 |
| 退出码 2 | 按映射表「退出码 2」列译（Claude Code 按它的逐事件表，doc:876-914；Codex 要求 stderr 非空） |
| 退出码非 0 非 2（**含 command 指向的脚本不存在**：解释器已经起来，以 127 一类的码退出，CC 文档 doc:861）；超时；输出不合形状（坏 JSON、这一事件不认的决定值、Codex 的保留字段）；起来之后执行环境被撤下（`processOutcome` 答 `environmentsWithdrawn`） | **报错**：按报错处置策略（可否决档默认当否决） |

- **与来源产品方向相反，而且是有意的**：两家对多数事件是「挂了就放行」；这里可否决档挂了就拦（提案 P4）。每一条这样的件都带 `fails_closed_on_error`，导入时明示。
- **「程序不存在」要在它开始之前判出**，本版它只指**解释器**（[S-18](#s-18-子进程在哪跑钱记在哪) 第 3 条第 2 项）：解释器起来之后才发现 command 里的脚本或子程序找不到，那是它开始之后的失败，**是报错**（2026-09-25 修订波随「解释器写成 `program`」收窄）。判不出是哪一种时，**按报错**——那是不让一道闸静默消失的一边。

### S-20 输出怎样译回

**一次 hook 交回一条结论。**来源产品一次输出里有几样东西时，**按下面的优先级取第一个成立的**，其余不生效（这正是 `single_output_per_pass` 要明示的）：

| 优先 | 来源产品输出 | 译成 | 前提 |
|---|---|---|---|
| 1 | `continue: false` | 映射表「停止」列：多数是 `stop { cancelled, reason }`（提案 P6，`stop_as_cancelled`）；在 `before_terminal`、`after_terminal` 上是 `observed`（运行本来就在收束）；个别事件另有规定 | 位置允许 `stop`（`data.loop-extension/v1#S-21`） |
| 2 | 退出码 2，或事件的阻断决定（`deny`、`decision: block`、`permissionDecision: deny`……） | 映射表「阻断」列：多数是 `veto { reason }`；`after_*` 上按表 | —— |
| 3 | `ask`（仅 CC `PreToolUse`） | `ask`（[S-21](#s-21-ask-与回放)） | —— |
| 4 | `defer`（CC `PreToolUse`） | **报错** | 主线裁定 G2 |
| 5 | 改写（`updatedInput`、`updatedToolOutput`、Codex `PostToolUse` 的替换结果） | `rewrite`：只改那一位置「还没落盘的那一样」（`data.loop-extension/v1#S-23`） | —— |
| 6 | 上下文（`additionalContext`、CC 与 Codex 在个别事件上的纯文本 stdout） | `inject`：一条 `SystemReminderMessage`，`source.kind = extension`、`source.extension` = 本件的 name（`data.messages/v1#S-26`），正文是那段文字 | —— |
| 7 | `allow`、无决定、空输出 | `observed` | **没有放宽** |

- **一处例外：`ask` 带着改写**（CC `PreToolUse` 同时交回 `ask` 与 `updatedInput`）——改写**不作废**，它跟着 `ask` 走：放进卡片草稿的 `proposedRewrite`（[S-21](#s-21-ask-与回放) 第 1 条），**在答复允许之后生效**。人签的是改写后的那一份，执行的也是那一份。其余几样同时出现时照上表只取一样。
- **映射表逐事件的规定优先于上表**：某一事件在 [S-23](#s-23-claude-code-映射表)、[S-24](#s-24-codex-映射表) 里另写了译法的，照那一格，不照这里的通用次序。**CC `Stop` 的 `additionalContext` 译成 `veto`**（CC 里它让对话继续，与阻断同义）：它在第 2 行的位置上，`reason` 取那段 `additionalContext` 的文字；同时带 `decision: block` 时取 `reason`，两者都有时取 `decision: block` 的 `reason`。
- **`reason` 取来源产品给的理由**（`permissionDecisionReason`、`reason`、`stopReason`、退出码 2 时的 stderr）；**在 `before_persist_message` 上一律换成固定的一句「被导入的 hook 拒绝」**——来源产品的理由可能引用被拦的原文（`data.loop-extension/v1#S-25`，`block_reason_not_recorded`）。
- **改资产的输出**（CC `PermissionRequest` 的 `updatedPermissions`、改权限模式）：**不生效，译成 `observed`**（主线裁定 G3），导入时已明示（`asset_changing_output_ignored`）。
- **`systemMessage`、`suppressOutput`、`terminalSequence`、`sessionTitle` 等只给人看或只改来源产品界面的输出**：不生效。它们不改日志，本项目没有承接它们的面。
- **兼容件从不替人作答**：来源产品允许 hook 代填 AskUserQuestion、MCP 表单——那两类事件本来就不导入（[S-23](#s-23-claude-code-映射表)）。

### S-21 ask 与回放

1. **CC `PreToolUse` 交回 `ask`** ⇒ 结论 `ask`，卡片草稿（主线裁定 G2）：
   - `explanation` ＝ hook 给的理由；若同时带了改写后的参数，说明里写的是**改写后的那一份**（人签的与执行的是同一份）；
   - `options` ＝ **放行判断那四档定死的选项**，`id` 与 `label` 照 `capability.tool-admission/v1#S-15` 原样，兼容件替来源产品写上；
   - `about` ＝ `{ position: before_action, callId }`；
   - **`proposedRewrite` ＝ `{ arguments: 改写后的参数 }`**——仅当这次 hook 同时交回了改写（`updatedInput`）时带，缺席即没有改写（`data.loop-extension/v1#S-28`）。**这是改写在日志里唯一的结构化落点**，不从说明文字里解析。
2. **这张卡的答复不带任何授权**（`capability.tool-admission/v1#S-28`）：答「将来本租户所有会话，这类情况全允许」不写任何权限值、不落任何授权表达；**它只意味着这一件不再拦**。它**不作为答复交给放行判断**——放行判断照样要过、照样可能再出它自己的卡（`capability.loop-extension-runner/v1#S-28`、`#S-29` 第 8 条）。人可能在同一个动作上看到两张选项同名的卡：[PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) 已写明它借四档的样子而不带授权含义、样式上与系统拦下来的分得开（样式归呈现那一侧），导入时以 `ask_uses_admission_options` 明示。
3. **答完之后回放这一件**（`capability.loop-extension-runner/v1#S-28`）：**不再起子进程**（提案 P10），从日志读它自己的 `ask` 记录与答复，直接交回最终结论：
   - 答了三个「允许」之一 ⇒ 草稿带 `proposedRewrite` 就交回 `rewrite`（`subject.call.arguments` ＝ `proposedRewrite.arguments`，其余成员照输入），否则 `observed`；
   - 答了「不允许」、明确不答、或写了一句话而没有点选项 ⇒ `veto`，`reason` 写「人没有在卡片上允许」。**兼容件不解读自由作答**；这三种在这里同一处置，所以答复的表示分不分得开它们（`data.messages` 的 G-5）不挡这一条。
   - **那次 hook 的原始输出必须能从日志重建**：`ask` 记录里的草稿带着说明与 `proposedRewrite`，足以交回上面的结论；**不需要、也不允许**再跑一遍来源产品的 hook 去问它当时说了什么，也不另存一份。
4. **Codex 的 `ask` 不受支持**（来源产品把它当 hook 失败）⇒ 这里是报错（[S-19](#s-19-起不来与报错)）。
5. **回放与新的一次尝试都不重跑已有结论的兼容件**：它的结论在日志里（`capability.loop-extension-runner/v1#S-28` 第 2 条）；来源产品 hook 的副作用只发生过一次。

### S-22 越档的输出

**兼容件的结论先按它求得的干预力过合法组合表**（`data.loop-extension/v1#S-20`）：一件被收窄成只观察的 `PreToolUse` 件交回退出码 2，它译出的 `veto` 不合法 ⇒ **这一次按报错处置，策略取它那一档的默认**——只观察档即 `ignore`，落 `observed`，`error` 恰为 `output_not_allowed_for_power`，**看得见**（主线裁定 G1：越档输出 ＝ 报错，按该档默认策略办）。
**这条由 runner 执行**（`capability.loop-extension-runner/v1#S-13`、`#S-14`）；本条只说明：兼容件照实译出来源产品的意思，**不自己降档**。

---

## 五、方言映射表

**列的含义**：「位置（维度）」与「情形」决定这件兼容件挂在哪、这一次跑不跑；「情形取值」是 matcher 比对的值；「上限」是 [S-8](#s-8-干预力声明与上限) 的干预力上限；
「阻断」「停止」是 [S-20](#s-20-输出怎样译回) 第 2、1 行在这一事件上的译法；「来源」指研究包里给出这一行事实的位置。**非 loop 的行只写归属。**
所有 loop 行的「上限」为可否决的，导入时一并带 `fails_closed_on_error`（CC 各行另带 `nonzero_exit_json_not_read`），下表不再逐行重复。

### S-23 Claude Code 映射表

**钉住 `2.1.280`**。来源缩写：「报告§一」＝[研究报告 §一](../../../../../research/loop-extension-hooks-compat/reports/2026-09-23-hooks-to-positions.md#一claude-code-2128033-个事件逐项)；「§五」＝[§五 Claude Code 表](../../../../../research/loop-extension-hooks-compat/reports/2026-09-23-hooks-to-positions.md#claude-code)；「doc:n」＝[官方页快照](../../../../../research/loop-extension-hooks-compat/sources/claude-code-hooks-2026-09-23.txt)行号。

| 事件 | 位置（维度） | 情形 · 情形取值 | 上限 | 阻断（含退出码 2） | 停止（`continue: false`） | 其余输出 | 报告里另带 | 来源 |
|---|---|---|---|---|---|---|---|---|
| `UserPromptSubmit` | `before_persist_message` | `producer = user` · 不读 matcher | 可否决 | `veto`，固定理由 | `veto`，固定理由（这一位置没有 `stop`） | `additionalContext`／纯文本 stdout → `inject`；**不能改写 prompt** | `block_reason_not_recorded`、`single_output_per_pass` | 报告§一；§五；doc:876-914 |
| `PreToolUse` | `before_action` | 情形无 · 工具名 `subject.call.tool` | 可否决 | `permissionDecision: deny` 或退出码 2 → `veto` | `stop { cancelled }` | `ask` → [S-21](#s-21-ask-与回放)；`defer` → 报错；`updatedInput` → `rewrite`；`additionalContext` → `inject`；`allow` → `observed` | `allow_as_no_opinion`、`ask_uses_admission_options`、`defer_not_supported`、`single_output_per_pass` | 报告§一；§五；§七；doc:1808-1889 |
| `PermissionRequest` | `before_action` | 情形无 · 工具名 | 可否决 | `decision.behavior: deny` → `veto`（理由取 `message`）；**退出码 2 不起作用 → `observed`** | `stop { cancelled }`；`deny` 且 `interrupt: true` 同 | `allow` → `observed`，带 `updatedInput` 则 `rewrite`；`updatedPermissions`／改模式 → 不生效 | `allow_as_no_opinion`、`runs_on_every_matching_call`、`asset_changing_output_ignored` | 报告§一；§五；doc:1891-1989 |
| `PostToolUse` | `after_action`（`each`） | `outcome` 为成功 · 工具名，从日志取那次调用 | 可改写 | 这一位置没有否决：`decision: block` 的 `reason` → `inject`；退出码 2 的 stderr → `inject` | `stop { cancelled }` → **越档**（可改写档不许 `stop`），按报错处置 | `updatedToolOutput` → `rewrite`（改 `result`）；`additionalContext` → `inject` | `single_output_per_pass` | 报告§一；§五；doc:876-914 |
| `PostToolUseFailure` | `after_action`（`each`） | `outcome` 为失败 · 工具名，从日志取 | 可改写 | 退出码 2 的 stderr → `inject` | 同上，越档 | `additionalContext` → `inject` | —— | 报告§一；§五；doc:876-914 |
| `PostToolBatch` | `after_action`（`batch`） | 情形无 · 不读 matcher | 可否决 | `decision: block`、退出码 2 → `stop { cancelled }` | `stop { cancelled }` | `additionalContext` → `inject` | `stop_as_cancelled` | 报告§一；§五；§七 |
| `Stop` | `before_terminal` | `proposed.state = completed`（CC 对用户中断与 API 错误不调） · 不读 matcher | 可否决 | `decision: block`、退出码 2 → `veto`，理由交给 agent；**`additionalContext` 同样译成 `veto`**（CC 里它也让对话继续） | `observed` | `stop_hook_active` 从日志数（[S-17](#s-17-输入怎样译成来源产品的原生输入)） | `no_host_continuation_cap` | 报告§一；§五；CC 笔记§五 |
| `StopFailure` | `after_terminal` | `terminal.state = failed` · matcher（错误类型）**取不到**：非全匹配即不导入 | 只观察 | 输出与退出码一律忽略 → `observed` | `observed` | —— | `broader_trigger` | 报告§一；§五 |
| `PreCompact` | `before_compaction` | 情形无 · matcher（`manual`／`auto`）**取不到**：非全匹配即不导入 | 可否决 | `decision: block`、退出码 2 → `veto` | `stop { cancelled }` | —— | —— | 报告§一；§五；doc:876-914 |
| `PostCompact` | `after_compaction` | 情形无 · matcher **取不到**：非全匹配即不导入 | 只观察 | 退出码 2 只给用户看 → `observed` | 越档，按报错处置 | —— | —— | 报告§一；§五 |
| `SessionStart`，matcher 匹配 `compact` 的部分 | `after_compaction` | 「压缩刚发生」 · matcher 按字面 `compact` 在导入时求值 | 可改写 | 这一事件不能阻断；退出码 2 只给用户看 → `observed` | 越档，按报错处置 | `additionalContext`／纯文本 stdout → `inject`；会话级副作用（环境文件、监视路径、标题）不生效 | 同时匹配别的来源时 `partial_matcher_imported` | 报告§一；§五 |
| `SessionStart`，其余来源 | **非 loop**：PF-015 | | | | | | | 报告§六 |
| `UserPromptExpansion` | **无对应**：`before_persist_message` 上取不到「这是一次命令展开」与命令名 | | | | | | | 报告§五（归属另见 PF-006） |
| `PermissionDenied` | **无对应**：放行判断在 `before_action` 链末，它之后这一位置没有件 | | | | | | | 报告§五 |
| `InstructionsLoaded` | **非 loop**：PF-010（组装是纯派生，推不出位置） | | | | | | | 报告§五、§六 |
| `Setup` | **非 loop**：PF-004 | | | | | | | 报告§六 |
| `SessionEnd` | **非 loop**：PF-015 | | | | | | | 报告§六 |
| `SubagentStart`、`SubagentStop` | **非 loop**：PF-007（父侧视角；子运行自己的 loop 另有装配） | | | | | | | 报告§六 |
| `Notification` | **非 loop**：PF-008 | | | | | | | 报告§六 |
| `MessageDisplay` | **非 loop**：PF-016 | | | | | | | 报告§六 |
| `TaskCreated`、`TaskCompleted` | **非 loop**：PF-006（工具私有状态） | | | | | | | 报告§六 |
| `TeammateIdle` | **非 loop**：PF-006（本项目没有「团队成员」对象） | | | | | | | 报告§六 |
| `ConfigChange`、`CwdChanged`、`DirectoryAdded`、`FileChanged` | **非 loop**：PF-002（设置与资产）、PF-005（执行环境） | | | | | | | 报告§六 |
| `WorktreeCreate`、`WorktreeRemove` | **非 loop**：PF-005 | | | | | | | 报告§六 |
| `PreModelSwitch`、`PostModelSwitch` | **非 loop**：PF-013（会话级设置变更，不是逐请求换模型） | | | | | | | 报告§六 |
| `Elicitation`、`ElicitationResult` | **非 loop**：PF-006（工具执行内部的等待）；它们的输出是替人作答，本项目不允许 | | | | | | | 报告§六、§八 |

**33 个事件全部在表里**（`SessionStart` 按 matcher 拆两行）。「非 loop」各行 `skipped { reason: non_loop_event }` 带表中的 PF；「无对应」各行 `skipped { reason: no_mapping }`。

### S-24 Codex 映射表

**钉住 `5c5308fc`**。来源缩写：「报告§二」＝[研究报告 §二](../../../../../research/loop-extension-hooks-compat/reports/2026-09-23-hooks-to-positions.md#二codex-5c5308f12-个事件逐项)；「§五」＝[§五 Codex 表](../../../../../research/loop-extension-hooks-compat/reports/2026-09-23-hooks-to-positions.md#codex)；「笔记§三」＝[Codex 笔记 §三](../../../../../research/loop-extension-hooks-compat/notes/codex.md)。
**Codex 只在退出码 0 时解析 JSON**；退出码 2 要求 stderr 非空，否则按报错。

| 事件 | 位置（维度） | 情形 · 情形取值 | 上限 | 阻断（含退出码 2 ＋ stderr） | 停止（`continue: false`） | 其余输出 | 报告里另带 | 来源 |
|---|---|---|---|---|---|---|---|---|
| `UserPromptSubmit` | `before_persist_message` | `producer = user` · 不读 matcher | 可否决 | `decision: block`、退出码 2 → `veto`，固定理由 | `veto`，固定理由 | `additionalContext`／纯文本 stdout → `inject` | `block_reason_not_recorded`、`single_output_per_pass` | 报告§二；§五 |
| `PreToolUse` | `before_action` | 情形无 · 工具名（含别名 `Edit`／`Write` 对 `apply_patch`） | 可否决 | `permissionDecision: deny`、`decision: block`、退出码 2 → `veto` | **来源产品不支持 → 报错** | `allow` ＋ `updatedInput` → `rewrite`；**单独 `allow`、`ask` 来源产品判为 hook 失败 → 报错**；`additionalContext` → `inject` | `single_output_per_pass` | 报告§二；笔记§三 |
| `PermissionRequest` | `before_action` | 情形无 · 工具名 | 可否决 | `decision.behavior: deny`、退出码 2 → `veto` | —— | `allow` → `observed`；保留字段（`updatedInput`、`updatedPermissions`、`interrupt`）来源产品判为无效 → 报错 | `allow_as_no_opinion`、`runs_on_every_matching_call` | 报告§二；笔记§三 |
| `PostToolUse` | `after_action`（`each`） | 成败都调 · 工具名，从日志取 | 可改写 | `decision: block`、退出码 2 → **`rewrite`：结果换成一块文字为那段反馈的结果块**，`callId` 与 `outcome` 不变 | 同左（来源产品也是用反馈替换结果） | `additionalContext` → `inject` | `single_output_per_pass` | 报告§二；笔记§三 |
| `Stop` | `before_terminal` | `proposed.state = completed` · 不读 matcher | 可否决 | `decision: block`、退出码 2 → `veto`，理由交给 agent（来源产品是生成一条续跑的用户提示） | `observed`（来源产品里它优先于续跑，即收束） | `stop_hook_active` 从日志数 | —— | 报告§二；§五 |
| `PreCompact` | `before_compaction` | 情形无 · matcher **取不到**：非全匹配即不导入 | 可否决 | —— | **`veto`**（来源产品：在压缩前停住） | —— | —— | 报告§二；§五；§七 |
| `PostCompact` | `after_compaction` | 情形无 · matcher **取不到**：非全匹配即不导入 | 可否决 | —— | `stop { cancelled }` | —— | `stop_as_cancelled` | 报告§二；§五 |
| `SessionStart`，matcher 匹配 `compact` 的部分 | `after_compaction` | 「压缩刚发生」 · matcher 按字面 `compact` 在导入时求值 | 可否决 | —— | `stop { cancelled }`（来源产品：结束这一轮、不再发模型请求） | `additionalContext`／纯文本 stdout → `inject` | `stop_as_cancelled`；同时匹配别的来源时 `partial_matcher_imported` | 报告§二；§五 |
| `SessionStart`，其余来源 | **非 loop**：PF-015 | | | | | | | 报告§六 |
| `Interrupt` | `after_terminal` | `terminal.state = cancelled` · 不读 matcher | 只观察 | 输出只能是 `systemMessage` → `observed` | `observed` | —— | —— | 报告§二；§五 |
| `SessionEnd` | **非 loop**：PF-015 | | | | | | | 报告§六 |
| `SubagentStart`、`SubagentStop` | **非 loop**：PF-007 | | | | | | | 报告§六 |

**12 个事件全部在表里**。legacy `notify`（`AfterAgent`）不是 hooks 配置里的条目，**不在导入范围内**；配置里即使有，也不出现在报告里——它不是一条 hook handler。

---

## 六、事件

### S-25 本契约不开事件

导入是一次纯翻译，不通知任何人；兼容件被调到时的一切都经 runner 落成结论。**不发任何事件，也不从任何事件里取判定。**

---

## 七、性质与前提

### 不变量与安全性质

| # | 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|---|
| P-1 | **配置里的每一条 handler 在报告里恰出现一次**；没有一条被静默丢掉 | [S-12](#s-12-导入报告) | —— | 提案 P1 |
| P-2 | **同一份输入得出同一份报告；同一路径、事件、序号导出同一个 name** | [S-11](#s-11-importhosthooks) ④、[S-7](#s-7-能力标识怎样导出) | 路径串逐码点相同 | 主线裁定 G10 |
| P-3 | **来源产品的「允许」从不成为放行**：一律 `observed`，放行判断照样要过 | [S-20](#s-20-输出怎样译回) 第 7 行、[S-21](#s-21-ask-与回放) 第 2 条 | 放行判断钉在链末（runner） | [PF-012 没有放宽](../../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档) |
| P-4 | **兼容件卡片上的「允许」不产生任何授权**，也不交给放行判断 | [S-21](#s-21-ask-与回放) | runner 回放只把自己那张卡的答复交给一件（runner S-28） | `capability.tool-admission/v1#S-28` |
| P-5 | **导入出的声明，`power` 不高于事件上限** | [S-8](#s-8-干预力声明与上限) | 落地一侧拒收越限的声明（[G-7](#十一已知缺口)） | 主线裁定 G1 |
| P-6 | **工作区来源的兼容件不经租户层显式启用就不跑** | [S-9](#s-9-工作区来源的-hook导入即禁用) | 落地把「真」配在租户层那一格（[G-8](#十一已知缺口)）；来源声明属实（本版不核实，写明的边界，[S-5](#s-5-来源产品方言版本与配置来源)） | 主线裁定 G7 |
| P-7 | **可否决档的来源产品 hook 挂了不放行** | [S-19](#s-19-起不来与报错) | runner 按策略处置 | 提案 P4 |
| P-8 | **回放与新的一次尝试不重跑来源产品的 hook** | [S-21](#s-21-ask-与回放) 第 3、5 条 | `ask` 记录里的草稿（含 `proposedRewrite`）足以交回最终结论 | 提案 P10 |
| P-13 | **人在卡片上签的与执行的是同一份参数**：`ask` 带改写时，答复允许之后交回的 `rewrite` 恰是草稿里的 `proposedRewrite` | [S-20](#s-20-输出怎样译回) 例外、[S-21](#s-21-ask-与回放) 第 1、3 条 | `data.loop-extension/v1#S-28` 带 `proposedRewrite` | [PF-012 改参数](../../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数) |
| P-14 | **导入件的不可用处置在报告里看得见**，不靠缺席隐含 | [S-10](#s-10-兼容件要带的东西)、[S-12](#s-12-导入报告) | —— | [PF-012 可插拔的服务](../../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略) |
| P-9 | **`before_persist_message` 上不把来源产品的拒绝理由写进日志** | [S-20](#s-20-输出怎样译回) | —— | `data.loop-extension/v1#S-25` |
| P-10 | **输入里没有编出来的字段** | [S-17](#s-17-输入怎样译成来源产品的原生输入) 第 2 条 | —— | [PF-012 §6.9](../../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用) |

### 进展性质

| # | 性质 | 上界 | 前提 |
|---|---|---|---|
| P-11 | 一次兼容件的求值在 `timeout` 之内交回结论或按报错收场 | handler 的 `timeout` 或来源产品默认 | 执行环境能按时停下子进程 |
| P-12 | `ask` 答完之后，下一次尝试里那一件交回最终结论，**不再等** | 下一次尝试 | 日志可读 |

---

## 八、装配给与协议给

### S-26 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：右列是已记下的待兑现项。

| 保证 | 单机由谁给（装配给） | 跨进程之后协议须兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **子进程落在这一会话的执行环境里，没有显式允许不落宿主机**（[S-18](#s-18-子进程在哪跑钱记在哪)） | 兼容件经执行环境句柄取得这一会话的执行环境：runner 按这一次经过所在的会话造句柄，装配把句柄解析的来路接好（`capability.loop-extension-runner/v1#S-50`）；起子进程与落点判断在 `capability.execution-environments` v1 的同一次在场里（S-6 末段、S-13） | 执行环境在远端时，**句柄的解析与起子进程的请求都必须携带会话与租户身份并在接收边界重新验证**；落不了位或解析不出即「起不来」 | 一个租户的 hook 在另一个租户的执行环境里跑，或没有那一项允许就落到宿主机 |
| **运行被取消时子进程确实停下**（[S-27](#s-27-缺席撤下与重新导入)） | 停止信号随 runner 的叫停在同一进程里送到兼容件，兼容件经 `capability.execution-environments/v1#S-15` 按进程组停、有界答复 | 停止信号跨进程送到执行环境；**没确认停下就不算停下**，但那一次求值照样不留记录（运行已被取消） | 运行已被取消而 hook 还在跑、继续写文件；或把停下当成一次报错落了一条 `veto` |
| **超时后子进程确实停下**（P-11） | 同一台机器上经 `capability.execution-environments/v1#S-15` 按进程组停、有界答复 | 远端停止要有确认；**没确认就不算停下**，结果按报错记 | 超时之后 hook 还在跑，继续写文件，而结论已经按报错处置了 |
| **回放不重跑**（P-8） | 同一本日志 | 兼容件的实现换了进程，照样只读日志 | 一次人答完之后来源产品脚本又跑一遍，副作用发生两次 |
| **导入是纯翻译**（[S-11](#s-11-importhosthooks)） | 纯计算 | **不变** | —— |

---

## 九、交接、缺席与恢复

### S-27 缺席、撤下与重新导入

| 发生了什么 | 之后 |
|---|---|
| **兼容件的实现不在场**（本契约的提供者没装） | 每一件兼容件都「不可用」：按声明的不可用处置（导入产出的是 `unavailability: skip`），这一次这个位置没有它，看得见（`capability.loop-extension-runner/v1#S-12`）。**不是放行**——可否决的兼容件不在，那道闸这一次就没了，唯一的兜底是那条不可用记录；安装者改成 `veto` 的那几件按否决处置 |
| **执行环境落不了位** | 同上，那一件不可用（[S-19](#s-19-起不来与报错)） |
| **来源产品配置变了，重新导入** | 同 name 的是同一件资产的新版本（[S-7](#s-7-能力标识怎样导出)）；新旧版本怎样切换、在途的那一次经过用哪一版，归资产与装配 |
| **钉住的方言版本升级** | 本契约出新版本；已导入的兼容件照旧按导入时的方言版本求值（它的留痕里有），**直到重新导入** |
| **一件兼容件在求值中途被撤下** | 那一次按报错记（`capability.loop-extension-runner/v1#S-34`）；已起的进程组由它撤下时停下（`capability.execution-environments/v1#S-15`），答 `notConfirmed` 的由执行环境接着停；执行环境自己撤除时，它起过的组由它停（那份契约 S-17） |
| **这个运行被取消，一件兼容件正在求值** | 它收到停止信号（随 runner 的叫停转来），对已起的进程组调 `stopProcessGroup`，答 `notConfirmed` 的由执行环境接着停；**那一次求值不留记录、兼容件不自造结论**——不译成 `veto`、也不按报错处置；那一次 `dispatch` 以 `cancelled` 收场（`capability.loop-extension-runner/v1#S-21` ⑥、`#S-34`；主线裁定，见 [D-040 §八 M39](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。它与上一行不同：撤下是这一件的实现没了，取消是整个运行不再继续 |

---

## 十、规范表达与验证义务

### S-28 本版不选用形式工件

| 性质 | 表达 | 理由 |
|---|---|---|
| 映射、降级说明、导入报告、输出优先级 | **本文的表**，由规范场景逐格演练 | 导入是纯函数，映射是有限的查表；再写一份模型只会重述同一张表 |
| 回放不重跑、从 `proposedRewrite` 重建改写 | 规范场景 | 恢复规则归 runner（它的行为模型已触发，`capability.loop-extension-runner/v1#S-35`）；本契约只多一条「从 `ask` 记录重建」，是逐值映射，**按构造，证据形式是场景**（S-33） |

条款到证据的映射、执行状态在[验证入口](../verification.md)，**不写进本版本目录**。

### 规范场景

#### S-29 一条都不丢

一份 Claude Code 配置：`PreToolUse` 一组两条 command、一条 `type: prompt`、一条带 `if` 的；`Notification` 一条；`PreCompact` matcher `auto` 一条；一个本版不认识的事件名。**必须观察到**：报告里恰七项，逐项指得出事件与序号；前两条 `degraded`，其余五条 `skipped` 且理由各自说清是哪一种来路。

#### S-30 写坏的 matcher 让整份失败

同一份配置里把一个 matcher 写成 `Bash(`。**必须观察到** `invalidInput`，**没有任何一项被导入**，失败说明点到那个事件与组序号。

#### S-31 允许不是放行

一条 `PreToolUse` 兼容件对每次调用都交回 `permissionDecision: allow`。**必须观察到**：它的结论是 `observed`；放行判断照常判，执行权限为「问一下」时照常出卡。

#### S-32 挂了就拦，看得见

一条可否决的 `PreToolUse` 兼容件（验收装配给出「拓展件子进程的宿主机允许」与白名单、工作目录）：① 让它超时；② 让它退出码 1；③ 让解释器不存在（程序搜索路径里找不到）。**必须观察到**：①② 记报错、落 `veto`、动作不执行；③ 记不可用、`unavailability: skip`、**动作照常走到放行判断**，不可用记录看得见。**再跑一支**：同一件在落地前把 `unavailability` 改为 `veto`，③ 那一支观察到按否决处置、动作不执行。
**再跑一支**：让执行环境句柄在起子进程之前解析不出执行环境（[S-18](#s-18-子进程在哪跑钱记在哪)）；另一次让「拓展件子进程的宿主机允许」不在——两次都观察到与 ③ 相同：记不可用、`unavailability: skip`，**子进程没有起，也没有落到宿主机或别的会话的执行环境里**。
**再跑一支**（2026-09-25 修订波）：解释器在、command 指向的脚本不存在——观察到**记报错**、落 `veto`（与 ① ② 同一处置），不是不可用：解释器已经起来了（[S-19](#s-19-起不来与报错)）。

#### S-33 来源产品的 ask，四档卡不带授权，回放不重跑

一条 `PreToolUse` 兼容件交回 `ask`。人答「将来本租户所有会话，这类情况全允许」。**必须观察到**：租户层没有任何权限值被写；放行判断照常判（可能再出它自己的卡）；那一件回放时**子进程没有再跑**（以子进程被调用的次数为准）；它的最终结论是 `observed`。
**再跑一支**：hook 同时交回 `ask` 与 `updatedInput`——观察到卡片草稿带 `proposedRewrite`、说明写的是改写后的参数；人答「这次允许」后，回放交回的 `rewrite` 的参数与 `proposedRewrite.arguments` 逐值相同，子进程仍只跑过一次；人答「不允许」则是 `veto`、改写不生效。

#### S-34 工作区来源导入即禁用

以 `scope = project` 导入一份配置。**必须观察到**：每一条导入了的（`imported`、`degraded`）都带 `requires_tenant_enablement`；按报告落地之后，在租户层把那一格改回假之前，这些兼容件在任何会话里都不被调到。

#### S-35 重新导入是新版本

同一路径串导入两次，第二次之前改了某条 command 的内容。**必须观察到**：两次的 name 一一相同；在配置开头插入一条 handler 之后再导入，**其后各条的 name 按新序号对上**（记录这个代价，不是要它不发生）。

#### S-36 Stop 的续跑状态从日志数

一条 `Stop` 兼容件对第一次收束交回 `decision: block`，对 `stop_hook_active` 为真的那一次交回无决定。在两次之间停机重启。**必须观察到**：第二次交给 hook 的 `stop_hook_active` 仍是真，运行照常收束。

---

## 十一、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | 阻断谁 | owner | 闭合条件 |
|---|---|---|---|---|
| **G-1** | **导入留痕没有家**（[S-10](#s-10-兼容件要带的东西)）：来源（来源产品、来源种类、路径串）与源配置的 SHA-256 不在 `data.loop-extension` 的声明里，也不在 `data.asset-model` 的资产记录里。**载荷本身已有家**（`data.loop-extension/v1#S-8` 的 `command` 一支，D-040 S15-b） | 重新导入时认出「是同一份配置」；审计 | 主线 → `data.asset-model`（资产记录的来源信息）或资产治理的落地写面 | 留痕有一个成员可放 |
| **G-2** | **拓展件的资源记在哪**：`data.call-accounts` 没有拓展件条目；`before_persist_message` 上没有运行可记（主线裁定 G6 的账形状缺口） | 账 | PF-012 ／ `data.call-accounts` 下一版 | 账上有拓展件条目，且写明没有运行时记在哪 |
| **G-3** | **已闭合**：四档卡与放行判断的卡同名——[PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同)（rev 6 起）写明搬来的 hook 出的卡借四档样子、不带授权含义、样式上分得开 | — | — | — |
| **G-4** | **已闭合**：导入来源由导入者声明、资产治理不核实（本版；D-040 S15-f）——写成已知边界 | — | — | — |
| **G-5** | **Codex 两种配置文件里 hooks 那一段的逐字结构**研究包没有记下；本契约按与 CC 同构读。**Codex 执行 command 用哪一个解释器**同样没有记下，[S-18](#s-18-子进程在哪跑钱记在哪) 第 3 条第 2 项按与 CC 同构读（macOS 与 Linux 上 `sh -c`；2026-09-25 修订波加） | Codex 导入的解析；Codex 兼容件起子进程 | 研究包下一轮（Codex 文档副本 doc:1-200 一带） | 研究记下结构；不同构则本契约出新版本 |
| **G-6** | **配置路径怎样规范化**（[S-7](#s-7-能力标识怎样导出)）：同一份配置用两种路径写法导入会成为两件资产 | 重新导入的身份稳定 | 主线（与资产治理） | 规定导入者给出的路径串形式（例如相对仓库根、或只取来源种类加文件名） |
| **G-7** | **落地一侧拒收越限声明**：兼容件声明的 `power` 高于事件上限时由谁拒 | P-5 | 资产治理 | 落地写面按本契约映射表核对上限 |
| **G-8** | **工作区来源的「禁用」落在租户层那一格**，由落地兑现 | P-6 | 资产治理 ＋ PF-002 owner | 落地写面写明；若导入者不在租户层有资格，给出收场 |
| **G-9** | **CC 的 `if` 条件本版不求值**，带它的 handler 一律不导入；求值要权限规则语法的精确语义（CC 自称「best-effort」） | 带 `if` 的 CC hook | 研究（权限规则语法）＋ 本契约下一版 | 研究记下语法语义，本契约出新版本求值它 |
| **G-10** | **同一份配置内的次序进装配清单**（[S-15](#s-15-报告里的次序)）；不同配置之间、兼容件与原生件之间的次序无人定 | 装配 | PF-004 的契约 | 装配写明落地时怎样保持报告里的相对次序 |
| **G-11** | **已闭合**：`capability.tool-admission` 登进 catalog | — | — | — |
| **G-12** | **已闭合（2026-09-24）**：G1–G11 的长期落点是 D-040 §D-033 推迟的 G1–G11；导入件不可用处置取 `skip`（[S-10](#s-10-兼容件要带的东西)）与 `ask` 带改写放进 `proposedRewrite`（[S-20](#s-20-输出怎样译回)、[S-21](#s-21-ask-与回放)）两条已汇编为 D-040 §五 K47、K32 | — | — | — |
| **G-13** | **已闭合**：映射按 PF-012 rev 7 作出，本契约 2026-09-24 按 rev 14 复核——rev 8～14 位置、维度、终态、转移表均未变（各版 changelog「十一个位置一个都没变」）；rev 8 起「否决只在『之前』有意义、执行动作之后不给否决」「消息落盘之前只能否决」与映射表各格一致 | — | — | — |
| **G-14** | **已闭合（修复波 1b，[D-040 §六 L9](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）**：确认不给 `session_id`——统一输入不加会话标识，`data.loop-extension` 不加成员；[S-17](#s-17-输入怎样译成来源产品的原生输入) 第 2 条照「取不到的字段不造」。与 `transcript_path`、`permission_mode` 同样处理，**不另加降级说明**（[S-13](#s-13-降级说明) 的一组不变；主线确认，见 [D-040 §六 N-12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）；用到它的 hook 因缺字段报错，按 [S-19](#s-19-起不来与报错) 处置 | — | — | — |
| **G-15** | **子进程的工作目录与白名单变量没有来路**（2026-09-25 修订波，随 [S-18](#s-18-子进程在哪跑钱记在哪) 第 3 条第 3 项）：`capability.execution-environments/v1#S-13` 要 `launch.workingDirectory` 必带、`launch.environment` 交全；统一输入与执行环境句柄都不给工作目录（来源产品在会话的当前目录里跑 hook，本项目的会话没有交出这一项），白名单 `hookEnvAllowlist` 的值未定。**闭合之前交不出工作目录的就不起——「起不来」**，不拿据点进程的当前目录顶上 | 每一件兼容件起子进程（叠在执行环境 G-3 之上的第二道阻断） | 主线（与 PF-005、PF-015 那一程；白名单与 `capability.mcp-bridge` 的 `stdioEnvAllowlist` 是否同一份也由主线定） | 写明工作目录从哪来（例如随执行环境引用给出），并给白名单定值 |

---

## 十二、消费者核对

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **导入者**（组织超管或租户） | 知道导进来了什么、哪些没进、导进来的与原来有什么不同 | [S-12](#s-12-导入报告)～[S-14](#s-14-不导入的理由) | 够 |
| **资产治理**（落地） | 每一件的能力标识、声明（含 `unavailability`）、载荷、「须禁用」要求、同名即新版本 | [S-7](#s-7-能力标识怎样导出)～[S-10](#s-10-兼容件要带的东西) | **留痕没有家**（G-1）；越限声明拒收与禁用落格（G-7、G-8） |
| **装配** | 同一位置几件的相对次序 | [S-15](#s-15-报告里的次序) | 够，义务在它（G-10） |
| **runner** | 兼容件与原生件一样：一次交回一条结论；起不来与报错分开；不可用时按声明处置；回放不重跑、改写从草稿重建 | [S-16](#s-16-情形筛选)～[S-22](#s-22-越档的输出) | 够（`session_id` 不给，主线已确认，原 G-14 闭合） |
| **放行判断** | 兼容件的卡的答复不交给它 | [S-21](#s-21-ask-与回放) 第 2 条 | 够 |
| **`apps/cli`**（[D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/decision.md#拆分领域名与装配g3) 不立 `apps/runtime-host`，[D-040 §八 M40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | 让兼容件的实现在场、接好执行环境句柄的解析来路 | [S-18](#s-18-子进程在哪跑钱记在哪)、[S-26](#s-26-装配给的保证-vs-协议须给的保证) 左列 | 够；执行环境由 `capability.execution-environments` v1 给（接口已定、真承接者未到：`capability.loop-extension-runner` v1 的 G-20、那份契约 G-1）。**「拓展件子进程的宿主机允许」产品还没给**（那份契约 G-3，账本 ⑭），工作目录没有来路（[G-15](#十一已知缺口)）——两件闭合之前每一件兼容件都「起不来」 |

---

## 十三、版本差异与规范工件

**本版是首版**，没有被采用的旧版本。**本版的规范工件**：本文件与 [`examples.md`](examples.md)。**不附 Schema、不建 `formal/`**（[S-28](#s-28-本版不选用形式工件)）。

**发布后**：本目录下的规范正文与实例不可原地覆盖；修改发布新版本。钉住的方言版本升级即出新版本。
**接受之前**，候选可以原地修订，每次修订记在[验证入口「变化的影响」](../verification.md#变化的影响)。
