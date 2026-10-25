# Session 契约的协议级流程

状态：候选。本页把[运行契约候选](../../SPEC.md#运行契约候选)的条款展开成协议级流程。每条流程写参与者、时序、数据去向与失败分支，并链到它依据的条款。流程不新增条款。条款没有写的内容标为「契约未定」，并汇总在 [README 的缺项表](README.md#缺项与持续验证入口)。

参与者是逻辑角色，不表示部署、进程或共同寿命。「提交」指一次权威提交。提交结果未知时各方按 [PA-05](../../SPEC.md#pa-05) 与 [PA-07](../../SPEC.md#pa-07) 认回。Session 与 Agent 之间的「参加」「冲突」「失败」「不支持」沿 Agent 契约的[提交参加者协议](../../../../agent/agent-contract/SPEC.md#提交参加者协议)。事件含义归[事件目录](../object-model/session-log-events.md#原生事实类别)，守卫与完整结果归[状态转移页](../object-model/session-state-transitions.md#命令守卫与完整结果)，操作形状归 [public-api](../public-api.md)。本页只引用它们。

## 编号表

F-SC 是本页的文档定位号。每条流程细化组根的一条或几条[跨成员流程](../../../docs/key-flows.md)，组根写各成员怎样分工，本页写契约层的操作与事实。

| 编号 | 流程 | 细化的组根流程 | 主要条款 |
| --- | --- | --- | --- |
| [F-SC01](#f-sc01-打开执行与交入输入) | 打开执行与交入输入 | [F-SE01](../../../docs/key-flows.md#f-se01-一条输入从受理到推进) | OP-00、JC-03、JC-05、PA-01、PA-03、PA-06、PA-09、PM-02 |
| [F-SC02](#f-sc02-消息进历史的共同提交) | 消息进历史的共同提交 | [F-SE02](../../../docs/key-flows.md#f-se02-agent-事件到日志条目) | JC-06、PA-04、PA-05、PM-11 |
| [F-SC03](#f-sc03-压缩转换的共同提交与-epoch-新代) | 压缩转换的共同提交与 epoch 新代 | [F-SE06](../../../docs/key-flows.md#f-se06-压缩共同提交与模型视图新代) | JC-09、PA-04、PA-05 |
| [F-SC04](#f-sc04-结果保管的共同提交) | 结果保管的共同提交 | [F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志) | JC-11、PA-05、EC-04 |
| [F-SC05](#f-sc05-处理完成的共同提交) | 处理完成的共同提交 | [F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志) | JC-12、PA-05、RS-04、EC-04 |
| [F-SC06](#f-sc06-交付责任解除与重发) | 交付责任解除与重发 | [F-SE05](../../../docs/key-flows.md#f-se05-恢复)、[F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志) | EC-04、EC-05、EC-06、DeliveryReleasePort（已被替代）、P-6 |
| [F-SC07](#f-sc07-从-agent-事件派生事实) | 从 Agent 事件派生事实 | [F-SE02](../../../docs/key-flows.md#f-se02-agent-事件到日志条目) | EC-01、EC-02、EC-03、JC-24 |
| [F-SC08](#f-sc08-条件终结与-run-终态) | 条件终结与 Run 终态 | [F-SE03](../../../docs/key-flows.md#f-se03-控制传播)、[F-SE05](../../../docs/key-flows.md#f-se05-恢复) | PA-02、PA-08、PM-13、PM-14、RS-08 至 RS-10、P-5 |
| [F-SC09](#f-sc09-推进映射与换代) | 推进映射与换代 | [F-SE05](../../../docs/key-flows.md#f-se05-恢复)、[F-SE10](../../../docs/key-flows.md#f-se10-新-run-开始的求值与重装判定) | PM-03 至 PM-12、JC-07、JC-08、JC-15 |
| [F-SC10](#f-sc10-迟到结果与终态后的后台结果) | 迟到结果与终态后的后台结果 | [F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志) | EC-07、EC-08、EC-09、P-3 |
| [F-SC11](#f-sc11-时间线投影与在途收敛) | 时间线投影与在途收敛 | [F-SE08](../../../docs/key-flows.md#f-se08-时间线投影与在途收敛) | SessionHistory、SL10、SL11、EC-10、EC-11 |
| [F-SC12](#f-sc12-流到日志) | 流到日志 | [F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志) | EC-01、事件来源表、JC-06、JC-11、JC-12 |
| [F-SC13](#f-sc13-epoch-视图读取) | epoch 视图读取 | [F-SE07](../../../docs/key-flows.md#f-se07-模型可见历史的读取) | SessionHistory 的 `readModelView`、JC-09 |
| [F-SC14](#f-sc14-会话冻结) | 会话冻结 | 无组根流程 | JC-28、I-F1 至 I-F5、ST27 |
| [F-SC15](#f-sc15-引用查询) | 引用查询 | 无组根流程 | SessionReconciliation 的 `references`、P-8 |
| [F-SC16](#f-sc16-作用域释放与换代后重新释放) | 作用域释放与换代后重新释放 | [F-SE04](../../../docs/key-flows.md#f-se04-归档级联与作用域释放) | JC-16、ScopeReleasePort、`releasedScopes` |

## F-SC01 打开执行与交入输入

细化 [F-SE01](../../../docs/key-flows.md#f-se01-一条输入从受理到推进)。依据：[OP-00](../../SPEC.md#op-00)、JC-03 与 JC-05（[共同提交表](../../SPEC.md#共同提交与共享事务域)）、[PA-01](../../SPEC.md#pa-01)、[PA-03](../../SPEC.md#pa-03)、[PA-06](../../SPEC.md#pa-06)、[PA-09](../../SPEC.md#pa-09)、[PM-02](../../SPEC.md#pm-02)、[RS-01](../../SPEC.md#rs-01)、[RS-02](../../SPEC.md#rs-02)。

`startRun` 不扣除任何输入。`invoke` 只带首条输入，其余待处理输入按到达顺序经 `submit` 交入同一执行。批界由 Agent 的输入水位线决定，待处理资格在 Session 读到承接事件（F-SC07）时解除。

```mermaid
sequenceDiagram
    participant I as 受理入口
    participant S as Session 协调
    participant D as 存储事务域
    participant J as 执行记录提供者
    participant A as Agent runtime
    I->>S: accept(ordinary，受理标识，InputId)
    S->>D: JC-03 提交 SE10、SE11
    D-->>S: CommitReceipt
    S-->>I: 回执，认回时 recovered 为真
    Note over S: 提交通知唤醒推进触发，丢通知由扫描补查
    S->>S: judgeRunStart 得到 eligible 与首条输入
    S->>D: startRun，JC-05 写 SE13、SE15，采用变化时写 SE08
    D-->>S: StartedRun，含 AdvanceRef 与执行身份
    S->>J: invoke(首条输入，来源依据 SE13 回执，推进资格依据 SE15 证据)
    J->>S: 受理的同一提交内交来来源依据
    S->>S: PA-01 第 1 条只读核对
    alt 核对成立
        S-->>J: 参加，不写条目
        J->>A: 打开执行，授予挂接
        J-->>S: 受理回执，修订与证据
        S->>D: receive(input-handover accepted) 写 SE35
        loop 其余待处理输入按到达顺序
            S->>J: submit(InputId，来源依据 SE11 回执)
            J->>S: 交来来源依据，PA-01 第 2 条只读核对
            S-->>J: 参加
            J-->>S: 受理回执
            S->>D: receive(input-handover accepted) 写 SE35
        end
        A-->>S: 事件 input-taken，经 F-SC07 写 SE14，解除待处理资格
    else 首条输入被消息准入拒收
        J-->>S: invalid，带拒收原因
        S->>D: finishRun(admission-rejected) 写 SE26 failed、SE16，同批写首条输入的 SE35 rejected
        Note over S,D: 其余待处理输入保留资格，交给下一个 Run
    else 后续输入被消息准入拒收
        J-->>S: invalid，带拒收原因
        S->>D: receive(input-handover rejected) 写 SE35，该输入失去资格
        Note over S,A: Run 继续，其他输入照常交入
    end
```

数据去向：

| 事实 | 条目 | 提交 |
| --- | --- | --- |
| 输入内容、来源与待处理资格 | SE10、SE11 | `accept`，Session 提交（JC-03） |
| Run 开始、首条输入、执行身份、首个 attempt | SE13、SE15，采用变化时 SE08，新纳入常驻工具时 SE36 | `startRun`，Session 提交（JC-05） |
| 交入受理或拒收 | SE35 | `receive(input-handover)`，身份为执行与 `InputId` |
| 承接 | SE14 | F-SC07 |
| 首条输入拒收导致的终态 | SE26 failed、SE16、SE35 | `finishRun`，Session 提交（JC-18） |

失败分支：

| 情形 | 行为 | 条款 |
| --- | --- | --- |
| `accept` 结果未知 | 不报告未受理，不新建提交。按受理标识 `queryOperation` | OP-00、[耐久及受理确认](../../SPEC.md#耐久及受理确认) |
| 两个推进触发者并发 `startRun` | 同一首条输入派生同一身份，一方提交，另一方认回。首条输入不同的第二个得到 `run-active` | OP-00、RS-01 |
| `invoke` 返回 `denied` | 推进资格依据核对失败，本 attempt 已被取代。执行不创建，Run 保持 active，由当前 attempt 持有者继续 | PM-02、PA-06 |
| `invoke` 返回 `busy` | 等该 runtime 的终态事件后重试 | PA-06 |
| `submit` 返回 `terminal` | 执行已结束。不重试，不改写去处。读到结束事件后 `routeInput` 在新 Run 开始时重定去处 | PA-03 |
| `invoke` 或 `submit` 结果未知 | 按出站操作身份 `query`，不换身份重发 | PA-06、[AgentDrivePort](../../SPEC.md#agentdriveport) |
| `startRun` 提交后、`invoke` 发出前崩溃 | 恢复扫描读到 `run.active`、`advance` 非空、首条输入没有 SE35，以同一出站身份重放 `invoke` | PA-06 第 2 项、PM-14 |
| `accept` 提交后有待交输入、`submit` 未发出 | 对每个待交输入按到达顺序以同一 `InputId` 重新 `submit` | PA-06 第 3 项 |
| 会话已归档 | `accept` 返回 `archived` | PA-03 |
| 会话已冻结且没有未终结 Run | `accept` 返回 `frozen`，`startRun` 返回 `frozen` | F-SC14 |

## F-SC02 消息进历史的共同提交

细化 [F-SE02](../../../docs/key-flows.md#f-se02-agent-事件到日志条目)。依据：JC-06、[PA-04](../../SPEC.md#pa-04)、[PA-05](../../SPEC.md#pa-05)、[PM-11](../../SPEC.md#pm-11)、`recordMessage` 的操作表行（[SessionWork](../../SPEC.md#sessionwork)）。

提交由执行记录提供者发起。Session 作为参加者执行同一条流水线：按 OP-00 认回、权威读、`judgeAdvance`、写事实。回执经调用方交接回到 Agent。

```mermaid
sequenceDiagram
    participant A as Agent runtime
    participant J as 执行记录提供者
    participant S as Session 参加者
    participant D as 存储事务域
    A->>J: message 交接，经消息准入的消息
    J->>S: Participation(execution，operation，joint 为 message，written，handover)与 AdmittedMessage
    S->>S: OP-00 派生身份并 resolveOperation
    S->>S: 权威读，judgeAdvance(participation)
    alt judgeAdvance 为 ok
        S->>D: 同一事务写 SE10，更新 ExecutionRef.revision 与 evidence
        S-->>J: 参加
        J->>D: 提交
        D-->>J: 回执
        J-->>A: 回执
    else 执行挂接已被取代
        S-->>J: 冲突，依据为当前 advance
        J-->>A: changed，或 stale-advance
    else 执行不是本 Run 的执行，或消息分类不符
        S-->>J: 冲突，invalid
    else 材料缺项或参加种类未声明
        S-->>J: 不支持，不保存任何一半
    else Session 读权威状态失败
        S-->>J: 失败，两侧都不保存
    end
    opt 提交结果未知
        J->>D: 以自己的操作身份查询
        S->>D: 以 OP-00 身份 queryOperation
        Note over J,D: 两者读同一回执。committed 时双方事实同时成立，not-committed 时同身份重试，unknown 时保持未知
    end
```

数据去向：SE10 由 `recordMessage` 在参加时写入。Agent 事件流里的 `message` 事件不再写条目，只推进游标（F-SC07）。工具消息与后台占位消息的 `AdmittedMessage.consumption` 指向原消费位置，其他消息为 null。

失败分支：

| 情形 | 行为 | 条款 |
| --- | --- | --- |
| 归档后的消息 | `archived`，不再追加 | 操作表 |
| 回执丢失 | 由提交方认回。Session 不把参加提交列入 `unresolved` | PA-05 |
| 事件流与参加提交到达先后不固定 | Session 不以 `ExecutionRef.revision` 拒绝提交 | PA-04 |
| `claim` 之后、`resume` 之前的旧 runtime 提交 | 响应「冲突」，直到新挂接取代旧挂接，旧 runtime 得到 `stale-advance` | [PM-05](../../SPEC.md#pm-05)、PM-11 |

## F-SC03 压缩转换的共同提交与 epoch 新代

细化 [F-SE06](../../../docs/key-flows.md#f-se06-压缩共同提交与模型视图新代)。依据：JC-09、[PA-04](../../SPEC.md#pa-04)、[PA-05](../../SPEC.md#pa-05)、`commitDerived` 的操作表行、[SessionHistory](../../SPEC.md#sessionhistory) 的 epoch 视图条款、[守卫条款](../../SPEC.md#守卫条款)并入 ST25 的分支。

```mermaid
sequenceDiagram
    participant C as Request Context 压缩转换
    participant J as 执行记录提供者
    participant S as Session 参加者
    participant D as 存储事务域
    C->>J: 转换计划，CompactionMessage 含 covers、retained、derivation
    J->>S: context-transition 参加材料与 judgment
    S->>S: judgeAdvance(participation)
    S->>S: message 包的 judgeCompaction，输入覆盖范围内条目、覆盖后消息与 openWork 下界
    alt 两项判定通过
        S->>D: 同一事务写 SE10 压缩记录与 SE33 标注，开新 epoch 并物化视图
        S-->>J: 参加
        J->>D: 提交
        D-->>J: 回执
        J-->>C: 回执，新代成立
    else judgeCompaction 拒绝
        S-->>J: 冲突，invalid 带原因
        Note over C,D: 提交不成立，日志不变，原 epoch 不变
    else 执行挂接已被取代
        S-->>J: 冲突
    end
    opt 提交结果未知
        Note over C,D: 按 PA-05 由提交方认回。请求组装不把未知当作已压缩继续组装，也不重复提交同一条记录
    end
```

数据去向：SE10 压缩记录与 SE33 在同一提交。对人的时间线不删除原消息，按压缩记录加标注（F-SC11）。模型可见的 epoch 视图在同一事务物化，之后的组装读新代（F-SC13）。

契约未定：压缩转换在协调者一侧的唯一提交点。Session 只承担历史持有者一侧，见[明确缺项](../../SPEC.md#具名前提与明确缺项)。

## F-SC04 结果保管的共同提交

细化 [F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志)的保管步。依据：JC-11、[PA-05](../../SPEC.md#pa-05)、[EC-04](../../SPEC.md#ec-04)、`preserveResult` 的操作表行、[值与结果项的约束](../../SPEC.md#值与结果项的约束)、[I-R7](../../SPEC.md#i-r7)。

保管不要求推进资格。执行记录存在时由执行记录提供者提交（`commit` 或 `recordResult` 的 `custody` 交接），Session 参加。记录已删除时的 Session 单方提交见 F-SC10。

```mermaid
sequenceDiagram
    participant P as 生产者 Model 或 Tool
    participant A as 当前合格消费者
    participant J as 执行记录提供者
    participant S as Session 参加者
    participant D as 存储事务域
    P-->>A: 真实收场的结果与原调用身份
    A->>J: custody 交接，ProducedResult 与保管证据
    J->>S: 参加材料，Participation 的 joint 为 custody
    S->>S: 守卫核对版本唯一、来源与保管者资格
    alt 该结果版本首次保管
        S->>D: 同一事务写 SE20，results 项的 custody 非空
        S-->>J: 参加
        J->>D: 提交
        D-->>J: 回执
        J-->>A: 回执，CommitReceipt.source 可作保管证据
        Note over A,D: 提交成功之后发出交付责任解除，见 F-SC06
    else 同版本同摘要
        S-->>J: 参加，认回已有 SE20，不覆盖
    else 同版本异摘要
        S-->>J: 冲突，conflict
    else 版本或来源不合法，或内容不可靠
        S-->>J: 冲突，invalid 或 unavailable
    end
```

数据去向：SE20 登记在原 `Consumption` 的对应结果版本下。保管不表示已处理。Tool 的迟到版本追加在原消费绑定下，不创建新 Run 或新调用。

失败分支：认回为 `committed` 之前不发交付责任解除（PA-07）。保管者资格不足返回 `denied`。回执丢失按 PA-05 由提交方认回。

## F-SC05 处理完成的共同提交

细化 [F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志)的处理步。依据：JC-12、[PA-05](../../SPEC.md#pa-05)、[RS-04](../../SPEC.md#rs-04)、[I-R6](../../SPEC.md#i-r6)、[EC-04](../../SPEC.md#ec-04)、`completeConsumption` 的操作表行、[等待与结果交接](../../SPEC.md#等待与结果交接)。

```mermaid
sequenceDiagram
    participant A as Agent 原消费位置
    participant J as 执行记录提供者
    participant S as Session 参加者
    participant D as 存储事务域
    A->>A: 在原位置完成处理，形成完成依据
    A->>J: processed 交接，Completion(consumption，result，completion)
    Note over A,J: 处理形成的消息经 message 交接另行提交，见 F-SC02
    J->>S: 参加材料，Participation 的 joint 为 processed
    S->>S: judgeAdvance(participation)，核对原位置与结果版本
    alt 核对成立
        S->>D: 同一事务写 SE21，原位置的等待从 waiting 移除
        S-->>J: 参加
        J->>D: 提交
        D-->>J: 回执
        J-->>A: 回执，CommitReceipt.source 可作完成证据
        Note over A,D: 提交成功之后发出交付责任解除，见 F-SC06
    else consumption 不属于本会话，或结果版本不符
        S-->>J: 冲突，invalid
    else 同版本异完成依据
        S-->>J: 冲突，conflict
    else 执行挂接已被取代
        S-->>J: 冲突，依据为当前 advance
    end
```

数据去向：SE21 只提交 `completion.result` 指定的结果版本。先完成处理的分支不要求 SE20，接续从完成依据继续，不要求额外保留可重领全文。

失败分支：非原位置的处理返回 `invalid`（I-R6）。晚到的 `processed` 交接不要求推进资格，照常提交（[PM-11](../../SPEC.md#pm-11)）。

## F-SC06 交付责任解除与重发

细化 [F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志)的确认步与 [F-SE05](../../../docs/key-flows.md#f-se05-恢复)的 `release` 项。依据：[EC-04](../../SPEC.md#ec-04)、[EC-05](../../SPEC.md#ec-05)、[EC-06](../../SPEC.md#ec-06)、[DeliveryReleasePort（已被替代）](../../SPEC.md#deliveryreleaseport)、[PM-14](../../SPEC.md#pm-14) 的 `release` 行、`PendingReason` 的 `release`（[SessionReconciliation](../../SPEC.md#sessionreconciliation)）、[P-6](../../SPEC.md#具名前提与明确缺项)。

交付责任解除是提交后的外部动作，数据库事务不包含它。发出者是当前合格消费者，不要求旧 attempt 有效，也不要求 Agent 在场。

```mermaid
sequenceDiagram
    participant S as Session 协调
    participant D as 存储事务域
    participant R as DeliveryReleasePort（已被替代）
    participant P as 生产者 Model 或 Tool
    Note over S,D: SE20 或 SE21 已提交并认回为 committed
    S->>R: release(操作身份从 consumption 与结果版本派生，consumption，ProducedResult，保管或完成证据)
    R->>P: Model 的 ACK，或 Tool 的交付释放
    alt 生产者确认
        P-->>R: 确认与当前清理状态
        R-->>S: confirmed，带确认来源
        S->>D: receive(release) 写 SE19，release 派生为 confirmed
    else not-ready
        R-->>S: 生产者尚不具备确认条件
        Note over S: release 保持 pending
    else unavailable 或 commit-unknown
        R-->>S: 未得到确认
        Note over S: release 保持 pending，不换身份
    end
    Note over S,P: 恢复协调经 pending(reason 为 release) 找回仍为 pending 的结果版本
    S->>R: 以同一操作身份重发 release
    R->>P: 重复的 ACK 或交付释放
    P-->>R: 原确认与当前清理状态，首次接受时为新确认
    R-->>S: confirmed
    S->>D: receive(release) 写 confirmed
```

数据去向：确认写入 SE19，`ResultConsumption.release` 由 pending 变为 confirmed。生产者一侧的条件见 [Model 的 ACK](../../../../model/model-contract/SPEC.md#ack-的前提与效果)与 [Tool 的两条交接路径](../../../../tool/tool-contract/SPEC.md#可靠交接与处理的两条路径)。

失败分支：

| 情形 | 行为 | 条款 |
| --- | --- | --- |
| 解除发出后回执丢失，或解除未发出就崩溃 | 恢复协调读到 `release` 为 pending 且保管或完成非空，以同一操作身份重发。没有重复调用、重复收费，也不重新领取全文 | EC-05 |
| 生产者已确认并清理，Session 的 `receive(release)` 未提交 | 重发后生产者返回原确认，写 confirmed。消费侧接续只用 SE20 的内容或引用，或 SE21 的完成依据 | EC-06、P-6 |
| 同一结果版本的解除也由 Agent 的在线路径发出 | 生产者认回同一确认，不按发起者区分 | EC-04、P-6 |
| SE20 引用的内容不可恢复 | 保管缺陷，报告 `unavailable`，`owner` 为保管者，不改写为已处理 | EC-06 |
| 没有生产者确认的 `receive(release)` | `invalid`，写入被拒 | I-R7、`receive` 的操作表行 |
| 重发超过策略上限 | `release` 保持 pending 并报告维护者 | PA-07 |

## F-SC07 从 Agent 事件派生事实

细化 [F-SE02](../../../docs/key-flows.md#f-se02-agent-事件到日志条目)。依据：[EC-01](../../SPEC.md#ec-01)、[EC-02](../../SPEC.md#ec-02)、[EC-03](../../SPEC.md#ec-03)、JC-24、`receive` 的操作表行、[I-R3](../../SPEC.md#i-r3)、[I-R10](../../SPEC.md#i-r10)。Agent 一侧的序号、缺口与确认沿 Agent 契约的[读取、游标与缺口](../../../../agent/agent-contract/SPEC.md#读取游标与缺口)与[确认](../../../../agent/agent-contract/SPEC.md#确认)。

承接（SE14）、调用登记（SE18）、等待与出卡（SE22）、控制阶段（SE25）与执行结束（SE26、SE16）由 Agent 拥有。Session 读到后按事件身份以 `receive` 写入派生事实，重放时认回。

```mermaid
sequenceDiagram
    participant E as 事件消费者
    participant J as Agent 事件出口
    participant S as Session 命令处理
    participant D as 存储事务域
    E->>S: readWork，取 ExecutionRef.readThrough
    E->>J: read(execution，after 为 readThrough)
    J-->>E: 一页事件，序号连续
    loop 每个事件按序号
        alt input-taken、producer、waiting、control 或 ended
            E->>S: receive(agent-event，execution，sequence，body)
            S->>S: OP-00 从执行与序号派生身份，resolveOperation 去重
            S->>S: 守卫核对执行等于 run.active.execution
            S->>D: 写对应条目，同一提交把 readThrough 设为本序号
            D-->>S: 回执，重放时 recovered 为真且不重复写入
        else message 或 stream
            E->>E: 只推进内存游标，不提交
        end
    end
    E->>J: acknowledge(through 为已持久的 readThrough)
    Note over E,J: 确认只表示消费者已处理，不证明终态，也不确认生产者结果
```

事件到条目的对应（EC-01）：

| Agent 事件 | 条目 | 说明 |
| --- | --- | --- |
| `input-taken` | SE14 | 解除批次成员的待处理资格。Session 不重选批界或顺序 |
| `message` | 无 | 消息已在 F-SC02 成立 |
| `producer` | SE19，必要时 SE18 | 该 consumption 尚无 SE18 时同批写 SE18 |
| `stream` | 无 | 在途内容由生产者保管，见 F-SC12 |
| `waiting` | SE18、SE22 | 新出现的生产者等待写 SE18，人工等待与依赖等待写 SE22，`waiting` 为本次集合 |
| `control` | SE25 | 控制阶段到达 |
| `ended` | SE26、SE16 | 按 Agent 的结论写终态，见 F-SC08 |

失败分支：

| 情形 | 行为 | 条款 |
| --- | --- | --- |
| 读取返回缺口 | 经恢复入口读完整快照，按 PM-14 对账：结束状态按 `ended`，`results` 与 `controls` 按 `producer` 与 `control` 处理，再从缺口之后继续，不跳过 | EC-01 |
| 权威日志有缺口 | 隔离该会话 | [SL14](../../SPEC.md#日志读取投影及恢复) |
| 游标丢失 | 从 `"0"` 重读，重放认回，不重复写入 | EC-02 |
| 同身份异事实 | `conflict` | `receive` 的操作表行 |
| 事件的执行不是本 Run 的执行 | `invalid` | `receive` 的操作表行 |
| 确认结果未知 | 以同一前缀重试，确认单调。确认不超过持久的游标 | EC-02 |
| 事件已发生但尚未读到 | `openWork.unreadEvents` 计入未结工作。Run 未终结时 `judgeIdle` 不得出 `due`，Session 不声称完成 | EC-03、I-R10 |

游标与去重的机制细则归通用实现的 [RD](../../../session/SPEC.md#rd-01)。

## F-SC08 条件终结与 Run 终态

细化 [F-SE03](../../../docs/key-flows.md#f-se03-控制传播)与 [F-SE05](../../../docs/key-flows.md#f-se05-恢复)的终态部分。依据：[PA-02](../../SPEC.md#pa-02)、[PA-08](../../SPEC.md#pa-08)、[PM-13](../../SPEC.md#pm-13)、[PM-14](../../SPEC.md#pm-14)、[RS-08](../../SPEC.md#rs-08) 至 [RS-10](../../SPEC.md#rs-10)、[I-R4](../../SPEC.md#i-r4)、[I-R5](../../SPEC.md#i-r5)、[P-5](../../SPEC.md#具名前提与明确缺项)。Agent 一侧沿[条件终结](../../../../agent/agent-contract/SPEC.md#条件终结)。

Run 终态有三个入口。完成与失败在 Session 读到 Agent 的结束事实时成立。取消在 Session 的控制提交时成立。有界收束的失败在 `finishRun` 提交时成立。

```mermaid
sequenceDiagram
    participant A as Agent runtime
    participant J as 执行记录提供者
    participant S as Session 参加者
    participant E as 事件消费者
    participant D as 存储事务域
    A->>J: tryFinish，带推进授权与结论
    J->>S: 条件终结的同一提交内交来终结意图
    S->>S: 只读 judgeCompletion(execution)
    alt allowed
        S-->>J: 参加，不写条目
        J->>D: 提交 ended 与最后事件
        J-->>E: ended 事件
        E->>S: receive(agent-event ended)
        S->>D: 写 SE26 completed 或 failed，与 SE16。冻结的会话另写余下待处理输入的 SE38
    else blocked，有待交输入
        S-->>J: 冲突，依据为这些 InputId
        J-->>A: changed
        S->>J: 推进协调补交 submit，见 F-SC01
        A->>A: 重新求值
    else cancelled，SE26 cancelled 已成立
        S-->>J: 冲突，依据为 SE26 cancelled
        A->>J: 以已保存的取消依据再次 tryFinish
        J->>S: 交来终结意图
        S->>S: 核对结论为 cancelled 且控制等于 SE26 引用的控制
        S-->>J: 参加
        J-->>E: ended 事件，结论 cancelled
        E->>S: receive(agent-event ended)，只认回，不新增 SE26
    else terminal，其他终态已成立
        S-->>J: 冲突，依据为既有终态
    end
```

取消与有界收束由 Session 提交：

```mermaid
flowchart TD
    C["control(cancel-run) 或 control(archive)"] --> R["resolveControlScope"]
    R -->|Run 未终态| W["同批写 SE24、SE25、SE26 cancelled、SE16，归档另写 SE27"]
    R -->|完成或失败先成立| T["返回 terminal，带回既有终态"]
    W --> P["控制传播，终态不等传播"]
    P -->|挂接存活| P1["经出站端口 control 送到原执行"]
    P -->|没有挂接| P2["resume 取得挂接后送控制，挂接以取消授权终结"]
    P -->|Tool| P3["ToolStartFencePort（已被替代）.invalidate，等到 effective"]
    P1 --> E["之后读到的 ended 事件只认回"]
    P2 --> E
    P3 --> Q["receive(start-fence) 计入对账进度"]
    B["恢复者读执行记录到策略上限仍不可解释"] --> F["finishRun(uninterpretable)"]
    F --> G["写 SE26 failed、SE16，写明未收尾效果"]
    N["Agent 尚无该执行的记录"] -->|不是有界收束| M["按 PA-06 重放 invoke"]
    X["执行已结束而 Session 没有终态"] -->|不是有界收束| Y["读结束事实，按 Agent 的结论写终态"]
```

取消与受理、取消与终结的先后（PA-08，按权威提交顺序裁定）：

| 顺序 | 结果 |
| --- | --- |
| 取消先于 `accept` | Run 已是 cancelled。会话未归档时输入取得待处理资格，去处为下一个 Run。归档先成立时 `accept` 被拒绝 |
| `accept` 先于取消 | 输入保留待处理资格。Run 取消不撤销它，由新 Run 承接。归档同批撤销待处理资格并记录取消范围（SE27）。已交入而未承接的输入在 Session 一侧没有 SE14，由后继 Run 以同一 `InputId` 重新交入，SE13 记录前继 Run |
| 取消先于条件终结 | 参加者响应「冲突」，Agent 以取消依据再次终结。之后的结束事件按 RS-10 认回 |
| 条件终结先于取消 | Session 已读到结束事件时 `control` 返回 `terminal`。尚未读到时照常提交 SE26 cancelled，之后的结束事件按 RS-08 认回，Agent 的结论作为引用保留 |
| 取消已提交而没有活体挂接 | 按 PM-13 三条路径传播。`ControlProgress` 停在 propagating 直到核对完成，超过上限时报告，不冒充已停 |

失败分支：参加者读权威状态失败时响应「失败」，两侧都不保存。`control` 未知时 `queryOperation`，认回为 `committed` 之后才开始传播。`finishRun` 与既有终态冲突时返回 `terminal`。

契约未定：无。P-5 是具名前提，有界收束的边界由 Agent 拥有者确认。

## F-SC09 推进映射与换代

细化 [F-SE05](../../../docs/key-flows.md#f-se05-恢复)的接续部分与 [F-SE10](../../../docs/key-flows.md#f-se10-新-run-开始的求值与重装判定)的 reload 入口。依据：[PM-01](../../SPEC.md#pm-01) 至 [PM-12](../../SPEC.md#pm-12)、JC-07、JC-08、JC-15、[RS-05](../../SPEC.md#rs-05) 至 [RS-07](../../SPEC.md#rs-07)、[I-R2](../../SPEC.md#i-r2)、[I-R8](../../SPEC.md#i-r8)、[ToolStartFencePort（已被替代）](../../SPEC.md#toolstartfenceport)。Agent 一侧沿[恢复与接管](../../../../agent/agent-contract/SPEC.md#恢复与接管)与[采用交接](../../../../agent/agent-contract/SPEC.md#采用交接)。

Run 与 Agent 执行一一对应，attempt 与执行挂接一一对应。Session 不保存接续值。`claim.continuity` 与 `reload.handover` 都是耐久证据。

```mermaid
sequenceDiagram
    participant R as 恢复者或推进协调
    participant G as 装配与证据桥
    participant J as 执行记录提供者
    participant S as Session 参加者
    participant D as 存储事务域
    participant T as ToolStartFencePort（已被替代）
    opt reload 第一阶段，候选准备
        R->>G: 求值候选，取 Agent 采用交接的证明
        G-->>R: 交接证明，绑定执行、修订与目标采用。本阶段不写条目
    end
    opt 原推进撤除，旧 runtime 可配合
        R->>J: detach(advance)
        J-->>R: 交接依据
        R->>D: release，JC-15 写 SE16，advance 为 null
    end
    alt claim
        R->>D: claim(run，实例，continuity)，judgeAdvance 核对旧 attempt 已交还或可信排除
        D-->>R: SE15 序号加一，旧 attempt 尚无 SE16 时同批写 SE16 并产生 tasks.start-fence
    else reload
        R->>D: reload(run，候选，expected，handover)，核对同一定义标识与候选等于证明的目标采用
        D-->>R: SE15 与旧 attempt 的 SE16，采用变化时 SE08，必要时 tasks.start-fence
    end
    R->>J: resume(恢复依据，推进资格依据为新 attempt 的 SE15 证据)
    J->>S: 授予挂接的条件提交内交来推进资格依据
    S-->>J: 只读核对依据指向当前 advance，参加
    alt 恢复路径，旧挂接已交还
        J-->>R: 新挂接 active
    else 接管路径，旧挂接仍 active 且持接管资格
        J-->>R: 同一次条件提交内旧挂接 superseded，新挂接 active
        Note over J: 旧 runtime 的后续提交得到 stale-advance
    end
    opt tasks.start-fence 存在
        R->>T: invalidate(范围为旧 attempt，以 claim 或 reload 的操作身份)
        T-->>R: effective、pending、unavailable 或 commit-unknown
        R->>D: effective 时 receive(start-fence) 写 SE25，解除任务
    end
```

失联接管：恢复者读执行记录（`inspect`）显示挂接仍 active，恢复者持接管资格，并有宿主的失联判断作证据时，`claim`（接管）后 `resume`。没有失联依据时等 Agent，没有资格时报告并保留（PM-14）。宿主的失联判断不代替接管资格。

旧实例晚到（PM-11）：

| 晚到的动作 | 结果 |
| --- | --- |
| 参加提交（`recordMessage`、`commitDerived(compaction)`） | 参加者响应「冲突」，执行记录提供者返回 `stale-advance` |
| `custody` 与 `processed` 交接、`receive` | 不要求推进资格，照常提交。结果与费用归原调用 |
| Agent 事件 | 按事件身份照常写入，保存实际挂接关联 |
| `reload` | 交接证明的修订已过期，`changed` |
| `claim`（以旧 attempt 为旧资格） | `stale-advance` |
| `invoke` 或 `resume`（推进资格依据为旧 attempt） | 执行记录提供者核对失败，`denied` |

失败分支：

| 情形 | 行为 | 条款 |
| --- | --- | --- |
| 候选不合法、交接被拒或不可用 | 不写 SE08、SE15、SE16。`reload` 返回 `invalid` 或 `unavailable`。原采用已不合法时报告不可用，不以空采用推进 | PM-03、PM-09 |
| `detach` 返回 `stale-advance` | 读执行记录取得取代依据后提交 `release` | PM-04 |
| `detach` 返回 `denied` | 目标挂接属于存活的其他 runtime 且没有接管资格。不写状态，交维护者或等它自行交还 | PM-04 |
| `claim` 返回 `stale-advance` 或 `changed` | 已有其他后继，或旧 attempt 仍有效且未被排除 | PM-05 |
| `resume` 失败 | 不撤销 `claim` 的 SE15。同一恢复者或下一次扫描以同一推进资格依据重试 | PM-05 |
| `reload` 之后 `resume` 返回 `changed` | 重新取交接证明，以同一 attempt 的依据接续，不第二次 `reload` | PM-06 |
| 取消或归档先成立 | `claim`、`reload` 被拒绝，候选作废。`claim` 或 `reload` 先成立时取消照常提交，SE16 撤销新 attempt | PM-08 |
| `claim` 或 `reload` 回执丢失 | `queryOperation`。`committed` 读新 `AdvanceRef` 继续，`unknown` 时不第二次 `claim` | PM-10 |
| 重复 reload | 同候选同证明认回，同身份异候选 `conflict`，不同候选的第二个 `changed` | PM-12 |
| 各阶段由另一进程接手 | 谁读到 `advance` 并能出示它的 SE15 证据，谁就能继续映射提交 | PM-07 |
| 启动资格失效未生效 | `tasks.start-fence`（已被替代） 保留并重放。`resume` 不等生效。生效前不声称新发起已被阻止 | ToolStartFencePort（已被替代） |

契约未定：宿主失联判断的证据形状归 Agent 宿主。「推进资格已被取代」的参加者冲突映射为 `stale-advance` 归 Agent 拥有者，补上之前旧 runtime 在 `claim` 与接续之间得到 `changed`，见[明确缺项](../../SPEC.md#具名前提与明确缺项)。

## F-SC10 迟到结果与终态后的后台结果

细化 [F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志)的迟到步。依据：[EC-07](../../SPEC.md#ec-07)、[EC-08](../../SPEC.md#ec-08)、[EC-09](../../SPEC.md#ec-09)、[PM-14](../../SPEC.md#pm-14) 的保管行、[AgentDrivePort](../../SPEC.md#agentdriveport) 的 `recordResult` 与 `inspect`、[P-3](../../SPEC.md#具名前提与明确缺项)、[终态与控制](../../SPEC.md#终态与控制)。

```mermaid
sequenceDiagram
    participant P as 生产者 Model 或 Tool
    participant K as 消费位置拥有者或合格保管者
    participant J as 执行记录提供者
    participant S as Session
    participant D as 存储事务域
    P-->>K: 迟到的最终结果，或收场与账目
    K->>S: receive(execution) 写 SE19
    alt Agent 执行记录存在
        K->>J: recordResult(custody，consumption，结果版本)
        J->>S: custody 参加，见 F-SC04
        S->>D: SE20 登记在原 Consumption 下
    else inspect 返回 missing 且 ExecutionRef 曾记有修订
        K->>S: preserveResult(participation 为 null，consumption，结果，保管证据)
        S->>D: Session 提交 SE20，身份为 consumption 与结果版本
    end
    Note over K,D: 提交成功后发出交付责任解除，见 F-SC06
    alt Run 已终态，会话未归档，原调用仍有投递资格
        K->>S: accept(business，input 为结果的耐久引用，去处为后继工作)
        S->>D: routeInput 给出业务去处，写 SE11，tasks.routed-input 记录交回责任
        S->>S: 推进触发按 judgeRunStart 决定是否开新 Run，见 F-SC01
    else 会话已归档，SE27 撤销了投递资格
        Note over K,S: 不进队列，不 accept(business)，不创建后继 Run。撤销归档后也不自动进队列
    end
    opt Agent 不在场的账目与收场
        K->>P: 按原调用身份读取收场与账目事实
        K->>S: receive(execution)、receive(account) 写 SE19、SE32
    end
```

数据去向：结果事实 SE19，保管 SE20，账目 SE32。账目归原调用与原 attempt，未知费用保持未知。后继 Run 经引用关联原调用，原 Run 不复活。

失败分支：

| 情形 | 行为 | 条款 |
| --- | --- | --- |
| 保管者不可用 | 生产者继续保管，责任没有空档 | EC-07 |
| `recordResult` 返回 `conflict` | 结果项、版本、消费位置与交接不一致，拒绝 | AgentDrivePort |
| `ExecutionRef.revision` 为空时的 `missing` | 表示 Agent 尚未受理，按 PM-14 处理，不是记录已删除 | AgentDrivePort |
| P-3 不成立 | 迟到的收场只能经 Agent 事件到达，Agent 不在时保持未知。账目在途与迟到都保持未知，不以查不到当作未发生 | EC-09、P-3 |
| 重复报告 | 按生产者记录身份与修订派生的身份认回 | EC-09 |

契约未定：迟到账目与收场的读取资格（P-3）归 Model 与 Tool 的拥有者。

## F-SC11 时间线投影与在途收敛

细化 [F-SE08](../../../docs/key-flows.md#f-se08-时间线投影与在途收敛)。依据：[SessionHistory](../../SPEC.md#sessionhistory) 的 `begin`、`next`、`since`、[SL10、SL11](../../SPEC.md#日志读取投影及恢复)、[EC-10](../../SPEC.md#ec-10)、[EC-11](../../SPEC.md#ec-11)、[SessionNotifier](../../SPEC.md#sessionnotifier)、[值与结果项的约束](../../SPEC.md#值与结果项的约束)中的 `AdmittedMessage.consumption`。系统层说明见[用户可见内容的两处来源](../../../../../docs/architecture/runtime/streaming-and-consumption.md#用户可见内容的两处来源)。

用户看到的内容只来自两处：已提交日志的历史投影，与在途实时增量通道。进程内缓冲不是来源。

```mermaid
sequenceDiagram
    participant U as 读取者
    participant V as 时间线投影
    participant H as SessionHistory
    participant N as SessionNotifier
    participant L as 在途增量通道
    U->>V: 打开会话
    V->>H: begin(kinds 为时间线种类，from 为 null，direction 为 backward，pageBytes)
    H-->>V: HistoryPage，upper 固定，entries 从尾向头，scannedThrough，next，exhausted
    V-->>U: 最新一屏
    V->>H: 预加载 next(cursor)
    loop 向上滑动接近顶部
        V-->>U: 拼接已就绪的页，锚点保持
        V->>H: next(cursor)
        H-->>V: 更早的一页。空页按 scannedThrough 继续，exhausted 才到会话开头
    end
    par 底部实时追加
        N-->>V: committed(revision，kinds)
        V->>H: since(after 为已持有的最新条目，kinds，pageBytes)
        H-->>V: after 之后已提交条目的一个小页
        V-->>U: 追加到底部，上界前移
    and 生成中的回复
        L-->>V: 以调用键为键的在途快照与增量，只含生产者已保管的批次
        V-->>U: 显示「生成中」项
        Note over V,L: 对应 SE10 到达时，用日志项替换同一调用键的在途项，不出现两份
    end
```

数据去向：只读，不写日志。每页重新核权。游标固定来源、过滤、上界与扫描位置，调用方不能修改游标扩大范围。

时间线项与来源：

| 时间线项 | 来源 |
| --- | --- |
| 消息（用户、助手、工具、工具内部、提醒） | SE10 |
| 压缩标记 | SE10 压缩记录与 SE33，覆盖范围折叠显示，保留名单标「保留」 |
| Run 分隔与终态 | SE13、SE26 |
| 控制、插队、转后台、释放已发起 | SE24、SE25 |
| 卡片与决定 | SE22、SE23。卡片正文按条目里的引用向 HITL 读取，不读日志 |
| 附件 | 页内只带引用与尺寸。内容在需要显示时按引用读取 |
| 等待指示 | `WorkSnapshot.waiting`，治理读 |
| 正在生成的回复 | 在途增量通道，不读日志 |
| 工具过程 | 按结果引用读 Tool，不读日志 |
| 后台运行中的工具 | SE19 的转后台确认。确认到达后，该工具项显示「后台运行中」 |
| 费用 | SE32，按权限 |

列表与位置：

- 列表项以条目的 `id`（`EntryId`）为键。向顶部拼接更早的一页时，客户端补偿滚动偏移，使视口内的内容不跳动。
- 位置恢复：客户端记住视口顶部条目的 `id`，以及它下面一条的 `id`。`begin` 的 `from` 不含本身，所以重开时以下面一条为 `from` 调 `begin(backward)`，首页从顶部条目开始；再以顶部条目为 `from` 调 `begin(forward)`，补上视口下方的内容。之后向两端预加载。
- 同一调用重试时，「生成中」项保持不变，内容清空后重新显示。

失败分支：

| 情形 | 行为 | 条款 |
| --- | --- | --- |
| 权限撤回 | 旧游标被拒绝（`denied` 或 `invalid`），不继续披露。读取者清缓存后重新开始查询 | SL10、SL11 |
| 游标错域、失效或被篡改 | `invalid` | SessionHistory |
| 读路径不可用 | `unavailable`，不返回空页 | SessionHistory、EC-10 |
| 过滤造成的空页 | 不表示读完，`scannedThrough` 记录实际扫描位置 | SL11 |
| 通知丢失、重复或合并 | 事实不变。读取者以已持有的最新条目为 `after` 调 `since` 补读 | EC-11 |
| 崩溃后 | 只可能缺从未展示过的在途片段。恢复后的显示说明缺口，不补造 | F-SC12 |

契约未定：

- 时间线显示哪些事件种类。归 `session` 投影与公开接入的策略配置。
- 在途通道的订阅入口（订阅 Agent 句柄，或直接观察生产者）。归 Agent、Model、Tool 契约与公开接入。
- 助手消息的条目怎样关联原调用。`AdmittedMessage.consumption` 只在工具消息与后台占位消息上非空。归 message 包与 Agent 的消息形成。

`from` 的含义与 `since.after` 的取法已由 [SessionHistory](../../SPEC.md#sessionhistory) 规定，不在未定之列。

下列几项归客户端，不是 Session 的契约义务：

- 客户端页缓存以 (session, H, direction, cursor) 为键，H 是这一轮遍历固定的上界。缓存只淘汰，不失效，重连后复用。
- 预加载阈值与页字节数是客户端的策略配置，初值分别为 1.5 屏与 64 KiB。
- 上面「列表与位置」中的列表项键、滚动补偿、位置恢复与重试时的显示。

## F-SC12 流到日志

细化 [F-SE09](../../../docs/key-flows.md#f-se09-三条流到日志)。依据：[EC-01](../../SPEC.md#ec-01)、[事件来源与日志准入](../../SPEC.md#事件来源与日志准入)的 Model 与 Tool 来源表、JC-06、JC-11、JC-12、[终态与控制](../../SPEC.md#终态与控制)的转后台段。系统层说明见[三条流不逐块进会话日志](../../../../../docs/architecture/runtime/streaming-and-consumption.md#三条流不逐块进会话日志)与[崩溃后的恢复](../../../../../docs/architecture/runtime/streaming-and-consumption.md#崩溃后的恢复)。

模型回复流、工具内部事件流与 Agent 的 `stream` 事件都不逐块写入会话日志。会话日志只在收场、消费与记账三个时点写入。

```mermaid
sequenceDiagram
    participant M as Model
    participant A as Agent 有效挂接
    participant J as 执行记录提供者
    participant S as Session
    participant V as 时间线投影
    A-->>S: waiting 事件，经 F-SC07 写 SE18
    A->>M: 受理与发出
    loop 在途
        M->>M: 有界批量保管，游标只指向已保存内容
        M-->>A: 已保管批次
        A-->>S: stream 事件，不写条目，只推进游标
        A-->>V: 在途快照与增量，见 F-SC11
    end
    M-->>A: 真实收场与账目
    A->>A: 消息准入，形成助手消息
    A->>J: 提交 processed 或 custody 交接
    J->>S: 参加，写 SE21 或 SE20，见 F-SC04、F-SC05
    A->>J: 另一次提交：message 交接
    J->>S: 参加，写 SE10，见 F-SC02
    A-->>S: producer 事件，经 F-SC07 写 SE19
    S-->>V: 提交通知，日志项替换「生成中」项
    S->>M: 交付责任解除，见 F-SC06
    S->>M: 按原调用读取账目（P-3），在途与迟到相同
    M-->>S: 账目，receive(account) 写 SE32
```

模型回复流的规则：

| 编号 | 规则 | 契约位置 |
| --- | --- | --- |
| F1 | Session 在流途中零写入。首次写入是收场后 Agent 的同一次提交 | EC-01 的 `stream` 行、JC-06、JC-11、JC-12 |
| F2 | 「生成中」项以调用键为键。日志里的 SE10 经消费位置回到同一调用，时间线据此替换，不出现两份 | F-SC11 |
| F3 | 中断：`control(stop-call)` 或 `interrupt` 先成立 SE24。Model 以中断收场，Agent 把已交付内容形成带中断标记的消息。收场写 SE19，控制阶段写 SE25 | [终态与控制](../../SPEC.md#终态与控制)、EC-01 |
| F4 | 首内容到达之前失败并重试：同一调用的新一次发出。日志没有新条目，SE18 不变 | 事件来源表 |
| F5 | 首内容到达之后失败：不重发同一逻辑回复。Model 记故障收场，Agent 形成失败来源消息或拒绝。写 SE19，可能写 SE10 | 事件来源表 |
| F6 | 账目可以迟到。SE32 不依赖 Agent 在场 | EC-09 |

工具内部事件流：

| 阶段 | 保管 | 会话日志 |
| --- | --- | --- |
| 在途过程块 | Tool 先保存过程块与游标，再发布。时间线按结果引用读 Tool 的过程 | 不写 |
| 等待（Ask 或资源） | Agent 的 `waiting` 事件 | SE18 阻塞范围、SE22 |
| 转后台 | `control(background-tool)` 或 `interrupt` 写 SE24。Tool 的转换确认经消费位置拥有者 `receive(execution)` 写 SE19。占位经 Agent 的 `processed` 与 `message` 交接写 SE21 与 SE10 占位消息 | SE24、SE19、SE21、SE10 |
| 收场 | Agent 处理最终结果，`processed` 或 `custody` 交接与 `message` 交接 | SE19（含效果确定性）、SE21 或 SE20、SE10 |
| 后台最终结果 | Run 仍活时经依赖等待唤醒，走收场。Run 已终态时按 F-SC10 | 同上，或 SE19、SE20 与 SE11 |

崩溃矩阵：每一种情形的规则相同，保管了内容的一方持有内容，Session 只持有事实与证据。逐提交点的恢复动作归通用实现的 [CR 崩溃矩阵](../../../session/SPEC.md#cr-崩溃矩阵)。

契约未定：

- 中断回复的消息形状与标记。归 message 包与 Agent 的消息准入。
- 在途项的调用键中「本次发出」一级的来源。归 Model 契约。
- 在途通道的订阅入口，同 F-SC11。

## F-SC13 epoch 视图读取

细化 [F-SE07](../../../docs/key-flows.md#f-se07-模型可见历史的读取)。依据：[SessionHistory](../../SPEC.md#sessionhistory) 的 `readModelView` 条款、JC-09、[VC-O06](../../SPEC.md#候选的持续验证义务)。Request Context 一侧沿[历史源读口与 epoch 视图](../../../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图)。

epoch 视图是两次压缩之间的模型可见序列。它在压缩提交时物化（F-SC03），读取不重算。

```mermaid
sequenceDiagram
    participant Q as Request Context 历史源读口
    participant X as session-adapters 历史持有者
    participant H as SessionHistory
    participant D as 存储读路径
    Q->>X: HistorySource.read，带历史依据、位置与预算
    X->>H: readModelView(basis 为 ModelViewBasis 或 null，after，pageBytes)
    H->>D: 按 basis 的 epoch 读物化视图
    alt basis 为 null
        D-->>H: 当前 epoch 的一页
        H-->>X: page，basis 为当前 epoch 与上界，rows，next
    else basis 的 epoch 仍是当前 epoch
        D-->>H: 同一 epoch、同一上界的一页
        H-->>X: page
        X-->>Q: 行，含序号、条目位置、字节数、前缀摘要与消息
    else basis 的 epoch 已不是当前 epoch
        H-->>X: epoch-changed，带当前依据
        X-->>Q: 以新依据重读，不拼接两个 epoch 的页
    end
```

数据去向：只读，不写日志。同一历史依据下的各页属于同一 epoch，上界固定。

失败分支：

| 情形 | 行为 |
| --- | --- |
| 访问身份不合格 | `denied`，按这次传入的访问身份核对 |
| 缺访问身份、依据或游标错域、`pageBytes` 不合法 | `invalid` |
| 读路径不可用 | `unavailable`，不返回空页 |
| 分页期间提交压缩 | 之后以旧依据读取返回 `epoch-changed`。已返回的页仍属旧 epoch |

契约未定：无。物化方式归存储提供者。

## F-SC14 会话冻结

没有对应的组根流程。依据：[常驻工具与会话冻结](../../SPEC.md#常驻工具与会话冻结)、JC-28、[I-F1](../../SPEC.md#i-f1) 至 [I-F5](../../SPEC.md#i-f5)、`freeze` 的操作表行（[SessionManagement](../../SPEC.md#sessionmanagement)）、`startRun` 与 `reload` 的 `frozen` 失败、[守卫条款](../../SPEC.md#守卫条款)并入 ST03、ST06、ST20、ST22 的冻结分支、ST27、[由本组实现的 Tool 端口](../../SPEC.md#由本组实现的-tool-端口)、[P-8](../../SPEC.md#具名前提与明确缺项)。生命周期视图见[五个生命周期视图](../object-model/session-state-transitions.md#五个生命周期视图)。

Tool 只在采用点判定冻结。冻结只经 `freeze` 提交。判定有两条到达路径，对同一会话只成立一次冻结。

```mermaid
sequenceDiagram
    participant G as 证据桥与候选采用材料
    participant S as Session 协调
    participant D as 存储事务域
    participant T as Tool 宿主协调者
    participant X as session-adapters
    alt 第一条路径，采用点带回判定
        S->>G: startRun 或 reload 取候选采用材料
        G-->>S: 材料带 FreezeVerdict，原因 tool-shape-lost 与耐久证据
        S-->>S: judgeRunStart 为 frozen，命令返回 frozen 带 verdict，不提交
        S->>D: 推进协调以该判定调用 freeze
    else 第二条路径，Tool 宿主交来判定
        T->>X: ToolResidencyActions.freeze(session，cause，evidence)
        X->>X: 取得租户，以 coordinator 调用方类
        X->>D: freeze(verdict)
    end
    alt 会话尚未冻结
        D-->>S: JC-28 写 SE37，frozen 非空
        Note over D: 没有未终结 Run 时，pending 的全部输入同批写 SE38 解除待处理资格
    else 会话已冻结
        D-->>S: 原回执，recovered 为真，不写条目，不论证据是否相同
    end
```

冻结后的行为：

| 到达的意图 | 行为 | 条款 |
| --- | --- | --- |
| `startRun`、`reload` | 返回 `frozen`，`verdict` 为 null | I-F2 |
| `claim` | 照常，原 Run 沿原采用接续 | I-F2 |
| 未终结的 Run | 不被取消，按原规则收场。`freeze` 不调用 `resolveControlScope`，不写 SE24 至 SE26 | I-F3 |
| 待处理输入，有未终结 Run | 照常交入这个 Run。Run 终态同批以 SE38 解除余下的待处理输入 | I-F4、ST20 |
| 普通输入到达，没有未终结 Run | `accept` 返回 `frozen` | I-F4、ST03 |
| 归档与自动归档 | 照常。冻结独立于归档，`judgeIdle` 不读 `frozen` | I-F5 |
| 撤销归档 | 回到冻结，不回休眠。`lifecycle` 为 `frozen` 或 `active` | I-F5、ST22 |
| 已归档会话收到冻结判定 | 照常提交 | I-F5 |

失败分支：

| 情形 | 行为 |
| --- | --- |
| 原因不是 `tool-shape-lost`，或证据不是耐久证据 | `invalid` |
| 初始化未完成 | `not-ready` |
| 资格不足 | `denied` |
| 提交未知 | `commit-unknown`，按 `queryOperation` 认回 |
| 第一条路径两步之间崩溃 | 下一次推进触发重新取候选材料，Tool 再次给出判定，`freeze` 首次提交或认回 |
| 常驻工具暂时缺席、状态未知或被撤权 | Tool 以同形的不可用件替代，不给出冻结判定 |

契约未定：Tool 的会话常驻规则、同形判据、采用点判定表与两个驻留端口的形状（P-8）归 Tool 拥有者。P-8 闭合之前，本成员不写 SE36、SE37，session-adapters 不登记两个端口的提供者。

## F-SC15 引用查询

没有对应的组根流程。依据：[常驻工具与会话冻结](../../SPEC.md#常驻工具与会话冻结)的引用查询段、`references` 的操作表行（[SessionReconciliation](../../SPEC.md#sessionreconciliation)）、[由本组实现的 Tool 端口](../../SPEC.md#由本组实现的-tool-端口)、[VC-F07](../../SPEC.md#候选的持续验证义务)。

`references` 回答哪些会话还在引用一个登记键。它是系统作用域读取，不用 `Access<P>`，跨租户返回。

```mermaid
sequenceDiagram
    participant T as Tool 宿主协调者
    participant X as session-adapters
    participant S as SessionReconciliation
    participant D as 存储派生索引
    T->>X: ToolResidencyReader.referencing(scope 为 system，key)
    X->>X: 把 Tool 的登记键编码为 ResidentKey
    loop 逐页
        X->>S: references(scope 为 system，key，after，limit)
        S->>D: 读「登记键到会话」的派生索引，不扫描日志
        alt 索引可读
            D-->>S: 一页会话
            S-->>X: ResidentReference 页，含租户、会话、能力身份与 SE36 的 shape，与 next
        else 索引不可读
            S-->>X: unavailable，不返回空页
        end
    end
    X-->>T: 会话身份与 shape，不返回定义正文
```

引用的定义：会话当前记下的登记键含该键，并且会话未归档。冻结而未归档的会话算引用。已归档的会话不算：归档在同一批里取消未终结 Run（JC-16），已归档会话没有未终结 Run。存储提供者在提交 SE08、SE26、SE27 与 SE28 时维护索引。

失败分支：`denied`（系统作用域的读取资格），`invalid`（游标错域，或键不可解析），`unavailable`（不返回空页冒充没有引用）。只读，没有未知。

契约未定：同 F-SC14 的 P-8。

## F-SC16 作用域释放与换代后重新释放

细化 [F-SE04](../../../docs/key-flows.md#f-se04-归档级联与作用域释放)的释放部分。依据：JC-16、[ScopeReleasePort](../../SPEC.md#scopereleaseport) 与它的五类处置表、`releasedScopes` 的操作表行（[SessionReconciliation](../../SPEC.md#sessionreconciliation)）、[守卫条款](../../SPEC.md#守卫条款)并入 ST21 与 ST26 的分支、[VC-O02](../../SPEC.md#候选的持续验证义务)、[VC-O07](../../SPEC.md#候选的持续验证义务)。系统层说明见[作用域释放](../../../../../docs/architecture/runtime/control-and-recovery.md#作用域释放)，执行环境一侧沿[恢复](../../../../execution/execution-environment-contract/SPEC.md#恢复)与[拒绝原因](../../../../execution/execution-environment-contract/SPEC.md#拒绝原因)。

```mermaid
sequenceDiagram
    participant S as Session 协调
    participant D as 存储事务域
    participant P as 作用域释放插件
    participant R as ScopeReleasePort
    participant E as 执行环境
    S->>D: control(archive)，JC-16 写 SE27，同批产生 tasks.scope-release
    loop 每个作用域释放任务
        P->>R: release(租户，会话，任务的操作身份，作用域引用)
        R->>E: 凭装配注入的恢复授权请求释放
        E-->>R: 恢复结果，或拒绝
        R-->>P: ScopeReleaseReadback
        P->>D: receive(scope-release) 写 SE25，按五类处置解除或保留任务
    end
    Note over P,E: 执行环境提供者换代后，插件重跑
    loop 按页
        P->>D: releasedScopes(scope 为 system，after，limit)
        D-->>P: ReleasedScope 页，含租户、会话、原任务身份与作用域
        P->>R: 沿原任务的操作身份再次 release
        R->>E: 重复释放
        E-->>R: 认回
        P->>D: receive(scope-release)，同身份认回
    end
```

读回的处置：

| 处置 | 读回 | Session 的动作 |
| --- | --- | --- |
| `released` | 没有待停资源、不支持项或枚举失败的提供者 | 解除任务 |
| `pending` | 有待停的资源 | 保留任务，由级联推进按同一操作再次驱动 |
| `unsupported` | 有不支持恢复的提供者或资源 | 记录这一部分并交人处理 |
| `unavailable` | 有提供者枚举失败，或执行环境以不可用拒绝 | 保留任务，按策略退避后重试 |
| `not-authorized` | 执行环境以未获授权拒绝 | 保留任务并报告维护拥有者。不改用会话用户的访问身份重试 |

一次读回可以同时落入几类。只要还有待续、不可用或未获授权的部分，任务就保留。`release` 结果未知或抛出时任务状态记为 `unknown`，以同一操作身份重试。

数据去向：会话日志里的释放读回事实（SE25）是已释放作用域的耐久账本，执行环境不保存这份账本。`releasedScopes` 从存储提供者维护的派生索引读取，不扫描日志。对人的时间线只记录「已发起释放」与读回结果。

失败分支：`releasedScopes` 返回 `denied`、`invalid`（游标错域）或 `unavailable`（不返回空页）。重复释放由执行环境认回。超过策略上限时任务保持未结并报告维护拥有者，不冒充已释放。

契约未定：执行环境重启到重新释放之间的窗口。契约接受这个窗口，窗口内已归档会话的作用域可能尚未释放，见[明确缺项](../../SPEC.md#具名前提与明确缺项)。
