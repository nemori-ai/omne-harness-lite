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
  S-->>L: committed、conflict、unknown、unavailable、rejected
```

### 正文写入、封存与删除

```mermaid
sequenceDiagram
  participant L as 账本（写入者或清扫）
  participant B as SqlToolBodyStore
  participant Q as SqlStorage
  participant P as tool 参加者
  L->>B: put(permit, seq, bytes)
  B->>B: 用 permitKey 校验签名，用自己的时钟核截止时间
  alt 许可无效或已过期
    B-->>L: permit-invalid 或 permit-expired，不发命令
  else 许可有效
    B->>Q: commit(tool.body-put, 新操作键)
    Q->>P: 写事务内：同序号同字节保留，异字节或已封存后的新序号停止
    Q-->>B: committed 或 rolled_back(body-conflict)
    B-->>L: kept 或 conflict
  end
  L->>B: seal(permit, manifest)
  B->>Q: commit(tool.body-seal)
  Q->>P: 写事务内：重读全部分块，核序号、字节数与 SHA-256，写清单
  B-->>L: sealed、not-ready 或 conflict
  L->>B: delete(body)
  B->>Q: commit(tool.body-delete)：删分块与清单，不留行
  B-->>L: deleted
```

状态变化：没有行 → 有分块（读取答 `absent`）→ 有清单（读取答 `found`）→ 删除后没有行。清单写入后分块不再改变。

## 失败与生命周期

- 提交答 `unknown` 或暂时被拒：端口答 `unavailable`，带诊断。写入者以同一许可与序号重送；同序号同字节答 `kept`，同清单答 `sealed`，删除幂等。
- 进程在封存之前停止：分块留在库里，读取答 `absent`。账本在调用结算时把该正文标为孤儿，宽限期后清扫删除它。
- 提交被拒绝（例如 `queue_full`）：答 `unavailable`，没有写入。
- SQL 提供者以 reject 报告结果：异常原样交给调用方。
- 适配器不持有资源。连接与 Worker 的关闭归 SQL 提供者，已提交的写入与正文不因关闭而撤销。
