# 消息流的不变式

[提案索引](README.md) · [需求](requirements.md)

按[需求推导性质](../../architecture-guide/assurance/invariants.md#从目标与需求推导性质)：安全
性质说"永远不会"，进展性质说"最终会"。编号：MS = 消息流安全性质，MP = 进展性质。已进入
规格的 SE-*、DR-*、LC-*、MC-*、TL-*、CT-* 与工具提案的 T-*、F-* 只引用不复述。证据列中
"游标模型"指本提案波 3 的 TLA+ 模型；未执行的证据分别保留，不表述为已证明。

来源缩写：SE = [session v1](../../../spec/capabilities/session/v1/contract.md)，
DR = [durable-records v1](../../../spec/capabilities/durable-records/v1/contract.md)，
LC = [生命周期组合 v1](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)，
MC = [model-execution v1](../../../spec/capabilities/model-execution/v1/contract.md)，
TL = [tools v1](../../../spec/capabilities/tools/v1/contract.md)，
CT = [media-content v1](../../../spec/capabilities/media-content/v1/contract.md)，
CD = [core-work CD v1](../../../spec/data/core-work/v1/contract.md)，
OB = [engineering-observation v1](../../../spec/capabilities/engineering-observation/v1/contract.md)，
HD = [human-decisions v1](../../../spec/capabilities/human-decisions/v1/contract.md)，
T / F = [工具提案不变式](../tool-execution/invariants.md)，
PF = [需求正文](../../requirements/README.md)，U = [沿用的裁决](README.md#沿用的裁决)，
研究 = [客户端消息流研究](../../research/client-message-stream/README.md)。

## 安全性质

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| MS-1 | 出站流不产生事实：任何帧都能追溯到一条已提交事实（`(stream, seq)`）或一条带 attempt / call 身份的瞬态观察；客户端的任何"我看到了"都不改变事实 | LC-06、DR-02、PF-013.C10 | 帧信封必带 `position` 或 `ephemeral` 标记；出站流服务不持有 records 写权 | 信封 Schema 检查；游标模型（帧只由事实或瞬态动作产生） |
| MS-2 | 每帧带去重键；同一事实至多投递一次到同一订阅；瞬态帧按 owner 序号在其 attempt / call 内严格单调 | U-34、SE-12、TL-12、MC-06 | 投递侧按 `dedupKey` 与订阅已投递集合判重；瞬态帧序号由 owner 分配 | 游标模型（`DeliverOnce`、`BufferOrdered`）；投递单测 |
| MS-3 | 重连补齐完整：给定客户端游标，补齐集合 ∪ 已投递集合 = 该作用域内截至当前水位的全部已提交事实，无重复；补齐来自投影与读面，不来自流的历史缓冲 | PF-013.C10、PF-022.C4、SE-03、SE-16 | 游标是水位集合；补齐按水位差从投影拉；服务端按订阅水位 `sent` 补铃 | 游标模型（`CursorComplete`、`SentComplete`；否定变体 `SpecNoFill`、`SpecBuffered` 各给出反例） |
| MS-4 | 瞬态缺口可见：被裁剪、未确认、崩溃丢失或因慢客户端丢弃的瞬态帧以缺口词表（沿 [frames.md](../tool-execution/frames.md#缺口词表)）明示，不冒充完整；耐久事实不产生缺口，只有"落后" | TL-12、PF-022.C6、SYS-OBSERVABILITY.C5 | 瞬态旁路的丢弃点写 gap 标记；`ended{abandoned \| failed}` 明确终止 | 游标模型（`DraftCurrent`、`GapMarked`）；场景 MS-05 |
| MS-5 | 投递前核对读权：订阅建立时与每帧投递前各核对一次租户 / Session / 对象权限；撤权后不再投递也不中断工作；游标不携带授权，跨租户游标视为无效 | SYS-TENANT、TL-12、OB-03、HD-09 | 出站流服务在两处调用授权读面；游标解释在服务端 | 场景 MS-08；授权单测 |
| MS-6 | 背压不阻塞事实与工作：慢客户端只丢瞬态帧并留缺口，不延迟任何提交、不阻塞驱动器或执行 owner；耐久帧的背压归 records 与 owner 之间（F-2 之外的 [frames.md 记录等级](../tool-execution/frames.md#记录等级)） | SYS-LONG-RUNNING、TL-12 | 瞬态旁路有界缓冲；事实提示只带位置，客户端自拉 | 场景 MS-06；负载单测 |
| MS-7 | `ended` 帧指向的提交位置存在且不超过该流当前水位；同一 attempt 的 `started`、`chunk`、`ended` 共享 attempt 身份，`chunk` 序号稠密零起；`ended` 之后没有该 attempt 的 `chunk` | MC-06、研究（DSH `end{committed}`） | attempt 流提供者在耐久回执之后才发 `ended{committed}` | 游标模型（`EndedAfterCommit`）；fork 的 `AssistantStreamAttempt` 单测 |
| MS-8 | 消息模型单一权威：历史投影、模型请求装配（MC-07）、客户端呈现消费同一 `Message` / `ContentBlock` 定义，差异只在投影；`deferred_receipt`、`system_reminder`、`tool_result` 只由各自权威产生，不能经用户输入或客户端导入 | CD-03、MC-07、PF-009.C4、U-46 | CD 下一版一份定义；投影函数是纯函数 | 投影单测（同一记录 → 三种投影） |
| MS-9 | 耐久帧与 Session 日志同域 append-only：`frames(S)` 的序号与消息提交顺序可对齐，回放与实时投递看到同一序列；transient 帧只由显式声明产生，回放不冒充完整 | U-42、F-4、TL-12 | 帧写入经 records 同一协调域；出站流从 `frames(S)` 回放 | 工具提案证据；场景 MS-02 |
| MS-10 | 呈现标识稳定：帧的 `render.kind` 与版本在声明里固定，客户端按它选组件，语义不依赖它；公开面不携带内部坐标（存储偏移、进程句柄、内部 id） | U-42、研究（omne-next 契约测试同型） | 信封 Schema 拒绝内部字段；`render` 词表登记 | Schema 检查；omne-next 核对清单 |
| MS-11 | 一个调用的最终结果在客户端视图里恰出现一次：要么作为该 `tool_call` 的 `tool_result`，要么作为占位之后的 `system_reminder{late_result \| human_answer}`；占位 `deferred_receipt` 在结果到达后不消失、只被标为已结算 | T-14、U-46、PF-005.C8、PF-008.C4 | 客户端视图由耐久事实投影；投影按 `(call, attempt)` 关联 | 投影单测；场景 MS-03、MS-04 |
| MS-12 | 媒体只发引用：出站流不内联媒体字节；引用经 CT 读面取回并每次核对读权；未耐久的媒体块以带状态的占位呈现 | CT-02/04、PF-009.C3、PF-022.C4 | 信封 `payloadRef: MediaRef`；内联阈值留实现且只允许小于阈值的派生预览 | Schema 检查 |

## 进展性质

| 编号 | 陈述 | 来源 | 假设 | 证据 |
|---|---|---|---|---|
| MP-1 | 每条已提交事实最终要么投递到每个活跃订阅，要么进入该订阅下一次补齐的集合 | PF-013.C10、LC-06 | 提示广播可丢，但订阅有周期性水位对账或客户端会重连 | 游标模型（`EventuallyDelivered`，弱公平） |
| MP-2 | 每个已开始的瞬态尝试最终以 `ended{committed}`、`ended{abandoned}` 或 `ended{failed}` 之一收尾，客户端不会永远持有草稿 | MC-06、研究（DSH settle / abandon） | attempt 流提供者在进程存活时总会发终止帧；进程崩溃时客户端由重连基线判定 | 游标模型（`AttemptsSettle`）；场景 MS-05 |
| MP-3 | 断线重连后，客户端在有限次拉取内追平当前水位并回到与事实一致的视图 | PF-013.C10、PF-022.C4 | 投影可用且保留期覆盖游标；否则返回"需全量重取"（决定 H） | 游标模型（`BuffersDrain` 与 `EventuallyDelivered` 合起来：订阅打开后缓冲总会排空、每条事实总会到） |

## 证据义务

- 游标模型（波 3，[evidence/README.md](evidence/README.md)）：一个协调域的提交序号、作用域内外
  两种事实、一个瞬态 attempt、两个订阅、丢铃、断线、重连与进程崩溃；检查 MS-1、MS-2、
  MS-3、MS-4、MS-5（作用域）、MS-7 与 MP-1～MP-3；否定变体"铃不按水位补"（`SpecNoFill`）
  与"补齐来自流的有界缓冲而非投影"（`SpecBuffered`）各应找到 MS-3 的反例，不登记为形式
  任务。
- Schema 检查（实现前）：信封、游标编码、`render` 词表、内容块补齐的 JSON Schema
  （U-35）；MS-10 的"不带内部坐标"作为 Schema 的 `additionalProperties: false` 与字段名单。
- 投影单测（实现阶段）：同一 `Message` 记录投影为历史、模型请求（按模型族）、客户端
  呈现三种结果；`system_reminder` 按 Anthropic / OpenAI 族投影为 user / developer message。
- 场景 MS-01～（波 3）：正常流式、工具帧与结果交错、后台调用结算、人类请求卡片、断线
  重连（chunk 中、结算后未投递、Run 边界三种断点）、多客户端、撤权、归档后订阅。
