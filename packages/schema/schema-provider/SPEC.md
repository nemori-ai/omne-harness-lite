# Schema 提供者的行为

公开形状在 `src/index.ts`。本文件拥有类型没有写完的行为。系统级路线在[技术基础](../../../docs/architecture/technical-foundations.md#schema提供者的检查与准入)。缓存语义在[缓存机制](../../../docs/architecture/data-and-state.md#缓存懒加载与预热)。内部模块在 [docs/architecture.md](docs/architecture.md)。

## 范围

调用方是持有 `JsonRead` 的形状消费者，以及发布 `SchemaRef` 的形状拥有者。执行域创建 `SchemaProvider`。

本包消费 `@omne-harness/json-text` 的 `JsonRead` 和 `JsonFailure`。它不改读取器。输入已经失败时，本包返回 `unreadable`，并原样带出 `JsonFailure`。

## 结果与不变量

<a id="check-once"></a>

`validate` 完成加载、准入、首次编译和检查。调用方没有公开的加载、编译、检查三步。

<a id="subset"></a>

提供者在调用 `z.compile` 或 Ajv 之前遍历定义。callback、`.transform`、`.default`、`.catch`、`z.lazy` 和强制转换得到 `refused`，原因是 `unsupported-construct`。`z.compile` 成功不能作为子集通过的依据。

<a id="cycle"></a>

有环的 JSON Schema 得到 `refused`，原因是 `runtime-path-closed`。该结果不能记为编译命中。本包不另写 JSON Schema 解释器。

<a id="digest"></a>

缓存键包含形状 id、revision、结构摘要、编译器身份和数字投影。同一 id 和同一 revision 的结构摘要与已有快照不一致时，结果是 `refused`，原因是 `revision-conflict`。旧快照保持不变。

<a id="projection"></a>

`valid.value` 是投影后的值。本包丢弃引擎输出。`exact-or-reject` 只在数字转换可逆时产生 JavaScript 数字，否则问题码是 `precision`。`lexeme` 把源词法交给检查器。对象的 `entries` 顺序在投影时保留。

<a id="issues"></a>

校验失败的问题码是 `type`、`empty`、`precision`、`constraint` 或 `unrecognized-key`。Zod 与 Ajv 的原始错误只在本包内对照到这些编号。

## 所有权、失败与寿命

<a id="slot"></a>

一个执行域只有一个提供者。每个形状 id 一个槽。一个槽表示一份在途编译、一份就绪产物、一条冷却记录，或一份仍有租约的旧修订。`maxSnapshots` 数这些槽。它不是字节上界。

槽位不足时，提供者只淘汰租约数为零且冷却已结束的条目。腾不出槽时，新消费者得到 `refused`，原因是 `budget-exhausted`。仍有租约的快照不被淘汰，也不被覆盖。

<a id="inflight"></a>

同一键的并发首次调用共享一次加载和一次编译。一个调用的取消只返回 `cancelled`。其他等待者继续。全部等待者都在编译开始前取消时，这次编译不留下就绪产物。

<a id="failure"></a>

编译或加载失败不留下成功缓存。等待者得到 `unavailable`，并带 `retryNotBeforeMillis`。冷却未结束时，再次调用返回同一个 `unavailable`，不再编译。同一修订的失败次数达到 `maxAttempts` 后，结果变为 `refused`，原因是 `attempts-exhausted`。

<a id="lease"></a>

`lease` 按住准入时的快照。新修订不改这次租约的目标。`superseded` 变为真。`release` 使租约数减一。快照在租约数到零之后才可以回收。

<a id="close"></a>

`close` 停止新准入。已经加入的检查按加入时的快照做完。之后的 `validate` 或 `lease` 得到 `refused`，原因是 `closed`。再次 `close` 仍是关闭。

## 组合与验证

读取失败的种类和停止顺序归 json-text。本包只转发失败，不重新分类。

行为测试的入口和缺口写在成员 README 的验证节。公开入口测试核对导出名称。
