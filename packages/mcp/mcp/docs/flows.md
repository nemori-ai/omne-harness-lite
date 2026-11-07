# 关键流程

本文件给出本包的四个关键流程：刷新清单、调用动作、建立连接、关闭连接。前提：端口已由宿主提供；调用方给出 `access`。

## 流程

刷新（`discovery.refresh`，SPEC MC-7）：

```mermaid
sequenceDiagram
    participant C as 调用方
    participant D as discovery
    participant G as guard/gate
    participant T as 连接表
    participant S as CatalogStore
    participant X as McpTransport
    C->>D: refresh(access, { ref, connectBound?, signal? })
    D->>G: admitForUse
    G-->>D: AdmittedEndpoint 或 Refusal
    D->>T: ensure(admitted, access, { connectBound })
    T-->>D: { transport, generation, connection, peer, catalogKey } 或 { reason, catalog }
    D->>S: read(catalogKey)
    S-->>D: 记录或 absent（basedOn）
    loop 至多 maxListingPages 页
        D->>X: listActions(cursor)
    end
    D->>D: completeListing → table.settle → mergeListing
    D->>G: stillAdmitted（资格仍 granted、采用修订仍相同）
    D->>D: 紧挨写入：isCurrent(generation)、signal 未中止
    D->>S: write(catalogKey, record, basedOn)
    S-->>D: ok、revision-conflict 或 unavailable
    D-->>C: published / kept / 失败
```

建立连接（`table.ensure`，SPEC MC-5）：

```mermaid
sequenceDiagram
    participant T as 连接表
    participant A as Connection
    participant U as CredentialUse
    participant L as ProcessLanding
    participant F as McpTransportFactory
    T->>T: prepareSettings（S4）、peerAccountOf、键
    T->>T: 重读采用修订；关闭同持有下其他修订的连接（不变式 6）
    T->>T: 等同键在途的关闭或拆除完成（至多到这次 ensure 的临界区时限）
    T->>A: attempt()
    note over T: 建连时限从这里起，每一次等待经 within；时限到期即答复，收场在任务作用域里继续
    T->>T: 再停上一条连接遗留的进程
    T->>T: 连接已关闭？是则答 connection-unavailable，不拆除
    T->>U: acquire(purpose)（auth 不是 none）
    T->>T: 连接已关闭？是则答 connection-unavailable，不拆除
    T->>L: start(launch, env)（stdio）
    T->>T: 连接已关闭？是则答 connection-unavailable，不拆除
    T->>F: open(material, bound)
    T->>T: 连接已关闭？是则答 connection-unavailable，不拆除
    T->>F: transport.discover()
    T->>T: 连接已关闭？是则答 connection-unavailable，不拆除
    T->>A: ready(peer)（与上一次核对在同一段同步执行里）
    T->>T: 答复兑现的那一步：连接已关闭？是则答 connection-unavailable，不交出句柄
```

关闭（`connections.release` 与 `closeAll`，SPEC MC-10）：一个键同时只有一次关闭：拒新请求（`Connection.close()`）→ 等在途的建连结束 → `transport.close()` → `process.stop()`（自己的与上次未确认停止的，每个都问）→ 释放凭据句柄 → 报告确认范围。端口违约不跳过后一步，也不跳过其余进程（SPEC MC-14）。拆除（后三步）是条目唯一的，`lose` 与准备失败先同步转 `lost` 再走同一个拆除；拆除途中的关闭等它完成，`ensure` 至多等到自己的临界区时限。

关闭落在建连途中时，三方的次序如下。建连核到关闭就答复，不自己拆除，所以关闭开始之后只有关闭自己的一次拆除，报告带它确认的范围：

```mermaid
sequenceDiagram
    participant R as release 或 closeAll
    participant T as 连接表
    participant A as Connection
    participant B as 建连
    participant E as 等待 ensure 的调用
    R->>T: close(tenant, holding) 或 closeAll()
    T->>A: close()（在第一次等待之前；持有的每条连接同时）
    note over A: 从这里起句柄的 wire() 拒绝，新的 ensure 等这次关闭结束
    T->>B: 等建连结束
    B->>B: 当前这一步答复后核到连接已关闭
    B-->>T: 答 settings 阶段的 connection-unavailable，不拆除、不标记清单
    T-->>E: 答复兑现前再核：已关闭，不交出句柄
    T->>T: 拆除：transport.close() → process.stop() → 释放句柄
    T-->>R: released，带这次拆除确认的范围
```

关停（`closeAll`）：置已关停 → 同步发起全部在途落点句柄的释放（已交来进程的落点除外） → 并发关闭各条目 → 等全部拆除与释放结束 → 任务作用域记下了本包的错误时以 `AggregateError` 抛出，否则报告每条连接的确认范围。之后本实例不再建连（S8）：`refresh` 答 `connection-unavailable`，`invoke` 与 `continueWithInput` 答「未发出：`connection-unavailable`」，任务操作答 `effect-unknown`（`no-connection`）（SPEC [MC-16](../SPEC.md#mc-16)、[MC-17](../SPEC.md#mc-17)）。`closeAll` 落在操作发出之前的途中时，操作不再开始下一步，不问端口；答复在出口一处从当时的状态读出，与关停之后才开始的操作相同。已发出的结局和已发布的清单不改。

调用（`invoker.invoke`，SPEC [MC-16](../SPEC.md#mc-16)；`continueWithInput` 相同，另核代际）：

```mermaid
sequenceDiagram
    participant C as 调用方
    participant I as calls（perform）
    participant F as 在途表
    participant G as guard/gate
    participant S as CatalogStore
    participant T as 连接表
    participant X as McpTransport
    C->>I: invoke(access, { ref, action, args, expectedDefinition, correlationKey, signal })
    I->>I: 前提（R2）：args 不是 JSON 对象则 TypeError reject，不占位
    I->>F: reserve(key, signal)
    F-->>I: 占位句柄（带停止信号：signal 与 cancel 合成）或 in-use
    note over I: 从这里到发出，每次等待都在停止信号下；每次等待之前先读关停（S8）
    I->>G: admitForUse
    I->>I: prepareSettings（S4）
    I->>S: read(catalogKey)：动作存在、可用、摘要相同
    I->>T: ensure(admitted, access, { connectBound })
    I->>I: 第 8 步：停止信号已触发？是则不发出，答复留给出口。否则读 Ensured.wire()：连接不再接受请求则答 not-sent（connection-unavailable），不问端口
    I->>X: call({ action, args, continuation? }, 停止信号, observe)
    I->>F: 句柄的 recordSent(连接视图, 发出代际)
    I->>X: 在停止信号下等应答；触发时，连接仍接受请求才 cancelRequest 一次，交给作用域
    I->>I: classifyOutcome；任务结局登记任务表；转 lost 时拆除交给作用域
    I->>I: 出口 answerAtExit，与收口在同一段同步执行里：已发出的结局不改；停止信号已触发答 not-sent（cancelled）；否则关停已开始答 not-sent（connection-unavailable）；其余原样
    I->>F: 句柄的 conclude()（perform 的 finally，唯一出口；按表里记下的阶段判）
    I-->>C: not-sent（原因）或 sent（结局）
```

每步失败的原因、建连失败与 `not-sent` 的映射表、取消的接线见 SPEC [MC-16](../SPEC.md#mc-16)；任务操作的次序（`provideTaskInput` 先按 R2 判值树 → 发起者 → 关停 → 复用或新建连接 → 一个请求）见 [MC-17](../SPEC.md#mc-17)。

## 失败与生命周期

- 关口拒绝或配值缺陷时没有连接、没有外部效果。调用「未发出」时没有对端效果。键怎样收口见 SPEC [MC-16](../SPEC.md#mc-16) 第 13 步：停止信号已触发的未发出调用转为已结束，其余未发出的调用撤销占位；发出后无应答时效果未知，不重发。
- 建立连接的任一步失败、超时或端口违约：连接转 `lost`、传输关闭、已起的进程 `stop()`、凭据句柄释放、清单 `markUnavailable`；时限到期时建连立即答复，这些收场在任务作用域里继续，答复的 `catalog` 是 `pending`；迟到交来的句柄与传输同样收口，迟到交来的进程停止一次、未确认的范围记为 `residual`，它的凭据句柄在这次 `stop()` 之后释放。答复与原因表见 SPEC MC-5。
- 调用方中止：等建连时答 `kept(cancelled)`（建连留给其他调用方），取页时答 `kept(cancelled)`，发布边界上答 `kept(cancelled)`；都不标记清单。
- 页取得失败：带 `unusable` 标记的答复与 `not-sent`（`authorization-required`）使连接 `lost` 并标记清单（契约 S7）；其他失败与取页超时使连接 `degraded`，刷新答 `kept(listing-incomplete)`，原采用不变。旧代际迟到的页不改变重建后的连接，刷新答 `kept(superseded)`。
- 发布边界不成立时不写入：迟到的连接 `kept(superseded)`，取消 `kept(cancelled)`，资格不再 `granted` 答对应 `Refusal`。
- 关闭只报告 `stop()` 确认的范围。未确认的进程留在条目里作为 `residual`，下一次关闭或重建前再次请求停止。`stop()` 违约记为 `unconfirmed`。
- 宿主退出时调用 `closeAll()`。本包的后台工作只有时限之后继续的收场与迟到结果的收口，归连接表的任务作用域；本包不重连。
