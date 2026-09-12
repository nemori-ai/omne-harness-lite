# 领域模型注册表

这里是 `omne-harness-lite` 的语言无关领域模型。模型按 DDD 层次组织：

- `enums/`：封闭词表和状态枚举；
- `value-objects/`：由值定义、无独立身份的模型；
- `entities/`：具有局部身份、但不独立作为事务边界的实体；
- `aggregates/`：聚合根及其边界、不变量、命令和事件。

每一层的 `README.md` 是该层索引；每个模型目录内的 `vN/` 是不可变版本，
每个版本只有一份模型定义文档。新版本必须新建目录或文件，不能编辑已经发布
的版本。`current.json` 只是可变的当前指针，不是历史版本。

## 模型身份和引用

模型以稳定的限定名和整数主版本识别：

```text
domain.aggregate.LLMProfile@1
domain.value-object.ModelRouting@1
domain.enum.AptitudeTier@1
```

文档引用使用上述 ID；JSON Schema 引用使用同一版本目录下的 `$id`/`$ref`。
版本升级意味着契约或语义不兼容，旧版本继续可读；兼容性判断不能依赖文件
路径猜测。

每个模型目录建议如下：

```text
<model>/
  current.json       # 当前版本指针
  v1/model.md        # 不可变的完整定义
  v1/schema.json     # 需要机器校验时的规范 Schema
```

`model.md` 负责语义、边界和引用；`schema.json` 只在模型需要结构化机器校验
时存在，并且必须与同版本文档保持一一对应。行为不变量仍进入 TLA+，关系
约束仍进入 Alloy，不能把 JSON Schema 当作完整行为规格。

机器可读的全局索引是 [`registry.json`](registry.json)。新增模型或新版本时，
先登记稳定 ID、版本、状态和文件位置，再在 TLA+、Alloy、Schema、场景或实现
中引用该 ID。
