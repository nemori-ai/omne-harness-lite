# 连接件与斜杠命令：omne-next `6263fed` 与 DSH `c291e796`，2026-09-23

**取代状态：** 当前有效，未被取代

- 执行者与日期：assets-runtimes 一程的调研执行者（只读），2026-09-23。
- 调查范围：以 omne-next `omne_harness` 为起点、DSH 为第二参照，回答连接件与斜杠命令两类资产的九个问题，并对照 PF-002 / PF-014 / PF-015 / PF-016 的产品正文。
  不给方案，不改产品正文。
- 输入与方法：
  - omne-next：本机检出 HEAD `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，工作树干净；用 `git grep` 只查已跟踪文件（排除 `.claude/worktrees/`）。
    按任务指定入口读：`omne_harness_connector_sdk`、`omne_harness_inbound`（domain / bootstrap / application）、`omne_harness_inbound_web_server`、`omne_harness_state*` 的推送面、
    `omne_harness_runtime_plane_contracts` 的 slash_command 组件事件、`omne_harness_contracts/component_schema.py`、`omne_harness_agent_blueprint` 的编译与组合；
    然后顺着代码里的引用读 ADR-057 / 058 / 063 / 064 / 131、bc-2 §10.4、bc-3 §13.1、`user-command-input-design.md`、五份 requirements、两份 traceability 矩阵。
  - DSH：`tmp/sources/dsh-c291e79.tar.gz` 解包，读 `packages/interaction/commands`、`command-compact`、`command-goal`、`command-feedback`、`util/native-command`、
    `webhook/*`、`acp/acp`、`skill/*`、`client/ui-commands`、`client/ui-skill`，`docs/subsystems/{commands,webhook}.md`，以及 `.agents/notes/.../2026-07-19-plugin-command-registration.md`。
  - 线索：`research/legacy_backup/{user-input-and-command-sources, connector-environment-source-sources}` 只取了文件路径清单（从中找到 reaction/wake 那份需求），事实都在上述 SHA 上重新取证。未读 `design_legacy/`。
- 处置的既有结论：首次调查。

## 完整报告正文

先逐条回答九问，再列短板与代价，最后报告产品正文的矛盾与缺口。

<a id="九问逐条"></a>
### 九问逐条

#### 问一 · omne-next 的连接件对象模型，逐条对 PF-002

omne-next 里**没有**一个叫 connector 的领域对象。它的名字只出现在两处：SDK 包名 `omne_harness_connector_sdk`，以及未来发布层的 `Connector → ConnectorVersion`（明文不建）。
一次「接进来」在 omne-next 里是三件东西：

1. **安装** `SourceInstallation`（inbound 子系统）〔代码〕。它是用户的授权事实：「在治理租户下，用户授权某信源实现通过一个技术执行者，把获准的 channel 内容接入该用户的世界」（ADR-058 §7.2）。
   身份是 UUID7 `installation_id`；`installation_namespace` 是用户范围内唯一的别名，也就是 channel 名的第一段；`(owner_tenant_id, user_id)` 是过滤列。
   `descriptor_snapshot` 是实现在安装时自报的 channel、schema 与供给模式；`grant_scope` 是用户勾选的 channel 与速率上限。二者分开保存，grant 必须是 descriptor 的子集。
2. **供给通道**（state 子系统）〔代码〕。`ChannelDefinition` 是去租户的模板，`ChannelBuffer` 是按（channel，租户，用户）划分的实例，在第一次被接受的推送时才懒建。
   写权通过 `SourceInstallationWriterBinding` 绑在**安装**上，不绑在实现上。
3. **信源实现**：发布层，现在不建〔设计〕。

逐条对 PF-002 §4 Connector（rev 10）：

- **身份 name**：不对应。omne-next 刻意不让任何名字当身份——namespace 是别名，「ID 不由 slug 派生（未来 connector rename 不改 installation ID）」（ADR-058 §7.7 ⑧）。
- **协议与凭据形状不是身份**：对应。凭据是表单式 `credential_spec`，值只以 `credential_binding_id` 引用〔设计〕。协议版本是握手协商出来的 `protocol_version`，也不进身份〔代码〕。
- **只能送消息进来**：对应（SDK 只有推送与自身状态），但见问二。
- **设置：来源标识**：`installation_namespace` 与 `channel_topic`〔代码〕。
- **设置：投递目标**：**方向不同**。推送面**禁止**带会话、agent、用户坐标；落在哪一行由（channel，租户，用户）决定。哪个 agent 看得到，由 agent blueprint 里的订阅决定（ADR-062：「agent 消费轴唯一归 blueprint 订阅」）。
  连接件自己**不选**投递到哪个会话或哪个 agent。
- **权限：能不能安装**：三层〔设计〕（ADR-064）。代码只有 `origin` 分流；准入端口的默认实现全放行。
- **权限：按什么身份处理**：不可配，结构上固定（见问三）。
- **不组合任何资产**：对应。

#### 问二 · 有没有读取面或管理面

- **SDK 层**〔代码〕：只有 `register / push_to_channel / get_status`，用白名单常量加单测锁住；禁止依赖任何 `*_web_client`。README 与 ADR-058 D-10 都写「零 harness 数据读面、零管理面、零 East-West 方法」。
- **`get_status`** 读的是**这次安装自己的状态**（ADR 称 self-scoped），不读 harness 的数据。按 PF-002「没有数据读取面」的字面，它不越界；但它是一个读面。
  本 SHA 下服务端**没有**这条 GET 路由（inbound web server 的 external-sources 路由全是 POST），SDK 只对 mock 测过。
- **服务端**〔代码〕：安装与卸载只接受 `HUMAN_USER`；suspend、resume、tombstone 接受 `PLATFORM_SERVICE`，也就是执行者这一类身份。
  所以**执行者能在服务端暂停、恢复、永久退役一个安装**。ADR-058 §7.6 的设计是「executor 只能进入**技术性** suspension，不能撤销用户授权」，tombstone 应归「安全 / 治理控制面」；
  代码是按主体种类（`PLATFORM_SERVICE`）放行，本轮没有核「执行者只能动自己那份安装」的范围检查（`resolve_executor_scope` 读了签名，未逐行读实现）。
- 结论：PF-002 明确不许的两个面，在 omne-next 的 **SDK 投放面**上是零；在**服务端授权**上，执行者握着生命周期动词。omne-next 自己说「SDK 不是安全边界」。

#### 问三 · 消息进来后怎么落到受理（对 PF-014）

omne-next 有两条互不相干的路：

| | 连接件供给（channel_supply） | 触发（RoutedTrigger） |
|---|---|---|
| 进来的是什么 | 一条 schema 校验过的 JSON 候选内容 | chat 输入、定时触发、HITL 应答、控制指令 |
| 落在哪 | state 的有界 channel buffer（`admitted / coalesced / dropped`） | 受理后发 `routed_trigger.routed`，交给 runtime 起或续会话；ADR-131 定了先由 State 持久受理再返回 accepted |
| 起不起运行 | **不起**。只在已经在跑的会话的 `before_agent / before_model` 被动注入〔设计〕 | 起 |
| 去重 | 内容哈希合并；strict_once 用 producer 幂等键 | `DEDUPED` 终态与 dedup claim |
| 容量 | 有界，best_effort 背压丢弃；恢复不补发 | 有界 pending（ADR-131「确认内容、容量……」） |
| 实现状况 | 推送面有代码；感知的 flush 需求自称只有 partial evidence | chat、scheduled、control 有端点；**webhook、sse、world 没有端点** |

对 PF-014 的逐条关系：

- [§6.2](../../../design/product/PF-014-inbound-intake-and-queueing/design.md#62-送进来的就要被处理要不要送进来归连接件)「经连接件送达……受理之后就进队列」：omne-next 的连接件路径**正好是 PF-014 否决的那种「收下但不进队列」**。
  omne-next 要「外部来了就叫醒 agent」，另立 reaction 订阅者，把 channel 变化组装成标准 Trigger〔设计，未实现〕。
  这条两跳组合（供给 → 规则 → Trigger）在效果上接近 PF-014 的「连接件送达 → 进队列」，但**过滤与唤醒条件放在 reaction 规则里，不在连接件里**。
  PF-014 §6.2 把过滤放在「连接件那一侧」，两边对「谁知道该不该惊动 agent」的回答不同。
- [§6.3](../../../design/product/PF-014-inbound-intake-and-queueing/design.md#63-去重只认来源说得出的那个同一件事) 去重只认来源说得出的同一件事：同向（`producer_idempotency_key`）。
- §6.6 / §6.7 无容量上限、不漏：相反（有界、背压丢弃、不补发）。
- [PF-015 业务流程拓展点](../../../design/product/PF-015-session-lifecycle-and-ownership/design.md#业务流程拓展点)（受理之前的拦截，不产生持久化影响）：omne-next 的准入是写死的三道门（授权、生命周期、schema），外加注册期折算的 allow-list；**没找到**可挂第三方拦截件的受理前位置。

#### 问四 · DSH webhook 与 ACP 的对照

- **webhook**〔文档 + 适配器 README〕：适配器验签，规则（可信代码）返回 `null` 或一个建会话请求；唯一内置动作是**新建根会话**并 `followup` 一条 `source.kind: "webhook"` 的用户角色消息。
  处理身份由规则选的 `agentPreset` 与 `permissionPreset` 决定。没有队列、重投、去重，崩溃就丢；`deliveryId` 只作来源记录。
  规则可以执行任意外部调用——在 PF-002 的意义上，它是**可信扩展代码**，不是「只能送消息进来」的接入件。
- **ACP**：可信控制端，`authenticate` 直接成功；会话的建、列、续、关、配置、提交、取消都有；结果流式回传；有权限请求回路。它**同时具备读取面与管理面**，并且显式不提供命令面。
  它更像 PF-016 意义上的「另一种交付面或自动化客户端」，不像连接件。
- **一处与连接件相关的细节**：DSH 的 skill `/name` 手势只扫 `source.kind === 'user'` 的消息，源码注释写「external text cannot forge the gesture」。webhook 消息的 `source.kind` 是 `webhook`，所以外部文本里的 `/name` **不会**触发 skill。

#### 问五 · 连接件对照表

见 [research.md 对照表](../research.md#连接件pf-条款--两源)。不可承载或未覆盖的行，在那张表下方列出。

#### 问六 · 斜杠命令模型，逐条对 PF-002

| 维度 | omne-next | DSH |
|---|---|---|
| 注册 | 〔代码〕组件目录 `component.slash_command.*` 七个生命周期事件，登记方身份是 `registrant_id`，另有 `visible_to_roles` 与 `owner_tenant_id`；official 走入口点发现，custom 走运行时动态注册〔设计〕 | 〔代码〕插件在 `apply` 里调 `ctx.commands.register`，是 Cordis effect，分全局层与 agent 作用域层 |
| 解析 | 〔代码〕只有前缀分类器，没有调用方。〔设计〕只认开头的 `/`，两段式（先查声明再切参数），支持连续命令递归，fail loud，另有 literal 路径 | 〔代码〕`parseCommand` 只认第 0 字节的 `/`；未知就拒，不送模型 |
| 参数 | 〔设计〕UNIX CLI 语法，位置参数定长，具名参数可重复；〔代码〕组件变体有 `argument_hint`、`arguments` | 自由文本 `rawInput`，外加 `hint` 与 `attachments` 开关 |
| 绑定目标 | 〔设计〕manifest 里写 `skill_ref` 与 `prompt_template`；〔代码〕无承载面 | 宿主命令绑 handler 代码；skill 手势等于 skill 自身 |
| 权限 | 〔设计〕目录裁剪、执行端资格、撤销 epoch fence、custom 不得声明派发目标；〔代码〕`visible_to_roles` 与编译期 allow/deny | 无；可用性等于插件组合 |
| 挂起 / 恢复 | 〔代码〕目录条目的状态机，挂起分 maintenance 与 security | effect dispose 并广播 `commands/change` |
| 进 agent 的形态 | 〔设计〕上下文装载型归约为一条 chat 调用；排队命令（压缩）另走声明式队列效果 | 不进模型；由 handler 决定是否 followup |

PF-002 的「命令名是身份」两源都满足。「绑定目标、参数不是身份」两源也满足：omne-next 的 `ComponentRef` 不含绑定，DSH 的身份是 name 加可选 `definitionId`。
PF-002 的「不含键盘、shell、系统命令」：omne-next 用不同语法类把它们分开〔设计〕；DSH 的 `dsh-commands` 大多**就是**系统或 UI 命令（compact、goal、feedback、plan），与 skill 共用 `/`。

#### 问七 · 与 skill 多对多、绑定不转移所有权

- **omne-next**〔设计〕：bc-3 §13.1 的表里每条命令只有一个 `skill_ref` 位，因此一条命令**至多一个 skill**。一个 skill 被多条命令引用，设计没有禁止也没有明示。skill 可以没有命令。
  连续命令递归（D-3.3）可以在一行里装多个 skill，但那是多条命令，不是一条命令绑多个 skill。
  绑定由 blueprint manifest 持有（BC-3 唯一持有者），命令只是 manifest 里的一行，`skill_ref` 是引用——**绑定不转移所有权**在形状上成立。
  另一方面，组件目录里的 `slash_command` 是独立组件、与 skill 平行，它的变体**没有** skill 引用字段。两种形状并存：manifest 内联绑定，与独立命令组件（一个 prompt 文件）。omne-next 没有收口哪个是权威。
  这两种形状在代码里都没有跑通。
- **DSH**〔代码〕：没有绑定层。skill 自己就是入口（`userInvocable`），1:1；宿主命令是代码。「同一 skill 多个入口」「一个入口装 skill 再加 prompt」都无法表达。
- 结论：PF-002 要的「多对多、绑定不转移所有权」，**两源都没有已实现的参照**；omne-next 的设计只到「多对一」。

#### 问八 · 命令与交付面动作撞名，两源怎么处理（事实输入，不裁）

- **omne-next**〔设计〕：不共用前缀。`/` 是 agent 组合出来的斜杠命令，`$` 是系统级命令（查询或状态变更、不唤醒 agent、只有 official），键位是会话控制。
  配上强制限定名（`omne:help` ≠ `acme:help`）、同命名空间编译期 fail-fast、显式 literal 路径，撞名面在设计上不存在。
  代价是用户要记两个前缀、敲命名空间，手打负担靠 hints 的模糊匹配。omne-next 没有「本机交付面动作」这个概念，最接近的是 `$` 命令，而 `$` 在服务端执行。
- **DSH**〔README 与 contract 注释〕：`/` 之下有三类名字——
  1. 客户端自有命令（`ctx.commandUi.register`，如 `/model` 弹窗、File 动作）：与宿主命令同名时**在候选合成时 fail loud，不遮蔽**；自有命令之间重名注册即抛。
  2. 宿主命令（`dsh-commands`）：与 skill 同名时**宿主命令赢**，在客户端裁决，那一行不会变成 prompt；agent 作用域命令遮蔽同名全局命令。
  3. skill 手势：未知名字留作普通文字；只扫用户来源的消息。
  另有「装饰」：客户端可以给已有的宿主命令挂一个裸调用弹窗，不另造一行，也就不会撞名。
- 与 [PF-016 §9](../../../design/product/PF-016-cli-tui-delivery-surface/design.md#九未决项) 的关系：PF-016 已定「交付面动作与斜杠命令必须分得出」，撞名处置交给斜杠命令那一侧。
  两源给出的是两种不同的事实先例：omne-next 靠**前缀分开**，DSH 靠**同前缀加固定优先级、跨层 fail loud**。本报告不裁。

#### 问九 · 斜杠命令对照表

见 [research.md 对照表](../research.md#斜杠命令pf-条款--两源)。

### 短板与代价

1. **Python 契约翻译**：wire 契约以 JSON Schema 为 SSOT、Python 由代码生成，这层可以直接按 schema 转译。领域聚合继承 `omne_core_v1.ContextBlock`，并手工覆写 LangChain `lc_attributes`，这层是 Python 与 LangChain 专属的。
   更实际的成本是**文档与代码漂移**：ADR-058 §7.2 的状态改名、§7.8 的 SDK 措辞改名都没有落到代码；SDK `get_status` 没有服务端路由。
   只读 ADR 会拿到代码里并不存在的形状，只读代码又会漏掉已裁的语义，两边都得读。
2. **connector 与 web_server 层耦合**：安装主体判定、执行者判定、租户解析都在两个 `*_web_server` 包里；领域层只守聚合不变式。
   一次安装横跨 inbound → outbox/relay → state 两个子系统，事件改名要同波。按包去抽「连接件语义」时，只看 domain 会得出「没有授权」的错误印象。
3. **DSH 一包一命令**：每个命令是一个插件包，里面是 handler 代码，靠 Cordis effect 注册与下架。对「命令是资产」的影响：DSH 能借鉴的是注册、发现、执行、`command/run`/`done` 留痕、作用域遮蔽这一层机制；
   PF-002 资产的其余性质——按层级求值的设置与权限、组织可锁、租户可提交的纯数据命令、绑定 skill 或 prompt——DSH 都没有对应物。
   反过来看，DSH 把「系统或 UI 命令」和「skill 入口」都放在 `/` 下，用优先级裁决；PF-002 则把系统命令划出斜杠命令。

### 产品正文的矛盾与缺口（只报告，不改）

1. **连接件身份与「一人多账户」**：PF-002 定连接件身份是「类别 ＋ name」。omne-next 的一手需求明确要支持「同一用户把同一实现装多次，接不同外部账户」，并为此放弃按名字当身份。
   PF-002 没有说：同一个连接件接两个外部账户，是一个资产两份配置，还是两个资产。
2. **连接件内容能不能带出「用户才有的手势」**：PF-014 §6.2 把连接件送达的消息定为 `UserMessage`、「和用户自己说的那一句一视同仁」；
   同时 [UL-inbound-arrival](../../../design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival) 与 PF-014 §5.1 的图，把「斜杠命令」与「连接件送达」并列为**来源取值**。
   一条经连接件送来、文本以 `/xxx` 开头的消息，算不算斜杠命令？产品正文**没有写**。两源的做法都是「不算」：omne-next 的 slash 解析只对 chat 路径执行（bc-2 §10.4），DSH 的 skill 手势只扫用户来源。
   另外，把「斜杠命令」列为来源取值、与「用户说话」并列，和 PF-016 §5.7「斜杠命令……它是内容」的说法**放在一起读有张力**：来源回答「谁送来的」，斜杠命令回答的是「这段内容长什么样」。
3. **以 `/` 敲出、却不是内容的动作没有落点**：两源都有这类命令（DSH 的 `/compact`、`/goal`、`/feedback`，omne-next 的「独立 Session 排队命令（例如压缩）」）。
   本项目 PF-016 §5.4 的第二类「具名的会话动作」目前只列了换模型与归档 / 撤销归档，并写明「是具名的、可以数得过来的，不是一个开口」。产品正文里**没有**用户主动发起压缩这类动作。
   它们如果将来出现，就会与斜杠命令共用 `/` 这个敲法，属于 PF-016 §9 撞名那条的同一问题域。
4. **撞名未决项没有接收方**：PF-016 §9 把「交付面动作与斜杠命令撞名听谁的」交给「PF-002 / PF-006 的 owner」。但 PF-002 rev 10 状态是「无未决项」，PF-006 rev 14 正文里没有「斜杠」或「撞名」的字样。
   PF-002 只写了「同类同名即替代」（§4「身份是类别 ＋ name」一节），没有覆盖**跨类**（资产与非资产的交付面动作）撞名。
5. **「谁可以用这个入口」与会话锁定版本**：不算矛盾，是一个产品正文没写到的维度。omne-next 的可见目录按「该会话锁定的精确 Blueprint release」裁剪：老会话不会看到新命令，撤销用水位立即 fail-closed。
   PF-002 的「谁可以用」只按身份层级求值，没有说命令的增删对**已在进行的会话**何时生效。

## 本轮结论

逐条见 [research.md](../research.md)，标题即结论，这里不复述。

## 本轮局限

- **未核**：omne-next 的 flush、感知服务是否真的不起运行（只有需求原话）；`resolve_executor_scope` 的范围检查实现；`channel_register_access.py` 的逐行逻辑；「内容永远是数据」的渲染实现。
- **未核**：DSH `ui-commands` 候选合成的实现与 TUI 的 `/` 处理——撞名规则只来自 README 与 contract 注释；「被宿主命令遮蔽的 skill 有无提示」未知。
- **未检索**：两源的 issue tracker、omne-next 的 git 史（`get_status` 路由的增删、ADR 改名为何未落码）。
- **来源冲突已记录并以代码为准**：DSH `tool-skill` 的源码注释（首行开头）与实现、README（任意位置）不一致；DSH 2026-07-19 note 否决「持久化通用命令输入输出」，现行代码记 `command/run`/`done`。
- **失败的检索**：在 omne-next 里找「webhook 受理端点」——inbound web server 全部路由文件、gateway 包、libs 的 `"webhook"` 字面量都查过，没有路由。
  在 omne-next 里找「命令 → skill 绑定」的代码承载面：`skill_ref` / `prompt_template` 在 `*.py` 里只命中 skill 生命周期事件。
  在 libs 里找 `ConnectorEntitlement`：零命中。
