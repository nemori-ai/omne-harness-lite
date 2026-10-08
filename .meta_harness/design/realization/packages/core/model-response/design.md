# model-response 实现设计

> 本批设计已接受（2026-09-26，D-062／D-065）。此状态不表示实现或实际验证完成。

契约：[`data.model-response` v2](../../../../spec/data/model-response/v2/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律为**已接受的设计**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)（`malformed` 是剩余项）。
Schema 以 `allOf` 的 `if/then` 表达收场的条件关系（S-26），ajv 的 2020 入口支持。
用量与费用的金额经 [call-accounts](../call-accounts/design.md) 的 `ExactDecimal`，读写经 content-blocks 的[严格无损 JSON](../content-blocks/design.md#严格的无损-json-读写)，不经浮点（D-060 §八 M36）。
**Cordis 版本**：采用 4.0.4（D-025）；本模块不依赖 Cordis。

## 公开面

**全部即公开函数面**（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）：不依赖 Cordis、会话、租户或存储，单独 `import` 即用；**没有 Cordis 服务面**（[下表](#cordis-原语本节点一样也不用)）。核对：[依赖表](#依赖作用域与绑定)只有本批纯模块、已实现的 identity-values 与 offer-expiry、`ajv`，不 import `@deepseek-ai/cordis`、`kernel-basis`、`storage`，不解析任何服务键。主要导出（候选名）：

| 导出 | 契约坐标 |
|---|---|
| 类型 `ModelResponse`、`ResponseId`（家在本包）、`Route`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment`、`ResponseOutcome`、`Failure`、`Timing`、`RawResponse` | [S-4](../../../../spec/data/model-response/v2/contract.md#s-4-一次调用一次发出一条响应体)～[S-15](../../../../spec/data/model-response/v2/contract.md#s-15-故障的成因与原样状态码)、[S-17](../../../../spec/data/model-response/v2/contract.md#s-17-首-token-与时序)～[S-19](../../../../spec/data/model-response/v2/contract.md#s-19-用量与费用)、[S-35](../../../../spec/data/model-response/v2/contract.md#s-35-晚到的那一条) |
| `judgeModelResponse(value) → { ok } \| { rejected }` | [S-26](../../../../spec/data/model-response/v2/contract.md#s-26-schema-的范围)～[S-28](../../../../spec/data/model-response/v2/contract.md#s-28-表示层拒绝与判定分开) |

**函数层不承诺**：[S-25](../../../../spec/data/model-response/v2/contract.md#s-25-装配给的保证与协议须给的保证) 八行（一次请求一条、三个时刻同源、首 token、发号、`ResponseId` 唯一、`late`、参数留痕、凭据不进响应体）与 S-26「它不能约束的」那一串——全在模型请求运行时的写路径上（[装配给 vs 协议给](#装配给-vs-协议给)）。

**S-27 成员与跨成员的实施分区（2026-09-26）**：`judgeModelResponse` 先判 `outcome_unknown`／`dispatch_zero`／`cause_unknown`，再判其余独立成员形状。`failure.inBand` 缺 `statusCode` 明文属于最后无专名的跨成员 `malformed`，不能因 `Failure` 的 `dependentRequired` 而提前盖过 `failure_on_interrupted` 等具名关系；私有成员视图仅暂缓这项关系，字段类型、额外成员与其余独立形状继续检查。最后按原次序与完整 Schema 收跨成员结果。公开 `validate` 的冻结 Schema 不修改；单独校验完整 `Failure` 仍受该关系约束，没有父响应体时不声称省略了它。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。模型请求运行时、读响应体的各方各自 `import` | 契约没有操作 |
| 服务键 | 无 | — |
| `inject` 关系 | **无** | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**。响应体**不带 `TenantId`**，归属靠承载它的条目（契约 G-3），归写入方 | — |
| 存储 | **无**：响应体的「写下即不变」归模型请求运行时的存储 | S-22、S-25 |

### 装配给 vs 协议给

[S-25](../../../../spec/data/model-response/v2/contract.md#s-25-装配给的保证与协议须给的保证) 那张表全部八行（一次请求一条、三个时刻同源、首 token、发号、`ResponseId` 唯一、`late`、参数留痕、凭据不进响应体）都在写路径上，**本节点一行也不出力**；本节点只给「表示层校验在每个接收边界重做」所用的纯入口 `judgeModelResponse`。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-4](../../../../spec/data/model-response/v2/contract.md#s-4-一次调用一次发出一条响应体)～[S-15](../../../../spec/data/model-response/v2/contract.md#s-15-故障的成因与原样状态码)、[S-17](../../../../spec/data/model-response/v2/contract.md#s-17-首-token-与时序)～[S-19](../../../../spec/data/model-response/v2/contract.md#s-19-用量与费用)、[S-35](../../../../spec/data/model-response/v2/contract.md#s-35-晚到的那一条) 响应体的成员 | 类型 `ModelResponse`、`ResponseId`（**家在本包**）、`Route`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment`、`ResponseOutcome`、`Failure`、`Timing`、`RawResponse`；`FailureCause` 取 [loop-extension](../loop-extension/README.md) 那一份 | 金额经 `ExactDecimal`，不经浮点 | V-1 |
| [S-26](../../../../spec/data/model-response/v2/contract.md#s-26-schema-的范围)～[S-28](../../../../spec/data/model-response/v2/contract.md#s-28-表示层拒绝与判定分开) Schema 范围、拒绝值、判定分开 | `judgeModelResponse(value)` | Schema（含 `if/then` 的收场条件）＋ S-27 列在 `malformed` 里的几种无专名的跨成员情形；**S-26「它不能约束的」那一串**（与「已出门」逐项相同、三个时刻先后、`late` 的判定……）要看同一次调用的别的记录，**不在本入口**，归写入方 | V-1；V-9、V-10 归模型请求运行时 |
| [S-16](../../../../spec/data/model-response/v2/contract.md#s-16-发出了的才有响应体)、[S-20](../../../../spec/data/model-response/v2/contract.md#s-20-上游原始响应留存)～[S-24](../../../../spec/data/model-response/v2/contract.md#s-24-一条响应体对应上游的一次请求) 写入纪律 | — | 不在本节点 | 模型请求运行时（V-2～V-8、V-11～V-14） |

### 副本定义的对齐放在依赖方

为避免契约互为依赖，几处定义在别的契约里有**断言形状副本**：`ResponseId`（家在 S-6）在 `data.messages` 与 `data.call-accounts` 里各有一份，`SelectedBy`、`CredentialScope`、`ParameterAdjustment`（家在 S-10、S-9、S-11）在 `data.messages` 里各有一份。
包之间只能单向依赖：[messages](../messages/README.md) 与 [call-accounts](../call-accounts/README.md) 不依赖本包，本包依赖它们——**所以对齐测试放在本包**：取两包导出的 Schema 与本包 Schema，逐项比较这些 `$defs` 的完整断言投影逐字相同。

**2026-09-26 冻结原件核对与比较口径**：上述五组 `$defs` 在已冻结原件中已经有 `title`／`description`／`$comment`／`examples` 注解差异，断言形状相同；不能声称整个片段同字节，也不改写冻结原件使其相同。MR-1 的比较只在 Schema 对象位置排除这四个已观察到的注解键，递归核对其余全部断言与应用器结构、`$ref` 等；`properties` 等映射的键名，以及 `const`／`enum` 等实例数据原样保留，不能把用户数据中的同名字段删掉。每份完整 Schema 副本仍逐字节等于自己的冻结原件；证据另记五组片段原始 hash 与注解差异，并用约束变异和同名实例字段反例证明比较会红。该口径兑现表示形状对齐，不声称注解全文对齐或写入者留痕相等。
**测试归属的选择**已由 D-060 §八 M44「副本对齐测试放依赖方」接受；上段注解比较口径是本轮原件核对后的技术采用，不倒记成 M44 的裁定。[tool-definition](../tool-definition/design.md#实施缺口与消费者影响) 对 `ModelToolName` 同样处理。

| | 不做对齐测试，靠评审 | 在被依赖方里比（反向依赖本包） | **在本包里比（本节点选）** |
|---|---|---|---|
| 可行 | 可行 | **成环**：messages → model-response → messages | 可行：本包本来就依赖两包 |
| 失败时 | 副本悄悄漂移，两个实现一个收一个拒 | — | CI 红，指出是哪一份 `$defs` 不同 |

**落选方（靠评审）的最强论证**：副本是规格层的事，契约的验证入口已把它们列成「对齐义务」，实现不必再核。**它输在**副本漂移的后果落在实现上（一边收一边拒），而断言投影可直接比较。**本方弱点**：只核 Schema 片段，不核两边类型定义；TS 类型由各自 Schema 手写，两处类型的一致只能靠同一组正反实例。置信度：**高**。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.call-accounts` v2、`data.content-blocks` v2、`data.messages` v2、`data.model-profile` v2、`data.loop-extension` v2（`FailureCause`）、`data.offer-expiry` v1、`data.identity-values` v1 | [call-accounts](../call-accounts/README.md)、[content-blocks](../content-blocks/README.md)、[messages](../messages/README.md)、[model-profile](../model-profile/README.md)、[loop-extension](../loop-extension/README.md)、已实现的 offer-expiry 与 identity-values | 随包版本 | 静态 import |
| 被消费 | 模型请求运行时、读响应体的各方 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（D-060 §八 M41），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个）。都不抛异常。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

契约的写入者检查（没有一处给响应体写三个「发不出去」成因、脱敏、无隐藏重试）约束的是模型请求运行时，**本节点不承载**。

## 实施缺口与消费者影响

契约的已知缺口（第七节）不重抄。本节点自己的：

- **MR-1 副本对齐测试**：见[上节](#副本定义的对齐放在依赖方)。owner：本节点（义务，不是阻塞）。
- **跨节点交接**：`judgeModelResponse` 只判一条响应体本身；S-26「它不能约束的」那一串由模型请求运行时在写入时兑现，写进它的 verification。

## D-068：当前3的精确投影

本节点设计采用 `data.model-response · v3`（[规范](../../../../spec/data/model-response/v3/contract.md)），原2投影以上只保留不受差异影响的机制和责任；坐标以本节和唯一catalog为准。八个采用关系由 D-068 显式选定，推荐不自动升级24个外部消费者。新3实际source/资源与证据待独立交付，旧2测试和模型运行不换标签。

六data默认schema为3并各公开`./schema/v2`原2完整字节/$id；AR/CA/MP/Skill/MCP/Slash仍2，固定Schema图显式取旧资源。SA/AE没有自有Schema，不造空文件或空集通过。Connector只保留被AM规范引用的冻结资源，真实提供者纵线延期。
