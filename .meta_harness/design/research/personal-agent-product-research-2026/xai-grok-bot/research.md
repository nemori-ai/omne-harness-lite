---
kind: research
source_baseline: xai-grok-bot-public-pages
source_date: 2026-09-16
target_baseline: omne-harness-lite-design-2026-09-16
---

# Grok Bot 产品与 X 边界核对

- 调查对象与日期：Grok Bot，基于 [x.ai/bot](https://x.ai/bot) 及 xAI 官方 Grok Bot 文档在 2026-09-16 的公开内容；X 侧仅采用 X 官方帮助中心。
- 消费者：外部 Connector 与环境来源、运行时状态连续性、用户治理和批准、租户/身份边界，以及后续产品比较与规格建模。
- 当前结论：公开材料把 Bot 描述成有名称、工作、对话、记忆/上下文、工具和持久云电脑的长期工作对象；其工作可在桌面、移动端、后台 routine 中继续，并在敏感动作或人类专属认证步骤处请求用户。X 集成目前公开为连接 X 账号后由 Bot 搜索帖子、读取时间线、检查 mentions、拉取趋势和管理书签。没有官方证据证明“在 X 帖子中 @Grok”会调用 Grok Bot；X 官方资料只说明通用 mention 语义。

## 问题与区分条件

本次调查需要把以下容易混淆的对象拆开：

1. **Grok Bot 与 X 上的 Grok。** 前者是 xAI 公开的持久、工具使用型工作代理；后者是 X 内的 AI 助手。X 帮助页的隐私、训练和地区说明适用于“Grok on X”，不能自动外推到 Grok Bot。
2. **X connector 与 X mention 触发。** xAI 新闻稿证明 connector 能搜索 X 帖子、读时间线、检查 mentions；没有证明外部 X 事件会启动 Bot。Grok Bot 自己的聊天界面支持 `@` 选择 Bot、group、routine 或 connector，但这是产品内消息寻址。
3. **持久性与隔离。** Bot 的对话/角色上下文可分开，但同一用户的 Bot 共享云电脑、文件、浏览器会话和命令行凭据；不同 Bot 不是安全边界。停止消息也不撤销已经完成的外部动作。
4. **产品营销与可验证能力。** “24/7”“更聪明”“像同事”等是产品表述；可直接核实的能力限于页面明确的电脑、浏览器、文件、终端、连接器、routine、批准和产物流程。公开页面没有给出 Grok Bot 的确定底层模型映射、SLA 或完整 API 契约。

## 证据入口

证据记录 [E1–E12](evidence.md) 对应本正文的事实断言。最核心的来源是：

- 产品页：对象定位、持续工作、Bot 并行/电脑、定价与公开 FAQ（E1）。
- xAI 文档：Bot 对象和记忆（E2）、消息/`@` 与群聊（E3）、云电脑/连接器（E4）、技能和 routine（E5）、文件和可审阅产物（E6）、批准/Auto Review/隐私与共享边界（E7）。
- X 集成与可用性：xAI 的 X connector 公告（E8），X 关于 Grok、数据控制与地区可用性的帮助页（E9），X 通用 mention 语义（E10）。
- 法律和生命周期边界：Grok Bot Terms（E11）；企业可用性公告与产品页 FAQ 的冲突（E12）。

## 产品/系统解剖（来源事实）

### 1. 产品对象、身份与访问

- Bot 是“有名称、工作、自己的 conversation、会随时间发展的 working context”的持久 AI teammate；创建时设置名称、标题、描述和头像，描述用于长期规则，消息用于一次任务。[E2]
- 公开文档说 Grok Bot 使用 Cursor 账户认证；个人可通过符合条件的 Cursor、SuperGrok/SuperGrok Plus/SuperGrok Heavy（及文档所列 X Premium+ 链接）获得入口，团队/企业有单独的席位和管理员路径。[E4、E12]
- 文档当前称桌面端支持 macOS、Windows、Linux，移动端支持 iPhone、Android；x.ai/bot 页面 FAQ 的较窄表述是桌面 macOS/Windows 和 iOS，说明页面间存在发布节奏差异。[E1、E4]
- Bot 的共享链接只复制配置（身份、描述、skills、routines）；收件人不会得到原用户的电脑、登录态或对话历史。共享链接本身公开，配置中不应放密钥、内部 URL 或客户数据。[E2]

### 2. 执行环境、工具和产物

- 每个用户拥有一台持久云电脑，Bot 可使用浏览器、命令行、文件和连接的工具；关闭 app、电脑或手机不停止云端后台工作。[E4]
- 同一用户的 Bot 共享浏览器 cookie/登录会话、文件、命令行凭据和 `/workspace`；Bot 有独立屏幕以支持并行，但屏幕不是安全边界，单个 Bot 在其屏幕上一次执行一个 computer-use task。[E4]
- 工具既可通过浏览器操作，也可通过 Plugins/connector 以结构化方式接入；connector 安装和可用性按账号共享，聊天中用 `@` 附加 connector，`/` 引用 skill。[E4、E3]
- 文件输入包括常见图像/音频/视频、PDF、Office、CSV/JSON/YAML、源代码、HTML/邮件和 notebook；桌面 composer 一次最多六个附件，并公布了单文件大小限制。结果以对话卡片预览，可保存、打开来源或继续反馈；文档建议要求链接、时间戳、动作日志、未验证项等可审阅证据。[E6]

### 3. 交互、并行与生命周期

- 用户从 sidebar 打开 Bot 发送消息，可粘贴文本/链接/图像、附加本地文件、引用 skill、回复消息、反应或在工作中继续发送指令；transcript 显示工具活动、电脑使用、创建文件、问题和批准请求。[E3]
- 直接消息可重定向进行中的工作；“Stop now”用于停止，但明确不撤销 Bot 已完成的动作。[E3]
- 群聊可选择 2–6 个 Bot；正常文字可让参与 Bot 自主决定响应者，`@Bot` 指定负责人，多个 `@Bot` 表示确需多方参与，`@everyone` 用于群体更新。Bot 之间可异步传递消息、唤醒接收 Bot并稍后回复。[E3]
- skill 是可复用指令集；routine 为某个 Bot 按计划或（在支持时）事件触发工作流。支持演示学习、测试运行、启停/编辑/删除、最近运行历史，文档列出每 Bot 最多 50 个 routine、保留 20 条最近运行记录，并提醒长期离开后可能暂停 routine。[E5]
- Bot 可保留稳定偏好、重要事实和工作摘要；对话/学习上下文按 Bot 分开，而共享文件、浏览器会话和直接交接跨 Bot 可见。官方明确提醒记忆不是权威源，重要决策应重新读取当前源系统。[E2]

### 4. 控制面、授权与治理

- 用户可在请求中写明停止边界；发送消息、发布、购买/转账、删除/覆盖、权限变更、生产变更和接受法律条款等应设批准边界。批准只控制拟议动作，不回滚已完成工作。[E7]
- Auto Review 在工具调用和 computer action 执行前评估；窄范围的“Ask first/Allow automatically”规则可叠加，冲突时 Ask first 优先。官方同时说明这是模型化辅助，不能取代最小权限和明确批准。[E7]
- 密码、passkey、2FA、CAPTCHA、支付/身份核验等由用户 takeover；安全 secret request 的值被遮蔽、不进 transcript、不呈现给模型。云电脑能力与本地电脑命令能力分开，后者默认每次询问。[E4、E7]
- Bot 的法律条款允许其代表客户执行访问网站、执行代码、修改文件、发送通信、处理数据、调用工具和交互第三方服务等 autonomous actions；客户负责权限、批准、花费限制、持续活动监控和合法性。条款警告动作可能错误、延迟、失败或非预期，批准/自动审查不保证拦截也不撤销已完成动作。[E11]

### 5. X 集成、X 上 Grok 与 mention invocation

- xAI 2026-08-29 的官方公告称：用户在 Grok Bot 中连接 X 账号；没有开发者账号时会创建一个；付费 Grok Bot 用户开始时获得免费 X API credits。之后可要求 Bot 搜索帖子、读时间线、检查 mentions、汇总 X 动态；另有 X plugin 可搜索帖子、读时间线、拉趋势、管理书签。[E8]
- 这说明当前公开的 X 集成是**从 Grok Bot 侧通过 connector/plugin 读取和管理 X 数据**，不是已证实的 X 帖子事件→Bot 唤醒协议。[E8]
- Grok Bot 自身聊天文档的 `@` 指的是在 Grok Bot 对话中选择 Bot、group、routine 或 connector；X 官方帮助对 `@username` 的定义是帖子中的 mention，会进入被提及者的 Notifications，并未说 `@Grok` 会启动 Grok Bot。[E3、E10]
- X 上的 Grok 是可在 x.com/iOS/Android（X 可用处）访问的 AI 助手；X 说明 Grok 可自行决定是否检索公开 X 帖子并实时搜索网页。其公开帖子、公开 profile/Spaces、与 Grok 的输入/输出/交互可能由 X 分享给 xAI 用于训练/微调和个性化，控制项在 X 的 Privacy & Safety → Data sharing and personalization → Grok & Third-party Collaborators。[E9]

### 6. 数据、隐私与删除

- Grok Bot 要求云端数据存储且不支持 Legacy Privacy Mode；隐私/数据分享依 Cursor 账户设置及 Bot 访问流程，训练退出依适用的 Cursor 设置。删除 Bot 会移除活动 profile、conversation、routines，但共享电脑的文件和登录态可能仍在，后端保留依适用 Cursor 条款。[E7、E2]
- Grok Bot 条款还写明持久云环境可能保留 Customer Data、文件、浏览器 session、凭据、memory、routines；同一用户的 Bot 共享该环境，不应视为 Bot 间安全边界。客户需在不再需要时删除/停用 Bot、移除数据、撤销访问和关闭 routines。[E11]
- X 侧可选择退出将公开数据及 Grok 互动/输入/结果用于训练微调，另有 Grok 个性化开关；删除 Grok 对话历史后，X 说明通常在 30 天内从系统移除（法律/安全例外）；将账号设为 private 可阻止帖子被用于训练或在回答中呈现；X 说不出售数据，Grok 在 X 可用国家与 X 可用国家一致。[E9]

### 7. 模型声明、价格和区域限制

- x.ai/bot 价格区块在当前抓取内容中列出 Cursor $20/月、Grok $30/月、Cursor Teams $40/seat/月，并显示周度用量、额外 token 计费等文案；页面也列出 SuperGrok 方案含 “Grok 4.6 model”。这证明页面的套餐/模型营销声明，不证明 Grok Bot 的每个动作固定使用 Grok 4.6 或可由用户选择该模型。[E1]
- xAI 文档概览把 Bot 描述为纳入符合条件的 Cursor 或 SuperGrok 账户，usage 每周重置；企业文档列出 Enterprise 需联系 Cursor account team，xAI 新闻稿 2026-09-03 又称企业已可用。x.ai/bot FAQ 仍写“企业 Soon”，因此可用性应按账户、计划、地区、 rollout 和当日控制台核实，不应从单一页面硬编码。[E1、E4、E12]
- X 官方帮助只明确 Grok on X 在 X 可用的国家可用，并提示部分 Premium 功能可能依平台和地区变化；没有为 Grok Bot 给出独立地区清单。[E9]

## 推断与设计影响（不是 xAI 承诺）

以下是基于上述事实的设计推断，不能当作 Grok Bot 的直接产品声明：

1. **应把“Bot/会话/电脑/技能/routine/连接器/产物”建成不同责任对象。** Bot 拥有长期身份与工作上下文；会话承载交互；电脑承载跨 Bot 的状态；skill 复用方法；routine 负责未来触发；connector 代表外部权限；产物负责可审阅交付。把它们压成单一 session 会丢失持久性、所有权和撤销语义。
2. **持久云环境需要独立的数据边界。** “Bot 间上下文隔离”与“Bot 间电脑状态共享”同时存在；因此授权、文件/凭据生命周期和审计应按用户/租户/连接器明确建模，不能用 Bot ID 作为唯一安全隔离键。
3. **停止、拒绝和撤销必须区分。** 停止消息只影响在途执行；批准是动作前门；撤销连接器或登出才改变后续访问；删除 Bot 也不保证清除共享环境。规格应分别表示这些状态转换。
4. **外部事件触发应作为未闭合能力。** 文档证明 routine 可由“支持的事件”触发，并举 Slack/GitHub 例子；X 公告只证明检查 mentions，不证明 X mention 触发 routine。若本项目要支持 X mention→唤醒，仍需另取 API/事件契约和授权证据。
5. **X 上 Grok 的数据控制不能直接复用于 X connector。** X 帮助页讨论的是 X 产品内 Grok 的训练/个性化/历史删除；Bot 通过 connector 访问 X 账号还涉及 xAI/Cursor/Bot 的共享云环境和第三方授权，应分开建模和问责。
6. **比较时应比较动作闭环而非“模型更强”。** 可比维度是持久对象、运行时、来源/工具、并行协作、无人值守触发、批准与人类 takeover、共享状态、撤销/删除及证据可审阅性；公开资料不足以支持 Grok Bot 与其他产品的模型质量排序。

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| X mention 是否能触发 Grok Bot 或 routine | 查官方 X API/webhook 与 Grok Bot event-trigger 契约；实测需有账号且记录授权、事件、重复/失败 | X connector、外部事件唤醒规格；在证据前只能建模为“Bot 主动检查 mentions” | Connector/反应能力 owner |
| Grok Bot 每类动作使用哪个模型、是否可选/路由 | 查官方模型/产品契约或控制台实际显示；不能从导航“grok-4.6”推导 | 模型路由和能力比较；当前只记录页面模型声明 | 模型契约 owner |
| Bot 云电脑的具体隔离、加密、区域、备份/恢复和日志保留 | 读取官方 Grok Bot security、Cursor 条款/信任中心并固定版本 | 租户隔离、合规和恢复设计；当前只使用公开共享边界 | 安全/存储 owner |
| 页面价格、Enterprise rollout 与地区是否一致 | 固定计划矩阵、账户国家、时间和控制台快照 | 访问与计费适配；当前不得硬编码 $20/$30/$40 为长期政策 | 产品接入 owner |
| X connector 的写操作、速率/费用、token 生命周期和撤销语义 | 查 xAI connector/plugin 文档与 X 官方开发者契约 | X 工具提供者和授权撤销；当前仅采用公告列明的操作 | X connector provider |
| X 上 Grok 与 Bot 的数据是否共享同一保留/训练政策 | 分别读取 X Privacy Policy、xAI/Cursor Bot 条款，取得数据流和删除证明 | 数据治理和租户边界；当前明确二者不可合并 | 隐私/治理 owner |

## 采用与后续核对

本包是候选研究，不接受任何产品政策或实现映射。它可作为后续能力覆盖、Connector 设计、用户批准/观察设计和产品比较的事实输入。若来源页面更新，应追加新的取证记录而不覆盖本次 2026-09-16 观察；若出现 X API、Bot security 或计划矩阵的精确契约，应优先补齐上表未知项。

