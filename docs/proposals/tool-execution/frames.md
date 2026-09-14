# 内部帧：事实侧与读面

[提案索引](README.md) · [生命周期](lifecycle.md) · [Schema](schema.md) · [不变式](invariants.md)

本文件只定 [TL-12](../../../spec/capabilities/tools/v1/contract.md) 的**事实侧**：帧的身份、
序号、缺口、记录等级、媒体与读面。传输、客户端游标编码与帧词表全集归出站流
（[U-36](../session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)、
[出站流边界](../outbound-stream/README.md)）。依赖是单向的：出站流消费这里的读面，这里不
依赖出站流；唯一耦合是帧 kind 落在同一命名空间，本文件只给前缀。消费
[frames 草案](../tool-system/v1/frames.md)已过评审 R2 的生产身份与重复冲突两节，其余按
D-014 之后的基线收敛。

## 职责

| 责任 | 拥有者 | 不拥有 |
|---|---|---|
| 生产通道、序号分配、缺口判定、生产者身份、关闭边界 | 执行 owner（local-execution、shell、HD 对 `human` 不产帧） | 披露资格、模型投影 |
| 读面、订阅、按当前读权裁剪、游标 | tools 包（`omneTools.subscribeFrames / readFrames`） | 序号与存储 |
| 进入模型的投影（哪些帧摘要/媒体引用喂给下一 Step） | 驱动器的投影选择（[RD-17](../../../spec/capabilities/run-driver/v2/contract.md) 工具后站点） | 执行事实 |
| 可回放帧的存储与保留期 | records 或执行 owner 的有界存储（实现选择） | 语义 |
| 媒体字节 | CT 提供者（[CT-02/04](../../../spec/capabilities/media-content/v1/contract.md)） | 帧顺序 |

帧不是模型未提供的推理，不是耐久事实事件；调用状态、控制、结算永远在 journal
（[lifecycle.md](lifecycle.md#转移表)），帧只是过程观察或工具显式产生的中间材料。

## 帧身份与顺序

```text
Frame = {
  call: CallRef, attempt: AttemptId,
  producer: ProducerId,            // attempt 内稳定；执行 owner 为每个逻辑生产者分配
  seq: Counter,                    // attempt 内单调；owner 分配，与 producer 无关
  sourceKey: string | null,        // 生产者自报的来源键（重试去重用）
  kind: "tools.frame.<kind>",      // <kind> 来自命令的 frames 声明
  at: Timestamp,
  payload: JsonValue | null, payloadRef: MediaRef | null,
  recordLevel: critical | replayable | transient
}
```

| 规则 | 内容 | 依据 |
|---|---|---|
| 单调 | `seq` 在同一 attempt 的流内严格递增；新 attempt 新流，不与旧尝试合并 | TL-12 |
| 去重 | 同 `(producer, sourceKey)` 同内容的重试认回原 `seq`；同键异内容报冲突并封锁该生产通道，不覆盖旧帧 | frames 草案 R2 |
| 交错 | 多生产者按 owner 接纳顺序排 `seq`；生产时间与到达时间都不冒充因果顺序 | frames 草案 |
| 接管 | 旧通道资格先撤销再交给当前执行 owner；补交沿原键关联原来源并另记补交者；已封闭的流只允许查询，迟到内容进迟到诊断 | frames 草案；TL-09 |
| 关闭 | owner 报 terminal 前完成必需记录的提交并关闭生产通道；强停立即撤销旧生产资格 | TL-12、TL-09 |

## 记录等级

| 等级 | 含义 | 落点 | 写入/容量失败时 |
|---|---|---|---|
| critical | 工具显式产生、必须耐久才能报 terminal 的中间材料（多步命令里的效果凭证、必要审计）；调用状态、控制与结算本身不是帧，永远是 journal 事件（[转移表](lifecycle.md#转移表)） | journal 或 records 的耐久存储，有可检查的回执 | 不接纳依赖该保证的新动作；已有工作按能力受控停止或标"无法完整记录"，不报全部成功 |
| replayable | 声明保留窗口内可从确认位置读取的过程（进度、分段输出） | 执行 owner 或 records 的有界存储；每帧有确认回执 | 有界缓冲与背压；未确认不标已保存；过期返回缺口 |
| transient | 只显式声明且策略允许时采用；低延迟显示，无回放承诺 | 内存环 | 按声明的合并/丢弃政策处理并显示缺口 |

等级由命令声明与部署记录策略共同决定（[schema.md](schema.md#帧声明)）；提供者不能把
critical 降级。`emit` 或等待监听器完成都不是记录确认；必需记录者有可检查的回执。

## 缺口词表

| 缺口 | 含义 |
|---|---|
| `trimmed` | 超出条数/字节上限被裁剪 |
| `expired` | 超出保留期 |
| `merged` | 按声明合并（transient） |
| `unconfirmed` | 展示过但写入未确认（进程丢失前的易失内容） |
| `crash_gap` | owner 重启无法保留的旧帧 |
| `decode_unavailable` | 格式版本无可用解释器 |
| `read_failure` | 存储读取故障 |
| `result_unknown` | 调用结果 unknown，帧流可能不完整 |

带缺口的摘要不能伪装完整原件；`unsupported` / `empty` 是无帧工具的如实返回。

## 媒体帧

媒体先经 CT `retainReference` 取得耐久引用，再确认该帧满足记录要求；未完成时呈现
带状态的占位帧。引用提交失败的孤立内容由 CT 按保留/清理协议处理。"保留一行 JSON
不等于图片已保存"。

## 读面

| 方法 | 输入 | 返回 | 规则 |
|---|---|---|---|
| `readFrames(call, {attempt, from, to})` | 精确调用、attempt、`seq` 区间 | 帧序列 + 缺口标记 + 当前水位 + 记录等级 | 每次按当前 SR 正文读权与内容策略裁剪；跨租户或无权返回 inaccessible 不泄漏存在 |
| `subscribeFrames(call, cursor)` | `cursor = {attempt, seq}` | 推送新帧位置与内容；每订阅独立游标 | 投递前再次核对读权；撤权结束订阅效用而不停止工作；实时帧可非耐久但返回保留水位 |
| `inspectFrames(call)` | 精确调用 | 每 attempt 的执行状态、可读范围、记录等级、流关闭边界 | 只查询 |

游标绑定调用/attempt 与读取位置，不携带永久授权，不是共享消费指针。历史读取依赖持久
记录与兼容解释，不依赖原工具插件或实例仍在内存。

## 与出站流

| 本文件定的 | 出站流阶段定的 |
|---|---|
| 帧身份、`seq` 单调、缺口词表、三等级、媒体引用、读面 | 传输、心跳、背压、批处理 |
| kind 前缀 `tools.frame.` | 帧词表全集与封闭性 |
| 每订阅独立游标 `{attempt, seq}` | 与 Session 水位、arrival 序号合并成客户端游标 |
| `unconfirmed` / `crash_gap` 语义 | 断线重连时用哪些已提交事实补齐 |

## 崩溃与恢复

owner 重启后：critical 内容在 journal，无损；replayable 按确认位置可读，未确认部分标
`unconfirmed`；transient 全部标 `crash_gap`。重新关联同一 attempt 的订阅从新水位继续，不
重放已裁剪片段。与 [恢复窗口](lifecycle.md#恢复窗口)一致：帧缺口不改变调用状态判定。
