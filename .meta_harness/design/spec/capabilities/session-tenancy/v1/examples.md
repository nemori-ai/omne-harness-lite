# 规范实例：走通的路径与每个失败值的反例

属于 `capability.session-tenancy` v1 的规范工件。本契约**不附 Schema**，这里是**操作层面的输入 → 预期结果 → 依据条款**。

- **标识只是占位**：`s1`、`T1` 不承诺任何词法（`data.identity-values/v1#S-31`）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。

**共用的局面**：映射里记着 `s1 → T1`、`s2 → T2`；`s9` 从没记过。

## 1. 答出，且不变

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `holdingTenant(s1)` | `{ tenant: T1 }` | [S-8](contract.md#s-8-holdingtenant读会话持有的租户身份) |
| 2 | 登录状态上的当前租户身份此后被改成 `T2`；`holdingTenant(s1)` | 仍是 `T1`——会话持有的是创建那一刻捕获的值 | [S-5](contract.md#s-5-会话持有的租户身份) 第 2 条 |
| 3 | 重启提供者；`holdingTenant(s1)` | 仍是 `T1` | [S-6](contract.md#s-6-答案不变)、[S-11](contract.md#s-11-提供者撤除换代与重启) |

## 2. 没有记录，稍后有了

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `holdingTenant(s9)` | **`sessionNotFound`**：不是「没有租户」，不交回任何租户身份 | [S-7](contract.md#s-7-缺席时的默认答案与失败值) |
| 2 | 会话那一侧（验收里是测试种子）记下 `s9 → T2`；`holdingTenant(s9)` | `{ tenant: T2 }` | [S-6](contract.md#s-6-答案不变) 第 2 条 |

## 3. 每个失败值的反例

| 失败值 | 调用 | 为什么 |
|---|---|---|
| `invalidInput` | `holdingTenant()` | 会话缺席：**不从进程上下文或当前登录状态补** |
| `invalidInput` | `holdingTenant(42)` | 不合 `SessionRef` |
| `sessionNotFound` | `holdingTenant(s9)`（第 2 节第 1 步） | 读得到、没有这个会话的记录 |
| `unavailable` | 映射的存储读不到时 `holdingTenant(s2)` | 判不出来；**不改答 `sessionNotFound`，不交回别的租户** |
