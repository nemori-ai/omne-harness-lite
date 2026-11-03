# 对象模型

本包是函数与值，没有 class。内部对象是阶段之间传递的值，它们只在一次操作里存在。

## 对象与关系

```text
SkillPorts ─────────────────────────────────────┐
  readCheck, resolution, source                  │ 每个阶段都收它
                                                 ▼
Gated ──materialOf──► SkillMaterialBasis ──pin──► Pinned ──verifiedBytes──► Bytes
  ref (SkillRef)         (契约的值)                 locator
  declared                                         basis (所钉材料)
  layer                                            byBasis
  basis?                                           snapshot
```

| 值 | 身份 | 由谁造 | 谁消费 |
| --- | --- | --- | --- |
| `SkillPorts` | 无；集成方的一个对象 | 集成方 | 两个工厂与各阶段 |
| `Gated` | 无 | `gate` | `describe` 的组装、`materialOf`、`pin` |
| `SkillMaterialBasis`（所钉材料） | 无；契约的公开值 | `materialOf` | `describe` 的 `material`、`pin` |
| `Pinned` | 无 | `pin` | `list` 的组装、第 9 步的查找、`verifiedBytes`、结果的 `basis` |
| `Bytes` | 无 | `verifiedBytes` | `read` 的切页、`export` 的条目 |
| `Sliced` | 无 | `sliceRange` | `read` 的结果 |

对外的结果值（`SkillDescription`、`ReadResult`、`ResourceListing`、`SkillExport`）归契约，由 `service.ts` 从上面的值组装。

## 生命周期

每个值在一次操作里被造出、被下一阶段消费、随操作结束被丢弃。没有缓存，没有在调用之间存活的对象。`createSkillAccess` 与 `createPackageInspection` 交出的对象只持有端口的引用，没有自己的状态。
