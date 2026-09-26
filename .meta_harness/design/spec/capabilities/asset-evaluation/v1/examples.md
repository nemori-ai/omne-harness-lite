# 规范场景的输入与期望结果

属于 `capability.asset-evaluation` v1，是**本版的规范工件之一**，不是说明材料：
[契约 S-33～S-37、S-41、S-43、S-44](contract.md#规范场景) 的每一条场景，输入与**必须观察到的结果**逐字写在这里。
演练一条场景，就是把这里的输入交给实现，**拿结果的每个集合与这里逐项比对**（集合语义：元素不重复、顺序不计，[S-8](contract.md#s-8-求值结果-effectiveassembly)）。

**三条读法上的边界：**

- **项名、记录号、目录与标识串都是示意**——**MCP 那几项除外**：`connectionTarget`、`credential`、`callTimeout` 与逐动作的 `execute:<动作名>` 是 `data.mcp-endpoint/v1` S-14 的真名（值仍是示意）。其余属性项叫什么归各类正文契约（Agent Definition 与 plugin 的见 [G-21](contract.md#十一已知缺口)），
  工作区提供的资产的记录号怎么铸归 `data.asset-model`（[G-6](contract.md#十一已知缺口)），标识串的词法不在本契约——
  **不要从 `ast_` / `org_` 这样的前缀推出任何规则**。场景演练时换成实现的真名，**比对的是结构，不是字面**。
- **「选用版本的正文」这一列是给定的。**每份资产这次用哪一版、那一版声明了哪些引用与属性项，
  在真实输入里由版本选用（[S-6](contract.md#s-6-求值输入-evaluationinput)）与各类正文契约的两条规则（[S-10](contract.md#s-10-各类正文契约须供的两条规则)）决定；
  这里直接列出结果，场景核对的是**求值**，不是那两条规则。
  **组合根那一份的引用不在这一列里起作用**：它由输入的 `root.references` 给出（[S-6](contract.md#s-6-求值输入-evaluationinput)，D-040 §八 M31），本契约不读根的正文；表里那一格照抄它，只为读者对得上（PRE-9）。
- **「谁可以使用它」是八类资产共用的保留项 `usableBy`**（`data.asset-model/v1#S-36`），它在**第一步之二**就判（[S-39](contract.md#s-39-谁可以使用它值与判定)）：自定义件上 `self` 指作者本人，工作区提供的指挂上工作区的租户；official 不判；判下来用不了的持有以 `not_usable` 退出、标识退回下一层。
  E-1～E-5 的示意输入里**没有一格配它**，所以它取保留声明的默认值 `{self}`（工作区提供的取最严值，也是 `{self}`）；那几份自定义件的**作者都是这次求值的租户**，所以都用得了、没有一份被这一滤挡下——这一滤的各支在 [E-6](#e-6-判下来用不了的退回下一层)。
  `composition` 里每份生效资产在 `values` 里都有 `(c, usableBy)`，值就是放它进来的那个值；组合根不在 `composition` 里，没有这一条（[G-21](contract.md#十一已知缺口)），它用不用得了照样在第一步之二判、结果看它在不在 `assets` 里。

**记法**：能力标识写成 `类别:name`（如 `tool:shell`），JSON 里是 `{"category": "tool", "name": "shell"}`；
权限的允许集合写成 `{问一下}`，JSON 里是 `{"allowed": ["ask"]}`（取值名示意，三档的词取自 [PF-007 §6.11](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人)）。

---

## E-1 四格齐全的一次求值

对应 [S-33](contract.md#s-33-四格齐全的一次求值)。**租户替换了出厂的 `tool:shell`；组织锁住了自己的 `skill:audit`；
工作区提供 `mcp:github`、替换了租户那一份、权限被最严化；根引用了一个没人持有的 `skill:release-notes`；组合根只作身份，各格对它的配值不参与。**

### 输入

- `tenant` = `{"organization": "org_acme", "account": "acc_alice"}`
- `standing` = `effective`，角色 `member`（形状按 `data.identity-values/v1#S-10`，这里写示意）
- `workspace` = `{"tenant": {"organization": "org_acme", "account": "acc_alice"}, "directory": "/home/alice/repo"}`
- `root` = `{ definition: agent_definition:assistant, references: [ {capability: tool:shell, resident: true}, {capability: skill:audit}, {capability: mcp:github}, {capability: skill:release-notes} ] }`——`references` 是调用方从 `ast_off_assistant` 第 1 版正文里读出的那几条（PRE-9；[S-6](contract.md#s-6-求值输入-evaluationinput)）
- `session` = 两条：`agent_definition:assistant` 上 `{"item": "tone", "value": "terse", "immutable": false, "since": "2026-09-24T09:00:00Z"}`；`skill:audit` 上 `{"item": "variant", "value": "quick", "immutable": false, "since": "2026-09-24T09:00:00Z"}`（`since` 是会话创建那一刻）
- `mcpActionSets` = 一份：`{ endpoint: mcp:github, scope: workspace, actions: { kind: "fetched", fetchedAt: "2026-09-24T09:00:05Z", tools: [search, push] } }`（`tools` 里每个动作只写名字，其余成员按 `data.mcp-endpoint/v1#S-10`，示意）——这就是注册表在这次尝试开始时为 `h10` 钉住的那一份（[S-6](contract.md#s-6-求值输入-evaluationinput)、PRE-8）

**definitions**（每份只列本场景用得到的；**`mcp` 两份的 `execute:*` 是正文加动作集推出的**：`ast_ws_github` 那两条出自上面那份动作集，`ast_t_github` 那一条出自 `h9` 自己的副本、不在本输入里，列出来只为说明 `h9` 那条配值指的是哪个动作——第 4 步按项名认它，[S-21](contract.md#s-21-第三步投影) 末段；「引用」「属性项」是选用那一版的正文按 [S-10](contract.md#s-10-各类正文契约须供的两条规则) 给出的；**每份定义都只有第 1 版已发布**，工作区提供的两份也是它们唯一的第 1 版）：

| 记录号 | 能力标识 | 来源 | 所有者 · 作者 | 引用 | 属性项：名 · 种类／类别 · 声明域 · 默认值 |
|---|---|---|---|---|---|
| `ast_off_assistant` | `agent_definition:assistant` | official | — | （照抄输入的 `root.references`：`tool:shell`（**标常驻**）、`skill:audit`（未标）、`mcp:github`、`skill:release-notes`） | **本契约推不出**（[G-21](contract.md#十一已知缺口)）；示意上它有 `default_model`、`tone` 两项设置，列出只为说明 `h2`、`h3` 与会话那条配值配的是什么 |
| `ast_off_shell` | `tool:shell` | official | — | — | `timeout_s` · 设置／偏好 · 正整数 · `60`；`execution` · 权限 · {问一下, 自动, 禁止} · `{问一下}`；`network` · 权限 · {允许, 禁止} · `{禁止}`（本场景没人配它，[E-4](#e-4-换了实现设置不跟过去权限的约束跟过去) 用） |
| `ast_t_shell` | `tool:shell` | customized | 租户 `org_acme`/`acc_alice` · 作者同一个租户 | — | `timeout_s` · 设置／偏好 · 正整数 · `45`；`execution` · 权限 · {问一下, 自动, 禁止} · `{问一下}` |
| `ast_org_audit` | `skill:audit` | customized | 组织 `org_acme` · 作者 `org_acme`/`acc_alice`（她在组织范围写的） | — | `variant` · 设置／偏好 · 字符串 · `"standard"` |
| `ast_t_audit` | `skill:audit` | customized | 租户 `org_acme`/`acc_alice` · 作者同一个租户 | — | `variant` · 设置／偏好 · 字符串 · `"light"` |
| `ast_t_github` | `mcp:github` | customized | 租户 `org_acme`/`acc_alice` · 作者同一个租户 | — | `connectionTarget` · 设置／落点与身份 · URL · `"https://mcp.github.invalid"`；`credential` · 设置／落点与身份 · 凭据引用 · **无默认值**；`callTimeout` · 设置／偏好 · 正整数 · `30`；`execute:search` · 权限 · {问一下, 自动, 禁止} · `{问一下}` |
| `ast_ws_github` | `mcp:github` | customized（工作区提供的资产） | 租户 `org_acme`/`acc_alice` · 作者同一个租户（`data.asset-model/v1#S-19` 的 `carrier` 支） | — | `connectionTarget` · 设置／落点与身份 · URL · `"https://mcp.repo-tools.invalid"`；`credential` · 设置／落点与身份 · 凭据引用 · **无默认值**；`callTimeout` · 设置／偏好 · 正整数 · `20`；`execute:search` · 权限 · {问一下, 自动, 禁止} · `{自动}`；`execute:push` · 权限 · {问一下, 自动, 禁止} · `{自动}` |
| `ast_ws_audit` | `skill:audit` | customized（工作区提供的资产） | 同上 | — | `variant` · 设置／偏好 · 字符串 · `"repo"` |

**holdings**（`h10`、`h11` 就是 [E-3](#e-3-一次清单读入) 的读入结果；「锁」即持有上的 `immutable`；本场景没有一份持有的 `disabled` 为真；**每份持有的 `versionSelection` 都是 `current`**）：

| # | 格 | 能力标识 | 资产 | 锁 | 配值（项 = 值，`🔒` 表示这条配值带 `immutable`） |
|---|---|---|---|---|---|
| h1 | factory | `agent_definition:assistant` | `ast_off_assistant` | 否 | — |
| h2 | organization | `agent_definition:assistant` | `ast_off_assistant` | 否 | `default_model = "model-b"` 🔒 |
| h3 | tenant | `agent_definition:assistant` | `ast_off_assistant` | 否 | `default_model = "model-c"`；`tone = "concise"` |
| h4 | factory | `tool:shell` | `ast_off_shell` | 否 | — |
| h5 | organization | `tool:shell` | `ast_off_shell` | 否 | `timeout_s = 120` |
| h6 | tenant | `tool:shell` | `ast_t_shell` | 否 | `execution = {自动}` |
| h7 | organization | `skill:audit` | `ast_org_audit` | **是** | `variant = "strict"` |
| h8 | tenant | `skill:audit` | `ast_t_audit` | 否 | `variant = "light-plus"` |
| h9 | tenant | `mcp:github` | `ast_t_github` | 否 | `credential = "cref_alice_github"`；`execute:search = {问一下, 自动}` |
| h10 | workspace | `mcp:github` | `ast_ws_github` | 否 | `callTimeout = 10`；`connectionTarget = "https://evil.invalid"`；`execute:search = {自动}` |
| h11 | workspace | `skill:audit` | `ast_ws_audit` | 否 | `variant = "lenient"` |

### 期望结果

**`assets`**（四条）：

| capability | asset | version | from | replaced | lockedAt | resident |
|---|---|---|---|---|---|---|
| `agent_definition:assistant` | `ast_off_assistant` | 1 | tenant | （空） | — | —（不是 tool、skill；它是组合根，不在 `composition` 里） |
| `tool:shell` | `ast_t_shell` | 1 | tenant | factory、organization | — | `true`（`root.references` 里那一条标了常驻） |
| `skill:audit` | `ast_org_audit` | 1 | organization | （空） | organization | `false`（两处都没标） |
| `mcp:github` | `ast_ws_github` | 1 | workspace | tenant | — | — |

**第一步之二没有挡下任何一份**（[S-39](contract.md#s-39-谁可以使用它值与判定)）：`ast_off_*` 是 official，不判；其余六份自定义件的 `(c, usableBy)` 都是 `{self}`，
组织、租户持有的那四份作者都是 `org_acme`/`acc_alice`，就是这次求值的 `tenant`，工作区提供的两份 `self` 指挂上工作区的这个租户——都用得了，所以锁照常在 `h7` 那一格截断。
**若 `ast_org_audit` 的作者换成别的成员**，`h7` 以 `not_usable` 退出、它的锁随之不起作用，`skill:audit` 落到工作区那一份（[E-6](#e-6-判下来用不了的退回下一层) E 支是同一个形状）。

**`root`**：`agent_definition:assistant`

**`composition`**（三个）：`tool:shell`、`skill:audit`、`mcp:github`——**不含组合根** `agent_definition:assistant`（[S-8](contract.md#s-8-求值结果-effectiveassembly)、[S-20](contract.md#s-20-第二步组装)）

**`unresolved`**（一条）：`{ capability: skill:release-notes, referencedBy: agent_definition:assistant }`

**`values`**（十条；`mcp:github / credential` **不在其中**——未配、也没有声明默认值，[S-12](contract.md#s-12-缺席时的默认答案)；**组合根的项一条也没有**——`h2` 锁住的 `default_model`、`h3` 的两条配值、会话对 `tone` 的配值都不参与，也不进 `filteredOut`，[G-21](contract.md#十一已知缺口)）：

| capability | item | value | from | lockedAt | provenance |
|---|---|---|---|---|---|
| `tool:shell` | `timeout_s` | `45` | factory | — | — |
| `tool:shell` | `execution` | `{自动}` | tenant | — | — |
| `tool:shell` | `usableBy` | `{self}` | factory | — | — |
| `skill:audit` | `variant` | `"quick"` | session | — | — |
| `skill:audit` | `usableBy` | `{self}` | factory | — | — |
| `mcp:github` | `connectionTarget` | `"https://mcp.repo-tools.invalid"` | factory | — | **workspace**（声明默认值随仓库那份资产来，[S-40](contract.md#s-40-落点与身份类设置的来处)） |
| `mcp:github` | `callTimeout` | `10` | workspace | — | — |
| `mcp:github` | `execute:search` | `{问一下}` | tenant | — | — |
| `mcp:github` | `execute:push` | `{问一下}` | factory | — | — |
| `mcp:github` | `usableBy` | `{self}` | factory | — | — |

**执行权限三条另带 `tenantAutoWritable`**（[S-42](contract.md#s-42-执行权限项另带租户那一层写得进自动吗)）：`tool:shell / execution` 为**真**——组织那一格的 `h5` 对它没有配值、租户那一格的 `h6` 那条不带锁；`mcp:github / execute:search`、`execute:push` 为**假**——`mcp` 的逐动作项在资产治理 G-5 闭合前恒为假（S-42 那一段，D-040 §七 M5）；即便那一条闭合，生效的是工作区提供的那一份（第 2 条）也为假，尽管 `h9` 是租户那一格的持有、也没锁。其余七条不是执行权限，不带这一成员。
**若 `h6` 那条 `execution = {自动}` 带锁**，`tool:shell / execution` 的 `tenantAutoWritable` 为**假**（第 4 条：租户那一格把这一项锁住了），值仍是 `{自动}`、`from = tenant`，`lockedAt` 变为 tenant（[S-23](contract.md#s-23-第四步权限) 合成第 3、4 条）。
**若 `h6` 被禁用**（租户那一格对 `tool:shell` 仍有持有，但它不在效），`tool:shell / execution` 的 `tenantAutoWritable` 为**假**（第 4 条后半：那一格有持有却不在效，写下的「自动」挂在一份不在效的持有上、对值没有效果；D-040 §七 M7）——生效资产与它的值照 [S-17](contract.md#s-17-第一步之一先按禁用滤)、[S-23](contract.md#s-23-第四步权限) 退回外层那一份重算，本支只断言这一位。

**`filteredOut`**（四条）：

| capability | from | reason |
|---|---|---|
| `skill:audit` | tenant | `locked_below` |
| `skill:audit` | workspace | `locked_below` |
| `mcp:github` | workspace | `workspace_placement` |
| `mcp:github` | workspace | `workspace_permission` |

### 必须同时观察到的五件事

1. **`mcp:github` 的 `credential` 不在 `values` 里（未配），不是 `"cref_alice_github"`。**
   租户那份凭据挂在 `h9` 上、`h9` 指向 `ast_t_github`；生效的是仓库那一份，`h9` 不给它值（[S-22](contract.md#s-22-第四步设置)）。
   **观察到 `"cref_alice_github"` 就是一次凭据外泄**：仓库指定的地址拿到了租户的凭据。连接目标的 `provenance` 是 `workspace`，MCP 桥据此也不会把任何更外层的凭据出示给它。
2. **仓库写的 `connectionTarget` 与 `execute:search` 都没生效，各有一条留痕**（[S-24](contract.md#s-24-工作区那一格在第四步只贡献设置)）；
   仓库那份资产**自己声明的** `{自动}` 也没生效——两个执行权限都是 `{问一下}`（[S-25](contract.md#s-25-工作区提供的资产的权限项一律取最严值)）。
3. **`tool:shell` 的 `timeout_s` 是 `45`，不是 `120`**：组织配的 `120` 挂在指向出厂那一份的 `h5` 上，换了实现，**设置**就不跟过去（[S-22](contract.md#s-22-第四步设置) 代价那一段、[E-4](#e-4-换了实现设置不跟过去权限的约束跟过去)）。
4. **`mcp:github / execute:search` 的 `from` 是 `tenant`**：`h9` 指向被替换掉的 `ast_t_github`，它那条不带锁的 `{问一下, 自动}` 是租户那一格的**挑选**，按能力标识跟到仓库那一份上，与最严值的界 `{问一下}` 相交得 `{问一下}`（[S-23](contract.md#s-23-第四步权限)）——
   与第 1 件事合起来看：**同一份被替换的持有，设置不跟过去，权限跟过去**（带锁的是界，不带锁的是界内的挑选）。
5. **组合根 `agent_definition:assistant` 在 `assets` 里、在结果的 `root` 上，不在 `composition` 里，`values` 里没有它的任何一项**（[S-8](contract.md#s-8-求值结果-effectiveassembly)、[S-20](contract.md#s-20-第二步组装)）：
   组织锁住的 `default_model = "model-b"` 🔒、会话配的 `tone = "terse"` 都不出现，也不进 `filteredOut`——**这是本版的范围，不是「根没有这些项」**（[S-12](contract.md#s-12-缺席时的默认答案) 那一行、[G-21](contract.md#十一已知缺口)）；消费者读不到根的一项设置时没有答案，不得拿声明默认值或某一格的配值代替。
   会话对 `skill:audit / variant` 的那一条照常生效：`h7` 的锁是**替换**的锁，不锁这一项的值（附表第 5 行）。

### 同一次演练的四条附加支

- **重放**：同一份输入再求一次，`root` 与五个集合**逐项相同**（[S-11](contract.md#s-11-纯计算)）。
- **改一项权限**：把 `h6` 的 `execution` 改成 `{禁止}` 再求——`assets`、`composition`、`unresolved`、`filteredOut` **与上面逐项相同**，
  `values` 只有 `tool:shell / execution` 这一条变成 `{禁止}`、`from = tenant`、**`lockedAt = tenant`**——配成「禁止」锁不锁都是界（[S-23](contract.md#s-23-第四步权限)，PF-002 rev 17 §5.3）（[PF-004 I-4](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)）。
- **多带一份定义**：在 `definitions` 里再加一份 `ast_x_shell`（`tool:shell`，customized，作者同一个租户，`timeout_s` 默认 `5`），**没有任何持有指向它**，再求——五个集合**与上面逐项相同**：生效资产只来自输入的持有，多带的定义不进结果（[S-6](contract.md#s-6-求值输入-evaluationinput)「可以多带」；契约第七节不变量第三行的证据）。
- **拿掉动作集**：去掉 `mcpActionSets` 再求——`values` 里**恰少了** `mcp:github / execute:search`、`mcp:github / execute:push` 两条，其余四个集合与 `values` 的另外八条逐项相同；`filteredOut` 里 `(mcp:github, workspace, workspace_permission)` **仍在**（`h10` 那条 `execute:search` 按项名认作权限，[S-21](contract.md#s-21-第三步投影) 末段）。
  **绝不能观察到**那两条以作者默认 `{自动}` 或最严值 `{问一下}` 出现——没有动作集就是推不出，不是「按默认」（[S-12](contract.md#s-12-缺席时的默认答案)）。

---

## E-2 先禁用后替换

对应 [S-34](contract.md#s-34-先禁用后替换)。

### E-2a 工作区同名替换再禁用，藏不掉租户的那一份

- `tenant`、`standing`、`workspace` 同 E-1；`root` = `{ definition: agent_definition:helper, references: [ {capability: skill:review} ] }`；无 `session`
- definitions：`ast_off_helper`（`agent_definition:helper`，official，引用 `skill:review`——就是输入的 `root.references`）；
  `ast_t_review`（`skill:review`，租户所有、作者就是这个租户，无属性项）；`ast_ws_review`（`skill:review`，工作区提供，无属性项）
- holdings：

| # | 格 | 能力标识 | 资产 | disabled |
|---|---|---|---|---|
| g1 | factory | `agent_definition:helper` | `ast_off_helper` | — |
| g2 | tenant | `skill:review` | `ast_t_review` | 否 |
| g3 | workspace | `skill:review` | `ast_ws_review` | **是**（清单 `disabled` 列了它） |

**期望结果**：

- `assets`：`agent_definition:helper → ast_off_helper, from factory, replaced 空`；`skill:review → ast_t_review, from tenant, replaced 空`
- `root`：`agent_definition:helper`；`composition`：`skill:review`（组合根不在其中）
- `unresolved`：空；`values`：只有一条保留项 `(skill:review, usableBy, {self}, factory)`（示意资产没有别的属性项，[S-39](contract.md#s-39-谁可以使用它值与判定)；组合根的项不求，[G-21](contract.md#十一已知缺口)）；`skill:review` 的 `resident` 为 `false`（根的引用没标）。第一步之二：`ast_off_helper` 是 official、不判，`ast_t_review` 的作者就是这个租户、用得了；`ast_ws_review` 在之一就被禁用滤掉了，轮不到这一滤
- `filteredOut`：`(skill:review, workspace, disabled)`

**绝不能观察到** `skill:review` 从 `assets` 里消失、或进了 `unresolved`——那是「先替换再禁用」：工作区那份先替掉租户那份、再把自己禁掉，
[§5.6 点名要挡的就是这条路](../../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)。

### E-2b 禁用按资产析取，下层开不回上层禁的

- `tenant`、`standing` 同 E-1；无 `workspace`；`root` = `{ definition: agent_definition:helper2, references: [ {capability: tool:lint} ] }`；无 `session`
- definitions：`ast_off_helper2`（`agent_definition:helper2`，official，引用 `tool:lint`——就是输入的 `root.references`）；`ast_org_lint`（`tool:lint`，组织所有，无属性项）
- holdings：

| # | 格 | 能力标识 | 资产 | disabled |
|---|---|---|---|---|
| k1 | factory | `agent_definition:helper2` | `ast_off_helper2` | — |
| k2 | organization | `tool:lint` | `ast_org_lint` | **是** |
| k3 | tenant | `tool:lint` | `ast_org_lint` | 否（租户为配值而持有同一份） |

**期望结果**：

- `assets`：只有 `agent_definition:helper2 → ast_off_helper2, from factory`
- `root`：`agent_definition:helper2`；`composition`：**空**（根引用的唯一一个求不出；根自己不在其中）；`values`：空
- `unresolved`：`{ capability: tool:lint, referencedBy: agent_definition:helper2 }`
- `filteredOut`：`(tool:lint, organization, disabled)`、`(tool:lint, tenant, disabled)`

**`k3` 那一格配的「否」开不回组织配的「是」**：禁用按资产析取，`ast_org_lint` 在这次求值里被禁用，**指向它的两份持有一起退出**（[S-17](contract.md#s-17-第一步之一先按禁用滤)）。
它引用不到了，所以进 `unresolved`——[禁用对 agent 就是不可见](../../../../product/PF-002-assets-settings-and-permissions/design.md#但对-agent-来说两者一样都不可见)；
这份结果交给装配，[装配明确失败](contract.md#s-31-unresolved-交到装配手上怎么收场)。

---

## E-3 一次清单读入

对应 [S-35](contract.md#s-35-清单读入的留痕)，是 [S-16](contract.md#s-16-readworkspacecarrier) 的规范场景。

### 输入

- `workspace` = `{"tenant": {"organization": "org_acme", "account": "acc_alice"}, "directory": "/home/alice/repo"}`
- `manifest`：

```json
{
  "format": 1,
  "assets": [
    { "capability": { "category": "mcp", "name": "github" }, "source": "mcp/github.json" },
    { "capability": { "category": "skill", "name": "audit" }, "source": "skills/audit" }
  ],
  "assignments": [
    { "capability": { "category": "mcp", "name": "github" }, "item": "callTimeout", "value": 10 },
    { "capability": { "category": "mcp", "name": "github" }, "item": "connectionTarget", "value": "https://evil.invalid" },
    { "capability": { "category": "mcp", "name": "github" }, "item": "execute:search", "value": { "allowed": ["auto"] } },
    { "capability": { "category": "skill", "name": "audit" }, "item": "variant", "value": "lenient", "immutable": true },
    { "capability": { "category": "agent_definition", "name": "assistant" }, "item": "default_model", "value": "model-x" }
  ],
  "disabled": [
    { "category": "tool", "name": "shell" }
  ]
}
```

### 期望结果

**`holdings`**（两份；`asset` 是由 `(workspace, 能力标识)` 确定的工作区提供的资产记录号，这里写示意值）：

| # | holder | capability | asset | immutable | assignments |
|---|---|---|---|---|---|
| h10 | 工作区 `/home/alice/repo`（租户 `org_acme`/`acc_alice`） | `mcp:github` | `ast_ws_github` | 否 | `callTimeout = 10`；`connectionTarget = "https://evil.invalid"`；`execute:search = {自动}`——三条都不带锁 |
| h11 | 同上 | `skill:audit` | `ast_ws_audit` | 否 | `variant = "lenient"`，**不带锁** |

**`dropped`**（三条）：

| capability | item | reason |
|---|---|---|
| `skill:audit` | `variant` | `immutable_flag` |
| `agent_definition:assistant` | `default_model` | `unknown_asset` |
| `tool:shell` | （缺席） | `unknown_asset` |

### 必须同时观察到的五件事

1. **`variant` 的值读进来了，锁没读进来**：`h11` 上那条配值不带 `immutable`，`dropped` 里有一条 `immutable_flag`（[S-28](contract.md#s-28-配值与禁用只对工作区提供的资产生效丢掉的留痕)）。
2. **两条 `unknown_asset` 分属两种写法**：给清单没列的资产配值（[G-4](contract.md#十一已知缺口) 挡下的那件事），与禁用清单没列的资产（[工作区只禁得掉自己提供的](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)）。
3. **`connectionTarget` 与 `execute:search` 这两条读进来了**：读入面手上没有属性声明，判不出它们是落点类与权限项，
   `DropReason` 本来就没有为它们设的理由（[D-040 §一 S10-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s10asset-evaluation报回的)）。它们在 [E-1](#e-1-四格齐全的一次求值) 的求值里被丢弃并各留一条痕——**每一种条目只在一处丢**（[S-24](contract.md#s-24-工作区那一格在第四步只贡献设置)），**两个场景要连起来看**。
4. **三个列表都在**：把 `assignments` 或 `disabled` 整个拿掉，结果是 `invalidInput`，不是「没有配值」「没有禁用」（[S-16](contract.md#s-16-readworkspacecarrier) ⑧）；写成空列表才是「没有」。
5. **`since` 不在结果里**：两份持有与三条配值都不带 `since`，调用方以读到这份文件的时刻补上（[S-27](contract.md#s-27-清单列的资产变成工作区那一格的持有)）。

> **`DropReason` 恰两种理由（`immutable_flag`、`unknown_asset`），本场景两种都出现**：权限项与落点类的配值由 E-1 的 `workspace_permission` 与 `workspace_placement` 留痕；**`FilterReason` 里没有 `immutable` 那一种**——它只在这里丢一次（2026-09-24 删去 `workspace_immutable`）。

---

## E-4 换了实现，设置不跟过去，权限的约束跟过去

对应 [S-36](contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)。**五支同跑。**五支的 `tool:shell` 都另有 `version = 1`、`resident = true`，略；每份持有的 `versionSelection` 都是 `current`。

**共同输入**：`tenant`、`standing` 同 E-1；无 `workspace`、无 `session`；`root` = `{ definition: agent_definition:helper3, references: [ {capability: tool:shell, resident: true} ] }`。
definitions：`ast_off_helper3`（`agent_definition:helper3`，official，引用 `tool:shell`（标常驻）——就是输入的 `root.references`）；
`ast_off_shell`、`ast_t_shell` 同 E-1——**`ast_t_shell` 没有声明 `network`**。

| 支 | holdings（五支都另有 f：`agent_definition:helper3 → ast_off_helper3`、f：`tool:shell → ast_off_shell`） |
|---|---|
| **A 不锁替换** | org：`tool:shell → ast_off_shell`，锁 **否**，`timeout_s = 120` 🔒、`execution = {问一下}` 🔒、`network = {允许}` 🔒；tenant：`tool:shell → ast_t_shell`，**不带配值** |
| **B 组织锁替换** | 同 A，唯一的差别：org 那份持有的锁为 **是** |
| **C 锁住的档又被改了** | 同 A，唯一的差别：tenant 那份持有指向 **`ast_off_shell`**（为配值而持有出厂那一份，不是替换），`execution = {自动}`——组织加锁之前写下的那一条 |
| **D 不锁的「禁止」** | 同 C，唯一的差别：org 那份持有上的 `execution` 是 **`{禁止}`、不带锁** |
| **E 界内没人挑到** | 只有 f 那两份与 org：`tool:shell → ast_off_shell`，锁 **否**，只配 `execution = {问一下, 禁止}` 🔒；**这一支里 `ast_off_shell` 的 `execution` 声明默认是 `{自动}`**（其余声明同 E-1） |

**期望结果**（`root` 与 `assets` 里 `agent_definition:helper3` 那一条五支相同，略；五支的 `composition` 都恰是 `tool:shell`，`unresolved` 都为空；各支 `values` 里的 `(tool:shell, usableBy)` 都是 `{self}` · factory · —，略）：

| 支 | `tool:shell` 的 assets 条目 | `timeout_s` | `execution` | `network` | filteredOut |
|---|---|---|---|---|---|
| A | `ast_t_shell` · from tenant · replaced factory、organization | `45` · factory · — | `{问一下}` · factory · organization | `{}`（空集）· organization · organization | 空 |
| B | `ast_off_shell` · from organization · replaced 空 · lockedAt organization | `120` · organization · organization | `{问一下}` · factory · organization | `{允许}` · organization · organization | `(tool:shell, tenant, locked_below)` |
| C | `ast_off_shell` · from tenant · replaced 空 | `120` · organization · organization | `{问一下}` · factory · organization | `{允许}` · organization · organization | 空 |
| D | `ast_off_shell` · from tenant · replaced 空 | `120` · organization · organization | **`{禁止}` · organization · organization** | `{允许}` · organization · organization | 空 |
| E | `ast_off_shell` · from organization · replaced 空 | `60` · factory · — | **`{问一下}` · organization · organization** | `{禁止}` · factory · — | 空 |

值的写法是 `value · from · lockedAt`。
五支 `execution` 的 `tenantAutoWritable` 都为**假**：A、B、C 支组织锁住 `{问一下}`，D 支组织配了不锁的 `{禁止}`，E 支组织锁住 `{问一下, 禁止}`——组织那一格给的界都不含「自动」（[S-42](contract.md#s-42-执行权限项另带租户那一层写得进自动吗) 第 3 条）。`network` 不是执行权限，不带它。

**五支合起来说的是**：

- **A——设置不跟过去，权限的界跟过去**：组织锁住的 `timeout_s = 120` 挂在指向出厂那一份的持有上，租户换了实现就不在新实现的链上，取 `ast_t_shell` 声明的 `45`（[S-22](contract.md#s-22-第四步设置) 代价那一段）；
  组织锁住的 `execution = {问一下}` 却是界，按能力标识约束新实现：`X = {问一下}`；界不同时是挑选，最里一条落在界内的挑选是新实现 `ast_t_shell` 的声明默认值 `{问一下}` ⇒ `from = factory`、`lockedAt = organization`（[S-23](contract.md#s-23-第四步权限)）。
  **`ast_t_shell` 没有 `network` 这一项**，组织锁住的 `{允许}` 也不算数：外层锁过、替换件缺的项取最严，表外项的最严值是空集，`{} ∩ {允许}` = 空集。
  **组织那条若不带锁**，它只是一条挑选——挑选不造出项，`network` 就不在 `values` 里。
- **B——锁替换是设置那一侧的杠杆**：租户那份以 `locked_below` 退出，**不在效，既不给界也不给挑选**；生效的是组织配过值的那一份，组织的设置与权限都照常生效。
  `network` 的界是组织锁住的 `{允许}`；声明默认值 `{禁止}` 这条挑选与界不交，被跳过，再没有别的挑选 ⇒ 值取界 `{允许}`，`from` 是给了界的那一格（`network` 不是分档的权限，[S-23](contract.md#s-23-第四步权限) 合成第 3 条）。
- **C——锁住的档被下层改过**：租户那条 `{自动}` 本该在组织加锁时被写入面挡住；它仍在输入里，它是一条**与界不交的挑选**，被跳过；再往外是作者默认 `{问一下}`，落在界内——
  值是 `{问一下}`，**不是空集**，与产品原话「[组织锁死『问一下』，成员改不了](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)」一致（账本 S10-b；原 G-16 闭合）。
- **D——不锁的「禁止」照样是界**（PF-002 rev 17 §5.3）：组织那条 `{禁止}` 没带锁，照一般的挑选读它会被租户的 `{自动}` 覆盖；它是执行权限上的 `{forbid}`，所以是界：`X = {禁止}`，租户的 `{自动}` 与作者默认 `{问一下}` 都不落在界内，界内只有一档 ⇒ `{禁止}`，`from`、`lockedAt` 都是 organization。
- **E——界内没人挑到，取离作者默认最近的一档**（PF-002 rev 17 §5.3 与 acceptance「作者声明的默认是『自动』，也没有哪一层在界内挑过」那一行）：`X = {问一下, 禁止}`，唯一的挑选是作者默认 `{自动}`，不落在界内；
  档序 `自动 → 问一下 → 禁止`，离「自动」一格的是「问一下」、两格的是「禁止」⇒ **`{问一下}`**，不是更严的「禁止」，也**不是**两档的 `{问一下, 禁止}`；`from` 是给了界的 organization。

---

## E-5 不合法的输入

对应 [S-37](contract.md#s-37-输入不合法时整体拒绝)。以 E-1 的输入为底，**每一份只改一处**：

| # | 改了什么 | 违反 | 期望 |
|---|---|---|---|
| 1 | `h3` 的 holder 换成租户 `{org_acme, acc_bob}` | [S-7](contract.md#s-7-输入的一致性条件) C3：别的租户的持有 | `invalidInput` |
| 2 | `workspace` 的租户那一半换成 `{org_other, acc_alice}` | C3：工作区键的租户那一半 ≠ `tenant` | `invalidInput` |
| 3 | `h5` 加一条 `disabled = 真`（它指向官方件 `ast_off_shell`） | C7：官方件不可禁用 | `invalidInput` |
| 4 | `root.definition` 换成 `tool:shell` | C2：根不是 Agent Definition | `invalidInput` |
| 5 | 从 `definitions` 里拿掉 `ast_t_audit` | C5：`h8` 指向的资产没有定义 | `invalidInput` |
| 6 | `h4` 加一条配值 `timeout_s = 90` | C6：出厂那一格不带配值 | `invalidInput` |
| 7 | `h6` 的 `execution` 改成 `{"allowed": ["yolo"]}` | C10：允许集合不是声明枚举的子集 | `invalidInput` |
| 8 | `standing` 换成 `ineffective` | C12：求值只对有效成员有定义 | `invalidInput` |
| 9 | `root` 只给 `definition`，**没有 `references`** | C1：`references` 必需，缺席不是「根不引用任何东西」（[S-12](contract.md#s-12-缺席时的默认答案)） | `invalidInput` |
| 10 | `root.references` 里 `mcp:github` 那一条加 `resident: true` | C14：常驻标记只出现在引用 `tool`、`skill` 的那几条上 | `invalidInput` |

**必须观察到**：每一份都以 `invalidInput` 失败，**不返回任何 `EffectiveAssembly`**——
既不是半份，也不是五个空集合（[S-13](contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果)）。

---

## E-6 判下来用不了的退回下一层

对应 [S-41](contract.md#s-41-判下来用不了的退回下一层)。**六支同跑**；产品原话是 [PF-002 acceptance §一](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)「成员乙写了一个 tool，组织持有了它」那三行。

**共同输入**：`standing` = `effective`、角色 `member`；无 `workspace`、无 `session`；`root` = `{ definition: agent_definition:helper6, references: [ {capability: tool:fmt} ] }`；每份持有的 `versionSelection` 都是 `current`，每份定义都只有第 1 版；`disabled` 都不为真。
`tenant` 按支给：**乙** = `{"organization": "org_acme", "account": "acc_bob"}`，**甲** = `{"organization": "org_acme", "account": "acc_alice"}`。

| 记录号 | 能力标识 | 来源 | 所有者 · 作者 | 引用 | 属性项 |
|---|---|---|---|---|---|
| `ast_off_helper6` | `agent_definition:helper6` | official | — | `tool:fmt`（未标常驻；就是输入的 `root.references`） | 只有保留项 |
| `ast_off_fmt` | `tool:fmt` | official | — | — | 只有保留项 |
| `ast_org_fmt` | `tool:fmt` | customized | 组织 `org_acme` · 作者 `org_acme`/`acc_bob`（乙写的） | — | 只有保留项 |
| `ast_t_fmt` | `tool:fmt` | customized | 租户 `org_acme`/`acc_alice` · 作者同一个租户 | — | 只有保留项 |

| 支 | `tenant` | holdings（六支都另有 f：`agent_definition:helper6 → ast_off_helper6`） |
|---|---|---|
| **A 作者本人求** | 乙 | f：`tool:fmt → ast_off_fmt`；org：`tool:fmt → ast_org_fmt`，锁否，无配值 |
| **B 别的成员求，有同名 official** | 甲 | 同 A |
| **C 别的成员求，没有同名 official** | 甲 | 同 A，唯一的差别：没有 f：`tool:fmt` 那一份 |
| **D 组织配上 `member`** | 甲 | 同 A，唯一的差别：org 那份持有配 `usableBy = {member}`（不锁） |
| **E 组织锁了替换，租户有自己那份** | 甲 | 同 A，另加两处：org 那份持有的锁为 **是**；tenant：`tool:fmt → ast_t_fmt`，锁否，无配值 |
| **F 同 E，「谁可以使用它」也锁上** | 甲 | 同 E，唯一的差别：org 那份持有配 `usableBy = {superAdministrator, member}` 🔒 |

**期望结果**（`root` 与 `assets` 里 `agent_definition:helper6` 那一条六支相同：`from` factory，略；它是组合根，不在 `composition` 里，`values` 里没有它的项；`tool:fmt` 在 `assets` 里时 `version` 1、`resident` `false`，`composition` 恰是 `tool:fmt`）：

| 支 | 第一步之二怎么判 | `tool:fmt` 的 assets 条目 | `(tool:fmt, usableBy)` 值 · from · lockedAt | filteredOut | unresolved |
|---|---|---|---|---|---|
| A | org 那份：`U = {self}`（声明默认值），`self` = 作者乙 = `tenant` ⇒ 用得了 | `ast_org_fmt` · from organization · replaced factory | `{self}` · factory · — | 空 | 空 |
| B | org 那份：`U = {self}`，`self` 是乙、不是甲，`member` 不在值里 ⇒ **用不了**；f 那份是 official，不判 | `ast_off_fmt` · from factory · replaced 空 | `{self}` · factory · —（official 的声明默认值；没有拿它判） | `(tool:fmt, organization, not_usable)` | 空 |
| C | 同 B | **不在 `assets` 里**；`composition` **为空** | —（不在 `composition` 里） | `(tool:fmt, organization, not_usable)` | `{ tool:fmt, referencedBy: agent_definition:helper6 }` |
| D | org 那份：最里一条挑选是组织配的 `{member}` ⇒ `U = {member}`，甲的角色在里面 ⇒ 用得了 | `ast_org_fmt` · from organization · replaced factory | `{member}` · organization · — | 空 | 空 |
| E | org 那份：`U = {self}`，乙不是甲 ⇒ **用不了**；tenant 那份：`U = {self}`，作者就是甲 ⇒ 用得了 | `ast_t_fmt` · from tenant · replaced factory · **`lockedAt` 缺席** | `{self}` · factory · — | `(tool:fmt, organization, not_usable)` | 空 |
| F | org 那份：界 `{superAdministrator, member}`；唯一的挑选是声明默认值 `{self}`，与界不交 ⇒ 没有挑选落在界内，这一项不分档 ⇒ `U` 取界 `{superAdministrator, member}`，甲是 `member` ⇒ 用得了；tenant 那份同样用得了 | `ast_org_fmt` · from organization · replaced factory · lockedAt organization | `{superAdministrator, member}` · organization · organization | `(tool:fmt, tenant, locked_below)` | 空 |

**六支合起来说的是**：

- **A、B——同一份持有，换一个人求**：「自己」按每一份的作者判；组织换上一份只给乙用的实现，**拿不走甲手里的 official**——B 的 `tool:fmt` 退回出厂那一份，不是消失。
- **C——没有下一层可退**：这个标识一份都没剩下，进 `unresolved`；装配拿到它怎么收场归 [S-31](contract.md#s-31-unresolved-交到装配手上怎么收场)。
- **D、B——收回是两份输入**：组织把 `member` 从这份的「谁可以使用它」里拿掉，就是从 D 变成 B。哪一次运行用哪一份结果（已开始的运行不变、下一次运行起按 B）归消费者（[S-39](contract.md#s-39-谁可以使用它值与判定) 末段）。
- **E——锁随被滤掉的那份一起不起作用**：组织锁了替换，但甲用不了组织那份，它在替换次序上视为不存在，锁也就不在；剩下的里最具体的是甲自己那份（[S-39](contract.md#s-39-谁可以使用它值与判定) 末段的后果）。
- **F——组织要挡 E，就把「谁可以使用它」也锁上**：锁住的 `{superAdministrator, member}` 是界，甲用得了组织那份，替换锁照常截断，甲那份以 `locked_below` 退出。

**绝不能观察到**：B、C、E 的 `assets` 里出现 `ast_org_fmt`（「判下来用不了的，装进了他的会话」）；B 的 `tool:fmt` 不在 `assets` 里（组织因此拿走了 official）——[PF-002 acceptance §二](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#二绝不能发生的事)那两行。

---

## E-7 成环即拒，并指出环在哪

对应 [S-43](contract.md#s-43-成环即拒并指出环在哪)（主线裁定 [D-040 §八 M31、M32](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。**三支同跑**；产品原话是 [PF-002 谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)规则 2 与 [flows §二](../../../../product/PF-002-assets-settings-and-permissions/flows.md#二分支与异常)「成环时拒绝并指出环在哪」。

**共同输入**：`tenant`、`standing` 同 E-1；无 `workspace`、无 `session`、无 `mcpActionSets`；每份持有的 `versionSelection` 都是 `current`，每份定义都只有第 1 版。

| 记录号 | 能力标识 | 来源 | 所有者 · 作者 | 引用 | 属性项 |
|---|---|---|---|---|---|
| `ast_t_helper7` | `agent_definition:helper7` | customized | 租户 `org_acme`/`acc_alice` · 作者同一个租户 | （照抄各支输入的 `root.references`） | 只有保留项 |
| `ast_off_format` | `tool:format` | official | — | `skill:style`（tool 声明的配套 skill） | 只有保留项 |
| `ast_off_style` | `skill:style` | official | — | `tool:format`（skill 声明要用的 tool） | 只有保留项 |

| 支 | `root` | holdings（三支都有 f：`tool:format → ast_off_format`、f：`skill:style → ast_off_style`） |
|---|---|---|
| **A 根把自己当 sub-agent** | `{ definition: agent_definition:helper7, references: [ {capability: tool:format}, {capability: agent_definition:helper7} ] }` | t：`agent_definition:helper7 → ast_t_helper7`，`disabled` 否 |
| **B 只有 Skill⇄Tool 那一对来回** | `{ definition: agent_definition:helper7, references: [ {capability: skill:style} ] }` | 同 A |
| **C 根被禁用** | 同 A | 同 A，唯一的差别：t 那份持有 `disabled` 为**是** |

**期望结果**：

| 支 | 结果 |
|---|---|
| A | **`compositionCycle`**，诊断 `cycle` = `[agent_definition:helper7]`（根的引用直接指回根，k = 1）。**不返回任何 `EffectiveAssembly`**——`tool:format`、`skill:style` 两个求得出的也不交出来 |
| B | **成功**。`root`：`agent_definition:helper7`；`assets`：`agent_definition:helper7 → ast_t_helper7` · from tenant · replaced 空，`tool:format → ast_off_format` · from factory，`skill:style → ast_off_style` · from factory（两者 `version` 1、`resident` `false`）；`composition`：`skill:style`、`tool:format`，**各一次**；`values`：`(skill:style, usableBy, {self}, factory)`、`(tool:format, usableBy, {self}, factory)`；`filteredOut`、`unresolved` 都为空 |
| C | **成功**。`root`：`agent_definition:helper7`；`assets`：`tool:format → ast_off_format`、`skill:style → ast_off_style`（都 from factory，不在 `composition` 里，`resident` 缺席）；`composition`：**空**；`values`：空；`filteredOut`：`(agent_definition:helper7, tenant, disabled)`；`unresolved`：恰一条 `{ capability: agent_definition:helper7 }`，**`referencedBy` 缺席** |

**三支合起来说的是**：

- **A——成环是判出来的失败，不是坏输入**：[S-7](contract.md#s-7-输入的一致性条件) 的十四条都成立（引用列表里同一标识只出现一次、没有常驻标记），环在第 2 步沿引用走回路径上已有的 `agent_definition:helper7` 时判出（[S-15](contract.md#s-15-evaluate) ⑥ 与其后一段）；环以外求得出的那一部分**不当作完整构成交出**。
  指回根的那一条同时是「根以外被引用到的 `agent_definition`」，却**不报 `categoryUnsupported`**：判定次序里 `compositionCycle` 在前（[S-13](contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 末段；[E-8](#e-8-读不了正文的一类即拒) D 支是两者都在的另一种形状）。
  诊断 `cycle` 只作说明呈现，消费者不据它作判定（[S-11](contract.md#s-11-纯计算) 的例外）。
- **B——Skill 与 Tool 互引不算环**：那张表允许的那一对来回，可达集合照常求得出（[PF-002 谁能组合谁](../../../../product/PF-002-assets-settings-and-permissions/design.md#谁能组合谁)规则 2）。
- **C——根不可见就不往下走**：根没有生效资产，它的引用无从生效（[S-20](contract.md#s-20-第二步组装) 首段），指回根的那条引用没有被走到，也就没有环；这份结果交给装配，[装配明确失败](contract.md#s-31-unresolved-交到装配手上怎么收场)。

**绝不能观察到**：A 支返回一份结果（哪怕 `composition` 看起来齐全），或报 `invalidInput`、`categoryUnsupported`；B 支报 `compositionCycle`，或 `composition` 里同一标识出现两次；C 支报 `compositionCycle`。

---

## E-8 读不了正文的一类即拒

对应 [S-44](contract.md#s-44-读不了正文的一类即拒)（主线裁定 [D-040 §八 M45](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。**四支同跑**：本版 `plugin` 与根以外的 `agent_definition` 没有正文规则（[S-10](contract.md#s-10-各类正文契约须供的两条规则) 末段，[G-3](contract.md#十一已知缺口)、[G-21](contract.md#十一已知缺口)），第 2 步走到它们的生效资产即以 `categoryUnsupported` 失败。

**共同输入**：`tenant`、`standing` 同 E-1；无 `workspace`、无 `session`、无 `mcpActionSets`；每份持有的 `versionSelection` 都是 `current`，每份定义都只有第 1 版。

| 记录号 | 能力标识 | 来源 | 所有者 · 作者 | 引用 | 属性项 |
|---|---|---|---|---|---|
| `ast_off_helper8` | `agent_definition:helper8` | official | — | （照抄各支输入的 `root.references`） | 只有保留项 |
| `ast_off_reviewer` | `agent_definition:reviewer` | official | — | **本契约拿不到**（G-3） | **本契约推不出**（G-21） |
| `ast_t_bundle` | `plugin:bundle` | customized | 租户 `org_acme`/`acc_alice` · 作者同一个租户 | **成员与「启用哪些成员」本契约推不出**（G-21） | 同左 |
| `ast_off_fmt8` | `tool:fmt8` | official | — | — | 只有保留项 |

| 支 | `root` | holdings（四支都有 f：`agent_definition:helper8 → ast_off_helper8`、f：`tool:fmt8 → ast_off_fmt8`） |
|---|---|---|
| **A 走到 sub-agent** | `{ definition: agent_definition:helper8, references: [ {capability: tool:fmt8}, {capability: agent_definition:reviewer} ] }` | 另有 f：`agent_definition:reviewer → ast_off_reviewer` |
| **B 走到 plugin** | `{ definition: agent_definition:helper8, references: [ {capability: tool:fmt8}, {capability: plugin:bundle} ] }` | 另有 t：`plugin:bundle → ast_t_bundle`，`disabled` 否 |
| **C plugin 被禁用** | 同 B | 同 B，唯一的差别：t 那份持有 `disabled` 为**是** |
| **D sub-agent 与环同在** | `{ definition: agent_definition:helper8, references: [ {capability: agent_definition:reviewer}, {capability: agent_definition:helper8} ] }` | 同 A |

**期望结果**：

| 支 | 结果 |
|---|---|
| A | **`categoryUnsupported`**，`category = agent_definition`。**不返回任何 `EffectiveAssembly`**——`tool:fmt8` 求得出也不交 |
| B | **`categoryUnsupported`**，`category = plugin`。**不返回任何 `EffectiveAssembly`** |
| C | **成功**。`root`：`agent_definition:helper8`；`assets`：`agent_definition:helper8 → ast_off_helper8` · from factory，`tool:fmt8 → ast_off_fmt8` · from factory（`version` 1、`resident` `false`）；`composition`：`tool:fmt8`；`values`：`(tool:fmt8, usableBy, {self}, factory)`；`filteredOut`：`(plugin:bundle, tenant, disabled)`；`unresolved`：`{ capability: plugin:bundle, referencedBy: agent_definition:helper8 }` |
| D | **`compositionCycle`**，诊断 `cycle` = `[agent_definition:helper8]`——**不是** `categoryUnsupported`，尽管 `agent_definition:reviewer` 也被走到 |

**四支合起来说的是**：

- **A、B——读不了就停，不猜**：sub-agent 的引用拿不到、plugin 启用了哪些成员推不出，这份组合的构成**判不出来**；不当作「它不引用任何东西」「全部启用」，也不把那一个从构成里拿掉、交出剩下的（[S-12](contract.md#s-12-缺席时的默认答案) 那一行、[S-13](contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 末段）。装配拿到它即明确失败（[S-31](contract.md#s-31-unresolved-交到装配手上怎么收场)）。
- **C——没被走到的不触发**：被禁用的 plugin 没有生效资产，进 `unresolved`，第 2 步不读它的正文；这份结果交给装配，照 S-31 按 `unresolved` 失败——**同样是失败，理由不同**，消费者据 `unresolved` 知道缺的是哪个标识。
- **D——判出来的先于判不出来的**：沿读得了的那部分已经走回根，这个环不论 `agent_definition:reviewer` 引用了什么都在（[S-13](contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果) 末段的判定次序）。

**绝不能观察到**：A、B 支返回一份结果（哪怕那一类不在 `composition` 里、其余看起来齐全），或报 `invalidInput`、`compositionCycle`；C 支报 `categoryUnsupported`；D 支报 `categoryUnsupported`。

---

## 附：E-1 的 `values` 逐项手算 `from`

**记号**：一格写出的值 = 这一格对这一项给出了参与合成的值（设置），或界与挑选（权限）；「—」= 不给，括号里写为什么。
设置按 `factory < organization < tenant < workspace < session` 由外到里，**只看指向生效资产的持有**，第一条带锁的截断，否则取最里面给了值的；出厂那一格也没有值时这一项不进 `values`（[S-22](contract.md#s-22-第四步设置)）；
权限**按能力标识**：组织、租户两格的在效持有（不论指向哪份资产）与会话格给值——**带锁的（以及执行权限上的 `{forbid}`）是界，其余不带锁的与声明默认值是挑选，界不同时是挑选**；`X` = 声明域 ∩ 各界，由里到外取第一条落在界内的挑选、值取它与 `X` 的交，没有就：分档的取界内离最具体那条挑选最近的一档，其余取 `X`（[S-23](contract.md#s-23-第四步权限)）；
工作区提供的资产的权限项以最严值为出厂那一格的界、那一格不给挑选（[S-25](contract.md#s-25-工作区提供的资产的权限项一律取最严值)）。

| # | 项 | factory | organization | tenant | workspace | session | 结果 · from · lockedAt |
|---|---|---|---|---|---|---|---|
| 1 | `assistant / default_model`（组合根的项） | —（**本契约推不出根的项**，[G-21](contract.md#十一已知缺口)） | `"model-b"` 🔒（`h2`）——不参与 | `"model-c"`（`h3`）——不参与 | —（没有持有） | — | **不求，不进 `values`**：根不在 `composition` 里（[S-8](contract.md#s-8-求值结果-effectiveassembly)）；这几条配值也不进 `filteredOut` |
| 2 | `assistant / tone`（组合根的项） | —（同上） | —（`h2` 没配这一项） | `"concise"`——不参与 | — | `"terse"`——不参与 | **不求**，同上 |
| 3 | `shell / timeout_s`（设置） | `45`（**生效资产 `ast_t_shell` 的**声明默认值，不是出厂那份的 `60`） | —（`h5` 指向 `ast_off_shell`，不是生效那份；它的 `120` 不参与） | —（`h6` 没配这一项） | — | — | `45` · factory · — |
| 4 | `shell / execution`（权限） | 无界；挑选 `{问一下}`（声明默认值） | —（`h5` 在效，但没配这一项） | 挑选 `{自动}`（不带锁） | 不在权限层序 | — | `X` = 声明域；最里的挑选 `{自动}` 落在界内 ⇒ `{自动}` · tenant · — |
| 5 | `audit / variant`（设置） | `"standard"` | `"strict"`（`h7` 就是生效那份；**持有**带锁，**配值**不带） | —（`h8` 已 `locked_below` 退出） | —（`h11` 已 `locked_below` 退出） | `"quick"` | `"quick"` · session · —（`h7` 锁的是替换，不是这一项的值，所以会话那一条压得过它） |
| 6 | `audit / usableBy`（权限，保留项） | 无界；挑选 `{self}`（保留声明的默认值） | —（`h7` 没配这一项） | —（`h8` 没配这一项；这一项在第一步就求，**锁以里的 `h8` 照样参与**，[S-39](contract.md#s-39-谁可以使用它值与判定) 第 1 条） | 不在权限层序 | — | `{self}` · factory · — |
| 7 | `github / connectionTarget`（设置·落点与身份） | `"https://mcp.repo-tools.invalid"`（**随资产一起来**的声明默认值） | —（没有持有） | —（`h9` 指向 `ast_t_github`） | `"https://evil.invalid"` ⇒ **滤掉**，`workspace_placement` | — | `"https://mcp.repo-tools.invalid"` · factory · —；`provenance` = workspace |
| 8 | `github / credential`（设置·落点与身份） | —（**没有声明默认值**） | — | —（`h9` 的 `"cref_alice_github"` 挂在别的资产上） | —（清单没配） | — | **不进 `values`**：未配即缺席 |
| 9 | `github / callTimeout`（设置） | `20` | — | —（`h9` 指向别的资产） | `10` | — | `10` · workspace · — |
| 10 | `github / execute:search`（权限） | 工作区提供的资产 ⇒ **界 = 最严值 `{问一下}`**；声明的 `{自动}` 不认，不作挑选 | —（没有持有） | 挑选 `{问一下, 自动}`（`h9` 指向被替换的 `ast_t_github`，**仍在效，按能力标识跟过去**；不带锁，不是界） | `{自动}` ⇒ **滤掉**，`workspace_permission` | — | `X = {问一下}`；租户的挑选与它相交 ⇒ `{问一下}` · tenant · — |
| 11 | `github / execute:push`（权限） | 同上 ⇒ 界 `{问一下}`，无挑选 | —（没有持有） | —（`h9` 没配这一项） | —（清单没配） | — | 没有挑选 ⇒ `X` = `{问一下}` · factory · — |
| 12 | `github / usableBy`（权限，保留项） | 工作区提供的资产 ⇒ 界 = 最严值 `{self}`，无挑选 | — | —（`h9` 没配这一项） | 不在权限层序 | — | `{self}` · factory · — |
| 13 | `assistant / usableBy`（权限，保留项；八类都有，2026-09-24） | 官方件，第一步之二不判（[S-39](contract.md#s-39-谁可以使用它值与判定)） | —（`h2` 没配这一项） | —（`h3` 没配这一项） | 不在权限层序 | —（会话对根只配了 `tone`） | **不进 `values`**：`(c, usableBy)` 只给 `composition` 里的生效资产（S-39 末段），根不在其中 |
| 14 | `shell / usableBy`（权限，保留项；同上） | 无界；挑选 `{self}` | —（`h5` 在效，但没配这一项） | —（`h6` 没配这一项） | 不在权限层序 | — | `{self}` · factory · — |

**核对要点**：十个 `from` 里**没有一个权限项是 `workspace`**（第 4、6、10、11、12、14 行），**没有一个落点与身份类设置项的值来自 `workspace` 的配值**（第 7、8 行；第 7 行的 `provenance` 是 workspace，因为那份资产是仓库带来的，不是因为仓库配了它）——
这两条正是 Alloy 断言 (iv)(iv′) 在这个实例上的样子（[formal 入口](formal/README.md)）。
第 3、8 行都**不是**「没人配过」：外层确实配过，但配在另一份资产上，**设置不跟过去**；
第 10 行反过来——`h9` 同样配在另一份资产上，它的挑选**跟过去了**，`from = tenant`。**设置按资产、权限按能力标识，分界就在这三行**（[S-22](contract.md#s-22-第四步设置)、[S-23](contract.md#s-23-第四步权限)）。
