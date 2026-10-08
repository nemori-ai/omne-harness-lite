# data.model-profile v5

> 当前规范范围见 catalog。本版由已接受的 `data.model-profile/v4` 机械演进（源接受依据），只更新精确消费链并移除旧格式兼容过渡承诺；字段、操作、发送门、策略和当前代际恢复责任保持。依据本次用户明确要求及[第一版发布前演进政策](../../../../../agents/roles/engineering-taste.md#通用判断)，本候选的接受由 registry 单独记录。变化及证据见[验证入口](../verification.md#v5-发布前破坏性演进)。

> 规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.model-profile, 5)`——
  `family = data`、`topic = model-profile`、规范路径 `spec/data/model-profile/v5/contract.md`。
  **文件位置不代替这个三元组身份。**
- **演进基线**：已接受的 `data.model-profile/v4`；本候选的接受、采用与冻结状态只从[版本外入口](../README.md)和 registry 读取。旧版的接受不传递给本版。
- **设计依据**：PF-013 **rev 14**（D-096）；继承来源已复核为当前 PF-001 rev 23 §6.1（四层）、PF-004 rev 13 §6.6（每次请求实际模型留痕）、PF-010 rev 6 要求五（组装取得有效档案）。上游未知可明示、项目必须供给有限输入上限、组装与发送最终复核的边界来自 PF-013 §4／§8。
- **候选表达依据**：主线裁定沿用 `maxInputTokens` 与 `inputConstraints.maxImageBytes` 表示有限供给，新增上游三态、闭合指标与完整快照。字段和下述 `InputLimitFact`／`UpstreamInputLimits` 是模型档案既有属性的技术投影（无独立词条），不引入领域身份。既有适配绑定沿 [UL-D-6](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-adaptation-binding--模型适配绑定--model-adaptation-binding)。本坐标范围见 catalog，旧版的接受不传递给本版。
- **精确语义依赖**（候选登记由本批 registry 单一 owner 集成）：
  - `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`——
    取 **[S-11](../../identity-values/v1/contract.md#s-11-scopelayeridentity)** 的 `ScopeLayerIdentity` 作引用的范围分量（`$ref`，不复制），
    按 **[S-5](../../identity-values/v1/contract.md#s-5-tenantid-的构成与相等)**／**[S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)** 判它的相等，
    按 **[S-12](../../identity-values/v1/contract.md#s-12-缺席与空值都不是身份值)**／**[S-17](../../identity-values/v1/contract.md#s-17-身份参数没有默认值)** 写范围分量的缺席与无默认、
    按 **[S-16](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)** 写它的持久形状、
    按 **[S-30](../../identity-values/v1/contract.md#s-30-跨边界须重新验证)** 写它跨进程的重验；
    **S-31 的显式空白码点集合**同时是 [RouteName](#s-2-routename) 禁首尾空白的依据
  - `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1`——只取时间点形状 `Instant`（`$ref` 它的 `$defs/Instant`）。
    依据是 **[S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围)** 末句（时间点的规范形式）**加上**那份 Schema 的 `$defs/Instant`：
    S-22 列出的可复用形状表里没有 `Instant` 这一项，那份契约已冻结，所以依据照实这样写，catalog 仍登 S-22
  - `omne-harness-lite-design-2026-09-15 · data.content-blocks · v2`——取
    **[S-6](../../content-blocks/v2/contract.md#s-6-模态由媒体类型判定)** 的 `Modality`（`$ref` 它的 `$defs/Modality`，本契约不另列一份），以及
    **[S-24](../../content-blocks/v2/contract.md#s-24-规范表示)** 的严格 JSON、重复成员拒绝和十进制数无损义务，用于 S-30 的配置值。该版 Schema 没有 `JsonObject` 定义；本版只写 `type: object`，不造一个不能解析的引用，也不定义第二套 JSON 值
- **不是依赖的两处**：`data.model-response` 与 `data.loop-extension`——两份都**消费本契约**，正文里提到它们标的是**落点**，方向是消费者 → 本契约
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.model-profile/v5#S-13`；缺口 `G-n` 同理

## 本版运行格式边界

本版运行面只消费本版及其**精确依赖链**规定的当前格式。不为被替代的旧接口、旧格式或旧实现提供兼容入口、双轨执行、降级、回填、旧格式只读、认回或结算路径；历史规格与证据保留不构成这些运行承诺。不原地改写、清空或补造用户已有数据；遇到不兼容值沿本契约既有表示拒绝或操作失败边界明确失败，不静默转成当前值，也不新增失败枚举。

**当前代际已经受理的任务与产生的历史事实仍受原保证约束**：同一调用的不可变快照、已有提交与未知结果、恢复、认回、释放和结算责任不因本次演进而消失。这里删除的是旧格式过渡路径，不能据此遗弃当前在途责任、换身份重发、改写原记录或用当前目录覆盖原快照。仍被本版精确引用的 IV、CB、日志、资产及 hooks 等契约按各自版本消费，版本号较小本身不表示兼容过渡。


## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 档案是一个对象、记哪些事实、各属性何时定能否改 | [PF-013 §4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) | S-1、S-2、S-4～S-12、S-15～S-21（属性表逐行；「请求参数」一行是 rev 8 加的） |
| 模态恰四种、两处必须对得上、文件不是模态 | [PF-013 §4 模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态) | S-7 |
| 选中模型是取值（一个路由名）、有效模型是每次现算的结果（这个名字这一次落到的那一条档案） | [PF-013 §4 选中模型与有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) | S-2、S-13、S-14 |
| 在册 / 已撤回、已撤回可以恢复在册、已撤回 ≠ 范围不允许 | [PF-013 §4 在册 / 已撤回](../../../../product/PF-013-model-profiles-and-invocation/design.md#在册--已撤回) · [flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案) | S-10 |
| 档案的身份是所在范围加路由名：同一范围里一个路由名一条（含已撤回的），不同范围可各有一条同名的；**设置记的是路由名，运行时按层覆盖取胜出的那一条**（rev 12，裁决 39、40） | [PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名) · [flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)（建档前提） | S-1、S-2、S-3、S-13、S-14 |
| 官方档案在出厂默认层、自建在组织层或租户层；两者可以同路由名；与官方件 / 自定义件不是一回事 | [PF-013 §4 官方档案 / 自建档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#官方档案--自建档案) | S-1、S-3、S-4、S-13 |
| 凭据只在租户层，档案自己不存 | [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) · [§6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存) | S-22 |
| 合法目标 = 在册 ∩ 范围允许 ∩ 兼容模态投影；展示列表多出当前选中的那一条与被盖住的同名条目（只作标注） | [PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事) | S-1（交出档案要连同引用）、S-7、S-10 作为这次求值的输入；**求值本身不归本契约** |
| 默认重试件按允许的供应商及次序一家一家发，只有允许回退才换下一家；每次只走一家 | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) · [§2 非目标「让上游在一次请求里自己换供应商」](../../../../product/PF-013-model-profiles-and-invocation/design.md#非目标) | S-5、S-6 |
| 设置记路由名，但名字背后必须是一条档案；路由名一旦定下不可改 | [PF-013 §6.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用) | S-1、S-2、S-12、S-13、S-14 |
| 官方与自建在同一份列表里，每一条标着来源（官方 / 自建，自建的再带建在哪一层） | [PF-013 §6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里) | S-4、S-13（来源标注取引用里的 `origin` 与 `scope`；列表本身不归本契约） |
| 撤回不删行；已撤回的可以恢复在册，恢复的还是原来那一条；会话指着它时说「已下架」 | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架) | S-3、S-10、S-14 |
| 本 topic 不出现任何时限数值 | [PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值) | S-22（词表里没有超时、退避） |
| 「送进去之前的限制」三段交接：本 topic 让它成为档案上的事实 | [PF-013 §8](../../../../product/PF-013-model-profiles-and-invocation/design.md#八边界与依赖) · [PF-010 要求五](../../../../product/PF-010-context-management-and-assembly/design.md#要求五组装的输入里必须有当下生效的那份模型档案) | S-8、S-9 |
| 四层、出厂默认层由系统充当 | [PF-001 §6.1 层次](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次) | S-1、S-3（「同一范围」＝所在那一格） |
| 实际用了哪个要留痕，那是请求的可追溯组成 | [PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) | S-22（不在档案上；只引） |
| 实际费用从响应拿，目录估算不得冒充实扣 | D-019 选择与范围 | S-22（价格不在档案上） |
| 所有模型请求经 OpenRouter | [SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) | S-5（`ProviderName` 是 OpenRouter 的供应商标识） |
| 单机交付、语义不变地可扩展 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | [第六节](#六装配给与协议给) |
| JSON Schema 定义数据契约 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) | S-24～S-26 |
| 统一语言正式名 | [模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) · [模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters) · [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality) · [选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model) · [有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model) · [官方档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-official-model-profile--官方档案--official-model-profile) · [自建档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-custom-model-profile--自建档案--custom-model-profile) · [档案在册状态](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-profile-listing-status--档案在册状态--profile-listing-status) · [允许的供应商](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-allowed-providers--允许的供应商--allowed-providers) · [供应商回退](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-provider-fallback--供应商回退--provider-fallback) · [能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) · [模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)（只引）· [作用域层](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)（只引）· [合法目标集合](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set)（只引）· [模型展示列表](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-model-display-list--模型展示列表--model-display-list)（只引） | 全部正式名；值名与词条的对应见[第三节](#三值身份与结构关系) |

> **这张表里没有产品行的条款：**
>
> | 条款 | 依据来自哪 |
> |---|---|
> | [S-3](#s-3-撞名判定同一范围内唯一) 的比较规则：逐码点、不做大小写折叠与相似字判定 | 主线裁定，见 D-060 §S6 S6-b——**只取它比较规则那一半**；它的「名字在全部档案里唯一」「新官方档案撞自建名同样拒建」已被产品负责人的裁定取代（D-060 §四）。撞名的**范围**（同一范围内唯一、不同范围并存）有产品行：[PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)（[裁决 35、38](../../../../product/PF-013-model-profiles-and-invocation/design.md)，撤回了 D-058 Q11 的「拒建」；组织层与租户层同名并存是[裁决 39、40](../../../../product/PF-013-model-profiles-and-invocation/design.md)） |
> | [S-7](#s-7-modality-与两组模态) 的「`inputModalities` 必含 `text`」与拒绝值 `input_text_missing` | 主线裁定，见 D-060 §S6 S6-d。PF-013 几条规则（有 transcript 的块任何模型都读得了、附件引用是一段文本）隐含它，正文未明说 |
> | [S-13](#s-13-modelprofileref) 的两支引用形状 | 主线裁定，见 D-060 §S6 S6-a。它当时的理由「官方名对所有层保留」已随 Q11 撤回；**结论照旧成立**，前提换成「官方档案全在出厂默认层这一格、同一格里路由名不重复」（[S-3](#s-3-撞名判定同一范围内唯一)、[S-4](#s-4-profileorigin)）。官方那一支的范围由 `origin` 判别式带出，不另写一个分量 |
> | [S-18](#s-18-档案参数的输出上限) 的「上游收紧输出上限时不改档案」 | 主线裁定，见 D-060 §S6 S6-c。「不改的只是 `maxOutputTokens` 这一项、其余适用项照常更新」是**规格层推导**（理由在 S-18） |
> | [S-11](#s-11-updatedat) `updatedAt` | **规格层推导**：历史上按五项上游属性推导；本版按主线裁定扩为六项，供给与事实的记载都会变化（[§4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)「差一点就是它」表第一行），消费者需要知道这份记载是什么时候的。产品正文没有这一项 |
> | [S-27](#s-27-modelprofilesnapshot档案在某一刻的副本) 档案快照 | 主线裁定，见 D-060 §块 C 对账 C-R1（不给档案加修订身份，快照跟着发出记录走）；**家放在本契约**是规格层推导（理由在 S-27） |
> | [S-28](#s-28-建档内容产生一条档案时给的那一份) 建档内容 | **规格层推导**：维护档案的能力建档与装入官方清单时收的正是这样一份（`capability.model-profile-directory` v2 S-14 ①、S-18 ①），两边要对同一份输入报同一个拒绝值，这份文档与它的拒绝值只能有一个家 |
> | [S-10](#s-10-registration) 「恢复可以与属性改写同一次提交」 | **规格层推导**：官方档案的恢复只经清单装入，清单里重现的条目可能带着改过的属性（`capability.model-profile-directory` v2 S-18 `relisted`） |
> | [S-20](#s-20-项与项名)、[S-24](#s-24-表示层校验是一次纯计算)～[S-26](#s-26-表示层拒绝与判定分开) | 由 [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) 供给：表示、校验与「表示层不等于判定」是规格形式的要求 |
> | [S-23](#s-23-跨部署形态会变的判定) | 由 [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 供给 |

## 一、目的与消费者

### 这份契约拥有什么

1. **模型档案的精确形状**：[PF-013 §4 属性表](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)逐行的取值、约束、何时定与能否改，
   以及档案的身份与在册状态的语义；产生一条档案时给的那一份**建档内容**（[S-28](#s-28-建档内容产生一条档案时给的那一份)）也归这里。
2. **指向档案的引用** `ModelProfileRef`：**在目录内部与治理面上指认一行档案**；一次请求的[有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)（这一次落到的那一行）与它的留痕也取这个值。
   **「用哪个模型」那项设置与会话的[选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)记的不是它，是路由名 `RouteName`**（[S-2](#s-2-routename)）；名字落到哪一行由按层覆盖定（[S-14](#s-14-引用只精确解析不跨层)）。
3. **统一请求参数词表** `ModelRequestParameters`：每一项的名字与取值域，以及 adapter「不静默丢、不静默改」的义务。
4. **模态四种的取值** `Modality`。
5. **一条判定**：路由名撞名拒建（`route_name_taken`）的规则与失败值名；执行它的建档操作不在这里。
6. **模型适配绑定** `ModelAdaptationBinding`：三种精确修订分量与声明式配置的形状；注册、调用准入和热更新的行为不归这里（S-29～S-31）。

**不拥有**：[模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)（挂在范围上，家在租户与资产那一侧）；
[合法目标集合](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set)与[模型展示列表](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-model-display-list--模型展示列表--model-display-list)的求值；选中模型的切换与有效模型的求值；
一次模型调用的请求与响应体（归 `data.model-response`）；重试策略；谁能建、改、撤回档案（归 `capability.model-profile-directory`）。

它是一份**数据契约**：**没有自己的操作、没有状态机、没有提交点**。
在册状态有两条转移（撤回、恢复在册），转移由维护档案的能力（`capability.model-profile-directory` v2）写下；本契约只定**取值的含义**与**有哪两条边**。

### 消费者

下表继承 v2 的消费者分工与已采用坐标，用于定位升级责任，**不声明这些旧坐标已经消费本候选**。
采用本版输入限制与完整快照的新消费者必须精确钉 v5；升级义务见 G-15/G-16 与[验证入口](../verification.md#v5-发布前破坏性演进)。

| 消费者 | 消费什么 |
|---|---|
| **`capability.model-request-runtime` v2**（[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)） | 有效模型那一条档案的 `providers`／`allowFallback`（[S-5](#s-5-providername-与允许的供应商)、[S-6](#s-6-允不允许回退)）、两个上限、参数（[S-15](#s-15-modelrequestparameters-是一份词表)～[S-21](#s-21-不静默丢也不静默改)）；打开调用时照原样复制下档案快照（[S-27](#s-27-modelprofilesnapshot档案在某一刻的副本)）；**「不静默丢、不静默改」是它的 adapter 的义务** |
| **Agent 定义「用哪个模型」那项设置**（[PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)；契约未立） | 取值 = `RouteName`（[S-2](#s-2-routename)）；这个名字在一条范围链上落到哪一行，由按层覆盖定（[S-14](#s-14-引用只精确解析不跨层)） |
| **会话的选中模型**（[PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)；会话契约未立） | 取值 = `RouteName`；[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)落下的那条记录也记路由名（`data.messages` v2 S-49） |
| **[合法目标集合](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-legal-target-set--合法目标集合--legal-target-set)的求值与[模型展示列表](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-model-display-list--模型展示列表--model-display-list)**（`capability.model-request-runtime` v2） | `registration`（[S-10](#s-10-registration)）、`inputModalities`（[S-7](#s-7-modality-与两组模态)）、档案与引用成对交出（[S-1](#s-1-档案的身份所在范围与路由名)）；**官方与自建同一份**（[PF-013 §6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)） |
| **组装**（[PF-010 要求五](../../../../product/PF-010-context-management-and-assembly/design.md#要求五组装的输入里必须有当下生效的那份模型档案)） | 窗口 `maxInputTokens`（[S-8](#s-8-两个上限)）、收得下的模态（[S-7](#s-7-modality-与两组模态)）、送进去之前的限制（[S-9](#s-9-inputconstraints)）——**同一份档案里的三个事实** |
| **模态转换件**（[PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态)） | `Modality` 四个取值（[S-7](#s-7-modality-与两组模态)） |
| **`capability.modality-projection` v2** | 兼容判定只读 `inputModalities`、文本从不被挡（[S-7](#s-7-modality-与两组模态)）；档案不合形状时 `invalidInput` 带的那个原名取 [S-25](#s-25-拒绝值闭合一次恰一个) |
| **`capability.asset-registry` v2** | 工具两端的模态对照有效模型档案的两组模态（[S-7](#s-7-modality-与两组模态)） |
| **`data.messages` v2** | 「已出门」记录带着这次调用的绑定与传输适配的处置：供应商取 `ProviderName`（[S-5](#s-5-providername-与允许的供应商)）、有效模型的引用取 `ModelProfileRef`（[S-13](#s-13-modelprofileref)）、合并之后的请求参数取 `ModelRequestParameters`（[S-15](#s-15-modelrequestparameters-是一份词表)）、档案快照取 `ModelProfileSnapshot`（[S-27](#s-27-modelprofilesnapshot档案在某一刻的副本)）、两份处置清单的项名按 [S-20](#s-20-项与项名)；模型切换落下的那条记录记 `RouteName`（[S-2](#s-2-routename)） |
| **`data.loop-extension` v2** | 「调模型之前」可改的请求里 `target` 与 `select_model` 的 `profile` 取 `RouteName`（[PF-013 §6.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用)：用哪个模型记路由名）、`parameters` 取 `ModelRequestParameters`；重试的 `provider` 取 `ProviderName`（[S-5](#s-5-providername-与允许的供应商)）；「调模型之后 · 失败」主体的 `profile` 是那次调用绑定的档案快照（[S-27](#s-27-modelprofilesnapshot档案在某一刻的副本)） |
| **`data.model-response` v2** | 路由留痕的 `profile`（`ModelProfileRef`，[S-13](#s-13-modelprofileref)）、档案快照（[S-27](#s-27-modelprofilesnapshot档案在某一刻的副本)）、`provider`（`ProviderName`，在快照的允许列表里、第一次发出走第一家，[S-5](#s-5-providername-与允许的供应商)、[S-6](#s-6-允不允许回退)）；**参数三处留痕兑现 [S-21](#s-21-不静默丢也不静默改)**：`parameters` 记实际发出的值（`ModelRequestParameters`）、`parameterAdjustments` 记改过值的那几项（项名、要求的值、发出的值）、`droppedParameters` 记没发出的项名（含 `extra` 项的键）——项名都按 [S-20](#s-20-项与项名) |
| **`capability.model-profile-directory` v2**（建档、改、撤回、恢复在册、读、装入官方清单） | [S-3](#s-3-撞名判定同一范围内唯一) 的判定与 `route_name_taken`、[S-10](#s-10-registration) 的两条转移、[S-11](#s-11-updatedat) 何时动、[S-12](#s-12-各属性何时定能不能改) 的写路径约束、[S-28](#s-28-建档内容产生一条档案时给的那一份) 建档内容（建档与清单条目的输入）、[S-24](#s-24-表示层校验是一次纯计算)／[S-25](#s-25-拒绝值闭合一次恰一个) 的表示层校验与拒绝值 |

## 二、含义与使用范围

**适用范围**：**一个部署之内**。本版完整交付是单机，但每一条的领域语义在跨进程之后必须原样成立；
哪些由装配顺带给、跨进程须由协议重新兑现，列在[第六节](#六装配给与协议给)。

### 与相近概念的差异

| 那是什么 | 为什么不是本契约的东西 |
|---|---|
| **上游那个模型本身** | 档案是**我们对它的记载**；记载会过期（[S-11](#s-11-updatedat) 就是为此），模型不因我们改档案而变 |
| **[一次模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)** | 那是有头有尾的计算资源；档案是长期的数据 |
| **「这次实际用了哪条」的留痕** | 那是[一次请求的可追溯组成](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)，是历史；它**引用**档案（用 `ModelProfileRef`），不在档案上（[S-22](#s-22-凭据价格与实际用了哪条都不在档案上)） |
| **[官方件](../../../../ubiquitous_language/terms/circulation-and-entitlement.md#ul-official-asset--官方件--official-asset) / 自定义件** | 那一对说的是**资产**的来源；档案不是资产。本契约的 `origin` 取 `official`／`custom`，对应的是**官方档案 / 自建档案**（PF-013 §4 定义），两套词不互相套用 |
| **「这个范围不允许它」** | 那是[作用域求值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)的结果，档案照样在册；它**不是** `registration` 的一个取值（[S-10](#s-10-registration)） |
| **块的类型** | 七类块是载体，模态是内容的形态；文件块的模态看媒体类型（[S-7](#s-7-modality-与两组模态)） |
| **有效模型 ≠ 选中模型** | 选中模型是被记下的取值——**一个路由名**；有效模型是每次现算的结果——这个名字这一次落到的**那一行档案**（`ModelProfileRef`）。谁存哪一个归各自的契约 |

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `ModelProfile` | [模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)的记录 | S-1、S-4～S-12 |
| `RouteName` | 路由名：上游认的那个名字，档案身份的一个分量 | S-2、S-3 |
| `ProfileOrigin` | 来源：官方档案 / 自建档案 | S-4 |
| `ProviderName` | 一家供应商在上游的标识 | S-5 |
| `Modality` | [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality)（定义归 `data.content-blocks`，本契约 `$ref`） | S-7 |
| `InputConstraints` | 项目供给的有限输入限制 | S-9 |
| `InputLimitFact`、`UpstreamInputLimits` | 单项三态与按适用域组成的上游输入事实 | S-32、S-33 |
| `Registration` | 在册状态：在册 / 已撤回 | S-10 |
| `ModelProfileRef` | 指向一条档案的引用 | S-13、S-14 |
| `ModelProfileSnapshot` | 档案在某一刻、发出与重试要用到的属性的副本 | S-27 |
| `ModelProfileContent` | 建档内容：产生一条档案时给的那一份，不带在册状态与 `updatedAt` | S-28 |
| `ModelRequestParameters` | [模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters) | S-15～S-21 |
| `ReasoningEffort` | 推理强度的五档 | S-16 |

**值名与统一语言词条的对应**：Schema 的定义名与成员名是规格层的值名，**不改名去迁就词条的英文正式名**；有词条的，概念以词条为准、在这里对上：

| 值名（定义或成员） | 对应的词条 | 怎么对 |
|---|---|---|
| `ModelProfile` | [模型档案 · Model Profile](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) | 同一个概念，定义名即正式英文名 |
| `ProfileOrigin` 的 `official`／`custom` | [官方档案 · Official Model Profile](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-official-model-profile--官方档案--official-model-profile)／[自建档案 · Custom Model Profile](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-custom-model-profile--自建档案--custom-model-profile) | 判别式的两个取值各对一条词条；「来源」本身（无词条） |
| `Registration`（成员 `registration`）的 `listed`／`withdrawn` | [档案在册状态 · Profile Listing Status](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-profile-listing-status--档案在册状态--profile-listing-status) 的「在册」／「已撤回」 | 同一个概念；定义名 `Registration` 是值名，正式英文名以词条为准 |
| 成员 `providers` | [允许的供应商 · Allowed Providers](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-allowed-providers--允许的供应商--allowed-providers) | 同一个概念；元素 `ProviderName`（无词条） |
| 成员 `allowFallback` | [供应商回退 · Provider Fallback](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-provider-fallback--供应商回退--provider-fallback) | `true` 即允许回退 |
| `RouteName` | （无词条）；它充当模型档案的[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) | 词条里「模型档案以路由名充当」那一句说的就是它 |
| `ModelRequestParameters`、`ReasoningEffort` | [模型请求参数 · Model Request Parameters](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters)；`ReasoningEffort` 是它的一项 | 定义名即正式英文名 |
| `InputConstraints`、`ModelProfileRef`、`ModelProfileSnapshot`、`ModelProfileContent` | （无词条） | 规格层的值名：前一个是[模型档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)词条定义里点名的属性「送进去之前的限制」；后三个是指认一行、某一刻的副本与建档输入，不是新的领域概念 |

Schema 里有词条的定义给「中文 · English」式标题；没有词条的只给值名。

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
  凡交出档案、又要让接收方能指认它的地方（展示列表、目录的读面、有效模型的留痕），**档案与指向它的 `ModelProfileRef` 成对交出**；
  切换选中模型记的是路由名（[S-2](#s-2-routename)），不在此列；
  只交记录、让接收方凭 `routeName` 去猜所在范围，违反本条。
- **（所在范围, 路由名）这一对永远挑得出至多一条档案**；**单凭路由名只挑得出至多一条官方档案**。
  这两句是 [S-3](#s-3-撞名判定同一范围内唯一) 的结果，不是另外的规定：同一格里路由名不重复（含已撤回的行），
  而**官方档案全在出厂默认层这一格**（[S-4](#s-4-profileorigin)），所以官方档案之间路由名也不重复。
  反过来，**同一个路由名可以在不同的格里各有一条**——官方与自建、一个组织的组织层与它某个租户的租户层、两个不同的组织（S-3；[PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)）。
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

### S-3 撞名判定：同一范围内唯一

**建一条档案时，拟用的路由名与它将在的那一格里任何一条已有档案的路由名相同，即拒建，失败值 `route_name_taken`。**
「已有」**含已撤回的行**；**按码点逐字比较，不做大小写折叠，也不做相似字判定。**

| 拟建的是 | 与哪些已有档案比 |
|---|---|
| **官方档案** | 出厂默认层那一格里的每一条档案——也就是每一条官方档案 |
| **所在范围为 `s` 的自建档案** | 所在范围恰为 `s` 的每一条档案 |

- **只比同一格，不读别的格，也不读隶属关系。**官方档案与某一格里的自建档案同路由名、一个组织的组织层与它某个租户的租户层各有一条同名的、两个组织各有一条同名的，
  **都建得成、都在，谁也不挡谁**——它们在不同的范围里（[PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)、[§6.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用)）。
  组织层与租户层的同名并存是产品负责人的裁定（[PF-013 裁决 39、40](../../../../product/PF-013-model-profiles-and-invocation/design.md)，已落进 §4 档案的身份）。
- **并存之后同名的几条谁生效，不是本条的事**：那是运行时按层覆盖——以路由名为能力标识、在一条范围链上先滤掉已撤回的与这个范围不允许的、再取最具体一格的那条（租户 > 组织 > 出厂默认）；
  链上的先后归维护档案的能力（`capability.model-profile-directory` v2 S-17），求有效模型时怎样用它归模型请求运行时（`capability.model-request-runtime` v2 S-10）。
  **本条只保证同一格里不重名**，所以「一条链上某个路由名过滤之后最具体的那一格」至多挑出一条。
- **同一格里要再用一个已撤回档案的路由名，走恢复在册（[S-10](#s-10-registration)），不是另建**：另建会造出两条同一身份的档案
  （[PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)）。所以拟建的名字撞上同一格里一条已撤回的行，同样是 `route_name_taken`。
- **随时成立的是一条**：**（所在范围, 路由名）不重复**——判定与写入同提交（下面九件事第 3 行），同一格里不会有两条同名。
  **官方档案全在出厂默认层这一格**（[S-4](#s-4-profileorigin)），所以它的一个推论是**官方档案之间路由名不重复**；
  [S-1](#s-1-档案的身份所在范围与路由名) 与 [S-13](#s-13-modelprofileref) 只依赖这两句。

它来自：产品负责人 2026-09-24 裁定档案的身份是（所在范围, 路由名）、「自建档案撞官方档案的路由名就拒建」去掉
（[PF-013 decisions 裁决 35、38](../../../../product/PF-013-model-profiles-and-invocation/design.md)；
第 38 条撤回的是 D-058 Q11 的「拒建」）；
比较规则逐码点是主线裁定，见 D-060 §S6 S6-b（只取比较规则那一半，上文设计依据已说明）。

**它是官方引用只带路由名的前提**（[S-13](#s-13-modelprofileref)）：同一格里名字不重复且官方档案只在一格，`{origin: "official", routeName}` 才指得清一条。

几个后果，写出来免得被当成漏判：

| 情形 | 本条的答案 |
|---|---|
| 同一格里后建一条与已有档案同名的 | **拒建** |
| 同一格里已有一条**已撤回**的同名档案 | **拒建**；要再用这个名字，是把那一条恢复在册（[S-10](#s-10-registration)） |
| 建一条与某官方档案（在册或已撤回）同名的自建档案 | **建得出**：不在同一格 |
| 系统发布一条新的官方档案，而某一格里已有同名自建档案 | **建得出**：两条并存，引用按 `origin` 与 `scope` 分得开（[S-13](#s-13-modelprofileref)）；列表上靠来源分辨（[PF-013 §6.3](../../../../product/PF-013-model-profiles-and-invocation/design.md#63-官方与自建在同一份列表里)） |
| 出厂默认层里已有一条**已撤回**的官方档案，系统再发布同名的一条 | 本条的结论是**名字被占、不另建**；官方发布只经清单装入，那条操作把这种情形处置为**把那一条恢复在册**（`capability.model-profile-directory` v2 S-18 的 `relisted`），不返回 `route_name_taken` |
| 同一个组织的组织层与它某个租户的租户层，各建一条同名自建档案 | **都建得出**（PF-013 裁决 39）；对那个租户的会话，运行时按层覆盖、租户层那条生效——不是本条的事（上文） |
| 两个组织（同一棵隶属树上或不在）各建一条同名自建档案 | **都建得出**：不在同一格；隶属关系不参与 |
| 与已有名字只差大小写，或只差 Unicode 相似字 | **不是同名，不拒** |
| 与已有名字只差首尾空白 | 走不到本条：首尾空白在表示层就被拒（[S-2](#s-2-routename)） |

#### S-3 路由名在全部档案里唯一？

**不是。**路由名只在同一范围（同一格）里唯一（上文）；不同范围里可以各有一条同名的。
本小节只为已有记录里指向本条旧标题的链接保留锚点，不增加任何承诺。

**这是一条判定，不是表示层校验**：它要读别的记录，Schema 管不到（[S-26](#s-26-表示层拒绝与判定分开)）。
本契约拥有**规则与失败值名**；执行它的建档操作归维护档案的能力（`capability.model-profile-directory` v2）。
那条操作的九件事里，下面几件由本条钉死，其余归那份能力契约：

| # | 九件事 | 本条定了什么 |
|---|---|---|
| 1 | 输入与授权 | 输入是拟建档案的路由名与它将在的那一格：官方档案在出厂默认层（没有身份值）；自建档案的那一格是**显式给出的组织或租户身份，没有默认值**（[`data.identity-values/v1#S-17`](../../identity-values/v1/contract.md#s-17-身份参数没有默认值)）。是不是自建由那一格定（[S-4](#s-4-profileorigin)），不另收一个「来源」参数。**不读别的格、不读隶属关系**。**授权归能力** |
| 2 | 前置条件 | 拟建的那份建档内容（[S-28](#s-28-建档内容产生一条档案时给的那一份)）先过[表示层校验](#s-24-表示层校验是一次纯计算)；不过就不进本判定 |
| 3 | 提交点与原子性 | **判定读到的名字与建档写入落在同一个提交边界里**：并发的另一次建档若会把同一个名字写进同一格，两者**不得都判「未被占」各自写入**——否则同一格里两条同名。**这个边界只需覆盖那一格的档案行**：判定不读别的格，不同格上的两次建档互不相干 |
| 4 | 返回与失败集合 | 未被占 ⇒ 继续建档；被占（含被一条已撤回的行占着）⇒ `route_name_taken`；**判定依据读不到 ⇒ 明确失败**（值名归能力），**不得当作「未被占」** |
| 5 | 幂等边界 | **归能力**：重放同一次建档得到 `ok` 还是 `route_name_taken`，由那份契约定 |
| 6 | 事件 | 本契约不定 |
| 7 | 缺席时的默认答案 | 见第 4 行：读不到是失败，不是放行 |
| 8 | 在途操作的归属 | 归能力 |
| 9 | 装配给 vs 协议给 | [第六节](#六装配给与协议给)第 1 行 |

### S-4 ProfileOrigin

**来源恰两值：`official`（[官方档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-official-model-profile--官方档案--official-model-profile)）／`custom`（[自建档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-custom-model-profile--自建档案--custom-model-profile)）。产生时定，此后不可改，无写路径。**

- **来源由产生方式决定，不是建档者可选的输入**（[PF-013 §4 官方档案 / 自建档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#官方档案--自建档案)「谁产生」一行）：随系统发布的是 `official`，
  组织超级管理员或租户在自己那一层建的是 `custom`。任何组织或租户都建不出 `official` 的档案。
- **来源与所在范围一一对应**：`official` ⇔ 出厂默认层；`custom` ⇔ 组织层或租户层。对不上的档案是无效数据。
- 两者**都不含凭据**（[S-22](#s-22-凭据价格与实际用了哪条都不在档案上)），**在同一份列表里**，不因来源分成两份。

### S-5 ProviderName 与允许的供应商

**`ProviderName` 是一家供应商在上游的标识**——所有模型请求[统一经 OpenRouter](../../../../foundation/cross-system-constraints/requirements.md#sys-llm)，
所以它是 OpenRouter 认的那个供应商标识。非空字符串，相等是逐码点精确相等，本系统不解析它；**词法归传输适配层**（[G-2](#十已知缺口)）。

**`providers` 是这条档案[允许的供应商](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-allowed-providers--允许的供应商--allowed-providers)：有序、非空、无重复。**

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

**`allowFallback` 是[供应商回退](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-provider-fallback--供应商回退--provider-fallback)：答「第一家不行时，允不允许往后走」**（[PF-013 §4 属性表](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)；
[默认重试件只有它说「允许」时才换下一家](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上)）。

- `false` ⇒ **只允许发往 `providers` 的第一家**；列表里其余各家保留在档案上，但不被发往。
  向第一家再发一次不是「往后走」，发不发由重试件定。
- `true` ⇒ 允许发往列表里后面的各家。
- **它与 `providers` 一样是上界与输入**：`true` 不强迫任何一次回退。

`allowFallback = false` 而列表多于一家**不是非法值**：这一项[建档时定、可改](#s-12-各属性何时定能不能改)，
关掉回退时保留列表，是为了再打开时不必重填。

### S-7 Modality 与两组模态

**`Modality` 的取值与含义归 [`data.content-blocks/v2#S-6`](../../content-blocks/v2/contract.md#s-6-模态由媒体类型判定)**——四个 token、闭合，
`audio` 对应词条的「语音 / voice」，文件不是一种模态；本契约 `$ref` 它的 `$defs/Modality`，**不另列一份**（[PF-013 §4 模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态)）。
档案文档里出现四个 token 之外的字符串（`file`、`voice`、大小写不同的 `Text`）**一律拒绝**（`modality_unknown`），不映射到「最接近」的一种。

**`inputModalities` 是收得下的模态，`outputModalities` 是给得出的模态**：各是一个**非空集合**——无重复，**次序没有含义**。
这是档案上那一处；内容块上那一处归 `data.content-blocks`，**两处是同一个定义**。
**两处对得上与否挡在算合法目标那一刻**，那次求值不归本契约。

**`inputModalities` 必含 `text`；缺它即 `input_text_missing`。**
PF-013 有几条规则建立在「每个模型都收得下文本」之上——[有 transcript 的块任何模型都读得了](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)、
附件引用是一段文本、转换件的兜底是一段 transcript；一条不收文本的档案会让这几条同时落空。
正文没有明说这一句，主线裁定写成约束，见 D-060 §S6 S6-d。`outputModalities` 不受这一条约束。

### S-8 两个上限

| 成员 | 含义 | 取值 |
|---|---|---|
| `maxInputTokens` | **本档案供给的有限输入上限**，一次请求输入最多占用多少 token；适用于全部档案 | 必填正整数，有限，无默认值 |
| `maxOutputTokens` | 一次请求最多吐多少 token | 必填正整数 |

输入 token 使用精确模型与供应商的计量单位，包含实际发送的消息、system、工具定义、协议附加内容及各模态成本。纯文本字符数、UTF8 长度与某个任意比例不是 token 计量证据。准确计量或有证据的可靠保守上界可以证明不超限；保守上界超 cap 而实际值未知，只能说明无法证明合规，不能声称已测得超限。具体计量算法、版本与来源证据归提供者，不由本数据契约假造；不要求取得供应商未公开的秘密模板作为普遍前置条件。

`maxInputTokens` 只计输入。上游若只有输入输出共享总窗口，写档案的一方必须按适用输出预算和窗口规则得到可用输入界限，保留换算前提；总窗口不能直接充当输入 cap 或上游只计输入的 `limited` 值。两个成员之间没有通用大小关系。上游输入事实 `unknown` 或 `unbounded` 都不免除项目有限 cap；与已知有限上游事实的关系见 S-33。

### S-9 InputConstraints

`inputConstraints` 是**项目供给**的有限限制对象，必填，成员闭合；其类型是模型档案属性的技术投影（无独立词条）。本版恰登记三项：

| 成员 | 精确指标与适用域 | 必填性 |
|---|---|---|
| `maxImageBytes` | 一次请求中**每个实际发送图项**的解码后原始字节数，不是 base64 字符数、data URL 长度、像素数或附件说明值；适用于 `inputModalities` 含 `image` 的档案 | image 档案必填正整数有限 cap，无论这一次请求有没有图 |
| `maxImages` | 一次请求实际发送的图项数，包含实际发送的工具结果图项；重复发送同一内容按发送项分别计，不按内容去重；仅 image 档案适用 | 可选正整数有限 cap |
| `maxRequestBytes` | 最终完整序列化请求体的 UTF8 字节数，包含消息、system、工具、参数和图的最终表示；不含 HTTP headers、压缩或传输分帧；适用于全部档案 | 可选正整数有限 cap |

不支持 image 的档案不得带 `maxImageBytes` 或 `maxImages`，不得用删除已确认模态的方式绕过 cap 要求。`{}` 只可用于不支持 image 且未另设请求体 cap 的档案；它**不陈述上游无限**。可选项目 cap 缺席只表示该项目不另加这一上界，S-32 的上游事实仍须显式给齐，已知有限值仍有效。

未登记的键为 `constraint_unknown`；已登记键不适用、非正整数、必填 cap 缺席为 `malformed`。加指标须出新版本；任意规则表达式不在本版内。上游媒体合计字节数、像素、音频时长等不同指标不能冒充 `maxRequestBytes` 或塞入配置而跳过校验；无法表达或执行的已知约束按 G-15 明确阻断相应发送。

组装选择合规的实际表示，发送边界在所有改写完成后据同一固定快照与最终表示复核；具体操作及拒绝值归消费本值的能力。本契约不授权取得附件字节，`AttachmentRef.bytes` 不能证明实际字节大小。

### S-32 UpstreamInputLimits

`upstreamInputLimits` 必填，是上游输入限制事实的闭合对象。指标名、单位与适用域沿 S-8/S-9：全部档案必有 `maxInputTokens`、`maxRequestBytes`；image 档案另必有 `maxImageBytes`、`maxImages`，非 image 档案不得带这两项。每项统一取 `InputLimitFact`：

| 形状 | 精确含义 |
|---|---|
| `{ "status": "unknown" }` | 该口径的上游限制尚不明确；不是无限，也不是拒绝这个模型 |
| `{ "status": "unbounded" }` | 有依据明确该口径无上游限制；请求成功一次不构成这种依据 |
| `{ "status": "limited", "value": N }` | 有依据的上游有限上限，N 为该指标单位的正整数 |

三支成员分别闭合；只有 limited 带 value。缺键、null、0、空对象、空字符串不表示任一分支。来源与适用供应商、模型修订、窗口换算前提由事实写入者核实；一个档案允许多家供应商时，不得把只对其中一家成立的更宽界限说成全部可发送目标共有的事实。事实不是永远获上游接受的保证；发出时还须遵守所选精确供应商的已知约束。

可明确填写 unknown 而仍供给有限 cap；不能凭没有来源填 unbounded 或捏造有限值。准确模型数值与正式供给清单不是本规范的默认参数。

### S-33 供给上限与上游事实一致

对合法档案与建档内容，`maxInputTokens` 对应上游同名事实，其余 cap 对应 `upstreamInputLimits` 同名项。**凡给出的项目 cap 对应 limited，必须 cap ≤ value**；等于允许。全部比较是同一文档的纯数值比较，JSON Schema 之外执行，违反为 `malformed`（S-25 M16）。unknown/unbounded 不提供数值比较项，也不免除 S-8/S-9 必填 cap。

已知有限上游约束即使没有对应可选项目 cap，仍是实际发送的有效上界。逐图不超限不能推出图数、完整请求体或 token 窗口合规；消费者必须逐项判定所有适用约束。无法测量实际值或证明可靠上界时，不能把判不出来记成超限或通过。

写入者在整份候选文档上校验，拒绝则不产生部分有效文档；目录事务与发送操作仍归各自能力。快照必须原样保留这些相同关系，不能从当前目录补齐或改写。

### S-10 Registration

**[档案在册状态](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-profile-listing-status--档案在册状态--profile-listing-status)恰两值：`listed`（在册）／`withdrawn`（已撤回）。**

| 性质 | 内容 |
|---|---|
| **初值** | 档案产生时是 `listed`（[flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)：建档 → 在册）。以 `withdrawn` 产生一条档案没有这条路径——所以建档的输入不带这个成员（[S-28](#s-28-建档内容产生一条档案时给的那一份)） |
| **两条转移** | `listed → withdrawn`，由**撤回**写下；`withdrawn → listed`，由**恢复在册**写下（[PF-013 §4 在册 / 已撤回](../../../../product/PF-013-model-profiles-and-invocation/design.md#在册--已撤回)、[§6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)、[flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)） |
| **没有终态** | 两值之间可以来回。**恢复的还是原来那一条**：同一格、同一路由名、同一行 |
| **转移本身只改 `registration`** | 撤回与恢复在册**这两条转移**不改任何别的成员，也不动 `updatedAt`（[S-11](#s-11-updatedat)）。**恢复可以与一次属性改写落在同一次提交里**：官方档案的恢复只经清单装入，清单里重现的那一条可以带着改过的属性（`capability.model-profile-directory` v2 S-18 的 `relisted`）——那一次里属性按 [S-12](#s-12-各属性何时定能不能改) 改写、`updatedAt` 按 [S-11](#s-11-updatedat) 只随 S-11 的六项属性动；**变的是那次改写，不是恢复**。「恢复之后其余成员与 `updatedAt` 一个不变」只对**单纯的恢复**成立（`capability.model-profile-directory` v2 S-33 `relistProfile`） |
| **撤回不删行** | 已撤回的档案**仍在、仍读得出**；指向它的引用仍解析到它（[S-14](#s-14-引用只精确解析不跨层)）。**恢复靠的就是行还在**——删了行，既说不出「已下架」，也再恢复不了 |
| **名字仍被占** | 它的路由名在**同一格里**仍被占着（[S-3](#s-3-撞名判定同一范围内唯一)）：同一格里要再用这个名字，是把这一条恢复在册，**不是另建一条** |
| **谁写** | 撤回与恢复在册都由维护档案的能力写下；**谁撤得了一条，谁就恢复得了它**（[PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)）——授权、官方档案经什么途径撤回与恢复，归那份能力契约 |

**这一对取值只说档案自己的状态。**「已撤回的不能被新选中」「会话指着它时说『已下架』而不是『未知模型』」
（[PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)）
**是读它的那些能力的义务**，本契约只保证它们读得到区分这两件事所需的值。
「恢复在册之后，还指着它的会话不用换就接得上」同样不是本契约另加的规则：会话记的是路由名（[S-2](#s-2-routename)），不是引用；这条档案又在册了，那个名字按层覆盖重新落回它（它是链上最具体的那一条时，[CS-1](#cs-1-会话指着一条被撤回的自建档案)），合法目标那次求值自然把它算回来。

**[已撤回 ≠ 这个范围不允许它](../../../../product/PF-013-model-profiles-and-invocation/design.md#在册--已撤回)。**后者档案照样 `listed`，是作用域求值的结果变了；**它不写进 `registration`**。
两者用户要做的事不同（换一个 / 去找管理员），所以不共用一个取值。

### S-11 updatedAt

`updatedAt` 是 `inputModalities`、`outputModalities`、`maxInputTokens`、`maxOutputTokens`、`inputConstraints`、`upstreamInputLimits` **六项中最近一次值变化的时刻**，同时涵盖项目供给调整与上游事实更新；建档时取建档那一刻。

- 六项任一值改变都须记本次写入时刻，时间点不早于此前值；同一时钟精度内可相等，不构成修订身份。六项均不变则保留原值，即使写入发生在更晚时刻。
- 模态按集合比；数按数值比；两个限制对象按完整 JSON 值比，对象成员顺序不参与，`unknown`→`limited`、`unbounded`→`unknown` 与 limited.value 变化均是值变化（S-28）。
- 仅 `providers`、`allowFallback`、`parameters`、`registration` 或 `adaptation` 改变不动此时刻。单纯撤回或恢复不动；恢复同时改六项之一则按本条动。
- 继承 S-18 的输出上限例外只管 `maxOutputTokens`，不冻结输入 cap 或上游事实；其余五项有变化照常推动时刻。
- 形状沿 [`data.offer-expiry/v1#S-22`](../../offer-expiry/v1/contract.md#s-22-schema-的范围) 的 Instant；按时间点而非字典序比较。不提供可回填历史快照的权限。

### S-12 各属性何时定、能不能改

按 [PF-013 §4 属性表](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)的「何时确定」一列：

| 属性 | 何时定 | 能不能改 |
|---|---|---|
| `routeName` | 建档 | **不能**——身份分量（[S-2](#s-2-routename)） |
| 所在范围 | 建档 | **不能**——身份分量；**不存在「把档案挪到另一层」**，挪过去就是另一条 |
| `origin` | 产生时 | **不能**（[S-4](#s-4-profileorigin)） |
| `providers`、`allowFallback` | 建档 | 可改 |
| `inputModalities`、`outputModalities`、`maxInputTokens`、`maxOutputTokens`、`inputConstraints`、`upstreamInputLimits` | 建档 | 按上游事实与项目供给的明确变化更新；每次取值变化推动 `updatedAt`（[S-11](#s-11-updatedat)）。**一个例外，只管 `maxOutputTokens` 这一项**：上游把输出上限降到档案 `parameters.maxOutputTokens` 之下时，这一项不跟着降（[S-18](#s-18-档案参数的输出上限)）；其余五项照常更新 |
| `registration` | 建档时为 `listed`（由产生档案的一方写，不在建档内容里，[S-28](#s-28-建档内容产生一条档案时给的那一份)） | 只经撤回（`listed → withdrawn`）与恢复在册（`withdrawn → listed`）两条边变化（[S-10](#s-10-registration)） |
| `updatedAt` | 建档时为建档那一刻（同上，由产生档案的一方写） | 只按 [S-11](#s-11-updatedat) 动；没有别的写路径 |
| `parameters` | 建档时可给 | 可改，含整份去掉 |
| `adaptation` | 建档必给 | 可显式整体更新 `implementation`、`definition`、`configuration` 三组分量，换成另一完整绑定；各修订不得原地改义（S-29），`definition.modelId` 仍须等于不变的 `routeName`（S-31）。这项变化不改变 S-11 的 `updatedAt` 规则，也不改变已取出的快照（S-27） |

**改完之后的整份文档仍须通过[表示层校验](#s-24-表示层校验是一次纯计算)**——
尤其是 [S-18](#s-18-档案参数的输出上限)：把 `maxOutputTokens` 改到低于 `parameters.maxOutputTokens`，
改完的文档就是 `max_output_exceeds_profile`，**整份被拒**，不是「跳过这一项、写其余几项」。所以上游收紧到参数值之下时，
写档案的一方要的是**不带这一项改动**地写其余的变化；`maxOutputTokens` 保持原值，差额在发出时处理（[S-18](#s-18-档案参数的输出上限)）。

**谁能改、改的前置、并发两次改的收场**，归维护档案的能力（`capability.model-profile-directory` v2）。

### S-13 ModelProfileRef

**`ModelProfileRef` 是指向一条档案的引用，按 `origin` 判别，恰两支：**

| 支 | 形状 | 指向 |
|---|---|---|
| 官方 | `{ origin: "official", routeName }` | 路由名为 `routeName` 的那一条**官方档案** |
| 自建 | `{ origin: "custom", scope, routeName }` | 所在范围为 `scope`、路由名为 `routeName` 的那一条**自建档案** |

**它只在目录内部与治理面上指认一行**：建档、撤回、恢复、修订、按引用读一条、列表上的每一项，以及一次请求的[有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)——这一次落到的那一行——和它的留痕，都用这个值。
**「用哪个模型」那项设置与会话的选中模型记的不是它，是路由名**（[S-2](#s-2-routename)）：[设置记的是路由名，但这个名字背后必须是一条档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用)，
它在一条范围链上落到哪一行由按层覆盖定（[S-14](#s-14-引用只精确解析不跨层)；PF-013 rev 12 [§4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)）。

- **`origin` 取 [S-4](#s-4-profileorigin) 的两值，必填**：它决定引用长哪一支，也决定解析去哪一类档案里找（[S-14](#s-14-引用只精确解析不跨层)）。
- **官方那一支不带范围分量。**出厂默认层[由系统充当，没有身份对象](../../identity-values/v1/contract.md#s-11-scopelayeridentity)，
  那份契约写明消费者不得为它补一个身份值，本契约也不补。**这一支成立的前提是**：官方档案全在出厂默认层这一格（[S-4](#s-4-profileorigin)），
  而同一格里路由名不重复、含已撤回行（[S-3](#s-3-撞名判定同一范围内唯一)）——单凭路由名就指得清一条官方档案。
  别的格里可以有同名的自建档案，但解析只在官方档案里找（[S-14](#s-14-引用只精确解析不跨层)），不会混。**官方档案一旦不止在一格，这一支就指不清，必须一起改。**
- **自建那一支的 `scope` 是 [`data.identity-values/v1#S-11`](../../identity-values/v1/contract.md#s-11-scopelayeridentity) 的 `ScopeLayerIdentity`**，`$ref` 它，不复制。
  **必填、没有默认值**：缺席、`null` 都不是一个范围（[`#S-12`](../../identity-values/v1/contract.md#s-12-缺席与空值都不是身份值)），
  **不得**用「当前租户」「当前组织」或别的环境值补上（[`#S-17`](../../identity-values/v1/contract.md#s-17-身份参数没有默认值)）。
  它**存成带判别式的那一个值**，不压平成两个可空字段（[`#S-16`](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)）。
  **它是消歧所需的分量**：自建名只在所在那一格里唯一，别的格里（官方那一格、同一个组织的组织层与租户层、别的组织）可以有同名的档案，
  只有（所在范围, 路由名）这一对挑得出至多一条（[S-1](#s-1-档案的身份所在范围与路由名)）；它同时**让归属层身份随引用显式到达**，并让解析核对得了它。
- **两支互斥**：官方那一支带了 `scope`、自建那一支缺了 `scope`、`origin` 缺席或不在两值之内，一律是 `malformed`——
  **缺 `origin` 不表示「官方」，缺 `scope` 也不表示「官方」**。
- **`routeName` 是 [S-2](#s-2-routename) 的路由名。**
- **相等按分量**：`origin` 相等；自建那一支再要 `scope` 按判别式与载荷相等（载荷的相等按 [`#S-5`](../../identity-values/v1/contract.md#s-5-tenantid-的构成与相等)／[`#S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)）；`routeName` 逐码点相等。全部分量相等才是同一个引用。
- **引用不是授权。**持有一个指向某租户层自建档案的引用，不表示持有者可以用它；
  能不能用，是合法目标集合那次求值的事。

将来「默认主模型 ＋ 可选路由模型组」那类设置（[G-10](#十已知缺口)）照同一规矩记若干个路由名，**本版不为「一组」另立形状**。

### S-14 引用只精确解析，不跨层

**一个引用解析到恰一条档案或没有：官方那一支解析到「`origin` 为 `official`、路由名恰为 `routeName`」的那一条；
自建那一支解析到「`origin` 为 `custom`、所在范围恰为 `scope`、路由名恰为 `routeName`」的那一条。**

- **每个给出的分量都要对上**：官方那一支按路由名在官方档案里至多找到一条，自建那一支按（所在范围, 路由名）至多找到一条（[S-1](#s-1-档案的身份所在范围与路由名)）；
  **找到的那一条的来源或所在范围与引用对不上，就是「查无此条」**——不是「差不多就是它」。
- **不跨层搜索**：不在租户层找不到就去组织层、再去官方找；**不回退**到别层的档案、也不回退到任何「最接近」的一条。**引用一旦给出，解析就是精确的**。
- **引用只在目录内部指认一行；设置与模型切换落下的那条记录记路由名，落到哪一行由按层覆盖定。**「用哪个模型」那项设置与会话的[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)落下的那条记录记的是 `RouteName`（[S-2](#s-2-routename)），不是引用（PF-013 rev 12 [§4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)）。
  从一个路由名到一行**只有一个入口**：`capability.model-profile-directory` v2 S-17 的按层覆盖——在一条范围链上**先滤掉已撤回的与这个范围不允许的，再取最具体一格**（租户 > 组织 > 出厂默认）。它产出的是一个引用，那个引用照样按本条精确解析。
  **两件事不混**：按层覆盖从名字出发、在链上挑一行；本条从引用出发、只认那一行。本条禁止的是一个引用解析不到时往别的格里找——**覆盖不放宽它**：引用解析不到仍是「查无此条」，解析到一条已撤回的仍是那一条。
- **一次有效的引用永远解析到同一条**：行不删（[S-10](#s-10-registration)）、（所在范围, 路由名）不复用（同一格里再用一个已撤回的名字是把那一条恢复在册，不是另建，[S-3](#s-3-撞名判定同一范围内唯一)）、
  身份分量不可改（[S-12](#s-12-各属性何时定能不能改)）——三条合起来，**已撤回的档案仍被它的引用解析到**，读的一方据此[说得出「已下架」](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架)；
  **恢复在册之后解析到的仍是同一条**。
- **解析的三种收场不得互相折叠**：

  | 收场 | 是什么 | 不得被读成 |
  |---|---|---|
  | 解析到一条 | 它的 `registration` 可能是 `listed` 或 `withdrawn` | —— |
  | 查无此条 | 这个引用**从来没有指向过**一条档案（构造错了），或存储丢了一行（完整性被破坏）；**两者都明确失败** | 「已撤回」「未知模型、换一条默认的」 |
  | 读不到 | 存储这一次不可用 | 「查无此条」「已撤回」 |

  **失败值名归提供读面的能力**（`capability.model-profile-directory` v2）；本契约只要求三者**结果值不同**、都以返回值到达调用方。

### S-27 ModelProfileSnapshot：档案在某一刻的副本

**`ModelProfileSnapshot` 是一条档案在某一刻、发出与重试要用到的那几项属性的副本**：`providers`、`allowFallback`、`inputModalities`、`outputModalities`、
`maxInputTokens`、`maxOutputTokens`、`inputConstraints`、`upstreamInputLimits`、`parameters`（可缺席）、`adaptation`，以及这份记载的 `updatedAt`。各项的取值域与 `ModelProfile` 的同名成员逐字相同。

- **它是值，不是引用**：档案后来被改、被撤回，快照一个字不变。指认它是哪一条档案，靠与它**成对交出**的 `ModelProfileRef`（[S-1](#s-1-档案的身份所在范围与路由名)）；快照自己不带路由名与来源。
- **家在本契约，消费者 `$ref` 它**：一次调用绑定的那一份记在响应体的路由留痕上，「调模型之后 · 失败」位置的拓展件也拿到同一份（主线裁定，见 D-060 §块 C 对账 C-R1：不给档案加修订身份，快照跟着发出记录走）。
  放在这里而不放在那两份契约里，是因为两份都要用、而它们之间一份引用另一份——形状只能有一个两边都能引用的家。
- **成员集合闭合**：它不带在册状态（发出那一刻是否在册由出门前检查判，不是快照的事）。全部输入 cap 及对应上游事实都带入：组装、重试与最终发送检查消费同一副本。
- **[S-18](#s-18-档案参数的输出上限) 的关系在快照上照样成立，但快照不是表示层校验的一种文档**：它是一份已通过表示层校验的档案在某一刻的**原样副本**，
  `parameters.maxOutputTokens` 不超过 `maxOutputTokens` 由「照原样复制」保证。**照原样复制是写快照一方的义务**（打开调用、绑定快照的模型请求运行时）；
  收快照的一方（响应体、「调模型之后 · 失败」的拓展件）**不对它重做表示层校验，也没有为它设的拒绝值**——一份违反这条关系的快照说明写的一方没有照原样复制，那是写入者的错，不是一个要被收的一方判出来的值。
- **限制与事实完整复制**：S-8/S-9/S-32 所有适用成员在同一次完整读取中与 S-11 时刻一起复制，保持 S-33；后续目录更新、调用续接、失败主体和响应记录都不得更换这份副本或只存指向当前值的引用。每次新输入仍需按这份 cap 重新计量；快照固定不免除实际发送校验。跨进程边界仍校验其形状，不能以“不重判写入者关系”解释为接受缺成员的新版快照。
- **`adaptation` 连同 `configuration.values` 原样进入快照**：不能只存配置修订再读取当前档案或别的档案；打开调用的一方负责冻结或复制值，并校验注册实现及窄定义的可用性。调用绑定不随以后更新变化；注册与在途版本的保持机制归运行时契约和提供者映射。

### S-28 建档内容：产生一条档案时给的那一份

**建档内容（`ModelProfileContent`）是 `ModelProfile` 去掉 `registration` 与 `updatedAt` 之后的那一份：**
其余每个成员、各自的取值域、必填与可缺席，以及 [S-18](#s-18-档案参数的输出上限) 及 S-33 的跨字段比较，与 `ModelProfile` **逐字相同**。

- **这两个成员由产生档案的一方在提交时写**：`registration` 的初值是 `listed`（[S-10](#s-10-registration)），`updatedAt` 是建档那一刻（[S-11](#s-11-updatedat)）。
  **不由给内容的一方给**：给了 `withdrawn`，就是以已撤回产生一条档案——S-10 没有这条路径；给了一个时刻，就是替写入者定了「建档那一刻」，还可能早于它，让 `updatedAt` 从第一刻起就是假的。
- **带了其中任何一个即 `malformed`**（[S-25](#s-25-拒绝值闭合一次恰一个) M12）：**不忽略**，也**不按给的值写**——忽略会让调用方以为生效的值静默消失；按给的值写就违反上一条。
  所以一份带着 `registration: "deleted"` 的建档内容报的是 `malformed`，不是 `registration_unknown`：这个成员根本不该出现。
- **它是[表示层校验](#s-24-表示层校验是一次纯计算)的第四种文档**，适用的拒绝值见 S-25 的末列；**只跑 Schema 同样会放过 `max_output_exceeds_profile`**。
- **谁收它**：本批候选消费者的建档（`capability.model-profile-directory` v5 S-14）的输入与官方清单的每一条（同一份契约 S-18）。那份契约写的是「来源必须是哪一个」「在哪一格」「与已有那一行是否相同」；本条只定这份文档是什么形状、被拒成哪个值。
- **两份建档内容相等，是逐成员相等**；两份档案的同名成员比较也用这一套：路由名与供应商名逐码点（[S-2](#s-2-routename)、[S-5](#s-5-providername-与允许的供应商)）；
  `providers` 按序列比（次序有含义）；两组模态按集合比（次序没有含义，[S-7](#s-7-modality-与两组模态)）；数按数值比；`inputConstraints`、`upstreamInputLimits`、`parameters` 与 `extra` 按 JSON 值比（对象成员的次序不参与）；
  `adaptation` 按 S-29 的完整分量和值比较，不只比较修订字符串；可缺席的成员两边都缺席才算相等。[S-11](#s-11-updatedat) 的「值变了」与维护档案的能力的「同内容认回」都按这一套判。

### S-29 ModelAdaptationBinding

**模型适配绑定**（[UL-model-adaptation-binding](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-adaptation-binding--模型适配绑定--model-adaptation-binding)）
是档案与调用快照上的属性，不是独立领域对象。`ModelProfileContent`、`ModelProfile`、`ModelProfileSnapshot` 都必须有 `adaptation`，取本条唯一公共定义 `ModelAdaptationBinding`。

| 分量 | 形状与含义 | 修订的命名域 |
|---|---|---|
| `implementation` | 必填 `{ name, revision }`，指认公共实现及其家族规则的同一份发布版本；家族规则包含在该实现修订内，不再分出一个身份 | `revision` 在 `name` 内解释 |
| `definition` | 必填 `{ modelId, revision }`，指认精确模型的窄定义；`modelId` 不从实现名字或路由名前缀推断 | `revision` 在 `modelId` 内解释 |
| `configuration` | 必填 `{ revision, values }`，保留采用的声明式配置值；`values` 的口径见 S-30 | `revision` 在所在档案身份内解释；独立函数没有档案时，调用者须提供同等的配置来源上下文 |

绑定及上述三个对象的成员集合均闭合。全部 `name`、`revision`、`modelId` 都是非空字符串，首尾不得出现 S-2 采用的显式空白码点；比较逐码点精确，不裁剪、不折叠、不规范化。不得用运行时对象的实例编号（包括 Cordis Fiber uid）替代修订。

**每个修订在自己的命名域内不得原地改变含义**：改公共实现或家族规则、改同一模型的窄定义、或改同一配置来源的 `values`，须分别使用不同的对应修订。不同档案可以各自使用同一个配置修订字符串，不能据此把它们当成同一配置来源。

**绑定值相等须比较全部分量**：五个字符串（`implementation.name/revision`、`definition.modelId/revision`、`configuration.revision`）逐码点相等，且 `configuration.values` 是同一个 JSON 值；对象成员次序不参与、数组按序、数按精确数值比较。绑定的复制与留存必须同时保留 `values`，不得只用配置修订去读取另一条档案或当前配置。值相等不授予配置来源身份或访问资格。

绑定不含租户身份、凭据或独立授权。档案范围身份仍按 S-1、S-13 成对携带；同一绑定被自建档案复用，不改变该档案的 `custom` 来源，也不自动获得官方认证（S-4）。

### S-30 配置值与写入者义务

`configuration.values` **必填，取 JSON 对象**，可以明确写 `{}`；缺席或 `null` 不等于空配置，表示层拒绝且不补值。
JSON 文本的严格读取、任意深度重复成员拒绝和十进制数无损义务，引用
[`data.content-blocks/v2#S-24`](../../content-blocks/v2/contract.md#s-24-规范表示)。
本版不另定义 JSON 值代数；Schema 用 `type: object` 表达对象限制，不假定所引版本存在 `JsonObject` 的 Schema 定义。重复成员必须在解析成对象之前拒绝，不能先取任意一个成员再做 Schema 校验；不能先丢失数值精度再声称保存的是原配置。

**配置只承载声明式的值，不承载可执行代码或秘密、凭据。**自建档案复用已注册的实现及窄定义，配置不能成为另一个加载任意代码的入口。禁止秘密与凭据是写入者及其接收边界的义务，Schema 不会从任意字符串中识别秘密；形状通过不证明该义务已兑现。

[模型前缀缓存策略](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-prefix-cache-policy--模型前缀缓存策略--model-prefix-cache-policy)
的自动或显式方式、适用 TTL 等由这些配置值承载；本契约不规定供应商字段名、TTL 枚举或默认 TTL，不将缓存配置解释为上游已写入或命中缓存。
**所选注册实现与模型窄定义共同限定可用配置**；它们负责校验某个值是否受所选路由支持。表示层允许 `{}` 不表示注册实现必须接受它，也不授权填入隐藏默认值。

注册是否存在、版本是否可用、配置是否适用及拒绝后的收场，归调用准入的运行时契约；本 data 契约不把这些跨记录判定伪装为表示错误，也不新增其失败值。

### S-31 模型定义与档案对齐

**在 `ModelProfile` 与 `ModelProfileContent` 中，`adaptation.definition.modelId` 必须与 `routeName` 逐码点相等。**
S-2 已将 `routeName` 定为上游认的模型名，本版不引入可指向另一模型的别名。模型定义修订只在同一模型 ID 内演进；改模型 ID 仍意味着另一条档案。

这个跨字段比较在表示层校验内完成，不读其他记录。JSON Schema Draft 2020-12 不能表达两个字段相等，Schema 通过后仍须比较；`routeName` 本身先满足 S-2 才执行本比较，避免把原有的 `route_name_empty` 改报为错配。错配为 S-25 的 `malformed`，优先于参数越界或输出上限等后续拒绝值。

`ModelProfileSnapshot` 不带 `routeName`，由写快照的一方从通过校验的档案完整复制 `adaptation`；该方同时保持与档案引用的对应性。收快照的一方不新增本条的独立表示层拒绝值（S-27）。公共函数若独立接受绑定与模型名，其对应性校验及不可用时的收场归该函数契约。

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
  那一步归模型请求运行时（[`capability.model-request-runtime/v2#S-7`](../../../capabilities/model-request-runtime/v2/contract.md#s-7-一次调用绑定了什么)）；覆盖能否去掉一项是 [G-8](#十已知缺口)。
- **上游把输出上限降到档案 `parameters.maxOutputTokens` 之下时，档案的 `maxOutputTokens` 不跟着降**（主线裁定，见 D-060 §S6 S6-c）：
  既不把这一项更新到新上限（那会让文档违反本条），也不把建档者给的参数夹到新上限（那是替他改了他给的值）。
  **差额在发出时处理**：adapter 按 [S-21](#s-21-不静默丢也不静默改) 的「改了值再发出」发一个上游收得下的值，并**记下实际发出的那个值**。
  **这条义务归模型请求运行时**（它的 adapter）；代价是档案的 `maxOutputTokens` 这一刻起比上游的实际上限高（[S-11](#s-11-updatedat)）。
  **有前提：「上游此刻的输出上限」这一事实有来源。**本版没有——档案不跟着降，传输也不取上游模型目录（`capability.model-request-runtime` v2 的 G-22；主线裁定，D-060 §八 N-40 ④）；**闭合之前不改值、按参数原样发**，上游因此拒收时照那份契约 S-18 归成因。来源候选是本契约将来某个新版本的档案属性。
- **这个例外只管 `maxOutputTokens` 这一项，不管整次更新**：同一时刻上游另外改了模态、窗口或送进去之前的限制，那几项照常更新、照常推动 `updatedAt`（[S-11](#s-11-updatedat)、[S-12](#s-12-各属性何时定能不能改)）。
  一份把这一项降到参数值之下的文档本身过不了表示层校验、**整份被拒**；写档案的一方不带这一项的改动重写即可。
  这样定，两个实现同步同一次上游变化之后得到同一份记录：其余适用项新、`maxOutputTokens` 旧。**只跳过这一项而不是整份不写**，是因为冲突只在这两个数之间；
  其余适用项是独立的事实，跟着一起搁置会让合法目标与组装读到过期的模态与窗口。

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
- **要指认某一项的地方用这个名字**——尤其是「改了哪几项的值、哪几项没发出去」那两份留痕：响应体的路由留痕（`data.model-response`），与同一次发出在出门之前就写下的「已出门」记录（`data.messages` v2 S-49）。

### S-21 不静默丢，也不静默改

**对一次请求实际要用的每一项参数**（档案给的，加上拓展件为这一次改过的），**adapter 恰有三种处置之一：**

| 处置 | 留痕（形状在 `data.model-response` v2 S-11） |
|---|---|
| 按原值发出 | 实际发出的那一组里记它的原值 |
| **改了值再发出**（上游没有这一档、取值域更窄……） | 实际发出的那一组里**记实际发出的值**，而不是原值；另记一条「改过的值」：项名、要求的值、发出的值 |
| 没发出 | **记下这一项的名字**（[S-20](#s-20-项与项名)）；它不在实际发出的那一组里 |

**没有第四种**（[PF-013 §4 属性表「请求参数」一行：上游不认的项不静默丢，留痕](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)）：**静默丢一项、或静默把值换成另一个**（把 `max` 换成 `high`、把 2.5 夹到 2）都违反本条。
**译成上游的字段名不是改值**；**换了取值才是**。

- **统一项与 `extra` 项一视同仁。**
- **上游输出上限已低于档案参数（[S-18](#s-18-档案参数的输出上限)）是第二种处置的一个固定情形**：`maxOutputTokens` 改成上游收得下的值再发出，记下实际发出的值。
- **留痕的形状归 `data.model-response`**：它路由留痕上的三个成员——`parameters`（实际发出的那一组，以本契约的 `ModelRequestParameters` 表示）、`parameterAdjustments`（改过值的那几项）、`droppedParameters`（没发出的项名，`extra` 项以它的键为名）；本契约只立义务。
- **谁兑现**：翻译参数的那一层（模型请求运行时的 adapter）。

## 五、有意不放的

### S-22 凭据、价格与实际用了哪条都不在档案上

| 不放什么 | 为什么 | 它的家 |
|---|---|---|
| **[模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)** | [凭据挂在范围上](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)，[档案自己不存](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存)；出厂默认那一格的那一把在部署装配阶段配置 | 租户身上的一项属性，组织那一层不持有（绑定与取用归 `capability.model-profile-directory` v2） |
| **价格** | 实际费用从响应里拿，目录估算不得冒充实扣；档案上放一个价格，就会有人拿它当账 | `data.call-accounts`（一次调用的费用）与 `data.model-response` |
| **「这次实际用了哪条」** | [那是一次请求的可追溯组成，是历史](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) | `data.model-response` 的路由留痕（它**引用**档案） |
| **超时、退避等时限** | [本 topic 不出现任何时限数值](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)；它们是重试件的配置，走资产那一套 | 重试件（拓展件，第八类资产）的设置 |
| **能力评分** | [产品负责人裁决不留](../../../../product/PF-013-model-profiles-and-invocation/design.md#七取舍)：零消费者 | —— |

**这些成员出现在一份档案文档里即拒（`malformed`）**；档案的**任何交换表示**里都不得出现凭据，
Schema 只挡住未登记的外层成员；`extra` 与 `adaptation.configuration.values` 的任意内容是否含秘密，Schema 无法判定。不得放入秘密或凭据是写入者义务，所有交换表示须保持该义务（S-30；[验证入口](../verification.md#证据义务)）。

## 六、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

### S-23 跨部署形态会变的判定

> **本表只列兑现方式随部署形态改变的判定**；右列写**分布式必须由协议重新兑现什么**，末列写**做不到会怎样**。
> 写「不变」的几行是纯值判定，**那个结论本身也要写出来**。**这张表是契约的一部分**：装配给的那些，演化到分布式时不会自动成立。

| 判定 | 单机由谁给 | 分布式必须由协议重新兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **撞名判定**（[S-3](#s-3-撞名判定同一范围内唯一)） | 同一格的档案行在同一存储，建档写入串行，判定读到的名字与写入同一次提交 | 判定只读同一格的名字：**每一格**须有单一裁决点或条件写入——按格分片成立（不同格互不相干），「先查后写」跨两个节点不成立 | 两个节点各自在同一格里放行同一个名字：两条同一身份的档案，引用指不清 |
| **`updatedAt` 不后退**（[S-11](#s-11-updatedat)） | 单一时间源，不后退 | 多个写入者的时间源须可比，且写入须保证不早于此前的值 | 较新的记载带着较早的时刻，按它判新旧会判反 |
| **在册状态的转移、已撤回仍读得到**（[S-10](#s-10-registration)） | 同一行，撤回与恢复在册都是对这一行的写，按提交先后排定 | 副本上的读须**按写入先后单调**：读到过某一次转移之后的状态的一方，此后不得再读到那次转移之前的状态 | 一条刚撤回的档案在某个节点上仍被当作在册、被新选中；或一条刚恢复的档案在某个节点上时而在册、时而「已下架」 |
| **自建引用的范围分量随请求到达**（[S-13](#s-13-modelprofileref)） | 同一进程内传参 | 每一跳的传输格式**原样**承载 `origin` 判别式与带判别式的 `ScopeLayerIdentity`，不压平（[`data.identity-values/v1#S-16`](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值)）；接收边界**重验**持有者有没有资格用它（[`#S-30`](../../identity-values/v1/contract.md#s-30-跨边界须重新验证)） | 压平后丢了 `scope` 的自建引用被读成官方引用、或一个远端节点按引用直接用了另一个租户的自建档案 |
| **不静默丢、不静默改**（[S-21](#s-21-不静默丢也不静默改)） | adapter 与写「已出门」、写响应体的一方在同一进程，处置在出门之前当场可知 | adapter 若在另一个进程，**「改过的值（项名、要求的与发出的）」与「没发出去的项」须在出网之前交回写「已出门」的一方**、落进那条记录，出网时照它还原得出的那一组发、出网之后不再改（`capability.model-request-runtime` v2 S-38 传输适配第 10 条；`data.model-response` v2 S-25 同一行）；**只随那次调用的结果一起回传不够** | 请求出网之后、结果回来之前停机：「已出门」上没有这两项，补写的响应体按「缺席即断言」记成「没改、没丢」——**一条假留痕**；丢掉或改掉的项在跨进程那一跳上无痕 |
| **引用解析**（[S-14](#s-14-引用只精确解析不跨层)） | 值比较 | **不变**——纯值相等；但「读不到」在跨进程后先表现为传输层故障，须映射成那一种失败，**不得折成「查无此条」** | —— |
| **表示层校验**（[S-24](#s-24-表示层校验是一次纯计算)） | 纯计算 | **不变** | —— |
| **绑定完整留存、修订不改义**（S-27、S-29、S-30） | 写入者保持完整绑定与配置来源，调用绑定从当时档案复制；同一命名域下修订不改义 | 每一跳携带同一绑定值及所需配置来源身份，严格无损读写；各写入者对同一修订仍保持同一含义，接收方不能按配置修订跨档案取值 | 历史请求或不同租户取得变化后的策略/配置，无法确定当时实际采用的版本 |

## 七、表示与边界校验

- **规范表示**：[`model-profile.schema.json`](model-profile.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/model-profile/v5/model-profile.schema.json`
- **定义项**（14 项）：`ModelProfile`、`ModelProfileContent`、`ModelProfileSnapshot`、`ModelProfileRef`、`RouteName`、`ProfileOrigin`、`ProviderName`、
  `InputConstraints`、`Registration`、`ModelRequestParameters`、`ReasoningEffort`、`ModelAdaptationBinding`、`InputLimitFact`、`UpstreamInputLimits`。消费者 `$ref` 这些定义，**不复制一份同义类型**。
  `Modality` 不在其中：两组模态 `$ref` `data.content-blocks` 的 `$defs/Modality`（[S-7](#s-7-modality-与两组模态)）。
- **根模式不约束任何文档**：本文件是共享定义的登记处。
- **正反实例**：[`examples.md`](examples.md)，本版的规范工件。

### S-24 表示层校验是一次纯计算

**表示层校验对一份文档求值，结果是「通过」或恰一个拒绝值（[S-25](#s-25-拒绝值闭合一次恰一个)）。**
文档是四种之一：`ModelProfile`、建档内容 `ModelProfileContent`（[S-28](#s-28-建档内容产生一条档案时给的那一份)）、`ModelProfileRef`、`ModelRequestParameters`（独立值）。
档案快照（[S-27](#s-27-modelprofilesnapshot档案在某一刻的副本)）不是其中一种：它是原样副本，收它的一方不重做校验。

它不是一个操作，但它会被每个建档、写档案、收引用、收参数的地方调用，所以把九件事写在这里：

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
| 9 | 装配给 vs 协议给 | 不变（[S-23](#s-23-跨部署形态会变的判定) 的「表示层校验」一行） |

**它包含 Schema 校验与 Schema 之外的跨字段比较**：对 `ModelProfile` 与建档内容，S-31 的 `definition.modelId` 与 `routeName` 必须相等，S-33 要求项目 cap 不大于同名上游有限值，再按 S-25 的优先级处理 S-18 的输出上限。
**合起来才是表示层校验**；只跑 Schema 的实现会放过模型定义错配、S-33 输入 cap 冲突和 `max_output_exceeds_profile`。配置 JSON 文本先按 S-30 严格无损读取；实现与配置是否可用不是本纯计算的结论。

### S-25 拒绝值闭合，一次恰一个

**拒绝值恰十个，没有「其他」。一份文档命中多条时，取下表中最先命中的那一个。**

| 次序 | 拒绝值 | 条件 | 适用于 |
|---|---|---|---|
| 1 | `malformed` | 下列任一：**M1** 文档不是 JSON 对象；**M2** 缺必填成员（引用缺 `origin`、自建那一支缺 `scope` 都在此）；**M3** `ModelProfile`、建档内容、`ModelProfileRef` 或 `ModelRequestParameters` 里出现未登记的成员（官方那一支带了 `scope` 也在此；`inputConstraints` 里的未登记键不在此，归第 10 行；建档内容里的 `registration`、`updatedAt` 不在此，归 M12）；**M4** 成员或数组元素的 JSON 类型不对（含该整数处给了带小数的数、`null`）；**M5** 档案、建档内容或引用的 `origin` 不在两值之内；**M6** `providers` 或两组模态有重复元素，或 `providers` 有空串元素；**M7** 路由名首尾是空白；**M8** `maxInputTokens`、`maxOutputTokens` 或 任一已登记输入 cap 或上游 limited.value 小于 1；**M9** 自建引用的 `scope` 不是合法的 `ScopeLayerIdentity`；**M10** 档案或建档内容上的 `parameters` 或任何 `extra` 是空对象，或 `extra` 的键为空串、与统一词表的成员名相同；**M11** `updatedAt` 不是时间点；**M12** 建档内容里出现 `registration` 或 `updatedAt`（[S-28](#s-28-建档内容产生一条档案时给的那一份)）；**M13** `adaptation` 或它的三组成员形状不合法、必填字符串为空或首尾空白，或配置文本违反 S-30 的严格 JSON；**M14** 档案或建档内容的 `adaptation.definition.modelId` 与 `routeName` 不相等（S-31；只在 `routeName` 本身通过 S-2 后比较）；**M15** 上游事实分支形状错误，或 image 指标的必填/禁用条件违反 S-9/S-32；**M16** 项目 cap 大于同名已知有限上游事实（S-33，仅在比较双方结构、适用域与数值均合法时比较） | 四种 |
| 2 | `route_name_empty` | 路由名是空串 | `ModelProfile`、建档内容、`ModelProfileRef` |
| 3 | `providers_empty` | `providers` 是空数组 | `ModelProfile`、建档内容 |
| 4 | `modalities_empty` | `inputModalities` 或 `outputModalities` 是空数组 | `ModelProfile`、建档内容 |
| 5 | `input_text_missing` | `inputModalities` 非空但不含 `text`（[S-7](#s-7-modality-与两组模态)） | `ModelProfile`、建档内容 |
| 6 | `modality_unknown` | 两组模态里有一个字符串不是四个 token 之一 | `ModelProfile`、建档内容 |
| 7 | `registration_unknown` | `registration` 是一个字符串，但不是两值之一 | `ModelProfile`（建档内容里出现 `registration` 已在第 1 行命中 M12） |
| 8 | `parameter_out_of_range` | 某一项参数类型对、值不在 [S-16](#s-16-各项的取值域) 的域内（含 `reasoningEffort` 不在五档、`stopSequences` 为空数组或含空串） | `ModelProfile`、建档内容、`ModelRequestParameters` |
| 9 | `max_output_exceeds_profile` | 档案或建档内容上 `parameters.maxOutputTokens` 大于同一份文档的 `maxOutputTokens`（[S-18](#s-18-档案参数的输出上限)；Schema 之外） | `ModelProfile`、建档内容 |
| 10 | `constraint_unknown` | `inputConstraints` 里出现未登记的键 | `ModelProfile`、建档内容 |

- **`malformed` 排第一**：结构都不完整的文档，报不出一个有意义的具体原因。其后九个只对结构完整的文档报。
- **`input_text_missing` 先于 `modality_unknown`**：`["image", "file"]` 报 `input_text_missing`。
- **次序是一致性的要求**：两个实现对同一份多处违规的文档须报同一个值，[`examples.md`](examples.md#多处违规与跨字段比较)与机读实例固定这些优先级。
- **判定失败值 `route_name_taken` 不在本表**（[S-26](#s-26-表示层拒绝与判定分开)）。

### S-26 表示层拒绝与判定分开

- **表示层拒绝在任何判定之前发生**，它不表示「这个名字被占了」「这条档案不存在」或「这个人不能用它」，**不得被记成一次判定结果**
  （与 [`data.identity-values/v1` 的 S-33](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开) 同一条规矩）。
- **通过不表示任何资格**：一份合法的档案文档**不表示它的路由名没被占**（那是 [S-3](#s-3-撞名判定同一范围内唯一)）；
  一个合法的引用**不表示它解析得到**（[S-14](#s-14-引用只精确解析不跨层)）、**更不表示持有者能用它**（[S-13](#s-13-modelprofileref)）。
- **`route_name_taken` 是判定失败值**：它只在表示层校验通过之后、由建档操作求出。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 表达不了的那部分归谁 |
|---|---|---|
| [S-1](#s-1-档案的身份所在范围与路由名) 身份 | 只管「记录里没有 `scope` 这类成员」 | 所在范围怎么存、档案与引用成对交出——持有档案的 owner |
| [S-2](#s-2-routename) 路由名 | **管**非空、首尾无空白 | 「本系统不解析」「建档后不可改」——静态检查与维护档案的能力 |
| [S-3](#s-3-撞名判定同一范围内唯一) 撞名 | **管不到**——要读同一格里的别的记录 | 建档操作，与写入同提交（`capability.model-profile-directory` v2） |
| [S-4](#s-4-profileorigin) 来源 | 管取值域 | 「由产生方式决定」「与所在范围一一对应」——维护档案的能力 |
| [S-5](#s-5-providername-与允许的供应商)、[S-6](#s-6-允不允许回退) 供应商与回退 | 管非空、无重复、布尔 | 「只发往列表里的」「每次只走一家」「不整份交给上游」——模型请求运行时 |
| [S-7](#s-7-modality-与两组模态) 模态 | **完全管得到**：四值闭合、非空、无重复、`inputModalities` 必含 `text` | 两处对得上——合法目标那次求值 |
| [S-8](#s-8-两个上限) 两个上限 | 管整数 ≥ 1 | 「只计输入」的换算——写档案的一方 |
| [S-9](#s-9-inputconstraints) 限制 | 管必填、闭合、正整数与 image 条件适用域 | S-33 的大小比较在 Schema 之外；已知不可表达约束由事实写入者及发送边界阻断 |
| [S-10](#s-10-registration) 在册状态 | 管取值域 | 初值、只有两条边、恢复的是同一行、行不删——维护档案的能力与静态检查 |
| [S-11](#s-11-updatedat) `updatedAt` | 管「是时间点」 | 何时动、不后退——维护档案的能力 |
| [S-13](#s-13-modelprofileref) 引用 | **管**两支互斥：`origin` 判别必填、官方那一支不带 `scope`、自建那一支 `scope` 必填且是带判别式的值、无多余成员 | 「不得用环境值补」——调用方；「引用不是授权」——合法目标求值；官方那一支指得清靠 S-3 的同一格判重——建档与官方清单装入 |
| [S-14](#s-14-引用只精确解析不跨层) 解析 | **管不到** | 读面（`capability.model-profile-directory` v2） |
| [S-15](#s-15-modelrequestparameters-是一份词表)～[S-17](#s-17-缺席即不带没有人补值) 词表、取值域、缺席 | **管得到**闭合、各项的域、档案上不得为空对象 | 「没有人补值」——运行时与 adapter |
| [S-18](#s-18-档案参数的输出上限) 输出上限 | **管不到**（跨字段） | 表示层校验在 Schema 之外那一步 |
| [S-19](#s-19-extra) `extra` | 管非空、键非空、键不与八个成员名同 | 「不得与统一项同义换拼法」——adapter（[G-9](#十已知缺口)） |
| [S-21](#s-21-不静默丢也不静默改) 不静默 | **管不到** | adapter；留痕形状在 `data.model-response` |
| [S-22](#s-22-凭据价格与实际用了哪条都不在档案上) 不放的 | 管「档案文档里没有这些成员」 | 其余交换表示里不出现凭据——静态检查 |
| S-29 绑定形状与必填 | 管三个必填对象、成员闭合、非空且无首尾空白字符串 | 修订不改义、命名域与配置来源、调用快照不变——对应写入者和运行时 |
| S-30 配置值 | 管「是对象」 | 严格 JSON 与无损读取——接收边界；不含秘密/凭据——写入者；配置可用性——所选注册实现与窄定义 |
| S-31 模型定义与档案一致 | 管不到跨字段相等 | 表示层纯计算补齐；快照与引用对齐由快照写入者保证 |
| [S-27](#s-27-modelprofilesnapshot档案在某一刻的副本) 快照 | 管成员集合闭合、各成员的域 | 快照上的 S-18/S-33 关系与全部限制值——写快照的一方照原样复制 |
| [S-28](#s-28-建档内容产生一条档案时给的那一份) 建档内容 | **管**「不带 `registration` 与 `updatedAt`」（成员集合闭合）与其余成员的域 | S-18 的跨字段比较——表示层校验在 Schema 之外那一步；来源与所在那一格对不对得上——维护档案的能力 |

**Schema 校验失败 ⇒ 该文档不是一个合法值 ⇒ 按 S-25 给出一个拒绝值。不得降级为「按默认处理」或「尽力而为」。**

## 八、性质与消费者核对场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | （所在范围, 路由名）不重复——含已撤回行、逐码点比较；因而官方档案之间路由名不重复 | 不变量 | [PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)（裁决 35）；逐码点是主线裁定（D-060 §S6 S6-b） | 建档与官方清单装入，判定读到的名字与写入同提交（[S-3](#s-3-撞名判定同一范围内唯一)） | 同一格里有两条同名档案；或两条官方档案同名，官方引用解析到两条 |
| P-2 | 路由名、来源、所在范围建档后不变 | 不变量 | [PF-013 §6.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用) | 维护档案的能力不提供这些写路径（[S-12](#s-12-各属性何时定能不能改)） | 一条历史留痕里的引用，今天解析到一条意思变了的档案 |
| P-3 | 行保留；在册状态只经撤回与恢复在册两条边变化，恢复的是同一行；名字在同一格里仍被占 | 不变量 | [PF-013 §6.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#64-撤回不删行会话指向被撤回的档案时说已下架) · [flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案) | 维护档案的能力（[S-10](#s-10-registration)） | 行没了，会话只说得出「未知模型」、也再恢复不了；或「恢复」另起了一行，指着原来那条的引用断了；或同一格里另建出一条与已撤回行同名的档案 |
| P-4 | 引用只精确解析，不跨层、不回退 | 安全 | [PF-013 §6.1](../../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用) | 读面（[S-14](#s-14-引用只精确解析不跨层)） | 一个自建引用解析到了所在范围或来源与它不符的档案；或一个官方引用解析到了自建档案 |
| P-5 | 档案上没有凭据 | 安全 | [PF-013 §6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存) | Schema ＋ 静态检查（[S-22](#s-22-凭据价格与实际用了哪条都不在档案上)） | 读出一条档案，或它的任何交换表示里，看得到一把凭据 |
| P-6 | 每次发出只走允许列表里的一家；不允许回退时只走第一家 | 安全 | [PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#512-重试站在一个已经存在的位置上) | 模型请求运行时（[S-5](#s-5-providername-与允许的供应商)、[S-6](#s-6-允不允许回退)） | 一次发出同时交给上游多家去回退；或发往了列表外的一家；或 `allowFallback = false` 时发往了第二家 |
| P-7 | 参数不静默丢、不静默改 | 安全 | [PF-013 §4 请求参数](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) | adapter（[S-21](#s-21-不静默丢也不静默改)） | 上游不认的一项既没发出去、也查不到它没发出去；或发出去的值与留痕里的不同 |
| P-8 | 档案参数的输出上限不超过档案的输出上限 | 不变量 | [PF-013 §4](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)：请求参数的取值归规格 | 表示层校验（[S-18](#s-18-档案参数的输出上限)） | 一条档案的 `parameters.maxOutputTokens` 大于它的 `maxOutputTokens` |
| P-9 | 缺席不补值：参数项、范围分量、限制条目 | 安全 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)（范围分量）· PF-013 §4 | 调用方与 adapter（[S-13](#s-13-modelprofileref)、[S-17](#s-17-缺席即不带没有人补值)） | 一个缺 `origin` 或缺 `scope` 的引用被当成官方引用或「当前租户的」；或请求里出现一个档案没给、拓展件也没设的参数值 |
| P-10 | 每条档案都收得下文本 | 不变量 | 主线裁定，D-060 §S6 S6-d（PF-013 [§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面) 等规则隐含） | Schema（`contains`）＋表示层校验（[S-7](#s-7-modality-与两组模态)） | 一条 `inputModalities` 不含 `text` 的档案被建出来，有 transcript 的块对它不再可读 |
| P-11 | 建档拒不拒只取决于同一格里的名字：别的格里有同名档案不挡建档 | 安全 | [PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)（裁决 35、38）；组织层与租户层并存那一半是[裁决 39](../../../../product/PF-013-model-profiles-and-invocation/design.md) | 建档操作（[S-3](#s-3-撞名判定同一范围内唯一)） | 一次自建建档因某条官方档案、同一个组织另一层、或别的组织里有同名档案而被拒；或一次官方发布因某一格里有同名自建档案而被拒 |
| P-12 | 档案产生时的在册状态与 `updatedAt` 只由产生它的一方写：初值 `listed`、建档那一刻 | 不变量 | [flows §3.1](../../../../product/PF-013-model-profiles-and-invocation/flows.md#31-一条模型档案)（建档 → 在册）；S-11 是规格层推导 | 表示层校验拒带这两个成员的建档内容（[S-28](#s-28-建档内容产生一条档案时给的那一份)）＋维护档案的能力在提交时写 | 一条档案以 `withdrawn` 产生；或一条档案的 `updatedAt` 是调用方给的、早于它真正建出的那一刻 |
| P-13 | 档案、建档内容与快照都带完整适配绑定，不补默认 | 不变量 | 主线施工简报；S-27、S-29 | Schema 与快照写入者 | 无绑定的旧文档被静默当成 v3；或快照只留修订、丢了配置值 |
| P-14 | 同命名域修订不改义，不跨档案按配置修订取值 | 安全 | 主线施工简报；S-29 | 实现/定义/档案写入者及运行时 | 相同命名域和修订对应不同含义；或调用取到别的租户的同修订配置 |
| P-15 | 配置保留精确 JSON 值且不含秘密、凭据 | 安全 | 主线施工简报；S-30；content-blocks/v2 S-24 | 严格无损接收边界与写入者 | 重复键被择一保留、数值被舍入，或秘密进入配置与交换表示 |
| P-16 | 档案模型名与绑定窄定义模型名一致 | 不变量 | 主线跨字段裁定；S-31 | 表示层校验及快照写入者 | 合法档案选 A 模型，却绑定 B 模型定义；Schema 通过被误作完整校验通过 |

**进展性质：本契约不拥有任何进展性质。**档案不会「最终成为」别的样子；撤回何时写下、上游变化何时同步，归维护档案的能力。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约。
> 编号 `CS-1`～`CS-5` 只在本节定义；[`examples.md`](examples.md) 的实例与判定场景是另一组，证据不互相顶替。

#### CS-1 会话指着一条被撤回的自建档案

**会话领域的 owner** 在**选中模型是路由名 `vendor-b/coder-7b`、它在租户 T 的链上落到 T 那层那一条，而这条档案随后被撤回**时，
依赖 [S-2](#s-2-routename)、[S-10](#s-10-registration)、[S-13](#s-13-modelprofileref)、[S-14](#s-14-引用只精确解析不跨层)，得到：
选中模型**仍是那个名字**（设置与模型切换落下的那条记录记名字，不记那一行）；那一行的引用**仍解析到同一条**，读到 `registration = withdrawn`。
这个名字此后落到哪一行由按层覆盖定（`capability.model-profile-directory` v2 S-17）：链上另有在册、范围允许的同名档案就落到那一条，调用照发；**链上同名的都撤回了，才说得出「已下架」**，不是「未知模型」。
「不替用户改选、这次发不出去并上交」是那边的规则，本契约只保证它读得到依据。
**这条档案后来恢复在册**：它又是最具体的那一条，这个名字落回它（[S-10](#s-10-registration)）。

#### CS-2 建一条与已有档案同名的档案

**维护档案的能力**在**租户 T 在自己那层建一条路由名与某官方档案相同的档案**、或**系统发布一条路由名与某组织自建档案相同的官方档案**时，
依赖 [S-3](#s-3-撞名判定同一范围内唯一)，得到：**两次都建得出**——不在同一格；两条并存，引用按 `origin` 与 `scope` 分得开（[S-13](#s-13-modelprofileref)）。
**租户 T 在自己那层再建一条与那一格里已有档案（在册或已撤回）同名的**，得 `route_name_taken`；要再用一条已撤回档案的名字，是把那一条恢复在册。
判定读不到那一格的已有档案时**明确失败**，不当作「未被占」。只差大小写的名字不算同名，照常建出。

#### CS-3 默认重试件逐家去试

**默认重试件**在**第一次发出失败**时，依赖 [S-5](#s-5-providername-与允许的供应商)、[S-6](#s-6-允不允许回退)，得到：
第一次发出走的是 `providers` 的第一家；`allowFallback = true` 才可以把下一次发往第二家，`false` 时只能再发第一家或判试尽；
**无论哪种都不把整份列表交给上游自己回退**。

#### CS-4 上游不认某一项参数

**模型请求运行时的 adapter** 在**档案带着 `reasoningEffort: "max"`，而上游这个模型最高只有一档「high」**时，
依赖 [S-16](#s-16-各项的取值域)、[S-20](#s-20-项与项名)、[S-21](#s-21-不静默丢也不静默改)，得到两条合法的路、一条非法的路：
**改成 `high` 发出**，留痕里实际发出的那一组记 `reasoningEffort: "high"`、另记一条改过的值（项名 `reasoningEffort`、要求的 `max`、发出的 `high`）；
或**不发这一项**，记下项名 `reasoningEffort`；
**静默发 `high` 而留痕仍写 `max`、只记 `high` 而不记改过，或静默不发**——违反本条。选哪一条合法的路归 adapter；留痕的三个成员在 `data.model-response` v2 S-11。

#### CS-5 组装读同一份档案里的三项

**组装**在**用户刚切到一个窗口更小、收不下视频、单图上限更小的模型**时，依赖 [S-7](#s-7-modality-与两组模态)、[S-8](#s-8-两个上限)、[S-9](#s-9-inputconstraints)，得到：
下一次组装接到的有效模型那一份档案里，**窗口（只计输入）、收得下的模态、`maxImageBytes`** 三项**同在一份记录里、同一次读出**——
[不是三套机制](../../../../product/PF-010-context-management-and-assembly/design.md#要求五组装的输入里必须有当下生效的那份模型档案)。
`inputConstraints` 为 `{}` 只对非 image 档案合法，表示未加可选项目 cap；上游未知或无限须看必填 `upstreamInputLimits`，不能由空对象推断。

## 九、缺席与恢复

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是值层面的缺席怎样收敛：

| 缺席的是什么 | 收敛到哪 | 谁收口 |
|---|---|---|
| 文档的必填成员缺席或表示非法 | 表示层拒绝，恰一个拒绝值（[S-25](#s-25-拒绝值闭合一次恰一个)）；**不补默认值**，不记成判定结果 | 调用表示层校验的一方 |
| 引用的 `origin` 缺席，或自建引用的 `scope` 缺席 | `malformed`；**不以「官方」「当前租户」「当前组织」补上** | 同上 |
| 按引用**读不到**（存储不可用） | **明确失败**；不当作「已撤回」、不当作「查无此条」、不换一条 | 读面的 owner（`capability.model-profile-directory` v2） |
| 按引用**查无此条** | **明确失败**（构造错误或完整性被破坏）；不当作「已撤回」，不回退到别层同名 | 同上 |
| 撞名判定的依据读不到 | **明确失败**，不当作「未被占」 | 建档操作的 owner |
| 某一项参数缺席 | 请求里不带它；**无人补值** | 运行时与 adapter |
| `adaptation` 或其必填分量缺席 | `malformed`；不按家族前缀、当前实现或默认配置补齐 | 表示层校验的调用方 |
| 绑定形状合法，但注册实现/定义或配置判定依据不可用 | 不得从表示层通过推出可调用；准入失败集合归消费者契约，不自动替换绑定 | 运行时或独立函数的 owner；本版消费闭合见 G-16 |
| 上游不认某一项 / 某个值 | 不发并留痕，或改值发出并记下实际值（[S-21](#s-21-不静默丢也不静默改)） | adapter |
| 适用的必填输入 cap 或上游事实缺席 | `malformed`，不补默认；可选项目 cap 缺席不免除显式的有限上游约束 | 表示层校验调用方、模型请求运行时 |
| 系统重启 | 档案全部来自存储；**没有一项来自运行时对象** | 存储 |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 十、已知缺口

**缺口不填默认值。**继承项按其原版本和 owner 解释，不以旧起草时期的消费者采用状态覆盖当前 registry；本轮新增义务另列 G-15/G-16。

| # | 缺口 | 阻断谁 | 谁来裁 | 闭合条件 |
|---|---|---|---|---|
| **G-2** | **`ProviderName` 的具体词法**（OpenRouter 供应商标识的字符集与大小写规则） | 需要校验或规范化供应商名的实现 | **传输适配层**（模型请求运行时的提供者设计） | 那份提供者设计写定供应商标识的词法，本契约据此出新版本收紧 `ProviderName` 的形状，或写明不收紧、只保留「非空、逐码点相等」 |
| **G-8** | **一次请求的覆盖能否去掉档案上的某一项**（让这次不带它）。合成的其余部分已定：覆盖**逐项替换**档案参数，合并之后再按档案的输出上限校验（主线裁定，见 D-060 §S6 S6-e；落在 [`capability.model-request-runtime/v2#S-7`](../../../capabilities/model-request-runtime/v2/contract.md#s-7-一次调用绑定了什么)） | `data.loop-extension` 的改写表示 | **模型请求运行时**的能力契约，与 `data.loop-extension` 协同 | 模型请求运行时的能力契约写明「能」或「不能」；若能，`data.loop-extension` 的改写表示给出「去掉这一项」的写法，本契约 S-17 补一句它与「缺席即不带」的关系 |
| **G-9** | **`extra` 里出现与统一项同义的上游拼法**（S-19）被 adapter 识别之后的收场：拒这次请求、以统一项为准并留痕、还是别的 | adapter 的实现 | **模型请求运行时**的能力契约 | 那份能力契约写定这种情形的收场与它的失败值或留痕；本契约 S-19 改指那一条 |
| **G-10** | **会话的「默认主模型 ＋ 可选路由模型组」**（产品负责人 2026-09-23 口头，将来经 hook 做 model selector）：两个概念尚无词条、不在 PF-013 正文 | 不阻断本版；设置记路由名（PF-013 rev 12），「一组」照同一规矩记若干个路由名，本版不为它立形状 | **产品负责人**（PF-013 下次 rev，先立词条） | 两个概念进了统一语言与 PF-013 正文；若那时需要「一组」的形状，出本契约新版本，否则本行改为「不需要新形状」关闭 |
| **G-14（历史来源项）** | v3 起草时登记的绑定消费者升级义务；当前精确采用已由 registry 及后续消费者契约拥有，不能再读作「当前全部仍采用 v2」 | 本版不据旧状态阻断；完整输入限制的新增消费缺口见 G-16 | **主线**协调消费者 owner | 既有升级的实现与验证仍按各自证据；不因 data 接受而宣称真实组合已验证 |

**已关闭的缺口**（编号不复用；主线裁定关闭的几项见 D-060 §S6，其中 G-4、G-5 的结论已被 2026-09-24 的产品裁定改掉，注在行内）：

| # | 原来缺什么 | 怎么关的 | 落在哪 |
|---|---|---|---|
| **G-1** | 指向官方档案的引用形状（`ScopeLayerIdentity` 不含出厂默认层） | 引用改为按 `origin` 判别的两支，官方那一支只带路由名。前提原是「官方名对所有层保留」；**2026-09-24 起前提改为「官方档案全在出厂默认层、同一格里路由名不重复」**，结论不变 | [S-13](#s-13-modelprofileref)、[S-14](#s-14-引用只精确解析不跨层)、[S-3](#s-3-撞名判定同一范围内唯一) |
| **G-3** | 路由名大小写不同、Unicode 相似字算不算撞名 | 不算：逐码点比较，不做大小写折叠与相似字判定 | [S-2](#s-2-routename)、[S-3](#s-3-撞名判定同一范围内唯一) |
| **G-4** | 新发布的官方档案撞上已有自建名 | 2026-09-23 关为「同样拒建」；**2026-09-24 按 PF-013 rev 10（裁决 35、38）改为：两者不在同一格，都建得出、并存** | [S-3](#s-3-撞名判定同一范围内唯一) |
| **G-5** | 同一组织的组织层与租户层各有同名自建档案 | 2026-09-23 关为「后建的拒建」；**2026-09-24 按 PF-013 rev 10 §4「档案的身份」改为并存**——另立的 [G-13](#十已知缺口) 已于同日由产品负责人裁定并存 | [S-3](#s-3-撞名判定同一范围内唯一) |
| **G-6** | 上游把一个已撤回的同名模型重新上架：撤回终态、名字永久占用 | **2026-09-24 产品负责人裁定（[PF-013 裁决 35–38](../../../../product/PF-013-model-profiles-and-invocation/design.md)）**：已撤回可恢复在册（`withdrawn → listed`），恢复的是同一条；新官方档案与已有自建档案同名并存。当时待裁的另一种长相「撞名的自建档案改名之前，官方档案不进该组织的展示列表」**没有采用**——身份含范围，两条本不相撞 | [S-3](#s-3-撞名判定同一范围内唯一)、[S-10](#s-10-registration)、[S-14](#s-14-引用只精确解析不跨层) |
| **G-7** | 上游把输出上限降到档案参数之下 | 档案的 `maxOutputTokens` 一项不跟着降（2026-09-24 第一轮评审修复写明：其余适用项照常更新）；发出时按「改了值再发出」处理并留痕，义务归模型请求运行时 | [S-18](#s-18-档案参数的输出上限)、[S-21](#s-21-不静默丢也不静默改) |
| **G-12** | `inputModalities` 是否必含 `text` | 必含；缺它即 `input_text_missing` | [S-7](#s-7-modality-与两组模态)、[S-25](#s-25-拒绝值闭合一次恰一个) |
| **G-11** | 维护档案的能力契约不存在：谁能建、改、撤回，读面的失败值，建档的幂等与并发 | `capability.model-profile-directory` v2（candidate）立起：建档、撤回、读、装入官方清单各写全九件事；S-3 的判定与 S-14 的三种收场落在那里（对齐波关闭） | S-3、S-10、S-12、S-14 的执行面 |
| **G-13** | 「组织层与租户层的自建档案可同路由名并存」这一读法待产品负责人确认 | **2026-09-24 产品负责人裁定并存**（[PF-013 裁决 39、40](../../../../product/PF-013-model-profiles-and-invocation/design.md)，原话记在那里；PF-013 rev 12 已写进 [§4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名)）。本契约只把并存正式化；同名几条谁生效的「按层覆盖」归链的先后（`capability.model-profile-directory` v2 S-17）与求有效模型（`capability.model-request-runtime` v2 S-10） | [S-3](#s-3-撞名判定同一范围内唯一)、[S-14](#s-14-引用只精确解析不跨层) |

### 本版新增缺口

| 缺口 | 影响 | owner 与闭合条件 |
|---|---|---|
| G-15 | 具体模型/供应商的真实输入计量证据、37 个供给值及其他已知约束的精确表示未在本数据包提供 | 提供者与正式模型清单 owner；逐模型给出来源、有限 cap、计量算法/版本与验证证据。三态可明示 unknown，但计量缺失或已知约束不可表达/不可执行时，发送消费者明确拒绝，不删模型或模态绕过 |
| G-16 | 本版完整快照的精确消费与旧不兼容输入拒绝仍需真实消费者证据 | runtime / 当前格式值读写 owner；保留当前代际完整值及在途责任，不提供旧格式读取/结算入口、不按当前目录回填；采用 MP5 的消息、响应、失败主体共同往返验证 |

## 十一、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **不定义谁能建、改、撤回档案**，以及这些操作的授权、失败集合（`route_name_taken` 的名字除外）、幂等与并发——归维护档案的能力（`capability.model-profile-directory` v2）。
- **不定义合法目标集合与展示列表怎么算**（[PF-013 §5.10](../../../../product/PF-013-model-profiles-and-invocation/design.md#510-合法目标集合与展示列表是两件事)），**也不定义有效模型怎么求**；本契约只给它们的输入。
- **不定义凭据的存放与取用**，也不定义用量怎样归到凭据上。
- **不定义重试策略**：试几次、换不换、等多久、何时算试尽。
- **不定义一次模型调用的请求体与响应体**，以及路由留痕的形状——归 `data.model-response`。
- **不定义统一参数到 OpenRouter 字段的映射**——归 adapter。
- **不定义官方档案怎样随系统发布、怎样随上游同步**。
- **不定义模态投影与模态转换件**。
- **不定义实现/模型定义注册、租约、热更新、撤除与调用准入操作**；本版只交出它们共同消费的绑定值。注册、可用性和配置适用性的判定失败不能由本契约的 `malformed` 冒充。
- **不在数据契约列官方模型目录或供应商配置枚举**；37 个模型的提供与认证由本批对应目录、实现和证据承接，通用值形状不承诺自动支持任意模型。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema 与实例文件存在不表示形状已被校验过。

## 十二、版本差异与规范工件

**本版从已接受的 v4 演进**：输入限制形状沿源版原样保留；以下为继承字段的语义说明。S-8/S-9 区分项目有限 cap 与新增 S-32 的上游三态；S-33 增加跨字段一致性；S-11 同时涵盖供给和事实变化；S-27 快照完整保留限制。绑定、配置修订、身份、参数和在册状态规则保持既有承诺。S-25 仍恰十个拒绝值，新增 M15/M16 属于既有 `malformed`。

旧不兼容文档不是本版值：不得把缺键或 `{}` 变成 unknown/unbounded，不填默认 cap。表示不合本版时按 S-25 的既有 `malformed` 拒绝，不提供旧格式只读/结算路径，不改写用户旧数据。当前代际已产生的快照与历史记录保持完整原值，后续目录更新不能改变它们；当前调用的恢复、认回、释放与结算责任由运行时继续承担。消费者显式采用本版及其精确链，候选状态不构成采用。

**本版的规范工件**：本文件、[`model-profile.schema.json`](model-profile.schema.json)、[`examples.md`](examples.md)、[`examples.json`](examples.json)。

**不建 `formal/`。**理由：本契约**没有需要行为模型的状态机**——在册状态两值之间两条边，每条都是对同一行的一次写，
要守的只有「行保留、恢复的是同一行、只有这两条边」，没有交错能反驳它们；**会被并发反驳的是建档操作的「判定与写入同提交」**（[S-3](#s-3-撞名判定同一范围内唯一)），
那条义务落在拥有建档操作的能力契约（`capability.model-profile-directory` v2），不在这里建第二份平行模型。
结构约束全在**一份文档之内**，Schema 加 S-18、S-31、S-33 的跨字段比较即可表达；配置修订不改义、秘密不进入配置与调用快照不变需要消费者场景和写入者检查，不能声称由 Schema 覆盖；
跨记录的那一条（同一格里路由名唯一）是一个唯一性谓词，在 Alloy 里写出来只是它的同义复述。
**这不是把义务省掉**：本契约触发的是 Schema 与实例、静态检查与规范场景，逐条登记在[验证入口](../verification.md)。新增绑定只有值与引用约束；并发注册、撤除、版本保持和调用冻结的行为模型归相应运行时能力，本版不建立一份平行状态机。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#十已知缺口)任一项被裁决后，凡改变本契约语义或表示的，都出新版本。

## 报给主线

- S-9/S-32 的字段与 `InputLimitFact`／`UpstreamInputLimits`（无独立词条）仅作既有模型档案属性的技术投影；不新增领域身份。
- G-15/G-16 是供给与消费者证据义务，不能以候选 Schema 校验通过关闭。
- 既有 G-2/G-8/G-9 等继承缺口按原 owner 保留；本包不替消费能力裁决发送失败集合。
