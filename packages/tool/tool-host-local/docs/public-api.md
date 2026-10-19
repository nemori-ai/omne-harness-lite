# tool-host-local 公开接口

根入口 `.` 由 [src/index.ts](../src/index.ts) 定义，源码是唯一定义，本页不手写签名。

- [start-coordinator.ts](../src/start-coordinator.ts)：`createLocalStartCoordinator`（G5）返回契约的 `ToolStartAuthority`。输入类型是 `LocalStartCoordinatorInput`：记录仓、资格守卫 `StartCoordinatorAccess`、按请求给出守卫资源的 `guardsOf`（资源类型 `GuardResource`）与修订冲突的重试上限。`startCoordinatorAdoption` 是它在许可里的采用，`START_COORDINATOR_OWNER` 是它铸造的证据的拥有者，`START_COORDINATOR_DOMAIN_KEY` 是它在 `host` 域的键。行为见 [SPEC](../SPEC.md#本地启动协调器g5)。

调用者是应用装配：它构造协调器并交给 `createToolRuntime`。`consume` 只能由受信执行边界（执行绑定）调用。`invalidate` 由守卫资源的拥有者调用。`./cordis` 入口当前不导出任何值。公共行为归契约包的 [SPEC](../../tool-contract/SPEC.md)。目录职责见 [README](README.md)。
