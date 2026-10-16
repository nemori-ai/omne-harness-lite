# Tool 关键业务与数据流

本页图示提交与协作边界。业务旅程见[旅程章节](#工具执行的关键协作流程)，精确守卫与失败语义归 [protocols](../SPEC.md#tool-操作协议)，类型归 [public-api](public-api.md)。箭头不表示跨拥有者原子事务。

## 结果内容与附件分流

```mermaid
sequenceDiagram
  participant T as Tool 作者及结果保管
  participant A as Agent 消费者
  participant S as Session 与 Request Context
  participant M as Model adapter
  participant R as 受控内容读取
  participant P as 模型提供者
  T-->>A: 已保管 ToolResult
  A->>A: 纯投影 content 与 attachments
  Note over A,S: attachments 只生成地址文本，content ref 独立成立
  A->>S: 文本、内容 ref、原结果关联
  S->>M: 固定请求及中立工具声明
  M->>M: 映射供应商 payload 形状
  alt 请求含模型可见内容 ref
    M->>R: 实际发送前核权读取精确内容
    R-->>M: 有界媒体租约或明确失败
    M->>M: 校验摘要、长度、格式及实际预算
  else 只有文本和附件地址
    Note over M,R: 不读取附件，不扫描地址文本
  end
  M->>P: 合法最终请求
  Note over A,P: 后续是否读取附件，由 agent 另发合法调用
```

读取或转换失败时不进入图中的发送步骤，原结果继续保管。原身份、当前授权和取消检查沿 [P14](../SPEC.md#p14-附件引用与模型交付)及 [Model 规范](../../../model/model/SPEC.md)，图不表示实际实现已经完成。

## 作者调用 emit 和 wait

下面是作者使用方式的伪代码。emit 的回执可稍后等待，wait 的结果必须等到有效回应后才能使用。实际返回值含明确失败分支，不能把取消当成回答。公开签名见 [作者上下文](public-api.md#作者执行上下文)，完整约束见 [P11](../SPEC.md#p11-作者输出与等待原语)。

```text
执行工具(参数, 依赖, 本次执行):
    输出回执 = 本次执行.emit(追加文本("日志", "正在检查目标", 不封块))
    检查结果 = 等待 依赖.检查服务.检查(参数)
    核对成功(等待 输出回执)

    决定 = 核对成功(等待 本次执行.wait({
        kind: "ask", key: "确认发布",
        contract: 依赖.已采用确认协议,
        request: 按该协议编码的确认请求(检查结果)
    }))
    如果 决定是拒绝或没有回答:
        返回 "未发布"
    依赖.授权解释者.核对明确允许(决定)

    任务 = 等待 依赖.发布服务.按原操作身份提交(参数)
    回应 = 核对成功(等待 本次执行.wait({
        kind: "resource", key: "发布完成",
        contract: 依赖.已采用发布回应协议,
        request: 按该协议编码的任务关联(任务), deadline: null
    }))
    如果 回应是协议确认的到期:
        返回 "未取得完成回应"

    核对成功(等待 本次执行.emit(追加文本("日志", "发布已返回结果", 封块)))
    返回 依赖.发布回应协议.解码(回应.value)
```

“核对成功”必须区分容量拒绝、未知、取消及其他失败。例中外部任务提交的幂等与效果归发布服务，wait 只登记并等待原任务回应，不重新提交任务。真实工具按采用的协议解析回答，不根据自然语言猜授权。

```mermaid
sequenceDiagram
    participant A as 工具作者协程
    participant S as 本次执行Scope
    participant T as Tool事实保管
    participant U as 人工或资源协议
    A->>S: emit 更新
    S-->>A: 返回未完成的Promise
    S->>T: process 原事件与顺序
    T-->>S: 已保存回执
    S-->>A: emit确认 不等UI
    A->>S: await wait 原key与请求
    S->>T: 输出屏障后保存wait
    T->>U: ensure原卡片或关联
    U-->>T: 原有效回应
    T->>S: answer原ResponseRecord
    S->>S: 核取消顺序 固定消费与continued事实
    S-->>A: 放行同一个等待点
    S->>T: continued与源计时
    A->>S: 作者返回 包装器finish
    S->>T: 原结果保管及输出屏障后的final
```

事实保管、外部回应和控制由独立宿主驱动，不能等待作者返回才开始读事实。取消时 wait 以 cancelled 结束；UI 断线只断观察。已有输出保存未知时，wait 不提前出卡，正常 final 不越过屏障；取消仍可以受理。live-only 执行源丢失后，不从图中的等待箭头推断调用栈可恢复。

## 自定义等待协议与无效提交

工具作者先定义请求和响应形状，再把协议列入 ToolAuthor.waits。下面的“定义形状”表示由 schema-provider 支持的静态 schema，实际 TypeScript 入口见 [public-api](public-api.md#作者执行上下文)。等待期间采用固定版本，不跟随作者修改后的最新版。

```text
发布确认 = 定义等待协议(
    kind = ask,
    adoption = 发布确认的精确版本,
    request = 定义形状({目标环境: 枚举[测试, 生产], 摘要: 文本}, 大小上限),
    response = 定义形状({选择: 枚举[允许, 拒绝], 说明: 可选文本}, 大小上限),
    expiry = forbidden
)

决定 = 等待 本次执行.wait(
    kind = ask, key = 本次确认键,
    contract = 发布确认,
    request = 严格JSON编码({目标环境: 生产, 摘要: 本次变更})
)
```

```mermaid
sequenceDiagram
    participant A as 等待中的工具
    participant U as 响应提交者
    participant H as HITL或资源接收者
    participant V as 原协议验证器
    participant T as Tool
    U->>H: 原wait 新submission 候选响应
    H->>V: 受信身份 原请求 原schema 候选
    alt 非法载荷或业务条件不符
        V-->>H: invalid或denied
        H-->>U: 本次提交的问题
        Note over A,T: 原等待继续 不消费有效决定
    else 校验通过
        V-->>H: valid及适用资格依据
        H->>H: 重核等待和资格 提交有效回应
        H-->>U: 原提交确认
        H->>T: 原有效回应及证据
        T->>A: 按P06答复与接续
    end
```

原 submission 重试认回结果；修正内容使用新 submission，wait 不变。校验服务不可用不是用户填错，已失效等待不能因为后来有合法回应而重新开放。HTTP 是其中一种提交适配，不要求工具保持一条请求连接。

## 多命令函数与独立返回

下面是组合方式的伪代码，省略错误分支的展示，但每次构造都必须检查 Outcome。三个函数各自提供参数 codec、原值 codec、返回验证器及需要的程序编码。普通函数不必自己制造 ToolResult。精确签名归 [作者注册入口](public-api.md#定义作者适配与独立消费)。

```text
readFile(参数: {path}, 环境, 执行上下文):
    返回 {text: 读取内容, encoding: "utf-8"}

listFiles(参数: {directory}, 环境, 执行上下文):
    返回 {entries: [{name: "a.txt", kind: "file"}]}

writeFile(参数: {path, text}, 环境, 执行上下文):
    执行合法写入
    返回 ToolResult(
        content = [写入完成说明],
        data = 已声明写入回执({bytesWritten: 实际字节数}),
        original = none, attachments = []
    )

读取操作 = 核对成功(defineToolOperation(
    parameters = 已声明读取参数,
    returns = ordinary + 读取数据schema,
    author = 读取作者(readFile, 读取返回检查, 读取渲染, 读取程序编码)
))
列表操作 = 核对成功(defineToolOperation(
    parameters = 已声明列表参数,
    returns = ordinary + 目录数据schema,
    author = 列表作者(listFiles, 列表返回检查, 列表渲染, 列表程序编码)
))
写入操作 = 核对成功(defineToolOperation(
    parameters = 已声明写入参数,
    returns = structured + 写入回执schema,
    author = 写入作者(writeFile, 写入结果检查)
))

文件工具 = 核对成功(defineCommandTool(
    metadata = 文件工具的身份与许可,
    commands = {
        read: {summary: "读取文件", operation: 读取操作},
        list: {summary: "列出文件", operation: 列表操作},
        write: {summary: "写入文件", operation: 写入操作}
    }
))
```

注册生成三个命令的参数及 returns 投影，绑定提供者在装载阶段核实际 schema 和作者。调用 read 时，ToolBindings 选择读取操作；后续返回只能按读取契约检查。若 readFile 返回 `{bytesWritten: 10}`，即使写入 schema 接受它，读取调用仍失败。定义更新不改变原调用采用的 schema。

若只提供读取函数，可将同一个读取操作交给 defineFunctionTool，不必另建一种返回机制。同一个多命令工具的 FIFO、并发和 programmable 规则仍按原工具身份执行。Code 只经 ProgramTools 发起具名命令，示例中的注册对象不交给脚本。

## 两种返回在 settle 汇合

```text
普通作者执行(参数, 依赖, 本次执行):
    返回 {匹配数: 3, 文件名: ["a.ts", "b.ts", "c.ts"]}

普通作者绑定:
    output = 检查普通返回形状及匹配数与文件列表长度一致
    renderer = 生成给人和模型的完整文本
    program = 按已声明schema编码同一返回值

结构化作者执行(参数, 依赖, 本次执行):
    返回 ToolResult(
        content = 作者组织的展示内容,
        data = 按已声明协议组织的程序数据或显式none,
        original = 无卸载原文或合法卸载引用,
        attachments = 合法附件
    )
```

```mermaid
flowchart TD
    R[真实返回 unknown] --> Raw[原值保管]
    Raw --> Check[固定返回验证器]
    Check --> Mode{装载时固定的作者模式}
    Mode -->|ordinary| Render[文本投影与显式程序编码]
    Mode -->|structured| Envelope[直接验证ToolResult]
    Render --> Data[程序schema与整结果政策]
    Envelope --> Data
    Data --> Gate[输出屏障与结果保管]
    Gate --> Settle[保存唯一结果版本]
    Settle --> Message[Agent按可见性投影消息]
    Settle --> Program[Code按声明消费data]
    Check -->|不合法| Failed[result失败 保留原件及实际效果]
    Data -->|不合法| Failed
```

Code 若通过语言 SDK 把“搜索文件”绑定成普通函数，成功路径得到的是已核验程序值。它不是调用原 executor，也不是解析 content 文本。SDK 先处理真实 terminal、固定输出契约和可靠交接；明确失败、输出不合法或版本不匹配不能伪装为返回空数组。具体 SDK 语法与错误映射归 Code 提供者。

## 准入、准备与启动

```mermaid
sequenceDiagram
    participant C as 消费者
    participant T as ToolCommands
    participant H as 独立宿主协程
    participant E as 环境拥有者
    participant A as 共同启动围栏
    participant X as 固定执行绑定
    C->>T: admit原身份和固定请求
    T->>T: 状态 回执 待办同提交
    T-->>C: 已受理
    H->>T: loadRecovery及认领协调权
    H->>T: planPreparation
    H->>E: prepare原操作
    alt 回执未知
        H->>E: inspectPreparation原操作
        Note over H,E: 不重新分配
    end
    E-->>H: 原资源及耐久证据
    H->>T: prepared及enqueue
    H->>T: prepareStart
    T->>T: 同queue裁定FIFO 名额及启动记录
    H->>A: prepare当前守卫
    A-->>H: 非永久permit
    H->>X: start原记录和permit
    X->>A: consume原待发胶囊
    alt 失效先成立
        A-->>X: 拒绝及延迟发出排除
        H->>T: recordStart拒绝 保存收场任务
    else 受理先成立
        A-->>X: 唯一启动受理
        X-->>H: 原执行句柄或unknown
        H->>T: recordStart原事实
    end
```

## 等待、答复与取消

```mermaid
sequenceDiagram
    participant X as 原执行
    participant T as Tool事实
    participant H as HITL
    participant W as 独立宿主
    X->>T: openWait意图
    T->>T: 暂停计时和出卡任务同提交
    W->>H: ensure原wait
    H-->>W: 原卡
    W->>T: attachCard
    H-->>W: 原卡有效决定
    W->>T: acceptDecision
    alt 取消已先提交
        T-->>W: 原等待不再适用
        W->>H: invalidate原卡
    else 答复先提交
        T->>T: 保存ResponseRecord与任务
        W->>X: answer原记录
        alt 回执丢失
            W->>X: inspectAnswer同记录
        end
        X-->>W: continued原接续位置
        W->>T: 关闭等待并开启新计时段
    end
```

## 原输出与双路径交付

```mermaid
sequenceDiagram
    participant X as 执行者
    participant S as 原件保管
    participant T as Tool事实
    participant C as 原消费者
    X->>S: 固定codec编码原输出
    S-->>X: 耐久raw引用
    X->>X: renderer及整结果policy
    X->>S: 保管正式结果及附件
    X->>T: preserveResult原版本
    T->>T: 结果和delivery同提交
    T-->>C: 原版本及原位置
    alt retained
        C->>C: 保存引用 内容及后续责任
    else processed
        C->>C: 在Tool保管下完成处理 保存完成事实
    end
    C->>T: releaseDelivery原关系及证据
    T-->>C: Tool生产侧回执
    Note over S,T: 解除交付关系不删除全文
```

## 接手协调与物理执行分开

```mermaid
sequenceDiagram
    participant N as 后继协调者
    participant T as 持久事实与任务
    participant R as 固定binding恢复面
    participant D as 实例目录
    N->>T: claim当前协调代次
    N->>T: loadRecovery
    N->>R: inspectStart原记录
    alt live
        R-->>N: 原事实流和控制面
        N->>D: 在独立实例fiber发布句柄
    else unknown
        R-->>N: 保持未知
        N->>T: 保留查询 控制及保管任务
    else settled
        R-->>N: 原结果及来源
        N->>T: 保存原结果或晚到版本
    else 可靠确认连续性丢失
        R-->>N: 排除依据
        N->>T: settleLost 不重跑
    end
    Note over N,D: 无目录路由不等于调用不存在
```

Code 子调用见本页[父子调用时序](#code-子调用时序)。Cordis 换代次序见 [cordis](cordis.md#阶段装配与换代)。

## Code 子调用时序

前提：采用受信 Code 宿主、原子调用身份和可靠结果保管。未知受理保留原身份；图中的保管确认不能由程序 Promise 替代。完整行为归 [C01](../SPEC.md#c01-子调用登记与发起)和 [C02](../SPEC.md#c02-返回等待与计时)。

```mermaid
sequenceDiagram
    participant P as 程序
    participant H as Code受信宿主
    participant L as ToolChildren
    participant T as 子ToolRuntime
    P->>H: 请求工具和参数
    H->>L: reserve原位置和子身份
    L-->>H: 耐久预留
    H->>T: admit原子身份和来源
    alt 受理回执未知
        H->>T: lookup原admission
        Note over H,L: 不换child身份 预留责任继续
    else 已受理
        H->>L: admitted原结果
    end
    T-->>H: 正式结果版本
    H->>H: 保管结果引用和父位置
    H->>T: releaseDelivery retained
    T-->>H: 生产侧回执
    H->>L: retain原子结果和回执
    H-->>P: 允许读取的正式结果
```

## 工具执行的关键协作流程

流程承接[产品旅程](../../../../.meta_harness/design/product/tool-execution/design.md#关键用户旅程)和[领域协作](../../../../docs/domains/tool-execution/architecture.md)。图表示逻辑角色、守卫及稳定关联，不代替公开 API、Schema、存储事务或提供者协议。异步请求、控制、结果事实和内容保管各有含义，不表示共同物理寿命。

### 责任、机制源与阅读边界

Tool 拥有逻辑调用、真实执行、内部等待、原结果、效果、账目和交付责任。发起协调者可以是 Agent 或独立消费者，独立消费无需 Session。Session 拥有已有关联的逻辑工作及取消资格，不能替 Tool 写物理停止；HITL 拥有卡片和有效决定，身份与授权解释动作许可。装配、资产、设置、环境、内容保管和原消费者分别提供其事实。一次包装工具执行成功不表示被调用领域业务已完成。

工具专有行为及操作协议的唯一源为 [SPEC](../SPEC.md)，本节组织其协作。共同约束归[工具运行架构](../../../../docs/architecture/runtime/tool-runtime.md)、[流与消费](../../../../docs/architecture/runtime/streaming-and-consumption.md)、[控制与恢复](../../../../docs/architecture/runtime/control-and-recovery.md)和[身份与授权](../../../../docs/architecture/security/identity-and-authorization.md)。dummy 的归类见产品[定义、已知能力与一次执行](../../../../.meta_harness/design/product/tool-execution/design.md#定义已知能力与一次执行)。

| 产品旅程 | 流程 | Tool 的交接与成员依据 |
| --- | --- | --- |
| [TL-J01](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j01) | [TL-F01](#tl-f01) | 合法定义、当前可用或已知不可用，见[定义专题](../SPEC.md#已知与可用的动态关系)。 |
| [TL-J02](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j02) | [TL-F02](#tl-f02) | 完整输入、真实发起或 dummy 结果，见[发起前提](../SPEC.md#发起的完整前提)。 |
| [TL-J03](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j03) | [TL-F03](#tl-f03) | 单向等待转换与最终结果，见[等待关系](../SPEC.md#前后台的关系边界)。 |
| [TL-J04](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j04) | [TL-F04](#tl-f04) | 内部等待与原决定接续，见[答复行为](../SPEC.md#内部等待与有效答复)。 |
| [TL-J05](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j05) | [TL-F05](#tl-f05) | 过程观察、原结果保管及采用，见[结果专题](../SPEC.md#先可靠承接再处理结果)。 |
| [TL-J06](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j06) | [TL-F06](#tl-f06) | 卸载全文、分页及真实费用，见[全文读取](../SPEC.md#卸载与全文读取)。 |
| [TL-J07](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j07) | [TL-F07](#tl-f07) | 控制与接续原调用，见[控制恢复专题](../SPEC.md#接续原调用与确认自身失联)。 |

<a id="tl-f01"></a>
### TL-F01 定义及动态可用性

作者按两种定义形态给完整说明和真实声明。常驻标记归装配引用，不归工具作者预算；多命令模型呈现始终紧凑，不熟命令先取得用法。已知与可用分别求值，合法新定义仅供后续采用。Agent 创作的授权、工作区或租户提交、用户提升、显式合法装载均按其拥有者承接，不默认组织写权或同标识覆盖。

```mermaid
flowchart TD
    D[作者完整定义及真实依赖声明] --> G[共同治理和合法装载]
    G --> K{曾合法取得此工具}
    K -->|否且无合法定义| Hide[不呈现 不猜造定义]
    K -->|已取得或本次合法取得| S[按同标识合法候选求值]
    S --> A{治理及必需依赖成立}
    A -->|否| U[保留最近合法身份形状 说明不可用]
    A -->|是| M{实际消费者模态及取回能力成立}
    M -->|否| U
    M -->|是| P[常驻呈现或发现用法 当前可用]
    Change[装配 attempt开始 必需提供者变化] --> S
    P --> Call[后续动作另行准入]
    U --> Dummy[后续调用取得不可用逻辑结果]
```

撤权不允许读取未授权新内容；同标识有合法候选时先选择，不直接走不可用。模型路径参数模态检查模型输出、结果模态检查模型输入或合法转换，独立消费按自身消费者判断。必需合法定义从未取得或 runtime 必需依赖不能建立，是装配缺口，不能用 dummy 凑齐。

拒绝和恢复是定义可达性的变化，不等于已发执行中断。Tool 不替资产或装配制定创作冲突协议。缺项：TOOL-M01；验例：完整定义、help 一致、撤权后的已知与未知、合法候选替换、提供者恢复及两端模态。

<a id="tl-f02"></a>
### TL-F02 发起与普通或不可用逻辑结果

参与者 C 是真实发起协调者，可能是无 Session 的程序。下图的前置拒绝和参数失败不表示真实执行启动，dummy 也没有原工具物理执行。调用身份不能只用 Session、Run、step 代替同一步内不同动作。

```mermaid
sequenceDiagram
    participant C as Agent或独立发起协调者
    participant A as 装配及合法定义
    participant I as 身份授权及决定解释
    participant E as 环境与资源
    participant T as Tool调用拥有者
    participant O as 原消费者
    C->>A: 请求当前合法工具及采用依据
    A-->>C: 可用或已知不可用 身份及原因
    alt 已知不可用
        C->>T: 原逻辑调用及原消费位置
        T-->>O: dummy正常不可用结果 不运行原工具
    else 可用
        alt 参数尚未收齐
            Note over C,T: 不解析 不发起
        else 完整参数解析失败
            C-->>O: 具体参数失败 原工具不执行
        else 完整生效参数可用
            C->>I: 原主体操作范围参数及可信调用方式 当前准入请求
            I-->>C: 允许或拒绝 决定依据及目标工具方式许可
            alt 拒绝或整批决定未齐
                Note over C,T: 不启动 询问分支由HITL和准入协调承接
            else 准入通过
                C->>E: 请求满足声明的合法环境资源
                E-->>C: 准备成立或具体失败
                alt 环境失败或隔离未知
                    C-->>O: 不执行 说明原因 不降级宿主
                else 环境成立
                    C->>T: 进入适用并发队列 保留原用途
                    Note over C,T: 超额按发起次序等待 不当执行失败
                    C->>I: 实际发起前复核资格 调用方式许可 参数 定义实现匹配
                    I-->>C: 当前复核事实
                    alt 资格或匹配失效
                        Note over C,T: 不盲发 不暗改参数 沿原动作回调用方
                    else 复核成立
                        C->>T: 请求固定采用的原执行
                        Note over T,E: 原身份 输入 环境及资源固定 后续reload不换原调用
                        T-->>O: 真实完成失败或中断 原结果及效果
                    end
                end
            end
        end
    end
    Note over T,O: 原结果先可靠保管 再按TL-F05交接
```

人工批准绑定所见动作或明确整批，当前权限可在排队期间收窄；无关 reload 不机械重问，有效依据变动不能借旧批准。Skill 读取与脚本执行分开、MCP 认证与动作调用分开。原函数直接消费与运行时治理分层，独立程序按真实依赖使用，不能访问托管资源时漏身份检查。

发起、围栏、控制与未知对账的协议见 [protocols](../SPEC.md#tool-操作协议)。图中的请求和复核并不证明已有跨域原子提交，未知不直接重发有外部效果的动作。持续验证包括排队撤权、整批等待撤权、环境失败、半截参数和 dummy 无原执行用量。

脚本可调用集合与直接调用集合分别呈现。TL-F01 的发现阶段读取声明，TL-F02 的准入及启动阶段核对可信来源和目标许可，完整规则见[可编程调用](../SPEC.md#可编程调用的定义与准入)。通用调用入口和包装工具继续传递脚本来源，不借中转避开目标检查。

<a id="tl-f03"></a>
### TL-F03 单向转换等待关系

本图仅描述调用方关系，不是第二份真实执行状态机。真实执行可运行、内部等待或收场；同一原执行固定身份和外部效果。后台许可是工具作者声明，设置资格与上界归共同规则。

```mermaid
stateDiagram-v2
    [*] --> Foreground: 合法发起并建立前台关系
    [*] --> Background: 入口支持且工具许可发起即后台 原位置占位
    Foreground --> Foreground: 内部等待 Ask不计前台运行时长
    Foreground --> Background: 工具许可且阈值 用户操作或插队成立 原位置占位
    Foreground --> StopRequested: 前台实际运行达上限且不许可后台
    Foreground --> Delivered: 真实收场后原结果可靠交付
    StopRequested --> Delivered: 跟踪真实收场及中断原因
    Background --> Delivered: 完成失败或中断后原位置交最终结果
    Delivered --> [*]
    note right of Background
        仍是同一原执行
        不释放仍运行的并发名额
        不返回前台 不再次转换
        不开放需答复等待
    end note
```

| 守卫或异常 | 可观察后果与边界 |
| --- | --- |
| 未声明后台许可 | 阈值、手动、插队和前台上限都不能绕过，不能建立后台关系。 |
| 前台上限 | 只累计前台实际运行，内部等待不计，转后台后不继续计；无定义或合法配值不加限制。 |
| 并发满 | 同 Session 同工具前后台及内部等待共同计数，超额顺序排队；独立范围由其契约明确。 |
| 停止请求已受理 | 不证明物理已停，后续真实结果沿原身份保存；前台超时不自动重试。 |
| 后台结果到达 | 占位和最终结果相关联，后台不是新调用，不改原 Run 终态。Tool 不自行建 Run；会话未归档且后续投递仍合法时，交 Session 按[工作治理](../../../session/session/docs/key-flows.md#f-sw03)接入当前工作或形成后继工作。归档、撤投递资格或准入否决不能凭迟到结果恢复任务资格。 |
| Agent或句柄退出 | 认回同一关系和原结果位置，不取消工具、不重发。 |

时限、名额和控制协议见 [P02](../SPEC.md#p02-定义准入与队列) 与 [P07](../SPEC.md#p07-计时控制与检查点)，实际提供者仍待验证；图不选择计时器、线程或进程。验证同时覆盖关系单向、原输入不变、后台名额、前台实际计时和终态竞争。

<a id="tl-f04"></a>
### TL-F04 内部等待、异步卡片与原答复

此路径已经处于前台 Tool 内部等待。它不是动作发起前 HITL 授权，也不是 Run 扩展等待；需要授权解释时使用身份与授权的结论。Tool 只拥有原等待内容、有效性和接续位置，HITL 拥有卡片与唯一有效决定。

```mermaid
sequenceDiagram
    participant T as Tool原等待拥有者
    participant H as HITL决定拥有者
    participant U as 当前答复者与交付面
    participant I as 身份资格或授权解释
    T->>H: 请求原等待的具名答复 保留关联
    H-->>U: 异步出卡或重新展示原卡
    Note over T,H: 出卡 答复成立 原等待处理不共享物理寿命
    U->>H: 原卡片答复或不回答
    H->>I: 核对当前答复资格 必要时解释授权
    I-->>H: 当前资格及解释事实
    alt 失权 重复或等待已失效
        H-->>U: 不建立新的有效决定 不补答案
    else 原等待有效且资格成立
        H->>H: 按其契约成立唯一有效决定
        H-->>T: 交原决定及原等待关联
        T->>T: 保存答复与原等待处理依据
        Note over T,I: 原决定先提交 再按原响应身份交接
        T-->>U: 原执行继续或按没有答案处理
    end
    opt 合法控制 业务取消或原执行确定终局
        T->>H: 原等待失效事实
        H-->>U: 原卡失效 历史保留 不填默认答复
    end
```

Ask 无超时和默认答案，不转后台，前台上限不计等待。普通消息不答卡，当前会话可靠受理普通输入、其他会话可运行。失联查询、Agent 退出、句柄或计算资源释放不终结原等待；仅工具自身连续性确认丢失的分支须原执行确定终局后使卡失效，合法控制和业务取消不以失联为前提。

恢复先取得原等待、原卡决定和待处理责任，不生成另一有效决定。“不回答”是有资格人的有效答复，不是批准或失败。其他确实占资源的等待可以依专有契约设时限，等不到应答不编造答复，该规则不适用 Ask。验证包括普通消息、长期等待、重复及失权答复、无答案、取消与答复竞争、Agent 换代。

<a id="tl-f05"></a>
### TL-F05 过程观察、真实收场与采用

过程帧走[过程观察契约](../SPEC.md#过程帧的观察契约)，开块固定填充、封块给完整内容；重连快照不是完整增量历史。过程只给人，不塞模型上下文。下图两条可靠交接路径均保留已确认内容及责任，Tool 的关系解除不是 Model ACK 清理。

```mermaid
sequenceDiagram
    participant T as Tool执行与原结果
    participant V as 合法观察者
    participant C as 原消费者
    participant S as 内容与接续事实保管
    participant A as 后扩展及消息准入
    opt 工具实际发过程帧
        T-->>V: 当前快照再后续增量 开块固定模式
        Note over T,V: 帧可选 保存先于展示 发送故障不单独令执行失败
    end
    T->>T: 保管真实收场 原结果 效果及账目
    T-->>C: 原调用 原位置 内容或可靠引用
    alt 先保管后处理
        C->>S: 保存原内容或可恢复引用 归属位置及接续责任
        S-->>C: 进程 OS崩溃及断电耐久确认
        C->>T: 按Tool协议解除相应待交付关系
        C->>A: 从原位置处理扩展 卸载及消息采用
    else 先完成处理再交接
        C->>A: 在Tool仍保管原结果时完成原位置处理
        C->>S: 保存必要完成事实及仍须保留内容依据
        S-->>C: 必要事实达到同一耐久边界
        C->>T: 按Tool协议解除相应待交付关系
    end
    A-->>C: 采用或否决 转换只追加派生表示
    Note over T,S: 两条路径均不删除Tool全文 不改原件 不重做效果
```

可靠保管先于执行后扩展。第二路径在处理前仍由 Tool 可靠保管，处理失败不解除交付责任，成功后也须保存完成事实；不能误读为先处理未保存内容。保存失败、确认丢失和提交未知按原身份核对，双方不能同时放弃责任。消费者替换从原保存位置继续。

消息拒绝或实际可读模态不相容保留原结果及原因，不重跑。仅契约指定仍有效未终结 Run 的结果否决使该 Run 失败；后台、Run 外、原 Run 已终态或业务已取消的结果不改旧终态、不造后继、不恢复入队。未定旁路后果由实际消费者承担并继续细化。

内容 ref 与附件地址分流见 [P14](../SPEC.md#p14-附件引用与模型交付)，共享值迁移与发送行为验证沿 TOOL-E01／MODEL-E01。已展示过程的保存和持久读取设计见 [P08](../SPEC.md#p08-过程分页与全文交接)，实际断电验证仍待 TOOL-M04，不宣称逐片同步落盘或允许丢失。验证覆盖两种填充、快照接续、保存失败、两种交接路径、确认未知、消费者替换和消息否决。

<a id="tl-f06"></a>
### TL-F06 全文卸载、取回与成本保管

单条结果卸载不是会话压缩，也不改变前后台关系或终局。全文保留沿 Tool 专有规则，内容存储承担字节耐久、引用有效和可取回，具体保管所在由实际机制确定。现行没有到期删除规则。

```mermaid
sequenceDiagram
    participant C as 原结果消费者
    participant S as 全文及附件保管
    participant H as 原历史或独立消费记录
    participant R as 合法读取调用方
    participant I as 当前读取资格
    participant Q as 全文查询或分页工具
    participant B as 原调用执行账与费用
    C->>S: 保存原文 原附件及原调用关联
    S-->>C: 字节或有效引用耐久成立
    C->>H: 首次追加作者摘要或机械首尾占位 大小及取回方式
    Note over C,H: 失败不写假可取回占位 原结果仍保管
    R->>I: 请求当前全文及附件读取资格
    I-->>R: 当前允许或拒绝
    alt 拒绝
        Note over R,S: 不交内容 不删除仍须保管的原文
    else 允许
        R->>Q: 新取回调用及原结果关联
        Q->>S: 请求原文页或附件
        alt 地址失效或暂时读取失败
            Q-->>R: 明确原因 不冒充不存在
        else 内容可取回
            S-->>Q: 原文页或附件内容
            Q-->>R: 新返回 原历史占位不改
        end
        Q-->>B: 此次新调用的真实开销 原工具不重计
    end
    B-->>R: 在账目资格内提供真实或待结算明细
    Note over S,B: 归档 消费 Model ACK均不删除工具全文 迟到费用归原调用
```

作者结构化返回提供原文时采用作者摘要；单条超限兜底只机械保首尾。没有满足保存前提不能声称已经卸载，存储失败和引用不可用继续保管责任。查询取回是新调用和新返回，不重做原工具效果、不回写旧占位。

账目读取独立核对原租户及组织范围，账目资格不能代内容权限。dummy 只记实际替换处理，原工具没有物理用量；原成本不因重通知、接续或读回重计，真正新调用成本保存，未知不填零。取消及归档后实际费用和迟到结果仍沿原调用追加保存。全文、附件、账目和诊断投影不可混为一个宽泛读权。

引用、分页、存储失败和成本设计协议见 [P08](../SPEC.md#p08-过程分页与全文交接) 与 [P09](../SPEC.md#p09-账目恢复与退出)，真实组合仍待 TOOL-M03 验证。验证覆盖作者摘要与机械截断、分页新返回、权限收窄、压缩或归档后读回、地址失败、原费用去重和新调用真实计量。

<a id="tl-f07"></a>
### TL-F07 单次控制、逻辑取消和原调用恢复

控制参与者只对当前资格内的具名目标负责。下图展示业务取消与真实收场可分别完成，后台与前台在 Run 取消范围上有差异；Session 归档控制前后台但不等待物理全停，子会话级联仍归 Session。

```mermaid
sequenceDiagram
    participant U as 用户或合法控制方
    participant G as 原工作治理或独立协调者
    participant T as 原Tool执行拥有者
    participant S as 原事实及内容保管
    U->>G: 单次停止或业务取消请求 明确目标原因
    G->>S: 可靠保存控制意图及适用业务取消
    alt 单次停止
        G->>T: 请求停止具名原执行
    else Run取消
        G->>G: 撤销新推进资格 按规则写逻辑终态
        G->>T: 请求停止前台关联执行 后台不自动跟随
    else Session归档
        G->>G: 取消全部原未完成调用 解除等待 不等物理全停
        G->>T: 请求停止前台及后台原执行
    end
    T-->>G: 受理及能力限制 不表示已停
    T-->>S: 后来真实收场 原结果 效果及成本
    Note over G,S: 迟到事实沿原调用追加 不复活Run或旧等待
    opt Agent退出或故障后合法接续
        G->>T: 按原身份查询真实状态
        alt 查询暂时不可用
            Note over G,T: 保持未知 不重发 不断言丢失
        else 仍运行
            T-->>G: 认回原句柄及等待关系
        else 已收场但未交接
            T-->>G: 原结果及原位置 可靠承接
        else 已可靠交接
            G->>S: 从消费者保存位置继续允许的处理
        else Tool自身可靠确认连续性丢失
            T-->>S: 失败 异常中断 效果已知或未知
            Note over G,T: 不自动重放 另行合法核查补偿或新动作
        end
    end
```

完成与停止竞争保留真实结果，不能把归档后成功伪报物理中断。单次控制不自动结束模型或 Run，Agent 仅控制其既有范围内自己发起的后台执行。释放句柄、disposer、断线或环境重建都不证明停止或效果回滚。撤销归档不重启旧调用，已终态工作仅处理允许的迟到结果和费用。

已确认原调用、答复、控制、结果、交接和账目须承受进程崩溃、OS 崩溃及断电，存储介质可读取及声明部署条件是前提。托管隔离域退出不丢宿主调用的迟到收场。存储和必要准入不可用阻止依赖允许或保存的新动作，仍跟踪原执行责任；灾后介质损毁与安全开放政策未定。

控制、连续性、围栏和交接协议已在 [protocols](../SPEC.md#tool-操作协议) 展开，实际提供者证据仍由 TOOL-M02、TOOL-M03 跟踪。验证须覆盖真实外部效果、取消完成竞争、归档迟到、查询未知、自身丢失、独立无 Session 控制、消费者替换及真实断电边界，缺环境报告无法验证。

### 未细化与验证责任

[问题登记](../../../../.meta_harness/design/product/tool-execution/design.md#未决问题与待定事项)继续拥有 TOOL-M01 至 TOOL-M04、TOOL-E01 与 MODEL-E01 技术兑现。本页不生成新产品默认或另一套问题 JSON。精确 Schema/API、发起共同有效边界、认领围栏、控制传播与级联、未知提交、结果交接确认、连续等待资源、在途耐久、分页和性能分别由工具成员、发起或消费协调者、HITL、存储及提供者承担；图中语义路径可读不表示这些机制已兑现。

[成员持续验证义务](../SPEC.md#持续验证义务)与[旅程能力验证入口](../SPEC.md#旅程能力与验证入口)规定工具、存储、控制、模态、故障、外部效果及性能验证的范围。结构和图检查不证明这些运行保证。
