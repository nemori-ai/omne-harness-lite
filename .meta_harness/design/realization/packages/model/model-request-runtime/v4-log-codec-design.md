# model-request-runtime：共同业务键与完整批认回增补候选

2026-09-27，rev 2，**candidate，未接受；本增补未实现、实际组合未验证、新增 bindings 0**。这是同一节点对 RT4 G-29 的窄投影，所有新增格式名、函数名、类型名均为**实现面候选**。不新增 package、plugin、fiber、service、服务操作或持久表。原四件套、[v3-design](v3-design.md) 与 [v4-design](v4-design.md) 保持原字节；本页没有采用资格。

## 精确输入与分层状态

| 层／输入 | 状态及本页边界 |
| --- | --- |
| 语义接受 | baseline `omne-harness-lite-design-2026-09-15`；[D086](../../../../record/decisions/model-runtime-tail-settlement-adoption/decision.md) 接受 [RT4](../../../../spec/capabilities/model-request-runtime/v4/contract.md) 全部 S-1～S-73、27 资源。contract SHA256 `4a31cb8bc98ae5bbb55a28c671ff84a8f86520747de7dd07c180787183651689`；本页重点 S-5/S-8/S-15～S-17/S-33/S-49/S-68～S-73 |
| 已采用提供者 | [D087](../../../../record/decisions/model-runtime-v4-projection-adoption/decision.md) 采用 v4-design rev 2，SHA256 `95a0115e89404d147ef547655e06e3c8bca86a79c16b9a9fa8b13dc56518f212`；[D076](../../../../record/decisions/model-runtime-delivery-adoption/decision.md) 采用 v3-design，SHA256 `31a46a46ad67bb6d1dd383cbc6a08a7a89d3354aa261d9db54ab8f7ae7d2ae99`。原 L-2/L-5/L-6 的命名责任和 D087 的共同结算、真实停止责任保持 |
| 日志 | [SL3](../../../../spec/capabilities/session-log/v3/contract.md) SHA256 `f327f1289e1d6c539dd959e8862b382869e3d303cf984b6a773fdd6a00e4bd26`，由 [D083](../../../../record/decisions/session-log-tail-condition-adoption/decision.md) 接受；[D084](../../../../record/decisions/session-log-jsonl-v3-projection-adoption/decision.md) 与 [D085](../../../../record/decisions/session-log-recovery-projection-adoption/decision.md) 分别采用日志 v3 投影与恢复投影。日志源码已有 SL3 三操作；这不构成本页业务组合证据 |
| 数据与消息消费者 | catalog accepted 的 [MS4](../../../../spec/data/messages/v4/contract.md)、[MR4](../../../../spec/data/model-response/v4/contract.md)、[MP3](../../../../spec/data/model-profile/v3/contract.md)、[CA2](../../../../spec/data/call-accounts/v2/contract.md)、[IV1](../../../../spec/data/identity-values/v1/contract.md)、[CB3](../../../../spec/data/content-blocks/v3/contract.md)；模型接受沿 [D078 的行政接续](../../../../record/decisions/model-main-integration-coordination/decision.md)，JSON 接收与原生产者铸号沿 [D070](../../../../record/decisions/core11-integration-coordination/decision.md)／[D068](../../../../record/decisions/core-implementation-spec-reconciliation/decision.md)。[runner3](../../../../spec/capabilities/loop-extension-runner/v3/contract.md) 仅在 S-19/S-28 实际消息路径共同消费本编码，不自动升级其 RT3 规范依赖 |
| 可实施 | 本页的键、载荷和纯成员检查可独立评审；生产认回还受下文 G29-P 的全写方／合法来源门约束。G-28、G-30、G-31 继续沿原 owner，不能由本 codec 消除 |
| 绑定证据 | 新增 0。下列 C-V 是待执行义务，不登记尚不存在的测试绑定 |
| 实际验证 | 本轮没有 IO、真实 JSONL 竞争、Cordis 运行、paid 请求或模型检查；结构检查不证明完整批、秘密裁剪、真实来源或停止 |

RT4 的 17 项精确规范依赖与原 P-2/P-5、十三操作、公共 invokeModel 边界不变；尤其 AR3 不随 AR4 升级。MR4 S-14/G-3 的一般条目壳、寿命和表示选择仍属原 owner。本页只为 RT4＋SL3 这一组合选择两个不可变条目承接 persisted 的同一回复，不定义一般 SessionEntry 协议。

## 公开构件与 Cordis 投影

本包根公开下列纯构件，全部静态导入无 IO、env、时钟、随机源或 Cordis 装载；不依赖活的 runtime 或租户服务。实施文件候选为 `packages/model/model-request-runtime/src/log-codec.ts` 及同包内必要纯子模块，跨包只用根公开入口。消费者不得复制拼键函数。公共 invokeModel 不调用它们、不因此取得日志依赖；P-2 与外部回复方只是其消费者。

| 候选公开面 | 输入、输出与拒绝边界 |
| --- | --- |
| `modelLogFormat`、`encodeModelLogKey`、`decodeModelLogKey` | 固定下文格式 `mrr/1` 与闭合键种类；接收明确种类和已指定身份／精确 dispatch，返回键或具名 `invalidValue`；反解非规范写法、错元数、未知种类一律 `invalidKey`，不为任意业务身份分配新值 |
| `captureModelLogValue` | 对外来 unknown 做一次严格 JSON 捕获，再按明确预期类别运行 core 完整接收；返回自有不可变原 JSON 表示及经校验的类别／字段投影，或 `invalidValue`。这不是新 data 契约；不凭 TS 类型接受输入 |
| `prepareModelLogEntry`、`inspectModelLogEntry` | 前者用显式 session、tenant、可选成对 run/attempt、已捕获值和下表用途产生 OwnedLogEntry；后者对 LogEntry 的载荷、壳、键集合做反向全校验。返回值不授予读取／写入权限、栅栏或生命周期许可 |
| `inspectSettlementMembers` | 输入同一合法完整前缀、原 dispatched 与 opened/intent 事实、目标身份和可选当前处置；只输出 `absent`、`completeMembers`、`inconsistent{reason}` 或 `undetermined{reason}`。完整成员结论附原响应、内含账、对应消息及其位置；**不输出“物理同批已证”** |
| `modelLogJsonEqual`、`recognizeMessageValue` | 完整 JSON 值精确比较；消息认回须完整接收及全值相等，区分缺席、同值、异值、不可判。runner 将异值按自己的 S-19/S-28 映射，不能把它一概映射成 runtime unavailable |

这些失败是实现面结果，P-2 仍只返回各既有操作允许的值：入口输入非法按对应 invalidInput；耐久输入不可认证映射 unavailable；合法不同处置按 S-49 alreadyEnded。纯函数不返回业务“已完成”，不触发重试、不抛一个通用异常冒充模型 failed。固定格式或静态接线非法沿 v3 配置政策启动失败、不 provide；运行时缺合法来源／权限等所需事实按原 unavailable，不能默认兼容。

[D087](v4-design.md) 的构件与本增补单向组合：`readSettlementPrefix` 获取同代际合法完整读，`interpretSettlementPrefix` 用 `inspectModelLogEntry` 消费模型记录而把 Run 解释留给原 owner；`recognizeCommittedBatch` 使用 `inspectSettlementMembers` 并核 G29-P 组合前提后才给业务认回；`prepareSettlementBatch` 只用共同捕获／键构造器形成下述完整数组；`createSettlementCoordinator` 拥有 unknown、opened 强门、tail 条件和策略，不让 pure codec 持有这些状态。它们不是两套竞争的结算算法。

| 契约责任 | 公共／服务兑现点与共同对象 | 依据或缺口 |
| --- | --- | --- |
| RT4 S-8/S-70.1、MR4 S-6、MS4 S-3/S-49 | 全写方使用同一键生成器；判重落在同一 session 的 `entries.jsonl` 追加提交点 | C-V1/V2；部署内 ResponseId 发号仍由 runtime owner 保证，日志只在一本内判重 |
| RT4 S-17/S-70.2～3、MR4 S-14/S-19 | 共同 prepare／inspect＋结算协调器；同一个 entries 对象一次追加整批 | C-V3～V6；pure 只证成员，G29-P 保留物理同批来源门 |
| MS4 S-49、MR4 S-8/S-11/S-17/S-36 | 读取原锚点、原绑定、原参数处置、首 token 与精确身份；同一前缀内交叉核对 | C-V5/V6；Run 与 late 判法仍 G-28，不查当前档案补历史 |
| RT4 S-70.5～6/S-72 | D087 协调器与原 host/call/reply owner；共同恢复读取、所有旧真实写任务 | C-V7；codec 成功不关闭旧未知责任 |
| runner3 S-19/S-28、MS4 S-32 | 与 persisted 共用 MessageId 键；完整值比较，日志提交判重 | C-V8；仅迁移实际消息消费者，不把 runner 全域收进本包 |

不新增 Cordis inject、effect、event 或 isolate。采用仍为 D025 Cordis 4.0.4；既有生命周期仅沿 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md) 与原宿主设计。本增补不从内核推导持久、停止或权限保证。

## 精确键格式：种类、范围和读写同源

**技术选择 K1（候选）**：`K(parts) = "mrr/1/" + A(parts)`。parts 是下表固定元数的字符串数组。A 是无空白的 JSON 数组，分隔符只用 ASCII `,`；每个字符串的表示 Q 为双引号包住的序列，**每个 UTF-16 码元恰编码为 `\u` 加四位小写十六进制**，连 ASCII 也转义，不采用短转义，不遗漏任何码元。反解之后必须重编码逐字等于输入。键首尾固定为非空白，满足 IV1 S-31。

这是键表示，不解析身份的含义。身份格先按 IV1 S-31 接收，不能因键外层已转义就接受非法原身份。原串不 trim、casefold、Unicode 归一化、URL 解码，不要求 UUID、长度或禁止分隔字符；核心接收接受的串均保留。补充平面字符按其 UTF-16 对保留；核心接收若接受孤立代理码元，同样原样编码，不能经 UTF-8 替换字符把两个输入合并。跨语言实现按这个码元表示产生同串，不能采用宿主默认 JSON 转义风格。两个 parts 相等当且仅当每一格原串相等；数组语法、固定元数和闭合种类排除了拼接边界歧义。Q 可逆、无 hash 碰撞前提。

`N(dispatch)` 先验证精确正整数，再从 `jsonNumberSource` 的十进制语法取得符号、全部有效位和十进制指数；去系数前导零、尾部零，每去一个尾零指数加一，得到唯一正整数系数 c 与非负整数指数 e；结果恒为 `c + "e" + e`，e 无正号、前导零。`1`、`1.0`、`1e0` 都为 `1e0`；`1000`、`10e2` 都为 `1e3`。c/e 用精确字符串和 bigint 运算，不转 Number，不展开指数个零；非正数／非整数拒绝。反解只接受此规范形式，恢复 `LosslessNumber`。**现有 ExactDecimal.toString() 保留源词法，不能直接当 N。**该规范化只用于键，原 payload 的 dispatch、金额及其他数字表示不改。

一次计算的代价为身份与数字词法长度的线性扫描，Q 最多每码元六个 ASCII 字符；不设新的身份长度上界。资源不足属于调用方具名不可用及 D087 预算门，不截断、不改成散列。不存在一份键对应任意巨量展开后的十进制串的分配要求。

**作用域**：有效索引地址是 `(SessionRef, K(parts))`，SessionRef 由 SL3 的操作参数和返回条目显式承接；session 不在 parts 重复。MS4 S-24 的 SessionRef 只是全树唯一名字的不透明串，没有本页可增造的 `kind/context` 字段。不同 session 绝不合并结果；同一本内的 message、response、call、dispatch 和查询种类分格。ResponseId 的部署唯一性由原发号方承担，不能把 SL3 会话内判重说成跨会话唯一约束；相同 MessageId/ModelCallId 在不同会话仍为不同业务身份。壳 run/attempt、tenant 也不加入原判重身份以绕过唯一范围。

下表 `D` 为 dedupeKey，`R` 为 readKeys 的构造顺序；各位置均写 K 的 parts，实际字段使用 K 后字符串。D 与 R 是两个字段，即便用同一串仍须显式写两遍。读取集合不得重复。`All = ["all"]`，`Call(c) = ["call",c]`，`Dispatch(c,n) = ["dispatch",c,N(n)]`，`Batch(r) = ["settlement",r]`，`Messages = ["messages"]`。有壳 run 时，最后再加 `Run(u) = ["run",u]`；无 run 不加。Run 是读分组，不是新的身份或 Run 终结认法。

| 值／用途 | D | R（含显式 D） | 唯一范围、来源 |
| --- | --- | --- | --- |
| dispatched(c,n) | `["dispatched",c,N(n)]` | D, All, Call(c), Dispatch(c,n), 可选 Run | 会话／call／dispatch，RT4 S-8/S-15、MS4 S-49 |
| opened(c,n) | `["opened",c,N(n)]` | D, All, Call(c), Dispatch(c,n), 可选 Run | 同上、独立种类；不按 firstTokenAt 发号 |
| interrupt intent(c) | `["intent",c]` | D, All, Call(c), 可选 Run | 会话／call；**不带 dispatch 或 attempt**，RT4 S-31 |
| call ended(c) | `["ended",c]` | D, All, Call(c), 可选 Run | 会话／call；**不带 dispatch 或 attempt**，RT4 S-6/S-32 |
| response(r,c,n) | `["response",r]` | D, All, Call(c), Dispatch(c,n), Batch(r), 可选 Run | r 为原 dispatched.response；不带 owner、处置、attempt 后缀，RT4 S-70 |
| persisted AssistantMessage(m,r,c,n) | `["message",m]` | D, All, Messages, Call(c), Dispatch(c,n), Batch(r), 可选 Run | 会话／MessageId，消息用途须由同批已校验 response 提供 c/n/r；不能从字符串解析 |
| 其他实际消息，包括 runner 提醒(m) | `["message",m]` | D, All, Messages, 可选 Run | 与模型回复共用消息唯一范围；不得用 source、type 或 owner 绕开同 ID 冲突 |
| selection changed | **缺席** | All, `["selection"]` | 无命令身份，不以 routeName/at/hash 造判重键，RT4 S-27/S-72 |

普通 AssistantMessage 不允许绕过 persisted 构造支独立写入；其他消息支只承接确实需要本格式的非模型消息。非持久回复的内嵌 MessageId 不因此获得一条 Message 日志条目；若其消息键已被占用，须查明是否属于非法残批／身份冲突，不能静默成功。`All` 不是合法完整前缀：Run 等其他 owner 的条目不必带它，D087 全读仍用 readSince 同一合法范围。

decode 键只还原技术元组，不证明载荷类型。inspect 必须从已经完整接收的 payload 和显式壳重建 D/R，核 D 的有无、R 集合精确相等，无缺项、重复或额外项；构造固定顺序，读取不把集合顺序当业务相等。错误类别、多键冒充、错 call/dispatch/run、response 键挂消息等均不可认证。外部普通条目不受本页格式治理；但它占用本页保留键或宣称本格式而无法解码时，是相关认回的冲突，不当“不相关”跳过。完整前缀亦检查模型载荷有记录却遗漏应有读取键的情形，不能仅查 readByKey 就宣称不存在。

## 载荷承接、捕获与值比较

**技术选择 P1（候选）**：本组合的 SL3 payload 恰为 `{ format: "mrr/1", category, value }`，三字段闭合。category 恰为 `record`、`message`、`response`；value 分别是未经业务改写的 MS4 ModelInvocationRecord、可写入日志的 Message、MR4 ModelResponse。record 再按 MS4 的五个 kind 判别。它是 opaque payload 内的 provider 技术封装，既不成为新的共享 data Schema，也不在日志 provider 注册业务种类；无 revision 默认、batchId 或命令身份。未来不相容格式必须由共同 owner 显式采用，不能凭字符串自动升级。

捕获顺序固定：文本先 `readJsonStrict` 拒绝语法／任意层重复成员；值入口先 `copyJsonValue` 得到自有冻结 JSON。捕获失败则 invalidValue；**不删字段、不调用 getter/toJSON、不把代理对象当无副作用保证**。随后只对同一自有快照执行完整 `judgeModelInvocationRecord`、`judgeMessage` 或 `judgeModelResponse`，再取得类别投影；不能先按 key 挑字段后交 judge。prepare/inspect 的日志消息支显式拒绝不入日志的 SystemMessage；需要日志前缀关系的消息另以完整、合法、截至该位置之前的消息前缀调用 `judgeMessageInLog(value, prefix)`，前缀不可得不能代传空数组。此项不把 compaction／工具配对的完整业务 owner 移到 codec。

实际公开接缝：messages judge 返回已接收值；response judge 返回 `{ok:true}`，**没有替调用者返回 owned ModelResponse**。因此响应接收器始终保留预先捕获的 JsonValue，以完整 judge 和显式字段收窄构造受检投影；不声称布尔返回会转换原对象，不用断言把未经接收的 unknown 变成 ModelResponse。`JsonNumber`／`LosslessNumber`／`jsonNumberSource`／`writeJsonLossless` 来自 content-blocks 根；`ExactDecimal.from(...).compare(...)` 来自 call-accounts 根。没有 `coreJsonNumber` API，不私导 core 内部 equal/snapshot，不另混一份 LosslessNumber 品牌。

`modelLogJsonEqual` 按 [runner3 S-19](../../../../spec/capabilities/loop-extension-runner/v3/contract.md) 与 MP3 S-29 的精确值规则：JSON 类型保留，数按精确数学值相等，字符串精确相等，对象成员无序但成员集合一致，数组有序；缺席不等于 null。用于身份关联的 dispatch/attempt 等不经 Number，time 原值匹配与既有时间顺序校验分开。完整认回返回原捕获值，**相等比较不重序列化、规范化金额或用本次候选覆盖旧值**。序列化仍用 writeJsonLossless；诊断不输出原业务键或完整值。

完整 core 接收只证明表示合法；事实真实性仍来自 D087 的原锚点、实际写方及合法来源。MR4 记录里的 usage/cost 就是这一响应的账，不新增 account 条目、不重复记账、不重算为目录估价。账汇总仍从其原条目壳取得归属，响应内 original attempt 与归账壳 attempt 可以合法不同（MR4 S-7/S-8、CA2 S-25/S-37～S-39），不得要求二者相等来拒绝恢复补账。

## 完整业务批与关联检查

每次调用 prepareSettlementBatch 前仍按 D087 先认回。下列数组是此组合唯一允许的响应追加形状，response 不与新的 Run 边界、普通模型记录或无关消息混批。`M` 和 `R` 的壳由显式 owner 输入；同 session/tenant，run/attempt 各自成对且满足所属操作，归账不从响应内 original attempt 自动补。persisted 两成员使用本次相同显式归属壳，回复承接沿原调用／回复 owner；不可据此改变历史账归属。

| 已定 outcome／处置 | append 的完整数组与含义 |
| --- | --- |
| complete／truncated／带 reply 的 interrupted，persisted | **一次** append `[M,R]`，顺序固定；M 为指定 MessageId 的 AssistantMessage；R.reply 和 M.value 是同一完整回复值的两种不可变承接，完整精确相等。由同一个自有回复值构造，消息不先写，不独立更新任一副本 |
| 同上，vetoed／consumed | 一次 append `[R]`；reply 仍完整留在 R，处置所有成员保留，不写 M；不能让一次否决改成 failed |
| failed，或无 reply 的 interrupted | 一次 append `[R]`，没有 replyDisposition/M；delivered、firstTokenAt、failure/initiator 按 MR4 条件关系，不拿零内容替 opened 缺席 |
| 未出门或只写 intent/ended/opened/dispatched/selection | 不属于响应批，按普通构造器和 RT4 原操作写该记录；没有响应就没有账，selection 不可重放认回 |

写前与读后共用下列壳／值接收、身份及字段关联规则；**位置、在前缀内存在、相邻和 Batch(r) 的耐久成员集合只在读后检查**。写前输入是无 position 的 OwnedLogEntry 候选数组，只检查其值、键、顺序和成员关系，并使用已经读得的原锚点与构造前缀；不要求候选 R 已在前缀内，不预测 position，不用待写成员冒充耐久事实。读后以实际 LogEntry 和同次完整前缀验证原批；先认合法先到批，只有未认回原批且 D087 的追加前提成立时，才检查当前待写候选的稳定身份与占用情况。

1. 每个壳、wrapper、value 全部合法；session 精确匹配本次操作，tenant 与合法会话归属相符；**读后**位置为真实 LogEntry 的精确正整数且落在同一被捕获前缀内，写前候选不带 position。不得把两次不同 tail/代际的按键结果拼成这一前缀；readByKey 只作定位，缺席结论仍需合法完整读和 unknown 前提。
2. 目标 ResponseId 来自唯一原 dispatched.response，call 与 dispatch 对应；检查该 call 的顺序及原生命周期由 D087 解释器承担。opened 必须对应同 c/n，R.timing.firstTokenAt 与原 opened 相等；写前 opened 须已在构造前缀中，读后还须位置先于实际 R。声称缺席需相应前缀内确无 opened 且 opened 强门已闭合。intent/ended 不是 Run 终结。恢复按 S-33 保持 intent 优先、原首 token、无新 send 的规则，不以此 codec 重做收场策略。
3. R.call.callId、dispatch、原 run/attempt 与 dispatched 的归属事实一致；R.id 与 dispatched.response 相等。R.route 的 profile、profileSnapshot、adaptation、selectedBy、provider、credentialScope 对应原 dispatched；绑定比较包含所有版本和配置值，不查最新注册表。R.route.parameters 等于从 dispatched.parameters 应用原 adjustment/drop 后的那份；两份 adjustment/drop 原项逐项相等，extra 使用原键名、全部移除后 extra 缺席。未知原锚点／参数不能补默认。
4. MR4 S-13/S-14/S-17/S-19/S-27/S-36 的完整条件关系成立；时间跨字段顺序由沿用的时间判定构件校验，不按字符串字典序。未报告 usage/cost/upstream 字段不得伪造；已经提交的 late 按原提交前缀与采用的 Run 认法核实，不拿当前尾重新计算并改写：在 G29-P 成立时，persisted 的原前缀尾是 M.position−1，单响应批是 R.position−1，均按精确整数计算；本批自己的归账 attempt 不进入其原 late 判据。G-28 缺席时依赖这项判断的生产认回仍不可判。
5. persisted 恰有一个 M 和一个 R；M.id 等于**所检查这一批自身的** R.reply.id，M.response 等于 R.id，type=assistant、ending/blocks/createdAt/所有其余成员与 R.reply 全值相等。写前候选还须沿用为该候选已指定的 MessageId；读后按原批自身身份核对，不要求原批 MessageId 等于败方未提交候选的 MessageId。合法派生表示应由原落盘前消费者先产生一致的完整回复值，本 codec 不重跑转换、不容许两份内容独立分叉。**读后**须 M.position+1=R.position，Batch(r) 下恰是二者；非 persisted 的 Batch(r) 下恰为 R，若原 R 有内嵌 reply，完整前缀里该原 reply 对应的 message 键不得出现消息；没有 reply 时也不接受额外 Batch(r) 成员。写前只检查表中候选数组的成员及顺序，不用候选数组代替这些读后事实。
6. **读后**全前缀中每个与原批相关的 D/R 均可从自己的合法值反构造，目标 D 唯一，无遗漏、重复、假 key，原批的 MessageId 不被其他消息冒占；原批不存在第三成员或错种类。读取原 response、账、message 全值并保留。缺成员、相邻但不关联、未知 wrapper、属于该原批的孤立 M、错绑定／参数、无法确认原值，一律不补、不换 ID、不覆盖。**写前**当前候选的键、完整数组及稳定 MessageId 检查仍须通过；没有可认回原批时，当前候选 MessageId 被别批占用不能换 ID 或补写。合法先到的另一种收场或处置仍由 S-17/S-49 认回确定事实，**败方未提交候选的 MessageId 不同或其键被占用，不能单独否定合法原批；不要求原批所有字段等于败方候选**。

在已合法接收的完整字段上，同处置比较包含 vetoed.by/reason 或 consumed.by，reason 缺席与空串不同。这是既有值的结构相等实现；不把“都叫 vetoed”当同处置。不同合法处置返回原已提交事实，S-49 映射 alreadyEnded。没有 reply 的合法先到终态不伪装成同处置成功；服务仍按原终态规则返回。若现有接收或语义无法判定具体字段关系，输出 undetermined，不以假值补齐。

## 物理同批证据的边界：G29-P

**SL3 S-18/S-19 与实际 LogEntry 公开 position，没有 commit/batch 标识。**历史 H1：一次 append(`[M,R]`)；历史 H2：先 append(`[M]`) 再 append(`[R]`)。若无其他插入，两者可产生完全相同的 entries、位置、tail、dedupe/readKeys；此后 readByKey/readSince 无法区分。即使加一个 payload batchId，H2 也可带同值；相邻／成员完整只提供必要检查，不能证明同一物理提交。runtime 不读取私有 JSONL 路径，不借 LogCommit 技术类型增造第四个日志操作。

因此分开两个结论：`completeMembers` 只证明现有读面可检查的完整值和关联；`recognizeCommittedBatch` 的业务成功还需 **G29-P：该物理日志相关历史确由共同采用本格式与一次 append 协议的写方产生**。此处沿 RT4 S-73 的组合前提，不把“声明自己合规”作为运行期布尔开关放行。

G29-P 由实际应用／宿主和全部写方 owner 交付：列全真实 append 调用路径、共同格式精确采用、同根旧写方实际停止／无法再追加、原始空日志或明确可核对来源的历史，以及真实正反向 IO 证据。每个写方以 prepareSettlementBatch 的**整个数组**只调用一次 SL3 append；返回 unknown 后不得拆批补成员。必须在真正的外部 persisted 写方上做拆批负控，让 M 后暂停／退出并与 runtime 竞争，观察孤消息／缺响应时绝不成功；还需检查无插入的 H1/H2 读面不可区分，禁止测试仅因正常样本相邻就称已证明物理同批。

历史来自未知旧格式、存在未采用／可旁路的写方、来源或实际停止无法确认，相关组合保持 **G29-P 未闭合、unavailable**；不把该历史当空日志、不猜迁移，也不能仅配置 `trusted=true` 开闸。没有另写 durable trust 表，本页也不创造日志签名或认证服务。受控测试日志只支持该测试来源。若目标装配不能兑现这项历史来源前提，而要求仅靠任意历史的三操作读结果证明物理同批，则本方案不能完成 S-70/S-73：**需另走正式规格演进，给日志公开可验证批边界的证据**，不能在本页弱化为相邻就算批。这个适用性需独立架构复核，G29 不由 pure codec 单独关闭。

## 认回结果、unknown 与存储要求

| 读得事实 | 纯结果／组合后的动作 |
| --- | --- |
| 完整合法前缀内无目标响应、无目标 Batch、无当前待写候选已指定消息键占用 | `absent` 只描述该次读；没有旧未知，或旧全部写者实际停止且权威恢复完成后，D087 协调器才可按 S-71 决定构造／追加；当前候选身份／占用检查不先于合法原批认回 |
| 完整成员、原批自身全关联合法、G29-P 成立，处置与本次相同 | 返回原完整批和位置，业务按 S-49 原结果或相应既有路径收场；不以败方候选 MessageId 或其占用否定该合法认回，不重铸 ID、不重记账、不重发模型 |
| 上述合法原批处置不同／另一合法先到终态 | 保留原批；S-49 为 alreadyEnded，其余沿原终态规则，不替败方追加消息 |
| 部分碰撞、原锚点／消息缺失、身份关联错误、未知格式或原值不可判 | `inconsistent`／`undetermined`，业务 unavailable；不可补残批、按命中数量成功、换键、覆盖原值 |
| 内容成员完整但 G29-P 来源未证，或合法全读／Run 认法缺席 | 仍 unavailable；pure 完整成员结论不得冒充已提交合法批 |

读到合法已提交批不关闭旧任务：旧网络、门、append 和 unfenced 外部写方的实际停止仍由 D087 原容器逐项确认。alreadyRecorded/tailChanged 只约束 THIS；opened unknown 强门优先。记录普通键可认回其原值和身份，但不会为 selectModel 造原命令；读取当前 selection 不证明某次未知命令成功。reconcile 无部分返回而已提交前批保留的规则不变。

| 对独立存储提供者的要求 | 条款与共同对象／owner |
| --- | --- |
| 同一本 session 的判重、全尾比较、全批追加和持久确认共一提交点 | RT4 S-68/S-73、SL3 S-17/S-32/S-33；全部写方共同触碰实际 session 的 `entries.jsonl`。日志原属主锁／每本队列／一行一批／datasync 承担，不靠 runtime mutex 或时钟 |
| 壳和 payload 无损原值、不可变位置、合法一致读及可识别 unavailable | SL3 S-11/S-18/S-19；调用方不能把缺 readKey 误当无对象。D087 负责完整前缀与代际；权限归 G-30 owner |
| 健康已发布状态与不可信尾分别处理；物理退出、扫描、恢复沿原机制 | D084/D085 与 RT4 S-70；codec 不持有文件／索引、不写 marker，不将 lost ack 统一变成坏日志 |
| 物理同批真实性的来源证据 | RT4 S-73 的全部写方及真实应用；SL3 读面自身无此证据，G29-P 未满足即受阻，不能给日志虚构新保证 |

两个可反驳交错：外部 `[M,R]` 与 runtime `[R']` 使用同一 ResponseId，谁先整批提交谁赢，败方 THIS 全零、认回合法原批；拆批外部先 M、runtime 随后 R' 时，留下孤消息／不相容组，负控须被组合验收检出且业务不得成功。另有 H1/H2 无插入反例说明纯读判定的固有限度。没有新增共享存储对象或跨 owner 事务；既有 entries 对象承担原同提交要求。

## 全写方采用、装卸和历史迁移

| owner／消费者 | 必须实际采用的面及撤除配对 |
| --- | --- |
| runtime P-2 实施者 | dispatched/opened/intent/ended/selection 全部普通记录构造与读取；普通响应、settleReply、interrupt 后续、host close、reconcile、readAttempts 同用 codec／协调器。取得自有值后由原调用容器持有；停止准入并按 D087 收口，pending 值不冒充耐久记录 |
| 外部 persisted 回复 owner | 至少 [model-request-acceptance](../../../apps/model-request-acceptance/README.md) 的一个真实写方调用共同 prepare＋协调器，一次 append `[M,R]`；close 后实际旧任务停止或明确保留责任，不把 unknown 匿名交给日志。无需先交付整个 Agent Loop |
| 实际纳入装配的 runner 消息路径 | 使用同一 `["message",MessageId]` 和 wrapper、完整值比较；同 ID 同值认回、异值按 runner S-19/S-28 阶段映射。run fence／SL3 condition 显式采用仍归 runner；不迁移其全部拓展结论业务键、不新增环状运行时调用。纯 import 不读取 modelRuntime service |
| 日志 owner与实际宿主 | 对同根全写方清点、关闭旧准入并确认实际停止，沿 D084/D085 排空／恢复／独占后开新格式；未确认不启动相关生产写面。权限、时钟、凭据和所有者接续继续由原应用负责 |
| 文档、制品与真正调用者 owner | 实施后同步 runtime README/README_ZH 的真实导出和三种接收／写入／认回示例，实际应用与 runner 双语说明更新；独立制品运行公开例并证明无私导，不把候选写成既有 API |

本 pure 模块无受管资源需要 dispose；每次生成的快照随原调用／回复／读取责任释放，不设全局无界缓存。替换纯实现可优化技术手段，但 K1/P1 逐字编码、接收与相等结果必须等价；替换不发号、不重规划、不重发。新旧 codec 无静默猜测兼容。当前未生产发布，不增未经要求的兼容层；旧源码／设计保留作历史证据，不把保留等同可注册旧写方。

同根已有不确定旧编码时，owner 先交明确迁移映射和完整原批来源证据给主线；本页没有就地重写、清空日志、默认忽略旧条目或双写方案。不能确定者阻断依赖历史的读取和新写，其他隔离且来源已核的测试可继续。版本采用是 provider 格式选择与全消费者交接，不改 RT4/SL3 的公开三操作，也不把旧 runner 的规范依赖自动替换。

诊断沿 RT4 S-20/S-63：关联 session/call/dispatch/ResponseId 和适用 Run/attempt，记录捕获拒绝、键／成员冲突、来源门、原批认回、unknown 保留与实际停止阶段。原因码与位置可见，原 key、消息全文、完整前缀、配置秘密、raw headers 不进诊断；sink 失败不改变业务结果。持久 payload 沿原脱敏边界接收，codec 不靠事后日志清洗补救凭据泄漏；秘密哨兵须在实际组合验。

## 取舍、待执行验证与残余门

| 本候选选择 | 最强替代论证 | 本方弱点／改票条件／置信度 |
| --- | --- | --- |
| K1 可逆固定数组、全码元转义＋精确科学整数 | 长度前缀二进制／URL 编码更短，hash 键固定宽度、索引更省 | 本方最多六倍字符开销且需共享编码器；hash 不提供单射、普通分隔拼接易混范围。若真实资源测量表明此格式不可承载，先重评精确可逆格式，不截断身份。中高 |
| P1 窄 wrapper＋core 接收，两个不可变条目一次写 | 裸 payload 更短；一个合并条目在读面天然自含全批 | wrapper 增少量字节／版本传播；一个条目只有一个 dedupeKey，不能直接同时保护 MessageId 和 ResponseId，扩日志多键将越出本轮。全批来源前提若不能成立需正式演进，不靠包装美化。中 |
| 共享 pure 入口留 runtime 同节点 | 各写方本地拼接更少依赖；另建 codec 包可避包层循环 | 共享入口新增消费者的静态包依赖；实施须保持纯导入、可单取用且不形成运行时 service 循环。出现真实依赖循环或跨领域第二套语义时送主线重新定位，不现在建平台。中高 |
| G29-P 来源证据与 pure 成员结果分开 | 在 SL3 read 暴露持久批边界可直接排除 H1/H2，无需信任全部历史 | 当前前提强、未实际闭合；源码证明和正反 IO 必须共同覆盖真实写方，不能只声明合规。若要求验证任意历史即改票进入新规范，不能在现行读面强称成立。适用性待独立架构复核 |

所有验证均为**待执行**，bindings 0；原 D087 R4-V、v3/原 verification 的既有义务继续。以下每项必须保全真实输入／输出及负控失败，不能由类型或 fixture 独自替代。

| Oracle／条款 | 可失败的正反验证与 owner |
| --- | --- |
| C-V1／IV1 S-31、RT4 S-70.1 | 所有键种类固定元数往返；身份含 slash、逗号、引号、反斜线、内嵌空白、组合／分解 Unicode、补充平面及 core 可接受码元；不变原串、不互撞。不同 session／种类／call 的隔离；dispatch 的 1/1.0/1e0、超 safe integer、巨大指数等值键相同，非等值不同。删种类／范围分格、用 Number、Unicode normalize 等负控必失败；公共构件 owner |
| C-V2／RT4 S-70.1/S-73 | 两个独立实际制品消费者对同一业务生成相同 D/R，去掉显式 readKey 或加 owner/attempt 后缀必失败；selection 恒无 D、不从相同 at/route 认原命令；runtime、外部回复、runner 实际入口 owner |
| C-V3／RT4 S-17/S-70、SL3 S-17 | 真实 JSONL 两种胜出顺序：外部 `[M,R]`／runtime `[R']`，核一 rsp、一账、无孤消息和原 MessageId/ResponseId/金额/词法不变。同处置认回返回原结果；完整合法不同处置 S49 alreadyEnded，不追加败方消息；真实应用＋日志 owner |
| C-V4／RT4 S-73、G29-P | 枚举每个生产 append 调用位置，观测一次调用数组；真实拆批 M 后暂停／退出与 runtime 竞争负控失败，禁止“先写消息再补响应”。H1/H2 无插入读结果相同、pure 不能输出物理同批；未知旧来源／未采用写方必须关门。去来源门或以 trusted=true 自证的负控失败；宿主＋全部写方 owner |
| C-V5／MS4 S-49、MR4 S-7～S-19/S-36 | 伪造响应 key、重复/缺 readKey、错 session/tenant/call/dispatch/原 attempt、错绑定修订/配置、错原参数处置、缺 opened/错时刻、伪零费用逐一不得成功；合法归账 attempt 与原发出 attempt 不同须保留。删除任一关联谓词的负控须失败；runtime＋core 消费 owner |
| C-V6／MR4 S-14、RT4 S-70.2～3 | 部分碰撞、只有 M/只有 persisted R、M 与原 reply 的 id/ending/blocks/createdAt 任一异值、错 Batch、额外成员、两批拼接、非 persisted 却有其原 reply 对应消息、未知 wrapper 均 unavailable；合法 first-winner 原值不与败方所有候选字段强制相等，败方候选 MessageId 不同或其键被别批占用不能单独阻止合法认回。写前无 position／候选 R 尚未入前缀是正常输入，不能预测位置通过读后验证。仅计数／仅键命中／只 Schema、用败方身份否定合法原批、把候选位置当耐久位置的负控失败；共同认回 owner |
| C-V7／RT4 S-70.5～6/S-72 | 已提交丢 ack、确未提交而回执未知、旧 writer 迟到三支；codec 已见完整事实仍未关闭旧任务。THIS 零写不能证旧次没写；旧网络/门/fenced+unfenced 真实停止和权威恢复后才可据缺席重构。opened unknown 所有普通结算入口强门保持；真实宿主＋日志 owner |
| C-V8／runner3 S-19/S-28 | 真实 runner 提醒与模型 MessageId 判重共用命名空间；完整同值（对象成员换序、等值数字）可认回，异值／来源改变不可当 alreadyRecorded 成功。已落结论后异值为 replayInconsistent，读不可判 unavailable，不改原结论／换 ID；runner 实际消息路径 owner |
| C-V9／CB3、MR4 S-27/S-22 | 嵌套重复成员、getter/toJSON、伪 LosslessNumber 拒绝；捕获后修改调用者对象不改键/载荷；保留未知值与精确金额，丢精度和判定后再读可变原对象负控失败。根制品纯导入无 IO/env/clock/Cordis，公开双语例编译运行；模块实施者 |
| C-V10／RT4 S-20/S-63/S-73 | 同根旧写方未停、日志不可信恢复、版本不符各自阻断；原有效事实不清空。诊断秘密哨兵不泄露、sink 失败不改变业务收场；调用／日志／实际应用 owner。声明式 owner 清单而缺真实调用证据不通过 |

| 尚缺的门 | 条款、受阻消费者与关闭责任 |
| --- | --- |
| G29-C：候选采用与实现 | 主线独立架构／表达复核、精确采用后，runtime 实施共享 codec、所有消费者显式迁移和双语说明；本候选不可直接充当已通过证据 |
| G29-P：完整业务成员与物理批来源 | RT4 S-70/S-73；应用／宿主／全部写方＋日志 owner 交全路径采用与 C-V3/V4/V7 实证。此前生产完整认回受阻；任意历史仅靠三读写操作的物理同批认证不可实现，必要时正式规格演进 |
| G29-H：历史与停止 | 同根旧编码来源、原 ResponseId/MessageId、账和 payload 原值可核，所有旧 writer 实际停止；未确认历史不能忽略、改号或重写。原宿主与重新承载者拥有责任 |
| 原 G-28/G-30/G-31 | 生产 Run 认法、合法完整读权、多值 headers 分别由原 loop／访问授权与应用／runtime-response owner 关闭；pure 正向样本不能关闭它们，尤其 late 的历史验证仍依赖 Run 认法 |
| 原 MR4 G-3／全部服务和模型交付 | 本页只限定模型组合的两个不可变条目；一般壳、寿命、完整 Agent Loop、37 模型事实和正式 offer、十三服务操作、观测及 D019 门均继续原 owner，不扩大本项交付 |

本页固定了可供独立复核的技术表示和消费边界；G29-P 的组合前提尚无本轮实证。不得据本页宣称完整 runtime、日志业务认回或 model request runtime 纵线已经交付。
