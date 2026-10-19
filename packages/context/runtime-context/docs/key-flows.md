# 当前块供给协作流程

本页在正式位置维护待审细化，只有文档目标，没有真实包、公开形状或实际运行验证。产品既定规则保持原确认范围，阶段支持仍待用户选择。

<a id="rc-f01"></a>
<a id="rc-f01-attempt-当前快照与后续变化"></a>
## RC-F01 执行开始或挂接建立时的当前快照与后续变化

承接 [RC-J01](../../../../.meta_harness/design/product/runtime-context/design.md#rc-j01)，能力 CAP-RC01、03、04。Session 先供给会话注册和模式事实，Runtime Context 从原来源按各消费者当前资格取值。模式创建默认与后续修改由 Session 拥有。Context 不设置模式。谁可以改模式见[产品模式规则](../../../../.meta_harness/design/product/sessions-and-work/design.md#按协作需要调整三个独立模式)。

```mermaid
sequenceDiagram
    participant A as Agent 执行挂接
    participant S as Session
    participant C as Runtime Context
    participant P as 原生产者与资格来源
    participant H as Session 原变化消费路径
    participant R as Request Context
    A->>S: 请求当前会话身份、注册及自有值
    S-->>A: 当前会话事实
    A->>C: 执行开始或挂接建立时请求当前合法完整快照
    C->>P: 请求各块当前值与消费者资格
    alt 必要来源不可用或资格未知
        P-->>C: 缺项或未知事实
        C-->>A: 阻止依赖读取并说明缺项
    else 范围合法且可读取
        P-->>C: 当前获准内容及来源
        C-->>A: 当前快照，前值按块可选
    end
    P-->>C: 内容更新事实
    alt 未闭合运行且模型可读
        C->>H: 交接获准状态变化或事件提醒
        H-->>R: 可靠历史中的追加变化链
    else 仅工具或扩展可读
        C-->>A: 仅向获准消费者供给，不给模型
    else 会话空闲的状态推送
        Note over C,H: 可丢推送，可靠业务输入、控制、结果不走此分支
    end
    alt 模型首次读取或合法压缩后
        R->>C: 请求完整模型可读 Context
        C-->>R: 当前有权读取的全量，私有块排除
    else 平常请求
        H-->>R: 读取适用变化链，不只留最新提醒
    end
```

状态提醒表达本会话实际感知的获准前后值，事件提醒表达发生事实；完整快照允许可选前值。历史提醒不能替代当前授权。取消读取或订阅只结束相应等待与资源。故障后重新拉当前值并沿已保存变化接续，不能伪造空闲期间所有中间状态。前值关联、变化身份、通知补查及一致读取由 Runtime Context、Session 和原消费者落实，仍见 [CONTEXT-M01](../../../../.meta_harness/design/product/runtime-context/design.md#context-m01)。持续验证见 [RC-VJ01](../SPEC.md#rc-vj01)。

<a id="rc-f02"></a>
## RC-F02 注册变更、移除与资格失效

承接 [RC-J02](../../../../.meta_harness/design/product/runtime-context/design.md#rc-j02)，能力 CAP-RC01、02、04、10。Session 拥有注册业务，Runtime Context 只在 Session 授权提交契约中供给变更；资格仍回原拥有者判断。

```mermaid
sequenceDiagram
    participant U as 具相应资格的调用方
    participant S as Session 注册拥有者
    participant P as 原生产者与资格来源
    participant C as Runtime Context
    U->>S: 请求添加、更新或移除注册
    S->>P: 核对当前资格、来源及必需边界
    alt 无权、移除必需项或改固定身份
        S-->>U: 拒绝，原事实保持
    else 允许变更
        S->>S: 使注册与恢复事实一致成立
        alt 提交已确认
            S-->>U: 变更已保存
            S-->>C: 后续采用的注册事实
            C->>C: 失效相关缓存及供给关系
        else 提交结果未知
            S-->>U: 保留未知及原操作关联
            U->>S: 按原操作核对，不创建替代注册
        end
    end
    P-->>C: 撤权或来源失效事实
    C->>P: 新读取重新核对有效资格
    alt 撤权或必要依据未知
        C-->>U: 停止依赖的新内容供给
    else 当前合法
        C-->>U: 供给当前获准内容
    end
```

可选移除不删共享源或他会话，恢复不装回。取消等待不能认定提交未发生；提交未知由 Session 原操作继续对账。已固定请求不被注册更新重写，也不撤回原外部效果。并发变更、撤权、读取和固定采用之间的精确边界仍属 [CONTEXT-M01](../../../../.meta_harness/design/product/runtime-context/design.md#context-m01)，图不声称跨独立源同一事务。持续验证见 [RC-VJ02](../SPEC.md#rc-vj02)。

<a id="rc-f03"></a>
## RC-F03 首次目录访问的指导供给

承接 [RC-J03](../../../../.meta_harness/design/product/runtime-context/design.md#rc-j03)，能力 CAP-RC01、05、10。活动图不定义文件遍历算法。

```mermaid
flowchart TD
    Visit[实际访问工作区目录] --> First{按适用协议属于首次访问}
    First -->|否| Existing[按既有采用与当前资格继续]
    First -->|是| Read[请求适用 AGENTS.md 及读取资格]
    Read --> Result{当前读取结果}
    Result -->|有权且可读| Adopt[记录来源、目录范围及采用内容]
    Adopt --> Use[向获准消费者供给指导]
    Result -->|无权| Deny[拒绝该读取]
    Result -->|来源不可用或未知| Gap[报告缺项，不声称已取得指导]
    Read --> Cancel[取消只结束本次读取]
```

普通资产发现与 reload 不触发此链，远端变更不承诺立即同步。读取失败对原工作后续处理由其消费契约承担。规范版本、精确首次访问、合并及恢复标识未确定，不能从图中的判断节点推导算法，见 [CONTEXT-E02](../../../../.meta_harness/design/product/runtime-context/design.md#context-e02)。持续验证见 [RC-VJ03](../SPEC.md#rc-vj03)。
