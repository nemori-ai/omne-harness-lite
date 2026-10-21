# 执行环境契约的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 [src/index.ts](../src/index.ts) 及其再导出的模块，非类型行为归 [SPEC](../SPEC.md)，对象的身份与生灭归[对象模型](object-model.md)，设施协议的规则归 SPEC [设施协议](../SPEC.md#设施协议)，逐设施的展开见[内部架构](architecture.md#设施协议)。每个定义的输入、输出与失败行为按所列条款查找。

工具环境声明的 schema 与采用身份、两条块声明以本页为唯一说明位置，见[组架构](../../docs/architecture.md#主题与唯一拥有者)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/execution-environment-contract` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 任何包。集成方用它翻译环境要求、实现三个端口；提供者用它实现 `EnvironmentProvider`；设施拥有者用它发布设施声明；工具包用它写环境声明；观察者用它读块值的类型 |

本成员只有根入口，没有 `./cordis` 入口。根入口不导入 Cordis，见 [Cordis 说明](cordis.md)。服务键 `executionEnvironment` 与抽象 Service 归 [execution-environment-cordis-contract](../../execution-environment-cordis-contract/README.md)。

根入口导出 15 个运行值：

- 2 个引用构造函数。
- 绑定层清单与 `bindingScope`。
- `describeFacility` 与 3 个设施声明。
- `createRecoveryAccess`。
- 需要声明的 schema 与采用身份。
- 2 条块声明。
- 2 个纯函数。

其余导出都是类型。纯函数不做 I/O，不读时钟，不持有状态。`judgeRequirement` 的返回依赖 `@omne-harness/operation-result`。

## 定义索引

### 身份与绑定层

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `Access` | 类型 | 访问身份：主体加租户。主体类型由集成方给出，执行环境只传递主体，租约只比较租户 | [INV-EE04](../SPEC.md#inv-ee04-原主体在实际边界继续受约束)、[对象模型 身份](object-model.md#身份) |
| `OriginRef` | 类型 | 不透明的原调用引用，资源与采用记录挂在它上面 | [INV-EE01](../SPEC.md#inv-ee01-身份和事实拥有者分别可辨认) |
| `AcquisitionRef` | 类型 | 集成方给一次获取的幂等键 | [获取与租约](../SPEC.md#获取与租约) |
| `originRef` | 函数 | 把非空字符串接受为原调用引用。空串抛出 `TypeError` | [INV-EE01](../SPEC.md#inv-ee01-身份和事实拥有者分别可辨认) |
| `acquisitionRef` | 函数 | 把非空字符串接受为获取键。空串抛出 `TypeError` | [获取与租约](../SPEC.md#获取与租约) |
| `EnvironmentBinding` | 类型 | 四种绑定层：`host_machine`、`stateless_sandbox`（作用域加原调用）、`session_sandbox`（作用域）、`tenant_sandbox`（租户） | [INV-EE01](../SPEC.md#inv-ee01-身份和事实拥有者分别可辨认)、产品正文[绑定层说寿命，连续性说此刻](../../../../.meta_harness/design/product/execution-environments/design.md#绑定层说寿命连续性说此刻) |
| `BindingKind` | 类型 | 绑定层的种类名 | 同上 |
| `bindingKinds` | 值 | 冻结的四种绑定层种类名 | 同上 |
| `bindingScope` | 函数 | 返回绑定层所属的作用域引用。宿主机与租户级沙箱返回 `undefined`。获取的归属是请求方作用域，不是这个值；这个值不为 `undefined` 时必须等于请求方作用域 | [INV-EE06](../SPEC.md#inv-ee06-逻辑工作实例资源和数据不共用寿命)、[获取与租约](../SPEC.md#获取与租约) |
| `EnvironmentContinuity` | 类型 | 连续性：不保证、连续（带数据身份与修订）、已丢失（带前一个实例）。它说此刻，不说寿命 | [INV-EE07](../SPEC.md#inv-ee07-临时状态边界与实际回收明确) |

### 环境要求与匹配

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `EnvironmentRequirement` | 类型 | 集成方为一次获取给的输入：有序的允许绑定层清单、设施键、隔离断言 | [INV-EE02](../SPEC.md#inv-ee02-策略在域外求值环境只在允许清单内匹配) |
| `IsolationClaims` | 接口 | 开放的隔离断言表，初始有 `process`、`filesystem-root`、`network-none`、`restricted-js`。拥有者用 `declare module` 增补 | [INV-EE03](../SPEC.md#inv-ee03-必需设施和隔离不得降低满足)、[INV-EE10](../SPEC.md#inv-ee10-受限执行域限制可达数据和能力) |
| `IsolationClaim` | 类型 | 隔离断言的键 | 同上 |
| `judgeRequirement` | 纯函数 | 在边界上把外部值一次解码成 `EnvironmentRequirement`。失败返回 `invalidInput` 与逐项原因，拒绝三样以外的字段。租户级沙箱的租户写成 legal-identity 的租户文本，由 `tenantCodec` 解码并铸造；本进程内已铸造的 `TenantId` 原样保留 | [INV-EE02](../SPEC.md#inv-ee02-策略在域外求值环境只在允许清单内匹配) |
| `RequirementRefusal` | 类型 | `judgeRequirement` 的失败值 | 同上 |
| `matchProviders` | 纯函数 | 沿允许清单的顺序，返回第一个声明该层、覆盖全部设施键与隔离断言的提供者。不选清单外的层。失败时给出全部层里最接近的原因 | [获取与租约](../SPEC.md#获取与租约) |
| `ProviderCapabilities` | 类型 | `matchProviders` 读取的提供者能力：绑定层、设施键、隔离断言 | 同上 |
| `ProviderMatch` | 类型 | `matchProviders` 的成功值：提供者与选中的绑定层 | 同上 |
| `DecodeIssue` | 类型 | 一项解码问题：消息与路径。解码失败的逐项原因都用它 | [工具环境声明](../SPEC.md#工具环境声明) |

### 设施

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `EnvironmentFacilities` | 接口 | 设施键到设施接口的表。设施拥有者用 `declare module` 增补。增补只加词汇，不安装也不授权 | [设施协议](../SPEC.md#设施协议) |
| `FacilityKey` | 类型 | 设施键 | 同上 |
| `FacilityOperation` | 类型 | 一种设施的操作名 | 同上 |
| `FacilityDescriptor` | 类型 | 设施声明：键、操作名单、须授权的操作 | 同上、[对象模型 设施声明](object-model.md#设施声明) |
| `describeFacility` | 函数 | 构造设施声明。每个操作都必须标成 `guarded` 或 `open`，名单在类型上完整 | 同上 |
| `FacilityRequest` | 类型 | 设施请求：请求身份、访问身份、原调用、绑定层 | 同上、[对象模型 设施请求](object-model.md#设施请求) |
| `FacilityResult` | 类型 | 设施结果四态：`done`、`unresolved`、`rejected`、`unknown` | 同上 |
| `FacilityReason` | 类型 | 设施拒绝的十个原因 | 同上 |
| `FacilitySet` | 类型 | 规范实例类型：按设施键取 `EnvironmentFacilities` 的子集，工具执行者只得到声明点名的设施 | [工具环境声明](../SPEC.md#工具环境声明) |

### 文件设施

协议规则见[内部架构的 `files`](architecture.md#files文件)。

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `filesFacility` | 值 | `files` 的设施声明，十二项操作全部须授权 | [设施协议](../SPEC.md#设施协议) |
| `FileSystemFacility` | 接口 | 文件设施：读取、查看、写入、关闭，以及列表、搜索、建目录、删除、移动、复制、批次提交与批次认回 | 同上、[INV-EE09](../SPEC.md#inv-ee09-资源和秘密以最小必要条件提供) |
| `FileRequest` | 类型 | 文件请求：设施请求加路径与点名对象 | [INV-EE09](../SPEC.md#inv-ee09-资源和秘密以最小必要条件提供) |
| `ObjectToken` | 类型 | 不透明的对象身份 | 同上 |
| `HandleGeneration` | 类型 | 句柄代际：对象身份加代 | [INV-EE13](../SPEC.md#inv-ee13-控制请求与实际停止释放分别确认) |
| `FileVersion` | 类型 | 元数据版本。它是观察条件，不是权限，也不是外部的比较并交换 | [设施协议](../SPEC.md#设施协议) |
| `FileIdentity` | 类型 | 对象身份、句柄代际与版本 | 同上 |
| `FileInformation` | 类型 | 查看与列表的条目：身份加类型、大小与修改时间 | 同上 |
| `FileTarget` | 类型 | 移动与复制的目标：路径与点名对象 | 同上 |
| `FileBatchRef` | 类型 | 文件批次的身份：编号加代 | [INV-EE15](../SPEC.md#inv-ee15-准备持有回收与确认保持一致) |
| `FileBatchOutcome` | 类型 | 批次提交的结果：`committed`，或 `unknown` 带原因，以及已发布的路径 | 同上 |
| `FileBatchRecognition` | 类型 | 批次认回的结果：完整、部分、中断、冲突或待确认，以及有收据的路径、与暂存一致的路径和冲突路径 | [INV-EE14](../SPEC.md#inv-ee14-未知保持原身份不盲目重放效果) |

### 命令与终端设施

协议规则见内部架构的 [`command`](architecture.md#command命令) 与 [`terminal`](architecture.md#terminal终端)。

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `commandFacility` | 值 | `command` 的设施声明，`start` 须授权 | [设施协议](../SPEC.md#设施协议) |
| `CommandFacility` | 接口 | 命令设施：`start` 启动一个进程 | 同上、[INV-EE09](../SPEC.md#inv-ee09-资源和秘密以最小必要条件提供) |
| `ProcessHandle` | 接口 | 进程句柄：进程身份加代、输出模式、唯一的输出流、输出策略、终局与停止 | [INV-EE13](../SPEC.md#inv-ee13-控制请求与实际停止释放分别确认) |
| `OutputChunk` | 类型 | 一块原始输出字节，带所属的一路与此前观察到的字节数 | [设施协议](../SPEC.md#设施协议) |
| `OutputPolicy` | 类型 | 有界缓冲：缓冲上限、单块上限，溢出时丢弃 | 同上 |
| `OutputCount` | 类型 | 一路输出观察到与丢弃的字节数 | 同上 |
| `OutputSummary` | 类型 | 按输出模式汇总各路的计数 | 同上 |
| `CommandOutcome` | 类型 | 进程终局：`completed` 的 `exit` 是带 `kind` 的联合，`code` 带退出码，`signal` 带信号，`unknown` 表示退出方式未知；`failed` 带 `unavailable` 或 `effectUnknown` | [INV-EE13](../SPEC.md#inv-ee13-控制请求与实际停止释放分别确认) |
| `terminalFacility` | 值 | `terminal` 的设施声明，四项操作全部须授权 | [设施协议](../SPEC.md#设施协议) |
| `TerminalFacility` | 接口 | 终端设施：创建、分段执行、关闭、列表 | 同上、[INV-EE07](../SPEC.md#inv-ee07-临时状态边界与实际回收明确) |
| `TerminalRef` | 类型 | 终端身份加代 | [INV-EE07](../SPEC.md#inv-ee07-临时状态边界与实际回收明确) |
| `TerminalInformation` | 类型 | 列表的条目：终端、状态与最近一次观察到的工作目录 | 同上 |

### 端口与恢复授权

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `ManagedResource` | 类型 | 受管资源：键、所属提供者与 JSON 恢复引用。不是活句柄或裸进程号 | [INV-EE15](../SPEC.md#inv-ee15-准备持有回收与确认保持一致)、[对象模型 受管资源](object-model.md#受管资源) |
| `ResourceLedger` | 接口 | 需要端口，集成方实现：计划、许可、接续、停止记录与关闭信号 | [INV-EE15](../SPEC.md#inv-ee15-准备持有回收与确认保持一致) |
| `FacilityGuard` | 接口 | 需要端口，集成方实现：这次操作现在还允许吗，答允许、不允许或不可用 | [获取与租约](../SPEC.md#获取与租约)、[设施协议](../SPEC.md#设施协议) |
| `RecoveryAuthority` | 接口 | 需要端口，集成方实现：核对恢复授权能否停止与结算一个作用域的资源 | [恢复](../SPEC.md#恢复) |
| `RecoveryAccess` | 接口 | 恢复授权，带模块内标记的原对象，不可序列化 | [恢复](../SPEC.md#恢复)、[对象模型 恢复授权](object-model.md#恢复授权) |
| `createRecoveryAccess` | 函数 | 创建一个新的恢复授权对象。持有它不授予任何权利，直到 `RecoveryAuthority` 接受 | [恢复](../SPEC.md#恢复) |

### 落点、获取与租约

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `ProviderIdentity` | 类型 | 提供者身份：名称、代（一次登记化身）与版本（提供者代码的版本） | [INV-EE18](../SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任) |
| `InstanceIdentity` | 类型 | 实例身份加代。同名的新实例不冒充原实例 | [INV-EE01](../SPEC.md#inv-ee01-身份和事实拥有者分别可辨认) |
| `Placement` | 类型 | 落点：原环境要求、选中的绑定层与提供者、连续性。它不授予设施或资源 | [获取与租约](../SPEC.md#获取与租约) |
| `RejectReason` | 类型 | 获取与落点的拒绝原因 | 同上 |
| `Rejected` | 类型 | 带拒绝原因的结果 | 同上 |
| `EnvironmentAdoption` | 类型 | 采用记录：获取键、原调用、落点、提供者、实例、连续性与提供者证据。由本成员的实现签发，不由提供者自签 | [INV-EE05](../SPEC.md#inv-ee05-实际执行捕获原落点与版本) |
| `EnvironmentLease` | 接口 | 租约：落点、实例、连续性、按键取设施、失效信号与释放 | [获取与租约](../SPEC.md#获取与租约)、[对象模型 获取](object-model.md#获取) |
| `LeaseInvalidation` | 类型 | 失效原因，按来源区分：`source: 'registry'` 带登记表的封闭原因集合，`source: 'provider'` 带提供者自报的原因文本 | 同上 |
| `RegistryInvalidationReason` | 类型 | 登记表给出的失效原因：`providerRetired`、`scopeReleased`、`registryClosed`、`released`、`providerInvalidated` | 同上 |
| `LeaseRelease` | 类型 | 释放的结果：已释放，或待处置并列出未停的受管资源 | 同上 |
| `AcquisitionState` | 类型 | 一次获取的状态，按获取键查询。`unrecorded` 表示没有调用方能看到的记录。`invalidated` 状态带 `invalidation`（`LeaseInvalidation`） | 同上 |
| `Acquired` | 类型 | 已获取：租约与采用记录 | 同上 |
| `Pending` | 类型 | 获取存在但现在没有可用租约；没有新分配 | 同上 |

### 提供者与操作面

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `EnvironmentProvider` | 接口 | 提供者：名称、代与版本、绑定层、连续性、设施键、隔离断言；描述、获取、退役，以及可选的恢复枚举与认回。获取与退役在提供者自己配置的上界内返回 | [INV-EE18](../SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)、[对象模型 提供者](object-model.md#提供者) |
| `ProviderFacts` | 类型 | 提供者声明的事实：名称、代、版本、平台、设施键、隔离断言，以及运行前提（满足、不满足或未知）。它是观察，不是控制 | [INV-EE17](../SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露) |
| `PlatformFacts` | 类型 | 平台事实：操作系统类型与版本 | 同上 |
| `ProviderAcquireInput` | 类型 | 执行环境交给提供者的获取输入：获取键、原调用、请求方作用域、落点、租户与账本 | [获取与租约](../SPEC.md#获取与租约) |
| `ProviderAcquisition` | 类型 | 提供者的临时回执：租约原件与证据，或拒绝 | [INV-EE05](../SPEC.md#inv-ee05-实际执行捕获原落点与版本) |
| `Retirement` | 类型 | 退役的结果：已排空，或待处置并列出未停的受管资源 | [INV-EE18](../SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任) |
| `RecoveryListing` | 类型 | 恢复枚举的结果：列出的资源，或不可用。不可用不是空集 | [恢复](../SPEC.md#恢复) |
| `ResourceRecovery` | 类型 | 一项资源的认回结果：已确认停止、待处置或不支持，带证据 | 同上 |
| `OwnedRecovery` | 类型 | 一次恢复驱动的结果：已停、待处置、不支持与枚举不可用的提供者 | 同上 |
| `UnsupportedRecovery` | 类型 | 不支持恢复的提供者或资源 | 同上 |
| `PlacementInput` | 类型 | 集成方的落点解析输入：请求方作用域与环境要求 | [获取与租约](../SPEC.md#获取与租约) |
| `AcquireInput` | 类型 | 集成方的获取输入：获取键、原调用、请求方作用域、落点、账本与守卫 | [获取与租约](../SPEC.md#获取与租约) |
| `EnvironmentDescription` | 类型 | 一个作用域内一次获取的描述：获取键、原调用、绑定层、提供者、实例、连续性、设施键与状态 | [INV-EE17](../SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露) |
| `ExecutionEnvironment` | 接口 | 集成方、独立调用者与维护者的操作面：`resolvePlacement`、`acquire`、`inspectAcquisition`、`describe`、`recoverOwned`、`releaseScope` | [获取与租约](../SPEC.md#获取与租约)、[恢复](../SPEC.md#恢复) |
| `ProviderRegistrations` | 接口 | 提供者与设施拥有者的登记面：`registerFacility`、`registerProvider`。每次登记返回自己的撤除函数 | [设施协议](../SPEC.md#设施协议)、[INV-EE18](../SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任) |

### 工具环境声明

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `EnvironmentNeedDeclaration` | 类型 | 工具包写进工具定义的 JSON：设施键、隔离断言、能工作的绑定层 | [工具环境声明](../SPEC.md#工具环境声明) |
| `environmentNeedSchema` | 值 | 声明的 Standard Schema，同时满足 schema-provider 的 `StandardTyped` | 同上 |
| `environmentNeedAdoption` | 值 | schema 的稳定采用身份 | 同上 |

schema 的规则：

1. JSON Schema 文件是 [schema/environment-need.schema.json](../schema/environment-need.schema.json)，`$id` 是 `urn:omne-harness:execution-environment:environment-need:1`。`environmentNeedSchema` 与它同形。
2. 三个字段都必填，不接受其他字段。
3. `facilities` 与 `isolation` 是非空字符串的数组。设施键与隔离断言是开放词汇，schema 不判断它们是否已登记。
4. `layers` 的元素只能是四种绑定层之一。`layers` 是能力兼容性，不是策略。集成方把它与策略允许的层取交集并按偏好排序，得到允许清单。
5. 解码失败是定义层的拒绝，带逐项原因（`DecodeIssue`）。

采用身份的字段：`owner` 是 `execution-environment`，`name` 是 `environment-need`，`revision` 是 `1`，`digest` 是 `sha256:` 加 JSON Schema 文件字节的 SHA-256 十六进制值。读者可以重新计算 `digest`。工具定义里存采用身份加声明值，Tool 契约经 schema-provider 按采用身份解析 schema，不导入本成员。schema 文件的字节变化时必须同步 `digest`；声明的形状变化时，还要前进 `revision`。


### 示例：Shell 工具的环境声明

[examples/shell-needs.ts](../examples/shell-needs.ts) 演示一个命令行工具包怎样使用上面三个导出与 `FacilitySet`：

1. 写下环境声明：需要 `command` 与 `terminal`，需要确认 `process` 隔离，能在 `host_machine`、`session_sandbox` 与 `tenant_sandbox` 工作。
2. 从声明推出执行者的设施类型 `FacilitySet`，执行者取不到声明没有点名的 `files`。
3. 把 `environmentNeedAdoption` 与声明值一起存进工具定义。
4. 在一个终端里执行一段脚本，读取流式输出与终局。

落在宿主机时，`command` 与 `terminal` 由同一个宿主提供者提供，与 `files` 一样；这两项的宿主提供者现在只有设计，没有实现，见 [execution-environment-host-local 的宿主命令与终端机制](../../execution-environment-host-local/docs/architecture.md#宿主命令与终端机制设计未实现)。这个示例只在类型层面成立，没有提供者，不能单独运行。类型测试 [tests/facility-set.spec-d.ts](../tests/facility-set.spec-d.ts) 导入它，由 `pnpm --filter @omne-harness/execution-environment-contract typecheck`（`tsc -p tsconfig.test.json`）编译。示例与公开入口不一致时，这次编译失败。

### 两条块声明

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `executionPlacementBlock` | 值 | 块 `execution.placement` 的供给块声明 | [INV-EE17](../SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)、[对象模型 两条块声明](object-model.md#两条块声明) |
| `ExecutionPlacementValue` | 类型 | 落点块的值：`ExecutionPlacementEntry` 的数组 | 同上 |
| `ExecutionPlacementEntry` | 类型 | 一个原调用的当前落点：原调用、绑定层、实例身份与代、连续性、设施键与观察时间 | 同上 |
| `executionHostFactsBlock` | 值 | 块 `execution.host-facts` 的供给块声明 | 同上 |
| `ExecutionHostFactsValue` | 类型 | 宿主事实块的值：每个已登记提供者一项 `ProviderFacts` | 同上 |

两条块声明的字段相同，块的读取规则归 Runtime Context 的 [RC-02](../../../context/runtime-context-contract/SPEC.md#rc-02-块声明注册与参数)：

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `kind` | `supplied` | 供给块，由生产者供值 |
| `consumers` | `model`、`tool`、`extension` | 可以读这两条块的消费者类 |
| `required` | `true` | 必需的感知。值缺失时读为缺项，不读为不存在 |
| `disclosure` | `plain` | 披露方式是 `plain`，不是 `eligibility-checked` |
| `carriesPrevious` | `true` | 快照与提醒可以带前一个值 |
| `volatility` | `stable` | 变化频率是 `stable`，不是每步或每次请求 |
| `recovery` | `recompute` | 恢复时从当前事实重算，不持久保存 |

`blocks.ts` 用 `declare module` 把两个块键增补进 Runtime Context 的 `ContextBlocks`。块值按本成员的解码函数核对，未知字段与形状错误被拒绝。本成员是语义拥有者。生产者是 host-local 的 Service 实现。当前还没有发布。
