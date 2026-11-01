# tool-host-local 公开接口

`createLocalScheduledEnvironment` 包装一个 `ToolEnvironment`，把新准备按租户放入 DRR 队列。受信装配显式提供 [ToolEnvironmentSchedulingPolicy](../src/environment-policy.ts) 、当前资格核验和必填 `diagnostics` 接收者。`capacity` 限制全局排队数，`inFlight` 限制全局尚未结清数；租户策略给出权重与本租户上限。`retry` 与 `release` 只延迟或选择调用方已请求的原操作。实际获取、配额准入、原引用保存与结清事实继续由环境提供者负责。工厂见 [scheduled-environment.ts](../src/scheduled-environment.ts)，行为依据见 [环境调度](../SPEC.md#环境准备的租户调度)。

调度队列和名额账只在本进程内保存，不能作为重启恢复的权威。原 prepare 已发出后，`pending`、`unknown`、抛错以及可能仍需清理的 `rejected` 都保留名额；可靠 `excluded` 允许原操作重新请求。已发送的原准备只有确认释放或排除才返还本地名额。尚未发送的准备在派发前资格或采用核验失败时归还本地预占，同键重试仍须通过当前核验。`release` 或 `inspectRelease` 确认 `released` 后，宿主移除该原操作尚未发出的排队项，并以 `unavailable` 结束本地准备等待，提供者的释放回执保持原样。已在途的答复仍交回调用者，但不能恢复已释放项的调度资格。释放输入在资格检查与策略等待之前固定，主体按原不透明引用传递。`allocated` 同样保留原名额。宿主核对它的完整原准备和证据形状，只有调用方重送原 prepare、策略选 recognize、原条目未退休且当前资格仍成立时，才在查询后调用一次原 prepare。wait 不查询或采用，inspect 只刷新事实。inspectPreparation 无论策略如何都不采用。查询后的首次采用沿原在途项，不新增 DRR 获取成本。

宿主在排队等待与查询之后、实际转发之前重核资格和原适配器采用。迟到 allocated 不能恢复已确认释放的条目。冷恢复没有原登记的 allocated/adoption:null 不能作为首次采用事实。尚需清理的 rejected 不返额，EE notAllocated 的原键终局不得映射成可同键重排的 excluded。原获取与清理定位继续由适配器保存；本包没有真实 EE 适配器，不声明生产首次采用映射或耐久恢复已完成。

`createLocalToolCredentials` 返回 `ToolCredentials`。构造依赖分别核当前调用资格、读取固定设置采用的分层引用、解析所选引用的实际绑定（`ToolCredentialResolution`：绑定、能力与撤销句柄）。成功能力的 `use` 在执行回调前重核资格并重新读取同一引用，回调结束后撤销本次能力，再返回或原样重抛；撤销失败不报告成功。引用、用途、目标与原请求在解析时固定，秘密和实际能力不进入记录或日志。工厂见 [credentials.ts](../src/credentials.ts)，端口依据见 [第三方凭据](../../tool-contract/SPEC.md#第三方凭据端口)。真实秘密保管提供者尚未交付。

`createLocalToolClock` 返回 `ToolClock`，输入 `LocalToolClockInput` 的墙钟、单调读数、epoch 与睡眠都可选，缺省读进程。`createLocalToolBindingRegistry` 返回 `LocalToolBindingRegistry`：契约的 `ToolBindingRegistry` 加三个本包内部使用的成员，`listings`（给 Catalog 读 live 贡献与定义）、`pin`（固定请求解析到某键时持有它，`pins` 与 `drain` 据此计数）和 `retire`（fiber 结束时撤除其贡献）。输入的 `verifier` 是来源核验端口，形状同 `toolContributionAuthority`，本包不提供实现，未注入时 `register` 回复 `unavailable`；`fiber()` 给出正在登记的调用方 fiber。`createLocalToolCatalog` 返回 `ToolCatalog`，输入的 `registry` 是登记表（或 null，此时三个动词都回复 `unavailable`），`availability` 是已核验事实的来源（资格、依赖、输入输出与附件兼容）。`createAbsentToolPorts` 返回 `toolDecisions`、`toolResourceResponses`、`toolChildren`，每个方法回复具名 `unavailable`。工厂见 [clock.ts](../src/clock.ts)、[bindings.ts](../src/bindings.ts)、[catalog.ts](../src/catalog.ts)、[absent-ports.ts](../src/absent-ports.ts)，行为依据见 [SPEC](../SPEC.md#绑定登记表与换代协调者g7)。调用者是应用装配，它把这些部件交给 `createToolRuntime`。登记表不耐久，只在进程内成立。

根入口 `.` 由 [src/index.ts](../src/index.ts) 定义，源码是唯一定义，本页不手写签名。

- [start-coordinator.ts](../src/start-coordinator.ts)：`createLocalStartCoordinator`（G5）返回契约的 `ToolStartAuthority`。输入类型是 `LocalStartCoordinatorInput`：记录仓、资格守卫 `StartCoordinatorAccess`、按请求给出守卫资源的 `guardsOf`（资源类型 `GuardResource`）与修订冲突的重试上限。`startCoordinatorAdoption` 是它在许可里的采用，`START_COORDINATOR_OWNER` 是它铸造的证据的拥有者，`START_COORDINATOR_DOMAIN_KEY` 是它在 `host` 域的键。行为见 [SPEC](../SPEC.md#本地启动协调器g5)。

调用者是应用装配：它构造协调器并交给 `createToolRuntime`。`consume` 只能由受信执行边界（执行绑定）调用。`invalidate` 由守卫资源的拥有者调用。当前没有 `./cordis` 入口，导入它会得到 `ERR_PACKAGE_PATH_NOT_EXPORTED`。后续插件设计见 [Cordis 装配](cordis.md)，该插件尚未实现。公共行为归契约包的 [SPEC](../../tool-contract/SPEC.md)。目录职责见 [README](README.md)。

`ToolEnvironmentDiagnostics.record` 接收原错误、封闭阶段与原 tenant/call/operation。接收者只在受信内存中处理原错误，持久化前须去除秘密、能力和解析器。公开返回仅含固定安全标记。接收失败显示 `diagnostic=unavailable`，不解除资源责任。未发送准备的资格失败先归还本地预占，不等待诊断接收。详见 [资源诊断边界](../SPEC.md#环境资源诊断边界)。
