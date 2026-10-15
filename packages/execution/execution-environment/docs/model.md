# 执行环境模型

本页拥有绑定、连续性、设施和租约的类型。关系见[架构](architecture.md)。装配见 [Cordis 集成](cordis.md)。

## 环境抽象

状态：PanQiWei 已接受这一节的设计，见 [技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/278#issuecomment-6197369869)。它还不是 `src/index.ts` 的公开导出。形状沿 legacy 的执行环境核心契约。本成员这一刀实现其中的 `files`。`command` 只定义交接，不在这一刀实现。

一次调用先形成落点，再按设施名取得租约。工具拿到的是设施，不是资源登记的写接口。落点选定之后，按设施名再核一次当前授权。这次核对不改选落点。

```ts
type EnvironmentBinding =
  | { readonly kind: "host_machine" }
  | { readonly kind: "stateless_sandbox"; readonly callId: string }
  | { readonly kind: "session_sandbox"; readonly sessionId: string }
  | { readonly kind: "tenant_sandbox"; readonly tenantId: string }

type EnvironmentContinuity =
  | { readonly kind: "not_guaranteed" }
  | { readonly kind: "continuous"; readonly dataId: string; readonly revision: string }
  | { readonly kind: "lost"; readonly previous: string }

type FacilityResult<T> =
  | { kind: "done"; requestId: string; value: T }
  | { kind: "unresolved"; requestId: string }
  | { kind: "rejected"; requestId: string; reason: FacilityReason }
  | { kind: "unknown"; requestId: string }

type FacilityReason =
  | "invalidInput"
  | "notAuthorized"
  | "notFound"
  | "conflict"
  | "unsupported"
  | "closed"
  | "unavailable"
  | "effectUnknown"

type ObjectToken = { readonly token: string }

type HandleGeneration = {
  readonly object: ObjectToken
  readonly generation: string
}

type FileRequest = {
  readonly requestId: string
  readonly originalCallId: string
  readonly subjectId: string
  readonly binding: EnvironmentBinding
  readonly path: string
  readonly named: ObjectToken | null
}

type FileFacility = {
  readonly read: (request: FileRequest) => Promise<FacilityResult<{
    object: ObjectToken
    handle: HandleGeneration
    bytes: Uint8Array
  }>>
  readonly stat: (request: FileRequest) => Promise<FacilityResult<{
    object: ObjectToken
    handle: HandleGeneration
  }>>
  readonly write: (request: FileRequest & { readonly bytes: Uint8Array }) => Promise<FacilityResult<{
    object: ObjectToken
    handle: HandleGeneration
  }>>
  readonly close: (request: FileRequest & { readonly handle: HandleGeneration }) => Promise<FacilityResult<{
    handle: HandleGeneration
  }>>
}

type CommandRequest = {
  readonly requestId: string
  readonly originalCallId: string
  readonly subjectId: string
  readonly binding: EnvironmentBinding
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
}

type CommandFacility = {
  readonly start: (request: CommandRequest) => Promise<FacilityResult<{ processId: string }>>
}

type EnvironmentProvider = {
  readonly name: string
  readonly bindingKinds: readonly EnvironmentBinding["kind"][]
  readonly facilities: ReadonlyMap<string, unknown>
  readonly acquire: (placement: {
    readonly binding: EnvironmentBinding
    readonly continuity: EnvironmentContinuity
    readonly tenantId: string
    readonly callId: string
  }) => Promise<
    | { kind: "acquired"; lease: EnvironmentLease }
    | { kind: "rejected"; reason: "missingFacility" }
  >
}

type EnvironmentLease = {
  readonly binding: EnvironmentBinding
  readonly continuity: EnvironmentContinuity
  readonly instance: { readonly id: string; readonly generation: string }
  readonly facility: (name: string) => unknown | undefined
  readonly release: () => Promise<{ kind: "released" } | { kind: "pending" }>
}
```

绑定层是闭集，但每一层带自己的归属，不能只剩一个名字。寿命和谁看得见，沿已接受的[环境能力与寿命](../../../../docs/architecture/runtime/execution-environment.md#环境能力与寿命)。无状态沙箱只服务 `callId` 这一次调用，调用结束不保留状态。会话级沙箱归 `sessionId`，会话工作期间可以复用，有最大连续寿命，不承诺留下数据。租户级沙箱归 `tenantId`，计算实例可以停或换，数据跟租户一样长，并且要能备份、能迁移。宿主机归这次部署，大家共用，不隔离，也不能在沙箱失败时拿来顶上。

`EnvironmentContinuity` 是这一刻还能不能接着用，不是再写一遍寿命。`not_guaranteed` 表示本来就没承诺留下。`continuous` 表示点名的那份数据还在。`lost` 表示上一份已经不在。会话还在，不能把 `lost` 说成旧沙箱还在。

设施仍然按名字登记，和寿命正交。同一个会话级沙箱可以只提供 `files`，另一个只提供 `command`。宿主机也要声明自己提供哪些设施。

`FileFacility` 的四个操作各有自己的结果。`stat` 和 `close` 不返回文件字节。对象在契约里是不透明的 `ObjectToken`。宿主提供者把设备号和 inode 放进这个 token。沙箱提供者以后用自己的 token。契约不把宿主 inode 写成所有落点的身份。

`EnvironmentProvider.acquire` 接收已经选定的落点，返回租约。它不实现登记表的 `acquire`，也不重选绑定层。登记表依赖这个契约。提供者不知道登记表的服务类。

`Files()` 从租约取出名为 `files` 的设施。`Shell()` 取出名为 `command` 的设施。要求的名字不在租约里，结果是拒绝，不改绑定层。这一刀的宿主提供者只登记 `host_machine` 上的 `files`。`command` 有接口，这一刀不提供实现。三种沙箱绑定层这一刀没有提供者。
