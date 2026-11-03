# 对象模型

本包是函数与值，没有 class。内部对象是三段之间传递的三个值，它们只在一次操作里存在。

## 对象与关系

```text
SkillPorts ─────────────────────────────┐
  readCheck, resolution, source          │ 每段都收它
                                         ▼
Gated ──────────► Pinned ──────────► Verified
  ref (SkillRef)    gated               entry (PackageEntry)
  declared          digest              bytes
  layer             snapshot
  basis?            locator
```

| 值 | 身份 | 由谁造 | 谁消费 |
| --- | --- | --- | --- |
| `SkillPorts` | 无；集成方的一个对象 | 集成方 | 两个工厂与三段 |
| `Gated` / `GatedWithBasis` | 无 | `gate` | `describe` 的组装、`pin` |
| `Pinned` / `PinnedWithBasis` | 无 | `pin` | `list` 的组装、`verifiedBytes` |
| `Verified` | 无 | `verifiedBytes` | `read` 的切页、`export` 的条目 |
| `Sliced` | 无 | `sliceRange` | `read` 的结果 |

`GatedWithBasis` 与 `PinnedWithBasis` 只是带依据时的类型收窄，不是另一种值。对外的结果值（`SkillDescription`、`ReadResult`、`ResourceListing`、`SkillExport`）归契约，由 `service.ts` 从上面的值组装。

## 生命周期

每个值在一次操作里被造出、被下一段消费、随操作结束被丢弃。没有缓存，没有在调用之间存活的对象。`createSkillAccess` 与 `createPackageInspection` 交出的对象只持有端口的引用，没有自己的状态。
