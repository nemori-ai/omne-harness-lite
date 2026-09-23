# 资产持有与分层求值：同行的先例与反例

- 调查对象与日期：DSH `c291e796`；Codex `5c5308fc9a` + 文档副本 2026-09-20；omne-next `6263fed545e4`；Claude Code `2.1.280`；取证 2026-09-23。
- 消费者：本程块 A 的架构读数（待出现）。
- 最近核对：2026-09-23 / 上列版本。
- 当前结论：同名即替代、析取式禁用、下层不参与提权，这三件在同行里都有做法可对照；
  **「一个 `immutable` 标记同时管三处」与「工作区的禁用只管它自己那批」这两件没有找到通用先例**，
  同行只在个别键上以补丁形式做过相近的事。同行挡项目层按的也不是「设置 / 权限」这条线。

## 问题与区分条件

对照的产品正文（均为 PF-002 rev 10、PF-001 rev 15）：

| 规则 | 产品正文 |
|---|---|
| 身份是「类别 ＋ name」，同标识即替代 | [PF-002 §4](../../design/product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)、[PF-001 §6.2](../../design/product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义) |
| 组合的引用指向能力标识 | [PF-002 §6.3](../../design/product/PF-002-assets-settings-and-permissions/design.md#63-组合的引用指向能力标识) |
| 禁用是逐层布尔设置，按析取合成；工作区的禁用只对它自己提供的资产生效 | [PF-002 §6.4](../../design/product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见) |
| 一个 `immutable` 管设置值、权限取值、资产替换 | [PF-002 §5.4](../../design/product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用) |
| 替换层序 official < 组织 < 租户 < 工作区；official 永远可被替代 | [PF-002 §5.5](../../design/product/PF-002-assets-settings-and-permissions/design.md#55-资产替换的层级) |
| 权限取交集、工作区一概不参与；设置与资产照常从工作区来 | [PF-002 §5.7](../../design/product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算)、[§5.8](../../design/product/PF-002-assets-settings-and-permissions/design.md#58-三条层序各答一个问题) |

会改变判断的观察是：同行有没有「同名但按来源区分」的做法；有没有「下层能开回上层关掉的」；
锁是一个通用标记还是几套专用机制；挡项目层时挡的是哪些键；「只对本层来源生效」有没有人做过、代价写在哪。

## 证据入口

逐条观察与行号在 [evidence.md](evidence.md)：DSH 为 [E1](evidence.md#e1-dsh)，Codex 为 [E2](evidence.md#e2-codex)，
omne-next 为 [E3](evidence.md#e3-omne-next)，Claude Code 为 [E4](evidence.md#e4-claude-code)。
「deny 不可被任何层放宽」「仓库不能给自己提权」两条的四家证据直接引
[agent-harness-session-design 一·2](../agent-harness-session-design/research.md#2-权限放行链只能单调收紧deny-不可被任何层放宽)
与 [一·3](../agent-harness-session-design/research.md#3-仓库不能给自己提权)，本页不复制。

## 当前结论

### 同名即替代是同行的多数做法，但每家都至少有一类资产改用来源限定名或「名字＋实体」判同一

**先例（同名整条替换）**：

- DSH 技能：最近一层的同名条目整条替换较远一层；本地技能根里项目目录 rank 最低、赢过用户与随包（D3、D4）。工具同理，作用域内同名注册遮蔽全局（D8）。
- Codex：普通配置里 MCP server 按名字跨层合并，高层同名覆盖低层（C14）；自定义子代理与内置同名时自定义优先（C18）。
- omne-next 工具集注册表：同一标识「replaced entirely」，Last-Write-Wins（O1）。
- Claude Code：用户 / 项目同名技能遮蔽随包技能（K4）。

**反例（同名不等于同一）**：

- **MCP 工具三家都按来源前缀命名**：`mcp__<server>__<tool>`，两个 server 的 `search` 并存而不互相替代；DSH 在有损归一化时追加哈希，明说为了「distinct identities never collapse」（D12）。
- **Codex 的托管 MCP 允许清单要求名字与实体（command / url，可细到逐个参数）同时对上**，只对名字不放行（C12）。
- **Codex 技能的启停按目录路径寻址**，调用去重键是 `scope:path:name`（C16、C17）。
- **Claude Code 插件身份是 `name@marketplace`**；从 claude.ai 同步来的插件标成 `name@synced`，「never override a same-named plugin you installed」；同步来的技能被专门改成「no longer shadow local commands」（K2、K5、K6）。目录作用域技能带路径前缀，与同名无前缀技能并存（K3，现场观察）。
- **omne-next 的前身契约把来源放进寻址键**：`ComponentRef = (kind, source, qualified_id, version_pin)`；同一组合里重复的 skill id 直接失败，不做替代（O3、O4）。

**同行在哪里不肯同名替代，有一致的指向**：来源信任度较低（外部 MCP server、云端同步件）的那一侧，或者名字由第三方决定的那一侧。
Claude Code 的两条变更（K5、K6）是在已经允许同名遮蔽之后**收回**的。

- 适用范围：上述版本；DSH 与 Claude Code 的技能、Codex 的 MCP 配置层与子代理、omne-next 的工具集注册表。不支持「同行对全部资产类别都按名字判同一」的推广。
- 代价与不适用：同名替代的代价 DSH 自己写了——「a nearer layer shadows a farther one **silently**; there is no API to inspect all shadowed definitions」（D5）。按来源限定名的代价是引用方必须知道来源，换来源就要改引用。
- 撞上这条事实会怎样：一个来自低信任来源的同名件在同名替代规则下会**静默顶掉**高信任来源的那一份；Claude Code 已为同步来的技能与插件关掉了这条路（K5、K6），DSH 的项目技能仍能遮蔽随包技能（D4）。
- 来源：[E1](evidence.md#e1-dsh) D3–D5、D8、D12；[E2](evidence.md#e2-codex) C12、C14、C16–C18；[E3](evidence.md#e3-omne-next) O1、O3、O4；[E4](evidence.md#e4-claude-code) K2–K6。
- 最近核对：2026-09-23 / 同上。

### 引用按名字晚绑定有先例，但本项目前身的契约是反的：引用带来源与版本钉

- 先例：DSH 技能每次加载都先选当前胜出的候选、再向 provider 取正文，不缓存定义（D6）——被遮蔽之后，按名字引用的一方自动拿到新的那份。omne-next 工具集同理（O1）。
- 反例：omne-next 的 `ComponentRef` 允许钉版本，custom 组件再钉内容哈希（O3）——引用指向的是「这一份」而不是「这个标识下当前生效的那份」。
- 没有找到任何一家为「按名字晚绑定」提供锁：DSH 与 omne-next 的替换都没有上层可以禁止下层遮蔽的机制（D1、D3、O1）。

- 适用范围：DSH 技能、omne-next 工具集与组件引用契约。Codex 与 Claude Code 的「引用」形态（如插件内技能怎样被组合引用）本轮未核。
- 代价与不适用：晚绑定让引用方无法假定零件不被换（产品正文自己已写）；钉版本的做法换来可复现，代价是替换件进不了已钉的引用。
- 来源：[E1](evidence.md#e1-dsh) D1、D3、D6；[E3](evidence.md#e3-omne-next) O1、O3。
- 最近核对：2026-09-23 / 同上。

### 同行没有「内置件一律可被替代」的共识：DSH 预设是随包根赢重复 id

PF-002 §5.5 说 official 永远可被替代。DSH 预设反着做：随包根被前置，「built-in set … wins duplicate ids even when a patch replaces the roster configuration」（D11）；
要换掉随包预设只能整批关掉随包根（`includeShippedRoot: false`）。
同一个 DSH 的技能却是项目 / 用户赢随包（D4），Codex 子代理是自定义赢内置（C18），Claude Code 技能是用户 / 项目遮蔽随包（K4）——
**同一家里，不同资产类别的答案也不同**。

- 适用范围：DSH 预设与技能、Codex 子代理、Claude Code 技能。
- 代价与不适用：随包赢的做法让内置件不会被静默顶掉，代价是自定义只能另起 id；可替代的做法反之。
- 来源：[E1](evidence.md#e1-dsh) D4、D11；[E2](evidence.md#e2-codex) C18；[E4](evidence.md#e4-claude-code) K4。
- 最近核对：2026-09-23 / 同上。

### 「上面禁了下面开不回来」在同行的权限维与一小批锁键上成立，在一般启停开关上不成立

**成立的地方**：

- 权限放行链的 deny 不可被任何层放宽，四家一致——证据见
  [agent-harness-session-design 一·2](../agent-harness-session-design/research.md#2-权限放行链只能单调收紧deny-不可被任何层放宽)。
- Claude Code 的一批锁键就是析取：`disableBypassPermissionsMode` / `disableAutoMode`「works from any scope」「Applies the strictest value any source sets」，还有一张「下层更严值压过 managed」的反向例外表（见 [E4](evidence.md#e4-claude-code) 末段所引上一轮报告）。
- DSH `ToolRestriction`：作用域对继承来的工具做过滤，多条限制取交集——deny 的并集，下层去不掉上层的 deny（D9）。
- Codex 托管 MCP 允许清单**只会关、不会开**（C13）；高优先级 requirements 可以用 `false` 关掉低优先级允许的 profile（C9）。

**不成立的反例（下层或更高优先级能开回来）**：

- Codex requirements 的 `[features]` 可以把特性钉成**开**（C11）；Claude Code managed 可以在 `enabledPlugins` 里**强制启用**（K7）。这两家的上层不只会禁，还会强开——本系统的析取里没有「强开」这一值。
- Codex 普通配置层里 `mcp_servers.<id>.enabled` 是普通布尔（C15），层间按「高覆盖低」（C1、C14）；由此推得受信项目层能把用户层停用的 server 再开起来——**文档交叉推断，未在装载器源码核对**。Claude Code 的 `enabledPlugins` 同理只能由设置层序推断，未核实。
- omne-next 工具集的 `exclude_tools` 是整条配置的一部分，高层整条替换时一起换掉（O2）——上面排除的，下面换一条配置就回来了。
- DSH 技能的停用不是分层设置，是技能文件自己 frontmatter 上的布尔（D7），谈不上哪一层能不能开回来。

- 适用范围：上述版本；「成立」一侧对的是权限与 Claude Code 的锁键，不推广到这些产品的一般设置。
- 代价与不适用：析取式禁用的代价是禁用只能由设了真的那一层撤销；Claude Code 反向例外表的存在说明它是**逐键挑选**的，不是全局规则。
- 来源：[E1](evidence.md#e1-dsh) D7、D9；[E2](evidence.md#e2-codex) C1、C9、C11、C13–C15；[E3](evidence.md#e3-omne-next) O2；[E4](evidence.md#e4-claude-code) K7。
- 最近核对：2026-09-23 / 同上。

### 同行没有一个逐值的 `immutable` 标记同时管设置、权限与资产替换；锁要么是整层，要么是逐字段允许集，要么是逐领域专用规则

| 谁 | 锁怎么表示 | 设置值 | 权限取值 | 资产替换 |
|---|---|---|---|---|
| DSH | **没有锁**：用户层永远压过部署配置（D1）；技能、工具、作用域都是最近者赢（D3、D8、D10） | 不可锁 | `ToolRestriction` 另一套（D9） | 不可锁；预设靠「随包根在前」结构性地赢（D11） |
| Codex | 与普通配置**分开的** requirements 文件；逐字段 `allowed_*` 允许集、`[features]` 钉值、MCP 名＋实体清单；各字段合成规则不同（C5–C8、C11、C12） | 只有特性开关可钉；**模型不可锁**，requirements 里的模型仍是可被显式覆盖的默认（C10） | `allowed_approval_policies` 等允许集 | 只对 MCP server 有名＋实体清单；技能、子代理没有 |
| Claude Code | **整层**：managed「Nothing you set overrides them」；另有少数「取最严」的锁键与 `allowManaged*Only` / `strictPluginOnlyCustomization` 一类开关（上一轮报告 §2.2–2.3；K10、K11） | managed 层整体压过 | deny-first 全层并集，另一套 | managed 可强制启用插件（K7）、锁技能只来自插件（K11） |
| omne-next | 逐领域：配额「下层 override 不能放宽上层 ceiling」、loop guard「只可收紧」＋ platform floor、权限「base⊕override deny-first」（O5–O7） | 按领域 | deny-first | 工具集无锁（O1） |

Codex 在代码里把受约束字段统一包成 `Constrained<T>`（C8），**实现上是一个通用包装**，但每个字段的允许集形状与合成规则各自定义（C6），
面向管理员的表示仍是逐字段的。四家里没有一家让同一个标记既能锁「模型选哪个」、又能锁「这个工具问不问」、又能锁「这个技能不许被换」。

- 适用范围：上述版本。
- 代价与不适用：整层锁（Claude Code）表达不了「这一层的这一项锁、那一项不锁」，所以它不得不补反向例外表与一串专用开关；
  逐字段允许集（Codex）每加一类可锁项就要加一个 schema 字段与合成规则，且文档自己警告「instead of assuming that every field merges the same way」（C6）。
- 撞上这条事实会怎样：本系统的一个标记要在三处有同一语义，同行没有可直接对照的实现；Codex 的「冲突时回落到合规值并告警」（C7）是一种可对照的冲突处置，但它回落的依据是允许集，不是被锁的那个值。
- 来源：[E1](evidence.md#e1-dsh) D1、D3、D8–D11；[E2](evidence.md#e2-codex) C5–C12；[E3](evidence.md#e3-omne-next) O1、O5–O7；[E4](evidence.md#e4-claude-code) K7、K10、K11。
- 最近核对：2026-09-23 / 同上。

### 同行挡项目层按的不是「设置 / 权限」这条线：Codex 与 DSH 连部分设置也挡，Codex 与 Claude Code 让受信项目参与权限

四家都挡仓库给自己提权（[agent-harness-session-design 一·3](../agent-harness-session-design/research.md#3-仓库不能给自己提权)）。补的一句是**它们对设置挡不挡**：

| 谁 | 项目层的设置 | 项目层的权限 | 切的那条线 |
|---|---|---|---|
| DSH | **没有项目级设置文件**，设置只在 harness home（D2）；项目 `.env` 的 `DSH_` 前缀启动即抛（上一轮） | 无项目层权限配置 | 设置整个不从项目来；**资产从项目来且压过用户与随包**（D4） |
| Codex | 受信项目的设置照常生效，**但路由凭据、换 provider、选 profile、跑本机通知 / 遥测命令的一张键清单被忽略**（C3）；不受信项目整层跳过（C2） | 受信项目可写 `approval_policy` 等（C4，文档推断），上限由 requirements 卡（C7） | 按「会不会把凭据或流量引走、会不会在本机执行命令」挑键，外加信任闸 |
| Claude Code | 项目设置在用户之上照常生效；项目里写 `auto` / `bypassPermissions` 模式不生效（上一轮） | 项目可写 allow 与 deny；repo 自带的 `settings.local.json` 扣到用户信任该目录；repo 在已提交设置里自批的 `.mcp.json` server 不被 `list`/`get` 拉起（K12） | 按「会不会一步跳到不问」挑键，外加信任闸 |
| omne-next | 未找到项目 / 工作区作为配置层的概念 | — | — |

**没有一家**以「设置可以从项目来、权限一概不行」这条线切。Codex 与 DSH 的做法说明：**部分设置本身就是提权通道**
（改 provider base URL、改凭据来源、配置在本机执行的通知命令），它们挡这些键的理由与挡权限的理由是同一个——仓库跟着 `git clone` 来。

- 适用范围：上述版本的本地客户端。
- 代价与不适用：Codex 的键清单要随每个新增的「会路由流量或执行命令」的键维护；Claude Code 与 Codex 的信任闸是整目录一次性的，信任之后项目层能写权限。
- 撞上这条事实会怎样：一个只按「设置 / 权限」分类的过滤，会让归在「设置」里、实际能引走流量或在宿主机执行命令的项从工作区进来；Codex 列出的那几类键就是同行已经识别出的这一类。
- 来源：[E1](evidence.md#e1-dsh) D2、D4；[E2](evidence.md#e2-codex) C2–C4、C7；[E4](evidence.md#e4-claude-code) K12；上一轮 [一·3](../agent-harness-session-design/research.md#3-仓库不能给自己提权)。
- 最近核对：2026-09-23 / 同上。

### 「一层的值只作用于本层来源的东西」在同行只以个别键的补丁出现，没有作为通用规则

PF-002 的「工作区配的禁用只对工作区这一级提供的资产生效」是一条**按资产来源加条件的析取**。同行里最接近的四处：

| 谁 | 做法 | 方向 |
|---|---|---|
| Claude Code | 「non-managed settings can no longer disable managed hooks set by policy」——`disableAllHooks` 被改成遵守 managed 层级（K8） | 与本系统同向：下层的关停够不到上层提供的件。**是 2.1.49 的修复**，说明最初不是这样 |
| Claude Code | 权限 `!` 否定「reaches only rules from the same source」（上一轮报告 §2.3），changelog 称之为修过的 bug | 同向：一层的例外只作用于本层来源的规则 |
| Claude Code | `allowedMcpServers`「govern only servers users add」，managed 自己下发的 server 不受这份允许清单约束，要关得用 `deniedMcpServers`（K9） | 按来源决定一条策略管不管得着 |
| DSH | `ToolRestriction` 只过滤继承来的工具，**作用域自己注册的工具豁免**（D9） | **反向**：限制只管别人给的，不管自己的 |

四处都是针对一个键或一类件的具体规则，**没有一家把「值按提供者来源生效」做成所有布尔设置共用的合成语义**。

- 适用范围：上述版本。
- 代价与不适用（没有先例的部分要付什么）：
  - 每一个禁用值的求值都要知道**被禁的那份资产是哪一层提供的**——析取不再只是对各层布尔求或，而要先解出资产的提供层；这让「禁用」的求值依赖「资产替换」那一轮的结果。
  - 同标识替换之后「谁提供的」不再是一个静态属性：工作区提供了一个同标识替换件，被它顶掉的是租户那份；Claude Code 的两处同向规则都在「件的来源不会被换掉」的对象上（managed hooks、权限规则），没有遇到这个问题。
  - Claude Code 的三条都是**事后补丁**（K8 与 `!` 否定都被 changelog 称为修复），同行没有留下这类规则设计时的取舍记录可供对照。
- 撞上这条事实会怎样：若禁用的求值与替换的求值次序不定，同一组配值可能在不同实现里得出不同的可见集合，而且不报错。
- 来源：[E1](evidence.md#e1-dsh) D9；[E4](evidence.md#e4-claude-code) K8、K9 与末段所引上一轮报告。
- 最近核对：2026-09-23 / 同上。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| Codex 文档对项目层禁用键与层序的描述与 `5c5308fc9a` 的装载器一致 | 「挡项目层按的不是设置 / 权限这条线」中 Codex 一行；「开回来」反例中 Codex 一条 | 未核对：`codex_config` crate 不在副本里 |
| Claude Code changelog 所述行为在 `2.1.280` 仍然有效（后续版本未再改回） | 「同名」反例中 K5、K6；「本层来源」一节全部 Claude Code 行 | 未核对：只读 changelog，未在 managed 环境实测 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| Codex 同名技能跨 User / Repo / System / Admin 的去重规则 | 取 `codex-core-skills`（或等价 crate）在 `5c5308fc9a` 的源码，看 loader 的去重键 | 「同名即替代」一条的 Codex 行；架构读数若要以 Codex 为技能替代的对照 | 本 topic 下一轮 |
| Claude Code 项目层 `enabledPlugins: true` 能否开回用户层 `false` | 在隔离的 `HOME` 下建用户与项目两份设置实测 | 「开回来」反例中 Claude Code 一条 | 本 topic 下一轮 |
| Claude Code managed 层 hooks / 插件与本地同名时谁生效 | managed 环境实测，或取官方 settings 文档对应节 | 「本层来源」一节 | 待明确 |

## 采用与后续核对

当前没有设计文档消费本研究；消费者出现后回填 README 的「消费者」。
任一来源升版本时，按 [演进事件词](../README.md#演进事件词) 记入 `changelog.md`（届时新建），不原地覆盖。
