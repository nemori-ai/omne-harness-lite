# 2026-09-23 当轮报告：三个参考源的工具定义形状

本页是首轮调查的完整论证与逐格理由，**按六个调查问题组织**。结论只有 [research.md](../research.md) 一个家；
本页保留「当时看了什么、怎么推的」，供追因与复核。记录编号见 [evidence.md](../evidence.md)。

调查对象：DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`），omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，
minimal-runtime `feat/minimal-runtime@d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`。全部为静态阅读，未运行任何测试。

---

## 问题一：三源的工具定义由哪些字段构成

### 字段清单

| 源 | 定义载体 | 字段 |
|---|---|---|
| **DSH** | `ToolDefinition extends ToolSchema`，进程内对象（D-1） | `name`、`description`、`parameters`（JSON Schema，受子集约束）、**`output{schema, render, presentationMeta?}` 必填**、**`execute(args, exec)` 必填**、`finalizeContent?`、`timeoutMs?`（只声明）、`isConcurrencySafe?(args)`、`presentCall?`、`presentResult?` |
| **omne-next** | LangChain `BaseTool` 子类实例（O-1）＋本项目自加的类级/实例级标记 | `name`、`description`、`args_schema`、`return_direct`、`response_format: content \| content_and_artifact`、`tags`、`metadata`、`extras`、`handle_tool_error`、`handle_validation_error`；`extras.defer_loading`、`extras.allowed_callers`（O-3）；类级 `detachability: ToolDetachability`（O-4）；类级 `progress_profile`（O-5）；多命令时另有 `dispatch_mode`、`tool_overview`、`skill_ref`、`visible_commands` 与命令注册表 `{description, synopsis, params_model, requires_help_ack, requires_skill_ack, skill_ref, bypasses_gates}`（O-2） |
| **minimal-runtime** | 数据：实现侧 `ToolContribution`＋`ToolCommandDefinition`；契约侧 `work-data` 的 `ToolDefinition`＋`Command`（M-1） | 工具级：`registrationId`、`tenantId`、`scope`、`definition{definition{ownerTenantId, definitionId}, version}`、`definitionKind: plugin\|skill`、`toolKey`、`description`、`commands`、`implementationArtifact`、`binding`、`providerId`、`providerProtocol`、`generation`；契约侧另有 `projection: single\|compact\|oneOf`。命令级：`description`、`inputSchema`、`outputSchema`、`authorization`、`effect: read\|write\|external`、`concurrency?`、`executionLimitMs`、`stop.capability`、`background`、`requiredSkills`、`environmentCapabilities`；契约侧另有 `foreground{limitMs?, onLimit}`、`media{inputs, outputs}`、`frames[]` |

### 对照 PF-006 §5.3 的七类

「身份 name / 参数 schema / 说明 / 返回形状 / 多命令结构 / 六项可选声明 / 可自带实现」逐类落格，见
[research.md 的对照表](../research.md#对照表pf-条款--三源) 第 1–19 行。补几处表里写不下的理由：

- **第 3 行 minimal-runtime「需改」**：参数 schema 只存在于命令内，而且贡献校验要求 `inputSchema` 必须是 object 根、
  `additionalProperties:false`（`host.ts:988-1010`）。PF-006 的单函数工具在这里必须写成「一条命令」，
  调用形状 `{alias, command, params}` 也因此总带一层 `command`（`host.ts:1587-1624`）。
- **第 5 行三源都「需改」，原因各不相同**：DSH 的输出声明强制过头——普通返回也要写 `output`；
  omne-next 的 `response_format` 与 §5.4 两种写法同构，缺的是定义里的返回形状；
  minimal-runtime 两样都要求声明，但没有「普通返回当字符串用」这条便道。
  **产品正文本身也没说「返回什么」要不要以 schema 声明**（见 research.md 张力表第 4 行），这一格的评分依赖那个空白怎么补。
- **第 10 行 minimal-runtime「可直接承载」**：命令级 `authorization` 与 [PF-007 §5.7「权限能关掉一条命令」](../../../design/product/PF-007-meta-capabilities/design.md#57-权限能关掉一条命令关不掉一扇门)（rev 16）同向，
  不与 PF-002「子命令随 tool 授权」冲突——命令不是独立资产，只是授权粒度可以细到命令。

### 三源有而产品正文没要求的

| 字段 | 在哪一源 | 它回答的问题 |
|---|---|---|
| 并发安全 `isConcurrencySafe` / `concurrency` | DSH（D-1）、minimal-runtime（M-1） | 同批调用能否重叠。PF-002 把「并发」列为 Tool 的**设置**（`133`），不是定义声明 |
| 超时 `timeoutMs` / `executionLimitMs` | DSH、minimal-runtime | PF-002 同样列为设置 |
| 停止能力 `stop.capability` | minimal-runtime | 能否协作停止或强制隔离；PF-006 §6.12 讲运行时可单独控制，没在定义里要求声明 |
| 效果分类 `effect: read/write/external` | minimal-runtime | 授权与审计用 |
| 命令级授权声明 `authorization` | minimal-runtime | 权限解析器与确认方式 |
| 呈现回调 `presentCall/presentResult`、`presentationMeta` | DSH | UI 卡片；本项目呈现归 PF-009 |
| `finalizeContent` | DSH | 最后一道内容改写 |
| 调用方授权 `allowed_callers` | omne-next（O-3） | 模型直调 vs 代码执行调；PF-006 没有这一维 |
| 读帮助门/读技能门 `requires_help_ack/requires_skill_ack/skill_ref` | omne-next（O-2） | 工具依赖技能；PF-002 的 Tool「能组合 Skill」（`134`）有关系，但门控本身没要求 |
| `requiredSkills` | minimal-runtime | 同上，以具体版本表达 |
| `redrive_basis` | omne-next（O-4） | 脱离后能否重驱 |
| `implementationArtifact/providerId/providerProtocol/binding/generation` | minimal-runtime | 实现绑定与换代 |
| `return_direct` | omne-next（LangChain） | 调完即结束循环 |

### 产品正文要求而三源没有的

外部服务声明、附件存储声明（连同「有工具读得出」），这两项三源全无定义级字段。
执行环境的「绑定在哪一层」这一维三源也都没有（minimal-runtime 只有设施名单）。
「替换件同形、只换说明」三源都没有（DSH 的 `lsp` 与 minimal-runtime 的 `unavailable` 是最近的形态）。
「用法走 `inspect`」三源都没有：DSH 无入口，另两源用 `help`。

---

## 问题二：「身份＝类别＋name、其余跟实现走、同名替换」有无反例

有，三源各一类：

1. **没有类别维度（DSH，D-2）。**工具与 MCP 动作共用一个命名空间；同层重名抛错
   `tool "x" is already registered`（`index.ts:716-721`）。PF-002 说「类别不同，名字撞了也不相干」，
   但在 DSH 里，名字相同但属不同类别的东西根本没有注册入口。
2. **来源编进名字（DSH MCP、omne-next toolset）。**`mcp__<server>__<raw>`（D-5）、`{toolset}__{name}`（O-6）。
   同一个动作换一个提供方就换了名字，靠名字做同名替代就接不上。DSH 在名字不合法时追加的哈希由 `(server, raw)` 派生，
   仍是身份哈希，**不是 schema 哈希**。
3. **标识退到实现（omne-next 配置合并，O-6）。**没配 `name` 时，合并标识依次取 `class_name`、`function`、`ref` 末段、对象 id
   （`presets.py:139-145`）。于是两份导出同名工具、`class_name` 不同的配置不会互相替代。
4. **身份含所有者租户与版本（minimal-runtime，M-1、M-3）。**`DefinitionRef{ownerTenantId, definitionId}`＋`version`；
   manifest 冻结 `Schema digest` 与 `generation`，调用只按原 manifest 解析。**Schema digest 是绑定钉，不是身份**，
   但它让「同名替换」不影响已下发 manifest 上的调用：新 manifest 取新代，旧 manifest 未准入的调用得 `stale_binding`。

检索范围：DSH `packages/core/tools/src/index.ts` 注册与视图、`mcp-client/src/tools.ts`；omne-next `toolset/base.py`、
`registry/{config,registry,presets}.py`；minimal-runtime `host.ts` 贡献与 manifest、`work-data`、`design.md:466-481`。
三源里都**没有**找到把参数 schema 的哈希直接当身份键的做法。

---

## 问题三：多命令工具在三源里怎么表示

| | DSH | omne-next | minimal-runtime |
|---|---|---|---|
| 抽象 | 无。`str_replace_editor`/`lsp` 各自在一张扁平 `properties` 里用枚举字段选命令；`terminal_*`、`job_*`、`session_*` 拆成多个顶层工具（D-4） | `BaseMultiCommandTool`：一个 `BaseTool`，`command` 路由到注册的处理器（O-2） | 贡献的 `commands` 表；manifest 一个工具一个 alias（M-1、M-2） |
| 槽位 | 扁平枚举一个；拆分的占 N 个 | 一个 | 一个 |
| 模型看到多少 | 全部参数（扁平并集） | `flat`：`{command, params}`，只露命令名；`typed_union`：每命令一个判别分支；`batch`：动作列表 | 契约：`single`（恰一条命令）/`compact`（`{command, params}`，缺省）/`oneOf`（每命令一分支，超预算回落 `compact`）；实现未派生投影 |
| 谁选 | 各工具作者自拼 | **作者按类选**（`dispatch_mode` 类变量） | 契约写作者可选，但**系统按 manifest 预算回落**（`schema.md:45`） |
| 取详细用法 | 无入口 | **内置 `help`**，且默认开启读帮助门：未带 `i_have_read_command_help=True` 回 `HOLD` | **`help` 为保留元命令** |
| 与 `Tools().inspect` | —— | 不对应：用法入口在工具内部 | 不对应：`design.md:105` 的 `discover/getDefinition/help` 是能力层读面，但工具内也保留 `help` |

与三条产品要求逐条比：

- **「整套命令只占一个槽位」**：omne-next、minimal-runtime 满足；DSH 只有扁平枚举那种写法满足，而且没有框架支撑。
- **「`inspect` 取详细用法」**：三源都没有。PTC 是另一回事——它把工具以 SDK 声明的形式写进 system prompt，不是按需取。
- **「不另配 `help`」**：omne-next 与 minimal-runtime 都反向；DSH 无关（它没有多命令）。
  值得一提的是 PF-007 rev 16 自己也写「每扇门都自带一个 `help`」（`design.md:120`），与 PF-006 冲突，见 research.md 张力表。

PTC 与 omne-next `programmatic_calling` 都不是多命令：前者是「让模型写程序调工具」的呈现传输（D-4），
后者是「哪类调用方可以调这个工具」的授权标记（O-3）。

---

## 问题四：六项可选声明与默认方向

| 声明 | DSH | omne-next | minimal-runtime |
|---|---|---|---|
| 外部服务 | 插件级 `inject`，缺即不注册（D-6） | 无 | 无 |
| 附件存储 | `read_image` 以挂载 `attachments` 为注册条件（D-6） | 无（`content_and_artifact` 只是返回通道） | 无（`media.outputs` 只报模态） |
| 执行环境 | 无；由装配的 `ctx.shell`/`ctx.fs` 决定，`bash` 说明文字写「may run under a file sandbox」 | 无；`SandboxToolMixin` 在实现里取沙箱 | `environmentCapabilities: string[]`，空即无要求 |
| 调用端模态 | 无 | 无 | 契约 `media.inputs`，实现拒收 |
| 结果端模态 | 执行期按路由模型检查，以错误返回 | 无 | 契约 `media.outputs`，实现拒收 |
| 可后台 / 自动转后台 | 调用参数 `run_in_background`＋插件配置；无阈值 | `ToolDetachability` 四级，`AUTO` 带阈值 | 契约 `background`＋`foreground.onLimit`；实现只收 `unsupported` |

默认方向，按「我需要什么（没说就是不需要）」与「我允许什么（没说就是不允许）」两类归：

| 源 | 「不声明＝不需要」 | 「不声明＝不许」 |
|---|---|---|
| DSH | 无定义级声明可比；`timeoutMs` 缺省即无截止 | `isConcurrencySafe` 缺省即独占（`index.ts:250-261`） |
| omne-next | —— | `detachability` 缺省 `never`（`detachability.py:399-416`）；`allowed_callers` 缺省只 `DIRECT`（`programmatic_calling.py:54`、`85-106`）；`progress_profile` 缺省发帧即丢（`progress.py`） |
| minimal-runtime | `environmentCapabilities` 空、`media` 缺省只文本 | `frames` 缺省无帧；`background` **必填**，没有隐式默认（`host.ts:1012`） |

omne-next 的后台默认方向与 PF-006 完全一致，而且它把理由写进了代码注释（「silence means always attached」）。
它把「不许」方向用在了帧上，这正与 PF-006 相反。

---

## 问题五：可自带实现（直到完整 package）的先例与装载方式

| 源 | 先例 | 装载 | 边界 |
|---|---|---|---|
| DSH | 定义对象带 `execute` 闭包；工具以 Cordis 插件 npm 包发行（D-8） | Cordis 装载器按部署配置加载预装包；`dsh-tool-cordis` 可让模型在 `node:vm` 里挂**进程内临时插件**并注册工具 | 临时插件不落盘、重启即失、无「保存/提升/安装」路径；作者自述「bash-equivalent trust, not a security boundary」；默认不在发行树 |
| omne-next | 工具即 Python 类 / `@tool` 函数（O-1） | `omne_agent_toolkits` 按 `module + class_name/factory/function/ref` 用 `importlib` 从同一环境导入（O-7） | 只能装环境里已经装好的代码；MCP v0.1 未实现 |
| minimal-runtime | 定义为数据，带 `implementationArtifact`、`providerId`、`providerProtocol`（M-3） | `load` 读可信发布物/制品，经准备—同门核对—发布三步装载 | 「不能下载用户任意 JS」；handler 不得是可绕门调用的裸 `execute`；不能共存的提供者返回 `busy` |

三源都没有「一份资产连同它的完整实现包，被持有、分享、在接收方装载」的先例。PF-002 说怎么装载是系统实现的事、
产品只定「允许自带」（`123`）——三源给出的是三种装载边界：预装、同环境导入、受信制品，没有一种覆盖「任意自带包」。

---

## 问题六：各源作为基线的短板与代价

### DSH

- **长处**：执行管线最完整、最成熟——参数校验、pre/guard/around/post/result 五段、取消与静止语义、并发调度都已写清；
  生成目录由 CI 校验新鲜（`verify-tool-catalog`）；MIT；TypeScript，与本项目主语言相同。
- **代价**：
  - 与 Cordis 耦合：`ToolRuntime extends Service`，依赖 `dsh-scope` 的层与 `schemastery`；peer 依赖九个 DSH 包（D-9）。
  - Cordis 版本：vendored `@deepseek-ai/cordis` 4.0.2，本项目 D-025 接受 4.0.4，差异未读。
  - 形状与本项目约束相反的几处：可见即可调（D-3）、缺依赖即不注册（D-6）、无类别命名空间（D-2）、定义是运行时对象（D-1）。
  - 上游漂移：同一 commit 内已见文档/代码不一致（D-8）；fork 后每次跟上游都要重核这几处。

### omne-next

- **长处**：声明词汇与本项目产品方向最贴近——后台四级与默认 `never`、多命令框架与作者自选投影、延迟加载标记；
  多份 ADR 已接受（ADR-126、ADR-128、ADR-C014）。
- **代价**：
  - 语言：Python。定义形状直接是 LangChain `BaseTool`＋Pydantic（`langchain-core 1.6.1`），注入靠 LangGraph `ToolRuntime`（`langgraph 1.2.11`）；翻译成 TS 是重建形状，不是改语法。
  - 标记挂在工具实例的 `extras` 上（O-3），与 PF-006「常驻标记在引用条目上」位置不同。
  - 帧声明先行、未声明即丢（O-5），与 PF-006 相反。
  - 读帮助门的协议 ADR-C013 仍是 Proposed。
  - 仓库根未找到 `LICENSE`。

### minimal-runtime

- **长处**：唯一已经把工具定义做成**数据**、按租户与版本建身份、按命令声明授权/效果/停止/设施/模态的一份；
  已准入调用钉在原实现闭包上，替换不改写在途调用。
- **代价**：
  - 不在 main、不是证据；设计引用的是已退役谱系的候选契约（`design.md:9-25`：索引 `candidate; acceptance:null`）。
  - 自述的未闭合项：Run/Inbound 的 record-only 片段以 `owner_publication_required` 失败闭合（`README.md:19-23`）；执行 owner 恢复与同批 Run/Inbound publication 仍是集成义务（`README.md:46-48`、`design.md:372-374`）；L/I/J 的 catalog/冻结/消费者采用仍是发布 gap（`design.md:22-25`、`484-487`）；应用 `start` 在下游缺端口时返回 `runtime_composition_ports_unavailable`（`apps/local-harness/design.md:16-21`）。
  - 「终态端口身份对不上」：README/design 里**没找到**这句原话。代码里，`inspectExecutionTerminal` 遇终态执行身份不一致时只记诊断 `tools.execution.terminal_identity_mismatch` 后返回、不结算（`host.ts:1299-1305`）；`checkTerminal` 同类不一致回 `stale/terminal_execution_mismatch`（`host.ts:2350-2354`）。
  - 契约与实现分叉：`work-data` 有 `media/frames/foreground/projection`，`host.ts` 贡献校验不收前三者，也没有派生 `projection`（M-1、M-2）。
  - 设计说用 Ajv 8.20.0 draft 2020-12 编译 Schema，贡献校验调用的却是 DSH 子集断言（M-4），参数实际走哪条本轮未追。
  - 依赖 `@deepseek-ai/cordis` 4.0.2 与八个 workspace 包；`host.ts` 3619 行，承载的远不止定义形状（准入、五维状态、恢复、换代）。

---

## 取证过程里被修正的判断

- 最初把 DSH 的 PTC 当作多命令的一种表示。读 `ptc.ts:1-7` 与 README 之后改正：PTC 是呈现传输，SDK 里每个工具仍是独立绑定。
- 最初以为 minimal-runtime 的多命令 `oneOf` 投影已实现。grep 全分支后确认实现里没有 `oneOf` 派生，`projection` 只在 `work-data` 类型与分支文档中。
- 最初把 omne-next `defer_loading` 归为「工具属性」。读 `omne_agent_toolkits` 注册表后补上：它由配置条目写入，最后落在工具实例上。所以「按引用条目配置」在配置层成立，在存放层不成立。
