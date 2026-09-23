# Claude Code `2.1.280`：斜杠命令的识别、解析与留痕

- 原始出处（三类，强度不同，分开标）：
  1. **官方文档**：2026-09-23 抓取的原样字节，存于本包 [`sources/`](../sources/provenance.json)（`SHA256SUMS` 同目录）。
     下文 `slash-commands.txt:N` 指 `sources/claude-code-slash-commands-2026-09-23.txt` 第 N 行（与 skills.md 逐字节相同），其余同理简写。
     hooks 页复用同程 topic 的钉存字节：`../loop-extension-hooks-compat/sources/claude-code-hooks-2026-09-23.txt`（sha256 `dc59d7c4…`，本轮重抓相同）。
  2. **本机实例二进制**：`$(npm root -g)/@anthropic-ai/claude-code/bin/claude.exe`，`package.json` 版本 `2.1.280`，sha256 `1e08503dbdf3c2cb0d706d32f3408277388d1c76ef108673e8fe42c1b322925b`；
     Bun 编译单文件、已压缩混淆。取证只做 `strings -n 6` 后的字符串探针，**不是源码阅读**；下文 `strings:N` 指那份字符串输出（511 009 行）的第 N 行，重跑同命令可复现。
  3. **本机会话记录**：`~/.claude/projects/<项目>/<会话>.jsonl`，只读结构字段（`type`、`isMeta`、`version`、`message.content` 前缀），不引用对话内容。
  4. **GitHub issue**（anthropics/claude-code）：2026-09-23 `gh search issues` / `gh issue view` 抓取。
- 来源立场：1、2 是厂商自述与厂商产物；3 是本机实际运行留下的记录（**实际行为**，但只覆盖本机用过的命令与版本）；4 是独立用户报告。
- 消费对象：research.md 的 Claude Code 相关结论与对照表 Claude Code 列。

## 当前可消费观察

### CC-1

**识别：命令只在消息开头认；首个词以标点开头或是路径时当普通消息**

- `commands.txt:13`：「A command is only recognized at the start of your message. Text that follows the command name becomes its arguments.」
- `errors.txt:2771`：「Claude Code doesn't treat every prompt that starts with `/` as a command. It sends the prompt to Claude as a normal message when the first word after the `/` starts with punctuation, such as the `/--` that opens a Lean doc comment, or is a path such as `/var/log/syslog`.」
- issue [#88814](https://github.com/anthropics/claude-code/issues/88814)（2026-08-22，仍开）：skill 的 frontmatter `name` 含空格时，`/Merge Open PRs` 只取第一个词，报 `Unknown command: /Merge`——名字到第一个空白为止。
- issue [#89398](https://github.com/anthropics/claude-code/issues/89398)（2026-08-25，桌面端，仍开）：补全菜单只在输入框第 0 字符为 `/` 时打开，而「a command still runs on submit」出现在第二行时也被执行——**补全路径与执行路径对「开头」的定义不一致**（用户报告，版本不详，本轮未复现）。
- 支持范围：文档与用户报告。前导空白是否仍算「开头」、代码块里的 `/` 如何处理，文档未写（见未知表）。

### CC-2

**未知命令：交互终端报错；其它会话形态把原文当普通消息发给模型，并附「命令没执行」说明**

- `errors.txt:2747-2755`：交互终端里报 `Unknown command: /hepl. Did you mean /help?`。
- `errors.txt:2761-2767`：「Claude Code answers an unmatched `/` name this way only in an interactive terminal session. In every other session, it sends the prompt to Claude as a normal message instead, with a note that the command didn't run and a list of commands Claude can run in the session.」其它会话含 `-p`、Agent SDK、桌面 Code 标签、VS Code 聊天面板、云会话与 routines。
- `errors.txt:2769`：「Before v2.1.274, only cloud sessions and routines sent an unmatched name to Claude. Before v2.1.273, they answered `Unknown command` too.」
- `errors.txt:2773`：v2.1.236 之前，回车会执行菜单里的近似匹配项（`/hepl` 会跑 `/help`）。
- 实例探针：`strings:482654` 含 `…_e=ne?\`Unknown command: /${ke}. Did you mean /${Te}?\`:\`Unknown command: /${ke}\`;if(r.options.isNonInteractiveSession)return …shouldQuery:!1…`，与文档「按会话形态分叉」一致；`unknown_command_fallback` 在字符串里出现 6 次。
- issue [#95000](https://github.com/anthropics/claude-code/issues/95000)（2026-09-17，仍开）：`claude -p "/plugin-types"` 在 2.1.273 起不再本地拒收，改走模型；同一输入在 2.1.274 七次调用成本 $0.009–$0.123 不等，且未见发布说明。
- issue [#88387](https://github.com/anthropics/claude-code/issues/88387)（仍开）：`-p` 模式下 Unknown command 应以非零码退出；[#90515](https://github.com/anthropics/claude-code/issues/90515)（仍开）：2.1.251 起插件命令在 `-p` 里报 Unknown（相对 2.1.250 回归）。
- 支持范围：文档 + 字符串探针 + 用户报告三路互相印证。

### CC-3

**命令有三种实现类型：`prompt` 展开成给模型的内容，`local` / `local-jsx` 在宿主执行**

- `slash-commands.txt:23`：「Bundled skills are prompt-based … Most built-in commands instead execute fixed logic directly.」
- `commands.txt:35-41`：命令总表里只把 bundled skill 与 workflow 两类单独标出，其余「built-in commands whose behavior is coded into the CLI」。
- 实例探针：`strings:463354`（与 `:482655` 同段）含
  `switch(e.type){case"prompt":return{workspace:!1,ink:!1};case"local":return{workspace:!0,ink:!1};case"local-jsx":return{workspace:!0,ink:!0}}`
  与 `if(e.type==="prompt")return"post-text"`；`strings:482654` 含 `if(p.type!=="prompt")throw Error(\`Unexpected ${p.type} command. Expected 'prompt' command. …\`)`。
  计数：`type:"local-jsx"` 84、`type:"local"` 48、`type:"prompt"` 19（`grep -o -F` 计数，含非命令用途的同形字符串，只作存在性证据）。
- 实例探针：命令来源字段 `loadedFrom` 取值 `bundled / commands_DEPRECATED / mcp / memoryStore / plugin / skills / syncedSkills`（`grep -o 'loadedFrom:"[a-zA-Z_]*"'`）。
- 支持范围：「两种性质在实现里是一个类型判别字段」由字符串探针支持，不知道判别在解析流程的哪一步生效（混淆代码，未逐行还原）。

### CC-4

**提示词型命令的来源与命名：skill 目录、旧命令文件、插件、MCP prompt、账户同步；插件与嵌套目录带命名空间**

- `slash-commands.txt:16`：「Custom commands have been merged into skills. A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way.」
- `slash-commands.txt:377-397`（表「How a skill gets its command name」）：个人 / 项目 skill 取**目录名**（frontmatter `name` 只改显示）；嵌套 `.claude/skills` 撞名时取 `apps/web:deploy`；`.claude/commands/frontend/component.md` → `/frontend:component`；插件 skill → `/<plugin>:<name>`，裸名 `/<name>` 在无别的命令占用时也可用；账户同步 skill → `/anthropic-skills:<name>`。
- `slash-commands.txt:395`：非交互会话里 `help`、`feedback` 两个名字不保留；「Every other terminal-only built-in's name, such as `/login`, stays reserved」。
- `mcp.txt:1494-1531`：MCP prompt 以 `/servername:promptname (MCP)` 出现在菜单，`/mcp__servername__promptname` 也可调用；参数按空白切分，「Prompt results are injected directly into the conversation」。
- 支持范围：文档。

### CC-5

**同名裁决规则（文档所载）**

- `slash-commands.txt:159-168`（表「Resolve skills that share a name」）：enterprise > personal > project；本地 skill **替换** bundled skill 但**不替换其别名**（项目 `code-review` 替换 `/code-review`，别名 `/review` 仍跑 bundled）；skill 胜 `.claude/commands` 同名文件；项目根与嵌套 skill 都加载；插件 skill 因命名空间都加载；账户同步 skill 输给其它任何同名者。
- `slash-commands.txt:222-235`：同步 skill 与内建命令、bundled skill（「including one that's unavailable in your session」）、本地 skill、插件 skill、MCP prompt 撞短名时让位；比较名字时忽略大小写、空白与不可见字符，全角与破折号变体视同。
- **文档未覆盖**：个人或项目 skill 与**非 skill 的内建命令**（如 `/compact`、`/model`）同名时谁生效。只查到 `:395`「terminal-only built-in 的名字保留」一句针对插件裸名。
- 支持范围：文档；未做实验。

### CC-6

**参数：`$ARGUMENTS`、`$ARGUMENTS[N]`、`$N`、具名 `$name`；shell 式引号；无占位符时追加 `ARGUMENTS:`；可叠多个 skill**

- `slash-commands.txt:399-452`：替换变量表；`:432` 下标参数按 shell 规则加引号；`:434` 无对应实参的下标占位符原样保留，具名占位符展开为空串；`:436` 实参里的 `$1` 不再展开；`:438` 反斜杠转义 `\$1.00`。
- `slash-commands.txt:569`：「If you invoke a skill with arguments but no placeholder in the skill's content receives one, Claude Code appends `ARGUMENTS: <your input>` to the end of the skill content」。
- `slash-commands.txt:571-573`：`/write-tests /fix-issue 123` 一次加载两个 skill，尾部文本作为**每个** skill 的 `$ARGUMENTS`；最多首个加五个；遇到非内联 skill（`context: fork` 的、或参数本身可能以斜杠命令开头的如 `/loop`）即停。
- `commands.txt:13`：v2.1.199 起叠加只对 skill 成立，内建命令不叠。
- `slash-commands.txt:340-343`：frontmatter `argument-hint`（补全提示）、`arguments`（具名参数）、`disable-model-invocation`、`user-invocable`。
- 实例会话记录：`~/.claude/projects/-data-qiwei-repos-omne-harness-lite/48ca2f39-….jsonl` 第 550 行（`version` 2.1.280）的展开正文以 `\n\nARGUMENTS: <用户输入>` 结尾——追加规则的实际行为。
- issue [#93076](https://github.com/anthropics/claude-code/issues/93076)（仍开）要求一行多个内建命令；[#85429](https://github.com/anthropics/claude-code/issues/85429)（仍开）：「Custom slash commands are prompts, so they can't trigger built-in commands」。
- 支持范围：文档 + 本机会话记录 + 用户报告。

### CC-7

**留痕：会话记录同时存「原命令」与「展开全文」两条；本地命令存「告诫 + 命令 + 输出」三条**

实测（本机会话记录，逐条 `type / isMeta / version / content 前缀`）：

| 命令 | 版本 | 记录（1 起行号） |
|---|---|---|
| `/worktree-discipline <参数>`（项目 skill） | 2.1.280 | 549：`user`，`<command-message>worktree-discipline</command-message><command-name>/worktree-discipline</command-name><command-args>…</command-args>`；550：`user`，`isMeta: true`，`Base directory for this skill: …` + SKILL.md 渲染正文 + `ARGUMENTS: …` |
| `/claude-api <参数>`（bundled skill） | 2.1.280 | 同形：命令标签一条 + `isMeta` 展开正文一条（`Base directory for this skill: /tmp/…/bundled-skills/2.1.280/…`） |
| `/model`（内建） | 2.1.280 | 4：`isMeta: true`，`<local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages …`；5：`<command-name>/model</command-name><command-message>model</command-message><command-args></command-args>`；6：`<local-command-stdout>Set model to …</local-command-stdout>` |
| `/tasks`（内建） | 2.1.280 | 同形三条，stdout 为 `(no content)` |
| `/compact`（内建） | 2.1.227 | 同形三条，stdout 为 `Compacted (ctrl+o to see full summary)` |
| `/goal <条件>`（内建） | 2.1.227 | 命令标签 + `<local-command-stdout>Goal set: …` + 一条 `isMeta` 用户消息「A session-scoped Stop hook is now active with condition: …」 |

- 文件：skill 与 `/model` 两例在 `-data-qiwei-repos-omne-harness-lite/48ca2f39-f62b-4f90-8cb5-874f5e1e667f.jsonl`；`/tasks` 在同目录 `64884cae-97fe-4fd3-9691-f9b73eb107b0.jsonl` 第 3829-3831 行；`/compact`、`/goal` 在 `-data-qiwei-repos-omne-next/1aed1884-935f-40d0-bbd1-b84c30402258.jsonl` 第 919-921、5479-5481 行。
- `slash-commands.txt:518`：「the rendered `SKILL.md` content enters the conversation as a single message and stays there across later turns」；`:522`：自动压缩后按预算重新附上最近一次调用的前 5 000 token，合计上限 25 000。
- 支持范围：会话记录是**落盘形态**；模型实际收到什么，本包只有两条间接依据——`local-command-caveat` 的措辞是写给模型的（「DO NOT respond to these messages」），以及文档说展开正文「enters the conversation」。**本地命令三条是否送入模型请求未核对**（未抓请求体）。

### CC-8

**发现与刷新：目录监视、手动重载、MCP 动态发现、账户同步轮询**

- `slash-commands.txt:252-260`：监视 `~/.claude/skills/`、项目 `.claude/skills/`、`--add-dir` 下的 `.claude/skills/`，会话内即时生效；新建顶层目录要重启；插件的 hooks / mcp / agents 变更要 `/reload-plugins`。
- `commands.txt:123-124`：`/reload-plugins`、`/reload-skills`。
- `slash-commands.txt:197`：账户同步 skill 约每 10 分钟检查一次。
- `mcp.txt:1527`：「MCP prompts are dynamically discovered from connected servers」。
- `commands.txt:167-174`：菜单过滤规则——只在名字或别名前缀 / 词内匹配时高亮；拼错时回车按原文提交并报 Unknown；不可用命令不进菜单；少数命令（如 `/heapdump`）故意隐藏，打全名才出现。
- 支持范围：文档。

### CC-9

**「谁可以用」：权限规则只管模型经 Skill 工具的调用；人敲的 `/skill` 绕过 PreToolUse，由 UserPromptExpansion 钩子拦**

- `slash-commands.txt:749-771`：`Skill` / `Skill(name)` / `Skill(name *)` 的 allow / deny 规则约束 **Claude** 能调哪些 skill；「A few built-in commands are also available through the Skill tool, including `/init` and `/security-review`. Other built-in commands such as `/compact` are not.」
- hooks 页 `:1403-1409`（同程 topic 钉存字节）：「a `PreToolUse` hook matching the `Skill` tool fires only when Claude calls the tool, but typing `/skillname` directly bypasses `PreToolUse`. `UserPromptExpansion` fires on that direct path.」；`:1413`：输入字段 `expansion_type`（`slash_command` 或 `mcp_prompt`）、`command_name`、`command_args`、`command_source`、原始 `prompt`；`:1430-1450`：可 `block` 或加 `additionalContext`。
- hooks 页 `:1355`：`UserPromptSubmit` 收到的 `prompt` 是提交文本，粘贴占位符已原位展开。
- `slash-commands.txt:783-815`：`skillOverrides` 四态（on / name-only / user-invocable-only / off），`off` 同时从 `/` 菜单隐藏，打全名调用返回错误；**插件 skill 不受它管**。
- `slash-commands.txt:530`：「Workspace trust doesn't gate this field」——项目 skill 的 `allowed-tools` 在未信任目录的 `-p` 运行里同样生效。
- `cli-reference.txt:83`：`--disable-slash-commands`「Disable all skills and commands for this session」。
- 支持范围：文档。**未核对**：内建本地命令（`local` / `local-jsx`）是否触发 `UserPromptSubmit`。

### CC-10

**运行中发命令：多数排队到本轮结束，少数立即执行**

- `commands.txt:15`：「If you send a command while Claude is responding, Claude Code queues it and runs it after the current turn finishes. Claude Code runs some commands immediately without interrupting the response, such as `/status`, `/tasks`, and `/usage`.」
- `interactive-mode.txt:352-369`：排队的普通消息可在工具调用结束后同一轮内送达；命令与 shell 命令要等本轮结束、按序逐条执行；`/model`、`/effort`、`/fast` 立即生效，是否作用于当前轮因命令而异。
- 支持范围：文档。

### CC-11

**协议变动频率（厂商自述里的版本注记）**

- `slash-commands.txt` 里出现 17 个不同的 `v2.1.x` 注记（v2.1.196 … v2.1.280），共 31 处；`commands.txt` 38 个（v2.1.91 … v2.1.269），共 64 处（`grep -o 'v2\.1\.[0-9]*'` 计数）。
- 与斜杠解析直接相关的行为变更：v2.1.199 起叠加多个 skill（`commands.txt:13`）；v2.1.236 起回车不再执行近似项（`errors.txt:2773`）；v2.1.273 / v2.1.274 未知命令改为送模型（`errors.txt:2769`）；v2.1.246 修正插件前缀重复（`slash-commands.txt:393`）；v2.1.269 起同步 skill 获得全名（`slash-commands.txt:224`）。
- 支持范围：文档自述的版本史，不是发布日志的完整核对。

## 局限

- 实例只做字符串探针。探针词：`<command-name>`、`<command-message>`、`<command-args>`、`<local-command-stdout>`、`local-command-caveat`、`Unknown command: `、`Did you mean`、`isMeta`、`UserPromptExpansion`、`expansion_type`、`disableSlashCommands`、`disable-slash-commands`、`mcp_prompt`、`userInvocable`、`user-invocable`、`ARGUMENTS:`、`skillOverrides`、`type:"local-jsx"`、`type:"local"`、`type:"prompt"`、`shouldQuery`、`isNonInteractiveSession`、`cmd_unknown`、`unknown_command_fallback`、`loadedFrom`；命中计数见[当轮报告](../reports/2026-09-23-slash-command-parsing.md#claude-code-实例探针)。未命中的情况本轮没有据以写负面结论。
- 会话记录只覆盖本机用过的命令；`/compact`、`/goal` 的样本来自 2.1.227，不是 2.1.280。
- 未对「项目 skill 与非 skill 内建命令同名」做实验。
