# 规范实例：走通的路径与每个失败值的反例

属于 `capability.session-log` v1 的规范工件。本契约**不附 Schema**，所以这里的实例不是形状校验用例，
而是**操作层面的输入 → 预期结果 → 依据条款**：前五节各走通一条路径，第六节给每个失败值一个反例。

**读法上的边界：**

- **标识串与键只是占位**：`s1`、`R`、`tool:c7:call`、`resp:r9` 这类写法不承诺任何词法（`data.identity-values/v1#S-31`）；**键怎样拼归写入方**，这里的拼法只为好读。
- **「预期」是契约要求的可观察结果，不是某次执行的记录**；执行状态在[验证入口](../verification.md)。
- **条目写成** `⟨tenant, run?, attempt?, payload, dedupeKey?, readKeys⟩`；载荷只写种类。`fence` 恒写出（[S-15](contract.md#s-15-缺席时的默认答案)：必填判别式）。

**共用的局面**（除非某节另说）：

| 名字 | 是什么 |
|---|---|
| `s1` | 一个会话；持有的租户身份是 `T1`（`capability.session-tenancy` 答的那一个） |
| `R` | `s1` 里的一个运行；尝试 1、2 |
| `c7` | 尝试 1 里一次工具调用的 `CallId` |
| `mc1` | 尝试 1 里一次模型调用；第 1 次发出的 `ResponseId` 是 `r9` |

## 1. 尝试开始与带栅栏的写

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `append(s1, [⟨T1, R, 1, 尝试开始(attempt 1), —, {}⟩], fenced{R, 1})` | 成功，`positions = [1]`，`tail = 1`；这本日志的租户身份定为 `T1` | [S-10](contract.md#s-10-尝试栅栏)、[S-12](contract.md#s-12-一本日志一个租户身份) 第 1 条 |
| 2 | `append(s1, [⟨T1, R, 1, 已出门(mc1, 发出 1, r9), "mc:mc1:dispatched:1", {"mc:mc1"}⟩], fenced{R, 1})` | 成功，位置 2 | 同上；[S-8](contract.md#s-8-判重键) |
| 3 | 停机；loop 以尝试 2 恢复：`append(s1, [⟨T1, R, 2, 尝试开始(attempt 2), —, {}⟩], fenced{R, 2})` | 成功，位置 3 | [S-10](contract.md#s-10-尝试栅栏) 第 2 条 |
| 4 | 尝试 1 那副半死不活的协程醒来：`append(s1, [⟨T1, R, 1, 已开口(mc1, 发出 1), "mc:mc1:opened:1", {"mc:mc1"}⟩], fenced{R, 1})` | **`attemptSuperseded`**，一条都没写 | [S-10](contract.md#s-10-尝试栅栏) 第 6 条 |
| 5 | 对账为 `mc1` 追补响应体（结算不设栅栏）：`append(s1, [⟨T1, R, 1, 响应体(r9, late), "resp:r9", {"mc:mc1"}⟩], unfenced)` | 成功，位置 4 | [S-10](contract.md#s-10-尝试栅栏) 第 3 条 |
| 6 | `readByKey(s1, "mc:mc1")` | 位置 2、4 两条，按位置升序；`tail = 4` | [S-18](contract.md#s-18-readbykey按读取键读) |

## 2. 工具结果的送达：停机重排不多一条

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | 工具执行运行时排空一项出站项：`append(s1, [⟨T1, R, 1, ToolInternalMessage(c7), "tool:c7:call:internal", {}⟩, ⟨T1, R, 1, ToolMessage(c7), "tool:c7:call:msg", {}⟩, ⟨T1, R, 1, 记录条目(c7, seq 5), "tool:c7:call:entry:5", {}⟩], unfenced)` | 成功，三条取连续位置；**整批一起可见** | [S-13](contract.md#s-13-提交与持久) 第 1 条、[S-17](contract.md#s-17-append追加一批条目) ④ |
| 2 | 写下之后、它把出站项标成已送达之前据点进程被杀；重启后排空器再交同一批 | **`alreadyRecorded{keys: [三个判重键]}`**，日志不多一条 | [S-8](contract.md#s-8-判重键) 第 2、3 条、[S-22](contract.md#s-22-回执丢失与结果未知) 第 1 条 |
| 3 | 另一种时序：第 1 步收到 `unavailable` | 结果未知（没写或整批已写）；排空器重交——得成功即上次没写、得 `alreadyRecorded` 即上次已写；两种都只留一份 | [S-22](contract.md#s-22-回执丢失与结果未知) |
| 4 | 旧任与新任两个排空器同时交同一批 | 恰一路成功、另一路 `alreadyRecorded`；**不会两路各判一次「不在」** | [S-14](contract.md#s-14-同一会话的追加一条接一条判定与写入是同一步) 第 2 条 |

## 3. 回复与它的响应体：一次写下，或一起不写

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | agent loop 把回复落盘：`append(s1, [⟨T1, R, 2, AssistantMessage(r12), —, {}⟩, ⟨T1, R, 2, 响应体(r12, persisted), "resp:r12", {}⟩], fenced{R, 2})` | 成功，两条连续位置 | [S-17](contract.md#s-17-append追加一批条目) 末段 |
| 2 | 换一种时序：宿主停止，模型请求运行时先以撤除结算写下 `⟨…, 响应体(r12, interrupted), "resp:r12", …⟩`；loop 随后交第 1 步那一批 | **`alreadyRecorded{keys: ["resp:r12"]}`**，**回复消息也没写** | [S-8](contract.md#s-8-判重键) 第 3 条；`capability.model-request-runtime/v1#S-17` |

## 4. 从某个位置往后读

接第 1 节（日志里四条）。

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | `readSince(s1, 0)` | 位置 1～4，按位置升序；`tail = 4` | [S-19](contract.md#s-19-readsince从某个位置往后读) |
| 2 | `readSince(s1, 2)` | 位置 3、4 | 同上 |
| 3 | `readSince(s1, 4)` | 空序列，`tail = 4`——一个读得到的结论 | 同上 ⑤ |
| 4 | `readSince(s1, 9)` | 空序列，`tail = 4`：调用方凭 `tail < after` 知道它的水位不属于这本日志 | 同上 ⑤ |
| 5 | `readSince(s2, 0)`，`s2` 从未追加过 | 空序列，`tail = 0`——**不是失败** | [S-5](contract.md#s-5-一个会话一本会话日志) 第 4 条 |

## 5. 会话级的条目与会话归档之后

| 步 | 调用 | 预期 | 依据 |
|---|---|---|---|
| 1 | 交付面切换模型：`append(s1, [⟨T1, —, —, 模型切换(route "fast"), —, {"model_selection"}⟩], unfenced)` | 成功：会话级条目不带运行与尝试 | [S-6](contract.md#s-6-条目与它的壳) |
| 2 | `readByKey(s1, "model_selection")` 取最后一条 | 那条切换记录 | [S-18](contract.md#s-18-readbykey按读取键读) |
| 3 | `s1` 被归档；归档那一次提交里交付的出站项随后排空 | 照常写得进 | [S-24](contract.md#s-24-会话归档之后) |

## 6. 每个失败值的反例

| 失败值 | 调用 | 为什么 |
|---|---|---|
| `invalidInput` | `append(s1, [], unfenced)` | `entries` 为空 |
| `invalidInput` | `append(s1, [⟨T1, R, —, …⟩], unfenced)` | 带了运行没带尝试（[S-6](contract.md#s-6-条目与它的壳)） |
| `invalidInput` | `append(s1, [⟨T1, R, 1, …⟩])` | `fence` 缺席：**不补成 `unfenced`**（[S-15](contract.md#s-15-缺席时的默认答案)） |
| `invalidInput` | `append(s1, [⟨T1, R, 1, …⟩], fenced{R, 2})` | 带栅栏的一批里条目的尝试与栅栏不同（[S-10](contract.md#s-10-尝试栅栏) 第 4 条） |
| `invalidInput` | `append(s1, [⟨T1, …, "k"⟩, ⟨T1, …, "k"⟩], unfenced)` | 同一批两条判重键相同 |
| `invalidInput` | `append(s1, [⟨T1, …⟩, ⟨T2, …⟩], unfenced)` | 同一批两个租户身份（[S-12](contract.md#s-12-一本日志一个租户身份) 第 2 条） |
| `invalidInput` | 一条的载荷里有重复成员名 `{"a": 1, "a": 2}` | 不是 RFC 8259 严格读得出的一个值（[S-11](contract.md#s-11-只增不改载荷原样) 第 2 条） |
| `invalidInput` | `readSince(s1)`、`readSince(s1, -1)` | `after` 缺席或小于 0：**不补成从头读** |
| `tenantMismatch` | 日志已由 `T1` 定下，`append(s1, [⟨T2, …⟩], unfenced)` | [S-12](contract.md#s-12-一本日志一个租户身份) 第 2 条 |
| `attemptSuperseded` | 第 1 节第 4 步 | [S-10](contract.md#s-10-尝试栅栏) |
| `alreadyRecorded{keys}` | 第 2 节第 2 步、第 3 节第 2 步 | [S-8](contract.md#s-8-判重键) 第 3 条 |
| `unavailable` | 日志存储读不到时的任一操作 | [S-15](contract.md#s-15-缺席时的默认答案)：**读操作不交回空序列**；`append` 的结果未知（[S-22](contract.md#s-22-回执丢失与结果未知)） |
