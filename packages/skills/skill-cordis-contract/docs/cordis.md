# Skill 的 Cordis 定义

本页是 Skill 各接缝的 Cordis 定义正文：服务键、抽象 `Service`、依赖分类，以及它们怎样符合 IC 约定。性质编号指本成员 [SPEC](../SPEC.md#结果与不变量) 的性质 1 至 8。领域行为归 [skill-contract SPEC](../../skill-contract/SPEC.md)。

接受范围：本页是候选，尚未取得技术接受。键名与抽象类的写法来自 #1119 W4 的 Skill 规格与波包决定，不入库。Cordis 采用发布包 `@deepseek-ai/cordis@4.0.4`。

## 集成入口

`./cordis` 导出五个抽象类与五个键常量，并声明五个键的 `Context` 增补。它没有插件，也没有事件。

| 键                       | 抽象 Service                   | `implements`            | 提供者                                                                     | 对使用方                         |
| ------------------------ | ------------------------------ | ----------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| `skillPackageInspection` | `PackageInspectionService`     | `PackageInspection`     | [skill-host-local](../../skill-host-local/docs/cordis.md) 的 `skillPlugin` | 按键取用                         |
| `skillCatalog`           | `SkillCatalogService<P, S>`    | `SkillCatalog<P, S>`    | 同上                                                                       | 按键取用                         |
| `skillAccess`            | `SkillAccessService<P, S>`     | `SkillAccess<P, S>`     | 同上                                                                       | 按键取用                         |
| `skillReadCheck`         | `SkillReadCheckService<P, S>`  | `SkillReadCheck<P, S>`  | 别的领域的装配                                                             | 可选依赖，现取，缺席答 `unknown` |
| `skillResolution`        | `SkillResolutionService<P, S>` | `SkillResolution<P, S>` | 别的领域的装配                                                             | 同上                             |

类的 JSDoc 写 `@owner packages/skills/skill-cordis-contract`。五个类都不写 `static inject`。

## 生命周期与清理

本成员没有资源，没有撤除函数，也不产生外部效果。子类实例登记在装载它的插件的 fiber 上，fiber 卸载时 Cordis 撤除它，之后键上没有服务。撤除一个服务不撤回它已经交出的结果。

## 依赖分类

| 依赖方               | 怎样依赖                                                                                                                                              | 换代或缺席时                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 提供三个服务的插件   | `extends` 三个抽象类，在 `apply` 里 `new`，共一条 fiber（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）               | 插件卸载，三个键同时撤除                                     |
| 使用三个服务的插件   | 只把需要服务的那段工作放进子 fiber：`ctx.inject(['skillAccess'], cb)`（[IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)） | 服务换代，只有子 fiber 重跑                                  |
| 两个端口的实现方     | `extends` 端口抽象类，作为插件装载，不另写键                                                                                                          | 卸载或换代后，下一次调用现取到新实例，或取不到而答 `unknown` |
| 读取两个端口的使用方 | 不 `inject`，每次调用 `ctx.get(<键常量>)`（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）                             | 不持有旧引用                                                 |
| 只需要类型增补的一方 | 不 `inject`。`import type {} from '@omne-harness/skill-cordis-contract/cordis'`                                                                       | 不适用                                                       |
| 只需要接口类型的包   | 从 [skill-contract](../../skill-contract/README_ZH.md) 导入，不需要本成员                                                                             | 不适用                                                       |

依赖方只引用本成员与 skill-contract，不导入提供者的入口（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。提供者的选择归应用装配。

## IC 符合性映射

| 规则                                                                                                     | 本成员怎样符合                                                         | 现在的证据                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [IC-1](../../../../docs/architecture/cordis-integration-conventions.md#ic-1) 一个接缝一个服务定义        | 五个接缝各只有本成员这一份定义。skill-host-local 与调用方都引用它      | skill-host-local 没有另写键                                                                         |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次              | 键只在各类的 `provide`，键常量取自它；插件体里逐个 `new` 子类          | [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 逐个断言 `provide` 与键常量等于 `provide`     |
| [IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) 抽象 Service 与 `@owner`    | 抽象类 `implements` 五个接口，JSDoc 写 `@owner`                        | 类型检查；源码                                                                                      |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关        | 根入口没有导出，定义只在 `./cordis`                                    | [public-entry.spec.ts](../tests/public-entry.spec.ts)                                               |
| [IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5) 消费者不依赖提供者          | `./cordis` 只导入 skill-contract 类型与 Cordis                         | `package.json` 的依赖；`lint:deps`                                                                  |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 本成员只定义键。重复装载的处置归提供者                                 | 归 skill-host-local                                                                                 |
| [IC-7](../../../../docs/architecture/cordis-integration-conventions.md#ic-7) 成员名与键名                | 键用 camelCase 名词，不写成实现名                                      | 源码                                                                                                |
| [IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8) 必需依赖写 `inject`         | 五个类不写 `static inject`；使用方按[依赖分类](#依赖分类)              | 源码                                                                                                |
| [IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9) 可选依赖现取                | 两个端口按调用现取，接受 `undefined`                                   | skill-host-local 的 [tests/cordis-entry.spec.ts](../../skill-host-local/tests/cordis-entry.spec.ts) |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) 插件配置校验              | 不适用。本成员没有插件与配置                                           | 不适用                                                                                              |
| [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 运行时对象不进插件树      | 两个端口是运行时对象，由装配以服务提供，使用方现取；本成员没有插件树行 | 不适用于本成员                                                                                      |

## 机制读数与假设

本成员用到下列 Cordis 机制。有 basis 条目的以条目为准。

| 机制                                        | 依据                                                                                                                    | 支撑   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| 抽象 `Service` 子类在抽象类给的键上提供服务 | [service-subclass-provides-its-key](../../../../.meta_harness/design/basis/cordis/service-subclass-provides-its-key.md) | 性质 1 |
| `inject` 没有可选形式                       | [inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md)             | 性质 8 |
| `ctx.<键>` 与 `ctx.get` 的分工              | [ctx-property-is-not-ctx-get](../../../../.meta_harness/design/basis/cordis/ctx-property-is-not-ctx-get.md)             | 性质 8 |

本成员的测试在 Cordis 4.0.4 上固定了：插件 `apply` 内 `new` 的子类登记在该插件的 fiber 上，fiber 卸载后 `ctx.get` 答 `undefined`。这是 skill-host-local 测试的读数，还没有进入 basis，跨版本适用是待核验假设。Cordis 升版时重跑两个成员的测试。

## 验证义务

本成员自己验证：

- 根入口没有运行导出，源码与构建产物不加载 Cordis。
- `./cordis` 的导出集合恰为五个抽象类与五个键常量。
- 五个键常量等于各类的 `provide`，值如上表。
- 子类作为插件装载后在键上提供服务，卸载后键上没有服务。

这些在 [tests/](../tests/README.md) 里有测试。端口缺席、换代与撤除后的行为归使用方，见 [skill-host-local](../../skill-host-local/docs/cordis.md#验证义务)。
