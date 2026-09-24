# asset-evaluation 实现设计

契约：[`capability.asset-evaluation` v1](../../../../spec/capabilities/asset-evaluation/v1/contract.md)（candidate）。下文的 S-n、C-n、PRE-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块。**四步求值、三条层序、锁截断、官方件下界、工作区滤权都是本项目的产品语义（PF-002），没有可采用的实现。

- **包内依赖**：[asset-model](../asset-model/README.md)（全部输入输出的值类型、`carrierRecordId`、表示层判定）；[tool-definition](../tool-definition/README.md)（执行权限三档）、[loop-extension](../loop-extension/README.md)（干预力的档）、[mcp-endpoint](../mcp-endpoint/README.md)（接入点正文与动作集的推出规则）——这三份是 catalog 登记的契约依赖；另从 [skill-package](../skill-package/README.md)、[slash-command](../slash-command/README.md)、[connector](../connector/README.md) 取各自那一类的两条规则（契约 S-4 末段「按规则引用，不按坐标」）；`@omne-harness-lite/identity-values`（`TenantId`、`MembershipStanding`、`TenantRole`）。包依赖图随之无环（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
- asset-model 的判定要一套正文端口（[那里的选择](../asset-model/design.md#正文契约的判定经端口注入不-import-正文包)）；**本模块自己就是一个组合根**：模块加载时把六个正文包各自导出的那一份组合成 `BodyContracts`、构造一次 asset-model 的判定对象，只在本模块内用。
- **Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。中心的资产治理（设置视图）、据点的注册表、MCP 桥、拓展件派发与装配各自 `import` | [S-11](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-11-纯计算)：不读存储、时钟、文件、进程状态 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**。[S-30](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-30-本能力没有在途工作)：提供者被撤除或替换时「没有任何事实只活在它的运行实例里，没有东西要交接」——本模块连运行实例都没有；消费者插件被重跑时丢掉的只是它自己缓存的结果，重求即可 | 与契约「撤除／在途」逐条对齐 |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**（两个操作的 ⑨）。没有事件能越过租户或会话边界。输入里带 `tenant`、`workspace`，求出的结果只对这一份输入成立；**谁能以某个租户求值**（PRE-3）归组输入的一方，本模块核不到 | — |
| 存储 | **无**：不读写任何存储。组输入时的「同一时刻的一致读」（PRE-1）与「分享此刻成立」（PRE-2）是读存储那一方的事，存储要求在 [asset-governance](../../assets/asset-governance/README.md) 节点 | [S-29](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-29-装配给的保证-vs-协议须给的保证) |

### 装配给 vs 协议给：单机时本节点提供了什么

[S-29](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-29-装配给的保证-vs-协议须给的保证) 七行里，本节点只兑现第一行「同输入同输出」（纯计算，任何部署形态下不变）与第六行键比较那一半（C3：工作区键的租户那一半等于 `tenant`）。
其余五行（一致读、分享此刻成立、调用方已核实、清单就是目录里那份、出厂持有齐全）**全部由组输入的一方与装配给**，本模块照契约把它们当前提、不检查。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-5-层与三条层序)～[S-8](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-8-求值结果-effectiveassembly) 层、输入（`root` 是组合根引用集 `{ definition, references }`，M31）、一致性 C1～C14、结果 | 类型 `EvaluationInput`、`CompositionRoot`、`AssetReference`、`EffectiveAssembly`、`Layer`、`FilterReason`、`SessionAssignment`、`McpActionSet` | C1 交给 asset-model 的判定；C2～C14 逐条判，任一不满足即 `invalidInput`，诊断信息附带那条的编号与（若有）asset-model 的拒绝值 | V-6（examples E-5 八份）；**五个列表按集合读**：交出时按能力标识的码点序排好，两份结果相等就是 `root` 相同、逐项相等 |
| [S-10](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-10-各类正文契约须供的两条规则) 各类正文的两条规则 | 内部规则表：六类取六个正文包的实现；`plugin` 的规则一是它的 `members`（`data.asset-model/v1#S-11`），规则二与「启用哪些成员」推不出（G-21）；组合根的规则一由输入的 `root.references` 给出；**根以外的 `agent_definition`（sub-agent）没有条目**（G-3） | 静态组合，不经端口（[下节](#正文规则直接-import不经端口)） | PRE-6（规则确定、可重放）由各正文包的推出规则保证；缺条目的类别按 S-12「这一类求不了」，**不当作没有引用、没有属性项** |
| [S-11](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-11-纯计算)～[S-13](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 纯计算、缺席的默认答案、`invalidInput` 与判出结果分开、`compositionCycle` | `evaluate` 的返回类型：`{ ok: EffectiveAssembly } \| { invalidInput: { diagnostics } } \| { compositionCycle: { cycle } }`；`readWorkspaceCarrier` 只有前两支 | 判出来的 `filteredOut`、`unresolved` 只在 `ok` 里；三支互不相容；两种失败同时成立时报 `invalidInput`（S-13 末段） | SC-1、SC-3 |
| [S-15](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-15-evaluate) evaluate；[S-17](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-17-第一步之一先按禁用滤)～[S-26](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-26-每份持有都有去处)、[S-38](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-38-常驻值)～[S-42](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-42-执行权限项另带租户那一层写得进自动吗) 四步的规则 | `evaluate(input)` | 第 1 步：先按禁用滤（析取）、再判「谁可以使用它」、再取最具体的一份并在最外那把锁处截断，官方件是下界；第 2 步：`root.definition` 没有生效资产即进 `unresolved`、`composition` 为空，否则从 `root.references` 沿规则一展开（深度优先、带路径集合；走回路径上的能力标识即以 `compositionCycle` 收场，诊断取按码点序最小的起点写，确定但不承诺），就地求 plugin「启用哪些成员」；第 3 步：规则二推属性项（`mcp` 用给定的动作集）；第 4 步：设置覆盖、权限按[界与挑选](#s-23-的界与挑选单独导出)求交与落档、工作区只贡献设置、工作区提供的资产的权限取最严 | V-1～V-5、V-8、V-9 的规范场景（E-1～E-6）与 S-43（成环即拒）。**组合里走到 plugin 或 sub-agent 时没有合规返回**：见缺口 [AE-1](#实施缺口与消费者影响) |
| S-23 界与挑选（单独导出，供资产治理写时守卫） | `classifyPermissionAssignment(declaration, assignment) → { role: "bound" \| "pick", tiers: TierOrder \| null }`；`boundOf(declaration, bounds)`；`pickWithinBound(pick, bound)`（候选名） | **与 `evaluate` 第 4 步共用同一实现**：第 4 步的权限合成（S-23 合成第 1、2 条）就是调这三个函数，不另写一份；见[下节](#s-23-的界与挑选单独导出) | S-23 的产品原话表七行各作一条单元检查；资产治理 S-38～S-41 的写时守卫据它判 `lockedAbove`、`selectionNotSingleTier` |
| S-15 ⑦ 结果可缓存、键须覆盖整份输入 | `evaluationInputFingerprint(input)` | 整份输入（含 `root.references`）的规范 JSON（成员名按码点序、无空白、数字按原文，经 content-blocks 的 `writeJsonLossless`）取 SHA-256 | 给消费者一个**不会漏项**的缓存键，SC-2 的检查就只剩「消费者用的是它」；[下节](#给消费者一个整份输入的指纹) |
| [S-16](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-16-readworkspacecarrier)、[S-27](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-27-清单列的资产变成工作区那一格的持有)、[S-28](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-28-配值与禁用只对工作区提供的资产生效丢掉的留痕) 清单读入 | `readWorkspaceCarrier(manifest, workspace) → { ok: { holdings, dropped } } \| { invalidInput }` | 清单列的每份资产一份 `carrier` 支持有，记录号取 `carrierRecordId`；`immutable` 标记与指向清单没列的资产的条目以 `DropReason` 留痕；**不读文件、不解析资产包**；持有与配值上的 `since` 留空，由调用方以读到文件的时刻补 | V-4（E-3）。输入是**已解析**的清单值；把文件读成值的那一步要用 asset-model 的 `parseWorkspaceManifestText`（[AM-4](../asset-model/design.md#实施缺口与消费者影响)） |
| [S-31](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-31-unresolved-交到装配手上怎么收场) `unresolved` 交到装配手上 | — | 本模块只保证不漏记；「非空即装配失败」由装配（PF-004）兑现 | 不在本节点 |

### 正文规则直接 import，不经端口

| | 与 asset-model 一样经端口注入 | **直接 import 六个正文包的实现（本节点选）** |
|---|---|---|
| 包级依赖 | 无 | asset-evaluation → 六个正文包、asset-model；它们都不依赖本包，**无环** |
| 缺一类规则 | 构造时发现 | 不会缺：规则表是静态的；sub-agent 的规则一、plugin 与 Agent Definition 的规则二缺席是契约状态（G-3、G-21），不是配置 |
| 可替换性 | 测试可换一套规则 | 测试用真实规则（契约 examples 本来就用真实形状） |

**落选方的最强论证**：与 asset-model 同一种写法，读者只学一种；测试可以用最小的假规则隔离四步本身。
**它输在没有要解开的环**：端口在 asset-model 那里是被环逼出来的，这里多一个端口就多一处组合根要维护，却不换来任何边界价值。
**本方弱点**：任一正文包的推出规则一改，本模块的规范场景就可能跟着变；回归要一起跑。置信度：**中高**。

### S-23 的界与挑选单独导出

资产治理的写时守卫（`capability.asset-governance/v1` 的 S-38～S-41：`lockedAbove`、`selectionNotSingleTier`）要在**写一条配值时**判它是界还是挑选、这一项分不分档、一条挑选落不落在外层的界内——手上只有这一项的声明与相关几条配值，**没有、也不该组一份整份求值输入**。

| | 资产治理调整份 `evaluate` | 资产治理按 S-23 自己写一份判定 | **本模块单独导出、与第 4 步共用（本节点选）** |
|---|---|---|---|
| 写时拿得到的输入 | 要组四格持有、定义、`root`……写一条配值时没有这些 | 够 | 够：只收声明、配值与界 |
| 同一规则几份实现 | 一份 | **两份**：写时守卫与求值对「`{forbid}` 锁不锁都是界」「空集挑选在任何界内都算数」各读一遍，一处改了另一处不知道 | 一份：第 4 步的合成调的就是这几个函数 |

**导出面**（候选名）：`classifyPermissionAssignment(declaration, { value, immutable })` 判界或挑选（界 = 带锁，或执行权限上恰为 `{forbid}`）并给出这一项的档序（执行权限、干预力，或不分档）；`boundOf(declaration, bounds)` 求 `X = D ∩ 各条界`；`pickWithinBound(pick, X)` 判 `P ∩ X` 非空或 `P` 是空集。**合成第 3 条（没有挑选落在界内时的落档）不导出**：写时守卫用不到，它只在第 4 步里。
**落选方（资产治理自写）的最强论证**：写时守卫只是「效果的权威在求值」之外的一道提前拒绝（AG S-38 末段），自写更少跨包耦合。**它输给「同一概念一个权威定义」**：界的判法已改过一次（PF-002 rev 17 §5.3），两份实现在那次改动里就会分叉。**本方弱点**：本模块的公开面从两个操作扩到五个函数，契约只写了两个操作——这三个是契约 S-23 规则的投影，不是新语义；它们的签名一改，资产治理与第 4 步一起改。置信度：**高**。

### 给消费者一个整份输入的指纹

S-15 ⑦ 与 SC-2 要求消费者的缓存键覆盖整份输入（含 `standing`、`workspace`、会话配值、选用版本与动作集），不得只以 `(tenant, root)` 为键。
**不提供**这个函数，注册表、MCP 桥、拓展件派发、设置视图四处各自拼键，任何一处漏一项就是一次静默的陈旧读；**提供**它，键的完整性由输入类型本身兜底，SC-2 退化成「消费者用的是这个函数」。
**落选方的最强论证**：缓存是消费者的事，本模块不该替它们决定键。**本方弱点**：整份输入取摘要有代价（持有与定义多时每次求值前都要序列化一遍）；没有测量之前不做增量指纹。置信度：**中**。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.identity-values` v1（S-4 所列 10 条） | 已实现的 core 包 | 随包版本 | 静态 import |
| `data.asset-model` v1（21 条） | [asset-model](../asset-model/README.md) | 随包版本 | 静态 import |
| `data.mcp-endpoint`、`data.tool-definition`、`data.loop-extension` v1 | [mcp-endpoint](../mcp-endpoint/README.md)、[tool-definition](../tool-definition/README.md)、[loop-extension](../loop-extension/README.md) | 随包版本 | 静态 import |
| 「各类正文契约的两条规则」（S-4 末段，按规则引用） | 上三包与 [skill-package](../skill-package/README.md)、[slash-command](../slash-command/README.md)、[connector](../connector/README.md) 各导出的规则 | 随包版本 | 静态 import；这三包不依赖本包，不成环 |
| 无损 JSON 写（指纹用） | [content-blocks](../content-blocks/design.md#严格的无损-json-读写) 的 `writeJsonLossless`——不是契约依赖，是工具；它经 asset-model 本就可达，直接依赖不引入环 | 随包版本 | 静态 import |
| `capability.asset-transfer/v1#S-9`（PRE-2 的判据） | **不是依赖**：由组输入的一方现读，本模块不读 | — | — |
| 被消费 | 资产治理（设置视图；写时守卫用界与挑选三函数）、注册表、MCP 桥、拓展件派发、据点装配 | 普通包依赖 | 契约出 v2 另开入口 |

包依赖的环检查按 [D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)：本包在依赖图的顶上，没有 core 包依赖它。**没有配置项。**

## 状态、并发与失败映射

**无状态、无提交点、无并发**：两个操作是输入的函数，模块内唯一的「状态」是加载时构造的 asset-model 判定对象，构造后不可变。
一次调用被取消或中途失败没有任何外部效果需要收口（S-30）。

**失败映射**：`invalidInput`（输入不合法，求值没有发生，**不返回半份结果**）；`compositionCycle`（第 2 步判出的环，带 `cycle` 诊断，同样不返回半份）；判出来的 `filteredOut`、`unresolved` 在成功结果里。三支返回类型不相容（S-13）。
**组合里走到 plugin 或 sub-agent 时没有合规返回**（缺口 AE-1）：本节点不自选一个值，实现落地前须由主线裁定；**不抛异常代替失败值**，也**不交出把缺口填成空集的结果**（S-15 ⑧）。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-3](../../../../spec/capabilities/asset-evaluation/verification.md#静态检查义务)（都**尚无**）：

| 检查 | 形式 | 现状 |
|---|---|---|
| SC-1 不读存储、时钟、文件与进程状态，不写任何东西 | 时钟：现有 `no-wall-clock` 规则扫描范围含 `core/`，包落地即生效；其余：本包 import 白名单（候选：只许 asset-model、六个正文包、content-blocks、identity-values 与 `node:crypto`），照现有 `ops-import-whitelist` 的写法 | 时钟规则存在；白名单规则不存在 |
| SC-2 消费者的缓存键覆盖整份输入 | 规则（候选）：消费者包里对 `evaluate` 结果的缓存只许以 `evaluationInputFingerprint` 为键 | 不存在；扫的是消费者包 |
| SC-3 不把 `invalidInput`、`compositionCycle` 转成空结果、不把 `unresolved` 升成失败 | 类型：三支返回不相容，`EffectiveAssembly` 没有「空的」构造入口；本包内再加单元测试核 E-5 八份输入与 S-43 的成环输入都没有结果 | 无 |

## 实施缺口与消费者影响

契约的 G-3、G-4、G-6～G-9、G-14、G-18、G-19、G-21 不重抄。本节点自己的缺口（编号不重排）：

- **AE-1 组合里走到 plugin 或 sub-agent 时没有合规的返回（收窄）**：[D-040 §八 M31](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 之后第 2 步从 `root.references` 起步，**不含 plugin、不含根以外 `agent_definition` 的组合已有合规返回**。仍兑现不了的一支：展开走到一份 `plugin` 生效资产（「启用哪些成员」推不出，契约 G-21 ②）或一份 sub-agent（引用列表拿不到，G-3）时，S-20 与 S-12 说「本契约对这一类不给结果」，S-15 ⑥ 却写「没有别的失败」，S-15 ⑧ 又禁止交出填了空集的结果——**这样的输入没有一个合规的返回**。
  受阻：凡调 `evaluate` 而组合里可能有 plugin 或 sub-agent 的——注册表、MCP 桥、拓展件派发、据点装配、资产治理的设置视图；契约规范场景 E-1～E-6 若含 plugin 同样受阻。
  owner：**主线**（条款坐标 `capability.asset-evaluation/v1#S-15` ⑥⑧、`#S-20`「plugin 的启用哪些成员」一段、G-3、G-21）：候选是失败集合再加一个「这一类求不了」的值（带那个能力标识作诊断），或等 plugin 与 PF-004 的正文契约。本节点不自选。
- **AE-2 已关闭**：成环的收场值由 [D-040 §八 M32](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 定为 `compositionCycle`，已落进上表。
- **AE-3 已关闭**：包级依赖成环由 D-040 §八 M41 解开。
- **AE-4 清单读入的上一步**：本模块收的是已解析的清单值；读文件、防符号链接逃逸、用 asset-model 的 `parseWorkspaceManifestText`（看得见重复成员名）解析，归读文件的一方（PRE-7、[AM-4](../asset-model/design.md#实施缺口与消费者影响)）。跨节点交接：据点侧读工作区的节点。
- **AE-5 组输入的两份上游（下一程）**：`root.references` 由装配清单的读方从 Agent Definition 正文读出（PRE-9）——装配清单契约（PF-004）**本程不补**，D-040 §八 M43 C-2；据点上组输入要的「四格同一时刻的一致读」（PRE-1）经中心事实副本的读面——**本程不补**，M43 C-3（随入口组合 v2）。owner：主线。本模块不受阻（它只收值）；受阻的是据点侧组输入的一方（注册表、据点装配）。
- **AE-6 界与挑选的签名对齐**：三个导出函数的签名要与 asset-governance 节点的写时守卫对齐。跨节点交接：asset-governance 节点的设计写一行「调 `core/asset-evaluation` 的界与挑选」。owner：本节点与 asset-governance 节点。
