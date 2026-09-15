# 作用域与投递

[提案索引](README.md) · [信封与游标](envelope-and-cursor.md) · [不变式](invariants.md)

出站流把帧送到"获准客户端"；获准由两处核对给出，撤权只结束订阅效用，不中断任何工作
（[出站流边界稿 §1](../outbound-stream/README.md#1-四层职责)、MS-5）。研究里五家都没有租户与
多用户读权（[研究结论 6](../../research/client-message-stream/README.md#0-结论先行)），本文件没有
现成参照，按本项目已接受的权限模型写。

## 1. 两处核对

| 时点 | 核对什么 | 用什么 | 失败时 |
|---|---|---|---|
| 订阅建立 | 当前认证主体（[SYS-IDENTITY](../../requirements/system/constraints.md#sys-identity)）、租户成员资格（[TG-01](../../../spec/capabilities/tenant-governance/v1/contract.md)）、对该 Session 的 `read_metadata` 与 `read_content`（[Session 设计 §11](../../../packages/session/session/design.md#11-当前调用者对象权限与运行委托)） | `omneSession` 读面：无权与不存在统一 `inaccessible`，不泄漏存在 | 拒绝订阅；不建立任何缓冲 |
| 每帧投递前 | 该帧 `subject` 指向对象的读权：调用帧 / 工具结果需 SR 正文与工具结果读资格（[tools 设计](../../../packages/tools/tools/design.md#身份状态与事件投影)：`subscribeFrames` 经 SR 当前正文读权）；请求卡片需当前身份对该请求的可见范围（[HD-09](../../../spec/capabilities/human-decisions/v1/contract.md)）；媒体引用不在流内核对，取回时由 CT 核对（[CT-04](../../../spec/capabilities/media-content/v1/contract.md)） | 出站流服务不读 raw records，只经各能力读面；读面在披露时再查权限（[Session 设计 §2.5](../../../packages/session/session/design.md#25-读面)） | 该帧不投递；连续失败或 Session 级读权丢失 → `stream.closed{unauthorized}` |

Cordis scope 只做 `records.envelope.committed` 的可见性路由，不做授权
（[LC-06](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）；出站流服务收到
铃后仍经读面取内容。

同租户管理员没有默认读权；`session.emergency_control` 是独立的、可撤销的控制权限，不
扩大为读权（Session 设计 §11、[PF-013.C10](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求)）。

## 2. 撤权

撤权（TG 停用成员、Session owner 收回授予、Session 删除）在下一帧投递前生效：服务端发
`stream.closed{reason}` 并释放订阅；不发任何补偿帧，不通知工作侧。工作照常进行；用户重新
获权后以游标重订阅，补齐照常（事实没有因撤权而丢失）。已投递到客户端的内容不能收回，
这是所有推送系统的共性，不由本提案承诺。

## 3. 多客户端

同一 Session 可有多个订阅（同一用户多设备、多个获准用户）；每个订阅独立游标、独立
瞬态缓冲、独立读权核对。不存在共享消费指针（[TL-12](../../../spec/capabilities/tools/v1/contract.md)
"每个订阅者独立游标，不竞争单消费 cursor"）。客户端的任何确认都不改变事实（MS-1）。

## 4. 背压（MS-6）

| 帧类 | 缓冲 | 溢出时 |
|---|---|---|
| 事实提示 | 每订阅有界队列，服务端为每个订阅记一个已推送水位 `sent` | 只停住该订阅的水位：队列有空位时（下一次铃或周期对账）从 `sent` 继续按序号推送；不丢事实、不关订阅、不阻塞提交。长期不消费的订阅按传输参数断开，客户端以游标重订阅（游标模型 `Push` / `Reconcile`） |
| 耐久帧（`tools.frame.*` durable / critical） | 与事实提示同一队列（它们也是事实） | 同上；帧本身在 `frames(S)` 可回放 |
| 瞬态帧 | 每订阅每 owner 有界环，与事实队列分开（瞬态再多也挤不掉事实；游标模型首稿合用一个队列时进展检查给出"事实永远到不了"的反例） | 丢最旧，插入 `stream.gap{owner, epoch, reason: trimmed}`；不通知 owner，不延迟 owner |

出站流服务从不向执行 owner、驱动器或 records 施加背压；耐久帧从 owner 到 records 的
背压归 [frames.md 记录等级](../tool-execution/frames.md#记录等级)，与本文件无关。

## 5. 不进客户端流的东西

| 内容 | 去向 | 依据 |
|---|---|---|
| hooks 观察事件 `hooks.run.started / completed`、`hooks.config.rejected` | 工程观测读面（[OB-01/03](../../../spec/capabilities/engineering-observation/v1/contract.md)） | 决定 F；hooks 对用户可见的后果已是队列 / 调用事实（`queue.item.closed{closed_by_guard}`、`tools.call.settled{denied}`），[hooks 提案](../hooks-compat/mapping.md) |
| 诊断 log、trace、度量 | 同上 | [SYS-OBSERVABILITY.C6](../../requirements/system/observability-and-logging.md) 的读面另有治理 |
| 审计流 `session.operation.denied` | 审计读面按读权披露 | Session 设计 §2.4 |
| 媒体字节 | CT 读面 | MS-12 |
| 秘密引用、工具原始参数中的敏感字段 | 不进流；事实提示的 `data` 经读面裁剪 | OB-03 |

## 6. 归档与删除

Session `archived`：订阅可继续（只读），事实提示只剩后台调用的结算与关闭
（[SE-14](../../../spec/capabilities/session/v1/contract.md) D2 列）；`deleted`：`stream.closed{session_deleted}`，
之后订阅请求返回 `inaccessible`。归档后的读取资格与后台调用存续归工具提案的
[级联表](../tool-execution/lifecycle.md#控制与级联表)。

## 7. 权威落点

| 内容 | 落点 |
|---|---|
| 两处核对、撤权、多客户端、背压、不进流清单 | 新能力 `message-stream` v1 |
| 订阅建立时的权限键 | session 下一版（Session 读权词表已在提供者设计，需进契约） |
