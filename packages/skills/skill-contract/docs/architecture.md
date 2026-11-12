# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)。组级分解与依赖方向归[组工程设计](../../docs/architecture.md)。

## 模块与依赖

| 模块 | 职责 |
| --- | --- |
| `values.ts` | 全部值类型与品牌。只有类型 |
| `names.ts` | 文本值的校验函数，每个品牌一个类型守卫；控制文件的路径常量 |
| `capability.ts` | 能力标识的判同 `sameCapability`，公开根与 `testing-*.ts` 共用 |
| `page-limit.ts` | 每页上限 `PAGE_LIMIT`，`SkillAccess` 的实现与访问套件共用 |
| `digest.ts` | 条目与快照的内容摘要 |
| `media.ts` | 媒体类型推断与 `encoding` 判定 |
| `snapshot.ts` | 唯一的快照构造器，以及快照的运行时登记；`assertSealed` 与不抛出的 `isSealedSnapshot` 查同一个登记 |
| `parse/manifest.ts`、`parse/yaml-value.ts` | `SKILL.md` 的定界、YAML 解析与转换 |
| `parse/by-line.ts` | 严格 YAML 读不出时，逐行读顶层 `name` 与 `description` |
| `hints.ts` | 兼容提示的封闭集合与次序 |
| `parse/declaration.ts` | `.omne/skill.json` 的严格读取 |
| `parse/shape.ts` | 依赖、脚本与设置声明的形状规则，声明文件与资产正文共用；说明的长度上限与 `isSkillDescription` |
| `parse/package.ts` | `parseSkillPackage`：前提核对与拒绝次序 |
| `project.ts` | `projectAssetBody` |
| `contract.ts` | `skillBodyContract` |
| `failures.ts`、`services.ts`、`ports.ts` | 失败联合、服务接口与需求端口。只有类型，另有拒绝次序常量 |
| `testing-case.ts` | 用例类型 `ConformanceCase`、`NotApplicable` 与 `runConformanceCase` |
| `testing-source.ts`、`testing-resolution.ts`、`testing-read-check.ts` | 三个端口的符合性套件与内存替身 |
| `testing-access.ts`、`testing-catalog.ts` | `SkillAccess` 与 `SkillCatalog` 的符合性套件及夹具类型 |

依赖方向：入口文件 `index.ts`、`provider.ts`、`testing.ts` 只重新导出。`testing-*.ts` 依赖其余模块与 `node:assert`，不依赖测试框架；其余模块不依赖 `testing-*.ts`。外部依赖只有 `@omne-harness/assets`、`@omne-harness/json-text`、`@omne-harness/legal-identity`、`@omne-harness/operation-result` 与 `yaml`。

## 关键机制与理由

- 品牌只由守卫授予。守卫做真实校验，所以源码不用 `as` 授予品牌。快照是对象品牌：`sealSnapshot` 用一个断言式的私有守卫把冻结的快照登记在模块私有的 `WeakSet` 中并收窄类型，`assertSealed` 查这个登记。这样类型与运行时都只认 `sealSnapshot` 造出的快照。登记的代价见 [SPEC「快照」](../SPEC.md#snapshot-credential)。
- `sealSnapshot` 收字节，不收调用方算好的条目事实。条目的大小、内容摘要、媒体类型与 `encoding` 只有一处算法，所以不同来源对同一份字节交出相同的条目。
- 前缀冲突逐级查祖先。排序后 `a`、`a-b`、`a/b` 中 `a` 与 `a/b` 不相邻，只比较相邻项会漏报。
- 包解析先收集全部发现，再按拒绝次序取第一个。只有 `manifest-missing`、`name-mismatch` 与 `declaration-format-unsupported` 立即返回，因为它们在次序最前，或者规定停止其余判断。
- 形状规则写一次。`.omne/skill.json` 与资产正文的扩展字段共用 `parse/shape.ts`，类别端口与包检查不会各判一遍。
- YAML 头部不经 `toJS` 转换。自写的转换只接受文本键与四种标量，并限制展开后的节点数，所以 `1` 与 `"1"` 不会在转换后冲突，别名也不能放大头部。

## 验证与维护

测试与义务的对应见 [SPEC「持续验证」](../SPEC.md#持续验证)。修改形状规则时，同时修改 `parse/shape.ts`、Schema 与 `tests/declaration-schema.spec.ts`。增加媒体类型时，同时修改 SPEC 的表与 `tests/values.spec.ts`。
