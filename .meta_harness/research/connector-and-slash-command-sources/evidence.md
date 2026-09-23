# 可复核的来源与观察

本页按记录列出每条观察的精确对象、取得方式与支持范围。结论见 [research.md](research.md)，论证过程见[当轮报告](reports/2026-09-23-connector-and-slash-command.md)。

## 取证条件总览

| 来源 | 精确对象与版本 | 取得方式 | 来源立场与强度 |
|---|---|---|---|
| **omne-next** | `/data/qiwei/repos/omne-next` HEAD `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，工作树干净 | 读文件与 `git grep`（只查已跟踪文件，自然排除 `.claude/worktrees/` 副本） | 本项目前身；**同一批作者的自述文档**（ADR、requirements、design_docs）与**代码**。ADR 多次叠加修正案，文档与代码有漂移，凡冲突以代码为准并逐处记录。本机路径未钉，会失效，对象以 SHA 为准 |
| **DSH** | deepseek-ai/deepseek-harness `c291e7961a515f6d7af9304e7fd1d257929aef26`，`@deepseek-ai/dsh-root@0.1.5-rc.2` | 本仓库 `tmp/sources/dsh-c291e79.tar.gz`（sha256 `f08cfc86cb05d4186be3319670e2756375cb2788b3d2164dd7f30b885f350860`，见 `tmp/sources/SHA256SUMS`）解包到 `tmp/sources/extracted/dsh/`，读 README、`docs/`、`.agents/notes/` 与 `src/` | **上游作者自述**（README、docs、notes）+ 源码。短板取自 README 的「Known Limitations」与源码；未检索 issue tracker |

下文路径：omne-next 以仓库根为起点（`omne_harness/...`）；DSH 以解包根为起点（`packages/...`、`docs/...`）。行号在上述 SHA 下有效。

---

## 连接件 · omne-next

<a id="e-c1"></a>
### E-C1 安装聚合 `SourceInstallation` 的身份与字段

- 消费对象：research「omne-next 没有以 name 为身份的连接件对象」。
- 来源与精确修订：omne-next `6263fed`。
- 取得方式：读源码。
- 实际观察：
  - `omne_harness/libs/omne_harness_inbound/omne_harness_inbound/domain/source_installation.py:1-32`：模块说明，列出不变式 INV-SRC-1..5；其中 INV-SRC-1 规定别名在 `(owner_tenant_id, user_id)` 内唯一，INV-SRC-4 规定幂等元组含 `installation_namespace`，允许同一用户以不同别名重复安装。
  - 同文件 `:115-141`：字段有 `installation_id`（代理身份）、`installation_namespace`、`executor_principal_id`（技术执行者，幂等主体）、`descriptor_snapshot`、`grant_scope`、`origin`（frozen）、`status`、`user_id`、`owner_tenant_id`（注释写「never part of the registration identity」）。
  - 同文件 `:62-71`：状态机 `ACTIVE ↔ SUSPENDED → DEREGISTERED → TOMBSTONE`；`:290-296`：`org_mandated` 且 `triggered_by == "user"` 时拒绝卸载。
  - `.../domain/enums.py:53-77`：`InstallationStatus {active, suspended, deregistered, tombstone}`、`InstallationOrigin {self_service, org_mandated}`。
  - `.../domain/value_objects.py:576-634`：`InstallationGrantScope` 由用户授权，至少一个 channel，每个 channel 带速率上限。
- 支持范围：安装是一等聚合，身份是代理 id。不支持「omne-next 有 Connector 实现对象」——见 E-C2。

<a id="e-c2"></a>
### E-C2 ADR-058 §7「注册即安装」修正案：三层拆分、凭据表单、未来发布层

- 消费对象：research「omne-next 没有以 name 为身份的连接件对象」；短板「ADR 改名没有落到代码」。
- 来源与精确修订：`omne_harness/adrs/accepted/ADR-058-external-source-channel-registration-protocol.md`（Accepted；§7 修正案日期 2026-07-27）@ `6263fed`。
- 取得方式：读文档。
- 来源立场：作者自述的设计决定，含用户裁定原话。
- 实际观察：
  - `:286-313`（§7.2）：本体重定性为用户授权聚合，附词表：生命周期状态改名为 `{installed, suspended, uninstalled, tombstoned}`，`agent_id` 从安装面删除，manifest 拆为 `descriptor_snapshot` 与 `grant_scope`；「身份形状不变：`installation_id` 仍是单列 opaque UUID7 pkey……namespace 是占号/路由别名，不是身份」。
  - `:349-366`（§7.5）：`credential_spec: list[{key, required, secret, description}]`，秘密值永不进聚合，只持 `credential_binding_id`；同一用户装同一实现的多个外部账户靠它区分。
  - `:368-376`（§7.6）：安装与卸载的主体是用户，技术执行者不得单独完成；同一用户可多次安装；day0 禁止两个安装供同一 channel。
  - `:378-382`（§7.7）：`Publisher → Connector → ConnectorVersion → ChannelTemplate` 发布层「现在不建」。
  - `:406`（§7.10 ⑩）：事件改名必须与 consumer 同波，否则「所有新安装都会因 status 缺行被永久拒写」。
- 支持范围：设计意图与已裁形状。§7.2 的状态改名与代码不符，见 E-K1。

<a id="e-c3"></a>
### E-C3 推送面：三种结果、背压丢弃、推送请求不收会话坐标

- 消费对象：research「omne-next 的连接件内容走被动感知」。
- 来源与精确修订：omne-next `6263fed`。
- 取得方式：读源码。
- 实际观察：
  - `omne_harness/libs/omne_harness_connector_sdk/omne_harness_connector_sdk/client.py:167-215`：`push_to_channel` 打 `POST /api/v1/channels/{channel_name}/messages`，参数只有 `installation_id / schema_version / payload / expected_version / producer_idempotency_key`，docstring 写「deliberately exposes no session coordinate parameters」。
  - `omne_harness/libs/omne_harness_state_web_server/omne_harness_state_web_server/api/routers/channels_router.py:126-143`：端点说明写「The wire MUST NOT accept session coordinate selectors (`session_id`, `user_id`, `agent_id`, `owner_tenant_id`, `tenant_id`); unknown fields are refused `422`」。
  - `omne_harness/libs/omne_harness_state_contracts/omne_harness_state_contracts/channel_push_result_schema.py:28-31`：`admitted / coalesced / dropped`，「a push is never a silent no-op」。
  - `omne_harness/libs/omne_harness_state/omne_harness_state/application/services/admission.py:13-25`：best_effort 通道「back-pressure drops a novel message once the recent window is full」；strict_once 通道带 producer 幂等键，写入永不被阻塞。
- 支持范围：推送面的行为。「内容不启动运行」来自 E-C4，不来自本记录。

<a id="e-c4"></a>
### E-C4 供给内容只在运行中的会话里被动感知，恢复不补发

- 消费对象：research「omne-next 的连接件内容走被动感知」。
- 来源与精确修订：omne-next `6263fed`。
- 取得方式：读文档。
- 来源立场：作者自述（ADR 已接受；需求已接受，`committed-future`，未实现）。
- 实际观察：
  - `omne_harness/adrs/accepted/ADR-058-external-source-channel-registration-protocol.md:31-32`：`external_source.channel_supply` 是「内容→channel buffer→感知路径；区别于 trigger 供给类 `external_source.observation` 的事件→trigger→session spawn 路径」；`:120-122`：INV-SRC-6 恢复不补发，「latest-N best-effort……可靠逐条触达走 inbound trigger / dispatch / objective」；`:173`：「inbound 首次长出非 trigger 职责面」。
  - `omne_harness/adrs/accepted/ADR-057-broadcast-subscription-declaration-and-perception-timing.md:103-107`：`timing ∈ {before_agent, before_model}`，缺省 `before_agent`。
  - `omne_harness/requirements/capabilities/runtime-running-session-passive-broadcast-perception.md:3-9`：「只有已经因其它原因运行的 Session……被动感知……Channel 更新本身绝不启动 Run 或恢复休眠 Session」；horizon 为 `committed-future`，「现有 middleware、flush service 与 State query 只是 partial evidence」。
- 支持范围：设计定性。本轮**没有**读 flush 服务的实现去验证「不启动运行」，那条是需求原话。

<a id="e-c5"></a>
### E-C5 唤醒 agent 另立 reaction 订阅者（未实现）

- 消费对象：research「被动感知」与「按什么身份处理」两条。
- 来源与精确修订：`omne_harness/requirements/capabilities/inbound-configurable-multi-channel-reaction-and-agent-wake.md` @ `6263fed`。
- 取得方式：读文档。
- 来源立场：作者自述需求，`committed-future`，「不表示已有实现」（`:9-10`）。
- 实际观察：`:3-8`：用一个「不是 Agent、也不使用 LLM 判断条件的 deterministic application-layer Subscriber」观察多个 Channel、形成标准 Inbound Trigger、主动唤醒 Agent；`:31-33`：它与被动订阅独立，「不能在直接 subscription 上增加 `wake=true` 来冒充本能力」；`:68-70`：「wake prompt/task intent 与 Channel data 分开建模；外部数据……仍只是 data，不能修改 prompt structure、target、permission 或 route」。
- 支持范围：设计意图。libs 里没有检索 reaction 的实现（需求自述未实现）。

<a id="e-c6"></a>
### E-C6 触发受理：trigger_origin 枚举、载荷二分、实际开放的端点

- 消费对象：research「omne-next 的触发受理只有 chat、scheduled 与 control 三个入口」。
- 来源与精确修订：omne-next `6263fed`。
- 取得方式：读源码 + `git grep`。
- 实际观察：
  - `omne_harness/libs/omne_harness_inbound/omne_harness_inbound/domain/enums.py:24`：`CANONICAL_TRIGGER_ORIGINS = {"chat","scheduled","webhook","sse","world","domain_event"}`；`:27`：控制原语有四个。
  - `.../domain/services/discriminator.py:14-18`：invocation 类的 body kind 是 `chat_invocation / hitl_reply / scheduled_trigger / event_trigger`，control 类是 `session_control_command`。
  - `.../domain/services/translator.py:81-105`：地址要 `require_complete()`；`trigger_metadata` 的键是 `trigger_origin / source / occurred_at / initiated_by / keep_worker_alive / originator_id / reflow`。
  - `.../domain/value_objects.py:359-375`：`MessageArrivalPolicy {QUEUE, INSERT}`，按用户划分的全局偏好。
  - `git grep -n '@router\.\(post\|get\|put\|delete\)' -- 'omne_harness_inbound_web_server/*.py'`：路由只在 `accepted_route_router.py`、`chat_router.py`、`control_router.py`、`meta_router.py`、`scheduled_router.py`、`source_installation_router.py` 这几个文件里。
  - `git grep -ln 'external_source.observation'`：只命中 ADR-058、`design_docs/interfaces/registration-protocols.md` 与 `source_installation.py` 的 docstring。
  - `git grep -n -i webhook -- 'omne_harness/libs/omne_harness_gateway*'`：零命中。`git grep -ln '"webhook"' -- 'omne_harness/libs/*.py'`（排除 tests）只命中枚举与 schema（inbound `enums.py`、`routed_trigger_received_schema.py`、state `aggregate_enums.py`、`session_spawned_schema.py`）以及两处按 origin 取值的映射（runtime_plane `lifecycle_policies.py`、state `session_lifecycle.py`），没有路由。
- 支持范围：「没有 webhook 类受理端点」是**该读的地方读遍了没找到**（inbound web server 全部路由文件，加上 gateway 与 libs 的字面量检索），不是构造反例验证过。两处映射文件只按 grep 命中列出，未逐行读。

<a id="e-c7"></a>
### E-C7 写权与坐标派生；「内容永远是数据」不变式

- 消费对象：research「omne-next 把按什么身份处理写成结构规则」。
- 来源与精确修订：omne-next `6263fed`。
- 取得方式：读源码与 ADR。
- 实际观察：
  - `omne_harness/libs/omne_harness_state/omne_harness_state/application/services/admission.py:380-421`：`_authorize_writer` 要求 `scope.principal_id == binding.executor_principal_id`、租户与用户匹配、`installation_id` 匹配，且 `_require_active_registration` 为 active；否则拒收，原因为 `CALLER_NOT_AUTHORIZED` 或 `REGISTRATION_INACTIVE`。
  - `omne_harness/adrs/accepted/ADR-058-external-source-channel-registration-protocol.md:96-104`：「信源内容永远是数据、永不是指令」三层不变式（摄入只收 schema 校验过的 JSON；渲染只走 `xml_format_config`、经逃逸、包 `<system_reminder>`、role=Human；注册期净化）；租户坐标由 auth 派生，「永不信 payload 自报」。
- 支持范围：写权部分是代码；渲染部分只读了 ADR，**未核渲染实现**。

<a id="e-c8"></a>
### E-C8 SDK 三方法白名单；服务端各端点的主体要求；`get_status` 缺路由

- 消费对象：research「SDK 面锁死三方法……」。
- 来源与精确修订：omne-next `6263fed`。
- 取得方式：读源码、测试与 `git grep`。
- 实际观察：
  - `omne_harness/libs/omne_harness_connector_sdk/README.md:9-19`：三方法表；「Red lines: zero harness data-read surface, zero management surface, zero East-West methods」。
  - `.../omne_harness_connector_sdk/surface.py:41-59`：`ALLOWED_PUBLIC_METHODS = {register, push_to_channel, get_status}` 与禁止导入的 `*_web_client` 清单。
  - `.../omne_harness_connector_sdk/client.py:141-165`（register → `POST /api/v1/external-sources`）、`:217-238`（get_status → `GET /api/v1/external-sources/{installation_id}`）。
  - `omne_harness/libs/omne_harness_inbound_web_server/omne_harness_inbound_web_server/api/routers/source_installation_router.py:1-13`：「Install and uninstall require a proven `HUMAN_USER` principal……Suspend, resume, and tombstone remain technical controls for a proven `PLATFORM_SERVICE` principal」；`:37` 前缀 `/api/v1/external-sources`；路由只有 `POST ""`、`/{id}/suspend`、`/{id}/resume`、`/{id}/deregister`、`/{id}/tombstone`。
  - `.../source_installation_authorization.py:88-109`：`resolve_user_scope` 非 `HUMAN_USER` 即拒；`.../principal.py:153-178`：`require_source_executor` 要求 `PLATFORM_SERVICE`。
  - `git grep -n 'external-sources'`（排除 tests）：没有任何 GET 路由定义。`omne_harness/libs/omne_harness_connector_sdk/tests/unit/test_connector_client.py:76-89` 只用 `aioresponses` mock 了这条 GET。
  - ADR-058 `:144`：「SDK 不是安全边界（服务端 authz 才是）」。
- 支持范围：SDK 面与服务端路由的现状。`get_status` 缺路由是遗漏还是有意，**未知**。

<a id="e-c9"></a>
### E-C9 ADR-064 三层 entitlement；代码落地程度

- 消费对象：research「能不能安装是三层」；「没有以 name 为身份」一条引用了其中的 mandate 形状。
- 来源与精确修订：`omne_harness/adrs/accepted/ADR-064-connector-entitlement-and-org-mandated-installation.md`（Accepted 2026-07-27）+ 代码 @ `6263fed`。
- 取得方式：读文档 + `git grep`。
- 实际观察：
  - ADR-064 `:59-80`（D-1）：三层模型，可见性 = 白名单 ∩ 安装 ∩ 订阅；`:82-90`（D-2）：admission ⊕ mandate，mandate ⊆ admission；聚合边界「暂定」，最大成本是「+1 条新的跨 BC 关系」；`:126-132`（D-3）：白名单只在安装期检查，事后移出白名单时已有安装不会自动失效（OQ-B）；`:134-157`（D-4）：按 `origin` 分流卸载权。
  - `git grep -ln -e ConnectorEntitlement -e connector_entitlement -- omne_harness/libs`：**零命中**。
  - `omne_harness/libs/omne_harness_inbound/omne_harness_inbound/application/ports.py:151-160`：`PermissiveSourceInstallationAdmission.evaluate` 恒返回 `None`（放行）。
- 支持范围：三层是已接受设计；代码只有 `origin` 分流（E-C1）。

---

## 连接件 · DSH

<a id="e-d1"></a>
### E-D1 webhook 规则运行时

- 消费对象：research「DSH 没有连接件」。
- 来源与精确修订：DSH `c291e796`。
- 取得方式：读 README 与 subsystem 文档。
- 来源立场：作者自述；短板来自其「Known Limitations」。
- 实际观察：
  - `packages/webhook/README.md:12`：「Dispatch is process-local and fire-and-forget, with no delivery database, queue, retry, deduplication, or Agent-completion state」。
  - `packages/webhook/webhook/README.md:12`：唯一内置动作是新建普通根会话；`:28`：规则「may execute arbitrary trusted code」；`:30`：「`deliveryId` is provenance only; repeated delivery runs the rules again」；`:37`：`WebhookSessionRequest` 必填 `workspacePath / title / prompt / agentPreset / permissionPreset`；`:41`：以 `Agent.followup()` 为提交点，消息 `source.kind: "webhook"`，带 provider / source / delivery / rule 来源信息；`:71-72`：崩溃丢失、无去重。
  - `docs/subsystems/webhook.md:13,15,29`：同上的类型说明（`VerifiedWebhookDelivery` 的字段；规则可执行任意可信代码；followup 是带来源信息的普通持久用户角色消息）。
- 支持范围：文档层。未读 `packages/webhook/webhook/src/`；文档与 Cordis catalog 是生成的，本轮未发现与之矛盾的代码证据。

<a id="e-d2"></a>
### E-D2 GitHub webhook 适配器

- 来源与精确修订：`packages/webhook/webhook-github/README.md:12` 与其配置表 @ `c291e796`。
- 实际观察：在注入的 `ctx.webServer` 上注册一条精确路由；先验 HMAC、再解析 JSON；立即返回 `202`；配置项有 `source`、`path`、`secretEnv`、`maxBodyBytes`，每次请求都重新解析秘密。
- 支持范围：鉴权在适配器，身份标识是配置的 `source`。

<a id="e-d3"></a>
### E-D3 ACP 服务端

- 来源与精确修订：`packages/acp/acp/README.md` @ `c291e796`。
- 实际观察：`:12`：面向可信程序的自动化协议，能建、续、关会话，挂 MCP，提交与取消工作；`:65`：「`authenticate` | Immediate success; the server requires no authentication」；`:76`：「ACP clients are trusted controllers」，不支持的面含「modes, commands, plans, terminals……」。
- 支持范围：ACP 双向、有管理面、不提供命令面。

---

## 斜杠命令 · omne-next

<a id="e-s1"></a>
### E-S1 前缀分类器没有调用方

- 来源与精确修订：omne-next `6263fed`。
- 取得方式：读源码 + `git grep`。
- 实际观察：
  - `omne_harness/libs/omne_harness_inbound/omne_harness_inbound/domain/services/classifier.py:1-44`：纯前缀识别，取开头 `/` 后第一个 token 作 `command_name`，「does NOT introduce a new `trigger_origin` (origin stays `chat`)」。
  - `git grep -n 'slash_command_classifier'`：只命中 `bootstrap/inbound_bootstrap.py:145,245,288`、bootstrap 单测，以及两份 traceability。
  - `omne_harness/traceability/cross-subsystem/flow-realization-matrix.md:1069`、`omne_harness/traceability/subsystems/inbound/realization-matrix.md:109`：「无任何应用层调用方——grep 验真」；`trigger_metadata`「无命令名与参数承载面」。
- 支持范围：代码与 omne-next 自己的核对结论一致。

<a id="e-s2"></a>
### E-S2 命令框架整体未交付

- 来源与精确修订：omne-next `6263fed`。
- 实际观察：
  - `omne_harness/adrs/proposed/ADR-063-user-command-input-unified-protocol.md`：状态 **Proposed**（`:15`）；`:47`「斜杠命令……设计完备……**实现是空壳**」；`:50` 列三处断链。
  - `omne_harness/adrs/accepted/ADR-131-session-input-batching-and-command-scheduling.md:263-266`（2026-09-10 修正案）：「用户 2026-09-10 核实系统尚无任何已交付的用户命令机制——slash / `$` / 快捷键的解析器、目录发现与键位绑定均停在 ADR-063（Proposed）与 E61（pending）」。
  - `omne_harness/requirements/capabilities/inbound-contextual-command-discovery-and-governed-invocation.md:3`：「Accepted · committed-future」。
- 支持范围：omne-next 的斜杠命令形状只能作设计看。

<a id="e-s3"></a>
### E-S3 命令身份、编译期重名检查、编译期 allow/deny

- 实际观察：
  - ADR-063 `:194`（D-3.5）：命令名恒用限定名，不做省略解析；跨命名空间不撞，同命名空间由 INV-4-2 fail-fast。
  - `omne_harness/libs/omne_harness_contracts/omne_harness_contracts/component_schema.py:39-60`：`ComponentRef {kind, source, qualified_id, version_pin}`。
  - `omne_harness/libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/domain/services/composition.py:68-88`：`CollisionDetector` 只查 skill 与 slash command **各自内部**的重复，不跨种类。
  - `.../application/services/compile_query_service.py:679-695`：slash_command 以 `qualified_id` 进扁平列表；`:636-676`：`_classify_component_refs` 按 `default_deny / HARD_FLOOR / EXPLICIT_DENY` 与 `STRUCTURED_GRANT` 把引用分成 allow 与 deny，deny 优先。
- 支持范围：编译期行为是代码；限定名规则是设计。

<a id="e-s4"></a>
### E-S4 绑定表与组件变体

- 实际观察：
  - `omne_harness/design_docs/bounded-contexts/bc-3-behavior-authoring.md:257-272`（§13.1）：`slash_commands` 表的字段为 `command`（同一 blueprint 内不可重名）、`skill_ref | null`、`prompt_template | null`（二者至少一选，可并存）、`description`（强制）；「BC-3 是 slash_command 绑定声明的**唯一持有者**……BC-2 Inbound 连读都不读」。
  - ADR-063 `:50` ③：该绑定表「无模型承载面——编译期 `slash_commands` 仅是一串 `qualified_id`」。
  - `component_schema.py:20-28`：`ComponentKind` 的说明写 slash_command 是「an inbound chat request bound to a skill / prompt」；`:155-184`：`SlashCommandVariant` 只有 `when_to_use / argument_hint / arguments / paths / declared_directives`，说明写「A slash_command and a skill are parallel kinds with no inheritance relationship」。
  - `git grep -n 'skill_ref\|prompt_template' -- '*.py'`（排除 tests）：只命中 blueprint 的 skill 生命周期事件，**没有**命令绑定。
- 支持范围：「一条命令至多一个 skill」是从表的字段形状（`skill_ref` 单值）推出的判断；「一个 skill 可被多条命令引用」是**设计没有禁止**，不是设计明示。

<a id="e-s5"></a>
### E-S5 上下文装载型 slash 归约为 chat；排队命令被划出

- 实际观察：
  - `inbound-contextual-command-discovery-and-governed-invocation.md:11-16`（2026-09-07 范围修订）：ordinary chat 归约只约束上下文装载型 slash，「不覆盖已批准的独立 Session 排队命令（例如压缩）」；`:165-174`：限定名、定长位置参数、连续命令、解析成功后归约为一条 ordinary chat invocation；`:176-181`：未知、stale、disabled、revoked 都 fail loud，另须有显式的「按普通文本发送」路径。
  - `omne_harness/design_docs/bounded-contexts/bc-2-inbound.md:217-247`（§10.4）：`trigger_origin` 仍是 chat；inbound 不解析绑定；「仅对 chat 入站路径执行——其它 trigger_origin（scheduled / webhook / 等）不识别 slash prefix」（`:242`）。
  - ADR-131 `:49-61`（§3）：命令声明各自的队列影响（保留、清除、先发送后执行、成功后立即发送），以及相对文本的位置、能否被越过；由统一调度器解释，「不接受任意自定义调度代码」。
- 支持范围：设计（需求已接受、ADR-131 已接受，但命令部分的实现推迟）。

<a id="e-s6"></a>
### E-S6 参数语法

- 实际观察：ADR-063 `:164-200`（D-3）：两段式解析，先查声明再切参数；连续命令递归；位置参数定长并在注册期校验；解析失败 fail loud；D-3.7 要求显式 literal path。组件变体 `argument_hint / arguments` 见 E-S4。
- 支持范围：设计。

<a id="e-s7"></a>
### E-S7 「谁可以用」：可见性、资格、撤销、custom 边界

- 实际观察：
  - ADR-063 `:215`：「资格判定不在此列——inbound 只做认证 + 租户作用域，不做授权，资格判定在执行端」；`:286-288`（INV-CMD-2）：custom 命令不得声明派发目标（防 SSRF）；`:304-317`（D-8.3）：目录按 UserAccount / Tenant / Membership / Agent 或精确 Session release / 客户端能力 / 撤销水位裁剪；`:319-332`（D-9）：快照带 epoch，落后于撤销 floor 就 fail-closed。
  - `inbound-contextual-command-discovery-and-governed-invocation.md:128-129`：「visibility 与 execution authorization 分离」；`:185-188`：custom slash 只能贡献声明式数据。
  - `bc-2-inbound.md:246`：未知命令用同形错误，防跨租户探测。
  - `omne_harness/libs/omne_harness_runtime_plane_contracts/omne_harness_runtime_plane_contracts/component_slash_command_registered_schema.py:26-33,70-73`：`visible_to_roles` 取 agent 角色枚举，由 harness 策展。
- 支持范围：多为设计；`visible_to_roles` 与编译期 allow/deny（E-S3）是代码。

<a id="e-s11"></a>
### E-S11 组件目录生命周期与挂起类别（两源）

- 实际观察（omne-next）：`omne_harness/contracts/schemas/events/runtime_plane/component.slash_command.{registered,suspended,resumed,curated,rejected,deregistered,tombstoned}.schema.json` 七个事件；生成的 `component_slash_command_suspended_schema.py:13-18,39-42`：`suspension_category {maintenance, security}`，maintenance 留在菜单并标注，security 从菜单消失；`component_slash_command_curated_schema.py:61-64`：策展「is NOT a lifecycle_state transition」；`omne_harness/libs/omne_harness_runtime_plane/omne_harness_runtime_plane/application/services/component_visibility_query.py:67`：`_HIDDEN_SUSPENSION_CATEGORIES = {SECURITY}`。
- 实际观察（DSH）：`packages/interaction/commands/src/types.ts:81-91`：`commands/change` 事件；`packages/interaction/commands/src/index.ts:285-293`：`register` 返回 effect disposer。
- 支持范围：两边都是代码。

<a id="e-s12"></a>
### E-S12 三种语法类与七轴（omne-next）

- 实际观察：ADR-063 `:28-38`（§1.1 表）：键盘 / 斜杠 / `$` 三类，斜杠「串行（进会话排队）」、来源 official ∪ custom，`$`「内部子系统 REST 能力的受控快捷方式」、非串行、只有 official；`:122-140`（D-1）：七轴，「语法类 ⊥ 载荷类……把它们建成一个统一的命令聚合会把三套完全不同的事务语义……糊成一个大对象」；`:198-200`（D-3.7）：literal path；`:217-252`（D-5）：`$` 命令的公开半归 `command.*` 注册族，斜杠命令归 `component.slash_command`。
- 支持范围：设计（Proposed）。

---

## 斜杠命令 · DSH

<a id="e-s8"></a>
### E-S8 `dsh-commands` 注册表

- 来源与精确修订：DSH `c291e796`。
- 取得方式：读 README、subsystem 文档与源码。
- 实际观察：
  - `packages/interaction/commands/README.md:12`：命令不变成模型消息；每次受理的运行都记进会话日志；「UI-less demos and ACP automation do not provide this command surface」；`:46`：同一作用域重复注册即抛；`:50`：未知或语法不合的行被适配器拒绝，不变成 prompt；`:54`：agent 作用域遮蔽全局；`:139`：已知限制「Only unstructured text input」。
  - `packages/interaction/commands/src/index.ts:32`：`COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u`；`:61-79`：`CommandDefinition {definitionId?, name, description, input?, recordInput?, handler}`；`:101-104`：重复注册的报错文本；`:125-133`：`parseCommand` 只认第 0 字节的 `/`；`:315`：`list(agent)` 返回遮蔽后的视图。
  - `packages/interaction/commands/src/types.ts:20-31`（`CommandInputDescriptor {hint, attachments?}`）、`:57-66`（`CommandDescriptor`）、`:74-76`（`CommandSourceMap` 只有 `user`）、`:105`、`:112-117`（`command/run`、`command/done` 为 log-only）。
  - `docs/subsystems/commands.md:11`：「Command availability follows plugin composition: every adapter consuming the registry sees every effective definition」。
- 支持范围：代码与文档一致。

<a id="e-s9"></a>
### E-S9 skill 的 `/name` 手势与调用开关

- 实际观察：
  - `packages/skill/tool-skill/src/index.ts:409`：`SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g`；`:418-431`：`invokedSkillNames` 只扫 `source.kind === 'user'` 的消息，对整段文本做全局匹配；`:163-176` 的注释写「first line starts with `/<name>`」与「external text cannot forge the gesture……the command registry is a different closed namespace, resolved client-side」。
  - `packages/skill/tool-skill/README.md:88,226`：「A whitespace-bounded `/name` token anywhere in a claimed user message」注入 skill 正文，作为 user 角色的指令上下文；未知名字仍是普通文字。
  - `packages/skill/skill/README.md:55-60`：`modelInvocable` / `userInvocable` 四种组合。
- 支持范围：代码。**注释与实现不一致**：注释说「首行开头」，实现与 README 是「整条消息任意空白分隔位置」；本包以实现为准。

<a id="e-s10"></a>
### E-S10 一包一命令与实现备选

- 实际观察：
  - `packages/compaction/command-compact/src/index.ts:11-12`（`inject = ['commands','compaction']`）、`:101-106`（注册 `compact`）；handler 调 `ctx.compaction.compactNow(...)`（同文件 `:67`）。
  - `packages/goal/command-goal/src/index.ts:117-123`（带附件时 `agent.followup` 一条用户消息）、`:191-197`（注册 `goal`，`input.hint` 与 `attachments: true`）。
  - `packages/feedback/command-feedback/src/index.ts:77`（`recordFeedback`）、`:119-126`（注册 `feedback`）。
  - `packages/plan/plan-mode/src/index.ts:226-228`：注册 `plan`。
  - `.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.md:49-57`：否决的备选包括「把人类命令做成模型工具」「放进 agent 核心」「让 agent loop 注入」「未知斜杠输入送给模型」「持久化通用命令输入输出」。
- 支持范围：代码与作者备选记录。**冲突**：该 note 否决了「持久化通用命令输入输出」，现行代码却记 `command/run` 与 `command/done`（E-S8）；本包以代码为准，note 之后的演变未查。

<a id="e-s13"></a>
### E-S13 `/` 之下三类名字的撞名规则

- 实际观察：
  - `packages/client/ui-commands/src/client/contract.ts:58-64`：客户端自有命令「Merged with the host catalog by name — a collision with a host command fails loud at candidate synthesis, never shadows」；`packages/client/ui-commands/README.md:32`：「a host-name collision fails loudly」；`packages/client/ui-commands/src/client/service.ts:9`：同上。
  - `packages/client/ui-skill/README.md:12,28`：「a name shared with a host command continues to resolve as that command」；「adjudication claims the line client-side before it ever becomes a prompt」。
  - `packages/client/ui-commands/README.md:12`：`/` 命令会打开注册的弹窗、客户端动作、宿主命令输入或直接执行，「a command line is never silently downgraded to a plain prompt」。
- 支持范围：README 与 contract 注释。**未读**候选合成的实现，也未读 TUI 的 `/` 处理；「被遮蔽的 skill 有没有提示」未知。

<a id="e-s14"></a>
### E-S14 `dsh-native-command` 与斜杠命令无关

- 实际观察：`packages/util/native-command/README.md:12`：「runs host executables without a shell……It is a library, not a plugin: no `ctx`, no state, no events」。
- 支持范围：只证明两者同名不同物。

---

## 短板

<a id="e-k1"></a>
### E-K1 契约由代码生成；聚合绑定 Python 与 LangChain；ADR 改名未落码

- 实际观察：
  - `omne_harness/libs/omne_harness_runtime_plane_contracts/omne_harness_runtime_plane_contracts/component_slash_command_*_schema.py:1`：「generated by scripts/codegen_contracts.py from the JSON Schema SSOT — do not edit by hand」；SSOT 在 `omne_harness/contracts/schemas/events/runtime_plane/`。
  - `omne_harness/libs/omne_harness_inbound/omne_harness_inbound/domain/source_installation.py:39,79-113`：继承 `omne_core_v1...ContextBlock`，覆写 `lc_attributes` 以保证 LangChain 序列化往返。
  - `.../domain/enums.py:53-70`：`InstallationStatus` 仍是 `ACTIVE / SUSPENDED / DEREGISTERED / TOMBSTONE`；ADR-058 `:286-313`（§7.2）的新词表是 `{installed, suspended, uninstalled, tombstoned}`。
  - `source_installation_router.py:230`：路由仍叫 `/deregister`；`client.py:141`：SDK 方法仍叫 `register`；ADR-058 §7.8（`:384-390`）写「`register` 措辞按 §7.2 词表改名」。
- 支持范围：以上是代码与文档的逐处对照。

<a id="e-k2"></a>
### E-K2 授权落在 web_server 层并横跨两个子系统

- 实际观察：安装主体的判定在 `omne_harness/libs/omne_harness_inbound_web_server/omne_harness_inbound_web_server/source_installation_authorization.py:88-109` 与 `principal.py:153-178`；channel 登记与撤销的租户解析在 `omne_harness/libs/omne_harness_state_web_server/omne_harness_state_web_server/channel_register_access.py`、`channel_revoke_access.py`（由 `channels_router.py:70-71` 导入）；安装→state 投影走 `ProducerOutbox → relay → state.append`（ADR-058 `:406` ⑨⑩）。`get_status` 缺路由见 E-C8。
- 支持范围：文件位置与导入关系；未逐行读 `channel_register_access.py`。
