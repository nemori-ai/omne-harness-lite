<a id="model-cordis-公开定义候选"></a>
# Model Cordis 公开定义

本页是本包公开定义的源码导航，不重复声明。每个声明只有一个副本，在 `src/` 里。每章写这章给谁用，并链接声明它的源码文件与对应的测试。[`tests/exports.spec.ts`](../tests/exports.spec.ts) 核对：清单里每个名字都由所属章链接的源码文件声明，每个清单章至少链接一个存在的源码文件，页面链接的源码与测试文件都存在。

根入口导出八个登记类型：`ModelRegistrationFailure`、`ModelPublication`、`ModelRegistrationInput`、`ModelRegistration`、`ModelPublicationAuthority`、`ModelConverterRegistrationInput`、`ModelConverterAuthority`、`ModelConverterRegistration`。`./cordis` 再导出这八个类型，并导出下列值：

- 十五个抽象 Service 与键：`ModelCredentialService`（见[凭据服务定义](#凭据服务定义)）、`ModelRuntimeService`、`ModelCommandsService`、`ModelSendBoundaryService`、`ModelRetryPolicyService`、`ModelInstanceHostService`、`ModelClockService`、`ModelProfilesService`、`ModelProfileMaintenanceService`、`ModelRequestPreparationService`、`ModelMessageConversionService`、`ModelHostAuthorityService`、`ModelPublicationAuthorityService`、`ModelConverterAuthorityService`、`ModelDiagnosticsService`。
- 两个具体目录 `ModelInstancesService` 与 `ModelConvertersService`，及键 `modelInstancesKey` 与 `modelConvertersKey`。
- 结果接收登记：`ModelResultReceiverTable`（类型）、`createModelResultReceiverTable` 与 `ModelResultReceiverConflictError`，见[结果接收登记](#结果接收登记)。
- `Context` 的全部增补和事件 `model-cordis-contract/call-changed`。

`./testing` 导出结果接收登记的替身与符合性用例，见[结果接收登记](#结果接收登记)。

以上名字都已实现。精确清单见[验证说明](../verification/README.md#导出清单)。领域类型由[纯契约](../../model-contract/docs/public-api.md)拥有，登记行为由[SPEC](../SPEC.md)拥有。

## 服务定义与入口

本章给装配者和提供者作者：运行时服务、实例目录与登记类型。

- 声明：[`src/cordis.ts`](../src/cordis.ts)、[`src/registration.ts`](../src/registration.ts)、[`src/instances.ts`](../src/instances.ts)；两个目录的登记前置是 kernel-basis 的 [`registerInCallerFiber`](../../../assembly/kernel-basis/SPEC.md#调用方-fiber-登记辅助)。
- 类型探针：[`tests/registration-types.spec-d.ts`](../tests/registration-types.spec-d.ts)、[`tests/cordis-entry.spec-d.ts`](../tests/cordis-entry.spec-d.ts)。行为测试：[`tests/instances.spec.ts`](../tests/instances.spec.ts)、[`tests/service-definitions.spec.ts`](../tests/service-definitions.spec.ts)。

`ModelInstancesService.register` 是实例上的属性，不是方法。目录状态在构造函数建立的闭包里，`register` 用调用方的 Context 运行，登记随调用方 fiber 结束。依据见[目录的 Cordis 事实](cordis.md#目录的-cordis-事实)。

其余服务键与端口对应见[Cordis 主题](cordis.md#依赖与定义拥有者)。

## 完整服务定义与类型增补

本章给装配者和提供者作者：其余抽象服务与转换目录。方法用索引类型引用领域签名，不复制它们。

- 声明：[`src/cordis.ts`](../src/cordis.ts)、[`src/registration.ts`](../src/registration.ts)、[`src/converters.ts`](../src/converters.ts)。`Context` 与 `Events` 的增补在 `src/cordis.ts` 末尾的 `declare module`。
- 类型探针：[`tests/registration-types.spec-d.ts`](../tests/registration-types.spec-d.ts)、[`tests/cordis-entry.spec-d.ts`](../tests/cordis-entry.spec-d.ts)。行为测试：[`tests/converters.spec.ts`](../tests/converters.spec.ts)、[`tests/converters-keys.spec.ts`](../tests/converters-keys.spec.ts)、[`tests/service-definitions.spec.ts`](../tests/service-definitions.spec.ts)、[`tests/call-changed-doc.spec.ts`](../tests/call-changed-doc.spec.ts)。

`ModelConverterRegistrationInput.release` 是提供者自己对转换件所持资源的释放。目录在最后一个租约归还后调用它一次。`ModelConverterRegistration.release()` 的结果在提供者的释放钩子失败时带 `failure`，这时登记项也已移除。转换目录登记时拒绝非规范形式的媒体类型键和未知的模态键，`acquire` 对非规范形式的输入返回 `invalid`，见 [SPEC](../SPEC.md#转换目录的键与查询输入)。事件 `model-cordis-contract/call-changed` 的参数是租户、调用与已提交的修订。发送者是 `ModelRuntimeService` 的提供者，在提交新修订之后发出；消费者只订阅，不发出。

Context 以 unknown 表达边界输入，可信身份适配器在进入领域操作前校验主体。不能把类型断言当认证。框架定义根入口没有这些值导出。转换登记资格、同键冲突和退休资源见 [SPEC](../SPEC.md#转换目录的登记与资源)。

## 结果接收登记

本章给结果的消费者（Agent 宿主）和 Model 提供者：登记接收方的方法、登记表与替身。

- 声明：[`src/receivers.ts`](../src/receivers.ts)、[`src/testing/index.ts`](../src/testing/index.ts)；方法 `registerResultReceiver` 在 [`src/cordis.ts`](../src/cordis.ts) 的 `ModelRuntimeService` 上。
- 类型探针：[`tests/receivers.spec-d.ts`](../tests/receivers.spec-d.ts)。行为测试：[`tests/receivers.spec.ts`](../tests/receivers.spec.ts)、[`tests/receivers-conformance.spec.ts`](../tests/receivers-conformance.spec.ts)。

`registerResultReceiver(owner, receiver)` 是 `ModelRuntimeService` 上的具体成员，实例属性，不是抽象成员，也不在根接口 `ModelRuntime` 上。登记落在调用方 fiber，返回同步、幂等的撤除函数。提供者用 `createModelResultReceiverTable` 建表，传给构造函数，并在推送阶段用表的 `resolve` 取接收方；表在构造函数的闭包里，不在服务实例上。重新登记的规则与同进程保证见 [SPEC](../SPEC.md#结果接收登记)。`./testing` 的 `createScriptedModelRuntimeHost` 在真实 Cordis Context 上起一个只实现登记的 `modelRuntime`，`modelResultReceiverConformance` 返回符合性用例，提供者可对自己的运行时跑同一组用例。

## 凭据服务定义

本章给凭据保管提供者和发送边界：凭据服务的抽象定义与键。

- 声明：[`src/cordis.ts`](../src/cordis.ts)。
- 行为测试：[`tests/credential-service.spec.ts`](../tests/credential-service.spec.ts)。

凭据服务已实现，由 `./cordis` 导出。定义是抽象类，只有 `present` 与 `resolve`，形状与 `CredentialPort` 相同；诊断读取和保管管理不在服务上。定义不持有端口，实现不得把端口或保管者放在服务实例上，须放进构造时创建的闭包，因为实例的全部属性对任何能读 `ctx.modelCredential` 的插件可见。model-host-local 的 `./cordis` 中的 `LocalCredentialPlugin` 这样封住保管者。具体的本地保管与插件归 model-host-local。

服务不核验调用方资格：`SendFace` 的 `authorized`、`official` 和引用里的 `tenant` 都由调用方自报。装配须只把该服务交给受信的发送边界。目前没有拥有者强制这一点，同一 isolate 的任意插件可以请求另一租户的凭据，这一项在 [SPEC](../SPEC.md#凭据服务)登记为未决。

`modelCredential` 是可选成员：服务撤除后 `ctx.modelCredential` 缺席，消费者按依赖注入等待或失败，不假定存在。
