# tool-host-local 公开接口

`createLocalScheduledEnvironment` 包装一个 `ToolEnvironment`，把新准备按租户放入 DRR 队列。受信装配显式提供 [ToolEnvironmentSchedulingPolicy](../src/environment-policy.ts) 和当前资格核验。`capacity` 限制全局排队数，`inFlight` 限制全局尚未结清数；租户策略给出权重与本租户上限。`retry` 与 `release` 只延迟或选择调用方已请求的原操作。实际获取、配额准入、原引用保存与结清事实继续由环境提供者负责。工厂见 [scheduled-environment.ts](../src/scheduled-environment.ts)，行为依据见 [环境调度](../SPEC.md#环境准备的租户调度)。

调度队列和名额账只在本进程内保存，不能作为重启恢复的权威。`pending`、`unknown`、抛错以及可能仍需清理的 `rejected` 都保留名额；可靠 `excluded` 允许原操作重新请求。只有确认释放或排除才返还本地名额。`release` 或 `inspectRelease` 确认 `released` 后，宿主移除该原操作尚未发出的排队项，并以 `unavailable` 结束本地准备等待，提供者的释放回执保持原样。已在途的答复仍交回调用者，但不能恢复已释放项的调度资格。释放输入在资格检查与策略等待之前固定，主体按原不透明引用传递。当前 `PreparationProgress` 不能表达已分配但尚未首次采用，也不能单独证明 rejected 已无占用。这两个映射仍缺环境适配器提供的可信事实；宿主保持原任务，不解析 diagnostic 来补判断。已有 `prepared` 事实可用于原键认回，不能据此声明尚未采用的获取已接续。

`createLocalToolCredentials` 返回 `ToolCredentials`。构造依赖分别核当前调用资格、读取固定设置采用的分层引用、解析所选引用的实际绑定。成功能力的 `use` 在执行回调前重核资格并重新读取同一引用。引用、用途、目标与原请求在解析时固定，秘密和实际能力不进入记录或日志。工厂见 [credentials.ts](../src/credentials.ts)，端口依据见 [第三方凭据](../../tool-contract/SPEC.md#第三方凭据端口)。真实秘密保管提供者尚未交付。

根入口 `.` 由 [src/index.ts](../src/index.ts) 定义，源码是唯一定义，本页不手写签名。

- [start-coordinator.ts](../src/start-coordinator.ts)：`createLocalStartCoordinator`（G5）返回契约的 `ToolStartAuthority`。输入类型是 `LocalStartCoordinatorInput`：记录仓、资格守卫 `StartCoordinatorAccess`、按请求给出守卫资源的 `guardsOf`（资源类型 `GuardResource`）与修订冲突的重试上限。`startCoordinatorAdoption` 是它在许可里的采用，`START_COORDINATOR_OWNER` 是它铸造的证据的拥有者，`START_COORDINATOR_DOMAIN_KEY` 是它在 `host` 域的键。行为见 [SPEC](../SPEC.md#本地启动协调器g5)。

调用者是应用装配：它构造协调器并交给 `createToolRuntime`。`consume` 只能由受信执行边界（执行绑定）调用。`invalidate` 由守卫资源的拥有者调用。当前没有 `./cordis` 入口，导入它会得到 `ERR_PACKAGE_PATH_NOT_EXPORTED`。后续插件设计见 [Cordis 装配](cordis.md)，该插件尚未实现。公共行为归契约包的 [SPEC](../../tool-contract/SPEC.md)。目录职责见 [README](README.md)。
