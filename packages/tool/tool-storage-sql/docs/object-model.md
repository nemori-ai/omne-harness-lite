# 对象模型

本文件描述本包内部对象的职责、身份、状态与生命周期。本包没有类：两个工厂返回由函数组成的端口对象，数据库行是唯一的状态。

## 对象与关系

```mermaid
classDiagram
  class LedgerDomainRows {
    tenant
    kind call|queue|host
    name
    revision
  }
  class RecordRow {
    key
    record JSON
  }
  class ChunkRow {
    call
    operation
    idx
    data
  }
  class ManifestRow {
    call
    operation
    kind raw|retain
    digest
    bytes
    chunks
    sha256
    seal
    answer
  }
  LedgerDomainRows "1" --> "*" RecordRow
  ManifestRow "1" --> "*" ChunkRow : 封存
  ManifestRow "retain" --> "1" ManifestRow : 保管在原件之上
```

- 账本域由（租户，种类，名）识别，修订号是账本给出的文本。记录由账本域内的键识别，键由 `recordKey` 算出。
- 保管操作由（租户，调用，操作）识别。输入摘要识别「同一输入」。封印是原件的 `custody.digest`，或投影证据的摘要。
- 投影的清单记录它所依据的原件操作与封印。

## 生命周期

- 账本行由账本的提交创建、替换与删除。本包不删除账本行，也不压缩回执。
- 块在保管时创建，在同一操作的清单提交时删除多出的部分。清单写入后，块内容不再改变。W3 以独立用途、固定期限、页租约及删除任务管理材料生命周期；当前实现差距见 [已知限制](../SPEC.md#已知限制)第 3 条，提供者设计见 [材料保管与回收](../SPEC.md#w3-材料保管与回收设计)。
- 端口对象没有关闭方法，丢弃即可。
