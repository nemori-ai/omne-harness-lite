# DeepSeek Harness `c291e796`：斜杠命令的识别、解析与留痕

- 原始出处：deepseek-ai/deepseek-harness @ `c291e7961a515f6d7af9304e7fd1d257929aef26`（`@deepseek-ai/dsh-root@0.1.5-rc.2`）。
- 取得方式：主检出 `tmp/sources/dsh-c291e79.tar.gz`（sha256 `f08cfc86…0860`，见同目录 `SHA256SUMS`）解包于 `tmp/sources/extracted/dsh/`；下文路径以解包根为起点。
- 来源立场：源码与 README、`docs/`、`.agents/notes/` 都是**上游作者自述**；未检索上游 issue tracker。
- 与已交付 topic 的关系：[连接件与斜杠命令的形状起点](../../connector-and-slash-command-sources/README.md) 的 E-S8、E-S9、E-S10、E-S13 已记下注册表、skill 手势、一包一命令与三类撞名。本页只补**识别、未知处理、留痕与性质划分**这几面，并纠正一处该 topic 未读到的行为（DS-4）。
- 消费对象：research.md 的 DSH 相关结论与对照表 DSH 列。

## 当前可消费观察

### DS-1

**宿主命令注册表：只认第 0 字节的 `/`，名字 `[a-z][a-z0-9_-]*`，名字后必须是行尾或空白；其后全部是 `rawInput`**

- `packages/interaction/commands/src/index.ts:125-132`：`parseCommand` 正则 `^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])`，不做前导空白裁剪，不裁 `rawInput`；`:32` 注册期名字校验同一字符集。
- `packages/interaction/commands/README.md:50`：「A command line starts with a slash at byte zero … Everything after the name — including separator whitespace — is the command's `rawInput`, and the command owns its own grammar for it.」
- 推断：`/usr/bin` 不满足「名字后是空白或行尾」（`r` 后是 `/`），`/Users/x` 首字母大写不满足字符集——两者都不被注册表认作命令。
- 支持范围：代码与 README 一致。

### DS-2

**skill 手势：整条用户消息里任意位置、被空白包围的 `/name` 都算，由宿主在每一步开始前扫描**

- `packages/skill/tool-skill/src/index.ts:400-409`：`SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g`；注释「A second `/` or any non-boundary character breaks the match, which keeps file paths (`/usr/bin`) and fractions (`5/8`) out」。
- `:411-431`：只扫 `source.kind === 'user'` 的消息，逐个文本块全局匹配。
- `:177-203`：在 `agent/pre-step` 上，查不到或不是 user-invocable 的名字「stay plain prose」；查到的把 `renderSkillContent(skill)` 作为一条 `source: {kind:'skill-invocation', name, form:'instructions'}` 的 user 消息**追加**到本步消息之后。
- `:163-176` 注释写的是「first line starts with `/<name>`」，与 `:400-431` 的实现（任意位置）不一致；README `packages/skill/tool-skill/README.md:226` 与实现一致。本包以实现为准（同 E-S9）。
- 推断：`see /tmp` 里的 `/tmp` 满足手势形状；若恰有名为 `tmp` 的 user-invocable skill，会被注入——手势形状本身不区分「路径的第一段」与「skill 名」。
- 支持范围：代码。

### DS-3

**Web 客户端的判定顺序：以 `/` 开头的草稿先轮询各来源的 `matchEnter`，第一个非空答复胜；无人认领就按普通 prompt 送出**

- `packages/client/ui-conversation/src/client/input/machine.ts:145-158`：`onEnter` 对 trim 后以 `/` 开头的草稿发 `adjudicate`；否则直接走默认发送。
- `packages/client/ui-input-trigger/src/client/controller.ts:330-353`：`adjudicate` 按注册顺序轮询，「first non-undefined wins … undefined (default sink)」。
- `machine.ts:162-181`：`outcome === undefined` 时 `detachedEffects` → `default-sink`；`packages/client/ui-conversation/src/client/input/facade.ts:721-737`：默认发送就是 `defaultSink(draft.trim(), …)`，即把文本作为 prompt 发给会话。
- `.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md:51`：「the pipeline polls in roster order, the first non-undefined answer wins, and no claimant means the default sink」；`:61`：发送统一走 `session.prompt`（`mode:'queue'`）。
- 支持范围：代码与作者笔记一致。

### DS-4

**未知 `/xxx`：宿主注册表查不到时返回「无结果」，Web 客户端随后把整行当普通 prompt 发出——与注册表 README 的「适配器拒收」说法冲突**

- `packages/client/ui-commands/src/client/service.ts:276-323`：`matchEnter` 查不到描述符（`:300-301`）或「非裸命令且无 `input` 声明」（`:318`）都返回 `undefined`，交回 DS-3 的默认发送。
- `packages/interaction/commands/src/index.ts:360-370`：`execute` 在语法不合或名字未知时返回 `undefined`，「Admission misses (syntax or unknown name) log nothing」（`:339-340`）。
- **冲突**：`packages/interaction/commands/README.md:50` 写「Lines that are not syntactically a command, or that name an unknown command, are rejected by the adapter instead of becoming a model prompt」；`.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.md:47,56` 记「unknown-command rejection」的 TUI 测试，并否决「Send unknown slash input to the model」。而本 SHA 里 `/` 的交互适配器只有 Web 客户端（`packages/client/`），它把无人认领的 `/xxx` 按 prompt 送出；作者笔记 `2026-07-25-web-input-machine-and-slash-pipeline.md:72` 也写「`/123` or a stray `/word` stays plain」。
- 读遍未找到：在 `packages/` 与 `apps/` 里以 `commands/change`、`remote.commands`、`ctx.commands`、`parseCommand` 为探针，只命中 Web 客户端、各 `command-*` 插件与会话控制器；没有终端 TUI 的 `/` 适配器。`apps/cli/README.md:28` 提到的 `tui` profile 注明「assuming the tui profile is installed」，不在本仓库。git 史未查。
- 支持范围：代码为准；README 与 2026-07-19 笔记的「拒收」在本 SHA 的 Web 路径上不成立。

### DS-5

**两种性质的分法：宿主命令是插件代码（handler），不产生模型消息；skill 手势是提示词注入；客户端自有命令是纯界面动作**

- `packages/interaction/commands/src/index.ts:61-78`：`CommandDefinition.handler` 注释「Execute against the receiving agent without sending the command to the model」。
- 本 SHA 的注册（`grep -rn "commands.register(\|commandUi.register(\|commandUi.decorate("`）：
  - 宿主命令：`/goal`（`packages/goal/command-goal/src/index.ts:191-197`，带附件时 `:119` `agent.followup(createUserMessage…)`）、`/plan`（`packages/plan/plan-mode/src/index.ts:226-231`，`/plan <message>` 在 `:255` `agent.steer(createUserMessage…)`）、`/compact`（`packages/compaction/command-compact/src/index.ts:101-106`，`:60-75` 带任何参数即报用法错误，否则 `compaction.compactNow`）、`/export`（`packages/session-query/session-log-export/src/index.ts:79-83`）、`/permission`（`packages/interaction/permission-presets/src/index.ts:257-262`）、`/feedback`（`packages/feedback/command-feedback/src/index.ts:119-124`）。
  - 客户端自有命令：`/file`（`packages/client/ui-conversation/src/client/apply.ts:214-219`，`kind:'action'` 打开文件选择）、`/model`（`packages/client/ui-model-selection/src/client/index.ts:144-150`，`kind:'popupSelect'`）。
  - 客户端装饰：`/feedback` 的裸调用改开对话框（`packages/client/ui-message-feedback/src/client/index.ts:114-117`）。
- `packages/client/ui-commands/src/client/resolution.ts:6-13,50-59`：六个一方命令（goal plan feedback compact permission export）按 `definitionId` 识别，另有中英本地化拼写别名（如 `/计划` → `plan`，`.agents/notes/implemented/architecture/2026-09-10-command-identities-and-composer-file-action.md:17-23`）。
- 支持范围：代码。完整清单与归类见[当轮报告](../reports/2026-09-23-slash-command-parsing.md#dsh-c291e796-内建清单)。

### DS-6

**留痕：宿主命令记成对的 log-only 事件；skill 手势记原文 + 一条注入消息；客户端自有命令不进会话**

- `packages/interaction/commands/src/index.ts:332-378`：解析成功才 `command/run`（含 `name`、默认含 `args: rawInput`、`source:{kind:'user'}`），结束后 `command/done`；「no turn wraps them」；`recordInput: false` 的命令不记参数（`:70-75`）。
- skill 手势：用户原文 `/name …` 经 `session.prompt` 作为用户消息进入（DS-3）；注入的 skill 正文是 pre-step 追加的一条 user 消息（DS-2）。`packages/skill/tool-skill/README.md:52,84,113` 写目录是「durable user-role message」、手势注入与工具结果共享同一渲染；pre-step 注入进入持久历史的写法另见 `packages/context/time-context/README.md:28`（「Each injection is one additional user-role message in the durable history」）。**推断**：手势注入的 skill 正文同样落在持久历史里（同一 pre-step 决策通路），tool-skill README 没有逐字这么写。
- 客户端 `action` / `popupSelect`：`contract.ts:42-54` 注明 action「submits nothing」。
- 支持范围：代码 + README；手势注入是否持久为推断。

### DS-7

**发现与刷新：宿主命令按 agent 取有效视图，注册变化广播 `commands/change`；skill 目录按会话缓存**

- `packages/interaction/commands/src/index.ts:314-320`：`list(agent)` 返回按名排序、作用域遮蔽后的描述符；`:475-489`：注册 / 注销时发 `commands/change`。
- `packages/client/ui-commands/src/client/service.ts:83-105`：客户端目录按会话缓存，收到 `commands/change` 全部失效，切换 agent preset 时重置该会话。
- `service.ts:197-223`：菜单行的描述来自宿主描述符 `description` 与 `input.hint`；一方命令换本地化文案；空查询分「Add」与「Commands」两段。
- `packages/client/ui-skill/src/client/index.ts:1-27,98-122`：skill 目录经 `skills/list` 按会话单飞缓存。
- 支持范围：代码。

### DS-8

**「谁可以用」与撞名：没有权限层；可用性等于插件组合；作用域遮蔽；三类名字的固定裁决**

- `packages/interaction/commands/src/index.ts:258-262,469-472`：全局定义被同名的 agent 作用域定义遮蔽；同一作用域重名注册即抛（`:101-104`）。
- `service.ts:209-213`：客户端自有命令与宿主命令同名，在候选合成时抛错（fail loud，不遮蔽）。
- skill 与宿主命令同名：宿主命令先认领（DS-3 轮询顺序 + `packages/client/ui-skill/README.md:12,28`，同 E-S13）。
- `packages/skill/skill/README.md:55-62`：`modelInvocable` / `userInvocable` 四种组合决定 skill 出现在哪个入口。
- 支持范围：代码与 README。

## 局限

- 未读 git 史：README 与 2026-07-19 笔记所说的 TUI 拒收未知命令，是否曾存在于更早的提交，本轮不知道。
- 未读候选合成之外的渲染代码：被宿主命令遮蔽的同名 skill 在菜单里有没有提示，仍未知（同 E-S13 的未知项）。
- 手势注入的持久性为推断（DS-6）。
