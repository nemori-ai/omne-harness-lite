# 主流 AI 助手产品里与「连接件」相近的功能长什么样

- 调查对象与日期：Anthropic（Claude.ai Connectors、Claude Code channels／routines／in Slack、Claude Tag、Cowork scheduled tasks）、OpenAI（ChatGPT connectors／plugins、scheduled tasks 的应用事件触发、Responses API connectors、API webhooks），
  以及作参照的事件目录范式（Slack Events API、GitHub Webhooks、Zapier triggers、IFTTT triggers）。全部为 **2026-09-24** 线上文档；版本 token 见 [evidence.md 头部](evidence.md)。
- 消费者：PF-002 连接件「事件类型目录 + 持有上的订阅配值 + 上下文里的类型说明」这一方向的产品裁决（待出现）；
  对照的本项目正文是 [PF-002 §4 Connector](../../design/product/PF-002-assets-settings-and-permissions/design.md#connector) 与候选契约
  `data.connector` v2（S-2 鉴权绑定与投递目标不在正文里、S-4 投递目标、S-5 入站信封、S-13 两项权限、S-14 没有读取面也没有管理面；
  候选契约随本程规格批次入库，坐标见[身份清单](../../design/registry/README.md)）。
- 最近核对：2026-09-24 / 上述线上版本。
- 当前结论：**两家主流产品里叫 connector 的东西全是拉取型**（agent 出去调），与 PF-002「唯一方向朝里」相反；**推型入口存在**（Claude Code channels、routines 的 API/GitHub 触发、Claude Tag／in Slack 的 mention、ChatGPT 的应用事件触发），
  但**没有一家给推型入口一份可订阅的「事件类型目录 + 消息包形状」**：Claude Code 用自由文本 `instructions` 告诉模型会来什么事件、事件本身是 `content` + 扁平 `meta`；
  ChatGPT 的事件目录固定在平台侧（3 个 app）、订阅与过滤由用户逐任务配、payload 形状未述。成熟的事件目录范式（Slack/GitHub/Zapier/IFTTT）都把目录放在事件**生产方**，
  订阅由应用作者声明或资源管理员勾选，每类事件绑一个权限 scope，payload 按类型固定——产品负责人的设想在「目录 + 声明的形状」上最接近 Zapier trigger（output fields），
  在「agent 上下文里有说明」上最接近 Claude Code channel 的 `instructions`；OpenAI help center 五篇本轮不可访问，OpenAI 侧事实全部改由 learn.chatgpt.com 与 developers.openai.com 承载。

## 问题与区分条件

要区分的是四件事：

1. 各产品里「connector」指什么方向——如果它是拉，那它对 PF-002 连接件的启发只在「谁装、谁授权、管理员能管什么」这几栏，不在消息形状上。
2. 真正的推型入口（外部把事送进 agent）在各家叫什么、事件长什么样、agent 事先知道什么——这决定「事件类型目录」有没有先例。
3. 订阅落在谁身上：应用作者声明（Slack manifest）、资源管理员勾选（GitHub webhook）、终端用户逐任务配（ChatGPT、Zapier Zap）——这决定「订阅是持有上的配值」有没有先例。
4. 推型入口给不给外部来源读取面/管理面，权限提示无人应答时怎么办——这决定 PF-002 S-14 会在无人值守场景撞上什么。

会改变边界的观察：任一家给推型入口一份结构化事件目录且注入模型上下文（本轮未发现）；任一家允许外部来源选投递会话或处理身份（本轮未发现）。

## 证据入口

- Anthropic：[E1](evidence.md#e1-claude-help-center自定义连接件remote-mcp)–[E4](evidence.md#e4-claudecom-文档connectors-overview-与-remote-mcp)（Claude.ai Connectors）、[E5](evidence.md#e5-claude-codechannels把外部事件推进正在运行的会话)–[E6](evidence.md#e6-claude-codechannels-reference协议事件形状模型看到什么)（channels）、[E7](evidence.md#e7-claude-coderoutinesapi-触发与-github-事件触发)（routines）、[E8](evidence.md#e8-claude-code-in-slack个人账号版正在被-claude-tag-取代)–[E9](evidence.md#e9-claude-tag组织共享身份的-claude)（Slack 入口）、[E10](evidence.md#e10-claude-coworkscheduled-tasks)（Cowork）。
- OpenAI：[E11](evidence.md#e11-chatgptlearnchatgptcomscheduled-tasks-的应用事件触发)（事件触发）、[E12](evidence.md#e12-chatgptlearnchatgptcomplugin-controls-与-chatgpt-work-overview管理员同步共享连接)–[E13](evidence.md#e13-chatgptlearnchatgptcomplugins安装与使用)（管理与使用）、[E14](evidence.md#e14-openai-developersplugins-的-mcp-server-概念与鉴权)–[E15](evidence.md#e15-openai-apimcp-与-connectorsresponses-api)（开发者侧）、[E16](evidence.md#e16-openai-apiwebhooksopenai--开发者的推送只作目录范式参照)（API webhooks）、[E17](evidence.md#e17-openai-help-center-五篇不可访问仅待验证命题)（不可访问的五篇）。
- 参照范式：[E18](evidence.md#e18-slack-events-api事件参考页与-app-manifest)（Slack）、[E19](evidence.md#e19-github-webhooks目录创建权限github-app-权限事件)（GitHub）、[E20](evidence.md#e20-zapier-platformtriggersrest-hooksample-data--output-fields)（Zapier）、[E21](evidence.md#e21-ifttt-service-apitriggerstrigger-fieldsrealtime-api)（IFTTT）。

## 对照表一：主对象 × PF-002 连接件的性质

行是 PF-002 §4 Connector 与 `data.connector` v2 关心的性质；「未述」= 该来源读遍了没写。格内 `E-n` 指向证据条目。

| PF-002 连接件的性质 | Claude.ai Connectors（E1–E4） | Claude Code channels（E5–E6） | Claude Code routines：API／GitHub 触发（E7） | Claude Tag／Claude Code in Slack（E8–E9） | ChatGPT connectors／plugins（E12–E15） | ChatGPT scheduled tasks 的应用事件触发（E11） |
|---|---|---|---|---|---|---|
| **方向** | **拉**：Claude 从 Anthropic 云连到 MCP server，调工具/读数据/取动作；也可渲染 UI。无推送机制（读遍未见） | **推**：MCP server 通过 `notifications/claude/channel` 把事件送进**已打开**的本地会话；可选双向（reply tool 是 agent 出去调） | **推→新建**：POST `/fire` 或 GitHub 事件 → 新建一个云会话跑保存好的 prompt | **推→新建**：`@Claude` mention / 线程回复 / 频道 watch → 频道会话或线程会话（Tag）；一次 mention 一个云会话（in Slack） | **拉**：「app 与 MCP server 是同一件事」；ChatGPT 发请求；模型自选或用户 `@` 点名 | **推→新建**：Gmail/Slack/GitHub 事件 → 启动一次任务运行（新 chat） |
| **谁安装／谁配置／谁授权** | Team/Enterprise：**Owner** 加到组织；**每个用户**各自连接并 OAuth。个人计划：用户自加 | 用户装插件、**自带凭据**（bot token）；用户每会话 `--channels` 选入；组织 **Owner** 用 `channelsEnabled` + `allowedChannelPlugins` 管 | 用户在自己账号下建 routine；API token 由用户生成；GitHub 触发要装 Claude GitHub App；Owner 可整组织关闭 routines | Tag：组织 **Owner** 配对工作区、为每个频道/scope 配连接与凭据；成员零配置。in Slack：工作区管理员装 app，用户各自连 Claude 账号 | 管理员：可用性、按角色、Action control、App permissions；用户：安装、各自授权服务 | 用户先「Connect and authorize the app」，再在对话里描述事件与动作；管理员用「Allow event-triggered scheduled tasks」权限管 |
| **鉴权粒度** | **一人一把**（OAuth）；Enterprise-managed auth 是**经 IdP 派生的个人身份**（不是组织共用一把凭据） | 发送者**白名单**（配对码 / 手动加 handle）；凭据是用户自己的 bot token | API：**每 routine 一把** bearer token；GitHub：App 安装 + 用户的 GitHub 身份；动作以用户身份出现 | Tag：**组织服务账号**，按频道求访问，与谁问无关；DM 才用个人连接器。in Slack：个人 | 三种：individual / **shared** / **agent-owned** 连接；「shared or agent-owned connection uses the connected account's source-system permissions」 | 复用该用户对 app 的授权；Slack 还要求把 `@ChatGPT` 加进每个被 watch 的频道 |
| **事件／消息类型目录；订阅怎么表达、由谁配** | **无事件**。目录是「连接件目录」（用例、读/写能力、可用性），不是事件目录 | **无结构化目录**。server 作者用 `instructions` 自由文本告诉模型「会来什么事件、tag 属性什么意思」；订阅 = 用户 `--channels` 选哪些 server | **平台固定目录**：GitHub 两类（Pull request、Release）× 动作；用户逐 routine 选仓库、事件、过滤（8 个字段 × 6 种操作符）。API 触发无类型 | Tag：可订阅**单个 PR** 的活动；频道 watch 是自然语言 routine；「不能从 Slack 建一个对其他仓库事件触发的 routine」 | **无事件**；工具目录靠 MCP `tools/list`（name/description/schema） | **平台固定目录**：Gmail 新邮件、Slack 选定频道新消息、GitHub PR 活动；用户逐任务配事件与过滤；一任务可多事件、**不能与定时混用** |
| **agent／模型看到什么** | 工具定义（MCP）；「when relevant」自选 | 连接时 `instructions` 进上下文；事件以 `<channel source="…" k="v">body</channel>` 进上下文，`meta` 每键成属性（键只许标识符字符，否则**静默丢弃**）；忙时**合并**到下一轮 | 保存的 prompt 作为任务；`text` 包在 `<routine-fire-payload>` 里**标为不可信**，prompt 不点名则当惰性上下文；GitHub payload 进多少 **未述** | 线程消息窗口 + 频道历史 + 工作区搜索；「Claude may follow directions from other messages in the context」 | 工具 name/description/schema；用户 `@` 点名或模型自选 | 保存的 prompt；事件 payload 形状 **未述**；多事件可能**合并**一次运行 |
| **权限与过滤在哪一侧** | 组织 Owner 限动作（读不写），用户不可覆盖；工具审批在 Claude 侧 | **channel server 侧**做发送者门禁（「ungated channel is a prompt injection vector」）；Claude Code 侧只做 server 级开关与组织白名单 | 平台侧：token 校验、GitHub 过滤、小时上限（超限**丢弃**） | Tag：Agent Proxy 按连接规则/域名/环境放行或**阻断**，凭据在代理注入 | 平台侧：角色、Action control、App permissions（何时先问）；服务侧：用户 scope | 平台侧：事件过滤字段；管理员权限开关 |
| **有没有管理面／读取面暴露给外部来源** | 不适用（方向反） | **无**读取面；**无**确认（不 ack，未启用时静默丢）。**例外**：声明 `claude/channel/permission` 的 channel 可**批准/拒绝工具调用**（一个受控的控制面；文档要求只有认证过 sender 才声明） | 无；`/fire` 只返回新会话 id 与 URL | 无；线程里任何人都能**引导**运行中的会话（那是会话成员的权利，不是外部来源的） | 不适用 | 无；「Scheduled」页只给用户看 pending events |
| **投递目标／会话关系** | 不适用 | **已打开的会话**；会话关掉就收不到；独立事件流要开独立会话 | **一事件一新会话**（「two PR updates produce two independent sessions」） | Tag：频道会话 + 每线程一会话；in Slack：一次 mention 一云会话 | 不适用 | **每次运行一新 chat**（standalone）；或回到指定 chat（in-chat task） |
| **送进来的消息按什么身份处理** | 用户自己的身份 | 会话所属用户（本地会话就是他的） | routine 所属用户（「appears as you」） | Tag 频道：**服务账号**，与发送者无关；DM：发送者本人 | 用户（或 shared/agent-owned 连接的账号） | 任务所属用户 |
| **明确不做的事** | 推送；Free 只限一个自定义连接件 | 不 ack、不保证送达；非白名单插件不注册；协议可能变；Bedrock/Vertex/Foundry 不可用；权限提示无人答则**会话挂起** | `text` 不解析（JSON 也当字符串）；不复用会话；CLI 不能建 API 触发；一小时最低间隔 | Tag：不给私有频道/DM/群 DM/外部共享频道发 job 输出；只订阅单个 PR。in Slack：不支持 DM；一会话一个 PR | 机器对机器凭据（client credentials、服务账号、JWT bearer、自带 mTLS）**不支持** | Slack 的 reactions/edits/deletes/DM 不支持；桌面端/CLI/IDE 不可用；事件触发不能与定时混用 |

补充一列之外的两条同类事实：Cowork scheduled tasks **只有时间触发**、每任务一会话（[E10](evidence.md#e10-claude-coworkscheduled-tasks)）；ChatGPT Pulse（主动生成简报）本轮**没有可引用的第一方原文**（[E17](evidence.md#e17-openai-help-center-五篇不可访问仅待验证命题)）。

## 对照表二：事件目录与订阅的成熟范式（只取四点）

| | Slack Events API（E18） | GitHub Webhooks（E19） | Zapier triggers（E20） | IFTTT triggers（E21） | OpenAI API webhooks（E16，方向是平台→开发者） |
|---|---|---|---|---|---|
| **目录怎么声明** | 生产方（Slack）维护每事件一页：说明、所需 scope、payload；应用作者在 manifest `settings.event_subscriptions.bot_events` / `user_events` 里**按名字**列订阅（各≤100） | 生产方（GitHub）维护每事件一页：属性、`action` 取值、可用于哪类 webhook；GitHub App 的可订阅集合由**权限**决定，某些权限**自动订阅** | **集成作者**声明每个 trigger：类型（polling / REST hook）、input fields、**output fields + sample data**（消费方据此映射字段） | **服务作者**声明每个 trigger 的 ingredients；响应是「ingredient slug → value」+ `meta{id,timestamp}` | 生产方（OpenAI）固定 21 种 `type`；开发者在 dashboard 逐端点勾选 |
| **订阅由谁配** | 应用作者（manifest）；**安装者**（工作区/用户）在 OAuth 时授 scope。加了需要新 scope 的事件，**已装用户要重新走 OAuth** 才收得到 | **资源管理员**（仓库 admin / 组织 owner）建 webhook 时勾选；或 App 作者按权限勾选 | **终端用户**激活 Zap 时（Zapier 向生产方发 subscribe 带 `targetUrl`；停用发 unsubscribe） | 终端用户启用 Applet 时填 trigger fields；`trigger_identity` = (用户, trigger, 字段) 的签名 | 开发者逐端点配 |
| **payload 形状** | 外层信封固定（`type`、`token`、`team_id`、`api_app_id`、`event_id`、`event_time`、`authorizations[]`、`event_context`…）+ 内层 `event{type,…}` 按类型定；一条数据**只送一次**，多用户可见性要另调 `apps.event.authorizations.list` | 厚 payload：公共字段 `action/sender/repository/organization/installation` + 按事件；上限 **25 MB**，超限**不投递** | 数组（reverse chronological），字段须与 output fields/sample 一致，缺字段下游**静默出错** | 数组，每项 ingredients + `meta{id,timestamp}` | **薄信封**：`{object:"event", id, type, created_at, data:{id}}`，动手前要回头 GET 资源 |
| **鉴权粒度** | 安装 = (enterprise, team, user) 组合；bot 与 user 两组 scope；缺 scope 收不到 | webhook 归属于仓库/组织/App；`secret` + `X-Hub-Signature-256` 校验来源 | 用户连接自己的账号；每 Zap 一个 `targetUrl` | 「A single access token should correspond to a single user account」 | 每端点一个 secret（Standard Webhooks） |
| **交付与失败** | 3 秒内 2xx，否则重试 3 次；60 分钟内 >95% 失败则**临时停订** | 未述（本轮未取 deliveries 页） | REST hook 需生产方实现 subscribe/unsubscribe；反向 unsubscribe 可暂停 Zap | Realtime API 只是「有新事件」的通知，平台**回拉** | 几秒内 2xx，否则指数退避重试 **72 小时** |

## 当前结论

### C-1 两家主流产品里叫「connector」的东西都是拉取型集成，方向与 PF-002 的连接件相反

**事实**：Anthropic 对 connector 的正式定义只有两件事——给 Claude 工具与信息、渲染 UI（[E4](evidence.md#e4-claudecom-文档connectors-overview-与-remote-mcp)）；Claude 从 Anthropic 云连到用户的 MCP server（[E1](evidence.md#e1-claude-help-center自定义连接件remote-mcp)）。
OpenAI 明说「app 与 MCP server 是同一件事」，使用即「ChatGPT sends a request to the connected service」（[E12](evidence.md#e12-chatgptlearnchatgptcomplugin-controls-与-chatgpt-work-overview管理员同步共享连接)）；
Responses API 的 connector 是带 `connector_id` 的 MCP 工具，「let you pull in context」（[E15](evidence.md#e15-openai-apimcp-与-connectorsresponses-api)）；工具调用由「用户问 → 模型选」发起（[E14](evidence.md#e14-openai-developersplugins-的-mcp-server-概念与鉴权)）。
**判断**：这两家的 connector 与 PF-002 连接件同名不同物；它们能借鉴的只有「谁装、谁授权、管理员管什么」三栏，消息形状与订阅无法从它们身上取。
**Claude Code 自己的对照表也这么分**：「Standard MCP server | Claude queries it during a task; nothing is pushed to the session」（[E5](evidence.md#e5-claude-codechannels把外部事件推进正在运行的会话)）。

- 适用范围：2026-09-24 两家线上文档；不支持推广到「MCP 协议本身没有推送」（MCP 有 notifications，Claude Code channels 就建在它上面）。
- 代价与不适用：PF-002 把「连接件」这个词用在推型入口上，与两家用法**相反**；跨产品沟通或做兼容层时，这个词会被读成 MCP 集成。这是命名代价，不是设计对错。
- 来源：E1、E4、E5、E12、E14、E15。
- 最近核对：2026-09-24。

### C-2 推型先例存在，但没有一家给推型入口一份可订阅的「事件类型目录＋消息包形状」

**事实**：
- Claude Code channels 的事件只有两个参数：`content`（字符串）与 `meta`（扁平 `Record<string,string>`），进上下文成 `<channel source=… k=v>body</channel>`；模型对「会来什么事件」的了解来自 server 的 `instructions` **自由文本**，在 server 连接时注入（[E6](evidence.md#e6-claude-codechannels-reference协议事件形状模型看到什么)）。没有类型枚举、没有按类型的 schema。
- Claude Code routines 的 GitHub 触发有目录，但**固定在平台侧**（Pull request、Release 两类 × 动作）并由用户逐 routine 选事件与过滤；API 触发的 `text` 明说「is not parsed」（[E7](evidence.md#e7-claude-coderoutinesapi-触发与-github-事件触发)）。
- ChatGPT 的事件触发同样是**平台固定目录**（Gmail 新邮件、Slack 选定频道新消息、GitHub PR 活动），用户逐任务配事件与过滤；payload 形状**未述**（[E11](evidence.md#e11-chatgptlearnchatgptcomscheduled-tasks-的应用事件触发)）。
- Claude Tag 只能订阅单个 PR 的活动，「You can't set up a routine from Slack that fires on other repository events」（[E9](evidence.md#e9-claude-tag组织共享身份的-claude)）。

**判断**：「由接入件声明可订阅的事件类型目录（类型名+说明+消息包形状）」在这两家产品里**没有先例**——有目录的地方目录不归接入件声明（归平台），接入件能声明的地方（channels）只有自由文本。
最接近「接入件作者声明目录 + 每类事件的形状」的先例在参照范式里：Zapier 的 trigger + output fields/sample data（[E20](evidence.md#e20-zapier-platformtriggersrest-hooksample-data--output-fields)）、Slack 的每事件一页（[E18](evidence.md#e18-slack-events-api事件参考页与-app-manifest)）。

- 适用范围：2026-09-24 两家线上文档；「读遍未找到」级别的负面结论，未构造反例。
- 代价与不适用：走 channels 这条「自由文本说明 + 扁平 meta」的路，代价是形状不可校验（Claude Code 对不合规 meta 键的处置是**静默丢弃**）、多事件流要靠开多个会话隔离、忙时事件被合并成一组；走平台固定目录的路，代价是每加一种来源都要平台改代码，用户只能在给定清单里选。
- 撞上这条事实会怎样：若把「类型说明」当作 agent 能据以校验消息的契约，先例给不出任何一个校验点——channels 与 ChatGPT 都把事件当文本交给模型，形状错了不报错、只是模型做错。
- 来源：E6、E7、E9、E11、E18、E20。
- 最近核对：2026-09-24。

### C-3 成熟的事件目录范式把目录放在事件生产方，由应用作者声明订阅、被安装方授权，每类事件绑一个权限范围

**事实**：Slack「leverages Slack's existing object-driven OAuth scope system to control access to events」，manifest 里 `bot_events`/`user_events` 按名字列订阅，缺 scope 的事件收不到，加新事件若需新 scope「must send your existing users through the OAuth flow again」（[E18](evidence.md#e18-slack-events-api事件参考页与-app-manifest)）。
GitHub App「will first need to select the permissions … then you can subscribe your app to webhook events that are related to that set of permissions」，某些权限下**自动订阅**；仓库/组织 webhook 由 admin/owner 建并勾选事件（[E19](evidence.md#e19-github-webhooks目录创建权限github-app-权限事件)）。
Zapier/IFTTT 的目录由集成作者声明、订阅由终端用户逐 Zap/Applet 激活并连接自己账号（[E20](evidence.md#e20-zapier-platformtriggersrest-hooksample-data--output-fields)、[E21](evidence.md#e21-ifttt-service-apitriggerstrigger-fieldsrealtime-api)）。
OpenAI API webhooks 的目录固定 21 种 `type`，端点逐个勾选（[E16](evidence.md#e16-openai-apiwebhooksopenai--开发者的推送只作目录范式参照)）。

**判断**：这些范式里「目录」与「订阅」是两个主体的两件事——目录归事件生产方（它定义 payload），订阅归消费方的作者（声明）或资源所有者（勾选）；PF-002 设想的「连接件声明目录、持有上配订阅」把目录搬到了**消费方接入件**上，这在四个范式里都没有对应物——接入件不生产事件，它只能转述上游的目录。
payload 形状上，四家分成**厚**（Slack 内层 event、GitHub 25 MB）与**薄**（OpenAI 只有 id）两派；薄派要求消费方有读取面回头拉。

- 适用范围：2026-09-24 各家线上文档；GitHub deliveries/重试页本轮未取。
- 代价与不适用：目录随生产方版本演化，消费方要维护类型清单与 scope 映射；Slack 的规则意味着**扩订阅可能触发全体用户重新授权**；Zapier 的 output fields 一旦承诺，运行时缺字段会让下游静默出错；GitHub 的权限→事件绑定意味着「订阅什么」不完全由订阅者决定（自动订阅）。
- 撞上这条事实会怎样：PF-002 S-14「没有读取面」与**薄信封**范式不相容——如果上游只送 id，连接件没有面可回头拉，消息到了也用不了；只有厚 payload（内容自足）才能落进 S-5 信封。
- 来源：E16、E18、E19、E20、E21。
- 最近核对：2026-09-24。

### C-4 鉴权粒度：拉型 connector 默认一人一把，组织共用是显式的第二种模式；推型入口的「鉴权」是发送者白名单或令牌

**事实**：Claude.ai 「Each person still needs to authenticate individually」，Enterprise-managed auth 是经 IdP 派生的个人身份、可与个人登录并存（[E2](evidence.md#e2-claude-help-center使用连接件目录组织启用动作限制)、[E3](evidence.md#e3-claude-help-centerenterprise-managed-auth组织一次授权)）；ChatGPT 三种连接账号 individual / shared / agent-owned，后两者用**连接账号**的源系统权限（[E12](evidence.md#e12-chatgptlearnchatgptcomplugin-controls-与-chatgpt-work-overview管理员同步共享连接)）；ChatGPT 明说不支持机器对机器凭据（[E14](evidence.md#e14-openai-developersplugins-的-mcp-server-概念与鉴权)）。
Claude Tag 在频道里「authenticate the agent itself with service accounts, not any person」，按频道配、按频道求访问（[E9](evidence.md#e9-claude-tag组织共享身份的-claude)）。
推型入口：channels 靠发送者白名单（[E5](evidence.md#e5-claude-codechannels把外部事件推进正在运行的会话)）；routines API 每 routine 一把 bearer token、GitHub 触发靠 App 安装（[E7](evidence.md#e7-claude-coderoutinesapi-触发与-github-事件触发)）；ChatGPT 事件触发复用用户对 app 的授权并要求 `@ChatGPT` 进频道（[E11](evidence.md#e11-chatgptlearnchatgptcomscheduled-tasks-的应用事件触发)）；Slack 安装 = (enterprise, team, user) 组合（[E18](evidence.md#e18-slack-events-api事件参考页与-app-manifest)）。

**判断**：PF-002「以对面服务某一账号接进来、鉴权绑定一份持有一份、组织格不配」与拉型 connector 的默认模式一致；但两家都**同时提供**组织级共享身份（Claude Tag 服务账号、Enterprise-managed auth、ChatGPT shared/agent-owned），且把它做成按频道/按角色配的第一等模式。「同一人在对面有几个账号 = 几份 name 不同的连接件」在先例里没有对应物：先例的粒度是「一个用户对一个 app 一份授权」，多账号靠多个 app 安装或多个 Zap 实现。

- 适用范围：2026-09-24 线上文档。
- 代价与不适用：只做「一人一把」意味着没有 Claude Tag 那种「频道里谁问都一样」的可预测性与集中审计；做组织共用又要回答「动作以谁的名义出现」（Claude Tag 用服务账号并把凭据留在代理、不进沙箱——那是额外一层基础设施）。
- 来源：E2、E3、E5、E7、E9、E11、E12、E14、E18。
- 最近核对：2026-09-24。

### C-5 agent 看到什么：先例里进上下文的是自由文本说明加带属性的事件标签，不是结构化目录

**事实**：channels 的 `instructions` 「Claude Code delivers it to Claude as context when the server connects. Tell Claude what events to expect, what the `<channel>` tag attributes mean, whether to reply…」；事件本体是 `<channel>` 标签，`meta` 成属性（[E6](evidence.md#e6-claude-codechannels-reference协议事件形状模型看到什么)）。
routines 把外部 `text` 包成 `<routine-fire-payload>` 并**标为不可信**，「a routine's saved prompt must opt in to acting on fire text」（[E7](evidence.md#e7-claude-coderoutinesapi-触发与-github-事件触发)）。
in Slack 把线程/频道消息整段给模型并警告「Claude may follow directions from other messages」（[E8](evidence.md#e8-claude-code-in-slack个人账号版正在被-claude-tag-取代)）。ChatGPT 事件触发：模型看到 saved prompt；事件 payload 进上下文的形状**未述**（[E11](evidence.md#e11-chatgptlearnchatgptcomscheduled-tasks-的应用事件触发)）。

**判断**：产品负责人设想的「agent 不主动取，但其上下文里有被订阅类型的说明」最接近 channels 的 `instructions`；先例把这份说明交给 **server 作者**写、在**连接时**注入、**不按订阅裁剪**（说明是整份的，用户 `--channels` 选的是 server 不是类型）。两家都把事件正文当**不可信文本**处理，并把「是否照做」交给 prompt 或 sender 门禁。

- 适用范围：2026-09-24 线上文档；`instructions` 的注入位置与是否随上下文压缩保留，页面未述。
- 代价与不适用：自由文本说明不能被工具校验，也不能被按订阅裁剪；若一个 server 声明多种事件而用户只订其中一种，模型仍读到全部说明（先例没有「按订阅裁剪说明」的机制，这是读遍未找到）。
- 撞上这条事实会怎样：把「类型说明进上下文」当成对模型行为的保证，会撞上 routines 那条经验——`v2.1.213` 之前会话「could refuse to act on it」，说明文本进了上下文不等于模型按它行事，Anthropic 是靠改**包装语义**（saved prompt 视为任务、fire text 视为不可信）而不是靠改说明解决的。
- 来源：E6、E7、E8、E11。
- 最近核对：2026-09-24。

### C-6 权限与过滤都落在生产方或平台侧；agent 一侧只做会话级开关；先例把无门禁的推送入口明确当作注入向量

**事实**：channels 的发送者门禁在 **channel server** 里做（「Check the sender against an allowlist before calling `mcp.notification()`」，「Gate on the sender's identity, not the chat or room identity」），Claude Code 侧只有 `--channels` 与组织白名单（[E5](evidence.md#e5-claude-codechannels把外部事件推进正在运行的会话)、[E6](evidence.md#e6-claude-codechannels-reference协议事件形状模型看到什么)）。
routines 的过滤（8 字段 × 6 操作符）与小时上限在平台侧，超限**丢弃**（[E7](evidence.md#e7-claude-coderoutinesapi-触发与-github-事件触发)）。ChatGPT 事件过滤在平台侧、管理员有单独权限（[E11](evidence.md#e11-chatgptlearnchatgptcomscheduled-tasks-的应用事件触发)）。
Slack 靠 scope 决定收不收得到、GitHub 靠权限决定能订什么（[E18](evidence.md#e18-slack-events-api事件参考页与-app-manifest)、[E19](evidence.md#e19-github-webhooks目录创建权限github-app-权限事件)）。Claude Tag 的出站由 Agent Proxy 三层放行（[E9](evidence.md#e9-claude-tag组织共享身份的-claude)）。

**判断**：没有一家把「按类型过滤」放在 agent 会话内做；过滤要么在事件生产方（scope/权限），要么在平台（routines/ChatGPT 的过滤字段），要么在接入件进程（channels 白名单）。PF-002 把订阅当持有上的配值，对应的过滤位置在先例里是**平台/接入端**，不是受理之后。

- 适用范围：2026-09-24 线上文档。
- 代价与不适用：过滤在接入端意味着接入端要拿到订阅配值（跨边界传一份配置），且过滤失败不报错（Claude Code：未启用即静默丢；routines：超限即丢）。
- 来源：E5、E6、E7、E9、E11、E18、E19。
- 最近核对：2026-09-24。

### C-7 所有推型先例都不给外部来源读取面或管理面；Claude Code 唯一的例外是显式选入的权限中继

**事实**：channels「Claude Code doesn't acknowledge notifications」「drops the events silently and returns no error」；要确认送达得自己开 reply tool（那是 agent 出去调）。但 channel 可声明 `claude/channel/permission`，之后「anyone who can reply through your channel can approve or deny tool use in your session」，覆盖 Bash/Write/Edit 审批、不覆盖项目信任与 MCP 同意（[E6](evidence.md#e6-claude-codechannels-reference协议事件形状模型看到什么)）。
动机写在 channels 页：「If Claude hits a permission prompt while you're away from the terminal, the session pauses until you respond.」（[E5](evidence.md#e5-claude-codechannels把外部事件推进正在运行的会话)）。routines 的 `/fire` 只返回会话 id 与 URL（[E7](evidence.md#e7-claude-coderoutinesapi-触发与-github-事件触发)）；Slack 的可见性查询是另一个 API（[E18](evidence.md#e18-slack-events-api事件参考页与-app-manifest)）。

**判断**：PF-002 S-14 与所有推型先例一致；但 Claude Code 在同一机制上**加了一条受控的控制面**，理由是无人值守时权限提示会挂起会话——这是「零控制面」在长期待机场景要付的代价的具体形状。

- 适用范围：2026-09-24 线上文档；权限中继在 `v2.1.234` 之后才只发给已注册的 channel。
- 代价与不适用：不给控制面 → 需要别的方式回答无人值守的权限提示（否则会话挂起）；给控制面 → 谁能回复谁就能批准，先例把它绑在 sender 认证上。
- 撞上这条事实会怎样：若连接件投递的会话在运行中弹出需要人答的权限提示，而连接件又没有任何回路，那条会话会一直等——先例明说这是会发生的。
- 来源：E5、E6、E7、E18。
- 最近核对：2026-09-24。

### C-8 投递目标：只有 Claude Code channels 送进已开着的会话，其余推型先例一律「一事件一新会话」

**事实**：channels「Events only arrive while the session is open」「the event arrives in the session you already have open」；多事件流要开多会话（[E5](evidence.md#e5-claude-codechannels把外部事件推进正在运行的会话)、[E6](evidence.md#e6-claude-codechannels-reference协议事件形状模型看到什么)）。
routines「Claude Code doesn't reuse sessions across events」（[E7](evidence.md#e7-claude-coderoutinesapi-触发与-github-事件触发)）；Claude Tag 每线程一会话、频道自有一会话（[E9](evidence.md#e9-claude-tag组织共享身份的-claude)）；in Slack 一 mention 一云会话（[E8](evidence.md#e8-claude-code-in-slack个人账号版正在被-claude-tag-取代)）；ChatGPT standalone 任务每运行一新 chat，in-chat 任务回到指定 chat（[E11](evidence.md#e11-chatgptlearnchatgptcomscheduled-tasks-的应用事件触发)）；Cowork 每任务一会话（[E10](evidence.md#e10-claude-coworkscheduled-tasks)）。

**判断**：PF-002 S-4「本版只能指一个已有的会话」对应 channels 模式（也对应 ChatGPT 的 in-chat 任务）；先例里更常见的是平台替用户建会话（并因此要回答「以谁的身份建」——Claude Tag 用频道的服务账号，routines 用 routine 所属用户）。两条路先例都有，都没做「按对面线程分会话」——Claude Tag 的线程→会话绑定是**它自己的**线程，不是对面服务的。

- 适用范围：2026-09-24 线上文档。
- 代价与不适用：投已有会话 → 会话不在就丢（channels 静默丢）、忙时事件合并；一事件一会话 → 事件密集时会话数爆炸（routines 加了小时上限，ChatGPT 加了合并），且要先回答建会话的身份。
- 来源：E5、E6、E7、E8、E9、E10、E11。
- 最近核对：2026-09-24。

### C-9 先例明确不做的事，与 PF-002 的「明确不承诺」重叠的部分

**事实**（各家自述的不做）：channels 不 ack、不保证送达、协议可能变、只收白名单插件（[E5](evidence.md#e5-claude-codechannels把外部事件推进正在运行的会话)、[E6](evidence.md#e6-claude-codechannels-reference协议事件形状模型看到什么)）；routines 不解析 `text`、不复用会话（[E7](evidence.md#e7-claude-coderoutinesapi-触发与-github-事件触发)）；ChatGPT 事件触发不支持 Slack 的 reactions/edits/deletes/DM、不能与定时混用、桌面端不可用（[E11](evidence.md#e11-chatgptlearnchatgptcomscheduled-tasks-的应用事件触发)）；Claude Tag 只订阅单个 PR、不向私有频道/DM 发 job 输出（[E9](evidence.md#e9-claude-tag组织共享身份的-claude)）；Cowork 只有时间触发（[E10](evidence.md#e10-claude-coworkscheduled-tasks)）；ChatGPT 不支持机器对机器凭据（[E14](evidence.md#e14-openai-developersplugins-的-mcp-server-概念与鉴权)）。

**判断**：两家都把推型入口的事件目录**收得很窄**（GitHub 只两类；Slack 只新消息），并且都在文档里把「哪些事件不支持」写成正面清单——这说明目录的**每一项都是单独的产品承诺**，不是「声明了就有」。

- 适用范围：2026-09-24；两家的推型入口都在 preview/beta，清单会变。
- 代价与不适用：目录越开放，每一项的语义、过滤、合并、上限都要各自兑现；先例选择了窄目录 + 平台兑现。
- 来源：E5、E6、E7、E9、E10、E11、E14。
- 最近核对：2026-09-24。

### C-10 送进来的消息按什么身份处理：先例分成三种落法，没有一家把处理身份挂在入口上让外部选

**事实**：channels/routines/ChatGPT 任务 → 会话或任务**所属用户**（[E5](evidence.md#e5-claude-codechannels把外部事件推进正在运行的会话)、[E7](evidence.md#e7-claude-coderoutinesapi-触发与-github-事件触发)、[E11](evidence.md#e11-chatgptlearnchatgptcomscheduled-tasks-的应用事件触发)）；Claude Tag 频道 → **频道的服务账号**，与发送者无关，DM 才是发送者本人（[E9](evidence.md#e9-claude-tag组织共享身份的-claude)）；ChatGPT shared/agent-owned 连接 → **连接账号**的权限（[E12](evidence.md#e12-chatgptlearnchatgptcomplugin-controls-与-chatgpt-work-overview管理员同步共享连接)）。

**判断**：PF-002 G-4 未定的 `processingIdentity` 在先例里的取值域是三个：持有者本人、投递目标（频道/会话）配置的身份、连接账号本身；三家都不让外部内容选身份，这与 `data.connector` v2 第六节「装配给与协议给」的「外部内容选不了目标、选不了身份」一致。

- 适用范围：2026-09-24 线上文档。
- 代价与不适用：选「投递目标配置的身份」要求目标（会话/频道）本身带身份配置（Claude Tag 是 Owner 按 scope 配）；选「持有者本人」则组织共用场景下动作都记在一个人名下。
- 来源：E5、E7、E9、E11、E12。
- 最近核对：2026-09-24。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| learn.chatgpt.com 与 developers.openai.com 上的页面代表 ChatGPT 当前产品（而非仅 Codex） | C-2、C-4、C-6、C-8、C-10 里所有 ChatGPT 格 | 部分：页面标题与 `ContentModeSwitch group="codex-surface" id="web"` 分支明确写 ChatGPT web/mobile；help.openai.com 原文不可访问，未能交叉 |
| Claude Code 文档描述的就是当前发行版（本机 2.1.281）的行为 | C-2、C-5、C-6、C-7、C-8 里 channels/routines 各格 | 未核对：本轮未实测 channels；页面标 research preview |
| Slack/GitHub/Zapier/IFTTT 文档描述与其当前 API 行为一致 | C-3 | 未核对：只读文档 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| ChatGPT 事件触发把 payload 以什么形状交给运行、模型上下文里有没有事件类型说明 | 在 Plus/Team 账号上建一个 Gmail 触发任务，读运行记录 | 决定「payload 形状 + 类型说明进上下文」有没有第二个先例 | 有 ChatGPT 付费账号的人；产品裁决前 |
| channels 的 `instructions` 注入的确切位置、是否随上下文压缩保留、多 server 时如何拼接 | 本机 2.1.281 用 `--dangerously-load-development-channels` 跑 fakechat，`--debug` 看请求 | C-5 的「说明在上下文里」是否稳定 | 任何有本机 Claude Code 的人；架构读数前 |
| OpenAI help center 五篇原文（含 Pulse、synced connectors 的管理员侧） | 从可访问网络抓取并钉字节 | E17 从待验证升为事实；对照表 ChatGPT 列「未核」格 | 待有可访问网络的人 |
| GitHub webhook 交付/重试/去重规则（deliveries 页本轮未取） | 抓 `docs.github.com/en/webhooks/using-webhooks/handling-webhook-deliveries` 等 | 对照表二「交付与失败」GitHub 格 | 下一轮 |

## 采用与后续核对

尚无采用者。本包为 PF-002 连接件「事件类型目录与订阅」方向的产品裁决提供先例与代价，裁决本身归 record/decisions；
架构读数若引用 C-2、C-3、C-7，请把「先例这样做」与「本项目这样选」分开写。
后续任一家改版（channels 出 preview、ChatGPT 事件目录扩展、Claude Tag GA）都先按 [演进事件词](../README.md#演进事件词)记一条再改正文。
