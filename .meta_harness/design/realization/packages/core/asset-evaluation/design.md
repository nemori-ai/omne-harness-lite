# asset-evaluation 实现设计

契约：[`capability.asset-evaluation` v1](../../../../spec/capabilities/asset-evaluation/v1/contract.md)（candidate）。下文的 S-n、C-n、PRE-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块。**四步求值、三条层序、锁截断、官方件下界、工作区滤权都是本项目的产品语义（PF-002），没有可采用的实现。

- **包内依赖**：[asset-model](../asset-model/README.md)（全部输入输出的值类型、`carrierRecordId`、表示层判定）、[tool-model](../tool-model/README.md)（六类正文的两条规则、执行权限的三档、干预力的档）、`@omne-harness-lite/identity-values`（`TenantId`、`MembershipStanding`、`TenantRole`）。catalog 登记的依赖正是这几份契约。
- asset-model 的判定要一套正文端口（[那里的选择](../asset-model/design.md#正文契约的判定经端口注入不-import-tool-model)）；**本模块自己就是一个组合根**：模块加载时用 tool-model 导出的实现构造一次 asset-model 的判定对象，只在本模块内用。
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
| [S-5](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-5-层与三条层序)～[S-8](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-8-求值结果-effectiveassembly) 层、输入、一致性 C1～C13、结果 | 类型 `EvaluationInput`、`EffectiveAssembly`、`Layer`、`FilterReason`、`SessionAssignment`、`McpActionSet` | C1 交给 asset-model 的判定；C2～C13 逐条判，任一不满足即 `invalidInput`，诊断信息附带那条的编号与（若有）asset-model 的拒绝值 | V-6（examples E-5 八份）；**五个列表按集合读**：交出时按能力标识的码点序排好，两份结果相等就是逐项相等 |
| [S-10](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-10-各类正文契约须供的两条规则) 各类正文的两条规则 | 内部规则表：六类取 tool-model 的实现；`plugin` 的规则一是它的 `members`（`data.asset-model/v1#S-11`），规则二「推不出」（G-9）；`agent_definition` **没有条目** | 静态组合，不经端口（[下节](#正文规则直接-import不经端口)） | PRE-6（规则确定、可重放）由 tool-model 的推出规则保证；缺条目的类别按 S-12「这一类求不了」，**不当作没有引用、没有属性项** |
| [S-11](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-11-纯计算)～[S-13](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 纯计算、缺席的默认答案、两条通道 | `evaluate` 与 `readWorkspaceCarrier` 的返回类型：`{ ok: … } \| { invalidInput: { diagnostics } }` | 判出来的 `filteredOut`、`unresolved` 只在 `ok` 里；两种返回类型不相容 | SC-1、SC-3 |
| [S-15](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-15-evaluate) evaluate；[S-17](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-17-第一步之一先按禁用滤)～[S-26](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-26-每份持有都有去处)、[S-38](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-38-常驻值)～[S-42](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-42-执行权限项另带租户那一层写得进自动吗) 四步的规则 | `evaluate(input)` | 第 1 步：先按禁用滤（析取）、再判「谁可以使用它」、再取最具体的一份并在最外那把锁处截断，官方件是下界；第 2 步：从 `root` 沿规则一展开，就地求 plugin「启用哪些成员」；第 3 步：规则二推属性项（`mcp` 用给定的动作集）；第 4 步：设置覆盖、权限求交与落档、工作区只贡献设置、工作区提供的资产的权限取最严 | V-1～V-5、V-8、V-9 的规范场景（E-1～E-6）。**第 2 步从 `root` 起不了步**（G-3）、**成环没有收场值**（G-1）：见缺口 [AE-1、AE-2](#实施缺口与消费者影响) |
| S-15 ⑦ 结果可缓存、键须覆盖整份输入 | `evaluationInputFingerprint(input)` | 整份输入的规范 JSON（成员名按码点序、无空白、数字按原文）取 SHA-256 | 给消费者一个**不会漏项**的缓存键，SC-2 的检查就只剩「消费者用的是它」；[下节](#给消费者一个整份输入的指纹) |
| [S-16](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-16-readworkspacecarrier)、[S-27](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-27-清单列的资产变成工作区那一格的持有)、[S-28](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-28-配值与禁用只对工作区提供的资产生效丢掉的留痕) 清单读入 | `readWorkspaceCarrier(manifest, workspace) → { ok: { holdings, dropped } } \| { invalidInput }` | 清单列的每份资产一份 `carrier` 支持有，记录号取 `carrierRecordId`；`immutable` 标记与指向清单没列的资产的条目以 `DropReason` 留痕；**不读文件、不解析资产包**；持有与配值上的 `since` 留空，由调用方以读到文件的时刻补 | V-4（E-3）。输入是**已解析**的清单值；把文件读成值的那一步要用 asset-model 的 `parseWorkspaceManifestText`（[AM-4](../asset-model/design.md#实施缺口与消费者影响)） |
| [S-31](../../../../spec/capabilities/asset-evaluation/v1/contract.md#s-31-unresolved-交到装配手上怎么收场) `unresolved` 交到装配手上 | — | 本模块只保证不漏记；「非空即装配失败」由装配（PF-004）兑现 | 不在本节点 |

### 正文规则直接 import，不经端口

| | 与 asset-model 一样经端口注入 | **直接 import tool-model 的实现（本节点选）** |
|---|---|---|
| 包级依赖 | 无 | asset-evaluation → tool-model、asset-model；两者都不依赖本包，**无环** |
| 缺一类规则 | 构造时发现 | 不会缺：规则表是静态的；`agent_definition`、plugin 规则二的缺席是契约状态（G-3、G-9），不是配置 |
| 可替换性 | 测试可换一套规则 | 测试用真实规则（契约 examples 本来就用真实形状） |

**落选方的最强论证**：与 asset-model 同一种写法，读者只学一种；测试可以用最小的假规则隔离四步本身。
**它输在没有要解开的环**：端口在 asset-model 那里是被环逼出来的，这里多一个端口就多一处组合根要维护，却不换来任何边界价值。
**本方弱点**：tool-model 的推出规则一改，本模块的规范场景就可能跟着变；两者的回归要一起跑。置信度：**中高**。

### 给消费者一个整份输入的指纹

S-15 ⑦ 与 SC-2 要求消费者的缓存键覆盖整份输入（含 `standing`、`workspace`、会话配值、选用版本与动作集），不得只以 `(tenant, root)` 为键。
**不提供**这个函数，注册表、MCP 桥、拓展件派发、设置视图四处各自拼键，任何一处漏一项就是一次静默的陈旧读；**提供**它，键的完整性由输入类型本身兜底，SC-2 退化成「消费者用的是这个函数」。
**落选方的最强论证**：缓存是消费者的事，本模块不该替它们决定键。**本方弱点**：整份输入取摘要有代价（持有与定义多时每次求值前都要序列化一遍）；没有测量之前不做增量指纹。置信度：**中**。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.identity-values` v1（S-4 所列 10 条） | 已实现的 core 包 | 随包版本 | 静态 import |
| `data.asset-model` v1（21 条） | [asset-model](../asset-model/README.md)——它与另三个 core 节点成环（[MSG-1](../message-model/design.md#包级依赖成环)），本包因此**间接建不起来** | — | 划分定下之前没有可用的解析方式 |
| `data.mcp-endpoint`、`data.tool-definition`、`data.loop-extension` v1 与「各类正文契约的两条规则」 | [tool-model](../tool-model/README.md)（同上，在环上） | 同上 | 同上 |
| `capability.asset-transfer/v1#S-9`（PRE-2 的判据） | **不是依赖**：由组输入的一方现读，本模块不读 | — | — |
| 被消费 | 资产治理（设置视图）、注册表、MCP 桥、拓展件派发、据点装配 | 普通包依赖 | 契约出 v2 另开入口 |

**没有配置项。**

## 状态、并发与失败映射

**无状态、无提交点、无并发**：两个操作是输入的函数，模块内唯一的「状态」是加载时构造的 asset-model 判定对象，构造后不可变。
一次调用被取消或中途失败没有任何外部效果需要收口（S-30）。

**失败映射**：`invalidInput`（输入不合法，求值没有发生，**不返回半份结果**）；判出来的 `filteredOut`、`unresolved` 在成功结果里。两种返回类型不相容（S-13）。
**G-1、G-3 两处没有合规返回**（缺口 AE-1、AE-2）：本节点不自选一个值；实现落地前须由主线裁定。**不抛异常代替失败值**，也**不交出把缺口填成空集的结果**（S-15 ⑧）。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-3](../../../../spec/capabilities/asset-evaluation/verification.md#静态检查义务)（都**尚无**）：

| 检查 | 形式 | 现状 |
|---|---|---|
| SC-1 不读存储、时钟、文件与进程状态，不写任何东西 | 时钟：现有 `no-wall-clock` 规则扫描范围含 `core/`，包落地即生效；其余：本包 import 白名单（候选：只许 asset-model、tool-model、identity-values 与 `node:crypto`），照现有 `ops-import-whitelist` 的写法 | 时钟规则存在；白名单规则不存在 |
| SC-2 消费者的缓存键覆盖整份输入 | 规则（候选）：消费者包里对 `evaluate` 结果的缓存只许以 `evaluationInputFingerprint` 为键 | 不存在；扫的是消费者包 |
| SC-3 不把 `invalidInput` 转成空结果、不把 `unresolved` 升成 `invalidInput` | 类型：两种返回不相容，`EffectiveAssembly` 没有「空的」构造入口；本包内再加一条单元测试核 E-5 八份输入都没有结果 | 无 |

## 实施缺口与消费者影响

契约的 G-3、G-4、G-6～G-9、G-14、G-18、G-19 不重抄。**两条契约缺口在本节点上的后果**必须单列，因为它们让操作本身没有合规的返回：

- **AE-1 `evaluate` 在 G-3 闭合前没有合规的返回**：`root` 必为 `agent_definition`（C2），而这一类的规则一缺席（G-3），第 2 步从 `root` 起不了步；S-12 说这时「本契约对这一类不给结果」，S-15 ⑥ 的失败集合里却没有对应的值，S-15 ⑧ 又禁止交出填了空集的结果。**所以对任何合法输入，实现都拿不出一个合规的返回。**
  受阻：注册表（按类别重填）、MCP 桥（逐动作项）、拓展件派发、据点装配、资产治理的设置视图——凡调 `evaluate` 的都受阻。
  owner：**主线**（条款坐标 `capability.asset-evaluation/v1#S-12`、`#S-15` ⑥⑧、G-3）：要么等 PF-004 的契约给出 Agent Definition 的两条规则，要么在失败集合里加一个「这一类求不了」的值，要么另给一个不从 `root` 展开的操作供设置视图用。本节点不自选。
- **AE-2 含（算数的）环的输入没有合规的返回**：S-15 ⑥ 的收场值名待定（G-1），契约明写「实现不得据猜测选一个值」。受阻：同上，只在输入含环时。owner：**主线**（G-1）。
- **AE-3 包建不起来**：本包不在环上，但它依赖的 asset-model 与 tool-model 在（[MSG-1](../message-model/design.md#包级依赖成环)）。owner：主线。
- **AE-4 清单读入的上一步**：本模块收的是已解析的清单值；读文件、防符号链接逃逸、用能看见重复成员名的读法解析，归读文件的一方（PRE-7、[AM-4](../asset-model/design.md#实施缺口与消费者影响)）。跨节点交接：据点侧读工作区的节点。
