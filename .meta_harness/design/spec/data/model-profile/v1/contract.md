# data.model-profile v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.model-profile, 1)`——
  `family = data`、`topic = model-profile`、规范路径 `spec/data/model-profile/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-013 rev 8** 为准，另引 PF-001 rev 16、PF-004 rev 10、PF-010 rev 5
- **精确语义依赖**（catalog 已按此登记）：
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`——
    取 **[S-11](../../identity-values/v1/contract.md#s-11-scopelayeridentity)** 的 `ScopeLayerIdentity` 作引用的范围分量（`$ref`，不复制），
    按 **[S-5](../../identity-values/v1/contract.md#s-5-tenantid-的构成与相等)**／**[S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)** 判它的相等，
    按 **[S-12](../../identity-values/v1/contract.md#s-12-缺席与空值都不是身份值)**／**[S-17](../../identity-values/v1/contract.md#s-17-身份参数没有默认值)** 写范围分量的缺席与无默认、
    按 **[S-16](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)** 写它的持久形状、
    按 **[S-30](../../identity-values/v1/contract.md#s-30-跨边界须重新验证)** 写它跨进程的重验；
    **S-31 的显式空白码点集合**同时是 [RouteName](#s-2-routename) 禁首尾空白的依据；
    按 **[S-15](../../identity-values/v1/contract.md#s-15-shareancestor)** 的「有共同上级」写 [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) 自建名的判定范围（同一棵隶属树）
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`——只取
    **[S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围)** 定的时间点形状 `Instant`（`$ref` 它的 `$defs/Instant`）
  - `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1`——只取
    **[S-6](../../content-blocks/v1/contract.md#s-6-模态由媒体类型判定)** 的 `Modality`（`$ref` 它的 `$defs/Modality`，本契约不另列一份）
- **不是依赖的两处**：`data.model-response` 与 `data.loop-extension`——两份都**消费本契约**，正文里提到它们标的是**落点**，方向是消费者 → 本契约
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.model-profile/v1#S-13`；缺口 `G-n` 同理

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 档案是一个对象、记哪些事实、各属性何时定能否改 | [PF-013 §4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) | S-1、S-2、S-4～S-12、S-15～S-21（属性表逐行；「请求参数」一行是 rev 8 加的） |
| 模态恰四种、两处必须对得上、文件不是模态 | [PF-013 §4 模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态) | S-7 |
| 选中模型是取值、有效模型是每次现算的结果，两者都指一条档案 | [PF-013 §4 选中模型与有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) | S-13 |
| 在册 / 已撤回、已撤回 ≠ 范围不允许 | [PF-013 §4 在册 / 已撤回](../../../../product/PF-013-model-profiles-and-invocation/design.md#在册--已撤回) · [flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案) | S-10 |
| 官方档案在出厂默认层、自建在组织层或租户层；与官方件 / 自定义件不是一回事 | [PF-013 §4 官方档案 / 自建档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#官方档案--自建档案) | S-1、S-3、S-4、S-13 |
| 凭据挂在范围上，档案自己不存 | [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) · [§6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存) | S-22 |
| 合法目标 = 在册 ∩ 范围允许 ∩ 兼容模态投影；展示列表多出当前选中的那一条 | [PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) | S-1（交出档案要连同引用）、S-7、S-10 作为这次求值的输入；**求值本身不归本契约** |
| 默认重试件按允许的供应商及次序一家一家发，只有允许回退才换下一家；每次只走一家 | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) · [§2 非目标「让上游在一次请求里自己换供应商」](../../../../product/PF-013-model-profiles-and-invocation/design.md#非目标) | S-5、S-6 |
| 那项设置的取值是对档案的引用；路由名一旦定下不可改 | [PF-013 §6.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用) | S-1、S-2、S-12、S-13、S-14 |
| 官方与自建在同一份列表里 | [PF-013 §6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里) | S-3（撞名拒建的理由：同一份列表里两条同名，那项设置的取值指不清） |
| 撤回不删行；会话指着它时说「已下架」 | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架) | S-10、S-14 |
| 本 topic 不出现任何时限数值 | [PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值) | S-22（词表里没有超时、退避） |
| 「送进去之前的限制」三段交接：本 topic 让它成为档案上的事实 | [PF-013 §8](../../../../product/PF-013-model-profiles-and-invocation/design.md#八边界与依赖) · [PF-010 要求五](../../../../product/PF-010-context-management-and-assembly/design.md#要求五组装的输入里必须有当下生效的那份模型档案) | S-8、S-9 |
| 四层、出厂默认层由系统充当 | [PF-001 §6.1 层次](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次) | S-1、S-3（「同一范围」＝所在那一格） |
| 实际用了哪个要留痕，那是请求的可追溯组成 | [PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) | S-22（不在档案上；只引） |
| 实际费用从响应拿，目录估算不得冒充实扣 | [D-019 选择与范围](../../../../record/decisions/model-provider-pi-ai-fork/decision.md#选择与范围) | S-22（价格不在档案上） |
| 所有模型请求经 OpenRouter | [SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) | S-5（`ProviderName` 是 OpenRouter 的供应商标识） |
| 单机交付、语义不变地可扩展 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | [第六节](#六装配给与协议给) |
| JSON Schema 定义数据契约 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) | S-24～S-26 |
| 统一语言正式名 | [模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) · [模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters) · [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality) · [选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model) · [有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model) · [模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)（只引）· [作用域层](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)（只引） | 全部正式名 |

> **这张表里没有产品行的条款：**
>
> | 条款 | 依据来自哪 |
> |---|---|
> | [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) 的撞名范围 | **产品负责人 2026-09-23 的裁决**（[D-038 Q11](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔)：自建档案与官方档案撞名，拒建）＋**主线裁定 2026-09-23，待产品负责人确认**：官方名对所有层保留（含已撤回行）；自建名在所在组织的隶属树内唯一、不跨树（跨树判会让撞名拒建成为探出别的组织建过什么名字的探针）；自建名**只在登记那一刻核**，此后隶属变化带来的树内同名被接受；逐码点比较、不做大小写折叠与相似字判定。PF-013 只写了「同一范围内唯一」；这些裁决都尚未落进 PF-013 正文 |
> | [S-7](#s-7-modality-与两组模态) 的「`inputModalities` 必含 `text`」与拒绝值 `input_text_missing` | **主线裁定 2026-09-23，待产品负责人确认**。PF-013 几条规则（有 transcript 的块任何模型都读得了、附件引用是一段文本）隐含它，正文未明说 |
> | [S-13](#s-13-modelprofileref) 的两支引用形状 | **主线裁定 2026-09-23，待产品负责人确认**：官方那一支不带范围分量，靠 S-3 的「官方名对所有层保留」成立 |
> | [S-18](#s-18-档案参数的输出上限) 的「上游收紧输出上限时不改档案」 | **主线裁定 2026-09-23，待产品负责人确认** |
> | [S-11](#s-11-updatedat) `updatedAt` | **规格层推导**：属性表有五项「随上游变化更新」，记载会过期（[§4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)「差一点就是它」表第一行），消费者需要知道这份记载是什么时候的。产品正文没有这一项 |
> | [S-20](#s-20-项与项名)、[S-24](#s-24-表示层校验是一次纯计算)～[S-26](#s-26-表示层拒绝与判定分开) | 由 [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) 供给：表示、校验与「表示层不等于判定」是规格形式的要求 |
> | [S-23](#s-23-跨部署形态会变的判定) | 由 [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 供给 |

## 一、目的与消费者

### 这份契约拥有什么

1. **模型档案的精确形状**：[PF-013 §4 属性表](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)逐行的取值、约束、何时定与能否改，
   以及档案的身份与在册状态的语义。
2. **指向档案的引用** `ModelProfileRef`：「用哪个模型」那项设置、会话的[选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)、
   一次请求的[有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)都取这个值。
3. **统一请求参数词表** `ModelRequestParameters`：每一项的名字与取值域，以及 adapter「不静默丢、不静默改」的义务。
4. **模态四种的取值** `Modality`。
5. **一条判定**：路由名撞名拒建（`route_name_taken`）的规则与失败值名；执行它的建档操作不在这里。

**不拥有**：[模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)（挂在范围上，家在租户与资产那一侧）；
合法目标集合（无词条）与展示列表（无词条）的求值；选中模型的切换与有效模型的求值；
一次模型调用的请求与响应体（归 `data.model-response`）；重试策略；谁能建、改、撤回档案（归 `capability.model-profile-directory`）。

它是一份**数据契约**：**没有自己的操作、没有状态机、没有提交点**。
在册状态有一条不可逆的转移，但转移由维护档案的能力（`capability.model-profile-directory` v1）写下；本契约只定**取值的含义**与**哪条写路径不存在**。

### 消费者

| 消费者 | 消费什么 |
|---|---|
| **`capability.model-request-runtime` v1**（[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)） | 有效模型那一条档案的 `providers`／`allowFallback`（[S-5](#s-5-providername-与允许的供应商)、[S-6](#s-6-允不允许回退)）、两个上限、参数（[S-15](#s-15-modelrequestparameters-是一份词表)～[S-21](#s-21-不静默丢也不静默改)）；**「不静默丢、不静默改」是它的 adapter 的义务** |
| **Agent 定义「用哪个模型」那项设置**（[PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)；契约未立） | 取值 = `ModelProfileRef`（[S-13](#s-13-modelprofileref)、[S-14](#s-14-引用只精确解析不跨层)），官方与自建两支都指得到 |
| **会话的选中模型**（[PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)；会话契约未立） | 取值 = `ModelProfileRef` |
| **合法目标集合的求值与展示列表**（无词条；`capability.model-request-runtime` v1） | `registration`（[S-10](#s-10-registration)）、`inputModalities`（[S-7](#s-7-modality-与两组模态)）、档案与引用成对交出（[S-1](#s-1-档案的身份所在范围与路由名)）；**官方与自建同一份**（[PF-013 §6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)） |
| **组装**（[PF-010 要求五](../../../../product/PF-010-context-management-and-assembly/design.md#要求五组装的输入里必须有当下生效的那份模型档案)） | 窗口 `maxInputTokens`（[S-8](#s-8-两个上限)）、收得下的模态（[S-7](#s-7-modality-与两组模态)）、送进去之前的限制（[S-9](#s-9-inputconstraints)）——**同一份档案里的三个事实** |
| **模态投影与模态转换件**（[PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态)） | `Modality` 四个取值（[S-7](#s-7-modality-与两组模态)） |
| **`data.loop-extension` v1** | 「调模型之前」可改的请求里 `target` 取 `ModelProfileRef`、`parameters` 取 `ModelRequestParameters` |
| **`data.model-response` v1** | 路由留痕的 `profile`（`ModelProfileRef`）、档案快照（本契约 `ModelProfile` 的属性子集与 `updatedAt`）、`provider`（`ProviderName`）、`parameters`（`ModelRequestParameters`）；未发出项的名字按 [S-20](#s-20-项与项名)，留痕义务来自 [S-21](#s-21-不静默丢也不静默改) |
| **`capability.model-profile-directory` v1**（建档、改、撤回、读） | [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) 的判定与 `route_name_taken`、[S-12](#s-12-各属性何时定能不能改) 的写路径约束、[S-24](#s-24-表示层校验是一次纯计算) 的表示层校验 |

## 二、含义与使用范围

**适用范围**：**一个部署之内**。本版完整交付是单机，但每一条的领域语义在跨进程之后必须原样成立；
哪些由装配顺带给、跨进程须由协议重新兑现，列在[第六节](#六装配给与协议给)。

### 与相近概念的差异

| 那是什么 | 为什么不是本契约的东西 |
|---|---|
| **上游那个模型本身** | 档案是**我们对它的记载**；记载会过期（[S-11](#s-11-updatedat) 就是为此），模型不因我们改档案而变 |
| **[一次模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)** | 那是有头有尾的计算资源；档案是长期的数据 |
| **「这次实际用了哪条」的留痕** | 那是[一次请求的可追溯组成](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)，是历史；它**引用**档案（用 `ModelProfileRef`），不在档案上（[S-22](#s-22-凭据价格与实际用了哪条都不在档案上)） |
| **[官方件](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-official-asset--官方件--official-asset) / 自定义件** | 那一对说的是**资产**的来源；档案不是资产。本契约的 `origin` 取 `official`／`custom`，对应的是**官方档案 / 自建档案**（无词条，PF-013 §4 定义），两套词不互相套用 |
| **「这个范围不允许它」** | 那是[作用域求值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)的结果，档案照样在册；它**不是** `registration` 的一个取值（[S-10](#s-10-registration)） |
| **块的类型** | 七类块是载体，模态是内容的形态；文件块的模态看媒体类型（[S-7](#s-7-modality-与两组模态)） |
| **有效模型 ≠ 选中模型** | 两者**都是** `ModelProfileRef` 这个形状的值，但一个是被记下的取值、一个是每次现算的结果；**形状相同不表示可以互相替代**，谁存哪一个归各自的契约 |

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `ModelProfile` | [模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)的记录 | S-1、S-4～S-12 |
| `RouteName` | 路由名：上游认的那个名字，档案身份的一个分量 | S-2、S-3 |
| `ProfileOrigin` | 来源：官方档案 / 自建档案 | S-4 |
| `ProviderName` | 一家供应商在上游的标识 | S-5 |
| `Modality` | [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality)（定义归 `data.content-blocks`，本契约 `$ref`） | S-7 |
| `InputConstraints` | 送进去之前的限制 | S-9 |
| `Registration` | 在册状态：在册 / 已撤回 | S-10 |
| `ModelProfileRef` | 指向一条档案的引用 | S-13、S-14 |
| `ModelRequestParameters` | [模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters) | S-15～S-21 |
| `ReasoningEffort` | 推理强度的五档 | S-16 |

> **`ProfileOrigin`、`Registration`、`RouteName`、`ProviderName`、`InputConstraints`、`ReasoningEffort`、`ModelProfileRef`
> 是规格层的值名，不是统一语言词条**，因此 Schema 里不给它们「中文 · English」那种词条式标题。
> 它们的含义挂在已有词条下：前五个是[模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)词条定义里点名的属性，
> `ReasoningEffort` 是[模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters)的一项，
> `ModelProfileRef` 是词条里「那项设置的取值是对一条档案的引用」那个引用。

### S-1 档案的身份：所在范围与路由名

**一条档案的身份是（所在范围, 路由名）这一对。**
所在范围是它所在的那一格[作用域层](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)——
官方档案在出厂默认层，自建档案在某一个组织的组织层或某一个租户的租户层
（[PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#官方档案--自建档案)、[PF-001 §6.1](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)）。
「同一范围」指**同一格**：同一个组织的组织层，或同一个租户的租户层，或出厂默认层。

- **所在范围不是 `ModelProfile` 记录的成员。**它是档案被存放的那一格，由持有档案的 owner 存；
  自建档案的那一格按 [`data.identity-values/v1#S-16`](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)
  存成一个带判别式的 `ScopeLayerIdentity`。记录里出现 `scope` 一类成员即拒（`malformed`）。
- **因此一条 `ModelProfile` 记录单独拿出来，不足以指认一条自建档案。**
  凡交出档案、又要让接收方能指认它的地方（展示列表、选择、留痕），**档案与指向它的 `ModelProfileRef` 成对交出**；
  只交记录、让接收方凭 `routeName` 去猜所在范围，违反本条。
- **（所在范围, 路由名）这一对永远挑得出至多一条档案**；**单凭路由名只挑得出至多一条官方档案**。
  这两句是 [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) 的结果，不是另外的规定：
  官方名对所有层保留，所以没有别的档案与一条官方档案同名；自建名在登记那一刻在所在隶属树内判重，
  那棵树含着它自己那一格，而**一格永远只属于一个组织、不会与别的格并起来**，所以同一格里不会有两条同名。
  反过来，**两条自建档案可以同名**——在两棵不同的隶属树上，或在一次隶属建立把两棵树并成一棵之后（S-3）。
  所以官方引用只带路由名，**自建引用必须带所在范围**（[S-13](#s-13-modelprofileref)）：那一格既是消歧所需的分量，也让归属层身份随引用显式到达、让解析核对得了它（[S-14](#s-14-引用只精确解析不跨层)）。
- 档案**不是资产**，不走资产的持有、分享与求值；它**没有**资产持有那种「启用／禁用」标记。

### S-2 RouteName

**路由名是上游认的那个名字，非空字符串，档案身份的一个分量。**

- **相等是逐码点精确相等**：不做 Unicode 规范化、不做大小写折叠、不做首尾裁剪。
- **首尾不得是空白**，空白恰是 [`data.identity-values/v1#S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 列出的那组显式码点，
  判定同样不用 `\s` 与 `$`（理由见该条）。**禁首尾空白是为了 S-3**：否则一个尾随空格就能绕过撞名判定。
  **大小写不同、Unicode 相似字不算同名**（S-3）：`Vendor-A/Chat-Large` 与 `vendor-a/chat-large` 是两个路由名。
- **本系统不解析它的内容**：不从中读出厂商、系列、版本，不按前缀分组。它的词法归上游。
- **建档后不可改**——[改了就是另一条档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用)。
  不这样定，历史里那条「当时用的是谁」的留痕会指向一个已经变了意思的名字。

### S-3 撞名判定：官方名对所有层保留，自建名在所在隶属树内唯一

**建一条档案时，拟用的路由名撞上下表对应一栏里的任何一条已有档案，即拒建，失败值 `route_name_taken`。**
「已有」**含已撤回的行**；**按码点逐字比较，不做大小写折叠，也不做相似字判定。**

| 拟建的是 | 与哪些已有档案比 |
|---|---|
| **官方档案** | **全部档案**：每一条官方档案，以及每一格里的每一条自建档案，不论在哪一棵隶属树上 |
| **所在范围为 `s` 的自建档案** | ① **每一条官方档案**——官方名对所有层保留；② **所在组织与 `s` 的组织有共同上级的每一条自建档案**——也就是在同一棵隶属树上的，判据是 [`data.identity-values/v1#S-15`](../../identity-values/v1/contract.md#s-15-shareancestor) 的 `shareAncestor`，**在判定那一刻读** |

- **一格的组织**：组织层那一格是那个组织；租户层那一格是那个租户所属的组织（`TenantId` 的组织分量）。
  一个组织与它自己恒有共同上级，所以同一个组织的组织层与它每个租户的租户层彼此都在比较范围里；
  [个人组织与任何别的组织都没有共同上级](../../identity-values/v1/contract.md#s-15-shareancestor)，它的比较范围只有它自己那棵单点树。
- **自建名只在登记那一刻核。**隶属关系此后变化——一次隶属建立把两棵各有一条同名自建档案的树并成一棵——
  **两条都留着，不是违例**：本条是一条挡住写入的判定，不是一条随时成立的不变量；隶属建立不读档案、不因此被拒，已有的两条也不被改名或撤回。
  并成一棵之后，这棵树里再建同名的自建档案照本条被拒。
- **随时成立的只有两条**，都是本条的结果：**官方档案的路由名与任何别的档案都不同**（两个方向都比了全部官方名，且都不读隶属关系）；
  **（所在范围, 路由名）不重复**（登记时比较范围含自己那一格，而一格永远只属一个组织）。[S-1](#s-1-档案的身份所在范围与路由名) 与 [S-13](#s-13-modelprofileref) 只依赖这两条。

它来自几条裁决：产品负责人 2026-09-23 裁定自建档案与官方档案撞名拒建（[D-038 Q11](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔)）——
官方与自建[在同一份列表里](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)，两条同名会让「用哪个模型」那项设置的取值指不清；
**主线裁定 2026-09-23，待产品负责人确认**：比较规则逐码点；官方名对所有层保留；自建名的比较范围是所在隶属树、**不跨树**——
跨树判会让撞名拒建成为**探出别的组织建过什么名字的探针**，也让不相干的组织互相挡名；自建名只在登记那一刻核。
**这些都尚未落进 PF-013 正文**；PF-013 写的是「同一范围内唯一」，本条比它严，**满足本条即满足它**。

**它是官方引用只带路由名的前提**（[S-13](#s-13-modelprofileref)）：「官方名对所有层保留」不成立，`{origin: "official", routeName}` 就可能指到两条。

几个后果，写出来免得被当成漏判：

| 情形 | 本条的答案 |
|---|---|
| 同一个组织的组织层与它某个租户的租户层，各建一条同名自建档案 | **后建的拒建**：同一个组织在同一棵树上 |
| 同一棵隶属树上的两个组织（一家公司与它的团队）各建一条同名自建档案 | **后建的拒建** |
| 两个不在同一棵隶属树上的组织各建一条同名自建档案 | **都建得出**：不跨树比较 |
| 两棵树各有一条同名自建档案，随后一次隶属建立把它们并成一棵 | **两条都留着，不是违例**；此后这棵树里再建同名自建档案被拒 |
| 建一条与某官方档案（在册或已撤回）同名的自建档案 | **拒建**：官方名对所有层保留 |
| 系统发布一条新的官方档案，而某一格里已有同名自建档案（任何一棵树） | **同样拒建**；怎样处置归发布方（运营），本契约只给拒建。已有档案的路由名建档后不可改（[S-2](#s-2-routename)）、撤回的行仍占着名字（[S-10](#s-10-registration)），所以这条冲突**不能靠改已有档案的名字化解**（[G-6](#十已知缺口)） |
| 拟建的名字属于一条已撤回的档案 | 按上表照样比：已撤回的官方档案挡住任何建档，已撤回的自建档案挡住同一棵树里的自建建档与任何官方发布；上游把同名模型重新上架时怎么办是 [G-6](#十已知缺口) |
| 与已有名字只差大小写，或只差 Unicode 相似字 | **不是同名，不拒** |
| 与已有名字只差首尾空白 | 走不到本条：首尾空白在表示层就被拒（[S-2](#s-2-routename)） |

#### S-3 路由名在全部档案里唯一？

**不是。**只有官方名对全部档案保留；自建名只在所在隶属树内、只在登记那一刻判重（上文）。
本小节只为已有记录里指向本条旧标题的链接保留锚点，不增加任何承诺。

**这是一条判定，不是表示层校验**：它要读别的记录，Schema 管不到（[S-26](#s-26-表示层拒绝与判定分开)）。
本契约拥有**规则与失败值名**；执行它的建档操作归维护档案的能力（`capability.model-profile-directory` v1）。
那条操作的九件事里，下面几件由本条钉死，其余归那份能力契约：

| # | 九件事 | 本条定了什么 |
|---|---|---|
| 1 | 输入与授权 | 输入是拟建档案的路由名与它将在的那一格：官方档案在出厂默认层（没有身份值）；自建档案的那一格是**显式给出的组织或租户身份，没有默认值**（[`data.identity-values/v1#S-17`](../../identity-values/v1/contract.md#s-17-身份参数没有默认值)）。是不是自建由那一格定（[S-4](#s-4-profileorigin)），不另收一个「来源」参数。自建建档另读一次隶属关系（有共同上级）。**授权归能力** |
| 2 | 前置条件 | 拟建的文档先过[表示层校验](#s-24-表示层校验是一次纯计算)；不过就不进本判定 |
| 3 | 提交点与原子性 | **判定读到的名字与建档写入落在同一个提交边界里**：并发的另一次建档若会把同一个名字写进本次判定读过的那部分（官方发布读全部档案的名字，自建建档读全部官方名与同一棵树里的自建名），两者**不得都判「未被占」各自写入**——否则一条官方档案与一条自建档案、或同一棵树里的两条自建档案同名。**隶属关系那一次读不在这个边界里**：它只在登记那一刻读，此后隶属变化不回头改判（上面「只在登记那一刻核」） |
| 4 | 返回与失败集合 | 未被占 ⇒ 继续建档；被占 ⇒ `route_name_taken`；**判定依据读不到 ⇒ 明确失败**（值名归能力），**不得当作「未被占」**——名字读不到、有共同上级判不出（`shareAncestor` 任何一跳读不到即明确失败，[`data.identity-values/v1#S-15`](../../identity-values/v1/contract.md#s-15-shareancestor)）都在此 |
| 5 | 幂等边界 | **归能力**：重放同一次建档得到 `ok` 还是 `route_name_taken`，由那份契约定 |
| 6 | 事件 | 本契约不定 |
| 7 | 缺席时的默认答案 | 见第 4 行：读不到是失败，不是放行 |
| 8 | 在途操作的归属 | 归能力 |
| 9 | 装配给 vs 协议给 | [第六节](#六装配给与协议给)第 1 行 |

### S-4 ProfileOrigin

**来源恰两值：`official`（官方档案）／`custom`（自建档案）。产生时定，此后不可改，无写路径。**

- **来源由产生方式决定，不是建档者可选的输入**（[PF-013 §4 官方档案 / 自建档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#官方档案--自建档案)「谁产生」一行）：随系统发布的是 `official`，
  组织超级管理员或租户在自己那一层建的是 `custom`。任何组织或租户都建不出 `official` 的档案。
- **来源与所在范围一一对应**：`official` ⇔ 出厂默认层；`custom` ⇔ 组织层或租户层。对不上的档案是无效数据。
- 两者**都不含凭据**（[S-22](#s-22-凭据价格与实际用了哪条都不在档案上)），**在同一份列表里**，不因来源分成两份。

### S-5 ProviderName 与允许的供应商

**`ProviderName` 是一家供应商在上游的标识**——所有模型请求[统一经 OpenRouter](../../../../foundation/cross-system-constraints/requirements.md#sys-llm)，
所以它是 OpenRouter 认的那个供应商标识。非空字符串，相等是逐码点精确相等，本系统不解析它；**词法归传输适配层**（[G-2](#十已知缺口)）。

**`providers` 是这条档案允许走的供应商：有序、非空、无重复。**

- **它是一个允许的范围**：一次发出**只能**发往其中一家；发往不在其中的供应商，违反本条。
- **每一次发出只走其中一家**（[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)）。
  **整份列表不交给上游去自己按次序回退**——[上游在一次请求里悄悄换过，「试过哪几家」就无从得知](../../../../product/PF-013-model-profiles-and-invocation/design.md#非目标)。
  换一家就是再发一次。
- **一次模型调用的第一次发出走第一家**；此后发往哪一家、发不发，是挂在「调模型之后 · 失败」上的重试件的决定。
  **次序即[系统自带的默认重试件](../../../../product/PF-013-model-profiles-and-invocation/design.md#系统自带一件默认的所以开箱就有重试)逐家去试的次序**；
  替换件怎样使用这个次序是策略，本契约不定。
- **它是「试尽」判断的输入，不是它的定义**（[PF-013 §4 什么时候算试尽](../../../../product/PF-013-model-profiles-and-invocation/design.md#什么时候算试尽)）：
  列表划的是**上界**，不是必须试完的清单——重试件可以在试完之前就判试尽。

### S-6 允不允许回退

**`allowFallback` 答「第一家不行时，允不允许往后走」**（[PF-013 §4 属性表](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)；
[默认重试件只有它说「允许」时才换下一家](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)）。

- `false` ⇒ **只允许发往 `providers` 的第一家**；列表里其余各家保留在档案上，但不被发往。
  向第一家再发一次不是「往后走」，发不发由重试件定。
- `true` ⇒ 允许发往列表里后面的各家。
- **它与 `providers` 一样是上界与输入**：`true` 不强迫任何一次回退。

`allowFallback = false` 而列表多于一家**不是非法值**：这一项[建档时定、可改](#s-12-各属性何时定能不能改)，
关掉回退时保留列表，是为了再打开时不必重填。

### S-7 Modality 与两组模态

**`Modality` 的取值与含义归 [`data.content-blocks/v1#S-6`](../../content-blocks/v1/contract.md#s-6-模态由媒体类型判定)**——四个 token、闭合，
`audio` 对应词条的「语音 / voice」，文件不是一种模态；本契约 `$ref` 它的 `$defs/Modality`，**不另列一份**（[PF-013 §4 模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态)）。
档案文档里出现四个 token 之外的字符串（`file`、`voice`、大小写不同的 `Text`）**一律拒绝**（`modality_unknown`），不映射到「最接近」的一种。

**`inputModalities` 是收得下的模态，`outputModalities` 是给得出的模态**：各是一个**非空集合**——无重复，**次序没有含义**。
这是档案上那一处；内容块上那一处归 `data.content-blocks`，**两处是同一个定义**。
**两处对得上与否挡在算合法目标那一刻**，那次求值不归本契约。

**`inputModalities` 必含 `text`；缺它即 `input_text_missing`。**
PF-013 有几条规则建立在「每个模型都收得下文本」之上——[有 transcript 的块任何模型都读得了](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)、
附件引用是一段文本、转换件的兜底是一段 transcript；一条不收文本的档案会让这几条同时落空。
正文没有明说这一句，**主线裁定 2026-09-23，待产品负责人确认**，写成约束。`outputModalities` 不受这一条约束。

### S-8 两个上限

[PF-013 §4 属性表](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)的「一次最多吃多少」「一次最多吐多少」两行：

| 成员 | 含义 | 取值 |
|---|---|---|
| `maxInputTokens` | **一次请求的输入**最多能有多少 token——组装取多长看它 | 整数，≥ 1 |
| `maxOutputTokens` | 一次请求最多吐多少 token | 整数，≥ 1 |

- **token 按上游对这个模型的计法**，本系统不另定一套计数。
- **`maxInputTokens` 只计输入。**上游若把输入与输出算在同一个窗口里，写档案的一方要先换算成「只计输入」的那个上界再写；
  把上游的总窗口原样填进来，组装会按一个它其实用不满的窗口取历史。换算怎样做归写档案的一方。
- 两者之间**本契约不要求任何大小关系**。

### S-9 InputConstraints

**送进去之前的限制是上游对内容本身的额外要求：开放的一组，可以一条都没有**（[PF-013 §4 属性表](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)）。

- **成员必填**：一条都没有写 `{}`。**「没有限制」要明说**——这是对上游事实的记载，
  成员缺席会把「没记」读成「没有」，那是 [`malformed`](#s-25-拒绝值闭合一次恰一个)。
- **本版登记的恰一条**：`maxImageBytes`——**一张图送进去时最多多少字节**，整数 ≥ 1。
  **某一条缺席，即档案记载上游对此没有限制**；记载过期、上游其实有限制时，上游会拒那次请求，
  那是一次模型调用的非常态，按 PF-013 的成因分类走，不在本契约。
- **加一条是新版本**；出现未登记的键**即拒**（`constraint_unknown`），**不忽略**——忽略等于让一条写错名字的限制静默失效。
- 一条只对某种模态有意义的限制，出现在收不下那种模态的档案上（`maxImageBytes` 挂在不收 `image` 的档案上）**不是非法值**，它只是用不上。
- **怎么用它**归[组装](../../../../product/PF-010-context-management-and-assembly/design.md#要求五组装的输入里必须有当下生效的那份模型档案)，
  **用什么手段兑现**归实现规格（[PF-013 §8 三段交接](../../../../product/PF-013-model-profiles-and-invocation/design.md#八边界与依赖)）；本契约只让它成为档案上的一项事实。

### S-10 Registration

**在册状态恰两值：`listed`（在册）／`withdrawn`（已撤回）。**

| 性质 | 内容 |
|---|---|
| **初值** | 档案产生时是 `listed`（[flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)：建档 → 在册）。以 `withdrawn` 产生一条档案没有这条路径 |
| **唯一的转移** | `listed → withdrawn`，由撤回写下 |
| **终态** | `withdrawn` 是终态。**没有回到 `listed` 的写路径**——不存在「重新上架」这个动作；本条就是「没有这条边」，因此没有对应的失败值 |
| **撤回不删行** | 已撤回的档案**仍在、仍读得出**；指向它的引用仍解析到它（[S-14](#s-14-引用只精确解析不跨层)） |
| **名字仍被占** | 它的路由名**照 [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) 仍被占着**：已撤回的官方档案挡住任何一层的同名建档，已撤回的自建档案挡住同一棵隶属树里的同名自建建档与任何同名官方发布。上游把同名模型重新上架时怎么办，是 [G-6](#十已知缺口) |

**这一对取值只说档案自己的状态。**「已撤回的不能被新选中」「会话指着它时说『已下架』而不是『未知模型』」
（[PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)）
**是读它的那些能力的义务**，本契约只保证它们读得到区分这两件事所需的值。

**[已撤回 ≠ 这个范围不允许它](../../../../product/PF-013-model-profiles-and-invocation/design.md#在册--已撤回)。**后者档案照样 `listed`，是作用域求值的结果变了；**它不写进 `registration`**。
两者用户要做的事不同（换一个 / 去找管理员），所以不共用一个取值。

### S-11 updatedAt

**`updatedAt` 是下面五项最近一次取值变化的时刻：**
`inputModalities`、`outputModalities`、`maxInputTokens`、`maxOutputTokens`、`inputConstraints`——
属性表里「随上游变化更新」的那五项。

- **建档时即建档那一刻。**
- **只有这五项里至少一项的值变了，它才动**；其余属性（`providers`、`allowFallback`、`parameters`、`registration`）的变化**不动它**。
  它回答的是「这份对上游的记载是什么时候的」，不是「这一行最近被谁碰过」。
- **它不后退**：一次写入给出的值不早于此前的值（[第六节](#六装配给与协议给)第 2 行）。
- **上游把输出上限降到档案参数之下时，档案不改**（[S-18](#s-18-档案参数的输出上限)），`updatedAt` 也就不动——
  这一刻起档案的 `maxOutputTokens` 比上游的实际上限高，**记载落后于上游是这条裁定有意接受的**。
- 形状取 [`data.offer-expiry/v1#S-22`](../../offer-expiry/v1/contract.md#s-22-schema-的范围) 的时间点：带时区偏移的 RFC 3339，**按时间点语义比较，不按字典序**。

### S-12 各属性何时定、能不能改

按 [PF-013 §4 属性表](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)的「何时确定」一列：

| 属性 | 何时定 | 能不能改 |
|---|---|---|
| `routeName` | 建档 | **不能**——身份分量（[S-2](#s-2-routename)） |
| 所在范围 | 建档 | **不能**——身份分量；**不存在「把档案挪到另一层」**，挪过去就是另一条 |
| `origin` | 产生时 | **不能**（[S-4](#s-4-profileorigin)） |
| `providers`、`allowFallback` | 建档 | 可改 |
| `inputModalities`、`outputModalities`、`maxInputTokens`、`maxOutputTokens`、`inputConstraints` | 建档 | 随上游变化更新；每次取值变化推动 `updatedAt`（[S-11](#s-11-updatedat)）。**一个例外**：上游把输出上限降到档案 `parameters.maxOutputTokens` 之下时**不改档案**（[S-18](#s-18-档案参数的输出上限)） |
| `registration` | 建档时为 `listed` | 只能 `listed → withdrawn` 一次（[S-10](#s-10-registration)） |
| `parameters` | 建档时可给 | 可改，含整份去掉 |

**改完之后的整份文档仍须通过[表示层校验](#s-24-表示层校验是一次纯计算)**——
尤其是 [S-18](#s-18-档案参数的输出上限)：把 `maxOutputTokens` 改到低于 `parameters.maxOutputTokens`，
改完的文档就是 `max_output_exceeds_profile`。所以上游收紧到参数值之下时，档案不改，差额在发出时处理（[S-18](#s-18-档案参数的输出上限)）。

**谁能改、改的前置、并发两次改的收场**，归维护档案的能力（`capability.model-profile-directory` v1）。

### S-13 ModelProfileRef

**`ModelProfileRef` 是指向一条档案的引用，按 `origin` 判别，恰两支：**

| 支 | 形状 | 指向 |
|---|---|---|
| 官方 | `{ origin: "official", routeName }` | 路由名为 `routeName` 的那一条**官方档案** |
| 自建 | `{ origin: "custom", scope, routeName }` | 所在范围为 `scope`、路由名为 `routeName` 的那一条**自建档案** |

「用哪个模型」那项设置的取值、会话的[选中模型与一次请求的有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)，**都是这个值**——
[那项设置的取值是对一条档案的引用，不是一个裸名字](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用)。

- **`origin` 取 [S-4](#s-4-profileorigin) 的两值，必填**：它决定引用长哪一支，也决定解析去哪一类档案里找（[S-14](#s-14-引用只精确解析不跨层)）。
- **官方那一支不带范围分量。**出厂默认层[由系统充当，没有身份对象](../../identity-values/v1/contract.md#s-11-scopelayeridentity)，
  那份契约写明消费者不得为它补一个身份值，本契约也不补。**这一支成立的前提是 [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一)**：
  官方名对所有层保留（含已撤回行），没有别的档案与一条官方档案同名，单凭路由名就指得清一条官方档案。**这一保留一旦放宽，这一支就指不清，必须一起改。**
- **自建那一支的 `scope` 是 [`data.identity-values/v1#S-11`](../../identity-values/v1/contract.md#s-11-scopelayeridentity) 的 `ScopeLayerIdentity`**，`$ref` 它，不复制。
  **必填、没有默认值**：缺席、`null` 都不是一个范围（[`#S-12`](../../identity-values/v1/contract.md#s-12-缺席与空值都不是身份值)），
  **不得**用「当前租户」「当前组织」或别的环境值补上（[`#S-17`](../../identity-values/v1/contract.md#s-17-身份参数没有默认值)）。
  它**存成带判别式的那一个值**，不压平成两个可空字段（[`#S-16`](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)）。
  **它是消歧所需的分量**：自建名只在登记那一刻、在所在隶属树内唯一，不同的树里（以及隶属变化之后同一棵树里）可以有同名的自建档案，
  只有（所在范围, 路由名）这一对挑得出至多一条（[S-1](#s-1-档案的身份所在范围与路由名)）；它同时**让归属层身份随引用显式到达**，并让解析核对得了它。
- **两支互斥**：官方那一支带了 `scope`、自建那一支缺了 `scope`、`origin` 缺席或不在两值之内，一律是 `malformed`——
  **缺 `origin` 不表示「官方」，缺 `scope` 也不表示「官方」**。
- **`routeName` 是 [S-2](#s-2-routename) 的路由名。**
- **相等按分量**：`origin` 相等；自建那一支再要 `scope` 按判别式与载荷相等（载荷的相等按 [`#S-5`](../../identity-values/v1/contract.md#s-5-tenantid-的构成与相等)／[`#S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)）；`routeName` 逐码点相等。全部分量相等才是同一个引用。
- **引用不是授权。**持有一个指向某租户层自建档案的引用，不表示持有者可以用它；
  能不能用，是合法目标集合那次求值的事。

**它是可复用的引用值**：将来「默认主模型 ＋ 可选路由模型组」那类设置（[G-10](#十已知缺口)）由若干个 `ModelProfileRef` 组成，
**本版不为「一组」另立形状**。

### S-14 引用只精确解析，不跨层

**一个引用解析到恰一条档案或没有：官方那一支解析到「`origin` 为 `official`、路由名恰为 `routeName`」的那一条；
自建那一支解析到「`origin` 为 `custom`、所在范围恰为 `scope`、路由名恰为 `routeName`」的那一条。**

- **每个给出的分量都要对上**：官方那一支按路由名在官方档案里至多找到一条，自建那一支按（所在范围, 路由名）至多找到一条（[S-1](#s-1-档案的身份所在范围与路由名)）；
  **找到的那一条的来源或所在范围与引用对不上，就是「查无此条」**——不是「差不多就是它」。
- **不跨层搜索**：不在租户层找不到就去组织层、再去官方找；**不回退**到别层的档案、也不回退到任何「最接近」的一条。
  「用哪个模型」那项设置怎样经层级求值得出一个引用，是那项设置的事；**引用一旦给出，解析就是精确的**。
- **一次有效的引用永远解析到同一条**：行不删（[S-10](#s-10-registration)）、官方名与（所在范围, 路由名）都不复用（已撤回的行仍占着名字，[S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一)）、
  身份分量不可改（[S-12](#s-12-各属性何时定能不能改)）——三条合起来，**已撤回的档案仍被它的引用解析到**，读的一方据此[说得出「已下架」](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)。
- **解析的三种收场不得互相折叠**：

  | 收场 | 是什么 | 不得被读成 |
  |---|---|---|
  | 解析到一条 | 它的 `registration` 可能是 `listed` 或 `withdrawn` | —— |
  | 查无此条 | 这个引用**从来没有指向过**一条档案（构造错了），或存储丢了一行（完整性被破坏）；**两者都明确失败** | 「已撤回」「未知模型、换一条默认的」 |
  | 读不到 | 存储这一次不可用 | 「查无此条」「已撤回」 |

  **失败值名归提供读面的能力**（`capability.model-profile-directory` v1）；本契约只要求三者**结果值不同**、都以返回值到达调用方。

## 四、统一请求参数词表

### S-15 ModelRequestParameters 是一份词表

**[模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters)的名字与取值由本契约统一定一份；
各家 adapter 把它译成上游自己的字段。**

- **它挂在档案上**（`ModelProfile.parameters`）：说的是「这条档案怎么被调」，跟哪个 agent、哪个会话无关
  （[PF-013 §4「请求参数为什么在档案上」](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)）。
- **它也是一个独立的值**：一次请求实际带了什么（留痕在 `data.model-response`）、「调模型之前」的拓展件为这一次改成什么（`data.loop-extension`），
  都用这个形状。
- **每一项都可缺席**（[S-17](#s-17-缺席即不带没有人补值)）。
- **词表闭合**：本版恰八项加一个 `extra`（[S-16](#s-16-各项的取值域)、[S-19](#s-19-extra)）。**加一项是新版本**；
  出现未登记的成员**即拒**（`malformed`），不忽略、不当作 `extra`——
  上游私有的项只能进 `extra`，写在顶层就是写错了地方。

### S-16 各项的取值域

| 项 | 含义 | 取值 |
|---|---|---|
| `reasoningEffort` | 推理强度 | `ReasoningEffort`：`none`／`low`／`medium`／`high`／`max`，闭合 |
| `temperature` | 采样温度 | 数，0 ≤ x ≤ 2 |
| `topP` | 核采样累计概率的上界 | 数，0 < x ≤ 1 |
| `seed` | 采样的随机种子 | 整数 |
| `maxOutputTokens` | 这次最多吐多少 token | 整数 ≥ 1；挂在档案上时另受 [S-18](#s-18-档案参数的输出上限) 约束 |
| `stopSequences` | 遇到即停的串 | 非空数组，元素是非空字符串 |
| `frequencyPenalty` | 按出现次数压低重复 | 数，−2 ≤ x ≤ 2 |
| `presencePenalty` | 按是否出现过压低重复 | 数，−2 ≤ x ≤ 2 |
| `extra` | 上游私有的透传项 | [S-19](#s-19-extra) |

- **类型对、值不在域内**（`temperature` 是 2.5、`reasoningEffort` 是 `"extreme"`、`stopSequences` 是空数组）⇒ `parameter_out_of_range`；
  **类型就不对**（`temperature` 是字符串 `"0.2"`、`seed` 是 1.5）⇒ `malformed`。
- **各项在上游的精确效果归上游那个模型**；本契约只定名字、取值域，以及「不静默丢、不静默改」（[S-21](#s-21-不静默丢也不静默改)）。
- **词表里没有任何时限**：超时、退避是重试件的配置（[PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)）。

### S-17 缺席即不带，没有人补值

- **一项缺席 = 不给这一项。**请求里就不带它（除非「调模型之前」的拓展件为这一次设了它）；
  运行时与 adapter **都不得替它补一个值**。上游缺了这一项怎么办是上游的行为，**不是本系统的一个取值**，也不被记成「带了某个值」。
- **`reasoningEffort: "none"` 是一个取值**——明说不要推理——**与缺席是两件事**：前者要译给上游，后者什么也不发。
- **档案上「一项都不给」只有一种写法：`parameters` 缺席。**档案上的 `parameters` 与任何位置的 `extra` 出现时都不得是空对象（`malformed`）——
  同一个意思两种写法，比较两份档案是否相同时就会各判各的。
- **作为独立值时 `{}` 合法**，意思是「一项都没有」（例如一次请求实际一项也没带）。

### S-18 档案参数的输出上限

**档案上的 `parameters.maxOutputTokens` 不得超过这条档案的 `maxOutputTokens`；相等可以。违反即 `max_output_exceeds_profile`。**

- **这是同一份文档内的跨字段比较**，JSON Schema Draft 2020-12 表达不了；它是[表示层校验](#s-24-表示层校验是一次纯计算)在 Schema 之外补上的一步，
  **不读任何别的记录**。
- **本条只约束档案这一份文档。**一次请求的参数是档案参数被本次覆盖逐项替换之后的结果，**合并之后**再按有效模型档案的 `maxOutputTokens` 校验——
  那一步归模型请求运行时（[`capability.model-request-runtime/v1#S-7`](../../../capabilities/model-request-runtime/v1/contract.md#s-7-一次调用绑定了什么)）；覆盖能否去掉一项是 [G-8](#十已知缺口)。
- **上游把输出上限降到档案 `parameters.maxOutputTokens` 之下时，不改档案**（主线裁定 2026-09-23，待产品负责人确认）：
  既不更新档案的 `maxOutputTokens`（那会让文档违反本条），也不把建档者给的参数夹到新上限（那是替他改了他给的值）。
  **差额在发出时处理**：adapter 按 [S-21](#s-21-不静默丢也不静默改) 的「改了值再发出」发一个上游收得下的值，并**记下实际发出的那个值**。
  **这条义务归模型请求运行时**（它的 adapter）；代价是档案的 `maxOutputTokens` 这一刻起比上游的实际上限高（[S-11](#s-11-updatedat)）。

### S-19 extra

**`extra` 装上游私有的透传项：键是上游自己的字段名，值是任意 JSON。**

- **出现时至少一项**；**键非空**；**键不得与统一词表的八个成员名相同**——那八项只有一种写法（`malformed`）。
- **一项 `extra` 与某个统一项同义但换了上游的拼法**（例如上游自己叫 `top_p`），**同样不许**：同一件事两个来源，
  发出去的是哪一个说不清。**这一条 Schema 管不到**（它不知道上游的拼法），识别它的是 adapter；识别到之后怎样收场是 [G-9](#十已知缺口)。
- adapter 认得一项就照上游的拼法发出去，认不得就按 [S-21](#s-21-不静默丢也不静默改) 不发并留痕。

### S-20 项与项名

**一份 `ModelRequestParameters` 由若干项组成，每一项有一个名字：统一词表的项以成员名为名，`extra` 的项以它的键为名。**

- **一份值里项名唯一**：八个成员名互不相同，`extra` 的键不得与它们相同（[S-19](#s-19-extra)），JSON 对象的键本身不重。
  **因此单看一个项名就知道它是哪一项**、是统一项还是 `extra` 项（不是八个名字之一的就是 `extra` 的键）。
- **要指认某一项的地方用这个名字**——尤其是「哪几项没发出去」那份留痕（落点 `data.model-response`）。

### S-21 不静默丢，也不静默改

**对一次请求实际要用的每一项参数**（档案给的，加上拓展件为这一次改过的），**adapter 恰有三种处置之一：**

| 处置 | 留痕 |
|---|---|
| 按原值发出 | 记下它按原值发出 |
| **改了值再发出**（上游没有这一档、取值域更窄……） | **记下实际发出的那个值**，而不是原值 |
| 没发出 | **记下这一项的名字**（[S-20](#s-20-项与项名)） |

**没有第四种**（[PF-013 §4 属性表「请求参数」一行：上游不认的项不静默丢，留痕](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)）：**静默丢一项、或静默把值换成另一个**（把 `max` 换成 `high`、把 2.5 夹到 2）都违反本条。
**译成上游的字段名不是改值**；**换了取值才是**。

- **统一项与 `extra` 项一视同仁。**
- **上游输出上限已低于档案参数（[S-18](#s-18-档案参数的输出上限)）是第二种处置的一个固定情形**：`maxOutputTokens` 改成上游收得下的值再发出，记下实际发出的值。
- **留痕的形状归 `data.model-response`**（并行起草；它的路由留痕里「这次实际发出的参数」与「没发出去的项」两处）；本契约只立义务。
- **谁兑现**：翻译参数的那一层（模型请求运行时的 adapter）。

## 五、有意不放的

### S-22 凭据、价格与实际用了哪条都不在档案上

| 不放什么 | 为什么 | 它的家 |
|---|---|---|
| **[模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)** | [凭据挂在范围上](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)，[档案自己不存](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)；官方档案的凭据在生产部署的装配阶段配置 | 组织或租户身上的一项属性（租户与资产那一侧） |
| **价格** | [实际费用从响应里拿，目录估算不得冒充实扣](../../../../record/decisions/model-provider-pi-ai-fork/decision.md#选择与范围)；档案上放一个价格，就会有人拿它当账 | `data.call-accounts`（一次调用的费用）与 `data.model-response` |
| **「这次实际用了哪条」** | [那是一次请求的可追溯组成，是历史](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) | `data.model-response` 的路由留痕（它**引用**档案） |
| **超时、退避等时限** | [本 topic 不出现任何时限数值](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)；它们是重试件的配置，走资产那一套 | 重试件（拓展件，第八类资产）的设置 |
| **能力评分** | [产品负责人裁决不留](../../../../product/PF-013-model-profiles-and-invocation/design.md#七取舍)：零消费者 | —— |

**这些成员出现在一份档案文档里即拒（`malformed`）**；档案的**任何交换表示**里都不得出现凭据，
Schema 只管得到档案本身这一份，其余表示面归静态检查（[验证入口](../verification.md#证据义务)）。

## 六、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

### S-23 跨部署形态会变的判定

> **本表只列兑现方式随部署形态改变的判定**；右列写**分布式必须由协议重新兑现什么**，末列写**做不到会怎样**。
> 写「不变」的几行是纯值判定，**那个结论本身也要写出来**。**这张表是契约的一部分**：装配给的那些，演化到分布式时不会自动成立。

| 判定 | 单机由谁给 | 分布式必须由协议重新兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **撞名判定**（[S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一)） | 全部档案在同一存储，建档写入串行，判定读到的名字与写入同一次提交；隶属关系在判定那一刻现读 | 判定读过的那部分名字须有**单一裁决点或条件写入**——官方发布与每个范围的自建建档都经过它；「先查后写」跨两个节点不成立，按组织或租户分片各自判重也不成立（同一棵树跨了分片）。隶属关系读不必与写入同提交（只在登记那一刻核） | 两个节点各自放行同一个名字：一条自建档案与官方档案同名，官方引用（只带路由名）指不清；或同一棵树里并发建出两条同名自建档案 |
| **`updatedAt` 不后退**（[S-11](#s-11-updatedat)） | 单一时间源，不后退 | 多个写入者的时间源须可比，且写入须保证不早于此前的值 | 较新的记载带着较早的时刻，按它判新旧会判反 |
| **撤回不可逆、已撤回仍读得到**（[S-10](#s-10-registration)） | 同一行，只有一条从在册到已撤回的写 | 副本上的读须**单调**：读到过 `withdrawn` 的一方此后不得再读到 `listed` | 一条已下架的档案在某个节点上被当作在册，被新选中 |
| **自建引用的范围分量随请求到达**（[S-13](#s-13-modelprofileref)） | 同一进程内传参 | 每一跳的传输格式**原样**承载 `origin` 判别式与带判别式的 `ScopeLayerIdentity`，不压平（[`data.identity-values/v1#S-16`](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)）；接收边界**重验**持有者有没有资格用它（[`#S-30`](../../identity-values/v1/contract.md#s-30-跨边界须重新验证)） | 压平后丢了 `scope` 的自建引用被读成官方引用、或一个远端节点按引用直接用了另一个租户的自建档案 |
| **不静默丢、不静默改**（[S-21](#s-21-不静默丢也不静默改)） | adapter 与留痕在同一进程 | adapter 若在另一个进程，**「实际发出的值」与「没发出去的项」须随那次调用的结果一起回传**，不得只回一个「发出去了」 | 丢掉的项在跨进程那一跳上无痕，排查的人查不出这一次到底带了什么 |
| **引用解析**（[S-14](#s-14-引用只精确解析不跨层)） | 值比较 | **不变**——纯值相等；但「读不到」在跨进程后先表现为传输层故障，须映射成那一种失败，**不得折成「查无此条」** | —— |
| **表示层校验**（[S-24](#s-24-表示层校验是一次纯计算)） | 纯计算 | **不变** | —— |

## 七、表示与边界校验

- **规范表示**：[`model-profile.schema.json`](model-profile.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/model-profile/v1/model-profile.schema.json`
- **定义项**（9 项）：`ModelProfile`、`ModelProfileRef`、`RouteName`、`ProfileOrigin`、`ProviderName`、
  `InputConstraints`、`Registration`、`ModelRequestParameters`、`ReasoningEffort`。消费者 `$ref` 这些定义，**不复制一份同义类型**。
  `Modality` 不在其中：两组模态 `$ref` `data.content-blocks` 的 `$defs/Modality`（[S-7](#s-7-modality-与两组模态)）。
- **根模式不约束任何文档**：本文件是共享定义的登记处。
- **正反实例**：[`examples.md`](examples.md)，本版的规范工件。

### S-24 表示层校验是一次纯计算

**表示层校验对一份文档求值，结果是「通过」或恰一个拒绝值（[S-25](#s-25-拒绝值闭合一次恰一个)）。**
文档是三种之一：`ModelProfile`、`ModelProfileRef`、`ModelRequestParameters`（独立值）。

它不是一个操作，但它会被每个写档案、收引用、收参数的地方调用，所以把九件事写在这里：

| # | 九件事 | 表示层校验 |
|---|---|---|
| 1 | 输入与授权 | 一份文档与它的种类；**没有身份参数、没有授权**——纯计算 |
| 2 | 前置条件 | 无 |
| 3 | 提交点与原子性 | 无：不读不写任何记录 |
| 4 | 返回与失败集合 | 通过 ｜ 恰一个拒绝值，取自 S-25 的闭合表中适用于该种类的那几个 |
| 5 | 幂等边界 | 同一份文档永远得到同一个结果 |
| 6 | 事件 | 无 |
| 7 | 缺席时的默认答案 | **任何成员缺席都不补默认值**；必填成员缺席即 `malformed` |
| 8 | 在途操作的归属 | 无 |
| 9 | 装配给 vs 协议给 | 不变（[S-23](#s-23-跨部署形态会变的判定) 末行） |

**它包含 Schema 校验与 Schema 之外的一步**：[S-18](#s-18-档案参数的输出上限) 的跨字段比较。
**两者合起来才是表示层校验**；只跑 Schema 的实现会放过 `max_output_exceeds_profile`。

### S-25 拒绝值闭合，一次恰一个

**拒绝值恰十个，没有「其他」。一份文档命中多条时，取下表中最先命中的那一个。**

| 次序 | 拒绝值 | 条件 | 适用于 |
|---|---|---|---|
| 1 | `malformed` | 下列任一：**M1** 文档不是 JSON 对象；**M2** 缺必填成员（引用缺 `origin`、自建那一支缺 `scope` 都在此）；**M3** `ModelProfile`、`ModelProfileRef` 或 `ModelRequestParameters` 里出现未登记的成员（官方那一支带了 `scope` 也在此；`inputConstraints` 里的未登记键不在此，归第 10 行）；**M4** 成员或数组元素的 JSON 类型不对（含该整数处给了带小数的数、`null`）；**M5** 档案或引用的 `origin` 不在两值之内；**M6** `providers` 或两组模态有重复元素，或 `providers` 有空串元素；**M7** 路由名首尾是空白；**M8** `maxInputTokens`、`maxOutputTokens` 或 `inputConstraints.maxImageBytes` 小于 1；**M9** 自建引用的 `scope` 不是合法的 `ScopeLayerIdentity`；**M10** 档案上的 `parameters` 或任何 `extra` 是空对象，或 `extra` 的键为空串、与统一词表的成员名相同；**M11** `updatedAt` 不是时间点 | 三种 |
| 2 | `route_name_empty` | 路由名是空串 | `ModelProfile`、`ModelProfileRef` |
| 3 | `providers_empty` | `providers` 是空数组 | `ModelProfile` |
| 4 | `modalities_empty` | `inputModalities` 或 `outputModalities` 是空数组 | `ModelProfile` |
| 5 | `input_text_missing` | `inputModalities` 非空但不含 `text`（[S-7](#s-7-modality-与两组模态)） | `ModelProfile` |
| 6 | `modality_unknown` | 两组模态里有一个字符串不是四个 token 之一 | `ModelProfile` |
| 7 | `registration_unknown` | `registration` 是一个字符串，但不是两值之一 | `ModelProfile` |
| 8 | `parameter_out_of_range` | 某一项参数类型对、值不在 [S-16](#s-16-各项的取值域) 的域内（含 `reasoningEffort` 不在五档、`stopSequences` 为空数组或含空串） | `ModelProfile`、`ModelRequestParameters` |
| 9 | `max_output_exceeds_profile` | 档案上 `parameters.maxOutputTokens` 大于档案的 `maxOutputTokens`（[S-18](#s-18-档案参数的输出上限)；Schema 之外） | `ModelProfile` |
| 10 | `constraint_unknown` | `inputConstraints` 里出现未登记的键 | `ModelProfile` |

- **`malformed` 排第一**：结构都不完整的文档，报不出一个有意义的具体原因。其后九个只对结构完整的文档报。
- **`input_text_missing` 先于 `modality_unknown`**：`["image", "file"]` 报 `input_text_missing`。
- **次序是一致性的要求**：两个实现对同一份多处违规的文档须报同一个值，[`examples.md`](examples.md#6-多处违规时的次序)有四条回归例。
- **判定失败值 `route_name_taken` 不在本表**（[S-26](#s-26-表示层拒绝与判定分开)）。

### S-26 表示层拒绝与判定分开

- **表示层拒绝在任何判定之前发生**，它不表示「这个名字被占了」「这条档案不存在」或「这个人不能用它」，**不得被记成一次判定结果**
  （与 [`data.identity-values/v1` 的 S-33](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开) 同一条规矩）。
- **通过不表示任何资格**：一份合法的档案文档**不表示它的路由名没被占**（那是 [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一)）；
  一个合法的引用**不表示它解析得到**（[S-14](#s-14-引用只精确解析不跨层)）、**更不表示持有者能用它**（[S-13](#s-13-modelprofileref)）。
- **`route_name_taken` 是判定失败值**：它只在表示层校验通过之后、由建档操作求出。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 表达不了的那部分归谁 |
|---|---|---|
| [S-1](#s-1-档案的身份所在范围与路由名) 身份 | 只管「记录里没有 `scope` 这类成员」 | 所在范围怎么存、档案与引用成对交出——持有档案的 owner |
| [S-2](#s-2-routename) 路由名 | **管**非空、首尾无空白 | 「本系统不解析」「建档后不可改」——静态检查与维护档案的能力 |
| [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) 撞名 | **管不到**——要读别的记录与隶属关系 | 建档操作，与写入同提交（`capability.model-profile-directory` v1） |
| [S-4](#s-4-profileorigin) 来源 | 管取值域 | 「由产生方式决定」「与所在范围一一对应」——维护档案的能力 |
| [S-5](#s-5-providername-与允许的供应商)、[S-6](#s-6-允不允许回退) 供应商与回退 | 管非空、无重复、布尔 | 「只发往列表里的」「每次只走一家」「不整份交给上游」——模型请求运行时 |
| [S-7](#s-7-modality-与两组模态) 模态 | **完全管得到**：四值闭合、非空、无重复、`inputModalities` 必含 `text` | 两处对得上——合法目标那次求值 |
| [S-8](#s-8-两个上限) 两个上限 | 管整数 ≥ 1 | 「只计输入」的换算——写档案的一方 |
| [S-9](#s-9-inputconstraints) 限制 | **完全管得到**：成员必填、闭合、`maxImageBytes` ≥ 1 | —— |
| [S-10](#s-10-registration) 在册状态 | 管取值域 | 初值、不可逆、行不删——维护档案的能力与静态检查 |
| [S-11](#s-11-updatedat) `updatedAt` | 管「是时间点」 | 何时动、不后退——维护档案的能力 |
| [S-13](#s-13-modelprofileref) 引用 | **管**两支互斥：`origin` 判别必填、官方那一支不带 `scope`、自建那一支 `scope` 必填且是带判别式的值、无多余成员 | 「不得用环境值补」——调用方；「引用不是授权」——合法目标求值；官方那一支指得清靠 S-3——建档操作 |
| [S-14](#s-14-引用只精确解析不跨层) 解析 | **管不到** | 读面（`capability.model-profile-directory` v1） |
| [S-15](#s-15-modelrequestparameters-是一份词表)～[S-17](#s-17-缺席即不带没有人补值) 词表、取值域、缺席 | **管得到**闭合、各项的域、档案上不得为空对象 | 「没有人补值」——运行时与 adapter |
| [S-18](#s-18-档案参数的输出上限) 输出上限 | **管不到**（跨字段） | 表示层校验在 Schema 之外那一步 |
| [S-19](#s-19-extra) `extra` | 管非空、键非空、键不与八个成员名同 | 「不得与统一项同义换拼法」——adapter（[G-9](#十已知缺口)） |
| [S-21](#s-21-不静默丢也不静默改) 不静默 | **管不到** | adapter；留痕形状在 `data.model-response` |
| [S-22](#s-22-凭据价格与实际用了哪条都不在档案上) 不放的 | 管「档案文档里没有这些成员」 | 其余交换表示里不出现凭据——静态检查 |

**Schema 校验失败 ⇒ 该文档不是一个合法值 ⇒ 按 S-25 给出一个拒绝值。不得降级为「按默认处理」或「尽力而为」。**

## 八、性质与消费者核对场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 官方档案的路由名与任何别的档案都不同；（所在范围, 路由名）不重复——两条都含已撤回行、逐码点比较 | 不变量 | [PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)、[D-038 Q11](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔)、主线裁定 2026-09-23，待产品负责人确认 | 建档操作，判定读到的名字与写入同提交（[S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一)） | 一条官方档案与另一条档案路由名逐码点相同，官方引用解析到两条；或同一格里有两条同名档案 |
| P-2 | 路由名、来源、所在范围建档后不变 | 不变量 | [PF-013 §6.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用) | 维护档案的能力不提供这些写路径（[S-12](#s-12-各属性何时定能不能改)） | 一条历史留痕里的引用，今天解析到一条意思变了的档案 |
| P-3 | 已撤回是终态，行保留，名字仍被占 | 不变量 | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架) · [flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案) | 维护档案的能力（[S-10](#s-10-registration)） | 已撤回的档案回到在册；或它的行没了，会话只说得出「未知模型」 |
| P-4 | 引用只精确解析，不跨层、不回退 | 安全 | [PF-013 §6.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用) | 读面（[S-14](#s-14-引用只精确解析不跨层)） | 一个自建引用解析到了所在范围或来源与它不符的档案；或一个官方引用解析到了自建档案 |
| P-5 | 档案上没有凭据 | 安全 | [PF-013 §6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存) | Schema ＋ 静态检查（[S-22](#s-22-凭据价格与实际用了哪条都不在档案上)） | 读出一条档案，或它的任何交换表示里，看得到一把凭据 |
| P-6 | 每次发出只走允许列表里的一家；不允许回退时只走第一家 | 安全 | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) | 模型请求运行时（[S-5](#s-5-providername-与允许的供应商)、[S-6](#s-6-允不允许回退)） | 一次发出同时交给上游多家去回退；或发往了列表外的一家；或 `allowFallback = false` 时发往了第二家 |
| P-7 | 参数不静默丢、不静默改 | 安全 | [PF-013 §4 请求参数](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) | adapter（[S-21](#s-21-不静默丢也不静默改)） | 上游不认的一项既没发出去、也查不到它没发出去；或发出去的值与留痕里的不同 |
| P-8 | 档案参数的输出上限不超过档案的输出上限 | 不变量 | [PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)：请求参数的取值归规格 | 表示层校验（[S-18](#s-18-档案参数的输出上限)） | 一条档案的 `parameters.maxOutputTokens` 大于它的 `maxOutputTokens` |
| P-9 | 缺席不补值：参数项、范围分量、限制条目 | 安全 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)（范围分量）· PF-013 §4 | 调用方与 adapter（[S-13](#s-13-modelprofileref)、[S-17](#s-17-缺席即不带没有人补值)） | 一个缺 `origin` 或缺 `scope` 的引用被当成官方引用或「当前租户的」；或请求里出现一个档案没给、拓展件也没设的参数值 |
| P-10 | 每条档案都收得下文本 | 不变量 | 主线裁定 2026-09-23，待产品负责人确认（PF-013 [§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面) 等规则隐含） | Schema（`contains`）＋表示层校验（[S-7](#s-7-modality-与两组模态)） | 一条 `inputModalities` 不含 `text` 的档案被建出来，有 transcript 的块对它不再可读 |
| P-11 | 一条自建档案登记时，它所在隶属树里没有同名的自建档案 | 安全（登记那一刻的判定，**不是不变量**：隶属变化后树内同名被接受） | 主线裁定 2026-09-23，待产品负责人确认 | 建档操作，按判定那一刻现读的 `shareAncestor`（[S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一)） | 一次自建建档成功写入，而写入那一刻同一棵树里已有同名自建档案；**或**一次建档因别的树里有同名自建档案被拒（跨树判了） |

**进展性质：本契约不拥有任何进展性质。**档案不会「最终成为」别的样子；撤回何时写下、上游变化何时同步，归维护档案的能力。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约。
> 编号 `CS-1`～`CS-5` 只在本节定义；[`examples.md`](examples.md) 的实例与判定场景是另一组，证据不互相顶替。

#### CS-1 会话指着一条被撤回的自建档案

**会话领域的 owner** 在**选中模型是（租户 T, `vendor-b/coder-7b`），而这条档案随后被撤回**时，
依赖 [S-10](#s-10-registration)、[S-13](#s-13-modelprofileref)、[S-14](#s-14-引用只精确解析不跨层)，得到：
引用**仍解析到同一条**，读到 `registration = withdrawn`——据此说得出「已下架」，不是「未知模型」；
**不会**解析到组织层或官方的同名档案顶上。「不替用户改选、这次发不出去并上交」是那边的规则，本契约只保证它读得到依据。

#### CS-2 建一条与已有档案同名的档案

**维护档案的能力**在**租户 T 建一条路由名与某官方档案相同的档案**、或**系统发布一条路由名与某组织自建档案相同的官方档案**时，
依赖 [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一)，得到：两次都是 `route_name_taken`，**不论已有那一条在哪一层、在册还是已撤回、在哪一棵隶属树上**。
**租户 T 建一条与另一棵隶属树上某组织的自建档案同名的档案时，照常建出**——不跨树比较，拒建因此探不出别的树里建过什么。
判定读不到已有档案、或判不出有没有共同上级时**明确失败**，不当作「未被占」。只差大小写的名字不算同名，照常建出。

#### CS-3 默认重试件逐家去试

**默认重试件**在**第一次发出失败**时，依赖 [S-5](#s-5-providername-与允许的供应商)、[S-6](#s-6-允不允许回退)，得到：
第一次发出走的是 `providers` 的第一家；`allowFallback = true` 才可以把下一次发往第二家，`false` 时只能再发第一家或判试尽；
**无论哪种都不把整份列表交给上游自己回退**。

#### CS-4 上游不认某一项参数

**模型请求运行时的 adapter** 在**档案带着 `reasoningEffort: "max"`，而上游这个模型最高只有一档「high」**时，
依赖 [S-16](#s-16-各项的取值域)、[S-20](#s-20-项与项名)、[S-21](#s-21-不静默丢也不静默改)，得到两条合法的路、一条非法的路：
**改成 `high` 发出并把「实际发出的是 `high`」记下**；或**不发这一项并记下项名 `reasoningEffort`**；
**静默发 `high` 而留痕仍写 `max`，或静默不发**——违反本条。选哪一条合法的路归 adapter。

#### CS-5 组装读同一份档案里的三项

**组装**在**用户刚切到一个窗口更小、收不下视频、单图上限更小的模型**时，依赖 [S-7](#s-7-modality-与两组模态)、[S-8](#s-8-两个上限)、[S-9](#s-9-inputconstraints)，得到：
下一次组装接到的有效模型那一份档案里，**窗口（只计输入）、收得下的模态、`maxImageBytes`** 三项**同在一份记录里、同一次读出**——
[不是三套机制](../../../../product/PF-010-context-management-and-assembly/design.md#要求五组装的输入里必须有当下生效的那份模型档案)。
`inputConstraints` 为 `{}` 时，档案记载的是「上游对此没有限制」。

## 九、缺席与恢复

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是值层面的缺席怎样收敛：

| 缺席的是什么 | 收敛到哪 | 谁收口 |
|---|---|---|
| 文档的必填成员缺席或表示非法 | 表示层拒绝，恰一个拒绝值（[S-25](#s-25-拒绝值闭合一次恰一个)）；**不补默认值**，不记成判定结果 | 调用表示层校验的一方 |
| 引用的 `origin` 缺席，或自建引用的 `scope` 缺席 | `malformed`；**不以「官方」「当前租户」「当前组织」补上** | 同上 |
| 按引用**读不到**（存储不可用） | **明确失败**；不当作「已撤回」、不当作「查无此条」、不换一条 | 读面的 owner（`capability.model-profile-directory` v1） |
| 按引用**查无此条** | **明确失败**（构造错误或完整性被破坏）；不当作「已撤回」，不回退到别层同名 | 同上 |
| 撞名判定的依据读不到 | **明确失败**，不当作「未被占」 | 建档操作的 owner |
| 某一项参数缺席 | 请求里不带它；**无人补值** | 运行时与 adapter |
| 上游不认某一项 / 某个值 | 不发并留痕，或改值发出并记下实际值（[S-21](#s-21-不静默丢也不静默改)） | adapter |
| `inputConstraints` 里某一条缺席 | 档案记载上游对此没有限制；记载过期时上游拒这次请求，按一次模型调用的非常态走 | 模型请求运行时 |
| 系统重启 | 档案全部来自存储；**没有一项来自运行时对象** | 存储 |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 十、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-2** | **`ProviderName` 的具体词法**（OpenRouter 供应商标识的字符集与大小写规则） | 需要校验或规范化供应商名的实现 | **传输适配层**（模型请求运行时的提供者设计） |
| **G-6** | **上游把一个已撤回的同名模型重新上架**（账本 U-2）：已撤回的行保留且照 S-3 仍占着名字（S-10），而路由名必须是上游认的那个名字——已撤回的**官方**档案使任何一层都再也建不出指向它的档案，已撤回的**自建**档案使同一棵隶属树里再也建不出。同一个结构也挡住「新官方档案撞上已有自建名」之后的处置：已有档案改不了名、撤回了也仍占着名。本版按「撤回终态、名字永久占用、撞名拒建」写 | 撤回过的模型不可再用；撞名的新官方档案无处可落 | **产品负责人**（PF-013：撤回是否真是永久、要不要「重新上架」；账本 U-2 两种长相：撤回终态另起名，或允许 `withdrawn → listed` 恢复并让撞名的自建件改名前官方件不进该组织的展示列表）。判后者即新版本：S-3、S-10、S-14 同改 |
| **G-8** | **一次请求的覆盖能否去掉档案上的某一项**（让这次不带它）。合成的其余部分已定：覆盖**逐项替换**档案参数，合并之后再按档案的输出上限校验（主线裁定 2026-09-23，待产品负责人确认；落在 [`capability.model-request-runtime/v1#S-7`](../../../capabilities/model-request-runtime/v1/contract.md#s-7-一次调用绑定了什么)） | `data.loop-extension` 的改写表示 | **模型请求运行时**的能力契约，与 `data.loop-extension` 协同 |
| **G-9** | **`extra` 里出现与统一项同义的上游拼法**（S-19）被 adapter 识别之后的收场：拒这次请求、以统一项为准并留痕、还是别的 | adapter 的实现 | **模型请求运行时**的能力契约 |
| **G-10** | **会话的「默认主模型 ＋ 可选路由模型组」**（产品负责人 2026-09-23 口头，将来经 hook 做 model selector）：两个概念尚无词条、不在 PF-013 正文 | 不阻断本版；本版只保证 `ModelProfileRef` 可复用，不为「一组」立形状 | **产品负责人**（PF-013 下次 rev，先立词条） |

**已关闭的缺口**（2026-09-23 主线裁定，编号不复用）：

| # | 原来缺什么 | 怎么关的 | 落在哪 |
|---|---|---|---|
| **G-1** | 指向官方档案的引用形状（`ScopeLayerIdentity` 不含出厂默认层） | 引用改为按 `origin` 判别的两支，官方那一支只带路由名；前提是官方名对所有层保留 | [S-13](#s-13-modelprofileref)、[S-14](#s-14-引用只精确解析不跨层)、[S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) |
| **G-3** | 路由名大小写不同、Unicode 相似字算不算撞名 | 不算：逐码点比较，不做大小写折叠与相似字判定 | [S-2](#s-2-routename)、[S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) |
| **G-4** | 新发布的官方档案撞上已有自建名 | 同样拒建，处置归发布方；它之后能不能落地并入 [G-6](#十已知缺口) | [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) |
| **G-5** | 同一组织的组织层与租户层各有同名自建档案 | 同一个组织必在同一棵隶属树上，后建的拒建（自建名在所在隶属树内唯一，对齐波改判后仍成立） | [S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一) |
| **G-7** | 上游把输出上限降到档案参数之下 | 不改档案；发出时按「改了值再发出」处理并留痕，义务归模型请求运行时 | [S-18](#s-18-档案参数的输出上限)、[S-21](#s-21-不静默丢也不静默改) |
| **G-12** | `inputModalities` 是否必含 `text` | 必含；缺它即 `input_text_missing` | [S-7](#s-7-modality-与两组模态)、[S-25](#s-25-拒绝值闭合一次恰一个) |
| **G-11** | 维护档案的能力契约不存在：谁能建、改、撤回，读面的失败值，建档的幂等与并发 | `capability.model-profile-directory` v1（candidate）立起：建档、撤回、读、装入官方清单各写全九件事；S-3 的判定与 S-14 的三种收场落在那里（对齐波关闭） | S-3、S-10、S-12、S-14 的执行面 |

## 十一、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **不定义谁能建、改、撤回档案**，以及这些操作的授权、失败集合（`route_name_taken` 的名字除外）、幂等与并发——归维护档案的能力（`capability.model-profile-directory` v1）。
- **不定义合法目标集合与展示列表怎么算**（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)），**也不定义有效模型怎么求**；本契约只给它们的输入。
- **不定义凭据的存放与取用**，也不定义用量怎样归到凭据上。
- **不定义重试策略**：试几次、换不换、等多久、何时算试尽。
- **不定义一次模型调用的请求体与响应体**，以及路由留痕的形状——归 `data.model-response`。
- **不定义统一参数到 OpenRouter 字段的映射**——归 adapter。
- **不定义官方档案怎样随系统发布、怎样随上游同步**。
- **不定义模态投影与模态转换件**。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema 与实例文件存在不表示形状已被校验过。

## 十二、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件、[`model-profile.schema.json`](model-profile.schema.json)、[`examples.md`](examples.md)。

**不建 `formal/`。**理由：本契约**没有状态机**需要行为模型——在册状态只有一条不可逆的边，
「没有回去的边」本身就是结论，没有交错可被反驳；**会被并发反驳的是建档操作的「判定与写入同提交」**（[S-3](#s-3-撞名判定官方名对所有层保留自建名在所在隶属树内唯一)），
那条义务落在拥有建档操作的能力契约（`capability.model-profile-directory` v1），不在这里建第二份平行模型。
结构约束全在**一份文档之内**，Schema 加 [S-18](#s-18-档案参数的输出上限) 一步跨字段比较即可完整表达；
跨记录的那一条（路由名唯一与官方名保留）是一个全局唯一性谓词，在 Alloy 里写出来只是它的同义复述。
**这不是把义务省掉**：本契约触发的是 Schema 与实例、静态检查与规范场景，逐条登记在[验证入口](../verification.md)。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#十已知缺口)任一项被裁决后，凡改变本契约语义或表示的（尤其 G-6 若裁为允许重新上架，会动 S-3 与 S-10），都出新版本。
