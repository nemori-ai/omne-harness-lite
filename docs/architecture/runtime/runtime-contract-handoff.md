# 主干契约候选的后继实现与验证

本页维护四成员的共同交接候选。Model 的非 pi-ai 专有设计和 Tool 专有设计已接受；共同交接及其他成员的接受状态由各自拥有者维护。操作形状归各成员 public-api，集成责任归[共同集成](runtime-contract-integration.md)。接受时须引用精确 Git 修订及范围；后继不能把“接口候选已写出”记成运行时、业务增量或提供者通过。

## 四条实现线

| 实现线 | 可独立实施的边界 | 必需输入与外部提供者 | 自身及组合验证责任 |
| --- | --- | --- | --- |
| Model | 独立函数、托管调用、容量/保管、发送与首内容、重试判断、控制/ACK/清理、目录和宿主 | 原请求/结果契约、可信身份与实际S围栏、Storage、传输、#279凭据、独立策略协调者 | 按包做类型/契约及状态测试；实际供应商断流/请求未知、首内容接收窗口、保管故障、ACK双路径、清理并发及晚到费用由真实提供者/组合取证 |
| Tool | 独立函数、固定执行者/环境、受理/队列/控制、启动认回、原结果/全文、版本交付和实例目录 | 实际执行环境#278、原executor、Storage、身份、HITL、具名结果政策 | 环境准备先于排队、FIFO/名额、实际效果未知、启动/接续响应丢失、全文与附件耐久、前后台/Ask/晚到版本分别验证 |
| Session | 内部输入与创建、连续空闲维护/当前归档裁定、唯一Run/advance、原位置、结果版本、控制/级联、权威读/历史和原提交认回 | #280同提交组合、当前身份/授权、精确采用/Context输入、可靠材料、具名时钟/完整空闲来源及各事实参加者 | 并发起Run、取输入批界、claim/reload/取消、压缩共同提交、控制传播、归档/撤销、逐版本交接及故障恢复；不以通知代替权威 |
| Agent | 纯求值、精确continuation、扩展有序经过/整批屏障、请求/压缩、公开消费协调、退出/实例宿主 | 三成员公开接口、Context、HITL、采用解释器、材料保管与具名只读协议 | 同输入纯决定、恢复不重复模型/效果、出卡未知、明确不回答、改参批准一致、压缩改写重验、来源拒收、统一终态及退出独立寿命 |

单元和契约验证由各成员拥有。具体存储、传输、凭据、环境和HITL集成由相应提供者与消费成员共同执行。关键用户旅程由应用/接入拥有者完成端到端验证，不能由四个替身各自通过代替。

## 相邻能力交接

### #279 凭据

Model 固定请求只保留凭据引用及实际采用，不保存秘密副本。受理、发送与诊断按当前资格分开；实际S围栏内使用已采用 CredentialPort 的同步解析。绑定凭据不可读/无权/不可用时不回退其他身份，factory 路径由可信内部判断。凭据服务本身不承担Model容量、结果或运行时生命周期。

本候选消费 #341 的明确快照输入；后继以 #279 最终接受的精确版本复核 adapter，不从较早接受记录推定后续所有提交已采用。Model 按已接受的非 pi-ai 设计承接，pi-ai 相关细化保留候选；凭据正文及共同集成的采用范围不随之改变。

### #280 Storage

Session/Model/Tool所需命令均有具名原操作与权威认回。Session治理状态、原日志范围、提交尾部和操作结果共同提交；生产受理的参加者读取同一transactionDomain内的原工作/消费者绑定。保管交接使用有序证据协议，不要求将两域每次ACK强做一个跨域事务。

生产实现必须证明进程、OS崩溃及断电下的确认含义，以及查询未知、旧写者排除、队列/结果原状态恢复。not-committed必须满足既有Storage全部排除条件；数据库回滚不证明整个原业务操作未提交。当前授权源若不能参加同提交或等价排序，应报告具体受阻操作，不能用先查后写扩大保证。

网络/工具真实效果不在SQL事务内。实际发送围栏、旧进程排除和远端幂等/查询由执行与部署提供者共同负责，不把这一义务转给SQLite单方。

### #318 公开接入与宿主

SessionService 是内部工作治理面，不是网络 SDK。外部调用者经服务端接入使用会话：服务端接入把一条公开消息变成对 Session 某个面的一次调用。跨边界始终显式 tenant，不把 Context 或句柄序列化为业务对象。公开消息的字段、结果、判断次序与 body 归[公开契约的会话公开操作](../../../packages/access/public-contract/SPEC.md#会话公开操作)。

#### 操作到 Session 的映射

| 公开操作 | Session 的面与操作 | 调用方类 | 身份 |
| --- | --- | --- | --- |
| `create-session` | `SessionManagement.create` | `intake` | 派生的会话标识与创建操作身份 |
| `query-create-session` | `SessionWork.queryOperation` | `intake` | 同一派生的创建操作身份 |
| `send-input` | `SessionWork.accept`，普通输入 | `intake` | 派生的受理操作身份与 `InputId` |
| `query-send-input` | `SessionWork.queryOperation` | `intake` | 同一派生的受理操作身份 |
| `read-history` | `SessionHistory.begin`（`from` 为 null）、`next` | `reader` | 只读 |

服务端接入是这些调用的唯一调用方。SDK 只编码请求、读取回复，不直接调用 Session。

#### 派生身份

服务端接入从调用者的标识确定性地派生 Session 所需的身份，认回不需要另存映射。每个身份取下表字符串数组的 SHA-256。数组按不带 replacer 与缩进的 `JSON.stringify` 编成文本，摘要输入是该文本的 UTF-8 字节，输出写成小写十六进制：

| 身份 | 数组 |
| --- | --- |
| 会话标识 | `["session-public/1:session", 租户文本, createCallId]` |
| 创建操作身份 | `["session-public/1:create", 租户文本, createCallId]` |
| 受理操作身份 | `["session-public/1:accept", 租户文本, 会话文本, acceptId]` |
| `InputId` | `["session-public/1:input", 租户文本, 会话文本, inputId]` |

租户文本是公开契约判断次序第 1 步解析出的 `TenantId` 再经 tenantCodec 编码的文本，不是调用者原文，所以同一租户只有一种写法；它含账号，不同账号的同名调用标识不会撞。会话文本就是会话标识摘要的十六进制文本。摘要怎样成为 Session 的品牌值归 [#685](https://github.com/nemori-ai/omne-harness-lite/issues/685)。

`create-session` 不公开 `SessionCreation` 的内部采用字段。服务端接入按部署装配把定义名解析为定义候选、执行类型与入口契约的采用，`modes` 取租户默认，`workspace` 为 null，没有初始输入。定义名到采用的映射、`requiredIdentities` 与租户默认设置的来源都归[应用装配 #677](https://github.com/nemori-ai/omne-harness-lite/issues/677)。Session 比较的是解析后的 `SessionCreation`，所以部署映射变化会让原样再送得到 `conflict`（见[会话公开操作](../../../packages/access/public-contract/SPEC.md#会话公开操作)）。

#### 登录到 `Access`

1. 服务端接入用 identity 的登录识别（[#745](https://github.com/nemori-ai/omne-harness-lite/issues/745)）核验 `loginProof`，得到账号、这份登录的 `login`（`LoginStateId`）与当前选择的租户。
2. 服务端接入用 tenantCodec 解析目标租户文本，得到的值就是签发要求的已解析租户；租户是否存在不在这里判断。服务端接入是 [ID-16](../../../packages/identity/identity/SPEC.md#id-16-首批公开形状主体与资格事实) 所列「装配授权的系统部件」：应用装配（[#677](https://github.com/nemori-ai/omne-harness-lite/issues/677)）把签发者安装给它。目标租户的账号等于识别出的账号时，它签发代租户行事主体：`actor` 是服务端接入的系统主体，`tenant` 是目标租户，`work` 是 `{ owner: 'identity-login', work: login 的 loginStateCodec 文本 }`。关系核对按 [ID-16](../../../packages/identity/identity/SPEC.md#id-16-首批公开形状主体与资格事实) 的登录条款。账号不等时不签发，结果是 `denied`。
3. 服务端接入以这个主体、目标租户与会话标识组成 `Access` 交给 Session：`create-session` 与 `query-create-session` 用派生的会话标识，其他操作用 body 的 `session`。服务端接入不另核资格。变更操作的当前成员资格与创建、发送资格由 Session 的身份桥核，桥不可得时返回 `unavailable`；读取由 Session 事务端口的读路径按身份与披露边界核权。租户或会话不存在与没有资格都是 `denied`。
4. 会话的租户由会话固定。Session 不核该登录当前选择的租户（[J52](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)）。只有 `create-session` 要求行事租户等于当前选择，因为新会话建在它下面。

#### 普通输入的来源与登录门

服务端接入把普通输入的 `origin` 写成登录入口证据：`{ owner: 'login-entry', record: login 的 loginStateCodec 文本, revision: '1', digest: ["login-entry", 账号的 accountCodec 文本, login 的 loginStateCodec 文本] 按上述派生规则得到的摘要 }`。它不含识别时刻：Session 的输入摘要包含 `origin`，同一登录下原样再送必须得到同一份内容。换了登录之后原样再送的结果见[会话公开操作](../../../packages/access/public-contract/SPEC.md#会话公开操作)。Session 的新 Run 要求登录入口已确认登录有效。装配的证据桥在 `startRun` 时从首条输入的 `origin` 取这项确认。受理时的识别就是登录门的证据。

`startRun` 由装配的推进触发发起，不是公开操作。`login-required` 不进入公开结果：Run 不开时，读历史读不到回复，原因由宿主诊断。

#### 回复的取得

调用者在 `send-input` 成功后用 `read-history` 按页读取，回复是已提交的助手消息条目。每页由 Session 事务端口的读路径重新核权，撤权后不再披露。回复的产生依赖三个非公开部件：装配的推进触发（[#677](https://github.com/nemori-ai/omne-harness-lite/issues/677)）、Agent 驱动（[#502](https://github.com/nemori-ai/omne-harness-lite/issues/502)）与 Model 宿主。

#### 传输

- 进程内环回是骨架的承载：同一进程里 SDK 编码请求，服务端接入读取并回写字节。它证明消息格式、判断次序与结果映射。它不证明网络、并发连接、进程隔离或跨进程的主体来源。
- HTTP 是结束标志的承载：同样的字节经 HTTP 承载（[补记](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6358025478)）。它另外证明跨进程的请求与回复能完整往返。它不证明多实例部署、连接复用下的隔离或长连接观察。状态码不替代消息里的 `outcome`。

#### 尚未提供

- 成功业务访问报告：服务端接入在业务成功后报告（[J53](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)），形状归 identity ID-11，尚未定义。定义之前不报告，会话操作不刷新空闲计时。
- `startRun` 时再核登录是否仍有效：需要 identity 按 `login` 读有效性，该读口尚未定义。在它就绪之前，登录在受理之后被撤销，已受理的输入仍可能开 Run。
- Session 对被拒的受理是否在原操作身份下留痕：Session SPEC 变更操作次序写「任一步失败不提交」，命令表写「拒绝时只有 SE12」。前者成立时 `query-send-input` 的 `succeeded` 只表示受理已提交；两处由 Session 拥有者统一。
- 观察推送与业务控制分开，观察取消不是业务控制。观察脱离与重附着由 [#746 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/746) 给出候选归属，见下节；重连不得靠目录为空重发原 Model 或 Tool 调用。
- 宿主身份、启停与归属、状态目录、重复启动、资源关闭和未知结果，模型准备、选择与切换分责，以及旧实例与数据调查归 [#803](https://github.com/nemori-ai/omne-harness-lite/issues/803)。宿主计划换代先业务交接再撤插件；意外退出保留原身份与结果责任。这些现行约束不因拆卡改变。

#### 观察脱离与重附着候选

[#746 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/746) 候选由公开接入 `server-entry` 承担观察组合，须 PanQiWei 本人接受固定修订。完整边界归[接入行为规格](../../../packages/access/server-entry/SPEC.md#观察脱离与重附着候选746)，取舍归[接入内部设计](../../../packages/access/server-entry/docs/internals.md#观察接入的责任选择候选)。本节不增加公开接口，也不声明已有运行实现。

接入在当前身份与租户边界下，从 Session 的公开日志读面取得稳定 `ModelInvocationRef`，携带观察者自己的 `Access` 查询 Model `current`，再向目标生产者先取快照、后观察增量。Agent 不在重附着链路，会话日志不保存瞬时流引用。Session 只供日志事实，Model 只供权威调用状态与当前目标，各受保护端口分别核权。

`current` 为 null 时保留同边界 `CallState`，不把它解释成未执行或终局。接入拥有有界刷新与本地观察资源清理；策略参数待后继明确。旧 ref 失效后重新查询，新目标从新快照开始，不能沿用旧 cursor。接入串行查询或只应用最新已发请求的响应，阻止旧响应覆盖新目标。定位、核权、快照或订阅失败保留原含义，不转成观察成功、成功 null 或业务重发。脱离与撤权停止本地观察及刷新，不取消 Model 或 Tool 调用，不重发调用，不推进 Session。

Session 日志读面的引用定位能力若有缺项，交 Session 拥有者；公开订阅形状、连接寿命与传输细节交 public-contract 拥有者。本候选不改写两者契约。#789 消费候选观察通道，#790 H3 负责观察连续的组合运行证据。

## 仍需补齐的业务增量

后台工具、内部Ask、扩展多轮卡片、资产/配置与完整恢复在本候选中已有明确接缝，仍需实际实现及端到端证据。可恢复Tool执行者必须证明checkpoint边界和旧执行排除，普通JS函数不得宣称可恢复栈。Runtime Context的注册/刷新、完整Request Context计量/压缩算法、合法ModelProfile选择、真实HITL、子会话可靠派发以及各宿主均归原拥有者。

Tool 作者以 content 多模态 ref 声明模型直接感知，以 attachments 声明仅向 agent 提供文本地址、由其决定另行读取。Agent、Session 与 Context 不加载二进制；Model 只在实际发送时加载选中的内容 ref，不扫描附件地址。请求组装者消费 ToolDefinition，组合 description 与 programmable 的说明并保存工具/命令路由；Model adapter 只将中立请求声明转换为供应商 payload，Model 不依赖 Tool。Model 的发送读取设计已接受，pi-ai 具体适配仍为候选；共享 ref 和消息校验的状态由各自拥有者维护，MODEL-E01 跟踪实施与验证；任意嵌套语法不自动获准，原输出、费用和保管责任继续。

## 证据层次与接受

类型样例证明明确形状可以连接，负例证明列出的误用会报错。有限模型只检验命名状态空间和交错。真实Cordis探针证明固定4.0.4的局部机制，并检出了错误调用方归属。以上均不证明生产Storage、外部供应商、当前授权、物理执行排除、断电耐久或完整跨进程系统。

独立choice、expression、plan分别判断语义承载、表达和后继可执行性。它们不授予技术接受。主干候选取得具名技术接受并完成规定集成后，四条实现线固定该修订开始生产实施；后续业务能力及真实验证不会被主干契约交付核销。
