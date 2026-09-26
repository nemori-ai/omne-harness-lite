# content-blocks 实现设计

> 本批设计已接受（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-045](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

契约：[`data.content-blocks` v1](../../../../spec/data/content-blocks/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律为**已接受的设计**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块。**契约拥有的是七类块的含义、闭合的拒绝值与固定次序，没有成熟库表达；能复用的：

- **JSON Schema 校验**：`ajv` 8.20.0 的 Draft 2020-12 入口（与 [identity-values](../identity-values/design.md#实现路径与来源) 同一依赖、同一版本）。`content-blocks.schema.json` 从 spec 原样复制进包，包内测试逐字节核对副本，照 identity-values 的做法。
- **身份值**：`@omne-harness-lite/identity-values`（S-31 的不透明标识词法与 `generateOpaqueIdentifier()`；已实现）。
- **Cordis 版本**：采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

本包是本批包依赖图的底，下面三种写法在这里定一次，其余本批节点引用这里：[拒绝值怎样判](#拒绝值按契约的次序逐条判不从-schema-错误里反推)、[不透明标识的词法](#标识的词法沿用-identity-values-的生成器)、[严格的无损 JSON 读写](#严格的无损-json-读写)。

## 公开面

**全部即公开函数面**（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）：不依赖 Cordis、会话、租户或存储，单独 `import` 即用；**没有 Cordis 服务面**（[下表](#cordis-原语本节点一样也不用)）。核对：[依赖表](#依赖作用域与绑定)只有已实现的纯模块 identity-values 与 `ajv`，不 import `@deepseek-ai/cordis`、`kernel-basis`、`storage`，不解析任何服务键。主要导出（候选名）：

| 导出 | 契约坐标 |
|---|---|
| 判别联合 `ContentBlock` 与七类变体；`modalityOf(mediaType)`、`isCanonicalMediaType(s)` | [S-1](../../../../spec/data/content-blocks/v1/contract.md#s-1-七类块)～[S-21](../../../../spec/data/content-blocks/v1/contract.md#s-21-attachmentref)、[S-34](../../../../spec/data/content-blocks/v1/contract.md#s-34-只给了引用的附件落成哪一类块)；[S-6](../../../../spec/data/content-blocks/v1/contract.md#s-6-模态由媒体类型判定)、[S-7](../../../../spec/data/content-blocks/v1/contract.md#s-7-媒体类型的规范形式) |
| `CapabilityId`、`capabilityIdEquals(a, b)`（形状与相等的家） | [S-20](../../../../spec/data/content-blocks/v1/contract.md#s-20-派生表示的产出者与能力标识) |
| `readJsonStrict(text) → { ok } \| { failed }`、`writeJsonLossless(value)`、`JsonNumber` | [S-12](../../../../spec/data/content-blocks/v1/contract.md#s-12-完整的工具调用)、[S-24](../../../../spec/data/content-blocks/v1/contract.md#s-24-规范表示)（M36） |
| `judgeContentBlock(value) → { ok } \| { rejected }` | [S-24](../../../../spec/data/content-blocks/v1/contract.md#s-24-规范表示)～[S-27](../../../../spec/data/content-blocks/v1/contract.md#s-27-表示层拒绝不是判定也不修补) |
| 类型 `BlockId`、`CallId`（生成器即 identity-values 的 `generateOpaqueIdentifier()`，本包不另写） | [S-3](../../../../spec/data/content-blocks/v1/contract.md#s-3-blockid)、[S-14](../../../../spec/data/content-blocks/v1/contract.md#s-14-callid) |

**函数层不承诺**：块标识在一条消息内唯一、`CallId` 在会话日志内唯一、落盘之后整块不变、每一跳都走严格无损读写——它们只在铸号方、日志写入方与各读写边界成立（[装配给 vs 协议给](#装配给-vs-协议给单机时本节点提供了什么)右列，CB-1、CB-2）。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。契约没有操作、提交点与状态转移；消费者直接 `import` | 契约「这份契约拥有什么」 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**，不 inject 也不被 inject；提供者换代时被收掉的在途事实只在消费者插件里 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**。没有事件能越过租户或会话边界：块不带租户身份（S-23），归属在承载它的日志条目上，归写日志的一方 | — |
| 存储 | **无**：不读写任何存储，不拥有任何表，不参与任何跨 owner 的同一提交 | — |

### 装配给 vs 协议给：单机时本节点提供了什么

[第四节](../../../../spec/data/content-blocks/v1/contract.md#四装配给与协议给)八行里，本节点只在下面几行出力：

| 行 | 本节点在单机里提供的 | 不在本节点的那一半 |
|---|---|---|
| 块标识在一条消息内唯一，含嵌套 | 词法候选（[下文](#标识的词法沿用-identity-values-的生成器)） | 铸号：模型侧传输适配、工具侧帧入口、落盘前补派生表示的一方 |
| `opaque` 原样回传 | [严格的无损 JSON 读写](#严格的无损-json-读写)：数值不丢精度，缺席与 `null` 各自保留 | 每一跳都用它：存储读写、传输适配、跨进程的每一跳（缺口 [CB-2](#实施缺口与消费者影响)） |
| 两个标注随块完整到达 | 类型：`visibility` 的两位都必填，没有「缺省即假」的构造入口 | 线上格式显式承载 `false` |
| 表示层校验在每个接收边界重做 | `judgeContentBlock` 这一个纯入口 | 在哪些边界调 |
| `CallId` 唯一、落盘之后整块不变、内联字节原样、引用可解引用且受租户判定 | 无 | 登记调用的一方；会话日志的写入方；附件存储 |

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/content-blocks/v1/contract.md#s-1-七类块)～[S-21](../../../../spec/data/content-blocks/v1/contract.md#s-21-attachmentref)、[S-34](../../../../spec/data/content-blocks/v1/contract.md#s-34-只给了引用的附件落成哪一类块) 七类块、标注、标识、模态、媒体类型、工具调用三种形状、结果块、收场、占位原因、派生表示、附件引用 | 判别联合 `ContentBlock` 与各变体类型；`modalityOf(mediaType)`（S-6）；`isCanonicalMediaType`（S-7，只认规范写法、不折叠大小写） | 类型与 Schema 同名；值一律冻结 | V-1、V-3、V-4 |
| [S-20](../../../../spec/data/content-blocks/v1/contract.md#s-20-派生表示的产出者与能力标识) `CapabilityId`（**形状与相等的唯一家**） | 类型 `CapabilityId`；`capabilityIdEquals` | 两个分量逐码点比较 | 名字词法与规范串在 [asset-model](../asset-model/design.md) |
| [S-12](../../../../spec/data/content-blocks/v1/contract.md#s-12-完整的工具调用) 的 `ModelToolName` | 类型 `ModelToolName`（本包是 `data.tool-definition/v1#S-6` 的逐字副本） | Schema 副本 | **家在 tool-definition**；对齐测试放在 [tool-definition](../tool-definition/design.md#实施缺口与消费者影响)（它依赖本包，本包不依赖它） |
| S-9 `opaque`、[S-12](../../../../spec/data/content-blocks/v1/contract.md#s-12-完整的工具调用)「怎样才算解析成功」、[S-24](../../../../spec/data/content-blocks/v1/contract.md#s-24-规范表示)「读写块的 JSON 文本的口径」（[D-040 §八 M36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | `readJsonStrict(text) → { ok: value } \| { failed: "syntax" \| "duplicate_member" }`、`writeJsonLossless(value)`；数值类型 `JsonNumber = number \| LosslessNumber` | [下文](#严格的无损-json-读写)。**同一个读法，两处各自映射失败**：接收边界读块（或消息）的文本失败 ⇒ `malformed`（S-24）；参数串的那一次解析失败 ⇒ 解析不了的调用块（S-12，执行点在 stream-assembly） | V-6；「每一跳都用它」是缺口 [CB-2](#实施缺口与消费者影响) |
| [S-3](../../../../spec/data/content-blocks/v1/contract.md#s-3-blockid)、[S-14](../../../../spec/data/content-blocks/v1/contract.md#s-14-callid) 两种标识的词法（G-4 交给 realization） | 类型 `BlockId`、`CallId`；生成器即 identity-values 的 `generateOpaqueIdentifier()`，本包不另写 | [下文](#标识的词法沿用-identity-values-的生成器) | 唯一性由铸号方保证（CB-1） |
| [S-22](../../../../spec/data/content-blocks/v1/contract.md#s-22-落盘之后整块不变)、[S-23](../../../../spec/data/content-blocks/v1/contract.md#s-23-块不携带租户身份) 落盘不变、不带租户 | 类型上没有租户成员；值冻结 | 就地更新的写路径归会话日志写入方（SC-1） | 不在本节点 |
| [S-24](../../../../spec/data/content-blocks/v1/contract.md#s-24-规范表示)～[S-27](../../../../spec/data/content-blocks/v1/contract.md#s-27-表示层拒绝不是判定也不修补) 六个拒绝值与次序、不修补 | `judgeContentBlock(value: unknown) → { ok } \| { rejected }`；从文本读的边界先 `readJsonStrict`，失败即 `{ rejected: "malformed" }`（S-24 读写口径：任何一层重复成员名即 `malformed`），不把一个挑过键的值交给 `judgeContentBlock` | `kind_unknown` 起、`malformed` 止，[逐条判](#拒绝值按契约的次序逐条判不从-schema-错误里反推)；「一条消息里 `id` 重复」在消息层的接收边界判（`data.messages/v1#S-39` 的 `block_id_duplicate`） | V-2；拒绝时不交出任何「修好的」值 |

### 拒绝值按契约的次序逐条判，不从 Schema 错误里反推

| | 跑 Schema，再把 ajv 的错误列表映射成拒绝值 | **按契约的次序逐条判（本节点选）**：每份契约一张有序清单，每项是一个对 `unknown` 值的谓词，第一项命中即返回；`malformed` 的判据是「不合 Schema 或违反 Schema 之外的约束」 |
|---|---|---|
| 两个实现对同一坏输入给同一个值 | ajv 的错误次序取决于遍历与 `allErrors` 设置，**不是契约的次序**；多处违例时映射结果不稳 | 次序就是清单次序，与遍历无关 |
| `malformed` 在首位的契约（`data.model-profile`）与在末位的契约 | 要为每份契约写一套错误过滤 | 同一种写法，只是清单次序不同 |
| 代价 | 少写谓词 | 每个具名值写一个谓词；Schema 仍跑，只用来判「剩余项」 |

**落选方的最强论证**：Schema 已经表达了几乎全部形状，从错误里取 `instancePath` 与 `keyword` 反推具名值，谓词不必重写一遍。
**它输在次序**：各契约的「一次恰一个、次序固定」是为了跨实现同值（例如 S-26 末段），而 ajv 的错误集合本身不带契约的优先级。
**本方弱点**：具名值的谓词与 Schema 是两处表达同一约束，可能不一致——由每份契约 `examples.md` 的拒绝行逐条核（V-2），不一致即失败。本批全部数据契约节点沿用这一写法。置信度：**高**。

### 标识的词法：沿用 identity-values 的生成器

S-3、S-14 的词法交给 realization（契约 G-4）；`data.messages` 的 G-1 同样把 `MessageId` 的词法交给 realization。本批三种标识一个候选：

| | 每条消息／每个会话一个计数器 | 时间有序（ULID 类） | **沿用 `generateOpaqueIdentifier()`（本节点选）**：128 位 CSPRNG、小写 base32 无填充、26 个字符 |
|---|---|---|---|
| `data.messages/v1#S-3`「不从在日志里的位置派生、不从时间点派生」 | **违反**（从位置派生） | **违反**（从时间派生） | 成立 |
| 唯一性 | 构造上唯一，但铸号方须协调（派生表示的块要接着编） | 概率唯一 | 概率唯一（2^-128 量级）；**撞了是响亮的**：同一消息里重复即 `block_id_duplicate`，被拒而不是被静默接受 |
| 实现 | 要分配器状态 | 要新依赖 | 已实现，零新代码 |

**落选方（计数器）的最强论证**：`BlockId` 只要在一条消息内唯一，计数器给的是构造上的唯一，不靠概率。**它输在**铸号的是好几方，计数器要在它们之间传状态；且同一写法用到 `MessageId` 上就违反那份契约的 S-3。
**本方弱点**：唯一性是概率性的；跨进程后「唯一是承诺」要协议另给（第四节右列）。`CallId` 另有一层：模型交回的调用 id 是否沿用上游那一个，归登记它的模型请求运行时（CB-1）。置信度：**中高**（D-040 §八 M44 已接受这一推导）。

### 严格的无损 JSON 读写

[D-040 §八 M36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 定了口径，契约 S-12、S-24 已落：按 RFC 8259 严格解析；**任何一层对象里重复的成员名 ⇒ 读不出**（不取前一个、不取后一个）；超出 ±2^53 的整数与金额一律**无损保留原文**，落盘与回读走无损读写。
**读不出之后是什么，两处不同**（契约 S-24 末段，[N-20](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 接受）：参数串的那一次解析（S-12）读不出 ⇒ 落成解析不了的调用块、**仍是一次已登记的调用**；接收边界读块或消息的文本（S-24、`data.messages/v1#S-37`）读不出 ⇒ `malformed`、**这份文本不是一个块**。所以读法只交中性的 `{ failed }`，映射留给调用处。
S-9 的 `opaque`、S-12 的 `arguments`、`data.call-accounts` 的金额、`data.asset-model` 清单的「成员名重复即 `malformed`」都落在这一件上，所以它的家在本包（本批包依赖图的底，所有用它的包本来就依赖本包）。

- **值的表示**：实施提交 `44b84525` 采用保守的无损表示：只有规范写法的普通安全整数（不含负零）交 `number`，其余数字交冻结 `LosslessNumber` 并保留原文字面量。因此 `0.1`、`1.10`、`-0`、`1e400` 和大整数均保留原文，`42` 交 number。与原候选的十进制数值往返判断相比，这一选法同时保留数字书写形式，公开联合类型 `JsonNumber = number | LosslessNumber` 与契约的数值含义不变；金额层将两种都转为精确十进制计算。数字读边界为 `jsonNumberSource`，整数约束为 `isNonNegativeJsonInteger`；本包固定 Schema 的投影不开放成任意 Schema 通用辅助。
- **读**：先用 `JSON.parse`（reviver 的第三个参数 `context.source` 取每个数字的原文）判语法并取值；通过之后再扫一遍文本，按对象收集**解码后的**成员名（`"a"` 与 `"a"` 是同一个名字），有重复即失败。失败一律交 `{ failed }`（语法不合 RFC 8259 或重复成员名两种原因作诊断），不交半份值、不交挑过键的值。
- **写**：`writeJsonLossless` 用 `JSON.rawJSON(原文)` 把 `LosslessNumber` 原样写回。

| | 第三方无损 JSON 库 | 手写一个完整的 RFC 8259 解析器 | **`JSON.parse`（取原文）＋ 第二遍查重复键（本节点选）** |
|---|---|---|---|
| 新依赖 | 有 | 无 | 无 |
| 正确性风险 | 看库（重复键是否报错要逐个核） | 全部自己担（转义、代理对、深度、数字语法） | 语法仍由引擎判；第二遍只在**已知合法**的文本上找成员名，扫描器很小 |
| 前提 | — | — | **Node 带 reviver 的 `context.source` 与 `JSON.rawJSON`**——**已取证**：Node v24.18.0（V8 13.6）上两者都可用，超出 2^53 的整数、`1.10`、`1e400`、`-0` 的原文都保留并逐字节写回（[证据 run `2026-09-25-node24-json-probe`](../../../../record/evidence/2026-09-25-node24-json-probe/README.md)，退出 0；[D-040 §八 M49](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。**适用范围 Node ≥ 24.18.0**，实施时以包的 `engines` 钉定下限；换运行时或降版本须重跑那个探针 |

**落选方（手写完整解析器）的最强论证**：一遍完成语法、原文与重复键，不依赖任何引擎能力。**它输在**要自己担整套 JSON 语法的正确性，而引擎的解析已经是 RFC 8259 的。
**改选条件**：运行时换成不带这两个 API 的版本或实现（重跑探针失败），就改走手写解析器，读写的对外形状（`JsonNumber`、`{ failed }`）不变。
**本方弱点**：探针只证了这两个 API 可用、对五个样本保留原文，**不证**重复键、深嵌套、超长输入——那些归本包的单元测试；两遍各扫一次文本；并且**只在用它的边界上有效**——任何一处用普通 `JSON.parse` 读了 `opaque`、参数或金额，那一跳就静默丢精度或放过重复键（CB-2）。置信度：**中高**。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.identity-values` v1（catalog 登记的唯一依赖） | 已实现的 core 包，普通依赖 | 随包版本 | 静态 import |
| 被消费 | 本批全部其余数据契约包、stream-assembly、两个运行时、资产治理、注册表、MCP 桥、拓展件派发、模态投影 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**数据入口无持久状态、无提交点。**既有块/JSON入口是纯函数；新增Schema技术入口的编译器与缓存由显式构造者持有，见下文。

**失败映射**：表示层拒绝 ⇒ `{ rejected: 值 }`（六个之一，恰一个）；严格读入失败 ⇒ `{ failed }`，由调用处按契约映射：读块或消息文本的接收边界 ⇒ `malformed`（S-24、`data.messages/v1#S-37`），参数串的那一次解析 ⇒ 解析不了的调用块（S-12）。**都不抛异常**；抛出只留给本模块自身的缺陷。拒绝不是判定：被拒的工具结果块**不是**一次 `failed`（S-27）。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-4](../../../../spec/data/content-blocks/verification.md#静态检查义务) 约束的多是消费者的代码路径；模块侧实现与后置消费者检查分开记录：

| 检查 | 形式 | 谁跑 |
|---|---|---|
| SC-2 不解析半截调用的 `rawArguments`；完整调用只读 `arguments` | 本包不导出任何作用于 `rawArguments` 的解析辅助；规则（候选）：产品源码里 `readJsonStrict` 与 `JSON.parse` 的调用点白名单 | stream-assembly 与消费者包 |
| SC-3 除传输适配外不读写 `opaque` | 类型：`OpaqueJson` 不暴露内容成员；`writeJsonLossless` 能原样写出，`toOpaqueJson`／`readOpaqueJson` 是显式传输适配边界。普通消费者的直接结构读取被类型负例拒绝，传输边界调用限制仍归消费者检查，不声称公开函数构成权限隔离 | 全部消费者 |
| SC-1、SC-4 | 落在会话日志写入方与各消费者节点 | 各消费者 |

## 实施缺口与消费者影响

契约的已知缺口（G-1、G-4、G-10）不重抄。本节点自己的缺口：

- **CB-1 铸号方**：本节点给了词法候选，**铸号在别处**——`BlockId` 由模型侧传输适配与工具侧帧入口、落盘前补派生表示的一方铸；`CallId` 是否沿用上游调用 id、会话日志内唯一由登记它的模型请求运行时守。几处要用同一个生成器。owner：主线协调；落在 model-request-runtime、tool-execution-runtime 两个节点。
- **CB-2 无损读写只在用它的边界上有效**：`opaque`、`arguments`、金额从 JSON 文本读成值的**每一处**（存储提供者读 JSON 列、传输适配读上游响应、工具运行时收工具返回、跨进程的每一跳）都要走 `readJsonStrict`／`writeJsonLossless`（M36「落盘与回读走无损读写」；契约第四节新加的「数无损、重复键不被挑一个」一行把它写成**每一跳**的协议义务）。存储那一跳已由 [D-040 §八 M53](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 定为全库口径（JSON 列以 `text` 存取，驱动与 Kysely 不自动 `JSON.parse`／`stringify`，无损读写在应用层用本包），登为 `infra/storage-sql` 的实施缺口；两个运行时节点的读写边界仍各自承接。owner：storage-sql 与两个运行时节点；本节点模块侧「丢位或放过重复键即失败」测试已随 `44b84525` 交付，HUB 复验306条通过；原始结果与边界见 [verification](verification.md)。
- **CB-3 附件存储**：`AttachmentRef` 的解引用与租户判定（契约 G-1）属 [D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 的 C-6，**本程不补、留给下一程**，owner 主线。

## 2026-09-26 实际构建面

源码已建于 `packages/core/content-blocks`，`engines` 限 Node ≥24.18.0、<25；固定 Schema 通过本包公开 `./schema` 静态 JSON import 加载。值、类型、校验与 JSON 边界从公开构建入口消费；源码检查不依赖 Cordis、kernel、storage 或非 core 插件。运行结果归 [verification](verification.md)，本页不把外部每一跳、日志不变或标识唯一提升为模块保证。

## 中性 Schema 技术子入口

2026-09-26实施发现messages依赖图不含AM，而同一无损Schema机制需要复用。经独立architecture-reviewer归属评审无阻断，主调度在技术验收授权内接受将原AM新helper整体迁入本节点。CB已经拥有JsonValue/LosslessNumber和Ajv；AM/tool/messages均已依赖CB，不新增D-040 M41领域包边。不是把本包固定Schema私有投影直接开放，固定块校验保持不变。

公开 `@omne-harness-lite/content-blocks/schema-runtime`：技术输入 `SchemaDocument = boolean | JsonObject`（不从AM取JsonSchema），`createSchemaRuntime(resources: readonly SchemaDocument[], options?: SchemaRuntimeOptions): SchemaRuntime`，options只有可选 `patternFactory(source):RegExp`；返回 `metaValidate(schema):boolean`、`compile(schema):SchemaValidator`，validator.validate(JsonValue):boolean。原Schema、固定$id资源、调用方实例严格无损，复制冻结；编译器/缓存归构造它的调用方随引用释放，标准元Schema是固定输入，不建立module增长作者cache，无IO/异步/遥取。

adapter区分元Schema不合、编译失败、实例不符；领域拒绝次序和tool参数子集留消费者。低层exact keywords/projection/originalRoot不公开、不要求调用者手工配对；回调必须确定无副作用，native RegExp禁止g/y，异常原抛；不开放任意Ajv选项或async/remote refs。非标准Ajv扩展不会启用为领域语义。

精确数/整数联合/界限/multipleOf/const/enum/uniqueItems/长度与成员数保留原值；min/maxContains超safe边界按实际JS数组length<2^32的有界等价处理，无default的合法AMdomain不得因多余compile添拒绝。此等价不声称跨语言无限数组，也不因有helper就声称完整Draft全保证。

迁移门：单一实现且CB无AM反向import；built子入口与AM/tool/messages真实consumer；嵌套/外部$id/$ref/$dynamicRef原值上下文、含/~成员与交错调用；修改资源/作者Schema不改绑定validator；原数字oracle/混合正则/异常/g-y守卫；冻结资源与旧CB固定校验不变。实际证据另登记，本映射接受不等于实现已过门。
