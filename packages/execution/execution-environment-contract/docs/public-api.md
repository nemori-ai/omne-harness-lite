# 执行环境契约的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 [src/index.ts](../src/index.ts) 及其再导出的模块，非类型行为归 [SPEC](../SPEC.md)，对象的身份与生灭归[对象模型](object-model.md)，设施协议的规则归 SPEC [设施协议](../SPEC.md#设施协议)，逐设施的展开见[内部架构](architecture.md#设施协议)。每个定义的输入、输出与失败行为按所列条款查找。

工具环境声明的 schema 与采用身份、两条块声明以本页为唯一说明位置，见[组架构](../../docs/architecture.md#主题与唯一拥有者)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/execution-environment-contract` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 任何包。集成方用它翻译环境要求、实现账本、设施守卫、恢复授权与环境授权四个端口（可信绑定来源的类型归 Runtime Context）；提供者用它实现 `EnvironmentProvider`；设施拥有者用它发布设施声明；工具包用它写环境声明；观察者用它读块值的类型 |

本成员有根入口与 `./testing`，没有 `./cordis` 入口。根入口不导入 Cordis，见 [Cordis 说明](cordis.md)。服务键 `executionEnvironment` 与抽象 Service 归 [execution-environment-cordis-contract](../../execution-environment-cordis-contract/README.md)。

基础运行值包括：

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

定义：[identity.ts](../src/identity.ts)、[binding.ts](../src/binding.ts)。

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `Access` | 类型 | 访问身份：主体加租户。主体类型由集成方给出，执行环境只传递主体，租约只比较租户 | [INV-EE04](../SPEC.md#inv-ee04-原主体在实际边界继续受约束)、[对象模型 身份](object-model.md#身份) |
| `OriginRef` | 类型 | 不透明的原调用引用，资源与采用记录挂在它上面 | [INV-EE01](../SPEC.md#inv-ee01-身份和事实拥有者分别可辨认) |
| `AcquisitionRef` | 类型 | 集成方给一次获取的获取键；登记表的槽是租户加获取键 | [获取与租约](../SPEC.md#获取与租约) |
| `originRef` | 函数 | 把非空字符串接受为原调用引用。空串抛出 `TypeError` | [INV-EE01](../SPEC.md#inv-ee01-身份和事实拥有者分别可辨认) |
| `acquisitionRef` | 函数 | 把非空字符串接受为获取键。空串抛出 `TypeError` | [获取与租约](../SPEC.md#获取与租约) |
| `EnvironmentBinding` | 类型 | 四种绑定层：`host_machine`、`stateless_sandbox`（作用域加原调用）、`session_sandbox`（作用域）、`tenant_sandbox`（租户） | [INV-EE01](../SPEC.md#inv-ee01-身份和事实拥有者分别可辨认)、产品正文[绑定层说寿命，连续性说此刻](../../../../.meta_harness/design/product/execution-environments/design.md#绑定层说寿命连续性说此刻) |
| `BindingKind` | 类型 | 绑定层的种类名 | 同上 |
| `bindingKinds` | 值 | 冻结的四种绑定层种类名 | 同上 |
| `bindingScope` | 函数 | 返回绑定层所属的作用域引用。宿主机与租户级沙箱返回 `undefined`。获取的归属是请求方作用域，不是这个值；这个值不为 `undefined` 时必须等于请求方作用域 | [INV-EE06](../SPEC.md#inv-ee06-逻辑工作实例资源和数据不共用寿命)、[获取与租约](../SPEC.md#获取与租约) |
| `EnvironmentContinuity` | 类型 | 连续性：不保证、连续（带数据身份与修订）、已丢失（带前一个实例）。它说此刻，不说寿命 | [INV-EE07](../SPEC.md#inv-ee07-临时状态边界与实际回收明确) |

### 环境要求与匹配

定义：[requirement.ts](../src/requirement.ts)、[judge.ts](../src/judge.ts)。

别名导出见 [index.ts](../src/index.ts)。

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

定义：[facility.ts](../src/facility.ts)、[lease.ts](../src/lease.ts)。

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

定义：[facilities/files.ts](../src/facilities/files.ts)。

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

定义：[facilities/command.ts](../src/facilities/command.ts)、[facilities/terminal.ts](../src/facilities/terminal.ts)。

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

定义：[ports.ts](../src/ports.ts)。

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `ManagedResource` | 类型 | 受管资源：键、所属提供者与 JSON 恢复引用。不是活句柄或裸进程号 | [INV-EE15](../SPEC.md#inv-ee15-准备持有回收与确认保持一致)、[对象模型 受管资源](object-model.md#受管资源) |
| `ResourceLedger` | 接口 | 需要端口，集成方实现：计划、许可、接续、停止记录与关闭信号 | [INV-EE15](../SPEC.md#inv-ee15-准备持有回收与确认保持一致) |
| `FacilityGuard` | 接口 | 需要端口，集成方实现：这次操作现在还允许吗，答允许、不允许或不可用 | [获取与租约](../SPEC.md#获取与租约)、[设施协议](../SPEC.md#设施协议) |
| `RecoveryAuthority` | 接口 | 需要端口，集成方实现：核对恢复授权能否停止与结算一个作用域的资源 | [恢复](../SPEC.md#恢复) |
| `RecoveryAccess` | 接口 | 恢复授权，带模块内标记的原对象，不可序列化 | [恢复](../SPEC.md#恢复)、[对象模型 恢复授权](object-model.md#恢复授权) |
| `createRecoveryAccess` | 函数 | 创建一个新的恢复授权对象。持有它不授予任何权利，直到 `RecoveryAuthority` 接受 | [恢复](../SPEC.md#恢复) |

### 落点、获取与租约

定义：[lease.ts](../src/lease.ts)。

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `ProviderIdentity` | 类型 | 提供者身份：名称、代（一次登记化身）与版本（提供者代码的版本） | [INV-EE18](../SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任) |
| `InstanceIdentity` | 类型 | 实例身份加代。同名的新实例不冒充原实例 | [INV-EE01](../SPEC.md#inv-ee01-身份和事实拥有者分别可辨认) |
| `Placement` | 类型 | 落点：原环境要求、选中的绑定层与提供者、连续性与提供者的配额域。它不授予设施或资源 | [获取与租约](../SPEC.md#获取与租约) |
| `RejectReason` | 类型 | 获取与落点的十七个拒绝原因 | [拒绝原因](../SPEC.md#拒绝原因) |
| `Rejected` | 类型 | 带拒绝原因的结果 | 同上 |
| `EnvironmentAdoption` | 类型 | 采用记录：获取键、原调用、落点、提供者、实例、连续性与提供者证据。由本成员的实现签发，不由提供者自签 | [INV-EE05](../SPEC.md#inv-ee05-实际执行捕获原落点与版本) |
| `EnvironmentLease` | 接口 | 租约：落点、实例、连续性、按键取设施、失效信号与释放 | [获取与租约](../SPEC.md#获取与租约)、[对象模型 获取](object-model.md#获取) |
| `LeaseInvalidation` | 类型 | 失效原因，按来源区分：`source: 'registry'` 带登记表的封闭原因集合，`source: 'provider'` 带提供者自报的原因文本 | 同上 |
| `RegistryInvalidationReason` | 类型 | 登记表给出的失效原因：`providerRetired`、`scopeReleased`、`registryClosed`、`released`、`providerInvalidated` | 同上 |
| `LeaseRelease` | 类型 | 释放的结果：已释放，或待处置并列出未停的受管资源 | 同上 |
| `AcquisitionState` | 类型 | 一次获取的存储状态，十一种之一。`invalidated` 状态带 `invalidation`（`LeaseInvalidation`）；`allocationFailed` 带原因与清理状态；`allocationUnknown` 带获取键 | [获取的状态与答复](../SPEC.md#获取的状态与答复) |
| `Acquired` | 类型 | 已获取：租约与采用记录 | 同上 |
| `Pending` | 类型 | 获取存在但现在没有可用租约；没有新分配 | 同上 |
| `AllocationCleanup` | 类型 | 分配后采用失败的清理状态：已结清、待定或未知。只有已结清返还名额 | [分配后采用失败与清理](../SPEC.md#分配后采用失败与清理) |
| `AllocationFailed` | 类型 | `acquire` 的采用失败：获取键、第一个确定的原因与清理状态。不带租约 | 同上 |
| `UnknownAcquisition` | 类型 | `acquire` 的获取未知：`preflight` 表示没有调用提供者，`allocation` 表示可能已分配，只能按原键查询 | [访问核验](../SPEC.md#访问核验)、[获取与租约](../SPEC.md#获取与租约) |
| `LookupUnknown` | 类型 | 落点解析、`describe` 与恢复这一次查不清：原因是授权、可信绑定、提供者或配额 | [访问核验](../SPEC.md#访问核验) |
| `OriginalAcquisition` | 类型 | 原获取描述：租户、获取键、原调用、请求方作用域与落点。调用方在调用提供者之前保存它 | [获取与租约](../SPEC.md#获取与租约)、[对象模型 原获取描述](object-model.md#原获取描述) |
| `AcquisitionQuery` | 类型 | 查询的对象：本地获取键，或完整的原获取描述 | [原获取的查询与结清](../SPEC.md#原获取的查询与结清) |
| `OriginalInspection` | 类型 | 原获取的查询答复：已分配、待定、未分配、已结清、冲突或采用失败。不带租约 | 同上 |
| `AcquisitionInspection` | 类型 | 查询答复，不是存储状态：已知、`unrecorded`、`invalidInput`、拒绝、查询不可用、查询未知或原获取答复 | [获取的状态与答复](../SPEC.md#获取的状态与答复) |
| `RecoveryInspection` | 类型 | 恢复查询的答复：去掉本地的已知与 `unrecorded` | 同上、[恢复](../SPEC.md#恢复) |

### 提供者与操作面

定义：[environment.ts](../src/environment.ts)。

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `EnvironmentProvider` | 接口 | 提供者：名称、代与版本、配额域、绑定层、连续性、设施键、隔离断言；描述、配额声明、获取、原获取查询、获取枚举、结清、退役，以及可选的资源恢复枚举与认回。获取与退役在提供者自己配置的上界内返回 | [INV-EE18](../SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)、[对象模型 提供者](object-model.md#提供者) |
| `ProviderFacts` | 类型 | 提供者声明的事实：名称、代、版本、平台、设施键、隔离断言，以及运行前提（满足、不满足或未知）。它是观察，不是控制 | [INV-EE17](../SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露) |
| `PlatformFacts` | 类型 | 平台事实：操作系统类型与版本 | 同上 |
| `ProviderAcquireInput` | 类型 | 执行环境交给提供者的获取输入：获取键、原调用、请求方作用域、落点、租户与账本 | [获取与租约](../SPEC.md#获取与租约) |
| `ProviderAcquisition` | 类型 | 提供者的临时回执：租约原件与证据、拒绝，或只带原键的未知 | [INV-EE05](../SPEC.md#inv-ee05-实际执行捕获原落点与版本) |
| `ProviderQuota` | 类型 | 按租户的配额声明：单位、按租户上界与全局上界（可空） | [配额与安全上界](../SPEC.md#配额与安全上界) |
| `QuotaAnswer` | 类型 | 配额查询的答复：已声明、不可用或未知。它不保留名额 | 同上 |
| `ProviderAcquisitionStatus` | 类型 | 提供者按原描述查到的原获取状态 | [原获取的查询与结清](../SPEC.md#原获取的查询与结清) |
| `AcquisitionListing` | 类型 | 按作用域的获取枚举：有限且完整的列表、不可用或未知。不可用不是空表 | 同上 |
| `AcquisitionSettlement` | 类型 | 结清的答复：已结清、未分配、待定、不支持、冲突、不可用或未知 | 同上 |
| `Retirement` | 类型 | 退役的结果：已排空，或待处置并列出未停的受管资源 | [INV-EE18](../SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任) |
| `RecoveryListing` | 类型 | 恢复枚举的结果：列出的资源，或不可用。不可用不是空集 | [恢复](../SPEC.md#恢复) |
| `ResourceRecovery` | 类型 | 一项资源的认回结果：已确认停止、待处置或不支持，带证据 | 同上 |
| `OwnedRecovery` | 类型 | 一次恢复驱动的结果：资源路的已停、待处置、不支持与不可用的提供者四组，获取路的已结清、待定与不支持三组 | 同上 |
| `UnsupportedRecovery` | 类型 | 不支持恢复的提供者或资源 | 同上 |
| `PlacementInput` | 类型 | 集成方的落点解析输入：请求方作用域与环境要求 | [获取与租约](../SPEC.md#获取与租约) |
| `AcquireInput` | 类型 | 集成方的获取输入：获取键、原调用、请求方作用域、落点、账本与守卫 | [获取与租约](../SPEC.md#获取与租约) |
| `EnvironmentDescription` | 类型 | 一个作用域内一次获取的描述：获取键、原调用、绑定层、提供者、实例、连续性、设施键与状态 | [INV-EE17](../SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露) |
| `EnvironmentAction` | 类型 | 环境授权端口判定的动作：解析落点、获取、查询本地获取、查询原获取、列出作用域 | [访问核验](../SPEC.md#访问核验) |
| `EnvironmentAuthority` | 接口 | 需要端口，集成方实现：对访问身份与一个动作答复 Runtime Context 的 `AuthorityDecision` | 同上 |
| `ExecutionEnvironment` | 接口 | 集成方、独立调用者与维护者的操作面：`resolvePlacement`、`acquire`、`inspectAcquisition`、`inspectRecoveryAcquisition`、`describe`、`recoverOwned`、`releaseScope` | [获取与租约](../SPEC.md#获取与租约)、[恢复](../SPEC.md#恢复) |
| `ProviderRegistrations` | 接口 | 提供者与设施拥有者的登记面：`registerFacility`、`registerProvider`。每次登记返回自己的撤除函数 | [设施协议](../SPEC.md#设施协议)、[INV-EE18](../SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任) |

### 工具环境声明

定义：[need-declaration.ts](../src/need-declaration.ts)。

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

定义：[blocks.ts](../src/blocks.ts)。

| 名称 | 种类 | 用途 | 条款或对象模型 |
| --- | --- | --- | --- |
| `executionPlacementBlock` | 值 | 块 `execution.placement` 的供给块声明 | [INV-EE17](../SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)、[对象模型 两条块声明](object-model.md#两条块声明) |
| `ExecutionPlacementValue` | 类型 | 落点块的值：`ExecutionPlacementEntry` 的数组 | 同上 |
| `ExecutionPlacementEntry` | 类型 | 一个原调用的当前落点：原调用、绑定层、实例身份与代、连续性、设施键与观察时间 | 同上 |
| `executionHostFactsBlock` | 值 | 块 `execution.host-facts` 的供给块声明 | 同上 |
| `ExecutionHostFactsValue` | 类型 | 宿主事实块的值：块级日期 `date` 与提供者事实列表 `providers` | 同上 |

两条块声明的字段相同，块的读取规则归 Runtime Context 的 [RC-02](../../../context/runtime-context-contract/SPEC.md#rc-02-块声明注册与参数)：

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `kind` | `supplied` | 供给块，由生产者供值 |
| `consumers` | `model`、`tool`、`extension` | 可以读这两条块的消费者类 |
| `required` | `false` | 可选的感知。来源确认没有值时读为缺席；不可用、未知、拒绝或无法解释仍按原失败报告，不读为缺席（PC-21） |
| `disclosure` | `plain` | 披露方式是 `plain`，不是 `eligibility-checked` |
| `carriesPrevious` | `true` | 快照与提醒可以带前一个值 |
| `volatility` | `stable` | 变化频率是 `stable`，不是每步或每次请求 |
| `recovery` | `recompute` | 恢复时从当前事实重算，不持久保存 |

`blocks.ts` 用 `declare module` 把两个块键增补进 Runtime Context 的 `ContextBlocks`。块值按本成员的解码函数核对，未知字段与形状错误被拒绝。本成员是语义拥有者。生产者是 host-local 的 Service 实现。当前还没有发布。

### 操作 schema

精确定义在 [operation-schemas.ts](../src/operation-schemas.ts)。参数是按位置解码的元组，逐项拒绝路径从参数下标开始。登记面的返回值是函数，没有结果 schema。设施自身逐操作 schema 留 Q-EE05。

`operationSchemas` 按九个操作名索引。根入口同时导出 `OperationSchema`、`OperationName`、`providerFactsSchema`、`managedResourceSchema` 与 `originalAcquisitionSchema`。九个参数 schema 与七个结果 schema 见同一源码。`originalAcquisitionSchema` 解码集成方保存的原获取描述：租户按租户文本解码，作用域按完整父级链解码。

### 日期类型

[blocks.ts](../src/blocks.ts) 导出 `HostDate`。它是宿主本地日历日 `YYYY-MM-DD`，经宿主事实块 schema 验证真实日期后取得，不由提供者重复供值。

### 测试入口

`@omne-harness/execution-environment-contract/testing` 的入口是 [testing/index.ts](../src/testing/index.ts)。公开定义分别在 [case.ts](../src/testing/case.ts)、[provider-conformance.ts](../src/testing/provider-conformance.ts)、[environment-conformance.ts](../src/testing/environment-conformance.ts) 与 [doubles.ts](../src/testing/doubles.ts)。

`environmentProviderConformance` 与 `executionEnvironmentConformance` 返回独立用例列表，每条用例新建主体并在结束时清理。`runConformanceCase` 只把 `NotApplicable` 转成不适用，其余断言和清理失败照常抛出。未提供在途操作控制钩子时，对应排空用例记为不适用，不能算通过。`executionEnvironmentConformance` 的 `subject` 收到套件给的环境授权端口与可信绑定来源，套件把主体的作用域绑定到 `access` 的租户，并保留脚本控制。恢复相关用例需要主体给出它的恢复授权接受的 `recoveryAccess`；缺少时记为不适用。替身 `createScriptedEnvironmentAuthority` 默认对每个动作答已授权，`revokeAll` 之后此前答复的 `current()` 都为假；`createScriptedScopeBindings` 只信任测试绑定的作用域。脚本提供者的原获取记录只在替身对象内，不代表真实提供者的保管。替身 `durability` 为 `none`，只用于进程内验证。套件不证明耐久账本、真实隔离或设施外部效果。

提供者套件的 `prepareHeldOperation` 钩子在退役前取得已持设施上的合法操作与效果观察；退役后必须返回 `rejected/closed`，且观察结果不变。缺钩子时该用例明确不适用，不算通过。这项义务不读取或要求提供者自行触发租约 `invalidated`。脚本替身的默认设施遵守这项关闭规则，自定义脚本可用于构造反例。
