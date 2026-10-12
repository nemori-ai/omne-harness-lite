# 请求派生协作流程

本页在正式位置维护待审细化，只有文档目标，没有真实包、公开形状或实际运行验证。产品既定规则保持原确认范围，阶段支持仍待用户选择。

<a id="rc-f04"></a>
## RC-F04 人侧历史与模型侧块投影

承接 [RC-J04](../../../../.meta_harness/design/product/runtime-context/design.md#rc-j04)，能力 CAP-RC06、10。历史持久事实与交付状态由 Session、Model、Tool 及交付面共同衔接，Context 不发明新的消息种类或分页 API。

```mermaid
flowchart TD
    History[同一合法历史与原块标注] --> Human[人侧按当前资格选块]
    Human --> Recent[先读最近段，再向前加载并接收新记录]
    History --> Model[模型侧按当前资格和明确模型可读标注选块]
    Model --> Exclude[排除 ToolInternalMessage、未标注块与残缺工具调用]
    Exclude --> Compaction[按有效压缩关系计算派生集合]
    Interrupted[流中断或用户叫停] --> Original[原消费路径保存真实收场与中断事实]
    Original --> Delivered{已交付内容}
    Delivered -->|有| Retain[按原消息规则保留并标识中断]
    Delivered -->|无| NoEmpty[不造空回复，仍解释中断]
    Retain --> History
    NoEmpty --> History
    Human --> Revoke[撤权后停止新读取]
```

取消人侧读取不删历史；停止语音播放不等于取消原业务。模型窗口不裁人侧历史，残缺调用不执行。图中已交付内容的保留是目标保证，展示至耐久边界尚见 [CONTEXT-M03](../../../../.meta_harness/design/product/runtime-context/design.md#context-m03)，不能由收场后 ACK 推导逐片同步保存。持续验证见 [RQ-VJ04](../SPEC.md#rq-vj04)。

<a id="rc-f05"></a>
## RC-F05 接纳前转换与按来源处置失败

承接 [RC-J05](../../../../.meta_harness/design/product/runtime-context/design.md#rc-j05)，能力 CAP-RC06、07、10。Model 的[转换件共同契约](../../../model/model/docs/profile-and-modality.md#转换件的共同契约)唯一拥有键选择及合约输出。本域消费转换结果并在请求时选用实际表示，转换不是组装时临时改写历史的步骤。

```mermaid
flowchart TD
    Source[原内容到消息接纳路径] --> ResultSource{是否 Model 或 Tool 真实结果}
    ResultSource -->|是| Keep[原生产者及合法消费者可靠保管原结果和消费关联]
    ResultSource -->|否| Eligible
    Keep --> Eligible{模型可读非文本块或文件}
    Eligible -->|否| Admission[按原消息准入继续]
    Eligible -->|是| Converter{共同契约选定的适用转换件}
    Converter -->|未登记| Original[按准入规则保留原块，无 transcript]
    Converter -->|已登记| Convert[接纳前转换，按共同契约验证结果]
    Convert -->|有效| Fixed[接纳后固定派生表示及 transcript]
    Convert -->|不可用或不合约| Reject{原消息来源}
    Reject -->|外部输入| Input[告知发送方拒绝，不形成会话消息]
    Reject -->|模型回复| Reply[保留原调用收场与否决，交 Agent 有界否决路径]
    Reject -->|Tool 结果| Tool[原结果保留，交原消费契约处置]
    Fixed --> Admission
    Original --> Admission
    Admission -->|允许| History[可靠历史中保留原块和原标注]
    Admission -->|否决| Reject
    History --> Assemble[后续请求按实际模型选表示并计全预算]
```

| 分支守卫 | 后果与拥有者 |
| --- | --- |
| 模型回复被否决且原工作仍有效未终态 | Agent 从原位置按有界路径继续，达到否决上限使消费契约指定的 Run 失败；Model 原调用真实收场不改成供应商故障。 |
| Tool 结果被否决且消费契约指向有效未终态 Run | 原消费方使指定 Run 失败，Tool 结果、效果与账目继续保留。 |
| 后台、Run 外、旧 Run 已终态或已取消 | 保留原身份及消费位置，不造 Run、不挂无关后继、不反转终态、不恢复取消资格；具体旁路后果由原消费者细化。 |
| 取消转换等待、资格失效或消费者换代 | 停止不再合法的新交付，原生产者或获准接手者继续保管原结果；不靠重跑 Tool 或副作用函数补结果。 |
| 转换执行或接纳提交未知 | 按原内容、调用和消费位置查询接续；精确幂等身份与接续协议待设计，不推定未处理。 |

失败分支见 [RQ-08](../SPEC.md#rq-08-失败否决与消费位置)。转换与旁路协议见 [CONTEXT-M02](../../../../.meta_harness/design/product/runtime-context/design.md#context-m02)，最终工具块全集及嵌套投影见 [CONTEXT-E01](../../../../.meta_harness/design/product/runtime-context/design.md#context-e01)，共享身份 MODEL-E01。未知嵌套分支不能当相容输入，已知模态检查仍须执行。持续验证见 [RQ-VJ05](../SPEC.md#rq-vj05)。

<a id="rc-f06"></a>
## RC-F06 一次请求的完整组装与固定采用

承接 [RC-J06](../../../../.meta_harness/design/product/runtime-context/design.md#rc-j06)，能力 CAP-RC01、06、07、08、10。图中的原发起者在主流程是 Agent，在压缩、扩展及独立调用是各自具名发起路径。独立输入不需要 Session，但托管数据读取和外发责任仍须承接。

```mermaid
sequenceDiagram
    participant C as 原发起协调者
    participant S as Session 与合法来源
    participant R as Request Context
    participant E as 模型前扩展
    participant M as Model
    opt 会话消费路径
        C->>S: 可靠保存本次新输入及相关消息
        S-->>C: 已保存范围及原消费关联
    end
    C->>S: 取得提示词规则、历史、绑定、Context 与有效档案
    alt 必要来源无权、不可用或范围未知
        S-->>C: 明确缺项，不以空输入成功
    else 合法范围明确
        S-->>C: 合法输入及采用依据
        C->>R: 请求派生、表示选择和完整预算
        R-->>C: 符合限制的候选或明确失败
        alt 候选完成
            C->>E: 本次经过的模型前扩展
            E-->>C: 候选内容与参数的变化
            C->>R: 必要重组装或最终复核，不重触发扩展
            R-->>C: 最终输入、计量及依据或失败
            alt 最终输入合法且发起条件仍成立
                C->>C: 核对接收方与资格，固定实际采用
                C->>M: 请求执行固定输入，沿原调用身份
                alt 发出结果已知
                    M-->>C: 原调用状态，后续按 Model 契约消费
                else 发出结果未知
                    C->>M: 按原调用查询和对账，不新建重发
                end
            else 最终复核失败
                C->>C: 不发出，按原消费契约报告原因
            end
        else 预算或派生失败
            C->>C: 保留历史及原结果，沿失败分支处置
        end
    end
```

完整预算包含提示词、历史、提醒、工具定义、完整 Context 和实际发送模态。字节、图片数等精确检查，token 按适用方法及明确余量计量；方法或限制未知不能伪装通过。精确计量条件消费 Model 档案契约。首次组装和扩展后复核都适用 [RC-F07](#rc-f07) 的压缩保护与失败后果，不重复触发该扩展位置。

取消组装只结束计算和订阅，已发出调用的控制归 Model 原契约。固定后变化不改旧请求，下一动作仍按当前资格。版本复核、跨源一致采用、提交未知及精确失败集合仍见 [CONTEXT-M02](../../../../.meta_harness/design/product/runtime-context/design.md#context-m02)。持续验证见 [RQ-VJ06](../SPEC.md#rq-vj06)。

<a id="rc-f07"></a>
## RC-F07 压缩、内部调用与预算失败

承接 [RC-J07](../../../../.meta_harness/design/product/runtime-context/design.md#rc-j07)，能力 CAP-RC04、08、09、10。压缩计算归 Request Context，Session 保存共同结果，原压缩消费者承担内部 Model 调用的接续与费用交接。

```mermaid
flowchart TD
    Budget[计量完整候选输入] --> Fixed{固定部分本身可满足限制}
    Fixed -->|否| FixedFail[固定部分超限，明确失败]
    Fixed -->|限制或依据未知| Unknown[报告未知或缺项，不冒充通过]
    Fixed -->|是| Fits{完整输入符合限制}
    Fits -->|是| Ready[交回候选，待最终复核与固定]
    Fits -->|否| Allowed[确定可压内容与精确原块范围]
    Allowed --> Protect[排除未读新输入、未答等待及未结后台占位]
    Protect --> Compress[按适用策略压缩]
    Compress -->|调用内部模型时| Internal[沿原模型身份承接结果与费用，回原压缩位置]
    Compress -->|不需内部模型| Common
    Internal --> Common[共同保存摘要与精确原块排除名单]
    Common --> Current[补入完整合法 Context]
    Current --> All[按全部有效压缩关系重组并计量完整输入]
    All --> After{符合目标限制}
    After -->|是| Ready
    After -->|否| AfterFail[合法压缩后仍超限，明确失败]
    FixedFail --> Owner[原消费契约处理失败]
    AfterFail --> Owner
    Owner --> Session{是否指定仍有效未终态 Run}
    Session -->|是| RunFail[指定 Run 失败，保留 Session 历史与已有结果]
    Session -->|否| Return[向原调用方报告，不造 Run、不改旧终态]
```

摘要与精确原块引用共同保存的成功，才允许该压缩事实参与后续投影；旧历史及原可见性不变。较早未排除块仍参与，固定要求不能靠压缩删除。所有适用压缩均受同一保护及完整预算规则约束。必要压缩失败不默认换模型或分叉，条件未变不无限重做。

若取消或故障发生在内部调用之后，原调用可能仍执行或已收场。接续方认回其身份，按 Model 契约完成结果承接和 ACK，不把结果当主流程回复，也不重发或重计原账。Model ACK 存在先完成处理或先可靠保管再确认的合法路径，选择须保证清理后原压缩接续不依赖已释放全文。取消本地等待不撤销共同保存事实，也不证明原执行物理停止。共同保存、原消费位置、未知对账及 ACK 接续精确机制仍见 [CONTEXT-M02](../../../../.meta_harness/design/product/runtime-context/design.md#context-m02)。持续验证见 [RQ-VJ07](../SPEC.md#rq-vj07)。
