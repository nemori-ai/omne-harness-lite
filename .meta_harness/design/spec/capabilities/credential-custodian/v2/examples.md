# 规范实例：副本、OAuth 条目与每个失败值的反例

属于 `capability.credential-custodian` v2 的规范工件。本契约**不附 Schema**，这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前三节各走通一条路径，第四节给每个失败值一个反例。

**两条读法上的边界：**

- **标识串只是占位**：`T1`、`L1`、`b1`、`r1` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）；`值甲` 之类指一段凭据本体。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| 据点 `P_A` | 账号 A 在这台机器上的据点；`T1 = (O, A)`、`T2 = (Q, A)` 是 A 的两个租户身份 |
| 据点 `P_B` | 账号 B 在同一台机器上的据点；`T3 = (O, B)` |
| `L1`、`L2` | A 在 `P_A` 上先后两个登录状态 |
| `h1 = { tenant: T1, endpoint: E, scope: tenant(T1) }` | `T1` 在接入点 `E` 上的那份持有 |
| `b1` | `h1` 上的一个 OAuth 绑定 |

## 1. 副本：写、读、离线、按登录状态清除

以下都在 `P_A` 上。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `readReplica(T1)` | `{ absent }`——还没写过；调用方可以去问中心 | [S-13](contract.md#s-13-readreplica) ⑤ |
| 2 | `storeReplica(L1, T1, 值甲)` | `{ tenant: T1 }`——不回显本体 | [S-12](contract.md#s-12-storereplica) ⑤ |
| 3 | 切断到中心的连接，`readReplica(T1)` | `{ body: 值甲 }`——离线照常 | [S-13](contract.md#s-13-readreplica)、[S-22](contract.md#s-22-离线用副本) |
| 4 | `storeReplica(L1, T2, 值乙)`；A 重新登录得 `L2`，`storeReplica(L2, T1, 值丙)`（中心上换了一把） | `T1` 的副本整条换成 `值丙`，**归属 `L2`**；`T2` 仍归属 `L1` | [S-5](contract.md#s-5-保管条目)、[S-12](contract.md#s-12-storereplica) ④ |
| 5 | `discardLoginState(L1)` | `{ loginState: L1 }`；之后 `readReplica(T2)` 为 `{ absent }`，**`readReplica(T1)` 仍是 `值丙`**——它已归属 `L2` | [S-15](contract.md#s-15-discardloginstate) 末条 |
| 6 | 再做一次第 5 步 | 同一个成功返回 | [S-15](contract.md#s-15-discardloginstate) ⑦ |
| 7 | `discardReplica(T1)` 两次 | 两次都是 `{ tenant: T1, present: false }` | [S-14](contract.md#s-14-discardreplica) ⑦ |

## 2. 据点隔离与加密落地

| 情形 | 预期 | 依据 |
|---|---|---|
| `P_A` 上 `storeReplica(L2, T1, 值丙)`；`P_B` 上 `readReplica(T1)` | `P_B` 答 **`{ absent }`** | [S-6](contract.md#s-6-据点隔离与按登录状态归属) 第 1 条、[S-23](contract.md#s-23-另一个账号的据点读不到) |
| 把 `P_A` 落地的**条目**拷到 `P_B` 下（`P_B` 的密钥不变），`P_B` 上 `readReplica(T1)` | 仍是 **`{ absent }`**：`P_B` 用自己的密钥打不开；拷出的内容里扫不到 `值丙` 的明文。连 `P_A` 的密钥一起拷是 [S-3](contract.md#s-3-本契约明确不承诺什么) 不挡的情形，不在这一行 | [S-7](contract.md#s-7-加密落地)、[S-26](contract.md#s-26-加密落地) |
| `P_A` 的密钥此刻取不到，`readReplica(T1)` | **`unavailable`**——不答 `absent` | [S-7](contract.md#s-7-加密落地)、[S-13](contract.md#s-13-readreplica) ⑧ |
| `P_A` 的密钥取不到，`storeReplica(L2, T1, 值丁)` | **`unavailable`**，什么都没写——**不以明文落地** | [S-12](contract.md#s-12-storereplica) ⑧ |
| `T1` 那一条被损坏（用密钥也打不开），`readReplica(T1)` | **`{ absent }`**，并留一条工程记录（不含本体与引用）；中心可达时调用方重取、重写即替换它 | [S-7](contract.md#s-7-加密落地) 末条 |

## 3. OAuth 条目：收下、交出、清扫

以下都在 `P_A` 上；绑定的迁移由桥做（`capability.mcp-bridge/v2#S-8`、`#S-23`）。

| 步 | 发生了什么 | 预期 | 依据 |
|---|---|---|---|
| 1 | `b1` 为 `pending`；`depositOAuth(h1, b1, 令牌甲)` | `{ ref: r1 }`——待生效 | [S-16](contract.md#s-16-depositoauth) |
| 2 | `resolve(r1, h1)` | **`notResolvable`**——绑定还不是 `granted` | [S-17](contract.md#s-17-resolve) ⑥ |
| 3 | 回执丢了，桥重试一次 `depositOAuth(h1, b1, 令牌甲)` | `{ ref: r2 }`，**`r2 ≠ r1`**——不幂等 | [S-16](contract.md#s-16-depositoauth) ⑦ |
| 4 | 桥把 `b1` 迁 `granted`、记下 `r2` | —— | `capability.mcp-bridge/v2#S-23` |
| 5 | `resolve(r2, h1)` | `{ body: 令牌甲 }` | [S-17](contract.md#s-17-resolve) |
| 6 | `resolve(r1, h1)` | **`notResolvable`**——绑定记下的不是它 | [S-17](contract.md#s-17-resolve) ⑥ |
| 7 | 过 `sweepInterval` | `r1` 被丢（`granted` 而记下的不是它）；`r2` 不丢 | [S-18](contract.md#s-18-清扫) |
| 8 | `resolve(r2, { tenant: T3, endpoint: E, scope: tenant(T3) })` | **`notResolvable`**——持有不对；与「从没发过」同一个值 | [S-17](contract.md#s-17-resolve) 末段第一条 |
| 9 | 续期被授权服务器拒绝，桥把 `b1` 迁 `revoked`；`resolve(r2, h1)` | **`notResolvable`**；过 `sweepInterval` 之后 `r2` 被丢 | [S-17](contract.md#s-17-resolve)、[S-18](contract.md#s-18-清扫) |

**清扫与完成交错**（[S-18](contract.md#s-18-清扫) 第 2 条；形式模型 [`formal/Sweep.tla`](formal/Sweep.tla)）：新绑定 `b2` 为 `pending`，`depositOAuth(h1, b2, 令牌乙)` 得 `r3`。

| 谁先排到 `b2` | 那一刻 `b2` 过没过期 | 结局 |
|---|---|---|
| 桥的完成 | 没过 | `b2` 迁 `granted` 记下 `r3`；清扫随后排到，不丢 `r3` |
| 清扫 | 没过 | 不丢；桥随后完成，同上 |
| 清扫 | 已过 | 丢 `r3`；桥随后排到，读到的时刻不早于清扫那一刻 ⇒ 同样判过期 ⇒ **不迁 `granted`**（`oauthDenied`） |
| 任一方 | **恰在边界**：`now = since + oauthPendingTtl` | **不算过期**（`now > since + oauthPendingTtl` 才过期）：清扫不丢；桥迁 `granted` 记下 `r3`——两边同一个谓词，所以不会一边判过期、一边判未过期 |

**任何一行都不出现「`b2` 为 `granted` 而 `resolve(r3, h1)` 得 `notResolvable`」**——前提是记下的条目可开封（契约第七节）。**打不开的那一种不在这张表里**：密钥换了之后 `resolve(r2, h1)` 得 `notResolvable`，`r2` 不属于三种可丢、`b1` 仍 `granted`——**本版留下**，人重新授权之前交不出（[S-7](contract.md#s-7-加密落地) 第三条、[G-10](contract.md#十一已知缺口)）。

## 4. 每个失败值一个反例

| 失败值 | 调用 | 为什么 | 依据 |
|---|---|---|---|
| `invalidInput` | `storeReplica(缺席, T1, 值甲)`；`depositOAuth({ tenant: T1, endpoint: E, scope: organization(O) }, b1, …)` | 身份参数没有默认值；组织格不持有 MCP 凭据 | [S-9](contract.md#s-9-缺席时的默认答案)、[S-16](contract.md#s-16-depositoauth) ③ |
| `custodianWithdrawn` | 本能力撤除开始之后的 `readReplica(T1)` | 这一次没有结论 | [S-20](contract.md#s-20-撤除重启与在途) |
| `unavailable` | 存储读失败时 `resolve(r2, h1)` | 读不到不是「不交」 | [S-17](contract.md#s-17-resolve) ⑧ |
| `bindingUnknown` | `depositOAuth(h1, 一个这个据点上没有的绑定号, …)` | 条目必须指着一个存在的绑定 | [S-16](contract.md#s-16-depositoauth) ④⑧ |
| `notResolvable` | 第 3 节第 2、6、8、9 步；另：`resolve(一个从没发过的串, h1)` | 五种不分 | [S-17](contract.md#s-17-resolve) ⑥ |

**次序回归例**：

1. 撤除中、存储也读不到：`custodianWithdrawn`（先于 `unavailable`）。
2. 持有不在租户格、存储也读不到：`invalidInput`（先于 `unavailable`）——表示层校验在任何读取之前。
3. 存储读得到、绑定读不到：`unavailable`（不是 `notResolvable`）。
