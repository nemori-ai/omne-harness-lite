# Cordis 集成

本包提供本组的 Cordis 插件：`./cordis` 入口的 `skillPlugin`。服务键与抽象类归 [skill-cordis-contract](../../skill-cordis-contract/docs/cordis.md)，本页写插件怎样装载、依赖什么、撤除时发生什么，以及它怎样符合 IC 约定。行为条款归 [SPEC 的 Cordis 插件](../SPEC.md#cordis-插件)。Cordis 采用发布包 `@deepseek-ai/cordis@4.0.4`。本页是候选，尚未取得技术接受。

本包的变体：根入口是纯函数工厂，没有 Cordis。`./cordis` 入口使它成为带 Cordis 插件的成员，原为 `module` 变体，现在没有「升为提供者」的命令。按[现有成员不自动迁移](../../../../docs/package-organization.md)的规则，`src/cordis.ts` 与 `tests/cordis-entry.spec.ts` 手工补入。`package-template scan` 现在把本成员读作 `service-provider` 变体。

## 集成入口

`@omne-harness/skill-host-local/cordis` 导出一个对象 `skillPlugin`：

| 项         | 内容                                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | `skill`                                                                                                                                                                                                                           |
| 配置       | 只接受缺席、`null` 或没有字段的普通对象（Standard Schema），其他值使加载失败。插件经 kernel-basis 的 `definePlugin` 定义，类型化的调用方给 `{}`（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)） |
| 依赖       | 没有 `inject`。两个端口是可选依赖，调用时现取（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）                                                                                                     |
| 提供的服务 | `skillPackageInspection`、`skillCatalog`、`skillAccess`，登记在装载它的 fiber 上，共一条 fiber（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）                                                    |
| 事件       | 没有                                                                                                                                                                                                                              |

`skillPlugin` 经 `@omne-harness/kernel-basis/cordis` 的 `definePlugin` 定义，`Config` 的类型是 `StandardSchema<object>`。插件体做三件事：造两个端口适配器，造目录来源 `createDirectorySource()`，用 `@omne-harness/skill` 的三个工厂造三个服务并逐个 `new` 三个服务子类。子类留在本包内部，把调用转给构造好的服务。

`skillPlugin` 在 [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 的插件树里由包名与导出名 `@omne-harness/skill-host-local/cordis` 的 `skillPlugin` 标识。它没有配置字段，所以没有要写进插件树行的数据。

## 端口的现取

两个端口适配器每次被调用时，从 `apply` 收到的 `ctx` 用 `skillReadCheckKey` 或 `skillResolutionKey` 取服务。端口在场时，适配器把参数原样转过去，答复原样交回。端口缺席时的答法由 [SPEC「Cordis 插件」](../SPEC.md#port-absent)拥有，本页不复述。

适配器不缓存取到的引用，也不用服务方法里调用方的上下文。换代粒度：每次端口调用都现取；同一操作中，换代之后发出的端口调用用新实例，已经交回的答复不重算。`skillPackageInspection` 不依赖端口，端口缺席时照常检查包。

## 生命周期与清理

插件不登记撤除函数。三个服务子类登记在插件的 fiber 上，fiber 卸载时 Cordis 撤除它们，之后三个键上 `ctx.get` 答 `undefined`。目录来源没有状态、句柄与外部效果，没有需要撤除的资源，所以没有撤除函数。撤除不撤回已经交出的答复。

## 依赖分类

| 依赖方                                                | 怎样依赖                                                                                             | 换代或缺席时                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 本插件对 `skillReadCheck`、`skillResolution`          | 可选依赖，不 `inject`，每次调用 `ctx.get`                                                            | 缺席：见 [SPEC](../SPEC.md#port-absent)；换代后下一次端口调用用新实例 |
| 使用三个服务的插件                                    | 按键取用，见 [skill-cordis-contract 的依赖分类](../../skill-cordis-contract/docs/cordis.md#依赖分类) | 插件卸载后键上没有服务                                                |
| 本包对 `@omne-harness/skill`、`skill-cordis-contract` | `package.json` 的生产依赖，引用它们的公开入口                                                        | 不适用                                                                |

## IC 符合性映射

| 规则                                                                           | 本包怎样符合                                                                                                                                                                                                                                                    | 现在的证据                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IC-1](../../../../docs/architecture/cordis-integration-conventions.md#ic-1)   | 引用 skill-cordis-contract 的定义，不另写键或类                                                                                                                                                                                                                 | 源码；[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts)。`scan` 读数 `unknown`（`docs/architecture/constraints.json` 未映射入口责任），人工核对：`src/cordis.ts` 的键只经 `skill-cordis-contract/cordis` 的键常量引用，源码里没有键字面量，用例里的类型位置也用 `typeof <键常量>` |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)   | 一个插件体里逐个 `new` 三个子类，共一条 fiber。理由取自波包决定 3：三个服务没有共享资源，撤除没有要等的东西，一条 fiber 最简单，与 MCP 同形                                                                                                                     | 用例「removes the three services when the plugin unloads」                                                                                                                                                                                                                            |
| [IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3)   | 做到：抽象 Service 与其 `@owner` 在 skill-cordis-contract；本成员的三个子类继承它们，不另写键或签名。`PackageInspection`、`SkillReadCheck`、`SkillResolution` 在 `skill-contract/provider`，不在根入口，W4 Skill 规格已定，定义成员 `implements` 它们的实际出处 | 源码；skill-cordis-contract 的 [SPEC](../../skill-cordis-contract/SPEC.md)                                                                                                                                                                                                            |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)   | 根入口不导入 Cordis，插件只从 `./cordis` 发布                                                                                                                                                                                                                   | [public-entry.spec.ts](../tests/public-entry.spec.ts)                                                                                                                                                                                                                                 |
| [IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)   | 只依赖 skill-cordis-contract 与 skill 的公开入口，不依赖端口提供者                                                                                                                                                                                              | `lint:deps`。`scan` 读数 `unknown`（`docs/architecture/constraints.json` 未映射入口责任），人工核对：`src/cordis.ts` 的导入只来自 `@omne-harness/skill`、`skill-contract`、`skill-cordis-contract/cordis`、`kernel-basis/cordis` 与本包的 `directory-source.ts`，没有端口提供者包     |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6)   | 未验证；同一 isolate 只装一次的前提由装配承担。插件不检查自己是否已装                                                                                                                                                                                           | 未验证，见「未覆盖」                                                                                                                                                                                                                                                                  |
| [IC-7](../../../../docs/architecture/cordis-integration-conventions.md#ic-7)   | 做到：键名取自 skill-cordis-contract 的全表，`skillPackageInspection`、`skillCatalog`、`skillAccess` 是 camelCase 名词，表达能力而非实现；本包名 `skill-host-local` 表达实现方式（本地目录）                                                                    | 源码；键表在 [skill-cordis-contract](../../skill-cordis-contract/SPEC.md)                                                                                                                                                                                                             |
| [IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)   | 不适用：插件没有必需依赖，不写 `inject`。两个端口是可选依赖，见 IC-9                                                                                                                                                                                            | 源码；缺席用例                                                                                                                                                                                                                                                                        |
| [IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)   | 两个端口调用时现取，接受 `undefined`，不缓存                                                                                                                                                                                                                    | 缺席与换代用例                                                                                                                                                                                                                                                                        |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) | 经 `definePlugin` 定义；配置 Schema 只接受缺席、`null` 或没有字段的普通对象，其他值使加载失败                                                                                                                                                                   | 配置表格用例「answers exactly for %s」；用例「refuses to load with a non-empty configuration and provides nothing」                                                                                                                                                                   |
| [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) | 插件由包名与导出名标识，没有配置字段，运行时对象不进插件树                                                                                                                                                                                                      | 源码                                                                                                                                                                                                                                                                                  |

## 验证义务

本包验证：三个键取得到服务并走通「描述、读」；两个端口逐个缺席时依赖它的操作答 `unknown` 而检查照常；端口换代后用新的实例；撤除后三个键取不到；非空配置使加载失败。这些在 [tests/cordis-entry.spec.ts](../tests/cordis-entry.spec.ts)，每条的反例在 [SPEC](../SPEC.md#cordis-插件的验证)。

## 未覆盖

- 撤除插件时在途操作的答复：未验证。在途操作持有它已经取到的服务实例的结果，本包不规定它的结局。
- 撤除之后对装载时的 `ctx` 调用 `ctx.get` 的答复：未验证。
- IC-6：同一 isolate 重复装载、多 isolate 并存：未验证。同一 isolate 只装一次的前提由装配承担。
- 应用插件树中的装配：未执行。
- 真实端口提供者与消费者的组合：未执行。
- 两个端口只用 `@omne-harness/skill-contract/testing` 的内存替身验证。真实的读判定与解析实现，要等它们的实现方装载后验证。
- `docs/architecture/constraints.json` 没有映射本包 `src/` 与新成员 skill-cordis-contract 的入口责任，`package-template scan` 为此报角色读数 `unknown`（本包五个源文件各一条，skill-cordis-contract 一条）。该文件归集成线，本包不改。
- `package-template scan` 对本成员的结构读数是 `fail`：W3 的 `examples/sample-skill/` 里有模板未声明的目录（`.omne/`、`scripts/`）。这是基线既有读数，本包不改。
