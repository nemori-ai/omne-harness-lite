# 对象模型

本包没有类，也没有带身份或生命周期的对象。它由函数与不可变的值组成。

| 值                  | 职责                                                                       | 生命周期                                                               |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `DirectoryFs`       | 文件系统接缝：`readdir`、`lstat`、`realpath`、`readFile`                   | 调用方给出，或每个来源实例建一个默认接缝。来源不关闭它，它也不持有资源 |
| 来源对象            | `createDirectorySource` 返回的 `SkillPackageSource` 字面量，闭包只持有接缝 | 与调用方持有的引用一样长，没有撤除                                     |
| `Walk`（内部）      | 一次遍历的接缝、解析后的根与已读文件列表                                   | 一次 `collect` 调用                                                    |
| `Place`（内部）     | 一个遍历位置：解析后的目录、包内路径段、从根到它的解析后目录               | 一次下降                                                               |
| `Collected`（内部） | `collect` 的结果：根名与全部文件的路径和字节                               | 交给 `sealSnapshot` 后丢弃                                             |

```text
createDirectorySource ──持有──▶ DirectoryFs
        │ snapshot
        ▼
     collect ──建──▶ Walk ──含──▶ PackageFile[]
        │             │
        └──下降──▶ Place（祖先集合）
```

快照与条目的模型归 `@omne-harness/skill-contract`，见其[快照](../../skill-contract/SPEC.md#snapshot)。
