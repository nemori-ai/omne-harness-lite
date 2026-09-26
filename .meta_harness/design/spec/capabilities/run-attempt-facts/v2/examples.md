# 规范实例：走通的路径与每个失败值的反例

属于 `capability.run-attempt-facts` v2 的规范工件。本契约**不附 Schema**，这里是**操作层面的输入 → 预期结果 → 依据条款**。

- **标识只是占位**：`s1`、`R`、`Q` 不承诺任何词法（`data.identity-values/v1#S-31`）。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。
- 日志条目只写壳上的 `(run, attempt)` 与种类。

**共用的局面**：会话 `s1` 的会话日志按位置依次是——

| 位置 | 壳 | 条目 |
|---|---|---|
| 1 | `(R, 1)` | 尝试开始（尝试 1） |
| 2 | `(R, 1)` | 一次工具调用的结果 |

## 1. 取代之前与之后

| 步 | 发生了什么 / 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `attemptFacts(s1, R, 1)` | `{ superseded: false, runEnded: false }` | [S-5](contract.md#s-5-两件事实) |
| 2 | loop 落下位置 3：`(R, 2)` 尝试开始（尝试 2） | —— | —— |
| 3 | `attemptFacts(s1, R, 1)` | `{ superseded: true, runEnded: false }`；此刻 `capability.session-log` 对 `fenced{R, 1}` 的追加收 `attemptSuperseded`——同一个条件 | [S-5](contract.md#s-5-两件事实) 第 1 条 |
| 4 | `attemptFacts(s1, R, 2)` | `{ superseded: false, runEnded: false }` | 同上 |

## 2. 终结之后

接第 1 节。

| 步 | 发生了什么 / 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | loop 落下位置 4：`(R, 2)` 运行终结 | —— | —— |
| 2 | `attemptFacts(s1, R, 2)` | `{ superseded: false, runEnded: true }` | [S-5](contract.md#s-5-两件事实) 第 2 条 |
| 3 | `attemptFacts(s1, R, 1)` | `{ superseded: true, runEnded: true }` | 同上；[S-6](contract.md#s-6-只从假变真) |

## 3. 读与落账之间的窗口（不闭合，只说明它只漏不误）

| 步 | 发生了什么 | 结果 | 依据 |
|---|---|---|---|
| 1 | 工具执行运行时读 `attemptFacts(s1, R, 1)`，得 `superseded: false` | —— | —— |
| 2 | loop 落下 `(R, 2)` 尝试开始 | —— | —— |
| 3 | 工具执行运行时提交收场与账，`late` 缺席 | 账落下时尝试 1 已被取代，却写成「不晚」：**漏标**。本版不闭合 | [S-6](contract.md#s-6-只从假变真) 第 4 条、[G-2](contract.md#十已知缺口) |
| 反过来 | 第 1 步读得 `superseded: true` | 到它提交时仍为真：**不会误标** | [S-6](contract.md#s-6-只从假变真) |

## 4. 每个失败值的反例

| 失败值 | 调用 | 为什么 |
|---|---|---|
| `invalidInput` | `attemptFacts(s1, R)` | 尝试缺席：**不补成「当前那次」** |
| `invalidInput` | `attemptFacts(s1, R, 0)` | 尝试序号不是 ≥ 1 的整数 |
| `attemptNotFound` | `attemptFacts(s1, R, 7)` | 日志里没有 `(R, 7)` 的任何条目；**不答两个 `false`** |
| `attemptNotFound` | `attemptFacts(s1, Q, 1)` | 运行 `Q` 从没出现 |
| `unavailable` | 会话日志读不到时的任一调用 | 判不出来；**不交回任何真值** |
| `unavailable` | 产品装配里，提供者认不出终结记录（[G-3](contract.md#十已知缺口)） | 「已终结」判不出：两件事实一起不答 |
