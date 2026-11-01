# session-cordis 的 Cordis 集成

本页是 Session 的 Service 实现正文：具体子类与插件、`inject`、配置、提供的键、端口的现取、调用方类核对、提交通知的派发与订阅、扫描者绑定、登记与撤除、换代，以及它们怎样符合 IC 约定。性质编号指本成员 [SPEC](../SPEC.md#提供者责任) 的性质 1 至 11。

服务键、抽象类、四个面、调用方类、端口服务键、事件与依赖分类归 [session-cordis-contract 的 Cordis 说明](../../session-cordis-contract/docs/cordis.md)，本插件继承这些定义，不重复提供键。机制归 [session](../../session/SPEC.md)。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)，四个运行成员共同的生命周期归[运行契约集成](../../../../docs/architecture/runtime/runtime-contract-integration.md#必需依赖局部依赖与有序交接)，本页不复制。

现状：`src/cordis.ts` 与 `src/index.ts` 只有模板标记，两个入口都没有导出。下文是 SPEC 固定的目标形状，不是源码事实。机制事实按已采用的 Cordis 4.0.4 核对。有 basis 条目的写条目链接，只有源码读数的标明「源码读数」。

访问检查类型与独立脚本替身已由 session-contract 导出。[session-cordis-contract](../../session-cordis-contract/docs/public-api.md) 已导出 `SessionAccessCheckService` 与 `sessionAccessCheckKey`。事务 commit 的显式 access、工厂必需 accessCheck 与实际读写 check 已在 session-contract 与 session-adapters 的内存替身接入（见[访问检查](../../session-contract/docs/access-check.md)）。本成员的生产注入尚未接入。本成员仍无运行实现，生产运行尚未验证。

## 插件与服务

`./cordis` 导出 `SessionService` 的具体子类，子类本身就是插件。本成员只提供一个键 `session`。抽象类的构造函数以这个键登记服务，子类不写键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[service-subclass-provides-its-key](../../../../.meta_harness/design/basis/cordis/service-subclass-provides-its-key.md)）。服务登记在本插件的 fiber 上，插件撤除时键上就没有服务了。

只提供一个键，是因为四个面共享同一条权威提交序列、同一组端口与同一个实例。把子类拆成几个键的提供者，会让撤除与在途承诺分散到几条 fiber 上，而定义成员也只定义了一个键（定义性质 2）。

服务实例拥有一个 `SessionInstance`。四个面属性把调用转给 `facesFor(caller)` 给出的面，并在转发前加上调用方类的第一层核对（性质 6）。实例的 `committed` 由本插件的事件监听调用，`maintain` 由本插件的扫描者绑定调用，`close` 由撤除调用。`changed` 现在没有调用方，见 [SPEC 的明确缺项](../SPEC.md#明确缺项)。

## 注入、配置与生命周期

### inject

```ts
static inject = [
  'sessionAccessCheck',
  'sessionDelegatedTransactions',
  'sessionPrincipals',
  'sessionWorkPrincipals',
  'assemblyLifecycle',
]
```

元素也可以是从 `@omne-harness/session-cordis-contract/cordis` 导入的键常量，常量名以定义成员的源码为准。不在运行时拼键，也不经变量转手。`inject` 只写访问检查、委派事务入口、内部主体、会话工作主体与装配生命周期五个键（[SPEC 性质 2](../SPEC.md#服务与依赖)）。没有委派事务入口，单会话的读写都不成立；两个受信键只在装配的受信子树内可见（[受信服务键](../../session-cordis-contract/docs/cordis.md#受信服务键)）。`assemblyLifecycle` 沿用私有键并登记 IC-8 偏离，跟随 W1-APP-0 第 (e) 项的裁定。写进 `inject` 等于声明「它换代或不在，本插件就卸载重跑」（[IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)）。其余端口不进 `inject`，因为 `inject` 没有可选形式（[inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md)），而这些端口缺席时只应影响需要它的操作。

内部主体经服务键 `sessionPrincipals`、会话工作主体经受信键 `sessionWorkPrincipals` 进 `inject`：没有它们时协调器与调度器不能提交，实例无法构造（性质 8）。五项都在场是插件体运行的条件。公开事务端口 `sessionTransactions` 不进 `inject`，只为 `pending`、`references` 与 `releasedScopes` 按调用现取。

### 端口的现取

除 `inject` 的五项外，端口都在调用点经 `ctx.get` 现取。`ctx.<键>` 只留给 inject 过的键（[ctx-property-is-not-ctx-get](../../../../.meta_harness/design/basis/cordis/ctx-property-is-not-ctx-get.md)）。现取用插件装载时捕获的本插件 Context：

- 服务方法里的 `this.ctx` 是调用方的 Context（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。用它现取端口，看到的是调用方所在 isolate 的视图，不是本插件的视图。
- 协调器与调度器的调用没有调用方，只能用本插件的 Context。

现取用严格读法。提供者 fiber 不在 `ACTIVE` 时读不到它，代理按缺席处置（[inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md)）。每个键交给工厂的形状、缺席与抛出时的表现见 [SPEC 的端口接线](../SPEC.md#端口接线)。

### 配置

Service 子类用静态 `Config` 声明 Standard Schema（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。

| 字段 | 含义 | 去向 |
| --- | --- | --- |
| `policy` | session 的 `SchedulingPolicy`。每个字段可以省略，省略时取 `defaultSchedulingPolicy`。字段含义与初值归 session SPEC 的 [SchedulingPolicy](../../session/SPEC.md#schedulingpolicy) | 合成完整策略后作为 `SessionConfiguration.policy` 传给工厂 |
| `disposeWaitMs` | 撤除时等待实例 `close` 完成的上限，毫秒 | 本插件的撤除 effect |
| `admission` | 省略或 `'none'`。`'none'` 表示装配声明本部署没有命令域与 hooks，`accept` 不经槽；省略时受理槽缺席按不可用处理，`accept` 返回 `unavailable` | [SPEC 性质 8](../SPEC.md#唤醒调用方与扫描者) |

校验拒绝未知键、类型错误、负数、零上限、空退避序列与非有限数。`preEvaluation.prewarm` 只接受 `false`，与 session 的类型一致：Agent 宿主创建实例的入口定义之前，配置无法打开预热（[配置](../../session/docs/public-api.md#配置)）。`disposeWaitMs` 的初值随实现确定。根关闭的物理等待上界由部署给出，本字段只限制本插件的等待（[必需依赖、局部依赖与有序交接](../../../../docs/architecture/runtime/runtime-contract-integration.md#必需依赖局部依赖与有序交接)）。

配置错误时插件加载失败，fiber 进入 `FAILED`，不提供服务（[plugin-throw-fails-fiber](../../../../.meta_harness/design/basis/cordis/plugin-throw-fails-fiber.md)）。这条 basis 按函数插件核验。Service 子类静态 `Config` 的路径没有单独核验，对本插件还是假设，由本成员的测试补证。`inject` 的五项任一缺席时 fiber 停在 `PENDING`。两种状态分别诊断。

配置只放可序列化的数据。租户、主体、受理槽、句柄与回调不进配置，也不进插件树（[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。

### 生命周期

| 阶段 | 本插件做什么 | 依据 |
| --- | --- | --- |
| 装载 | 静态 `Config` 校验配置；`inject` 的五项都在场后插件体运行；捕获本插件 Context；构造端口代理与组合通知者；调用工厂；用 `ctx.on` 监听提交通知 | 性质 2 至 5 |
| 运行 | 面调用经调用方类核对后转给实例；每条提交通知交给实例，并为新见到的租户绑定扫描者 | 性质 5 至 7 |
| 其他端口换代 | 插件体不重跑。下一次调用现取到新提供者 | 性质 10 |
| `inject` 的任一项换代 | 插件体先卸载再重跑：旧实例按撤除顺序停止，新实例重新构造 | 性质 10 |
| 卸载 | 按[撤除顺序](#撤除顺序)停止 | 性质 9 |

## 调用方类核对

调用方插件用对象形式 `inject: { session: { caller } }` 声明调用方类（[intercept 配置与调用方类](../../session-cordis-contract/docs/cordis.md#intercept-配置与调用方类)）。四个面属性在每次读取时核对一次：

1. 用 `this[Service.resolveConfig]()` 取调用方 fiber 的配置。
2. 取不到配置，或调用方类不在 `intake`、`coordinator`、`maintainer`、`reader` 之中时，返回一个每个操作都返回 `denied` 的面，`action` 为操作名。不默认为任何一类。经 `ctx.get` 现取服务的调用方没有这份配置，所以会被拒绝。
3. 取到时返回 `facesFor(caller)`。实例在每个操作上再核对调用方类是否在该操作允许的范围内，不在其中时返回 `denied`。

`facesFor` 对每个调用方类给出的面可以缓存，四类共四份。调用方类属于调用方，不属于服务，所以每次读取面属性都重新取配置，不在装载时固定。调用方类只决定「以哪一类来调」，不授予资格。两层核对都是一致性检查，不计为访问控制。能做什么由每个操作的调用资格决定，租户随 `Access` 进入（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 提交通知的派发与订阅

本成员是事件 `session-cordis-contract/committed` 的派发方。事件的名称、模式 `parallel` 与载荷归定义成员（[事件](../../session-cordis-contract/docs/cordis.md#事件)）。

派发：工厂在每次提交确认耐久后，现取 `notifier` 并调用 `committed`（[CP-01](../../session/SPEC.md#cp-01) 第 6 步、[CP-02](../../session/SPEC.md#cp-02) 第 6 步）。本插件交给工厂的组合通知者做三件事：

1. 用本插件 Context 的 `parallel` 派发事件，载荷取自本次回执。不在提交路径上等待监听者。派发返回的 Promise 在 `await` 外捕获失败，包括 `AggregateError`，只记录诊断（[IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12)）。
2. 现取 `sessionNotifier`。存在时把同一载荷转发给它，例如由应用装配接上的跨进程转发。失败只记录诊断。
3. 为载荷里的租户绑定扫描者，见[扫描者绑定](#扫描者绑定)。

订阅：本插件用 `ctx.on` 监听同一事件，把载荷交给实例的 `committed`，并为载荷里的租户绑定扫描者。外来的通知来自别的进程经 `sessionNotifier` 一侧的转发重新派发，或来自同进程的其他派发方。本插件自己派发的通知可以按载荷对象的身份跳过，因为实例已在本地唤醒。跳过只是优化。通知可以丢失、重复或合并，都不改变事实，权威状态由扫描补查（[EC-11](../../session-contract/SPEC.md#ec-11)）。

监听者同步执行，不返回 Promise。监听者内部捕获失败，只记录诊断。撤除开始后，监听者不再把通知交给实例。

## 扫描者绑定

每个租户同一时刻只有一个恢复扫描者。第一版靠装配单实例兑现（[IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19)），兑现方式写在定义成员的[靠装配兑现的保证](../../session-cordis-contract/docs/cordis.md#靠装配兑现的保证)：

1. 应用装配在全部进程里只装一份本插件。同一 isolate 标签下的第二份在 `provide` 时失败（性质 1）。装配者不在两个 isolate 标签下各装一份。
2. 本插件维护一张「租户 → 维护句柄」表。第一次在通知里见到某个租户时调用 `maintain(tenant)`，实例随即对该租户做一次启动扫描（[S3](../../session/SPEC.md#s3)）。
3. 同一实例对同一租户再次 `maintain` 得到已有句柄。本插件也不为表里已有的租户再次调用。
4. `maintain` 返回失败时记录诊断，该租户不进表。该租户的下一条通知到达时再试。
5. 撤除时释放表里全部句柄。

启动扫描的租户集合按 [SPEC 性质 7](../SPEC.md#唤醒调用方与扫描者) 来自应用装配的部署枚举 `tenantDomains.enumerate`。这个键归 sql-contract，本成员不导入存储契约，交到本插件的通道还是[明确缺项](../SPEC.md#明确缺项)。通道补齐之前，进程重启后有待办而没有新提交的租户，在下一条通知之前不被启动扫描覆盖。本成员不声称启动扫描覆盖全部租户。

## 撤除顺序

撤除有两条触发路径（性质 9）。有序关闭时，`assemblyLifecycle` 的停止句柄执行下列四步；开始句柄不做任何事。插件卸载或换代时，本插件的 effect 执行下列四步，再退登记两个句柄。两条路径先后都触发时，后到的一次不重复执行任何一步，只等先到的一次结束。四步的顺序：

1. 标记撤除中。此后读到的面对每个操作返回 `unavailable`，`owner` 为 `session`。监听者不再交入通知，也不再绑定扫描者。
2. 释放全部维护句柄。
3. 调用实例的 `close()`，最多等待 `disposeWaitMs`。
4. 等待超时时记录诊断，然后返回。

四步写在同一个函数里按顺序 `await`，停止句柄与 effect 调用同一个函数。不同 effect 的释放是并发的，而且 disposer 的异常只写日志、不上抛（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。所以每一步由本插件自己捕获，失败时记录诊断并继续下一步。

`close` 的内部顺序归 session：调度器停止接受新的触发，在途命令跑完或返回未知，协调器在当前命令结束后停止，最后释放时钟等待与缓存（[资源与替换](../../session/SPEC.md#资源与替换)）。在途提交的收场：

| 在途情形 | 结果 | 谁接着做 |
| --- | --- | --- |
| 提交在撤除期间确认 | 调用方得到回执。不发通知 | 下一个实例的扫描按待办找回后续工作 |
| 提交未确认，或事务端口已离开 | 调用方得到 `commit-unknown` 或 `unavailable`，不改写为成功或失败 | 调用方以同一操作身份重试或调用 `queryOperation` |
| 等待超过 `disposeWaitMs` | 本插件返回，记录诊断。命令仍以上两行之一结束 | 同上两行 |
| 提交后、出站调用前 | 出站调用不发出 | 重启或换代后的 S3 找回并以同一身份重放 |

撤除不回滚已提交的事实，不补发未发出的出站调用，不发通知，不取消任何 Model、Tool、Agent 执行或子会话。外部效果不因 disposer 运行而变得可撤回。

## 登记与撤除

本成员不定义登记操作，也不采用 [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 的目录写法。本插件自己的效应只有两项，都落在本插件的 fiber 上：服务登记与提交通知的监听。它们随本插件卸载撤除。

提交参加者的登记、端口提供与入站插件的订阅归登记它们的 session-adapters 插件与存储插件（[session-adapters 的 Cordis 说明](../../session-adapters/docs/cordis.md)、[session-storage-sql 的 Cordis 说明](../../session-storage-sql/docs/cordis.md)）。它们随各自插件的 fiber 撤除。本插件撤除时，`inject` 了 `session` 的插件随之卸载或重跑，它们的效应与本插件的撤除并发运行。所以本插件撤除第 1 步之后的面调用返回 `unavailable`，而不是抛出。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 子类 `extends SessionService`，不写键，不自己 `ctx.provide` | 没有源码 |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口不导出任何东西。独立宿主从 session 取工厂 | [public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口没有导出 |
| [IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5) 消费者不依赖提供者 | 调用方插件只依赖服务定义。本成员不被任何包导入 | 没有源码 |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 重复装载在 `provide` 时失败 | 源码读数。测试随实现进入 |
| [IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)、[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9) 必需与可选依赖 | 只 `inject` 访问检查、委派事务入口、内部主体、会话工作主体与装配生命周期；其余端口用本插件 Context 现取；不跨调用持有端口引用 | 机制有 basis。测试随实现进入 |
| [IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11) 事件 | 派发定义成员声明的 `committed`，本成员不增补 `Events` | 没有源码 |
| [IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12) 通知的失败处理 | `parallel` 的失败在 `await` 外捕获；监听者同步执行；失败只记录诊断 | 没有源码 |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | 不定义登记。自己的效应落在本插件 fiber 上 | 不适用 |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) 配置校验 | 静态 `Config` 用 Standard Schema；间隔、上限、退避与撤除等待是配置字段，默认值只是初值 | Service 子类路径没有 basis，测试随实现进入 |
| [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 运行对象不进树 | 主体与受理槽经服务提供，不进配置 | 主体经服务键 `sessionPrincipals` 提供。受理槽的服务键未定义，见 SPEC 的明确缺项 |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17) 作用域不是 Context 或 isolate | 不为会话建 fiber 或 isolate。租户与会话是操作参数 | 没有源码 |
| [IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 租户是参数 | 调用方类不授予资格；扫描者的租户取自通知载荷，不取自 Context | 没有源码 |
| [IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19) 同进程保证的兑现方式 | 每租户一个扫描者靠装配单实例。见[扫描者绑定](#扫描者绑定) | 写在本页与 SPEC 性质 7 |

## 机制读数与假设

| 机制 | 依据现状 | 影响的性质 |
| --- | --- | --- |
| 服务方法与属性读取里的 `this.ctx` 是调用方 Context，`resolveConfig` 取到调用方的 intercept 配置 | `this.ctx` 有 basis（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。`resolveConfig` 只有源码读数，与[定义成员的同一条](../../session-cordis-contract/docs/cordis.md#机制读数与假设)共用一个待补的 probe | 性质 6 |
| 必需依赖换提供者，插件体重跑 | [plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md) | 性质 10 |
| 重跑插件体前是否等待旧 fiber 撤除完成 | 没有 basis，也没有源码读数。按「可能并存」设计 | 性质 10 |
| 严格读法的 `ctx.get` 读不到不在 `ACTIVE` 的提供者；`ctx.<键>` 只留给 inject 过的键 | [inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md)、[ctx-property-is-not-ctx-get](../../../../.meta_harness/design/basis/cordis/ctx-property-is-not-ctx-get.md) | 性质 2 |
| 同一 isolate 标签下重复 `provide` 抛出 | 源码读数 | 性质 1 |
| Service 子类静态 `Config` 校验失败使 fiber `FAILED` | basis 只核验了函数插件 | 性质 3 |
| effect 之间并发释放，异常只写日志 | [effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md) | 性质 9 |

读数补齐之前，性质 1、3、6 与性质 10 的顺序部分是假设，不是已核验的保证。Cordis 升版时，先重跑服务定义成员与本表列出的 basis probe。

## 验证义务

本成员的测试随实现进入 `tests/`，在真实 Cordis 4.0.4 上装载插件，不用 Cordis 的替身。端口提供者与调用方插件用测试内的最小插件代替，机制实例用真实的 session 工厂。至少覆盖 SPEC [验证](../SPEC.md#验证)列出的九项：

1. `inject` 的五项任一缺席时 `PENDING`，五项都到场后服务在场。
2. 其他端口逐个缺席只影响需要它的操作，到场后插件体不重跑。
3. 端口抛出时返回 `unavailable`。
4. 调用方类的两层核对。
5. 提交通知的派发、载荷与失败隔离。
6. 外来通知唤醒实例，每租户只绑定一个扫描者，失败后再试。
7. 配置错误 `FAILED`，重复装载失败。
8. 撤除顺序与在途提交的收场。
9. `inject` 的任一项换代后的接管与并存时的认回。

第 4、7 项与第 9 项里的并存，同时补证上节的三条假设。本成员不覆盖：跨进程的每租户单扫描者、持久化、真实邻域的端到端组合。定义入口自身的验证义务归 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md#验证义务)，机制的验证义务归 [session](../../session/SPEC.md#验证)。
