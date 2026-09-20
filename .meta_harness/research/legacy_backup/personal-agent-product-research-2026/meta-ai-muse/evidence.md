# Meta AI Muse：可复核来源与观察

**取得日期统一为 2026-09-16（UTC）。** 资料均为 Meta 运营的产品、新闻、研究、安全、条款或
隐私页面；“第一方”表明来源归属，不等于本文已独立运行、渗透测试或审计 Muse。页面会更新，以下
记录固定的是该日期可见的内容与其支持范围。

## E1 — 产品页与 FAQ

- 消费对象：产品入口、宣称能力、授权、后台工作、连接器及免费限制的事实。
- 来源与精确 URL：[Muse: Meta's personal AI agent, features & capabilities](https://ai.meta.com/muse/)。
- 取得方式：访问产品页及其中 FAQ；2026-09-16。该页动态渲染，采集器未给可稳定行号，故以标题和
  FAQ 问题定位。
- 实际观察：页面称 Muse 为“personal AI agent that gets things done”；称其有持久专属 VM/浏览器、
  可在 Muse app 或 WhatsApp 对话、关键行动须审、具有完整 audit trail、连接 email/calendar/
  Instagram 等和“builds its own tools”。FAQ 称可问答、完成任务、浏览、购买、生成图片/文档、经
  Connectors 连服务、提醒/目标/监控后台运行；用户可管理权限；免费有 usage limit，可付费升级。
- 支持范围：支持 Meta 对产品能力和 UX 的公开主张；不支持某项能力必向每人开放、任务确实成功、
  或公开 API/工具实现细节。
- 后续核对：遇产品页、FAQ 或 rollout 更新，保留本条后新建有日期的记录。

## E2 — 发布状态与产品承诺

- 消费对象：产品而非研究 demo 的状态、初始地区/平台、模型关联、核心工作流、账单和 Confidential
  VM 的计划状态。
- 来源与精确 URL：[Introducing Muse: The World’s First Personal AI Agent Built for Everyone](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)，发布日期 2026-09-08。
- 取得方式：访问 Meta Newsroom 发布公告；2026-09-16。
- 实际观察：公告称正在美国向 iOS、Android、`muse.ai` rollout，AI 眼镜 coming soon；大多数需求
  免费、更多用量有订阅计划。它称 Muse 由 Muse Spark 驱动，可按目标计划/协调并后台继续，行动包括
  浏览、填表、谈判、邮件和购买；用户能选连接应用、访问范围、改/断开连接，能 opt out 模型训练，
  能要求忘记记忆。公告称 Confidential VM “later this year”，不是已上线通用功能。
- 支持范围：支持当时的正式发布与厂商功能承诺；“rolling out”不支持全量可用或全球可用，也不证明
  每项路线图功能已交付。
- 后续核对：地区、价格、眼镜和 Confidential VM 状态必须查新公告或适用条款。

## E3 — 公开安全架构说明

- 消费对象：VM/运行 cell、Sentinel、凭据、浏览、连接器、提示注入防御、数据处理和已知风险的
  技术事实。
- 来源与精确 URL：[How We Built Safety Into Muse](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse)（原 `https://security.muse.ai/` 重定向），发布日期 2026-09-08。
- 取得方式：访问 Meta AI Research 页面；2026-09-16；页面称描述的是“system at launch”。
- 实际观察：文中称每人一台隔离云端 Linux VM，客户端经安全传输直连；runtime cell 用
  `systemd-nspawn`，敏感服务在 cell 外。它列出 `hatch-safety`、`privsep`、`hatch-authd`、
  Sentinel、独立 Postgres 与推理/遥测代理；称 Unix socket + `SO_PEERCRED`/ACL 为 IPC 边界。
  Sentinel 为连接器与全部网络出口的唯一许可权威；批准请求直达客户端，具受限范围/期限的能力。
  文中还称代理见 surrogate 而非真实 token、浏览 sub-agent 只见 accessibility tree、用户接管时
  agent 停止、外来内容会被标记为不可信，并有分类器、人审及分层防御。
- 环境与前提：这是 Meta 对启动时实现和防护的自述，不是公开源码、独立审计、SLA 或持续不变承诺。
  文中明确 Muse 仍会犯错、提示注入仍是开放问题；现有架构依运营政策限制 Meta 人员访问而非在密码学
  上阻止运营必需访问；Confidential VM 仍计划推出。
- 支持范围：支持“Meta 公开宣称的架构/控制/限制”；不支持无漏洞、完全隔绝 Meta、每项协议细节或
  其他产品都实现同样机制的断言。
- 后续核对：查架构版本、审计报告、Confidential VM 正式发布和威胁模型变更。

## E4 — 产品交互设计说明

- 消费对象：主聊天/Side Chats、并发任务、目标、后台调度、通知、活动/权限/记忆可见性、
  Artifacts 和不可逆行动 UI 的事实。
- 来源与精确 URL：[How We Designed Muse](https://introducing.muse.ai/)，2026-09。
- 取得方式：访问 Meta 的 Muse 设计页面；2026-09-16。
- 实际观察：页面称 Muse 有自身电脑、文件系统、terminal 和完整浏览器，能写代码/建工具、产出
  documents/PDFs/web pages；任务会按日程和相关事件继续，用户关闭 app 后仍可运行。它称主聊天可被
  打断并可连续给多任务，另有 Side Chats；Goals 显示计划/追踪；用户可看 activity log、获批权限和
  可读写的 Memory files。确定性批准卡/凭据存储不是聊天决定；默认浏览，邮件/购买等难逆行动审批，
  且可调默认谨慎度。文章也明确“it’s early”。
- 支持范围：支持官方设计和 UX 行为描述；不支持对调度可靠性、任务原子性、通知保证或功能全民可得
  的主张。
- 后续核对：以版本化产品帮助页或受授权的真实 UI 测试确定默认值与语义。

## E5 — 隐私政策

- 消费对象：隔离、账户中心、广告、训练开关、连接器、删除/遗忘、收集资料的事实。
- 来源与精确 URL：[Muse Privacy Policy](https://muse.ai/privacy)，生效日 2026-09-08。
- 取得方式：访问 Muse 隐私政策；2026-09-16。
- 实际观察：政策称每人 VM 隔离；可选独立账户或 Accounts Center。独立账户时 Muse interactions/VM
  data 不与其他 Meta 产品共享；对话/VM data 不与 Meta 广告系统共享。AI 训练使用开关初用为 on，
  可在 Data controls 关闭且适用于旧互动；开启时称移除某些 PII 类别并与账户脱钩。连接器可读/写、
  部分可主动更新；可断开但已用数据可能仍在记忆/对话。reset 删除全部 Muse data，但删物仍可能被
  记住，须 Forget；收集资料包含文字、语音、照片、文件、`MEMORY.md`、偏好/目标/记忆/计划任务、
  connector 内容及活动/访问网站/交易元数据。
- 支持范围：支持政策规定的数据处理与用户控制；不支持“无任何资料收集”、遗忘的底层擦除时限、
  第三方连接器的数据实践或 Confidential VM 已用。
- 后续核对：政策生效日期、训练默认和 Accounts Center 文案变化时追加记录。

## E6 — 使用条款与可用性限制

- 消费对象：年龄、连接器/账户、用户监督与责任、价格性质、Meta 介入、准确性/执行限制与禁止用途。
- 来源与精确 URL：[Muse Supplemental Terms of Service](https://muse.ai/terms)，最后更新 2026-09-08。
- 取得方式：访问 Muse 条款；2026-09-16。
- 实际观察：条款规定 18 岁以下或当地更高年龄不得使用；账户中心是可选的。用户控制连接器授权、
  可限只读或要求审批/随时断连，对指示、连接资料和代表其行动负有责任。条款要求有意义人审，尤其
  对通信、金融、删除、改配置等状态变更。Meta 可为安全、合规和运营监控/记录/审查/暂停/阻止/改动
  行动；条款警告输出/行动会不准确、出错或不按预期，且不保证完成、及时、可逆、可持续、无错或兼容。
  免费可变更/停止，可能有订阅或额外付费 usage，但未列公开价格。条款还列多项禁止用途（含绕过
  第三方安全、人类未实质审查的高影响决定、隐瞒自动化、恶意代码和贸易管制违规）。
- 支持范围：支持合同/责任和限制文字，不表示 Meta 实际必然执行每项规则，也不应代替适用司法辖区
  的法律解释。
- 后续核对：定价、地区、产品权利或争议条款变化需以新版本条款重查。

## E7 — Muse Spark 模型资料

- 消费对象：只为解释发布公告中“powered by Muse Spark”的模型背景与多模态/工具/多 agent 术语，
  不用于扩大 Muse 产品功能。
- 来源与精确 URL：[Introducing Muse Spark: Scaling Towards Personal Superintelligence](https://ai.meta.com/blog/introducing-muse-spark-msl/)，发布日期 2026-04-08。
- 取得方式：访问 Meta AI 官方模型博客；2026-09-16。
- 实际观察：Meta 称 Muse Spark 是 Muse family 首个模型，原生多模态推理，支持 tool-use、visual
  chain of thought 和 multi-agent orchestration；文章称其在 Meta AI app / `meta.ai` 可用。安全文章
  另在 Muse 浏览语境提到 Muse Spark 1.3。
- 支持范围：支持模型资料所述能力和与 Muse family 的关系；因为该文主要论 Meta AI app/`meta.ai`，
  除发布公告和 Muse 安全文明确连接者外，不支持把 Meta AI 的任何 feature 自动归属 Muse，更不支持
  推断 Muse 的全局生产模型版本。
- 后续核对：等待 Muse 的发布说明、模型卡或版本化 feature matrix 说明实际模型路由。
