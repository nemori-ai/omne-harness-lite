# 连接件与斜杠命令：现在该信什么

- 调查对象与日期：omne-next `omne_harness` @ `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；DSH @ `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`）；2026-09-23。
- 消费者：本程 proposal「Connector 与 Slash Command 形状起点」（待出现）。
- 最近核对：2026-09-23 / 上述两个 SHA。
- 当前结论：两源都**没有**一个与 PF-002「连接件」或「斜杠命令」一一对应的对象。omne-next 把外部接入拆成「安装」与「供给通道」、
  并让供给内容**不触发运行**；它的斜杠命令几乎全在设计层。DSH 没有连接件（webhook 是建新会话的可信规则），
  它的 `/` 同时承载三种东西（UI 命令、宿主命令、skill 手势），撞名靠优先级与 fail loud。未知项见文末。

本页不拥有方案选择：每条结论写到「这条事实让什么变得不可能、什么要额外付出代价」为止。
标 **〔设计〕** 的是 omne-next 的 ADR / 需求 / 设计文档说法，**本 SHA 下没有实现**；标 **〔代码〕** 的已在源码核到。

## 问题与区分条件

九问（详见[当轮报告](reports/2026-09-23-connector-and-slash-command.md#九问逐条)）：连接件的对象模型、有没有读取面 / 管理面、
进来后怎么落到受理、DSH 的对照、条款对照表；斜杠命令的对象模型、与 skill 的绑定关系、与交付面动作撞名的处置、条款对照表。

会改变判断的观察：某一源其实有「消息进来就起运行」的连接件实现（会推翻「被动感知」一条）；omne-next 在本 SHA 之后落了命令框架（会让斜杠命令各条从〔设计〕变〔代码〕，需重核）。

## 证据入口

逐条来源在 [evidence.md](evidence.md)，按「连接件 · omne-next」「连接件 · DSH」「斜杠命令 · omne-next」「斜杠命令 · DSH」「短板」五组编号。
下文每条结论的「来源」指向那里的锚点。

## 当前结论 · 连接件

### omne-next 没有以 name 为身份的连接件对象：它拆成实现、安装与供给通道三层，只有「安装」建了模

omne-next 把 PF-002 一个「连接件」对应的东西拆成三层：**信源实现**（未来发布层 `Publisher → Connector → ConnectorVersion`，**明文不建**）、
**安装** `SourceInstallation`（inbound 子系统的用户授权聚合）、**供给通道**（state 子系统的 `ChannelDefinition` 模板加上按用户划分的 `ChannelBuffer` 实例）。〔代码〕安装的身份是
不透明的 UUID7 `installation_id`；`(owner_tenant_id, user_id)` 只是过滤列，`installation_namespace`（开放 slug）只是用户范围内唯一的别名，**都不是身份**。
同一用户可以把同一实现装多次（不同外部账户），靠 `installation_id` 与未来的 `credential_binding_id` 区分〔设计〕。
凭据只以表单式 `credential_spec`（key / required / secret / description）声明，秘密值永不进聚合〔设计〕。

- 适用范围：omne-next `6263fed` 的 inbound 与 state 两个子系统，以及 ADR-058（含 §7 修正案）。不推广到未来发布层——它没有任何实现。
- 代价与不适用：拆三层让「同一实现、同一用户、多个外部账户」可表达，代价是一个 PF-002 概念要三处对象协同：
  安装由 inbound 持有，供给写权由 state 的本地投影持有，两边靠 outbox→relay 事件同步。ADR-058 §7.10 ⑩ 明写**事件改名必须和消费者同一波落地**，
  否则新安装会被永久拒写。发布层不建，意味着「世上有哪些可装的连接件」**在 omne-next 里没有对象回答**。
- 撞上这条事实会怎样：若照搬 PF-002「身份 = name」，omne-next 允许的「同用户同实现多账户」就没有表达位置；反过来照搬 omne-next 的不透明 id，
  PF-002 的[同标识覆盖](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)就找不到按名匹配的键。
- 来源：[E-C1](evidence.md#e-c1-安装聚合-sourceinstallation-的身份与字段)、[E-C2](evidence.md#e-c2-adr-058-7注册即安装修正案三层拆分凭据表单未来发布层)、[E-C9](evidence.md#e-c9-adr-064-三层-entitlement代码落地程度)
- 最近核对：2026-09-23 / omne-next `6263fed`

### omne-next 的连接件内容走「被动感知」：落有界 channel buffer，本身不启动运行

〔代码〕连接件经 SDK 的 `push_to_channel` 把一条候选内容推进 state 的 channel buffer，结果只有三种：
`admitted`（收下）/ `coalesced`（并入近期重复）/ `dropped`（拒收）。best_effort 通道在近期窗口满时**丢弃新消息**（背压）。
〔设计〕这些内容只在**已经因别的原因在跑**的会话里，于 `before_agent` / `before_model` 两个边界被动注入；
需求原话是「Channel 更新本身绝不启动 Run 或恢复休眠 Session」。恢复后不补发（INV-SRC-6），语义是「保留最新 N 条、尽力而为」。
要让外部内容**唤醒** agent，omne-next 另立了一个非 agent 的「reaction 订阅者」，按规则把 channel 变化组装成标准 Inbound Trigger。
它是 committed-future，**没有实现**。

- 适用范围：`external_source.channel_supply` 这条供给路径。omne-next 另有 `trigger_origin = webhook / sse / world` 的触发枚举值，
  但本 SHA 的 inbound web server 只给 chat、scheduled、control 与 external-sources 安装开了端点，**没有 webhook 类受理端点**（见下一条）。
- 代价与不适用：被动感知让慢信源、挂掉的信源结构上拖不慢 agent 的一轮（INV-FLUSH-ISO），代价是**不可靠逐条触达**：
  有界 buffer 会丢，中断窗口不补。omne-next 自己写明「可靠逐条触达走 inbound trigger / dispatch / objective」。
- 撞上这条事实会怎样：PF-014 定的是**相反**方向。[§6.2](../../design/product/PF-014-inbound-intake-and-queueing/design.md#62-送进来的就要被处理要不要送进来归连接件)（rev 3）要求经连接件送达的消息
  「受理之后就进队列，和用户自己说的那一句一视同仁」，并明确否决「收下但不进队列」；[§6.6](../../design/product/PF-014-inbound-intake-and-queueing/design.md#66-队列不设容量上限) 要求队列不设容量上限，
  [§6.7](../../design/product/PF-014-inbound-intake-and-queueing/design.md#67-不漏不重) 要求不漏。照搬 omne-next 的供给通道，会同时违反这三条。
  omne-next 里与 PF-014 同向的是那条**未实现**的 reaction→Trigger 路径，不是连接件本身。
- 来源：[E-C3](evidence.md#e-c3-推送面三种结果背压丢弃推送请求不收会话坐标)、[E-C4](evidence.md#e-c4-供给内容只在运行中的会话里被动感知恢复不补发)、[E-C5](evidence.md#e-c5-唤醒-agent-另立-reaction-订阅者未实现)
- 最近核对：2026-09-23 / omne-next `6263fed`

### omne-next 的触发受理只有 chat、scheduled 与 control 三个入口，外部事件类 trigger_origin 只停在枚举值

〔代码〕inbound 的 `CANONICAL_TRIGGER_ORIGINS` 有六个值：chat、scheduled、webhook、sse、world、domain_event。
载荷先二分：invocation（产生新执行）或 control（操纵已有 run）。invocation 翻译成五字段的 `InvocationRequest`，
地址要补全到 `(user_id, agent_id, session_id)` 才能出站。
但 inbound web server 的路由只有 chat、control、scheduled、external-sources（安装生命周期）、accepted-route 与 meta；
`external_source.observation`（事件→trigger→起会话）只在 ADR 与注册协议文档里出现，**全仓没有实现**。

- 适用范围：omne-next `6263fed` 的 `omne_harness_inbound*` 包。
- 代价与不适用：外部事件「进来就触发」的受理面在 omne-next 里**没有可参照的实现**，只有枚举值与一条「用户偏好」`MessageArrivalPolicy {queue, insert}`，
  用来决定运行中来新消息时排队还是插队。PF-014 把插队定为用户每次明确发的控制指令，不是一项偏好，两者方向不同。
- 来源：[E-C6](evidence.md#e-c6-触发受理trigger_origin-枚举载荷二分实际开放的端点)
- 最近核对：2026-09-23 / omne-next `6263fed`

### omne-next 把「送进来的消息按什么身份处理」写成结构规则，而不是一项可配的权限

〔代码〕供给行坐标 `(channel_name, owner_tenant_id, user_id)` **只**从已证明的凭据加上 `installation_id` 选中的 writer binding 派生；
推送请求带任何会话坐标（`session_id / user_id / agent_id / tenant_id`）都会被拒（422）。
写权要求调用者的 principal 等于 binding 的 `executor_principal_id`，租户与用户也要匹配，且安装在本地投影里处于 active。
〔设计〕内容「永远是数据、永不是指令」，这是三层不变式：摄入只收 schema 校验过的 JSON；渲染只走声明式的 `xml_format_config`，
经逃逸，包在 `<system_reminder>` 里，角色为 Human；注册期还要对格式配置本身做净化。

- 适用范围：channel_supply 路径。reaction→Trigger 路径〔设计〕同样要求「wake prompt 与 Channel data 分开建模，外部数据仍只是 data」。
- 代价与不适用：身份不可配，换来的是「外部内容改不了 prompt 结构、目标、权限与路由」。代价是，这里**没有**PF-002 那种按层级求值、组织可锁的
  「处理身份」权限位——它的取值只能是「装它的那个用户的世界」。
- 撞上这条事实会怎样：PF-014 把连接件送达的消息定为 `UserMessage`，[与用户自己说的一视同仁](../../design/product/PF-014-inbound-intake-and-queueing/design.md#62-送进来的就要被处理要不要送进来归连接件)；
  omne-next 则刻意不让它和用户输入同权。两者对「外部文本能不能触发用户才有的手势」（比如斜杠命令、skill 手势）给出不同的前提，
  DSH 的做法见「DSH 没有连接件」一条。
- 来源：[E-C7](evidence.md#e-c7-写权与坐标派生内容永远是数据不变式)、[E-C5](evidence.md#e-c5-唤醒-agent-另立-reaction-订阅者未实现)
- 最近核对：2026-09-23 / omne-next `6263fed`

### omne-next 的 SDK 面锁死三方法、零读取面零管理面，但服务端给执行者开了生命周期控制端点，且 SDK 的状态查询在服务端没有路由

〔代码〕`omne_harness_connector_sdk` 只发布 `register` / `push_to_channel` / `get_status` 三个方法，由白名单常量与单测锁住；
第三方永远拿不到任何 `*_web_client` 内部包。README 原话是「zero harness data-read surface, zero management surface, zero East-West methods」。
服务端的分工是：安装与卸载只接受 `HUMAN_USER`（执行者不能代用户安装）；**suspend / resume / tombstone 三个技术控制端点接受 `PLATFORM_SERVICE` 执行者**。
SDK 的 `get_status` 打 `GET /api/v1/external-sources/{installation_id}`，本 SHA 下服务端**没有这条 GET 路由**，SDK 单测只对 mock 验证。

- 适用范围：omne-next `6263fed`。「零读取面」指读不到 harness 的数据；`get_status` 读的是安装自己的状态，ADR-058 称之为「self-scoped」。
- 代价与不适用：「零管理面」是 SDK 投放面上的约束，**不是服务端授权上的约束**——执行者身份在服务端仍能暂停、恢复、永久退役一个安装。
  omne-next 自己写明「SDK 不是安全边界（服务端 authz 才是）」。
- 撞上这条事实会怎样：PF-002 说连接件「没有管理面」。若把这句只落在客户端 SDK 上，就会出现 omne-next 这样的形状：接入件的执行身份在服务端握着生命周期动词。
- 来源：[E-C8](evidence.md#e-c8-sdk-三方法白名单服务端各端点的主体要求get_status-缺路由)、[E-K2](evidence.md#e-k2-授权落在-web_server-层并横跨两个子系统)
- 最近核对：2026-09-23 / omne-next `6263fed`

### omne-next 的「能不能安装」是三层：租户白名单与强制安装、用户安装、agent 订阅，可见性是三者交集

〔设计〕ADR-064 定了三层，各有各的键：层 1 `ConnectorEntitlement`，键是租户，含 admission 白名单与 mandate 强制安装；
层 2 `SourceInstallation`，键是（租户，用户）；层 3 agent blueprint 里写好的订阅，键是（用户，agent）。三者单独都不构成授权。
白名单只在**安装期**查一次；某信源事后被移出白名单时，已有安装**不会自动失效**（OQ-B 未裁）。
强制安装由组织产生、`origin = org_mandated`，用户不可卸。〔代码〕只落了 `InstallationOrigin` 与「org_mandated 不许用户卸载」的检查；
`ConnectorEntitlement` 在 libs 里零命中，安装准入端口的默认实现是全放行（`PermissiveSourceInstallationAdmission`）。

- 适用范围：omne-next ADR-064（Accepted，聚合边界自称「暂定」）与本 SHA 代码。
- 代价与不适用：ADR-064 自己点名最大的一笔成本，是它**新增了一条跨子系统关系**（白名单归属未裁，可能落到 BC-7 treaty → BC-5 hard-floor）；
  白名单收紧对已有安装的效果未定。「组织级共享内容」被明确**不建**：组织要全员看到，就给每个成员各装一份。
- 来源：[E-C9](evidence.md#e-c9-adr-064-三层-entitlement代码落地程度)
- 最近核对：2026-09-23 / omne-next `6263fed`

### DSH 没有连接件：外部事件由可信的 webhook 规则新建一个根会话，ACP 是带完整会话管理面的可信控制端

〔代码/文档〕DSH 的 webhook 家族分两层：provider 适配器（如 `webhook-github`，验签 HMAC 后返回 202）负责鉴权与规整；
**规则**是可信代码，可以执行任意外部调用，返回 `null` 或一个 `WebhookSessionRequest`。唯一内置动作是**新建一个普通根会话**，
请求里由规则指定 `agentPreset` 与 `permissionPreset`，然后 `Agent.followup()` 一条 `source.kind: "webhook"` 的用户角色消息，
消息带上 provider / source / delivery / rule 的来源信息。它只在进程内即发即忘：**无队列、无重投、无去重**，`deliveryId` 只作来源记录，
重复投递会重新跑规则、可能建出重复会话。
ACP 服务端面向「可信控制端」：`authenticate` 直接成功；它提供 `session/new / list / resume / close / set_config_option / prompt / cancel`、
挂 MCP、回答权限请求，结果以 `session/update` 流出。它是**双向的自动化控制协议**，不是入站接入件；ACP 明确不提供命令面。
另一个相关事实是：DSH 的 skill `/name` 手势**只扫描 `source.kind === 'user'` 的消息**，源码注释写着「external text cannot forge the gesture」。

- 适用范围：DSH `c291e796`，Web Host 形态；DSH 单用户、无租户。
- 代价与不适用：webhook 的「处理身份」就是规则选的两个 preset，每条规则一份，没有层级求值。webhook 不进入**已有**会话，
  而 PF-014 的[入站到达](../../design/product/PF-014-inbound-intake-and-queueing/design.md#入站到达)「归属于恰好一个会话」；它不去重，与
  [§6.3](../../design/product/PF-014-inbound-intake-and-queueing/design.md#63-去重只认来源说得出的那个同一件事) 相反；崩溃即丢，与 §6.7 相反。
  规则能做任意外部调用，也就不满足 PF-002「只能送消息进来」。ACP 同时有读取面与管理面，与 PF-002 连接件的两条「没有」都相反。
- 来源：[E-D1](evidence.md#e-d1-webhook-规则运行时)、[E-D2](evidence.md#e-d2-github-webhook-适配器)、[E-D3](evidence.md#e-d3-acp-服务端)、[E-S9](evidence.md#e-s9-skill-的-name-手势与调用开关)
- 最近核对：2026-09-23 / DSH `c291e796`

## 当前结论 · 斜杠命令

### omne-next 的斜杠命令在本 SHA 下几乎全是设计：只有一个无调用方的前缀分类器和组件目录里的 slash_command 种类

〔代码〕`SlashCommandClassifier` 只做前缀识别：开头 `/` 之后的第一个 token 就是命令名。bootstrap 实例化了它，**全仓没有应用层调用方**；
omne-next 自己的 traceability 矩阵写着「grep 验真」。`AdapterTranslator` 产出的 `trigger_metadata` 没有承载命令名与参数的键。
组件目录把 `slash_command` 列为五种组件之一，有登记、挂起、恢复、策展、拒收、注销、墓碑等生命周期事件。
〔设计〕解析协议、有效命令目录、参数语法、撤销水位，全在 ADR-063（**Proposed**）与需求 `inbound-contextual-command-discovery-and-governed-invocation`（`committed-future`）里。
ADR-131 的 2026-09-10 修正案原话：「用户 2026-09-10 核实系统尚无任何已交付的用户命令机制」。

- 适用范围：omne-next `6263fed`。
- 代价与不适用：下面凡引 omne-next 的斜杠命令形状，都只能当**一个未经实现检验的设计**看：没有真实命令用过它的参数语法、撤销 fence 与目录快照。
- 来源：[E-S1](evidence.md#e-s1-前缀分类器没有调用方)、[E-S2](evidence.md#e-s2-命令框架整体未交付)
- 最近核对：2026-09-23 / omne-next `6263fed`

### 两源都以名字为命令身份，但 omne-next 强制限定名、DSH 用裸名加作用域遮蔽

omne-next〔设计〕：命令名**恒为限定名** `namespace:name`，不做省略解析；跨命名空间天然不撞，同一 blueprint 扁平后重名在编译期 fail-fast（INV-4-2）。
〔代码〕组件层的寻址键是 `ComponentRef (kind, source, qualified_id, version_pin)`；编译时扁平出的 `slash_commands` 是一串 `qualified_id`，只为查重名服务。
DSH〔代码〕：名字是小写 `[a-z][a-z0-9_-]*`，另有与展示文案无关的可选 `definitionId`；同一层重名**注册即抛**；
挂在某 agent 下的命令**遮蔽**同名全局命令，只对该 agent 生效。

- 适用范围：omne-next 设计 + 编译代码；DSH `dsh-commands`。
- 代价与不适用：限定名消掉了优先级规则，代价是用户每次都要敲命名空间，omne-next 把手打负担全推给 hints 的模糊匹配。
  DSH 的作用域遮蔽让「同名不同义」在不同 agent 上合法，代价是同一个名字的含义要看当前 agent。
  PF-002「命令名是身份」两者都满足，但**命名空间是不是身份的一部分**，PF-002 没说。
- 来源：[E-S3](evidence.md#e-s3-命令身份编译期重名检查编译期-allowdeny)、[E-S8](evidence.md#e-s8-dsh-commands-注册表)
- 最近核对：2026-09-23 / 两个 SHA

### 两源都没有「独立命令对象与 skill 多对多绑定」：omne-next 设计里一条命令至多绑一个 skill，DSH 的 skill 自己就是入口

omne-next〔设计〕：绑定表放在 blueprint manifest 的 `slash_commands` 段，由 BC-3 **唯一持有**。每条是 `{command, skill_ref | null, prompt_template | null, description}`，
skill_ref 与 prompt_template 至少选一个、可以并存。于是一条命令**至多一个 skill**，一个 skill 可被多条命令引用（设计没有禁止），skill 也可以没有命令。
`skill_ref` 是引用，绑定由 blueprint 持有，不由命令持有，**绑定不转移所有权**在形状上成立。
〔代码〕这张表**没有承载面**；组件目录里的 `SlashCommandVariant` 只有 `when_to_use / argument_hint / arguments / paths / declared_directives`，
**没有任何 skill 引用字段**——一个 `slash_command` 组件本身就是一份带 frontmatter 的 prompt 文件，与 skill 是「平行种类、无继承」。
DSH〔代码〕有两套 `/`：`dsh-commands` 的命令是插件注册的 **handler 代码**，不绑 skill；skill 的 `/name` 手势让 **skill 自己当入口**，
身份就是 skill 名，二者 1:1。skill 用 `userInvocable` / `modelInvocable` 两个开关决定出现在人的入口还是模型的入口。

- 适用范围：omne-next 设计文档 bc-3 §13.1 与组件契约代码；DSH `dsh-commands`、`tool-skill`、`skill`。
- 代价与不适用：omne-next 设计里「manifest 内联绑定」与「组件目录里的独立 slash_command」是**两种并存的命令形状**，谁是权威没有收口。
  DSH 的 skill 即入口，无法表达「同一 skill 两个入口」或「一个入口装 skill 再加一段 prompt」。PF-002 要的多对多，**两源都没有实现可参照**。
- 来源：[E-S4](evidence.md#e-s4-绑定表与组件变体)、[E-S9](evidence.md#e-s9-skill-的-name-手势与调用开关)
- 最近核对：2026-09-23 / 两个 SHA

### 两源都有以 `/` 触发、却不作为内容进队列的命令

omne-next〔设计〕：上下文装载型 slash 解析后**归约为一条普通 chat 调用**，`trigger_origin` 仍是 chat，剩余自然语言与装载内容同属一轮；
支持连续多条命令递归解析；未知、过期、被撤销或参数错误都 **fail loud，不退化为普通聊天**；另须给一条显式的「按普通文本发送」路径。
2026-09-07 的范围修订把「独立 Session 排队命令（例如压缩）」**划出这条归约**：它们按自己的排队语义执行，由服务端解释的声明决定插入位置与一次性队列动作。
DSH〔代码〕：`dsh-commands` 的命令**不产生模型消息**，只在会话日志追加成对的 `command/run` 与 `command/done`（log-only）；handler 自己决定要不要 followup。
例如 `/compact` 直接调 `compaction.compactNow`，`/goal` 在带附件时 followup 一条用户消息，`/feedback` 只写反馈。
skill 手势则把 skill 正文作为 user 角色的指令上下文注入**那一步**。

- 适用范围：omne-next 需求与 ADR-131（Accepted）+ ADR-063（Proposed）；DSH `dsh-commands`、三个 `command-*` 包、`tool-skill`。
- 代价与不适用：DSH 在备选里否决了「把人类命令做成模型工具」，理由是延迟、token 与再诠释。代价是命令结果不进模型历史，要靠 handler 自己去改领域状态。
- 撞上这条事实会怎样：PF-014 [§5.5](../../design/product/PF-014-inbound-intake-and-queueing/design.md#看着像控制指令其实不是) 与 PF-016 [§5.7](../../design/product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) 把斜杠命令定为**内容、进队列、属会话族**。
  两源里用 `/` 敲出、却不是内容的那批（压缩、目标、反馈、计划模式），在本项目的产品正文里要么是 PF-016 的会话动作，要么是交付面动作——
  **它们与斜杠命令共用 `/` 这个敲法**，这正是 PF-016 撞名未决的来源。
- 来源：[E-S5](evidence.md#e-s5-上下文装载型-slash-归约为-chat排队命令被划出)、[E-S10](evidence.md#e-s10-一包一命令与实现备选)
- 最近核对：2026-09-23 / 两个 SHA

### 参数：omne-next 设计有声明式参数语法，DSH 只有自由文本加提示

omne-next〔设计〕：解析分两段，先按命令名查声明、再按 UNIX CLI 语法解析参数；位置参数必须**定长**，在注册期校验，多值用重复具名参数；
「参数错误」fail loud。〔代码〕组件变体只有自述的 `argument_hint` 与 `arguments`。
DSH〔代码〕：只有 `input.hint` 占位与 `input.attachments` 开关；命令名之后的全部文本原样作为 `rawInput`，**语法归命令自己**。
DSH README 把「只有非结构化文本输入」列为已知限制。

- 适用范围：同上。
- 代价与不适用：omne-next 的参数声明是解析的**必要输入**（先查声明才能切参数），所以目录快照必须驻留在服务端的解析路径上；
  DSH 省掉这层，代价是客户端没法做类型化补全，参数错误只能由各 handler 各自报。
- 来源：[E-S6](evidence.md#e-s6-参数语法)、[E-S8](evidence.md#e-s8-dsh-commands-注册表)
- 最近核对：2026-09-23 / 两个 SHA

### 「谁可以用」：omne-next 把可见性与执行资格分开并用撤销水位 fence，DSH 没有权限，可用性等于插件组合

omne-next〔设计〕：有效命令目录按 UserAccount、Tenant/Membership、Agent 或 Session 锁定的精确 Blueprint release、客户端能力与撤销水位裁剪；
可见 ≠ 可执行，执行资格下沉到执行端，每次使用重新校验；撤销走 epoch floor，快照落后就 **fail-closed 并强制刷新**；
不可见的命令与未知命令返回同形错误，防跨租户探测。custom 命令只能贡献数据，**不能声明派发目标**（INV-CMD-2，防自助式 SSRF）。
〔代码〕组件目录有 `visible_to_roles`，列的是 agent 角色而不是用户，由管理员策展；编译期按 grant 规则把组件引用分成 allow 与 deny。
DSH〔代码〕：「Command availability follows plugin composition: every adapter consuming the registry sees every effective definition」。

- 适用范围：同上。
- 代价与不适用：omne-next 的「谁可以用」散在四处：目录裁剪、编译期 grant、组件目录的角色可见性、执行端资格。
  **没有**一个挂在命令上、按层求值的「谁可以用」属性，与 PF-002 把它列为这件资产的权限属性不同构。
- 来源：[E-S7](evidence.md#e-s7-谁可以用可见性资格撤销custom-边界)、[E-S3](evidence.md#e-s3-命令身份编译期重名检查编译期-allowdeny)
- 最近核对：2026-09-23 / 两个 SHA

### omne-next 的斜杠命令「挂起 / 恢复」是组件目录条目的生命周期，不是某次命令执行的挂起

〔代码〕`component.slash_command.suspended` / `.resumed` 与其余组件种类共用同一目录状态机（active ↔ suspended → deregistered → tombstone）。
挂起分 `maintenance` 与 `security` 两类：前者留在菜单里并加标注，后者从菜单消失。策展（`curated`）只改可见角色，**不是**状态迁移。
DSH〔代码〕：注册是一个 Cordis effect，dispose 即下架，并广播 `commands/change` 让界面刷新发现列表。

- 适用范围：omne-next runtime_plane 组件目录；DSH `dsh-commands`。
- 代价与不适用：omne-next 的 maintenance 挂起「仍可见但标注」，与 PF-002 [§6.4](../../design/product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作)「禁用即对 agent 不可见」的两分不同构：它多出一个「对人可见、对执行不可用」的中间态。
- 来源：[E-S11](evidence.md#e-s11-组件目录生命周期与挂起类别两源)
- 最近核对：2026-09-23 / 两个 SHA

### 撞名：omne-next 用不同前缀把三类命令分成三种语法，DSH 让三类名字共用 `/` 并按固定优先级裁决

omne-next〔设计〕：`/` 是斜杠命令（agent 组合、串行、official ∪ custom）；`$` 是系统级快捷命令（调内部子系统 REST，只读查询或状态变更，
非串行、不唤醒 agent，只有 official）；键位是会话控制。三者共用一个「七轴」协议骨架，但明写**语法类 ⊥ 载荷类**，不建统一命令聚合。
配上强制限定名、同命名空间编译期 fail-fast、显式 literal 路径，**`/` 与系统命令之间不存在撞名面**。
DSH〔代码/文档〕：`/` 之下有三类名字——客户端自有命令（如 `/model` 弹窗、File）、宿主命令（`dsh-commands`）、skill（`/name` 手势）。规则是：
客户端自有命令与宿主命令同名，在**候选合成时 fail loud，不遮蔽**；宿主命令与 skill 同名，**宿主命令赢**
（「A name shared with a host command still resolves to the command」）；agent 作用域命令遮蔽同名全局命令；未知 `/xxx` 行被适配器拒绝，不变成 prompt。
skill 手势按空白分隔扫描整条用户消息，不只看开头。

- 适用范围：omne-next ADR-063（Proposed）；DSH `ui-commands`、`ui-skill`、`tool-skill`、`dsh-commands`。
- 代价与不适用：omne-next 的分符方案要用户记住两套前缀，`$` 也只能是 official。DSH 的「宿主命令赢」会让同名 skill 从 `/` 入口**变得够不着**，
  而 README 里没有提到会给被遮蔽的 skill 任何提示（只读了 README 与 contract，未读渲染代码，见未知表）。
- 撞上这条事实会怎样：这是给 [PF-016 §9](../../design/product/PF-016-cli-tui-delivery-surface/design.md#九未决项)「交付面自己的动作与斜杠命令撞名时听谁的」的事实输入，**不裁**。
- 来源：[E-S12](evidence.md#e-s12-三种语法类与七轴omne-next)、[E-S13](evidence.md#e-s13--之下三类名字的撞名规则)
- 最近核对：2026-09-23 / 两个 SHA

### 两源都把「命令」一词同时用在斜杠命令、系统命令与宿主可执行程序上

omne-next 的 ADR-063 把键盘、斜杠、`$` 并称「三类用户命令输入」；DSH 的 `dsh-native-command` 是不经 shell 运行宿主可执行程序的库，
与斜杠命令毫无关系，只是同名。PF-002「不含键盘控制、shell 命令或系统命令」这条划界，在两源里都要**按效果**而不是按名字去对：
omne-next 的 `$` 与键位、DSH 的大多数 `dsh-commands`，按 PF-002 的划分都落在斜杠命令**之外**。

- 适用范围：同上。
- 代价与不适用：无额外代价；这条只防止按词面把两源的「command」整批对到 PF-002 的斜杠命令上。
- 来源：[E-S12](evidence.md#e-s12-三种语法类与七轴omne-next)、[E-S14](evidence.md#e-s14-dsh-native-command-与斜杠命令无关)
- 最近核对：2026-09-23 / 两个 SHA

## 当前结论 · 短板与代价

### omne-next 的 wire 契约可按 JSON Schema 转译，领域聚合却绑在 Python 与 LangChain 序列化上，且多处 ADR 改名没有落到代码

〔代码〕组件与事件契约是 JSON Schema 为 SSOT、`scripts/codegen_contracts.py` 生成的 pydantic 类；这一层可以按 schema 转译，不必读 Python。
领域聚合 `SourceInstallation` 继承 `omne_core_v1` 的 `ContextBlock`，并手工覆写 LangChain 的 `lc_attributes` 以保住序列化往返，这部分**不能按语言无关形状直接转写**。
ADR-058 §7.2 把状态改名为 `{installed, suspended, uninstalled, tombstoned}`，代码仍是 `ACTIVE / SUSPENDED / DEREGISTERED / TOMBSTONE`，端点仍叫 `/deregister`；
§7.8 要求 SDK 的 `register` 措辞按 install 改名，SDK 方法名仍是 `register`。

- 适用范围：omne-next `6263fed`。
- 代价与不适用：只读 ADR 得到的形状与代码不一致，每个字段都要回到代码核一遍；反过来只读代码，会漏掉 ADR 里已裁、代码未跟的语义。
- 来源：[E-K1](evidence.md#e-k1-契约由代码生成聚合绑定-python-与-langchainadr-改名未落码)
- 最近核对：2026-09-23 / omne-next `6263fed`

### omne-next 的连接件授权与租户解析落在 web_server 层，横跨两个子系统，且 SDK 与服务端路由已经漂移

〔代码〕「谁能安装、执行者能做什么、租户怎么解析」都在 `omne_harness_inbound_web_server` 与 `omne_harness_state_web_server` 两个包里
（`source_installation_authorization.py`、`principal.py`、`channels_router.py` 的端点说明），领域层只守聚合不变式。
一次安装要跨 inbound（安装聚合）→ outbox/relay → state（writer binding 与本地状态投影）两个子系统。SDK 的 `get_status` 没有服务端路由。

- 适用范围：omne-next `6263fed`。
- 代价与不适用：要抽出「连接件」的授权语义，必须同时读两个子系统的 web 层与事件链；若只看 domain 包，会得出「没有授权」的错误印象。
- 来源：[E-K2](evidence.md#e-k2-授权落在-web_server-层并横跨两个子系统)、[E-C8](evidence.md#e-c8-sdk-三方法白名单服务端各端点的主体要求get_status-缺路由)
- 最近核对：2026-09-23 / omne-next `6263fed`

### DSH 一个命令就是一段插件代码：命令的生命周期等于插件的 effect，没有数据形态的命令，也没有租户与权限层

〔代码〕`compact`、`goal`、`feedback` 各是一个包，每个包 `inject` 所需服务，在 `apply` 里调 `ctx.commands.register({name, description, input?, handler})`；
handler 是任意代码，返回 `success | error`。命令身份（name 与 definitionId）、遮蔽与下架都是进程内 Cordis 作用域层的事。
DSH 否决过「每个 adapter 一张开关表」「把命令放进 agent 核心」「让 agent loop 注入命令」三种备选。

- 适用范围：DSH `c291e796`。
- 代价与不适用：PF-002 的斜杠命令是**资产**：按层级求值、可被组织锁住、绑定 skill 或 prompt、数据形态。DSH 的命令是**插件代码**：
  没有层级设置、没有权限、没有 skill 以外的绑定目标，也不能由租户提交纯数据命令。DSH 的包结构能参照的只有「注册 / 发现 / 执行 / 生命周期事件」这一层。
- 来源：[E-S8](evidence.md#e-s8-dsh-commands-注册表)、[E-S10](evidence.md#e-s10-一包一命令与实现备选)
- 最近核对：2026-09-23 / DSH `c291e796`

## 对照表

单元格开头的标记：**有**＝该源承载了这条产品条款（〔代码〕或〔设计〕注明）；**部分**；**相反**＝形状与条款方向相反；**无**＝该源没有对应物。

### 连接件：PF 条款 × 两源

| PF 条款 | omne-next `6263fed` | DSH `c291e796` |
|---|---|---|
| [PF-002](../../design/product/PF-002-assets-settings-and-permissions/design.md#connector) 唯一方向朝里 | **有**〔代码〕SDK 只推不收 | **部分**：webhook 朝里；ACP 双向 |
| 身份是 name | **相反**〔代码〕不透明 `installation_id`；namespace 只是用户范围内的别名 | **部分**：规则 `id` 加 adapter 配置的 `source`，没有「连接件」对象 |
| 协议与凭据形状不是身份 | **有**〔设计〕凭据以 `credential_binding_id` 引用，不进身份 | **有**：凭据是 adapter 配置的 `secretEnv` |
| 只能送消息进来 | **有**〔代码〕推送面只收一条候选内容 | **相反**：规则可执行任意外部调用 |
| 没有数据读取面 | **有**〔代码〕SDK 零 harness 读面；`get_status` 只读自身安装状态 | webhook **有**；ACP **相反** |
| 没有管理面 | **部分**〔代码〕SDK 零管理面，服务端执行者有 suspend/resume/tombstone | webhook **有**；ACP **相反**（会话增删改） |
| 设置：来源标识 | **有**〔代码〕`installation_namespace`、`channel_topic` | **有**：`source` / `deliveryId` 进消息来源信息 |
| 设置：投递目标 | **相反**〔代码〕目标是（用户，channel），会话与 agent 轴由订阅决定、推送面禁带 | **部分**：规则指定 workspace 与 preset，**总是新会话** |
| 权限：能不能安装 | **有**〔设计〕三层 admission ⊕ mandate；〔代码〕只落了 origin 与卸载检查，准入默认全放行 | **无**：规则由部署者以代码装载 |
| 权限：送进来的消息按什么身份处理 | **部分**：不可配，结构上固定为「安装者的世界、数据不是指令」 | **部分**：规则选 `agentPreset` + `permissionPreset`；`source.kind = webhook` |
| 不组合任何资产 | **有** | **有** |
| [PF-014 §6.2](../../design/product/PF-014-inbound-intake-and-queueing/design.md#62-送进来的就要被处理要不要送进来归连接件) 送进来就进队列、与用户输入同等 | **相反**〔代码/设计〕进 channel buffer 被动感知，不起运行；唤醒路径未实现 | **部分**：followup 进新会话，一定起运行；不进已有会话 |
| [PF-014 §6.3](../../design/product/PF-014-inbound-intake-and-queueing/design.md#63-去重只认来源说得出的那个同一件事) 去重只认来源说得出的同一件事 | **有**〔代码〕`producer_idempotency_key`、内容哈希合并 | **相反**：不去重 |
| PF-014 §6.2 过滤在连接件一侧 | **有**〔设计〕grant 选 channel、schema 准入；reaction 规则的条件〔设计〕 | **有**：规则返回 `null` 即不建会话 |
| [PF-014 §6.6](../../design/product/PF-014-inbound-intake-and-queueing/design.md#66-队列不设容量上限) / [§6.7](../../design/product/PF-014-inbound-intake-and-queueing/design.md#67-不漏不重) 无容量上限、不漏 | **相反**〔代码〕有界 buffer、背压丢弃、不补发 | **相反**：进程内即发即忘，崩溃即丢 |
| [PF-015 §4](../../design/product/PF-015-session-lifecycle-and-ownership/design.md#业务流程拓展点) 受理之前的业务流程拓展点 | **无**：没找到受理前可挂拦截件的位置；三道准入门是写死的 | **部分**：规则本身就是受理前的可信代码，可以拒（返回 `null`） |

**不可承载 / 未覆盖的行**：「身份是 name」「投递目标」「送进来就进队列」「无容量上限、不漏」四行，omne-next 与产品方向**相反**；
「只能送消息进来」「去重」「无容量上限、不漏」三行，DSH 方向**相反**；「受理前的业务流程拓展点」omne-next **无**对应。

### 斜杠命令：PF 条款 × 两源

| PF 条款 | omne-next `6263fed` | DSH `c291e796` |
|---|---|---|
| [PF-002](../../design/product/PF-002-assets-settings-and-permissions/design.md#slash-command) 用户主动发起的入口，敲 `/什么` 触发 | **有**〔设计〕只认开头的 `/`；〔代码〕只有前缀分类器 | **有**〔代码〕宿主命令只认第 0 字节的 `/`；skill 手势整条消息扫描 |
| 身份是命令名 | **有**〔设计〕恒为限定名；〔代码〕`qualified_id` | **有**〔代码〕小写 name，另有可选 `definitionId` |
| 绑定目标、参数不是身份 | **有**〔设计〕 | **有** |
| 绑定一个 skill、一段 prompt 或其他上下文 | **部分**〔设计〕`skill_ref` 与 `prompt_template` 至少选一；〔代码〕绑定表无承载面 | **部分**：skill 手势等于「绑定自己」；宿主命令绑的是代码，**无** |
| 不含键盘控制、shell 或系统命令 | **有**〔设计〕`$` 与键位是另外两种语法类 | **相反**：`/compact`、`/goal`、`/feedback` 属系统或 UI 命令，同在 `/` 下 |
| 与 skill 多对多 | **部分**〔设计〕一条命令至多一个 skill，一个 skill 可被多条命令引用 | **无**：skill 即入口，1:1 |
| 绑定不转移所有权 | **有**〔设计〕绑定由 blueprint 持有，`skill_ref` 是引用 | **无**：没有绑定这层 |
| 设置：命令名 | **有** | **有** |
| 设置：参数提示 | **有**〔代码〕`argument_hint`、`arguments`；〔设计〕参数 schema | **有**〔代码〕`input.hint` |
| 设置：绑定目标 | **部分**〔设计〕 | **无** |
| 权限：谁可以用 | **部分**〔设计〕目录裁剪 + 执行端资格 + 撤销 fence；〔代码〕`visible_to_roles`（agent 角色）+ 编译期 allow/deny；没有挂在命令上的单一属性 | **无**：可用性等于插件组合 |
| [PF-014 §5.5](../../design/product/PF-014-inbound-intake-and-queueing/design.md#看着像控制指令其实不是) 是内容、进队列 | **部分**〔设计〕上下文装载型归约为 chat；压缩一类排队命令被划出 | **相反**：宿主命令不产生模型消息；skill 手势是内容 |
| [PF-016 §5.7](../../design/product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族) / [§9](../../design/product/PF-016-cli-tui-delivery-surface/design.md#九未决项) 与交付面动作分得出、撞名 | **有**〔设计〕靠分符与限定名，撞名面不存在 | **部分**：客户端与宿主撞名时 fail loud；宿主与 skill 撞名时宿主赢 |
| [PF-002 §6.4](../../design/product/PF-002-assets-settings-and-permissions/design.md#64-移除与禁用是两个动作) 移除与禁用 | **部分**〔代码〕目录状态机 + maintenance / security 两类挂起 | **部分**：effect 下架，没有「禁用」 |

**不可承载 / 未覆盖的行**：「与 skill 多对多」「绑定不转移所有权」「设置：绑定目标」「权限：谁可以用」四行，DSH **无**；
「不含系统命令」「是内容、进队列」两行，DSH **相反**；omne-next 在「绑定」「多对多」「谁可以用」「是内容」上只有**部分**，而且几乎全是〔设计〕。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| omne-next 在本 SHA 之后没有落命令框架（E61） | 「斜杠命令几乎全是设计」及其下各条的〔设计〕标注 | 已核对到 `6263fed`；之后未核 |
| omne-next inbound web server 的路由全在 `api/routers/` 下 | 「触发受理只有三个入口」 | 已核对：`git grep '@router.'` 覆盖该包全部 py 文件 |
| DSH 的 `ui-commands` 与 `ui-skill` 的 README 与客户端行为一致 | 撞名一条里 DSH 的三条优先级 | 部分核对：读了 contract.ts 注释与 README，未读候选合成的实现 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| DSH 宿主命令遮蔽同名 skill 时，用户能否看出 skill 被遮蔽 | 读 `ui-commands` 候选合成与 TUI 的 `/` 菜单实现，或起 DSH Web 装一个同名 skill 实测 | PF-016 撞名未决的事实输入；proposal 定撞名处置前 | 调研执行者 |
| omne-next 的 `$` 命令与斜杠命令的声明契约是否共用一个目录读面（D-8 设计）——落地后形状 | 等 omne-next E61 落地后重核 | 若 proposal 要借「分符」方案 | 下一轮调研 |
| omne-next 为何 SDK `get_status` 无服务端路由（遗漏还是有意保留给未来） | 查 omne-next git 史中 `external-sources` GET 路由的增删 | 只影响「零读取面」一条的强度 | 调研执行者 |
| DSH `tool-skill` 源码注释说「first line starts with」，实现与 README 是整条消息扫描 | 已核：以实现为准（`SKILL_GESTURE` 全局匹配）。注释陈旧 | 无 | —— |
| DSH 实现备选记录（2026-07-19 note）否决了「持久化通用命令输入输出」，现行代码却记 `command/run`、`command/done` | 读 DSH 该 note 之后的 note 或 git 史 | 只影响「命令是否留痕」的来历，不影响现状 | 调研执行者 |

## 采用与后续核对

当前无消费者采用；本程 proposal「Connector 与 Slash Command 形状起点」出现后，在 README 的「消费者」字段补上链接。
omne-next 落地命令框架或连接件唤醒路径（reaction subscriber）时，本包的〔设计〕标注需要逐条重核，并按[演进事件词](../README.md#演进事件词)记 changelog。
