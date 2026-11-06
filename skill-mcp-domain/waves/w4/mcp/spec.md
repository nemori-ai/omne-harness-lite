# #1119 实施规格：MCP 线（revision 1，attempt `W4（波段）`）

本文件按 claim 模板与 Matt to-spec／to-tickets 写成。格式取 `.meta_harness/agents/skills/claim/canonical/references/spec-template.md`。方法取 Matt `to-spec`，固定源 `skills-b0618bc436ad`，按已安装路径直接读正文，不经宿主触发。项目差异按 `docs/engineering/skills.md`「三层分工」与「项目差异与负责边界」：不访谈，不发 issue，不请人批准测试接缝。本卡没有线父卡、binding 与 gate，用波段代替 attempt（[范式 §3](../../operating-model.md#3-变通)）。所以 attempt 写作 `W4（波段）`，派发与轮次记在 `delegate/flow.jsonl`。

本线的决定都已定，来源是 [W4 波包](../wave-pack.md) §4 决定 1–4 与 [W4 方案](../plan.md) §2.3、§3、§4.4。本文件只把它们落进模板，不重新裁定，不加范围。

- 卡与派发：[#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119)，交付修订 1。派发评论：不适用，范式 §3 用本地文件代替线父卡评论，派发记 `tmp/skill-mcp-domain/delegate/flow.jsonl`。taskBase：父分支 `PanQiWei/skill-mcp` 706152690（W3 各闭包合入后）。开波同步 `origin/integration/mainline` 之后以冻结输入 F 为准，F 写进[波包](../wave-pack.md) §1。
- 上一层：线级地图 [`waves/line-mcp/context-map.md`](../../line-mcp/context-map.md)。线级约束 [`waves/constraints.md`](../../constraints.md)（两条线共用一份）。本卡附录：无，范式 §3 不设卡级附录，W4 的先例与事实在 [W4 上下文包](../context-pack.md)。
- 主工作类型与 playbook：feature → poteto-mode `playbooks/feature.md`。
- 风险级别：L2，依据 `docs/engineering/quality.md`「按风险选择接受实现的看法」。理由：改动跨三个现有成员加一个新成员，并加一个装配节点（Cordis 插件），属于「多个成员、装配节点」。改动不改连接键的租户与对端账号隔离，不改凭据句柄与秘密值的处理，也不改在途表的取消范围，所以不触及范式 §6 列的 MCP L3 热点。两处按 L3 的看法补读：`CredentialUse` 适配器的缺席路径逐行读（它在凭据端口的路径上，只把缺席映射为 `unknown`），转 `lost` 的判断处逐行读。W4-1 的形式守护是方案 §4.4 的要求，照做，不因 L2 省掉。

## Problem Statement

M2 之后的消费者还不能用 MCP 领域。原因有两件。

1. 调用口不知道传输是否还可用，只能按失败原因猜。W3 把这个猜测登记为偏离（成员 SPEC「与已定事项和契约的偏离」第 3 行）。HTTP 上单个请求的流断开、400 或 5xx 也让整条连接转 `lost`，清单被标记，直到下一次 `refresh` 前都不可用。远程厂商服务偶发的一次失败就会让整份清单不可用。同表另两行（`discover` 的 `no-answer` 转 `lost`；`ensure` 的 `pending` 与 `closeAll` 的 `AggregateError`）是契约 S5 没写到的地方。
2. 没有 Cordis 服务定义。消费者没有服务键可取，宿主没有插件可装，撤除时没有人调用 `closeAll`。

## Solution

1. 契约让传输在答复上标出「传输不再可用」。传输已经在 T8 决策层算出这个事实（`AnswerConclusion` 的 `unusable`），现在把它交给调用方。调用口、任务操作与建连只按这个标记转 `lost`，不再按原因判断。契约 S5 写明另两处，偏离表删空。
2. 新成员 `mcp-cordis-contract` 给三个服务与四个他域端口建键。`mcp-host-local` 加 `./cordis` 插件。插件按调用现取端口，一次 `createMcp` 交出三个服务，撤除时 `await closeAll()`。

## 依据与已定事项

| 依据 | 精确修订与链接 | 本卡采用的范围 |
| --- | --- | --- |
| 卡正文 | [#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119) 交付修订 1，判据 C5、C6，交付条件 D-01、D-02（W3 波末写回稿 [card-body-after.md](../../w3/card-body-after.md)） | C5 的 MCP 部分；C6 的本波一次；W4-4 请求 D-01、D-02 |
| W4 方案 | [w4/plan.md](../plan.md)，负责人 2026-11-06 06:15、06:16 UTC 的两条指示 | §2.3 W4-1、W4-3、W4-4；§2.4 停放清单；§3 C5 改写原文；§4.1 评审与修复规则；§4.4 W4-1、W4-3、W4-4 的待办与验收 |
| W4 波包 | [w4/wave-pack.md](../wave-pack.md) | §3.3 写集与 reduce 共享写；§3.4 停止条件；§4 决定 1–4；§5 方法与验证 |
| 契约成员 SPEC | [`packages/mcp/mcp-contract/SPEC.md`](../../../../../packages/mcp/mcp-contract/SPEC.md)，父分支 706152690 | T 段（`McpTransport` 与 `McpTransportFactory`，含 T8 的决策层与 T5）、S2、S5、S7、S8、R1、R7；四个他域端口 AV、UE、CU、PL 的失败通道 |
| 契约的 T8 决策层 | [`packages/mcp/mcp-contract/src/decisions.ts`](../../../../../packages/mcp/mcp-contract/src/decisions.ts)，父分支 706152690 | `AnswerConclusion` 与 `UnusableCause`：标记的来源 |
| 通用实现成员 SPEC | [`packages/mcp/mcp/SPEC.md`](../../../../../packages/mcp/mcp/SPEC.md)，父分支 706152690 | 「与已定事项和契约的偏离」三行；MC-5、MC-10、MC-16、MC-17 第 4 步；「性质与证据」；`verification/` 的两个 TLA+ 模型与探索器 |
| 本地宿主成员 | [`packages/mcp/mcp-host-local/`](../../../../../packages/mcp/mcp-host-local/)，父分支 706152690 | 两种传输的答复；`createLocalTransportFactory`；`docs/cordis.md` 写明本包是 `module` 变体 |
| Cordis 集成约定 | [`docs/architecture/cordis-integration-conventions.md`](../../../../../docs/architecture/cordis-integration-conventions.md)，提交 e8c7415be | IC-1～IC-9、IC-14、IC-16、IC-19 |
| 领域页 | [`docs/domains/mcp/architecture.md`](../../../../../docs/domains/mcp/architecture.md)，父分支 706152690 | 「MCP 声明的端口与实现方」「MCP 交出的能力」：端口实现方与服务接收方 |
| 资产的类别提供方 | [`packages/assets/assets/SPEC.md`](../../../../../packages/assets/assets/SPEC.md)「类别提供方」，父分支 706152690 | `EndpointInspection` 经登记接入，不用服务键（决定 2） |
| 先例 | `execution-environment-cordis-contract` 与 `execution-environment-host-local` 的 `./cordis`，父分支 706152690（[上下文包](../context-pack.md) §2、§3） | 抽象 Service 与键的写法；他域端口每次现取；撤除函数与 `RetirementPending` 的日志写法 |
| 包模板 | [`tools/dev-flow/templates/package/README_ZH.md`](../../../../../tools/dev-flow/templates/package/README_ZH.md)，父分支 706152690 | `create`、`scan`；「标识与人工采用门」 |
| 包组织 | [`docs/package-organization.md`](../../../../../docs/package-organization.md)，父分支 706152690 | 「现有成员不自动迁移」 |
| 评审规则 | [plan-changes.md](../../plan-changes.md) C-SM-08 | 最终 head 一次关口，A、E 必做，B、C 按改动选，D 一次 |

### 1. 「传输不再可用」标记（闭包 `w4-mcp-unusable`）

1. **标记的位置。** 契约给传输交出的每一种答复加可选字段 `unusable?: UnusableCause`。范围是 `discover`、`listActions`、`call` 的 `not-sent` 与 `SentCall.answer`，以及四个任务操作的答复与失败。字段出现，表示传输在交出这个答复时已经不再可用。字段不出现，表示传输仍可用。这是可加改动。
2. **语义。** 「不再可用」单调：传输一旦在某个答复上标出，之后的每个答复都标出（T8 的「之后每个请求」）。T8 表里写「传输不再可用」的行（S01–S04、S07、X02 等）与 `lineGoneAnswerOf` 结算的其他在途请求，都带标记。单个请求失败而线路仍在时不带标记，例如 HTTP 上一个 POST 的流断开、400、5xx。
3. **两种传输给出它。** `mcp-host-local` 把决策层已算出的 `unusable` 填进答复。契约的脚本化传输同样填。符合性套件加条款：带「传输不再可用」的行，答复带标记。其余行不带。
4. **调用口按标记转 `lost`。** 适用范围是就绪连接上的请求：`refresh` 的 `listActions`（页请求）、调用口、四个任务操作。（2026-11-06 15:51 更正：原写「`refresh` 的 `discover` 与 `listActions`」。本包只在建连中调用 `discover`（`internal/build.ts`），就绪连接由 `ensure` 复用、不重新 `discover`，所以就绪连接上没有 `discover` 请求；建连中的 `discover` 按下文「建连不在此列」与第 5 条。依据：产品闭包规格 `w4-mcp-unusable` 追加 1 第 2 项。）答复对连接的后果是下面这个全函数，按序取第一条成立的：
   1. 答复带 `unusable: c`：连接转 `lost`，原因是 `c`，清单标记 `connection-unavailable`（契约 S7「传输不再可用」，本条先于按失败种类的规则）。
   2. 否则，答复是 `not-sent` 且原因是 `authorization-required`：连接转 `lost`（`authorization-required`），清单标记 `authorization-required`。这是 S7 自己的一行，凭据被拒对这条连接上之后的每个请求都成立，不是按原因猜传输。
   3. 否则：连接不变。包括不带标记的 `not-sent`（`connection-unavailable`）、不带标记的 `no-answer`（单个请求的流断开）、`abandoned`（本端的决定，T5 的停止信号也在此）以及每一种有答复的结局。

   删掉 `lost.ts` 里按原因的三个映射（`lostOfNotSent`、`lostOfNoAnswer`、`lostOfOutcome`），三个服务改用这一个函数。转 `lost` 的写法仍是 W3 的同步前缀加作用域（`loseOn`、`loseInScope`），只换判断条件。调用口为 T5 停止信号的答复单独跳过判断的分支，在第 3 条下成为多余：闭包规格核实后删去，核实不了就保留并写明理由。

   `refresh` 上的后果随之改。契约 S5 现在写「某页或 `discover` 的传输答 `not-sent`（`connection-unavailable`）时连接转 `lost`」，与第 3 条冲突。改为与 S5 对 `no-answer` 的写法对称：不带标记的 `not-sent`（`connection-unavailable`）在页请求上算这一页失败，`kept`（`listing-incomplete`，缺陷 `page-failed`），连接转 `degraded`（`list-failed`）；在 `discover` 上 `refresh` 答 `connection-unavailable`，连接转 `degraded`（`discover-failed`）。带标记时仍按 S5 首句转 `lost`。契约里其他按失败种类写连接后果的句子（S2 等），闭包规格逐条列出并对齐这个全函数。

   建连不在此列：建连中 `open` 或 `discover` 失败，无论带不带标记，建连都失败并按 MC-5 处置（第 5 条）。`internal/build.ts` 只给失败的建连标 `LostReason`，本节不改它。（2026-11-06 16:06 更正：「不改它」撤回。建连失败时 `refresh` 答什么仍归 MC-5；但 `lost` 原因的词义归契约 S7，必须在两个阶段都成立。`build.ts` 的 `lostOfNoAnswer` 按失败原因给原因，会让 HTTP 建连中一次 5xx 报成 `stream-broken`（通道断了），让 stdio 建连中的 X02 报成 `preparation-failed`。改为：建连失败的原因先取 `lostOf(failure)?.reason`，没有再按后备规则取（`error-answer`、`answer-malformed` 取 `discover-failed`，其余取 `preparation-failed`），清单标记同理；删 `lostOfNoAnswer`。依据：关口 B 面 B-1，分析见 `reviews/mcp-unusable-r1-analysis.md` 轴 C。）
   
   **`UnusableCause` 去掉 `abandoned`。** 现行类型是 `NoAnswerCause | 'session-ended'`，`abandoned` 没有生产者（决策层只给 `process-exited`、`session-ended`，两种传输的线路结束只给 `stream-broken`、`process-exited`）。本节把这个类型放进每个公开答复，所以改为 `'stream-broken' | 'process-exited' | 'session-ended'`，上面的全函数不需要为一个不会出现的值定后果。这把 W3 停放的一项 0.1.0 形状项提前（[W4 方案](../plan.md) §2.4），只做这一项。
5. **`discover` 的偏离。** 建连中 `discover` 答 `no-answer` 时，连接还不是 `ready`，建连失败，按 MC-5 的表处置。它不是 S5 写的「就绪连接的 `discover` 失败」。契约 S5 加一句，写明建连中的 `discover` 失败归建连失败。删偏离表第 1 行。
6. **契约 S5 的两句。** 时限先于清单标记到期时，`ensure` 答 `pending`。（2026-11-06 15:56 更正：这一句不进契约。`ensure` 与 `pending` 是成员内部的词，而建连中的失败按第 5 条与 S5 首句归实现的建连规则，成员 MC-7 已写这一情形；契约写进去就替实现定了建连规则。偏离表第 2 行照样删除，理由改为「建连失败归实现」。依据：关口 B 面 B-3，裁定见 `reviews/mcp-unusable-r1.md`。）`closeAll` 有本包错误时以 `AggregateError` 拒绝，不交出确认范围。删偏离表第 2 行。
7. **冲突句。** 契约 R1 与 S2 关于「资格非 `granted` 时任务操作」的冲突句，按现行实现改为同一句。R7 的 `no-connection` 定义写明含「资格不是 `granted`」。
8. **守护。** 连接表的 TLA+ 模型或探索器加一条性质：单个请求失败而传输仍可用时，连接不转 `lost`。正控无违例。一个有效动作变异（不带标记也转 `lost`）报违例。

### 2. Cordis 服务定义与插件（闭包 `w4-mcp-cordis`，在第 1 节合入之后）

9. **新成员 `mcp-cordis-contract`。** 用包模板的 `service-contract` 变体生成，`scan` 为 pass。根入口不导入 Cordis（IC-4），定义都在 `./cordis`。
10. **键。** 三个服务键：`ActionDiscovery`、`ActionInvoker`、`EndpointStatus`。四个端口键：`AdoptionView`、`UseEligibility`、`CredentialUse`、`ProcessLanding`。每键一个抽象 Service：`static readonly provide` 是键的唯一书写处，构造写 `super(ctx, X.provide)`，类 `implements` 契约根或 `./provider` 的接口，JSDoc 写 `@owner packages/mcp/mcp-cordis-contract`（IC-2、IC-3）。键名用 camelCase 能力名词（IC-7），具体名字在闭包规格里列全。`EndpointInspection` 与 `Connections` 不建键（波包决定 2）。
11. **插件。** `mcp-host-local` 的 `./cordis` 导出插件工厂。工厂参数收函数与本地对象：`principalKey`、`checkOutput`、`clock`、`fetch`。插件配置收可序列化上界与 `clientInfo`，全部必填。插件体做四件事：
    - 造四个端口适配器。每次调用从装载时的 `ctx` 取端口键，缺席答该端口的 `unknown`（波包决定 1）。
    - 造内存清单库与 `createLocalTransportFactory`。
    - 调一次 `createMcp`，逐个 `new` 三个服务子类，共一条 fiber（决定 3）。
    - 登记一个撤除函数：`await connections.closeAll()`，`AggregateError` 原样抛出（决定 4）。
12. **`mcp-host-local` 的变体。** 它现在是 `module` 变体，没有模板标记。加 `./cordis` 之前，先用 `pnpm package:template scan` 对本成员取现行读数，按模板 README 的规则清点差异。没有「升为提供者」的命令时，按 `package-organization.md`「现有成员不自动迁移」手工补插件源码、插件用例与 Cordis 文档（文件名见 [plan.md](plan.md) 切片 02），在闭包规格写明清点结果。

已定事项（本卡内具名的局部决定）：

- **D-W4M-1 判据 C5「`scan` 为 pass」的读法。** 读作 `pnpm package:template scan --member <成员> --json` 报完整结构 `pass`、集成无 `deviation`。理由：模板 README「标识与人工采用门」写明，草稿不写采用标识，`--check` 对缺标识的成员退出 1。标识在全部结构适配与集成核对完成后才写。所以 `--check` 退出 0 不作为本波判据。新成员与 `mcp-host-local` 是否在本波贴模板标识，见「待决事项」。
- **D-W4M-2 W4-1 守护的接缝选探索器。** 方案 §4.4 写「TLA 模型或探索器」。本卡选 `mcp` 的有界穷举探索器作必做接缝，变异按成员 `verification/README.md`「两种证据能变红」的源码变异做（改源码、重建、运行、按字节还原）。理由：`ConnectionTable.tla` 把 `lose` 当作原子动作，「单个请求失败是否转 `lost`」的判断在调用与发现的路径上，探索器直接跑真实源码。`Calls.tla` 已经抽象了传输的 `not-sent` 与 `no-answer`，若闭包规格核实它能不改抽象就表达这条性质，再加模型的正控与负控，否则不加。
- **D-W4M-3 C5「在脚本化传输上走刷新 → 调用」的测试接缝。** 插件按决定 1 自己造 `createLocalTransportFactory`，所以装配用例不注入契约的脚本化传输工厂。stdio 对端用 `mcp-host-local` 测试夹具里的脚本化对端进程，由 `ProcessLanding` 的替身交给本地传输。W4-3 待办里的「脚本化进程已停止」指这个进程。理由：决定 1 把 `transports` 定为插件自建，不进工厂参数。注入脚本化传输工厂需要新增一个工厂参数，等于改决定 1。

## 原则与约束

研发品味按 ub-mode 全文（`~/.claude/skills/ub-mode/SKILL.md`，固定提交 `unclebob/ub-mode@57a8bdd2`）。会话级取舍见[线级约束](../../constraints.md)「ub-mode」。本线有取舍或偏离的条目：

| ub-mode 条目 | 本卡的取舍或偏离、理由 |
| --- | --- |
| Model the Domain／Type System Discipline（让非法值写不出来） | 偏离：标记用可选字段 `unusable?`，不把答复改成「可用答复｜不可用答复」的判别联合。理由只有一条：契约成员合入后只做可加改动（[范式 §2 第 10 条](../../operating-model.md#2-照守的规则)），`integration.md`「可加改动」表里「加可选字段」对写方与读方都不破坏，给联合加成员则破坏读方。类型能排除的只是「标记出现在不该有它的变体上」，按变体放置字段已经做到；判别联合也挡不住错标，因为可用与否是运行时的事实。代价：编译器看不见漏传，拆开重组答复或交出预先造好的常量都能编译通过，所以每个承载标记的位置都要有能让它变红的用例；照抄字段处有存在性分支；传输一侧的单调性只由符合性条款的「之后一个请求」守住，探索器的 P15 守的是消费方「不带标记不转 `lost`」。（2026-11-06 16:06 更正：原写「判别联合能让『标了不可用却仍可用』写不出来」与「单调性改由符合性条款与探索器的性质守住」，两句都不成立。依据：关口 C 面 F1。） |
| Redesign From First Principles | 考虑过传输级的单调信号：一个在传输不再可用时兑现的 Promise，由连接表订阅。它把「传输状态」与「请求结局」分得更开，也能发现空闲连接的线路断开。不采用：它给连接表的生命周期加一条随时可能到来的异步边，TLA+ 模型与探索器都要加一个环境动作。已要求的需求（偏离表第 3 行）只要求不因单个请求失败而误拆连接，答复上的标记已经满足。重开条件：消费者要求空闲连接的状态及时反映线路断开 |
| Subtract Before You Add | 删掉按原因判断 `lost` 的映射，不在旁边再加一条标记判断。偏离表三行随改动删空 |
| Separate Before Serializing Shared State | 三个服务共用一张连接表、在途表与任务表，所以三者共一条 fiber、同生同灭（决定 3），不按服务分 fiber |

其余条目按 ub-mode 全文。

项目独有判断与约束：

| 判断或约束 | 拥有者 | 本卡的具体条目 |
| --- | --- | --- |
| 问题所在的轴与拥有者 | `engineering-taste.md`「维度分解与正交」 | 第 1 节在「连接生命周期」轴上：传输是否可用归传输（它读线路），连接何时 `lost` 归连接表，调用口只传递标记，不判断原因。第 2 节在「装配与生命周期承载」轴上：键与抽象 Service 归 `mcp-cordis-contract`，插件与撤除归 `mcp-host-local`。装配轴不决定连接生命周期：插件撤除只调用 `closeAll`，关停语义仍归 `mcp` 的 S8 |
| 顶层架构 | `docs/architecture/cordis-integration-conventions.md`，提交 e8c7415be | IC-1 每个接缝一个定义；IC-2 键只由抽象 Service 的 `static provide` 给出，插件体里逐个 `new` 三个子类，理由见决定 3；IC-3 抽象类 `implements` 契约接口、`@owner` 指向真实成员；IC-4 根入口无 Cordis；IC-5 定义闭包不引入提供者；IC-7 键名；IC-8 不写 `inject`；IC-9 端口按调用现取，缺席答 `unknown`，换代后下一次调用取新的，不持有旧引用；IC-14 上界进配置，配置错误加载失败；IC-16 函数与本地对象经工厂参数；IC-19 连接表、在途表、任务表是进程内对象，靠同进程兑现 |
| 领域边界与依赖方向 | `docs/architecture/layers-and-dependencies.md` | `mcp-host-local → {mcp, mcp-cordis-contract} → mcp-contract`，`mcp` 与 `mcp-cordis-contract` 互不依赖（组 README）。`mcp-cordis-contract` 只依赖 `mcp-contract` 与 Cordis 4.0.4。外域概念的进入方式见下面五问 |
| 面向契约 | `mcp-contract` SPEC；`docs/engineering/integration.md`「可加改动」 | 第 1 节只做可加改动，新字段可选。卡标签 `contract:additive`。新的符合性条款对写方（两种传输与脚本化替身）加了行为义务，本波同时改齐这三个写方 |
| 防御与失败语义 | `docs/defensive-patterns.md`；`quality.md`「公开能力、策略与观测」 | 见下面「失败语义」 |
| 演进政策 | `docs/engineering/publication.md`「当前演进与消费者」 | 同波迁移的消费者：`mcp` 的调用、任务与发现改按标记判断。删除的被替代实现：按原因判断 `lost` 的映射；偏离表三行。MC-16、MC-17 第 4 步的变异表随判据更新 |
| 范围 | 负责人 2026-11-06 第一条指示（[方案](../plan.md) 依据段） | 只做方案 §2.3 的 W4-1、W4-3 与 W4-4 的 MCP 部分。§2.4 停放清单不做 |

SOLID 与 DDD 的采用范围归 `layers-and-dependencies.md`「方法依据与采用范围」。写范围含 `.ts`，加载 `pstack:typescript-best-practices`。

### 跨域概念的五问

本卡给四个他域端口建服务键，并让插件按调用现取。依据 `docs/architecture/layers-and-dependencies.md`「设计与开发的核对」逐问回答。

1. **本域哪项职责或不变量需要它，缺少它会造成什么具体错误。** MCP 的三个服务在 `refresh`、调用与任务操作之前过关口：读采用（`AdoptionView`）、核使用资格（`UseEligibility`）、取凭据句柄（`CredentialUse`）、为本机命令型接入点落进程（`ProcessLanding`）。这是组页「资格与换代」的默认拒绝与「未采用、无权、不存在不可区分」的前提。没有端口键时只有两种做法，都出错。第一种：插件导入某个端口实现，违反 IC-5、IC-16，MCP 被迫认识实现方。第二种：插件写 `inject` 必需这四个键，M2 之前没有提供者，插件停在 `PENDING`，消费者取不到任何服务；任一端口换代都使插件重跑，连接表关停重建（IC-8），在途调用全部答关停。
2. **谁拥有其含义和权威状态，本域读取、判断、保存或发起哪些部分。** 含义与形状归 MCP 自己（端口接口在 `mcp-contract` 的 `./provider`，是需求方用自己的词声明的端口）。权威状态归实现方：采用归资产求值与装配，资格归身份与授权，凭据归凭据保管方，落点归执行环境（领域页「MCP 声明的端口与实现方」）。MCP 只读端口交回的结论与句柄，不缓存资格，不保存采用，不读秘密值。键与抽象 Service 归 `mcp-cordis-contract`。他域的求值过程、授权流程与落点选择留在域外。
3. **采用哪种表示，放在哪个包或接口。** 消费公开契约：接口在 `mcp-contract`（`./provider`），服务键与抽象 Service 在 `mcp-cordis-contract` 的 `./cordis`。装配或适配器成员装载子类提供端口键，插件按键现取。M2 之前由测试用契约 `./testing` 的内存替身包成 Service 子类提供。
4. **正常、失败、未知、撤权和恢复怎样交接，共同保证由谁保护、怎样验证。**
   - 正常：每次调用，适配器从插件装载时的 `ctx` 取键（`ctx.get`），取到就转给提供者，答复原样交回 `mcp`。不取服务方法里调用方的上下文，否则调用方可以自己给自己授权（先例 `execution-environment` SPEC 性质 9）。
   - 失败与未知：提供者的失败原样交回。键缺席时，适配器答该端口已有的 `unknown`：`AdoptionView` 答 `'unknown'`，`UseEligibility` 答 `{ kind: 'unknown' }`，`CredentialUse` 答 `CredentialFailure` 的 `'unknown'`，`ProcessLanding` 答 `'unknown'`。`mcp` 已经按默认拒绝处理 `unknown`，不新增机制：实际调用了缺席端口的那一步得到 `unknown`，操作按契约 S1、S2、R6 的规则答复（例如落点缺席时 `refresh` 答 `landing-unavailable`；复用现有连接的任务操作不问采用与资格），不放行。（2026-11-06 14:50 更正，原写「不建连、不发出，答 `unknown`」，全称有反例。）
   - 撤权：提供者的 fiber 撤除后，下一次 `ctx.get` 取不到，依赖它的操作答 `unknown`。资格本身的撤权由 `UseEligibility` 在下一次使用时答出（领域页：不缓存结论）。
   - 恢复：新提供者装载后，下一次调用取到新的。适配器不持有旧引用。
   - 共同保证的承担者：「缺席不放行」由插件的适配器承担；「`unknown` 不压成拒绝、空集合或成功」由 `mcp` 承担。验证见「Testing Decisions」的端口缺席用例。
5. **更换上层调用者或外域实现时哪些规则保持不变。** 更换端口提供者时，关口次序、默认拒绝、连接键隔离与关停答复都不变，插件也不重跑。独立消费者：一个只用 `createMcp` 的程序不装 Cordis，直接把四个端口对象交给工厂，行为与插件一致。边界反例：一个只读 `EndpointStatus` 的管理读面，不应因为没有凭据提供者而取不到服务。现取让它取得到，只有需要凭据的建连答 `unknown`。写成 `inject` 时，它会被迫先提供 `CredentialUse`。

### 失败语义

| 情形 | 行为 | 由谁负责 | 怎样验证 |
| --- | --- | --- | --- |
| 正常 | 带标记的答复转 `lost`，不带的不转。插件装载后按三个键取到服务，刷新与调用照常答复 | `mcp`；插件 | 调用、任务、`refresh` 的页请求各一组用例；建连中的 `discover` 一组（带不带标记，建连都失败）；装配用例（2026-11-06 15:51 更正：原写「建连各一组」，与第 4 条「建连不在此列」矛盾） |
| 失败 | 单个请求失败而传输仍可用（HTTP 5xx、400、单个流断开）：本次请求答原失败，连接不转 `lost`，清单不标记。错误不变成成功 | 传输给标记；`mcp` 按标记判断 | `mcp` 用例：HTTP 5xx 与流断开各一例；探索器的新性质 |
| 失败：配置不合法 | 插件配置按 Standard Schema 校验，不合法时加载失败。`createMcp` 对不合法配置抛 `RangeError` | 插件；`mcp` | 装配用例给一份缺字段的配置。fiber 进入 `FAILED` 的路径先例没有单独核验，未覆盖时记「未验证」 |
| 未知：端口键缺席 | 适配器答该端口的 `unknown`。实际调用了缺席端口的那一步得到 `unknown`，操作按契约 S1、S2、R6 的规则答复，不放行（2026-11-06 14:50 更正，原写「依赖它的操作答 `unknown`」） | 插件的适配器；`mcp` | 装配用例：四个键逐个缺席，操作按上述规则答复、不建连，其余服务照常取得 |
| 未知：W4-1 标记缺失或错标 | 传输该标而没标：连接不转 `lost`，下一次请求再遇线路不可用时，传输仍须在那次答复上标出（单调）。传输不该标而标了：连接被多拆一次，只损失可用性，不给出错误结局。两种都是传输违约 | 传输（`mcp-host-local` 与脚本化传输）；契约的符合性条款 | 符合性套件按「条款 × 违约」组织：给一个漏标与一个错标的违约实现，证明条款会变红 |
| 取消与清理：插件撤除 | 撤除函数 `await connections.closeAll()`。`closeAll` 先把表置为已关停（S8），再并发关闭每条连接。`dispose()` 在 `closeAll` 结算之后才返回 | 插件登记撤除函数；关停语义归 `mcp` MC-10 | 撤除用例断言 `dispose()` 返回时 `closeAll` 已结算、脚本化对端进程已停、句柄已释放、三个键取不到 |
| 取消与清理：撤除时的在途调用 | 置为关停之后到达或等待中的调用按 S8 答复。服务键的撤回与 `closeAll` 谁先谁后，不改变答复（决定 4） | `mcp` 的出口判定 | 撤除用例：撤除时有一个在途调用，它得到 S8 的答复，不挂起 |
| 取消与清理：`closeAll` 以 `AggregateError` 拒绝 | 撤除函数原样抛出。Cordis 把它写入 `ctx.logger`，卸载照常完成（先例 `RetirementPending`）。先例没有 `AggregateError` 的写法，本波的用例就是证据 | 插件；Cordis 的效果撤除 | 撤除用例：注入一个使 `closeAll` 拒绝的本包错误，断言 `dispose()` 照常返回、日志收到这个 `AggregateError` |
| 外部效果 | `closeAll` 不声称进程已停，报告实际确认的范围。撤除不等于可逆：已发出的调用不撤回 | `mcp` MC-10；`ProcessLanding` 的实现方 | 现有 `shutdown.spec.ts`、`release.spec.ts` 的用例不改；撤除用例不断言进程树范围 |

可配置的策略：插件配置收 `maxListingPages`、`maxActions`、`instructionsByteLimit`、`probeTimeoutMs`、`clientInfo`。全部必填，不设隐藏默认值（`McpConfig` 注明每项必填、无默认，波包决定 1）。本波不加新的重试、退避或超时。

## User Stories

角色只用通用角色，不点名域外调用方。

1. 作为调用方，我在 HTTP 服务端偶发一次 5xx 之后，仍能调用同一个端点的其他动作，不用等下一次 `refresh`。
2. 作为调用方，我在 HTTP 上一个请求的流断开之后，同一条连接仍为下一次调用所用。
3. 作为调用方，stdio 服务端进程退出之后，我的下一次调用答「没有发出」，连接转 `lost`，清单被标记。
4. 作为调用方，一个任务操作的答复带「不再可用」标记时，连接转 `lost`。不带时，连接不变。
5. 作为调用方，建连中 `discover` 答 `no-answer` 时，我得到建连失败，按建连失败的原因处置。
6. 作为管理读面，我从 `EndpointStatus` 看到的 `lost` 只来自传输确实不可用。
7. 作为传输的实现者，我从契约的符合性套件知道哪些行必须带「不再可用」标记，漏标与错标都会让套件变红。
8. 作为契约的读者，我从契约 S5 知道 `ensure` 何时答 `pending`、`closeAll` 何时以 `AggregateError` 拒绝。
9. 作为契约的读者，我从 R1、S2 与 R7 读到同一条关于资格非 `granted` 时任务操作的规则。
10. 作为成员 SPEC 的读者，我看到偏离表已经删空，不再有比契约宽的地方。
11. 作为 M2 之后的消费者，我按服务键 `ActionDiscovery`、`ActionInvoker`、`EndpointStatus` 取到 MCP 的服务。
12. 作为消费者，我只依赖 `mcp-cordis-contract` 的键，不依赖提供者的实现入口。
13. 作为宿主，我撤除 MCP 插件时，连接与进程经 `closeAll` 收口，`dispose()` 在收口之后才返回。
14. 作为宿主，`closeAll` 以 `AggregateError` 拒绝时，卸载仍完成，日志里有这个错误。
15. 作为宿主，撤除时在途的调用得到关停答复，不挂起。
16. 作为装配，在他域端口还没有提供者时，我装上 MCP 插件仍能取到服务。依赖缺席端口的操作答 `unknown`。
17. 作为装配，我更换一个端口的提供者时，插件不重跑，连接表不重建。下一次调用使用新的提供者。
18. 作为装配，我经插件配置给出上界与 `clientInfo`。缺一项时插件加载失败，不用隐藏默认值。
19. 作为装配，我经工厂参数交入 `principalKey`、`checkOutput`、`clock`、`fetch`，它们不进配置。
20. 作为资产与装配，我把 `mcpEndpointBodyContract()` 登记进资产类别注册表，不需要服务键。
21. 作为一个只用通用实现的独立程序，我不装 Cordis，直接调 `createMcp`，得到同样的行为。

## Implementation Decisions

- 成员与职责：
  - `mcp-contract`：答复类型的可选字段；S5 的两句与建连中 `discover` 的一句；R1、S2 的冲突句；R7 的定义；T 段写标记语义；符合性条款与漏标、错标的违约实现。
  - `mcp-host-local`：两种传输把决策层的 `unusable` 填进答复；`./cordis` 插件工厂、插件配置的 Schema、四个端口适配器与撤除函数。
  - `mcp`：调用、任务与发现按标记转 `lost`；删按原因的映射；偏离表三行删除；MC-16、MC-17 的变异表更新；探索器的新性质。
  - 新成员 `mcp-cordis-contract`：三个服务键与四个端口键的抽象 Service，`Context` 增补，根入口为空。
- 第 1 节与第 2 节分两个闭包，串行：两者都写 `mcp-host-local`。
- 插件不新增机制：适配器每次 `ctx.get`，与先例相同。不写 `static inject`。
- `mcp-cordis-contract` 不设 `./testing` 入口。端口替身已在 `mcp-contract` 的 `./testing`（[上下文包](../context-pack.md) §7 第 5 条：Cordis 层的测试入口没有来源）。
- 装配次序与依赖段由 reduce 在派发 `w4-mcp-cordis` 之前写（波包 §3.3）：新成员的生成、`mcp-host-local` 的依赖段（加 `@deepseek-ai/cordis`、`mcp-cordis-contract`，`mcp` 从 devDependencies 移到 dependencies）、`exports` 的 `./cordis`、锁文件。

## Testing Decisions

- 测试与验证先设计：写出判据、反例与变红验证（每条测试在什么缺陷下变红），再实施。写新测试时先确认它变红，再实现（`docs/engineering/skills.md`「ub-mode 研发品味」）。成员测试导入 `dist`：证明变红时先还原源码并重新构建，再运行（[范式 §5](../../operating-model.md#5-新增记录分支) W2 教训）。
- 好的测试只断言外部行为与契约要求的结果：答复里有没有标记、连接状态、清单是否被标记、`dispose()` 何时返回、日志收到什么、键是否取得到。包括必须的「不发生」：单个请求失败后连接不转 `lost`。
- 测试接缝（越高越好，越少越好）：
  - 第 1 节：契约符合性套件（传输的写方）；`mcp` 的服务层用例（读方）；`mcp` 的有界穷举探索器（性质，见 D-W4M-2）。
  - 第 2 节：一个接缝，`mcp-host-local` 的 Cordis 入口用例。它在真实 Cordis `Context` 上装插件，四个端口键用契约 `./testing` 的内存替身包成 Service 子类提供，按三个服务键取服务，在本地传输与脚本化对端进程上走「刷新 → 调用」（D-W4M-3）。同一文件覆盖撤除、`AggregateError`、端口缺席与配置不合法。
  - `mcp-cordis-contract`：根入口无 Cordis；键常量等于类的 `provide`；导出集合恰为公开名单。
- 第 1 节的用例：符合性套件加「标记」条款，按「条款 × 违约」组织。`mcp` 的调用、任务、`refresh` 的页请求各有用例：带标记转 `lost`，不带不转（HTTP 的 5xx 与流断开各一例）；建连中的 `discover` 带不带标记，建连都失败（2026-11-06 15:51 更正：原写「建连各有用例：带标记转 `lost`，不带不转」，与第 4 条「建连不在此列」矛盾）。
- 被测成员与先例：`packages/execution/execution-environment-host-local/tests/cordis-entry.spec.ts`（撤除完成的断言写法，`dispose()` 之后取不到键，`recordErrors(ctx)` 收到撤除错误）；`execution-environment-cordis-contract` 的 `tests/public-entry.spec.ts` 与 `tests/cordis-entry.spec.ts`；`mcp` 的 `tests/model/` 探索器与 `verification/README.md`「两种证据能变红」。
- 判据与切片（命令写在 [plan.md](plan.md)）：

| 编号 | 判据 | 来源 | 切片 |
| --- | --- | --- | --- |
| M4-1 | 偏离表三行都删掉；`grep -c '比契约 S7 宽' packages/mcp/mcp/SPEC.md` 输出 `0` | 方案 §4.4 W4-1 验收第 1 条 | 01 |
| M4-2 | `mcp` 源码里转 `lost` 只读标记；按原因的判断已删 | 方案 §4.4 W4-1 验收第 2 条 | 01 |
| M4-3 | 新性质正控无违例，变异报违例 | 方案 §4.4 W4-1 验收第 3 条 | 01 |
| M4-5 | 三成员加新成员的 `build`、`typecheck`、`test`、`test:slow` 退出 0；`lint:deps` 无违规 | 方案 §4.4 W4-1 验收第 4 条；W4-3 | 01、02 |
| M4-4 | C5 的 MCP 部分：模板生成、`scan` pass、IC-2、IC-4、装配旅程、撤除用例 | C5 第 1–4 条的 MCP 部分 | 02 |
| M4-6 | C5 第 5 条的 MCP 部分：MCP 组页「完整行为候选的正式承接缺口」表与领域页按实际成员和状态写回，`review-docs` 无阻断 | C5 第 5 条；方案 §4.4 W4-4 | 03 |
| M4-7 | W4-4 的波末项：C5、C6 有证据；卡上已请求 D-01、D-02，请求评论的链接写进卡正文「成果交回」 | 方案 §4.4 W4-4 | 03 |

- 传感器与命令（按风险级别选，规则归 `docs/clean-loop.md` 与 `docs/verification.md`）：

| 检查 | 命令 | 何时跑 |
| --- | --- | --- |
| 成员门禁 | `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp --filter=@omne-harness/mcp-host-local`（切片 02 另加 `--filter=@omne-harness/mcp-cordis-contract`）；同一组 `--filter` 跑 `pnpm turbo run test:slow` | 写者每个切片最后一次改动后；reduce 合入父分支前复跑 |
| 类型与 lint | `pnpm run typecheck`；`pnpm run lint:rules`；`pnpm run lint:oxlint` | 每个切片后 |
| 依赖方向 | `pnpm run lint:deps` | 每个切片后（切片 02 必跑：新依赖边） |
| 格式与文档 | `pnpm run format:check`；`pnpm run check:docs` | 每个切片后（七项轻门禁的其余两项） |
| 预检 | `pnpm run preflight` | reduce 合入父分支前（[范式 §6](../../operating-model.md#6-质量门槛)） |
| 包模板 | `pnpm package:template scan --member packages/mcp/mcp-cordis-contract --json`；`mcp-host-local` 同一命令取清点读数 | 切片 02 开工前与交回时 |
| 性质守护 | 正控：`mcp` 成员门禁里的探索器运行；负控：按 `verification/README.md` 的源码变异运行同一用例，再按字节还原并重建。若加了 TLA+ 配置：`TLA2TOOLS_JAR=/opt/tlaplus/tla2tools.jar node scripts/with-test-slot.mjs python3 packages/mcp/mcp/verification/models/run.py <配置>` | 切片 01 交回时 |
| 结构读数 | `pnpm run metrics --coverage`，基线按 `review-code` 技能「度量与差分变异的基线」一段 | 切片 02 之后集中一次 |
| 差分变异 | `VITEST_MAX_WORKERS=6 pnpm run mutation --base <F> --since <切片 01 的首个提交>`，只打热点：转 `lost` 的判断处、插件撤除函数与端口适配器。基线与收窄按 `review-code` 技能「差分变异」一段 | 最终 head 上跑一次 |
| 文档与投影 | `pnpm run check:docs`；`pnpm run check:agents` | 改到时 |
| 整次准入 | `pnpm run admission`；`pnpm run acceptance`；`pnpm run loop:status --strict --base <F>` | 不跑卡级准入。波末在父分支头各跑一次，只作质量读数（范式 §3、§6；波包 §5）。基线既有失败与本波引入的失败分开报 |

- 不能声称的事（`docs/verification.md`）：
  - 真实端口提供者与消费者的组合：未执行。M2 之后才有提供者与消费者。
  - 应用插件树中的装配：未执行，不在本波范围。
  - Streamable HTTP 上的插件旅程：未执行。装配用例只走 stdio 的脚本化对端，HTTP 上的标记行为由 `mcp-host-local` 的传输用例与 W3 的端到端覆盖。
  - 进程树的实际停止范围：未测量。撤除用例只断言脚本化进程已停，`closeAll` 只报告确认的范围。
  - 同一 isolate 重复装载与多 isolate 并存（IC-6）：未验证，先例也没有测试。
  - 配置失败使 fiber `FAILED` 的路径：若用例未覆盖，写「未验证」。
  - 探索器与 TLA+ 的结论只在各自的上限与抽象之内成立，不表示任意规模下正确。

## 待决事项

先筛三层：过度设计删掉 → 自己能定的写进「已定事项」→ 只有产品规则、范围变化、新的破坏性契约改动、须接受者本人做的动作才算缺口。

| 缺口 | 影响的切片 | 处置 |
| --- | --- | --- |
| `mcp-cordis-contract` 与 `mcp-host-local` 在本波是否写模板采用标识（`omneHarness.packageTemplate`）。来源只写「全部结构适配与适用集成核对完成后才写」，没有说由谁在哪一波核对 | 02 | 本波不贴标，判据按 D-W4M-1 读。整卡技术接受（D-01）时一并请负责人定。不阻塞切片 |
| D-01、D-02 的接受 | 03 | 须负责人本人做。本波出口是「已请求」，不是「已接受」（方案 §3） |
| 偏离表第 2 行的退出条件写「契约 S5、S8」，方案 W4-1 写「契约 S5 补两句」。`closeAll` 的 `AggregateError` 落在 S5 还是 S8 由闭包规格按契约现有结构定 | 01 | 不是缺口：两处都在契约成员内，可加改动，闭包规格自定并写理由 |

## Out of Scope

- 方案 §2.4 停放清单的全部项：6a 清单容错、契约 C1 未封闭项、`TaskRef` 带对端账号、`TaskControl` 加 `signal` 等形状美化、0.1.0 公开形状项、探索器抽包、profiling。
- `Connections` 的服务键（决定 2；重开条件：有消费者要按服务键释放连接）。
- `EndpointInspection` 的服务键（决定 2）。
- 应用插件树；真实端口提供者；与消费者联调（M2 之后）。
- 资产类别注册表的装配代码，它归装配拥有者。
- 传输级的单调信号（见「原则与约束」，重开条件已写）。

## Further Notes

- 第 12 条的变体清点可能发现模板缺口。缺口归模板拥有者，按波包 §3.4 的停止条件交回，不在本波改模板。
- W4-1 删掉按原因的判断后，W3 的 MC-16、MC-17 第 4 步的变异表要跟着更新：判据换了，旧变异不再适用。
- 偏离表第 1、2 行原来的退出条件是「波末小卡 K7」。W3 接手计划第 257 行把 S5 两句并入 W4-1（[takeover-plan.md](../../w3/takeover-plan.md)），所以本卡删这两行，K7 不再承担它们。
- 波包 §3.4 的停止条件适用：模板生成的成员 `scan` 不是 pass 且原因在模板；依赖方向规则拒绝新边；新性质在正控上报违例且原因不在本波改动。
