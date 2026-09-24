# message-model 实现设计

兑现四份 v1 数据契约（都是 candidate）：[`data.content-blocks`](../../../../spec/data/content-blocks/v1/contract.md)（下称 CB）、[`data.messages`](../../../../spec/data/messages/v1/contract.md)（MSG）、
[`data.call-accounts`](../../../../spec/data/call-accounts/v1/contract.md)（CA）、[`data.arrival-events`](../../../../spec/data/arrival-events/v1/contract.md)（AE）。条款写成「CB S-3」这样；导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**：四份契约拥有的是值的含义、闭合的拒绝值与固定次序、几项纯判定，没有成熟库表达这些。能复用的：

- **JSON Schema 校验**：`ajv` 8.20.0 的 Draft 2020-12 入口（与 [identity-values](../identity-values/design.md#实现路径与来源) 同一依赖、同一版本；MSG 的 V-1 要求 `unevaluatedProperties`、`dependentRequired`）。四份 Schema **从 spec 原样复制进包**，包内测试逐字节核对副本，照 identity-values 的做法。
- **身份值与时刻**：`@omne-harness-lite/identity-values`（`TenantId`、`ScopeLayerIdentity`、S-31 的不透明标识词法与 `generateOpaqueIdentifier()`）、`@omne-harness-lite/offer-expiry`（`Instant`）——都已实现。
- **Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。四份契约都写明没有操作、没有提交点、没有状态转移；消费者直接 `import` | 各契约「这份契约拥有什么」 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**，不 inject 也不被 inject；值没有提供者换代这回事。提供者换代时被收掉的在途事实只存在于消费者插件里（写日志的一方、两个运行时），不在本模块 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听任何事件**。**没有一条事件能越过租户或会话边界**：本模块没有事件；值本身不带租户（CB S-23、MSG S-33），会话、租户、尝试的绑定在承载它的日志条目上（MSG 第五节末行），归写日志的一方 | — |
| 存储 | **无**：不读写任何存储。它给存储的写入方提供的是「写之前校验」与无损的读写编码（[下文](#金额与不透明数据的无损读写)），不拥有任何表，也不参与任何跨 owner 的同一提交 | — |

### 装配给 vs 协议给：单机时本节点提供了什么

四张表的左列几乎都由消费者给（日志写入方、两个运行时、存储）。本节点只在下面几行出力，其余行不在本节点：

| 契约与行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| CB、MSG、CA、AE 各表「表示层校验在每个接收边界重做」 | 每份契约一个纯的校验入口，任何边界都能调，同一输入恒得同一个拒绝值 | **在哪些边界调**：写日志、收事件、收账的每一方各自调用 |
| CB「`opaque` 原样回传」、CA「金额保住精确十进制」 | 无损的读与写（数字字面量原样保留），见[下文](#金额与不透明数据的无损读写) | 每一个把 JSON 文本读成值、把值写回文本的边界都得用它（存储、传输适配、工具运行时），见缺口 [MSG-3](#实施缺口与消费者影响) |
| CB「块标识在一条消息内唯一」、MSG「`MessageId` 在会话日志内唯一」 | 标识词法的候选（CB G-4、MSG G-1 把词法交给 realization），见[下文](#标识的词法沿用-identity-values-的生成器) | 在谁那里铸、唯一性由谁守：模型侧传输适配、工具侧帧入口、日志写入方 |
| 其余各行（配对与唯一、名单合法性线性化、一份账只落一次、同一目标有序恰好一次、附件解引用受租户判定……） | 无 | 各自的写入方与宿主 |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| CB [S-1](../../../../spec/data/content-blocks/v1/contract.md#s-1-七类块)～[S-21](../../../../spec/data/content-blocks/v1/contract.md#s-21-attachmentref)、[S-34](../../../../spec/data/content-blocks/v1/contract.md#s-34-只给了引用的附件落成哪一类块) 七类块、标注、标识、模态、媒体类型、工具调用三种形状、结果块、收场、占位原因、派生表示、`CapabilityId`（**形状与相等的唯一家**，CB S-20） | 判别联合 `ContentBlock` 与各变体类型；`modalityOf(mediaType)`（CB S-6）；`isCanonicalMediaType`（CB S-7，只认规范写法、不折叠大小写）；`capabilityIdEquals` | 类型与 Schema 同名；值一律冻结 | V-1、V-3、V-4；`ModelToolName` 在本包是 CB 的逐字副本，**家在 tool-model**——对齐测试放在 [tool-model](../tool-model/design.md#实施缺口与消费者影响)（它依赖本包，本包不依赖它） |
| CB [S-24](../../../../spec/data/content-blocks/v1/contract.md#s-24-规范表示)～[S-27](../../../../spec/data/content-blocks/v1/contract.md#s-27-表示层拒绝不是判定也不修补) 表示层拒绝值（六个，`kind_unknown` 起、`malformed` 止） | `judgeContentBlock(value: unknown) → { ok } \| { rejected }` | [按次序逐条判](#拒绝值按契约的次序逐条判不从-schema-错误里反推) | V-2；**不修补**：拒绝时不交出任何「修好的」值 |
| MSG [S-1](../../../../spec/data/messages/v1/contract.md#s-1-七种消息)～[S-27](../../../../spec/data/messages/v1/contract.md#s-27-compactionmessage-与它的名单)、[S-49](../../../../spec/data/messages/v1/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](../../../../spec/data/messages/v1/contract.md#s-50-调用终结的三支) 七种消息、底座、提醒的性质与来源、压缩名单、五种运行时记录 | 判别联合 `Message`、`ModelInvocationRecord` 等 43 个 `$defs` 的类型 | 同上 | V-1、V-3；`ResponseId`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment` 在本包是逐字副本，家在 model-model，对齐测试放在 [model-model](../model-model/design.md#实施缺口与消费者影响) |
| MSG [S-28](../../../../spec/data/messages/v1/contract.md#s-28-此刻模型可读是算出来的) 此刻模型可读 | `isReadable(ref, prefix: LogPrefixView)`；`LogPrefixView`（候选）是调用方给的只读视图：按标识找消息、找块、列出前缀里的压缩名单 | 纯函数：`path(b)` 上每块 `toModel` 为真，且没有任何名单点过 `path(b)` 里的块；**不缓存、不写下「当前可读集合」**（MSG SC-4） | V-5（examples 第 11 节）；Alloy 模型 `Readable.als` **不是 formal task**，不可绑定 |
| MSG [S-29](../../../../spec/data/messages/v1/contract.md#s-29-合法名单的判定) 合法名单 | `judgeCompactionList(c, prefix, ctx)` → 合法，或 ③⑤⑥ 之一 | ① ② 走表示层（第一段、第二段）；③ 查前缀；⑤ 要「悬着的占位」与卡片 owner 的答复、⑥ 要「最近一次模型请求落在日志哪一处」，**两者都由调用方经 `ctx` 给**，本模块不猜 | V-4。⑤⑥ 的输入分别卡在 MSG G-5（卡片）与 G-2（条目壳）上——缺输入时本函数**不给「合法」**，交回「判不了」，由调用方按不合法处理 |
| MSG [S-37](../../../../spec/data/messages/v1/contract.md#s-37-规范表示)～[S-40](../../../../spec/data/messages/v1/contract.md#s-40-表示层拒绝不是判定也不修补) 两段式拒绝值 | `judgeMessage(value)`（第一段，只看这一条）；`judgeMessageInLog(value, prefix)`（第一段通过后判 `compaction_forward_reference`） | 第一段嵌入 CB 的六个值、原名；`block_id_duplicate` 在整棵块树（含嵌套与派生表示）上查 | V-2；两个边界对同一坏输入给同一个值 |
| MSG [S-32](../../../../spec/data/messages/v1/contract.md#s-32-会话日志里的配对与唯一) 配对与唯一 | `judgePairing(message, prefix)`（候选）只给判定 | 纯判定；**追加、幂等、去重不在本模块**（MSG 第五节「配对与唯一」行归写入方） | V-4 |
| CA [S-4](../../../../spec/data/call-accounts/v1/contract.md#s-4-未知是一个值不是零也不是缺席)～[S-18](../../../../spec/data/call-accounts/v1/contract.md#s-18-原账不改)、[S-37](../../../../spec/data/call-accounts/v1/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) 未知、金额、用量、费用、工具账、补账、三个归属标识 | 类型 `Usage`、`Cost`、`CostItem`、`ToolCallAccount`、`FrameAccount`、`TrimSummary`、`CostCorrection`、`RunId`、`AttemptId`、`ModelCallId`；金额类型 `ExactDecimal`（不透明，内部是规范十进制串） | 金额见[下文](#金额与不透明数据的无损读写)；`"unknown"` 是一个值，类型上与数不相容 | V-1、V-2；`ResponseId` 在本契约是逐字副本（家在 model-response） |
| CA [S-22](../../../../spec/data/call-accounts/v1/contract.md#s-22-有效费用)、[S-23](../../../../spec/data/call-accounts/v1/contract.md#s-23-汇总已知之和与未知笔数)、[S-24](../../../../spec/data/call-accounts/v1/contract.md#s-24-汇总不重复计) 有效费用与汇总 | `effectiveCost(target, corrections)`；`summarize(group) → { knownSum, unknownCount } \| { failed }` | 精确十进制加法；三种明确失败（孤立补账、补账平局、重复的账）；只从权威位置取，不读 `total_usd`、不读镜像、不读 `ToolCallAccount.usage` | V-5、V-6（examples 第 9 节手算）；三种失败**叫什么归读面的契约**（CA G-10），本模块先以候选判别值交回 |
| CA [S-27](../../../../spec/data/call-accounts/v1/contract.md#s-27-表示层拒绝值闭合)～[S-29](../../../../spec/data/call-accounts/v1/contract.md#s-29-判别式与枚举闭合) 五个拒绝值、六步次序 | `judgeAccountValue(kind, value)` | 结构那一半先于正负、正负先于来源、组合约束最后 | V-2 |
| AE [S-5](../../../../spec/data/arrival-events/v1/contract.md#s-5-信封与目标)～[S-16](../../../../spec/data/arrival-events/v1/contract.md#s-16-收尾)、[S-19](../../../../spec/data/arrival-events/v1/contract.md#s-19-归约一块此刻是什么) 信封、六种事件、归约 | 类型 `ArrivalEnvelope`、`ArrivalTarget`、`ArrivalEvent`；`reduceFills(mode, fills)`：追加相接、替换取最后一次（语音按字节相接，不按 base64 串相接） | 纯函数 | 生产者义务「封口块等于归约」（AE S-20）的性质测试 V-5 用它作参照；stream-assembly 物化快照时也用它，**一个归约只有一份** |
| AE [S-28](../../../../spec/data/arrival-events/v1/contract.md#s-28-表示层拒绝值)、[S-29](../../../../spec/data/arrival-events/v1/contract.md#s-29-表示层拒绝不是判定也不修补) 九个拒绝值与次序 | `judgeArrivalEnvelope(envelope, openBlock?: (index) => OpenedBlock \| undefined)` | 嵌着的块取 CB 的值、嵌着的账取 CA 的值，原名；要借开块的两项（`replace_payload_shape`、帧流上往语音块填字节）只在 `openBlock` 给出那一块时才判 | V-2、V-3；`openBlock` 这个参数是与 [stream-assembly](../stream-assembly/design.md#表示层判定借-message-model不在本模块重写) 对齐的形状 |
| AE [S-17](../../../../spec/data/arrival-events/v1/contract.md#s-17-一条流的形状)～[S-24](../../../../spec/data/arrival-events/v1/contract.md#s-24-违反语法由消费一方判定并命名) 序列语法 | — | **不在本节点**：序列判定由消费一方命名，归 stream-assembly | — |

### 拒绝值按契约的次序逐条判，不从 Schema 错误里反推

| | 跑 Schema，再把 ajv 的错误列表映射成拒绝值 | **按契约的次序逐条判（本节点选）**：每份契约一张有序清单，每项是一个对 `unknown` 值的谓词，第一项命中即返回；`malformed` 的判据是「不合 Schema 或违反 Schema 之外的约束」 |
|---|---|---|
| 两个实现对同一坏输入给同一个值 | ajv 的错误次序取决于遍历与 `allErrors` 设置，**不是契约的次序**；多处违例时映射结果不稳 | 次序就是清单次序，与遍历无关 |
| `malformed` 在首位的契约（`data.model-profile`）与在末位的契约 | 要为每份契约写一套错误过滤 | 同一种写法，只是清单次序不同 |
| 代价 | 少写谓词 | 每个具名值写一个谓词；Schema 仍跑，只用来判「剩余项」 |

**落选方的最强论证**：Schema 已经表达了几乎全部形状，从错误里取 `instancePath` 与 `keyword` 反推具名值，谓词不必重写一遍。
**它输在次序**：各契约的「一次恰一个、次序固定」是为了跨实现同值（例如 CB S-26 末段），而 ajv 的错误集合本身不带契约的优先级。
**本方弱点**：具名值的谓词与 Schema 是两处表达同一约束，可能不一致——由每份契约 `examples.md` 的拒绝行逐条核（V-2），不一致即失败。这套写法也被 [asset-model](../asset-model/design.md)、[tool-model](../tool-model/design.md)、[model-model](../model-model/design.md) 沿用。置信度：**高**。

### 标识的词法：沿用 identity-values 的生成器

CB G-4（`BlockId`、`CallId`）与 MSG G-1（`MessageId` 与其余不透明标识）把词法交给 realization。本节点给候选：

| | 每条消息／每个会话一个计数器 | 时间有序（ULID 类） | **沿用 `generateOpaqueIdentifier()`（本节点选）**：128 位 CSPRNG、小写 base32 无填充、26 个字符 |
|---|---|---|---|
| MSG S-3「不从在日志里的位置派生、不从时间点派生」 | **违反**（从位置派生） | **违反**（从时间派生） | 成立 |
| 唯一性 | 构造上唯一，但铸号方须协调（派生表示的块要接着编） | 概率唯一 | 概率唯一（2^-128 量级）；**撞了是响亮的**：同一消息里重复即 `block_id_duplicate`，被拒而不是被静默接受 |
| 实现 | 要分配器状态 | 要新依赖 | 已实现，零新代码 |

**落选方（计数器）的最强论证**：`BlockId` 只要在一条消息内唯一，计数器给的是构造上的唯一，不靠概率。**它输在**铸号的是好几方（模型侧传输适配、工具侧帧入口、落盘前补派生表示的一方），计数器要在它们之间传状态；且同一个写法用到 `MessageId` 上就违反 MSG S-3。
**本方弱点**：唯一性是概率性的；跨进程后「唯一是承诺」要协议另给（CB、MSG 第四／五节右列）。`CallId` 另有一层：模型交回的调用 id 是否沿用上游那一个、会话日志内唯一由谁守，归模型请求运行时（交接见 [MSG-2](#实施缺口与消费者影响)）。置信度：**中高**。

### 金额与不透明数据的无损读写

CA S-5 要求金额「是那个 JSON 数字字面量所表示的精确十进制数」、加总精确，CA G-9 把「怎样保住」交给 realization；CB S-9 要求 `opaque` 每一跳不丢数值精度（V-6 用 `9007199254740993` 作样例）。

- **值的表示**：金额是不透明的 `ExactDecimal`（内部是规范十进制串）；加法用 `BigInt` 按两数小数位对齐后相加，结果还原为十进制串——`0.1 + 0.2` 得 `0.3`，不经二进制浮点。
- **读**：`parseLossless(text)`（候选）——用 `JSON.parse` 的 reviver 取数字的**原文**（reviver 第三个参数 `context.source`），金额成员与 `opaque` 子树里的数都以原文保留。
- **写**：`stringifyLossless(value)`（候选）——用 `JSON.rawJSON(原文)` 把数字字面量原样写回。

| | 第三方无损 JSON 库 | 手写一个 JSON 分词器 | **`JSON.parse` 的 reviver 取原文＋`JSON.rawJSON`（本节点选）** |
|---|---|---|---|
| 新依赖 | 有 | 无 | 无 |
| 正确性风险 | 看库 | 自己担（转义、代理对、深度） | 解析仍是引擎的；只多一步取原文 |
| 前提 | — | — | **Node 24 带这两个 API**——**假设，须按 source-check 取证**（basis 无此条目；它是运行时事实，不是 Cordis 语义）。取证失败就退到手写分词器 |

**落选方（第三方库）的最强论证**：现成、有人维护，读写两头都给。**它输在**这是一个只为两处成员服务的依赖，而引擎自带的两个 API 若在就不需要它。**本方弱点**：依赖一个未取证的运行时能力；并且**只在用它的边界上有效**——任何一处用普通 `JSON.parse` 读了账或 `opaque`，精度就在那一跳丢了，本模块察觉不到（缺口 [MSG-3](#实施缺口与消费者影响)）。置信度：**中**。

## 包级依赖成环

**按主线给定的节点划分，`core` 下的四个节点 message-model、asset-model、tool-model、model-model 在包级别成一个强连通分量，按现在的构建方式建不出来。**
契约之间是无环的（catalog 须无环）；环是**把契约归进包的方式**造出来的。下表每一行都是 catalog 里登记的一条契约依赖：

| 边（包 → 包） | 由哪条契约依赖造成 |
|---|---|
| message-model → asset-model | `data.call-accounts` → `data.asset-model`（`CostItem.service` 用能力标识的规范串） |
| asset-model → message-model | `data.asset-model` → `data.content-blocks`（`CapabilityId` 的家在 CB S-20） |
| message-model → model-model | `data.messages` → `data.model-profile`（`RouteName`、`ModelProfileRef`、参数词表、快照） |
| model-model → message-model | `data.model-response` → `data.messages`、`data.call-accounts`、`data.content-blocks` |
| message-model → tool-model | `data.arrival-events` → `data.loop-extension`（`FailureCause`） |
| tool-model → message-model | 六份工具侧契约都 → `data.content-blocks`，`data.loop-extension` 还 → `data.messages`、`data.call-accounts` |
| tool-model ⇄ model-model | `data.loop-extension` → `data.model-profile`；`data.model-response` → `data.loop-extension` |
| tool-model ⇄ asset-model | 工具侧正文契约 → `data.asset-model`；`data.asset-model` 的 Schema 以 `$ref` 装进六类正文（它自述「不登为依赖、是结构前提」） |

**为什么是阻断而不是风格问题**：根的 `build` 是 `pnpm -r … run build`，每个包 `tsc` 出 `dist`、`noEmitOnError: true`，消费者经公开入口读对方的 `dist/*.d.ts`。
包之间成环时，环上先建的那个包读不到对方尚未生成的声明，编译失败；`pnpm -r` 对成环的工作区依赖的处理——**假设，须按 source-check 取证**（推导：它只能按某个次序跑，解不开环）。

| 候选 | 做法 | 最强论证 | 弱点 |
|---|---|---|---|
| **R1 一份契约一个包（推荐）** | 成环的十三份 `data.*` 各一包，包名取契约 topic（如 `packages/core/content-blocks`）；本批六个节点的设计按契约分节，原样拆过去 | 包图就是 catalog 的契约图，天然无环；与 tools、model 两份拆分提案的装配草图一致（它们本来就写的是一份契约一个包）；「一个概念一个家」在包上也成立 | 包多（样板、`package.json`、测试配置）；节点目录要按契约重立 |
| R2 把成环的四个合成一个包 | 十三份契约进一个包 | 零环、改动最少 | 一个包兑现十三份契约，任何一份改动都牵动全部消费者；与「有独立职责和变化边界时分包」相悖 |
| R3 保留划分，只许包之间 `import type` | 类型层互引 | 节点名不变 | 仍是包级环，`tsc` 的项目边界解不开（同上推导）；且 `asset-model` 要在运行时调正文契约的校验，只靠类型挡不住 |
| R4 按契约图分层重组成四五个包 | 例：CB 单独一层，其上 `asset-model`＋`model-profile`，再上 `call-accounts`＋`tool-definition`…… | 包数少于 R1 | 现在的层是契约依赖的偶然形状，下一份契约加一条边就要重排；包名失去含义 |

**本节点不改划分**（节点名由主线定）。四个节点的设计都**按契约分节写**，在 R1～R4 下都能原样落到新包上；`asset-model ⇄ 正文契约` 那一条在任何划分下都在，由 asset-model 的[依赖反转](../asset-model/design.md#正文契约的判定经端口注入不-import-tool-model)单独解开。**owner：主线（节点划分）**。受阻：这四个包与依赖它们的 asset-evaluation、stream-assembly 都建不起来。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.identity-values` v1、`data.offer-expiry` v1 | 已实现的两个 core 包，普通依赖 | 随包版本 | 静态 import，无运行期缺席 |
| `data.asset-model` v1（CA）、`data.model-profile` v1（MSG）、`data.loop-extension` v1（AE） | 按现划分是 asset-model、model-model、tool-model 三个包——**成环**（[上节](#包级依赖成环)） | — | 划分定下之前没有可用的解析方式 |
| 被消费 | 两个运行时、stream-assembly、asset-model、tool-model、model-model、资产治理、注册表、拓展件派发、模态投影、写日志的一方 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**全部入口是纯函数；带随机性的只有标识生成（由 identity-values 提供，本包不另写）。

**失败映射只有两种，不混用**：表示层拒绝 ⇒ 返回 `{ rejected: 值 }`（值取该契约闭合集合里恰一个）；纯判定得出的否定（名单不合法、汇总失败）⇒ 返回判定结果本身。**都不抛异常**；抛出只留给本模块自身的缺陷。**拒绝不是判定**（各契约「表示层拒绝不是判定，也不修补」）：两种返回在类型上不相容，调用方不能把一个当另一个记。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

四份契约的 SC 项约束的几乎都是**消费者**的代码路径（日志写路径、翻译方、组装、汇总的读面、节流的实现），本节点只能提供让它们好判的类型。逐条都**尚无**：

| 检查 | 形式 | 谁跑 |
|---|---|---|
| CB SC-2（不解析半截调用的 `rawArguments`；完整调用只读 `arguments`） | 类型：半截调用与解析不了的调用的 `rawArguments` 不导出任何「解析」辅助；规则（候选）：`JSON.parse` 的调用点白名单 | stream-assembly 与消费者包 |
| CB SC-3（除传输适配外不读写 `opaque`） | 类型：`opaque` 是不透明品牌类型，只有 `stringifyLossless` 能展开 | 全部消费者 |
| MSG SC-3（不按 `createdAt` 排序比较） | `createdAt` 的类型不提供比较；规则（候选）扫比较与排序调用 | 消费者包 |
| MSG SC-4（不写下「当前可读集合」） | 由构造：`isReadable` 是函数、不暴露集合；写日志一方的规则另立 | 日志写入方 |
| MSG SC-5（翻译方每种消息都有落点） | 类型：`Message` 判别联合加穷尽检查（`never`）让漏一种编译不过 | 模型请求运行时的传输适配 |
| CA SC-2、SC-3 | 类型：汇总入口的参数类型里不含 `total_usd` 与镜像笔；`cache_tokens`、`total_tokens` 不在任何导出类型里 | 本节点与读面 |
| 其余（CB SC-1、SC-4，MSG SC-1、SC-2、SC-6，CA SC-1、SC-4，AE SC-1～SC-4） | 落在各消费者节点的 verification | 各消费者 |

## 实施缺口与消费者影响

契约各自的已知缺口（CB G-1、G-4、G-10，MSG G-1、G-2、G-5～G-7、G-11，CA G-3～G-10、G-12，AE 第九节）不重抄。本节点自己的缺口：

- **MSG-1 包级依赖成环**：见[上节](#包级依赖成环)。owner：**主线**（节点划分）。受阻：message-model、asset-model、tool-model、model-model 四个包，及依赖它们的 asset-evaluation、stream-assembly。
- **MSG-2 标识的铸号方**：本节点给了词法候选（沿用 `generateOpaqueIdentifier()`），**铸号在别处**——`MessageId` 由写日志的一方、`BlockId` 由模型侧传输适配与工具侧帧入口、`CallId` 是否沿用上游调用 id 由模型请求运行时定。三处要用同一个生成器，否则同一概念两套词法。owner：主线协调；落在 model-request-runtime、tool-execution-runtime 两个节点与会话日志的写入方（后者尚无契约，MSG G-2）。
- **MSG-3 无损读写只在用它的边界上有效**：金额与 `opaque` 从 JSON 文本读成值的**每一处**（存储提供者读 JSON 列、传输适配读上游响应、工具运行时收工具返回、跨进程的每一跳）都要走 `parseLossless`／`stringifyLossless`，否则那一跳静默丢位。owner：主线把它写进存储提供者（`infra/storage-sql`）与两个运行时节点的要求清单；本节点另欠一条「丢位即失败」的测试（CA G-9 的闭合条件）。Node 24 的两个 API 是**假设，须按 source-check 取证**。
- **MSG-4 名单判定的两项输入无家**：S-29 ⑤ 要卡片 owner 的答复、⑥ 要「最近一次模型请求落在日志哪一处」；前者卡在 MSG G-5、后者卡在 G-2。本模块只能收这两样作参数、缺则「判不了」。受阻：PF-010 的压缩一侧（无契约）。
- **MSG-5 汇总三种失败的名字**：`summarize` 的失败值用候选判别值；正式名字归按 Run 汇总的读面契约（CA G-10）。受阻：读面。
