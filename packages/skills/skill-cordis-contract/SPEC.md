# @omne-harness/skill-cordis-contract 行为规格

本文件拥有本包在公开类型以外的必要行为。本包只有 Skill 的 Cordis 服务定义：五个抽象 `Service`、它们的服务键与 `Context` 增补。公开形状归 [src/cordis.ts](src/cordis.ts)，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。本包没有运行逻辑：抽象类的方法都是抽象方法，不做核对，不持有状态。

## 范围与依据

状态：已由 [技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6704668621) 接受。下文「本版本」指成员版本 0.0.0。

| 依据                                                                    | 本规格采用的范围                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IC 约定](../../../docs/architecture/cordis-integration-conventions.md) | [IC-1](../../../docs/architecture/cordis-integration-conventions.md#ic-1) 至 [IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)、[IC-5](../../../docs/architecture/cordis-integration-conventions.md#ic-5)、[IC-7](../../../docs/architecture/cordis-integration-conventions.md#ic-7)、[IC-8](../../../docs/architecture/cordis-integration-conventions.md#ic-8)、[IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9) 对 Skill 的五个接缝的适用 |
| [Skill 契约规格](../skill-contract/SPEC.md)                             | `PackageInspection`（[检查 Skill 包](../skill-contract/SPEC.md#parse)）与两个需求端口 `SkillReadCheck`、`SkillResolution`（[需求端口](../skill-contract/SPEC.md#ports)）；`SkillCatalog` 的行为归 [skill 的 SPEC 目录](../skill/SPEC.md#catalog)，`SkillAccess` 的行为归 [skill 的 SPEC 阶段](../skill/SPEC.md#stages)。它们的输入、结果与失败归各自所指的规格                                                                                                                               |
| [Skill 能力组](../README.md#成员与依赖)                                 | 本成员的职责与允许的依赖：只依赖 `skill-contract` 与 Cordis 发布包                                                                                                                                                                                                                                                                                                                                                                                                                           |

Cordis 采用发布包 `@deepseek-ai/cordis@4.0.4`。

本成员只认通用角色：服务的消费者、端口的提供者。它不认识任何调用方类型，也不点名端口的实现方。主体类型 `P` 与作用域类型 `S` 是类型参数，本成员不解释它们。

## 结果与不变量

本成员必须保持下列性质。

1. 五个服务键只由各抽象类的 `static readonly provide` 给出。抽象类的构造函数以 `<类>.provide` 调用 `super`。`./cordis` 另导出五个键常量，各取自对应类的 `provide`：`skillPackageInspectionKey`、`skillCatalogKey`、`skillAccessKey`、`skillReadCheckKey`、`skillResolutionKey`。消费者引用键常量，写 `ctx.get(skillReadCheckKey)` 这样的调用；常量的字面量类型使 `ctx.get` 有类型。提供者 `extends` 抽象类，不另写键，也不自己 `ctx.provide` 这个键（[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。

   | 键                       | 抽象 Service                   | `implements`            | 接口出处                                |
   | ------------------------ | ------------------------------ | ----------------------- | --------------------------------------- |
   | `skillPackageInspection` | `PackageInspectionService`     | `PackageInspection`     | `@omne-harness/skill-contract/provider` |
   | `skillCatalog`           | `SkillCatalogService<P, S>`    | `SkillCatalog<P, S>`    | `@omne-harness/skill-contract`          |
   | `skillAccess`            | `SkillAccessService<P, S>`     | `SkillAccess<P, S>`     | `@omne-harness/skill-contract`          |
   | `skillReadCheck`         | `SkillReadCheckService<P, S>`  | `SkillReadCheck<P, S>`  | `@omne-harness/skill-contract/provider` |
   | `skillResolution`        | `SkillResolutionService<P, S>` | `SkillResolution<P, S>` | `@omne-harness/skill-contract/provider` |

2. 每个抽象类 `extends` Cordis 的 `Service`，`implements` 上表的接口，类上的 JSDoc 写 `@owner packages/skills/skill-cordis-contract`。接缝出自操作类型，没有契约 ID，所以写 `@owner`（[IC-3](../../../docs/architecture/cordis-integration-conventions.md#ic-3)）。类不写 `static inject`（[IC-8](../../../docs/architecture/cordis-integration-conventions.md#ic-8)）。
3. 抽象方法的参数与结果用 `Parameters` 与 `ReturnType` 从接口推出，同一组签名不写两份。方法是抽象方法，不是字段。
4. `./cordis` 增补 `Context`，五个属性名与键相同。泛型类的类型参数取 `unknown`：装配的可信身份适配器可以收窄它们，实现仍在运行时核对每个输入。
5. 根入口没有运行导出，不导入 `@deepseek-ai/cordis`（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。`./cordis` 的运行导出恰为五个抽象类与五个键常量。本成员没有 `./testing` 入口。
6. `./cordis` 只导入 `@omne-harness/skill-contract` 的类型与 `@deepseek-ai/cordis`，不导入任何提供者（[IC-5](../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。
7. 本成员不声明事件，不增补 `Events`。
8. 两个端口服务 `skillReadCheck` 与 `skillResolution` 对使用它们的插件是可选依赖：没有人把它们写进 `inject`。使用方每次调用时用 `ctx.get(<键常量>)` 现取，接受 `undefined`，不缓存取到的引用（[IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9)）。缺席时的答复由使用这两个端口的插件兑现，`skill-host-local` 的规则见其 [SPEC](../skill-host-local/SPEC.md#port-absent)。

## 所有权、失败与生命周期

| 事物                                                           | 拥有者                                     | 结束                                                     |
| -------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| 五个服务键与抽象类                                             | 本成员                                     | 随包                                                     |
| `skillPackageInspection`、`skillCatalog`、`skillAccess` 的实例 | 装载提供者的插件的 fiber                   | 该 fiber 卸载。之后 `ctx.get` 答 `undefined`             |
| `skillReadCheck`、`skillResolution` 的实例                     | 装载它们的插件的 fiber，由端口的实现方装配 | 该 fiber 卸载。之后使用方现取不到，按性质 8 由使用方答复 |

本成员没有状态、资源与外部效果，没有需要撤除的东西，也没有本成员自己的失败。服务换代时，使用方下一次调用现取到新的实例，旧引用不被持有。使用方在途操作持有的是它已经取到的那个实例的结果，本成员不规定在途操作的结局。

## 组合与验证

本成员消费五个接口，不复制它们的行为：`PackageInspection` 见 [skill-contract SPEC](../skill-contract/SPEC.md#parse)，`SkillCatalog` 见 [skill SPEC 的目录](../skill/SPEC.md#catalog)，`SkillAccess` 见 [skill SPEC 的阶段](../skill/SPEC.md#stages)，两个端口见 [skill-contract SPEC 的需求端口](../skill-contract/SPEC.md#ports)。

| 义务                                                                                        | 验证方法                                                                                                                                         | 前提与未覆盖                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 性质 1：键只写一次，值如表所列；键常量等于 `provide`                                        | [tests/cordis-entry.spec.ts](tests/cordis-entry.spec.ts) 逐个断言 `provide` 的字面值与键常量等于 `provide`                                       | 键在源码里只有 `provide` 一处，由本测试与代码审阅共同保证 |
| 性质 1 与所有权表：五个类各有一个最小具体子类，装载后键上是该子类的实例，卸载后键上没有服务 | [tests/cordis-entry.spec.ts](tests/cordis-entry.spec.ts) 的表格用例，真实 Cordis 4.0.4 的 `Context`                                              | 子类是测试里的最小实现，不是提供者                        |
| 性质 2：`extends`、`implements`、`@owner`、不写 `inject`                                    | `tsc` 类型检查（`implements`）；源码审阅                                                                                                         | `@owner` 与不写 `inject` 不由运行测试覆盖                 |
| 性质 5：导出集合恰为五个类与五个键常量                                                      | 同一测试文件的导出集合断言；[tests/public-entry.spec.ts](tests/public-entry.spec.ts) 断言根入口没有运行导出、源码不导入 Cordis、构建产物没有导入 | 根入口导入边界只核对 `src/index.ts` 与 `dist/index.js`    |
| 性质 6：不导入提供者                                                                        | `package.json` 的依赖只有 `skill-contract` 与 Cordis；`lint:deps`                                                                                | 不由运行测试覆盖                                          |
| 性质 3、4：签名与 `Context` 增补                                                            | `tsc` 类型检查；skill-host-local 的子类与测试在编译期使用它们                                                                                    | 类型不是运行时校验                                        |
| 性质 8：缺席与换代                                                                          | 归使用方：skill-host-local 的 [tests/cordis-entry.spec.ts](../skill-host-local/tests/cordis-entry.spec.ts)                                       | 本成员不验证                                              |

命令：在成员目录运行 `pnpm run build`、`pnpm run typecheck` 与 `pnpm test`。测试经包名导入 `dist`，所以先构建再测试。

没有覆盖：Cordis 升版后键与装载读数的跨版本适用。升版时重跑本成员测试。`package-template scan` 对本成员的角色（ROLE）、IC-1、IC-5 读数是 `unknown`：`docs/architecture/constraints.json` 没有映射本成员入口的责任，该文件归集成线，本成员不改。人工核对见 [docs/cordis.md 的 IC 符合性映射](docs/cordis.md#ic-符合性映射)。
