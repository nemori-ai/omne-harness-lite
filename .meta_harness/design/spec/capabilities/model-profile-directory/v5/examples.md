# 规范实例：走通的路径与每个失败值的反例

属于 `capability.model-profile-directory` v5 的规范工件。本契约**不附 Schema**，这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前五节各走通一条路径，第六节给每个失败值一个反例。

**两条读法上的边界：**

- **标识串只是占位**：`O`、`T1`、`K_B` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）；档案内容只写与本节有关的成员，其余按 `data.model-profile` v5 的必填成员提供。例示路由名不构成官方支持清单。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `O` | 一个团队组织；账号 A 是它的超级管理员，账号 B 是普通成员 |
| `T_A = (O, A)`、`T_B = (O, B)` | A、B 在 `O` 的租户身份 |
| `P` | B 的个人组织；`T_P = (P, B)` 是 B 在那里的租户身份 |
| `Q` | 另一个团队组织，与 `O` 无关；账号 C 是它的超管，`T_C = (Q, C)` |
| 官方清单 #1 | `ordinal = 1`，两条：`openai/gpt-5`、`anthropic/claude-sonnet-5` |

**本文件每条未展开的档案都显式使用实例绑定 `B(r)`**，其中 `r` 是该条实际 `routeName`：
`{implementation:{name:"example.transport",revision:"i1"},definition:{modelId:r,revision:"d1"},configuration:{revision:"c1",values:{}}}`。
这是构造实例的明确输入，不是目录可以填写的默认绑定；没有写入 `adaptation` 的实际请求必须拒绝。名字只用于规范场景，不声称实现已注册。

**第 1～8 节未展开的非 image 档案**显式带 `maxInputTokens: 1000`、`inputConstraints: {}`，以及
`upstreamInputLimits: {maxInputTokens: {status: "unknown"}, maxRequestBytes: {status: "unknown"}}`。
这些是本组规范实例的共同输入，不是目录默认值或正式模型清单；image 的完整实例见第 9 节。

## 1. 官方清单装入与再装入

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | 装入清单 #1 | `dispositions`：两条都是 `added`；两行 `listed`，`updatedAt` = 提交时刻 | [S-18](contract.md#s-18-loadmanifest) |
| 2 | 原样重装清单 #1（其间目录的提供者重启过也一样） | 同样的 `dispositions`（两条 `added`）——**交回的是第 1 步记下的那一份**，不是按当前行重算出的两条 `unchanged`；**什么都没写**、`updatedAt` 不动 | [S-18](contract.md#s-18-loadmanifest) ⑦、[S-8](contract.md#s-8-官方档案清单与发布序号) |
| 3 | 装入清单 #2：`ordinal = 2`，只含 `openai/gpt-5`（`maxOutputTokens` 改大）与新条目 `google/gemini-3-pro` | `openai/gpt-5` → `updated`、`updatedAt` 推进；`google/gemini-3-pro` → `added`；`anthropic/claude-sonnet-5` → `withdrawn`，发一次 `profile.withdrawn` | [S-18](contract.md#s-18-loadmanifest) 处置表、[S-21](contract.md#s-21-profilewithdrawn-是通知) |
| 4 | 再装清单 #1（回滚部署） | **`manifestNotNewer`**，什么都不变——`google/gemini-3-pro` **没有**被撤回 | [S-8](contract.md#s-8-官方档案清单与发布序号)、[S-18](contract.md#s-18-loadmanifest) ⑦ |
| 5 | 装入清单 #3：`ordinal = 3`，含 `anthropic/claude-sonnet-5`（内容同清单 #1）、`openai/gpt-5` 与 `google/gemini-3-pro`（内容同清单 #2） | `anthropic/claude-sonnet-5` → **`relisted`**：**原来那一行**回到 `listed`（同一个引用），`updatedAt` 不动，不发事件；另两条 `unchanged` | [S-18](contract.md#s-18-loadmanifest) 处置表、`data.model-profile/v5#S-10` |

## 2. 自建档案：建、认回、撤回、再读

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `registerProfile(T_A, organization(O), {routeName: "acme/finetune-7b", origin: custom, …})` | `{ ref: {origin: custom, scope: organization(O), routeName: "acme/finetune-7b"}, profile: {…, registration: listed} }` | [S-14](contract.md#s-14-registerprofile)、[S-10](contract.md#s-10-配置资格谁能在哪一格写)（A 是 `O` 的超管） |
| 2 | 回执丢了，A 原样重发第 1 步 | 返回同一行，**不写第二行、不报 `routeNameTaken`** | [S-14](contract.md#s-14-registerprofile) ⑦ 认回 |
| 3 | A 改了 `maxOutputTokens` 再发一次 | **`routeNameTaken`**——内容不同，不是认回；要改用 [updateProfile](contract.md#s-31-updateprofile)（第 8 步） | [S-14](contract.md#s-14-registerprofile) ⑦ |
| 4 | `withdrawProfile(T_A, 第 1 步的 ref)` | `{ ref, registration: withdrawn }`；发一次 `profile.withdrawn`；`updatedAt` 不动 | [S-15](contract.md#s-15-withdrawprofile) |
| 5 | `readProfile(T_B, 第 1 步的 ref)` | 读到那一行，`registration: withdrawn`——B 的会话若指着它，据此说「已下架」 | [S-16](contract.md#s-16-readprofile) |
| 6 | 再撤一次 | 同第 4 步的返回，**不再发事件** | [S-15](contract.md#s-15-withdrawprofile) ⑦ |
| 7 | `registerProfile(T_A, organization(O), 与第 1 步逐字相同)` | **`routeNameTaken`**——那一行已撤回，认回只认在册的；同一格要再用这个名字是恢复那一条（第 11 步） | [S-14](contract.md#s-14-registerprofile) ⑦、`data.model-profile/v5#S-3`、`#S-10` |
| 8 | `updateProfile(T_A, 第 1 步的 ref, patch: providers 换成另一组)` | 改完的那一份；`registration` 仍是 `withdrawn`（改了也不回到在册）；**`updatedAt` 不动**——`providers` 不是六项时标属性 | [S-31](contract.md#s-31-updateprofile) ④ |
| 9 | `updateProfile(T_A, 第 1 步的 ref, patch 提到 routeName)` | **`invalidInput`**——路由名不可改；改名就是新登记一条、撤回旧的 | [S-31](contract.md#s-31-updateprofile) ③ |
| 10 | `updateProfile(T_B, 第 1 步的 ref, …)` | **`notAuthorized`**——B 在 `O` 是普通成员，组织层只归超管 | [S-31](contract.md#s-31-updateprofile) ② |
| 11 | `relistProfile(T_A, 第 1 步的 ref)` | `{ ref, registration: listed }`——**同一行**：第 8 步改过的 `providers` 还在，`updatedAt` 不动；不发事件 | [S-33](contract.md#s-33-relistprofile) ④⑨ |
| 12 | 再恢复一次 | 同第 11 步的返回，什么都不写 | [S-33](contract.md#s-33-relistprofile) ⑦ |
| 13 | `relistProfile(T_B, 第 1 步的 ref)` | **`notAuthorized`**——谁撤得了它，谁就恢复得了它；B 撤不了组织层的档案 | [S-33](contract.md#s-33-relistprofile) ② |
| 14 | `relistProfile(T_A, {origin: official, routeName: "openai/gpt-5"})` | **`officialProfileReadOnly`**——官方档案的恢复只经清单装入；撤回、修订官方档案得同一个值 | [S-33](contract.md#s-33-relistprofile) ③ |

## 3. 列表：链上三格，官方与自建同一份

接第 1、2 节（清单 #3 已装入）。B 在自己的租户层也建了一条 `b/local-proxy`。

| 调用 | 预期 | 依据 |
|---|---|---|
| `listProfiles(T_B)` | 全部官方行（清单 #3 之后都在册）＋ `acme/finetune-7b`（第 2 节第 11 步之后 `listed`）＋ `b/local-proxy`（`listed`） | [S-17](contract.md#s-17-listprofiles) ⑤ |
| `listProfiles(T_A)` | 同上，**但没有 `b/local-proxy`**——B 的租户层不在 A 的链上 | [S-6](contract.md#s-6-范围链) |
| `listProfiles(T_C)` | 只有官方行 | [S-6](contract.md#s-6-范围链) |
| `listProfiles(T_B)`，自建那一部分读不到 | **`unavailable`**，不返回只有官方行的列表 | [S-17](contract.md#s-17-listprofiles) ⑧ |

## 4. 凭据：租户那一把，否则（只对官方档案）出厂格那一把

B 给自己的租户层配了 `K_B`；B 在个人组织 `P` 里给 `T_P` 配了 `K_P`。A 与 `O` 的另一个成员 D（`T_D = (O, D)`）都没配。**组织那一层不持有凭据。**
第 1～10 步的部署**没给出厂格配凭据**；第 11～13 步的部署给出厂格配了 `K_F`。`resolveCredential` 的第二个参数是这次要用的档案的来源。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `bindCredential(T_B, T_B, ref_K_B)` | `{ tenant: T_B, boundAt }`——**不回显引用** | [S-19](contract.md#s-19-bindcredential) ⑤ |
| 2 | `resolveCredential(T_B, custom, value)`（B 调 `O` 组织层建的 `acme/finetune-7b`） | `{ scope: tenant(T_B), value: K_B 的本体 }`——**组织层建的档案，成员调它用成员自己那一把** | [S-20](contract.md#s-20-resolvecredential) ⑤ |
| 3 | `resolveCredential(T_B, official, value)` | 同样是 `K_B`——租户有自己那一把，不论来源都用它 | 同上 |
| 4 | `resolveCredential(T_D, custom, present)` | `{ present: false }`——**结论，不是失败**；展示列表据此把这条自建档案标成「现在用不了、缺凭据」 | [S-20](contract.md#s-20-resolvecredential) ⑧ |
| 5 | `resolveCredential(T_D, custom, value)` | **`credentialUnavailable`** | 同上 |
| 6 | `resolveCredential(T_D, official, value)` | **`credentialUnavailable`**——这个部署没配出厂格那一把 | 同上 |
| 7 | `T_B` 那一格读不到，`resolveCredential(T_B, official, value)` | **`unavailable`** | [S-20](contract.md#s-20-resolvecredential) ⑧ |
| 8 | 任何一次以 `T_B`、`T_D` 为锚的取用 | **永远取不到 `K_P`**——只读锚那个租户与出厂格 | [S-20](contract.md#s-20-resolvecredential) |
| 9 | `bindCredential(T_B, T_B, ref_K_B2)`，然后再发一次同样的调用 | 第一次轮换、`boundAt` 更新，之后取值得 `K_B2`；第二次不写、`boundAt` 不动 | [S-19](contract.md#s-19-bindcredential) ⑦ |
| 10 | `bindCredential(T_A, organization(O), ref_K_O)` | **`invalidInput`**——组织那一层没有凭据可配，输入只收 `TenantId`；**不是** `notAuthorized` | [S-19](contract.md#s-19-bindcredential) ③ |
| 11 | （出厂格配了 `K_F`）`resolveCredential(T_D, official, value)` | `{ scope: factory, value: K_F 的本体 }`；`present` 答 `{ present: true, scope: factory }` | [S-20](contract.md#s-20-resolvecredential) ⑤ |
| 12 | （同上）`resolveCredential(T_D, custom, value)` | **`credentialUnavailable`，不是 `K_F`**——自建档案不落到出厂格那一把 | [S-20](contract.md#s-20-resolvecredential) ⑤、PF-013 decisions P33 |
| 13 | （同上）`T_B` 那一格读不到，`resolveCredential(T_B, official, value)` | **`unavailable`，不是 `K_F`**；随后 `unbindCredential(T_B, T_B)` 返回 `{ tenant: T_B, present: false }`，再取官方档案的值得 `K_F`、自建档案的值得 `credentialUnavailable`——**回到没配，不是回落** | [S-20](contract.md#s-20-resolvecredential) ⑧、[S-32](contract.md#s-32-unbindcredential) ⑨ |

## 5. 同路由名：不同的格各有一条，都成立

`Q` 的超管 C 先在 `Q` 的组织层建了自建档案 `vendor/new-model`；随后官方清单 #4 带上同名条目。

| 调用 | 预期 | 依据 |
|---|---|---|
| 装入清单 #4 | `vendor/new-model` → **`added`**：官方那一格里没有这个名字；`Q` 的自建那条不参与 | [S-18](contract.md#s-18-loadmanifest) 处置表、`data.model-profile/v5#S-3` |
| `listProfiles(T_C)` | `vendor/new-model` 出现**两次**：`{origin: official, routeName: "vendor/new-model"}` 与 `{origin: custom, scope: organization(Q), routeName: "vendor/new-model"}`，靠引用里的来源与范围分得开 | [S-17](contract.md#s-17-listprofiles) ⑤ |
| `listProfiles(T_A)` | 只有官方那一条——`Q` 的组织层不在 `O` 的链上 | [S-6](contract.md#s-6-范围链) |
| `registerProfile(T_C, organization(Q), {routeName: "acme/finetune-7b", …})` | **成功**——不在 `O` 组织层那一格；判定不读别的格，C 也就探不到 `O` 建过这个名字 | [S-14](contract.md#s-14-registerprofile) ④ |
| `registerProfile(T_A, tenant(T_A), {routeName: "acme/finetune-7b", …})` | **成功**——A 的租户层与 `O` 的组织层不是同一格；同名并存，谁生效按层覆盖（[S-17](contract.md#s-17-listprofiles) 末段） | [S-14](contract.md#s-14-registerprofile) ④、`data.model-profile/v5#S-3` |
| `胜出行(T_C, "vendor/new-model", A₁)`，`A₁` 含 `"vendor/new-model"` | `Q` 组织层那条自建——两条都在册、名字允许，取最具体一格 | [S-17](contract.md#s-17-listprofiles) 末段 |
| `胜出行(T_C, "vendor/new-model", A₂)`，**同一个 `T_C`** 的另一个会话格，`A₂` 不含它 | **没有胜出行**；落点是 `Q` 组织层那条，收场「这个范围不允许」——**同一租户同一路由名，胜出行随 `A` 变**，按 `(T, r)` 缓存的实现在这里答错 | 同上 |
| 允许集合读不到时求 `胜出行(T_C, "vendor/new-model", ·)` | **读的一方以失败收场**，不拿 `∅`（全拒）或全集（全放）顶替 | 同上 |

**本版 `A` 就是 `listProfiles(T_C)` 里出现的全部路由名**（[D-063 R-4](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)：不收窄），同一个 `T_C` 下各会话格的 `A` 相同，`A₂` 那一行演示的是将来收窄之后的规则、**本版不出现**；本版「允许集合读不到」就是列表读不到（[S-17](contract.md#s-17-listprofiles) ⑧）。

## 6. 每个失败值一个反例

| 失败值 | 调用 | 为什么 | 依据 |
|---|---|---|---|
| `invalidInput{malformed}` | `registerProfile(T_A, organization(O), {…, registration: listed})` | 建档内容带了 `registration`，由目录写、不由调用方给（`data.model-profile/v5#S-28`）；带 `updatedAt` 同样 | [S-14](contract.md#s-14-registerprofile) ①⑧ |
| `invalidInput{origin_not_custom}` | `registerProfile(T_A, organization(O), {…, origin: official})` | 建档只收自建档案；官方档案只经清单装入。**不是 `malformed`**——那份文档本身合形状 | [S-14](contract.md#s-14-registerprofile) ⑧ |
| `invalidInput{route_name_empty}` | `readProfile(T_A, {origin: official, routeName: ""})` | 引用过不了 `data.model-profile/v5#S-24` | [S-9](contract.md#s-9-缺席时的默认答案) |
| `invalidInput{malformed}` | `resolveCredential(T_A, official, ask = "secret")` | 问法不在两值之内 | [S-9](contract.md#s-9-缺席时的默认答案) 判别式闭合 |
| `invalidInput{malformed}` | `resolveCredential(T_D, 缺 origin, value)` | 来源必给，**缺它不当作「官方」**——否则自建档案会借缺席用上出厂格那一把 | [S-20](contract.md#s-20-resolvecredential) ⑧ |
| `invalidInput{malformed}` | `registerProfile(缺 initiator, …)` | 身份参数缺席，**不以「当前租户」补齐** | [S-9](contract.md#s-9-缺席时的默认答案) |
| `notAuthorized` | `registerProfile(T_B, organization(O), …)` | B 在 `O` 是普通成员，组织层只归超管 | [S-10](contract.md#s-10-配置资格谁能在哪一格写) |
| `notAuthorized` | `bindCredential(T_A, T_B, …)` | 租户那一把只归租户自己，超管也不行 | 同上、[S-19](contract.md#s-19-bindcredential) ② |
| `notAuthorized` | `readProfile(T_C, {origin: custom, scope: organization(O), …})` | `O` 不在 `T_C` 的链上；**先于解析，C 得不到「那里有没有」** | [S-16](contract.md#s-16-readprofile) ② |
| `routeNameTaken` | `registerProfile(T_B, tenant(T_B), {routeName: "b/local-proxy", …与第 3 节那一条内容不同})` | 同一格（B 的租户层）里已有这个名字 | [S-14](contract.md#s-14-registerprofile)、`data.model-profile/v5#S-3` |
| `officialProfileReadOnly` | `withdrawProfile(T_A, {origin: official, routeName: "openai/gpt-5"})`；`updateProfile`、`relistProfile` 对同一引用同值 | 官方档案谁都撤不了、改不了、恢复不了——**结构性，不是权限**；只经清单装入变化 | [S-15](contract.md#s-15-withdrawprofile) ③、[S-31](contract.md#s-31-updateprofile) ③、[S-33](contract.md#s-33-relistprofile) ③ |
| `manifestNotNewer` | 已装入序号 3 时装入 `ordinal = 3`、内容与清单 #3 不同 | 同序号不同内容 | [S-18](contract.md#s-18-loadmanifest) ⑦ |
| `profileNotFound` | `readProfile(T_A, {origin: custom, scope: organization(O), routeName: "acme/never"})` | 解析到零行 | [S-16](contract.md#s-16-readprofile) ⑧ |
| `credentialUnavailable` | 见第 4 节第 5 步 | 自建档案、这个租户没配自己那一把——出厂格那一把配没配都不取 | [S-20](contract.md#s-20-resolvecredential) ⑤⑧ |
| `unavailable` | `registerProfile(T_A, …)`，成员资格判定以 `unavailable` 失败 | 读不到 ≠ 无权，**不折成 `notAuthorized`** | [S-10](contract.md#s-10-配置资格谁能在哪一格写) |

**判定次序的五条回归例：**

| 调用 | 预期 | 为什么不是另一个 |
|---|---|---|
| `registerProfile(T_B, organization(O), {routeName: "acme/finetune-7b", …})` | `notAuthorized` | `O` 的组织层里确有这个名字，但授权先于名字判定——无权者拿不到 `routeNameTaken`（[S-14](contract.md#s-14-registerprofile) 末段） |
| 同上，**成员资格判定以 `unavailable` 失败**（故障注入） | **`unavailable`** | 授权判不出来，名字不再判：`unavailable` 排在 `routeNameTaken` 之前（[S-13](contract.md#s-13-这一节每个操作写全九件事)）。**得到 `routeNameTaken` 即违约**——那是把名字交给了一个没判出有权的调用方 |
| `withdrawProfile(T_C, {origin: official, routeName: "openai/gpt-5"})` | `officialProfileReadOnly` | 结构性禁止先于授权（[S-15](contract.md#s-15-withdrawprofile) 末段）；`updateProfile`、`relistProfile` 同样先于授权 |
| `updateProfile(T_C, {origin: custom, scope: organization(O), routeName: "acme/finetune-7b"}, {parameters: {maxOutputTokens: 1000000}})`——`O` 不在 `T_C` 的链上，这个 `patch` 会让那一行改完之后过不了 `data.model-profile/v5#S-18` | **`notAuthorized`** | 「改完的整份文档过 S-24」要读出那一行才判得出，排在授权与解析之后；**得到 `invalidInput{max_output_exceeds_profile}` 即违约**——那等于告诉无权者那一行在、且输出上限小于 10⁶，二分几次就测出上限（[S-31](contract.md#s-31-updateprofile) ⑥ 与末段；[D-060 §七 M14](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。那一行不存在时同样 `notAuthorized`，两种答案分不开 |
| 同上，但 `patch` 提到定义域以外的成员 `routeName` | `invalidInput{malformed}` | 只看输入本身的形状，仍在最左——它不泄露那一行的任何事（[S-31](contract.md#s-31-updateprofile) ③⑥） |

## 7. v3 绑定的写入修订与隔离

独立于前六节：租户 T 在自己那层登记路由 `vendor/model`，绑定为 B，其中
`implementation = {name:"example.transport",revision:"i1"}`、`definition = {modelId:"vendor/model",revision:"d1"}`、
`configuration = {revision:"c1",values:{limit:1,cache:{ttl:"example-ttl"}}}`。TTL 和配置键是测试数据，目录不判供应商支持。

| 触发 | 预期 | 依据 |
|---|---|---|
| 缺 `adaptation`、缺 `configuration.values`，或把 `values` 写为 `null` | `invalidInput{reason: malformed}`，不写行，不补空对象或默认绑定 | S-9、[S-34](contract.md#s-34-模型适配绑定的读写) 第 1 条；data v3 S-25 |
| B 的 `definition.modelId` 改成别的模型，路由名不变 | `invalidInput{reason: malformed}`；不会建立别名 | S-34 第 1 条 |
| 正常登记，再按引用读取与列表读取 | 两个读面都交出 B 的全部分量和值；列表行仍成对带 ref | S-14、S-16、S-17、S-34 |
| 原样重发登记，只调换配置对象成员顺序，数 `1` 改写成精确值相同的 `1.0` | 认回同一行；成员顺序与数值文本写法不是配置差异 | S-14 ⑦；data v3 S-29 |
| `updateProfile` 只提交 `adaptation.configuration` 局部替换，或要求删除 `adaptation` | `invalidInput{reason: malformed}`；只接受完整绑定替换 | S-31 ①、S-34 第 3 条 |
| 完整替换为同 `c1`、不同 `values` 的绑定 | 授权与解析后 `invalidInput{reason: malformed}`，档案及判重事实均不变 | S-31 ⑥、S-34 第 4～5 条 |
| 完整替换为 `c2`、新值，其余合法 | 成功采用新绑定；只改绑定不改变 `updatedAt` 或在册状态 | S-31 ④、S-34 第 3 条 |
| 此后先重启，再用 `c1` 携带不同于初始 B 的值更新 | `invalidInput{reason: malformed}`；不能因当前行是 c2 或重启而忘掉 c1 | S-34 第 4～6 条 |
| 改回 `c1`，值与原始 B 精确相同 | 通过配置判重，按原修订规则采用；没有自动补默认值 | S-34 第 4 条 |
| 撤回后以新值重登记同路由名、同 c1；随后恢复并同样修订 | 重登记先报配置内容冲突；恢复仍是同一行，修订也报冲突。原样重登记已撤回行仍是 `routeNameTaken` | S-14 ⑥⑦、S-33、S-34 第 6 条 |
| 另一租户 U、组织 O 或 official 同名行使用字符串 c1 但给不同值 | 各在自己的档案身份内判断，不因 T 已使用 c1 而冲突；授权照旧 | S-6、S-10、S-34 第 4 条 |
| T 的档案原来是 c1；并发两次更新到新 c3，值分别为 `{limit:3}` 与 `{limit:4}` | 真并发下至多一次成功，另一处配置冲突；行和 c3 判重事实对应同一次成功提交 | S-31 ④⑦、S-34 第 5 条 |
| 配置判重事实读取或写入失败 | `unavailable`，不把“读不到”当“未用过”；失败前后的档案和值对应事实不变 | S-34 第 5 条 |
| 无权者对存在或不存在的受保护档案发同一个结构合法、会冲突的绑定 | 两次都是 `notAuthorized`，不读取受保护历史，不泄露冲突 | S-10、S-31 ⑥、S-34 末段 |
| B 引用的实现从未注册或已停准入 | 目录仍能保存、读出结构合法的 B；运行时打开调用时不可用，不替换为当前实现，不静默改 profile | S-34 第 2 条、[S-35](contract.md#s-35-发布采用与停止旧准入) |

使用超出 IEEE-754 整数精度的 JSON 数，以及任意深度重复成员的原始文本另跑接收边界检查：前者无损比较；后者在对象化前拒绝，不能把丢失信息后的对象当作原值。这里不声称目录的 Schema 能完成这些检查。

## 8. 发布采用与停止旧准入的交接

预置 official 档案 F 与组织或租户自建档案 C，两者路由相同且都明确绑定旧版本 B1；已打开调用 A 持有 B1。新绑定 B2 的配置值、修订和模型 ID 合法。

| 触发 | 预期 | 依据 |
|---|---|---|
| 注册 B2 所需版本失败 | 不执行目录采用，F、C 仍是 B1；不报新版本已采用 | [S-35](contract.md#s-35-发布采用与停止旧准入) 第一行 |
| 注册成功，装入采用 B2 的新序号清单时目录提交失败 | F、C 和原序号、处置、配置判重事实保持原样；B2 的注册存在不被目录“回滚” | S-18 ④、S-35 第二行 |
| 新序号清单含多个条目，其中 F 把已经采用的 c1 改义 | 整份 `invalidInput{reason: malformed}`，任何行、新修订事实、序号和处置均不部分成立 | S-18 ⑥⑧、S-34 第 5 条 |
| 输入形状合法，但用旧序号或相同序号不同内容装入，且存在 c1 改义 | 仍先 `manifestNotNewer`；不能用新校验改变既有序号判定次序 | S-18 ⑥⑦ |
| 合法清单提交成功，只有适配绑定变化 | F 是 B2，处置 `updated`，其 `updatedAt` 不动；C 及其判重事实仍是 B1；A 的快照保持 B1 | S-18、S-34、S-35 |
| 上一步回执丢失，重启目录后原样重装同序号清单 | 返回先前耐久记下的相同处置；不重算成 `unchanged` | S-18 ⑦、S-23 |
| 未更新 C 就显式停止 B1 准入 | C 仍完整指向 B1；C 的新调用如实不可用，不转用 F 的 B2。已经取得 B1 的 A 按生命周期契约收口 | S-35；runtime 侧版本引用场景 |
| 有权管理者显式把 C 完整更新为 B2 | C 在自身提交点采用 B2；不依赖 official 发布时的事务，也不改变自己的 custom 来源和凭据规则 | S-31、S-34、S-35 |

这组场景必须分开登记目录局部证据与注册/运行时真实组合证据；把目录、注册表替换为固定成功对象不能通过后一种验收。范围外中心与据点协议不因本组本机通过而关闭 G-7。


## 9. 输入上限与上游事实

本节数值只是规范场景的显式输入，不是生产 cap 或上游事实。
例示 image 档案 `I` 的 `maxInputTokens = 1000`，`inputConstraints = {maxImageBytes: 100, maxImages: 2, maxRequestBytes: 10000}`，
`upstreamInputLimits = {maxInputTokens: {status: "limited", value: 2000}, maxImageBytes: {status: "unknown"}, maxImages: {status: "unbounded"}, maxRequestBytes: {status: "limited", value: 20000}}`；输入模态含 text、image，其余完整成员沿前文。
非 image 实例的输入事实明确给 `maxInputTokens: {status: "unknown"}` 和 `maxRequestBytes: {status: "unknown"}`，不含 image 指标；每份实际输入仍显式给有限 token cap。

| 输入 / 交错 | 预期 | 依据 |
|---|---|---|
| 建档 I 后单读、列表、原样重建 | 完整 caps/facts 往返；重建认回原行与原时刻 | S-14、S-16、S-17、S-36 |
| image 档案缺 maxImageBytes，即使请求只发文字 | 建档 / 清单 invalidInput/malformed，整份不写 | data v4 S-9、S-25；S-36 |
| I 的 maxImageBytes 从 unknown 改 limited(100)，cap 仍为 100 | 合法，事实单变推动 updatedAt | data v4 S-11、S-33；S-36 |
| 上一行后只改 cap 为 101 | invalidInput/malformed，整行和时刻不变 | S-31、S-36 |
| cap 从 100 改 90，事实不变 | 合法，时标记本次写入时刻且不倒退 | S-36 |
| 同一数值 / 对象键重排 / 模态集合重排 | 逐值相等，不写、不动时标 | data v4 S-28；S-31 |
| 仅 providers、parameters、adaptation 或 registration 变 | 时标不动；其余各自写入/配置修订规则仍成立 | S-36 |
| 同 ordinal 清单只改上游事实（条目本身仍合法） | manifestNotNewer，不误认同一清单 | S-18、S-36 |
| 新 ordinal 清单只改事实；下一次清单仅改绑定 | 前者 updated 且时标动；后者 updated 且时标不动 | S-18、S-36 |
| 旧行 non-image 改 image 但未一起提供 cap/facts | 在解析后 invalidInput/malformed；无权者仍先得 notAuthorized | S-31、S-38 |
| 清单含一条合法新增配置修订及一条 cap 超界 | invalidInput/malformed；无行、序号、处置、配置历史的部分提交 | S-18、S-38 |
| 发前持有旧快照，目录完成一次合法 cap/facts 更新 | 新读面得新完整行；旧快照原值不变，不拿现目录补旧字段 | S-36 |
| v4 读面遇旧行缺新必填事实 / cap | unavailable；列表不返回可读子集，不补默认值 | S-36 第 6 项 |
| 来源核实后的显式完整内容升级 | 新读面仅在完整合法状态提交后可读；历史调用原内容仍不变 | S-36、G-12 |

同一时钟精度内两次合法变化的时标允许相等；用更晚测试时刻才能断言数值严格增加，不能把时标当修订 ID。
