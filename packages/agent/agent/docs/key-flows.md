# Agent 推进的关键协作流程

状态为候选，待用户确认。本页把[产品旅程](../../../../.meta_harness/design/product/agent-progression/design.md#关键用户旅程)落实为逻辑角色间的次序和交接。Agent 拥有 Loop 下一步、原扩展经过、参数绑定和整批判断。Session 拥有工作身份、推进资格与唯一终态；Model、Tool 拥有原执行；Context 拥有输入投影与预算；HITL 拥有卡片和唯一答复；authorization 解释授权；assembly 拥有候选采用和结构交接。

共同规则继续由[主架构](../../../../docs/domains/agent-progression/architecture.md)、[成员 SPEC](../SPEC.md)及三个主题拥有。T1 至 T8 的精确文档含义只在 [Loop 转移定位](../loop.md#t1-t8)维护。本页使用这些定位号，不创建 Session 状态机或公开阶段枚举。Session 的状态、事件与提交守卫仍读[原状态表](../../../session/session/docs/session-state-transitions.md)。

图表达逻辑请求、事实、控制、保管与业务接续，箭头文字区分用途。异步答复和原调用没有共同物理寿命。flowchart 仅为活动示意，不是严格 UML 或算法证明。所有新推进都以有效资格为前提；取消、归档和既有终态先于新发起，迟到事实仍可按原责任保管。

<a id="f-ag01"></a>
## F-AG01 定义选入和装配结果

对应 [J-AG01](../../../../.meta_harness/design/product/agent-progression/design.md#j-ag01)，行为及验证归[定义专题](../definition.md#旅程与持续验证)。用户与定义维护者提供具有合法来源的选择和声明，Agent 解释其专有含义，assembly 求值采用。创建 Session 和取得 Run 资格不由本图代办。

```mermaid
sequenceDiagram
    participant U as 用户或定义维护者
    participant A as Agent 定义解释
    participant G as 资产治理
    participant P as assembly
    U->>A: 请求校验定义类型、依赖和继承声明
    A->>G: 请求合法身份、来源、锁定和版本事实
    G-->>A: 事实及未能确定的原因
    A->>P: 交付专有声明、必需来路和候选约束
    P->>G: 请求在完整合法范围解析已选身份
    alt 非法来源、必需定义缺失或 Loop 入口不可建立
        P-->>U: 事实：候选失败及具体原因
    else 候选合法
        P-->>U: 事实：采用依据及当前不可用能力
    end
    Note over A,P: 定义检查不发模型或工具，不制造 Run
```

继承来源仅决定额外身份，已选身份的实现仍在完整合法范围解析。候选失败不能发布混合构成；恢复对账原候选，不以旧采用证明新条件成立。合法定义存在但执行不可用时保留已知身份，后续动作可取得逻辑不可用结果。精确校验与来源版本协议由 Agent 定义、assets 和 assembly 对齐，缺项见[协议细化拥有者](#protocol-gaps)。

<a id="f-ag02"></a>
## F-AG02 正常推进及全批拒绝

对应 [J-AG02](../../../../.meta_harness/design/product/agent-progression/design.md#j-ag02)。下图从已经具备资格的 Agent 开始。原等待优先于新输入；只有原位置允许时才向 Session 请求承接当时全部合格普通输入。

```mermaid
flowchart TD
    Start[核对取消、终态与原调用] --> Resume{原位置有未完成责任}
    Resume -->|业务接续| Old[回原模型、压缩、扩展或工具位置]
    Resume -->|允许新一轮| T1[T1 请求承接全部合格输入]
    Old --> Next[按完整依据求值下一步]
    T1 --> C[请求 Context 投影与预算]
    C -->|不能装下| Fail[提出失败并进入统一终态出口]
    C -->|可发送| T2[T2 模型前扩展、复核预算并固定输入]
    T2 --> M[T2w 等原 Model 真实收场]
    M -->|最终回复事实| Entry[完整回复准入与完整参数解析]
    M -->|故障或中断事实| Reason[沿原结果和控制依据处理]
    Entry -->|有动作| T3[T3 各动作有序扩展链]
    Entry -->|无动作| Next
    Entry -->|入口否决| Reject[保留原结果、原因和连续否决依据]
    Reject --> Next
    T3 -->|需人处理| T4[T4 原批等待与 T5 原位置接续]
    T4 -->|后继又出卡| T4
    T4 -->|全批处理及判断齐备| Gate[执行前资格、参数、绑定和授权复核]
    T3 -->|全批判断齐备| Gate
    Gate -->|全拒| T8[T8 保存全部原因并重新求值]
    Gate -->|获准部分| T6[T6 请求 Tool 执行并等原结果]
    T6 -->|本步结果或合法后台占位齐备| T7[T7 可靠承接、执行后扩展]
    T7 --> Next
    T8 --> Next
    Reason --> Next
    Next -->|继续且位置允许| T1
    Next -->|等待| Old
    Next -->|终态候选| End[统一终态出口]
```

T2w 中的单次真实发出失败可能进入模型后失败分支，由有效策略把结论交回原 Model。原调用尚未终局时不交最终结果、不 ACK、不跳入主流程动作处理。原 Model 真实收场才交最终结果；流 finish 或完整块也不证明 Run 终结。最终失败和用户中断沿各自原因处理，不把所有故障画成内部重试。

T6 消费前台结果或符合 Tool 声明的后台占位。后台是等待消费方式，不能另建 Tool。dummy logical execution 使用原动作和不可用结果，不假报物理启动。结果先在原消费位置可靠承接，再执行动作后扩展；解除生产责任另按 [F-AG06](#f-ag06) 的两条合法路径判断。跨实例恢复时回 Old 所指原位置，不一律回 T1。验证归[Loop 旅程验证](../loop.md#旅程与持续验证)。

<a id="f-ag03"></a>
## F-AG03 整批判断、人工答复和后继出卡

对应 [J-AG03](../../../../.meta_harness/design/product/agent-progression/design.md#j-ag03)。同动作同位置按采用顺序判断，不同动作可以并行。以下图以整批已到结论或合法等待为起点，卡片只出自允许位置。

```mermaid
sequenceDiagram
    participant A as Agent 批次协调
    participant E as 原扩展经过
    participant Z as authorization
    participant H as HITL
    participant U as 有答复资格的人
    participant T as Tool
    A->>E: 请求各动作判断，携带生效参数和绑定
    E->>Z: 请求共同准入及授权解释
    alt 系统准入不可用或明确禁止
        Z-->>E: 事实：全拒或该动作拒绝，不以卡片代替准入
    else 允许位置需要人决定
        E->>H: 请求原卡片并保存等待关联
        H-->>U: 交付本轮卡片批次
        Note over A,H: 出卡事实已经成立，尚无答复也可释放推进资源
        U->>H: 请求答复原卡片，含明确不回答
        H-->>A: 事实：各卡片唯一有效答复及交回责任
        A->>Z: 请求解释其中授权类答复
        Z-->>A: 事实：原范围内的授权含义
        A->>E: 业务接续：整批所需答复按原规则处理后回原位置
        alt 后继扩展仍需人处理
            E->>H: 请求下一轮卡片并保存新等待
            Note over A,T: 整个动作批次继续等待，不发已获准部分
        else 全部后继判断齐备
            E-->>A: 事实：每动作结论及生效参数、绑定、依据
        end
    end
    opt 全批判断和卡片处理完成，且有获准动作
        A->>Z: 请求执行前当前授权复核
        Z-->>A: 当前资格及适用范围
        A->>T: 请求执行仍满足全部条件的动作
    end
```

出卡、答复交回和扩展接续是异步三段，不要求共同一次提交。卡片答完不等于整批已经处理完成。只有全批判断与所需答复处理都齐备，才进入执行前复核；图中 opt 还受 Run 未终态、当前推进权、环境与资源的共同守卫约束。全拒回 F-AG02 的 T8。

明确不回答返回没有答案，不授予动作，不重复原问题。当前参数、绑定或相关授权依据已变则不能复用旧批准；无关变更不机械重问。暂停、物理退出和查询失败不使卡片失效，原逻辑执行确定终局才失效。撤除扩展仍须保留原语义，具体接续见 AGENT-M02。十一处位置及不可用、报错、系统兜底的完整规则仍见[扩展专题](../extensions.md#十一处位置)，验证见其[旅程验证](../extensions.md#旅程与持续验证)。

<a id="f-ag04"></a>
## F-AG04 输入失败与按来源拒收

对应 [J-AG04](../../../../.meta_harness/design/product/agent-progression/design.md#j-ag04)。Context 拥有预算与压缩，Agent 消费它的明确结论并给 Session 提交失败候选。扩展拒绝压缩时可以不压，但不能因此发送仍超限的请求。

```mermaid
flowchart TD
    C[请求 Context 形成合法输入] --> B{固定部分及允许处理后的输入可装下}
    B -->|是| M[回模型前检查与预算复核]
    B -->|否| F[保留实际原因并提出 Run 失败]
    R[原入口收到候选消息] --> K{来源}
    K -->|外部输入拒收| X[向原受理方交回拒收原因]
    K -->|完整模型回复拒收| N[保存原结果与费用及连续否决依据]
    N --> L{适用上限达到}
    L -->|否且允许继续| W[退避后新调用，不冒充内部重试]
    L -->|是| F
    K -->|工具结果拒收| G{消费契约指定有效未终态 Run}
    G -->|是| F
    G -->|否| O[原消费入口承接，不造 Run、不改旧终态]
    F --> E[统一终态出口]
```

固定部分超限与处理后仍超限保留不同原因，不自动分叉、改模型、删除历史或循环压缩。新模型调用前仍核当前资格，取消先成立则不得继续。Tool 原结果、效果和费用由原拥有者保管，否决不重跑工具。旁路拒收的精确后果未定时由原消费拥有者细化，不能默认挂后继 Run。必要保存未知时按原身份对账，不把图上的下一条箭头当作已经成功提交。验证见[Loop 旅程验证](../loop.md#旅程与持续验证)。

<a id="f-ag05"></a>
## F-AG05 统一终态出口及控制范围

对应 [J-AG05](../../../../.meta_harness/design/product/agent-progression/design.md#j-ag05)。Agent 提出候选，Session 裁定并记录唯一终态，具体状态及提交守卫只读[Session 状态表](../../../session/session/docs/session-state-transitions.md)。

```mermaid
sequenceDiagram
    participant U as 获准控制方
    participant S as Session 治理
    participant A as Agent
    participant X as Model 或 Tool
    U->>S: 控制请求及明确目标范围
    alt 单调用控制
        S->>X: 控制原调用，保留意图与传播责任
        X-->>S: 事实：实际处置或未知
        S-->>A: 事实：原位置可用的控制结论
        Note over S,A: 不取消整个 Run，不自动影响其他调用
    else Run 取消或 Session 归档
        S-->>A: 控制：意图保存且新推进资格撤销
        S->>X: 控制具名原执行，保留未收尾责任
        A-->>S: 事实：原等待和尚未收尾信息
    end
    A->>A: 终态前检查，完成须无应承接输入与阻塞等待且模式允许
    alt 完成候选须继续或等待且仍有有效资格
        A->>A: 业务接续到原位置
    else 适用终态候选形成
        A->>S: 请求统一终态出口，附完成、失败或取消依据
        S-->>A: 事实：裁定结果、已成立终态或未提交原因
        Note over S,X: 终态后保管后到事实，不恢复旧 Run
    end
```

终态前扩展由 Agent 在提交前协调。完成候选可被要求继续、等待或否决；失败、取消按其适用检查和依据收束，扩展不能借否决恢复已撤推进资格。没有 Agent 实例时，Session 仍承担持久控制传播和终态责任，不能等待图中某实例复活才取消。

Run 取消涉及原模型与前台工具，不自动停止后台、子方或无关调用。优雅取消可有尚未收尾期间，真实停止和逻辑取消分别记录。归档取消本会话的原工作等待与投递资格，级联责任归 Session；不以物理全停为前提。撤销归档只回休眠，不恢复旧调用或卡片。精确控制传播与竞争提交由 AGENT-M03 及 Session 协调者细化。验证见[Loop 旅程验证](../loop.md#旅程与持续验证)。

<a id="f-ag06"></a>
## F-AG06 接手原工作及可靠交付两条路径

对应 [J-AG06](../../../../.meta_harness/design/product/agent-progression/design.md#j-ag06)。新推进者取得原身份与当前资格后，先查询原执行和消费责任。原 Run 无效时，不继续业务推进，但获准保管者仍可保存真实结果。独立消费者不必制造 Session 或 Run。

```mermaid
sequenceDiagram
    participant S as Session 或独立消费责任方
    participant A as 合法接手者
    participant X as 原 Model 或 Tool
    participant D as 消费侧可靠事实
    S->>A: 业务接续：原调用、原位置及合法责任
    A->>X: 请求查询原执行或原交付
    alt 查询暂不可用
        X-->>A: 事实未知
        A->>D: 保管原关联及待对账责任
    else 原执行仍在途
        X-->>A: 事实：仍在执行
        Note over A,X: 等原调用，可交还资源，不重发
    else 原执行已真实收场
        X-->>A: 事实：原结果和收场依据
        alt 先可靠保管
            A->>D: 保存内容或有效引用、原位置与后续责任
            D-->>A: 确认可恢复承接
        else 先完成处理
            A->>D: 保存处理完成事实、原位置及足以恢复责任的依据
            D-->>A: 确认原消费契约要求已满足
        end
        A->>X: 原协议确认，Model 走合法 ACK，Tool 走自身规则
        Note over A,D: 后续从消费侧依据接续，不要求重领已 ACK 全文
    else 生产侧已确认交付解除
        A->>D: 请求原保管内容或已完成处理的依据
        D-->>A: 原位置与剩余责任
    end
```

任一路径都须能在停机后判明谁负责，不能让双方都丢弃责任。先完成处理不强制再保存一份可重领全文；尚未处理完且依赖后续消费则须可靠保管必要内容。模型 ACK 只针对真实收场且有当前合法消费者的调用。观察、开始处理或单次发出失败都不能提前 ACK。ACK 生效、清理和费用结算分别可见；工具全文不套用模型清理规则。

若生产方确认自身失联，按 Model 或 Tool 自己的恢复结论回原位置。Agent 退出或查询失败不证明失联，工具未知效果不自动重放。准确的资格与交接共同边界、ACK 对账和提交未知由 AGENT-M03 的协调者补齐；在途内容耐久缺项见 AGENT-N01。验证见 [SPEC 旅程验证入口](../SPEC.md#旅程验证入口)。

<a id="f-ag07"></a>
## F-AG07 定义换代与在途语义交接

对应 [J-AG07](../../../../.meta_harness/design/product/agent-progression/design.md#j-ag07)。定义身份固定，版本采用可变。普通恢复保持原采用，新 Run 可取同标识合法发布版本。显式 reload 的逻辑次序如下。

```mermaid
sequenceDiagram
    participant U as 获准变更方
    participant P as assembly
    participant S as Session 治理
    participant O as 原 Agent
    participant N as 新 Agent
    participant X as 原调用与原扩展责任
    U->>P: 请求同标识候选校验
    alt 候选无效
        P-->>U: 事实：原因，原采用仅在仍合法时保留
    else 候选有效且当前仍允许交接
        P->>S: 请求采用交接及原工作关联
        S-->>O: 控制：撤旧推进资格并保存原位置
        S->>N: 业务接续：原 Run、新 attempt 和合法采用
        N->>X: 请求原调用、判断及卡片对账
        X-->>N: 事实：已得结论、等待或未知
        N->>N: 回原位置，核对未发动作的当前条件
    end
    Note over S,N: 取消先成立阻止新推进，旧候选不覆盖更新选择
```

模型选择、模式、权限、Context 或稳定入口内部数据变化不自动换定义或 attempt，已发请求保持原固定内容。旧模型建议与当前工具约定不兼容时，Agent 返回具体原因供新的决定使用，不暗换实现或参数。已得扩展结论不重跑，不同语义新判断不冒用旧结论。撤除后能否合法继续的精确协议由 AGENT-M02 的 Agent 与 assembly 拥有者确定，缺协议时保留等待和责任，不能宣布接续完成。验证见[定义专题](../definition.md#旅程与持续验证)与[扩展专题](../extensions.md#旅程与持续验证)。

<a id="f-ag08"></a>
## F-AG08 长期读取、守卫及因果解释

对应 [J-AG08](../../../../.meta_harness/design/product/agent-progression/design.md#j-ag08)。守卫只读原事实与可重建投影，压缩后的模型输入不成为计数权威。

```mermaid
flowchart LR
    F[原工作事实与调用费用依据] -->|事实读取| P[带事实进度的可重建投影]
    P -->|求值依据| G[原始事实上的守卫]
    G -->|L0| O[持续观测]
    G -->|L1 或 L2| M[追加提醒后继续合法求值]
    G -->|L3| E[提出打转失败，统一终态出口]
    G -->|L4| W[原位置人工等待]
    P -->|获准查询| D[诊断原调用、判断、等待和费用]
    W -->|有效处理后业务接续| G
```

上述阶梯是既有行为含义，不规定算法、阈值或必经每一级。取消仍先撤新推进，恢复继续使用原事实范围，不以重启或压缩清零。投影落后或查询未知须可识别，不能以缓存为空证明没有工作。诊断不默认复制正文、附件或秘密；账目由原执行拥有者记账，Agent 保持原用途关联，遥测采样不是费用全量依据。性能尺度与策略配置的精确协议沿 AGENT-M01、AGENT-M03 细化，验证见[Loop 旅程验证](../loop.md#旅程与持续验证)。

<a id="protocol-gaps"></a>
## 协议细化拥有者

以下缺项限定实现与验证接受，不阻止表达以上已明业务路径。公开操作、Schema、提供者和锁未在图中选定。

| 流程中的待细化点 | 责任及原问题 | 必须保留的可观察后果 |
| --- | --- | --- |
| F-AG01、F-AG07 的定义校验、版本读取与候选采用接口 | Agent 定义与 assembly，见[定义规格末段](../definition.md#交接结果与验证义务) | 非法候选不采用，标识固定，合法旧采用与失效旧条件可区分 |
| F-AG02、F-AG04、F-AG08 的 step、连续回复否决与策略边界 | Agent Loop，[AGENT-M01](../../../../.meta_harness/design/product/agent-progression/design.md#agent-m01) | 新调用不冒充内部重试，跨 attempt 不清零 |
| F-AG03、F-AG07 的稳定经过、非确定输入、卡片接续及撤除 | Agent 扩展与 assembly，HITL 和 authorization 提供原决定，[AGENT-M02](../../../../.meta_harness/design/product/agent-progression/design.md#agent-m02) | 三段异步责任可认回，旧结论不重跑，后继卡片不越过批屏障 |
| F-AG02、F-AG05、F-AG06 的围栏、认领、跨域有效边界、控制传播与 ACK 对账 | Agent 推进协调与 Session、原执行及保管拥有者，[AGENT-M03](../../../../.meta_harness/design/product/agent-progression/design.md#agent-m03) | 旧资格不推进，原事实可迟到保存，确认未知不重做副作用 |
| F-AG04 的后台、Run 外及旧 Run 结果否决后果 | 原消费拥有者与 Agent 入口，见[Loop 入口失败链](../loop.md#消息入口的失败链) | 不造 Run，不改终态，不为取消业务重授入队资格 |
| F-AG06 的在途展示内容跨生产 runtime 失联耐久 | Model 流式与消费存储拥有者，[AGENT-N01](../../../../.meta_harness/design/product/agent-progression/design.md#agent-n01) | 不从收场后 ACK 推断逐片耐久，不宣布允许丢失 |
| F-AG08 的长期读取尺度、策略配置资格和生效协议 | Agent Loop 策略、事实与查询拥有者，[AGENT-M01](../../../../.meta_harness/design/product/agent-progression/design.md#agent-m01)、[AGENT-M03](../../../../.meta_harness/design/product/agent-progression/design.md#agent-m03) | 缓存进度可查且可重建，守卫及账目不因优化丢失 |

本页只有候选逻辑流程和持续验证入口。没有运行真实装配、故障或性能实验，没有据 Mermaid 图授予行为正确性或接受。
