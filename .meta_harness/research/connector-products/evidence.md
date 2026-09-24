# 可复核的来源与观察

本页按来源分条：每条记精确 URL、访问日期（全部 **2026-09-24**）、取得方式、来源立场、逐句原文引述与支持范围。
结论只在 [research.md](research.md)；本页不复制结论，只让每条结论能指回这里的 `E-n`。

**字节钉住的来源**在 [sources/](sources/) 随包保存：`.md` 直出的页面为原样字节；`support.claude.com`、`docs.github.com`、`ifttt.com` 只有 HTML，
本地去标签成文本（不是原样字节，`provenance.json` 逐条标 `normalization`）。校验：`cd sources && sha256sum -c SHA256SUMS`。
只经 WebFetch（模型摘要）取得、未钉字节的观察，在条目里单独标「**仅 WebFetch 摘要**」，引述可能有截断。

**版本 token**（上游升级时 grep 本页与 `sources/`）：Claude Code 本机 `2.1.281`；channels-reference 页内最高提到 `v2.1.234`，routines 页内最高提到 `v2.1.268`，
`experimental-cc-routine-2026-04-01`；Claude Tag `Public Beta`；ChatGPT learn 页含「GPT-5.5 retires … October 14, 2026」；OpenAI plugins auth 引 MCP 授权规范 `2025-11-25`；
Slack manifest `_metadata.major_version 2 / minor_version 1`；IFTTT Service API `v1`。

---

## E1 Claude Help Center：自定义连接件（remote MCP）

- 消费对象：research.md 对照表「Claude.ai Connectors」列；结论 [C-1](research.md#c-1-两家主流产品里叫connector的东西都是拉取型集成方向与-pf-002-的连接件相反)、[C-4](research.md#c-4-鉴权粒度拉型-connector-默认一人一把组织共用是显式的第二种模式推型入口的鉴权是发送者白名单或令牌)。
- 来源与精确修订：`https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp`，2026-09-24 抓取；文本见 [sources/support-claude-custom-connectors-2026-09-24.txt](sources/support-claude-custom-connectors-2026-09-24.txt)。页面不标版本。
- 来源立场：厂商自述。
- 取得方式：`curl -sL` HTTP 200 后去标签；另经 WebFetch 交叉读过一次。
- 实际观察（原文）：
  - 「Custom connectors using remote MCP are available on Claude, Cowork, and Claude Desktop for users on Free, Pro, Max, Team, and Enterprise plans. Free users are limited to one custom connector.」
  - 「When you add a custom connector, Claude connects to your remote MCP server from Anthropic's cloud infrastructure, rather than from your local device.」
  - 「While anyone can build and host connectors using remote MCP, only Owners can add them to Team and Enterprise plans. Once a connector has been added to a Team or Enterprise organization, users individually connect to and enable that connector. This ensures that Claude can only access tools and data that the individual user has access to.」
  - 「When you add a custom connector to Claude, you'll typically go through an OAuth authentication process to securely sign in to the application and grant specific permissions. This allows Claude to interact with the application on your behalf, without Claude ever seeing your actual password.」
  - 「Review Claude's tool approval requests carefully and only click "Allow always" when using a server and tool that you trust to run unsupervised.」
  - 「Admin controls: Team and Enterprise plan owners can disable specific tool calls that render interactive connectors within Organization settings > Connectors.」
  - 工具能做的三类（WebFetch 摘要，原文位置未逐字核）：「Reading data from connected applications. Creating, modifying, or deleting data in connected applications. Taking actions on behalf of the user.」
- 支持范围：谁能加（Owner）、谁授权（个人 OAuth）、方向（Claude 发起连接与工具调用）。**不支持**：连接件能否向 Claude 推送——全文没有任何推送机制的描述，这是「读遍了没找到」，不是反例验证。
- 后续核对：无。

## E2 Claude Help Center：使用连接件（目录、组织启用、动作限制）

- 消费对象：对照表「Claude.ai Connectors」列；[C-1](research.md#c-1-两家主流产品里叫connector的东西都是拉取型集成方向与-pf-002-的连接件相反)、[C-4](research.md#c-4-鉴权粒度拉型-connector-默认一人一把组织共用是显式的第二种模式推型入口的鉴权是发送者白名单或令牌)、[C-6](research.md#c-6-权限与过滤都落在生产方或平台侧agent-一侧只做会话级开关先例把无门禁的推送入口明确当作注入向量)。
- 来源与精确修订：`https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities`，2026-09-24；文本见 [sources/support-claude-use-connectors-2026-09-24.txt](sources/support-claude-use-connectors-2026-09-24.txt)。
- 来源立场：厂商自述。
- 取得方式：同 E1。
- 实际观察（原文）：
  - 「You can find available connectors in the Connectors Directory, where each connector has a page detailing its use cases, read/write capabilities, and availability. You can also add custom connectors or connect to any service that supports MCP.」
  - 「Before members of Team and Enterprise plans can use connectors, an Owner or Primary Owner needs to enable them for the organization. Enabling a connector makes it available to your team, but it doesn't automatically grant anyone access. Each person still needs to authenticate individually before they can use it.」
  - 「Owners on Team and Enterprise plans can limit which actions a connected service can take across your organization. For example, you can allow a connector to read data from a service while preventing it from writing any changes back. This applies org-wide to everyone using the connector—individual users can't override it.」
  - 「Enable the specific services you want Claude to use for that conversation by toggling them on. Claude will now be able to use these services when relevant to your requests.」
  - 「Access permissions are enforced at the user level. Users need to authenticate with the third-party service when first using the connector, even after an Owner or Primary Owner enables it.」
- 支持范围：目录的存在与每页内容（用例、读/写能力、可用性）；组织启用≠授权；动作限制是组织级、用户不可覆盖；使用由 Claude 判断「when relevant」。
- 后续核对：无。

## E3 Claude Help Center：Enterprise-managed auth（组织一次授权）

- 消费对象：[C-4](research.md#c-4-鉴权粒度拉型-connector-默认一人一把组织共用是显式的第二种模式推型入口的鉴权是发送者白名单或令牌)。
- 来源与精确修订：`https://support.claude.com/en/articles/15537633-authorize-mcp-connectors-for-your-entire-organization`，2026-09-24；文本见 [sources/support-claude-managed-auth-2026-09-24.txt](sources/support-claude-managed-auth-2026-09-24.txt)。
- 来源立场：厂商自述。
- 实际观察（原文）：
  - 「Enterprise-managed auth is an authorization and authentication model for connectors in Claude. Instead of having every person authenticate each connector individually, admins provision connector access centrally through the organization's identity provider.」
  - 「Once you enable a connector for your organization, your team gets it automatically the first time they log in, with identity inherited from their existing identity provider groups and roles.」
  - 「Choose which permissions Claude can request when members connect through your identity provider, and narrow that further for individual roles.」
  - 「Claude relays the authorization your identity provider issues; access decisions, scoping, and the data each connector can reach are governed by your identity provider's policies and the connected service's permissions, not by Anthropic.」
  - 「Browser sign-in and Managed authorization can be on for a connector at the same time. When they are, Claude tries Managed authorization first and prompts the user to sign in individually if that fails」
  - 「Okta is supported at launch, with more identity providers coming soon.」
- 支持范围：组织级授权是**经 IdP 派生的个人身份**，不是一把组织共用的凭据；它与个人登录可并存，逐连接件、逐角色配。
- 后续核对：无。

## E4 claude.com 文档：Connectors overview 与 remote MCP

- 消费对象：[C-1](research.md#c-1-两家主流产品里叫connector的东西都是拉取型集成方向与-pf-002-的连接件相反)。
- 来源与精确修订：`https://claude.com/docs/connectors/overview.md`、`https://claude.com/docs/connectors/custom/remote-mcp.md`，2026-09-24 原样字节：
  [sources/claude-connectors-overview-2026-09-24.txt](sources/claude-connectors-overview-2026-09-24.txt)、[sources/claude-connectors-remote-mcp-2026-09-24.txt](sources/claude-connectors-remote-mcp-2026-09-24.txt)。
- 来源立场：厂商自述（面向开发者）。
- 实际观察（原文）：「Connectors can do two things: Provide tools and information — Give Claude access to external data and the ability to take actions (search files, read emails, create issues, etc.) · Surface UI components — Render interactive visual elements directly in the conversation through MCP Apps」；类型列举为 Prebuilt integrations / Remote MCP servers / MCP Apps / MCP Bundles / Self-serve local MCP。
- 支持范围：Anthropic 对「connector」一词的正式定义只有两件事，都是 Claude 出去取或 Claude 渲染；没有第三件「送事件进来」。
- 后续核对：无。

## E5 Claude Code：channels（把外部事件推进正在运行的会话）

- 消费对象：对照表「Claude Code channels」列；[C-2](research.md#c-2-推型先例存在但没有一家给推型入口一份可订阅的事件类型目录消息包形状)、[C-5](research.md#c-5-agent-看到什么先例里进上下文的是自由文本说明加带属性的事件标签不是结构化目录)、[C-6](research.md#c-6-权限与过滤都落在生产方或平台侧agent-一侧只做会话级开关先例把无门禁的推送入口明确当作注入向量)、[C-7](research.md#c-7-所有推型先例都不给外部来源读取面或管理面claude-code-唯一的例外是显式选入的权限中继)、[C-8](research.md#c-8-投递目标只有-claude-code-channels-送进已开着的会话其余推型先例一律一事件一新会话)。
- 来源与精确修订：`https://code.claude.com/docs/en/channels.md`，2026-09-24 原样字节 [sources/cc-channels-2026-09-24.txt](sources/cc-channels-2026-09-24.txt)。页面标「research preview」；本机 Claude Code `2.1.281`（未实测 channels）。
- 来源立场：厂商自述。
- 实际观察（原文）：
  - 「A channel is an MCP server that pushes events into your running Claude Code session, so Claude can react to things that happen while you're not at the terminal. Channels can be two-way: Claude reads the event and replies back through the same channel, like a chat bridge. Events only arrive while the session is open, so for an always-on setup you run Claude in a background process or persistent terminal.」
  - 「Unlike integrations that spawn a fresh cloud session or wait to be polled, the event arrives in the session you already have open」
  - 「You install a channel as a plugin and configure it with your own credentials.」
  - 「the model receives it as a `<channel source="plugin:fakechat:fakechat">` event, using the plugin's scoped server name.」
  - 「Every approved channel plugin maintains a sender allowlist: only IDs you've added can push messages, and everyone else is silently dropped.」
  - 「Being in `.mcp.json` isn't enough to push messages: a server also has to be named in `--channels`.」
  - 「The allowlist also gates permission relay if the channel declares it. Anyone who can reply through the channel can approve or deny tool use in your session, so only allowlist senders you trust with that authority.」
  - 「Admins control availability through two managed settings that users cannot override … `channelsEnabled` Master switch … `allowedChannelPlugins` Which plugins can register once channels are enabled. Replaces the Anthropic-maintained list when set.」「claude.ai Team and Enterprise: channels are blocked until an Owner enables them.」「In all cases, no channel runs until a user opts it in for the session with `--channels`.」
  - 「If the setting is disabled or unset, the MCP server still connects and its tools work, but channel messages won't arrive.」
  - 「During the preview, `--channels` only accepts plugins from an Anthropic-maintained allowlist, or from your organization's allowlist」
  - 对照表：「Standard MCP server | Claude queries it during a task; nothing is pushed to the session」「Claude in Slack | Spawns a cloud session from an `@Claude` mention in a channel or thread」；「Channels fill the gap in that list by pushing events from non-Claude sources into your already-running local session.」
  - 「If Claude hits a permission prompt while you're away from the terminal, the session pauses until you respond.」
- 支持范围：方向（推）、谁装（用户装插件、自带凭据）、谁管（组织 Owner 开关 + 插件白名单；用户逐会话 opt-in）、鉴权（发送者白名单）、投递目标（已开着的会话）、无人值守时权限提示会挂起会话。
- 不支持：channels 在 Bedrock/Vertex/Foundry 上的行为（页面明说不可用）；协议是否稳定（页面明说可能变）。
- 后续核对：无。

## E6 Claude Code：channels reference（协议、事件形状、模型看到什么）

- 消费对象：[C-2](research.md#c-2-推型先例存在但没有一家给推型入口一份可订阅的事件类型目录消息包形状)、[C-5](research.md#c-5-agent-看到什么先例里进上下文的是自由文本说明加带属性的事件标签不是结构化目录)、[C-7](research.md#c-7-所有推型先例都不给外部来源读取面或管理面claude-code-唯一的例外是显式选入的权限中继)、[C-8](research.md#c-8-投递目标只有-claude-code-channels-送进已开着的会话其余推型先例一律一事件一新会话)、[C-9](research.md#c-9-先例明确不做的事与-pf-002-的明确不承诺重叠的部分)。
- 来源与精确修订：`https://code.claude.com/docs/en/channels-reference.md`，2026-09-24 原样字节 [sources/cc-channels-reference-2026-09-24.txt](sources/cc-channels-reference-2026-09-24.txt)；页内提到 `v2.1.234`、`v2.1.211`。
- 来源立场：厂商自述。
- 实际观察（原文）：
  - 「Your server needs to: 1. Declare the `claude/channel` capability so Claude Code registers a notification listener 2. Emit `notifications/claude/channel` events when something happens 3. Connect over stdio transport」
  - Server options 表：「`instructions` | `string` | Recommended. Claude Code delivers it to Claude as context when the server connects. Tell Claude what events to expect, what the `<channel>` tag attributes mean, whether to reply, and if so which tool to use and which attribute to pass back (like `chat_id`).」
  - Notification format 表：「`content` | `string` | The event body. Delivered as the body of the `<channel>` tag.」「`meta` | `Record<string, string>` | Optional. Each entry becomes an attribute on the `<channel>` tag for routing context like chat ID, sender name, or alert severity. Keys must be identifiers: letters, digits, and underscores only. Keys containing hyphens or other characters are silently dropped.」
  - 「The event arrives in Claude's context wrapped in a `<channel>` tag. The `source` attribute is set automatically from your server's configured name」
  - 「Claude Code doesn't acknowledge notifications. The `await` on `mcp.notification()` resolves when the message is written to the transport, not when Claude has processed it. If the session hasn't loaded your server as a channel, or the organization policy blocks it, Claude Code drops the events silently and returns no error to your server.」
  - 「Events queue into the session and are processed in order. If several notifications arrive while Claude is busy, they're delivered together on the next turn and Claude handles them as a group. To process independent event streams concurrently, run separate sessions.」
  - 「An ungated channel is a prompt injection vector. Anyone who can reach your endpoint can put text in front of Claude.」「Gate on the sender's identity, not the chat or room identity」
  - 「Relay covers tool-use approvals like `Bash`, `Write`, and `Edit`. Project trust and MCP server consent dialogs don't relay; those only appear in the local terminal.」「Only declare the capability if your channel authenticates the sender, because anyone who can reply through your channel can approve or deny tool use in your session.」
  - permission_request 的四个字段：`request_id`、`tool_name`、`description`、`input_preview`；回程 `notifications/claude/channel/permission` 带 `request_id` 与 `behavior: 'allow' | 'deny'`。
  - 「One-way channels forward alerts, webhooks, or monitoring events for Claude to act on. Two-way channels like chat bridges also expose a reply tool so Claude can send messages back.」
- 支持范围：事件形状（`content` + 扁平字符串 `meta`）、目录的承载物（`instructions` 自由文本）、无确认、静默丢弃、批量合并、回复靠标准 MCP tool、权限中继的边界。
- 不支持：`instructions` 注入上下文的确切位置与时机（页面只说 when the server connects）；被丢弃的 meta 键是否有日志。
- 后续核对：无。

## E7 Claude Code：routines（API 触发与 GitHub 事件触发）

- 消费对象：对照表「Claude Code routines」列；[C-2](research.md#c-2-推型先例存在但没有一家给推型入口一份可订阅的事件类型目录消息包形状)、[C-4](research.md#c-4-鉴权粒度拉型-connector-默认一人一把组织共用是显式的第二种模式推型入口的鉴权是发送者白名单或令牌)、[C-5](research.md#c-5-agent-看到什么先例里进上下文的是自由文本说明加带属性的事件标签不是结构化目录)、[C-8](research.md#c-8-投递目标只有-claude-code-channels-送进已开着的会话其余推型先例一律一事件一新会话)。
- 来源与精确修订：`https://code.claude.com/docs/en/routines.md`，2026-09-24 原样字节 [sources/cc-routines-2026-09-24.txt](sources/cc-routines-2026-09-24.txt)；「research preview」；beta 头 `experimental-cc-routine-2026-04-01`；页内提到 `v2.1.268`。
- 来源立场：厂商自述。
- 实际观察（原文）：
  - 「A routine is a saved Claude Code configuration: a prompt, one or more repositories, and a set of connectors, packaged once and run automatically.」三种触发：Scheduled / API / GitHub。
  - 「Team and Enterprise Owners can disable routines for all members with the Routines toggle」；「Routines belong to your individual claude.ai account. They are not shared with teammates」；「Anything a routine does through your connected GitHub identity or connectors appears as you」
  - 「When a trigger fires, the session receives the routine's saved prompt as its assigned task and carries it out, rather than treating it as untrusted content that arrived mid-conversation. The trigger attests only that the prompt was stored ahead of time by an authorized session on your account, so the fired prompt is not live user input and can't act as approval or consent for actions during the run.」
  - API 触发：「Each routine has its own token, scoped to triggering that routine only.」「The request body accepts an optional `text` field … The value is freeform text and is not parsed: if you send JSON or another structured payload, the routine receives it as a literal string.」「The `text` value doesn't reach the routine as a bare message. It arrives wrapped in a `<routine-fire-payload>` block that labels it as untrusted data and tells Claude not to follow instructions inside it unless the routine's own prompt says to.」「Anyone holding the bearer token can send `text`, so the wrapper makes fire text from a leaked token arrive labeled as untrusted data rather than as direct instructions to your routine.」
  - GitHub 触发：「A GitHub trigger starts a new session automatically when a matching event occurs on a connected repository. Claude Code doesn't reuse sessions across events, so two PR updates produce two independent sessions.」「The Claude GitHub App must be installed on the repository you want to subscribe to」；支持事件表只有 Pull request 与 Release 两类，「Within each category you can pick a specific action, such as `pull_request.opened`, or react to all actions in the category.」；过滤字段 Author/Title/Body/Base branch/Head branch/Labels/Is draft/Is merged，操作符 equals/contains/starts with/is one of/is not one of/matches regex。
  - 「During the research preview, GitHub webhook events are subject to per-routine and per-account hourly caps. Events beyond the limit are dropped until the window resets.」
  - 「Under Connectors at the bottom of the form, all of your connected MCP connectors are included by default. Remove any the routine doesn't need: Claude can use every tool from an included connector, including writes, without asking for permission during a run.」
- 支持范围：推型入口的三种鉴权（每 routine 一把 bearer token；GitHub App 安装；用户自己的账号）、平台侧固定的事件目录（两类）与用户配的订阅+过滤、一事件一会话、事件正文进上下文时的不可信包装。
- 不支持：GitHub 事件 payload 里有哪些字段进到会话（页面未述）。
- 后续核对：无。

## E8 Claude Code in Slack（个人账号版，正在被 Claude Tag 取代）

- 消费对象：对照表「Claude Tag／Claude Code in Slack」列；[C-8](research.md#c-8-投递目标只有-claude-code-channels-送进已开着的会话其余推型先例一律一事件一新会话)。
- 来源与精确修订：`https://code.claude.com/docs/en/slack.md`，2026-09-24 原样字节 [sources/cc-slack-2026-09-24.txt](sources/cc-slack-2026-09-24.txt)。页首 Warning：「Anthropic is retiring this version in favor of Claude Tag」。
- 来源立场：厂商自述。
- 实际观察（原文）：
  - 「A workspace administrator must install the Claude app from the Slack App Marketplace.」；用户「Connect your Claude account」
  - 「Each session runs under your own Claude account, using your connected repositories and your plan limits.」
  - 「When you @mention Claude in a thread, it gathers context from all messages in that thread … When mentioned directly in a channel, Claude looks at recent channel messages for relevant context.」「Claude may follow directions from other messages in the context, so users should make sure to only use Claude in trusted Slack conversations.」
  - 「Claude responds to @mentions only in channels where it has been added; invite it with `/invite @Claude`.」「Admins can control who uses Claude Code by managing which channels Claude is invited to and who has access to those channels.」
  - 「Claude Code in Slack only works in channels (public or private). It does not work in direct messages (DMs).」
- 支持范围：Slack 装 app 是工作区管理员，Claude 账号是个人；一次 @ 一个云会话；进入上下文的是线程/频道消息（连带注入风险）。
- 后续核对：无。

## E9 Claude Tag（组织共享身份的 @Claude）

- 消费对象：对照表「Claude Tag／Claude Code in Slack」列；[C-4](research.md#c-4-鉴权粒度拉型-connector-默认一人一把组织共用是显式的第二种模式推型入口的鉴权是发送者白名单或令牌)、[C-8](research.md#c-8-投递目标只有-claude-code-channels-送进已开着的会话其余推型先例一律一事件一新会话)、[C-9](research.md#c-9-先例明确不做的事与-pf-002-的明确不承诺重叠的部分)、[C-10](research.md#c-10-送进来的消息按什么身份处理先例分成三种落法没有一家把处理身份挂在入口上让外部选)。
- 来源与精确修订：`https://claude.com/docs/claude-tag/concepts/how-it-works.md`、`…/concepts/agent-identity.md`、`…/users/proactivity.md`，2026-09-24 原样字节：
  [sources/claude-tag-how-it-works-2026-09-24.txt](sources/claude-tag-how-it-works-2026-09-24.txt)、[sources/claude-tag-agent-identity-2026-09-24.txt](sources/claude-tag-agent-identity-2026-09-24.txt)、[sources/claude-tag-proactivity-2026-09-24.txt](sources/claude-tag-proactivity-2026-09-24.txt)。三页都标「public beta」。
- 来源立场：厂商自述。
- 实际观察（原文）：
  - 「When someone tags Claude in at a channel's top level, the channel's own session picks the message up. A task that needs investigation, tools, or a longer exchange gets a working session in a thread under the message, and that thread binds to its own session from then on.」「Two threads in the same channel are two separate sessions with separate sandboxes」
  - 「In a channel, it acts with the connections an organization admin set for that channel, and the work is attributed to its own accounts. In a DM, the same engine runs with your own claude.ai connectors, and the work is attributed to you」
  - 「Agent identity: in channels, Claude acts under its own service accounts that an admin provisions, not as the person who asked. What it can reach is set per channel, so everyone in a channel works with the same access.」
  - 「Claude Tag's connections authenticate the agent itself with service accounts, not any person.」
  - 「Anyone in the channel can steer a running session by replying in its thread, not just the person who started it.」
  - 「Claude also stops reading a channel's top-level messages once about 100 of them have arrived since it last posted or replied there.」
  - Agent Proxy：「The credentials you provision are not placed in the sandbox; they stay in the credential store and are injected at the proxy.」
  - proactivity：「A subscription is the one way Claude reacts to GitHub events; it wakes on activity on that pull request, such as a comment, a failed check, or a merge. You can't set up a routine from Slack that fires on other repository events, such as every new pull request.」「Claude doesn't post job output to private channels, DMs, group DMs, or externally shared channels, and doesn't message people directly.」
- 支持范围：组织级共享身份（服务账号）是与个人身份并列的**第二种模式**，按频道配、按频道求访问；触达点是 mention/线程/频道 watch；处理身份 = 频道配置，不由发送者决定。
- 后续核对：无。

## E10 Claude Cowork：scheduled tasks

- 消费对象：[C-9](research.md#c-9-先例明确不做的事与-pf-002-的明确不承诺重叠的部分)。
- 来源与精确修订：`https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork`，2026-09-24；文本见 [sources/support-claude-cowork-scheduled-2026-09-24.txt](sources/support-claude-cowork-scheduled-2026-09-24.txt)。
- 来源立场：厂商自述。
- 实际观察（原文）：「Each scheduled task runs as its own Cowork session.」「Scheduled tasks run remotely, so they run on their cadence even when your computer is asleep or the Claude Desktop app is closed.」「Scheduled tasks use the built-in schedule options and work with your connectors and the files saved to your Claude account.」
- 支持范围：只有时间触发；全文没有 webhook/事件触发（读遍未找到）。
- 后续核对：无。

## E11 ChatGPT（learn.chatgpt.com）：scheduled tasks 的应用事件触发

- 消费对象：对照表「ChatGPT 事件触发的 scheduled tasks」列；[C-2](research.md#c-2-推型先例存在但没有一家给推型入口一份可订阅的事件类型目录消息包形状)、[C-3](research.md#c-3-成熟的事件目录范式把目录放在事件生产方由应用作者声明订阅被安装方授权每类事件绑一个权限范围)、[C-6](research.md#c-6-权限与过滤都落在生产方或平台侧agent-一侧只做会话级开关先例把无门禁的推送入口明确当作注入向量)、[C-8](research.md#c-8-投递目标只有-claude-code-channels-送进已开着的会话其余推型先例一律一事件一新会话)、[C-9](research.md#c-9-先例明确不做的事与-pf-002-的明确不承诺重叠的部分)。
- 来源与精确修订：`https://learn.chatgpt.com/docs/automations.md`，2026-09-24 原样字节 [sources/openai-learn-automations-2026-09-24.txt](sources/openai-learn-automations-2026-09-24.txt)。页面不标版本；页内有「GPT-5.5 retires … on October 14, 2026」可作时间锚。
- 来源立场：厂商自述。
- 取得方式：`curl -sL`（先由 WebFetch 从 `learn.chatgpt.com/docs/llms.txt` 定位到该页）。
- 实际观察（原文，「Trigger tasks from app events」节）：
  - 「On eligible plans, scheduled tasks can run when a supported Gmail, Slack, or GitHub event occurs. Event-triggered tasks are available in ChatGPT on the web and mobile. They aren't available in the ChatGPT desktop app, Codex CLI, or the IDE extension.」
  - 「Ask ChatGPT to create the task, then describe the event to watch for and what to do when it happens. The trigger determines when the task runs; the saved prompt determines what each run does. One task can use multiple event triggers, but it can't combine event triggers with a time-based schedule.」
  - 「Supported event triggers include: Gmail: New incoming messages, optionally filtered by sender or subject. Slack: New messages in selected channels, optionally filtered by author and whether thread replies are included. Reactions, edits, deletes, and direct messages aren't supported. GitHub: Pull request activity in a repository. Filter by pull request, author, title, or label, and choose whether reviews, comments, commit updates, or only merges should trigger the task.」
  - 「Connect and authorize the app before creating the task. For Slack, add `@ChatGPT` to every channel the task watches. For GitHub, the connected app must have access to the repository.」
  - 「When several matching events arrive close together, ChatGPT may combine them in one run. Open Scheduled to review pending events or choose Run now to process them.」
  - 「Availability depends on your plan and workspace settings. In managed workspaces, administrators can control access with the Allow event-triggered scheduled tasks permission.」
  - 其他：「Scheduled tasks on the web can use uploaded files, connected tools, skills, and plugins available to that chat.」「Standalone scheduled tasks start a new chat for each scheduled run and report results in Scheduled.」「Scheduled tasks run unattended and use your default sandbox settings.」
- 支持范围：OpenAI 有一条「外部事件 → 启动一次 agent 运行」的正式产品路径；目录固定在平台侧（3 个 app，每个 app 若干事件），订阅与过滤由用户逐任务配，先决条件是用户已授权该 app（即拉型 connector 的同一份授权）。
- 不支持：事件 payload 以什么形状进到运行（**未述**）；模型上下文里有没有事件类型的说明（未述）。
- 后续核对：无。

## E12 ChatGPT（learn.chatgpt.com）：Plugin controls 与 ChatGPT Work overview（管理员、同步、共享连接）

- 消费对象：对照表「ChatGPT connectors／plugins」列；[C-1](research.md#c-1-两家主流产品里叫connector的东西都是拉取型集成方向与-pf-002-的连接件相反)、[C-4](research.md#c-4-鉴权粒度拉型-connector-默认一人一把组织共用是显式的第二种模式推型入口的鉴权是发送者白名单或令牌)、[C-6](research.md#c-6-权限与过滤都落在生产方或平台侧agent-一侧只做会话级开关先例把无门禁的推送入口明确当作注入向量)。
- 来源与精确修订：`https://learn.chatgpt.com/docs/enterprise/apps-and-connectors.md`、`https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview.md`，2026-09-24 原样字节：
  [sources/openai-learn-plugin-controls-2026-09-24.txt](sources/openai-learn-plugin-controls-2026-09-24.txt)、[sources/openai-learn-work-overview-2026-09-24.txt](sources/openai-learn-work-overview-2026-09-24.txt)。
- 来源立场：厂商自述。
- 实际观察（原文）：
  - 「In this guide, app and MCP server refer to the same connected integration and are interchangeable terms.」
  - 「A member can use an MCP server's capabilities only when the plugin and MCP server are available to their role and they have access to the connected service.」
  - 六层 capability chain 表：Availability / Included skills / MCP server access / Actions and permissions / Service authorization / Runtime permissions。
  - 「Enable MCP server connections and assign access by workspace role. · For connections that support Action control, allow read-only actions or an approved custom set, including how the workspace handles newly added actions. · Set App permissions that determine when ChatGPT asks before using a connection. · Keep access within the scopes and permissions granted by each connected service and authenticated user.」
  - 「When ChatGPT uses an MCP server included with a plugin, it sends a request to the connected service and returns data or action results allowed by the authenticated user's permissions in that service.」
  - 「Non-synced: ChatGPT processes data from Chat and deep research transiently and doesn't index it. Synced: ChatGPT indexes selected connected content in advance.」
  - Work overview：「The required connection must be authorized for an individual, shared, or agent-owned account before ChatGPT Work can access it. A shared or agent-owned connection uses the connected account's source-system permissions, which can differ from the requesting user's permissions.」「For Enterprise and Edu workspaces, plugins and their underlying apps are off by default」
- 支持范围：OpenAI 的 connector = MCP server = app，全部是「ChatGPT 发请求」；鉴权三种账号（individual / shared / agent-owned）；管理员管可用性、角色、动作集与「何时先问」。
- 后续核对：无。

## E13 ChatGPT（learn.chatgpt.com）：Plugins（安装与使用）

- 消费对象：[C-1](research.md#c-1-两家主流产品里叫connector的东西都是拉取型集成方向与-pf-002-的连接件相反)、[C-5](research.md#c-5-agent-看到什么先例里进上下文的是自由文本说明加带属性的事件标签不是结构化目录)。
- 来源与精确修订：`https://learn.chatgpt.com/docs/plugins.md`，2026-09-24 原样字节 [sources/openai-learn-plugins-2026-09-24.txt](sources/openai-learn-plugins-2026-09-24.txt)。
- 来源立场：厂商自述。
- 实际观察（原文）：「A plugin can prompt you to connect an external service before its tools become available.」「Some plugins ask you to authenticate during install. Others wait until the first time you use them.」「Review and approve the plugin's requested permissions as a separate step before using the connection.」「Use this when you want ChatGPT to choose the right installed tools for the task.」（WebFetch 另摘到「Type `@` to invoke the plugin or one of its bundled skills explicitly.」——仅 WebFetch 摘要，未在原样字节中逐字核到，该句可能来自 ContentModeSwitch 的另一 surface 分支）。
- 支持范围：使用方式是模型自选或用户 `@` 点名；没有插件主动向用户/模型推消息的描述（读遍未找到；唯一相近的是 Apple Messages 插件的**发送**须用户批准，那是出站）。
- 后续核对：无。

## E14 OpenAI developers：plugins 的 MCP server 概念与鉴权

- 消费对象：[C-1](research.md#c-1-两家主流产品里叫connector的东西都是拉取型集成方向与-pf-002-的连接件相反)、[C-4](research.md#c-4-鉴权粒度拉型-connector-默认一人一把组织共用是显式的第二种模式推型入口的鉴权是发送者白名单或令牌)。
- 来源与精确修订：`https://developers.openai.com/plugins/concepts/mcp-server.md`、`https://developers.openai.com/plugins/build/auth.md`，2026-09-24 原样字节：
  [sources/openai-plugins-mcp-server-concept-2026-09-24.txt](sources/openai-plugins-mcp-server-concept-2026-09-24.txt)、[sources/openai-plugins-auth-2026-09-24.txt](sources/openai-plugins-auth-2026-09-24.txt)。auth 页引 MCP 授权规范 `2025-11-25`。
- 来源立场：厂商自述（面向开发者）。
- 实际观察（原文）：
  - 「How tool calls work — When a user asks for something that matches a tool: 1. The client discovers the tools exposed by the MCP server. 2. The model selects a tool and supplies arguments that match its input schema. 3. The server validates the request, performs the operation, and returns a result. 4. The model uses the result to continue the conversation.」
  - 「Each tool has a name, description, input schema, and optional output schema. These fields help the model decide when to call the tool and how to use its result.」
  - auth：「When the user first invokes a tool, the ChatGPT client launches the OAuth authorization code + PKCE flow. The user authenticates and consents to the requested scopes.」「ChatGPT does not support machine-to-machine OAuth grants such as client credentials, service accounts, or JWT bearer assertions, nor can it present custom API keys or customer-provided mTLS certificates.」
- 支持范围：整个交互由「用户问 → 模型选工具」发起；鉴权一律走用户授权码流，不支持机器对机器凭据。
- 不支持：是否存在服务器发起的通知进入 ChatGPT（读遍未找到；MCP 协议本身有 notifications，但 OpenAI 文档未述其消费）。
- 后续核对：无。

## E15 OpenAI API：MCP 与 connectors（Responses API）

- 消费对象：[C-1](research.md#c-1-两家主流产品里叫connector的东西都是拉取型集成方向与-pf-002-的连接件相反)。
- 来源与精确修订：`https://developers.openai.com/api/docs/guides/tools-connectors-mcp.md`，2026-09-24 原样字节 [sources/openai-api-connectors-mcp-2026-09-24.txt](sources/openai-api-connectors-mcp-2026-09-24.txt)。页内注明「`connector_id` is deprecated for models released after September 1」。
- 来源立场：厂商自述。
- 实际观察（原文）：「The Responses API has built-in support for a limited set of connectors to third-party services. These connectors let you pull in context from popular applications, like Dropbox and Gmail, to allow the model to interact with popular services.」「Connectors require an OAuth access token provided by your application in the `authorization` parameter.」「you must send the `authorization` value in every Responses API creation request you make.」「you can use the `allowed_tools` parameter to only import those tools.」`require_approval` 可为 `always`/`never`/按工具列表。
- 支持范围：API 侧「connector」= 带 `connector_id` 的 MCP 工具，一样是拉；凭据由调用方逐请求携带。
- 后续核对：无。

## E16 OpenAI API：webhooks（OpenAI → 开发者的推送；只作目录范式参照）

- 消费对象：对照表二「OpenAI API webhooks」列；[C-3](research.md#c-3-成熟的事件目录范式把目录放在事件生产方由应用作者声明订阅被安装方授权每类事件绑一个权限范围)、[C-7](research.md#c-7-所有推型先例都不给外部来源读取面或管理面claude-code-唯一的例外是显式选入的权限中继)。
- 来源与精确修订：`https://developers.openai.com/api/docs/guides/webhooks.md`，2026-09-24 原样字节 [sources/openai-api-webhooks-2026-09-24.txt](sources/openai-api-webhooks-2026-09-24.txt)；事件清单页 `https://developers.openai.com/api/docs/api-reference/webhook-events` **仅 WebFetch 摘要**（21 个事件名与一行说明；未钉字节）。
- 来源立场：厂商自述。
- 实际观察（原文）：
  - 「OpenAI webhooks allow you to receive real-time notifications about events in the API … Webhooks are delivered to an HTTP endpoint you control, following the Standard Webhooks specification.」
  - 「You will configure three things: … One or more event types to subscribe to. When they occur, OpenAI will send an HTTP POST request to the URL specified.」
  - 信封示例：`"object": "event"`, `"id": "evt_…"`, `"type": "response.completed"`, `"created_at": …`, `"data": { "id": "resp_abc123" }`。
  - 「If the endpoint doesn't return a successful (`2xx`) status code, or doesn't respond within a few seconds, the webhook request will be retried. OpenAI will continue to attempt delivery for up to 72 hours with exponential backoff.」
  - 「The headers sent along with webhook requests contain information that can be used in combination with a webhook secret key to verify that the webhook originated from OpenAI.」
- 支持范围：「薄信封」范式——`data` 只带资源 id，要动手就得回头 GET；目录由生产方（OpenAI）固定，订阅在 dashboard 逐端点配。
- 后续核对：无。

## E17 OpenAI Help Center 五篇（不可访问，仅待验证命题）

- 消费对象：对照表「ChatGPT connectors／plugins」列里标「未核」的格；[未知表](research.md#未知与下一项证据)。
- 来源与精确修订：`https://help.openai.com/en/articles/11487775-connectors-in-chatgpt`、`…/10847137-chatgpt-synced-connectors`（现题「ChatGPT apps with sync」）、`…/11509118-admin-controls-security-and-compliance-in-apps-…`、`…/10291617-scheduled-tasks-in-chatgpt`、`…/12293630-chatgpt-pulse`；`https://openai.com/index/introducing-chatgpt-pulse/`。
- 取得方式：2026-09-24 WebFetch、`curl`（带浏览器 UA）、`r.jina.ai` 代理三种方式**全部 HTTP 403**（Cloudflare「Just a moment…」）；`web.archive.org` 被本环境禁止抓取。
- 实际观察：**没有原文。** 只有 WebSearch 结果页的摘要（二手转述）：
  - 「Connectors are still in beta and defaulted off for Enterprise & Edu plans, but admins can enable them for their workspace in Settings.」（搜索摘要）
  - 「ChatGPT builds an internal, indexed copy of the data」（搜索摘要，与 E12「Synced」一致）
  - Pulse：「ChatGPT proactively does research to deliver personalized updates based on your chats, feedback, and connected apps like your calendar」「Pulse is a mobile-only feature … limited to … Pro subscribers」（搜索摘要，日期不明）
  - Tasks：「Users can create one-off tasks, recurring jobs, and monitoring tasks」「new Scheduled page in the ChatGPT sidebar」（搜索摘要）
- 支持范围：**只能作为待验证命题**；本轮所有关于 OpenAI 的事实都改由 E11–E16（learn.chatgpt.com 与 developers.openai.com，第一方且可抓）承载。Pulse 因此在本轮没有可引用的第一方事实，只能记「存在一个把连接的应用数据用于主动生成每日简报的功能」为待验证。
- 后续核对：有人能从可访问网络抓到这五页时补钉。

## E18 Slack Events API、事件参考页与 App Manifest

- 消费对象：对照表二「Slack Events API」列；[C-3](research.md#c-3-成熟的事件目录范式把目录放在事件生产方由应用作者声明订阅被安装方授权每类事件绑一个权限范围)、[C-4](research.md#c-4-鉴权粒度拉型-connector-默认一人一把组织共用是显式的第二种模式推型入口的鉴权是发送者白名单或令牌)、[C-6](research.md#c-6-权限与过滤都落在生产方或平台侧agent-一侧只做会话级开关先例把无门禁的推送入口明确当作注入向量)、[C-7](research.md#c-7-所有推型先例都不给外部来源读取面或管理面claude-code-唯一的例外是显式选入的权限中继)。
- 来源与精确修订：`https://docs.slack.dev/apis/events-api.md`、`https://docs.slack.dev/reference/events/app_mention.md`、`https://docs.slack.dev/reference/app-manifest.md`，2026-09-24 原样字节：
  [sources/slack-events-api-2026-09-24.txt](sources/slack-events-api-2026-09-24.txt)、[sources/slack-app-mention-2026-09-24.txt](sources/slack-app-mention-2026-09-24.txt)、[sources/slack-app-manifest-2026-09-24.txt](sources/slack-app-manifest-2026-09-24.txt)（manifest `_metadata` 2.1）。事件索引页 `https://docs.slack.dev/reference/events` 仅 WebFetch 摘要（两列：名称、描述）。
- 来源立场：厂商自述（规范性参考）。
- 实际观察（原文）：
  - 「Subscribe to only the events you want; don't worry about the ones you don't need.」
  - 「The Events API leverages Slack's existing object-driven OAuth scope system to control access to events. For example, if your app has access to files through the `files:read` scope, you can choose to subscribe to any or none of the file-related events such as `file_created` and `file_deleted`.」
  - 「While managing your app in the app settings, find the Event Subscriptions setting and use the toggle to turn it on.」「If workspaces have already installed your application, your request URL will soon begin receiving your configured event subscriptions.」
  - 信封：`type: event_callback`、`token`、`team_id`、`api_app_id`、`event{type,event_ts,user,…}`、`event_context`、`event_id`、`event_time`、`authorizations[{enterprise_id,team_id,user_id,is_bot,is_enterprise_install}]`、`is_ext_shared_channel`、`context_team_id`、`context_enterprise_id`。
  - 「Installations are defined by a combination of the installing Enterprise org, workspace, and user … The `authorizations` property describes one of the installations that this event is visible to. You'll receive a single event for a piece of data intended for multiple users in a workspace, rather than a message per user. Use the `apps.event.authorizations.list` API method to retrieve all authorizations.」
  - 「Your app should respond to the event request with an HTTP 2xx within three seconds. If it does not, we'll consider the event delivery attempt failed. After a failure, we'll retry three times, backing off exponentially.」「When your application enters any combination of these failure conditions for more than 95% of delivery attempts within 60 minutes, your application's event subscriptions will be temporarily disabled」
  - 订阅变更三条：「Adding event subscriptions you already have scopes for … you'll begin receiving `file_created` events as soon as you update your subscription.」「Adding event subscriptions you aren't yet scoped for … You must send your existing users through the OAuth flow again, requesting the `files:read` scope.」「Removing event subscriptions, regardless of granted scopes: Events will immediately stop being sent for all users who have installed your app.」
  - manifest：「`settings.event_subscriptions.bot_events` — An array of strings matching the event types you want to the app to subscribe to. A maximum of 100 event types can be used.」「`settings.event_subscriptions.user_events` — An array of strings matching the event types you want to the app to subscribe to on behalf of authorized users. A maximum of 100 event types can be used.」`oauth_config.scopes.bot` / `.user` 为安装时请求的 scope 数组。
  - `app_mention` 参考页：所需 scope `app_mentions.read`；「Works with: Events」；示例 payload 含完整外层信封（仅 WebFetch 摘要转录，与 events-api 页字段一致）。
- 支持范围：目录在生产方（每事件一页：说明、scope、payload）；订阅由**应用作者**在 manifest/设置里声明（bot 与 user 两组）；授权由**安装工作区/用户**在 OAuth 时按 scope 给；缺 scope 则收不到；一事件一次投递、可见性另查（读取面）。
- 后续核对：无。

## E19 GitHub Webhooks（目录、创建权限、GitHub App 权限→事件）

- 消费对象：对照表二「GitHub Webhooks」列；[C-3](research.md#c-3-成熟的事件目录范式把目录放在事件生产方由应用作者声明订阅被安装方授权每类事件绑一个权限范围)、[C-4](research.md#c-4-鉴权粒度拉型-connector-默认一人一把组织共用是显式的第二种模式推型入口的鉴权是发送者白名单或令牌)。
- 来源与精确修订：`https://docs.github.com/en/webhooks/webhook-events-and-payloads`、`https://docs.github.com/en/webhooks/about-webhooks`、`https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks`，2026-09-24 去标签文本：
  [sources/github-webhook-events-2026-09-24.txt](sources/github-webhook-events-2026-09-24.txt)、[sources/github-about-webhooks-2026-09-24.txt](sources/github-about-webhooks-2026-09-24.txt)、[sources/github-creating-webhooks-2026-09-24.txt](sources/github-creating-webhooks-2026-09-24.txt)。
  `…/validating-webhook-deliveries` 仅 WebFetch 摘要。docs.github.com 不标版本（默认 Free/Pro/Team 视图）。
- 来源立场：厂商自述。
- 实际观察（原文）：
  - 「When you create a webhook, you specify a URL and subscribe to events that occur on GitHub. When an event that your webhook is subscribed to occurs, GitHub will send an HTTP request with data about the event to the URL that you specified.」
  - 「You must create a webhook within a specific repository, organization, GitHub Marketplace account, GitHub Sponsors account, or GitHub App. The webhook can only access resources that are available in the … where it is installed.」
  - 「You must be a repository owner or have admin access in the repository to create webhooks in that repository.」「You must be an organization owner to create webhooks in that organization.」
  - 「Under "Which events would you like to trigger this webhook?", select the webhook events that you want to receive. You should only subscribe to the webhook events that you need.」「If you chose Let me select individual events, select the events that you want to trigger the webhook.」
  - 「The specific webhook events that you can select for your GitHub App registration are determined by the type of permissions you selected for your app. You will first need to select the permissions you would like your app to have, and then you can subscribe your app to webhook events that are related to that set of permissions.」
  - 「Each webhook event on this page includes a description of the webhook properties for that event. If the event has multiple actions, the properties corresponding to each action are included.」「Each event is only available to specific types of webhooks. For example, an organization webhook can subscribe to the `team` event, but a repository webhook cannot.」
  - 「To subscribe to this event, a GitHub App must have at least read-level access for the "Checks" repository permission. To receive the rerequested and requested_action event types, the app must have at least write-level access for the "Checks" permission. GitHub Apps with write-level access for the "Checks" permission are automatically subscribed to this webhook event.」
  - 「Payloads are capped at 25 MB. If an event generates a larger payload, GitHub will not deliver a payload for that webhook event.」
  - 校验（仅 WebFetch 摘要）：「The hash signature will appear in each delivery as the value of the `X-Hub-Signature-256` header.」「GitHub uses an HMAC hex digest to compute the hash.」
- 支持范围：目录在生产方且按 webhook 类型分可用性；订阅由**资源管理员**在创建 webhook 时勾选（每 webhook 一份）或由 App 作者按权限勾选；权限决定可订阅集合且可能被自动订阅；payload 是「厚」的（上限 25 MB），超限静默不投递。
- 后续核对：无。

## E20 Zapier Platform：triggers、REST Hook、sample data / output fields

- 消费对象：对照表二「Zapier triggers」列；[C-3](research.md#c-3-成熟的事件目录范式把目录放在事件生产方由应用作者声明订阅被安装方授权每类事件绑一个权限范围)、[C-5](research.md#c-5-agent-看到什么先例里进上下文的是自由文本说明加带属性的事件标签不是结构化目录)。
- 来源与精确修订：`https://docs.zapier.com/platform/build/trigger.md`、`…/hook-trigger.md`、`…/sample-data.md`，2026-09-24 原样字节：
  [sources/zapier-trigger-2026-09-24.txt](sources/zapier-trigger-2026-09-24.txt)、[sources/zapier-hook-trigger-2026-09-24.txt](sources/zapier-hook-trigger-2026-09-24.txt)、[sources/zapier-sample-data-2026-09-24.txt](sources/zapier-sample-data-2026-09-24.txt)。`…/polling-trigger` 仅 WebFetch 摘要。
- 来源立场：平台方自述（面向集成作者）。
- 实际观察（原文）：
  - 「Every Zap has a single trigger. Triggers are how your app's users can start automated workflows whenever an item is added or updated in your app.」
  - 「This trigger type periodically checks the provided API endpoint for new or updated data.」（Polling，1–15 分钟）「This trigger requires your app to support REST Hooks - webhook subscriptions that can be manipulated through a REST API. It runs in near realtime with your app pushing data to Zapier」
  - Subscribe：「This request, usually a POST, is performed when a user activates a Zap that starts with this REST Hook trigger. This is how a Zap makes a subscription request to your API to be notified (via webhook) of all trigger events with the given parameters going forward.」「Zapier includes a `targetUrl` when making this request. You need to store the targetUrl」
  - Unsubscribe：「This request, usually a DELETE, is how Zapier notifies your API when it is no longer listening for trigger events, when the Zap is deactivated or deleted.」
  - Perform List：「This request, usually a GET, is used to collect sample data in the Zap editor … required for public apps」
  - Sample data / output fields：「Sample data gives Zapier example data if users don't test the trigger or action. Though optional, it is especially important for triggers」「Only include fields that are present every time a Zap runs. If a field is provided in the sample, it can be mapped into a field in a later action by any user. If that mapped field is then not available when a user's Zap runs, the action field will be empty, causing errors or unexpected results for users.」「Output fields give your API's response data user-friendly labels in subsequent Zap steps.」
  - Polling（仅 WebFetch 摘要）：「Trigger input fields allow users to enter filters, tags, and other details to filter through new or updated data at the endpoint.」
- 支持范围：目录（trigger 清单 + 每个 trigger 的 output fields/sample）由**集成作者**声明；订阅由**终端用户**逐 Zap 激活（并连接自己的账号）；REST Hook 订阅要求生产方提供 subscribe/unsubscribe 端点；输出字段承诺是消费方映射的依据，字段缺席会静默出错。
- 后续核对：无。

## E21 IFTTT Service API（triggers、trigger fields、Realtime API）

- 消费对象：对照表二「IFTTT triggers」列；[C-3](research.md#c-3-成熟的事件目录范式把目录放在事件生产方由应用作者声明订阅被安装方授权每类事件绑一个权限范围)。
- 来源与精确修订：`https://ifttt.com/docs/api_reference`，2026-09-24 去标签文本 [sources/ifttt-api-reference-2026-09-24.txt](sources/ifttt-api-reference-2026-09-24.txt)；API 路径前缀 `/ifttt/v1/`。
- 来源立场：平台方自述。
- 实际观察（原文）：
  - 「Your service API should use access tokens for authentication and as a source of identity. A single access token should correspond to a single user account or resource owner on your service.」
  - 「Responses contain an array of item objects. Items are a stream of unique events on a timeline, and each item has: One field for every ingredient in the trigger.」「Items have one key-value pair for each ingredient slug and value, and a meta object with two fields」（id、timestamp）
  - 「A trigger_identity field is sent when an Applet is enabled and then with every subsequent trigger endpoint request. The trigger_identity can be thought of as a unique signature of a specific user, trigger, and trigger fields.」
  - 「With IFTTT's Realtime API … Rather than sending data directly, the Realtime API is used to notify IFTTT that there are new events available at your service for a specific user_id or trigger_identity that we can then fetch through polling.」「triggers are required to use the Realtime API if a user would expect its Applets to run in realtime.」
- 支持范围：IFTTT 的「实时」是**通知有新事件 + 平台回拉**，不是推 payload；目录（trigger + ingredients）由服务作者声明，用户填 trigger fields；一令牌一用户。
- 后续核对：无。
