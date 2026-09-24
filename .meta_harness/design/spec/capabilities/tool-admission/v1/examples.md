# 规范实例：判定次序、答复、凭据与每个失败值的反例

属于 `capability.tool-admission` v1 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前六节各走一条路径，第七节给每个失败值一个反例并演示失败的次序，第八节是第四档、工具的名字与本能力不在时的样子。

**三条读法上的边界：**

- **标识串与凭据串只是占位**：`call_1`、`tok_1` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）；**凭据的内容不可解析**，这里不展示它装了什么。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。
- **`evaluate` 的结果在每一行里直接给出**：求值的函数体归实现（[契约 G-1](contract.md#十一已知缺口)），实例只演示本能力拿到每一种结果之后怎么办。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `S` | 一个会话，运行 `r1` 在跑；它不是子会话，所以不带 `parent` |
| `c_read` | `{ callId: "call_1", tool: "read_file", arguments: { "path": "a.txt" } }` |
| `c_rm` | `{ callId: "call_2", tool: "shell", arguments: { "command": "rm -rf build" } }` |
| `c_mail` | `{ callId: "call_3", tool: "send_mail", arguments: { "to": "ops", "body": "done" } }` |
| `c_gh` | `{ callId: "call_4", tool: "github__search_issues", arguments: { "q": "is:open" } }`——MCP 接入点 `github` 的动作 `github:search_issues`，调用块里是它的**模型面名字**（`:` 转写成 `__`） |
| `def(n)` | `definition = { name: n }`，与 `call.tool` 相同——都是模型面名字 |
| `P(v, f)` | `effectivePermission = { value: v, from: f }` |
| `G0` | `S` 此刻的授权上下文；**除非某行另说，`evaluate(call, G0) = undecidable`** |
| `item(c, P, mode)` | `{ call: c, definition: def(c.tool), effectivePermission: P, grants: G0, runMode: mode, tenantAutoWritable: true }`；`item⁻` 同它，只是 `tenantAutoWritable: false` |
| `itemN(c, mode)` | `{ call: c, definition: def(c.tool), effectivePermission: "not_in_composition", grants: G0, runMode: mode }`——这个工具条目此刻不在这个租户的组合里（可用性报告里那一项写着 `not_in_composition`），**不带 `tenantAutoWritable`**（[契约 S-8](contract.md#s-8-有效执行权限) 末条） |
| `CARD(c)` | 一张 `DecisionCardDraft`：`options` 恰为下面四个、按此顺序；`about = { position: "before_action", callId: c.callId }`；`explanation` 说清五样（[契约 S-15](contract.md#s-15-定死的四档选项与卡片草稿)）；`CARD3(c)` 同它，只是没有第四档 |

```json
[
  { "id": "deny",          "label": "不允许" },
  { "id": "allow_once",    "label": "这次允许" },
  { "id": "allow_session", "label": "本会话内，这类情况都允许" },
  { "id": "allow_tenant",  "label": "将来本租户所有会话，这类情况全允许" }
]
```

## 1. 三档各一

同一个 `c_rm`，三种执行权限 × 三种运行模式。

| 输入 | 预期 | 依据 |
|---|---|---|
| `admit([item(c_rm, P(forbid, organization), never)])` | `[deny{permission_forbidden}]`；**`evaluate` 没有被调用；没有卡片** | [S-22](contract.md#s-22-判定次序) 第 ① 步 |
| 同上，`runMode = auto_permission` | `[deny{permission_forbidden}]`，**没有卡片** | 同上：禁止的动作不产卡 |
| 同上，`runMode = bypass-permissions` | `[deny{permission_forbidden}]` | 同上：`bypass-permissions` 跳不过第 ① 步 |
| 同上，`G0` 换成一份 `evaluate = allow` 的授权上下文 | `[deny{permission_forbidden}]` | 授权表达翻不了禁止 |
| `admit([item(c_read, P(auto, tenant), never)])` | `[allow{tok_1}]`；**`evaluate` 没有被调用** | 第 ② 步：不看授权表达，也不看运行模式 |
| 同上，`G0` 换成一份 `evaluate = deny` 的授权上下文 | `[allow{tok_1}]`，**与上一行同一个凭据** | 同上；凭据由 `callId` 与参数确定（[S-16](contract.md#s-16-admissiontoken-与参数相等)） |
| `admit([item(c_rm, P(ask, factory), auto_permission)])` | 进第 ③ 步；`evaluate = undecidable` ⇒ 第 ④ 步（见第 2 节） | 第 ③ 步 |

## 2. 算不出 × 三种运行模式

`c_rm` 的执行权限是「问一下」（`P(ask, factory)`，没有哪一层收窄它）。

| 输入 | `evaluate` | 预期 | 依据 |
|---|---|---|---|
| `runMode = never` | `undecidable` | `[deny{run_mode_never}]` | [S-22](contract.md#s-22-判定次序) 第 ④ 步 |
| `runMode = auto_permission` | `undecidable` | `[ask{CARD(c_rm)}]`：四档**逐字**是上面那四个；`explanation` 写明「`shell`、命令 `rm -rf build`；执行权限问一下、来自出厂默认；本会话还没有管到它的授权；会话运行模式 auto_permission；四档各自的后果；答了解除这个运行，要这一批卡片全答完；之后还有执行环境权限那一道」 | 第 ④ 步；[S-15](contract.md#s-15-定死的四档选项与卡片草稿) |
| `runMode = bypass-permissions` | `undecidable` | `[allow{tok_2}]` | 第 ④ 步 |
| 三种模式各一次 | `allow`（用户先前在会话里说过「这个目录可以清」） | 三次都是 `[allow{tok_2}]` | 第 ③ 步算得出就照办，**不看运行模式** |
| 三种模式各一次 | `deny`（用户说过「别删东西」） | 三次都是 `[deny{authorization_denied}]`——**`bypass-permissions` 也翻不了** | 第 ③ 步 |

## 3. 子宽于父被拒

`S` 换成一个子会话 `S'`，它的父会话是 `S`。子会话的每一项带 `parent`。

| 输入 | 预期 | 依据 |
|---|---|---|
| 一批两项：`item(c_read, P(auto, tenant), auto_permission)` ＋ `parent: { permission: auto, runMode: auto_permission }`；`item(c_mail, P(ask, tenant), auto_permission)` ＋ `parent: { permission: ask, runMode: auto_permission }`（父对两个工具的档位不同） | 照常判：`[allow{tok_1}, ask{CARD(c_mail)}]`——`parent.permission` 按工具条目，各项可以不同 | [S-7](contract.md#s-7-admissioninput)、[S-23](contract.md#s-23-一批的含义) |
| 一批两项：`c_read` 那一项带 `parent: { permission: auto, runMode: auto_permission }`，`c_mail` 那一项带 `parent: { permission: ask, runMode: never }` | **整次 `invalidInput`**：同一批里 `parent.runMode` 不一致——那是一个会话的属性，不会一批两个值 | [S-7](contract.md#s-7-admissioninput)、[S-24](contract.md#s-24-失败值与它们的次序) 第 1 行 |
| 一批两项：`item(c_read, P(auto, tenant), auto_permission)` ＋ `parent: { permission: auto, runMode: auto_permission }`；`item(c_rm, P(auto, tenant), auto_permission)` ＋ `parent: { permission: ask, runMode: auto_permission }` | **整次 `parentNarrower`**：`c_rm` 那一项 `auto` 比父的 `ask` 宽；**`c_read` 也没有结论** | [S-11](contract.md#s-11-父会话摘要与宽的次序)、[S-24](contract.md#s-24-失败值与它们的次序)：失败是整次的 |
| `item(c_rm, P(ask, tenant), auto_permission)`，`parent: { permission: ask, runMode: never }` | **整次 `parentNarrower`**：`auto_permission` 比 `never` 宽——**子的这次调用不会走到「问人」** | 同上；[PF-007 §5.8](../../../../product/PF-007-meta-capabilities/design.md#58-子不得宽于父)「父都不问人了，子更不该问」 |
| `item(c_rm, P(ask, tenant), never)`，`parent: { permission: auto, runMode: bypass-permissions }` | 照常判：子比父窄是合法的；`evaluate = undecidable` ⇒ `[deny{run_mode_never}]` | 同上：只挡「宽」 |
| runner 这一侧，拿到 `parentNarrower` 之后 | 这一批**每一项**的那次经过记 `skipped: errored` ＋ `error`（写明「放行判断没有给出结论」与 `parentNarrower`），按 `treat_as_veto` **效果 `vetoed`**；**不借用**任何一个拒绝原因 | [S-29](contract.md#s-29-位置干预力与结论投影)、[S-34](contract.md#s-34-本能力缺席报错或判不出来) |

## 4. 一批里一条 ask，整批停

模型的一次响应里有三个动作：`c_read`、`c_rm`、`c_mail`，按这个顺序。`runMode = auto_permission`。
租户在 `before_action` 上没有挂别的件，三项都走到本件。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `admit([item(c_read, P(auto, tenant), …), item(c_rm, P(ask, factory), …), item(c_mail, P(ask, tenant), …)])`，其中 `evaluate(c_mail, G0) = allow`（用户先前说过「这次发邮件可以」） | `[allow{tok_1}, ask{CARD(c_rm)}, allow{tok_3}]`，**一次返回** | [S-21](contract.md#s-21-admit)、[S-23](contract.md#s-23-一批的含义) |
| 2 | runner 落三条结论：`observed`、`ask`、`observed` | 运行进等人；**`tok_1`、`tok_3` 留在 runner 手里，不交给执行运行时** | [S-31](contract.md#s-31-一批里还有一条在等谁都不执行) |
| 3 | 观察执行运行时 | **在卡片答完之前没有收到任何一次提交** | 同上；[PF-012 一批动作先全部判完](../../../../product/PF-012-agent-loop-and-run/design.md#一批动作先全部判完再执行任何一个) |
| 4 | 人在卡片上点「这次允许」；runner 回到本件：`admit([item(c_rm, P(ask, factory), auto_permission) ＋ answer: "allow_once"])` | `[allow{tok_2}]`；**不再出卡**；另外什么也不落 | [S-22](contract.md#s-22-判定次序) 答复那一支；[S-27](contract.md#s-27-四档答复各落在哪) |
| 5 | runner 落 `observed`；把 `c_read`/`tok_1`、`c_rm`/`tok_2`、`c_mail`/`tok_3` 交给执行运行时 | 执行运行时逐项核对，三项都 `valid`，**按调用块顺序依次执行** | [S-25](contract.md#s-25-verifytoken) |

**反例**：步 2 之后就把 `c_read` 交出去执行——违反 [S-31](contract.md#s-31-一批里还有一条在等谁都不执行)。本能力交回凭据时不扣住它，**扣与不扣的义务在 runner**。

## 5. 答复收成结论

本件为 `c_rm` 出过一张卡（第 2 节第二行）；人答完之后，runner 带着 `answer` 再调一次。除「现读变化」两行外，`effectivePermission` 仍是 `P(ask, factory)`。

| `answer` | 预期 | 另外落下什么（写入者见 [G-2](contract.md#十一已知缺口)） | 依据 |
|---|---|---|---|
| `deny`（不允许） | `[deny{human_refused}]` | 什么也不落 | [S-27](contract.md#s-27-四档答复各落在哪) |
| `allow_once`（这次允许） | `[allow{tok_2}]` | 什么也不落 | 同上 |
| `allow_session`（本会话内，这类情况都允许） | `[allow{tok_2}]` | 一笔作用域本会话的授权表达进 `S` 的授权上下文；**本会话里下一次同类调用在第 ③ 步算得出，不再问** | 同上 |
| `allow_tenant`（将来本租户所有会话，这类情况全允许） | `[allow{tok_2}]` | 租户层 `shell` 的执行权限配值「自动」；**写不进去时这一次仍然放行，写失败要告知人** | 同上 |
| `declined`（不回答，或用户插队解除了卡片） | `[deny{human_declined}]`——**不是 `human_refused`** | 什么也不落 | [S-12](contract.md#s-12-答复)、[S-14](contract.md#s-14-拒绝原因) |
| **现读变化**：卡片挂着期间组织把 `shell` 改成禁止——`P(forbid, organization)`；`answer: "allow_once"` | `[deny{permission_forbidden}]`：**人点了允许也做不成** | 什么也不落 | [S-22](contract.md#s-22-判定次序) 第 ① 步照判 |
| **现读变化**：卡片挂着期间租户把 `shell` 改成自动——`P(auto, tenant)`；`answer: "deny"` | `[deny{human_refused}]`：两个依据方向相反，取收紧的那个 | 什么也不落 | 同上，答复那一支（本契约推导） |
| 自由作答「先 dry-run 一遍再说」 | runner **不带 `answer`**：那句话落成一笔语义化授权表达之后再判；`evaluate` 仍是 `undecidable` ⇒ `[ask{CARD(c_rm)}]`，**再问一轮** | 那一笔语义化授权表达 | [S-12](contract.md#s-12-答复)：翻不出裁决就不翻 |

**反例**：把 `declined` 交回来时得到 `ask`（又出一张同样的卡）——违反[契约 S-13](contract.md#s-13-admissionresult)「有 `answer` 时不会出现 `ask`」。

## 6. 令牌核对

接第 4 节：`c_rm` 已放行，凭据 `tok_2`，runner 已把本件的 `observed` 落进 `S` 的日志。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `verifyToken(tok_2, c_rm, S)` | `valid` | [S-26](contract.md#s-26-令牌有效的条件) |
| 2 | `verifyToken(tok_2, c_rm', S)`，`c_rm'` 的参数被改成 `{ "command": "rm -rf /" }` | `invalid{arguments_changed}` | 第 2 条 |
| 3 | `verifyToken(tok_2, c_read, S)` | `invalid{call_mismatch}` | 第 1 条 |
| 4 | 本件结论之后，一件排错了位置的租户拓展件在 `before_action` 给 `call_2` 落了一次参数改写；再 `verifyToken(tok_2, c_rm, S)` | `invalid{arguments_changed}`——**原参数也不行**：日志里这次调用在结论之后被改过 | 第 4 条；[S-30](contract.md#s-30-放行之后参数不再变) |
| 5 | 另一次调用：`admit` 刚返回 `allow{tok_9}`，runner **还没落结论**，就拿 `tok_9` 去核对 | `invalid{not_admitted}`；**结论落下之后同一张凭据核对得 `valid`** | 第 3 条；[S-16](contract.md#s-16-admissiontoken-与参数相等) |
| 6 | 运行 `r1` 被取消，终态已落；`verifyToken(tok_2, c_rm, S)` | `invalid{run_ended}` | 第 5 条 |
| 7 | `verifyToken(tok_2, c_rm, T)`，`T` 是另一个会话（其中也有一个 `call_2`，但本件没有为它放行） | `invalid{not_admitted}`——**只在 `T` 的日志里找** | [S-25](contract.md#s-25-verifytoken) |
| 7′ | 同上，但本件在 `T` 里也为 `T` 自己的 `call_2`、同一份参数落了放行结论 | `valid`——**放行它的是 `T` 自己的那条结论**；把 `tok_2` 换成 `T` 那次 `admit` 铸出的凭据，答案相同（同一个 `callId`、同一份参数铸出同一个凭据）。凭据借不来 `S` 的授权 | [S-16](contract.md#s-16-admissiontoken-与参数相等) |
| 8 | 日志存储读不到；`verifyToken(tok_2, c_rm, S)` | **`unavailable` 失败**，不是 `valid`，也不是 `invalid`；执行运行时**不执行** | [S-25](contract.md#s-25-verifytoken) ⑧ |
| 9 | 同一张 `tok_2` 核对两次 | 两次答案相同；**核对不消耗凭据**——「只执行一次」归执行运行时按 `CallId` | [S-25](contract.md#s-25-verifytoken) ⑦ |

**以上 2～8（不含 7′）七种情形，执行运行时都不执行。**

## 7. 失败值的反例

**`admit` 四个失败值各一个反例，外加两个 `verifyToken` 的失败值与失败的次序。**

| 输入 | 预期 | 依据 |
|---|---|---|
| `admit([])` | `invalidInput` | [S-6](contract.md#s-6-放行判断是一个函数无状态无提交)、[S-24](contract.md#s-24-失败值与它们的次序) 第 1 行 |
| `item(c_rm, P(ask, factory), —)`，没带 `runMode` | `invalidInput`——**不当作 `auto_permission`** | [S-17](contract.md#s-17-缺席时的默认答案) |
| 一批两项，`callId` 都是 `call_2` | `invalidInput` | [S-21](contract.md#s-21-admit) ② |
| `item(c_rm, …)` 但 `definition = { name: "bash" }` | `invalidInput` | [S-7](contract.md#s-7-admissioninput) |
| `item(c_rm, …)` 但没带 `tenantAutoWritable` | `invalidInput`——**不当作真，也不当作假** | [S-17](contract.md#s-17-缺席时的默认答案) |
| `effectivePermission = { value: [], from: organization }`（空集，没收成 `forbid`） | `invalidInput`：空集要由组装输入的一方先收成 `forbid` | [S-8](contract.md#s-8-有效执行权限) |
| `P(auto, workspace)` | **`invalidInput`**：工作区提供的资产只能是 `ask` | [S-8](contract.md#s-8-有效执行权限)、[S-45](contract.md#s-45-工作区来的工具不提权) |
| `P(ask, workspace)`，`auto_permission`，`evaluate = undecidable` | 照常：`[ask{CARD(c_rm)}]` | 同上 |
| `effectivePermission = { value: ["ask", "auto"], from: tenant }`（一个集合） | `invalidInput`：本能力不替上游收成一个档位 | [S-8](contract.md#s-8-有效执行权限) |
| `effectivePermission.value = "prompt"` | `invalidInput`——**不补成任何一档** | [S-17](contract.md#s-17-缺席时的默认答案) |
| `answer: "later"` | `invalidInput` | [S-12](contract.md#s-12-答复) |
| `runMode = "bypass"` | **`modeUnknown`**——不是 `bypass-permissions` 的别名 | [S-10](contract.md#s-10-会话运行模式)、[S-24](contract.md#s-24-失败值与它们的次序) 第 2 行 |
| `runMode = "auto"` | `modeUnknown`——上游另一产品的那一档，语义是「不问人改问模型」，**不得**读成 `auto_permission` | 同上 |
| `parent.runMode = "bypass_permissions"` | `modeUnknown` | 同上 |
| `item(c_rm, P(auto, tenant), auto_permission)` ＋ `parent: { permission: forbid, runMode: auto_permission }` | `parentNarrower` | [S-11](contract.md#s-11-父会话摘要与宽的次序) |
| `item(c_rm, P(ask, factory), bypass-permissions)`，**求值读不到授权上下文**（故障注入） | **`unavailable`**——**不是 `allow`**（那是把读失败当成算不出，再被 `bypass-permissions` 放行），**也不是 `deny`** | [S-9](contract.md#s-9-授权上下文与求值)、[S-18](contract.md#s-18-判不出来不是拒绝也不是算不出)、[S-44](contract.md#s-44-判不出来不放行) |
| 同上，但同一批还有一项 `item(c_read, P(auto, tenant), bypass-permissions)` | **整次 `unavailable`**，`c_read` 也没有结论；runner 这一侧两项的那次经过都记 `skipped: errored` ＋ `error`，效果 `vetoed` | [S-24](contract.md#s-24-失败值与它们的次序)：失败是整次的 |
| `item(c_read, P(auto, tenant), never)`，求值读不到 | `[allow{tok_1}]`：**不走第 ③ 步的项不会引出 `unavailable`** | 同上，第 4 行 |
| `[itemN(c_mail, bypass-permissions), item(c_read, P(auto, tenant), bypass-permissions)]`，求值读不到 | `[deny{not_held}, allow{tok_1}]`：**`not_in_composition` 是第 ⓪ 步的结论，不是失败**；两项都不走第 ③ 步，整次不失败 | [S-24](contract.md#s-24-失败值与它们的次序)、[S-22](contract.md#s-22-判定次序) 第 ⓪ 步 |
| `verifyToken(tok_2, c_rm, —)`，没带会话 | `invalidInput`——**不取「当前会话」** | [S-25](contract.md#s-25-verifytoken) ⑧ |

**失败的次序**（一次只给一个值，第一个命中的那一行）：

| 输入同时有 | 预期 |
|---|---|
| `callId` 重复 ＋ `runMode = "bypass"` | `invalidInput` |
| `runMode = "bypass"` ＋ 比父宽 | `modeUnknown` |
| 比父宽 ＋ 求值读不到 | `parentNarrower`——**没有走到第 ③ 步** |

## 8. 第四档、名字与解析不了的调用

**第四档写得进去才出现**（`c_rm`，`P(ask, factory)`，`evaluate = undecidable`，`runMode = auto_permission`）：

| 输入 | 预期 | 依据 |
|---|---|---|
| `admit([item(c_rm, …)])` | `[ask{CARD(c_rm)}]`：四档 | [S-15](contract.md#s-15-定死的四档选项与卡片草稿) |
| `admit([item⁻(c_rm, …)])`——组织把 `shell` 的执行权限锁在 `{ask, forbid}`，租户写「自动」写不进去 | `[ask{CARD3(c_rm)}]`：**恰三档** `deny`、`allow_once`、`allow_session`；`explanation` 不写「将来本租户所有会话」的后果 | 同上；[S-46](contract.md#s-46-第四档写不进去就不出现) |
| 上一行的卡答完回来，`answer: "allow_session"` | `[allow{tok_2}]` | [S-27](contract.md#s-27-四档答复各落在哪) |

**工具的名字**（比较在模型面名字上做）：

| 输入 | 预期 | 依据 |
|---|---|---|
| `admit([item(c_gh, P(ask, tenant), auto_permission)])`，`definition = { name: "github__search_issues" }` | 照常判：`[ask{CARD(c_gh)}]` | [S-7](contract.md#s-7-admissioninput) |
| 同上，但 `definition = { name: "github:search_issues" }`（定义名，带冒号） | **整次 `invalidInput`**——本能力不做逆转写，定义名与调用块里的模型面名字逐码点不等 | 同上；[S-47](contract.md#s-47-模型面名字逐码点比解析不了的调用不进来) |

**不在组合里的工具条目单独判拒、不牵连同批**（[D-040 §六 L15](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）——会话里的 `send_mail` 此刻已被组织禁用（没有 reload，它还在会话的工具表里），可用性报告里它那一项是 `not_in_composition`：

| 输入 | 预期 | 依据 |
|---|---|---|
| `admit([itemN(c_mail, auto_permission), item(c_read, P(auto, tenant), auto_permission)])` | `[deny{not_held}, allow{tok_1}]`：`c_mail` **不出卡**、不调 `evaluate`；**`c_read` 照常放行**——不是整批全拒 | [S-8](contract.md#s-8-有效执行权限) 末条、[S-22](contract.md#s-22-判定次序) 第 ⓪ 步、[S-14](contract.md#s-14-拒绝原因) |
| `itemN(c_mail, auto_permission)` 带 `answer: "allow_once"`（卡片挂着期间它被禁用） | `[deny{not_held}]`：**人点了允许也做不成** | [S-22](contract.md#s-22-判定次序) 第 ⓪ 步「有答复也照判」 |
| `itemN(c_mail, auto_permission)` 另带 `tenantAutoWritable: true` | **整次 `invalidInput`**——这一项不带这一位 | [S-7](contract.md#s-7-admissioninput)、[S-17](contract.md#s-17-缺席时的默认答案) |
| 同一批，但报告里 `c_mail` 那一项是 `unavailable`（第二次求值本身失败） | runner 不调 `admit`：本能力这一次**不可用**，两项都由全拒件顶上——**只有判不出来才整批全拒** | [S-8](contract.md#s-8-有效执行权限)、[S-34](contract.md#s-34-本能力缺席报错或判不出来) |

**名字根本不在这次尝试 `tool` 表里的调用不交来**（[D-040 §七 M10](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：接入点被禁用之后，注册表不再为它钉动作条目，那个动作的调用在报告里查不到；模型编造的名字同样查不到。
这样的调用**不进 `admit`**，也**不是**上表的 `not_in_composition`（那是条目还在、组合里没了）——runner 记 `observed{no_such_entry}`，由工具执行运行时收场 `unavailable{no_such_entry}`；同批其余项照常交来判（[S-8](contract.md#s-8-有效执行权限)）。

**参数解析不了的调用不进来**：

| 输入 | 预期 | 依据 |
|---|---|---|
| 一项的 `call` 是 `{ callId: "call_5", tool: "read_file", complete: true, rawArguments: "{\"path\": \"a.md\"", unparseable: true }` | **整次 `invalidInput`**：这种调用不该交来；它由工具执行运行时在提交时即刻收场「失败」，不需要凭据 | [S-7](contract.md#s-7-admissioninput)、[S-17](contract.md#s-17-缺席时的默认答案) |

**本能力不在时**（runner 这一侧；本能力没有被调到）：

| 情形 | runner 落下的 | 依据 |
|---|---|---|
| 一批 `c_read`（`P(auto, tenant)`）与 `c_gh`，本能力这一次不可用——它依赖的服务用不了，或 `c_gh` 的有效执行权限在这次尝试的可用性报告里拿不到 | 两项的那次经过都记 `skipped: unavailable`、`unavailability: fallback`、**不带 `output`**；全拒件顶上，**两项都 `vetoed`——执行权限为「自动」的 `c_read` 也被拒**；没有卡片；agent 读到的来由是「放行判断此刻不在」 | [S-29](contract.md#s-29-位置干预力与结论投影)、[S-34](contract.md#s-34-本能力缺席报错或判不出来)、[S-48](contract.md#s-48-本能力不可用时由全拒件顶上) |
