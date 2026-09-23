# 实现映射

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
│   ├── design.md          实现路径、投影、依赖与装卸责任
│   ├── bindings.yaml      条款到证据的绑定表
│   └── verification.md    符合性或集成证据的可变入口
├── packages/
│   ├── core/<node>/       核心与共享：数据契约、协议级构造、被多个领域消费的纯模块，kind: provider
│   └── <domain>/<node>/   按领域或限界上下文聚合的能力提供者，kind: provider
└── apps/<node>/           应用装配节点，kind: assembly
```

`packages/` 与 `apps/` 对应实际源码归属，不是又一层分类。节点名与它实现的包或应用同名，
使「读设计」和「读源码」用同一个词。

## packages 的两层布局

**这里的目录结构直接指导承载仓库根下 `packages/` 的目录结构**：节点路径 `packages/<group>/<node>` 就是将来源码包的路径，
两边逐字相同，承载仓库 `docs/workspace.md` 那条「`packages/<能力族>/<职责包>/` 两层、第一层不是 workspace 成员」的规则在这里落成具体的第一层取值。

| 第一层 | 放什么 | 判据 |
|---|---|---|
| `core/` | **核心、共享、契约或底层协议相关**：`data.*` 数据契约的纯模块、跨领域复用的构造（身份值、交接凭证、过期判定、时间源形状）、内核层复用件 | 它没有自己的领域事实，**被两个以上领域消费**，或它兑现的是一份 `data.*` 契约 |
| `<domain>/` | **按领域或限界上下文聚合**的能力与组合提供者 | 它拥有该领域的事实或动作链；一个节点只属于一个领域。领域名由产品负责人拍板——租户领域是 `tenancy`（[D-024](../record/decisions/tenancy-domain-name/README.md)），新领域在拍板前标候选 |
| `infra/`（组名由 [D-027](../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板，2026-09-23） | **基础设施提供者**：兑现 `core/` 里某个协议级构造的具体实现（SQL 存储、时钟），被装配层选用 | 它没有领域事实，也不定义协议，只兑现一个协议；选型受 [D-026](../record/decisions/infrastructure-persistence-choices/README.md) 约束（不提供 in-memory 实现）。协议本身留在 `core/` |

**怎么判一个节点归 `core` 还是某个领域**：问它兑现的契约是 `data.*` 还是 `capability.*`／`composition.*`——前者几乎总在 `core`；
后者按契约拥有的事实归领域。拿不准的先按领域放，**被第二个领域消费的那天再搬进 `core`**，搬动是「实现换方案」，记 changelog 即可，不改契约。
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
  - clause: "capability.live-agent/v1#S-7"
    basis:
      - async-control-not-bail
    evidence: "formal:live-agent-v1-progress"
    assumptions:
      - "Failures = FALSE：该进展性质只在无失败路径上检查"
    alignment_checked: 2026-09-16
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `clause` | 是 | 精确契约坐标加条款号 |
| `basis` | 否 | 该绑定依赖的[机制语义条目](../basis/README.md) |
| `evidence` | 是 | `test:<id>` 或 `formal:<task-id>`；后者指向 registry 的形式任务 |
| `assumptions` | 是 | 该证据成立的前提；无前提写空列表，不省略字段 |
| `alignment_checked` | 是 | 最后一次对着所引 basis 条目核对的日期 |

**`assumptions` 必填，因为多数生命周期与进展性质的证据都是有前提的。**
省掉它，一条「在无失败路径上成立」的检查会被读成无条件保证；
写出来，前提失效时责任方是明确的。

**两种证据形式都拿不出时，不新增一个「无法验证」的状态。** 那是把缺证据登记成已处理，
属于可解释的假成功。正确做法是退回把性质改写成有界形式；真退不回去，
由需求方裁决改写还是撤销。

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

**provider 节点（2026-09-22 首稿；同日 `core/`、`infra/` 六个已建包并通过各自测试，`tenancy/` 四个只有服务面骨架）**——租户领域五份契约的提供者设计，以及它们共用的基础设施节点。
六个节点的**设计**已由 [D-023](../record/decisions/tenant-domain-design-acceptance/README.md) 接受为各契约的实现路径（2026-09-22），
所兑现的契约同批 `accepted`；节点自身的状态**仍是 `candidate`**——`implemented`／`assembled` 要等源码与真实证据：

| 节点 | 兑现的契约 | 形态 |
|---|---|---|
| [`packages/core/identity-values`](packages/core/identity-values/README.md) | `data.identity-values` v1 | 纯模块：身份值类型、Schema 校验、交接凭证签发／核实原语（选签名方案） |
| [`packages/core/offer-expiry`](packages/core/offer-expiry/README.md) | `data.offer-expiry` v1 | 纯模块：`OfferTiming`、派生状态纯求值、`Clock` 形状；`now` 不后退的候选形状归装配 |
| [`packages/tenancy/account-identity`](packages/tenancy/account-identity/README.md) | `capability.account-identity` v1 | 插件，两个服务面；提供 S-15，`credentials` 作可选依赖调用时解析；留存期限在产生时定死 |
| [`packages/tenancy/credential-verification`](packages/tenancy/credential-verification/README.md) | 同上契约的凭据形式那一半 | 插件，可整体替换；本版只有密码方案 |
| [`packages/tenancy/organization-governance`](packages/tenancy/organization-governance/README.md) | `capability.organization-governance` v1 | 插件，四个服务面（S-53 单列一个只给清除链）；跨 owner「同一提交」靠账号行上的过期事实加组织行对账号行的引用约束，无进程内锁 |
| [`packages/tenancy/account-registration`](packages/tenancy/account-registration/README.md) | `composition.account-registration` v1 | 薄插件，无事实；两条动作链，签发激活依据；清扫提供者因缺枚举读面本版建不起来 |
| [`packages/core/kernel-basis`](packages/core/kernel-basis/README.md) | 无契约条款（D-025、basis 准入） | 纯模块：Cordis 4.0.4 的 8 条 probe、`definePlugin`／`Outcome`／`FIBER_STATE`、测试装配 `bootAssembly`；候选，已建包 |
| [`packages/core/storage`](packages/core/storage/README.md) | 无契约条款（AI R-1～R-7／OG R-1～R-6 的规格化） | 纯模块：存储协议（一次读／写事务、显式锁、四型失败）与一致性套件；候选，已建包 |
| [`packages/infra/storage-sql`](packages/infra/storage-sql/README.md) | 无契约条款（D-026） | 插件 `storage-sql`：Kysely 提供者，sqlite（`node:sqlite`）／pg 由配置切换，迁移运行器；候选，已建包，sqlite 上套件全绿 |
| [`packages/infra/clock`](packages/infra/clock/README.md) | offer-expiry S-16 形状／S-17「`now` 不后退」的承接 | 插件 `clock`：单调钟锚定 + 写在前的租约；候选，已建包 |

`tenancy` 是租户领域这个限界上下文的名字，产品负责人 2026-09-22 拍板（[D-024](../record/decisions/tenancy-domain-name/README.md)）。六个节点共用的待核对主张（可选 inject、`ctx.provide` 纳管、插件体抛出后的 fiber 状态）与对存储提供者的要求清单各记在节点里。

## 当前状态

存量节点尚未从 `design_legacy/providers/` 与 `design_legacy/assemblies/` 迁入。

**assembly 节点**：`apps/cli/` 是第一个应用节点，随 CLI-TUI 交付面的 PF 一起建立（2026-09-22），状态 `candidate`——
源码尚未落地，`bindings.yaml` 为空表。中心治理节点是另一个可部署应用，但它的交付面尚无 PF，**按准入不建节点**，
缺口记在 `apps/cli/architecture.md` 的拓扑一节。
[`apps/tenancy-host/`](apps/tenancy-host/README.md)（名字由 [D-027](../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板）是租户领域第一程的采用型装配节点（2026-09-22），状态 `candidate`：
只写存储（迁移清单与真实外键）、时钟与密钥三半，入口层身份核实明写为缺口；它没有终端交付面 PF，
与上一段的准入有张力，待产品负责人裁（准入例外或为治理中心开题）。

判断方法按需读 `harness-design-handbook` skill 的「插件投影」。
返回[设计链入口](../README.md)。
