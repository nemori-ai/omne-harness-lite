# tool 实现规格

本页说明本实现怎样满足[契约 SPEC](../tool-contract/SPEC.md)：独立执行作用域与执行包装器，以及之后的受理决定器、记录仓、推进协程和耐久性怎样依赖记录仓提供者。本页不另写公共保证，也不能用实现限制改写公共承诺。

下列决定已接受，由本包承担。完整记录见契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)：G1 账本工厂与记录仓端口，G2 独立执行作用域，G6 的 runtime 测试装配与记录仓一致性用例，G8 的 `executeTool`、`createIndependentToolScope`、`createToolRuntime` 及其构造形状。

## 当前范围

已实现：`createIndependentToolScope`（G2）与 `executeTool`（G8），即契约 SPEC [P11](../tool-contract/SPEC.md#p11-作者输出与等待原语) 的独立路径。尚未实现：`createToolRuntime`、账本工厂与记录仓端口（M3）。内部机制见 [architecture](docs/architecture.md)。

## 独立执行怎样满足 P11

### 作用域的数据

一个作用域对应一次执行。它持有三组状态：

- 输出账：受理序号、待确认的字节数与条数、每个 `index` 的模式、封块状态与累计字节、一条串行交接链、第一条接收者没有接下的输出。
- 等待历史：按 `key` 的记录表。每条记录保存 key、输入摘要、固定后的请求、结果、在途 Promise 和中断器。作用域另记已预留的历史字节与当前活动等待。
- 收尾：第一次关闭的种类（`returned`、`failed` 或 `cancelled`）、取消标志和 `finish` 的记忆。

作者只拿到 `context`。`context.mode` 固定为 `independent`，`context.signal` 是输入的信号。

### emit

受理前先复制并检查输入。检查顺序是：作用域是否已关闭或取消，是否有接收者，输入形状，`index` 的模式与封块状态，容量。`replace` 的内容必须是 `judgeContentBlock` 接受的块，且 `visibility.toHuman` 为 `true`，因为过程输出只面向人。独立模式没有保管者，所以不核对附件资格。拒绝的更新不占序号，不进入交接链，以后也不会发送。

受理在第一次 `await` 之前完成：序号加一，待确认额度扣减，块状态更新。之后更新进入交接链。链上每条更新在前一条的接收结果返回后才交给接收者，所以并发 emit 按受理顺序到达，后一条的接收结果不能先发布。回执是 `{ kind: 'local', sequence }`，只说明接收者已接管。

字节按固定编码计算：`JSON.stringify({ sequence, update })` 的 UTF-8 长度。`append-text` 的累计状态是该块未封前所有文本的 UTF-8 字节和。`replace` 的累计状态是最新块的 JSON 字节数。封块后累计状态归零，只保留模式与封块标记。

容量有两个账，都以 `authorBufferBytes` 为上限，分别计算：待确认输出的字节与条数，以及全部未封块的累计字节。单条更新或单块累计状态超过上限返回 `too-large`。待确认条数达到 `authorBufferItems`，或剩余字节不足，返回 `capacity`。两者都不排队。

### wait

检查顺序是：作用域是否已关闭或取消，是否有提供者，请求形状，key 的历史，活动等待，历史容量。

请求形状按闭合字段检查。Ask 只允许 `kind`、`key`、`contract`、`request`。Resource 另有 `deadline`。多余字段返回 `invalid`。`contract` 只核形状：`kind` 与请求一致，`expiry` 合法，`adoption` 四个字段是字符串，`request.maxBytes` 与 `response.maxBytes` 是正安全整数。契约包的句柄标记不公开，所以本包不能核对品牌。`maxBytes` 不是正安全整数时返回 `unsupported`。`request` 必须是合法的标签 JSON 树，且编码后不超过 `contract.request.maxBytes`，否则返回 `invalid`。Resource 的 `deadline` 为字符串时，契约的 `expiry` 必须是 `supported`，且值必须是 ISO 8601 时刻，否则返回 `invalid`。

输入摘要由 kind、adoption、deadline 和请求的规范 JSON 文本组成。同 key 同摘要共享原记录：已结束则返回原结果，在途则共享同一个 Promise，提供者不会被再次调用。同 key 异摘要返回 `conflict`。有活动等待时开放别的 key 返回 `busy`。

新 key 先预留历史容量。预留量是 `contract.request.maxBytes + contract.response.maxBytes + key 的字节数`。预留量超过 `authorWaitHistoryBytes` 返回 `too-large`。条数达到 `authorWaitHistoryItems` 或剩余字节不足返回 `capacity`。旧记录不淘汰，仍可认回。

开放先设输出屏障：等待调用时刻之前受理的全部输出都已交给接收者，才把请求交给提供者。屏障期间作者仍可 emit，这些输出不属于该屏障。屏障因输出故障失败时，等待位置保留，同 key 同输入重试会再次开放。屏障因取消或关闭失败时，等待以该失败结束。

提供者的结果按值接收。提供者返回失败时，该失败就是等待的结果。提供者抛出异常时，等待返回 `unknown`，`operation` 为 `wait:<key>`。提供者的回答与中断竞争：先到的生效。

### 取消

信号中止时作用域立即取消。活动等待以 `cancelled` 结束。之后的新原语返回 `cancelled`。已交给作者的回答不撤销。取消标志盖过 `returned`，所以中止后的 `finish('returned')` 返回 `cancelled`。

### finish

`finish` 调用时同步关闭新受理。同一 exit 再次调用得到同一个 Promise。不同 exit 返回 `conflict`。

`finish('returned')` 先看活动等待。存在活动等待时，等待以 `closed` 结束，收尾返回 `invalid`。否则等待调用时刻之前受理的输出全部交接完成。取消先于或发生在等待期间都返回 `cancelled`。输出故障返回该故障。

`finish('failed')` 不等待输出。活动等待以 `closed` 结束。已取消时仍成功。接收者继续承担它已接下的输出。

### 失败解释

| 情况                                                                                                                                                                          | 结果                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 已封块再写、跨模式写、`replace` 的块对人不可见、Ask 带 `deadline`、`expiry` 为 `forbidden` 时给 `deadline`、`deadline` 不是 ISO 8601 时刻、请求不是合法 JSON 树或超过协议上限 | `invalid`                                                                                                                                                                        |
| 没有接收者或提供者；契约没有有限上限                                                                                                                                          | `unsupported`                                                                                                                                                                    |
| `finish` 的 exit 与首次不同                                                                                                                                                   | `conflict`                                                                                                                                                                       |
| 作者有活动等待却正常返回                                                                                                                                                      | `finish('returned')` 返回 `invalid`，等待以 `closed` 结束                                                                                                                        |
| 接收者返回失败                                                                                                                                                                | 该 emit 返回那个失败。输出账记下第一条故障。之后的屏障返回该故障：接收者的失败是 `unavailable` 或 `unknown` 时原样返回，否则包成 `unavailable`，`operation` 为 `emit:<sequence>` |
| 接收者或提供者抛出异常                                                                                                                                                        | `unknown`，`operation` 为 `emit:<sequence>` 或 `wait:<key>`                                                                                                                      |
| 作用域的程序缺陷                                                                                                                                                              | 抛出异常                                                                                                                                                                         |

### executeTool

包装器先核对作用域：`context.mode` 是 `independent`，`limits` 的四项是正安全整数，`finish` 是函数。不匹配时返回 `effect: 'not-started'`，不调用作者。作者返回后调用 `finish('returned')`。该收尾失败时返回失败，`reason` 是 `<kind>: <reason>`，`effect` 是 `unknown`。收尾成功后才交出 R。作者抛出时调用 `finish('failed')`，再返回 `effect: 'unknown'`，`reason` 是异常的名字与消息。

## 验证

[tests/README](tests/README.md) 列出每条规则对应的测试。每条测试名以本页所属规则的编号开头，`vitest -t` 可按编号单独运行。

文档导航见 [index](index.md)。
