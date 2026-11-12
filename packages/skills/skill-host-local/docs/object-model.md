# 对象模型

根入口没有类，也没有带身份或生命周期的对象，由函数与不可变的值组成。`./cordis` 入口有三个服务子类（`HostPackageInspection`、`HostSkillCatalog`、`HostSkillAccess`，包内部，不导出）：插件的 `apply` 把它们挂在装载它的 fiber 上，随 fiber 卸载撤除；它们没有自己的状态，只持有构造好的服务并转发调用。两个端口适配器是 `apply` 里的对象字面量，每次调用从装载时的 `ctx` 现取端口服务。

| 值                  | 职责                                                                                                      | 生命周期                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `DirectoryFs`       | 文件系统接缝：`readdir`（名字的字节）、`lstat`、`realpath`（路径的字节）、`readFile`（打开结果 `Opened`） | 调用方给出，或每个来源实例建一个默认接缝。来源不关闭它，它也不持有资源 |
| 来源对象            | `createDirectorySource` 返回的 `SkillPackageSource` 字面量，闭包只持有接缝                                | 与调用方持有的引用一样长，没有撤除                                     |
| `Opened`            | 打开一个路径的结果：普通文件的字节，或目录、其他对象的种类                                                | 一次 `readFile`                                                        |
| `Walk`（内部）      | 一次遍历的私有状态：接缝、解析后的根、已读文件列表与访问计数                                              | 一次 `collect` 调用                                                    |
| `Place`（内部）     | 一个遍历位置：解析后的目录、包内路径段、从根到它的解析后目录                                              | 一次下降                                                               |
| `Collected`（内部） | `collect` 的结果：根名与全部文件的路径和字节                                                              | 交给 `sealSnapshot` 后丢弃                                             |

```text
createDirectorySource ──持有──▶ DirectoryFs
        │ snapshot
        ▼
     collect ──建──▶ Walk ──含──▶ PackageFile[]
        │             │
        └──下降──▶ Place（祖先集合）
```

快照与条目的模型归 `@omne-harness/skill-contract`，见其[快照](../../skill-contract/SPEC.md#snapshot)。
