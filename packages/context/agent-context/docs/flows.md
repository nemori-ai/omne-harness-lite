# 关键流程

本文件用可维护的文本图源描述本包的关键业务流程与数据流：参与者、调用时序、数据来源与去向、状态变化、失败分支与生命周期。图旁写前提与边界，不编造流程。

## 流程

### 账目出站

一次账目出站（SPEC 的[账目出站](../SPEC.md#outlet)）。参与者：Agent（接收方，持有 `received` 条目）、出站、目标解析器、`contextAccountingInbox`（账目投影）。

```mermaid
sequenceDiagram
  participant A as Agent（接收方）
  participant O as 出站 deliver
  participant R as 目标解析器
  participant I as 收件口
  A->>O: deliver(access, handoff)
  O->>O: 解码 handoff.call，核租户
  alt 格式不合 / 租户不符
    O-->>A: invalid / denied
  else
    O->>R: resolveTarget(access, call)
    alt 答 null
      O-->>A: unavailable(scope-unresolved)
    else 目标属于调用的租户
      O->>I: receive(access, 账目事实)
      I-->>O: 收件结果
      O-->>A: 按名映射的结果
    end
  end
```

本波的真实装配里解析器总是答 `null`，所以流程止于 `unavailable(scope-unresolved)`，收件口不会被调用。接收方保留账目待办，按自己的退避重试，与 `saved` 互不等待。

### 一轮主请求：读取与准备

一次读取和随后的准备（SPEC 的[可读上下文读取](../SPEC.md#model-context)与[请求准备](../SPEC.md#requests)）。参与者：Agent、本包、K-RQ 部件、K-RC、Runtime Context、Request Context、Model 请求准备。

```mermaid
sequenceDiagram
  participant A as Agent
  participant C as agentModelContext
  participant Q as agentRequests
  participant H as K-RQ 部件
  participant E as K-RC
  participant RC as Runtime Context
  participant RQ as Request Context
  participant M as Model 请求准备
  A->>C: read(access, advance, recipient, history, adopted)
  C->>H: resolveHistory(access, history)
  H-->>C: 目标、epoch、上界
  C->>E: current(主体, 租户, 作用域, model)
  E-->>C: 资格
  C->>RC: bind(资格)，snapshot 或 changes
  RC-->>C: 读取结果
  C->>C: 存最近读取与读取记录
  C-->>A: recipient、content、source、coverage
  A->>Q: prepare(…, context, beforeModelCall)
  Q->>Q: 由 context.source 取读取记录
  Q->>H: resolveHistory(access, history)
  Q->>Q: 各组值放进暂存表
  Q->>RQ: 第一次调用时 register(目标, 来源集合)
  Q->>RQ: assembly(目标).assemble(调用身份)
  RQ->>Q: 组读口读暂存表
  alt 需要压缩
    Q->>RQ: planCompaction(调用身份)
    Q-->>A: needs-compaction（计划、步数上界、零步）
  else 可固定
    Q->>M: prepare(档案, 模态, 组装输入)
    Q-->>A: ready
  else 还要过扩展位置
    Q-->>A: assembled
  end
  Q->>Q: 暂存表删除本次的值
```

前提：同一 execution 同一时刻至多一个在途准备，由 Agent 的单执行槽保证。增量读取只在同一执行挂接、同一收件模型、已采用覆盖与固定事实一致时发生。

### 插件停止与结算

```mermaid
sequenceDiagram
  participant F as 插件 fiber
  participant S as 持有者（K-RQ）
  participant Q as agentRequests
  participant RQ as Request Context
  F->>F: 卸载
  F->>S: 租借结束（fiber 的 effect）
  S->>Q: 调用结算函数 close()
  Q->>RQ: 每个句柄 withdraw()
  RQ-->>Q: 各代 settled（等在途操作）
  Q-->>S: 合成的结算
  S->>S: 全部结算结束之后关读口
```

## 失败与生命周期

- 解析器或收件口抛出：分别答 `unavailable(scope-resolver-failed)` 与 `unknown`。不重试，不记待办，待办在接收方。
- 依赖缺席：插件停在 `PENDING`，没有对应的键，接收方或宿主构造不出端口，这由装配处理，不是操作的失败。
- 插件的 fiber 结束：被持有的旧引用答 `unavailable`，出站的诊断是 `outlet-closed`，上下文插件的诊断是 `agent-context-closed`。
- 账目投影淘汰了目标：收件口答 `uninitialized`，出站转成 `unavailable`，接收方保留待办（[ACCT-EVICT-ACTIVE](../SPEC.md#已知限制)）。
- 读取材料丢失：下一次读取做完整读取。带着丢失记录的 `prepare` 或 `resume` 答 `unavailable(context-material-lost)`，Agent 按拉取时点重读即可恢复。
- 计划材料丢失：`derive` 与 `resume` 答 `unavailable(compaction-plan-lost)`（[COMPACTION-PATH](../SPEC.md#已知限制)）。
