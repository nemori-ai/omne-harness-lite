# 可复核的来源与观察

本页是三个参考源与本项目产品正文的取证记录。每条记录一个编号，[研究正文](research.md)与
[当轮报告](reports/2026-09-23-tool-definition-shape.md)按编号引用。行号均对下列精确修订成立；
上游换版本时 grep 本页的版本 token（`c291e796`、`6263fed545e4`、`d79484d`、`langchain-core 1.6.1`）找需要重核的记录。

## 取证条件总览

| 来源 | 精确对象与版本 | 取得方式 | 立场 | 本轮局限 |
|---|---|---|---|---|
| **DSH** | deepseek-ai/deepseek-harness `c291e7961a515f6d7af9304e7fd1d257929aef26`，`@deepseek-ai/dsh-root@0.1.5-rc.2`；`@deepseek-ai/dsh-tools@0.1.5-rc.2` | 主检出 `tmp/sources/dsh-c291e79.tar.gz`（SHA-256 `f08cfc86…0860`，见 `tmp/sources/SHA256SUMS`）解包于 `tmp/sources/extracted/dsh/`；静态阅读源码、生成文档与 `.agents/notes/` | 作者自述（源码、生成目录、作者决策笔记） | 未运行测试；未读 git 史；工具包只读了 `core/tools`、`mcp/mcp-client`、`fs/tool-fs` 与生成目录，未逐个读其余工具包源码 |
| **omne-next** | 本机克隆 `/data/qiwei/repos/omne-next`，HEAD `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；依赖锁 `uv.lock` 中 `langchain-core 1.6.1`、`langgraph 1.2.11` | 静态阅读 `omne_core_v1/.../agentic/tool/` 与 `omne_agent_toolkits/.../registry/`；**排除** `.claude/worktrees/` 下的副本；LangChain 字段读自该仓库 `.venv` 中已装的 `langchain_core-1.6.1` | 作者自述（本项目前身的源码与 ADR） | 未运行测试；本机克隆不是钉住的归档，路径会失效；未找到仓库根 `LICENSE` 文件 |
| **minimal-runtime** | 本仓库 `.worktrees/minimal-runtime`，分支 `feat/minimal-runtime`，HEAD `d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`；包 `@omne-harness-lite/tools@0.0.0`（private） | 静态阅读 `packages/tools/tools/` 与其依赖的 `packages/core/work-data/src/index.ts`、分支内 `docs/proposals/tool-execution/schema.md`、`apps/local-harness/` | 本项目自己的实验实现与其设计稿（**未进 main、不是证据、只作形状参考**；其设计链是已退役的旧谱系） | 未构建、未运行测试；分支内 `spec/`、`docs/proposals/` 属旧谱系，只作形状线索 |
| **产品正文** | HUB `.worktrees/assets-runtimes`：PF-006 rev 14、PF-002 rev 10、PF-007 rev 16；UL `execution-and-outcome.md`、`capabilities-and-composition.md` | 静态阅读 | 本项目已定稿产品正文 | 不改正文，只对照 |

`.meta_harness/research/legacy_backup/multi-command-tool-sources/` 只当线索用过一次（指向 omne-next 的 ADR-C013/C014 与测试文件名）；下列事实都已在上述修订上重新取证。

---

## P：本项目产品正文（对照基线）

### P-1 PF-006 rev 14 的工具定义条款

- 来源：`.meta_harness/design/product/PF-006-tools-and-skills/design.md`（rev 14，2026-09-22）
- 实际观察（行号）：
  - §5.2 定义连同自带实现都是「类别＋name」身份下的一份表示，平台/组织/租户各一份彼此替代：`design.md:340-356`（351）
  - §5.3 两种范式：`368-379`；多命令定义带多少归作者、系统不替选不折中：`384-393`；详细用法走 `Tools().inspect`、不给多命令工具配 `help`：`395-400`
  - §5.3 六项可选声明表：`402-411`；前五项「我不要」、最后一项「我不许」：`415-420`；前五项进同一串依赖清单：`424-428`
  - §5.3 不在定义里的三样（等待态、发帧、卸载）：`438-455`
  - §5.4 两种返回写法、`ToolResult` 三样、普通返回上报时转成 `ToolResult`：`457-485`
  - §4 三层正交（呈现方式、可用性都不改变动作空间）：`86-96`；常驻标记在引用条目上：`98-113`（104）；依赖用抽象名字、只有且只有必需：`125-161`；替换件同形只换说明：`176-192`
  - §6.3 不可用装同名替换件、动作空间不变：`578-618`（表在 `586-589`）
  - §6.4 依赖解析、存储项连同「有工具读得出」一起判：`620-657`（651）
  - §6.6 可声明能否后台与自动转后台阈值，「多久是它的一项设置」：`676-682`
  - §6.8 执行环境要求 = 绑定层 + 设施，满足不了不可用、绝不降级：`765-777`
  - §6.11 两端模态、结果端可被转换件满足：`850-881`；「换完之后动作空间可能变小」：`886`
  - §7 取舍表「不给多命令工具配自带的 `help`」：`956`
- 支持范围：本项目产品要求本身；不说明实现形状。

### P-2 PF-002 rev 10 的身份与 Tool/MCP

- 来源：`.meta_harness/design/product/PF-002-assets-settings-and-permissions/design.md`（rev 10，2026-09-22）
- 实际观察：身份是「类别＋name」、其余归实现或设置：`76-97`（78、84）；Tool 可自带实现直到完整 package、装不进运行时走替换件、产品只定允许自带：`113-123`；多命令整套只占一个槽位：`125-127`；身份表、子命令是内部结构、Tool 设置含「超时、并发、目标环境」：`129-134`（133）；MCP 身份是接入点 name、动作不是资产、与多命令同形：`136-153`（138、144、146）

### P-3 PF-007 rev 16 的多命令范式与 `Tools()`

- 来源：`.meta_harness/design/product/PF-007-meta-capabilities/design.md`（rev 16，2026-09-23）
- 实际观察：十三个 meta 全部是多命令工具：`107-117`；**「每扇门都自带一个 `help`」**：`120-123`；`Computer()` 外加 `help`：`233`、`625`、`641`；`Tools()` 的 `search/inspect/execute/read_result`：`415-449`
- 同源变更记录：`PF-007-meta-capabilities/changelog.md:809`「给所有门补了一条通用约定：每扇门都自带 help」；`PF-006-tools-and-skills/changelog.md:452-453`「不给多命令工具配自带的 help……有意偏离 legacy」

### P-4 统一语言词条

- `design/ubiquitous_language/terms/execution-and-outcome.md:24-45` UL-tool-definition：定义是「叫什么、收什么参数、返回什么，以及可选声明」，可自带实现直到完整 package；三样刻意不在定义里。
- `design/ubiquitous_language/terms/capabilities-and-composition.md:87-107` UL-tool：身份是这一类里的 name，多命令整套占一个槽位。

---

## D：DeepSeek Harness `c291e796`

路径前缀 `tmp/sources/extracted/dsh/`（相对主检出根）。

### D-1 工具定义字段

- 来源：`packages/core/tools/src/index.ts`；`packages/llm/llm/src/types.ts`；`packages/core/tools/src/schema.ts`
- 实际观察：
  - 模型可见的 `ToolSchema` 只有 `name / description / parameters`：`llm/llm/src/types.ts:411-416`
  - `ToolDefinition extends ToolSchema`，加：必填 `output {schema, render, presentationMeta?}`（`index.ts:204-212`）、必填 `execute(args, exec)`（`index.ts:226`）、可选 `finalizeContent`、`timeoutMs`（`247`，注释：只声明不强制，需另装 timeout policy 包）、`isConcurrencySafe`（`261`，缺省即独占）、`presentCall`、`presentResult`（`279`）：`index.ts:214-280`
  - `ToolResult` 只有 `content / isError / meta?`：`index.ts:283-296`
  - `schemaOf()` 只把 `name/description/parameters` 投影给模型：`index.ts:1246-1257`
  - `defineTool` 选项与上同构；`parameters` 是「隐式开放对象根」的逐属性表：`schema.ts:97-107`、`483-535`
  - 注册时 `output` 缺失即 `TypeError`：`index.ts:1027-1036`
  - JSON Schema 子集：`type/oneOf/properties/required/additionalProperties/items/enum/const` + 注解，不认识的关键字拒绝：`json-schema.ts:1-11`
  - 大结果溢出由独立的 spill 策略插件与可选 `ctx.spillStore` 处理，不是工具每次返回里的声明：`index.ts:169-181`（`tools/ptc-dispatch-log` 注释「the spill policy's preview + locator」）、`docs/tool-catalog.md:29`（fs-search 行）
  - `ToolRunContext` 只给工具体 `deferContext` 与 `concludeTurn` 两个原语，没有发帧或等待原语：`index.ts:397-420`；`presentCall/presentResult` 是对参数与结果的纯投影，供实时与回放渲染：`index.ts:262-279`
  - 已知局限原文：`timeoutMs` 只声明不强制；PTC 呈现按 agent 而非按工具；PTC 中间值不可由会话回放重建：`README.md:216-229`
- 立场：作者自述（源码）。
- 支持范围：dsh-tools 的定义形状；不代表各工具包实际如何使用。

### D-2 注册表按名字解析、单一命名空间、作用域遮蔽

- 实际观察：同一层同名重复注册抛错「already registered」：`index.ts:716-721`；`register()` 保留 `run_code`：`index.ts:1022-1052`（1044-1046）；视图解析时近层同名遮蔽远层（agent scope 链）、restriction 求交：`index.ts:1142-1182`；`get()` 对受限名字「reads as absent」：`index.ts:1184-1197`；测试 `tests/scoped.spec.ts:87`（scoped shadows global）、`106`；`tests/tools.spec.ts:1987`
- 支持范围：DSH 的身份键是注册名；没有「类别」维度；同名替代只发生在 agent scope 链上。

### D-3 可见即可调：受限与 PTC 塌缩

- 实际观察：`restrict` 掉的全局工具在该 scope 视图里不存在，调用走 `UNKNOWN_TOOL`：`index.ts:1184-1213`、`1314`；`mode: ptc` 下模型直调非 `run_code` 名字即 `UNKNOWN_TOOL`：`README.md:125`、`index.ts:1300-1315`；「presentation is per agent rather than per tool」：`README.md:227`；渐进披露/ToolSearch 的做法是「替换 scoped restrict，注册表保持呈现、查找与执行对齐」：`docs/cookbook/extension-cookbook.md:116`；作者笔记把工具 schema 并入 system-prompt 装配、过滤即装配改写：`.agents/notes/archived/architecture/2026-06-11-tool-schemas-in-prompt-assembly.md:14`
- 支持范围：DSH 的「不呈现」同时意味着「不可调用」（PTC 的 SDK 绑定例外，但按 agent 整体切换）。

### D-4 无多命令框架；同族动作拆成多个顶层工具或扁平枚举

- 来源：`docs/tool-catalog.md`（生成文件，`pnpm run verify-tool-catalog` 校验新鲜）
- 实际观察：`terminal_*` 六个顶层工具：`tool-catalog.md:30`；`job_*` 三个：`39`；`session_*` 五个：`36`；`str_replace_editor` 用 `command` 枚举 `view/create/str_replace/insert`，全部命令的参数并在同一张 `properties` 里、各命令的必填关系写在说明文字里：`605-640`；`lsp` 用 `operation` 枚举：`1244-1284`；PTC 的 `run_code` 是呈现传输，SDK 里每个可见工具仍是独立绑定：`packages/core/tools/src/ptc.ts:1-7`、`README.md:123-127`
- 支持范围：DSH 仓库内**没有**「命令表 + 每命令参数 + 共享帮助」这一层抽象；未找到 `help`/`inspect` 类取用法入口。

### D-5 MCP 工具逐个展平为顶层名字

- 来源：`packages/mcp/mcp-client/src/tools.ts`
- 实际观察：身份是 `(serverName, rawName)`，模型名 `mcp__<serverName>__<rawName>`，规范化或超 64 字符时追加身份的 SHA-256 前 12 位：`tools.ts:6-10`、`50-56`、`98-118`；每个 MCP 工具注册成一个 `ToolDefinition`：`163-173`；换代冲突则整批回滚为零个工具：`176-200`
- 支持范围：一个 MCP server 的 N 个动作占 N 个顶层名字；哈希是身份派生，不是 schema 哈希。

### D-6 依赖以 Cordis `inject` 表达，缺了就不注册；模态在执行体内检查

- 来源：`packages/fs/tool-fs/src/index.ts`、`read-image.ts`；`docs/tool-catalog.md`
- 实际观察：`read_image` 只在 `ctx.attachments` 挂载时注册（`ctx.inject(['attachments'], …)`）：`tool-fs/src/index.ts:53`、`67-72`；执行时按路由模型 `inputModalities` 是否含 `image` 抛错拒绝，schema 与路由无关：`read-image.ts:118-131`、`tool-catalog.md:28`；`lsp` 缺提供者时返回结构化 `LSP_UNAVAILABLE`、不改 schema：`tool-catalog.md:33`；生成目录的 `Requires` 列是插件级服务依赖：`tool-catalog.md:18-45`；`read-image.ts:206` 注释「the optional `attachments`/`llm` services」
- 支持范围：依赖挂在插件（Cordis fiber）上而非工具定义上；缺依赖的默认路径是「不装」，保持 schema 的做法由个别工具自行实现。

### D-7 后台由调用参数与插件配置决定

- 实际观察：`bash` 的 `run_in_background` 是 schema 里的调用参数，插件配置 `enableRunInBackground`（默认 true）关掉时整个参数消失：`tool-catalog.md:21`、`182-220`；全仓 grep `autoBackground|backgroundAfter|foregroundBudget|promoteToBackground` 无命中（`packages/**/*.ts`，排除测试）
- 支持范围：没有定义级「能否后台」声明，也没有「前台多久自动转后台」。

### D-8 自带实现：定义即进程内对象；临时插件不持久、非安全边界

- 实际观察：`execute` 是定义对象上的函数：`index.ts:216-226`；工具包是 Cordis 插件 npm 包（`packages/core/tools/package.json:1-5`、`43-53`）；`dsh-tool-cordis` 让模型在 `node:vm` 里挂进程内临时插件并注册工具，「exist only in process memory……do not survive restart」「bash-equivalent trust, not a security boundary」：`.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md:17`、`43`、`80`；默认不在任何发行树：`tool-catalog.md:24`
- 上游内部漂移：该笔记称三件工具 `cordis_inspect/cordis_mount/cordis_unmount`，同一 commit 的生成目录列 `cordis_define/cordis_inspect_list/…/cordis_undefine` 七件（`tool-catalog.md:24`）；`README.md:110` 称 `ToolDefinition` 在 `src/types.ts`，实际在 `src/index.ts:214`（`types.ts` 只含 PTC 事件，`types.ts:1-58`）。

### D-9 许可与耦合

- 实际观察：根 `LICENSE` 为 MIT（`LICENSE:1-3`）；Cordis 为 vendored `@deepseek-ai/cordis` `4.0.2`（`vendor/cordis/package.json:2-4`）；`dsh-tools` peer 依赖 `cordis`、`dsh-agent`、`dsh-code-runtime`、`dsh-invariants`、`dsh-llm`、`dsh-scope`、`dsh-session`、`dsh-system-prompt`、`dsh-user-approval` 九个包（`packages/core/tools/package.json:43-53`）；`ToolRuntime extends Service`、`static inject = ['systemPrompt']`（`index.ts:779-785`）
- 对照：本项目 D-025 接受 `@deepseek-ai/cordis` **4.0.4**，4.0.2→4.0.4 差异未读（`.meta_harness/design/record/decisions/cordis-adoption-version/decision.md:1-15`）。

---

## O：omne-next `6263fed545e4`

路径前缀 `/data/qiwei/repos/omne-next/`；`T = omne_core_v1/libs/omne_core_v1/omne_core_v1/agentic/tool`。

### O-1 定义形状即 LangChain `BaseTool`

- 实际观察：`T/base.py:25-32` 直接再导出 `langchain_core.tools` 的 `BaseTool/StructuredTool/tool`；`langchain_core 1.6.1` 的 `BaseTool` 字段：`name`、`description`、`args_schema`（Pydantic 或 JSON Schema dict）、`return_direct`、`tags`、`metadata`、`handle_tool_error`、`handle_validation_error`、`response_format: "content" | "content_and_artifact"`、`extras`（`.venv/lib/python3.12/site-packages/langchain_core/tools/base.py:474-555`）；`uv.lock:2635-2636`、`2769-2770` 钉 `langchain-core 1.6.1`、`langgraph 1.2.11`
- 支持范围：没有输出 schema 字段；`content_and_artifact` 是按返回区分的第二通道。

### O-2 多命令范式 `BaseMultiCommandTool`

- 来源：`T/patterns/multi_command.py`
- 实际观察：单个 `BaseTool` 以 `command` 路由 N 个处理器；`dispatch_mode` 三选一：`flat`（`{command, params}`，只露命令名）、`typed_union`（按每命令 `params_model` 合成判别联合，模型一次看到全部参数）、`batch`：`1-22`、`829-834`；`__init_subclass__` 自动注册 `help`：`858-882`；`register_command` 缺省 `requires_help_ack=True`，未带 `i_have_read_command_help=True` 就回 `HOLD`：`884-1008`（尤其 `893`、`955-960`）；保留门控键：`84`、`588-603`；重复注册同名命令抛 `ValueError`（`help` 除外）：`982-986`；按实例的 `visible_commands`：`817-823`
- 相关状态：`adrs/ADR-C014-multi-command-base-class-unification.md:3`「Accepted」；`adrs/ADR-C013-multi-command-gate-protocol.md:3`「Proposed」；测试 `omne_core_v1/tests/unit/agentic/tool/patterns/test_multi_command_flat.py:72`、`145`（本轮未运行）

### O-3 延迟加载与调用方授权是工具实例上的标记

- 实际观察：`deferred_loading` 标在工具实例 `extras["defer_loading"]`：`T/deferred_loading.py:1-17`、`34`、`88-91`；`programmatic_calling` 标 `extras["allowed_callers"]`，**未声明时只许 `DIRECT`**：`T/programmatic_calling.py:54`、`85-106`；`omne_agent_toolkits` 的 `ToolConfig` 有 `defer_loading / allowed_callers`，由注册表写回工具实例 `extras`：`omne_agent_toolkits/omne_agent_toolkits/registry/config.py:216-268`、`registry.py:419-445`

### O-4 可后台声明：`ToolDetachability`，未声明读作 `never`

- 实际观察：四级全序 `NEVER < ON_DEMAND < AUTO < ALWAYS`：`T/detachability.py:70-93`；`AUTO` 必带 `auto_form` 与 `default_threshold_seconds`（>0），`≥ON_DEMAND` 必带 `redrive_basis`：`166-227`；「An undeclared tool reads as `never`: silence means "always attached", never "anything goes"」：`399-416`；实例级 `DetachSettings` 不得宽于类级声明：`1-31`；测试 `omne_core_v1/tests/unit/agentic/tool/test_detachability.py:207`（本轮未运行）；决策 `omne_harness/adrs/accepted/ADR-126-tool-detachability-declaration-surface.md`；旧的进程内 fire-and-track 后台已弃用：`T/background.py:1-18`

### O-5 进度帧是类级声明，未声明就丢弃

- 实际观察：`progress_profile: ClassVar[ToolProgressProfile]`；「An undeclared tool that emits anyway is answered by `NullToolProgressEmitter`: an explicit no-op plus one warning」：`T/progress.py:1-47`；决策 `omne_harness/adrs/accepted/ADR-128-tool-emitted-progress-stream-durable-first.md`

### O-6 名字前缀与配置合并标识

- 实际观察：toolset 把工具名改成 `{toolset_name}__{name}`：`T/toolset/base.py:5`、`145-155`；`ToolConfig.name` 可覆盖导入工具的名字：`registry/config.py:236-240`、`registry.py:327-329`；preset 与用户配置按「标识」Last-Write-Wins 整条替换，标识依次取 `name`、`class_name`、`function`、`ref` 末段、对象 id：`registry/presets.py:127-146`

### O-7 实现装载与缺席处理

- 实际观察：工具以 `importlib.import_module` 从同一 Python 环境按模块路径导入：`registry/loader.py:45`、`80`、`123`、`168`；`_load_tool` 按 ref/function/factory/class 四路装载：`registry.py:289-331`；MCP 装载 v0.1 未实现、只打 warning 跳过：`registry.py:269-271`；执行环境走实现侧 `SandboxToolMixin`（`async with self.sandbox(runtime)`），不是声明：`omne_agent_toolkits/omne_agent_toolkits/sandbox/mixin.py:1-28`、`49`；核心层 toolset 明言「Sandbox-specific concerns are intentionally absent」：`T/toolset/base.py:12-14`
- 未找到：grep `modalit|input_modalities|supports_image|requires_vision` 于 `T/` 与 `omne_agent_toolkits/omne_agent_toolkits/` 零命中；外部服务、附件存储的定义级声明未找到。
- 许可：仓库根 `ls LICENSE*` 无结果，本轮未确定许可。

---

## M：minimal-runtime `d79484d`（形状参考，不是证据）

路径前缀 `.worktrees/minimal-runtime/`。

### M-1 两套并存的定义形状

- 实现侧 `packages/tools/tools/src/host.ts`：`ToolCommandDefinition {description, inputSchema, outputSchema, authorization, effect, concurrency?, executionLimitMs, stop, background:{mode:'unsupported'}, requiredSkills, environmentCapabilities}`：`host.ts:131-143`；`ToolContribution {registrationId, tenantId, scope, definition, definitionKind:'plugin'|'skill', toolKey, description, commands, implementationArtifact, binding, providerId, providerProtocol, generation}`：`145-159`
- 数据契约侧 `packages/core/work-data/src/index.ts`：`DefinitionRef {ownerTenantId, definitionId}`、`DefinitionVersion {definition, version}`：`14-15`；`BackgroundDeclaration` 为 `unsupported` 或 `supported{executionOwnerProtocol, requiredResources, reconnectProtocol, form, startModes}`：`231-240`；`Command` 另有 `foreground{limitMs?, onLimit: keep_waiting|detach|stop}`、`media{inputs[{param,kinds,formats?,maxBytes?}], outputs[{kinds}]}`、`frames[]`：`249-283`；`ToolDefinition {definition, toolKey, commands, projection?: 'single'|'compact'|'oneOf'}`：`284-289`
- 实现侧校验只允许 `host.ts:974-987` 列出的键，`media/frames/foreground` 不在其中（会报「is not allowed」），且 `background.mode` 非 `unsupported` 即拒：`host.ts:938-1016`（1012-1013）；`commands` 不得为空、`help` 为保留名：`966-970`；`inputSchema` 必须 object 根且 `additionalProperties:false`：`988-1010`

### M-2 多命令投影与 `help`

- 实际观察：「一个工具不论命令多少，manifest 只有一个 alias；Schema 用同一命令表派生 `oneOf`……help 为保留元命令」：`packages/tools/tools/design.md:153-155`；分支文档：`single` 只在命令表恰一条时可用，多命令缺省 `compact`（`{command, params}`），可选 `oneOf`，「`oneOf` 的分支数受 manifest 预算约束，超出回落 compact」：`docs/proposals/tool-execution/schema.md:41-49`；调用形状 `{alias, command, params}`：`host.ts:1587-1624`；`host.ts` 中无 `oneOf` 投影实现（grep `oneOf` 于 `packages apps`、排除 dist/upstream/schema 工具文件，零命中）

### M-3 身份、绑定与替换

- 实际观察：manifest item 冻结 `registrationId、definition/version、command table、Schema digest、implementationArtifact、binding、generation`，调用「只用原 manifest 解 alias，绝不按 toolKey 查当前实现」：`design.md:466-471`；`replaceContribution` 换代，旧 manifest 未准入调用 `stale_binding`：`design.md:473-481`、`tests/tool-host.spec.ts:813`；`discover/getDefinition/help` 返回 `available/requestable/unavailable`；`load` 「装载可信实际制品，不能下载用户任意 JS」：`design.md:105-106`；handler「不能携带可绕门调用的裸 execute」：`design.md:115-121`

### M-4 已知问题与状态（原文）

- `README.md:19-23`：Run 与 Inbound 的 record-only 片段「still fail closed with `owner_publication_required`」；代码 `src/shared-admission.ts:130-138`
- `README.md:46-48`、`design.md:372-374`：执行 owner 的 accepted/dispatch 恢复与同批 Run/Inbound owner publication 仍是集成义务
- `design.md:1-8`：「目标接口尚未实现/编译」；`design.md:19-25`：迁移语义索引在该提交仍 `candidate; acceptance:null`，L/I/J 的 catalog、consumer adoption 与冻结同步「仍是发布 gap」；`design.md:484-487` 列未迁移依赖
- `apps/local-harness/design.md:16-21`：下游缺端口时 `start` 返回 `runtime_composition_ports_unavailable`
- 终态身份：`src/host.ts:1299-1305` 在 provider 回报的终态执行身份与原 `ExecutionRef` 不一致时只记一条诊断 `tools.execution.terminal_identity_mismatch` 后返回，不结算；`src/host.ts:2350-2354` 的 `checkTerminal` 在同类不一致时回 `stale/terminal_execution_mismatch`。**README/design 里没有找到把「终态端口身份对不上」写成已知问题的原句**，只有上述代码路径与 `README.md:30-36` 对终态 operation ID 构成（call、attempt、provider source version）的描述。
- 设计与代码的一处出入：`design.md:124-129` 说用 Ajv 8.20.0 按 draft 2020-12 编译 input/output Schema；`host.ts:988-990` 的贡献校验调用的是 DSH 子集的 `assertObjectJsonSchema/assertSupportedJsonSchema`。`packages/core/work-data/src/index.ts:2` 引入 `Ajv2020`，本轮未追到工具参数实际走哪一条。

### M-5 依赖与耦合

- 实际观察：`packages/tools/tools/package.json:32-43` 依赖 `@deepseek-ai/cordis` `4.0.2` 与八个 `@omne-harness-lite/*` workspace 包；`UPSTREAM.md:3-8`、`provenance.json:2-5` 记来源 DSH `c291e796`、MIT；`host.ts` 3619 行；应用装配里唯一的工具贡献是 `local_file`（`read`/`write` 两条命令，`environmentCapabilities: ['filesystem']`，`background: unsupported`）：`apps/local-harness/src/assembly.ts:1514-1561`

## V：供应商工具格式——本项目工具定义须能投影成的线上形状（2026-09-24 补取证）

取证条件：三份官方页面原样抓取，副本与 SHA-256 在主检出 `tmp/sources/extracted/{openai-docs,anthropic-docs,openrouter-docs}/`（`README.md` 有登记行）；下列断言只对抓取当日的页面成立。

### V-1 OpenAI「Function calling」（`openai-docs/guides_function-calling.html`，SHA `92be5663…`）

- 工具条目形状（Responses API 形式）：`{ "type": "function", "name", "description", "parameters", "strict" }`；**必填** `type` `name` `parameters`，`description` 与 `strict` 可选。Chat Completions 形式把 `name/description/parameters` 包在 `function` 成员里（OpenRouter 用的是这一形式，见 V-3）。
- `parameters` **必须是 JSON Schema 且顶层 `type: "object"`**；每个参数的 `description` 页面写「推荐」（帮助模型正确使用每个字段）。
- `strict: true` 时：每个对象 `additionalProperties: false`、全部属性列进 `required`、可选属性用 `type: ["string","null"]` 表达；不合规则请求被拒。
- 限度：建议一轮开始时可用函数少于 20 个；名字与说明长度无明文。

### V-2 Anthropic「Define tools」「Tool use overview」（`anthropic-docs/tool-use_define-tools.html` SHA `9d3bb7ae…`；`tool-use_overview.html` SHA `d6a6b687…`）

- 工具条目形状：`{ "name", "description", "input_schema", "input_examples"? }`，另有 `strict`、`cache_control`、`defer_loading`、`allowed_callers` 可选。
- `name` **必须匹配 `^[a-zA-Z0-9_-]{1,128}$`**——冒号、点、斜杠都不合法。
- `input_schema` 是 JSON Schema 对象，示例顶层 `type: "object"` + `properties` + `required`。
- 最佳实践原话：「Provide extremely detailed descriptions. This is by far the most important factor in tool performance」，要写清「What each parameter means and how it affects the tool's behavior」，每个工具说明至少 3～4 句；好例子里每个参数都带 `description`，坏例子正是参数无 `description`。
- 请求里 `tools` 会被 API 组装进一段系统提示（「Here are the functions available in JSONSchema format」）。

### V-3 OpenRouter「Tool calling」（`openrouter-docs/guides_features_tool-calling.html`，SHA `7df227bc…`）

- 形状为 OpenAI Chat Completions 兼容：`{ "type": "function", "function": { "name", "description", "parameters" } }`；示例参数各带 `description`。
- 流式：工具调用经 `choices[0].delta.tool_calls` 分片到达，`finish_reason: "tool_calls"`；回填用 `{ "role": "tool", "tool_call_id", "content" }`。
- 页面**未写明**是否按供应商转译工具定义、也未写各家对 schema 关键字的限制——这一半仍是缺口（契约 G-12 的剩余部分）。

### V-4 对本项目的含义（结论，选择归契约与主线）

1. 三家的模型面条目都是同一份三元组 `{name, description, 参数 JSON Schema}`，只是包装与键名不同（`parameters` / `input_schema`；有无 `type: "function"` 外壳）——工具定义只要把这三样定死，投影就是纯键名映射，不需要改写 schema。
2. 参数 schema 顶层必须 `type: "object"`（OpenAI 明文；Anthropic 示例与系统提示一致）。
3. 每个参数的 `description` 两家一个「推荐」一个「最重要的因素」——把它写成本项目的**必填**代价为零、收益直接。
4. 名字：Anthropic 的正则不含 `:`，而本项目能力标识 name 允许 `:`（MCP 条目「接入点:动作」、`omne-official:` 前缀）——**模型面名字必须经固定转写**，且转写要可逆，否则回来的 `tool_calls.name` 对不回定义。

### V-5 实测：flat 形多命令工具在四家模型上的真实请求（2026-09-24，产品负责人授权）

探针脚本与逐轮记录在主检出 `tmp/assets-runtimes/probes/`（`flat_multicommand_probe.py`、`results/*.json`；密钥只进请求头）。工具 `fs`（cat/grep/write）按契约 S-7 flat 形生成：`command` 为 enum 加一行一命令的表，`args` 为**无 `properties` 的 object**；另给一个模拟 `Tools().inspect` 的单函数工具。任务：不区分大小写找 TODO 行并把行数写入文件。经 OpenRouter `chat/completions`，`temperature 0`，`tool_choice auto`。

| 模型（OpenRouter ID） | 有 inspect | 无 inspect（对照） |
|---|---|---|
| `openai/gpt-5.6-sol` | 先查 grep、write 两条用法，再调 `fs grep{path,pattern,ignoreCase}`、`fs write`，答 3 | 直接猜 `ignore_case`（未知键，被校验挡），**答错为 2** |
| `anthropic/claude-opus-5.5` | 同上，两次 inspect 后两次 fs，答 3 | 改用 `cat` 全文自己数，答 3 |
| `deepseek/deepseek-v4-pro` | 逐命令查用法再调用，答 3 | 用正则 `[Tt][Oo][Dd][Oo]` 绕开未知参数，答 3 |
| `z-ai/glm-5.3` | 一次总览 inspect 后两次 fs，答 3 | 猜对 `ignoreCase`，答 3 |

**结论**：① `args` 为无 `properties` 的 object 在四家都被接受（HTTP 200，`finish_reason: tool_calls`），没有一家因 schema 拒绝请求；② 有 inspect 时四家都先查用法再调用，参数键全部与命令 schema 一致；③ 没有 inspect 时模型会猜参数名——gpt-5.6-sol 猜错并给出错误答案，说明**判定层必须把「未知键／缺必填」明确拒回给模型并附该命令的用法**，不能静默忽略；④ 本结论只对这四个模型、这一份工具、该日 OpenRouter 路由成立。
