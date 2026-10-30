# Session 实现流程

本页把 [SPEC](../SPEC.md) 的机制展开成流程：命令处理器怎样完成一次提交，五个协调器与七个调度器各自在什么时候动、调用什么、把回执写到哪里。契约层的协议流程归[契约流程](../../session-contract/docs/flows/README.md)，跨成员分工归组根的[关键流程](../../docs/key-flows.md)。本页只引用契约条款，不新增条款。图中参与者是逻辑角色，不表示进程或共同寿命。运行实现目前为空。

## 构造与调用

工厂以依赖聚合与配置构造服务。构造顺序：核对当前访问检查、事务端口与内部主体在场，否则服务停在不可用，不启动任何协调器与调度器；装入 `SchedulingPolicy`；注册五个协调器与七个调度器；S3 做一次启动扫描。宿主把框架服务适配为端口，本成员经端口调用依赖。

### 命令处理器的一次提交

对应 [CP-01](../SPEC.md#cp-01)。每个变更命令走同一条流水线，一次提交。

```mermaid
sequenceDiagram
    participant Caller as 调用方或协调器
    participant CP as 命令处理器
    participant Op as 操作记录
    participant DS as decide（契约导出的纯函数）
    participant Br as 身份桥、证据桥、Context 与空闲输入
    participant Tx as SessionTransactionPort 与存储参加者
    participant N as SessionNotifier
    Caller->>CP: 命令与 Access
    CP->>Op: 按 OP-00 派生身份后点查
    alt 已提交
        CP-->>Caller: 原回执，recovered 为真
    else 未见
        CP->>Tx: readWork；命令带 expected 时记下 expected
        CP->>DS: 事务外调用 decide，只取拒绝原因与所需材料
        alt 拒绝结局
            CP-->>Caller: 失败，不提交
        else 允许
            CP->>Br: 按命令要材料
            CP->>Tx: commit(命令, 材料)
            Note over Tx: 选尝试代次；事务内调用 decide：带 expected 的七种命令核对 expected，其余按当前状态重新裁定
            alt changed（只有带 expected 的命令）
                Note over CP: 回到点查，以同一身份重做，次数受策略上限
            else commit-unknown
                CP-->>Caller: commit-unknown，不改写
            else 成功
                CP->>N: committed(修订, 证据, 事件种类)
                CP-->>Caller: CommitReceipt
            end
        end
    end
```

命令到条目的编码只在 `decide` 里。事务外的 `decide` 只决定是否拒绝与要收哪些材料，结果不进入提交。重做与同一意图的重试沿用同一操作身份，存储参加者为每次尝试开新的尝试代次（[尝试代次](../../session-storage-sql/SPEC.md#w1-attempts)）。Session 为参加者时（[CP-02](../SPEC.md#cp-02)），存储参加者在执行记录提供者的事务里调用 `decide` 并写条目，由提交方提交。

### C1 受理流水线

对应 [C1](../SPEC.md#c1) 与 [EX](../SPEC.md#ex-1)。细化组根的 [F-SE01](../../docs/key-flows.md#f-se01-一条输入从受理到推进)。

```mermaid
flowchart LR
    In[入站输入] --> R[用途提醒]
    R -->|拦截| Stop[accept 只写 SE12，返回原因]
    R -->|放行| X[内容型斜杠命令展开]
    X -->|失效命令| Stop
    X -->|放行| H[用户提示提交 hook]
    H -->|拦截| Stop
    H -->|放行| A[accept 提交 SE10、SE11]
    A --> Rc[分流回执交回调用方]
    A --> Nt[提交通知唤醒 S1]
```

### C2 Agent 推进协调器：开 Run 与交入

对应 [C2](../SPEC.md#c2) 的开 Run 与续入两行，依据 [PM-02](../../session-contract/SPEC.md#pm-02)、[PA-01](../../session-contract/SPEC.md#pa-01)、[PA-09](../../session-contract/SPEC.md#pa-09)。

```mermaid
sequenceDiagram
    participant S1 as S1 推进触发
    participant C2 as C2 Agent 推进
    participant CP as 命令处理器
    participant AD as AgentDrivePort
    S1->>C2: judgeRunStart 为 eligible
    C2->>CP: startRun
    alt frozen 且 verdict 非 null
        C2->>CP: freeze(verdict)
    else frozen 且 verdict 为 null
        Note over C2: 会话已冻结，不调用 freeze，不开 Run
    else 成功
        CP-->>C2: SE13、SE15 回执
        C2->>AD: invoke(首条输入身份, SE13 回执, SE15 证据)
        alt 受理
            C2->>CP: receive(input-handover) 写 SE35
            loop 其余待处理输入，按到达顺序
                C2->>AD: submit(InputId, SE11 回执)
                alt 受理
                    C2->>CP: receive 写 SE35
                else invalid
                    C2->>CP: receive 写 SE35 为拒收
                else terminal
                    Note over C2: 不重试，不改去处，等结束事件
                end
            end
        else invalid
            C2->>CP: finishRun 有界收束，同批 SE35 为拒收
        else denied
            Note over C2: attempt 已被取代，交 C5
        else busy 或 unavailable
            Note over C2: 按 advance.retryDelaysMs 退避
        else commit-unknown
            C2->>AD: query(出站身份)
        end
    end
```

### C2 Agent 推进协调器：同日志解释与进度

对应 [RD-01](../SPEC.md#rd-01) 至 RD-07，依据 [EC-01](../../session-contract/SPEC.md#ec-01)、[EC-02](../../session-contract/SPEC.md#ec-02)。读取与解释在 session-adapters 的 [AD-02](../../session-adapters/SPEC.md#ad-02)。不产生后果的事件不单独提交，持久进度随下一次解释提交前进，这是 EC-02 的规则。细化组根的 [F-SE02](../../docs/key-flows.md#f-se02-agent-事件到日志条目)。

```mermaid
sequenceDiagram
    participant J as 同一 AgentJournal 提供者（session-adapters）
    participant I as 同日志解释（AD-02）
    participant Tx as 会话日志的解释提交
    I->>I: 从快照取 readThrough
    I->>J: output.read 或 output.events，序号大于 readThrough
    J-->>I: 一页事件
    loop 每个事件
        alt message 或 entry
            Note over I: 只推进内存进度
        else 产生后果的事件
            Note over I: 按 EC-01 派生后果，按原 execution 与事实身份认回
        end
    end
    I->>Tx: 一次解释提交：后果、readThrough 与该次 Session 操作答案同批保存
    alt 提交未知
        Note over I,Tx: 按原解释操作身份查询并认回，不换身份
    end
    Note over I,J: 不调用 output.acknowledge。读到缺口时经 inspect 读完整快照，按 PM-14 对账后继续
```

### C2 Agent 推进协调器：恢复、接管与换代

对应 [C2](../SPEC.md#c2) 的恢复与换代两行，依据 [PM-03](../../session-contract/SPEC.md#pm-03) 至 [PM-06](../../session-contract/SPEC.md#pm-06)、[PM-14](../../session-contract/SPEC.md#pm-14)。

```mermaid
flowchart TD
    R[C5 交来 run.active] --> Q{执行记录}
    Q -->|挂接 active，没有失联依据| W[等 Agent，读事件，补交待交输入]
    Q -->|挂接 active，有失联依据与接管资格| T[claim 接管]
    Q -->|挂接已交还或已被取代| Rel[认回或提交 release] --> Cl[claim]
    Q -->|advance 为空| Cl
    T --> Rs[resume，带 SE15 证据]
    Cl --> Rs
    Rs -->|挂接回执| Done[等 Agent 推进]
    Rs -->|changed 或 unavailable| Retry[同一依据重试，不第二次 claim]
    Rs -->|terminal| End[读结束事实，按 Agent 结论写终态]
    Rs -->|denied| C5[交 C5 报告]
    Rd[显式 reload] --> Cand[候选准备，取交接证明]
    Cand -->|失败| Keep[原采用与原 attempt 保持]
    Cand -->|成功| Det[detach 后 release，或旧 runtime 失联则跳过]
    Det --> Rl[reload 写 SE08、SE15、SE16]
    Rl --> Rs2[resume，绑定交接证明]
    Rs2 -->|changed| Re[重取交接证明，同一 attempt 接续]
```

### C2 Agent 推进协调器：冻结判定到达

对应 [C2](../SPEC.md#c2) 的冻结行，依据[常驻工具与会话冻结](../../session-contract/SPEC.md#常驻工具与会话冻结)。

```mermaid
sequenceDiagram
    participant C2 as C2 Agent 推进
    participant CP as 命令处理器
    participant EB as 证据桥（候选采用材料）
    participant TA as Tool 宿主协调者（经 session-adapters）
    C2->>CP: startRun 或 reload
    CP->>EB: 取候选采用材料
    EB-->>CP: 材料带回 FreezeVerdict
    CP-->>C2: frozen 失败，verdict 为该判定，不提交
    C2->>CP: verdict 非 null 时 freeze(verdict)
    CP-->>C2: SE37，没有 Run 时同批 SE38
    Note over C2,CP: 两步之间崩溃：下一次触发重新取材料，判定相同，freeze 首次提交或认回
    TA->>CP: freeze(session, tool-shape-lost, 证据)
    CP-->>TA: 已冻结时原回执，recovered 为真
```

### C3 控制传播协调器

对应 [C3](../SPEC.md#c3) 与 [PM-13](../../session-contract/SPEC.md#pm-13)。

1. 控制提交成功后，协调器按原 operation 经 AgentDrivePort.control 送到 Agent 长期控制入口，不先取得挂接。
2. Agent 的控制结果、收束与 resume 顺序按 [J07 映射](../../session-adapters/SPEC.md#ad-14)。受理与实际停止分别核对，未知保留责任。
3. S5 以原身份重放未核对责任。超过上限仍保留 propagating 并报告。原控制的传播、生产者核对与原责任交接全部对账后才成为 reconciled。

Tool 围栏归 Agent/Tool J03，不计入该进度。取消或 claim 不必然触发 start-fence，触发政策仍属 #502 未决项。Session 不发失效调用，也不生成另一套围栏任务。

### C4 归档与级联协调器

对应 [C4](../SPEC.md#c4)，依据 [ScopeReleasePort](../../session-contract/SPEC.md#scopereleaseport)、[级联推进](../../../../docs/architecture/runtime/control-and-recovery.md#级联推进)。细化组根的 [F-SE04](../../docs/key-flows.md#f-se04-归档级联与作用域释放)。

```mermaid
sequenceDiagram
    participant CP as 命令处理器
    participant C4 as C4 归档与级联
    participant C3 as C3 控制传播
    participant Child as 子会话（同一服务）
    participant SR as ScopeReleasePort
    participant S6 as S6 级联推进
    CP-->>C4: archive 提交成功：SE27、任务
    C4->>C3: 传播原控制
    loop 每个 tasks.cascade
        C4->>Child: control(archive)，固定 childOperation
        Child-->>C4: 回执、denied 或 commit-unknown
        C4->>CP: receive(cascade) 写 SE25，解除或保留任务
    end
    C4->>SR: release(作用域)，以任务的操作身份
    SR-->>C4: 恢复结果或拒绝
    C4->>CP: receive(scope-release) 写 SE25，按五类处置解除或保留
    S6->>C4: 对保留的任务按 cascade.intervalMs 再次驱动
    Note over CP,S6: 冻结的会话照常手动归档，也照常参加自动归档裁定；归档同批取消未终结 Run，撤销归档后按归约回 dormant 或 frozen
```

### C5 恢复协调器

对应 [C5](../SPEC.md#c5)，依据 [PM-14](../../session-contract/SPEC.md#pm-14)、[P-5](../../session-contract/SPEC.md#具名前提与明确缺项)。细化组根的 [F-SE05](../../docs/key-flows.md#f-se05-恢复)。

```mermaid
flowchart TD
    S3[S3 交来会话] --> L[loadRecovery]
    L --> U[unresolved 非空] --> S4[S4 待决认回]
    L --> I[tasks.initialization] --> Init[重新驱动负责方，completeInitialization]
    L --> RI[tasks.routed-input] --> Re[重投拥有者，receive]
    L --> TK[tasks.cascade、scope-release] --> C4C3[C4 或 C3]
    L --> Ctl[controls 为 propagating] --> C3[C3 控制传播]
    L --> Run[run.active 的各行] --> C2[C2：重放 invoke、补交 submit、release、claim 后 resume、读结束事实]
    L --> Cons[结果已报告而未保管] --> Cust["recordResult(custody) 参加写 SE20；记录已删除时 preserveResult"]
    L --> Rel[release 为 pending] --> Ack["Tool 原确认从同日志恢复；Model ACK 未决时只报告"]
    Run --> B{记录持续不可读，达到上限}
    B -->|是| FR[finishRun 有界收束 failed]
    B -->|否| C2
    L --> Fz{frozen 且 Run 为 none 且 pending 非空}
    Fz -->|是| Def[报告存储缺陷，不清理，不开 Run]
```

任一拥有者返回 `unavailable` 时保留该项，退避归 S3。

### C5 原生产者确认的恢复

对应 [C5](../SPEC.md#c5-release)，依据 [JC-Release](../../session-contract/SPEC.md#jc-release) 与 EC-04/05。

Tool 宿主收到 saved 后自己解除交付责任，Tool 原确认怎样写入同一日志未定（[JC-RELEASE-TOOL-PATH](../../session-contract/SPEC.md#jc-release-tool-path)）。日志中已有该确认时，AD-05 核对原版本后 receive(release)。确认未到保持 pending，Session 扫描不代发解除。Session 提交未知先查询原 operation。Model ACK 未决时只报告，不执行动作，不以 received/saved 写 confirmed。

### 调度器与协调器的接续

对应 [S1](../SPEC.md#s1) 至 [S7](../SPEC.md#s7) 与 [SR](../SPEC.md#sr-1)。调度器只决定何时再检查，不写日志。

```mermaid
flowchart LR
    N[提交通知] --> S1[S1 推进触发]
    N --> S2[S2 空闲与自动归档]
    N -->|SE20、SE21| C5[C5 恢复]
    CU[命令返回 commit-unknown] --> S4[S4 待决认回]
    T[时钟] --> S2
    T --> S3[S3 恢复扫描]
    T --> S5[S5 控制重放]
    T --> S6[S6 级联推进]
    V[资产、工作区、设置的变化通知] --> S7[S7 预求值与预热]
    Boot[进程启动] --> S3
    S3 -->|inputs| S1
    S3 -->|idle-armed| S2
    S3 -->|run| C2
    S3 -->|release| C5
    S3 -->|unresolved| S4
    S1 --> C2[C2 Agent 推进]
    S2 -->|archived| C4[C4 归档与级联]
    S3 --> C5
    S4 -->|committed 回执| Orig[原协调器]
    S5 --> C3[C3 控制传播]
    S6 --> C4
    S7 --> Asm[装配协调者预求值]
```

#### S1 推进触发

```mermaid
flowchart LR
    N[通知含 SE11、SE26、SE28 或 SE02] --> F{kinds 含 session.frozen，或快照 frozen 且 Run 为 none}
    F -->|是| Skip[跳过]
    F -->|否| J[judgeRunStart]
    J -->|eligible| C2[C2 开 Run]
    J -->|run-active 且有待交输入| Sub[C2 续入]
    J -->|其他| Stop[不动作]
```

#### S2 空闲与自动归档

```mermaid
sequenceDiagram
    participant S2 as S2
    participant CP as 命令处理器
    participant C4 as C4
    S2->>S2: waitUntil(SE31 起点 + idleMs)
    Note over S2: 冻结不改变空闲计算，冻结的会话照常参加自动归档裁定
    S2->>CP: inspectIdle
    alt 观察为 unknown
        Note over S2: 不写条目，按 idle.checkIntervalMs 再看
    else 有观察
        S2->>CP: recordIdle 写 SE31
        S2->>CP: considerAutoArchive(idleEvidence)
        alt archived
            CP-->>C4: 归档提交，进入级联
        else not-due、exempt、disabled
            Note over S2: 不写条目；新工作或关系变化的通知使等待失效并重算
        end
    end
```

#### S3 恢复扫描

```mermaid
flowchart LR
    Dir[事务域目录，缺席时用装配交入的租户集合并报告缺口] --> B
    Dir --> P
    B[启动] --> All[pending 不带 reason，七个原因的并集，分页] --> Disp[按每个会话的原因分派]
    P[周期] --> R1[unresolved] --> S4[S4]
    P --> R2[controls] --> C5[C5]
    P --> R3[tasks] --> C5
    P --> R6[inputs] --> S1[S1]
    P --> R7[run] --> C5
    R7 --> C2[C2 同日志解释]
    P --> R4[idle-armed] --> S2[S2 计时，judgeIdle 裁定到期]
    P --> R5[release] --> C5
    Disp --> S4
    Disp --> C5
    Disp --> S1
    Disp --> S2
    U[C2、C3 上报] --> One[单个会话] --> C5
    C5 -->|unavailable| BO[按 sessionBackoff 退避后再交]
```

#### S4 待决认回

```mermaid
flowchart LR
    U[commit-unknown 或 unresolved] --> Q[queryOperation，同一身份]
    Q -->|committed| O[回执交原协调器]
    Q -->|not-committed 或 attempt-rejected| F[原发起者以同一身份重试，开新尝试代次]
    Q -->|unknown| W[按 retryIntervalMs 再查]
    W -->|超过 maxAttempts| Rep[保持 unresolved 并报告]
```

#### S5 控制重放与 S6 级联推进

```mermaid
flowchart LR
    T[时钟间隔] --> S5[S5：controls 中 propagating] --> C3[C3 传播]
    T --> S6[S6：tasks 中 pending 或 unknown] --> C4[C4 级联与释放]
    C3 -->|超过 maxReplays| R1[停在 propagating 并报告]
    C4 -->|超过 maxDrives| R2[任务保持未结并报告]
```

#### S7 预求值与预热

依据[比对代替求值](../../../../docs/architecture/runtime/assembly-and-change.md#比对代替求值)。细化组根的 [F-SE10](../../docs/key-flows.md#f-se10-新-run-开始的求值与重装判定)。

```mermaid
flowchart LR
    V[变化通知带作用域变更计数] --> Cmp{与最近 SE08 的输入快照比对}
    Cmp -->|全等| No[不动作]
    Cmp -->|有变化| Pre[请装配协调者预求值并校验候选]
    Pre -->|采用会变且 P-7 已闭合| Warm[AgentDrivePort.prewarm]
    Pre --> Cache[已校验候选缓存，键为全部计数，归装配协调者]
    Cache --> Entry[startRun 或 reload 直接采用]
```

## 退出

退出先保留原工作与未完成责任，再交还本成员持有的资源。顺序：调度器停止接受新的触发；在途命令跑完或返回未知；协调器在当前命令结束后停止；释放时钟等待与缓存。退出不回滚已提交的事实，不补发未发出的出站调用，不发通知。重启后 S3 找回未完成的任务、传播中的控制与未知操作，以同一操作身份重放。具体 Cordis 插件的注入撤除与换代见 [session-cordis](../../session-cordis/docs/cordis.md)。
