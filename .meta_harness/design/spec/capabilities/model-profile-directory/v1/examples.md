# 规范实例：走通的路径与每个失败值的反例

属于 `capability.model-profile-directory` v1 的规范工件。本契约**不附 Schema**，这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前五节各走通一条路径，第六节给每个失败值一个反例。

**两条读法上的边界：**

- **标识串只是占位**：`O`、`T1`、`K_O` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）；档案内容只写与本节有关的成员，其余按 `data.model-profile` 的必填成员补齐即可。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `O` | 一个团队组织；账号 A 是它的超级管理员，账号 B 是普通成员 |
| `T_A = (O, A)`、`T_B = (O, B)` | A、B 在 `O` 的租户身份 |
| `P` | B 的个人组织；`T_P = (P, B)` 是 B 在那里的租户身份 |
| `Q` | 另一个团队组织，与 `O` 无关；账号 C 是它的超管，`T_C = (Q, C)` |
| 官方清单 #1 | `ordinal = 1`，两条：`openai/gpt-5`、`anthropic/claude-sonnet-5` |

## 1. 官方清单装入与再装入

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | 装入清单 #1 | `dispositions`：两条都是 `added`；两行 `listed`，`updatedAt` = 提交时刻 | [S-18](contract.md#s-18-装入官方档案清单) |
| 2 | 原样重装清单 #1 | 同样的 `dispositions`（两条 `added`），**什么都没写**、`updatedAt` 不动 | [S-18](contract.md#s-18-装入官方档案清单) ⑦ |
| 3 | 装入清单 #2：`ordinal = 2`，只含 `openai/gpt-5`（`maxOutputTokens` 改大）与新条目 `google/gemini-3-pro` | `openai/gpt-5` → `updated`、`updatedAt` 推进；`google/gemini-3-pro` → `added`；`anthropic/claude-sonnet-5` → `withdrawn`，发一次 `profile.withdrawn` | [S-18](contract.md#s-18-装入官方档案清单) 处置表、[S-21](contract.md#s-21-profilewithdrawn-是通知) |
| 4 | 再装清单 #1（回滚部署） | **`manifestNotNewer`**，什么都不变——`google/gemini-3-pro` **没有**被撤回 | [S-8](contract.md#s-8-官方档案清单与发布序号)、[S-18](contract.md#s-18-装入官方档案清单) ⑦ |
| 5 | 装入清单 #3：`ordinal = 3`，含 `anthropic/claude-sonnet-5` 与另外两条 | `anthropic/claude-sonnet-5` → **`notRelisted`**，行仍是 `withdrawn`；其余照常处置 | [S-18](contract.md#s-18-装入官方档案清单)、[G-1](contract.md#十已知缺口) |

## 2. 自建档案：建、认回、撤回、再读

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `registerProfile(T_A, organization(O), {routeName: "acme/finetune-7b", origin: custom, …})` | `{ ref: {origin: custom, scope: organization(O), routeName: "acme/finetune-7b"}, profile: {…, registration: listed} }` | [S-14](contract.md#s-14-registerprofile)、[S-10](contract.md#s-10-配置资格谁能在哪一格写)（A 是 `O` 的超管） |
| 2 | 回执丢了，A 原样重发第 1 步 | 返回同一行，**不写第二行、不报 `routeNameTaken`** | [S-14](contract.md#s-14-registerprofile) ⑦ 认回 |
| 3 | A 改了 `maxOutputTokens` 再发一次 | **`routeNameTaken`**——内容不同，不是认回；要改用 [updateProfile](contract.md#s-31-updateprofile)（第 8 步） | [S-14](contract.md#s-14-registerprofile) ⑦ |
| 4 | `withdrawProfile(T_A, 第 1 步的 ref)` | `{ ref, registration: withdrawn }`；发一次 `profile.withdrawn`；`updatedAt` 不动 | [S-15](contract.md#s-15-withdrawprofile) |
| 5 | `readProfile(T_B, 第 1 步的 ref)` | 读到那一行，`registration: withdrawn`——B 的会话若指着它，据此说「已下架」 | [S-16](contract.md#s-16-readprofile) |
| 6 | 再撤一次 | 同第 4 步的返回，**不再发事件** | [S-15](contract.md#s-15-withdrawprofile) ⑦ |
| 7 | `registerProfile(T_A, organization(O), 与第 1 步逐字相同)` | **`routeNameTaken`**——那一行已撤回，认回只认在册的 | [S-14](contract.md#s-14-registerprofile) ⑦、`data.model-profile/v1#S-10` |
| 8 | `updateProfile(T_A, 第 1 步的 ref, patch: providers 换成另一组)` | 改完的那一份；`registration` 仍是 `withdrawn`（改了也不回到在册）；**`updatedAt` 不动**——`providers` 不是五项上游属性 | [S-31](contract.md#s-31-updateprofile) ④ |
| 9 | `updateProfile(T_A, 第 1 步的 ref, patch 提到 routeName)` | **`invalidInput`**——路由名不可改；改名就是新登记一条、撤回旧的 | [S-31](contract.md#s-31-updateprofile) ③ |
| 10 | `updateProfile(T_B, 第 1 步的 ref, …)` | **`notAuthorized`**——B 在 `O` 是普通成员，组织层只归超管 | [S-31](contract.md#s-31-updateprofile) ② |

## 3. 列表：链上三格，官方与自建同一份

接第 1、2 节（清单 #3 已装入）。B 在自己的租户层也建了一条 `b/local-proxy`。

| 调用 | 预期 | 依据 |
|---|---|---|
| `listProfiles(T_B)` | 全部官方行（含 `anthropic/claude-sonnet-5` 的 `withdrawn` 行）＋ `acme/finetune-7b`（`withdrawn`）＋ `b/local-proxy`（`listed`） | [S-17](contract.md#s-17-listprofiles) ⑤ |
| `listProfiles(T_A)` | 同上，**但没有 `b/local-proxy`**——B 的租户层不在 A 的链上 | [S-6](contract.md#s-6-范围链) |
| `listProfiles(T_C)` | 只有官方行 | [S-6](contract.md#s-6-范围链) |
| `listProfiles(T_B)`，自建那一部分读不到 | **`unavailable`**，不返回只有官方行的列表 | [S-17](contract.md#s-17-listprofiles) ⑧ |

## 4. 凭据：最具体的一把，读不到不回落

A 给 `O` 配了 `K_O`；B 给自己的租户层配了 `K_B`；B 在个人组织 `P` 里给 `T_P` 配了 `K_P`。`O` 的另一个成员 D（`T_D = (O, D)`）没配。**这个部署没给出厂格配凭据**（第 12 步另说）。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `bindCredential(T_A, organization(O), ref_K_O)` | `{ scope: organization(O), boundAt }`——**不回显引用** | [S-19](contract.md#s-19-bindcredential) ⑤ |
| 2 | `resolveCredential(T_B, value)` | `{ scope: tenant(T_B), value: K_B 的本体 }` | [S-20](contract.md#s-20-resolvecredential) ⑤ |
| 3 | `resolveCredential(T_D, value)` | `{ scope: organization(O), value: K_O 的本体 }` | 同上 |
| 4 | `resolveCredential(T_D, present)` | `{ present: true, scope: organization(O), boundAt }` | 同上 |
| 5 | `resolveCredential(T_C, present)`（`Q` 与 `T_C` 都没配） | `{ present: false }`——**结论，不是失败** | [S-20](contract.md#s-20-resolvecredential) ⑧ |
| 6 | `resolveCredential(T_C, value)` | **`credentialUnavailable`** | 同上 |
| 7 | `T_B` 那一格读不到，`resolveCredential(T_B, value)` | **`unavailable`，不是 `K_O`** | [S-20](contract.md#s-20-resolvecredential) ⑧ |
| 8 | 任何一次以 `T_B`、`T_D` 为锚的取用 | **永远取不到 `K_P`**——`P` 不在 `O` 的链上 | [S-6](contract.md#s-6-范围链) |
| 9 | `bindCredential(T_A, organization(O), ref_K_O2)` 之后 `resolveCredential(T_D, value)` | `K_O2` 的本体；`boundAt` 已更新 | [S-19](contract.md#s-19-bindcredential) ⑦ 轮换 |
| 10 | `bindCredential(T_A, organization(O), ref_K_O2)` 再发一次 | 不写、`boundAt` 不动 | 同上 |
| 11 | `unbindCredential(T_B, tenant(T_B))`，然后 `resolveCredential(T_B, value)` | 先 `{ scope: tenant(T_B), present: false }`；再取值得 `K_O2`、`scope = organization(O)`——**回到没配，按链落到下一格，不是回落** | [S-32](contract.md#s-32-unbindcredential) ⑤⑨ |
| 12 | 同样的局面，但部署装配给出厂格配了 `K_F`：`resolveCredential(T_C, value)` | `{ scope: factory, value: K_F 的本体 }`；`resolveCredential(T_D, value)` 仍得 `K_O2`——出厂格排在最末 | [S-20](contract.md#s-20-resolvecredential) ⑤ |

## 5. 撞名：自建占了名字，官方那条拒建

`Q` 的超管 C 先建了自建档案 `vendor/new-model`；随后官方清单 #4 带上同名条目。

| 调用 | 预期 | 依据 |
|---|---|---|
| 装入清单 #4 | `vendor/new-model` → **`routeNameTaken`**，其余条目照装；**整份清单不失败** | [S-18](contract.md#s-18-装入官方档案清单) 处置表、[G-1](contract.md#十已知缺口) |
| `listProfiles(T_A)` | 没有 `vendor/new-model`——官方那条没进来，`Q` 的自建那条不在 `O` 的链上 | [S-6](contract.md#s-6-范围链)、[S-17](contract.md#s-17-listprofiles) |
| `registerProfile(T_C, organization(Q), {routeName: "acme/finetune-7b", …})` | **成功**——`Q` 与 `O` 不在同一棵隶属树上，自建名不跨树比较；C 也就探不到 `O` 建过这个名字 | [S-14](contract.md#s-14-registerprofile) ④、`data.model-profile/v1#S-3`（主线裁定 2026-09-23，待产品负责人确认；RP-22） |

## 6. 每个失败值一个反例

| 失败值 | 调用 | 为什么 | 依据 |
|---|---|---|---|
| `invalidInput{malformed}` | `registerProfile(T_A, organization(O), {…, registration: listed})` | 建档内容带了 `registration`，由目录写、不由调用方给 | [S-14](contract.md#s-14-registerprofile) ①⑧ |
| `invalidInput{route_name_empty}` | `readProfile(T_A, {origin: official, routeName: ""})` | 引用过不了 `data.model-profile/v1#S-24` | [S-9](contract.md#s-9-缺席时的默认答案) |
| `invalidInput{malformed}` | `resolveCredential(T_A, ask = "secret")` | 问法不在两值之内 | [S-9](contract.md#s-9-缺席时的默认答案) 判别式闭合 |
| `invalidInput{malformed}` | `registerProfile(缺 initiator, …)` | 身份参数缺席，**不以「当前租户」补齐** | [S-9](contract.md#s-9-缺席时的默认答案) |
| `notAuthorized` | `registerProfile(T_B, organization(O), …)` | B 在 `O` 是普通成员，组织层只归超管 | [S-10](contract.md#s-10-配置资格谁能在哪一格写) |
| `notAuthorized` | `bindCredential(T_A, tenant(T_B), …)` | 租户那一把只归租户自己，超管也不行 | 同上 |
| `notAuthorized` | `readProfile(T_C, {origin: custom, scope: organization(O), …})` | `O` 不在 `T_C` 的链上；**先于解析，C 得不到「那里有没有」** | [S-16](contract.md#s-16-readprofile) ② |
| `routeNameTaken` | `registerProfile(T_B, tenant(T_B), {routeName: "acme/finetune-7b", …})` | 名字已被同一棵树里 `O` 的一条（已撤回的）自建档案占着 | [S-14](contract.md#s-14-registerprofile)、`data.model-profile/v1#S-3` |
| `officialProfileNotWithdrawable` | `withdrawProfile(T_A, {origin: official, routeName: "openai/gpt-5"})` | 官方档案谁都撤不了——**结构性，不是权限** | [S-15](contract.md#s-15-withdrawprofile) ③ |
| `manifestNotNewer` | 已装入序号 3 时装入 `ordinal = 3`、内容与清单 #3 不同 | 同序号不同内容 | [S-18](contract.md#s-18-装入官方档案清单) ⑦ |
| `profileNotFound` | `readProfile(T_A, {origin: custom, scope: organization(O), routeName: "acme/never"})` | 解析到零行 | [S-16](contract.md#s-16-readprofile) ⑧ |
| `credentialUnavailable` | 见第 4 节第 6 步 | 链上三格都没有（本部署没配出厂格那一把） | [S-20](contract.md#s-20-resolvecredential) ⑧ |
| `unavailable` | `registerProfile(T_A, …)`，成员资格判定以 `unavailable` 失败 | 读不到 ≠ 无权，**不折成 `notAuthorized`** | [S-10](contract.md#s-10-配置资格谁能在哪一格写) |

**判定次序的两条回归例：**

| 调用 | 预期 | 为什么不是另一个 |
|---|---|---|
| `registerProfile(T_B, organization(O), {routeName: "openai/gpt-5", …})` | `notAuthorized` | 授权先于名字判定——无权者拿不到 `routeNameTaken`（[S-14](contract.md#s-14-registerprofile) 末段） |
| `withdrawProfile(T_C, {origin: official, routeName: "openai/gpt-5"})` | `officialProfileNotWithdrawable` | 结构性禁止先于授权（[S-15](contract.md#s-15-withdrawprofile) 末段） |
