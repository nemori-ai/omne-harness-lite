# capability.asset-registry v2

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-registry, 2)`
- **状态**：已由 D-061 接受；精确资源冻结与采用状态由版本外入口及 registry 维护。
- **设计依据**（PF-002 rev 20、PF-006 rev 19、PF-004 rev 12；2026-09-24 逐版复核到当前 rev，变化与落点记在[验证入口](../verification.md#变化的影响)）：
  PF-002 [§4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)、
  [§4「会话认得哪些命令，什么时候变」](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)、
  [§4 Plugin](../../../../product/PF-002-assets-settings-and-permissions/design.md#plugin)、
  [§4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)、
  [§4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)、
  [§2 非目标](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标)（「一族里有哪几条、各刷哪张注册表归规格」），
  decisions [2026-09-23 斜杠命令五答](../../../../product/PF-002-assets-settings-and-permissions/design.md)（含「未决一」原话）与
  [2026-09-23 reload 是注册表的动态热更新](../../../../product/PF-002-assets-settings-and-permissions/design.md)；
  PF-006 [§4 常驻](../../../../product/PF-006-tools-and-skills/design.md#常驻)、[槽位](../../../../product/PF-006-tools-and-skills/design.md#槽位)、
  [依赖](../../../../product/PF-006-tools-and-skills/design.md#依赖)、[只有且，只有必需](../../../../product/PF-006-tools-and-skills/design.md#只有且只有必需)、
  [可用性](../../../../product/PF-006-tools-and-skills/design.md#可用性)、[替换件](../../../../product/PF-006-tools-and-skills/design.md#替换件)、
  [§6.1](../../../../product/PF-006-tools-and-skills/design.md#61-常驻标记挂在引用条目上agent-definition-压-plugin)～[§6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)、
  [§6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)（含[「接入点连不上」](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)）；
  PF-004 [§4 装配清单](../../../../product/PF-004-agent-definition-and-assembly/design.md#装配清单)、[§6.1](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)、
  [§6.3](../../../../product/PF-004-agent-definition-and-assembly/design.md#63-三类变化三种传播)（**只引**；含 rev 12「构成变小也重新装配，下一次运行起生效」）、[§6.2 装配](../../../../product/PF-004-agent-definition-and-assembly/design.md#62-装配)（引用无人提供即明确失败）；
  PF-002 [§4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)（动作集每一次执行尝试开始前重算）、[§5.2「谁可以使用它」](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)（判下来不能用的不装、收回自下一次运行起）
- **相邻依据**：PF-007 rev 18 [§5.7](../../../../product/PF-007-meta-capabilities/design.md#57-权限能关掉一条命令关不掉一扇门)、
  [meta 与常驻的关系](../../../../product/PF-007-meta-capabilities/design.md#meta-与常驻的关系)、
  [§6.1 `Tools()`](../../../../product/PF-007-meta-capabilities/design.md#61-tools通向任意非常驻工具)、[§6.2 `Skills()`](../../../../product/PF-007-meta-capabilities/design.md#62-skills通向任意技能)（只引）；
  PF-012 rev 14 [「每一次尝试开始，都要做四件事」](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)、[当下条件](../../../../product/PF-012-agent-loop-and-run/design.md#当下条件)；
  PF-015 rev 11 [会话运行模式](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#会话运行模式)、
  [§5.8](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#58-存储要守住的两件事)、
  [§6.11](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#611-会话睡醒之后还是原来那个)、
  [§6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)；
  PF-016 rev 8 [§6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)；
  [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)、
  [SYS-COMPOSITION.C4](../../../../foundation/definition-and-runtime-composition/requirements.md#sys-compositionc4变化作用于下一次装配)
- **主线裁定**（长期落点 D-060，产品负责人尚未逐条追认）：
  - 会话资产注册表按类别一张、reload 一族一条刷一张、plugin 连带（A9）；热更新对进行中运行的呈现时机留缺口（A10）——D-060 §块 A；
  - reload 结果记进装配清单（PB-6）——D-060 §块 B；
  - `onAssetChange` 只收窄（S22-a）；`markFailed` 只去掉失败那一条（S22-b）；`filledBy` 加 `asset_change`、`unavailable` 沿用 `capability.organization-governance` 的收场名（S22-c）；**可用性变化不出提醒**（S22-d）；重启按装配清单记下的构成与那一版正文重填（S22-e）；装配清单的追加面与 reload 记录形状归 PF-004 的契约（S22-g）——D-060 §S22；替换件与关掉的命令被调用落收场 `unavailable`——D-060 §S13 S13-a；
  - 「谁可以用」门控里**钉住的单位是[运行](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run)，不是执行尝试**（R2-13）——D-060 §三；**怎样兑现是本契约推导**：运行的第一次尝试钉住技能门控、同一运行的后续尝试沿用、运行里的读按它读（[S-11](#s-11-一次执行尝试的可用性报告)、[S-24](#s-24-refreshavailability每次执行尝试开始时现算)～[S-26](#s-26-list列一类)、[S-28](#s-28-onassetchange权限收回之后收窄)）。
- **产品正文已写的**：MCP 动作集**每一次执行尝试开始前**重算、一次尝试之内不变（[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)，rev 17 起）；技能「谁可以用」判下来不能用的不装（[PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)，rev 19 起）；关掉的命令走当下可用性（[PF-007 §5.7](../../../../product/PF-007-meta-capabilities/design.md#57-权限能关掉一条命令关不掉一扇门)，[S-9](#s-9-按命令的可用性)）。
- **主线裁定（第一轮独立评审的修复波）**——D-060 §五：执行尝试开始时钉住动作集之后**再求一次值**，逐动作执行权限与每个接入点的持有一起钉进报告，拿不到即 `unavailable`（K30，[S-11](#s-11-一次执行尝试的可用性报告)、[S-24](#s-24-refreshavailability每次执行尝试开始时现算)）；被引用的能力无人可用且无下一层时装配失败、由装配收口（K33，[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)）。
- **主线裁定（修复波 1b）**——D-060 §六 L13、L15：条目不在此刻组合里时那一项写 `not_in_composition`，`unavailable` 只留给求值本身失败（L15）；报告的 `effectivePermissions` 由「每条钉住的 MCP 动作条目恰一项」扩为「`tool` 表里每条条目恰一项」，作者写的与官方的工具取第二次求值里它 `execute` 那一项的 `EffectiveValue`（含 `tenantAutoWritable`），一次尝试内不变（[S-11](#s-11-一次执行尝试的可用性报告)、[S-24](#s-24-refreshavailability每次执行尝试开始时现算)）。
- **主线裁定（修复波 2）**——D-060 §七 M8、M10、M21：`tool` 表条目的查找键与 `effectivePermissions` 每一项的键都是模型面名字 `ModelToolName`，由定义名确定性推出（M8，[S-7](#s-7-注册表条目)、[S-11](#s-11-一次执行尝试的可用性报告)、[S-25](#s-25-lookup查一条)）；报告里查不到条目的调用不进放行判断，本契约 S-12 不变，`not_in_composition` 只指「条目仍在快照、能力标识不在此刻组合里」（M10）；meta 门条目的执行权限项恒为 `{auto}`、不读求值（M21，[S-11](#s-11-一次执行尝试的可用性报告)）。
- **主线裁定（修复波 3，实现映射反推）**——D-060 §八：同一 `EvaluationRef` 再 `fill` 而六张表已不是它填出的 ⇒ `invalidInput{evaluationSuperseded}`（M34，[S-22](#s-22-fill装配时填六张) ⑦）；`within = run{report}` 的读只在报告所依的快照里找，reload 之后的新条目下一次尝试起可见（M35，[S-25](#s-25-lookup查一条)、[S-8](#s-8-当下可用性的三个取值) 末段、[S-34](#s-34-进行中的运行与撤销)，原 [G-2](#十已知缺口) 闭合）；`apps/runtime-host` 改 `apps/cli`（M40，[S-31](#s-31-装配给的保证-vs-协议须给的保证)）；报告带这一次尝试的 `attempt`（M46，[S-11](#s-11-一次执行尝试的可用性报告)、[S-24](#s-24-refreshavailability每次执行尝试开始时现算)）。随 `capability.asset-evaluation` 的 M31（组合根引用集）、M32（`compositionCycle`）、M45（`categoryUnsupported`）：两次求值的配方带上同一个组合根，两个新失败值原样转交（[S-21](#s-21-这一节每个操作写全九件事) 总表、[S-23](#s-23-reload按类别重填) ⑥、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ②⑥；**转交是本契约推导，已报主线**）
- **主线裁定**（见 D-060 §六 N-10，原 G-16 闭合）：`onAssetChange` 作为权限收回的触发操作、可用性到命令粒度（`commandAvailability`）两条补充裁定（2026-09-23）；`slotConflict` 改名 `toolNameConflict`（整批对齐）
- **精确语义依赖**（十七项，消费 clauses 见 [S-4](#s-4-依赖方向与被消费的面)，catalog 按它登记）：
  - `omne-harness-lite-design-2026-09-15 · data.asset-model · v2`
  - `omne-harness-lite-design-2026-09-15 · data.tool-definition · v2`
  - `omne-harness-lite-design-2026-09-15 · data.loop-extension · v2`
  - `omne-harness-lite-design-2026-09-15 · data.messages · v2`
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`
  - `omne-harness-lite-design-2026-09-15 · data.call-accounts · v2`（2026-09-24 第一轮评审修订新增：报告带的运行标识 `RunId`）
  - `capability.asset-evaluation`、`capability.asset-governance`、`data.skill-package`、`data.slash-command`、`data.mcp-endpoint`、`capability.mcp-bridge`、`capability.tool-admission` 七份 v1（起草时并行、未登记；2026-09-24 整批对齐按条款号登记）
  - `capability.modality-projection` v2 与 `data.model-profile` v2（2026-09-24 整批对齐新增：工具两端模态的判法，[S-8](#s-8-当下可用性的三个取值) 第 8 条）
  - `omne-harness-lite-design-2026-09-15 · capability.assembly-manifest · v2`（2026-09-25「公开面」修订波新增，第十七项：换表的追加面与 `EvaluationRef` 的权威，[S-13](#s-13-evaluationref)、[S-18](#s-18-快照不持久装配清单是唯一权威)；那份契约不以坐标依赖本契约，无环）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用写全坐标，如 `capability.asset-registry/v2#S-15`。缺口编号 `G-n`，见[十](#十已知缺口)
- **词条与无词条的名字**：本契约兑现的就是[会话资产注册表](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-session-asset-registry--会话资产注册表--session-asset-registry)，**正文一律写这个全名，不裸写「注册表」**（引产品原话处照原话）；
  [谁可以使用它](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-usable-by--谁可以使用它--usable-by)是一项[权限](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-permission--权限--permission)，项名是 `data.asset-model` 保留的 `usableBy`。
  **注册表快照**、**注册表条目**、**可用性报告**、**动作清单持久副本**（`data.mcp-endpoint` 的 `ActionSnapshot`）**无词条**：本文不给它们下定义，只给它们在本契约里的记录形状；类型名 `RegistrySnapshot`／`RegistryEntry`／`AvailabilityReport`／`EvaluationRef` 由本契约命名

---

## 一、含义与使用范围

### S-1 本契约拥有什么

**一个会话此刻认得哪些资产——按类别一张表——以及它们此刻能不能用。**
消费者一律经会话资产注册表取，不绕过它去读求值结果或持有（[PF-002 §4 reload 那一行](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)「用到它们的地方都经注册表取」）。

| # | 拥有的事实与判定 | 正文 |
|---|---|---|
| 1 | 每个会话、每个登记类别一份**注册表快照**（会话资产注册表此刻的那张表）：它由谁填、何时换、换成什么 | [S-5](#s-5-八类里登记六张表)～[S-7](#s-7-注册表条目)、[S-15](#s-15-快照只在这几个时刻换) |
| 2 | **reload 一族**有哪几条、各刷哪张表、plugin 那张怎么连带（产品把这件事[明文交给规格](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标)） | [S-23](#s-23-reload按类别重填) |
| 3 | [会话斜杠命令集](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set)的兑现：装配时只装有权用的、收回此刻起不存在、③ 型失败后自动去掉 | [S-14](#s-14-会话斜杠命令集是-slash_command-那张表的视图)、[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)、[S-27](#s-27-markfailed命令型服务报错之后去掉那一条)、[S-28](#s-28-onassetchange权限收回之后收窄) |
| 4 | [当下可用性](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-current-availability--当下可用性--current-availability)——依赖解析的「只有且，只有必需」、替换件的判定、按命令的可用性——以及**一次执行尝试内它不变**；这一次尝试钉住的 MCP 动作条目、每个接入点的持有与全部工具条目的执行权限 | [S-8](#s-8-当下可用性的三个取值)～[S-12](#s-12-mcp-动作条目在一次尝试内钉住)、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) |
| 5 | 每一次换表**记进装配清单**，以及重启之后按清单**重建** | [S-18](#s-18-快照不持久装配清单是唯一权威)、[S-33](#s-33-本能力重启与重建) |

### S-2 本契约不拥有什么

| 不拥有 | 归谁 |
|---|---|
| **求值**：哪份资产生效、来自哪层、替换与锁、禁用、工作区读入与滤权、属性值、选用哪一版、常驻值、「谁可以使用它」的判定 | `capability.asset-evaluation` v2。本契约**只消费它的结果**（[S-16](#s-16-会话资产注册表不求值只消费求值结果)） |
| 持有与配值的写面；资产变化的事件 | `capability.asset-governance` v2 |
| 各类正文的形状、校验与属性推出 | `data.tool-definition` v2、`data.loop-extension` v2、`data.skill-package` v2、`data.slash-command` v2、`data.mcp-endpoint` v2 |
| MCP 的连接、列举、动作投影成工具定义、接入点可用性的判定本身、凭据 | `capability.mcp-bridge` v2 |
| **装配清单**本身：形状、只追加、定义版本、失效 | 换表记录的追加与读、`EvaluationRef`：窄口接口契约 `capability.assembly-manifest` v2；其余（定义版本、失效、完整形状）：PF-004 的契约（**未建立**，[G-1](#十已知缺口)） |
| 斜杠命令的识别与参数解析；③ 型流程的派发与执行结果落日志 | `data.slash-command` v2；受理与交付面（PF-014、PF-016） |
| 一次工具执行（含**替换件与关掉的命令被调用时落收场 `unavailable`**） | `capability.tool-execution-runtime` v2（它的 S-23 ④）；收场取值见 `data.content-blocks/v2#S-17` |
| 放行判断 | `capability.tool-admission` v2 |
| 系统提示词怎么组装；提醒怎么落进会话日志 | agent loop 一侧（PF-010、PF-012） |
| 热更新对**进行中运行**在产品上怎么呈现（要不要、怎样让人或 agent 知道换了） | PF-004。**一次读在哪一份快照里找**本契约已定：尝试之内看不见、下一次尝试起看得见（M35，[S-34](#s-34-进行中的运行与撤销)；原 G-2） |
| 依赖项各类提供者的在场与自报：外部服务、执行环境设施、存储、有效模型的模态能力 | 各自的 owner（[G-6](#十已知缺口)） |
| connector 与 agent_definition 两类的读法 | 各自的消费者：connector 本程无运行时消费者；agent_definition 是装配的根，由装配读（PF-004）。**本契约不为它们建表**（[S-5](#s-5-八类里登记六张表)） |

### S-3 本契约明确不承诺什么

- **不求值、不写持有与配值、不改任何资产。**
- **不推送。**表换了不通知任何消费者；消费者在自己的时机来读（[S-29](#s-29-本版不发本契约自己的事件)）。
- **不持久快照**（[S-18](#s-18-快照不持久装配清单是唯一权威)）。「会话装了什么」只有一个权威：装配清单。
- **不承诺一次运行从头到尾看不见 reload**：看不见只在一次尝试之内，同一运行的下一次尝试起看得见（M35，[S-34](#s-34-进行中的运行与撤销)）；技能门控按运行钉是另一回事（[S-11](#s-11-一次执行尝试的可用性报告) 第 4 条）。
- **不出可用性变化的提醒**（[S-30](#s-30-可用性变化不出提醒)；主线裁定 S22-d）。
- **不附 Schema。**操作的输入与返回用散文写含义，值类型引用 data 契约；线上形状归把这些操作送过进程边界的那份 composition（[规格容器的规矩](../../../README.md#准入门槛与停止条件)）。
- **不排除资产的云端存储与双向同步**（[PF-002 §2 非目标](../../../../product/PF-002-assets-settings-and-permissions/design.md#非目标)要求留口子）：表的内容全部由求值结果与不可变版本派生，不在本契约里存任何只有据点才有的资产事实。

### S-4 依赖方向与被消费的面

**依赖方向**：本契约 → 资产形状、各类正文、求值、资产治理、MCP 桥、放行、模态投影、模型档案、会话指认、身份值、过期语义里的时刻。
**反方向**：agent loop、`Tools()`/`Skills()`、斜杠命令识别、放行判断取工具定义、装配器、工具执行运行时读本契约——都是消费者 → 本契约。

#### `data.asset-model` v2 侧

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-1`](../../../data/asset-model/v2/contract.md#s-1-资产类别恰八类) 资产类别恰八类 | [S-5](#s-5-八类里登记六张表) 的类别取值与 `categoryNotRegistered`／`invalidInput` 的分界 |
| [`#S-2`](../../../data/asset-model/v2/contract.md#s-2-能力标识名的词法) 能力标识名的词法（允许冒号） | [S-23](#s-23-reload按类别重填) reload 一族的六个名字合这条词法 |
| [`#S-3`](../../../data/asset-model/v2/contract.md#s-3-能力标识与它的规范串) 能力标识与相等 | `RegistryEntry.capability`；[S-25](#s-25-lookup查一条) 的按名匹配 |
| [`#S-4`](../../../data/asset-model/v2/contract.md#s-4-资产记录号) 资产记录号 | `RegistryEntry.asset` |
| [`#S-9`](../../../data/asset-model/v2/contract.md#s-9-版本线) 版本线：已发布的版本不变 | `RegistryEntry.content` 取被选用的那一版；[S-33](#s-33-本能力重启与重建) 重建按记下的那一版取回正文 |
| [`#S-10`](../../../data/asset-model/v2/contract.md#s-10-八类正文的外壳) 八类正文的外壳 | `RegistryEntry.content` |
| [`#S-11`](../../../data/asset-model/v2/contract.md#s-11-plugin-的成员) plugin 的成员是能力标识 | [S-23](#s-23-reload按类别重填) 的连带范围 |
| [`#S-16`](../../../data/asset-model/v2/contract.md#s-16-持有范围) 持有范围的四格；会话不是持有格 | `RegistryEntry.from` 的取值 |

#### `data.tool-definition` v2 侧

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-2`](../../../data/tool-definition/v2/contract.md#s-2-身份是-name) 身份是 name；MCP 来源的定义没有能力标识 | [S-7](#s-7-注册表条目) 工具表的名字空间；[S-12](#s-12-mcp-动作条目在一次尝试内钉住) MCP 动作条目挂在接入点上 |
| [`#S-5`](../../../data/tool-definition/v2/contract.md#s-5-多命令工具) 多命令工具的命令 | [S-9](#s-9-按命令的可用性) 的键 |
| [`#S-6`](../../../data/tool-definition/v2/contract.md#s-6-模型面只有一个条目) 模型面只有一个条目；替换件同形（形状的权威） | [S-7](#s-7-注册表条目) 一个条目占一个槽位；[S-10](#s-10-替换件同形只换说明) |
| [`#S-9`](../../../data/tool-definition/v2/contract.md#s-9-四项依赖名) 四项依赖名；存储项连读回一起判 | [S-8](#s-8-当下可用性的三个取值) 第 4 条 |
| [`#S-17`](../../../data/tool-definition/v2/contract.md#s-17-来源) MCP 来源的定义 | [S-12](#s-12-mcp-动作条目在一次尝试内钉住) 动作条目的正文 |
| [`#S-19`](../../../data/tool-definition/v2/contract.md#s-19-由定义得出的依赖声明) 由定义得出的依赖声明 | [S-8](#s-8-当下可用性的三个取值) 工具条目的依赖解析 |
| [`#S-31`](../../../data/tool-definition/v2/contract.md#s-31-属性项的推出规则) 属性项的推出规则：执行权限项名 `execute`、恒有 | [S-11](#s-11-一次执行尝试的可用性报告) `effectivePermissions` 里作者写的与官方的工具取的那一项；[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ④ 第 5 步（修复波 1b 补登） |
| [`#S-24`](../../../data/tool-definition/v2/contract.md#s-24-结果与声明对得上) 第 3 条：MCP 条目的结果端按桥的投影判（「任意」） | [S-8](#s-8-当下可用性的三个取值) 第 8 条、[S-12](#s-12-mcp-动作条目在一次尝试内钉住)：动作条目不产生结果那一端的依赖项 |

#### `data.loop-extension` v2 侧

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-7`](../../../data/loop-extension/v2/contract.md#s-7-name-是身份) name 是身份 | 拓展件表的按名匹配 |
| [`#S-9`](../../../data/loop-extension/v2/contract.md#s-9-依赖声明与不可用) 依赖声明与不可用（视作卸载） | [S-8](#s-8-当下可用性的三个取值)：拓展件不可用落 `unavailable{reason}`，没有替换件 |
| [`#S-10`](../../../data/loop-extension/v2/contract.md#s-10-本版没有-order) 次序 = 装配清单顺序 | [S-6](#s-6-注册表快照) 条目次序原样保留 |

#### `data.messages` v2 侧

| 被消费的条款 | 用在哪 |
|---|---|
| [`#S-24`](../../../data/messages/v2/contract.md#s-24-别的会话捎话与到点了) `SessionRef` 的家 | 本契约的每个操作按它指认会话；拿着它不等于有权访问那个会话（[S-31](#s-31-装配给的保证-vs-协议须给的保证)） |

2026-09-24 整批对齐前这里登的是 `#S-15`、`#S-18`（可用性变化的提醒）；主线裁定 S22-d 之后本契约不出提醒，那两条不再被消费。

#### `data.offer-expiry` v1 与 `data.identity-values` v1 侧

| 被消费的条款 | 用在哪 |
|---|---|
| `data.offer-expiry` [`#S-22`](../../../data/offer-expiry/v1/contract.md#s-22-schema-的范围) 的 `Instant` | `filledAt`、报告的 `computedAt` |
| `data.identity-values` [`#S-5`](../../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等) `TenantId` | [S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 按会话创建时的租户身份判 |
| `#S-17`、`#S-18` 身份参数没有默认值、缺席即拒绝 | [S-19](#s-19-缺席时的默认答案) |
| [`#S-19`](../../../data/identity-values/v1/contract.md#s-19-不可用即明确失败) 不可用即明确失败 | [S-19](#s-19-缺席时的默认答案) 与各操作的 ⑧ |
| [`#S-27`](../../../data/identity-values/v1/contract.md#s-27-每道准入现读) 每道准入现读 | [S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 读时现读 |
| [`#S-30`](../../../data/identity-values/v1/contract.md#s-30-跨边界须重新验证) 跨边界须重新验证 | [S-31](#s-31-装配给的保证-vs-协议须给的保证) 右列 |
| [`#S-31`](../../../data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) 不透明标识的交换表示 | `EvaluationRef`（[S-13](#s-13-evaluationref)） |
| [`#S-32`](../../../data/identity-values/v1/contract.md#s-32-判别式集合闭合)、[`#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) | [S-19](#s-19-缺席时的默认答案) 的 `invalidInput` |

#### 其余被消费的契约

| 坐标 | 被消费的条款 | 用在哪 |
|---|---|---|
| `data.call-accounts` v2 | [`#S-37`](../../../data/call-accounts/v2/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) `RunId`、`AttemptId` | [S-11](#s-11-一次执行尝试的可用性报告) 报告带的运行与尝试标识、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) `run` 的核对与 `attempt`（M46） |
| `capability.asset-evaluation` v2 | [`#S-6`](../../asset-evaluation/v2/contract.md#s-6-求值输入-evaluationinput) `EvaluationInput`，含组合根引用集 `root`（M31）与可选 `mcpActionSets`（`McpActionSet`）；[`#S-15`](../../asset-evaluation/v2/contract.md#s-15-evaluate) `evaluate` 的失败集合（`invalidInput`、`compositionCycle`、`categoryUnsupported`，[S-23](#s-23-reload按类别重填) ⑥、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ⑥ 据它转交，修复波 3 补登）；[`#S-12`](../../asset-evaluation/v2/contract.md#s-12-缺席时的默认答案) 没有动作集就没有逐动作项；[`#S-21`](../../asset-evaluation/v2/contract.md#s-21-第三步投影) 逐动作项 `execute:<动作名>` 取生效那份持有的动作集推出；[`#S-5`](../../asset-evaluation/v2/contract.md#s-5-层与三条层序) `Layer`；[`#S-8`](../../asset-evaluation/v2/contract.md#s-8-求值结果-effectiveassembly) `EffectiveAssembly`（`assets` 的 `capability`／`asset`／`version`／`from`／`resident`，`composition` 的次序，`values`，`unresolved`，`filteredOut` 里的 `not_usable`；`values` 里工具条目的执行权限项整条交进报告）；[`#S-11`](../../asset-evaluation/v2/contract.md#s-11-纯计算) 同输入同结果（[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ④ 第 5 步没有动作集时直接取第一次的结果，修复波 1b 补登）；[`#S-31`](../../asset-evaluation/v2/contract.md#s-31-unresolved-交到装配手上怎么收场) `unresolved` 交到装配手上；[`#S-38`](../../asset-evaluation/v2/contract.md#s-38-常驻值) 常驻值；[`#S-39`](../../asset-evaluation/v2/contract.md#s-39-谁可以使用它值与判定) 「谁可以使用它」在第一步判掉：用不了的不进 `assets`、以 `not_usable` 留痕 | [S-7](#s-7-注册表条目)、[S-16](#s-16-会话资产注册表不求值只消费求值结果)、[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)、[S-22](#s-22-fill装配时填六张)、[S-23](#s-23-reload按类别重填)、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) 的两次求值 |
| `capability.asset-governance` v2 | [`#S-48`](../../asset-governance/v2/contract.md#s-48-事件都是通知) `HoldingChanged`、`AssignmentChanged`，都是通知 | [S-28](#s-28-onassetchange权限收回之后收窄) 的输入 |
| `data.skill-package` v2 | [`#S-16`](../../../data/skill-package/v2/contract.md#s-16-由包得出的依赖声明) 由包得出的依赖声明 | [S-8](#s-8-当下可用性的三个取值) 技能条目的依赖解析 |
| `data.slash-command` v2 | [`#S-2`](../../../data/slash-command/v2/contract.md#s-2-命令名的词法) 命令名、[`#S-3`](../../../data/slash-command/v2/contract.md#s-3-保留区与它唯一的拼法) 保留区、[`#S-6`](../../../data/slash-command/v2/contract.md#s-6-三种绑定目标) 三种绑定目标（`command` 支即 ③ 型）、[`#S-16`](../../../data/slash-command/v2/contract.md#s-16-名字只按会话斜杠命令集认) 会话斜杠命令集的元素是「命令名 ＋ 正文」一对 | [S-14](#s-14-会话斜杠命令集是-slash_command-那张表的视图)、[S-23](#s-23-reload按类别重填) reload 一族的名字、[S-27](#s-27-markfailed命令型服务报错之后去掉那一条) |
| `data.mcp-endpoint` v2 | [`#S-9`](../../../data/mcp-endpoint/v2/contract.md#s-9-动作清单副本) 动作清单副本（含「还没取过」那一支）、[`#S-11`](../../../data/mcp-endpoint/v2/contract.md#s-11-动作条目名) 动作条目名、[`#S-15`](../../../data/mcp-endpoint/v2/contract.md#s-15-推出规则的输入正文与动作集) 逐动作项由正文与这次尝试钉住的动作集推出、[`#S-16`](../../../data/mcp-endpoint/v2/contract.md#s-16-逐动作项按动作名键) 逐动作项按对端动作名键 | [S-12](#s-12-mcp-动作条目在一次尝试内钉住)、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) 的第二次求值 |
| `capability.mcp-bridge` v2 | [`#S-5`](../../mcp-bridge/v2/contract.md#s-5-接入点持有的寻址) 接入点持有（`endpointHolding`）的成员与来处；[`#S-16`](../../mcp-bridge/v2/contract.md#s-16-refreshactions) `refreshActions`（成功与判定类失败随值交出的副本）、[`#S-17`](../../mcp-bridge/v2/contract.md#s-17-projectactions) `projectActions`（条目、「只能以替换件出现」、排除、结果端「任意」） | [S-8](#s-8-当下可用性的三个取值) 第 8 条、[S-11](#s-11-一次执行尝试的可用性报告) 报告钉住的接入点持有、[S-12](#s-12-mcp-动作条目在一次尝试内钉住)、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) |
| `capability.tool-admission` v2 | [`#S-10`](../../tool-admission/v2/contract.md#s-10-会话运行模式) `SessionRunMode`（`never`） | [S-9](#s-9-按命令的可用性) |
| `capability.modality-projection` v2 | [`#S-19`](../../modality-projection/v2/contract.md#s-19-查登记-lookupconverter) `lookupConverter` | [S-8](#s-8-当下可用性的三个取值) 第 8 条：工具结果那一端 |
| `data.model-profile` v2 | [`#S-7`](../../../data/model-profile/v2/contract.md#s-7-modality-与两组模态) 两组模态 | [S-8](#s-8-当下可用性的三个取值) 第 8 条：工具两端 |
| `capability.assembly-manifest` v2（窄口接口契约，2026-09-25 修订波登记） | [`#S-6`](../../assembly-manifest/v2/contract.md#s-6-记录与它的壳) 换表记录与它的壳、[`#S-8`](../../assembly-manifest/v2/contract.md#s-8-求值引用-evaluationref) `EvaluationRef`（**定义的权威在那里**，D-060 §八 N-37 ③）、[`#S-16`](../../assembly-manifest/v2/contract.md#s-16-readhead读头与每一类最后一条) 读头、[`#S-17`](../../assembly-manifest/v2/contract.md#s-17-append条件追加一条换表记录) 条件追加、[`#S-18`](../../assembly-manifest/v2/contract.md#s-18-readhistory按表时刻读回一条) 按表时刻读回 | [S-13](#s-13-evaluationref)、[S-18](#s-18-快照不持久装配清单是唯一权威) 第 4 条：换表的提交点就是那一次条件追加成功 |

---

## 二、概念、身份与必要状态

**身份值一律引用 `data.identity-values` v1，资产侧的值一律引用 `data.asset-model` v2，不复制定义。**
本契约不铸任何标识；`EvaluationRef` 由装配清单的记录给出（[S-13](#s-13-evaluationref)）。
**会话**的指认是 `SessionRef`（`data.messages/v2#S-24`：全树只用这一个名字，D-060 §S21 S21-d）；本契约只按它键控，**拿着它不等于有权访问那个会话**（[S-31](#s-31-装配给的保证-vs-协议须给的保证)）。

### S-5 八类里登记六张表

**一个会话恰有六张表，一类一张**：`tool`、`skill`、`slash_command`、`loop_extension`、`mcp`、`plugin`（类别取值即 `data.asset-model/v2#S-1`）。

| 类别 | 表里是什么 |
|---|---|
| `tool` | 生效的工具资产；**每次执行尝试另加**那一次钉住的 MCP 动作条目（[S-12](#s-12-mcp-动作条目在一次尝试内钉住)）。[meta 门](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability)是 official 工具资产，在这张表里 |
| `skill` | 生效的、这个会话的租户身份有权使用的技能（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)）；**一次运行里以它开始时判的为准** |
| `slash_command` | 生效的、有权使用的斜杠命令——就是[会话斜杠命令集](#s-14-会话斜杠命令集是-slash_command-那张表的视图)的底子 |
| `loop_extension` | 生效的拓展件，**次序即装配清单顺序**（`data.loop-extension/v2#S-10`） |
| `mcp` | 生效的 MCP 接入点（接入点本身；它带来的动作进 `tool` 表） |
| `plugin` | 生效的 plugin；它的成员按各自类别进各自的表 |

- **进哪张表只看条目能力标识的类别**：plugin 的成员是能力标识（`data.asset-model/v2#S-11`），求值展开之后它们各进各类的表；plugin 表里记的是 plugin 自己（[PF-002 §4 Plugin](../../../../product/PF-002-assets-settings-and-permissions/design.md#plugin)：挂上之后它的内容在装配时自动进来）。
- **`connector` 与 `agent_definition` 不建表**（D-060 §块 A A9）：前者本程没有运行时消费者，后者是装配的根、由装配读。对它们的任何按类别操作一律 **`categoryNotRegistered`**；八类之外的字符串一律 **`invalidInput`**。

### S-6 注册表快照

**`RegistrySnapshot`（注册表快照）是一个会话、一个类别此刻的那张表**——会话资产注册表此刻的样子：`{ category, entries, filledAt, filledBy, basedOn }`。

| 成员 | 含义 |
|---|---|
| `category` | 六类之一（[S-5](#s-5-八类里登记六张表)） |
| `entries` | `RegistryEntry` 的序列（[S-7](#s-7-注册表条目)），**次序是求值结果给出的次序**（装配清单顺序）；换表、算可用性都不改次序 |
| `filledAt` | 这份快照成立的时刻（`Instant`）；**同一 (会话, 类别) 上严格递增**，因此 (会话, 类别, `filledAt`) 指认一份快照 |
| `filledBy` | 它为什么成立，闭合：`assembly`（装配，含完整重新装配）· `reload{command}`（人发的那条 reload，`command` 是那条命令的名字）· `auto_refresh_after_failure`（③ 型失败后自动去掉一条）· `asset_change`（权限收回后收窄）。**第四个值由主线裁定补名**（D-060 §S22 S22-c；原 G-4 闭合），随 `onAssetChange` 一并产生 |
| `basedOn` | 它所依的那次求值（[S-13](#s-13-evaluationref)）；`auto_refresh_after_failure` 与 `asset_change` 只删不增，**沿用被收窄那份的 `basedOn`** |

1. **每个 (会话, 类别) 至多一份当前快照**；按 (会话, 类别) 键控，**一个会话的条目不会出现在另一个会话的读里**。
2. **快照一经成立不改写**：换表是产生一份新快照顶替它，不在原来那份上增删（[S-17](#s-17-换表同一会话串行多表一次成败同一)）。**被顶替的那份不再是当前的，却仍是一份报告所依的快照时照样读得到**：`within = run{那份报告}` 的读按它读（M35，[S-25](#s-25-lookup查一条) ④）；它的构成就在装配清单里那一条换表记录上（[S-18](#s-18-快照不持久装配清单是唯一权威) 第 1 条）。
3. **快照的构成**是它的条目各自的 (`capability`、`asset`、`from`、`content`、`resident`) 与次序；**可用性不是构成**（[S-8](#s-8-当下可用性的三个取值)），重算可用性不产生新快照。
4. **快照不持久**（[S-18](#s-18-快照不持久装配清单是唯一权威)）。

### S-7 注册表条目

**`RegistryEntry` 是表里的一条**：`{ capability, asset, from, content, availability, commandAvailability?, resident? }`。

| 成员 | 含义 |
|---|---|
| `capability` | 能力标识（`data.asset-model/v2#S-3`）。**MCP 动作条目**填它所随的那个接入点的能力标识（动作不是资产，[S-12](#s-12-mcp-动作条目在一次尝试内钉住)） |
| `asset` | 这一次生效的那份资产记录（`data.asset-model/v2#S-4`），**求值选定的，会话资产注册表不另选** |
| `from` | 它来自哪一格：`factory`、`organization`、`tenant`、`workspace`——`capability.asset-evaluation` 的 `Layer`，与 `data.asset-model/v2#S-16` 的持有格同词；**`session` 不会出现在这里**（会话不是持有格） |
| `content` | 那份记录**被选用的那一版**的正文（`data.asset-model/v2#S-10`）。版本取 `EffectiveAsset.version`（[`capability.asset-evaluation/v2#S-8`](../../asset-evaluation/v2/contract.md#s-8-求值结果-effectiveassembly)），会话资产注册表不猜「最新已发布」；MCP 动作条目是一份 `tool` 类正文，装着桥投影出的工具定义（`data.tool-definition/v2#S-17` 的 `mcp` 来源） |
| `availability` | [S-8](#s-8-当下可用性的三个取值) |
| `commandAvailability` | [S-9](#s-9-按命令的可用性) |
| `resident` | **恰在 `tool` 与 `skill` 两类的条目上出现**（[常驻](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-residency--常驻--residency)只对工具与技能有意义）；其余类别缺席——缺席在那里的意思是「这一类没有常驻这回事」，不是 `false` |

- **常驻值来自求值结果，会话资产注册表不计算**：[PF-006 §4 常驻](../../../../product/PF-006-tools-and-skills/design.md#常驻)与 [§6.1](../../../../product/PF-006-tools-and-skills/design.md#61-常驻标记挂在引用条目上agent-definition-压-plugin) 的「标在引用上、agent definition 压 plugin」由求值兑现：取 `EffectiveAsset.resident`（[`capability.asset-evaluation/v2#S-38`](../../asset-evaluation/v2/contract.md#s-38-常驻值)）。**它缺席（判不出）时 `fill`、`reload` 收 `unavailable`**，不当作 `true` 也不当作 `false`（那份契约的 G-3、G-18）。
- **槽位按条目计**：每条 `resident: true` 的条目占一个[提示词槽位](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-prompt-slot--提示词槽位--prompt-slot)；多命令工具是**一条**条目，整套命令只占一个（[PF-006 §4 槽位](../../../../product/PF-006-tools-and-skills/design.md#槽位)、[PF-002 §4 Tool](../../../../product/PF-002-assets-settings-and-permissions/design.md#tool)、`data.tool-definition/v2#S-6`）。MCP 动作条目恒为 `false`（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)）。
- **meta 门条目**（[PF-006 §6.1](../../../../product/PF-006-tools-and-skills/design.md#61-常驻标记挂在引用条目上agent-definition-压-plugin) 末段、[PF-007 meta 与常驻](../../../../product/PF-007-meta-capabilities/design.md#meta-与常驻的关系)）：**会话资产注册表自己的任何操作都不把它从 `tool` 表里去掉、不把它标成非常驻**——`markFailed`、`onAssetChange` 都碰不到它（它们只动 `slash_command` 与 `skill` 两张表）。它**不可禁用、不被资产替换顶掉、恒常驻**——这三条由求值兑现，会话资产注册表照抄；**权限关不掉这扇门**：它的 `availability` 与别的条目一样只由依赖解析算出，权限从不让它变成替换件；**它在报告里的执行权限项也不读求值，恒为 `{auto}`**（[S-11](#s-11-一次执行尝试的可用性报告)；主线裁定，见 D-060 §七 M21），放行判断照常判、永远是自动那一档；**门后单条命令可以关**，走 [S-9](#s-9-按命令的可用性)。哪些能力标识是 meta 门，没有契约家——[G-7](#十已知缺口)。
- **`tool` 表里的名字在 agent 面前唯一**：条目在模型面的名字是**模型面名字 `ModelToolName`**（`data.tool-definition/v2#S-6` 的 `modelName`：定义名里每一个 `:` 换成 `__`），由定义名确定性推出——作者写的与官方的工具，定义名就是它能力标识的 name；MCP 动作条目，定义名是桥给它起的条目名（`capability.mcp-bridge/v2#S-17`，拼法 `data.mcp-endpoint/v2#S-11`）。**它就是 `tool` 表的查找键**（[S-25](#s-25-lookup查一条) ④）与报告里 `effectivePermissions` 每一项的键（[S-11](#s-11-一次执行尝试的可用性报告)），也就是调用块里 `tool` 原样的那个名字（主线裁定，见 D-060 §七 M8）；`modelName` 是单射，比模型面名字与比定义名结论相同。
  这些名字两两不同；**撞了就是 `toolNameConflict`**（[S-21](#s-21-这一节每个操作写全九件事) 总表），**不静默丢一个**。

### S-8 当下可用性的三个取值

**产品上可用性恰两态**（[PF-006 §4 可用性](../../../../product/PF-006-tools-and-skills/design.md#可用性)）；**不可用那一态按「在 agent 面前有没有原位呈现」分两种写法**，于是 `availability` 恰三个取值，闭合：

| 取值 | 什么时候 |
|---|---|
| `available` | 条目的[依赖声明](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-dependency-declaration--依赖声明--dependency-declaration)里**每一项都有在场、且自报可用的提供者**（[PF-006 §4 依赖](../../../../product/PF-006-tools-and-skills/design.md#依赖)、[§6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)）。**没有依赖声明的条目**（plugin、斜杠命令；拓展件 `needs` 缺席）没有一项缺，按同一条规则就是可用 |
| `stand_in{for}` | 不可用，**且这一类在 agent 面前有原位**——`tool`、`skill` 两类的条目与 MCP 动作条目：原位装[替换件](#s-10-替换件同形只换说明)。`for` 记它**为什么顶在原位**：缺哪几项（依赖名）、哪几项的提供者此刻读不到、或接入点那一侧的不可用原因（原样取 MCP 桥给的）——**三种说得分开** |
| `unavailable{reason}` | 不可用，**且没有原位可占**——`loop_extension`（视作卸载，`data.loop-extension/v2#S-9`）、`mcp` 表里的接入点那一行（[MCP 本身不可被调用](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp)）。`reason` 的内容同上 |

1. **只有且，只有必需**（[PF-006 §4](../../../../product/PF-006-tools-and-skills/design.md#只有且只有必需)）：声明里没有「或」也没有「可选」，**没有「部分可用」**。
2. **能力标识那种项**（例如技能要用到的工具）：本会话 `tool` 表里有那个能力标识的条目、且它这一次是 `available`，才算满足。**工具的依赖声明里没有能力标识项**（`data.tool-definition/v2#S-19`），所以先算工具、再算技能，不成环。
3. **提供者此刻读不到它的自报，这一项就不满足**：可用性的定义本身要求提供者**说**自己可用。**这不是把读不到折成结论**——那一项在 `for`／`reason` 里写明「读不到」而不是「缺」，条目也**不从表里消失**（[PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)）。
4. **存储那一项**满足，要那个存储在场且自报可用，**并且**有工具能从里面读回（`data.tool-definition/v2#S-9`）。**「哪个工具能读回哪个存储」目前没有声明**——[G-6](#十已知缺口)；在它有家之前，带存储项的工具按第 3 条判为不满足。
5. **没有写入口**：没有任何一个操作能把一条条目设成可用或不可用，**只有依赖解析算得出它**。
6. **它不是快照的构成**：算可用性不增删条目、不改次序、不产生新快照；**不持久、不重放**（[PF-015 §5.8](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#58-存储要守住的两件事)：实时算的那些没有「恢复」这回事）。
7. **与禁用分得开**：被[禁用](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-asset-disable--资产禁用--asset-disable)的资产在求值时就被滤掉，**根本不进表**；进了表的，最多是不可用、原位可见。
8. **工具两端的模态那两项**（`data.tool-definition/v2#S-19` 由 `needs` 得出）：**调用那一端**，`needs.inputModalities` 的每一种都在有效模型档案的输出模态里（[`data.model-profile/v2#S-7`](../../../data/model-profile/v2/contract.md#s-7-modality-与两组模态)），会话资产注册表自己比；**结果那一端**，声明的每一种结果模态 `m`：在有效模型档案的输入模态里，或 [`capability.modality-projection/v2#S-19`](../../modality-projection/v2/contract.md#s-19-查登记-lookupconverter) `lookupConverter({ modality: m })` 答 `{ registered }`——答 `{ unregistered }` 即这一项不满足，答 `{ unavailable }` 按第 3 条写「读不到」。MCP 动作条目的结果端是「任意」（`capability.mcp-bridge/v2#S-17`；`data.tool-definition/v2#S-24` 第 3 条），不产生结果那一端的项。**一次执行尝试开始时「有效模型」指哪一份档案，本版没有答案**——有效模型要到每次调模型之前才定（`data.model-response/v2#S-10`），[G-6](#十已知缺口)；在它有答案之前，这两项按第 3 条判为不满足。

一条条目读出来时带的 `availability`：**一次运行里的读**（`within = run{report}`）取那份报告里的——一次尝试以它为准（[S-11](#s-11-一次执行尝试的可用性报告) 第 1 条）；**条目本身也只在那份报告所依的快照里找**（主线裁定，见 D-060 §八 M35；[S-25](#s-25-lookup查一条) ④）：报告之后换上的快照里的新条目，对这一次尝试是「没有」、没有可用性可带，下一次尝试起可见；**不在运行里的读**（`within = session`）取**这个会话最近一次算出的那一份**：填表、重填或重建时算一次（PF-006 §6.4「装配与每次 run 前」；[S-33](#s-33-本能力重启与重建) 第 5 条），每次执行尝试开始时再算一次（[S-24](#s-24-refreshavailability每次执行尝试开始时现算)）。**每一份快照成立时都算过一次**，所以「最近一次算出的」总是有，不会读到一份没算过可用性的条目。

### S-9 按命令的可用性

**`commandAvailability` 让一条多命令工具的条目按命令说「这一条命令此刻用不了、为什么」**（主线补充裁定，见 D-060 §六 N-10；[PF-007 §5.7](../../../../product/PF-007-meta-capabilities/design.md#57-权限能关掉一条命令关不掉一扇门)「权限能关掉一条命令，关不掉一扇门」——关掉的命令**走当下可用性那套机制**，看得见、说得出原因）。

1. **恰在这时出现**：条目是多命令工具（`data.tool-definition/v2#S-5`），且它自己的 `availability` 是 `available`。**出现就列全**——它的每一个命令恰一个键，值是 `available` 或 `unavailable{reason}`，**不许漏键**（漏一个就说不清那一条是开还是关）。
2. **条目本身不是 `available` 时缺席**：整件都顶着替换件，每条命令一样用不了，不另列。单函数工具与其余类别的条目上恒缺席。
3. **本版关掉一条命令的来源恰一个**：会话此刻**有效的[运行模式](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-session-run-mode--会话运行模式--session-run-mode)是 `never`** ⇒ `Ask()` 的 `request_approval` 为 `unavailable{reason}`，原因写明是运行模式 `never`（[PF-015 会话运行模式](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#会话运行模式)末段；子会话随父下传，[PF-007 §5.8](../../../../product/PF-007-meta-capabilities/design.md#58-子不得宽于父)）。**有效运行模式怎么求归 `capability.tool-admission` 与会话**；它此刻读不到，那一条命令按 [S-8](#s-8-当下可用性的三个取值) 第 3 条判为关、原因写「读不到」。**`Ask()` 这扇门本身照旧 `available`**。
4. **别的来源本版没有**：`data.tool-definition` v2 的权限只有工具一级的执行权限（它的 [G-14](../../../data/tool-definition/v2/contract.md#十已知缺口)）；命令一级的权限项有了家，才有第二个来源。
5. **它不是放行判断**：关掉一条命令只让它「可见但用了一定失败」；开着的命令每一次调用照样过放行（`capability.tool-admission`）。

### S-10 替换件同形，只换说明

**一条 `stand_in{for}` 的条目在 agent 面前是它自己的[替换件](../../../../ubiquitous_language/terms/reach-and-availability.md#ul-stand-in--替换件--stand-in)**：

- **同形**：工具的名字与模型面 input 与原件相同（`data.tool-definition/v2#S-6`），技能的名字相同；**只有说明换成「现在用不了、原因是什么」**（[PF-006 §4 替换件](../../../../product/PF-006-tools-and-skills/design.md#替换件)、[§6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)）。原因就是 `for` 里记的那一份。
- **它不是另一条条目**：条目集合一条没多一条没少，身份仍是原来那条的。
- **一件替换件的三样事各有一处权威**：**是不是替换件、为什么是**（含 MCP 动作条目照哪一份副本同形）——本契约（[S-8](#s-8-当下可用性的三个取值)、[S-12](#s-12-mcp-动作条目在一次尝试内钉住)），MCP 条目「只能以替换件出现」的标记由桥给、本契约照用；**同什么形**——`data.tool-definition/v2#S-6`；**被调用时落「不可用」收场**（`data.content-blocks/v2#S-17`）与说明文字怎样呈现给模型——工具执行运行时与呈现的一方。`data.tool-definition/v2#S-6`「替换件怎么造归执行运行时」说的是最后这一样，不是「是不是」。

### S-11 一次执行尝试的可用性报告

**`AvailabilityReport`（可用性报告，无词条）是一次[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)开始时算出的那份「此刻能用什么」**，由 [S-24](#s-24-refreshavailability每次执行尝试开始时现算) 产出。它带：

| 带什么 | 含义 |
|---|---|
| 会话、运行、尝试、`computedAt` | 为谁、为哪一次[运行](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run)的哪一次[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)、何时算的：运行是 `data.call-accounts/v2#S-37` 的 `RunId`，**尝试 `attempt` 是同一条的 `AttemptId`**（主线裁定，见 D-060 §八 M46；[S-24](#s-24-refreshavailability每次执行尝试开始时现算) 产出时照调用方给的填），时刻是 `Instant`。**运行标识是 `continue` 核对的依据**（[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ②）；**三者一起是接收方核对「这份报告是不是这一次尝试的」的依据**——同一运行里上一次尝试的报告，会话与运行都对得上、尝试对不上（`capability.loop-extension-runner` 的 `dispatch.admission.report` 与 `capability.tool-execution-runtime` 的 `submit.report` 在接收边界核这三者，对不上 ⇒ `invalidInput`，M46；那两份契约自己落） |
| 每个登记类别所依的那份快照 | 按 (类别, `filledAt`) 指认；**报告只对这几份快照成立**：`within = run{这份报告}` 的读**只在这几份里找**（M35，[S-25](#s-25-lookup查一条) ④），此后换上的快照对这一次尝试不可见 |
| 每条条目的 `availability` 与 `commandAvailability` | [S-8](#s-8-当下可用性的三个取值)、[S-9](#s-9-按命令的可用性) |
| 这一次钉住的 MCP 动作条目 | 按接入点分组，每组带「这份动作清单是何时取得的」（[S-12](#s-12-mcp-动作条目在一次尝试内钉住)） |
| **`endpointHoldings`**：这一次钉住的接入点持有 | `mcp` 表里每个接入点恰一项：这一次调 `refreshActions` 用的那份接入点持有（`capability.mcp-bridge/v2#S-5` 的 `endpointHolding`），出自这一次的第一次求值（[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ④）；那次求值里这个接入点**没有生效的持有**，这一项写明「没有」，**不拿装配那一次或上一次尝试的那份补上**。**这一次尝试里的 MCP 调用由它寻址**（`capability.mcp-bridge/v2#S-19`） |
| **`effectivePermissions`**：这一次钉住的执行权限 | **`tool` 表里每条条目恰一项**（D-060 §六 L13），**以那条条目的模型面名字 `ModelToolName`（[S-7](#s-7-注册表条目)）为键**（D-060 §七 M8）：**调用块里的 `tool` 原样去查，查到的那一项就是这次调用的执行权限**——与 `capability.loop-extension-runner/v2#S-29` 第 5 条同一句；键的集合恰是 [S-25](#s-25-lookup查一条) 以 `within = run{这份报告}` 在 `tool` 类查得到的名字，**查不到键，就是这一次尝试没有这条条目**（S-25 的「没有」，一个结论），报告不为它造一项，那个调用也不进放行判断（D-060 §七 M10；收场归执行运行时）。<br>除 meta 门外，每一项都是第二次求值（[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ④）里的一条 `EffectiveValue`（[`capability.asset-evaluation/v2#S-8`](../../asset-evaluation/v2/contract.md#s-8-求值结果-effectiveassembly)），原样交出——含执行权限项上的 `tenantAutoWritable`（那份契约的 S-42），本契约不收成档位、不读那一位：<br>· **作者写的与官方的工具**（常驻与否都算）：它能力标识的 `execute` 那一项（`data.tool-definition/v2#S-31`：每份工具定义恒有这一项）；<br>· **MCP 动作条目**：那个接入点的 `execute:<对端动作名>`（[`#S-21`](../../asset-evaluation/v2/contract.md#s-21-第三步投影)）；<br>· **meta 门条目**（[S-7](#s-7-注册表条目)，PF-007 §5.7 关不掉的一扇门）：**恒为 `{auto}`、不读求值**，`tenantAutoWritable` 为假（D-060 §七 M21）；形状仍是一条 `EffectiveValue`：`capability` 是它的能力标识、`item = execute`、`value = {auto}`、`from = factory`、不带 `lockedAt` 与 `provenance`（`from` 取哪一格是**本契约推导**：这个值不来自任何一格的配值，最近的读法是「资产自带的那一份」）。第二次求值拿不到、或它的能力标识不在组合里，这一项**照样是 `{auto}`**——门关不掉；哪些能力标识是 meta 门见 [G-7](#十已知缺口)。<br>**条目仍在 `tool` 快照里、它的能力标识却不在第二次求值的组合里**（被禁用、被移除、这个租户用不了——没有 reload，条目还在）⇒ 那一项写**显式值 `not_in_composition`**：D-060 §六 L15——这个租户此刻不再持有它，是一个结论；这个值**只**指这一种情形（D-060 §七 M10）。**判据是能力标识，不是快照里那份资产**：快照里那份资产被禁用、同一能力标识退回到下一层（例如 official）时，能力标识**仍在**组合里，那一项取退回那份资产的 `EffectiveValue`，而条目的 `content` 仍是快照里那一份（到 reload 才换）。**MCP 动作条目不会是 `not_in_composition`**：接入点在这次尝试没有生效的持有，就没有钉住的动作条目（[S-12](#s-12-mcp-动作条目在一次尝试内钉住) 末行），它的动作在报告里查不到键——落「没有」那一支。**`unavailable` 只留给求值本身失败**：第二次求值拿不到时，除 meta 门外的项一律是 `unavailable`。三者都**不补作者默认，也不补任何一档**，也不拿装配那一次的值。<br>放行判断的调用方从这里取、按 `capability.tool-admission/v2` 的 S-8 收成一个档位、`tenantAutoWritable` 原样带上（`capability.loop-extension-runner/v2#S-29` 第 5 条）；**拿到 `not_in_composition`**，那一项照常交进放行判断、单独判 `deny{not_held}`，不牵连同批；**拿到 `unavailable`** 即放行判断这一次缺依据、同批全拒（同一条） |
| **这次运行钉住的技能门控** | 运行开始时 `skill` 表里判下来**用不了**的那些条目的能力标识（可以为空）：运行的第一次尝试现判、写进它的报告；同一运行后面的尝试原样带着（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)、[S-24](#s-24-refreshavailability每次执行尝试开始时现算)；D-060 §三 R2-13） |

`endpointHoldings` 与 `effectivePermissions` 两格与「再求一次值」是 D-060 §五 K30 的裁定：MCP 逐动作执行权限要由钉住的那份动作集推出，而动作集要到尝试开始时才钉（[S-12](#s-12-mcp-动作条目在一次尝试内钉住)）。
`effectivePermissions` 覆盖全部工具条目是 D-060 §六 L13：作者写的工具与 MCP 动作在放行判断面前没有区别，两处取值就要有两套新鲜度口径——现在一处取、同一个口径（下面第 1 条）。

1. **一次尝试内它不变**：那一次尝试里 agent 面前**有哪些条目**、能不能用什么、MCP 动作有哪些、MCP 调用用哪份持有、每条工具条目的执行权限是什么，**以这份报告为准**，会话资产注册表不在尝试中途重算——凭据被撤、对端增删动作、执行权限改值（作者写的工具与 MCP 动作一样）也不例外，都在下一次尝试开始时生效；**尝试中途的一次 reload 也一样**：换上的快照对这一次尝试的读不可见，新条目答「没有」，下一次尝试起可见（M35 是本条的直接推论）（[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)「一次尝试之内不变」；[PF-006 §6.2](../../../../product/PF-006-tools-and-skills/design.md#62-可用性在每次-run-开始前重算) 把每次尝试也算作一次开始）。
2. **它不改任何快照**，不写装配清单，不持久、不重放。
3. **一次尝试一份**：同一会话后一份报告成立，前一份对**此后**不在运行里的读就不再是「最近一次」（[S-8](#s-8-当下可用性的三个取值) 末段）；已经拿着前一份的那次尝试照它跑完。
4. **两种钉法、两个单位**：可用性、MCP 动作集、接入点持有与全部工具条目的执行权限**按尝试**重算（第 1 条）；技能门控**按运行**钉——同一运行的每一份报告带着同一份，**不随尝试重判**（R2-13：[产品说的是运行](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)「已经开始的运行不变，自下一次运行起不再装入」）。
   **报告不持久**（第 2 条），拿着它的是运行的调用方：崩溃恢复之后的尝试若拿不回那份报告，以同一个运行标识再 `start`（[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ⑦ 的具名例外），门控按此刻重判——**两个方向都可能与运行开始时那一份不同**：中途被收回的在恢复之后不在，开始时判为用不了、中途又被授予的在恢复之后出现；跨恢复保住它是 [G-15](#十已知缺口)。

### S-12 MCP 动作条目：在一次尝试内钉住

**[MCP](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) 对端的每一个动作是 `tool` 表里的一条不常驻条目**（[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)）。**动作集在每一次执行尝试开始前与可用性一起重算，一次尝试之内不变**（[PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)，rev 17 起；PF-006 §6.13 rev 18）。

对 `mcp` 表里的每一个接入点，[S-24](#s-24-refreshavailability每次执行尝试开始时现算) 取这一次第一次求值里它**生效的那份持有**（`endpointHolding`，由这次求值的结果按 `capability.mcp-bridge/v2#S-5` 得出），调一次 `capability.mcp-bridge/v2#S-16` `refreshActions`，按它的结局做下面几者之一：

| `refreshActions` 的结局 | 动作条目 | 接入点那一行 |
|---|---|---|
| **成功**：这一次完整拿到的副本 | 桥把它投影成工具定义（`capability.mcp-bridge/v2#S-17` `projectActions`），每个动作一条，`available`；**桥标了「只能以替换件出现」的那几条**是 `stand_in{for}`，原因取桥给的 | `available` |
| **判定类失败**（`endpointUnreachable`、`credentialUnavailable`、`oauthRequired`、`protocolError`），随值交出的副本是**上一次取到的那份**（`data.mcp-endpoint` 的 `ActionSnapshot`，`fetched` 那一支） | 照那份副本投影，每个动作一条 **`stand_in{for}`**，原因是那个失败值（[「接入点连不上」](../../../../product/PF-006-tools-and-skills/design.md#接入点连不上它的动作就是不可用)：替换件替的是最近一次拿到的那份） | `unavailable{reason}` |
| **判定类失败**，随值交出的副本是「还没取过」那一支 | **没有**——没有原件形状可同 | `unavailable{reason}`，原因写明「从未取得动作清单」与那个失败值 |
| **没有结论**（`dependencyUnavailable`、`bridgeWithdrawn`、`invalidInput`；桥不交副本） | **没有**——手上没有可同的形状 | `unavailable{reason}`，原因写「读不到」，`invalidInput` 另写「输入不合形状」（求值或本契约一侧的缺陷），两者分得开 |
| **没有调**：第一次求值里这个接入点没有生效的持有（被移除、被禁用、这个租户用不了） | **没有** | `unavailable{reason}`，原因写「此刻没有生效的持有」；报告的 `endpointHoldings` 那一项写「没有」（[S-11](#s-11-一次执行尝试的可用性报告)） |

- **动作条目不是快照的构成**：它们是接入点的内容，每次尝试现取；**不进装配清单**，重启不重建，下一次尝试再取。动作集在尝试与尝试之间变，**不破 [PF-004 I-4](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)**——装进来的是这个接入点。
- **对端中途增删动作**：这一次尝试的条目不变，下一次尝试开始时才变。
- **不拿装配那一次的持有去连**（最后一行，本契约推导）：那份持有上的凭据此刻可能已被撤下或换掉，拿它去连就是出示一份不该再出示的凭据；接入点本身还在表里，要等 reload 或下一次装配才走（[S-15](#s-15-快照只在这几个时刻换)）。
- **每个动作条目的执行权限配在接入点的持有上**，按对端动作名键（`data.mcp-endpoint/v2#S-16`）；它的值由第二次求值以钉住的那份动作集推出（`data.mcp-endpoint/v2#S-15`），钉进报告的 `effectivePermissions`（[S-11](#s-11-一次执行尝试的可用性报告)），**本契约不判它、不补它**。常驻恒为 `false`（桥的投影）。
- **名字由桥起**（`capability.mcp-bridge/v2#S-17`，拼法 `data.mcp-endpoint/v2#S-11`）；与 `tool` 表里别的条目撞名即 `toolNameConflict`（[S-7](#s-7-注册表条目) 末条）——命名规则应当让它碰不上，[G-12](#十已知缺口)。
- **被桥排除的动作**（`projectActions` 的 `excluded`：条目名拼不出、参数 schema 不成立）不进表——没有名字可占位；要不要另告诉 agent，[G-13](#十已知缺口)。
- **结果那一端是「任意」**（`capability.mcp-bridge/v2#S-17`），动作条目的依赖解析不含结果模态那一项（[S-8](#s-8-当下可用性的三个取值) 第 8 条）。

### S-13 EvaluationRef

**`EvaluationRef` 的定义归 `capability.assembly-manifest` v2 的 [S-8](../../assembly-manifest/v2/contract.md#s-8-求值引用-evaluationref)**（主线裁定，见 D-060 §八 N-37 ③）：它指认装配清单里记下了一次求值的那一条记录；不透明、全局唯一、永不复用，交换表示与相等按 `data.identity-values/v1#S-31`；**消费者不得解析它**。本条不另下定义，只写本契约怎样用它：

- 装配把求值结果交给 `fill` 时连同它一起交，`fill` 以它 `given` 追加那条记录（那份契约 S-8 第 2 条）；`reload` 求一次新的值，以 `mint` 追加、由装配清单铸出一个新的 `EvaluationRef`；`markFailed`、`onAssetChange` 以 `reuse` 沿用被收窄那份的引用、不铸新的（那份契约 S-8 第 3、4 条；[S-18](#s-18-快照不持久装配清单是唯一权威)）。
- 两份快照的 `basedOn` 相同，说明它们出自同一次求值。
- **会话资产注册表不从它反推任何东西**——不从中读租户、版本或时刻；要那些，读装配清单里的那一条记录。

### S-14 会话斜杠命令集是 slash_command 那张表的视图

**[会话斜杠命令集](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set) = 这个会话当前 `slash_command` 快照里的条目，减去此刻读来已经无权使用的那些**（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)）。**交出时每一条是「命令名 ＋ 正文」一对**：命令名是条目能力标识的 name，正文是那一版的 `SlashCommandDefinition`——`data.slash-command/v2#S-16` 的解析只读这一组对。

- **交付面只按它识别命令**；对它之外的名字，[S-25](#s-25-lookup查一条) 给「没有」——**与一个从来不存在的名字逐字相同**（[PF-002 §4「没有权限，就等于不存在」](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)）。**本契约没有「有这条、但你不能用」这第二种回答**。
- 它**不因资产的增删与禁用而自己变**；变只发生在 [S-15](#s-15-快照只在这几个时刻换) 列的那几个时刻，外加读时现读的收回。

---

## 三、贯穿全部操作的规矩

### S-15 快照只在这几个时刻换

| 时刻 | 换哪几张 | 依据 |
|---|---|---|
| **装配**（会话创建时那一次，与任何一次完整重新装配）——`fill` | 六张全换 | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)「一次完整的重新装配本来就会把全部注册表重填一遍」 |
| **人发对应的 reload**——`reload` | 那一类；plugin 连带成员各类（[S-23](#s-23-reload按类别重填)） | 同上，reload 那一行 |
| **③ 型失败之后**——`markFailed` | `slash_command`：去掉那一条 | 同上，③ 型那一行 |
| **权限收回之后**——`onAssetChange` | `slash_command`：去掉此刻无权的。**`skill` 不在此列**：技能的收回从下一次运行起生效（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)，R2-13） | 同上，「会话进行中被收回了权限的，此刻起同样不存在」；主线补充裁定（D-060 §六 N-10） |

**除此之外什么都不换快照**：

- **重算可用性不换**（[S-8](#s-8-当下可用性的三个取值) 第 6 条）。
- **资产的增删、禁用、替换、发新版不换**，要等人发对应的 reload 或一次完整的重新装配（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)「不会自己改变进行中的会话」；[PF-004 §6.3](../../../../product/PF-004-agent-definition-and-assembly/design.md#63-三类变化三种传播) 构成性变化作用于下一次装配）。**PF-004 rev 12 让移除、禁用、「谁可以使用它」被收回在下一次运行起触发一次重新装配**（[构成变小也重新装配](../../../../product/PF-004-agent-definition-and-assembly/design.md#三类变化背后只有一条判据系统提示词的成分会不会变)）——那是上表第一行的一次 `fill`，由装配发起，不是本契约自己换；它与 PF-002 §4「① ② 型的增删禁用要等 reload」怎样对上，见 [G-17](#十已知缺口)。
- **新得到的权限不换**：要等下一次 reload 或重新装配才进来（同上）。
- **读不换**：`lookup`、`list` 从不产生新快照。
- **重启后的重建不算换**：它重现的是重启之前那几份（[S-33](#s-33-本能力重启与重建)）。

### S-16 会话资产注册表不求值，只消费求值结果

**哪份资产生效、来自哪一格、选用哪一版、常驻与否、哪项属性取什么值、哪个引用无人提供——一律取 `capability.asset-evaluation` 的结果，会话资产注册表不重算、不修正、不另选。**

会话资产注册表自己只判四件事，各有条款：
① 当下可用性（[S-8](#s-8-当下可用性的三个取值)、[S-9](#s-9-按命令的可用性)）；② 「谁可以用」门控——进表时用求值的判定（进了 `assets` 的就是用得了的），读时用此刻的求值有没有把它以 `not_usable` 滤掉（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)）；③ `tool` 表的名字冲突（[S-7](#s-7-注册表条目)）；④ 一次 reload 连带哪几张表（[S-23](#s-23-reload按类别重填)）。

`reload` 需要一次**此刻的**求值，`refreshAvailability` 需要两次（[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ④）：求值的输入由谁收齐归装配（[S-31](#s-31-装配给的保证-vs-协议须给的保证) 那一行），会话资产注册表只请求并消费结果。

### S-17 换表：同一会话串行，多表一次，成败同一

1. **同一会话上的换表串行**：`fill`、`reload`、`markFailed`、`onAssetChange` 在同一会话上**不交错**；后一次看到的是前一次成立之后的那几份快照。
2. **一次换几张表，就一次一起成立**：`fill` 的六张、`reload(plugin)` 连带的几张，**全换或全不换**——不会出现 plugin 表说有某个 plugin、它的成员表却还是旧的那种半截状态。
3. **提交点是记进装配清单**（[S-18](#s-18-快照不持久装配清单是唯一权威)）：记下之前，没有读看得见新快照；记下、操作返回之后，下一次读就是新的。
4. **失败不留任何东西**：换表失败，哪张表都没变，装配清单里也没有这一次。

### S-18 快照不持久，装配清单是唯一权威

**「这个会话装了什么」只有一个权威：它的[装配清单](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)**（[PF-004 §4](../../../../product/PF-004-agent-definition-and-assembly/design.md#装配清单)「当时那个 agent 是什么样」的唯一答案；D-060 §S22 S22-e、§块 B PB-6）。会话资产注册表的快照只活在运行着的那个实例里，**不单独存一份**——存两份就是两个权威，重启之后谁对谁错没人答得出。

1. **每一次换表都记进装配清单**：记下的是换出来的那几份快照的**构成**——每条条目的 (`capability`、`asset`、被选用的版本、`from`、`resident`) 与次序——连同 `filledBy`、`basedOn`、`filledAt`。**一条记录带齐它换掉的每一张表的完整构成**（不是只记增删），所以任何一类的当前快照都能从这一类最后一条记录单独读出。**`fill` 的记录就是那一次装配的构成本身**，不是在它之外另记一份；`reload`、`markFailed`、`onAssetChange` 各追加一条，**作为会话装了什么的一条可见事实**——否则一次重启会在人不知情时改掉会话的命令集。
2. **换表的提交点就是这一条记录落下**。落不下 ⇒ 这一次换表失败、快照不换、操作收 `unavailable`（[S-17](#s-17-换表同一会话串行多表一次成败同一) 第 4 条）。
3. **可用性、按命令的可用性、MCP 动作条目都不记**——它们每次尝试现算（[S-8](#s-8-当下可用性的三个取值) 第 6 条、[S-12](#s-12-mcp-动作条目在一次尝试内钉住)）。
4. **装配清单那一侧给出的追加面与记录形状，由窄口接口契约 `capability.assembly-manifest` v2 给出**（2026-09-25 修订波，D-063 R-1）：换表记录与它的壳（[S-6](../../assembly-manifest/v2/contract.md#s-6-记录与它的壳)）、条件追加（[S-17](../../assembly-manifest/v2/contract.md#s-17-append条件追加一条换表记录)）、读头与每一类最后一条（[S-16](../../assembly-manifest/v2/contract.md#s-16-readhead读头与每一类最后一条)）、按表时刻读回（[S-18](../../assembly-manifest/v2/contract.md#s-18-readhistory按表时刻读回一条)）。**本契约每一个换表操作的提交点，就是那一次条件追加成功**；第 1 条列的各项是写入方放进那条记录的内容（那份契约原样存）。**真承接者未到**：完整的装配清单契约归 PF-004 那一程，本版由最小提供者承接（[G-1](#十已知缺口)）。

### S-19 缺席时的默认答案

**一律拒绝或明确失败，不放行、不空集、不回退、不填初值。**三类分开：

| 情形 | 结果 | 为什么不合并 |
|---|---|---|
| 判定得出「不行」 | 具名值：`categoryNotRegistered`、`dependencyUnresolved{missing}`、`toolNameConflict`、`sessionNotFound`；求值以 `compositionCycle{cycle}` 或 `categoryUnsupported{category}` 失败时**原样转交**（[S-21](#s-21-这一节每个操作写全九件事) 总表） | 成立的结论，原样重试不会变 |
| 判定**做不出来**：会话事实、求值、「谁可以用」的现读、装配清单（读或追加）、重建所需的正文任一取不到 | **`unavailable`** | 没有结论；按当时实际状态重试可能不同（`data.identity-values/v1#S-19`） |
| 输入**根本不构成这个请求**：成员缺席、类型不对、类别不在八类之内、名字不合 `data.asset-model/v2#S-3` 的形状、`EvaluationRef` 不合 `data.identity-values/v1#S-31` 的词法、求值结果不合它自己契约的形状；`fill` 带的 `EvaluationRef` 已被此后的换表取代（`invalidInput{evaluationSuperseded}`，[S-22](#s-22-fill装配时填六张) ⑦，M34） | **`invalidInput`**，在任何判定之前 | 表示层校验不是判定结果（`data.identity-values/v1#S-33`） |

- **`unavailable` 这个名字取自 `capability.organization-governance` v1 的同一收场**（D-060 §S22 S22-c）。没有它，「判不出来」就只能折进某个拒绝值——那正是本条要禁的。
- **读时判不出来不等于「没有」**：`lookup` 现读「谁可以用」读不到时收 `unavailable`，**不回答「没有这个命令」**——那会把一次读失败说成这个人没有权限。
- **任何身份参数都没有默认值**：会话、类别、能力标识、名字、通知、`refreshAvailability` 的 `attempt`，缺席即 `invalidInput`，不得由当前租户身份、进程上下文或「上一次那个会话」补齐（`data.identity-values/v1#S-17`、`#S-18`）。
- **本契约的操作没有带默认值的非身份参数。**`refreshAvailability` 的 `run` 与 `lookup`／`list` 的 `within` 是**必填的判别式**（[S-24](#s-24-refreshavailability每次执行尝试开始时现算)～[S-26](#s-26-list列一类)）：缺席即 `invalidInput`，**不补成「一次新运行」或「会话级的读」**——补哪一个都会让一次已开始的运行在中途被收窄。

### S-20 「谁可以用」门控：哪两类、按哪个租户身份、什么时候判

**资产的「谁可以使用它」这项权限，本契约只在两类上把它当成「进不进表」的门**：

| 类别 | 依据 |
|---|---|
| `slash_command` | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)「无权使用的命令不装配、不可见」 |
| `skill` | [PF-002 §5.2「谁可以使用它」](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)「判下来这个人不能用：不装进他的会话」（rev 19 起），并让 ② 型命令绕不开那个技能自己的使用权限（[PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)「② 型展开的那个 skill，照样要过它自己的『谁可以使用它』」）——展开时在 `skill` 表里查不到它，就展开不了 |

**其余四类不在这里判权限**：工具的执行权限在放行判断里判（[PF-004 §6.5](../../../../product/PF-004-agent-definition-and-assembly/design.md#65-权限变化动作空间不变) 权限变了动作空间不变），拓展件的干预力在派发时判。

1. **按谁判**：**会话创建那一刻捕获的租户身份**（`data.identity-values/v1#S-5` 的 `TenantId`；[PF-015 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)），**不是**这个账号此刻切换到的那个租户身份。
2. **判什么**：这个租户身份用不用得了它，**求值在第一步已经判掉**——判下来用不了的那份不进 `assets`，这个能力标识退回下一层（[`capability.asset-evaluation/v2#S-39`](../../asset-evaluation/v2/contract.md#s-39-谁可以使用它值与判定)、[`#S-8`](../../asset-evaluation/v2/contract.md#s-8-求值结果-effectiveassembly)）。**进了 `assets` 的就是用得了的**（2026-09-24 随 PF-002 rev 19 改：原先读 `EffectiveAsset.usable`，那个成员已删）。
   **读时现读**看的是：用**此刻的**求值（会话创建那一刻捕获的租户身份、此刻的配值与成员资格），快照里这一条的那份资产的持有**有没有以 `not_usable` 被滤掉**——有，就是此刻用不了。增删、禁用、替换、发新版**不在这里判**，它们等 reload（[S-15](#s-15-快照只在这几个时刻换)）。取值域与判法归那份契约，会话资产注册表**只读这个答案**，不自己解释那项权限的取值。
3. **何时判**（R2-13：**技能门控钉住的单位是运行**；斜杠命令集是会话的，此刻起就收窄）：
   - **进表时**：`fill`、`reload` 照求值结果放——用不了的本来就不在结果里，不另判；
   - **`slash_command`：每一次读时现读**（`data.identity-values/v1#S-27`）：`lookup`、`list` 对这张表里的每一条再判一次，此刻不可以用的**当作不在**——**这是「收回此刻起不存在」的兑现点**，它不依赖任何通知送达；**收到资产变化的通知时**，`onAssetChange` 把此刻不可以用的从快照里去掉（[S-28](#s-28-onassetchange权限收回之后收窄)）；
   - **`skill`：运行开始时判一次，这次运行里不再判**——`refreshAvailability` 在一次运行的第一次尝试（`run = start`）用它的第一次求值（[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ④）对 `skill` 表每一条现判，用不了的写进报告，**这就是这次运行钉住的那一份**；同一运行后面的尝试（`run = continue`）原样带着，不重判（[S-11](#s-11-一次执行尝试的可用性报告) 第 4 条、[S-24](#s-24-refreshavailability每次执行尝试开始时现算)）。运行里的读（`within = run`）按那一份：钉住的「用不了」当作不在，**其余照快照、不现读**——收回对已开始的运行不起作用，[「这次运行照样用得上它」](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)；
     不在任何一次运行里的读（`within = session`：② 型命令展开、交付面列技能）**照旧现读**——② 型展开是一次新输入，那个技能此刻用不了就展开不了；**`onAssetChange` 不动 `skill` 表**：它去掉的会连已开始的运行一起去掉。
4. **只收窄不放宽**：读时判出可以用的，**也只在它本来就在快照里时**才出现；快照之外新得到权限的，等 reload 或重新装配。
5. **读不到 ⇒ `unavailable`**，不当作可以、也不当作不可以。（求值那一侧的判定本身没有「判不出」：自定义件必有作者、成员资格必带角色，那份契约的 S-39。）
6. **据点上读到的是中心事实的副本**：副本的新鲜度由装配给（[S-31](#s-31-装配给的保证-vs-协议须给的保证)）；治理中心不可达时，收回在这台机器上的生效时刻是再连上的那一刻（[PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)，已接受的代价）。

**与「下一次运行起按此刻求值装入、退回下一层」怎样对上**（[PF-002 rev 19 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)「会话进行中被收回：已经开始的运行不变，自下一次运行起不再装入」；R2-13 的读法）：

- **一次运行之内技能门控不变**：那次运行以它第一次尝试钉住的那份为准（第 3 条；[PF-004 I-4](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) 一次运行之内动作空间不变）；可用性与 MCP 动作集照旧一次尝试一份（[S-11](#s-11-一次执行尝试的可用性报告)）。
- **「不再装入」体现在下一次运行的开始**：下一次运行的第一次尝试重判，被收回的那一条从此在那次运行里当作不在。
- **「退回下一层」要一次装配**：那次装配拿此刻的求值 `fill`——用不了的那份以 `not_usable` 退出、退回的那一份（例如同名的 official）照求值结果进表。**这是 `fill` 的事，不是 `onAssetChange` 或运行开始时那一判的事**：那两处只收窄，**不把退回的那一份补进来**——新得到的，包括退回来的那一份，等 reload 或下一次装配（第 4 条）。

收窄管「从哪一刻起不再用」（斜杠命令此刻起、技能下一次运行起），装配管「下一次装的是什么」。
**每次运行之前要不要装配，PF-004 rev 12 已给产品答案**：移除、禁用、「谁可以使用它」被收回让构成变小，**重新装配，下一次运行起生效**（[PF-004 §6.3 构成变小也重新装配](../../../../product/PF-004-agent-definition-and-assembly/design.md#三类变化背后只有一条判据系统提示词的成分会不会变)）——退回的那一份就在那一次 `fill` 进表。
**谁察觉构成变小、在下一次运行之前发起那次装配，归 PF-004 的契约**（[G-14](#十已知缺口) ①，收窄）；它没有之前，退回的那一份要等 reload 或一次完整的重新装配。

**被引用的能力无人可用、又没有下一层**（D-060 §五 K33）：收回之后，这个能力标识在此刻的求值里一份生效资产都没有，被引用时进 `unresolved`（`capability.asset-evaluation/v2#S-39` 末段、[`#S-31`](../../asset-evaluation/v2/contract.md#s-31-unresolved-交到装配手上怎么收场)）。

- **已开始的运行不受影响**：它钉住的是开始时那一份；下一次运行开始时技能门控把它判为用不了（第 3 条）。
- **此后这个会话的任何一次 `reload`（哪一类都算）收 `dependencyUnresolved{missing}`，表不换**（[S-23](#s-23-reload按类别重填) ⑥）：reload 的派发把这个失败交到交付面，人看得见缺的是哪个、谁引用的。
- **任何一次完整的重新装配都失败**（含上面 PF-004 rev 12 触发的那一次）：装配拿到非空的 `unresolved` 必须失败（[PF-004 I-9](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)），`fill` 不会被调到。**收口方是装配**：会话创建失败，或那一次重新装配失败，对交付面可见；那之后会话怎样（沿用原构成还是停下）归 PF-004 的契约（[G-14](#十已知缺口) ①）。
- **本契约不「悄悄不装」**：不把缺的那一条从表里抹掉当作一次成功的重填（[S-22](#s-22-fill装配时填六张) 末段）。

---

## 四、操作

### S-21 这一节每个操作写全九件事

①输入 · ②前置 · ③结构性禁止（不适用写「无」）· ④提交点与原子性 · ⑤成功返回 ·
⑥失败集合（**闭合枚举，没有「其他」；按判定次序排列**，同一输入同一答案）· ⑦幂等与重复 · ⑧缺席时的默认答案 · ⑨事件。

**失败值总表**（本契约的全部失败值，含义以这里为准）：

| 值 | 含义 | 类 |
|---|---|---|
| `invalidInput` | 输入不构成这个请求（[S-19](#s-19-缺席时的默认答案) 第三行）。`fill` 另有一支 **`invalidInput{evaluationSuperseded}`**：带来的 `EvaluationRef` 那一条记录已经落下、六张表却已不是它填出的（[S-22](#s-22-fill装配时填六张) ⑦；主线裁定，见 D-060 §八 M34） | 表示层 |
| `sessionNotFound` | 装配清单里没有这个会话的装配记录——会话资产注册表从没为它成功填过表。**会话资产注册表分不出「会话不存在」与「会话在、但从没装配成功」**，两者同一个值 | 定位 |
| `categoryNotRegistered` | 类别是 `connector` 或 `agent_definition`（[S-5](#s-5-八类里登记六张表)） | 结构 |
| `dependencyUnresolved{missing}` | 所依的求值结果里**有引用无人提供**（`EffectiveAssembly.unresolved` 非空）；`missing` 列出那些能力标识与引用它们的是谁。**依赖声明不满足从来不是这个值**——那是可用性（[S-8](#s-8-当下可用性的三个取值)）；这个值说的是「装配缺了必需的东西」（[PF-004 I-9](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)） | 结论 |
| `toolNameConflict` | `tool` 表里两条条目在 agent 面前同名（[S-7](#s-7-注册表条目) 末条） | 结论 |
| `compositionCycle{cycle}` | 这一次此刻的求值以 `compositionCycle` 失败（[`capability.asset-evaluation/v2#S-15`](../../asset-evaluation/v2/contract.md#s-15-evaluate) ⑥）——组合成环、没有结果可填；`cycle` 原样取那份诊断。**名字与诊断都是求值那一侧的，本契约只转交**（本契约推导：转交而不收成 `unavailable`，因为它是判出来的、原样重试不会变） | 结论 |
| `categoryUnsupported{category}` | 这一次此刻的求值以 `categoryUnsupported` 失败（同上）——组合里走到了本版读不了正文的一类（plugin、sub-agent），没有结果可填；`category` 原样取。同样只转交（同上的推导）；那份契约的 G-3、G-21 闭合时随它删去 | 结论 |
| `unavailable` | 判定做不出来（[S-19](#s-19-缺席时的默认答案) 第二行） | 失败 |

> **`dependencyUnresolved` 这个名字比它的含义窄**：它说的是组合引用无人提供，而产品把[组合与依赖分成两件事](../../../../product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识)。主线要求改宽，**还没有新名字**——本版照旧，已报主线并接受（D-060 §七 N-18）。
> **原 `slotConflict` 已改名 `toolNameConflict`**（主线裁定，见 D-060 §六 N-10）：[「槽位」专指提示词槽位](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-prompt-slot--提示词槽位--prompt-slot)，而这里冲突的是工具表里的条目名，常驻与否都算。

**谁调用**（本契约的面是据点进程内的能力间面，**不直接暴露给人或 agent**；调用方身份怎么核实见 [S-31](#s-31-装配给的保证-vs-协议须给的保证)）：

| 操作 | 调用方 |
|---|---|
| `fill` | 装配（会话创建时与每一次完整重新装配） |
| `reload` | ③ 型流程的派发——人在交付面上敲了 reload 一族里的一条，且那条命令在这个会话的命令集里 |
| `refreshAvailability` | agent loop，**每一次执行尝试开始时**（[PF-012「每一次尝试开始，都要做四件事」](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)） |
| `lookup`、`list` | agent loop、`Tools()`／`Skills()`、斜杠命令识别、放行判断取工具定义、工具执行运行时 |
| `markFailed` | ③ 型流程的派发，在那一次失败**已经记进会话日志之后** |
| `onAssetChange` | 把资产治理的通知转到据点上的那一方（装配给，[S-31](#s-31-装配给的保证-vs-协议须给的保证)） |

### S-22 fill：装配时填六张

`fill`

| # | 内容 |
|---|---|
| ① | 会话、`EffectiveAssembly`（`capability.asset-evaluation`）、它所依的那次求值的 `EvaluationRef` |
| ② | `EvaluationRef` 指认**这个会话这一次装配**的那条装配清单记录——那次求值是为这个会话的租户身份、工作区与定义版本做的；**这条记录与 ④ 的六份快照是同一次提交**，调用时它可以还没落下；求值结果合它自己契约的形状；`unresolved` 为空；`tool` 表不撞名 |
| ③ | 无 |
| ④ | 对六类各建一份快照：条目 = 求值结果里**生效、且在组合里**的这一类资产，按求值结果的次序；`skill`、`slash_command` 两类照求值结果放——用不了的不在结果里（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)）；每条带填表这一刻算出的 `availability`（MCP 动作条目要等第一次尝试开始才钉）。**六份快照与这次装配在装配清单里的那一条记录一次成立**：这次求值与六张表的构成在**同一条**记录里，不是两条（[S-18](#s-18-快照不持久装配清单是唯一权威) 第 1 条）；它落下就是提交点，`EvaluationRef` 指认的就是它（[S-17](#s-17-换表同一会话串行多表一次成败同一)）。这个会话已有表时，这就是一次完整重新装配，**六张整批顶替** |
| ⑤ | 六份 `RegistrySnapshot`，一类一份，`filledBy = assembly` |
| ⑥ | `invalidInput`（含 `EvaluationRef` 不属于这个会话、求值结果不合形状、`invalidInput{evaluationSuperseded}`——见 ⑦）→ `sessionNotFound` → `dependencyUnresolved{missing}` → `toolNameConflict`；**任一步读不到 ⇒ `unavailable`**（含求值结果里 `resident` 缺席）。求值以 `compositionCycle`、`categoryUnsupported` 失败时没有 `EffectiveAssembly` 可交，`fill` 不会被调到——收口归装配（[`capability.asset-evaluation/v2#S-31`](../../asset-evaluation/v2/contract.md#s-31-unresolved-交到装配手上怎么收场)） |
| ⑦ | **同一个 `EvaluationRef` 再 `fill` 一次**，按 [S-13](#s-13-evaluationref) 分三种（主线裁定，见 D-060 §八 M34）：① 那条记录**还没落下** ⇒ 这就是那一次装配，照 ④ 做；② 已经落下、**当前六张正是它填出来的**（六份的 `filledBy = assembly`、`basedOn` 都是它）⇒ 原样返回这六份，**不再记一条**——回执丢了的重试认回同一次；③ 已经落下、**六张里有一张已不是它填出的**（此后有过 `reload`、`markFailed`、`onAssetChange` 或另一次装配）⇒ **`invalidInput{evaluationSuperseded}`**，表不换、装配清单不多一条——**不当作一次新的装配**：一个旧的 `EvaluationRef` 指认的是一次已经被取代的求值，拿它重填就是把会话退回过去 |
| ⑧ | 装配清单读不到、写不进，「谁可以用」读不到 ⇒ `unavailable`，**不留一张半张**（[PF-004 I-9](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) 的同形：不产生残缺的构成）；**不得把门控读不到的命令当作可以用装进去，也不得当作不可以用漏掉** |
| ⑨ | 不发（[S-29](#s-29-本版不发本契约自己的事件)） |

**缺一个引用就整次失败**，不是「装上找得到的那些」：[「引用的能力标识无人提供 → 明确失败并指出缺哪个，不悄悄少装」](../../../../product/PF-004-agent-definition-and-assembly/design.md#62-装配)。

### S-23 reload：按类别重填

`reload`

**reload 一族恰六条，一类一条，名字是 `omne-official:reload-<类别>`**：
`omne-official:reload-tool`、`omne-official:reload-skill`、`omne-official:reload-slash_command`、
`omne-official:reload-loop_extension`、`omne-official:reload-mcp`、`omne-official:reload-plugin`。
它们是系统提供的 ③ 型命令（[PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)：保留名一律在 `omne-official` 前缀下）；派发到的就是本操作，参数是那一类。
**这几个名字合 `data.asset-model/v2#S-2` 的能力标识名词法（允许冒号）与 `data.slash-command/v2#S-3` 的保留区拼法**（原 G-10 闭合）。

| # | 内容 |
|---|---|
| ① | 会话、类别 |
| ② | 类别是六类之一；这个会话有表（或能按 [S-33](#s-33-本能力重启与重建) 重建） |
| ③ | `connector`、`agent_definition` ⇒ `categoryNotRegistered` |
| ④ | **按此刻的求值结果重填**：请求一次此刻的求值——此刻的持有与配值，**连同工作区承载目录此刻的内容**（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)「工作区承载目录里对应文件的改动都在这一次进来」），**定义版本仍是这个会话装配清单所依的那一个**，组合根（`root`：`definition` 与从那一版定义正文读出的 `references`，`capability.asset-evaluation/v2#S-6`）也就是那一次的；按 `fill` 的同一套规则建**目标表**（判 `dependencyUnresolved`、`toolNameConflict`）；**全部通过之后**，把「这次求值 ＋ 每张目标表的完整构成」作为**一条** reload 记录追加进装配清单——**追加成功是唯一的提交点**，新的 `EvaluationRef` 由这条记录给出。**被拒或追加不成，装配清单里什么都不留**：这次求值不单独记一条，表不换。**目标表**：就是那一类；**类别是 `plugin` 时另加连带**——旧 plugin 表与新 plugin 表里全部 plugin 的成员所属的那几类（去掉不建表的类别），**重填的依据是同一次求值** |
| ⑤ | 每张目标表一份 `RegistrySnapshot`，`filledBy = reload{command}`，`command` 是那条命令的名字（连带的几张记 `omne-official:reload-plugin`）。**后置**：装配清单里**恰多了一条 reload 记录**——这次求值、每张目标表的完整构成、`filledBy`、`filledAt`（[S-18](#s-18-快照不持久装配清单是唯一权威) 第 1 条）；**记录形状 `data.messages` v2 与 PF-004 都没有**，[G-1](#十已知缺口) |
| ⑥ | `invalidInput` → `categoryNotRegistered` → `sessionNotFound` → **`compositionCycle{cycle}` → `categoryUnsupported{category}`**（此刻的求值以它失败，原样转交；表不换、装配清单里什么都不留）→ `dependencyUnresolved{missing}` → `toolNameConflict`；读不到 ⇒ `unavailable` |
| ⑦ | **每调一次重填一次**：没变化也产生新快照（新的 `filledAt`），条目与前一份相同。**不去重**——人敲两次 reload 就是两次 |
| ⑧ | 工作区承载目录此刻读不到或解析不了 ⇒ `unavailable`，**表不换**（不当作「工作区是空的」）；求值、「谁可以用」、装配清单任一读不到或写不进 ⇒ `unavailable`，**表不换** |
| ⑨ | 不发 |

- **它不是一次完整的重新装配**（[PF-002 decisions 2026-09-23](../../../../product/PF-002-assets-settings-and-permissions/design.md)）：不动目标表以外的表，不换定义版本。**定义版本不随 reload 变是推导**：[改了 Agent Definition 走的是下一次 run 的重新装配](../../../../product/PF-004-agent-definition-and-assembly/design.md#53-三个时刻)，reload 若顺手换了定义版本，就成了一次没有经过装配的装配。
- **不改写正在跑的尝试已经拿到的构成**（[PF-004 §6.3](../../../../product/PF-004-agent-definition-and-assembly/design.md#63-三类变化三种传播)）：正在跑的那一次尝试照它报告所依的快照读，新条目对它是「没有」；**同一运行的下一次尝试起看到新的**（主线裁定，见 D-060 §八 M35；原 [G-2](#十已知缺口) 闭合，[S-34](#s-34-进行中的运行与撤销)）。
- **reload 之后新得到权限的命令与技能进来了**：这正是「放宽要等 reload」的那个时刻（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 4 条）。

### S-24 refreshAvailability：每次执行尝试开始时现算

`refreshAvailability`

| # | 内容 |
|---|---|
| ① | 会话、`run`：**`start{runId}`**（这一次尝试是这次运行的第一次）或 **`continue{runId, report}`**（同一次运行里后面的一次，带这次运行此前任一次尝试的报告）；`runId` 是 `data.call-accounts/v2#S-37` 的 `RunId`。**`attempt`**：这一次尝试的 `AttemptId`（同一条，M46），调用方从这一次尝试开始的那一刻取得，本契约不铸、不推。`run` 与 `attempt` 都必填（[S-19](#s-19-缺席时的默认答案)） |
| ② | 这个会话有表（或能重建）；**调用方是这一次执行尝试的开头**，在 agent loop 读取常驻条目之前；`continue` 带的报告**是这个会话、这个 `runId` 的**（报告带着二者，[S-11](#s-11-一次执行尝试的可用性报告)）。**两次求值的输入由装配收齐**（[S-31](#s-31-装配给的保证-vs-协议须给的保证)）：配方与这个会话最近一次装配或 reload 的那次求值相同——同一个会话创建时捕获的租户身份与成员资格、同一份工作区（承载目录用最近一次装配或 reload 读入的那一份，不在这里重读）、这个会话装配清单所依的定义版本、**同一个组合根**（`root`：`definition` 与从那一版定义正文读出的 `references`，[`capability.asset-evaluation/v2#S-6`](../../asset-evaluation/v2/contract.md#s-6-求值输入-evaluationinput)，M31——定义版本不变，它就不变）、会话格的配值——**持有与配值取此刻的** |
| ③ | 无 |
| ④ | **只读快照、不换快照、不写装配清单**。依次：<br>**1. 第一次求值**：按 ② 的输入请求一次此刻的求值（`capability.asset-evaluation`，不带 `mcpActionSets`）。<br>**2. 技能门控**（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条）：`start` ⇒ 对当前 `skill` 表每一条，看第一次求值有没有把它那份持有以 `not_usable` 滤掉，滤掉的写进这份报告——这次运行钉住的那一份；`continue` ⇒ 原样带上那份报告里钉住的，**不重判**。<br>**3. 可用性**：对当前六张表的每一条算 `availability`（[S-8](#s-8-当下可用性的三个取值)）：工具按 `data.tool-definition/v2#S-19` 得出的依赖声明（目标环境那一项用求值后的值），技能按 `data.skill-package` 的依赖声明，拓展件按 `data.loop-extension/v2#S-9`；**先工具、后技能**。<br>**4. MCP**：对 `mcp` 表里每个接入点，从第一次求值得出它生效的那份持有、记进报告的 `endpointHoldings`，按 [S-12](#s-12-mcp-动作条目在一次尝试内钉住) 调桥、钉住这一次的动作条目与接入点那一行的可用性。<br>**5. 第二次求值**：第一次求值的输入加上 `mcpActionSets`——每个钉住了一份 `fetched` 副本的接入点一份，`scope` 取它生效的那份持有所在的格（[`capability.asset-evaluation/v2#S-6`](../../asset-evaluation/v2/contract.md#s-6-求值输入-evaluationinput)）——再求一次；从它取 `tool` 表**每条条目**的执行权限项、以条目的模型面名字为键记进报告的 `effectivePermissions`（[S-11](#s-11-一次执行尝试的可用性报告)）：作者写的与官方的工具取它能力标识的 `execute`，钉住的动作条目取它接入点的 `execute:<对端动作名>`；**meta 门条目不取，恒写 `{auto}`**（D-060 §七 M21）。**没有钉住任何动作条目时**，第二次求值的输入就是第一次的，结果相同（[`capability.asset-evaluation/v2#S-11`](../../asset-evaluation/v2/contract.md#s-11-纯计算)），直接从第一次求值的结果取，不另求。<br>**6.** 对多命令工具算 `commandAvailability`（[S-9](#s-9-按命令的可用性)）；查 `tool` 表加上动作条目之后的名字冲突 |
| ⑤ | 一份 `AvailabilityReport`（[S-11](#s-11-一次执行尝试的可用性报告)），带会话、`runId` 与 ① 给的 `attempt` |
| ⑥ | `invalidInput`（含 `run` 或 `attempt` 缺席、`continue` 带的报告不是这个会话或这个 `runId` 的）→ `sessionNotFound` → **`compositionCycle{cycle}` → `categoryUnsupported{category}`**（第一次求值以它失败，原样转交，不交报告）→ `toolNameConflict`；快照读不到、重建不了、第一次求值拿不到 ⇒ `unavailable` |
| ⑦ | **无状态副作用**，可以重复调；同一次尝试里以它拿到的那一份为准（[S-11](#s-11-一次执行尝试的可用性报告) 第 1、3 条）。**调用方只在一次运行的第一次尝试用 `start`**；**唯一的具名例外是崩溃恢复**：恢复之后的尝试拿不回那份报告时，以**同一个 `runId`** 再 `start`，门控按此刻重判（[S-11](#s-11-一次执行尝试的可用性报告) 第 4 条、[G-15](#十已知缺口)）。同一次运行以 `start` 调了两次，钉住的是后一次判的 |
| ⑧ | **第一次求值以 `compositionCycle` 或 `categoryUnsupported` 失败不是「拿不到」**：它是判出来的，原样转交（⑥）；同理没有报告——技能门控与接入点持有同样没有依据。第二次求值只比第一次多了动作集，第 2 步相同（`capability.asset-evaluation/v2#S-11`），不会单独以这两个值失败。**第一次求值拿不到（含其中「谁可以用」的判定读不到）⇒ 整个 `unavailable`**：技能门控与接入点持有都没有依据——**不当作都用得了、也不当作都用不了，也不拿装配那一次的持有去连**（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 5 条、[S-12](#s-12-mcp-动作条目在一次尝试内钉住)）。**第二次求值拿不到 ⇒ 报告照常交出，`effectivePermissions` 里除 meta 门外的项一律 `unavailable`**——不补作者默认或任何一档，放行判断据此同批全拒（[S-11](#s-11-一次执行尝试的可用性报告)）。**某一项依赖的提供者读不到，只让那一条不满足**（[S-8](#s-8-当下可用性的三个取值) 第 3 条）、不让整个操作失败；有效运行模式读不到，只让 `request_approval` 那一条命令关（[S-9](#s-9-按命令的可用性) 第 3 条）；MCP 桥连不上或读不到，按 [S-12](#s-12-mcp-动作条目在一次尝试内钉住) 表中各行——**没有一种情形把读不到当成「可用」或「放行」** |
| ⑨ | 不发；可用性变化也不出提醒（[S-30](#s-30-可用性变化不出提醒)） |

**为什么是两次求值**（D-060 §五 K30）：MCP 的逐动作执行权限由正文与**这一次钉住的动作集**推出（`data.mcp-endpoint/v2#S-15`），而动作集要先拿到接入点持有、调过桥才钉得住——第一次求值给出持有，第二次求值给出逐动作权限。**两次都取此刻的持有与配值**（对「装配那一次的输入」的读法：沿用它的配方，不沿用它的持有——主线接受，D-060 §六 L8、N-10），于是凭据改值、清值与任一工具条目的执行权限改值都在**下一次尝试开始时**生效（`capability.mcp-bridge` 的 P-9；[PF-004 §6.5](../../../../product/PF-004-agent-definition-and-assembly/design.md#65-权限变化动作空间不变) 权限从来按新值判）；沿用装配那一次的持有，它们就要等 reload 才生效，而一次被收成 `forbid` 的动作会在那之前照旧放行。作者写的与官方的工具不需要动作集，它们的执行权限第一次求值就有；**仍从第二次求值取**（没有动作集时两次相同），是为了报告里全部工具条目的执行权限出自同一次求值、同一个新鲜度口径（D-060 §六 L13）。

**依赖恢复之后**，下一次尝试开始时这条条目自动换回真身，无人干预；**一直没有新的尝试，它就一直是替换件**——那不是故障（可用性只在开始时重算）。

### S-25 lookup：查一条

`lookup`

| # | 内容 |
|---|---|
| ① | 会话、类别、名字、`within`：**`session`**（不在任何一次运行里的读：斜杠命令识别、② 型命令展开）或 **`run{report}`**（一次运行里的读：agent loop、`Tools()`／`Skills()`、放行判断、工具执行运行时——带这一次尝试的报告）。`within` 必填（[S-19](#s-19-缺席时的默认答案)） |
| ② | 这个会话有表（或能重建）；`run` 带的报告是这个会话的，且是调用方所在那一次尝试的 |
| ③ | `connector`、`agent_definition` ⇒ `categoryNotRegistered` |
| ④ | 只读。**在哪一份快照里找**：`within = session` ⇒ 那一类的**当前**快照；`within = run{report}` ⇒ **那份报告所依的那一份**（[S-11](#s-11-一次执行尝试的可用性报告)），不论此后有没有换表——此后 reload 进来的条目对这一次尝试是「没有」，被换掉的照样在（主线裁定，见 D-060 §八 M35）。在那一份里按名字找（逐码点相等，`data.asset-model/v2#S-3`）；**`tool` 类的查找键是模型面名字 `ModelToolName`**（[S-7](#s-7-注册表条目)；D-060 §七 M8）——调用方拿调用块里的 `tool` **原样**来查，本契约不做逆转写、不按定义名另找；`within = run` 时**含**那份报告钉住的 MCP 动作条目，`within = session` 时**不含**——动作条目只属于一次尝试（[S-12](#s-12-mcp-动作条目在一次尝试内钉住)），不在任何一次尝试里的读没有可指的那一份，**也不去取「最近一份报告」**（报告不持久，重启之后、第一次尝试之前都没有它）。找到的在 `slash_command` 表里：**现读**它此刻可不可以用；在 `skill` 表里：`session` ⇒ 现读，`run` ⇒ **按报告钉住的技能门控**，钉住的「用不了」当作不在，**不现读**（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条） |
| ⑤ | **找到**：那条 `RegistryEntry`，带的 `availability`：`run` ⇒ 那份报告里的，`session` ⇒ 最近一次算出的（[S-8](#s-8-当下可用性的三个取值) 末段）；**没有**：一个明确的「没有」——不在 ④ 那一份快照里（`run` 的读里含「报告之后才 reload 进来」，M35），或在门控的两类里此刻不可以用，**几种原因同一个回答** |
| ⑥ | `invalidInput`（含 `within` 缺席、报告不是这个会话的）→ `categoryNotRegistered` → `sessionNotFound`；读不到 ⇒ `unavailable` |
| ⑦ | 只读；门控的现读结果**不跨调用缓存**，除非提供者设计按 `data.identity-values/v1#S-27` 写明失效条件与最大陈旧窗口 |
| ⑧ | 要现读时「谁可以用」读不到 ⇒ `unavailable`——**不回答「没有」，也不回答那一条**（`run` 读 `skill` 表不现读，不会走到这一行）；快照读不到、重建不了 ⇒ `unavailable`——`run` 的读里**含报告所依的那一份已被顶替、此刻取不回**（例如实例重启过、那一版正文无法原样取回，[S-33](#s-33-本能力重启与重建) 第 3 条），**不改读当前那一份**（本契约推导，M35 的直接后果） |
| ⑨ | 不发 |

**「没有」是一个结论，不是失败**：斜杠命令识别拿到它，就当场明说「没有这个命令」、不发送（[PF-016 §5.7](../../../../product/PF-016-cli-tui-delivery-surface/design.md#57-人要做的事分三族)）；拿到 `unavailable`，说的是「现在判断不了」，**不得说成「没有这个命令」**。
`tool` 类以 `within = run{report}` 查到的「没有」，与那份报告的 `effectivePermissions` 里查不到键是**同一个结论**（[S-11](#s-11-一次执行尝试的可用性报告)）：那个调用不进放行判断，执行运行时拿它即刻收场 `unavailable{no_such_entry}`（D-060 §七 M8、M10）——不是读不到。

### S-26 list：列一类

`list`

| # | 内容 |
|---|---|
| ① | 会话、类别、`within`（同 [S-25](#s-25-lookup查一条)） |
| ② | 同 [S-25](#s-25-lookup查一条) |
| ③ | 同 [S-25](#s-25-lookup查一条) |
| ④ | 只读；那一类**在 [S-25](#s-25-lookup查一条) ④ 那一份快照**（`session` ⇒ 当前的，`run` ⇒ 报告所依的，M35）里的全部条目，**按快照次序**；`tool` 类在 `within = run` 时后面接上那份报告钉住的 MCP 动作条目，按接入点在 `mcp` 表里的次序分组，`within = session` 时不接（同 [S-25](#s-25-lookup查一条) ④）；`slash_command` 逐条现读、此刻不可以用的不列；`skill` 按 `within` 现读或按报告钉住的门控（同 [S-25](#s-25-lookup查一条) ④） |
| ⑤ | `RegistryEntry` 的序列，可以为空——**空表是一个结论**（这一类这个会话什么都没装） |
| ⑥ | 同 [S-25](#s-25-lookup查一条) |
| ⑦ | 只读，不缓存门控结果（同 [S-25](#s-25-lookup查一条) ⑦） |
| ⑧ | **要现读的任何一条门控读不到 ⇒ 整个 `unavailable`**，不返回少了几条的列表 |
| ⑨ | 不发 |

### S-27 markFailed：命令型服务报错之后，去掉那一条

`markFailed`

**③ 型所指的那项服务不在了或拒绝了，执行时明说失败、会话日志照记；随后系统自动刷新命令注册表，那条命令从此不在这个会话的命令集里**（[PF-002 §4 ③ 型那一行](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)；decisions [「未决一」原话](../../../../product/PF-002-assets-settings-and-permissions/design.md)「确切时刻归规格」）。

| # | 内容 |
|---|---|
| ① | 会话、那条命令的能力标识 |
| ② | 能力标识的类别是 `slash_command`；它若在当前快照里，它的绑定是 ③ 型（`data.slash-command` 的 `command` 那一支）；**它不是 reload 一族**。调用方已把那一次失败记进会话日志 |
| ③ | 无 |
| ④ | 产生一份新的 `slash_command` 快照 = 当前那份去掉这一条；记进装配清单；**单表、单次提交**。**只去掉这一条，不带进任何别的变化**——不重新求值，① ② 型的增删禁用、新得到的权限都不因此进来 |
| ⑤ | 新的 `slash_command` 快照，`filledBy = auto_refresh_after_failure`，`basedOn` 沿用 |
| ⑥ | `invalidInput`（类别不对、是 ① ② 型、是 reload 一族）→ `sessionNotFound`；读不到或记不进 ⇒ `unavailable` |
| ⑦ | **幂等**：它已经不在当前快照里 ⇒ 原样返回当前那份，不再记一条 |
| ⑧ | 装配清单记不进 ⇒ `unavailable`，**那条命令还在**；下一次有人敲它、它再失败，调用方再调本操作 |
| ⑨ | 不发 |

- **确切时刻：本操作返回之前就换好**——此后任何一次识别都不认得它，早于「下一次尝试开始之前」这条上界。
- **只删不增**（D-060 §S22 S22-b），依据有两条：[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变) 写「③ 型不等 reload」的理由是「它的消失不是谁对资产做的一个决定，是系统那一侧的一个事实」——这一次自动刷新答的只是那个事实；而 ① ② 型的增删禁用「要让它在这个会话里生效，人发对应的那条 reload」。**全量重填会让后者在人不知情时进来**。
- **reload 一族不因本操作消失**：它们的服务就是会话资产注册表自己，它在就答得出；它们的 `unavailable` 是一次判不出来，不是「服务不在了」。去掉了，人就再也没有办法重填这张表。
- **那条命令什么时候回来**：人发 `omne-official:reload-slash_command`，或一次完整的重新装配——那时按此刻求值，服务回来了它就在。

### S-28 onAssetChange：权限收回之后收窄

`onAssetChange`

**主线补充裁定**（见 D-060 §六 N-10）：资产治理的 `HoldingChanged`／`AssignmentChanged` 通知到达时，会话资产注册表对受影响的类别做一次刷新，让「权限收回此刻起不存在」有一个写进快照的兑现点，不等人敲 reload。

| # | 内容 |
|---|---|
| ① | 会话、一条资产变化通知（`capability.asset-governance/v2#S-48` 的 `HoldingChanged` 或 `AssignmentChanged`） |
| ② | 这个会话有表（或能重建） |
| ③ | 无 |
| ④ | 对当前 `slash_command` 快照里的每一条，**现读**它此刻可不可以用（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)）；有不可以用的 ⇒ 产生一份去掉那些条的新快照，**一次提交、记进装配清单**；没有 ⇒ 什么都不换。**只删不增**；其余五张表不动——**`skill` 表也不动**：技能的收回从下一次运行起生效，这里去掉会连已开始的运行一起去掉（R2-13） |
| ⑤ | `slash_command` 表此刻的快照（换了的是新的，`filledBy = asset_change`，`basedOn` 沿用；没换的原样） |
| ⑥ | `invalidInput` → `sessionNotFound`；读不到或记不进 ⇒ `unavailable` |
| ⑦ | **幂等**：同一条通知送到两次、或连续几条通知，第二次起再没有可去的就什么都不换 |
| ⑧ | 门控读不到 ⇒ `unavailable`，**什么都不去**（此时读时的现读照样把它们挡在外面，[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条） |
| ⑨ | 不发 |

**本操作只做收窄**（D-060 §S22 S22-a：早先「做一次等价于 `reload(category)` 的重填」作废）。理由：**一次全量重填会把 ① ② 型的增删禁用与新得到的权限一并带进进行中的会话**——
与 [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变) 的两句「① ② 型的增删与禁用，不会自己改变进行中的会话」「进行中新得到权限的，要等下一次 reload 或重新装配才出现」直接相抵；
对工具等其余类别，也与 [PF-004 §6.3](../../../../product/PF-004-agent-definition-and-assembly/design.md#63-三类变化三种传播)「构成性变化作用于下一次装配」相抵。
收回的即时写进快照，违背产品正文的那一半不做。

**正确性不靠本操作**：通知是[通知](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)，不承诺送达，中心发的到不了据点；「收回此刻起不存在」由读时现读兑现（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条）。
**本操作买到的是「重新授予要等 reload」**：收回被写进了快照（也写进了装配清单），之后再授予，它也不会自己回来。
**前提**：收回的通知在重新授予之前到了。**通知丢了、随后又被重新授予**，那条命令会在没有 reload 的情况下重新可见——这是本版的已知边界，并入 [G-3](#十已知缺口)。

---

## 五、事件与提醒

### S-29 本版不发本契约自己的事件

**本契约的操作 ⑨ 一律「不发」。**消费者在自己的时机来读：agent loop 在每次尝试开始时调 [S-24](#s-24-refreshavailability每次执行尝试开始时现算)、读常驻条目；斜杠命令识别每次都现查。**会话资产注册表从不把「表换了」推给一个活着的 agent runtime**——一副 agent runtime 活着期间，它系统提示词的成分只随它自己在尝试开始时读到的那一份。

本契约不自造事件名。将来开事件，**只能是通知**：任何参与判定的都走直接调用，不靠某个监听者收到了什么。

### S-30 可用性变化不出提醒

**可用性变了，本版不向 agent 出提醒**（D-060 §S22 S22-d：早先「可用性变化要提醒 agent」作废）。
[PF-012「每一次尝试开始」](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)现文写的是「不必额外告知 agent 差异」，现文优先。

- **agent 从哪里知道**：每次尝试开始时的报告决定它面前是真身还是替换件（[S-11](#s-11-一次执行尝试的可用性报告)），替换件的说明写着原因（[S-10](#s-10-替换件同形只换说明)）；`Tools()`／`Skills()` 读到的就是这一份。
- **会话资产注册表不存「上一次」**，也没有任何一方需要比较前后两份报告。

---

## 六、性质与前提

性质的来源一律引 PF 小节；**本节行不编号，不是可外部引用的条款**。

### 不变量

| 性质 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **快照只在 [S-15](#s-15-快照只在这几个时刻换) 的四个时刻换**；可用性、资产变化、新授予的权限、读、重建都不换 | 各操作 ④；[S-17](#s-17-换表同一会话串行多表一次成败同一) 串行 | 调用方不绕过会话资产注册表去读求值结果 | [PF-002 §4「会话认得哪些命令」](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变) |
| **会话斜杠命令集 ⊆ 这个会话的租户身份此刻有权用的**，外加只收窄不放宽 | [S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 三处门控 | 据点副本读到新值（[PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活)） | 同上；[UL-session-slash-command-set](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set) |
| **可用性只由依赖解析算出**：没有第三态、没有写入口 | [S-8](#s-8-当下可用性的三个取值) 第 1、5 条 | 提供者的自报与作者的声明是真的 | [PF-006 §4 可用性](../../../../product/PF-006-tools-and-skills/design.md#可用性)、[§6.4](../../../../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析) |
| **不可用不改条目集合与次序**；替换件沿用原条目的身份、同形只换说明 | [S-8](#s-8-当下可用性的三个取值) 第 6 条、[S-10](#s-10-替换件同形只换说明) | — | [PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装) |
| **一次执行尝试内，条目集合、可用性、MCP 动作集、接入点持有与全部工具条目的执行权限不变**（条目集合含尝试中途的 reload：M35） | [S-11](#s-11-一次执行尝试的可用性报告)、[S-12](#s-12-mcp-动作条目在一次尝试内钉住)、[S-25](#s-25-lookup查一条) ④ | 调用方在一次尝试里只用它开始时拿到的报告，读一律带 `within = run{它}` | [PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp)「一次尝试之内不变」；[PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作)；K30；L13 |
| **一次运行内，技能门控不变**：运行开始时判下来用不了的，这次运行里一直不在；用得了的，收回也不在这次运行中途去掉 | [S-24](#s-24-refreshavailability每次执行尝试开始时现算) 的 `start` 钉、`continue` 沿用；[S-25](#s-25-lookup查一条)／[S-26](#s-26-list列一类) 的 `within = run` 按它读；[S-28](#s-28-onassetchange权限收回之后收窄) 不动 `skill` 表 | 调用方只在第一次尝试用 `start`（崩溃恢复是具名例外）、同一运行后面的尝试带报告、运行里的读带 `within = run`；`continue` 的 `runId` 与报告相符由 [S-24](#s-24-refreshavailability每次执行尝试开始时现算) ② 核对；报告跨崩溃恢复保得住（[G-15](#十已知缺口)） | [PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)「已经开始的运行不变，自下一次运行起不再装入」；R2-13 |
| **常驻只来自求值结果**；meta 门条目会话资产注册表从不去掉、从不标非常驻；多命令工具一个槽位 | [S-7](#s-7-注册表条目) | 求值给出常驻值（`capability.asset-evaluation/v2#S-38`；缺席时填表 `unavailable`） | [PF-006 §6.1](../../../../product/PF-006-tools-and-skills/design.md#61-常驻标记挂在引用条目上agent-definition-压-plugin)、[槽位](../../../../product/PF-006-tools-and-skills/design.md#槽位) |
| **「会话装了什么」只有装配清单一个权威**；每一次换表都在清单里 | [S-18](#s-18-快照不持久装配清单是唯一权威) | 装配清单有追加面（[G-1](#十已知缺口)） | [PF-004 §4 装配清单](../../../../product/PF-004-agent-definition-and-assembly/design.md#装配清单) |
| **一个会话的条目只来自这个会话自己的求值**，不出现在别的会话的读里 | [S-6](#s-6-注册表快照) 第 1 条、[S-22](#s-22-fill装配时填六张) ② | — | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) |

### 安全性质（绝不能发生）

| 绝不能发生 | 谁在何处保护 | 前提 | 来源 |
|---|---|---|---|
| **人敲一条无权用的命令，得到的回答与敲一个不存在的名字不同**，或它被展开、被当成一句话送进会话 | [S-14](#s-14-会话斜杠命令集是-slash_command-那张表的视图)、[S-25](#s-25-lookup查一条) ⑤ | 识别只按本契约的回答 | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变) |
| **权限收回之后，同一会话里还敲得出那条命令**（据点已读到新值之后） | [S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 读时现读 | 同上 | 同上 |
| **没人发 reload、也没有完整重新装配，① ② 型的增删禁用却改了进行中会话认得的命令** | [S-15](#s-15-快照只在这几个时刻换)；[S-27](#s-27-markfailed命令型服务报错之后去掉那一条)、[S-28](#s-28-onassetchange权限收回之后收窄) 只删不增 | — | 同上 |
| **② 型命令绕过那个技能自己的使用权限** | [S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)（`skill` 表门控） | 展开时经 `skill` 表查 | [PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) |
| **不可用被做成「不装」**：依赖不满足、MCP 连不上时条目从 agent 面前消失 | [S-8](#s-8-当下可用性的三个取值)、[S-12](#s-12-mcp-动作条目在一次尝试内钉住) | 接入点有上一次的动作清单 | [PF-006 §6.3](../../../../product/PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装) |
| **一次尝试中途，agent 面前的 MCP 条目因对端增删动作或凭据被撤而变** | [S-11](#s-11-一次执行尝试的可用性报告) | 同上 | [PF-002 §4 MCP](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp) |
| **读不到被当成「可用」「可以用」「没有」「空表」** | [S-19](#s-19-缺席时的默认答案) 与各操作 ⑧ | 各读面以失败返回，不以空值返回 | `data.identity-values/v1#S-19` |
| **拿不到一条工具条目的执行权限时补上一档**（作者默认、`auto`、`ask` 或 `forbid` 都算补；作者写的工具与 MCP 动作一样）；**把不在组合里写成 `unavailable`、或把求值失败写成 `not_in_composition`**；**为 `tool` 表里没有的名字造一项**（含失去生效持有的接入点的动作）；**meta 门那一项读求值**、或随求值失败变成 `unavailable` | [S-11](#s-11-一次执行尝试的可用性报告) `effectivePermissions`、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ④⑧ | 放行判断的调用方只从报告取这一项，按调用块的 `tool` 原样查键 | K30；`capability.tool-admission` 的 S-8；`data.mcp-endpoint/v2#S-15`；D-060 §七 M8、M10、M21 |
| **一次尝试用装配那一次（或更早）的接入点持有去连对端** | [S-12](#s-12-mcp-动作条目在一次尝试内钉住) 末行、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ⑧ | 求值此刻可得 | `capability.mcp-bridge` 的 P-9；[PF-001 §6.6](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#66-撤销不等于强制停止) 撤销管下一道准入 |
| **一次换表留下半截**：几张表各换了一半，或快照换了而装配清单里没有 | [S-17](#s-17-换表同一会话串行多表一次成败同一) | 单次提交原子性（装配给） | [PF-004 I-9](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) |
| **重启之后，命令集在人不知情时变了** | [S-33](#s-33-本能力重启与重建) 按清单重建、重建不了就明确失败 | 装配清单记下了每一次换表 | [PF-015 §6.11](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#611-会话睡醒之后还是原来那个) |

### 进展性质（全部有界）

| 性质 | 上界 | 前提 | 来源 |
|---|---|---|---|
| 依赖恢复之后，条目换回真身 | 下一次执行尝试开始 | 此后有一次尝试；提供者自报可用 | [PF-006 §6.2](../../../../product/PF-006-tools-and-skills/design.md#62-可用性在每次-run-开始前重算) |
| MCP 对端增删动作之后，agent 面前的条目随之变 | 下一次执行尝试开始 | 此后有一次尝试；接入点连得上 | [PF-006 §6.13](../../../../product/PF-006-tools-and-skills/design.md#613-mcp-接入点带来的动作) |
| MCP 凭据或任一工具条目的执行权限改值之后，调用按新值 | 下一次执行尝试开始 | 此后有一次尝试；据点读得到新配值 | [PF-004 §6.5](../../../../product/PF-004-agent-definition-and-assembly/design.md#65-权限变化动作空间不变)；K30；L13 |
| 权限收回之后，会话此刻起不再认得那条命令 | 据点读到新值之后的下一次读 | 据点副本的新鲜度（装配给）；离线时推迟到再连上 | [PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变) |
| 技能的「谁可以用」被收回之后，agent 面前不再有它 | 据点读到新值之后**下一次运行开始** | 同上；此后有一次运行 | [PF-002 §5.2](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁可以使用它是各类资产共用的一项权限)；R2-13 |
| ③ 型失败之后，那条命令不再可见 | `markFailed` 返回 | 调用方在失败落日志之后调它；装配清单写得进 | 同上 |
| 人发 reload 之后，那一类按此刻求值重取（含工作区文件的改动） | `reload` 返回 | 工作区承载目录此刻可读 | 同上；[PF-002 decisions](../../../../product/PF-002-assets-settings-and-permissions/design.md) |
| 被拒的操作立即返回一个具名值，且不留部分效果 | 该次返回 | 单次提交原子性 | [PF-004 I-9](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) |

---

## 七、装配给的保证 vs 协议须给的保证

### S-31 装配给的保证 vs 协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：右列是本契约已经记下的待兑现项（[G-11](#十已知缺口)），不是「以后再说」。

| 保证 | 本版（单机）由谁给 | 跨进程之后谁重新兑现 | 做不到会怎样 |
|---|---|---|---|
| **同一会话的换表串行、多表一次成立**（[S-17](#s-17-换表同一会话串行多表一次成败同一)） | **装配给**：据点进程里一个会话资产注册表服务，按 (会话, 类别) 键控；换表与装配清单追加落在同一存储的同一事务 | **协议给**：按会话的单写者，或以装配清单的条件追加兑现先后 | plugin 表说有某个 plugin、它的成员表却还是旧的；两次 reload 交错，后一次被前一次盖掉 |
| **换表先记进装配清单再生效**（[S-18](#s-18-快照不持久装配清单是唯一权威)） | **装配给**：同上 | **协议给**：清单追加成功才是提交点；「调用返回了」不构成 | 重启之后重建出来的与重启之前不同——命令集在人不知情时变了 |
| **「谁可以用」现读的新鲜度**（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)） | **装配给**：据点上的中心事实副本（`apps/cli` 装配；M40，D-059），读面即副本；新鲜度无上界是 [PF-016 §6.17](../../../../product/PF-016-cli-tui-delivery-surface/design.md#617-治理中心不可达已经开着的会话照常干活) 写明的取舍 | **协议给**：副本的陈旧窗口写进契约；**陈旧读不得放宽**（只收窄的方向可以晚，不可以错） | 收回的命令在离线期间仍敲得出（已接受的代价）；若副本把收回读丢了，则一直敲得出 |
| **资产变化通知转到据点、分发到会话**（[S-28](#s-28-onassetchange权限收回之后收窄)） | **装配给**：据点副本更新时由装配调本契约；**正确性不依赖它** | **协议给**：不需要可靠投递——读时现读兜底 | 「重新授予要等 reload」在通知丢失时不成立（[G-3](#十已知缺口)） |
| **一次尝试内可用性、MCP 动作集、接入点持有与全部工具条目的执行权限不变；技能门控一次运行内不变**（[S-11](#s-11-一次执行尝试的可用性报告)） | **装配给**：报告作为一个值交给那一次尝试的调用方；调用方如实带上它所在运行的 `runId` 与这一次尝试的 `attempt` | **协议给**：报告随尝试传递、带会话、运行与尝试标识（M46），接收边界核这三者；远端不得替那一次尝试现算一份新的，也不得把别的运行或同一运行上一次尝试的报告当作这一次的 | 尝试中途 agent 手上的清单变形；MCP 调用用了与放行判断看到的不同的持有；一次新运行沿用了上一次运行的门控，收回的技能在新运行里照样可用；一次尝试拿着上一次尝试的报告放行，此刻已收紧的执行权限没有生效 |
| **求值的输入被收齐**（[S-16](#s-16-会话资产注册表不求值只消费求值结果)；`reload` 一次、`refreshAvailability` 两次） | **装配给**：据点副本 ＋ 工作区承载目录（`refreshAvailability` 用最近一次读入的那一份）＋ 会话事实，由 `apps/cli` 装配收齐（M40） | **协议给**：输入的来源与版本随求值一起记进装配清单 | reload 用了一份旧的持有，却记成此刻的 |
| **调用方身份已经核实**（全部操作） | **装配给**：本契约的面是据点进程内的能力间面；调用方手上本来就是它服务的那个会话 | **协议给**：跨进程时携带会话与它创建时的租户身份，**在接收边界重新验证**（`data.identity-values/v1#S-30`） | 拿到一个会话标识，就能读别人的命令集、技能与工具定义；**本契约的面因此不得直接暴露成终端 API** |
| **提供者的自报**（[S-8](#s-8-当下可用性的三个取值) 第 3 条） | **装配给**：同一进程里的读面 | **协议给**：自报带新鲜度；读不到按「读不到」判 | 替换件时灵时不灵——agent 再也判断不了自己手上有什么 |

---

## 八、交接、缺席与恢复

### S-32 依赖的提供者不可用

- **求值、会话事实、「谁可以用」的现读、装配清单**读不到或写不进：依赖它们的操作**以 `unavailable` 明确失败，不静默降级**，表不换。
- **依赖项的提供者**（外部服务、设施、存储、模态、MCP 桥）读不到：**只让那一项不满足**，条目以替换件或 `unavailable{reason}` 出现、原因写「读不到」（[S-8](#s-8-当下可用性的三个取值) 第 3 条）；`refreshAvailability` 本身照常返回。
- **没有一种缺席被读成「可用」「可以用」「没有」或「空」。**

### S-33 本能力重启与重建

**快照不持久；重启之后按装配清单重建，不按此刻求值重填**（D-060 §S22 S22-e）。

1. **何时重建**：会话资产注册表第一次为一个会话做任何操作、而它手上没有这个会话的表时。
2. **怎么重建**：按装配清单重填——**每一类取装配清单里这一类的最后一条换表记录**（`fill`、`reload`、`markFailed`、`onAssetChange` 的哪一种都算）：条目取记录下的身份与次序，正文取那份记录**那一版**的不可变正文（[`data.asset-model/v2#S-9`](../../../data/asset-model/v2/contract.md#s-9-版本线) 版本线）。**不以此刻的持有与配值重跑一次求值**：那样用的就是此刻的持有，等于一次没人发起的 reload。
3. **重建不出来就明确失败**：某一类里有一条记录下的正文**无法原样取回**（例如工作区提供的资产，它的内容跟着承载目录走、目录已经改了），**那一类不重建**，对它的读收 `unavailable`，直到人发这一类的 reload 或一次完整的重新装配。**不得用此刻的内容悄悄补上**——那会让命令集在人不知情时变（[PF-015 §6.11](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#611-会话睡醒之后还是原来那个)「会话睡醒之后还是原来那个」）。
4. **装配清单里没有这个会话的装配记录** ⇒ `sessionNotFound`。
5. **可用性在重建时算一次**（同填表，[S-8](#s-8-当下可用性的三个取值) 末段），下一次尝试开始时再算；它不是重建的内容，不从装配清单取（[S-8](#s-8-当下可用性的三个取值) 第 6 条）。**MCP 动作条目、接入点持有与报告里的执行权限不重建**：它们只属于一次尝试，下一次尝试开始时现取（[S-12](#s-12-mcp-动作条目在一次尝试内钉住)）。
6. **归档与撤销归档**不需要本契约做任何事：归档的会话，实例可以不留它的表；撤销归档之后第一次用到时照第 2 条重建。

**这一条可被推翻**：一旦装配清单记不下换表（[G-1](#十已知缺口) 以别的方式闭合），重启之后的等价性就没有依托，必须回到本节重写。

### S-34 进行中的运行与撤销

- **会话资产注册表不改写正在跑的尝试已经拿到的构成**（[PF-004 §6.3](../../../../product/PF-004-agent-definition-and-assembly/design.md#63-三类变化三种传播)、[SYS-COMPOSITION.C4](../../../../foundation/definition-and-runtime-composition/requirements.md#sys-compositionc4变化作用于下一次装配)）：换表之后，正在跑的那一次尝试的读（`within = run{report}`）**只在它报告所依的快照里找**，新条目对它是「没有」；**同一运行的下一次尝试起**，报告依的是换过的快照，看到新的（主线裁定，见 D-060 §八 M35：[S-11](#s-11-一次执行尝试的可用性报告) 第 1 条「一次尝试以它为准」的直接推论；原 [G-2](#十已知缺口) 闭合）。单位是**尝试**，不是运行：一次运行的动作空间在尝试与尝试之间可以因 reload 变——这与技能门控按运行钉（下一条）是两件事。
- **「谁可以用」收回对已开始的运行不起作用**：运行开始时钉住的技能门控整次运行不变（[S-11](#s-11-一次执行尝试的可用性报告) 第 4 条、[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条；R2-13）；斜杠命令集是会话的，此刻起收窄。
- **本契约不发出任何停止、中断或取消信号**：权限收回、reload、③ 型失败都只影响此后的读。

---

## 九、规范表达与验证义务

### S-35 本版选用哪些形式工件

**本版不建 TLA+ 与 Alloy，不附 JSON Schema。**

| 性质 | 为什么不建模型 | 证据形式 |
|---|---|---|
| 快照只在四个时刻换、换表串行且多表一次成立 | 每个 (会话, 类别) 只有一个写入者，换表是一次提交；行为模型里「别的动作不改快照」只能写成 `UNCHANGED`——**被建模方式吸收，没有一条会在条款被违反时失败的断言** | 规范场景 [S-36](#s-36-创建时填六张)～[S-39](#s-39-命令型服务报错之后命令不再可见)、[S-42](#s-42-没人发-reload增删禁用不进来)；故障注入（记不进清单时表不换） |
| 可用性是当下条件的纯函数 | 没有状态可交错 | 枚举场景 [S-40](#s-40-依赖缺失与恢复) |
| 尝试开始时两次求值、接入点持有与全部工具条目的执行权限钉进报告、拿不到不补档；`continue` 核对运行标识 | 一次调用里的固定次序，不写任何状态；「拿不到不补档」是一个取值规则，没有并发可交错 | 规范场景 [S-46](#s-46-逐动作执行权限与接入点持有钉进报告)、[S-47](#s-47-别的运行的报告不能拿来-continue)；故障注入（两次求值分别不可用） |
| 进行中的尝试看不看得见 reload | 主线已裁（M35）：看不见，下一次尝试起看得见——一次读在哪一份快照里找，是一个固定的取值规则，没有并发可交错 | 规范场景 [S-37](#s-37-reload-plugin-连带) 的「尝试中途 reload」一支 |

数据形状全部归 data 契约；本契约的类型用散文定义，线上形状归 composition。执行状态在[验证入口](../verification.md)，**不写进本版本目录**。

### 规范场景

#### S-36 创建时填六张

一个会话创建时装配：求值结果里有 official 的 meta 门与一个组织的工具、一个租户的技能、三条斜杠命令（其中一条 ② 型、这个人无权用）、两件拓展件、一个 MCP 接入点、一个 plugin。
**必须观察到**：恰六份快照、`filledBy = assembly`、`basedOn` 相同；无权的那条命令不在 `slash_command` 表里；拓展件的次序与装配清单一致；meta 门在 `tool` 表里且 `resident = true`；`tool` 表此时**没有** MCP 动作条目；**装配清单里有且只有一条这次的构成记录**。
**另跑一支**：把装配清单的追加注入失败 ⇒ `unavailable`，**六张一张都没有**。
**再跑一支**（M34）：同一个 `EvaluationRef` 在回执丢了之后再 `fill` ⇒ 原样返回那六份、装配清单不多一条；此后发一次 reload，再拿**那个旧的** `EvaluationRef` `fill` ⇒ **`invalidInput{evaluationSuperseded}`**，表不换、装配清单不多一条——**不是**一次把会话退回装配那一刻的新装配。

#### S-37 reload-plugin 连带

接 S-36。组织在 plugin 里加一个技能、删一条斜杠命令；另给这个会话的租户直接加一个工具。人发 `omne-official:reload-plugin`。
**必须观察到**：`plugin`、`skill`、`slash_command` 三张换了、一次成立、`filledBy = reload{omne-official:reload-plugin}`、`basedOn` 相同；**`tool` 表没换**（直接加的那个工具要等 `omne-official:reload-tool`）；plugin 的成员表里没有「plugin 已更新、成员还是旧的」这一刻。
**尝试中途 reload 一支**（M35）：reload 发生在一次运行的某次尝试进行中 ⇒ 那一次尝试里 `within = run{它的报告}` 的 `lookup(skill, 新技能)` 是「没有」、`list(skill)` 仍是旧的那几条（含 reload 删掉的）；**同一运行的下一次尝试**（`continue`）起，报告依的是新快照，新技能查得到、删掉的查不到；`within = session` 的读在 reload 返回之后就是新的。

#### S-38 MCP 接入点连不上，动作原位顶替

一个接入点上一次取到五个动作。断开对端，开始一次尝试。
**必须观察到**：报告里接入点那一行 `unavailable{reason}`，**五条动作条目都在**、每条 `stand_in{for}`、名字与参数形状与上一次相同、原因是桥给的失败值（`endpointUnreachable`）；条目数与断开之前相同；`endpointHoldings` 里有这个接入点此刻生效的那份持有，`effectivePermissions` 对五条各有一项。
**再跑两支**：① 尝试进行中恢复对端并新增第六个动作 ⇒ 这一次尝试里仍是五条替换件，下一次尝试开始时六条 `available`；② 一个从没连上过的接入点 ⇒ 没有动作条目，接入点那一行原因写「从未取得动作清单」。

#### S-39 命令型服务报错之后，命令不再可见

一条 ③ 型命令所指的服务下线；人敲它，执行明说失败、会话日志记下；派发方调 `markFailed`。
**必须观察到**：返回之前那条命令已不在 `slash_command` 表里、`filledBy = auto_refresh_after_failure`；再敲它得到的回答与敲一个不存在的名字**逐字相同**；**同一时段里组织新加的一条 ① 型命令没有因此进来**；对 reload 一族调 `markFailed` ⇒ `invalidInput`。人发 `omne-official:reload-slash_command`、服务已恢复 ⇒ 它回来。

#### S-40 依赖缺失与恢复

一个工具依赖一项外部服务；让那项服务的提供者不在场，开始一次尝试；再让它的自报读不到；再恢复。
**必须观察到**：前两次都是 `stand_in{for}`，**原因分别是「缺」与「读不到」**，条目数与次序不变；恢复之后的下一次尝试 `available`，**中间没有任何人干预**；技能依赖这个工具时，工具是替换件的那两次技能也是替换件。
**另跑一支**：`never` 运行模式下，`Ask()` 条目 `available`、`commandAvailability` 列全它的命令、`request_approval` 为 `unavailable{reason}`、其余为 `available`。

#### S-41 无权即不存在；收回此刻起不存在；再授予要等 reload

这个人对一条 ① 型命令的权限在会话进行中被收回。
**必须观察到**：此后第一次 `lookup` 就是「没有」，**与不存在的名字逐字相同**；`onAssetChange` 之后快照里也没有它、`filledBy = asset_change`；再授予之后仍是「没有」，直到 reload。
**再跑一支（通知关掉）**：把资产变化通知的转发关掉重跑收回那一段——`lookup` **照样**是「没有」（读时现读）；**再授予之后它重新可见**——把这一条如实记下，**这是 [G-3](#十已知缺口) 的观测，不当作通过也不当作缺陷**。
**第三支**：「谁可以用」的读面不可用 ⇒ `lookup` 收 `unavailable`，**不是**「没有」。
**技能一支**（R2-13）：运行 `R` 以 `run = start{R}` 开始时技能 `K` 用得了；`R` 进行中收回这个人对 `K` 的权限。**必须观察到**：`onAssetChange` 之后 `skill` 快照**没换**；`R` 后面的尝试以 `continue` 取的报告仍不把 `K` 算作用不了，`R` 里 `within = run` 的 `list(skill)` **仍有 `K`**；同一时刻 `within = session` 的读（② 型展开）**已读不到 `K`**；下一次运行以 `start` 开始，报告把 `K` 记为用不了，那次运行里读不到 `K`。**另跑**：`start` 时「谁可以用」读面不可用 ⇒ `refreshAvailability` 收 `unavailable`，**不是**一份把 `K` 算作用得了或用不了的报告。

#### S-42 没人发 reload，增删禁用不进来

会话开着、一次运行进行中，组织禁用一条 ① 型命令、新加一条 ② 型命令、移除一个非常驻工具、发布一个技能的新版本；**这次运行里**再跑若干次尝试、调若干次 `refreshAvailability` 与 `list`，其间没有 reload、也没有一次完整的重新装配。
**必须观察到**：四张相关的表**一张都没换**（`filledAt` 不变）；禁用的那条照样敲得出、展开的还是原来那段；发 `omne-official:reload-slash_command` 之后才变。
**不在本场景里**：下一次运行开始前装配若按 PF-004 rev 12 为「构成变小」重新装配，六张会经 `fill` 整批换——那是装配发起的一次 `fill`，不是本契约自己换；它与「① ② 型的增删禁用要等 reload」怎样对上是 [G-17](#十已知缺口)。

#### S-43 重启之后重建

接 S-37 与 S-39。重启据点进程。
**必须观察到**：第一次读时按装配清单重建出来的六张，**逐条与重启之前相同**（包括 reload 之后那几张、`markFailed` 去掉的那一条仍不在）；重建时每条都带一份算过的可用性，不在运行里的 `lookup(tool)` 不含 MCP 动作条目；下一次尝试开始时可用性再算、动作条目再钉。
**再跑一支**：重启之前工作区提供了一个技能，重启期间改了承载目录里它的内容 ⇒ `skill` 表的读收 `unavailable`，**不是新内容也不是空表**；人发 `omne-official:reload-skill` 之后恢复。

#### S-44 依赖未解析与同名冲突

① 求值结果里有一个引用无人提供 ⇒ `fill` 与 `reload` 都收 `dependencyUnresolved{missing}`，`missing` 指出缺哪个、谁引用的，**表不换**，装配清单里没有这一次。
   **收回引起的那一种**（K33）：定义直接引用的一个技能只有租户自建的那一份、没有 official；运行 `R` 进行中收回这个人对它的「谁可以使用它」 ⇒ `R` 照旧；下一次运行 `start` 把它记为用不了；此后人发任何一条 reload 都收 `dependencyUnresolved{missing}`、交付面看得见；装配为下一次运行重新装配时失败（装配的收口，本契约不被调到）。**不得观察到**：那一条被悄悄从表里抹掉、reload 报成功。
② 一个接入点的某个动作被桥起的名字恰好等于一个工具的名字 ⇒ `refreshAvailability` 收 `toolNameConflict`，**不静默丢掉任何一条**。
③ **求值的两个失败原样转交**（修复波 3，本契约推导）：**故障注入**——让求值对 `reload` 与 `refreshAvailability` 的那一次请求分别以 `compositionCycle{cycle}`、`categoryUnsupported{category}` 失败 ⇒ 两个操作**原样收那个值**（诊断原样），表不换、装配清单里没有这一次、不交报告。**不得观察到**：收成 `unavailable`（那是「判不出来、重试可能不同」）、`dependencyUnresolved`，或一份去掉了那一部分的重填。
   **为什么是注入而不是真实局面**：本版装配成功的会话走不到这两个值——组合根的引用列表随定义版本不变，plugin 与 sub-agent 只能从根走到，装配时走到了就已失败（`capability.asset-evaluation/v2#S-15`）；那份契约的 G-3、G-21 闭合（sub-agent 展开、plugin 可读）之后，真实局面才有。

#### S-45 不可用时明确失败

分别让求值、会话事实、「谁可以用」的读面、装配清单**不可用**（故障注入），调全部七个操作。
**必须观察到**：一律 `unavailable`；**没有一次被收成「没有」、空列表、`sessionNotFound` 或 `available`**，也没有任何一张表被换。

#### S-46 逐动作执行权限与接入点持有钉进报告

一个租户层的接入点 `mcp:linear` 钉住两个动作 `create_issue`、`search`；组织层对 `execute:create_issue` 配了锁下的 `forbid`。开始一次尝试。
**必须观察到**：报告的 `endpointHoldings` 里是租户那一格的持有（带此刻的 `credential` 引用）；`effectivePermissions` 两项，**键是两个动作条目的模型面名字 `linear__create_issue`、`linear__search`**（定义名 `linear:create_issue`、`linear:search`，[S-7](#s-7-注册表条目)），`create_issue` 那项的值是求值给的那个界（`from = organization`），`search` 取作者默认；两项都与第二次求值的 `execute:*` 逐字相同；拿 `linear:create_issue`（定义名）去查报告**查不到**。
**再跑三支**：① 尝试进行中租户换了凭据引用、组织把 `search` 改成 `forbid` ⇒ 这一次尝试的报告不变，下一次尝试的 `endpointHoldings` 带新引用、`search` 那项随之变；② 第二次求值注入不可用 ⇒ 报告照常交出，两项都是 `unavailable`，放行判断的调用方拿到的是 `unavailable`、**不是任何一档**；③ 第一次求值注入不可用 ⇒ `refreshAvailability` 整个 `unavailable`，**桥没有被调到**。
**再跑一支**：接入点的持有在运行中被移除 ⇒ 下一次尝试这个接入点那一行 `unavailable{reason}`（此刻没有生效的持有），没有动作条目，`endpointHoldings` 那一项写「没有」，**桥没有被调到**；`effectivePermissions` 里**没有**以 `linear__create_issue`、`linear__search` 为键的项——**不是** `not_in_composition`、也不是 `unavailable`；以 `within = run{这份报告}` 查这两个名字得「没有」（[S-11](#s-11-一次执行尝试的可用性报告)、[S-25](#s-25-lookup查一条)；D-060 §七 M10）。
**作者写的工具一支**（D-060 §六 L13）：同一次尝试里，`tool` 表另有组织的工具 `grep` 与 official 的 meta 门 `Tools`。**必须观察到**：`effectivePermissions` 对 `grep`、`Tools` 与两个动作条目**各恰一项**，`grep` 那项与第二次求值里 `(tool:grep, execute)` 的 `EffectiveValue` 逐字相同（含 `tenantAutoWritable`）；尝试进行中组织把 `grep` 的执行权限配成 `forbid`（不锁）⇒ 这一次尝试的报告不变，下一次尝试 `grep` 那项的值是 `{forbid}`、`tenantAutoWritable` 为假；再把 `grep` 在组织层禁用（没有 reload，`tool` 快照不换）⇒ 下一次尝试 `grep` 那项是 **`not_in_composition`**，**不是 `unavailable`、不是装配那一次的值，也不是任何一档**；同一次尝试里别的条目照常有值（D-060 §六 L15）。
**meta 门一支**（D-060 §七 M21；须 [G-7](#十已知缺口) 先给出 `Tools` 是 meta 门）：`Tools` 那一项恒为 `{auto}`、`tenantAutoWritable` 为假、`from = factory`，**与第二次求值里 `Tools` 的 `execute` 取什么值无关**——组织把它配成 `forbid` 并上锁，下一次尝试那一项仍是 `{auto}`；第二次求值注入不可用时，别的项是 `unavailable`、`Tools` 那一项仍是 `{auto}`。
**退回下一层一支**：`grep` 在快照里的那份（组织的）被组织禁用、同一能力标识 official 也有一份 ⇒ 下一次尝试 `grep` 仍在组合里，那一项是 **official 那份的 `EffectiveValue`**，**不是** `not_in_composition`；条目的 `content` 仍是快照里那一份，到 reload 才换（[S-11](#s-11-一次执行尝试的可用性报告)）。

#### S-47 别的运行的报告不能拿来 continue

运行 `R1` 的报告 `P1`；`R1` 结束后运行 `R2` 开始。
**必须观察到**：`refreshAvailability(run = continue{R2, P1})` ⇒ `invalidInput`；`continue{R1, P1}` 在 `R2` 已开始之后调用，本契约照 `R1` 答——**「这是不是调用方所在的那次运行」由调用方如实带 `runId` 兑现**（[S-31](#s-31-装配给的保证-vs-协议须给的保证)）。**崩溃恢复一支**：`R2` 的第二次尝试开始前据点重启、`P2` 丢失 ⇒ 调用方以 `start{R2}` 重判，报告里的门控按此刻。
**尝试标识一支**（M46）：`R2` 的尝试一与尝试二各调一次 `refreshAvailability`，分别带 `attempt = 1`、`2` ⇒ 两份报告的会话与运行相同、**`attempt` 分别是 `1`、`2`**；缺 `attempt` ⇒ `invalidInput`。拿尝试一的报告（`attempt = 1`）去尝试二里放行、提交调用，由接收方（runner、工具执行运行时）按三者核出不符、收 `invalidInput`——那一半的场景在那两份契约里。

---

## 十、已知缺口

**缺口不填默认值。**下列各项等具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **真承接者未到，接口已定**（2026-09-25 修订波，D-063 R-1）：换表的追加面与记录形状已由窄口接口契约 `capability.assembly-manifest` v2 给出（S-6、S-16～S-18；`EvaluationRef` 的权威在它的 S-8），本契约的换表提交点已改指它（[S-18](#s-18-快照不持久装配清单是唯一权威) 第 4 条），本版由它的最小提供者承接。**仍缺**：装配清单的完整契约与真提供者——PF-004 的清单只写到「实际构成，只可追加」，reload 一族与 ③ 型失败之后的换表记在哪、依据的定义版本、清单的复用与失效都在那一程（[PF-004 decisions §四](../../../../product/PF-004-agent-definition-and-assembly/design.md)第四行已登记：§6.7 没有列出这两个发起者）；那份窄口的 G-1 同题 | PF-004 的契约（后续程，D-060 §S22 S22-g）；产品面问 PF-004 owner | PF-004 那一程的装配清单契约发布，原样收进窄口的条款或写明差异；本契约改钉它 |
| G-2 | **已闭合（2026-09-25，主线裁定 D-060 §八 M35；产品负责人尚未追认）**：热更新对进行中运行的呈现时机——正在跑的那一次尝试照它报告所依的快照读、看不见，**同一运行的下一次尝试起**看得见（[S-25](#s-25-lookup查一条) ④、[S-8](#s-8-当下可用性的三个取值) 末段、[S-11](#s-11-一次执行尝试的可用性报告) 第 1 条、[S-34](#s-34-进行中的运行与撤销)）。原问（D-060 §块 A A10）在 [PF-004 decisions §四](../../../../product/PF-004-agent-definition-and-assembly/design.md)第四行仍登为产品未决，那一行怎样收归 PF-004 的 owner（已报主线） | — | — |
| G-3 | **收窄**：「只收窄」已由主线裁定（D-060 §S22 S22-a），[S-28](#s-28-onassetchange权限收回之后收窄)。**仍在**：收回的通知丢失、随后又重新授予时，那条命令不经 reload 重新可见——本版的已知边界，正确性由读时现读兜住 | 主线（确认接受为已知边界）；产品负责人（PF-002 §4「新得到权限要等 reload」的适用范围） | 接受为边界并写进 PF-002 的取舍，或给出不依赖通知送达的兑现点 |
| G-4 | **已闭合（2026-09-24 整批对齐）**：`asset_change` 由主线裁定补名（D-060 §S22 S22-c） | — | — |
| G-5 | **已闭合（2026-09-24 整批对齐）**：求值交出 `EffectiveAsset.version`、`resident`（`capability.asset-evaluation/v2#S-8`、`#S-38`）。**`resident` 缺席（判不出）时本契约收 `unavailable`**（[S-7](#s-7-注册表条目)）——那份契约的 G-3、G-18 因此直接挡住填表。「谁可以使用它」由求值在第一步判掉（`#S-39`，2026-09-24 随 PF-002 rev 19；原先读的 `usable` 已删，那份契约的 G-15 已关闭） | — | — |
| G-6 | **依赖项提供者的读面**：外部服务由谁提供、谁自报；执行环境设施（PF-005 无契约）；存储（pending「存储」，且**「哪个工具能读回哪个存储」没有任何声明**）；有效模型的模态能力——两端的判法已定（[S-8](#s-8-当下可用性的三个取值) 第 8 条），**仍缺**一次执行尝试开始时「有效模型」指哪一份档案。**在它们有家之前，声明了这些项的工具与技能按 [S-8](#s-8-当下可用性的三个取值) 第 3、4 条一律判为不满足**——这是缺席默认拒绝的直接后果，不是可用性规则本身 | 各自 owner：PF-005、PF-006（存储）；尝试开始时按哪一份档案算，问 PF-006 / PF-013 的 owner；「外部服务的提供者」无 owner，交主线 | 各读面有契约；本契约 [S-4](#s-4-依赖方向与被消费的面) 补登 |
| G-7 | **meta 门的能力标识清单无契约家**：「会话资产注册表不去掉 meta 门」（[S-7](#s-7-注册表条目)）与「`Ask()` 的 `request_approval`」（[S-9](#s-9-按命令的可用性)）都要能指认它们；报告里 meta 门的执行权限项恒为 `{auto}`（[S-11](#s-11-一次执行尝试的可用性报告)，D-060 §七 M21）也要先认出哪条条目是门——**闭合之前**，没有一条条目被当作 meta 门，这三处都不生效（门照常走依赖解析与求值：M21 那一项取求值给的值），不猜一份清单；PF-007 列了十三扇门，但没有一份契约给出它们的能力标识与命令名 | PF-007 / 块 B 对齐 | 有一份契约列出 meta 门的能力标识与 `Ask()` 的命令名 |
| G-8 | **已闭合（2026-09-24 整批对齐）**：可用性变化不出提醒（D-060 §S22 S22-d），[S-30](#s-30-可用性变化不出提醒) | — | — |
| G-9 | **会话事实的读面**：会话创建时捕获的租户身份、挂的工作区、此刻有效的运行模式——PF-015 没有契约；有效运行模式怎么求归 `capability.tool-admission` 与会话。**租户身份那一片接口已定**（`capability.session-tenancy/v2#S-8`，2026-09-25 修订波；真承接者未到）；挂的工作区与有效运行模式仍没有读面 | PF-015 的契约（未建立）；`capability.tool-admission` | 会话契约给出这三项的读面 |
| G-10 | **已闭合（2026-09-24 整批对齐）**：`data.asset-model/v2#S-2` 允许冒号，`data.slash-command/v2#S-3` 给出保留区拼法；[S-23](#s-23-reload按类别重填) 的六个名字合二者 | — | — |
| G-11 | **跨进程**：[S-31](#s-31-装配给的保证-vs-协议须给的保证) 右列 | 架构设计（本版单机不阻断） | 分布式演化启动时给出，**作为本契约的新版本发布** |
| G-12 | **MCP 动作的命名应当让 `toolNameConflict` 碰不上**：动作条目名是「接入点名:动作名」（`capability.mcp-bridge/v2#S-17`、`data.mcp-endpoint/v2#S-11`），而作者写的工具名也允许冒号，两者可能相撞 | `capability.mcp-bridge`；`data.asset-model`（名词法） | 命名规则写出「与作者写的工具名不相交」，[S-7](#s-7-注册表条目) 的冲突检查成为兜底 |
| G-13 | **被桥排除的动作要不要告诉 agent**（[S-12](#s-12-mcp-动作条目在一次尝试内钉住)）：它们没有名字可占位、不进表；本版不出可用性提醒（S22-d），而排除不是一次可用性变化；后果是 agent 不知道对端还有一个它看不见的动作（`capability.mcp-bridge` 的 G-15 同一件事） | PF-006 的 owner（产品面） | 产品给出要不要告诉、告诉在哪；若要，本契约出新版 |
| G-14 | **收回「谁可以使用它」之后的时机**（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 末段）：① **谁在下一次运行之前发起那次重新装配**——产品答案已有：[PF-004 rev 12](../../../../product/PF-004-agent-definition-and-assembly/design.md#三类变化背后只有一条判据系统提示词的成分会不会变)「构成变小也重新装配，下一次运行起生效」；**仍缺**察觉构成变小、发起那次 `fill` 的一方（PF-004 的契约还没有），以及那次重新装配因 `unresolved` 失败之后会话怎样（K33 定了收口方是装配，没定之后的状态）。在它有之前，退回的那一份（例如同名 official）要等 reload 或完整重新装配才进表。**② ③ 已闭合（2026-09-24 修订第二轮，R2-13）**：钉住的单位是运行；`skill` 表不在已开始的运行里收窄（[S-11](#s-11-一次执行尝试的可用性报告) 第 4 条、[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 第 3 条、[S-24](#s-24-refreshavailability每次执行尝试开始时现算)～[S-26](#s-26-list列一类)、[S-28](#s-28-onassetchange权限收回之后收窄)） | PF-004 的契约（①：发起者与失败之后的状态） | ① 有答案；退回的那一份在下一次运行的 `fill` 进表 |
| G-15 | **运行钉住的技能门控跨崩溃恢复保不住**：它只在报告里（[S-11](#s-11-一次执行尝试的可用性报告) 第 2 条：报告不持久、不重放），报告由运行的调用方拿着；崩溃之后恢复的那一次尝试拿不回它，只能以同一个 `runId` 再 `start` 重判（[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ⑦ 的具名例外）——**两个方向都可能变**：运行中途被收回的在恢复之后不在，开始时判为用不了、中途又被授予的在恢复之后出现；与「已经开始的运行不变」差这一段 | agent loop 与运行的契约（PF-012；尝试开始记录落在会话日志里，[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)的身份就从它派生） | 那份契约让运行开始时的那份门控随运行记下、恢复时交回；本契约的 `continue` 改收它 |
| G-16 | **已闭合（修复波 1b）**：三条主线裁定——`onAssetChange` 作为权限收回的触发操作（[S-28](#s-28-onassetchange权限收回之后收窄)）、可用性到命令粒度 `commandAvailability`（[S-9](#s-9-按命令的可用性)）、`slotConflict` 改名 `toolNameConflict`（[S-21](#s-21-这一节每个操作写全九件事)）——已登进 D-060 §六 N-10，页首回链。S22-a 的括注与 S-28 的出入已由 D-060 §四登记为「括注写宽了，契约为准」 | — | — |
| G-17 | **PF-004 rev 12 与 PF-002 §4 对 ① ② 型斜杠命令的说法对不上**：PF-004 rev 12 让移除、禁用在下一次运行起触发一次重新装配，而一次完整的重新装配重填全部表（[PF-002 §4](../../../../product/PF-002-assets-settings-and-permissions/design.md#会话认得哪些命令什么时候变)「一次完整的重新装配也会重填它」）——于是被禁用的 ① ② 型命令会在下一次运行起从命令集里消失；PF-002 §4 却写「① ② 型的增删与禁用，不会自己改变进行中的会话……要让它在这个会话里生效，人发对应的那条 reload」。本契约两种答案下形状都不变（换表只经 `fill` 与 `reload`），**变的是 [S-42](#s-42-没人发-reload增删禁用不进来) 能断言到哪一刻** | 产品负责人（PF-002、PF-004） | 产品写明「构成变小」是否含斜杠命令，或 PF-002 §4 的那一句限定在「同一次运行之内」；本契约按裁定改 S-15 与 S-42 |

---

## 十一、消费者核对

本节不新增承诺，只走一遍具名消费者的路径，核对本契约给的面够不够。

| 消费者 | 它要什么 | 本契约给什么 | 够不够 |
|---|---|---|---|
| **agent loop：一次执行尝试开始** | 此刻能用什么、常驻哪些、MCP 动作有哪些；尝试内不变；技能门控运行内不变 | [S-24](#s-24-refreshavailability每次执行尝试开始时现算) 的报告 | **够**。它必须在每次尝试开始时调、在读常驻条目之前调，并在这一次尝试里只用这一份；**运行的第一次尝试用 `start{runId}`，后面的带此前的报告用 `continue{runId, report}`**，每次都带这一次尝试的 `attempt`（M46），运行里的读一律 `within = run`。崩溃恢复之后拿不回报告是 [G-15](#十已知缺口) |
| **`Tools()`：search／inspect／execute** | 搜得到的范围 = 当前装配；不可用的照样搜得到、说明缺什么；常驻的标出来 | [S-26](#s-26-list列一类) 的 `tool` 表（含动作条目、`availability`、`resident`） | **够** |
| **`Skills()`：search／read** | 同上；依赖不满足的搜得到、说明缺什么 | [S-26](#s-26-list列一类) 的 `skill` 表 | **够**；带 `within = run`，技能「谁可以用」按这次运行钉住的门控（[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)） |
| **斜杠命令识别（交付面／受理）** | 这个名字在不在这个会话的命令集里；无权与不存在同一个回答；判断不了时说判断不了 | [S-25](#s-25-lookup查一条) 的「没有」与 `unavailable` | **够**，带 `within = session`。它拿到 `unavailable` 不得说成「没有这个命令」 |
| **② 型命令展开** | 那个技能此刻这个人能不能用 | [S-25](#s-25-lookup查一条) 查 `skill` 表 | **够**，带 `within = session`：那个技能此刻用不了就展开不了；「展开失败」的值归 `data.slash-command` |
| **③ 型派发** | reload 一族派到哪；服务失败之后怎么让命令消失 | [S-23](#s-23-reload按类别重填)、[S-27](#s-27-markfailed命令型服务报错之后去掉那一条) | **够**；它必须先把失败记进会话日志再调 `markFailed` |
| **放行判断（`before_action`）** | 那个调用对应的工具定义；这个工具条目的有效执行权限（含 `tenantAutoWritable`） | [S-25](#s-25-lookup查一条) 查 `tool` 表；报告的 `effectivePermissions`（[S-11](#s-11-一次执行尝试的可用性报告)） | **够**：`tool` 表每条条目（作者写的、官方的、MCP 动作）的执行权限都在报告的 `effectivePermissions` 里（L13），**以模型面名字为键、按调用块的 `tool` 原样查**（M8），调用方按 `capability.tool-admission` 的 S-8 把 `EffectiveValue` 收成一档、`tenantAutoWritable` 原样带上（`capability.loop-extension-runner/v2#S-29` 第 5 条）；拿到 `not_in_composition` 那一项单独判拒（`deny{not_held}`），拿到 `unavailable` 即全拒（L15）；**查不到键**的调用不进放行判断（M10）；meta 门那一项恒 `{auto}`（M21）。**报告由 agent loop 作为值交给 runner（`admission.report`），runner 按报告带的会话、运行、尝试三者核它是不是这一次的**，对不上即 `invalidInput`（`capability.loop-extension-runner/v2#S-21` ①，M46）——本契约给出这三者（[S-11](#s-11-一次执行尝试的可用性报告)） |
| **工具执行运行时** | 这一次尝试的那份报告（与放行判断用的同一份）；一次调用是不是打在替换件上、是不是打在一条关掉的命令上；MCP 调用用哪份接入点持有 | 报告带的会话、运行、尝试（[S-11](#s-11-一次执行尝试的可用性报告)，M46）；报告里的 `availability`、`commandAvailability` 与 `endpointHoldings`；`within = run{报告}` 的 [S-25](#s-25-lookup查一条) | **够**：`submit` 带同一份报告，接收边界按三者核、不现算、不取「最近一次」（`capability.tool-execution-runtime/v2#S-23` ①⑥⑧，D-060 §八 M33、M46；本契约 S-11 第 3 条）；替换件与关掉的命令都落收场 `unavailable`（同一条 ④；D-060 §S13 S13-a） |
| **装配（PF-004）** | 创建时与完整重新装配时填表；清单与会话资产注册表不重复拥有；`unresolved` 非空时的收口；两次求值的输入 | [S-22](#s-22-fill装配时填六张)、[S-18](#s-18-快照不持久装配清单是唯一权威)、[S-20](#s-20-谁可以用门控哪两类按哪个租户身份什么时候判) 末段、[S-24](#s-24-refreshavailability每次执行尝试开始时现算) ② | **不够**：清单的追加面缺（[G-1](#十已知缺口)）；构成变小时谁发起下一次运行前的装配缺（[G-14](#十已知缺口) ①） |
| **拓展件派发器** | 这个会话某个位置上的那几件、次序、此刻在不在 | [S-26](#s-26-list列一类) 的 `loop_extension` 表 + 报告 | **够**；位置过滤由它按正文做 |
| **会话日志写入方（提醒）** | 可用性变了什么 | —— | **本版不需要**：可用性变化不出提醒（[S-30](#s-30-可用性变化不出提醒)，主线裁定 S22-d） |
| **`capability.asset-evaluation`** | —（它不读本契约） | — | 反方向：它交出的 `version`、`resident` 与「进了 `assets` 的就是用得了的」就是本契约要的三样（原 G-5 闭合；`usable` 2026-09-24 删去）；`resident` 缺席时本契约收 `unavailable`；**尝试开始时的两次求值**用它的 `EvaluationInput`（组合根引用集 `root` 沿用最近一次装配或 reload 的，M31；第二次带 `mcpActionSets`）与 `values` 里的 `execute:*`；它的 `compositionCycle`、`categoryUnsupported` 在 `reload`、`refreshAvailability` 里原样转交（本契约推导） |

---

## 十二、版本差异与规范工件

**本版是首版**，没有被采用的旧版本。
**本版的规范工件**：本文件与 [`examples.md`](examples.md)。接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。
