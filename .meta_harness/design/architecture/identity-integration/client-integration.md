# T3 公共调用与管理绑定的精确投影补充

状态：已限定采用，产品实现与验收尚待。BASE `beef18017170eb70cae2c6bf3afb121b18a0139e`。
本补充不改变 D0 的业务、数据、线协议、关闭顺序或实现范围。
它补齐 M05 冻结所需的精确调用坐标，以及新拥有传输实例关闭后的误用结果。
输入为 identity-integration/{design,behavior,retirement,delivery}.md 和 T2 已交付的 assembly-lifecycle。

## 工厂调用与形状拥有者

- `client-local-state-sqlite` 根：`openClientLocalState(options, dependencies)`。
  `OpenClientLocalStateOptions` 保留原 `directory`；新增 `OpenClientLocalStateDependencies` 恰有 `storage: LocalStateStorageFactory`。
  不把工厂塞入 JSON Config。返回原 `Promise<ClientLocalStateInstance>`，该实例的 close 保持原所有权。
  `ClientLocalStateInstance`、打开选项、依赖选项和 `ClientStateOpenFailure` 留提供者根。
  CLS 公共记录/token/read/CAS/使用错误及 `LocalStateStorageFactory/LocalStateStorage` 归 core/client-local-state 根。
- `governance-client-operations-local` 根：`createGovernanceClient(options)`。
  选项必须同时含 `state: ClientLocalState` 与 `transport: GovernanceTransport`，原 `timeoutMs?` 保持。
  返回原 `GovernanceClientOperations`。原公共 action/use/report/error 与 `exitStatus` 归 core/governance-client-operations 根。
- `governance-center-client-https` 根：原 `readPublicHealth` 与 `exchangeGovernance` 独立函数继续可调用。
  新增 `createGovernanceTransport(): GovernanceTransportInstance`。
  `GovernanceTransportInstance extends GovernanceTransport`，仅另有 `close(): Promise<void>`，类型留此提供者根。
  `GovernanceTransport` 的原两方法、选项、全部结果及配置错误归 core/governance-center-entry-https-json 根。
  工厂不拥有其他直接调用独立函数的请求，不创建全局单例或跨实例任务表。

公共服务与键归 D0 已指定的三个 core `./cordis`。纯根不导出键或插件，不保留旧提供者根的类型转发别名。
原两个 schema 导出地址由 CG 公共定义拥有。JSON `$id`、引用与字节保持，生成校验的实现及构建入口仍由提供者/实际消费者拥有。

## 三个绑定坐标

以下全部从对应提供者 `./cordis` 导出；独立与 managed 使用同一纯工厂。

| 提供者 | 独立导出 / plugin name | 管理导出 / plugin name | 业务必需注入 | Config |
|---|---|---|---|---|
| client-local-state-sqlite | clientLocalStatePlugin / client-local-state-sqlite | managedClientLocalStatePlugin / client-local-state-sqlite-managed | clientStateStorage | 原严格 `{ directory: string }` |
| governance-center-client-https | governanceTransportPlugin / governance-center-client-https | managedGovernanceTransportPlugin / governance-center-client-https-managed | 无 | 严格空对象 |
| governance-client-operations-local | governanceClientOperationsPlugin / governance-client-operations-local | managedGovernanceClientOperationsPlugin / governance-client-operations-local-managed | clientLocalState、governanceTransport | 原严格 `{ timeoutMs?: integer[1,120000] }` |

managed 都标 `assemblyLifecycle: 1`，另必需注入 assemblyLifetime。
缺少端口保持 PENDING，不回退独立模式。apply 同步，经正式 startAssemblyWork 先登记再 setup。
独立版不注入 assemblyLifetime，拥有自身 close effect；独立装配者先结束消费者再撤依赖。
正式 Service 子类只委托同一实例；Service 撤除不能另行提前关闭纯实例。
原 CLI 不直接消费提供者的业务类型，只有 apps/cli 的具体装配模块选择这三个提供者。

CLI 的 storage 工厂桥为应用私有 Service 子类，不增加 infra 或 core 的通用提供者。
该桥用 `openStorage({dialect:'sqlite', file, synchronous:'full'})`，不执行中心迁移。
它不保存、关闭或复用已经交给 CLS 的实例。桥的管理行在 CLS 行排空后撤除。
工厂桥的 close 无独立存储资源要释放，不引入新的公共 close 方法；旧工厂引用不构成新的装配准入。

## 拥有传输实例的停止结果

选择：对已经关闭的传输实例的新调用，返回以 `GovernanceTransportStopped` 拒绝的 Promise。
该具名使用错误由 core/governance-center-entry-https-json 的纯根拥有，不携带选项、地址或异常原因。
它不是网络终结值，不扩展 HealthUnavailableReason 或 GovernanceOutcome。
普通调用仍按原次序校验配置和发送。实例关闭检查先于新的配置读取/请求效果。

被比较的处理有三个：

1. 具名误用拒绝：明确调用了已经撤除的实例，沿稳定缺陷边界传播。采用本项。
2. 返回 unavailable/cancelled：会把提供者寿命结束伪称调用者取消，混淆原失败类别，不采用。
3. 撤除后仍准入：不能兑现 D0 的“停止新请求”，也使 close 后仍能产生无人等待的网络工作，不采用。

第一次 close 同步停止新调用，返回稳定的完成 Promise。它不自动取消已接纳请求，不改其 signal、超时、sendAttempted 或结果。
每个请求在调用原函数之前登记完整 Promise，覆盖同步依赖/输入回调重入关闭。close 等所有本实例已准入调用真实兑现或拒绝，然后完成。
原函数已经观察 ClientRequest.close 和实际 socket.close；保留原 Node DNS 任务可能继续的边界，不将实例完成扩大成 OS 所有内部任务均已停止。
独立原函数没有实例关闭位，其他传输实例也不受此实例关闭影响。

## CLI 接入与接受边界

CLI/TUI 通过同一应用装配入口使用 storage 工厂→CLS→transport→CG，复用 T2 协调器。
CG关闭拒绝、未登记启动前缀和恢复后CLS释放的精确责任由[CLI生命周期](cli-lifecycle.md)接续。
该修正补入 managed CG 的必需 governanceClientCloseObserver 资源；独立版不注入它。
应用保留同步装配句柄、原关闭尝试和整体关闭报告，不能把任意 close 拒绝当作静止许可。

应用装配将提供者的 ClientStateOpenFailure 投影到原 state-unavailable/state-invalid 及返回码。
表示/控制模块不 import 具体提供者来判断错误。未声明异常和打开/清理双失败仍走 internal-defect。
原 client-close-failed/state-close-failed、machine 输出/退出码保持，诊断不带原异常文本。
不接受新终端政策或提前引入插件树。

## 必需验证与释放

- 原操作/Schema/独立函数逐项对应、真实包外类型和源码/声明/运行/制品四层闭包。
- 三对独立/managed 绑定缺依赖、重复 apply、部分 setup 与实际关闭；真实服务/纯实例来自同一代。
- 传输实例关闭阻新调用，已准入请求收场、原 signal、sendAttempted 和其他独立调用保持；实际 TLS 与重入关闭。
- 真实 CLI/TUI、状态私有文件/CAS、替代 transport/state，以及强撤 CLS 时 CG 的远端后 CAS。
- 接续原 CLS/CG1/CG2 模型的有限前提，保持原基线错误与全部未覆盖项。

本补充采用记录见限定决定。采用后才冻结相应候选坐标。QA 仍须完成真实 BASE 观察和 M05；接受补充本身不释放产品实施。

## 公开 Schema 与路由计数坐标

旧 governance-center-client 的 `./schema` 实为 EC2 线协议 Schema。迁到公共 EC 定义的 `@omne-harness-lite/governance-center-entry/schema/v2`，保持原 JSON 字节和 `$id`。HT、CLS、CG 与 CLI 的实际校验输入同步改接。服务端 EC3 的既有 Schema 本批不迁移，不以路径移动自动升级客户端协议。旧提供者 Schema 子入口删除，不保留别名。

CG 的原 `./schema` 与 `./schema/v2` 随公共 CG 定义迁移，两份 JSON 的身份和字节保持。实现中的生成校验继续由实际消费者构建。

原 31 条线上路由包含 register/login，即 29 条 invoke 加两条身份入口。CLI 的 34 个动作是这 31 条加 health/logout/configure。原 delivery.md 的“register/login、31 普通路由”表示覆盖这些路径，不表示另有 31 条 invoke；本次勘误不增删任何路径或判据。
