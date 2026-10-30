# 设计与 Agent 工具入口

本目录维护现行设计导航、领域对象对账，以及 skills／roles 的宿主生成和接入。模块接口、完整必要行为规格及验证资源由实际包／应用拥有，工具不建立另一份中央契约或实现映射。

## 现行源检查

`check_sources.py` 检查现行设计的本地文件、Markdown 锚点和显式模块拥有者：

从仓库根运行。本仓库的设计树链接到检出里的 docs 与成员，所以要带 `--source-root`，`pnpm run check:design` 的第一步就是这条：

```sh
uv run --locked python .meta_harness/tooling/src/check_sources.py --root .meta_harness/design --source-root .
uv run --locked python .meta_harness/tooling/src/check_sources.py --root .meta_harness/design --source-root /explicit/execution-checkout
```

`--source-root` 必须指向设计根所在的同一执行检出，不从安装位置或父目录猜测。
工具校验该检出的根登记和发现的局部登记。docs、组及仅有文档的成员 Markdown 按精确注册文件准入，
不放行目录或同级未登记文件。另允许两个精确的非 Markdown 目标
`docs/engineering/github-delivery.json` 和 `docs/architecture/constraints.json`。

实际 packages 与 apps 当前成员及 `.0.0.1.legacy` 封存成员的文件，包括 Markdown SPEC，
可由 workspace 包含及排除声明和有效 manifest 确认出处。目标与 manifest 必须留在该检出内。
`ModuleSources.owns()` 只表示当前成员；`origin()` 返回 `current-member`、`archived-member` 或 None。
封存出处不授予当前采用或运行支持。tools 不属于产品成员，其 Markdown 按精确登记准入。
坏登记、非法声明、缺文件、错锚点和越界链接均使检查失败。

未提供 `--source-root` 时，仅检查设计根、既有 meta agents/research 来源和 meta 根入口，
不准入外部 docs 或成员路径。模板可被合法引用，但不扫描模板正文。tmp、record、跨检出及其别名被拒绝。
spec、realization、registry 三个旧根不得重新出现，空目录、普通文件或悬空软链接同样拒绝。
外部 URL 不在本工具中抓取或核实。

检查冻结扫描集合、源正文、登记、依据、workspace、实际用到的 manifest、目标字节与实际路径，
收尾发现变化时失败。图片等二进制目标只读字节，Markdown 必须能按 UTF-8 解码。
持续正控与拒绝反例位于 `tests/test_source_links.py`。
角色上下文入口见 [spec-tools](../../tools/spec-tools/README.md#按角色读取上下文)。

该工具不判断条款等价性、采用状态、实现符合性或模型覆盖。公开 Schema 身份、规范输入及形式模型的正负控由真实拥有者维护并执行；单次原始输出归执行工作树 tmp。根 `pnpm run check:design` 组合本检查与领域对象对账，不隐式执行形式模型。

## 领域对象对账

出处锚点读取复用已安装的项目`omne-harness-lite-spec-tools`及其Markdown解析依赖；执行仓库用锁定的uv环境提供。对象对账不维护另一套围栏或标题解析。

`domain_objects.py` 对账三家之间的对应关系——统一语言词条、领域对象条目、产品 topic——
并生成派生总表 `design/views/domain-object-map.md`：

在仓库根运行，有两种写法。`pnpm run check:design` 先跑上面的现行源检查，再对账；
`--stale <值>` 只交给对账：

```sh
pnpm run check:design
pnpm run check:design --stale report
```

只要对账时，直接调用脚本，由锁定的 uv 环境提供解释器与依赖：

```sh
uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design                  # 对账，并核对总表是不是最新
uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design --write          # 重新生成总表
uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design --stale report   # rev 落后只列出，不判失败
```

`tests/test_readme_commands.py` 读本 README 代码块里每条 `uv run --locked python <脚本> …` 命令，查两件事：

- 每个脚本的 `--help` 退出 0。脚本名写错或脚本搬走时，用例变红。
- 每条命令照原样交给脚本的 argparse 解析，解析完立即退出，不执行脚本。参数名写错、缺必填参数或取值不在可选值里时，用例变红。

它不验证脚本收到参数之后做什么，也不验证 `pnpm run`、`pytest` 等其他命令。

它查什么、为什么查，权威正文在 [domain_objects/conventions.md](../design/domain_objects/conventions.md#对账)；
被点名之后怎么逐条复核，归 `ubiquitous-language` 与 `domain-objects` 两份 skill。这里只记工具自己的边界：

- **rev 的权威是各 topic `README.md` front-matter 的 `revision`。**`design.md` 抬头
  若写了 rev，必须与它相等；没写不算错。当前产品从slug目录的README元数据发现，核对PD身份、正整数修订、状态、正文及根内路径。封存PF出处另核修订、文件与锚点，不进入当前采用或反链。
- `ubiquitous_language/conflicts.md` 里的 rev **不查**：那是记下冲突时看到的那一版，是一条观察的时间戳，不是对齐凭据。
- 词条「出处」、条目「依据」、待裁「牵涉」读的是[同一条写法](../design/ubiquitous_language/conventions.md#rev-怎么写怎么读)：
  指向产品正文的链接后面跟着它那个 topic 的 `（rev N）`，同一个 topic 连着的几条链接可以共用后面那一个；
  一个括号里并列几个 rev 的，按前面 topic 出现的次序配，个数配不上就报错。
- 总表比对时**忽略生成时间那一行**，所以隔天重跑不会因为日期而判过期。
- `--stale report` 供本地迭代看待复核队列，**不是通过的证据**。
- 当前导航的链接与锚点由`check_sources.py`核对；封存出处的文件和锚点由本工具在明确legacy根核对；
  它也**不判断任何条目的内容对不对**，更查不出产品正文里新冒出来、却没人立词条的对象。

测试用一棵含一个 topic、一卷四个词条（含一个变体）、三条对象条目与一项待裁的小型设计树，覆盖：
一致时通过且总表可往返、只改生成时间不判过期、对象词条缺条目与条目缺对象词条、条目缺词条或缺必填字段、
rev落后及topic内已声明修订不一致及其 report 模式、依据缺 rev 或指向非产品正文、
形态缺失/非法/变体的父无效、未定词条须同时出现在 pending 与 conflicts、索引与分卷不一致、待裁缺 owner。

## 保存只读子代理的交回

design-reviewer 等只读角色没有写文件的工具，报告只存在于宿主记录里。`save_handback.py` 把它取出来存成文件：

```sh
uv run --locked python .meta_harness/tooling/src/save_handback.py --transcript <子代理记录.jsonl> --out <报告.md>
```

Claude Code 把每个子代理的记录写在 `~/.claude/projects/<项目>/<会话>/subagents/agent-<id>.jsonl`。`<项目>` 是检出路径的转写（例如 `D--dev-repos-omne-harness-lite`），`<会话>` 是派发它的会话 ID；`agent-<id>.meta.json` 在同一目录。

报告只从当前这一轮取。一轮从最后一条提示开始：提示是一条 user 记录，它不只含工具结果，也不是宿主加的 `isMeta` 记录。报告正文按下面的次序取：

1. 这一轮里最后一次 `SubagentHandback` 工具调用的 `input.message`。读取形状与 `agents/evaluation/harness/roleeval/claude_host.py` 一致。
2. 没有这个调用时，取记录末尾那条 assistant 消息的文本，条件是它以 `end_turn` 结束。一条 API 消息按内容块拆成多条记录，共用 `message.id`，脚本把它们的文本块按次序接起来。已观察到的 Claude Code 2.1 子代理记录以 `end_turn` 消息结束，没有 `SubagentHandback` 调用。

找不到报告时以 1 退出，说明原因，不写文件，已有的 `--out` 文件原样保留。以下情形都算找不到：

- 记录停在工具调用上，或被中断。
- 记录以宿主错误 `stop_sequence` 结束。
- 报告为空白。
- 末尾那条 assistant 消息之后还有 user 记录。这时那条消息答的是上一轮，这一轮的报告不在记录里。

记录读不了或 `--out` 写不了以 2 退出。写入先写同目录临时文件再替换。

脚本只在换行符（U+000A）处分行。JSON 字符串里可以不转义地出现 U+2028、U+2029 与 U+0085，脚本不在这些字符处分行。
最后一行以前有任何一行不是 JSON 对象时，脚本以 2 退出，并写明第几行。
仍在写入的记录可能以半行结尾：最后一行后面没有换行符、又读不成 JSON 时，脚本跳过它，并在标准错误写明跳过了第几行。

脚本只证明「记录里这段文字就是交回的报告」。报告内容对不对，仍由评审流程判断。

## Agent 编译

生成器从一个 `agents/` 源根按固定 host_layout 编译各宿主目录，源里有 `cloud/<host>/` 时一并编译该宿主的三份 Cloud Agent 运行时文件，并提供独立的相对软链接工具。
`host_layout.py` 拥有宿主清单与路径，`projection.py` 解析源和适配并产生内存产物，`compile_agents.py` 负责 CLI 与预检写入，
`link_agents.py` 暴露项目入口，`initialize_agents.py` 串接生成与接入。没有安装更新器、发布事务或知识图谱依赖。

## 使用

需要 Python 3.12+ 与 PyYAML；运行测试另需 pytest。执行仓库提供锁定环境。
以下命令从仓库根运行，用 `uv run --locked` 取得解释器与依赖，不从父目录猜测环境。

```sh
uv run --locked python .meta_harness/tooling/src/compile_agents.py --source .meta_harness/agents --output .meta_harness
uv run --locked python .meta_harness/tooling/src/compile_agents.py --source .meta_harness/agents --output .meta_harness --check
PYTHONDONTWRITEBYTECODE=1 uv run --locked pytest -p no:cacheprovider \
  .meta_harness/tooling/tests .meta_harness/agents/skills/design-subagents/canonical/scripts
```

输出根必须显式指定，正常产物留在 `.meta_harness/`。可用 `--host codex` 或
`--host claude-code` 或 `--host cursor` 单独生成，默认 `all`。不同宿主原生目录分别保留在输出根下。
相同内容与权限可重复生成；不同内容或权限的既存文件会使
整个预检失败，不覆盖、不删除。修改源后使用新的暂存目录比较。`--check` 只读检查
应生成文件是否存在且一致；它不把输出目录中的其他文件当成本工具所有，不检查或删除它们。

输出根可包含源目录（如 `.meta_harness/agents`），但具体生成路径不得与源重叠；
输出根不得放在源内。工具拒绝源/目标符号链接和越界输出；所有源与目标冲突先预检。
写入过程中发生磁盘等故障仍可能留下部分新文件，不承诺多个目录跨文件事务；
失败会非零退出，重跑或检查可发现未完成的输出。

## Skill 策略

每个所选宿主都需要 `agents/skills/<name>/adapters/<host>/strategy.yaml`：

```yaml
version: 1
host: codex
skill: example-skill
mode: copy
slots:
  '{{HOST_GUIDANCE}}': slots/host-guidance.md
```

`slots` 可省略。替换文件相对当前 adapter，不能越界；仅替换 canonical 中 Markdown 的
大写 `{{NAME}}` slots，做一遍替换，不递归执行模板。维护者入口 `AGENTS.md`、`CLAUDE.md`、
`.design/`、`evals/` 与缓存不进入产物。脚本保留可执行性，普通文件规范为 0644、可执行文件为 0755。

`mode: unsupported` 必须提供非空 `reason`，使所选宿主构建失败并说明缺口；
不是自动丢弃或发一个看似可用的空 skill。当前仅支持这两种模式；未知字段、版本、模式和
身份不匹配均拒绝。生成器不支持 stub、partial overlay 或完整发布事务。

## 宿主钩子

`agents/hooks/hooks.yaml` 存在且列表非空时，编译另产出项目级钩子文件：Claude Code 的
`.claude/settings.json`（只有 `hooks` 一段）与 Codex 的 `.codex/hooks.json`；`--host` 只出所选那端。
两端文件按各自宿主的声明生成，内容不必相同：没有声明给某个宿主时，不产出那个宿主的文件。
每条声明有 `id`、`events`（认 `Stop`、`SubagentStop`、`SessionStart`）、`command`（shell 形式）、`timeout`（正整数秒），
可选 `hosts`（`claude-code`、`codex`、`cursor`；省略为全部）只把这条给所列宿主，`SessionStart` 只为 Claude Code 生成，
可选 `subagent_types`（须是 `agents/roles/` 下已有的角色名，只收窄 `SubagentStop`，生成为 `|` 连起来的 matcher），
可选 `session_sources`（`startup`、`resume`、`clear`、`compact`、`fork`，只收窄 `SessionStart`，生成为 `|` 连起来的 matcher）。
未知事件或字段、空命令、非正整数超时、重复 id 都报错并带出那条的 id。输出确定（键排序、两空格缩进、末尾换行），
`--check` 逐字节比对。没有 `hooks/` 或列表为空时不产出钩子文件，其余产物不变。
生成不等于宿主已加载或已信任这条钩子；声明的含义与怎么关见 [agents/hooks](../agents/hooks/README.md)。

## 根软链接

先生成完整 all 产物，再在允许接入的产品根运行：

```sh
uv run --locked python .meta_harness/tooling/src/link_agents.py --project-root .
uv run --locked python .meta_harness/tooling/src/link_agents.py --project-root . --check
```

工具预检所选目标后，创建 `.claude`、`.agents`、`.codex`、`.cursor` 到 `.meta_harness/` 内同名目录的
相对链接。选择 Cursor 时，`.cursor` 的目标必须已经含有编译出的 `Dockerfile`、`environment.json` 和 `install.sh`。
正确链接可重复运行，其他链接或实体路径一律拒绝，不删除、不搬迁、不覆盖。
工具不迁移既存内容；目标根若有实体目录，须按相应任务授权先处理，再创建链接。
创建、冲突保护、只读核对和整体目录移动后的相对链接有效性由工具测试覆盖。

`agents/cloud/<host>/` 存在且本次选中该宿主时，编译把其中的运行时文件复制到该宿主的 package 根。现在只有 `cursor/`，输出是 `.cursor/`。`README.md` 留在源目录，不进入投影。
`claude-code` 例外：它的目录只有 `setup.sh` 和 `session-start.sh`，两者都必须可执行。编译检查它们，不产生投影，因为 Claude Code 从云端环境设置读取 setup 脚本。
没有 `cloud/`，或选中的宿主没有自己的目录时，不产生这三份文件。平铺在 `cloud/` 根上的运行时文件会被拒绝。`install.sh` 必须可执行。`environment.json` 的 `build.dockerfile` 必须是 `Dockerfile`，
`install` 必须是非空字符串。这三份需要提交：Cursor 在安装脚本之前从检出读取它们。
skills、agents 和 hooks 仍由 `.meta_harness/.gitignore` 排除，检出后重新编译。


## Cursor 原生包与项目视图

Cursor 产物根是 `output/.cursor/`，包含 `.cursor-plugin/plugin.json`、skills、agents、hooks.json、plugin-hooks.json 和 runtime。
manifest 明确组件路径，不把维护源目录当作插件。角色及精确资格归 [Cursor 适配](../agents/skills/design-subagents/canonical/references/cursor.md)。
第三方 pstack/Matt 的宿主来源归执行仓库 `docs/engineering/skills.md`，本工具不安装或复制其正文。

Cursor生成先核对全部角色的[资格记录](../agents/skills/design-subagents/canonical/references/cursor.md#生成前的角色资格门禁)。
记录缺失或 unsupported 时，整个 Cursor 或混合构建在写入前失败，不产生文件。
七个角色都投影到 `.cursor/agents/<name>.md`。源更新后的下一次编译改写这些文件。`--check` 按字节核对，和 Codex、Claude Code 的角色投影使用同一次编译。
绑定过期不阻止结构投影，但该角色不进入合格摘要。pending 同样写出文件，并且不进入合格摘要。
当前七个生产记录为 proved。它们可以在已记录的 CLI 与 IDE 项目视图中正式派发。`subagentStart` 按合格 agent 文件摘要放行。Cloud 不在派发范围内。
旧宿主可分别用`--host codex`及`--host claude-code`生成和检查；它们不读Cursor资格。

CLI 和 IDE 可用项目 `.cursor` 相对视图，也可安装物理原生包。CLI 的插件方式示例为 `agent --plugin-dir /absolute/package/.cursor`。
外部安装先在新的物理目录生成，只搬运 `.cursor/` 包；不使用指向维护源的链接。安装位置变化不改变包内相对引用。
同一宿主不得同时启用项目视图和同一插件包，否则角色名称和 hooks 可能重复。本工具不管理宿主已安装插件清单。

从完整仓库的 clean clone 初始化 CLI、IDE 或 Cloud 项目视图，在首个模型会话前执行：

```sh
uv sync --locked
pnpm install --frozen-lockfile --ignore-scripts
uv run --locked python .meta_harness/tooling/src/initialize_agents.py --project-root . --host cursor
uv run --locked python .meta_harness/tooling/src/initialize_agents.py --project-root . --host cursor --check
```

需要全部宿主时省略 `--host cursor`。Python/PyYAML 只用于生成，native bridge 运行需要 Node、Git 和 POSIX shell。
Cloud 初始化由环境 setup 明确执行，不能等 SessionStart。命令 hooks 有 stop、subagentStop，以及按合格 agent 文件摘要把关的 subagentStart。
Cloud 早期只读环境不会运行 hooks。本次未运行真实 IDE/Cloud 会话，clean clone 子进程检查只支持初始化与资源可达。
初始化重复调用保持内容不变，存在不同字节/权限或真实项目目录时失败；更新仍须新 staging 比较后按任务授权更换生成物。

## Cursor hook 协议

共享 hooks.yaml 拥有事件、参与角色、measurement command 与 timeout。hooks/cursor.yaml 只拥有协议版本、正整数 loop_limit 及 timeout_grace。
生成的 bridge 从自身安装路径读取声明，按原命令执行测量，不重写测量、去重或政策规则。
measurement timeout 仍由共享声明拥有；native timeout 增加配置的 timeout_grace，给 bridge 留出输出超时诊断的时间。
原 Stop/SubagentStop 映射为 stop/subagentStop；Cursor stdout 只输出 JSON 对象，合法的新 block/reason 映射为 followup_message。

bridge 要求 completed、非负整数 loop_count，SubagentStop 还要求非空且匹配的 subagent_type。
loop_count 大于零或 stop_hook_active 已真时不再测量。native loop_limit 是宿主第二道限制；项目原测量 fingerprint 继续去重。
错误和中断不声明测量通过。缺失身份/count、无效 JSON、工具异常、stderr、timeout、systemMessage 均产生结构化 stderr 诊断，stdout 无 followup。
诊断是否在具体宿主界面可见须实际验证；stderr 记录本身不等于用户已读。

workspace_roots 或 event cwd 必须唯一确定真实目标。多根且 cwd 不能唯一消歧时不选第一项；cwd 与单根冲突同样拒绝。
进程 cwd 和转交测量的 payload.cwd 都归一到目标。插件根只定位资源，不作为被测仓库。
目标须有兼容 tools/repo-toolchain/stop-hook 及 TypeScript 依赖，或 Git common 主检出有该组合；两者都没有则诊断并退出。
这是 OMNE 仓库/worktree 支持，不承诺在任意仓库安装即具备测量能力。Git common fallback 的配置仍归实际工具，不能误报为目标配置。
项目 hooks.json 的命令通过 Git 根定位 `.cursor`，支持从子目录进入，忽略继承的插件环境变量。
manifest 指向 plugin-hooks.json；原生插件命令使用准确的 `${CURSOR_PLUGIN_ROOT}` 占位符，由宿主替换为本插件安装根。
两份配置共享事件、限制和 runtime，不能用 shell 默认值表达式替代原生占位符；CLI 2026.08.04-aaa8809 只替换准确的占位符文本。

## 真实 CLI 取证驱动

`cursor_probe.py` 准备独立 observation plugin，记录 preToolUse、subagentStart、subagentStop、stop 原生输入与 stream-json。
它不修改产品插件或目标项目。必须给独立输出目录，OMNE_METRICS_HOME 自动指向该目录，避免污染其他会话的去重记录。
默认只准备；`--run` 才发真实模型请求，须在任务的模型/费用授权内使用正常 agent 模式。

```sh
uv run --locked python .meta_harness/tooling/src/cursor_probe.py \
  --workspace /absolute/target-worktree --output /absolute/task/probe-1 \
  --model claude-opus-5-5-high --prompt-file /absolute/task/probe-prompt.md \
  --timeout 180 --run
```

项目视图已接入时不传产品 plugin-root。测试插件方式时在未暴露同一项目 assets 的目标添加 `--plugin-root /absolute/package/.cursor`。
断言应核真实 Read/reference、Task 自定义角色身份、所选模型、stop/subagentStop 的实际 target cwd、过滤、一次反馈与停止及故障诊断。
Task 可覆盖 model，common payload.model 不是子代理模型；subagentStart.subagent_model 仍不排除后端回退。
模型自己声称发现或执行不算证据。退出零也不自动成为接受。过程超时会终止该进程组并报告 124。
单次结果留任务 tmp，IDE/Cloud 真实执行、模型资格和完整付费评估分别报告。

持续检查在 tests/test_cursor.py、test_compile_agents.py、test_compile_hooks.py、test_compile_cloud.py、test_link_agents.py、test_stale_skills.py、test_save_handback.py 与 test_readme_commands.py。
它们覆盖文件、资源、路径、严格字段和子进程协议；真实模型与宿主事件仍由上面的驱动和独立验收取得。
