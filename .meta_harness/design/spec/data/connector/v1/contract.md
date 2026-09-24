# data.connector v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.connector, 1)`——
  `family = data`、`topic = connector`、规范路径 `spec/data/connector/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-002 rev 16、PF-014 rev 5、PF-000 rev 1、PF-015 rev 11、PF-003 rev 4** 为准（后两份各只取一处：会话持有租户身份、复制与分享带走正文）
- **精确语义依赖**：

  | 坐标 | 消费的条款 | 取它的什么 | 本契约怎么用 |
  |---|---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.asset-model · v1` | [S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳)、[S-12](../../asset-model/v1/contract.md#s-12-属性声明由正文推出)、[S-13](../../asset-model/v1/contract.md#s-13-设置项类别)、[S-15](../../asset-model/v1/contract.md#s-15-disabled-是保留项名)、[S-18](../../asset-model/v1/contract.md#s-18-资产持有)、[S-20](../../asset-model/v1/contract.md#s-20-出厂格与工作区格的持有)、[S-23](../../asset-model/v1/contract.md#s-23-凭据引用) | connector 那一支的正文外壳、推出规则的四条义务、设置项类别、保留项 `disabled`、一格一个能力标识一份持有、工作区格不配落点与身份类、凭据引用 | [S-1](#s-1-连接件正文) 填那一支的 `body`；[S-2](#s-2-鉴权绑定不在正文里)、[S-11](#s-11-推出规则)～[S-13](#s-13-两项权限) 按它写；**Schema 不 `$ref` 它**——凭据引用只出现在推出的声明里，那是一条规则，不是本 Schema 的定义项 |
  | `omne-harness-lite-design-2026-09-15 · data.messages · v1` | [S-2](../../messages/v1/contract.md#s-2-消息底座)、[S-6](../../messages/v1/contract.md#s-6-每种消息能装哪几类块)、[S-8](../../messages/v1/contract.md#s-8-usermessage)、[S-24](../../messages/v1/contract.md#s-24-别的会话捎话与到点了) | 消息成员闭合、来源标记只在哪、经连接件送达的落成 `UserMessage`、会话的不透明指认 | `$ref` 它的 `$defs/SessionRef`：`DeliveryTarget.session`；[S-9](#s-9-信封落成一条用户消息) 按它写 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | [S-8](../../content-blocks/v1/contract.md#s-8-文本块与来源标记)、[S-21](../../content-blocks/v1/contract.md#s-21-attachmentref)、[S-23](../../content-blocks/v1/contract.md#s-23-块不携带租户身份)、[S-26](../../content-blocks/v1/contract.md#s-26-表示层拒绝值) | 来源标记的两个取值与它的出处、附件引用的形状与相等、引用不带来读的资格、附件引用违例时的拒绝值 | `$ref` 它的 `$defs/AttachmentRef`：`InboundEnvelope.attachments` |
  | `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1` | [S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围) | 时刻的规范形式 | `$ref` 它的 `$defs/Instant`：`receivedAt` |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [S-16](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)、[S-17](../../identity-values/v1/contract.md#s-17-身份参数没有默认值)、[S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)、[S-34](../../identity-values/v1/contract.md#s-34-语义身份与实现地址分开) | 身份按归属层显式携带、身份参数没有默认值、不透明标识的交换表示、地址不是身份 | 三个外部标识按 S-31 的散文写 pattern，**不 `$ref` 它的 `OpaqueIdentifier`**；[S-3](#s-3-来源标识)、[S-8](#s-8-信封不带归属) 按 S-16／S-17／S-34 写 |

- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.connector/v1#S-6`。
  本文引另一份契约的条款一律带坐标，**裸号只指本契约**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 连接件：唯一方向朝里；身份是 name，协议、凭据形状、接的是对面哪个账号都不是身份；只能送消息进来，没有数据读取面也没有管理面；带身份鉴权；自带的设置与权限；不组合任何资产；一人多账户不立新对象 | [PF-002 §4 Connector](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector) · [UL-connector](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-connector--连接件--connector) | S-1～S-4、S-11～S-14 |
| 身份是「类别 ＋ name」，其余归实现 | [PF-002 §4 身份是类别＋name](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) · [UL-capability-identifier](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) | S-1、S-3 |
| 三方分工；设置项分四类，落点与身份类（含连接件的来源标识、投递目标与鉴权绑定）不从工作区来 | [PF-002 三方分工](../../../../product/PF-002-assets-settings-and-permissions/design.md#三方分工资产定形状各层配值运行时求值) · [设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别) | S-1、S-11 |
| 凭据类设置一份持有一份、不跨租户身份共用——「与连接件的鉴权绑定同一个形状」；值永不呈现 | [PF-002 MCP 凭据](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) | S-2、S-12 |
| 斜杠命令只有人用它：不经交付面的来源送来的 `/xxx` 原样是内容 | [PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) · [PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走) | S-10 |
| 入站到达：归属于恰好一个会话、有一个来源、送不进任何会话的在受理这一步具名拒绝；来源是属性不是类别 | [PF-014 §4 入站到达](../../../../product/PF-014-inbound-intake-and-queueing/design.md#入站到达) · [UL-inbound-arrival](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival) | S-4、S-5、S-8 |
| 经连接件送达的一条外部消息落成 `UserMessage` | [PF-014 §5.7](../../../../product/PF-014-inbound-intake-and-queueing/design.md#57-穷举一什么会让队列从空变成非空) | S-9 |
| 送进来的就要被处理，要不要送进来归连接件 | [PF-014 §6.2](../../../../product/PF-014-inbound-intake-and-queueing/design.md#62-送进来的就要被处理要不要送进来归连接件) | S-15 |
| 去重只认来源说得出的「同一件事」 | [PF-014 §6.3](../../../../product/PF-014-inbound-intake-and-queueing/design.md#63-去重只认来源说得出的那个同一件事) | S-6 |
| 外部来源能做的到此为止：把一条消息放进队尾；资格与「能不能访问这个会话」是同一个判断 | [PF-014 flows §四](../../../../product/PF-014-inbound-intake-and-queueing/flows.md#四角色与操作) | S-4、S-14 |
| 时间戳顺序与因果先后分别表达 | [PF-000 §5.5](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段) | S-7 |
| 会话持有创建那一刻的租户身份 | [PF-015 §6.12](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份) | S-4 |
| 复制与分享带走的是正文 | [PF-003 §6.4](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象) · [§6.10](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有) | S-2、[G-2](#十已知缺口) |
| 规格形式；部署边界；租户隔离 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) · [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | 见下方引文 |

> **没有产品行、或产品行不足以单独支撑的条款，逐条点名：**
>
> | 条款 | 依据来自哪 |
> |---|---|
> | [S-3](#s-3-来源标识) 的两个分量、[S-4](#s-4-投递目标) 的那一支、[S-5](#s-5-入站信封) 的五个成员、[S-18](#s-18-表示层拒绝值) 的四个拒绝值 | **起草简报的账本**（主线 2026-09-23）。产品正文只到「来源标识、投递目标、鉴权绑定」三项设置的名字；**这份账本尚未落进设计链里任何一处**，本表无处可链——见 [G-9](#十已知缺口) |
> | [S-2](#s-2-鉴权绑定不在正文里) 正文不收凭据引用 | **偏离账本**：账本给的正文带可选的 `credential`；本版按产品正文与 `data.asset-model/v1#S-23` 不收，理由写在条款里，**待主线确认**——[G-1](#十已知缺口) |
> | [S-1](#s-1-连接件正文) 正文的两项是默认值、[S-11](#s-11-推出规则) 的推出规则 | **规格层推导**：`data.asset-model/v1#S-12` 要求每份正文契约给出推出规则、声明必带 `default` |
> | [S-5](#s-5-入站信封) 的「非空才给」、[S-6](#s-6-externalid-是同一件事的说法) 的相等范围、[S-9](#s-9-信封落成一条用户消息) 的四条 | **规格层推导**，依据写在各条正文里 |
> | [S-8](#s-8-信封不带归属) | **SYS-TENANT** 加 `data.identity-values/v1#S-16`、`#S-17` |
> | [S-16](#s-16-规范表示)～[S-19](#s-19-表示层拒绝不是判定也不修补) | **SYS-SPEC** |
> | [第六节](#六装配给与协议给) | **SYS-DEPLOY** |
>
> 前身与同行长成什么样见研究 `research/connector-and-slash-command-sources/`（omne-next `6263fed`、DSH `c291e796`）。**它只是参照，不是任何一条的依据**——两源都没有与 PF-002 连接件一一对应的对象。

## 一、目的与消费者

### 这份契约拥有什么

**连接件这一类资产的静态数据形状**：一份连接件的正文、来源标识与投递目标这两个值、连接件把一条外部消息交给受理时的**入站信封**、
由正文推出哪几项属性声明——以及一个值不合这些形状时，**拒绝值叫什么**。

它是一份**数据契约**：没有操作、没有提交点、没有状态转移，**因此不需要插件**。
它把 `data.asset-model` v1 里 connector 那一支的不透明正文（那边的 [G-7](../../asset-model/v1/contract.md#八已知缺口)）填实，
并给受理一侧一个**外部内容在交接那一刻长什么样**的共同定义。

**它不拥有**：

| 不拥有 | 归谁 |
|---|---|
| 连接件的**接入端**：活着收外部消息、按持有连上对面、把信封交给受理的那一次交接 | 本程不立（[G-5](#十已知缺口)） |
| **受理**：信封怎样成为入站到达与一条消息、去重、具名拒绝、目标会话存不存在与进不进得去 | PF-014 的受理那一侧（契约未立） |
| 三项设置、两项权限在各格上的值怎样合成 | `capability.asset-evaluation` |
| 持有与配值的写面，含鉴权绑定怎样被配上 | `capability.asset-governance` |
| 资产记录、正文外壳、保留项 `disabled`、凭据引用的形状 | `data.asset-model` v1 |
| 消息与块 | `data.messages` v1、`data.content-blocks` v1 |
| 外部渠道的 SDK、协议、「这条该不该送进来」的过滤规则 | 连接件的实现 |
| 凭据本体的存储、加密与续期 | 提供者设计 |

### 消费者

| 消费者 | 消费什么 |
|---|---|
| `data.asset-model` v1 | connector 那一支的 `body` 就是 [`ConnectorDefinition`](#s-1-连接件正文)（**一项对齐**，见[验证入口](../verification.md#对齐义务)） |
| `capability.asset-evaluation`（同程） | [S-11](#s-11-推出规则)～[S-13](#s-13-两项权限) 推出的声明——**本版判不出来**，停在缺口 |
| `capability.asset-governance`（同程） | [S-2](#s-2-鉴权绑定不在正文里)、[S-12](#s-12-鉴权绑定那一项)：鉴权绑定只作为持有上的配值写入 |
| 受理（PF-014，契约未立） | [S-5](#s-5-入站信封)～[S-10](#s-10-信封里的文本不是命令)、[S-14](#s-14-没有读取面也没有管理面)、[S-15](#s-15-送进来的就要被处理) |
| 连接件接入端（未立） | [S-3](#s-3-来源标识)～[S-8](#s-8-信封不带归属)：它产出信封 |
| 设置页（PF-002 §6.1，无契约） | [S-11](#s-11-推出规则)：一份连接件有哪几项可配 |

> 上表没有一行是本契约的依赖：方向一律是消费者 → 本契约，登记在各消费者自己的 catalog 条目里。

## 二、含义与使用范围

**适用范围**：一个部署之内。本版完整交付是单机，但每一条的**领域语义在跨进程之后必须原样成立**；
哪些结论在单机由装配给出、分布式后必须由协议重新兑现，列在[第六节](#六装配给与协议给)。

### 规格层 token 与词条的对应

交换表示用 token，对外文档用词条名，**两者不得互相替代**。

| 规格层 token | 词条 |
|---|---|
| `ConnectorDefinition` | [连接件 · Connector](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-connector--连接件--connector) 一份资产记录的正文 |
| 连接件的身份 `{ category: "connector", name }` | [能力标识 · Capability Identifier](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)（形状归 `data.asset-model/v1#S-3`） |
| `InboundEnvelope` 被受理之后成为的那条事实 | [入站到达 · Inbound Arrival](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival) |
| 信封落成的那一条 | [消息 · Message](../../../../ubiquitous_language/terms/record-and-context.md#ul-message--消息--message) 的 `UserMessage` |
| `DeliveryTarget.session` 指的那一个 | [会话 · Session](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-session--会话--session) |
| `credential` 那一项的值指向的那一份 | 凭据本体（MCP 那一类的词条是 [MCP 凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)；连接件这一份**无词条**） |

**下列是规格层的名字或无词条的概念**，本契约与 Schema 里**不给它们「中文 · English」那种词条式标题**：
`ConnectorDefinition`（连接件正文）、`SourceIdentity`（来源标识）、`DeliveryTarget`（投递目标）、`InboundEnvelope`（**入站信封，无词条**）、
`channel`、`externalAccount`、`externalId`、`receivedAt`。「来源标识」「鉴权绑定」是 PF-002 给连接件列的设置的名字，**不是词条**；「投递目标」已由词条批立为词条（正式名即此，链接待合流后补）。

### 与相近概念的差异

- **来源标识 ≠ 连接件的身份。**身份是能力标识；来源标识是一项设置的值。换一个来源标识不产生另一个连接件，同一个来源标识也可以出现在两份连接件上（[S-3](#s-3-来源标识)）。
- **投递目标 ≠ 往那个会话里送的资格。**它是指认，能不能送由受理现判（[S-4](#s-4-投递目标)）。
- **入站信封 ≠ 入站到达 ≠ 消息。**信封是交上来的那一份；**受理的那一刻**它才成为一条入站到达；进了队列的那一条到达落成一条消息（[S-5](#s-5-入站信封)、[S-9](#s-9-信封落成一条用户消息)）。
- **鉴权绑定 ≠ 凭据 ≠ 外部账号。**鉴权绑定是持有上的一项设置，它的值是凭据引用；引用不是凭据本体；`externalAccount` 说的是以哪个账号接进来，**不证明任何事**（[S-3](#s-3-来源标识)、[S-12](#s-12-鉴权绑定那一项)）。
- **`externalId` ≠ `MessageId`。**前者是外部那一侧的说法，只用来认「同一件事」；后者是落成的消息在会话日志里的标识（[S-6](#s-6-externalid-是同一件事的说法)）。
- **`receivedAt` ≠ 次序。**先后由会话日志给出（[S-7](#s-7-receivedat-不是次序也不是身份)）。
- **本契约的[推出规则](#s-11-推出规则) ≠ [属性投影](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-attribute-projection--属性投影--attribute-projection)。**前者从正文推出「有哪几项」；后者是一格的设置或权限作为视图算出来的样子。

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `ConnectorDefinition` | 一份连接件的正文 | [S-1](#s-1-连接件正文)、[S-2](#s-2-鉴权绑定不在正文里) |
| `SourceIdentity` | 从外面哪一处、以哪个账号收消息 | [S-3](#s-3-来源标识) |
| `DeliveryTarget` | 送进哪一个会话 | [S-4](#s-4-投递目标) |
| `InboundEnvelope` | 交给受理的那一份 | [S-5](#s-5-入站信封)～[S-10](#s-10-信封里的文本不是命令) |

### S-1 连接件正文

**`ConnectorDefinition` 是一份连接件资产的正文：`{ source, target }`，两个成员都必填，成员集合闭合。**

- 它填的是 `data.asset-model/v1` 的 [S-10](../../asset-model/v1/contract.md#s-10-八类正文的外壳) 那张表里 `connector` 那一行的 `body`；
  外壳的判别（`category`）、这份资产的身份（`capability`）、所有者与版本线**仍归那份契约**。
- **`source` 与 `target` 是作者给的默认值**：它们是由正文推出的 `source`、`target` 两项设置的 `default`（[S-11](#s-11-推出规则)）——
  设置层序最外一格的值，不论这份资产是不是 official（`data.asset-model/v1#S-12`）。持有它的组织格、租户格可以**各配各的值**；
  两项都是[落点与身份类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)，**工作区格配不了**（`data.asset-model/v1#S-20`），
  工作区自己带来的连接件，这两项就是它正文里的这一份。
- **正文里没有名字字段**：身份只在 `AssetDefinition.capability`。
- **正文里没有鉴权绑定**（[S-2](#s-2-鉴权绑定不在正文里)），**也没有权限项的值**——权限的值在各格的配值上。

### S-2 鉴权绑定不在正文里

**正文不带任何凭据引用。`ConnectorDefinition` 上出现 `credential`（或任何别的成员）即 `malformed`。**
[鉴权绑定](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector)只作为**持有上的一项配值**存在（[S-12](#s-12-鉴权绑定那一项)）。三条理由：

1. **产品正文把它放在持有上**：「接的是对面哪个账号（鉴权绑定），是持有上的一项落点与身份类设置」；
   同一个人在两个租户下[各配各的](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)，**一份持有一份值，不跨租户身份共用**。
2. **凭据引用只在它被配上去的那一份持有上有效**（`data.asset-model/v1#S-23` 第 4 条）。正文不是一份持有，写在正文里的引用没有一份持有可以依附。
3. **正文跟着记录走**：一份记录的正文被**每一份持有它的格**读到，组织资产会被[分享](../../../../product/PF-003-asset-transfer-and-sharing/design.md#610-分享给的是获权不是拥有)到别的组织，
   租户资产会被[复制](../../../../product/PF-003-asset-transfer-and-sharing/design.md#64-可复制的对象)到别的组织。写在正文里的凭据引用会跟着到那些租户身份与组织手里——那正是「不跨租户身份共用」要挡的。

**这一条偏离了起草账本**（账本的正文带可选的 `credential`），**待主线确认**：[G-1](#十已知缺口)。

### S-3 来源标识

**`SourceIdentity = { channel, externalAccount }`：连接件从外面哪一处收消息、以哪个账号接进来。**

| 成员 | 含义 |
|---|---|
| `channel` | 外部那一侧的**渠道**：哪个服务里的哪一处（一个频道、一个收件箱、一条订阅） |
| `externalAccount` | 连接件在外部那一侧**以哪个账号**接进来——[连接件是以对面服务的某一个账号接进来的](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector) |

- **两个分量都必填**，交换表示按 `data.identity-values/v1` 的 [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)：
  非空、首尾不属于那个显式空白码点集合、**逐码点相等**。它们是**外部那一侧的字面值**：本系统不解析、不规范化、不改写；词法归外部那一侧。
- **`channel` 是空串**，拒绝值是 **`channel_empty`**；其余违例（含 `externalAccount` 为空串、任一分量首尾有空白）是 `malformed`（[S-18](#s-18-表示层拒绝值)）。
- **相等**：两个分量都逐码点相等。
- **它不是连接件的身份。**[「用什么协议、凭据长什么形状、接的是对面哪个账号」都不是身份](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector)——身份是能力标识。
- **它不是资格，也不指认归属**（`data.identity-values/v1#S-34`：地址不是身份）：
  **任何一方不得从来源标识反查持有、租户或会话。**两个租户身份完全可以接同一个外部渠道、甚至同一个外部账号——
  [同一个人在两个租户下各配一个接同一服务的连接件](../../../../product/PF-002-assets-settings-and-permissions/acceptance.md#一可观察场景)是验收场景。
- **`externalAccount` 是陈述，不是证明**：真正让对面认这个连接件的是鉴权绑定（[S-12](#s-12-鉴权绑定那一项)）。
  两者说的是不是同一个账号，本契约判不了——凭据的值永不呈现；由谁核、核不上怎么收，见 [G-5](#十已知缺口)。

### S-4 投递目标

**`DeliveryTarget` 按 `kind` 判别，本版恰一支：`{ kind: "session", session }`——送进来的消息投进哪一个会话。**

- `session` 是 `data.messages/v1` 在 [S-24](../../messages/v1/contract.md#s-24-别的会话捎话与到点了) 定义的 `SessionRef`：一个会话的不透明指认。它的家在会话那一侧，见 [G-8](#十已知缺口)。
- **`kind` 集合闭合**：出现了但不是 `session`（含大小写不同、不是字符串）是 **`target_unknown`**；缺席是 `malformed`。
- **`target_unknown` 只是「表示层判别不出是哪一种目标」**。
  指的会话**不存在、已归档、或以处理身份进不去**，都**不是**表示层的事：[送不进任何会话的东西，在受理这一步就被具名拒绝](../../../../product/PF-014-inbound-intake-and-queueing/design.md#入站到达)——
  那个拒绝值归受理，**本契约不给它们取名，也不把它们算成 `target_unknown`**。
- **它只是指认，不是资格。**能不能往那个会话里送，受理按[「他能不能访问这个会话」](../../../../product/PF-014-inbound-intake-and-queueing/flows.md#四角色与操作)判——这里的「他」是[处理身份](#s-13-两项权限)，
  会话持有[创建那一刻的租户身份](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#612-会话持有创建那一刻的租户身份)，**跨租户默认拒绝**。
- **投递目标是持有上的一项设置，外部送来的内容选不了它**：信封里没有目标（[S-8](#s-8-信封不带归属)）。
- **本版只有「指定一个会话」这一支**：每条外部消息各开一个会话、按外部的会话或线程分会话——产品正文都没说，见 [G-3](#十已知缺口)。**不为它们预留分支**。

### S-5 入站信封

**`InboundEnvelope` 是连接件把一条外部消息交给受理时的那一份：`{ externalId, receivedAt, text?, attachments?, source }`。**

| 成员 | 必填 | 含义 |
|---|---|---|
| `externalId` | 是 | 外部那一侧给这条消息的标识（[S-6](#s-6-externalid-是同一件事的说法)） |
| `receivedAt` | 是 | 连接件从外部收下它的那一刻（[S-7](#s-7-receivedat-不是次序也不是身份)） |
| `text` | 否 | 这条外部消息的文本，**原样**；给出时非空 |
| `attachments` | 否 | 它带的附件，每一项是一个 `AttachmentRef`（`data.content-blocks/v1#S-21`）；给出时非空，**次序有意义、原样保留** |
| `source` | 是 | 从哪一处、以哪个账号收下的（[S-3](#s-3-来源标识)） |

1. **`text` 与 `attachments` 至少给一样**：两样都缺席，拒绝值是 **`envelope_empty`**——一份什么内容都没有的信封不是一条外部消息。
2. **「没有」只有缺席一种写法**：`text: ""` 与 `attachments: []` 是 `malformed`。**一个含义只留一种写法**，否则「空串算不算有文本」在两个实现里会有两个答案。
3. **文本原样**：不裁剪、不做 Unicode 规范化、不解析、不改写；只含空白的文本也是文本。
4. **附件引用是地址，不是资格**（`data.content-blocks/v1#S-23`）：信封交上来时，字节已经在那个存储里；
   谁能读由存储的 owner 按调用方的租户身份现判，那个 owner 尚未定义（`data.content-blocks` v1 的 [G-1](../../content-blocks/v1/contract.md#八已知缺口)）。
5. **成员集合闭合**：没有归属（[S-8](#s-8-信封不带归属)）、没有「这是命令」（[S-10](#s-10-信封里的文本不是命令)）、没有「要不要处理」（[S-15](#s-15-送进来的就要被处理)）。
6. **它还不是入站到达**：受理之前它只是交上来的一份，东西送到了不等于被受理；[受理的那一刻](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival)它才成为一条入站到达。

### S-6 externalId 是「同一件事」的说法

**`(source, externalId)` 是连接件对「这是哪一件外部的事」的说法：两份信封的 `source` 相等（[S-3](#s-3-来源标识)）且 `externalId` 逐码点相等，连接件断言它们说的是同一件事；任一不等，它断言是两件。**

- **相等的范围是同一个来源标识**：外部系统给消息的标识往往只在一个渠道之内唯一，跨渠道相同的 `externalId` 不是同一件事（规格层推导）。
- `externalId` 的交换表示按 `data.identity-values/v1#S-31`，是外部那一侧的字面值，**不解析**——不从中读时间、次序或渠道。
- **义务在连接件一侧**：同一件外部的事重投多少次，`externalId` 都不变。**不得在本地现铸**——每次重投换一个号，受理就无从认出重复，[同一件事会被做两遍](../../../../product/PF-014-inbound-intake-and-queueing/design.md#63-去重只认来源说得出的那个同一件事)。
- **本条只给出那个说法**：去重怎么判、在什么范围里判（同一个会话？同一份持有？）、判重之后留什么痕，**归受理**（PF-014 §6.3）。
- **外部消息被编辑之后算不算同一件事**，产品正文未述：[G-7](#十已知缺口)。
- 它**不是** `MessageId`：信封落成的消息另有自己的标识（`data.messages/v1#S-3`），**不从 `externalId` 派生**。

### S-7 receivedAt 不是次序，也不是身份

**`receivedAt` 是连接件从外部收下这条消息的那一刻**，按 `data.offer-expiry/v1` 的 [S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围) 的 `Instant` 表示。
它**不是**外部那一侧发出它的时刻，也**不是**受理它的时刻。

- **它不是次序。**送进一个会话的东西孰先孰后，由会话日志给出；两份信封的 `receivedAt` 相同或倒挂都合法——
  [时间戳顺序与因果先后分别表达](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段)。
- **它不是身份**：不参与 [S-6](#s-6-externalid-是同一件事的说法) 的相等，不参与去重。
- 它是给人看、给追溯用的一个事实；**任何判定都不读它**。

### S-8 信封不带归属

**信封上没有租户身份、没有持有、没有连接件的能力标识、没有投递目标、没有会话、没有处理身份。带了任何一样即 `malformed`。**

- **信封里的每一样都出自外部那一侧。**归属若写在信封里，外部内容就能改写它——换一个租户、换一个会话、换一种处理身份。
- **它们由把信封交给受理的那一次交接显式携带**：这份信封经哪一份持有来（从而是哪个连接件、哪一格、哪个租户身份）、投进哪一个会话、按什么身份处理——
  **每一样都显式给出**（`data.identity-values/v1` 的 [S-16](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)），**没有默认值**（[S-17](../../identity-values/v1/contract.md#s-17-身份参数没有默认值)）。
  那次交接的契约**本程未立**：[G-5](#十已知缺口)。
- **由此对消费者**：不得从信封的任何成员推归属——不读 `source`、不读 `externalId`、不读正文、不读附件引用的键。

### S-9 信封落成一条用户消息

**一份被受理、进了队列的信封，落成恰好一条 `UserMessage`**（`data.messages/v1#S-8`；[PF-014 §5.7](../../../../product/PF-014-inbound-intake-and-queueing/design.md#57-穷举一什么会让队列从空变成非空)）。
**落成它的是受理那一方**；本条是那一方必须守的四条：

1. **文本原样成为一块文本块，不带来源标记**：来源标记的两个取值都出自人敲的斜杠命令（`data.content-blocks/v1#S-8`），外部送来的文本不是。
2. **每一个附件引用原样出现在这条消息里**：引用不变、次序不变、不丢一个。**落成哪一类块**（文件块，还是按媒体类型落成图块、语音块的引用形状）归受理那一方——[G-6](#十已知缺口)。
3. **`externalId`、`receivedAt`、`source` 不进消息**：消息的成员集合是闭合的（`data.messages/v1#S-2`）。它们是这条入站到达的[来源](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival)，那条记录的形状未立（[G-5](#十已知缺口)）。
4. **一份信封一条消息**：不拆成两条，也不与别的信封并成一条（规格层推导：[S-6](#s-6-externalid-是同一件事的说法) 的「同一件事」要能对到恰好一条）。

被去重掉、被拦下、被具名拒绝的信封**不落成消息**；它们留什么痕，归受理（[PF-014 §6.1](../../../../product/PF-014-inbound-intake-and-queueing/design.md#61-先落账再谈别的)）。

### S-10 信封里的文本不是命令

**信封里的文本原样是内容**——哪怕它以 `/` 开头、恰好是这个会话认得的某个命令名。

- [只有经交付面送进来的输入才被识别成命令](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)；连接件不经交付面（[PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走)）。
- **受理不对信封里的文本做斜杠命令识别**；由此，**一条外部消息触发不了任何系统业务流程**。
- 信封里没有「这是一条命令」的成员（[S-5](#s-5-入站信封) 第 5 条）。

理由是产品正文的原话：连接件送来的是**别人的话**，照命令去执行，就等于让一个外部来源替人触发系统流程。

## 四、属性声明的推出规则

### S-11 推出规则

**`data.asset-model/v1#S-12` 要每一份正文契约给出一条推出规则 `声明(正文) → AttributeDeclaration[]`。连接件的这一条是：**

| `item` | `kind` | `category` | `domain` | `default` | 依据 |
|---|---|---|---|---|---|
| `source` | `setting` | `placement_identity` | `{ "kind": "open", "schema": { "$ref": "<本 Schema 的 $id>#/$defs/SourceIdentity" } }` | 正文的 `source` | PF-002：来源标识 |
| `target` | `setting` | `placement_identity` | `{ "kind": "open", "schema": { "$ref": "<本 Schema 的 $id>#/$defs/DeliveryTarget" } }` | 正文的 `target` | PF-002：投递目标 |
| `credential` | `setting` | `placement_identity` | 凭据引用或「未绑」——**「未绑」这个取值本版没有名字**（[G-2](#十已知缺口)） | 「未绑」（[G-2](#十已知缺口)） | PF-002：鉴权绑定；[S-12](#s-12-鉴权绑定那一项) |
| 能不能安装（**名字未定**） | `permission` | — | **取值未定**（[G-4](#十已知缺口)） | 未定 | PF-002：能不能安装；[S-13](#s-13-两项权限) |
| 送进来的消息按什么身份处理（**名字未定**） | `permission` | — | **取值未定**（[G-4](#十已知缺口)） | 未定 | PF-002：送进来的消息按什么身份处理；[S-13](#s-13-两项权限) |

- **前三项的项名取账本给正文的成员名**（`source`、`target`、`credential`）：正文的成员就是那一项的默认值，一项一个名字。后两项账本没有名字，**不自造**。
- 它满足那四条义务里定得下来的部分：**是正文的确定函数**（前两项的 `default` 取自正文，其余与正文无关）；**`item` 互不相同**；
  **不产出 `disabled`，也不产出治理类的项**——[「启用与否」就是 `disabled` 那一项](../../asset-model/v1/contract.md#s-15-disabled-是保留项名)，由 `data.asset-model` 保留、每一份资产都有，本规则不声明它。
- **后三项在缺口上，所以本版整组声明判不出来。**消费者**停在缺口**：**不得把前两项当成连接件的全部属性项**，也不得替后三项补一个取值域或默认值——
  「推不出」是「判不出来」，**不是「没有这几项」**（与 `data.asset-model/v1#S-12` 对五类不透明壳的规矩相同）。
- **三项设置都是落点与身份类**：[PF-002 设置项分四类](../../../../product/PF-002-assets-settings-and-permissions/design.md#设置项分四类资产声明每一项时必须标类别)那张表把「Connector 的来源标识、投递目标与鉴权绑定」点名列在这一类。
  **工作区格一项都配不了**（`data.asset-model/v1#S-20`）——一个仓库改不了连接件从哪收、往哪送、以谁的名义接。

### S-12 鉴权绑定那一项

**鉴权绑定是持有上 `credential` 那一项配值；它的值是一个凭据引用（`data.asset-model/v1#S-23`），不是凭据本体。**

- **一份持有一份值，不跨租户身份共用**：同一个人在两个租户下各配各的，[接的可以是对面两个不同的账号](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector)。
- **同一个租户身份要接同一个服务的两个账号，就是两份 name 不同的连接件**：同一身份在同一格对同一个能力标识只有一份持有、一份配值（`data.asset-model/v1#S-18`）。
- **它不在正文里**（[S-2](#s-2-鉴权绑定不在正文里)），**不从工作区来**（[S-11](#s-11-推出规则)），**不作为呈现内容**（`data.asset-model/v1#S-23` 第 5 条）。
- **「还没配」怎样作为一个显式取值进这一项的取值域、并作为它的 `default`**——`data.asset-model/v1#S-23` 第 2 条把这件事交给本契约；
  账本没有给这个取值一个名字，**本版不自造**：[G-2](#十已知缺口)。它**不是**一个真凭据，**也不是**缺席。
- **组织格能不能配这一项**，产品正文只对 MCP 凭据问过（[PF-002 §九](../../../../product/PF-002-assets-settings-and-permissions/design.md#九未决项)），连接件没问：[G-4](#十已知缺口)。**两种答案下本条的形状都不变。**

### S-13 两项权限

**连接件自带两项权限：「能不能安装」与「送进来的消息按什么身份处理」**（[PF-002 §4 Connector](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector)）。
按 `data.asset-model/v1#S-12`，它们是 `permission` 类的项、不带类别、取值域是一个枚举。**项名、取值与默认值，产品正文与账本都没给**：[G-4](#十已知缺口)。

- **「送进来的消息按什么身份处理」是租户隔离在入口处的那一道**：外部消息进了系统就要被某个身份承接，
  [不定这一项，租户隔离会在入口处破掉](../../../../product/PF-002-assets-settings-and-permissions/decisions.md#设置项为什么分这四类)（PF-002 decisions「PM 推导」表的 rev 2 一行）。
- **它判不出来的时候，没有默认身份**：受理**不得**拿持有它的那一格、目标会话的租户身份、「当前租户」或任何环境值顶上
  （`data.identity-values/v1#S-17`）。判不出来就不放行；那次失败叫什么，归受理。
- 它**不是信封上的一个成员**（[S-8](#s-8-信封不带归属)）：外部内容说自己是谁，不算数。

## 五、只送消息进来

### S-14 没有读取面，也没有管理面

**[连接件只能送消息进来](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector)：接进来的东西不因此获得读取本系统数据或改变本系统配置的资格。**
落到本契约上，就是：**连接件交给本系统的只有入站信封，而一份信封能成为的只有一条排在队尾的用户消息。**
下表是它**借本契约的任何值都得不到的东西**——**这是一张「不承诺」表**，每一行都是一个本契约里不存在的值或成员：

| 连接件想做的 | 本契约里有没有表示 | 依据 |
|---|---|---|
| 读会话日志、消息、资产、设置、别的会话 | **没有**：没有一个值承载「读」的请求或它的结果 | [PF-002 §4 Connector](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector)「没有数据读取面」 |
| 改配置、持有、配值，装卸资产 | **没有** | 同上「也没有管理面」 |
| 插队、取消、强制停止、把一次工具执行切到后台、中断一次工具执行 | **没有**：信封只能落成一条进队尾的消息（[S-9](#s-9-信封落成一条用户消息)），不是[控制指令](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-control-command--控制指令--control-command) | [PF-014 flows §四](../../../../product/PF-014-inbound-intake-and-queueing/flows.md#四角色与操作)：外部来源「能做的到此为止：把一条消息放进队尾」 |
| 答一张决策卡片 | **没有**：信封不是答复 | 同上 |
| 触发一条系统业务流程 | **没有**：文本原样是内容（[S-10](#s-10-信封里的文本不是命令)） | [PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) |
| 选投进哪个会话、按什么身份处理 | **没有**：信封不带归属（[S-8](#s-8-信封不带归属)）；两者是持有上的设置与权限（[S-4](#s-4-投递目标)、[S-13](#s-13-两项权限)） | PF-002 §4 Connector |
| 让受理「收下但不处理」 | **没有**（[S-15](#s-15-送进来的就要被处理)） | [PF-014 §6.2](../../../../product/PF-014-inbound-intake-and-queueing/design.md#62-送进来的就要被处理要不要送进来归连接件) |
| 替受理决定去不去重 | **没有**：它只给出「同一件事」的说法（[S-6](#s-6-externalid-是同一件事的说法)） | [PF-014 §6.3](../../../../product/PF-014-inbound-intake-and-queueing/design.md#63-去重只认来源说得出的那个同一件事) |

- **这张表不是一道运行时检查的清单**：这些东西在本契约里**根本没有表示**，所以一份合法的信封带不进来；多出的成员在表示层就被拒（[S-18](#s-18-表示层拒绝值)）。
- **「没有管理面」也约束系统一侧**：连接件的接入端在本系统里能调用的，只有「交一份信封」这一个动作——
  前身把「零管理面」只落在客户端 SDK 上，服务端仍给执行者开了暂停、恢复、退役的端点（研究 `connector-and-slash-command-sources` 的对照表）。
  **那一个动作的契约本程未立**（[G-5](#十已知缺口)）；本表是它将来必须守的上界。

### S-15 送进来的就要被处理

**信封上没有「要不要处理」「要不要叫醒」这类成员：交上来的每一份信封，受理之后都进队列，和用户自己说的那一句一视同仁**（[PF-014 §6.2](../../../../product/PF-014-inbound-intake-and-queueing/design.md#62-送进来的就要被处理要不要送进来归连接件)）。

- **过滤在连接件那一侧、在一份信封形成之前**：「这条外部消息该不该惊动 agent」连接件知道（有没有 @ 我、是不是我关心的渠道），受理面不知道。
  **信封一旦交上来，就不再有「这条其实不重要」的说法。**
- **代价**：接一个吵闹的来源而连接件那一侧没配过滤，就会真的起运行、真的花钱——那是连接件那一侧的缺口，**在信封上加一个开关补不上它**。

## 六、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变的保证**——单机由装配（同一进程、同一台宿主、同一个存储）顺带给出的那些；
> 右列写分布式后**必须由协议重新兑现什么**，以及**做不到会怎样**。不在表里的条款在任何部署形态下一律成立，**不在表里不等于不适用**。
> **这张表是契约的一部分，不是流程笔记**：装配给的那些，演化到分布式时不会自动成立。

| 保证 | 单机由谁给 | 分布式必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **信封与它的持有、租户身份、目标、处理身份绑在一起**（[S-8](#s-8-信封不带归属)） | 接入端在同一进程里，带着它那一份持有的上下文把信封交给受理 | 交接协议**显式携带**持有、租户身份、目标与处理身份，并**认证接入端**；不得单独传信封、再在对端按 `source` 补归属 | 一条外部消息落进另一个租户的会话，或以另一个身份被处理——**没有任何报错** |
| **同一件外部的事，重投时 `externalId` 不变**（[S-6](#s-6-externalid-是同一件事的说法)） | 一个接入端实例 | 多个接入端副本收到同一条外部消息时，`externalId` **取自外部那一侧**，不在各副本本地现铸 | 同一件事被处理两遍、起两次运行、花两遍钱 |
| **附件引用可被受理那一侧解引用，且解引用受租户判定**（[S-5](#s-5-入站信封) 第 4 条） | 本机存储 | 同 `data.content-blocks` v1 [第四节](../../content-blocks/v1/contract.md#四装配给与协议给)「引用可解引用」那一行 | 悬空引用：消息落了，附件读不到；或读到另一个租户的字节 |
| **外部内容选不了目标、选不了身份**（[S-4](#s-4-投递目标)、[S-13](#s-13-两项权限)、[S-14](#s-14-没有读取面也没有管理面)） | 目标与身份在同一进程里从持有的配值求出 | 跨节点传递的只有信封与交接协议里显式的那几样；**不存在一条路径让信封里的内容改写它们** | 一个外部发件人把消息投进他选的会话 |
| **表示层校验在每个接收边界重做**（[S-18](#s-18-表示层拒绝值)） | 交给受理前一次校验 | 每个接收边界各自重验，不信任上游「已校验过」 | 一份带了租户字段的信封被远端收下，归属被外部内容改写 |

## 七、表示与边界校验

### S-16 规范表示

- **规范表示**：[`connector.schema.json`](connector.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/connector/v1/connector.schema.json`
- **定义项（4 项）**：`ConnectorDefinition`、`SourceIdentity`、`DeliveryTarget`、`InboundEnvelope`。
  消费者 `$ref` 这些定义，**不复制一份同义类型**。**根模式不约束任何文档**：本文件是共享定义的登记处。
- **成员名一律 camelCase**，枚举值一律 snake_case 字符串；判别成员：`DeliveryTarget` 用 `kind`。
- **外部引用**：`SessionRef` 取自 `data.messages/v1`；`AttachmentRef` 取自 `data.content-blocks/v1`；`Instant` 取自 `data.offer-expiry/v1`。
  三个外部标识（`channel`、`externalAccount`、`externalId`）按 `data.identity-values/v1#S-31` 的散文写出 pattern，**不跨契约 `$ref` 它的 `OpaqueIdentifier`**。
- **推出的属性声明（[S-11](#s-11-推出规则)）不是本文件的定义项**：它是一条规则，产出 `data.asset-model` 的 `AttributeDeclaration`。
- **正反实例**：[`examples.md`](examples.md)。它是本版的规范工件，不是说明材料。

### S-17 判别式闭合

**`DeliveryTarget.kind` 是一个闭合集合，本版只有 `session`，没有「其他」。**
未知取值**一律作表示非法拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、**不得**忽略该成员继续——
一个认不出的目标被当成「某个会话」，就是替外部内容选了一个会话。

### S-18 表示层拒绝值

**一个值不合本契约的形状时，拒绝值恰为下面四个之一，集合闭合：**

| 拒绝值 | 什么时候 | 条款 |
|---|---|---|
| `target_unknown` | 某个投递目标的 `kind` 出现了，但不是 `session`（大小写不同、不是字符串也算不是） | [S-4](#s-4-投递目标)、[S-17](#s-17-判别式闭合) |
| `channel_empty` | 某个来源标识的 `channel` 恰是空串 `""` | [S-3](#s-3-来源标识) |
| `envelope_empty` | 一份信封里 `text` 与 `attachments` **两个成员都缺席** | [S-5](#s-5-入站信封) |
| `malformed` | 其余一切不合形状：缺必填成员（含 `kind` 缺席）、多出成员（含正文上的 `credential`、信封上的任何归属或标志）、类型不对、`text` 为空串、`attachments` 为空数组、任一外部标识首尾有空白或为空（`channel` 为空串除外）、嵌着的 `SessionRef`／`AttachmentRef`／`Instant` 不合它们各自的契约。**判据只有一条**：不合 Schema；上面只是举例 | 各条 |

**一份输入里有多处违例时，拒绝值取其中优先级最高的那个**，次序固定：

```text
target_unknown  >  channel_empty  >  envelope_empty  >  malformed
```

这个次序让两个实现对同一份输入给出**同一个**拒绝值，与遍历次序无关；越靠前越说明这份值在根上不可读——
认不出往哪送、说不出从哪来，就谈不上里面装了什么。**`malformed` 是剩余项，不是「其他」**：它有确定的判据，只是不再细分。

- **嵌着的值用哪个名字**：一份信封里嵌着的 `AttachmentRef` 不合 `data.content-blocks` v1 的形状，在本契约里是 `malformed`——
  那份契约的 [S-26](../../content-blocks/v1/contract.md#s-26-表示层拒绝值) 对 `AttachmentRef` 本身只有 `malformed` 一种拒绝，本契约不改名、不细分。`SessionRef`、`Instant` 同理。
- **本契约的值嵌在别人的值里时**（一份 `AssetDefinition` 的 connector 正文），拒绝值怎样落进那份契约的闭合集合，**归那份契约**（`data.asset-model/v1#S-27`；[对齐义务](../verification.md#对齐义务)）。
- 拒绝值怎样落进各个操作自己的失败集合（交接、受理、写面），归那些契约；**它们引用本条的名字，不另起一套同义值**。

### S-19 表示层拒绝不是判定，也不修补

- **表示非法的输入在进入任何判定之前被拒绝。**这次拒绝**不表示**「这条外部消息不存在」「这个来源没有资格」，也**不得被记成一次受理的结论**——
  与 `data.identity-values/v1` 的 [S-33](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开) 是同一条规矩。
- **不修补、不降级、不尽力而为**：不裁掉 `channel` 首尾的空白、不把空串 `text` 当作缺席、不丢掉坏的那一个附件引用留下其余的、
  不把大写的 `Session` 当成 `session`、不丢掉正文上的 `credential` 收下其余。**修补等于替写入方做了一个它没做的决定。**
- **表示合法不表示任何资格**：Schema 校验通过只说明形状合规——不说明投递目标指的会话存在或进得去、不说明附件可读、不说明这个来源可信。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 管不到的那部分归谁 |
|---|---|---|
| [S-1](#s-1-连接件正文)、[S-2](#s-2-鉴权绑定不在正文里) | **管得到**：两个成员必填、成员闭合（`credential` 带了即拒） | 两项是默认值、正文跟着记录走——那是含义，归 `data.asset-model` 与求值 |
| [S-3](#s-3-来源标识) | **管得到**：两个分量必填、非空、首尾无空白 | 拒绝值是 `channel_empty` 还是 `malformed` 由 [S-18](#s-18-表示层拒绝值) 定；「不得反查归属」「`externalAccount` 与凭据一致」管不到 |
| [S-4](#s-4-投递目标)、[S-17](#s-17-判别式闭合) | **管得到**：一支、闭合 | 会话存在、进得去——受理 |
| [S-5](#s-5-入站信封) | **管得到**：必填、至少一样内容、非空、成员闭合 | 附件可读——存储 owner |
| [S-6](#s-6-externalid-是同一件事的说法)、[S-7](#s-7-receivedat-不是次序也不是身份) | 只管形状 | 重投不变、不现铸——连接件；去重——受理；不按 `receivedAt` 排序——消费者 |
| [S-8](#s-8-信封不带归属) | **管得到**「信封上没有」 | 交接显式携带——那份未立的契约（[G-5](#十已知缺口)） |
| [S-9](#s-9-信封落成一条用户消息)、[S-10](#s-10-信封里的文本不是命令) | **管不到**：都是受理的行为 | 受理 |
| [S-11](#s-11-推出规则)～[S-13](#s-13-两项权限) | **管不到**：推出规则是一条规则 | 求值；本版判不出来 |
| [S-14](#s-14-没有读取面也没有管理面)、[S-15](#s-15-送进来的就要被处理) | 管「信封上没有那些成员」 | 接入端只有一个动作——那份未立的契约 |

**非法输入的含义**：Schema 校验失败 ⇒ 该输入**不是**本契约的一个值 ⇒ 按 [S-18](#s-18-表示层拒绝值) 取拒绝值、按 [S-19](#s-19-表示层拒绝不是判定也不修补) 收场。
本契约**没有** Schema 通过而仍属表示非法的单值约束；上表「管不到」那一列都是别的 owner 的行为或判定。

## 八、性质与场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 连接件正文不含凭据引用；鉴权绑定一份持有一份，不跨租户身份共用 | 安全 | [PF-002 §4 Connector](../../../../product/PF-002-assets-settings-and-permissions/design.md#connector) · `data.asset-model/v1#S-23` | Schema（[S-2](#s-2-鉴权绑定不在正文里)）＋ 写面（[S-12](#s-12-鉴权绑定那一项)，`capability.asset-governance`） | 一个租户接进来的外部账号，出现在另一个租户或另一个组织的连接件上 |
| P-2 | 来源标识与投递目标都不是身份，也不是资格 | 安全 | [PF-002 身份是类别＋name](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) · `data.identity-values/v1#S-34` | 消费者与受理（[S-3](#s-3-来源标识)、[S-4](#s-4-投递目标)） | 两个租户接同一个外部渠道，一边的消息按另一边的持有处理；或拿着一个会话指认就送进去了 |
| P-3 | 信封不带归属；归属由交接显式携带、没有默认值 | 安全 | SYS-TENANT · `data.identity-values/v1#S-16`、`#S-17` | Schema（信封上没有）＋ 交接（[S-8](#s-8-信封不带归属)，[G-5](#十已知缺口)） | 外部内容写了一个租户字段，消息落进了那个租户的会话 |
| P-4 | 信封里的文本不被识别成命令，触发不了系统业务流程 | 安全 | [PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) · [PF-014 §5.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#510-斜杠命令在受理时分两路走) | 受理（[S-10](#s-10-信封里的文本不是命令)） | 外部来源替人压缩了上下文、重载了装配 |
| P-5 | 连接件能让本系统做的只有一件事：把一条消息放进队尾 | 安全 | PF-002 §4 Connector · [PF-014 flows §四](../../../../product/PF-014-inbound-intake-and-queueing/flows.md#四角色与操作) | 本契约的值集合（[S-14](#s-14-没有读取面也没有管理面)）＋ 接入端只有一个动作（[G-5](#十已知缺口)） | 外部来源插了队、打断了运行、读到了会话日志 |
| P-6 | 交上来的信封没有「收下但不处理」 | 不变量 | [PF-014 §6.2](../../../../product/PF-014-inbound-intake-and-queueing/design.md#62-送进来的就要被处理要不要送进来归连接件) | Schema（[S-15](#s-15-送进来的就要被处理)） | 日志里出现一条「不算待处理」的外部消息 |
| P-7 | `(source, externalId)` 是「同一件事」的唯一说法；同一件事重投时它不变 | 不变量 | [PF-014 §6.3](../../../../product/PF-014-inbound-intake-and-queueing/design.md#63-去重只认来源说得出的那个同一件事) | 连接件（[S-6](#s-6-externalid-是同一件事的说法)）；去重归受理 | 同一条外部消息起了两次运行 |
| P-8 | 缺席不补、表示非法即拒、拒绝值唯一 | 安全 | SYS-SPEC | 每个接收边界（[S-18](#s-18-表示层拒绝值)、[S-19](#s-19-表示层拒绝不是判定也不修补)） | 两个实现对同一份坏信封报不同的拒绝值；或空串文本被当作缺席收下 |

**进展性质：本契约不拥有任何进展性质。**「交上来的信封最终被受理」「进了队列的最终被看到」归受理与 loop（[PF-014 §6.7](../../../../product/PF-014-inbound-intake-and-queueing/design.md#67-不漏不重)）。

**不建形式工件。**本契约没有状态转移；它的约束都是单个值的形状，Schema 与条款即可表达；唯一的跨值关系——[S-6](#s-6-externalid-是同一件事的说法) 的「同一件事」——是两个分量的相等，不需要结构模型去找反例。

### 规范场景

场景是本契约触发的证据形式；执行状态与结果在[验证入口](../verification.md)，不写进本版本目录。
每条给正例与反例，实例在 [`examples.md`](examples.md)。

#### S-20 空的渠道与空的信封

正例：一份只有 `text` 的信封、一份只有 `attachments` 的信封，都被接受。
反例一：来源标识的 `channel` 是 `""`——**`channel_empty`**；是 `"  "`——**`malformed`**（不是「空」，是首尾有空白），**不被裁剪成空串再报 `channel_empty`**。
反例二：信封既无 `text` 也无 `attachments`——**`envelope_empty`**；`text` 是 `""` 而没有 `attachments`——**`malformed`**，**不被当作缺席**。
**两组反例都必须同跑**：只跑前一个，一个把空白裁掉、把空串当缺席的实现也会全过。

#### S-21 投递目标认不出，与投递目标进不去

正例：`{"kind": "session", "session": "ses_4c1e"}` 被接受。
反例一：`{"kind": "Session", "session": "ses_4c1e"}`、`{"kind": "new_session"}`——**`target_unknown`**，**不被当成 `session`**。
反例二（**不是本契约的拒绝**）：形状合法，但 `ses_4c1e` 不存在、已归档、或以处理身份进不去——**表示层通过**；受理给出它自己的具名拒绝。
**判据是两者可区分**：一个把「会话不存在」报成 `target_unknown` 的实现，把一次受理的判定记成了表示层拒绝（[S-19](#s-19-表示层拒绝不是判定也不修补)）。

#### S-22 外面送来的斜杠开头的话

正例：一份 `text` 为 `"/compact 把上午的讨论压一下"` 的信封被受理，落成一条 `UserMessage`，那一块文本逐字相同、**不带来源标记**。
反例：同一份信封触发了压缩流程、被展开成某条提示词、或落成的文本块带了 `origin`——**违反 [S-10](#s-10-信封里的文本不是命令)、[S-9](#s-9-信封落成一条用户消息)**。
**必须观察会话日志**：只看受理返回成功，看不出它有没有顺手触发一条流程。

#### S-23 正文里写了凭据

正例：`{ source, target }` 两个成员的正文被接受。
反例：同一份正文加上 `"credential": "cred_5a0e"`——**`malformed`**，**不被丢掉那个成员后收下**。
**判据是「拒绝」**：一个收下它的实现，就让这份资产的每一个持有者、每一个被分享到的组织都拿到了同一个凭据引用。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约；停在一个已登记的缺口不算走不通，如实记为「本版到此为止」。

#### CS-1 求值推出一份连接件的属性项

`capability.asset-evaluation` 在**组装一个装了连接件的 agent、要为它列出属性项**时，依赖 [S-11](#s-11-推出规则)～[S-13](#s-13-两项权限)，得到：
`source`、`target` 两项的类别、取值域与默认值；`disabled` 来自 `data.asset-model` 的保留。
**停在 [G-2](#十已知缺口) 与 [G-4](#十已知缺口)**：`credential` 的「未绑」取值与两项权限都没有表示——**本版到此为止**，整组声明判不出来。

#### CS-2 受理一份信封

受理在**连接件接入端交来一份信封与它的交接上下文**时，依赖 [S-5](#s-5-入站信封)～[S-10](#s-10-信封里的文本不是命令)，得到：
一份形状合法的信封；归属不从信封读；`(source, externalId)` 给出「同一件事」的说法；文本原样是内容；进队列的落成恰好一条 `UserMessage`。
**停三处**：交接上下文长什么样（[G-5](#十已知缺口)）、附件落成哪一类块（[G-6](#十已知缺口)）、处理身份怎么求（[G-4](#十已知缺口)）。

#### CS-3 同一个人在两个租户下各接一次

`capability.asset-governance` 在**同一个人以 (O1, a) 与 (O2, a) 两个租户身份各持有同一个连接件、各配一个鉴权绑定**时，依赖 [S-2](#s-2-鉴权绑定不在正文里)、[S-12](#s-12-鉴权绑定那一项)，得到：
两份持有、两条 `credential` 配值，互不可见；正文里没有凭据，谁也不会从正文拿到另一边的。**「未绑」那一格的写法停在 [G-2](#十已知缺口)**。

#### CS-4 同一个租户身份接同一个服务的两个账号

连接件的作者在**要让 (O, a) 同时接对面同一个服务的两个账号**时，依赖 [S-3](#s-3-来源标识)、[S-12](#s-12-鉴权绑定那一项)，得到：
两份 name 不同的连接件——两个能力标识、两份持有；它们的 `externalAccount` 可以不同，**`channel` 可以相同**，身份不因此相撞。

#### CS-5 资产模型收下一份连接件记录

`data.asset-model` 在**一份 `category` 为 `connector` 的资产记录进它的接收边界**时，依赖 [S-1](#s-1-连接件正文)、[S-2](#s-2-鉴权绑定不在正文里)，得到：
`body` 就是一个 `ConnectorDefinition`。**本版那边的 `body` 仍是不透明壳**——把它换成 `$ref`、把本契约的三个具名拒绝值落进那边的闭合集合，是[一项对齐](../verification.md#对齐义务)。

## 九、缺席怎么收

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是值层面的缺席各自是什么意思：

| 缺席的是什么 | 意思 | 条款 |
|---|---|---|
| 正文的 `source` 或 `target` | **拒绝**（`malformed`），不补成任何默认来源或目标 | [S-1](#s-1-连接件正文) |
| 正文里没有凭据引用 | **合法且唯一合法**：鉴权绑定在持有上 | [S-2](#s-2-鉴权绑定不在正文里) |
| 来源标识的任一分量 | **拒绝**（`malformed`） | [S-3](#s-3-来源标识) |
| 投递目标的 `kind` | **拒绝**（`malformed`）——判别不出是哪一种目标 | [S-4](#s-4-投递目标) |
| 信封的 `externalId` | **拒绝**（`malformed`），**不现铸一个补上**——那等于替连接件说了「这是新的一件」 | [S-6](#s-6-externalid-是同一件事的说法) |
| 信封的 `receivedAt`、`source` | **拒绝**（`malformed`），不补成受理的时刻、不补成持有上配的来源 | [S-5](#s-5-入站信封) |
| 信封的 `text` 与 `attachments` 都缺席 | **拒绝**（`envelope_empty`） | [S-5](#s-5-入站信封) |
| 信封只缺其中一样 | **合法**：一条只有文本、或只有附件的外部消息 | [S-5](#s-5-入站信封) |
| 信封上的租户、持有、目标、处理身份 | **合法且必须缺席**：它们由交接携带；交接里缺了，**判不出来，不放行** | [S-8](#s-8-信封不带归属) |
| 处理身份判不出来 | **没有默认身份**；不拿持有方、目标会话或「当前租户」顶上 | [S-13](#s-13-两项权限) |
| 连接件的后三项属性声明 | **判不出来**，不是「没有这几项」；消费者停在缺口 | [S-11](#s-11-推出规则) |
| 持有上 `credential` 没有配值 | 这一格没意见，沿用外面一格——而外面一格的「未绑」写法停在 [G-2](#十已知缺口) | [S-12](#s-12-鉴权绑定那一项) |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆**：一条外部消息被受理之后落进了日志，就不会因为连接件被移除或禁用而被撤回。

## 十、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决；消费者读到这里应当知道**哪里在等裁决**，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-1** | **账本与产品正文在鉴权绑定的位置上对不上**：账本给的正文带可选的 `credential: CredentialRef`；本版按 PF-002「鉴权绑定是持有上的一项设置」与 `data.asset-model/v1#S-23` 第 4 条**不收**（[S-2](#s-2-鉴权绑定不在正文里)） | 正文的形状；若主线维持账本，本版须回答「正文里的引用依附在哪份持有上」与「复制、分享时它跟不跟着走」 | **主线**（确认或改判） |
| **G-2** | **没有自然出厂值的两项设置，「未配」没有写法**：`credential` 的「未绑」取值没有名字（`data.asset-model/v1#S-23` 第 2 条把它交给本契约，账本没给名字）；`target` 只有「指定一个会话」一支，**正文必须写一个会话**——official 与组织所有的连接件写不出有意义的默认值，而一份被复制或分享出去的正文会把一个会话指认带到别的组织 | [S-11](#s-11-推出规则) 的 `credential` 一行（整组声明因此判不出来）；official 连接件的正文；复制与分享 | **主线**（「未配」取值的名字与形状；正文里的 `target` 是否改为可以写「未配」） |
| **G-3** | **投递目标只有一支**：每条外部消息各开一个会话、按外部的会话或线程分会话、新建会话用哪个 Agent Definition 与哪个租户身份——产品正文都没说 | 想让外部消息开新会话的连接件；DSH 式「一事一会话」的接入 | **PF-002 的 owner**（会同 PF-014、PF-015 的 owner） |
| **G-4** | **PF-002 没定的三件**：「能不能安装」「送进来的消息按什么身份处理」两项权限的项名、取值与默认值；**组织格能不能配鉴权绑定**（PF-002 §九只问了 MCP 凭据） | [S-11](#s-11-推出规则)、[S-13](#s-13-两项权限)；受理求处理身份（CS-2）；组织格上鉴权绑定的写面 | **PF-002 的 owner**（取值与语义）；项名随后由**主线**定 |
| **G-5** | **连接件接入端与它的那一次交接没有契约**：交接携带哪些归属（持有、租户身份、目标、处理身份）、接入端怎样被认证、入站到达的来源信息记什么；`externalAccount` 与鉴权绑定实际认的账号由谁核、核不上怎么收 | [S-8](#s-8-信封不带归属) 的落点；[S-14](#s-14-没有读取面也没有管理面)「接入端只有一个动作」的落点；P-3、P-5 的保护者 | **主线**（接入端本程不投影；受理那一侧的契约起草时一并定） |
| **G-6** | **附件落成哪一类块**：文件块，还是按媒体类型落成图块、语音块的引用形状；两种都合 `data.content-blocks` v1，**两个受理实现可能各选一种** | [S-9](#s-9-信封落成一条用户消息) 第 2 条的确定性 | **主线**（受理那一侧的契约） |
| **G-7** | **外部消息被编辑之后算不算同一件事**：同一个 `(source, externalId)`、内容不同的两份信封，去重该吞掉后一份，还是当作一件新的事 | 受理的去重；接编辑频繁的来源（聊天工具） | **PF-014 的 owner** |
| **G-8** | **`SessionRef` 的家**：`data.messages` v1 的 [G-7](../../messages/v1/contract.md#九已知缺口) 说它的家在还没开题的能力里；账本写的是 `SessionId`，全树没有这个定义，本版 `$ref` 了唯一现有的 `SessionRef` | `DeliveryTarget.session` 的精确类型 | **主线**（对齐波：会话标识的正式名与家） |
| **G-9** | **本契约依据的账本尚未落进设计链**：来源标识的两个分量、投递目标那一支、信封的五个成员、四个拒绝值 | 本契约接受时这几条的可追溯性；[设计依据](#设计依据)无处可链 | **主线** |

## 十一、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **受理**：信封怎样成为入站到达、落进日志、定去处；去重怎么判；具名拒绝叫什么；目标会话存不存在、进不进得去——归 PF-014 的受理那一侧。
- **接入端**：怎样连上外部、怎样过滤、断了怎么重连、怎样把字节存进存储、怎样把信封交出来——归连接件的实现与未立的交接契约（[G-5](#十已知缺口)）。
- **求值与写面**：三项设置、两项权限在各格上的合成与配值——归 `capability.asset-evaluation` 与 `capability.asset-governance`。
- **外部标识的词法**：`channel`、`externalAccount`、`externalId` 长什么样由外部那一侧决定；本契约只定交换表示。
- **可靠投递**：外部那一侧会不会漏发、接入端崩了之后外面的消息会不会补发——本契约不承诺；受理之后的「不漏不重」归受理（[PF-014 §6.7](../../../../product/PF-014-inbound-intake-and-queueing/design.md#67-不漏不重)）。
- **外部内容的可信度**：文本里说的事是真是假、附件里装的是什么——本契约只保证它们原样到达、以内容的身份到达。
- **体积上限**：文本长度、附件个数与大小本版不设；若将来要设，它是一个具名的政策参数，由受理或接入端的契约定。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema 与实例文件存在不表示形状已被校验过。

## 十二、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件、[`connector.schema.json`](connector.schema.json)、[`examples.md`](examples.md)。

**不建 `formal/`**：理由在[性质一节](#性质)末尾。**这不是把义务省掉**：本契约触发的义务是 Schema 正反实例校验、接收边界的拒绝值、规范场景与静态检查，逐条登记在[验证入口](../verification.md)。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#十已知缺口)里 G-1～G-4、G-6、G-8 任一项在**冻结之后**被裁决，凡改变本契约语义或表示的，都出 **v2**；
**冻结之前**在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。G-9 只改依据链接，不改语义。**推荐版本不自动升级消费者。**
