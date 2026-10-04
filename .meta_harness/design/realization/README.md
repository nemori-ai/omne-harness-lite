# 实现映射

2026-09-27：[D085](../record/decisions/session-log-recovery-projection-adoption/decision.md)采用[SL3恢复识别增补rev2](packages/session/session-log-jsonl/v3-recovery-design.md)。补可靠active／clean标记和可信物理退出输入；真实观察、FS和调用者迁移仍未验收，bindings0，不提升日志或runtime交付状态。

2026-09-27：model/pi-ai-transport revision7公共完整定义增量已[有限实施签收](../record/evidence/2026-09-27-tests-model-request-runtime-definitions/README.md)，旧默认删除，HUB175／6、独立制品／文档／真实排空及8行为负控保全；两model节点当前层次沿各自入口。不是完整P2、耐久十三操作或37模型认证。

这里保存契约由谁兑现：插件提供者的设计、应用装配的选择，以及把承诺绑到实际证据上的绑定表。

失效事件：实现换方案。需求没变、契约没变，但换了一个库、改了一处装配、
或上游语义变了导致原来的兑现方式不再成立——变化落在这里。

## 为什么提供者与装配在一起

把它们分成两个目录是很自然的想法，但两份入口的章节会逐条对应：新建或接续主题、
准入门槛与停止条件、当前主题，连停止条件的句式都一样。差别只有一处——
提供者回答「这个契约由哪个插件兑现」，装配回答「这个应用选了哪些提供者」。

这是同一种节点的两个 `kind`，不是两类知识。分开维护的代价是每条跨两者的动作链
都要在两个目录之间对照阅读，而动作链恰恰是最需要一眼看全的东西。

```text
realization/
├── .templates/node/
│   ├── README.md          节点入口与状态
│   ├── architecture.md    应用的形状：拓扑、进程、交互面、分层、技术栈、分发——只有 assembly 节点有
│   ├── design.md          实现路径、投影、依赖与装卸责任、Cordis 符合性核对
│   ├── bindings.yaml      条款到证据的绑定表
│   └── verification.md    符合性或集成证据的可变入口
├── packages/
│   ├── core/<node>/       核心与共享：数据契约、协议级构造、被多个领域消费的纯模块，kind: provider
│   ├── util/<node>/       用户明确选定的技术格式化件（D-046），不拥有领域事实
│   └── <domain>/<node>/   按领域或限界上下文聚合的能力提供者，kind: provider
└── apps/<node>/           应用装配节点，kind: assembly
```

`packages/` 与 `apps/` 对应实际源码归属，不是又一层分类。节点名与它实现的包或应用同名，
使「读设计」和「读源码」用同一个词。

**Cordis 符合性核对表**（2026-10-01 起）：Cordis 是装配时要满足的契约规范，新写或修订的节点在 `design.md` 里按模板逐行填这张表——
插件边界、服务声明、注入、装卸成对、在途工作、事件派发、内核不给的保证由谁兑现、作用域与可见性、上游语义的出处、机制没有回写契约、接缝角色、事件命名、配置，装配节点另有插件树。
各行由 [Cordis 集成约定](cordis-integration-conventions.md)导出：本项目做出来的东西怎样接进 Cordis，规则与编号（`IC-`）的权威在那份约定。它只核节点对 Cordis 的符合性，
不把机制写回契约。2026-10-01 之前接受的节点没有这张表，**不回填**；它们下次修订时补上。

2026-09-28，原 `apps/model-request-acceptance` 的实现已迁到开发示例 `examples/model-invocation-minimal-demo`；同名产品 app 不再是当前交付节点。D-076、D-092 所采用的原技术投影移至[退出现行映射的历史节点](retired/model-request-acceptance/README.md)，保留原路径与 SHA 的采用时证据。现行 `apps/` 目录仅列产品应用；历史设计里仍出现的旧装配 owner 是当时读数，不表示现有示例已经承接完整十三操作、37 模型认证或相关生产责任。后续完整纵线必须逐个重新落实这些未承接责任。

## packages 的两层布局

**这里的目录结构直接指导承载仓库根下 `packages/` 的目录结构**：节点路径 `packages/<group>/<node>` 就是将来源码包的路径，
两边逐字相同，承载仓库 `docs/workspace.md` 那条「`packages/<能力族>/<职责包>/` 两层、第一层不是 workspace 成员」的规则在这里落成具体的第一层取值。

| 第一层                                                                                                                | 放什么                                                                                                                                  | 判据                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core/`                                                                                                               | **核心、共享、契约或底层协议相关**：`data.*` 数据契约的纯模块、跨领域复用的构造（身份值、交接凭证、过期判定、时间源形状）、内核层复用件；**能力契约的 Cordis 服务定义**（每份以服务被消费的能力契约一个定义包，[Cordis 集成约定](cordis-integration-conventions.md) IC-1） | 它没有自己的领域事实，**被两个以上领域消费**，或它兑现的是一份 `data.*` 契约，或它是一份能力契约的服务定义（负责人 2026-10-02：服务定义全部放 `core`） |
| `<domain>/`                                                                                                           | **按领域或限界上下文聚合**的能力与组合提供者                                                                                            | 它拥有该领域的事实或动作链；一个节点只属于一个领域。领域名由产品负责人拍板——租户领域是 `tenancy`（[D-024](../record/decisions/tenancy-domain-name/README.md)），新领域在拍板前标候选 |
| `infra/`（组名由 [D-027](../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板，2026-09-23） | **基础设施提供者**：兑现 `core/` 里某个协议级构造的具体实现（SQL 存储、时钟），或据点／中心的**窄口基础设施契约**（密钥保管、进程起停、连接探测）的最小提供者，被装配层选用                                             | 它没有领域事实，也不定义协议，只兑现一个协议；选型受 [D-026](../record/decisions/infrastructure-persistence-choices/README.md) 约束（不提供 in-memory 实现）。协议本身留在 `core/`   |

`util/` 由用户2026-09-26明确追加；[D-046](../record/decisions/core-formatter-adoption/decision.md)限定为无领域事实的[unix-format](packages/util/unix-format/README.md)、[xml-format](packages/util/xml-format/README.md)两格式化技术件。不是新限界上下文，也不把core扩成公共工具箱；本程timeout/brand不迁入。

**怎么判一个节点归 `core` 还是某个领域**：问它兑现的契约是 `data.*` 还是 `capability.*`／`composition.*`——前者几乎总在 `core`；
后者按契约拥有的事实归领域——但它的 Cordis 服务定义（服务键、`Service` 类、词汇类型）不跟着提供者走，一律在 `core` 的定义包里，提供者节点只写实现。拿不准的先按领域放，**被第二个领域消费的那天再搬进 `core`**，搬动是「实现换方案」，记 changelog 即可，不改契约。
`core` 不是「公共工具箱」：一个只被一个领域用的辅助模块不因为「看起来通用」进 `core`。

节点的相对链接因此多一层：`packages/<group>/<node>/` 下指向 `spec/`、`product/`、`record/` 的链接是 `../../../../`，
`apps/<node>/` 下仍是 `../../../`；模板里的链接按 `apps/` 深度写，建 provider 节点时要多加一层。

## 应用节点比提供者节点多什么

一个应用除了「选了哪些提供者、动作链怎么接」，还有一件只属于它的事：**它是什么形状**——
起哪些进程、与别的应用之间有哪些边、人和脚本各从哪个面进来、装配哪些包家族、采用了什么技术栈、怎么分发。
这些事实的失效事件同样是「实现换方案」，所以家在这里，落在 assembly 节点的 `architecture.md`。

它每一节都是「引用 + 本应用的选择」：交付面为什么这样归产品设计的 PF，边上的保证归契约，
候选比较归 proposals，采用理由归 decisions。**删掉这份文件，设计链丢失的只有「这个应用选了什么形状」这一件事**——
多于此的内容都放错了地方。

**拓扑总图不手写。**每个节点只写自己的进程与自己那一侧的边，「整个系统有哪些应用、怎么连」
由 [views/system-map](../views/README.md) 从各节点 join 出来。

**应用节点可以早于源码存在。**「设计好但还没开建」和「想象中的应用」的分界不是有没有源码，
而是**产品设计有没有为这个交付面开题**：有 PF 就能建节点，状态 `candidate`，四层状态里
可实施范围、绑定、实际验证各自写实现缺口与 owner；PF 仍是 draft 时节点不得登记任何绑定。
没有 PF 的应用不建节点。

## bindings.yaml

这是唯一能回答「设计承诺有没有实现证据」的地方。

```yaml
version: 1
node: local-harness
kind: assembly
bindings:
  - clause: 'capability.live-agent/v1#S-7'
    basis:
      - async-control-not-bail
    evidence: 'formal:live-agent-v1-progress'
    assumptions:
      - 'Failures = FALSE：该进展性质只在无失败路径上检查'
    alignment_checked: 2026-09-16
```

| 字段                | 必填 | 含义                                                            |
| ------------------- | ---- | --------------------------------------------------------------- |
| `clause`            | 是   | 精确契约坐标加条款号                                            |
| `basis`             | 否   | 该绑定依赖的[机制语义条目](../basis/README.md)                  |
| `evidence`          | 是   | `test:<id>` 或 `formal:<task-id>`；后者指向 registry 的形式任务 |
| `assumptions`       | 是   | 该证据成立的前提；无前提写空列表，不省略字段                    |
| `alignment_checked` | 是   | 最后一次对着所引 basis 条目核对的日期                           |

**`assumptions` 必填，因为多数生命周期与进展性质的证据都是有前提的。**
省掉它，一条「在无失败路径上成立」的检查会被读成无条件保证；
写出来，前提失效时责任方是明确的。

**两种证据形式都拿不出时，不新增一个「无法验证」的状态。** 那是把缺证据登记成已处理，
属于可解释的假成功。正确做法是退回把性质改写成有界形式；真退不回去，
由需求方裁决改写还是撤销。

### 装配声明：`assembly` 与 `composition`

`bindings.yaml` 另有两个顶层键，写**这个节点在装配上打算怎样接进 Cordis**——意图对实现对照的「意图」那一侧，
供检查器与开发工具机读。它们照节点正文写，**不从代码抄**；规则本身归 [Cordis 集成约定](cordis-integration-conventions.md)。

```yaml
# 示意：三段分别出自定义包、提供者、装配节点，合在一处只为看全字段
assembly:                      # 本节点的 Cordis 插件与服务定义
  defines:                     # 只有 core 里的定义包写：本包定义了哪些服务键
    - key: sessionLog
      contract: capability.session-log      # 只写 contract_id，不写版本
      source: design.md#插件边界与服务面
  plugins:
    - name: session-tenancy-table           # 插件名，即 fiber 名
      source: design.md#插件边界与服务面     # 指回正文里给出这条意图的小节
      provides: [sessionTenancy]            # 提供的服务键
      injects: [storage]                    # 必需依赖（写进 inject 的）
      optional: []                          # 调用时取用的可选依赖
      emits: []                             # 发的事件：{ event: <名>, mode: emit|parallel|serial|bail|waterfall }
      listens: []                           # 监听的事件名
      contributes: []                       # 向哪些注册表服务登记（写注册表的服务键）
  importExceptions: []                       # IC-5 的同提交例外，缺省为空；条目形状见下表
composition:                   # 只有装配节点写：Cordis 插件树挂哪些插件
  plugins:
    - id: storage                           # 插件树的行 id
      node: packages/infra/storage-sql      # 提供这个插件的节点
      plugin: storage-sql                   # 那个节点 assembly.plugins 里的名字
      layer: distribution                   # distribution（发行层）或 operator（运维者层）
      source: design.md#选择与动作链
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `assembly.plugins[].name`、`source` | 是 | 插件名与它在正文里的出处；其余列表缺省为空 |
| `assembly.defines[]` | 定义包才有 | 每项 `key`、`source`，外加 `contract`（契约 ID）或 `owner`（接缝出自协议形状、没有契约时，写拥有它的节点路径，如 `packages/core/storage`），二者恰有其一，与代码里的 `@contract`／`@owner` 对应（IC-3） |
| `assembly.importExceptions[]` | 有 IC-5 例外时 | 每项 `target`（导入目标的节点路径，如 `packages/tenancy/account-identity`）、`symbols`（导出的事务内读函数名列表）、`sharedStorage`（两个写入者共同触碰的存储对象名称）、`source`（本节点说明同提交责任的小节） |
| `emits[].mode` | 是 | 五种派发之一，与代码里该事件 JSDoc 的 `@mode` 一致（IC-11） |
| `composition.plugins[]` | 装配节点才有 | 每项 `id`、`node`、`plugin`、`layer`、`source` |

- **`source` 是硬的**：`<节点内文件>.md#<锚点>`，文件与锚点都要在。字段与正文冲突时**以字段为准**，正文改成只写理由。
- **契约不另记**：本节点兑现哪些契约，从 `bindings` 的条款坐标推出；`defines` 里只写 `contract_id`。
- **实施者不改它来消红**：对照报出的偏离由实施者交代；改这里是改设计，过设计评审（负责人 2026-10-02）。
- **导入例外精确到符号**：`importExceptions` 只表达 IC-5 已允许的事务内读函数，`symbols` 非空、不能用 `*` 放行整个成员；同一目标的同一符号不重复。`sharedStorage` 必须在 `source` 所指正文里解释两个写入者如何共同触碰它；这里只点名，不另定义存储语义。源码对照只放行点名的导出符号，别的导入照常报告。检查器核目标节点存在、名称与出处完整，**不能证明它确实是事务内读函数或共享同一提交**，这两件事仍需设计评审。
- **加这两个键算修订绑定**：碰到的节点同时按 [D-113](../record/decisions/spec-single-revision/README.md) 的过渡规矩把旧版条款行改绑到最新版（负责人 2026-10-02：「算」，记在 [D-114](../record/decisions/cordis-integration-conventions/decision.md#一裁定原话)）。
- **过渡**：节点全过完成之前，这两个键可以缺——检查器不判失败，对照工具把那个节点报成「未声明」；全过的最后一批把有包节点的 `assembly` 翻成必填。
- **检查器核什么**：顶层键只认 `version`、`node`、`kind`、`bindings`、`assembly`、`composition`；派发模式只认五种；同节点服务键不重复；`source` 锚点存在；装配节点挂的插件在被引用节点的 `assembly.plugins` 里——被引用节点还没声明时只提示。**它不核声明与代码是否一致**，那归开发工具。

### 两条可以机器判的检查

- **事件派发一致**：绑定声明了异步控制语义，而源码里用的是 `ctx.bail(`，直接失败。
  这类错误静态可查，而它造成的后果是**静默**的——授权检查返回 Promise，
  不被判为 bail 值，于是悄悄放行。
- **绑定复核过期**：`alignment_checked` 早于所引 basis 条目的 `checked`，
  该绑定进入待复核。这是上游变动传播到设计的唯一通路。

## 准入门槛与停止条件

- provider 节点必须给出精确能力契约、Cordis 插件边界、服务/贡献、依赖、资源、装卸责任、源码修订与符合性状态。
- assembly 节点必须定位它对应的产品交付面（PF 与 rev）、所选提供者和版本、配置/作用域、消费关系、完整动作链及真实集成证据或明确缺口，
  并在 `architecture.md` 给出拓扑与进程模型、交互面、包分层、技术栈采用与分发。
  **建立条件是该交付面已有 PF**；源码尚不存在时状态为 `candidate`，缺什么写什么。没有 PF 不建节点。
- 只有机制候选时回 [proposals](../record/proposals/README.md)；源码或提供者不存在时如实记录实现缺口，
  不从文件名、接口形状或 mock 推断已兑现。
- 应用节点不持有能力语义：边上的保证一律指向契约，命令的产品含义一律指向 PF；节点里出现第二份定义就是错。
- 选择未发生时保持候选；整体保证缺少独立协调责任时回到能力分解，不能让装配胶水暗中拥有未定义能力。

命名、裁剪与跨目录引用遵循[信息包约定](../README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。

## 当前主题

2026-09-17 建在旧候选契约上的三个 provider 节点已随那批契约于 2026-09-22 整体废弃，原件只在 Git 历史里。

**provider 节点（2026-09-22 首稿，2026-09-23 修订；十一个都已实现，源码修订 HUB `c9b5850`）**——租户领域五份契约的提供者设计，以及它们共用的基础设施节点。
六个节点的**设计**已由 [D-023](../record/decisions/tenant-domain-design-acceptance/README.md) 接受为各契约的实现路径（2026-09-22），
governance-center-entry 的设计由 [D-028](../record/decisions/governance-center-design-acceptance/README.md) 接受（2026-09-23）；所兑现的契约同批 `accepted`。节点状态 `implemented`：各自在源码修订 HUB `c9b5850` 上声称兑现，全部包测试在运行 `2026-09-23-tests-tenancy-leg-2`（证据登记在 [`record/evidence/2026-09-23-tests-tenancy-leg-2/`](../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md)，HUB）里于 sqlite 下通过，逐条覆盖待各节点 verification 回填：

| 节点                                                                                             | 兑现的契约                                                                              | 形态                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/core/identity-values`](packages/core/identity-values/README.md)                       | `data.identity-values` v1                                                               | 纯模块：身份值类型、Schema 校验、交接凭证签发／核实原语（选签名方案）                                                                                                                                                                                 |
| [`packages/core/offer-expiry`](packages/core/offer-expiry/README.md)                             | `data.offer-expiry` v1                                                                  | 纯模块：`OfferTiming`、派生状态纯求值、`Clock` 形状；`now` 不后退由 `infra/clock` 兑现                                                                                                                                                                |
| [`packages/tenancy/account-identity`](packages/tenancy/account-identity/README.md)               | `capability.account-identity` v1（accepted，D-023）与 v2（accepted，D-028，2026-09-23） | 插件，两个服务面；提供 S-15，`credentials` 作可选依赖调用时解析；留存期限在产生时定死。**v2 段**：出示物（32 字节随机、base64url）与 `LoginStateId = SHA-256(出示物)` 分离、`logins.exchange`、参数按是否指认调用方分品牌类型与 `unknown`；按 v2 实现 |
| [`packages/tenancy/credential-verification`](packages/tenancy/credential-verification/README.md) | 同上契约的凭据形式那一半                                                                | 插件，可整体替换；本版只有密码方案                                                                                                                                                                                                                    |
| [`packages/tenancy/organization-governance`](packages/tenancy/organization-governance/README.md) | `capability.organization-governance` v1                                                 | 插件，四个服务面（S-53 单列一个只给清除链）；跨 owner「同一提交」靠账号行上的过期事实加组织行对账号行的引用约束，无进程内锁。**2026-09-25 按 v2（accepted）修订、尚未实现**：两个时刻、v2 读面另起服务名、存量记录不补时刻、给资产提供者的事务内读入口与三项外部依赖 |
| [`packages/tenancy/account-registration`](packages/tenancy/account-registration/README.md)       | `composition.account-registration` v1                                                   | 薄插件，无事实；两条动作链，签发激活依据；清扫提供者因缺枚举读面本版建不起来                                                                                                                                                                          |
| [`packages/tenancy/governance-center-entry`](packages/tenancy/governance-center-entry/README.md) | `composition.governance-center-entry` v1（accepted，D-028）                             | 2026-09-23 首稿：两个插件都不 provide、同起同停——入口层（封闭路由表、判定次序、读或铸中心标识、路由上不提交）与运维面（本机套接字上只答完整体检）；认领契约 G-10（传输绑定）、G-11（防冒充）                                                          |
| [`packages/core/kernel-basis`](packages/core/kernel-basis/README.md)                             | 无契约条款（D-025、basis 准入）                                                         | 纯模块：Cordis 4.0.4 的 13 条 probe、`definePlugin`／`Outcome`／`FIBER_STATE`、测试装配 `bootAssembly`                                                                                                                                                 |
| [`packages/core/storage`](packages/core/storage/README.md)                                       | 无契约条款（AI R-1～R-7／OG R-1～R-6 的规格化）                                         | 纯模块：存储协议（一次读／写事务、显式锁、四型失败）与一致性套件                                                                                                                                                                                      |
| [`packages/infra/storage-sql`](packages/infra/storage-sql/README.md)                             | 无契约条款（D-026）                                                                     | 插件 `storage-sql`：Kysely 提供者，sqlite（`node:sqlite`）／pg 由配置切换，迁移运行器。**2026-09-23 修订**：升级整体性（显式 `upgrade` 守卫、属主独占锁、只读核对、快照与恢复、守卫对象 `createUpgradeGuard()` 的 `confirm()`／`pending()`）          |
| [`packages/infra/clock`](packages/infra/clock/README.md)                                         | offer-expiry S-16 形状／S-17「`now` 不后退」的承接                                      | 插件 `clock`：写在前的租约。**2026-09-23 修订**：`now()` 每次现读墙钟并与最晚已用时刻比对（运行中回拨与启动窗口同一规则）、`clockPreflight` 导出                                                                                                      |

`tenancy` 是租户领域这个限界上下文的名字，产品负责人 2026-09-22 拍板（[D-024](../record/decisions/tenancy-domain-name/README.md)）。六个节点共用的上游主张（可选 inject、`ctx.provide` 纳管、插件体抛出后的 fiber 状态）已由 [basis](../basis/README.md) 条目或 kernel-basis 的 probe 在 4.0.4 上取证；对存储提供者的要求清单各记在节点里。

**2026-09-25 资产领域（`assets`，[D-059](../record/decisions/assets-runtimes-split-and-rulings/README.md) 拍板）**——节点状态 `accepted`，所兑现的契约 `accepted`、已由 [D-061](../record/decisions/assets-runtimes-contract-acceptance/README.md)，**尚未建包**：

| 节点 | 兑现的契约 | 形态 |
| --- | --- | --- |
| [`packages/assets/asset-governance`](packages/assets/asset-governance/README.md) | `capability.asset-governance` v2、`capability.asset-transfer` v2 | 中心一个插件、一条 fiber、四个服务面（资产、持有、流转、快照；快照面无契约条款）；由 `apps/tenancy-host` 装配、据点不 import；跨 owner「同一提交」落在组织治理的隶属哨兵、组织行与它导出的事务内读函数上 |
| [`packages/assets/assembly-manifest-store`](packages/assets/assembly-manifest-store/README.md) | `capability.assembly-manifest` v2（接口契约，最小提供者） | 一个插件，inject `storage`；两张表；条件追加在一次写事务里完成（按会话哨兵加 (session, seq) 主键）；`dependencyPresence` 的事实经配置 `presenceSource` 交进（产品装配无来源，G-2） |

**2026-09-25 工具领域（`tools`，[D-059](../record/decisions/assets-runtimes-split-and-rulings/README.md) 拍板，取候选 C）**——节点状态 `accepted`，所兑现的契约 `accepted`、已由 D-061 接受，**尚未建包**。`capability.tool-admission` v2 本批无提供者（runner 以全拒件顶上）：

| 节点 | 兑现的契约 | 形态 |
| --- | --- | --- |
| [`packages/tools/tool-execution-runtime`](packages/tools/tool-execution-runtime/README.md) | `capability.tool-execution-runtime` v2 | 一个插件、一条 fiber，只 inject 存储与时钟；执行是一个 effect 持有的活体表项（不开子 fiber）；同会话写由存储哨兵序列化；送达走发件箱、共同对象是会话日志的幂等键（提供者尚无）；9 条形式绑定（契约模型） |
| [`packages/tools/asset-registry`](packages/tools/asset-registry/README.md) | `capability.asset-registry` v2 | 一个插件，必需 inject 装配清单与时钟、不 inject 存储；求值纯 import；缓存每次对清单头校验、换表靠清单条件追加定序；装配清单无提供者，本批整体 `PENDING` |
| [`packages/tools/mcp-bridge`](packages/tools/mcp-bridge/README.md) | `capability.mcp-bridge` v2 | 官方 SDK 上的薄桥（D-037）：桥本体（inject 存储、时钟，连接表在一个 effect 里）＋ 零状态的执行者贡献插件；OAuth 完成的「同一提交」落在绑定行状态列与保管方凭据行的引用约束上（保管方尚无节点） |

**2026-09-25 本程的 `core` 纯模块**（都不是插件；数据契约一契约一包，包依赖与 catalog 的契约依赖同构、无环——[D-060 §八 M41](../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）——十三个数据契约节点与两个纯计算节点，节点状态 `accepted`，所兑现的契约 `accepted`、已由 [D-061](../record/decisions/assets-runtimes-contract-acceptance/README.md) 接受；源码都**尚未建包**：

| 节点 | 兑现的契约 | 形态 |
| --- | --- | --- |
| [`packages/core/content-blocks`](packages/core/content-blocks/README.md) | `data.content-blocks` v2 | 纯模块：块的形状与表示层校验、此刻模型可读；严格无损 JSON 读写（M36，全批共用；运行时前提 Node ≥ 24.18.0 已取证，M49） |
| [`packages/core/messages`](packages/core/messages/README.md) | `data.messages` v2 | 纯模块：消息的形状与校验、合法名单；`MessageId` 的铸号方未定（下一程） |
| [`packages/core/call-accounts`](packages/core/call-accounts/README.md) | `data.call-accounts` v2 | 纯模块：账的形状、有效费用与汇总；金额精确十进制 |
| [`packages/core/arrival-events`](packages/core/arrival-events/README.md) | `data.arrival-events` v2 | 纯模块：到达事件的形状与表示层校验（借开块查询）、填的归约 |
| [`packages/core/asset-model`](packages/core/asset-model/README.md) | `data.asset-model` v2 | 纯模块：资产形状、名字词法与规范串、表示层校验（正文判定经按类别判别的端口注入，不 import 正文包）、工作区提供的资产的记录号导法 |
| [`packages/core/tool-definition`](packages/core/tool-definition/README.md) | `data.tool-definition` v2 | 纯模块：工具定义与返回值、模型面条目与名字转写、参数判定（ajv；`format` 只作注解、`schema_unsupported`，M37）；为契约 G-16 登记上限候选值（`pattern` 先不带 `u` 再带 `u` 试编 M56、`pattern` ≤ 1024 码点、三种回溯形态、判定时限 500 ms）；编译产物归消费者持有的判定对象，不设模块级缓存（M50） |
| [`packages/core/loop-extension`](packages/core/loop-extension/README.md) | `data.loop-extension` v2 | 纯模块：位置、干预力、结论的形状与两张合法组合表、推出规则；执行环境句柄只定形状（M38，解析归 runner） |
| [`packages/core/skill-package`](packages/core/skill-package/README.md) | `data.skill-package` v2 | 纯模块：技能包形状、`SKILL.md` 读法（YAML 1.2）、目录形式读法的纯半 |
| [`packages/core/slash-command`](packages/core/slash-command/README.md) | `data.slash-command` v2 | 纯模块：命令定义、识别与解析（按码点）、两种展开 |
| [`packages/core/mcp-endpoint`](packages/core/mcp-endpoint/README.md) | `data.mcp-endpoint` v2 | 纯模块：接入点正文、动作清单副本两支、条目名拼法、登记时收窄、推出规则 |
| [`packages/core/connector`](packages/core/connector/README.md) | `data.connector` v2 | 纯模块：连接件正文与入站信封（不带归属）；推出规则本版返回「推不出」（契约 G-4） |
| [`packages/core/model-profile`](packages/core/model-profile/README.md) | `data.model-profile` v2 | 纯模块：档案、引用的精确匹配、参数词表与表示层校验 |
| [`packages/core/model-response`](packages/core/model-response/README.md) | `data.model-response` v2 | 纯模块：响应体的形状与表示层校验；`ResponseId` 等副本定义的对齐测试（依赖方一侧） |
| [`packages/core/asset-evaluation`](packages/core/asset-evaluation/README.md) | `capability.asset-evaluation` v2 | 纯计算：四步求值（组合根引用集 M31；三个失败值 `invalidInput` → `compositionCycle` → `categoryUnsupported`，M32、M45）与清单读入；另导出 S-23 界与挑选供资产治理写时守卫，与 `BodyContracts` 的唯一组合根 `defaultBodyContracts`（M51） |
| [`packages/core/stream-assembly`](packages/core/stream-assembly/README.md) | `capability.stream-assembly` v2 | 纯计算的装配状态机（状态是持久结构的值），模型请求运行时与工具执行运行时两个宿主 import；绑定 2 条（formal task，证的是模型；有效性前提的三份变异配置反例已入证据库，M54） |

**2026-09-25 模型领域（`model`，[D-059](../record/decisions/assets-runtimes-split-and-rulings/README.md) 拍板，取 P1-A／P2-A／P3-A）**——节点状态 `accepted`，所兑现的契约 `accepted`、已由 D-061 接受，**尚未建包**。会话日志、装配清单读面、凭据保管方三处上游没有提供者：

| 节点 | 兑现的契约 | 形态 |
| --- | --- | --- |
| [`packages/model/model-profile-directory`](packages/model/model-profile-directory/README.md) | `capability.model-profile-directory` v2 | 中心插件 P-1（三个服务键，取值问法单列），inject 存储、时钟、成员关系；另有只读副本插件 P-1r（租户那一把的据点副本经凭据保管方落地，M47），待未来资产/据点入口（版本未分配） 与保管方 |
| [`packages/model/model-request-runtime`](packages/model/model-request-runtime/README.md) | `capability.model-request-runtime` v2 | 插件 P-2（inject 目录读面、凭据问法、会话日志、存储、时钟；在途表与连接池一个 effect；发起租户经会话持有租户读面）＋ 自带重试挂件 P-5（候选默认退避，M67）；传输按 D-019 fork；绑定 6 条（formal task） |
| [`packages/model/modality-projection`](packages/model/modality-projection/README.md) | `capability.modality-projection` v2 | 纯计算＋转换器登记插件 P-3（不 inject 任何服务）、声明插件、各转换器插件 P-4*、系统自带转换件的零状态贡献者插件；不 inject 存储；模态转换这一件经执行环境句柄取 `tenant`，来路待 runner 契约 G-20 |
| [`packages/model/pi-ai-transport`](packages/model/pi-ai-transport/README.md) | `capability.model-request-runtime` v2 的传输适配一层（S-38 十一条；[D-063 R-5](../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)） | pi 1.0.0（`a13d35a`，2026-10-02 自 0.86.1 改锚）传输一层的定向 fork，`node:https` 直发；公开函数面 `planRequest`／`sendRequest`／`readStream`／`createPiAiTransport`；插件登记 `modelTransport`（P-2 必需 inject，验收装配以脚本化传输登记同键）；无存储、不 inject；绑定 0 条；D-019 比较门未过 |

**2026-09-25 会话领域（`session`，领域名已由产品负责人接受，见 [D-064 ⑱](../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md)）**——最小提供者节点（[D-063 R-1](../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)：验收装配的替身改「接口契约 + 最小提供者」），节点设计状态 `accepted`，所兑现的接口契约 `accepted`，**尚未建包**；真提供者归 loop／会话那一程，出契约新版本时在此接续。

| 节点 | 兑现的契约 | 形态 |
| --- | --- | --- |
| [`packages/session/session-log-jsonl`](packages/session/session-log-jsonl/README.md) | `capability.session-log` v2 | 一个插件，不 inject 任何服务；文件系统 JSONL，一行一批，每批 `fdatasync`；属主文件锁、每本日志一条队列、由盘上折叠的判定态、可重建的派生索引 |
| [`packages/session/session-tenancy-table`](packages/session/session-tenancy-table/README.md) | `capability.session-tenancy` v2 | 一个插件，inject `storage`；一张表、一个读；种子在 `./seed`，只供验收 |
| [`packages/session/run-attempt-facts-derived`](packages/session/run-attempt-facts-derived/README.md) | `capability.run-attempt-facts` v2 | 一个插件，inject `sessionLog`；不存表，按水位追读、折叠缓存；「已终结」要靠验收装配交进的认法 `runEndRecognizer`，产品装配恒 `unavailable`（G-3） |

**2026-09-25 最小提供者（`infra`，同一批）**——同上状态。

| 节点 | 兑现的契约 | 形态 |
| --- | --- | --- |
| [`packages/infra/credential-custodian-local`](packages/infra/credential-custodian-local/README.md) | `capability.credential-custodian` v2 | 一个插件，必需 inject `storage`、`clock`；副本条目与 OAuth 条目以密文落在绑定所在的同一 `storage`（两张表），本机只放一个密钥文件；OAuth 条目对桥的绑定行立引用约束，清扫锁同一行；读绑定行待桥导出事务内读函数（CCL-1） |
| [`packages/infra/execution-environments-host`](packages/infra/execution-environments-host/README.md) | `capability.execution-environments` v2 | 一个插件，不 inject；本机 POSIX 进程组起停、有界答复；落点读数调用时现取可选读面（无契约，验收装配由种子件给）；hooks 宿主机落点已获 D-064 ⑭ 允许；允许读面未接入时 fail-closed；进程表只在内存，撤除即按组停 |
| [`packages/infra/center-connection-probe`](packages/infra/center-connection-probe/README.md) | `capability.center-connection` v2 | 一个包两个插件：probe 是产品装法（对入口发公开体检），replay 是验收装法（回放对端行为）；同一服务键、同一归约，必需 inject `clock`；不设判定阈值（CNP-1） |

**2026-09-25 loop 侧（`agent-loop`，D-059 拍板）**——节点状态 `accepted`，所兑现的契约 `accepted`、已由 D-061 接受，**尚未建包**；runner 的行为模型未建（契约 G-14），两个节点都没有绑定：

| 节点 | 兑现的契约 | 形态 |
| --- | --- | --- |
| [`packages/agent-loop/loop-extension-runner`](packages/agent-loop/loop-extension-runner/README.md) | `capability.loop-extension-runner` v2 | 一个插件，只 inject 会话日志；实现经贡献者登记在场，runner 从不 inject 贡献者；执行环境句柄每次调用一只、按会话解析；叫停即 `cancelled`、不等在途那一件；本实例被撤除时在途 `dispatch` 以 `unavailable` 收场、不落记录（M63）；放行判断经 `toolAdmission`（本批全拒） |
| [`packages/agent-loop/hooks-import`](packages/agent-loop/hooks-import/README.md) | `capability.hooks-import` v2 | 导入是包导出的纯函数；兼容插件向 runner 登记一个命令执行器；D-033 fork 边界；子进程的执行环境经句柄取，最小执行环境节点已立；hooks 宿主机落点已获 D-064 ⑭ 允许，允许读面、工作目录与变量名单仍待接线 |

## 当前状态

存量节点尚未从 `design_legacy/providers/` 与 `design_legacy/assemblies/` 迁入。

**assembly 节点**：`apps/cli/` 是第一个应用节点，随 CLI-TUI 交付面的 PF 一起建立（2026-09-22），状态 `accepted`——
源码尚未落地，`bindings.yaml` 为空表。治理中心那一侧的 PF-017 rev 2（rev 1 于 2026-09-23 接受），入口层与运维面落在
[`packages/tenancy/governance-center-entry`](packages/tenancy/governance-center-entry/README.md)（`implemented`），由 `apps/tenancy-host` 装配；`apps/cli` 两条跨应用边的对端已指向它们。
**2026-09-25 修订（设计已接受）**：按 [D-059](../record/decisions/assets-runtimes-split-and-rulings/README.md) 把工具运行时与模型请求运行时归本应用装配——据点装配 core 纯模块、`tools`／`agent-loop`／`model` 三个领域的八个提供者与 P-1r 读提供者，`architecture.md` 的进程、边、包家族随之更新；「可独立运行」以只供测试的装配变体体现；C-1～C-12 是本装配今天装不起来的缺口，owner 与闭合条件在节点 design.md，多数留待下一程（D-060 §八 M43）。
[`apps/tenancy-host/`](apps/tenancy-host/README.md)（名字由 [D-027](../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板）是租户领域的采用型装配节点（2026-09-22），状态 `assembled`（源码修订 HUB `c9b5850`）：
存储（迁移合成与真实外键）、时钟与密钥；2026-09-23 随 PF-017 与入口契约补入口层与运维面的装配、升级整体性（迁移前只读核对、快照与确认），设计随 D-028 接受；
本节点测试在运行 `2026-09-23-tests-tenancy-leg-2` 里通过（sqlite 下全过，pg 16 上 pg 用例 11／11），逐条覆盖与绑定待 verification 回填。
**2026-09-25 修订（设计已接受，尚未实现）**：再装资产提供者与模型档案目录的中心插件 P-1、组织治理按 v3 采用；迁移末尾追加三组片段，官方件与官方档案清单随应用发布、启动时交进插件；中心各面本版对外不可达（未来资产/据点入口（版本未分配） 未出）。`apps/cli` 的绑定仍为 0：客户端代理与源码都不存在。

判断方法按需读 `harness-design-handbook` skill 的「插件投影」。
返回[设计链入口](../README.md)。

## 2026-09-24 客户端独立增量

[`packages/frontend/governance-center-client`](packages/frontend/governance-center-client/README.md) 为仅公开health的客户端传输节点，消费已接受 EC1/HT1/D029，D-038限定采用；首个受限增量已实现，实际证据见节点。它不接受本地登录存储或生产治理路由，不要求启动Agent据点。

## 2026-09-25治理客户端提供者接续

D045扩展[协议客户端](packages/frontend/governance-center-client/README.md)消费EC2/HT2；D046采用[本地状态](packages/frontend/client-local-state/README.md)CLS1；D047采用[共享治理用例](packages/frontend/governance-client-operations/README.md)CG1。三节点已有各自具名验证，不表示apps/cli或完整终端交付已完成。上方2026-09-22～24状态保留其日期背景，当前分层事实从具体节点读。

2026-09-25 D048/49接续：CG2交互输入已有139项及两平台组合证据；apps/cli的受保护文件路径已建源码，真实CLI/PTY/管道正在取证。TTY/交互密码/TUI未实现，不能沿旧“无客户端源码”状态或新CLI目录推断全部交付。


2026-09-26 D055/D056：在线维护、离线校验/隔离恢复、资源真实结束与host服务模板已实施；[本轮固定制品与独立QA](../record/evidence/2026-09-26-tests-governance-maintenance/README.md)给出源码1908通过/34跳过的合并范围、限定Linux服务/双OS/大库实测及未覆盖项。旧分层状态按其日期读取，当前状态从各节点接续段查找；本记录不是整机损毁灾备或实际公司部署接受。


2026-09-26 终审修补交付：[最终治理CLI/TUI制品与证据](../record/evidence/2026-09-26-tests-governance-review-fixes/README.md)接续D057，列出最终host r3/CLI r2、1926通过/34跳过、独立QA和实际双OS/systemd结果。Claude Code fable三轮意见已处置；保留终端profile、单机备份、只隔离恢复及首次工作根串行初始化边界。没有真实公司部署或生产无条件保证。


**2026-09-26 正式接受**：[D-062](../record/decisions/assets-runtimes-node-acceptance/decision.md) 已接受本程 32 个新节点与 3 处修订。节点设计状态 accepted，未实现与实际验证缺口保持原记录；源码不存在不影响设计接受，也不构成实现证据。


## 2026-09-26 本轮 core 交付状态

18 core和两util均已有实际源码，本轮HUB6496检查／独立20制品消费通过；当前217／221项由主调度按精确坐标接受，四项Skill SP3及人的总体门未签。Connector仅自身16项延期，不扩大到其他资产；六混合项只接受当前NonConnector部分。[实际源、原始证据、逐项范围与main继承失败](../record/evidence/2026-09-26-tests-core-final/README.md)是本轮进度入口；本文此前按日期保留，不能把旧“未实现／未开始”当现行进度，也不能把当前core通过推成全仓make通过。


## 2026-09-26 core 最终签收与发布授权

18 core与两util的本阶段责任已完成：当前221/221、U1另13项，由主调度技术签收；产品负责人给出的Skill完成后总体发布授权条件已满足。22包44份双语README、57个TS例子已验证。原217/221、SP3和人的总体门待签描述属于前一输入事件，由[当前运行与签收](../record/evidence/2026-09-26-tests-core-skill-v3/README.md)接续。Connector仅自身纵线延期，90外部义务及未来运行时未签；全仓make继承main三个失败，不是全仓绿灯。

2026-09-27：[D-084](../record/decisions/session-log-jsonl-v3-projection-adoption/decision.md)采用[session-log-jsonl的SL3增量](packages/session/session-log-jsonl/v3-design.md)。四参数条件在同一entries.jsonl比较／整批确认，不可信态正常三操作拒绝；旧首稿V5该分支替代范围明确。当前尚未实现、bindings0，runtime精确版本和全部实际写方迁移／生产Run／真实恢复仍须原owner交付。
