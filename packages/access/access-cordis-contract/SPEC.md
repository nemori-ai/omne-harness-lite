# @omne-harness/access-cordis-contract 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。本包几乎只有类型；类型以外的行为只有两条：`mount` 的效应绑定，和 `AccessAssemblyError` 的形状。

## 范围与依据

设计依据是 [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 修订 5 的第 5 节「登记表与贡献」与第 16 节「成员怎么放，依赖方向」，交付卡 #1223；身份端口是交付卡 #1233。协议契约与编解码的现行形状归[公开契约规格](../public-contract/SPEC.md#共同契约)「共同契约」。登记表的状态与撤下的规则归[服务端接入规格](../server-entry/SPEC.md#登记表)「登记表」。

不在本包：`defineAccessPlugin`（还没有建）、登记表的实现、管道用的 `enter` 与 `subscribe`、主体的具体形状、身份端口的实现。

## 结果与不变量

### 贡献覆盖契约

`AccessContribution<P>` 为 `P` 的每个操作要一个处理函数，为每个观察要一个帧来源。少一个、多一个都编不过。处理函数的消息体类型取自操作的 `body` 编解码；答复只能是操作结果集里的结果：带编解码的结果带对应的消息体，固定结果不带消息体。

### 主体按身份一栏

调用上下文的 `principal` 按操作契约的 `identity` 一栏：`none` 时是 `undefined`，`login` 时是 `LoginIdentity`，`acting-tenant` 时是 `Principal`。这两个类型是不透明的：本包不导入身份成员，只有[身份端口](#身份端口)的实现能产生它们，管道从端口拿到后原样交给处理函数。具体形状由接上身份的那一程定。

### 身份端口

`AccessIdentity` 是接入的管道向身份要的端口。接口归接入，放在本包，和 `LoginIdentity`、`Principal` 在一起；实现归身份一侧的适配。它有三个方法：

| 方法 | 输入 | 结果 |
| --- | --- | --- |
| `identifyLogin(proof)` | `Authorization` 头里的登录证明原文 | `{ outcome: 'identified', login }` 或失败 |
| `actFor(login, tenant)` | 认出的登录；`Omne-Acting-Tenant` 头的原文 | `{ outcome: 'issued', principal }` 或失败 |
| `reportAccess(login)` | 认出的登录 | 一次成功的业务访问。管道不等它，它失败不改答复 |

失败 `IdentityFailure` 只有两种：`{ outcome: 'denied' }` 与 `{ outcome: 'basis-unavailable' }`。前两个方法的结果用 `outcome` 区分，因为登录与主体都是不透明的类型。端口抛出或返回失败的 Promise 时，管道按 `basis-unavailable` 处置。

租户的文本是不是合规的租户、这个登录能不能代它，由实现判断。管道每次调用都调端口，不缓存结果。端口怎样被管道调用、各种结果怎样答复，归[服务端接入规格的管道](../server-entry/SPEC.md#身份规则)。

### mount 是调用者作用域上的效应

`AccessRegistryService.mount(contribution)` 在调用者的 Cordis 作用域上建一个效应：

1. 效应建立时同步调用提供者的 `attach(contribution)`。同名同主版本的协议已经挂着时，`attach` 抛 `AccessAssemblyError`，错误同步传给调用者，调用者的插件失败，已挂的那份不动。
2. `attach` 返回的撤下函数是这个效应的收回函数。作用域卸载时 Cordis 调用它；它同步把协议撤下，返回一个在这份贡献最后一个在途工作结束时完成的 Promise。Cordis 4.0.4 的卸载等这个 Promise，所以插件的卸载在最后一个在途工作结束之后才完成。

接入插件不写撤下的代码。

### 装配错误

`AccessAssemblyError` 是 `Error`，`name` 是 `AccessAssemblyError`，`protocol` 是 `{ name, major }`，`message` 是 `protocol <name>/v<major> is already mounted`。

## 所有权、失败与生命周期

- 贡献的寿命由挂上它的插件作用域决定；撤下的同步段、排空与「撤下完成」由服务端接入的登记表拥有。
- 本包不持有状态。`AccessRegistryService` 的实例由提供者构造，提供者拥有登记表的全部状态。
- 撤下不撤回任何外部效果：已经开始的提交类调用按服务端接入的收场规则答 `unknown`。

## 组合与验证

| 义务 | 验证 |
| --- | --- |
| [贡献覆盖契约](#贡献覆盖契约) | `tests/contribution.spec-d.ts` |
| [主体按身份一栏](#主体按身份一栏) | `tests/contribution.spec-d.ts` |
| [身份端口](#身份端口) | `tests/identity.spec-d.ts`；端口在管道里的用法由服务端接入的 `tests/pipeline-identity.spec.ts` 验证 |
| [mount 是调用者作用域上的效应](#mount-是调用者作用域上的效应) | `tests/mount.spec.ts` 与服务端接入的 `tests/registry-cordis.spec.ts`，真实的 Cordis 4.0.4，不用替身 |
| [装配错误](#装配错误) | `tests/public-entry.spec.ts`；服务端接入的 `tests/registry.spec.ts` 与 `tests/registry-cordis.spec.ts` |

依赖方向：本包源码只依赖公开契约与 `@deepseek-ai/cordis`，门禁 `access-cordis-contract-only-contract-and-cordis`（`tools/repo-config/dependency-cruiser.cjs`）守这一条。
