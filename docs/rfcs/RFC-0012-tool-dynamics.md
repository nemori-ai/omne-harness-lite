---
id: RFC-0012
title: 工具的动态性：运行时加载、卸载与替换实现
revision: 1
status: accepted
owner: PanQiWei
---

# RFC-0012：工具的动态性：运行时加载、卸载与替换实现

规则与维护责任见[RFC入口](README.md)。本页不是当前规范。提案采用、规范写回、实现和交付接受分别判断。2026-10-21 采用本提案 revision 1，记录见 [#618 的决定](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6314971717)。写回由 [#618](https://github.com/nemori-ai/omne-harness-lite/issues/618) 按「写回现行正文」表承接。来源是 [#618](https://github.com/nemori-ai/omne-harness-lite/issues/618) 的设计讨论；过程材料在该卡工作树的 `tmp/issue-618/`。

## 问题与有效输入

项目要求把"完全动态"列为目标：工具等资产在运行时允许改变，热加载不得造成系统性停机，激活和卸载各自说明效用、逆效用与在途处置（`docs/requirements.md:84-94`，SYS-DYNAMIC）。同一页写明"各类变化的精确连续性保证与完全动态的验收判据尚待明确"（`:94`、`:218`）。已接受的架构给出了固定采用、两个采用入口、刷新边界、目录换代和计划替换的语义，但没有把它们在 Tool 上闭合成一条可实施、可验收的链。具体缺口有六项。

1. 对象链方向相反。`ToolDefinition` 由作者工厂随实现生成（`packages/tool/tool-contract/src/authoring.ts:158-161`），资产 body 只有 `{ name, programmable, composes.skills }`（`packages/tool/tool-contract/src/contract.ts:12-13`）。两者之间没有派生关系。"能力身份映射与实现解耦"在创作路径上不成立。
2. 没有会话级的工具连贯性规则。已接受正文允许合法刷新改变尚未发出调用的定义（`docs/architecture/runtime/assembly-and-change.md:81`、`packages/tool/tool-contract/SPEC.md:423`）。部分模型厂商校验请求中工具名称、args schema 与历史调用的一致性，这条规则会让会话在工具换代后无法继续。
3. G7 绑定登记表、`ToolCatalog`、实例目录 `register/connect`、`quiesce/inspectDrain/handover` 均未实现；`generation` 固定为 `'1'`（`packages/tool/tool/src/driver.ts:35`）。
4. 换代协调者没有契约。`docs/architecture/deployment/cordis-and-lifecycle.md:120-124`（LIFECYCLE-M02）把它登记为已知差距。
5. 登记表的键没有来源层。`ToolBindingRegistry.register` 的 `authority` 是不透明的 `DurableEvidence`（`authoring.ts:181-188`），登记表无法得知这份贡献属于官方、组织、租户还是工作区。
6. Cordis 4.0.4 的基础事实缺一项探针：根已 ACTIVE 后动态装载一个带登记的作者插件，再撤除它。现有 basis 条目只覆盖提供者换代重跑和 effect 并发释放（`.meta_harness/design/basis/cordis/`）。

不处理的后果：阶段二的宿主（#440）、绑定登记表（#441）和组合测试（#442）没有可依据的语义；工具换代会让已有会话失效；LIFECYCLE-M02 继续悬置。

已观察事实、推断与未知的区分：第 1 至 5 项是对当前父分支 `3a3dede93b0e9f3bbf147c3d17f14e2708220482` 的直接观察。第 2 项中"部分模型厂商校验一致性"是 PanQiWei 给出的约束，本提案不复述其来源。第 6 项的探针缺失是观察，探针结果是未知。

| 当前要求或承诺 | 核对修订与条款 | 本提案受什么约束 |
| --- | --- | --- |
| [项目要求](../requirements.md) | SYS-DYNAMIC（84-94 行）、SYS-COMPOSITION（96-119 行）、未决项 218 行 | 定义 / 装配 / 活体三分法不变；两个采用入口不变；本提案只补验收判据与工具的会话连贯性规则 |
| [装配求值与动态变更](../architecture/runtime/assembly-and-change.md) | 多层来源求值（13 行）、能力选入（23-33 行）、定义与清单（35-39 行）、何时重装（50-57 行）、工作区与能力变化（81 行）、reload 交接 | 层序求值归 assets 与装配；本提案不定义层序算法；收窄 81 行的刷新规则 |
| [Cordis 与部署生命周期](../architecture/deployment/cordis-and-lifecycle.md) | 执行拥有者与调用者、依赖换代与就绪（78-82 行）、LIFECYCLE-M02 | 工具实现不进 Agent 宿主 `inject`；动态绑定走调用入口路由与局部绑定生命周期 |
| [Cordis 集成约定](../architecture/cordis-integration-conventions.md) | IC-6、IC-8、IC-9、IC-13、IC-17、IC-18 | 一键一提供者；inject 静态字面量；登记即效应；会话不是 Context；租户是操作参数 |
| [Session、Run 与输入承接](../architecture/runtime/session-and-run.md) | 日志准入（92 行） | 新增会话事实须满足"缺了它就不能恢复" |
| [Tool 契约](../../packages/tool/tool-contract/SPEC.md) | 定义完整性（385-399 行）、已知与可用的动态关系（419-427 行）、G7 与装载登记（877-883 行）、P16（887-901 行） | 固定采用、P16 故障隔离、"撤登记只阻止后续采用"不变 |
| [Tool 的 Cordis 定义](../../packages/tool/tool-cordis-contract/docs/cordis.md)、[tool-host-local 的 Cordis 集成](../../packages/tool/tool-host-local/docs/cordis.md) | 登记输入与撤除协议；作者装载与贡献登记；阶段装配与换代 | 登记表不重造资产优先级；计划替换先停新准入、排空、交接 |
| [assets SPEC](../../packages/assets/assets/SPEC.md) | 身份与必要区别；定义、草稿与发布（含 41 行的跟随规则） | 能力身份 = 类别 + name；每层对同一能力身份至多持有一份；本提案为跟随规则加一条例外 |
| PanQiWei 在 #618 的裁定（2026-10-21） | R1–R5、同形判据、冻结含义、Cordis 形态、同键 conflict、登记键来源层、裁定点归属 | 本提案把这些裁定写成可实施条款；不改其含义 |

## 建议与改变范围

### 对象链

工具的身份分三层，各自有独立的生命周期。

| 对象 | 内容 | 拥有者 |
| --- | --- | --- |
| 能力身份 | `CapabilityId`：类别 `tool` + name | assets |
| 工具资产 | 某一层的具体资产及其发布版本。body 保持小：身份、治理声明（`requiredCapabilities`、`programmable`、`composes.skills`）、实现引用（`implementation { executor, module, construction }`） | assets 拥有持有与版本；Tool 类别拥有 body 契约 |
| 实现 | 实现包。导出 `ToolImplementationModule { executor, createAuthor(construction) }` 与一个作者插件。实现只提供形状与操作：参数契约、返回声明、命令表、description、`backgroundAllowed`、declarations（含模态与 settings 声明） | 作者；Tool 装载与登记 |
| `ToolDefinition` | 装载时由 `deriveDefinition(governance, implementation)` 派生。形状、description、`backgroundAllowed`、declarations 来自实现；`adoption`、name、`requiredCapabilities`、`programmable` 来自资产。`definition.adoption` 全等于资产版本 | Tool |

对齐靠能力身份：资产 name = 能力名 = 定义 name，装载时核对，不一致则拒绝装载。`ToolAuthorRegistration` 不再自带 name 与 adoption。`defineFunctionTool / defineCommandTool` 只接收实现侧字段。现有 example 与 Tools 元工具同波迁移。

同一能力身份下，官方、组织、租户、工作区各层可以持有不同的资产，各自引用不同的实现，各自派生不同形状的 `ToolDefinition`。本提案不要求同一能力身份下的实现共享参数形状。

### 会话常驻集合的规则（R1–R5）

定义：常驻工具是调用方不经 Tools 元工具发现即可调用的工具。同形指 `shapeOf(definition)` 相等；`shapeOf` 只看 name、kind、参数契约（schema 的规范 JSON 与 vocabulary 的 owner/name/digest）和命令表（命令名按名排序，各命令的参数契约或 `executor-owned` 标记）。description、参数 descriptions、命令 summary、returns、declarations、adoption、executor 不参与。采用点是会话初始化、新 Run 开始和显式 reload。

R1. 会话初始化确定常驻集合后，集合只增不减。每一项的 name 与参数形状在会话内不变。
R2. 会话可以在采用点加入此前未装载的常驻工具。Run 中途不加入；Run 中途的新工具经 Tools 元工具（非常驻）可达。
R3. 已装载的常驻工具被卸载或暂时不可用、且没有同形可用贡献时，会话以同形的不可用件（统一语言的「替换件」）替代它：`ToolAvailability.known-unavailable` 带原 definition。调用它得到不可用应答。
R4. 会话持久保存每个常驻工具首次装载的 definition（会话事实 `tool-resident-admitted`）。当前记下的登记键从 Run 依据派生，不另写会话事实。
R5. 常驻工具的实现变更且新定义与首次定义不同形时：
   - R5a 原实现仍装载且可用时，会话继续使用它（同形）。更正标注（2026-10-22，同上决定）：原文「固定的旧实现仍可装载时留在旧实现」。
   - R5b 没有同形可用实现、原实现不可装载，且存在不同形的合法胜者时，会话冻结。"不可装载"要耐久证据：包 digest 缺失，或装载被确定性拒绝。冻结只在采用点判定。冻结后在途 Run 自然收场，会话不再派发新 Run。更正标注（2026-10-21，[决定](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6315367596）：冻结是 Session 域拥有的独立生命周期状态，不是 archive；冻结不可逆，冻结后的会话仍可按会话自己的规则归档。原文"进入不可逆的 archive"按此理解。
   - 暂时缺席、未知、撤权一律按 R3 处理，不冻结。

非常驻工具不受 R1–R5 约束。MCP 不在本提案范围。补充标注（2026-10-22，[决定](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6332679272)）：meta 能力入口（Tools 元工具）必定常驻且不可替换，不参与卸载与冻结判定；经它发现和使用非常驻工具只是对它的一次调用。

装配时对每个选入的能力身份回答两个问题。第一个问题问 assets：这个租户的作用域里有没有合法持有的资产。必需能力从未取得合法定义时装配失败。第二个问题问登记表：键 (来源层, 能力身份, 资产版本) 有没有贡献，实现的必需依赖是否在场。没有贡献时协调者按需装载；装载失败时保留已知定义并标 `known-unavailable`，装配不失败。版本由持有决定：持有固定某版或跟随当前版，引用工具的定义只引用能力身份。

采用点判定表（对每个常驻项）：

| 固定实现可装载 | 合法胜者 | 结论 |
| --- | --- | --- |
| 是 | 无，或不同形 | 保持原固定（R5a） |
| 是 | 同形 | 前进到胜者 |
| 否（耐久） | 无 | 同形不可用件（R3） |
| 否（耐久） | 同形 | 前进到胜者 |
| 否（耐久） | 不同形 | 冻结（R5b） |
| 否（暂时） | 任意 | 同形不可用件（R3） |

刷新点允许的变化：

| 刷新点 | 加入新能力身份 | 同形前进 | 判冻结 | 恒允许 |
| --- | --- | --- | --- | --- |
| 会话初始化 | 是 | 不适用 | 否 | 可用性 |
| 新 Run 开始 | 是 | 是 | 是 | 可用性、实现 |
| 显式 reload | 是 | 是 | 是 | 可用性、实现 |
| Run 中的提供者变化 | 否 | 否 | 否 | 可用性 |

持有的"跟随当前版本"对已有会话是有条件的：同形才跟。这是 assets 版本选用规则的一条例外。

更正标注（2026-10-22，expression 判读处置，[决定](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6334452839)）：采用点判定表、刷新点表、R3 的前提、登记表的方法与失败集合、协调者的返回与失败集合、驻留端口的形状与服务键、`binding-changed` 的载荷，以 [Tool 契约 SPEC](../../packages/tool/tool-contract/SPEC.md#会话常驻规则r1r5) 与 [tool-cordis-contract](../../packages/tool/tool-cordis-contract/docs/cordis.md#换代协调者契约) 的现行正文为准；本页上面两张表保留提案时的写法。其中回退顺序（按登记序号）与「协调者按保留义务重装记下的键不算回头找旧版本」两条由 PanQiWei 于 2026-10-22 随 #618 接受采用（[#618 的接受决定](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)）。

更正标注（2026-10-22，[决定](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6334452839)）：PanQiWei 采纳「会话与三个 runtime 不钉版本，按形状核对同形可用实现」。本提案据此更正：固定采用改为记形状、按形状选取，`definition.adoption` 仍等于装载时的资产版本，只用于追溯与并存；`resolve`、R5a、R5b 与判据 4、5、6 按下文更正后的措辞执行。R1 至 R4、冻结、登记键三分量、协调者与保留义务不变。

### 绑定登记表（G7）

一个工具实现在 Cordis 里是实现包导出的作者插件 fiber。下文的"作者插件 fiber"都指它。它不 provide 服务键。它的 `inject` 是实现包里的静态字面量，含 `toolBindings` 与实现需要的服务。插件体只调用 `contributeTool(ctx, config, module)`：校验 config，`ToolLoader.load`，`toolBindings.register`。登记以 `ctx.effect` 配对在该 fiber 上。

登记键 = (来源层, 能力身份, 资产版本)。来源层四选一：`official`、`organization(orgId)`、`tenant(TenantId)`、`workspace(wsId)`。来源层只取自核验后的 `authority`，不取自登记者的 `Access.tenant`；`Access.tenant` 只核登记者在该层的登记资格。`resolve` 按请求带的能力身份与记下的形状，在本租户可访问、当前 live 的贡献中选同形者：记下的登记键仍 live 时优先它，否则取合法胜出者序中最先的同形贡献；没有同形者返回 unavailable。访问核验按来源层：official 任何合法租户；organization 要同组织；tenant 要 `tenantEquals`；workspace 要当前获授。不做层序选择。更正标注（2026-10-22，同上决定）：原文为「`resolve` 按固定采用查键」。

同一个键的第二次登记按三种情形处理。同一个 fiber 用同一个装载 digest 再登记，登记表认回同一贡献。其他情形一律 conflict，原贡献不动。原贡献 release 之后，新资格成立的登记成为后继。晚到的旧 release 比较 token，不删后继。release 只撤自己的 token。两个 fiber 同时首次登记同一个键时，一方成功，一方 conflict，由本地排序域决定。

同一能力身份的新旧实现是不同资产版本键下的并存贡献。`ToolAvailability.available` 增加 `layer` 字段，固定请求自带键的全部分量。

### 加载、卸载、替换与换代协调者

换代协调者 `toolGenerations` 是 Tool 宿主的 Service，也是 `ctx.plugin` 句柄的唯一持有者。下文的"协调者"都指它。它有三个动词。每个动词都向目标态收敛，可以重复调用。

- `ensureLoaded({ authority })`：读资产实现引用，核包 digest，动态 import 实现包，`ctx.plugin` 作者插件。同键已装且同 digest 认回。
- `unload({ key })`：先读会话引用。有未归档会话引用、且没有同形的 serving 替代时，返回 `retained`，什么都不动。否则按顺序做五步：把登记表条目标记为 draining，新 Run 不再选它，固定采用继续 resolve；等在途调用收场；按 P09 交接；release 贡献；dispose 作者插件 fiber。五步做完返回 `released`。任一步未完成返回 `draining`，再调用一次从未完成的那一步继续。更正标注（2026-10-21，同上决定）：按键排空与交接依赖 P09 的 `inspectDrain({ executor })` 范围，归 #421 的 6.8；在那之前协调者在有在途调用时停在 `draining`。
- `sweep()`：恢复后按保留义务重装未归档会话记下的键。对无引用、且不再是任何胜者的贡献调用 `unload`。

保留义务：有未归档会话引用且无同形 serving 替代的贡献，协调者不 dispose。引用从会话事实派生（端口 `ToolResidencyReader.referencing`），协调者不建账。包字节保留，同 digest 可重新 import。

替换 = `ensureLoaded(新版本)`；旧版本在引用归零后由 `unload` 或 `sweep` 收走。不存在原地替换。突然失依赖（fiber 被 Cordis 撤除）不经协调者：登记由 effect 撤除，会话看到 R3 不可用件，在途调用保持 unknown。

协调者的 `unload` 和 `sweep` 是系统作用域操作。更正标注（2026-10-21，同上决定）：`ToolResidencyReader` 端口不用 `Access<P>`，输入为 `{ scope: 'system', key }`，只返回会话身份与 shape，不传正文；IC-18 为系统作用域操作加一条例外。

### 验收判据（SYS-DYNAMIC 对 Tool）

在真实 Cordis 4.0.4 `Context` 上可复跑：

1. 装载前后，`toolRuntime`、`toolCommands`、`toolReads`、`toolInstances` 提供者的 fiber uid 不变。
2. 同键认回与 conflict；release 只撤自己；晚到旧 release 不删后继。
3. 有引用且无同形替代时，`unload` 返回 `retained`，贡献仍 live。
4. 无引用且无在途调用时，`unload` 经 draining 到 released。此后记下该键、且没有其他同形贡献的请求 `resolve` 返回 unavailable，fiber 为 DISPOSED。有在途调用的排空在 6.8 验收。
5. 新旧版本并存，各自可被同形请求选中；不同形时旧会话只解析到同形的旧贡献，新会话解析到新贡献。
6. Run 中的刷新可把后续调用路由到同形的新实现；常驻形状与记下的采用依据不变。
7. 不同形新版：留旧，会话可用。
8. 突然撤除 fiber：同定义 known-unavailable；在途调用 recover 为 unknown；重新装载后下一采用点为 continues。
9. 无同形可用贡献、旧包缺失且不同形胜者存在：下一采用点判冻结；会话进入冻结状态一次，重复为 no-op；不再派发新 Run；在途 Run 收场。
10. 全过程中无关能力的调用零失败；P16 的目录与 Catalog 缺席语义不变。

| 受影响拥有者 | 现行保证或机制 | 拟改变内容 | 必须保持的条件与例外 |
| --- | --- | --- | --- |
| 项目要求（PanQiWei） | SYS-DYNAMIC 验收判据未定；119 行刷新可改定义 | 增加 Tool 的验收判据（上节 10 条）；119 行改为"刷新可改可用性与实现，常驻项 name 与参数形状在会话内不变" | 定义 / 装配 / 活体三分法、两个采用入口不变 |
| 架构：装配求值与动态变更（PanQiWei） | 81 行刷新可改定义；39/53 行采用只在两个入口 | 81 行收窄同上；增加"新能力身份在采用点加入常驻集合"；增加"同形才跟"例外的引用 | 层序求值归 assets 与装配 |
| 架构：Cordis 与部署生命周期（PanQiWei） | LIFECYCLE-M02 待办 | Tool 部分由 `toolGenerations` 承接；写明作者插件 fiber 形态与保留义务 | 工具实现不进 Agent 宿主 inject |
| 架构：Session、Run 与输入承接；领域 sessions-and-work | 日志准入列表；Tool 不拥有自动归档规则 | 新增事实种类 `tool-resident-admitted`；新增会话生命周期状态"冻结"与原因 `tool-shape-lost`（更正标注：原写为归档 cause）；实现 `ToolResidencyReader / Actions` 端口 | Tool 只给判定与原因，状态转换由会话执行 |
| Tool 契约 SPEC（PanQiWei） | 423 行"同形不是永久冻结 schema"；425 行"先按共同选择规则更新实现"；877 行装载顺序；G7 | 423 行改为会话内常驻项冻结；425 行加"不同形候选不替换常驻项"例外；877 行改为先有实现形状再派生定义；G7 写登记键、conflict、来源层、保留义务 | 固定采用、P16、"撤登记只阻止后续采用"不变 |
| tool-contract 类型 | `ToolDefinitionMetadata`、`ToolAuthorRegistration`、`ToolLoadedRegistration`、`ToolLoader`、`ToolBindingRegistry`、`ToolAvailability`、tool body | 见「验证与消费者切换」的类型变更清单 | `ToolDefinition` 形状不变 |
| tool-cordis-contract、tool-host-local 文档 | 登记输入段；"实际工具插件经 ToolLoader 取得固定定义再构造作者注册" | 登记输入改为 `ToolAuthority`；新键 `toolContributionAuthority`、`toolGenerations`；事件 `binding-changed`；作者插件措辞 | 服务键只在 tool-cordis-contract 定义 |
| assets SPEC（PanQiWei） | 41 行跟随规则；tool body 契约 | 加"已有会话同形才跟"例外；tool body 增实现引用与治理字段 | 每层同一能力身份至多持有一份 |
| Cordis basis | 缺动态装载探针 | 新增条目与探针：根 ACTIVE 后动态 `ctx.plugin` 带登记的作者插件并撤除 | 固定 4.0.4 |

## 实质备选

| 方案 | 如何满足目标 | 代价、风险和失败后果 | 推荐或放弃理由 |
| --- | --- | --- | --- |
| 本提案：资产 body 小 + 实现派生形状；会话常驻规则 R1–R5；登记表 conflict；协调者按会话引用保留；冻结延后到采用点并要耐久证据 | 见「建议与改变范围」 | 会话日志存完整首次 definition；长寿会话钉住旧实现；shape 文本规范化偏保守 | 推荐。与已接受三分法、固定采用、IC 约定一致；不可逆动作有证据门槛 |
| 每个能力身份一份跨实现稳定的契约（Profile per capability） | 替换只换 executor，schema 不变 | computer-use 场景下 schema 随实现与模型不同；新增 assets 域治理对象，assets 草案未定 | 放弃。与"不同实现不同 schema"的真实需要冲突 |
| 把参数契约与命令表放进资产 body，由 body 派生 `ToolDefinition` | 定义有唯一数据源 | 资产承载实现细节；同上一条的 schema 问题 | 放弃 |
| 登记表 supersede（新贡献顶掉旧的） | 替换是一步原子操作 | 旧会话丢失 R5a 的旧实现；登记表自行决定替换，绕过保留义务 | 放弃。与已定 conflict 政策矛盾 |
| 撤除通知时立即判冻结 | 接口最简单 | Cordis 在任一被 inject 的提供者换代时重跑作者插件 fiber，贡献先撤后登；一次常规换代会把全部引用会话不可逆归档 | 放弃 |
| 协调者或登记表自持引用计数 | 不依赖会话端口 | 与会话事实分裂所有权，崩溃后计数不可恢复 | 放弃 |
| 新旧实现分 isolate 并存 | 利用 Cordis 可见范围 | 实现不 provide 键，isolate 不起作用；basis 明确否定按租户 isolate | 放弃 |
| 通用作者插件，`inject` 写死为 `['toolBindings']` | 实现包不含 Cordis | 实现无法声明自身依赖，与"命令所需的额外服务按操作局部注入"冲突；R3 的依赖失效路径无从发生 | 放弃 |
| 把来源层编进 `adoption.owner` 的文本 | `FixedToolRequest` 零改动 | 通用字段加私有词法；assets 的 `Adoption.owner` 另有含义 | 放弃，改为 `ToolAvailability.available.layer` |
| 常驻集合整表（含当前版本）作为会话事实 | 恢复最直接 | 把可派生值写进日志，违反 `session-and-run.md:92` | 放弃 |

## 验证与消费者切换

性质与反例。 R1–R5 与判定表由纯函数 `planAdoption`、`refreshAvailability`、`foldResident`、`shapeOf` 承载，用表驱动测试逐行验证；`refreshAvailability` 的返回类型不含加入、前进与归档。登记表用现有登记语义套件的写法增加 G7 套件：认回、conflict、后继、晚到 release、竞态。协调者与作者插件用真实 Cordis `Context` 验证上节 10 条判据，fixture 记录五个稳定提供者的 fiber uid。新增 basis 条目的探针在 4.0.4 真实 Context 上通过。

成立前提。 单机、单进程、非耐久登记表。跨进程、远端目录、耐久存储不在本提案覆盖。`shapeOf` 用文本规范化比较 schema，语义等价但文本不同的 schema 判为不同形；这偏向留旧版，不会误冻结。

尚未覆盖。 层序求值器、变体选择、Profile 对象、MCP、加载提供者的远端形态、协调者的 GC 策略。

类型变更清单（同波迁移，旧形删除）。

1. `ToolDefinitionMetadata` 拆为资产侧 `ToolGovernance { asset, requiredCapabilities, programmable }` 与实现侧 `ToolImplementationFacts { implements, description, backgroundAllowed, declarations }`。`ToolDefinition` 形状不变。
2. `ToolAuthorRegistration` 改名为 `ToolImplementation`，不含 name、adoption 和治理字段，保留逐命令 `ToolOperation`。新增 `ToolImplementationModule { executor, createAuthor }`。
3. `ToolLoadedRegistration` 新增 `key, definition, shape`，删除 `source`。`ToolLoader.load` 输入改为 `{ asset, settings, module, services }`。
4. `ToolBindingRegistry.register` 的 `authority` 改为 `ToolAuthority { layer, asset, holding, publication }`；返回 `Outcome<ToolContribution, ToolContributionFailure>`；新增 `snapshot / pins / close / drain`。
5. `ToolAvailability.available` 增 `layer: SourceLayer`。
6. tool 资产 body 增 `requiredCapabilities`、`implementation { executor, module, construction }`；`toolBodyContract` 同步。
7. tool-cordis-contract 新键 `toolContributionAuthority`（同步 `verify`、`admits`）、`toolGenerations`；事件 `binding-changed`；登记套件输入改为 `ToolAuthority`；新套件 `runToolDynamicsSuite`。
8. kernel-basis 抬 `registerInCallerFiber`。补充标注（2026-10-25，[#626 的 helper 采用](https://github.com/nemori-ai/omne-harness-lite/issues/626#issuecomment-6369465540)）：实施形状为 `@omne-harness/kernel-basis/cordis` 导出 `registerInCallerFiber<Entry extends { readonly registration: unknown }, Failure>(ctx, admit, withdrawal): Outcome<Entry['registration'], Failure>` 与三态 `Admission<Entry, Failure>`（`entered`、`recognised`、`refused`）；`withdrawal` 是直接回调，不经调用方再建 disposer；kernel-basis 加 `@omne-harness/operation-result` 运行时依赖，根入口保持空；`model-cordis-contract` 删除自带副本 `caller-fiber.ts`，两个调用点改为消费它。生命周期与失败边界七条归 [kernel-basis SPEC](../../packages/assembly/kernel-basis/SPEC.md#调用方-fiber-登记辅助)。状态：SPEC 已写回，源码由 #626 的后续阶段切换。

消费者切换责任。

| 消费者 | 切换内容 | 责任 |
| --- | --- | --- |
| `packages/tool/tool/examples/report-tool.ts`、Tools 元工具（`tools-commands.ts`） | 改为实现侧字段 + 作者插件 | Tool 实现成员 |
| `tool-contract` 的 `testing-*` 套件、`tool-cordis-contract/testing` 登记套件与内存替身 | 新输入形状 | Tool 契约成员 |
| `tool-host-local` 的 `start-coordinator` | 消费 `availability.layer` | Tool 宿主成员 |
| sessions-and-work | 事实种类、冻结状态与原因、端口实现 | 会话成员 |
| assets | body 契约消费者 | assets 成员 |
| 阶段二子卡 #439–#443 | 依赖与验收措辞 | #421 正文单写者 |

## 决定范围

- 有权决定者：PanQiWei（项目要求、架构、Tool 契约、assets SPEC 的拥有者），决定记录见 [#618 的决定](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6314971717)。sessions-and-work 与 assets 的写回接受由各自拥有者作出。两个新服务键需 IC-6 评审。
- 决定日期及对应revision：2026-10-21，revision 1。
- 采用范围：「建议与改变范围」全部条款：对象链、会话常驻规则 R1–R5 与同形判据、采用点判定表与刷新点表、绑定登记表的键与 conflict 政策、换代协调者的三个动词与保留义务、SYS-DYNAMIC 对 Tool 的十条验收判据，以及「受影响拥有者」表所列改变。采用不表示规范已切换或实现完成。
- 不采用范围及必要理由：层序求值算法、变体、Profile 对象、MCP 动态规则、远端加载提供者、协调者 GC 策略。它们各有接缝，由后续提案承接。
- 未决与依赖停止点：`WorkspaceId` 的拥有者（归 workspaces 域或 identity 域；Tool 在边界用不透明品牌文本，拥有者定义后替换）；协调者系统主体的授予写法（IC 评审）。两者不阻塞本提案采用。

## 写回现行正文

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换或解除依据及确认者 |
| --- | --- | --- | --- |
| Tool 验收判据；119 行刷新规则收窄 | `docs/requirements.md` | 已写回（2026-10-21，#618 分支） | 已切换，本页引用；PanQiWei 接受（[6335123860](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)） |
| 81 行收窄；新能力在采用点加入；同形才跟的引用 | `docs/architecture/runtime/assembly-and-change.md` | 已写回（2026-10-21，#618 分支） | 已切换；PanQiWei 接受（[6335123860](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)） |
| 已知能力不可用与替换的措辞 | `docs/architecture/runtime/tool-runtime.md` | 已写回（2026-10-21，#618 分支） | 已切换；PanQiWei 接受（[6335123860](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)） |
| LIFECYCLE-M02 的 Tool 部分 | `docs/architecture/deployment/cordis-and-lifecycle.md` | 已写回（2026-10-21，#618 分支） | 已切换；PanQiWei 接受（[6335123860](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)） |
| 新事实种类、冻结状态与原因 | `docs/architecture/runtime/session-and-run.md`、`docs/domains/sessions-and-work/` | 已写回（2026-10-21，#618 分支）；Session 成员正文由 [#580 评论](https://github.com/nemori-ai/omne-harness-lite/issues/580#issuecomment-6315702781) 承接 | PanQiWei 接受（[6335123860](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)）；Session 成员正文的跟改由 #580 落位 |
| 换代协调者归属 | `docs/domains/assembly-and-handoff/README.md`、`docs/domains/tool-execution/README.md` | 已写回（2026-10-21，#618 分支） | 已切换；PanQiWei 接受（[6335123860](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)） |
| 对象链、R1–R5、G7、协调者、P16 补充 | `packages/tool/tool-contract/SPEC.md`、`docs/object-model.md`、`docs/public-api.md` | 已写回（2026-10-21，#618 分支）；源码迁移归 [#626](https://github.com/nemori-ai/omne-harness-lite/issues/626) | 正文已切换；源码未切换 |
| 登记输入、新键、事件 | `packages/tool/tool-cordis-contract/docs/cordis.md` | 已写回（2026-10-21，#618 分支）；键与事件的源码归 #626 | 正文已切换；源码未切换 |
| 第 8 项 helper 的形状、生命周期与失败边界 | `packages/assembly/kernel-basis/SPEC.md` | 已写回（2026-10-25，#626 分支），依据 [helper 采用](https://github.com/nemori-ai/omne-harness-lite/issues/626#issuecomment-6369465540)；源码与 Model 调用点归 #626 | 正文已切换，确认者为 M1 串行接任会话代 PanQiWei（[#626 revision 4 修订决定](https://github.com/nemori-ai/omne-harness-lite/issues/626#issuecomment-6395260809)）；源码由 #626 revision 4 的阶段 2 切换 |
| 作者插件、协调者、保留义务 | `packages/tool/tool-host-local/docs/cordis.md` | 已写回（2026-10-21，#618 分支）；实现归 2.4、2.4.1 | 正文已切换；实现未交付 |
| 跟随规则例外；tool body 字段 | `packages/assets/assets/SPEC.md` | 已写回（2026-10-21，#618 分支） | 已切换；assets 拥有者 PanQiWei 接受（[6335123860](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)） |
| 动态装载探针 | `.meta_harness/design/basis/cordis/` | 已写回：条目 `late-plugin-load-unload-does-not-rerun-others` 与 `kernel-basis` 探针，4.0.4 通过 | 已切换 |
| 产品后果（常驻工具、冻结、同形才跟、厂商一致性） | `.meta_harness/design/product/`（tool-execution、assets-and-rules、sessions-and-work、agent-progression、workspaces、model-invocation） | 已写回（2026-10-21，#618 分支），各 topic revision 已升 | 产品负责人 PanQiWei 接受（[6335123860](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)） |
| 统一语言与领域对象 | `.meta_harness/design/ubiquitous_language/`、`domain_objects/` | 已写回（2026-10-21，#618 分支）：新增常驻工具集合、同形、来源层、会话冻结、采用点、采用依据；C-65、C-66 | `check:design` 对账一致 |
| 阶段二子卡与新卡 | #421 revision 5、#439–#444 revision 2、#626（2.0.1）；#580、#619、#446、#502 的要求评论 | 已完成（2026-10-21） | 各卡单写者读回 |

## 后继关系与维护

| 后继提案或更正依据 | 部分或全部取代的精确范围 | 当前规范入口 |
| --- | --- | --- |
| 无 | 无 | 见「写回现行正文」各目标源 |

留给后续提案的接缝：一份资产引用多个实现并按 `ToolInspection.consumer` 选变体；资产层 Profile 对象；层序求值器与 `register` 的候选选择输入；MCP 动作的常驻规则；远端加载提供者；协调者 GC 策略。
