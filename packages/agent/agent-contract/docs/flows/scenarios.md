# Agent 推进的关键协作流程

状态：设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。本页把[产品旅程](../../../../../.meta_harness/design/product/agent-progression/design.md#关键用户旅程)落实为逻辑角色间的次序和交接。Agent 拥有 Loop 下一步、扩展调用、参数绑定和整批判断。外部协调者拥有自己的业务关联、输入受理与业务终态；Model、Tool 拥有原执行；Context 拥有输入投影与预算；HITL 拥有卡片和唯一答复；authorization 解释授权；assembly 拥有候选采用和结构交接。

共同规则由[主架构](../../../../../docs/domains/agent-progression/architecture.md)、[成员 SPEC](../../SPEC.md)及三个主题拥有。图中出现的节点 ID 指 [Loop 完整算法](../../../agent/docs/architecture/loop-algorithm.md)的节点，节点的定义、次序与转移只在该页维护。本页只展示消费顺序，不创建状态机或公开阶段枚举。

图表达逻辑请求、事实、控制、保管与业务接续，箭头文字区分用途。异步答复和原调用没有共同物理寿命。flowchart 仅为活动示意，不是严格 UML 或算法证明。所有新推进都以有效资格为前提；取消和既有终态先于新发起，迟到事实仍可按原责任保管。

本页的外部协调者箭头表达系统集成责任。Agent 通过 Journal 的具名交接取得回执，外部协调者经提交参加者参加同一次提交；Agent 不直接注入外部协调者的服务。runtime、execution 和执行挂接的寿命及外部映射归[对象模型](../object-model.md)。

<a id="f-ag01"></a>
## F-AG01 定义选入和装配结果

对应 [J-AG01](../../../../../.meta_harness/design/product/agent-progression/design.md#j-ag01)，行为归[定义专题](../public-api/definition.md)，验收场景见[持续验证场景](../../verification/scenarios.md)的 SC-AG-58、SC-AG-76、SC-AG-77、SC-AG-78 与 SC-AG-79。调用方或外部协调者提供具有合法来源的选择和声明，Agent 解释其专有含义，assembly 求值采用。采用解析端口是 Agent runtime 消费的注入端口 AgentAdoptions，由适配器实现。创建 execution 不由本图代办。

```mermaid
sequenceDiagram
    participant C as 调用方或外部协调者
    participant A as Agent 定义解释
    participant G as 资产治理
    participant P as assembly
    participant R as Agent runtime
    participant D as 采用解析端口
    C->>A: 请求校验定义类型、依赖和继承声明
    A->>G: 请求合法身份、来源、锁定和版本事实
    G-->>A: 事实及未能确定的原因
    A->>P: 交付专有声明、必需来路和候选约束
    P->>G: 请求在完整合法范围解析已选身份
    alt 非法来源、必需定义缺失或 Loop 入口不可建立
        P-->>C: 事实：候选失败及具体原因
    else 候选合法
        P-->>C: 事实：采用依据及当前不可用能力
        R->>D: 以精确采用解析定义、求值器和扩展声明
        D-->>R: 解析结果，由适配器核验，不取最新版本
    end
    Note over A,P: 定义检查不发模型或工具，不创建 execution
```

继承来源仅决定额外身份，已选身份的实现仍在完整合法范围解析。候选失败不能发布混合构成；恢复对账原候选，不以旧采用证明新条件成立。合法定义存在但执行不可用时保留已知身份，后续动作可取得逻辑不可用结果。精确校验与来源版本协议由 Agent 定义、assets 和 assembly 对齐，缺项见[协议细化拥有者](#protocol-gaps)。

<a id="f-ag02"></a>
## F-AG02 正常推进及全批拒绝

对应 [J-AG02](../../../../../.meta_harness/design/product/agent-progression/design.md#j-ag02)。下图从已经具备推进资格的 Agent 开始，只展示消费顺序。原等待优先于新输入；只有原位置允许时，Agent 才经 Journal 承接当时全部已受理的普通输入。图中标注的节点 ID 归 [Loop 完整算法](../../../agent/docs/architecture/loop-algorithm.md)，本图不定义节点。行为归 SPEC 的“[整批判断屏障与动作准入](../../SPEC.md#整批判断屏障与动作准入)”“[工具执行与结果承接](../../SPEC.md#工具执行与结果承接)”与“[消息准入](../../SPEC.md#消息准入)”。

```mermaid
flowchart TD
    Start[E1 核对取消、终态与原调用] --> Resume{E2 原位置有未完成责任}
    Resume -->|业务接续| Old[R0 回原模型、压缩、扩展或工具位置]
    Resume -->|允许新一轮| Take[I0 承接全部已受理的普通输入]
    Old --> Next[I8 按完整依据求值下一步]
    Take --> C[I1 请求 Context 组装与预算]
    C -->|不能装下| Fail[F1 形成失败候选并进入统一终态出口]
    C -->|可发送| Pre[P0、P1、M0 调模型之前位置、复核并记录最终请求]
    Pre --> M[M1 等原 Model 真实收场]
    M -->|完整回复| Entry[I3、I4 消息准入与完整参数解析]
    M -->|故障或中断事实| Reason[I3 沿原结果和控制依据处理]
    Entry -->|有动作| Judge[A0 各动作并行的执行动作之前链]
    Entry -->|无动作| Next
    Entry -->|拒收| Reject[I3 保留原结果、费用与否决投影，退避后新 step]
    Reject --> Next
    Judge -->|某条链等人| Cards[X4 呈现本轮卡片并等待答复]
    Cards -->|答复处理后又出卡| Cards
    Cards -->|全部链有最终结论且卡片都已处理或呈现失败| Barrier{A1 屏障}
    Cards -->|某轮呈现确定失败：该动作被拒| Barrier
    Judge -->|全部链有最终结论| Barrier
    Barrier -->|全拒| Denied[A3 保存拒绝原因，按原顺序为每个动作建立 denied 槽位]
    Barrier -->|有获准动作| Dispatch[A2 判断被拒的动作建立 denied 槽位，获准动作按原顺序交 Tool，Tool 再核]
    Denied --> Each
    Dispatch -->|结果、后台占位或受理时拒绝| Each[T0 至 T2 逐槽保管，结果与拒绝经过单结果范围]
    Each -->|T3：本批每个动作都已有槽位、都齐备且至少一个已发起| Batch[T4 整批经过]
    Each -->|T3：全部动作被拒绝| Handoff[T5 按原动作顺序交消息准入]
    Batch --> Handoff
    Handoff --> Next
    Reason --> Next
    Next -->|继续且位置允许| Take
    Next -->|等待| Wait[W0 保存等待，唤醒后经 E1 重核]
    Wait --> Start
    Next -->|终态候选| End[F1 至 F3 统一终态出口]
```

模型在真实收场之前的单次发出失败可以进入调模型之后的失败分支（M2），有效的重试结论交回原 Model。原调用尚未真实收场时，Agent 不交最终结果，不确认，不解析动作。流结束或完整块到达都不证明原调用已收场。最终失败和用户中断沿各自原因处理。

A2 之后，每个槽位消费前台结果或符合 Tool 声明的后台占位。后台是等待方式，不是第二次工具执行。后台占位不经过单结果范围 T2。逻辑不可用结果使用原动作，不假报物理启动。结果先按原动作身份保管（T1），再经过单结果范围（T2）；一个槽位的单结果经过与外发不等待其他槽位。被拒绝的动作也有槽位，并经过单结果范围。全部动作都被拒绝时，T3 绕过 T4，直接转 T5 交消息准入。解除生产责任按 [F-AG06](#f-ag06) 的两条合法路径判断。跨实例恢复时经 R0 回原节点，不一律回 I0。验收场景见[持续验证场景](../../verification/scenarios.md)的 SC-AG-43、SC-AG-50、SC-AG-53、SC-AG-56、SC-AG-57、SC-AG-114、SC-AG-115、SC-AG-120、SC-AG-122、SC-AG-125 与 SC-AG-130。

<a id="f-ag03"></a>
## F-AG03 整批判断、人工答复和后继出卡

对应 [J-AG03](../../../../../.meta_harness/design/product/agent-progression/design.md#j-ag03)。同一动作的链按声明顺序判断，不同动作的链并行。下图只展示消费顺序，以一批动作进入执行动作之前位置为起点。参与者中的卡片端口与动作准入端口是 Agent 定义的端口，形状见[公开接口页](../public-api/README.md#扩展人工卡片与材料)，行为归 SPEC 的“[整批判断屏障与动作准入](../../SPEC.md#整批判断屏障与动作准入)”。

```mermaid
sequenceDiagram
    participant A as Agent 批次协调
    participant E as 各动作的扩展调用
    participant Z as 动作准入端口
    participant H as 卡片端口
    participant U as 有答复资格的人
    participant T as Tool
    A->>E: 并行调用各动作的执行动作之前链，携带生效参数
    E->>Z: 链末尾的官方准入请求当前准入
    alt 准入不可用或明确拒绝
        Z-->>E: 事实：全拒或该动作拒绝，不以卡片代替准入
    else 需要人决定
        Z-->>E: need-decision 与卡片草稿，扩展调用进入已询问
        Note over A,E: 同批每条链到达最终结论或合法等待后才呈现本轮
        A->>H: present 本轮全部卡片
        H-->>U: 交付本轮卡片
        Note over A,H: 卡片已呈现，尚无答复也可释放推进资源
        U->>H: 答复原卡片，含明确拒答
        A->>H: read 各卡片的唯一有效答复
        H-->>A: chosen 或 declined
        A->>E: 以 replay 携带全部轮次的答复调用原精确采用
        E->>Z: 携带答复再次请求准入
        alt 原扩展或后继扩展再出卡
            E-->>A: 新一轮卡片，仍属原批
            Note over A,T: 屏障继续关闭，不发已获准部分
        else 本链到达最终结论
            E-->>A: 最终 Conclusion 与生效参数
        end
    end
    opt 全部链有最终结论、卡片都已处理，且有获准动作
        A->>A: 提交屏障打开的依据
        A->>T: 按原顺序交 Tool 发起获准动作
        T->>T: 发起前按原准入证据与当前权限再核
    end
```

出卡、答复交回和扩展接续是异步三段，不要求共同一次提交。卡片答完不等于整批已经处理完成。只有全部链到达最终结论、全部卡片处理完成，屏障（A1）才打开。屏障打开后的发起（A2）还受当前推进资格、环境与资源的约束。全拒时回 [F-AG02](#f-ag02) 的 A3，被拒绝的动作在 T2 经过单结果范围后由 T3 直接转 T5 交消息准入，不经过 T4。参数只在同链官方准入之前被改写，或经卡片的 `proposedRewrite` 改写，见 SPEC 同节第 7 条。

明确拒答返回没有答案，不授予动作，不重复原问题。当前参数、绑定或相关授权依据已变则不能复用旧批准；无关变更不机械重问。暂停、物理退出和查询失败不使卡片失效，原逻辑执行确定终局才失效。撤除扩展仍须保留原语义，具体接续见[精确采用接续](../../../agent/docs/architecture/mechanisms.md#扩展经过与精确采用接续)。作者可见的整批语义见扩展作者协议的[整批判断屏障与动作准入](../public-api/extensions.md#整批判断屏障与动作准入)，不可用、报错与系统兜底见其[不可用与报错](../public-api/extensions.md#不可用与报错)。验收场景见[持续验证场景](../../verification/scenarios.md)的 SC-AG-43、SC-AG-44、SC-AG-45、SC-AG-48、SC-AG-111 至 SC-AG-119、SC-AG-128 与 SC-AG-129。

<a id="f-ag04"></a>
## F-AG04 输入失败与按来源拒收

对应 [J-AG04](../../../../../.meta_harness/design/product/agent-progression/design.md#j-ag04)。Context 拥有预算与压缩，Agent 消费它的明确结论并形成自己的失败候选。扩展在压缩之前位置拒绝压缩时可以不压，但不能因此发送仍超限的请求。图中标注的节点 ID 归 [Loop 完整算法](../../../agent/docs/architecture/loop-algorithm.md)。行为归 SPEC 的“[请求准备与压缩](../../SPEC.md#请求准备与压缩)”“[无法装下](../../SPEC.md#无法装下)”与“[消息准入](../../SPEC.md#消息准入)”。

```mermaid
flowchart TD
    C[I1 请求 Context 形成合法输入] --> B{固定部分及允许处理后的输入可装下}
    B -->|是| M[P0、P1 调模型之前位置与复核]
    B -->|需要压缩且本准备尚未进入计划| P[C0 至 C4 一次有限压缩计划，再回 I1]
    P --> B
    B -->|否| F[F1 保留实际原因，形成失败候选]
    R[原节点收到候选消息] --> K{Q1 来源}
    K -->|外部输入拒收| X[U0 Agent 在受理之内拒收并交回调用方]
    K -->|完整模型回复拒收| N[I3 保存原结果与费用，否决投影加一]
    N --> W[I8 退避后新 step 的新调用，不冒充内部重试，不设次数上限]
    K -->|工具结果或拒绝消息拒收| G{H0 执行仍有推进资格}
    G -->|是| F
    G -->|否| O[O0 合法保管方只保管与对账，不改旧终态，不造新执行]
    F --> E[F2、F3 统一终态出口]
```

固定部分超限与处理后仍超限保留不同原因，不自动分叉、改模型、删除历史或循环压缩。同一次准备至多进入一个压缩计划。新模型调用前仍核当前资格，取消先成立则不得继续。Tool 原结果、效果和费用由原拥有者保管，拒收不重跑工具。必要保存未知时按原身份对账，不把图上的下一条箭头当作已经成功提交。验收场景见[持续验证场景](../../verification/scenarios.md)的 SC-AG-55、SC-AG-56、SC-AG-57、SC-AG-72、SC-AG-73、SC-AG-74、SC-AG-124 至 SC-AG-127、SC-AG-130、SC-AG-141 至 SC-AG-144。

<a id="f-ag05"></a>
## F-AG05 统一终态出口及控制范围

对应 [J-AG05](../../../../../.meta_harness/design/product/agent-progression/design.md#j-ag05)。Agent 提出本域完成意图，经 `tryFinish` 条件终结。有提交参加者的装配由该参加者在同一次提交中保护外部协调者的事实；独立调用没有提交参加者。图中标注的节点 ID 归 [Loop 完整算法](../../../agent/docs/architecture/loop-algorithm.md)。四种控制与六个阶段归 SPEC 的“[取消、退出与结构变更](../../SPEC.md#取消退出与结构变更)”，终结归“[条件终结](../../SPEC.md#条件终结)”。

```mermaid
sequenceDiagram
    participant U as 获准控制方
    participant H as 宿主
    participant A as Agent
    participant J as AgentJournal 提供者
    participant P as 提交参加者（有时）
    participant X as Model 或 Tool
    U->>A: control，带明确的控制种类与目标
    alt 中断单个调用
        A->>X: 请求中断具名原调用（M1 或 T0）
        X-->>A: 事实：确认、实际停止或未知
        Note over A,X: 执行继续，不取消其他调用，不撤销挂接
    else 取消执行
        A->>J: 记录受理与意图成立，E1 读到有效取消转 F0
        A->>X: 请求中断仍在前台的调用，保留未收尾责任
        A->>A: F1 固定 cancelled 候选
    else 暂停执行
        A->>J: E1 读到有效暂停，E9 以 detach 保存接续并撤销挂接，执行进入 suspended
        Note over A,J: 暂停不经过 F1 至 F3，执行不终结
    end
    opt F1 已固定完成、失败或取消候选
        A->>A: F2 落终态之前位置：完成须无应承接输入与阻塞等待且模式允许
        alt 候选须继续或等待且仍有有效资格
            A->>A: 回 I8 或 W0
        else 适用终态候选成立
            A->>J: F3 tryFinish，附输入水位线、责任与终态前依据
            J->>P: 有提交参加者时在同一次提交中核对参加者的事实
            P-->>J: 参加、失败、冲突或不支持
            J-->>A: ended、changed 或 blocked
            Note over A,X: F4、O0 终态后只观察与保管，不恢复业务
        end
    end
    Note over H,A: 停用是另一个入口，不经 control
    H->>A: quiesce，作用于一个 runtime，不属于单个执行
    A->>A: E0 拒绝新的 invoke 与 resume
    A->>J: 在途执行经 E1 的暂停路径到 E9 以 detach 交接
    A-->>H: 交清并撤登记后返回 drained，交接未知时返回 unresolved
```

落终态之前位置由 Agent 在提交前协调（F2）。完成候选可被要求继续、等待或否决；失败与取消按其适用检查和依据收束，扩展不能借否决恢复已撤销的推进资格。没有活体 runtime 时，已保存的取消意图由下一次合法挂接从 E0 开始收束；外部协调者自己的业务取消与终态由它自己记录。

取消作用于该执行仍在前台的模型与工具调用，不自动停止已确认转后台的工具、同一 runtime 的其他执行或无关调用。真实停止和逻辑取消分别记录。输入与终结的竞争见[消费与系统定位](../context.md#输入与终结的竞争)。验收场景见[持续验证场景](../../verification/scenarios.md)的 SC-AG-20 至 SC-AG-27、SC-AG-60 至 SC-AG-66、SC-AG-140、SC-AG-147 至 SC-AG-152。

<a id="f-ag06"></a>
## F-AG06 接手原工作及可靠交付两条路径

对应 [J-AG06](../../../../../.meta_harness/design/product/agent-progression/design.md#j-ag06)。宿主发现待恢复的 execution 后，外部协调者判定业务是否继续。新推进者以 resume 取得新的执行挂接与当前资格，先对账原调用和消费责任，再回原节点。协调者判定业务不再继续，或当前资格已撤时，不继续业务推进，但获准的保管者仍可保存真实结果。独立调用方不制造任何外部协调者的对象。节点 ID 归 [Loop 完整算法](../../../agent/docs/architecture/loop-algorithm.md#节点表)。

```mermaid
sequenceDiagram
    participant S as 外部协调者或独立调用方
    participant H as 宿主
    participant A as 新挂接下的 Agent runtime
    participant J as AgentJournal
    participant X as 原 Model 或 Tool
    participant D as 消费侧可靠事实（材料拥有者）
    H->>S: 发现待恢复的 execution，询问业务是否继续
    alt 业务是否继续未知
        S-->>H: 未知
        H->>H: 保留候选并退避，不调用 resume，不创建 execution
    else 业务取消
        S->>H: control cancel，经宿主恢复入口受理，由下一次合法挂接收束
    else 业务继续
        S-->>H: 继续
        S->>A: resume，带恢复依据与推进资格依据（E0）
        A->>J: attach，恢复或接管由提供者按当前状态选择
        A->>A: 核验当前资格并读取控制与挂接状态（E1），有效取消转 F0
        A->>J: load 同修订快照，query 未定操作（E2）
        A->>X: 按原调用身份查询原执行或原交付
        alt 查询暂不可用
            X-->>A: 未知
            A->>A: 保存等待依据与检查时刻（W0），不重发
        else 原执行仍在途
            X-->>A: 仍在执行
            A->>A: 回原等待节点 M1 或 T0，可交还资源，不重发
        else 原执行已真实收场
            X-->>A: 原结果与收场依据
            alt 先保管后处理
                A->>D: 保存内容或有效引用、原身份、原消费位置与后续责任
                D-->>A: 耐久确认
                A->>J: custody 交接
            else 先处理后保存完成依据
                A->>A: 完成必要处理
                A->>J: processed 交接，保存完成依据
            end
            A->>X: 解除交付责任，Model 走合法确认，Tool 走自身规则（M3 或 T1）
            Note over A,D: 后续从消费侧依据接续，不要求重领全文
        else 生产侧责任已解除
            A->>D: 读取保管内容或完成依据
            D-->>A: 原位置与剩余责任
        end
        A->>A: E4 回原节点
    end
```

任一路径都须能在停机后判明谁负责，不能让双方都丢弃责任。先处理后保存完成依据不强制再保存一份可重领全文；尚未处理完且依赖后续消费则须可靠保管必要内容。Model 的交付责任解除（ACK）只针对真实收场且有当前合法消费者的调用。观察、开始处理或单次发出失败都不能提前解除。解除生效、清理和费用结算分别可见；工具全文不套用模型清理规则。两条路径的条件见 SPEC 的[持久性与交付责任](../../SPEC.md#持久性与交付责任)。

若生产方确认自身失联，按 Model 或 Tool 自己的恢复结论回原位置。Agent 退出或查询失败不证明失联，工具未知效果不自动重放。对账与提交未知沿 Journal 契约，每个切点的处置见[机制页的恢复切点表](../../../agent/docs/architecture/mechanisms.md#恢复切点表)。外部协调者一侧的资格与交接提供者的共同边界归该协调者，Agent 所需的保证与在途展示内容的耐久缺项登记在[外域依赖](../../../agent/docs/architecture/open-questions.md#外域依赖)。验证见 [SPEC 旅程验证入口](../../SPEC.md#旅程验证入口)与[持续验证场景](../../verification/scenarios.md#流式失败崩溃与控制竞争后接续)。

<a id="f-ag07"></a>
## F-AG07 定义换代与在途语义交接

对应 [J-AG07](../../../../../.meta_harness/design/product/agent-progression/design.md#j-ag07)。定义身份固定，版本采用可变。普通恢复保持原采用，新的 execution 采用当时的合法胜出者。显式 reload 的逻辑次序如下，验收场景见[持续验证场景](../../verification/scenarios.md)的 SC-AG-78。

```mermaid
sequenceDiagram
    participant U as 获准变更方
    participant P as assembly
    participant S as 外部协调者
    participant O as 原 Agent
    participant N as 新 Agent
    participant X as 原调用与原扩展责任
    U->>P: 请求同标识候选校验
    alt 候选无效
        P-->>U: 原因，原采用只在仍合法时保留
    else 候选有效且当前仍允许交接
        P->>N: 准备并验证新实例，handover 核整个快照与原 continuation
        P->>S: 请求采用交接
        S->>O: 有效暂停，保存接续并 detach（E9）
        O-->>S: 交接依据，runtime 回 idle
        S->>N: resume，恢复依据含 handover 证明，带推进资格依据（E0）
        N->>N: attach 核原修订仍适用并保存转换后的接续，版本变化返回 changed
        N->>X: 对账原调用、判断与卡片（E2）
        X-->>N: 已得结论、等待或未知
        N->>N: E4 回原位置，未发动作核当前条件
    end
    Note over S,N: 取消先成立阻止新推进，旧候选不覆盖更新的选择。旧 runtime 失联时直接接管，需要 takeover 资格
```

模型选择、模式、权限、Context 或稳定入口内部数据变化不自动换定义或执行挂接，已发请求保持原固定内容。旧模型建议与当前工具约定不兼容时，Agent 返回具体原因供新的决定使用，不暗换实现或参数。已得扩展结论不重跑，不同语义新判断不冒用旧结论。Agent 的活动扩展调用按原精确采用接续，缺原实现时保留等待和责任；assembly 仍裁定合法可用性。换代与取消的竞争见[机制页](../../../agent/docs/architecture/mechanisms.md#控制与故障交接)。外部协调者一侧的候选采用、推进映射与换代提交归该协调者自己的文档，Agent 所需的保证见[外域依赖](../../../agent/docs/architecture/open-questions.md#外域依赖)。验证见[定义专题](../public-api/definition.md#旅程与持续验证)与[扩展专题](../public-api/extensions.md#旅程与持续验证)。

<a id="f-ag08"></a>
## F-AG08 长期读取、守卫及因果解释

对应 [J-AG08](../../../../../.meta_harness/design/product/agent-progression/design.md#j-ag08)。守卫只读原事实与可重建投影，压缩后的模型输入不成为计数权威。

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

上述阶梯是既有行为含义，不规定算法、阈值或必经每一级。取消仍先撤新推进，恢复继续使用原事实范围，不以重启或压缩清零。投影落后或查询未知须可识别，不能以缓存为空证明没有工作。诊断不默认复制正文、附件或秘密；账目由原执行拥有者记账，Agent 保持原用途关联，遥测采样不是费用全量依据。主回复准入历史与投影协议沿[机制](../../../agent/docs/architecture/mechanisms.md#事实投影与长期读取)，实际性能尺度和策略配置采用仍须各拥有者验证，验证见[Loop 旅程验证](loop.md#旅程与持续验证)。

<a id="protocol-gaps"></a>
## 协议细化拥有者

以下缺项限定实现与验证接受，不阻止表达以上已明业务路径。公开操作、Schema、提供者和锁未在图中选定。

| 流程中的待细化点 | 责任及原问题 | 必须保留的可观察后果 |
| --- | --- | --- |
| F-AG01、F-AG07 的定义校验、版本读取与候选采用接口 | Agent 定义与 assembly，见[定义规格末段](../public-api/definition.md#交接结果与验证义务) | 非法候选不采用，标识固定，合法旧采用与失效旧条件可区分 |
| F-AG02、F-AG04、F-AG08 的 step、连续回复否决与策略边界 | Agent Loop，[AGENT-M01](../../../../../.meta_harness/design/product/agent-progression/design.md#agent-m01) | 新调用不冒充内部重试，更换执行挂接或推进实例不清零 |
| F-AG03、F-AG07 的稳定经过、非确定输入、卡片接续及撤除 | Agent 扩展与 assembly，HITL 和 authorization 提供原决定，[AGENT-M02](../../../../../.meta_harness/design/product/agent-progression/design.md#agent-m02) | 三段异步责任可认回，旧结论不重跑，后继卡片不越过批屏障 |
| F-AG02、F-AG05、F-AG06 的围栏、认领、跨域有效边界、控制传播与交付责任解除的对账 | Agent 推进协调、外部协调者、原执行及保管拥有者，[AGENT-M03](../../../../../.meta_harness/design/product/agent-progression/design.md#agent-m03) | 旧资格不推进，原事实可迟到保存，确认未知不重做副作用 |
| F-AG04 的后台、原工作已终结后的结果拒收后果 | 原消费拥有者与 Agent 的消息准入，见 SPEC 的[消息准入](../../SPEC.md#消息准入) | 不造新执行，不改终态，不为取消的业务重授入队资格 |
| F-AG06 的在途展示内容跨生产 runtime 失联耐久 | Model 流式与消费存储拥有者，[AGENT-N01](../../../../../.meta_harness/design/product/agent-progression/design.md#agent-n01) | 不从收场后的交付责任解除推断逐片耐久，不宣布允许丢失 |
| F-AG08 的长期读取尺度、策略配置资格和生效协议 | Agent Loop 策略、事实与查询拥有者，[AGENT-M01](../../../../../.meta_harness/design/product/agent-progression/design.md#agent-m01)、[AGENT-M03](../../../../../.meta_harness/design/product/agent-progression/design.md#agent-m03) | 缓存进度可查且可重建，守卫及账目不因优化丢失 |

本页只有逻辑流程和持续验证入口。没有运行真实装配、故障或性能实验，没有据 Mermaid 图授予行为正确性。
