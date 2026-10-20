# Model 实现对象模型

公开对象与操作端口由[领域契约](../../model-contract/docs/object-model.md)拥有。本页保留实现内部角色、构造配置和资源组合；名称不自动成为公共类型或新的包。具体工厂见[公开入口](public-api.md)。

## 计量与供应商内部对象

| 对象或逻辑角色 | 单一责任 | 构造依赖与状态 |
| --- | --- | --- |
| ModelTextTokenizer | 按固定编码规则计数文本与显式控制 token | 不可变 TokenizerDefinition 与已初始化资源；无网络、档案或账目依赖 |
| ModelInputMeter | 解释完整请求表示，生成分维度计量和适用依据 | 固定 ModelCountingBasis；具体实现按需注入 tokenizer、模板和媒体算法 |
| ModelCountingBasis | 标识计量的供应商、物理模型、算法及格式适用范围 | 不可变值；预算报告保存，不携带运行句柄 |
| 请求编码器 | 将固定请求转换为供应商表示，并核实际 payload 与表示一致；不计量预算 | 固定协议、模板、参数/schema 映射；媒体读取仍归发送阶段 |
| 响应解码器 | 把供应商帧解释为 TransportFact，区分内容、终止与用量尾帧 | 固定供应商协议；不持有调用方历史或重试策略 |
| 流归约器 | 对每次 dispatch 校验块顺序、累计值、封口和首内容 | 当前块表与归约状态；不拥有网络或耐久存储 |
| 用量解释器 | 确定原 dispatch 的用量来源、统计口径和未知项 | 固定供应商映射；校准资格与入账资格分别核验 |
| 适配资源拥有者 | 初始化并固定采用，停止新取得，排空使用者后释放 | 具体提供者内部的资源引用及关闭状态 |

只有 ModelTextTokenizer 与 ModelInputMeter 是这里新增或细化的提供者接缝。其余名称表示内部责任，不要求各建公开接口、class 或 Cordis Service。请求编码器可以由函数组成；归约器需要每次 dispatch 的独立状态。

```mermaid
classDiagram
  RequestAssembler --> ModelInputMeter : full request budget before preparation
  ModelInputMeter --> ModelCountingBasis : fixed basis
  ProviderInputMeter ..|> ModelInputMeter
  ProviderInputMeter --> ModelTextTokenizer : optional injected count
  ModelTextTokenizer --> TokenizerDefinition : fixed resources
  ProviderInputMeter --> PromptRenderer : template
  ProviderInputMeter --> MediaMeasurement : media facts
  RequestBudget *-- ModelCountingBasis
```

具体 meter 依赖 count 能力，不依赖分词库类型。其 implementation 随厂商家族适配包维护，count 的引擎实现由 tiktoken 或 Hugging Face adapter 提供；词表、特殊 token 配置及模板仍归家族。包组织和资源归属见[组架构](../../docs/architecture.md#tokenizer-的资源与计量分工)。普通调用者不需要词元数组和 encode/decode。字符倍率估算器不能伪装成精确 tokenizer；不使用本地分词的计量器明确声明 not-used 方法。供应商模板或媒体贡献不准确时，文本分词准确也不能把完整计量升级为 exact。

```mermaid
flowchart LR
  Frames[供应商帧] --> Decode[响应解码器]
  Decode --> Facts[TransportFact 操作]
  Facts --> Mapping[Model runtime 映射共享到达及序号]
  Mapping --> Reduce[每次 dispatch 的流归约器]
  Reduce --> Save[ModelCommands.preserve]
  Save --> View[累计 Snapshot 与观察发布]
  Decode --> Usage[原 dispatch 用量解释]
```

TransportFact 表达块操作，VisibleBlock 表达归约后的当前状态。两者不能共用一个增量含义不明的 output 值。归约器不把未完成工具参数变成 ToolCallPart，不承担消息采用、费用查询或业务取消。完整流协议见 [SPEC](../../model-contract/SPEC.md#供应商解释与流状态归约)。

可选校准留在具体计量提供者内。它可以使用有合法来源的历史观测，但不能读取调用方私有历史、保存原响应控制权或要求所有调用者维护增量计量状态。

## 参数、配置、依赖与资源

| 类别 | 内容 | 提供时点和约束 |
| --- | --- | --- |
| 操作参数 | 当前 principal、tenant、call、operation、consumer、expected revision | 每次操作显式传入并核验，不能从 Context 隐式补租户 |
| 固定业务值 | 档案采用、供应商次序、消息、ToolDeclaration、参数、来源 | 准备并受理时固定，不能存运行函数或凭据秘密 |
| 装配配置 | 批量保存、观察缓冲、页大小、读闲置、退避及清理间隔 | ModelConfiguration 构造时校验；已开始读保留原期限 |
| 权威依赖 | ModelCommands、档案条件写与当前读取、身份/设置、凭据与内容访问 | 提供者构造注入；支持当前核验及未知状态，不接受 allowed 常量冒充 |
| 算法依赖 | ModelInputMeter、ModelConverter、ModelRetryPolicy、ModelToolPayloadAdapter | 固定 adoption；meter 另固定完整 basis，可按需注入 ModelTextTokenizer；本地转换器没有 Model 调用能力 |
| 执行依赖 | ModelSendBoundary、ModelTransport、ModelInstanceHost、ModelClock | 托管执行工厂显式注入，独立执行只要求其实际路径的依赖 |
| 临时资源 | 转换目录 acquire 结果、ModelMediaLease、PreparedTransport、MaterializedTransport、观察订阅 | 当前操作拥有，完成/失败/取消均释放，不能序列化进恢复数据 |

档案内参数是模型业务设置。ModelConfiguration 是实现运行机制的装配设置。二者由不同拥有者修改，不能把 temperature 作为 runtime 缓冲配置，也不能把 clock 或凭据解析函数放入请求。

ModelProfiles 的提供者注入档案权威读取与身份/设置适配器。维护提供者另取条件写和操作核实能力。ModelRequestPreparation 注入固定算法目录、档案采用解析和凭据绑定引用读取。它不持有原始秘密。ModelMessageConversion 注入系统转换目录和来源核验。具体 converter 注入其本地读取/识别依赖。内部排序、数值比较和 JSON 值树编码不各自成为公开端口。

这些读取和条件写属于实际提供者内部接缝，数据库语句形状由提供者设计拥有。不能据此虚构已有存储实现。提供者必须满足 [提交和顺序协议](../../model-contract/SPEC.md#档案与请求准备协议)，否则不能宣称兑现公开能力。


## 构造、绑定与实例寿命

ModelRuntimeProvider 组合普通 runtime 与受信 driver。构造阶段只建立对象关系；宿主绑定成功后才允许对外受理。ModelDriverHost 维护 binding、按调用键的队列及活跃协程；这些均可重建，不承担调用持久权威。ModelHostAuthority 从原受理与当前宿主资格取得 drive 输入。

| 对象 | 参数、依赖与状态 | 替换条件 |
| --- | --- | --- |
| Profiles | 每次Access/required/selected；注入ModelProfileSource；不缓存永久许可 | 来源换代后新查询读取新快照，在途结果保持其依据 |
| Preparation | 每次固定profile/assembled；注入ModelPreparationResources | 每次取得固定规则/meter；meter 供请求组装方使用，prepare 不调用它，也不能用新采用解释旧预算 |
| Conversion | 每次原块/来源/signal；注入Catalog与ContentAuthority | 每次取得原converter租约，退休后停止新取得 |
| RuntimeProvider | 每次调用/控制/消费参数；注入Commands、send、retry、instances、clock及配置 | quiesce、驱动交还、binding关闭后替换；事实继续保留 |
| CallDriver | 每次受信drive输入；共享Commands与阶段端口；私有本次恢复状态 | claim核代次，不凭对象存在取得执行权 |
| ModelDriverHost | 构造配置和HostAuthority；私有队列、binding及活体贡献 | 原driver结束或旧进程已排除后才能绑定后继并恢复 |

ModelProfileMaintenance 由实际档案权威提供者实现，包含条件写及未知核实。普通查询没有维护接口。抽象类只用于框架服务身份；厂商编码器、计量器和本地调度器通过组合实现窄端口，不继承一个包含所有能力的模型基类。

## 已实现的凭据对象

凭据的保管行为归 [SPEC](../SPEC.md#凭据引用与解析)。引用、结果和端口的声明与持有者语义归 [model-contract](../../model-contract/docs/public-api.md#凭据引用与解析端口)，保管的内部判定状态在 [credential.ts](../src/credential.ts)。

调用记录只保存引用。引用含凭据身份、租户和用途。用途取值是 `model-send`，没有更宽的用途词表。查询可以带一个别的用途字符串，`present` 和 `resolve` 都是 `denied`。能写入保管库的引用仍然只有 `model-send`。同一凭据身份可以分属不同租户。已撤销或暂时读不出的行仍然存在，`present` 为 true。`resolve` 才分别返回 `denied` 或 `unreadable`。

租户标识使用 `packages/common/legal-identity` 的 `TenantId`。凭据身份 `CredentialId` 由 model-contract 定义，是人在保管配置路径上命名的不透明标识，不是 `TenantId`，也不是登录出示物。持有引用不构成读取授权。

```mermaid
classDiagram
  class CredentialReference {
    id
    tenant
    purpose
  }
  class CredentialPresence {
    present
    id
    tenant
    purpose
  }
  class CredentialResolution {
    kind
  }
  class Value {
    scope
    value
  }
  CredentialReference --> CredentialPresence : present
  CredentialReference --> CredentialResolution : resolve
  CredentialResolution <|-- Value : kind = value
```

`CredentialPresence` 没有秘密。`CredentialResolution` 的种类如下。只有 `value` 携带秘密，并且只交给这一次发送。

| 种类 | 含义 | 发送端 |
| --- | --- | --- |
| `value` | 当前资格允许 | 发出，并记下所用的值 |
| `absent` | 没有这份凭据 | 不发送 |
| `unreadable` | 引用在，值暂时读不出 | 不发送 |
| `denied` | 跨租户、用途不符、无资格、已撤销或保管已关闭 | 不发送 |
| `unavailable` | 保管或存储暂时不能判断 | 不发送。不得报成 `absent` |

没有租户绑定、且本次档案是官方档案时，解析可以使用部署默认凭据，范围记为 `factory`。租户绑定仍在但值不可读时，结果是 `unreadable`，不使用部署默认凭据，也不使用其他租户的值。

`resolve` 按下面的顺序取舍。前面的结果一旦成立，后面的不再看。

```mermaid
flowchart TD
  gate{关闭、未获准或用途不是 model-send}
  row{本租户有这一身份}
  other{别的租户持有这个身份}
  any{本租户还有任意一行}
  official{本次是官方档案}
  gate -->|是| denied[denied]
  gate -->|否| row
  row -->|active| tenantValue["value，范围 tenant"]
  row -->|revoked| denied
  row -->|unreadable| unreadable[unreadable]
  row -->|没有| other
  other -->|是| denied
  other -->|否| any
  any -->|是| absent[absent]
  any -->|否| official
  official -->|是| factoryValue["value，范围 factory"]
  official -->|否| absent
```

未获准的官方发送停在第一步，拿不到工厂秘密。本租户没有这一行、但还有任意其他行时，缺的那个身份是 `absent`。其他行包括另一个身份，也包括已经撤销的行。别的租户持有同一身份时是 `denied`，即使本租户一行都没有，也不用工厂秘密。

`present` 不接收发送资格。用途不符或保管已关闭时，它返回 `denied`，不是 `present: false`。同一身份只在别的租户手里，或者本租户没有这一行时，它返回 `known` 且 `present` 为 false。`resolve` 对前一种才是 `denied`。`unavailable` 只在整份保管打不开、任一行读失败或同一持有者出现多行冲突时出现。凭据身份须通过 `decodeCredentialId`：非空，不超过 256 个 UTF-16 码元，不含空白、控制字符或格式字符。磁盘上的行若含不能通过它的身份，整份保管按损坏处理，`present` 和 `resolve` 返回 `unavailable`。

[model-host-local](../../model-host-local/SPEC.md) 的本地保管库每次 `present` 和 `resolve` 都从磁盘刷新状态，再把快照交给本包的判定，因此保留的句柄和 Cordis 服务都能观察到其他进程或句柄造成的轮换、撤销或文件损坏。如果文件在打开后被损坏，后续解析返回 `unavailable`，而不是继续返回旧值。管理操作持有文件锁完成“读当前状态—修改—发布”，写入失败时不发布新状态。

`put` 把该持有者写成 `active`，可以盖过已撤销或读不出的行。`rotate` 只换秘密，不改生命状态。已撤销的行轮换后仍是 `denied`。`markUnreadable` 只把 `active` 改成 `unreadable`。

发送端收到的记录只有发没发。不是 `value` 时，记录是 `{ sent: false }`，不再带那五种种类。发出时记录带上这次的秘密值。调用记录不带。诊断留在本地保管上，字段是 `stage`、`outcome`、`tenantMatch`。`tenantMatch` 表示同一身份且同一租户的行存在。诊断不含秘密。Cordis 服务不转发这份诊断。

四个模块各只有一个变化原因。前三个归本包，保管库归 model-host-local。

| 模块 | 只因什么而变 | 公开给调用执行的事实 |
| --- | --- | --- |
| 引用 | 身份、租户、用途这三项的形状 | 不可变引用 |
| 存在性 | 怎样回答引用是否存在 | `present` 的结果 |
| 解析 | 获准发送时怎样按当前资格取舍 | 五种结果之一 |
| 本地保管库（归 [model-host-local](../../model-host-local/SPEC.md)） | 秘密和绑定怎样持久保存、重开和关闭 | 无。它构造状态快照并调用前两项，不对外暴露行格式 |

调用执行把引用写进调用记录。它调用 `resolve`，不打开保管库，不保存返回的秘密。替换本地保管库时，调用记录和五种结果保持不变。

当前最小运行实现以 tenant/call 活动对象持有原 claim、publication、发送需求与接收阶段。其确认 view 是 Commands 回执的实例投影，不能作为耐久权威或跨实例恢复依据。观察者只保留版本、等待者和有限未读通知额度；原流不归观察者所有。具体状态转换及资源退出归 [实现规格](../SPEC.md#当前构造支持与本地模拟)。
