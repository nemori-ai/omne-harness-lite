# 关键流程

本文件描述本包的关键流程：参与者、调用时序、状态变化、失败分支与生命周期。条款归 [SPEC.md](../SPEC.md)。

## 流程

### 账本提交

```mermaid
sequenceDiagram
  participant L as 账本
  participant S as SqlToolLedgerStore
  participant D as TenantDomainLookup
  participant Q as SqlStorage
  participant P as tool 参加者
  L->>S: commit(domain, expected, revision, writes)
  S->>D: lookup(租户文本)
  D-->>S: ready(事务域)
  S->>Q: commit(tool.ledger, 新操作键)
  Q->>P: execute(facts)，写事务内
  P->>P: 读修订号，比较 expected
  P->>P: 按序写入，设修订号
  P-->>Q: participated 或 conflict(current)
  Q-->>S: committed、rolled_back、unknown、rejected
  S-->>L: committed、conflict、unknown、unavailable
```

### 原件保管

```mermaid
sequenceDiagram
  participant E as 执行侧
  participant C as SqlToolOutputCustody
  participant Q as SqlStorage
  E->>C: preserve(call, operation, codec, bytes, source)
  C->>Q: read(tool.custody.manifest)
  alt 已有清单
    C-->>E: 同一输入：原 RawOutput；另一输入：conflict
  else 没有清单
    loop 每块不超过 maxChunkBytes
      C->>Q: commit(tool.chunk, 块序号, base64)
    end
    C->>Q: commit(tool.manifest)：核块、删残留块、写清单
    C-->>E: RawOutput
  end
```

状态变化：没有行 → 有部分块（不可见）→ 有清单（`retained`）。清单写入后不再改变。

## 失败与生命周期

- 块或清单的提交答 `unknown`：`preserve` 答 `commit-unknown`。执行侧以同一操作重送，重送按键覆盖块，然后认回或封存清单。
- 进程在清单之前停止：块留在库里，`inspect` 答 `unknown`。重送覆盖它们，多出的块在清单提交时删除。
- 提交被拒绝（例如 `queue_full`）：答 `unavailable`，没有写入。
- SQL 提供者以 reject 报告结果：异常原样交给调用方。
- 适配器不持有资源。连接与 Worker 的关闭归 SQL 提供者，已提交的写入与保管不因关闭而撤销。
