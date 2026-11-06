# #1119 实施规格：Skill 线（revision 1，attempt `W4（波段）`）

本文件按 claim 模板与 Matt to-spec／to-tickets 写成。格式取 `.meta_harness/agents/skills/claim/canonical/references/spec-template.md`。方法取 Matt `to-spec`，固定源 `skills-b0618bc436ad`，按已安装路径直接读正文，不经宿主触发。项目差异按 `docs/engineering/skills.md`「三层分工」与「项目差异与负责边界」：不访谈，不发 issue，不请人批准测试接缝。本卡没有线父卡、binding 与 gate，用波段代替 attempt（[范式 §3](../../operating-model.md#3-变通)）。所以 attempt 写作 `W4（波段）`，派发与轮次记在 `delegate/flow.jsonl`。

本线的决定都已定，来源是 [W4 波包](../wave-pack.md) §4 决定 1–4 与 [W4 方案](../plan.md) §2.3、§3、§4.4 W4-2。本文件只把它们落进模板，不重新裁定，不加范围。

- 卡与派发：[#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119)，交付修订 1。派发评论：不适用，范式 §3 用本地文件代替线父卡评论，派发记 `tmp/skill-mcp-domain/delegate/flow.jsonl`。taskBase：父分支 `PanQiWei/skill-mcp` 706152690（W3 各闭包合入后）。开波同步 `origin/integration/mainline` 之后以冻结输入 F 为准，F 写进[波包](../wave-pack.md) §1。
- 上一层：线级地图 [`waves/line-skill/context-map.md`](../../line-skill/context-map.md)。线级约束 [`waves/constraints.md`](../../constraints.md)（两条线共用一份）。本卡附录：无，范式 §3 不设卡级附录，W4 的先例与事实在 [W4 上下文包](../context-pack.md)。
- 主工作类型与 playbook：feature → poteto-mode `playbooks/feature.md`。
- 风险级别：L2，依据 `docs/engineering/quality.md`「按风险选择接受实现的看法」。理由：改动写一个新成员与一个现有成员，并加一个装配节点（Cordis 插件），属于「多个成员、装配节点」。`skill` 与 `skill-contract` 不改，读取关口的逻辑不变，所以不触及范式 §6 列的 Skill L3 热点。`SkillReadCheck` 适配器在读取关口的路径上，它只把缺席映射为 `unknown`，按 L3 的看法逐行读这一处。

## Problem Statement

Skill 的三个服务（`PackageInspection`、`SkillCatalog`、`SkillAccess`）已经在通用实现里完整可用，但没有 Cordis 服务定义。M2 之后的消费者没有服务键可取，宿主没有插件可装。组页「完整行为候选的正式承接缺口」表里 Cordis 两行仍是「尚未承接」。

## Solution

新成员 `skill-cordis-contract` 给三个服务与两个他域端口建键。`skill-host-local` 加 `./cordis` 插件：用本机目录来源造 `SkillPackageSource`，按调用现取两个他域端口，一次构造三个服务。

## 依据与已定事项

| 依据 | 精确修订与链接 | 本卡采用的范围 |
| --- | --- | --- |
| 卡正文 | [#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119) 交付修订 1，判据 C5（W3 波末写回稿 [card-body-after.md](../../w3/card-body-after.md)） | C5 的 Skill 部分 |
| W4 方案 | [w4/plan.md](../plan.md)，负责人 2026-11-06 06:15、06:16 UTC 的两条指示 | §2.3 W4-2、W4-4；§2.4 停放清单；§3 C5 改写原文；§4.1 评审与修复规则；§4.4 W4-2、W4-4 的待办与验收 |
| W4 波包 | [w4/wave-pack.md](../wave-pack.md) | §3.3 写集与 reduce 共享写；§3.4 停止条件；§4 决定 1–4；§5 方法与验证 |
| 契约成员 | [`packages/skills/skill-contract/`](../../../../../packages/skills/skill-contract/)，父分支 706152690 | 三个服务的接口（`PackageInspection` 只在 `./provider`）；端口 `SkillPackageSource`、`SkillResolution`、`SkillReadCheck` 与 `Reply<T>` 的 `unknown`；`./testing` 的端口替身 |
| 通用实现成员 | [`packages/skills/skill/`](../../../../../packages/skills/skill/)，父分支 706152690 | 构造工厂 `createPackageInspection`、`createSkillCatalog`、`createSkillAccess`，只收端口，没有选项与配置 |
| 本地宿主成员 | [`packages/skills/skill-host-local/`](../../../../../packages/skills/skill-host-local/)，父分支 706152690 | `createDirectorySource`；`docs/cordis.md` 写明本包是 `module` 变体 |
| 组页 | [`packages/skills/docs/architecture.md`](../../../../../packages/skills/docs/architecture.md)，父分支 706152690 | 「对外提供」；「完整行为候选的正式承接缺口」表的两行 Cordis 行 |
| Cordis 集成约定 | [`docs/architecture/cordis-integration-conventions.md`](../../../../../docs/architecture/cordis-integration-conventions.md)，提交 e8c7415be | IC-1～IC-9、IC-14、IC-16 |
| 领域页 | [`docs/domains/skills/architecture.md`](../../../../../docs/domains/skills/architecture.md)，父分支 706152690 | 「端口与实现方」；「公开服务的消费方」 |
| 先例 | `execution-environment-cordis-contract` 与 `execution-environment-host-local` 的 `./cordis`，父分支 706152690（[上下文包](../context-pack.md) §2、§3、§5.1） | 抽象 Service 与键的写法；他域端口每次现取 |
| 包模板 | [`tools/dev-flow/templates/package/README_ZH.md`](../../../../../tools/dev-flow/templates/package/README_ZH.md)，父分支 706152690 | `create`、`scan`；「标识与人工采用门」 |
| 包组织 | [`docs/package-organization.md`](../../../../../docs/package-organization.md)，父分支 706152690 | 「现有成员不自动迁移」 |
| 评审规则 | [plan-changes.md](../../plan-changes.md) C-SM-08 | 最终 head 一次关口，A、E 必做，B、C 按改动选，D 一次 |

1. **新成员 `skill-cordis-contract`。** 用包模板的 `service-contract` 变体生成，`scan` 为 pass。根入口不导入 Cordis（IC-4）。
2. **键。** 三个服务键：`PackageInspection`、`SkillCatalog`、`SkillAccess`。两个端口键：`SkillReadCheck`、`SkillResolution`。每键一个抽象 Service：`static readonly provide` 是键的唯一书写处，类 `implements` 契约的接口，JSDoc 写 `@owner packages/skills/skill-cordis-contract`（IC-2、IC-3、IC-7）。`SkillPackageSource` 不建键：本机实现在同组的 `skill-host-local`，插件自己构造（决定 1）。
3. **插件。** `skill-host-local` 的 `./cordis` 导出插件：
   - 两个端口适配器。每次调用从装载时的 `ctx` 取端口键，缺席答 `Reply` 的 `unknown`（决定 1）。
   - `createDirectorySource()` 作为 `SkillPackageSource`。
   - 逐个 `new` 三个服务子类，共一条 fiber（决定 3）。不登记撤除函数（决定 4）。
   - 目录来源的选项（根目录等）如果需要，按可序列化与否分进配置或工厂参数，规格在闭包里列全。
4. **`skill-host-local` 的变体。** 现在是 `module` 变体。加 `./cordis` 之前，先用 `pnpm package:template scan` 对本成员取现行读数，清点差异。没有「升为提供者」的命令时，按 `package-organization.md`「现有成员不自动迁移」手工补插件源码与插件用例，改写 Cordis 文档（文件名见 [plan.md](plan.md) 切片 01），在闭包规格写明清点结果。

已定事项（本卡内具名的局部决定）：

- **D-W4S-1 判据 C5「`scan` 为 pass」的读法。** 读作 `pnpm package:template scan --member <成员> --json` 报完整结构 `pass`、集成无 `deviation`。理由与 MCP 线 [D-W4M-1](../mcp/spec.md#依据与已定事项) 相同：草稿不写采用标识，`--check` 对缺标识的成员退出 1。
- **D-W4S-2 `skill-cordis-contract` 不设 `./testing` 入口。** 两个端口的替身已在 `skill-contract` 的 `./testing`（[上下文包](../context-pack.md) §7 第 5 条：Cordis 层的测试入口没有来源）。

## 原则与约束

研发品味按 ub-mode 全文（`~/.claude/skills/ub-mode/SKILL.md`，固定提交 `unclebob/ub-mode@57a8bdd2`）。会话级取舍见[线级约束](../../constraints.md)「ub-mode」。本线有取舍的条目：

| ub-mode 条目 | 本卡的取舍或偏离、理由 |
| --- | --- |
| Subtract Before You Add | 插件不登记撤除函数：三个服务没有资源要收口（[上下文包](../context-pack.md) §5.1）。不为与 MCP 同形而加空的撤除函数 |
| Laziness Protocol（一个决定只在一处） | 读取关口的规则只在 `skill`。适配器只把「键缺席」映射为端口已有的 `unknown`，不重做读取权判断 |

其余条目按 ub-mode 全文。

项目独有判断与约束：

| 判断或约束 | 拥有者 | 本卡的具体条目 |
| --- | --- | --- |
| 问题所在的轴与拥有者 | `engineering-taste.md`「维度分解与正交」 | 本卡在「装配与生命周期承载」轴上。服务的行为归 `skill`，键与抽象 Service 归 `skill-cordis-contract`，本机来源与装配归 `skill-host-local` 的插件。装配轴不决定读取轴：插件不改读取关口的次序与不披露规则 |
| 顶层架构 | `docs/architecture/cordis-integration-conventions.md`，提交 e8c7415be | IC-1 每个接缝一个定义；IC-2 键只由抽象 Service 的 `static provide` 给出，插件体里逐个 `new` 三个子类，理由见决定 3；IC-3 抽象类 `implements` 契约接口；IC-4 根入口无 Cordis；IC-5 定义闭包不引入提供者；IC-7 键名；IC-8 不写 `inject`；IC-9 端口按调用现取，缺席答 `unknown`，换代后下一次调用取新的，不持有旧引用；IC-16 不可序列化对象经工厂参数 |
| 领域边界与依赖方向 | `docs/architecture/layers-and-dependencies.md` | `skill-cordis-contract` 只依赖 `skill-contract` 与 Cordis 4.0.4；`skill` 与它互不依赖；`skill-host-local` 指向两者（组 README）。外域概念的进入方式见下面五问 |
| 面向契约 | `skill-contract` SPEC；`docs/engineering/integration.md`「可加改动」 | 契约成员不改。新成员只加定义。卡标签 `contract:additive` |
| 防御与失败语义 | `docs/defensive-patterns.md`；`quality.md`「公开能力、策略与观测」 | 见下面「失败语义」 |
| 演进政策 | `docs/engineering/publication.md`「当前演进与消费者」 | 没有现有消费者要迁移，没有被替代的实现要删 |
| 范围 | 负责人 2026-11-06 第一条指示（[方案](../plan.md) 依据段） | 只做方案 W4-2 与 W4-4 的 Skill 部分。不加新服务，不改服务行为。§2.4 停放清单不做 |

SOLID 与 DDD 的采用范围归 `layers-and-dependencies.md`「方法依据与采用范围」。写范围含 `.ts`，加载 `pstack:typescript-best-practices`。

### 跨域概念的五问

本卡给两个他域端口建服务键，并让插件按调用现取。依据 `docs/architecture/layers-and-dependencies.md`「设计与开发的核对」逐问回答。

1. **本域哪项职责或不变量需要它，缺少它会造成什么具体错误。** `SkillCatalog` 与 `SkillAccess` 每次操作现场核验读取权：先问 `SkillReadCheck`，再问 `SkillResolution`，不缓存读取权（组页「读取」第 2、3 步）。对无权主体，「无权」与「不存在」不可区分。没有端口键时只有两种做法，都出错。第一种：插件导入某个端口实现，违反 IC-5、IC-16，Skill 被迫认识实现方。第二种：插件写 `inject` 必需这两个键，M2 之前没有提供者，插件停在 `PENDING`，连只需要包来源的 `PackageInspection` 也取不到。
2. **谁拥有其含义和权威状态，本域读取、判断、保存或发起哪些部分。** 端口的含义与形状归 Skill（接口在 `skill-contract` 的 `./provider`，是需求方用自己的词声明的端口）。权威状态归实现方：读取权归身份与授权，结合资产的持有与选入；合法对应哪一份材料归装配与交接（会话路径）或资产与规则的求值（独立路径）（领域页「端口与实现方」）。Skill 只读答复：准许、拒绝或无法判定；`SkillRef` 与资产正文的声明投影。Skill 不保存读取权，不重做层级求值，包定位由实现方当场给出。键与抽象 Service 归 `skill-cordis-contract`。
3. **采用哪种表示，放在哪个包或接口。** 消费公开契约：接口在 `skill-contract`（`./provider`），服务键与抽象 Service 在 `skill-cordis-contract` 的 `./cordis`。装配或适配器成员装载子类提供端口键，插件按键现取。M2 之前由测试用 `skill-contract` 的 `./testing` 内存替身包成 Service 子类提供。`SkillPackageSource` 的本机实现是同组的 `createDirectorySource`，插件直接构造，不经键。
4. **正常、失败、未知、撤权和恢复怎样交接，共同保证由谁保护、怎样验证。**
   - 正常：每次调用，适配器从插件装载时的 `ctx` 取键，取到就转给提供者，答复原样交回 `skill`。不取服务方法里调用方的上下文。
   - 失败与未知：提供者的答复原样交回。键缺席时，适配器答 `Reply` 的 `unknown`。`skill` 已经把 `unknown` 答成操作的 `unknown`，不压成拒绝、空集合或成功。
   - 撤权：提供者的 fiber 撤除后，下一次 `ctx.get` 取不到，操作答 `unknown`。读取权本身的撤权由 `SkillReadCheck` 在下一次操作答出（领域页：撤权在下一次操作生效）。
   - 恢复：新提供者装载后，下一次调用取到新的。适配器不持有旧引用。
   - 共同保证的承担者：「缺席不放行」由插件的适配器承担；「`unknown` 不压成别的答复」与「无权与不存在不可区分」由 `skill` 承担。验证见「Testing Decisions」的端口缺席用例。
5. **更换上层调用者或外域实现时哪些规则保持不变。** 更换端口提供者时，读取次序、不缓存读取权、不披露身份是否存在、不拼两个版本都不变。独立消费者：一个只用 `skill` 工厂的程序不装 Cordis，直接把三个端口交给工厂，行为与插件一致。边界反例：一个只做候选校验的消费者只取 `PackageInspection`，它只需要包来源。现取让它在没有读取权提供者时也取得到服务。写成 `inject` 时，它会被迫先提供 `SkillReadCheck` 与 `SkillResolution`。

### 失败语义

| 情形 | 行为 | 由谁负责 | 怎样验证 |
| --- | --- | --- | --- |
| 正常 | 插件装载后按三个键取到服务，在目录来源上走「描述 → 读」 | 插件；`skill` | 装配用例 |
| 失败 | 提供者与目录来源的失败原样交回，`skill` 按现行规则答复。错误不变成成功 | `skill`；`skill-host-local` 的目录来源 | 现有 `skill` 与 `skill-host-local` 的用例不改 |
| 未知：端口键缺席 | 适配器按端口方法的返回类型答 `unknown`（`check`、`resolve` 答 `{ kind: 'unknown' }`，`adopted` 答 `fail('unknown')`；2026-11-06 13:33 更正，原写「`Reply` 的 `unknown`」）。实际调用了缺席端口的那一步得到 `unknown`，操作按 `skill` SPEC 的规则答复（例如空的能力集合直接答空列表，不调端口），不放行，不交受该端口保护的内容。`PackageInspection` 不依赖这两个端口，照常可用 | 插件的适配器；`skill` | 装配用例：两个键逐个缺席，依赖它的操作答 `unknown`，`PackageInspection` 照常取得 |
| 未知：W4-1 标记缺失或错标 | 不适用：W4-1 只改 MCP 的传输答复，Skill 没有传输 | — | — |
| 取消与清理：插件撤除 | 插件不登记撤除函数，没有资源要收口。撤除之后三个键取不到 | Cordis 的 fiber 撤除 | 装配用例：`dispose()` 之后三个键为 `undefined` |
| 取消与清理：`closeAll` 以 `AggregateError` 拒绝 | 不适用：Skill 的服务没有 `closeAll`、`close` 或 `dispose`（[上下文包](../context-pack.md) §5.1） | — | — |
| 取消与清理：撤除时的在途调用 | 插件不等在途操作。在途操作继续用已构造的服务对象完成。撤除之后，适配器对装载时 `ctx` 的 `ctx.get` 答什么，先例没有核验 | Cordis；插件 | 未验证，写进「不能声称的事」 |
| 外部效果 | 没有。Skill 只读包字节与端口答复，不写外部状态，不执行脚本 | — | — |

可配置的策略：无。三个工厂只收端口，没有选项与配置。

## User Stories

角色只用通用角色，不点名域外调用方。

1. 作为 M2 之后的消费者，我按 `SkillCatalog` 键取到目录服务，列出摘要并检索。
2. 作为消费者，我按 `SkillAccess` 键取到访问服务，描述并读一个 Skill。
3. 作为消费者，我按 `SkillAccess` 键列出条目并按材料依据导出。
4. 作为做候选校验的消费者，我按 `PackageInspection` 键取到检查服务，检查一个包。
5. 作为消费者，我只依赖 `skill-cordis-contract` 的键，不依赖提供者的实现入口。
6. 作为装配，他域端口还没有提供者时，我装上 Skill 插件仍能取到服务。依赖缺席端口的操作答 `unknown`。
7. 作为装配，读取权端口缺席时，`PackageInspection` 仍可用。
8. 作为装配，我更换一个端口的提供者时，下一次操作使用新的提供者，插件不重跑。
9. 作为装配，我提供 `SkillReadCheck` 与 `SkillResolution` 的服务子类，Skill 不认识我的实现。
10. 作为宿主，我撤除 Skill 插件之后，三个键都取不到。
11. 作为一个只用通用实现的独立程序，我不装 Cordis，直接调三个工厂，得到同样的行为。
12. 作为对无权的主体，我经插件取得的答复与直接调用通用实现时一样，不随身份是否存在而变。

## Implementation Decisions

- 成员与职责：
  - 新成员 `skill-cordis-contract`：三个服务键与两个端口键的抽象 Service，`Context` 增补，根入口为空。
  - `skill-host-local`：`./cordis` 入口、插件、两个端口适配器、用例与文档。
  - `skill`、`skill-contract` 不改。
- 插件不新增机制：适配器每次 `ctx.get`，与 MCP 线同形。不写 `static inject`。
- `PackageInspection` 的操作类型只在 `skill-contract` 的 `./provider`，抽象 Service 从那里 `implements`。
- 装配次序与依赖段由 reduce 在派发之前写（波包 §3.3）：新成员的生成、`skill-host-local` 的依赖段（加 `@deepseek-ai/cordis`、`skill`、`skill-cordis-contract`）、`exports` 的 `./cordis`、锁文件。

## Testing Decisions

- 测试与验证先设计：写出判据、反例与变红验证（每条测试在什么缺陷下变红），再实施。写新测试时先确认它变红，再实现（`docs/engineering/skills.md`「ub-mode 研发品味」）。成员测试导入 `dist`：证明变红时先还原源码并重新构建，再运行（[范式 §5](../../operating-model.md#5-新增记录分支) W2 教训）。
- 好的测试只断言外部行为与契约要求的结果：键是否取得到、旅程的答复、缺席时的 `unknown`、撤除后取不到。
- 测试接缝（越高越好，越少越好）：
  - 一个接缝：`skill-host-local` 的 Cordis 入口用例。它在真实 Cordis `Context` 上装插件，两个端口键用 `skill-contract` 的 `./testing` 内存替身包成 Service 子类提供，按三个键取服务，在目录来源上走「描述 → 读」。同一文件覆盖端口缺席与撤除。
  - `skill-cordis-contract`：根入口无 Cordis；键常量等于类的 `provide`；导出集合恰为公开名单。
- 被测成员与先例：`packages/execution/execution-environment-host-local/tests/cordis-entry.spec.ts`；`execution-environment-cordis-contract` 的 `tests/public-entry.spec.ts` 与 `tests/cordis-entry.spec.ts`。
- 判据与切片（命令写在 [plan.md](plan.md)）：

| 编号 | 判据 | 来源 | 切片 |
| --- | --- | --- | --- |
| S4-1 | C5 的 Skill 部分：模板生成、`scan` pass、IC-2、IC-4、装配旅程 | C5 第 1–3 条的 Skill 部分；方案 §4.4 W4-2 | 01 |
| S4-2 | `skill`、`skill-contract`、`skill-host-local`、`skill-cordis-contract` 的 `build`、`typecheck`、`test` 退出 0；`lint:deps` 无违规 | 方案 §4.4 W4-2 验收 | 01 |
| S4-3 | C5 第 5 条的 Skill 部分：Skill 组页「完整行为候选的正式承接缺口」表与领域页按实际成员和状态写回，`review-docs` 无阻断 | C5 第 5 条；方案 §4.4 W4-4 | 02 |

C5 第 4 条（撤除经 `closeAll` 收口）只对 MCP。W4-4 的波末项（C6、D-01、D-02 的请求）在 MCP 线 [plan.md](../mcp/plan.md) 切片 03，两条线共用一次。

- 传感器与命令（按风险级别选，规则归 `docs/clean-loop.md` 与 `docs/verification.md`）：

| 检查 | 命令 | 何时跑 |
| --- | --- | --- |
| 成员门禁 | `pnpm turbo run build typecheck test --filter=@omne-harness/skill-contract --filter=@omne-harness/skill --filter=@omne-harness/skill-host-local --filter=@omne-harness/skill-cordis-contract`；同一组 `--filter` 跑 `pnpm turbo run test:slow` | 写者最后一次改动后；reduce 合入父分支前复跑 |
| 类型与 lint | `pnpm run typecheck`；`pnpm run lint:rules`；`pnpm run lint:oxlint` | 每个切片后 |
| 依赖方向 | `pnpm run lint:deps` | 切片 01 必跑：新依赖边 |
| 格式与文档 | `pnpm run format:check`；`pnpm run check:docs` | 每个切片后（七项轻门禁的其余两项） |
| 预检 | `pnpm run preflight` | reduce 合入父分支前（[范式 §6](../../operating-model.md#6-质量门槛)） |
| 包模板 | `pnpm package:template scan --member packages/skills/skill-cordis-contract --json`；`skill-host-local` 同一命令取清点读数 | 切片 01 开工前与交回时 |
| 结构读数 | `pnpm run metrics --coverage`，基线按 `review-code` 技能「度量与差分变异的基线」一段 | 切片 01 之后集中一次 |
| 差分变异 | `VITEST_MAX_WORKERS=6 pnpm run mutation --base <F> --since <切片 01 的首个提交>`，只打热点：端口适配器与插件体。基线与收窄按 `review-code` 技能「差分变异」一段 | 最终 head 上跑一次 |
| 文档与投影 | `pnpm run check:docs`；`pnpm run check:agents` | 改到时 |
| 整次准入 | `pnpm run admission`；`pnpm run acceptance`；`pnpm run loop:status --strict --base <F>` | 不跑卡级准入。波末在父分支头各跑一次，只作质量读数，放在 MCP 线切片 03（范式 §3、§6；波包 §5） |

- 不能声称的事（`docs/verification.md`）：
  - 真实端口提供者与消费者的组合：未执行。M2 之后才有。
  - 应用插件树中的装配：未执行，不在本波范围。
  - 撤除时在途操作的答复：未验证。插件不等在途操作，撤除之后适配器的 `ctx.get` 答什么没有探针。
  - 云端内容存储的 `SkillPackageSource`：未执行，存储契约尚不存在。
  - 同一 isolate 重复装载与多 isolate 并存（IC-6）：未验证，先例也没有测试。

## 待决事项

先筛三层：过度设计删掉 → 自己能定的写进「已定事项」→ 只有产品规则、范围变化、新的破坏性契约改动、须接受者本人做的动作才算缺口。

| 缺口 | 影响的切片 | 处置 |
| --- | --- | --- |
| `skill-cordis-contract` 与 `skill-host-local` 在本波是否写模板采用标识（`omneHarness.packageTemplate`）。来源只写「全部结构适配与适用集成核对完成后才写」 | 01 | 本波不贴标，判据按 D-W4S-1 读。整卡技术接受（D-01）时一并请负责人定。不阻塞切片 |
| D-01、D-02 的接受 | MCP 线切片 03 | 须负责人本人做。本波出口是「已请求」（方案 §3） |

## Out of Scope

- 方案 §2.4 停放清单的全部项。
- 应用插件树；真实端口提供者；与消费者联调（M2 之后）。
- `SkillPackageSource` 的键：它的他域提供者出现时再定。
- 新服务与服务行为的改动。

## Further Notes

- 组页「正式承接缺口」表的两行 Cordis 行由 reduce 在 W4-4 写回（本线切片 02），不在闭包 `w4-skill-cordis`。同表第一行已在 W3 波末写回（父分支 706152690 的状态是「候选，已有实现，尚未取得技术接受」）。表前一段的「Cordis 插件部分还没有实现」与「`skill-cordis-contract` 尚非 workspace 成员」两句随 W4-4 改写。
- 第 4 条的变体清点可能发现模板缺口。缺口归模板拥有者，按波包 §3.4 的停止条件交回，不在本波改模板。
