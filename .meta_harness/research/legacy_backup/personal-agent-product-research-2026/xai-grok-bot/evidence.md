# 可复核的来源与观察

本轮所有记录均于 **2026-09-16** 访问；来源限 xAI 官方（`x.ai`、`docs.x.ai`）和 X 官方帮助中心（`help.x.com`）。页面的发布时间/最近更新时间是页面自身提供的线索，不是内容冻结哈希。取得方式为网页搜索后直接打开 URL 阅读正文；未执行产品登录、API 调用或黑盒实验。

## E1 — 产品页对象、交互、价格和 FAQ

- 消费对象：研究正文 §产品对象、生命周期、价格/可用性。
- 来源与精确修订：[Grok Bot 产品页](https://x.ai/bot)；访问 2026-09-16。页面标识 ©2026 SpaceXAI，未显示固定版本号。
- 取得方式：直接打开页面，阅读 “Meet Grok Bot”“Message Bots like teammates”“Work with many Bots at once”“Grok Bot works where you work”“Show a Bot how it’s done”“Connect the Bots”“Pricing”“FAQs”。
- 实际观察：页面称 Bot 可登录用户工具、从项目开始到结束工作、保留上下文、在需要批准时回来；Bot 可并行且 24/7 工作；有自己的电脑、routine、周度用量；FAQ 称 Bot 共享一台持久云电脑，隔离按用户而非按 Bot；页面显示 Cursor/Grok/Teams 价格文案及 Grok 4.6、Enterprise Soon 的表述。
- 支持范围：支持产品页在该取证时刻的公开定位、价格文案和 FAQ 断言；不支持模型固定路由、SLA、完整计划矩阵或页面外企业可用性。

## E2 — Bot 对象、记忆、复制、共享和删除

- 消费对象：研究正文 §身份、生命周期、共享边界、记忆。
- 来源与精确修订：[Create and manage Bots](https://docs.x.ai/grok-bot/bots)；页面最近更新时间 2026-09-07；访问 2026-09-16。
- 取得方式：直接打开并阅读 Bot 定义、创建/编辑/隐藏、复制、分享、删除、记忆和组织章节。
- 实际观察：Bot 有名称、工作、自己的 conversation 和随时间发展的 working context；描述承载长期边界；复制不携带历史、记忆或附件；分享链接公开配置但不分享电脑/登录/历史；删除不保证删除共享电脑文件/登录；记忆保留偏好、事实和摘要，官方警告它不是权威数据源。
- 支持范围：支持 Bot 对象和产品操作语义；不支持未公开的底层存储格式、备份恢复或删除后端时限。

## E3 — 消息、群组、`@` 与 Bot 间交接

- 消费对象：研究正文 §交互生命周期、§X mention 边界。
- 来源与精确修订：[Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)；页面最近更新时间 2026-09-02；访问 2026-09-16。
- 取得方式：直接打开并阅读 Message a Bot、Redirect work in progress、Start a group chat、Direct a message、Let Bots hand work off。
- 实际观察：产品内可用 `@` 选择 Bot、group、routine、connector；群组为 2–6 Bot；直接消息可重定向工作；Stop now 不撤销已完成动作；Bot 可异步唤醒另一个 Bot并交接上下文。
- 支持范围：支持 Grok Bot 应用内寻址与交接；不支持 `@` 同义于 X 帖子 mention，也不支持外部 X mention 触发 Bot。

## E4 — 持久云电脑、连接器和跨 Bot 共享环境

- 消费对象：研究正文 §执行环境、身份/授权、共享安全边界。
- 来源与精确修订：[Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)；访问 2026-09-16（页面未在抓取片段显示更新时间）。
- 取得方式：直接打开并阅读持久云电脑、共享电脑、takeover、登录、connector、`/workspace`章节。
- 实际观察：Bot 可使用浏览器、命令行、文件和连接工具；同一用户的 Bot 共享 cookie、登录态、文件、命令行凭据；不同屏幕支持并行但不是安全边界；关闭 app/电脑不停止云端工作；connector 在 Settings → Plugins 安装，聊天用 `@` 附加，安装为账号级；`/workspace` 用于持久文件。
- 支持范围：支持公开工作流和共享边界；不支持底层虚拟机技术、区域、加密、日志和灾备细节。

## E5 — Skill、routine、演示学习和事件触发

- 消费对象：研究正文 §生命周期、自动化治理、未闭合的 X 事件触发。
- 来源与精确修订：[Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)；页面最近更新时间 2026-08-11；访问 2026-09-16。
- 取得方式：直接打开并阅读 skill/routine 定义、Teach a task、Create a routine、Trigger work from an event、Test before enabling、Manage routines。
- 实际观察：skill 是复用指令，routine 按计划或（支持时）事件运行；可演示学习最多记录十分钟；测试运行会执行真实工作；每 Bot 最多 50 routine、每 routine 保留 20 条最近记录；长时间离开可能询问并暂停；文档举 Slack/GitHub 事件例子。
- 支持范围：支持 routine 和事件触发抽象的公开说明；不支持 X mention 已是支持事件，也不支持可靠性、幂等或重试保证。

## E6 — 文件、结果和证据可审阅性

- 消费对象：研究正文 §工具/产物、产品比较维度。
- 来源与精确修订：[Files and results](https://docs.x.ai/grok-bot/files-and-results)；页面最近更新时间 2026-08-11；访问 2026-09-16。
- 取得方式：直接打开并阅读 Attach files、Share a link、Ask for a reviewable result、Preview generated work、Preserve evidence、Shared computer files。
- 实际观察：文档列出支持的文件类型、桌面一次最多六个附件及大小限制；结果可预览/保存/修改；建议保留直接链接、截图、时间戳、输入输出文件名、动作日志和未验证清单；共享 `/workspace` 文件供 Bot 交接。
- 支持范围：支持公开输入/输出和证据建议；不支持所有格式均可读、结果准确性或自动产生完整审计。

## E7 — 批准、Auto Review、密钥、人机接管和隐私控制

- 消费对象：研究正文 §控制面、§数据治理、§动作边界。
- 来源与精确修订：[Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)；页面最近更新时间 2026-09-02；访问 2026-09-16。
- 取得方式：直接打开并阅读 Set a boundary、Review an action、Configure Auto Review、Enter passwords、Control access to local computer、shared-computer boundary、Cursor account/data settings、Remove access。
- 实际观察：敏感动作应设批准；批准不回滚；Auto Review 在动作前评估且规则有优先级；密码/2FA/CAPTCHA/支付由用户 takeover；secret request 的值遮蔽且不进 transcript；云电脑与本地电脑权限分离；Bot 要求云端存储、不支持 Legacy Privacy Mode；删 Bot 不清共享文件/会话。
- 支持范围：支持文档明确的控制面、警告和删除操作；不支持安全控制必然有效、底层保留期限、完整企业安全认证或第三方条款的全部细节。

## E8 — X connector 集成

- 消费对象：研究正文 §X 集成、外部环境来源、X mention 未验证项。
- 来源与精确修订：[Grok Bot now works with X](https://x.ai/news/grok-bot-and-x)；发布日期 2026-08-29；访问 2026-09-16。
- 取得方式：直接打开官方新闻稿。
- 实际观察：连接 X 账号，若没有开发者账号由产品创建；付费 Grok Bot 用户起始获得免费 X API credits；Bot 可搜索帖子、读取时间线、检查 mentions、汇总 X 动态；X plugin 可搜索帖子、读时间线、拉趋势、管理书签；公告称这是第一版集成。
- 支持范围：支持从 Grok Bot 侧访问 X 的公开功能清单；不支持任何外部 X 事件会自动唤醒 Bot、支持哪些写操作、速率限制、授权撤销和 token 生命周期。

## E9 — X 上 Grok 的能力、数据控制与地区

- 消费对象：研究正文 §区分 X 上 Grok 与 Grok Bot、隐私和区域限制。
- 来源与精确修订：[About Grok, Your Humorous AI Assistant on X](https://help.x.com/en/using-x/about-grok)；访问 2026-09-16。
- 取得方式：直接打开 X 官方帮助页，阅读 What is Grok、How does Grok use data、训练/个性化退出、删除历史、保护帖子、Where can I find Grok、Countries。
- 实际观察：X 上 Grok 可回答、解决问题、头脑风暴；可决定是否搜索公开 X 帖子和实时 web；X 可能把公开数据、互动、输入和结果提供给 xAI 用于训练/微调/个性化；有 Data Sharing、Grok Personalization 开关；删除历史通常 30 天内移除（法律/安全例外）；私密账号的帖子不用于训练/回答；在 X 可用的国家可用。
- 支持范围：只支持 X 产品内 Grok 的公开行为和控制；不支持 Grok Bot/Cursor 云电脑使用相同数据政策。

## E10 — X 通用 mention 语义

- 消费对象：研究正文 §X mention invocation 的未验证边界。
- 来源与精确修订：[About replies and mentions](https://help.x.com/en/using-x/mentions-and-replies)；访问 2026-09-16。
- 取得方式：直接打开 X 官方帮助页，阅读 Mention overview 和 How to post a mention。
- 实际观察：X mention 是帖子正文含用户名；被提及者在 Notifications 的 Mentions 中看到；使用 `@` 加用户名发布帖子即可形成 mention。
- 支持范围：支持 X 通用 mention 的呈现/通知语义；没有任何 Grok Bot invocation 语句，因此不能据此声称 `@Grok` 会启动 Bot。

## E11 — Grok Bot 条款中的动作责任和持久环境

- 消费对象：研究正文 §控制面、§隐私/生命周期、动作不可逆边界。
- 来源与精确修订：[Grok Bot Terms](https://x.ai/legal/grok-bot-terms)；页面标注 Last updated: 2026-09-03；访问 2026-09-16。
- 取得方式：直接打开并阅读 Access and Use、Agentic Actions、Warnings and Human Review、Persistent and Shared Environment。
- 实际观察：条款允许 autonomous actions（网站、代码、文件、通信、数据、工具和第三方服务）；客户负责授权、合法性、权限、批准、花费限制、监控；动作可能不准、不完整、延迟、失败或非预期，审查不保证拦截/撤销；持久环境可能保留 Customer Data、文件、会话、凭据、memory、routines，同一用户 Bot 共享且不应当作安全边界。
- 支持范围：支持条款层面的责任和风险警示；不构成对每个计划/地区的完整合同解释，也不支持本项目接受同样责任分配。

## E12 — 可用性冲突与企业入口

- 消费对象：研究正文 §价格/地区/可用性、未知项“页面 rollout”。
- 来源与精确修订：[Grok Bot for Enterprise](https://x.ai/news/grok-bot-for-enterprise)，发布日期 2026-09-03；[Grok Bot 产品页](https://x.ai/bot)，访问 2026-09-16；[Grok Bot for teams and enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises)，访问 2026-09-16。
- 取得方式：直接打开三页并对照 Availability/FAQ。
- 实际观察：新闻稿称 2026-09-03 企业可用且提供两周免费用量；团队文档称 Enterprise 需联系 Cursor account team；产品页 FAQ 仍称 Enterprise Soon、当前可用计划为 Cursor Pro/Pro+/Ultra、SuperGrok 系列和 Teams Standard/Premium。三者在企业 rollout/入口描述上不一致。
- 支持范围：支持“公开页面存在时间差/rollout 差异”这一事实；不支持选择其中一页作为本项目稳定可用性政策。后续应按固定计划矩阵和账户实际状态复核。

## 综合限制

- 本次是页面研究，不是登录后验收；没有验证实际 X 授权、Bot 执行、routine 触发、失败恢复、删除结果或账单。
- 来源页面为动态产品文档，访问日快照没有统一内容哈希；后续更新应追加记录，不能让本记录代表新版本。
- 资料未提供 Grok Bot 的固定模型路由、完整 API/事件 schema、速率/费用/地区矩阵、云电脑区域/加密/备份/日志保留等精确契约。
- X Help 的隐私说明明确适用于 X 上 Grok；不能把它扩大为 Grok Bot 通过 X connector 的完整数据治理结论。

