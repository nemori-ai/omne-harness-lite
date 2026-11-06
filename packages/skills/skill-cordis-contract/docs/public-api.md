# Skill Cordis 定义的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，非类型行为归 [SPEC](../SPEC.md)，服务定义的正文归 [Cordis 说明](cordis.md)。五个接口的输入、输出与失败归 [skill-contract SPEC](../../skill-contract/SPEC.md)。

## 导出入口

| 入口                                         | 源码                              | 发布产物                             | 调用者                                                                                             |
| -------------------------------------------- | --------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `@omne-harness/skill-cordis-contract`        | [src/index.ts](../src/index.ts)   | `dist/index.js`、`dist/index.d.ts`   | 没有调用者。根入口是空导出                                                                         |
| `@omne-harness/skill-cordis-contract/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 提供三个服务的插件（skill-host-local），提供两个端口的实现方，使用服务的插件，只需要类型增补的一方 |

根入口与 Cordis 无关（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。需要接口类型的一方直接依赖 skill-contract。`./cordis` 只有服务定义，不导入任何提供者（[性质 6](../SPEC.md#结果与不变量)）。只需要 `Context` 增补的一方用 `import type {} from '@omne-harness/skill-cordis-contract/cordis'`（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）。

## 定义索引

### 根入口

没有导出。

### `./cordis`

| 名字                           | 种类     | 键                       | 接口与行为位置                                                                                  |
| ------------------------------ | -------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| `PackageInspectionService`     | 抽象类   | `skillPackageInspection` | `PackageInspection`，见 [skill-contract SPEC](../../skill-contract/SPEC.md#检查-skill-包)       |
| `SkillCatalogService<P, S>`    | 抽象类   | `skillCatalog`           | `SkillCatalog<P, S>`，见 [skill SPEC](../../skill/SPEC.md)                                      |
| `SkillAccessService<P, S>`     | 抽象类   | `skillAccess`            | `SkillAccess<P, S>`，见 [skill SPEC](../../skill/SPEC.md)                                       |
| `SkillReadCheckService<P, S>`  | 抽象类   | `skillReadCheck`         | `SkillReadCheck<P, S>`，见 [skill-contract SPEC 的需求端口](../../skill-contract/SPEC.md#ports) |
| `SkillResolutionService<P, S>` | 抽象类   | `skillResolution`        | `SkillResolution<P, S>`，见同一节                                                               |
| `Context` 增补                 | 类型增补 | 五个键                   | [SPEC 性质 4](../SPEC.md#结果与不变量)                                                          |

调用者资格：本成员没有按调用方类分面的方法，不声明 intercept 配置。访问判断归 skill-contract 的两个端口与它们的实现方。
