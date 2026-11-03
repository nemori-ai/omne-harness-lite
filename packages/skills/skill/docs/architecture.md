# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

```text
index.ts ──► inspection.ts ──► mapping.ts
   │               │
   │               └──► @omne-harness/skill-contract (parseSkillPackage)
   └──► access/service.ts ──► access/gate.ts
              │               access/pin.ts ──► access/checkpoint.ts, mapping.ts
              │               access/bytes.ts ──► access/checkpoint.ts, mapping.ts
              │               access/range.ts
              └──► ports.ts
```

| 模块 | 持有什么 | 依赖 |
| --- | --- | --- |
| `index.ts` | 公开根：两个工厂与 `SkillPorts` | `inspection.ts`、`access/service.ts`、`ports.ts` |
| `ports.ts` | `SkillPorts`：三个端口的一个对象 | 契约 `./provider` 的端口类型 |
| `mapping.ts` | 来源答复到服务失败的唯一一张表 | 契约的失败类型 |
| `inspection.ts` | `createPackageInspection` | `mapping.ts`、契约 `parseSkillPackage` |
| `access/gate.ts` | 第 1–3 步；对应端口答复的映射 | `ports.ts` |
| `access/pin.ts` | 第 5、7 步 | `gate.ts` 的类型、`checkpoint.ts`、`mapping.ts` |
| `access/bytes.ts` | 第 9、10 步 | `pin.ts` 的类型、`checkpoint.ts`、`mapping.ts`、契约 `computeDigest` |
| `access/range.ts` | 第 11 步的纯函数 | 契约的 `ByteRange`、`ReadContent` 类型 |
| `access/checkpoint.ts` | `signal` 的检查点 | 无 |
| `access/service.ts` | `createSkillAccess`：四个操作的组合、第 4、6、8 步、结果组装 | 三段、`range.ts`、契约的 `toPackagePath`、`isControlFile`、`bodyOffsetOf` |

依赖方向：`service.ts` 认识三段，三段互不调用，只经类型 `Gated` → `Pinned` 传递结果。`mapping.ts` 不认识任何段。本包不依赖 Cordis，不依赖 `@omne-harness/skill-host-local`。

状态与资源：没有。每次操作的中间结果（`Gated`、`Pinned`、`Verified`）只在一次调用里存在。

## 关键机制与理由

- **三段而不是一个长函数。** 每段的失败类型是契约失败联合的一个子集，编译器核对每一步只能答它那几步的失败。`describe`、`list`、`read`、`export` 各在自己那一段结束，不会因为共用代码而多走一步。代价：`Gated` 与 `Pinned` 两个内部类型。
- **`gate` 与 `pin` 按有无依据重载。** 带依据进入 `gate` 时，类型上得到 `GatedWithBasis`；带它进入 `pin` 时，失败类型不含 `adopted-material-changed`。所以 `export`（总带依据）不需要在运行时排除这一种，也不需要类型断言。
- **一张映射表。** 来源的六种答复在 `inspect` 与字节读取两边的映射写在一处。改一行就是改一个决定；测试逐行钉住。
- **无披露的三条路径答同一个对象。** `NOT_AVAILABLE` 是一个冻结常量，三处返回它。深度相等不是巧合，是同一个引用。
- **正文起点来自契约。** `bodyOffsetOf` 与 `readManifest` 共用契约里同一个定界行扫描，`read` 不自己解释头部。
- **字节范围是纯函数。** `sliceRange` 不认识端口与快照，穷举测试。字符边界用 UTF-8 续字节规则：快照把条目标为 `text` 时字节已经是严格 UTF-8，所以边界上的切片一定能解码。
- **检查点在端口两侧。** 一次端口调用之前与之后各查一次，已中止就返回，之后的端口不再被调用。端口自己收不到 `signal`：本版本的端口签名没有它。
- **第 6 步在 `gate` 之后、`pin` 之前。** 保持三段不被拆开的代价是一处次序偏离（没有可读的包加坏路径时答 `bad-path`），见 [SPEC「三段」](../SPEC.md#stages)。重新判断的条件：契约给第 6 步加上披露或部分内容的含义。

## 验证与维护

| 保证 | 验证资源 |
| --- | --- |
| 每段只答它那几步的失败 | `tests/types.spec-d.ts`；`tests/gate.spec.ts`、`pin.spec.ts`、`bytes.spec.ts` 每个分支一例 |
| 映射表 | `tests/mapping.spec.ts`、`tests/inspection.spec.ts` |
| 无披露 | `tests/describe.spec.ts` A1–A3；`tests/conformance.spec.ts` 跳过第 2 步的服务恰好 A1–A3 变红 |
| 不交部分内容、不缓存 | `tests/read.spec.ts`、`tests/export.spec.ts` |
| 字节范围 | `tests/range.spec.ts` |

契约改变失败种类、步骤或端口签名时，先改 `mapping.ts` 与拥有那一步的段，再改 `service.ts`。组页「读取」的次序变化要同步 [SPEC「三段」](../SPEC.md#stages)。`skillAccessConformance()` 的夹具 `tests/access-world.ts` 是本包与套件的接缝：套件新增用例时先补夹具。
