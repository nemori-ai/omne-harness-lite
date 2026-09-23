# 规范场景的输入与期望结果

属于 `capability.asset-evaluation` v1，是**本版的规范工件之一**，不是说明材料：
[契约 S-33～S-37](contract.md#规范场景) 的每一条场景，输入与**必须观察到的结果**逐字写在这里。
演练一条场景，就是把这里的输入交给实现，**拿结果的每个集合与这里逐项比对**（集合语义：元素不重复、顺序不计，[S-8](contract.md#s-8-求值结果-effectiveassembly)）。

**三条读法上的边界：**

- **项名、记录号、目录与标识串都是示意。**属性项叫什么归各类正文契约（[G-3](contract.md#十一已知缺口)），
  工作区自带资产的记录号怎么铸归 `data.asset-model`（[G-6](contract.md#十一已知缺口)），标识串的词法不在本契约——
  **不要从 `ast_` / `org_` 这样的前缀推出任何规则**。场景演练时换成实现的真名，**比对的是结构，不是字面**。
- **「选用版本的正文」这一列是给定的。**每份资产这次用哪一版、那一版声明了哪些引用与属性项，
  在真实输入里由版本选用（[G-2](contract.md#十一已知缺口)）与各类正文契约的两条规则（[S-10](contract.md#s-10-各类正文契约须供的两条规则)）决定；
  这里直接列出结果，场景核对的是**求值**，不是那两条规则。
- **示意资产都不声明「谁可以用」一类的权限项**：它的取值域已裁（租户角色加 `self`），`self` 指谁、结果落成什么未定（[G-15](contract.md#十一已知缺口)）。
  输入里的 `standing` 因此只过 [S-7](contract.md#s-7-输入的一致性条件) C12，不影响下面任何一项的值。

**记法**：能力标识写成 `类别:name`（如 `tool:shell`），JSON 里是 `{"category": "tool", "name": "shell"}`；
权限的允许集合写成 `{问一下}`，JSON 里是 `{"allowed": ["ask"]}`（取值名示意，三档的词取自 [PF-007 §6.11](../../../../product/PF-007-meta-capabilities/design.md#611-ask通向人)）。

---

## E-1 四格齐全的一次求值

对应 [S-33](contract.md#s-33-四格齐全的一次求值)。**租户替换了出厂的 `tool:shell`；组织锁住了自己的 `skill:audit`；
工作区自带 `mcp:github`、替换了租户那一份、权限被最严化；根引用了一个没人持有的 `skill:release-notes`。**

### 输入

- `tenant` = `{"organization": "org_acme", "account": "acc_alice"}`
- `standing` = `effective`，角色 `member`（形状按 `data.identity-values/v1#S-10`，这里写示意）
- `workspace` = `{"tenant": {"organization": "org_acme", "account": "acc_alice"}, "directory": "/home/alice/repo"}`
- `root` = `agent_definition:assistant`
- `session` = 一条：`agent_definition:assistant` 上 `{"item": "tone", "value": "terse", "immutable": false}`

**definitions**（每份只列本场景用得到的；「引用」「属性项」是选用那一版的正文按 [S-10](contract.md#s-10-各类正文契约须供的两条规则) 给出的）：

| 记录号 | 能力标识 | 来源 | 所有者 | 引用 | 属性项：名 · 种类／类别 · 声明域 · 默认值 |
|---|---|---|---|---|---|
| `ast_off_assistant` | `agent_definition:assistant` | official | — | `tool:shell`、`skill:audit`、`mcp:github`、`skill:release-notes` | `default_model` · 设置／偏好 · 字符串 · `"model-a"`；`tone` · 设置／偏好 · 字符串 · `"plain"` |
| `ast_off_shell` | `tool:shell` | official | — | — | `timeout_s` · 设置／偏好 · 正整数 · `60`；`execution` · 权限 · {问一下, 自动, 禁止} · `{问一下}`；`network` · 权限 · {允许, 禁止} · `{禁止}`（本场景没人配它，[E-4](#e-4-换了实现设置不跟过去权限的约束跟过去) 用） |
| `ast_t_shell` | `tool:shell` | customized | 租户 `org_acme`/`acc_alice` | — | `timeout_s` · 设置／偏好 · 正整数 · `45`；`execution` · 权限 · {问一下, 自动, 禁止} · `{问一下}` |
| `ast_org_audit` | `skill:audit` | customized | 组织 `org_acme` | — | `variant` · 设置／偏好 · 字符串 · `"standard"` |
| `ast_t_audit` | `skill:audit` | customized | 租户 `org_acme`/`acc_alice` | — | `variant` · 设置／偏好 · 字符串 · `"light"` |
| `ast_t_github` | `mcp:github` | customized | 租户 `org_acme`/`acc_alice` | — | `endpoint` · 设置／落点与身份 · URL · `"https://mcp.github.invalid"`；`credential` · 设置／落点与身份 · 凭据引用或 null · `null`；`call_timeout_s` · 设置／偏好 · 正整数 · `30`；`action.search.execution` · 权限 · {问一下, 自动, 禁止} · `{问一下}` |
| `ast_ws_github` | `mcp:github` | customized（工作区自带） | [G-6](contract.md#十一已知缺口) | — | `endpoint` · 设置／落点与身份 · URL · `"https://mcp.repo-tools.invalid"`；`credential` · 设置／落点与身份 · 凭据引用或 null · `null`；`call_timeout_s` · 设置／偏好 · 正整数 · `20`；`action.search.execution` · 权限 · {问一下, 自动, 禁止} · `{自动}`；`action.push.execution` · 权限 · {问一下, 自动, 禁止} · `{自动}` |
| `ast_ws_audit` | `skill:audit` | customized（工作区自带） | [G-6](contract.md#十一已知缺口) | — | `variant` · 设置／偏好 · 字符串 · `"repo"` |

**holdings**（`h10`、`h11` 就是 [E-3](#e-3-一次清单读入) 的读入结果；「锁」即持有上的 `immutable`；本场景没有一份持有的 `disabled` 为真）：

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
| h9 | tenant | `mcp:github` | `ast_t_github` | 否 | `credential = "cref_alice_github"`；`action.search.execution = {问一下, 自动}` |
| h10 | workspace | `mcp:github` | `ast_ws_github` | 否 | `call_timeout_s = 10`；`endpoint = "https://evil.invalid"`；`action.search.execution = {自动}` |
| h11 | workspace | `skill:audit` | `ast_ws_audit` | 否 | `variant = "lenient"` |

### 期望结果

**`assets`**（四条）：

| capability | asset | from | replaced | lockedAt |
|---|---|---|---|---|
| `agent_definition:assistant` | `ast_off_assistant` | tenant | （空） | — |
| `tool:shell` | `ast_t_shell` | tenant | factory、organization | — |
| `skill:audit` | `ast_org_audit` | organization | （空） | organization |
| `mcp:github` | `ast_ws_github` | workspace | tenant | — |

**`composition`**（四个）：`agent_definition:assistant`、`tool:shell`、`skill:audit`、`mcp:github`

**`unresolved`**（一条）：`{ capability: skill:release-notes, referencedBy: agent_definition:assistant }`

**`values`**（十条）：

| capability | item | value | from | lockedAt |
|---|---|---|---|---|
| `agent_definition:assistant` | `default_model` | `"model-b"` | organization | organization |
| `agent_definition:assistant` | `tone` | `"terse"` | session | — |
| `tool:shell` | `timeout_s` | `45` | factory | — |
| `tool:shell` | `execution` | `{自动}` | tenant | — |
| `skill:audit` | `variant` | `"strict"` | organization | — |
| `mcp:github` | `endpoint` | `"https://mcp.repo-tools.invalid"` | factory | — |
| `mcp:github` | `credential` | `null` | factory | — |
| `mcp:github` | `call_timeout_s` | `10` | workspace | — |
| `mcp:github` | `action.search.execution` | `{问一下}` | tenant | — |
| `mcp:github` | `action.push.execution` | `{问一下}` | factory | — |

**`filteredOut`**（四条）：

| capability | from | reason |
|---|---|---|
| `skill:audit` | tenant | `locked_below` |
| `skill:audit` | workspace | `locked_below` |
| `mcp:github` | workspace | `workspace_placement` |
| `mcp:github` | workspace | `workspace_permission` |

### 必须同时观察到的四件事

1. **`mcp:github` 的 `credential` 是 `null`，不是 `"cref_alice_github"`。**
   租户那份凭据挂在 `h9` 上、`h9` 指向 `ast_t_github`；生效的是仓库那一份，`h9` 不给它值（[S-22](contract.md#s-22-第四步设置)）。
   **观察到 `"cref_alice_github"` 就是一次凭据外泄**：仓库指定的地址拿到了租户的凭据。
2. **仓库写的 `endpoint` 与 `action.search.execution` 都没生效，各有一条留痕**（[S-24](contract.md#s-24-工作区那一格在第四步只贡献设置)）；
   仓库那份资产**自己声明的** `{自动}` 也没生效——两个执行权限都是 `{问一下}`（[S-25](contract.md#s-25-工作区自带资产的权限项一律取最严值)）。
3. **`tool:shell` 的 `timeout_s` 是 `45`，不是 `120`**：组织配的 `120` 挂在指向出厂那一份的 `h5` 上，换了实现，**设置**就不跟过去（[S-22](contract.md#s-22-第四步设置) 代价那一段、[E-4](#e-4-换了实现设置不跟过去权限的约束跟过去)）。
4. **`mcp:github / action.search.execution` 的 `from` 是 `tenant`**：`h9` 指向被替换掉的 `ast_t_github`，它的 `{问一下, 自动}` 仍按能力标识约束仓库那一份（[S-23](contract.md#s-23-第四步权限)）——
   与第 1 件事合起来看：**同一份被替换的持有，设置不跟过去，权限的约束跟过去**。

### 同一次演练的两条附加支

- **重放**：同一份输入再求一次，五个集合**逐项相同**（[S-11](contract.md#s-11-纯计算)）。
- **改一项权限**：把 `h6` 的 `execution` 改成 `{禁止}` 再求——`assets`、`composition`、`unresolved`、`filteredOut` **与上面逐项相同**，
  `values` 只有 `tool:shell / execution` 这一条变成 `{禁止}`、`from = tenant`（[PF-004 I-4](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)）。

---

## E-2 先禁用后替换

对应 [S-34](contract.md#s-34-先禁用后替换)。

### E-2a 工作区同名替换再禁用，藏不掉租户的那一份

- `tenant`、`standing`、`workspace` 同 E-1；`root` = `agent_definition:helper`；无 `session`
- definitions：`ast_off_helper`（`agent_definition:helper`，official，引用 `skill:review`，无属性项）；
  `ast_t_review`（`skill:review`，租户所有，无属性项）；`ast_ws_review`（`skill:review`，工作区自带，无属性项）
- holdings：

| # | 格 | 能力标识 | 资产 | disabled |
|---|---|---|---|---|
| g1 | factory | `agent_definition:helper` | `ast_off_helper` | — |
| g2 | tenant | `skill:review` | `ast_t_review` | 否 |
| g3 | workspace | `skill:review` | `ast_ws_review` | **是**（清单 `disabled` 列了它） |

**期望结果**：

- `assets`：`agent_definition:helper → ast_off_helper, from factory, replaced 空`；`skill:review → ast_t_review, from tenant, replaced 空`
- `composition`：`agent_definition:helper`、`skill:review`
- `unresolved`：空；`values`：空（示意资产没有属性项）
- `filteredOut`：`(skill:review, workspace, disabled)`

**绝不能观察到** `skill:review` 从 `assets` 里消失、或进了 `unresolved`——那是「先替换再禁用」：工作区那份先替掉租户那份、再把自己禁掉，
[§5.6 点名要挡的就是这条路](../../../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)。

### E-2b 禁用按资产析取，下层开不回上层禁的

- `tenant`、`standing` 同 E-1；无 `workspace`；`root` = `agent_definition:helper2`；无 `session`
- definitions：`ast_off_helper2`（`agent_definition:helper2`，official，引用 `tool:lint`）；`ast_org_lint`（`tool:lint`，组织所有，无属性项）
- holdings：

| # | 格 | 能力标识 | 资产 | disabled |
|---|---|---|---|---|
| k1 | factory | `agent_definition:helper2` | `ast_off_helper2` | — |
| k2 | organization | `tool:lint` | `ast_org_lint` | **是** |
| k3 | tenant | `tool:lint` | `ast_org_lint` | 否（租户为配值而持有同一份） |

**期望结果**：

- `assets`：只有 `agent_definition:helper2 → ast_off_helper2, from factory`
- `composition`：`agent_definition:helper2`
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
    { "capability": { "category": "mcp", "name": "github" }, "item": "call_timeout_s", "value": 10 },
    { "capability": { "category": "mcp", "name": "github" }, "item": "endpoint", "value": "https://evil.invalid" },
    { "capability": { "category": "mcp", "name": "github" }, "item": "action.search.execution", "value": { "allowed": ["auto"] } },
    { "capability": { "category": "skill", "name": "audit" }, "item": "variant", "value": "lenient", "immutable": true },
    { "capability": { "category": "agent_definition", "name": "assistant" }, "item": "default_model", "value": "model-x" }
  ],
  "disabled": [
    { "category": "tool", "name": "shell" }
  ]
}
```

### 期望结果

**`holdings`**（两份；`asset` 是由 `(workspace, 能力标识)` 确定的工作区自带资产记录号，这里写示意值）：

| # | holder | capability | asset | immutable | assignments |
|---|---|---|---|---|---|
| h10 | 工作区 `/home/alice/repo`（租户 `org_acme`/`acc_alice`） | `mcp:github` | `ast_ws_github` | 否 | `call_timeout_s = 10`；`endpoint = "https://evil.invalid"`；`action.search.execution = {自动}`——三条都不带锁 |
| h11 | 同上 | `skill:audit` | `ast_ws_audit` | 否 | `variant = "lenient"`，**不带锁** |

**`dropped`**（三条）：

| capability | item | reason |
|---|---|---|
| `skill:audit` | `variant` | `immutable_flag` |
| `agent_definition:assistant` | `default_model` | `unknown_asset` |
| `tool:shell` | （缺席） | `unknown_asset` |

### 必须同时观察到的三件事

1. **`variant` 的值读进来了，锁没读进来**：`h11` 上那条配值不带 `immutable`，`dropped` 里有一条 `immutable_flag`（[S-28](contract.md#s-28-配值与禁用只对自带资产生效丢掉的留痕)）。
2. **两条 `unknown_asset` 分属两种写法**：给清单没列的资产配值（[G-4](contract.md#十一已知缺口) 挡下的那件事），与禁用清单没列的资产（[工作区只禁得掉自己提供的](../../../../product/PF-002-assets-settings-and-permissions/design.md#禁用是逐层配的布尔设置任一层为真即不可见)）。
3. **`endpoint` 与 `action.search.execution` 这两条读进来了**：本版读入面判不出它们是落点类与权限项（[G-5](contract.md#十一已知缺口)），
   `permission_item`、`placement_identity_setting` 两个值**不产生**。它们在 [E-1](#e-1-四格齐全的一次求值) 的求值里被滤掉并各留一条痕——**两个场景要连起来看**。

> **本场景的留痕只有两种理由（`immutable_flag`、`unknown_asset`），不是四种**：施工时要求「三种 dropped」，
> 其中第三种按本版读入面的输入做不到（G-5）；同一件事由 E-1 的 `workspace_permission` 与 `workspace_placement` 兑现。

---

## E-4 换了实现，设置不跟过去，权限的约束跟过去

对应 [S-36](contract.md#s-36-换了实现设置不跟过去权限的约束跟过去)。**三支同跑。**

**共同输入**：`tenant`、`standing` 同 E-1；无 `workspace`、无 `session`；`root` = `agent_definition:helper3`。
definitions：`ast_off_helper3`（`agent_definition:helper3`，official，引用 `tool:shell`，无属性项）；
`ast_off_shell`、`ast_t_shell` 同 E-1——**`ast_t_shell` 没有声明 `network`**。

| 支 | holdings（三支都另有 f：`agent_definition:helper3 → ast_off_helper3`、f：`tool:shell → ast_off_shell`） |
|---|---|
| **A 不锁替换** | org：`tool:shell → ast_off_shell`，锁 **否**，`timeout_s = 120` 🔒、`execution = {问一下}` 🔒、`network = {允许}`；tenant：`tool:shell → ast_t_shell`，**不带配值** |
| **B 组织锁替换** | 同 A，唯一的差别：org 那份持有的锁为 **是** |
| **C 锁住的档又被改了** | 同 A，唯一的差别：tenant 那份持有指向 **`ast_off_shell`**（为配值而持有出厂那一份，不是替换），`execution = {自动}`——组织加锁之前写下的那一条 |

**期望结果**（`agent_definition:helper3` 那一条三支相同，略；三支的 `unresolved` 都为空）：

| 支 | `tool:shell` 的 assets 条目 | `timeout_s` | `execution` | `network` | filteredOut |
|---|---|---|---|---|---|
| A | `ast_t_shell` · from tenant · replaced factory、organization | `45` · factory · — | `{问一下}` · organization · organization | `{}`（空集）· organization · — | 空 |
| B | `ast_off_shell` · from organization · replaced 空 · lockedAt organization | `120` · organization · organization | `{问一下}` · organization · organization | `{允许}` · organization · — | `(tool:shell, tenant, locked_below)` |
| C | `ast_off_shell` · from tenant · replaced 空 | `120` · organization · organization | `{}`（空集）· tenant · organization | `{允许}` · organization · — | 空 |

值的写法是 `value · from · lockedAt`。

**三支合起来说的是**：

- **A——设置不跟过去，权限的约束跟过去**：组织锁住的 `timeout_s = 120` 挂在指向出厂那一份的持有上，租户换了实现就不在新实现的链上，取 `ast_t_shell` 声明的 `45`（[S-22](contract.md#s-22-第四步设置) 代价那一段）；
  组织锁住的 `execution = {问一下}` 却按能力标识约束新实现：`X = {问一下}`，`from = organization`（[S-23](contract.md#s-23-第四步权限)）。
  **`ast_t_shell` 没有 `network` 这一项**，组织许了 `{允许}` 也不算数：替换件缺的项取最严，表外项的最严值是空集，`{} ∩ {允许}` = 空集。
- **B——锁替换是设置那一侧的杠杆**：租户那份以 `locked_below` 退出，**不在效，不给约束**；生效的是组织配过值的那一份，组织的设置与权限都照常生效。
  `network` 的声明默认值 `{禁止}` 与 `X = {允许}` 不交，**作者建议让位于交集**，值是 `{允许}`。
- **C——受 [G-16](contract.md#十一已知缺口) 影响**：租户那条 `{自动}` 本该在组织加锁时被写入面挡住；它仍在输入里，交集就是空集——
  **不是**「问一下」。产品原话「[组织锁死『问一下』，成员改不了](../../../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)」要的若是「问一下」，这一支的期望随 G-16 的裁定改。

---

## E-5 不合法的输入

对应 [S-37](contract.md#s-37-输入不合法时整体拒绝)。以 E-1 的输入为底，**每一份只改一处**：

| # | 改了什么 | 违反 | 期望 |
|---|---|---|---|
| 1 | `h3` 的 holder 换成租户 `{org_acme, acc_bob}` | [S-7](contract.md#s-7-输入的一致性条件) C3：别的租户的持有 | `invalidInput` |
| 2 | `workspace` 的租户那一半换成 `{org_other, acc_alice}` | C3：工作区键的租户那一半 ≠ `tenant` | `invalidInput` |
| 3 | `h5` 加一条 `disabled = 真`（它指向官方件 `ast_off_shell`） | C7：官方件不可禁用 | `invalidInput` |
| 4 | `root` 换成 `tool:shell` | C2：根不是 Agent Definition | `invalidInput` |
| 5 | 从 `definitions` 里拿掉 `ast_t_audit` | C5：`h8` 指向的资产没有定义 | `invalidInput` |
| 6 | `h4` 加一条配值 `timeout_s = 90` | C6：出厂那一格不带配值 | `invalidInput` |
| 7 | `h6` 的 `execution` 改成 `{"allowed": ["yolo"]}` | C10：允许集合不是声明枚举的子集 | `invalidInput` |
| 8 | `standing` 换成 `ineffective` | C12：求值只对有效成员有定义 | `invalidInput` |

**必须观察到**：每一份都以 `invalidInput` 失败，**不返回任何 `EffectiveAssembly`**——
既不是半份，也不是五个空集合（[S-13](contract.md#s-13-invalidinput-是没开始判filteredout-与-unresolved-是判出来的结果)）。

---

## 附：E-1 的 `values` 逐项手算 `from`

**记号**：一格写出的值 = 这一格对这一项给出了参与合成的值（设置）或约束（权限）；「—」= 不给，括号里写为什么。
设置按 `factory < organization < tenant < workspace < session` 由外到里，**只看指向生效资产的持有**，第一条带锁的截断，否则取最里面给了值的（[S-22](contract.md#s-22-第四步设置)）；
权限**按能力标识**：组织、租户两格的在效持有（不论指向哪份资产）与会话格给约束，`X` = 声明域 ∩ 各约束，声明默认值与 `X` 有交取交、否则取 `X`，`from` 是给了约束的最里一格（[S-23](contract.md#s-23-第四步权限)）；
工作区自带资产的权限项以最严值为出厂那一格的约束、不取声明默认值（[S-25](contract.md#s-25-工作区自带资产的权限项一律取最严值)）。

| # | 项 | factory | organization | tenant | workspace | session | 结果 · from · lockedAt |
|---|---|---|---|---|---|---|---|
| 1 | `assistant / default_model`（设置） | `"model-a"`（声明默认值） | `"model-b"` 🔒（`h2` 指向 `ast_off_assistant`，就是生效那份） | `"model-c"`（`h3` 同一份）——**被组织的锁截断** | —（没有持有） | —（会话没配这一项） | `"model-b"` · organization · organization |
| 2 | `assistant / tone`（设置） | `"plain"` | —（`h2` 没配这一项） | `"concise"` | — | `"terse"` | `"terse"` · session · — |
| 3 | `shell / timeout_s`（设置） | `45`（**生效资产 `ast_t_shell` 的**声明默认值，不是出厂那份的 `60`） | —（`h5` 指向 `ast_off_shell`，不是生效那份；它的 `120` 不参与） | —（`h6` 没配这一项） | — | — | `45` · factory · — |
| 4 | `shell / execution`（权限） | 不给约束（声明域 {问一下, 自动, 禁止}；默认 `{问一下}` 只是建议） | —（`h5` 在效，但没配这一项） | `{自动}` | 不在权限层序 | — | `X = {自动}`；建议 `{问一下}` 与它不交 ⇒ `{自动}` · tenant · — |
| 5 | `audit / variant`（设置） | `"standard"` | `"strict"`（`h7` 就是生效那份；**持有**带锁，**配值**不带） | —（`h8` 已 `locked_below` 退出） | —（`h11` 已 `locked_below` 退出） | — | `"strict"` · organization · —（锁的是替换，不是这一项的值） |
| 6 | `github / endpoint`（设置·落点与身份） | `"https://mcp.repo-tools.invalid"`（**随资产一起来**的声明默认值） | —（没有持有） | —（`h9` 指向 `ast_t_github`） | `"https://evil.invalid"` ⇒ **滤掉**，`workspace_placement` | — | `"https://mcp.repo-tools.invalid"` · factory · — |
| 7 | `github / credential`（设置·落点与身份） | `null` | — | —（`h9` 的 `"cref_alice_github"` 挂在别的资产上） | —（清单没配） | — | `null` · factory · — |
| 8 | `github / call_timeout_s`（设置） | `20` | — | —（`h9` 指向别的资产） | `10` | — | `10` · workspace · — |
| 9 | `github / action.search.execution`（权限） | 工作区自带资产 ⇒ **约束 = 最严值 `{问一下}`**；声明的 `{自动}` 不认、也不作建议 | —（没有持有） | `{问一下, 自动}`（`h9` 指向被替换的 `ast_t_github`，**仍在效，按能力标识约束**） | `{自动}` ⇒ **滤掉**，`workspace_permission` | — | `X = {问一下} ∩ {问一下, 自动}` = `{问一下}` · tenant · — |
| 10 | `github / action.push.execution`（权限） | 同上 ⇒ 约束 `{问一下}` | —（没有持有） | —（`h9` 没配这一项） | —（清单没配） | — | `{问一下}` · factory · — |

**核对要点**：十个 `from` 里**没有一个权限项是 `workspace`**（第 4、9、10 行），**没有一个落点与身份类设置项是 `workspace`**（第 6、7 行）——
这两条正是 Alloy 断言 (iv)(iv′) 在这个实例上的样子（[formal 入口](formal/README.md)）。
第 3、7 行的 `from = factory` 都**不是**「没人配过」：外层确实配过，但配在另一份资产上，**设置不跟过去**；
第 9 行反过来——`h9` 同样配在另一份资产上，它的约束**跟过去了**，`from = tenant`。**设置按资产、权限按能力标识，分界就在这三行**（[S-22](contract.md#s-22-第四步设置)、[S-23](contract.md#s-23-第四步权限)）。
