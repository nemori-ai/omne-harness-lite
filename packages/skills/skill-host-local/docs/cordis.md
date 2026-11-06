# Cordis 集成

本包提供本组的 Cordis 插件：`./cordis` 入口的 `skillPlugin`。服务键与抽象类归 [skill-cordis-contract](../../skill-cordis-contract/docs/cordis.md)，本页写插件怎样装载、依赖什么、撤除时发生什么，以及它怎样符合 IC 约定。行为条款归 [SPEC 的 Cordis 插件](../SPEC.md#cordis-插件)。Cordis 采用发布包 `@deepseek-ai/cordis@4.0.4`。本页是候选，尚未取得技术接受。

本包的变体：根入口是纯函数工厂，没有 Cordis。`./cordis` 入口使它成为带 Cordis 插件的成员，原为 `module` 变体，现在没有「升为提供者」的命令。按[现有成员不自动迁移](../../../../docs/package-organization.md)的规则，`src/cordis.ts` 与 `tests/cordis-entry.spec.ts` 手工补入。`package-template scan` 仍把本成员读作 `module`，这条读数在交回里说明。

## 集成入口

`@omne-harness/skill-host-local/cordis` 导出一个对象 `skillPlugin`：

| 项         | 内容                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`     | `skill`                                                                                                                                                                        |
| 配置       | 只接受缺席、`null` 或空对象（Standard Schema），其他值使加载失败（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)）                             |
| 依赖       | 没有 `inject`。两个端口是可选依赖，调用时现取（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）                                                  |
| 提供的服务 | `skillPackageInspection`、`skillCatalog`、`skillAccess`，登记在装载它的 fiber 上，共一条 fiber（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)） |
| 事件       | 没有                                                                                                                                                                           |

插件体做三件事：造两个端口适配器，造目录来源 `createDirectorySource()`，用 `@omne-harness/skill` 的三个工厂造三个服务并逐个 `new` 三个服务子类。子类留在本包内部，把调用转给构造好的服务。

`skillPlugin` 在 [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 的插件树里由包名与导出名 `@omne-harness/skill-host-local/cordis` 的 `skillPlugin` 标识。它没有配置字段，所以没有要写进插件树行的数据。

## 端口的现取

两个端口适配器每次被调用时，从 `apply` 收到的 `ctx` 用 `ctx.get(SkillReadCheckService.provide)` 或 `ctx.get(SkillResolutionService.provide)` 取服务：

| 情形                   | 答复                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| 端口在场               | 把参数原样转过去，答复原样交回                                            |
| `skillReadCheck` 缺席  | `check` 答 `{ kind: 'unknown' }`                                          |
| `skillResolution` 缺席 | `resolve` 答 `{ kind: 'unknown' }`，`adopted` 答 `{ failure: 'unknown' }` |

适配器不缓存取到的引用，也不用服务方法里调用方的上下文。端口换代后，下一次操作用新的实例。缺席不放行：依赖端口的操作答 `unknown`，不交内容。`skillPackageInspection` 不依赖端口，端口缺席时照常检查包。

## 生命周期与清理

插件不登记撤除函数。三个服务子类登记在插件的 fiber 上，fiber 卸载时 Cordis 撤除它们，之后三个键上 `ctx.get` 答 `undefined`。目录来源没有状态、句柄与外部效果，没有需要撤除的资源，所以没有撤除函数。撤除不撤回已经交出的答复。

## 依赖分类

| 依赖方                                                | 怎样依赖                                                                                             | 换代或缺席时                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 本插件对 `skillReadCheck`、`skillResolution`          | 可选依赖，不 `inject`，每次调用 `ctx.get`                                                            | 缺席答 `unknown`；换代后下一次调用用新实例 |
| 使用三个服务的插件                                    | 按键取用，见 [skill-cordis-contract 的依赖分类](../../skill-cordis-contract/docs/cordis.md#依赖分类) | 插件卸载后键上没有服务                     |
| 本包对 `@omne-harness/skill`、`skill-cordis-contract` | `package.json` 的生产依赖，引用它们的公开入口                                                        | 不适用                                     |

## IC 符合性映射

| 规则                                                                           | 本包怎样符合                                                                                                | 现在的证据                                                  |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [IC-1](../../../../docs/architecture/cordis-integration-conventions.md#ic-1)   | 引用 skill-cordis-contract 的定义，不另写键或类                                                             | 源码；[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)   | 一个插件体里逐个 `new` 三个子类，共一条 fiber。选共一条的理由：三个服务是同一份实现的三个面，卸载应同时发生 | 用例「removes the three services when the plugin unloads」  |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)   | 根入口不导入 Cordis，插件只从 `./cordis` 发布                                                               | [public-entry.spec.ts](../tests/public-entry.spec.ts)       |
| [IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)   | 只依赖 skill-cordis-contract 与 skill 的公开入口，不依赖端口提供者                                          | `lint:deps`                                                 |
| [IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)   | 两个端口调用时现取，接受 `undefined`，不缓存                                                                | 缺席与换代用例                                              |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) | 配置 Schema 只接受缺席或空对象，非空使加载失败                                                              | 用例「refuses to load with a non-empty configuration」      |
| [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) | 插件由包名与导出名标识，没有配置字段，运行时对象不进插件树                                                  | 源码                                                        |

## 验证义务

本包验证：三个键取得到服务并走通「描述、读」；两个端口逐个缺席时依赖它的操作答 `unknown` 而检查照常；端口换代后用新的实例；撤除后三个键取不到；非空配置使加载失败。这些在 [tests/cordis-entry.spec.ts](../tests/cordis-entry.spec.ts)，每条的反例在 [SPEC](../SPEC.md#cordis-插件的验证)。

## 未覆盖

- 撤除插件时在途操作的答复：未验证。在途操作持有它已经取到的服务实例的结果，本包不规定它的结局。
- 撤除之后对装载时的 `ctx` 调用 `ctx.get` 的答复：未验证，也不需要回答。
- 两个端口只用 `@omne-harness/skill-contract/testing` 的内存替身验证。真实的读判定与解析实现，要等它们的实现方装载后验证。
- `docs/architecture/constraints.json` 没有映射新成员 skill-cordis-contract 的入口责任，`package-template scan` 为此报一条角色读数 `unknown`。该文件归集成线，本包不改。
- `package-template scan` 把本成员读作 `module` 变体，且结构读数是 `fail`：W3 的 `examples/sample-skill/` 里有模板未声明的目录（`.omne/`、`scripts/`）。这是基线既有读数，本包不改。
