# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

```text
index.ts ──► inspection.ts ──► mapping.ts
   │               │
   │               └──► @omne-harness/skill-contract (parseSkillPackage)
   └──► access/service.ts ──► access/gate.ts ──► access/checkpoint.ts
              │               access/pin.ts ──► access/checkpoint.ts, mapping.ts
              │               access/bytes.ts ──► access/checkpoint.ts, mapping.ts
              │               access/range.ts
              └──► ports.ts
```

| 模块 | 持有什么 | 依赖 |
| --- | --- | --- |
| `index.ts` | 公开根：两个工厂与 `SkillPorts` | `inspection.ts`、`access/service.ts`、`ports.ts` |
| `ports.ts` | `SkillPorts`：三个端口的一个对象 | 契约 `./provider` 的端口类型 |
| `mapping.ts` | 来源答复到服务失败的唯一一张表，三列 `inspect`、`snapshot`、`open` | 契约的失败类型 |
| `inspection.ts` | `createPackageInspection` | `mapping.ts`、契约 `parseSkillPackage` |
| `access/gate.ts` | 第 1–3 步；两次端口调用前后的检查点；对应端口答复的映射；集合外答复收口为 `unknown` | `ports.ts`、`checkpoint.ts` |
| `access/pin.ts` | 第 5 步 `materialOf`；第 7 步 `pin`；`Pinned` | `gate.ts` 的类型、`checkpoint.ts`、`mapping.ts` |
| `access/bytes.ts` | 第 10 步 | `pin.ts` 的类型、`checkpoint.ts`、`mapping.ts`、契约 `computeDigest` |
| `access/range.ts` | 第 11 步的纯函数与范围校验 `assertByteRange` | 契约的 `ByteRange`、`ReadContent` 类型 |
| `access/checkpoint.ts` | `signal` 的检查点 | 无 |
| `access/service.ts` | `createSkillAccess`：四个操作的组合、第 4、6、8、9 步、结果组装 | 各阶段、`range.ts`、契约的 `toPackagePath`、`isControlFile`、`bodyOffsetOf` |

依赖方向：`service.ts` 认识各阶段，阶段互不调用，只经类型 `Gated` → `Pinned` 传递结果。`mapping.ts` 不认识任何阶段。本包不依赖 Cordis，不依赖 `@omne-harness/skill-host-local`。

状态与资源：没有。每次操作的中间结果（`Gated`、材料、`Pinned`、字节）只在一次调用里存在。

## 关键机制与理由

- **阶段而不是一个长函数。** 每个阶段的失败类型是契约失败联合的一个子集（`PinStageFailure = Exclude<PinFailure, GateFailure>` 等），编译器核对每一步只能答它那几步的失败。各操作在自己那一步结束，不会因为共用代码而多走一步。
- **「材料已变」由调用方交给 `pin`。** `pin(ports, gated, material, moved, signal?)` 原样交回 `moved`，类型是调用方给的那一个；`export` 交 `basis-unavailable`，所以编译器证明它不会答 `adopted-material-changed`，不需要重载也不需要断言。
- **第 5 步是独立的 `materialOf`。** 它把「要钉哪份材料」算成一个 `SkillMaterialBasis`（依据，或 `SkillRef` 的材料），`describe` 的 `material`、`pin` 的摘要比较与结果里的 `basis` 都用它，一个决定一处。`read` 在第 6 步之前调用它，所以次序与组页一致。
- **一张映射表，三列。** 来源的六种答复在 `inspect`、`snapshot`、`open` 三处的映射写在一张表里，列由调用的是哪个来源操作决定。没有第二处映射。
- **无披露的三条路径答同一个对象。** `NOT_AVAILABLE` 是一个冻结常量，三处返回它。深度相等不是巧合，是同一个引用。
- **端口答复在运行期也封闭。** 读取判定的答复先取 `kind`，只有 `granted` 放行、`refused` 拒绝，其余一律 `unknown`；对应端口的 `switch` 用 `never` 分支做编译期穷尽，运行期落到 `default` 也答 `unknown`。
- **检查点在每次端口调用两侧。** `gate` 收 `signal`，在 `check`、`resolve` 前后各查一次；`pin`、`verifiedBytes` 同样。已中止时四个端口都不被调用。`describe` 不传 `signal`，所以它收到 `aborted` 是不可达分支，代码里以抛出标明。
- **范围校验在操作开头。** `read` 先 `assertByteRange`，再调用端口；非法范围是调用方的错误，不消耗端口调用。
- **正文起点来自契约。** `bodyOffsetOf` 与 `readManifest` 共用契约里同一个定界行扫描 `frontmatterBounds`，`read` 不自己解释头部。
- **字节范围是纯函数。** `sliceRange` 不认识端口与快照，穷举测试。请求终点按请求的起点与长度算，终点前移不早于实际起点。字符边界用 UTF-8 续字节规则：快照把条目标为 `text` 时字节已经是严格 UTF-8，所以边界上的切片一定能解码。

## 验证与维护

| 保证 | 验证资源 |
| --- | --- |
| 每个阶段只答它那几步的失败；`export` 不答 `adopted-material-changed` | `tests/types.spec-d.ts`；`tests/gate.spec.ts`、`pin.spec.ts`、`bytes.spec.ts` 每个分支一例 |
| 映射表三列 | `tests/mapping.spec.ts`、`tests/inspection.spec.ts` |
| 无披露、集合外答复 | `tests/gate.spec.ts`；`tests/conformance.spec.ts` 在两个世界跑套件，跳过第 2 步的服务在「对所有人作答」的世界恰好 A1–A3 变红 |
| 检查点、不交部分内容、不缓存、次序 | `tests/read.spec.ts`、`tests/export.spec.ts`、`tests/gate.spec.ts` |
| 字节范围 | `tests/range.spec.ts` |

契约改变失败种类、步骤或端口签名时，先改 `mapping.ts` 与拥有那一步的阶段，再改 `service.ts`。组页「读取」的次序变化要同步 [SPEC「阶段」](../SPEC.md#stages)。`skillAccessConformance()` 的夹具 `tests/access-world.ts` 是本包与套件的接缝：套件新增用例或夹具字段时先补夹具，两个世界都要跑。
