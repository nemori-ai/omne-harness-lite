# Model 业务与数据流

本页描述已接受的非 pi-ai 运行契约。pi-ai 细化的采用范围见[组架构各节](../../docs/architecture.md#成员与新增条件)，图表不表示运行实现或真实提供者验证已完成。

下图只给出主要阅读次序，不穷举控制优先级、状态或并发交错。完整行为和失败条件归 [SPEC](../../model-contract/SPEC.md)，各参与者只通过自己的公开能力交接。

流程承接[产品旅程](../../../../.meta_harness/design/product/model-invocation/design.md#关键用户旅程)，表达逻辑角色的顺序、守卫与交接。图表不定义公开 API、字段、提供者或存储事务。

```mermaid
flowchart TD
  Start[固定原调用与请求] --> Admission[可靠受理]
  Admission --> Send[当前资格与实际发送]
  Send --> Output[原输出与真实收场]
  Output --> Handoff[原版本处理或保管]
  Handoff --> Ack[确认后清理]
  Send --> Unknown[发送或查询未知]
  Unknown --> Reconcile[按原身份核实，不推断未发出]
```

## 责任、机制源与图的读法

模型档案、真实发出、首内容、原结果、控制事实、保管和费用归 model/model；选择事实归调用方；表示选择、组装、预算分配和压缩归 request-context，Model 提供供应商计量能力并校验参数、模态与资格，发送路径不计量；消息接纳归消息准入者，模型后消费归消费者拥有者。独立程序承担自己的业务状态与消费，不建立隐式的域外工作身份。授权判断归 identity，设置与锁定归 assets，存储兑现各确认边界。

图中实线为请求、控制或保存意图，虚线为结果和事实返回，文字标明交接性质。参与者是逻辑角色，不表示同进程、同步事务或共同寿命。模型终局只引用[主规格的调用和真实发出](../../model-contract/SPEC.md#调用和各次真实发出)，不复制为域外工作的状态机。开块、填充、封块、截断、记费与流收场是流到达及结算事实。

本域的语义依据归[产品规则](../../../../.meta_harness/design/product/model-invocation/design.md#产品需求描述)及[主架构](../../../../docs/domains/model-invocation/architecture.md)。转换件的共同规则归[SPEC](../../model-contract/SPEC.md#转换件的共同契约)；请求表示组装消费该规则，不另定义。ACK、读取保护和清理的必要行为归[结果承接契约](../../model-contract/SPEC.md#结果承接清理与成本行为)，本页只画应用路径。

提交、围栏、消费承接和控制已有 [SPEC](../../model-contract/SPEC.md#342-资格共同提交与实际发送)。流程按其顺序展开，实际提供者仍须兑现并验证跨进程和耐久保证，不以同库位置推断原子性。

<a id="flow-md01"></a>
## 档案维护与会话选择

承接 J-MD01、J-MD02，能力为 CAP-MD01..04、CAP-MD05、CAP-MD06、CAP-MD12。模型域提供合法档案及采用依据；调用方是列表和切换的协调者，模型域不写选择。

```mermaid
sequenceDiagram
  participant U as 有资格的维护者或用户
  participant M as Model档案维护与求值
  participant K as 凭据绑定拥有者
  participant A as 身份与设置公开契约
  participant S as 选择协调者
  participant C as 运行时上下文提供方
  U->>M: 档案变更，范围与不可变路由名
  M->>A: 核对自身层维护资格与配置边界
  alt 资格或同名身份不成立
    M-->>U: 拒绝，不产生越界配置事实
  else 资格成立
    M->>M: 条件修订或撤回恢复原档案
    M-->>U: 保存确认，或原操作结果未知
  end
  U->>K: 另行请求自身绑定、更换或解绑
  K-->>U: 当前资格下的确认或原操作未知，不回显秘密
  U->>S: 查询列表或明确切换请求
  S->>C: 取得有效历史模态投影
  C-->>S: 模态投影或读取未知
  S->>M: 沿已知模态依据求合法列表及来源
  M->>A: 读取当前范围设置及锁定
  M-->>S: 胜出档案、能力、上限及凭据可用性
  alt 目标不合法或必要依据未知
    S-->>U: 原因可见，当前选择保留
  else 合法路由名
    S->>S: 保存选择与切换事实
    S-->>U: 保存确认或提交未知
    Note over S,M: 在途调用保持原采用，下一请求重新求值
  end
```

维护者角色必须与操作匹配，不能让普通选模型用户获得建档资格。官方发布、组织超级管理员自身层和租户自身层分别限权，域外的工作与编排只可代理明确合法切换。凭据请求不回显秘密。撤回保留身份；原行恢复不恢复取消执行。以上请求无需共同提交。

| 守卫或异常 | 可观察后果与原位置 |
| --- | --- |
| 最具体档案缺凭据或模态不兼容 | 不退外层；缺凭据合法目标仍可选并标注；模态不兼容不合法。 |
| 最具体同名撤回但外层仍有效 | 同名求值按既定筛选胜出，选中路由名不变。 |
| 链上全部撤回、配置排除、未找到或不可读 | 分别报原因，不可读不当已下架。 |
| 小窗口合法切换 | 调用方保存；下一请求失败不回滚已确认选择。 |
| 保存确认丢失、维护者退出或请求取消 | 查询原配置操作或切换事实，未知不宣称成功或回滚；在途调用寿命独立。 |
| 凭据解绑或读取故障 | 后续请求缺凭据或未知；既有发出与费用不改，存在但不可读不退默认。 |

对应规格为[身份及修订](../../model-contract/SPEC.md#身份修订及撤回)、[同名求值与选择](../../model-contract/SPEC.md#同名求值选择及列表)。持续验证定位[档案验证](../../model-contract/verification/README.md#验证与待闭合输入)，凭据精确键和接入数量继续依 MODEL-M04。

<a id="flow-md02"></a>
## 转换、表示选择与固定输入

Tool 内容 ref 路径不经过接纳前二进制转换，附件只产生地址文本；Model 实际发送时加载选中 ref，规则归 [SPEC](../../model-contract/SPEC.md#工具定义转换与内容引用加载)。以下转换图适用于其他消息来源，Tool 消息准入否决仍沿原消费责任。

承接 J-MD03，能力为 CAP-MD05、CAP-MD06、CAP-MD12、CAP-MD13。消息准入者应用转换契约；请求上下文选择表示，在请求前用 Model 的计量能力判断并决定必要压缩；发起协调者固定采用，模型执行校验实际发出，不计量输入。转换失败不能抹除原模型或工具执行。

```mermaid
sequenceDiagram
  participant O as 输入或原结果来源
  participant N as 原消息准入者
  participant T as ModelMessageConversion
  participant H as 原历史与可重建投影
  participant C as 请求上下文
  participant F as 原请求发起协调者
  participant M as 模型执行
  O->>N: 内容及原归属
  alt 模型可读非文本且登记适用转换件
    N->>T: 提交原块和来源，内部按确定键选件
    T-->>N: 合规派生及transcript，或失败
  else 无适用登记或仅人读
    Note over N,H: 原件按消息准入处理，不伪造transcript
  end
  alt 转换或消息准入失败
    N-->>O: 输入拒绝，或原消费否决事实及后果
    Note over O,M: 原模型终局与工具真实效果不删除、不反转
  else 接纳成功
    N->>H: 保存原块与已固定派生，维护投影依据
    H-->>N: 接纳确认或未知
    F->>C: 本次有效档案与合法输入来源
    C->>H: 读取同次采用范围内历史与投影
    C->>C: 选择实际表示，请求前计量并按策略压缩
    C-->>F: 候选输入及采用依据，或具体输入失败
    F->>F: 模型前扩展及必要最终复核
    alt 最终输入或资格不满足
      F-->>O: 原用途输入失败，历史及原件保留
    else 输入固定且合法
      F->>M: 固定输入、原调用身份及消费位置
    end
  end
```

取消转换操作返回具名 cancelled，释放本次资源且不接纳消息，不把取消当作模型回复转换否决来触发新一轮调用。无转换件与命中但不可用分别处理；后者不能降级成无件或换一个实现重算。

这里的原结果来源不指一律绑定仍在进行的域外工作。输入失败拒绝接纳；模型回复否决回原发起位置，原调用照常收场。后续是新调用。连续否决不设次数上限。工具失败仅由仍有效、未终结的域外工作的原消费契约使该工作失败。后台、域外工作之外或已终结的结果回自身原消费者，取消业务不得取得新入队资格。独立调用未走消息接纳时不硬造转换消息。

表示选择、预算分配和压缩的唯一源继续是 [request-context 规格](../../../context/request-context/SPEC.md)。Model 提供供应商计量能力，Context 在请求前调用它并决定是否调整候选；Model 的准备与发送不以计量结论作为发出条件。模型前扩展改写后需复核，不能混用不同采用版本、重复执行同次扩展或靠删除固定要求装入窗口。已发出请求不随后续选择或配置改写，后续外传资格另核对。

档案缺必要声明、来源不可读和实际不兼容都阻止发送；输入大小由压缩方在请求前判断，估算超限称估算检查失败，字节及图数按实际量检查。超限表示可按已有策略改取合规表示，不能隐瞒原件或当模态错误。上游事后以 input-over-limit 拒绝时，调用以 failed 收场，Model 不重发同一输入，调用方压缩后以新调用重发。输入仍装不下则原工作失败、历史保留，独立路径返回原调用方。

精确参数与计量依 MODEL-M01，Tool ref 迁移与发送验证依 [MODEL-E01](../../../../.meta_harness/design/product/model-invocation/design.md#model-e01)。不开放任意嵌套语法。持续验证见[档案验证](../../model-contract/verification/README.md#验证与待闭合输入)及[请求资格](../../model-contract/SPEC.md#请求资格身份与固定输入)。

<a id="flow-md03"></a>
## 真实发出、首内容重试与流收场

承接 J-MD04，能力为 CAP-MD06、CAP-MD07、CAP-MD08、CAP-MD11、CAP-MD13。本图不复制调用终局状态机，只表示一次逻辑调用内的真实发出、策略和消费先后。每次发出沿原调用身份关联，换供应商不是域外工作的新一次尝试。

```mermaid
sequenceDiagram
  participant F as 原发起与消费者
  participant M as Model runtime
  participant R as 有效重试策略
  participant P as 当前允许供应商
  participant B as 原结果保管与费用事实
  F->>M: 已固定输入、原调用及消费位置
  alt 资格、参数、凭据或输入无效
    M-->>F: 未发出失败及具体原因
  else 发前条件满足
    loop 原调用未收场且当前发出符合有限策略和控制
      M->>M: 保持原输入，核对当前资格和真实接收方
      M->>B: start前openReceiveWindow并持久确认
      M->>P: 物化与最终围栏通过后单次真实发出
      P-->>M: 头、心跳或空开块
      Note over M,P: 以上不算首内容
      alt 首内容前可重试失败或空回复
        M->>B: preserve终止事实并闭合窗口，保留失败与费用
        B-->>M: 持久确认未交首内容，才允许准备重试
        M->>B: prepareRetry固定原策略位置
        B-->>M: 已提交RetryPosition
        M->>R: 原位置、失败事实、档案声明及已尝试情况
        Note over F,M: 原调用等策略，不报终局、不ACK
        alt 策略有效且允许继续，资格与控制仍允许
          R-->>M: 同家退避或下一家的决定及来源
          M->>B: decideRetry持久保存原决定
          B-->>M: 已确认才继续；未知先认回原位置
          Note over M,P: 下一轮才是新真实发出，仍关联原调用
        else 策略不可用、拒绝再试或资格失效
          R-->>M: 不再试或不可用事实
          M->>B: 原调用真实失败，结束发出循环
        end
      else 上游报告输入超限
        P-->>M: 供应商自己的输入超限信号
        M->>B: preserve终止事实并闭合窗口，原调用以failed收场，成因input-over-limit，保留费用
        Note over M,R: 不重试，不换同档案的其他供应商
        Note over F,M: 调用以failed交回原消费者；调用方压缩后以新的ModelCallId重新发起，不属于原调用
      else 首内容前明确无效请求或凭据等禁止再发成因
        M->>B: 保存已发出拒绝和费用，原调用失败收场
      else 实际首内容交出
        P-->>M: 增长块第一片或整交完整块
        M->>B: 映射共享步骤、归约并 preserve
        B-->>M: 耐久确认与游标
        M-->>F: 已保存快照和后续变化
        alt 正常输出或输出限额截断
          P-->>M: 封块与真实收场，截断时附提醒
          M->>B: 原完整结果、真实完成及费用依据
        else 首内容后故障或中断
          P-->>M: 部分内容与真实原因
          M->>B: 故障或控制结局及已交内容，不重发
        end
        Note over M,P: 首内容后不再进入发出循环
      end
    end
    B-->>F: 整调用终局事实及适用结果回原位置
  end
```

图中先开接收窗口再 start，以覆盖 transport 可能预读的情形；窗口未确认则不能读取或发出。能证明 start 不接收或预读内容的 adapter，才可按 SPEC 在 start 后、首次读取前开窗。

失败分支只有在 preserve 已保存该窗口全部已接收事实并闭合窗口、可证明未交首内容后才进入 prepareRetry。无法证明完整闭合时保持 uncertain，先核实原操作，不用空快照放行重试。

图中后续发出可再次经历首内容前失败，但循环必须被有限策略收束。允许回退按档案次序逐家至多一次；不允许回退原家退避后至多再试一次。替换策略不能跨首内容边界、改路由名或不透明换供应商。上游明确请求或凭据无效不反复发送同一输入；本地保管故障不报成供应商故障。

开块固定追加或整体替换模式，替换只改该块。封块提供完整内容，增量与一次取得有效结果一致。截断提醒、实际用量登记和 finish 各有事实，finish 不结束原域外工作。重连先取快照后取增量，未收齐工具参数不可执行；完整工具建议也只交消费者拥有者做工具准入。

首内容前最终失败回原用途失败位置；首内容后部分及提醒回原消费位置，不增加第二份同义上交事实；压缩、扩展及独立用途回原位置。后续消息否决不把完成改失败，不送回策略复活终局，后续的新调用用新身份。

重试位置、持久决定和独立适配已有 SPEC；MODEL-M02 跟踪提供者兑现。保存后发布已有顺序，MODEL-M03 跟踪实际故障验证。精确流事实及共享步骤映射归 [流协议](../../model-contract/SPEC.md#供应商解释与流状态归约)，图不另造事件定义。验证见[主规格持续验证](../../model-contract/SPEC.md#观测资源与验证)。

<a id="flow-md04"></a>
## 控制、取消与原身份恢复

承接 J-MD05，能力为 CAP-MD09、CAP-MD10、CAP-MD11、CAP-MD12。控制关系、真实物理执行与消费资格分别判断；模型与域外的工作与编排及其他执行不共享寿命。

```mermaid
sequenceDiagram
  participant G as 单调用控制或域外治理
  participant M as 原Model执行
  participant P as 原供应商
  participant B as 原结果与事实保管
  participant C as 当前合法接手者
  G->>M: 按原调用传播中断或业务取消
  M->>P: 适用物理停止意图
  M-->>G: 受理或未知，实际停止另行确认
  Note over G,M: 单调用不取消调用方的整个工作或工具执行，归档先取消业务依赖
  P-->>M: 实际停止、迟到完成或结果仍未知
  M->>B: 保留原结局、结果和费用；取消后不追加发出
  C->>M: 按原租户及原身份核对消费与执行
  alt 无当前资格或业务已取消
    M-->>C: 拒绝业务接续，原事实仍按合法责任保存
  else 查询暂时不可用
    M-->>C: 未知，不证明自身失联、不重发
  else 原执行仍运行
    M-->>C: 等待并接续原输出
  else 原执行已收场且未ACK
    B-->>C: 原结果回原用途和消费位置
  else 已ACK
    M-->>C: 原确认及清理状态，转消费保存侧
  else 可信确认Model自身连续性丢失
    alt 已证明未交首内容，原资格与控制允许
      M->>M: 恢复原用途并登记新真实发出
      Note over M,B: 原调用身份保留，多次真实费用或未知均保留
    else 首内容已交或不确定，或业务已取消
      M->>B: 记失联或取消事实，不重发、不恢复业务
    end
  end
```

消费者退出或最后句柄释放不是自身失联，控制超时也不证明物理全停或提交回滚。真正 Model 连续性丢失的判据仍依 MODEL-M02，图不指定检测器。恢复使用原采用依据，不用新档案改原输入；取消和已失效授权阻止旧业务恢复。

单调用中断生效后，原消费者在工具准入前核原控制事实，阻止原响应中尚未发出的工具建议，包括参数已经完整的建议。已经独立发出的 Tool 由自己的控制契约处理，不从 Model 中断推定一并停止。

归档与撤销归档不反转原终局，迟到事实不进入新待处理队列、不默认派后继工作。取消调用的结果责任由当前有资格承接者处理，不能自动 ACK 或要求已撤权消费者回来确认。首内容后失联不重发，已展示内容可追溯仍依 MODEL-M03 兑现。

验证见[控制规格](../../model-contract/SPEC.md#控制取消与晚到事实)、[恢复规格](../../model-contract/SPEC.md#换代恢复和耐久)及[消费验证](../../model-contract/verification/README.md#持续验证义务)。

<a id="flow-md05"></a>
## 双路径 ACK、未知回执与清理

承接 J-MD06，能力为 CAP-MD09、CAP-MD10、CAP-MD11、CAP-MD12。Model 的保管责任不能因域外工作结束、无人读或句柄为零解除。ACK 必须晚于整调用真实收场和当前合法消费者可靠承接。

```mermaid
sequenceDiagram
  participant M as Model原结果保管
  participant C as 当前合法消费者
  participant D as 消费持久保存侧
  participant K as 模型清理责任
  M-->>C: 整调用已收场结果及原身份
  alt 先完成原用途处理
    C->>C: 完成处理，失败或中断也保留真实后果
    C->>D: 保存契约需要的处理结果及完成事实
    D-->>C: 可恢复的完成依据
  else 先可靠保管再续处理
    C->>D: 所需内容或可靠引用、原身份及范围用途位置
    D-->>C: 确认可恢复承接，含必要引用期限
  end
  C->>M: ACK原结果，核对当前消费资格
  alt 非当前消费者或调用仍输出重试
    M-->>C: 拒绝ACK，继续原执行及保管
  else ACK条件成立
    M->>M: 持久确认生效，禁止新完整结果领取
    alt 确认回执到达
      M-->>C: 已确认，清理和结算分别可查
    else 确认回执未知
      C->>M: 按原调用查询或重复ACK
      M-->>C: 原确认事实或真实未知，不重新执行
    end
    M->>K: 续做副本清理，保护已有真实读写及未知提交
    alt 清理条件满足且无故障
      K-->>M: 本次无用副本释放，原身份与账目保留
    else 在读写或清理失败
      K-->>M: 待核实或待清理及具体阻碍
      K->>K: 恢复后继续，不回滚ACK、不等原消费者在线
    end
    C->>D: 后续处理或换代从消费侧接续
  end
```

消费者在处理或保管失败时不能走 ACK，模型继续保管；完成处理路径不强制永久保存原全文。ACK 两路径均无强制聊天消息或域外工作终局门槛。模型侧新的完整结果领取在确认后禁止，已开始真实读取不能被截半；权限变化仍依原访问契约，不能恢复已撤权者。

未知 ACK 先核实原身份，持久确认丢失不能当未保存。真实写入未知时不能报告全部释放。清理只释放本次无用副本及引用，不删消费侧、原历史、别的调用内容和正确结算需要的资料。闲置句柄不永久占用，未知费用已能独立续结时不扣住无关全文。确认、物理清理与结算独立可查。

提交与读写竞态顺序、消费认领和稳定引用依 MODEL-M02，存储须兑现已确认事实的进程、操作系统崩溃及断电耐久；介质损毁另验。验证见[交接与清理场景](../../model-contract/verification/README.md#持续验证义务)。

<a id="flow-md06"></a>
## 真实费用、资格查询与诊断

承接 J-MD07，能力为 CAP-MD04、CAP-MD11、CAP-MD12、CAP-MD13。账目拥有者从原调用和各次真实发出投影费用，诊断不代账。这里的账目角色不指定包、后台服务或数据库。

```mermaid
sequenceDiagram
  participant M as 原Model与供应商适配
  participant B as 原调用费用事实
  participant Q as 账目查询拥有者
  participant D as 诊断入口拥有者
  participant A as 当前读取及外传资格
  participant U as 查询主体
  M->>B: 原dispatch实际用量费用或未知，迟到更正另留来源
  Note over M,B: 真实重试可有多笔，多观察者不重复记费
  U->>Q: 查询自身或合法组织范围的成本明细
  Q->>A: 核账目范围与主体资格
  alt 允许且事实可读
    Q->>B: 读取最小归属和账目字段
    B-->>Q: 实际费用及未知项
    Q-->>U: 合法账目投影，不含请求全文
  else 无权或读取不可用
    Q-->>U: 拒绝或未知，不填零
  end
  opt 另行请求诊断
    U->>D: 具名诊断用途和字段
    D->>A: 独立核每项披露及外传接收方
    alt 诊断契约已采用且当前允许
      D->>M: 读取契约允许的阶段和尝试事实
      M-->>D: 授权事实与记录缺口
      D-->>U: 按披露契约返回
    else 字段未获采用、无权或不可用
      D-->>U: 明确不能提供，不借账目资格放行
    end
  end
```

组织成本及明细可见不授请求内容权，遥测接收方改变需重新满足外传条件。凭据只保留合法绑定关联，不用秘密值作追踪键。费用迟到不受域外工作终局阻止，清理不抹必要结算资料；账目恢复和重复查询不重执行、不复活业务。

完整列表和物化按实际量评价。模型 TTFT 与端到端首次输出分开，排队、转换、组装、发出、重试和清理分别有定位事实。具体指标尺度与后端不在图中补定。

持续验证见[费用及保护](../../model-contract/verification/README.md#持续验证义务)、[合法选择与投影缺失](../../model-contract/verification/README.md#验证与待闭合输入)与[观测规格](../../model-contract/SPEC.md#观测资源与验证)。费用去重及清理接续继续依 MODEL-M02；秘密绑定精确形状继续依 MODEL-M04。

## 请求准备与发送复核

本图细化 [flow-md02](#flow-md02)。F 是原发起协调者，持有扩展位置；压缩、扩展内部调用和独立程序各保留自己的原位置，不因此启动新的主流程。Context 的职责是组装及压缩，不执行扩展或受理 ModelCall。

```mermaid
sequenceDiagram
  participant F as 原发起协调者
  participant C as Request Context
  participant P as ModelProfiles
  participant X as 本位置扩展执行者
  participant V as ModelRequestPreparation
  participant R as ModelCalls
  participant H as Model执行宿主
  participant S as ModelSendBoundary
  participant T as ModelTransport
  participant D as ModelCommands
  F->>P: resolve 当前路由和模态依据
  P-->>F: 固定档案或明确不可用原因
  F->>C: 按固定依据组装及必要压缩
  C-->>F: 候选、采用及尚待媒体核验的事实
  opt 本位置有获准扩展
    F->>X: 执行本次模型前扩展
    X-->>F: 原候选或修改及依据
    F->>C: 必要时重组装，不重触发同次扩展
    C-->>F: 最终候选
  end
  F->>V: prepare 完整候选及当前模态依据
  alt 明确不合法或所需依赖不可用
    V-->>F: 原因，未受理且未发送
  else 校验当前可知事实通过
    V-->>F: FixedModelRequest，不带预算
    F->>R: admit 固定call、operation、consumer与容量
    R->>D: 可靠受理并保留待办
    D-->>R: 已受理或原提交未知
    R-->>F: 原受理结果，未知按原身份核实
    R->>H: 已确认受理后schedule；通知丢失由扫描补齐
    H->>S: 原dispatch的send
    S->>T: prepare后materialize
    T-->>S: 物化回执或失败
    S->>D: recordMaterialization
    D-->>S: 已提交依据或未知
    alt 物化或提交不能确认
      S-->>H: 不发送，原位置失败或待核实
    else 已提交且当前资格和取消围栏允许
      S->>T: start立即发出
      T-->>H: 原dispatch流事实
    end
  end
```

Context 在请求前使用同一计量规则来选择或压缩表示。最终 prepare 失败若仍能按已有策略调整，由原协调者交回 Context，再判断最终输入；不把预算策略交给原发起者，也不循环执行同次扩展。无合规候选则回原用途失败，原历史不删。

deferred-media 只表示已经检查可知事实且列出了必要待核验引用，不表示完整请求已通过。Model 受理后，发送提供者读取内容并按实际 payload 重计；失败仍是未发出失败，不删除历史、不擅自改输入或重跑工具。准备结果和物化回执都不是永久发送许可。

目录和通知不参与授权。实际 start、首内容接收及 preserve 分别有时点；未知发送不转换成 not-sent，接收窗口不确定继续约束恢复。原消费者只依赖 admit/inspect/observe/read/ack，不驱动内部发送步骤。

<a id="flow-md07"></a>
## 两种独立调用

承接 J-MD04..07。独立程序选择是否需要托管，二者都不创建隐式的域外工作身份。两种路径的输入合法性、当前访问和真实发送规则一致，恢复与保管责任不同。

非托管 executeModel 已实现。下面的完整托管路径仍是目标行为。createModelRuntime 已实现受理、查询、取消意图、原流保存与最小实例观察，已支持[有限的原终局收场](../SPEC.md#已实现的调用收场)，结果读取与 processed ACK 已实现，retained ACK、自动清理及恢复仍未实现。

```mermaid
sequenceDiagram
  participant C as 独立程序
  participant E as executeModel
  participant T as 显式ModelTransport
  participant R as ModelRuntime
  participant S as 程序自己的持久消费侧
  alt 非托管单次执行
    C->>E: 固定请求、transport、signal
    E->>T: prepare并materialize
    alt 拒绝或start前取消
      E->>T: 释放已取得资源
      E-->>C: not-started及原因
    else 最终资格允许
      E->>T: start一次
      loop 非终局事实
        T-->>E: 规范化非终局事实
        E-->>C: 原非终局事实
      end
      T-->>E: 首个真实终止
      E->>T: 结束读取并尝试两级close
      E-->>C: 原终局，无自动重试和ACK
      C->>S: 按自己的交付承诺保存必要事实
    end
  else 托管独立调用
    C->>R: admit原call、operation及consumer位置
    R-->>C: 原受理结果
    C->>R: inspect或connect后observe
    R-->>C: 原状态、已保存输出及终局
    C->>R: beginRead/readNext
    C->>S: 完成处理或可靠保管
    S-->>C: 可核验承接依据
    C->>R: acknowledge原结果版本
    R-->>C: ACK及独立清理状态
  end
```

非托管调用的 signal 取消只请求实际停止，完成竞争保留真实结局，失联不冒充停止已确认。需要发布给用户的独立程序自行兑现保留责任；需要故障恢复、有限重试和结果保管时选择托管路径。流迭代器提前退出须结束本次读取并释放所持资源，不能证明已撤回供应商执行；实际资源终止仍沿传输协议。

独立执行在终局交付前完成全部清理尝试。清理失败保留原业务终局，后续 next、return 或 throw 报固定安全异常；消费者早退则在该次推进报告。原生 generator 的 return 等待已排队的 next，不提供抢占或关闭时限。具体边界归 [独立执行规格](../SPEC.md#独立执行)。

托管程序退出不取消调用。恢复用原 admission/consumer 找回，不以新 call 重试未知受理。两条路径都按真实费用记账，未获得托管身份的事实由调用者持有独立关联，不能伪造 dispatch 进入他人原调用。

<a id="flow-md08"></a>
## 宿主启动、接续与退出

承接 CAP-MD07、09、10、11、12。调用、控制、保管、清理和账目任务可以由后继宿主接续；活体目录不是恢复清单。

```mermaid
sequenceDiagram
  participant A as 装配拥有者
  participant P as ModelProvider
  participant D as ModelCommands
  participant H as 已绑定宿主
  participant R as ModelDriver
  A->>P: recover指定租户
  P->>D: scanPending并loadRecovery
  D-->>P: 原身份、未决操作与各类待办
  P->>D: 核实原提交，不取得执行代次
  P->>H: schedule原tenant和call
  H->>H: authority认回稳定claim操作及可信continuity
  alt 无法取得合法接管依据
    H-->>P: 保留待办，明确未知或不可用
  else 可以推进原工作
    H->>R: drive受信输入
    R->>D: claim或按原operation认回
    D-->>R: 当前ExecutionRef
    alt 已ACK且只需清理
      R->>D: advanceCleanup使用有效代次
    else 仍有合法执行待办
      R->>H: publish当前handle
      R->>D: 沿原待办推进，发送仍核围栏
    end
  end
  A->>P: quiesce停止新业务受理
  P-->>A: 真实pending和running
  A->>H: close停止新派发并等待在途交还
  H->>H: 条件撤除本绑定贡献
```

清理推进和模型再次发出是不同责任。后继清理同样须取得有效 execution generation，不复用被排除的旧实例；取得清理推进权不使已终局调用重新可发送。recordLateFact 只核当前访问和可信原来源，不授旧执行者推进权。

已受理但 schedule 通知丢失，由持久待办扫描补齐。recover 不从 ModelDirectory 的空结果推断原工作不存在。策略已有决定则恢复原决定，未决先 inspect 原 RetryPosition；没有策略能力时明确不再试，不能阻塞原结果查询。控制先成立时不再发送，已 ACK 只推进清理与必要账目。

quiesce 后已受理工作仍可派发。装配者可以先排空，也可关闭绑定并把未派发工作留给后继；后一种情形须报告未完责任，不称排空成功。quiesce 不等于取消、ACK、清理完成或真实外部停止。依赖突然丢失按原操作返回未知/不可用并保留责任；计划退出按 [Cordis 装配](../../model-cordis-contract/docs/cordis.md)释放本贡献。后继使用同一耐久权威，不能用空内存实现宣称已恢复。

<a id="flow-md09"></a>
## 模态投影与性能观测

承接 CAP-MD05、12、13。运行时上下文提供方交出历史模态投影，Model 接收它并按档案求合法列表；调用方用它查询合法模型。投影的形成、保管和重建在 Model 之外。

```mermaid
sequenceDiagram
  participant P as 运行时上下文提供方
  participant S as 选择协调者
  participant M as Model档案求值
  P->>S: 交出历史模态投影及来源；读取失败则明确未知
  S->>M: 沿接收的投影与来源求合法列表
  alt 投影缺失或不可读
    M-->>S: 不放行，返回缺失或未知
  else 投影可用
    M-->>S: 合法目标、来源和当前选择状态
  end
```

投影缺失或不可读时，Model 不把它当作空历史放行。Tool 内容 ref 只用元数据参与相容性；附件地址不增加媒体模态。

观测按原 call/dispatch 关联 prepare、排队、物化、start、供应商首内容、持久发布及清理。供应商 TTFT 与入口到首输出分别计量；跨时基不能直接相减。费用/阶段事实供合法投影，原文、秘密及附件地址不进入普通遥测。记录缺项返回未知；详尽诊断字段与保留策略的缺项见[诊断约束](architecture.md#identity-neighbor-diagnostics)。

## 完整计量与流归约

请求组装方在请求前按供应商固定计量组合，将完整组装输入转换为该表示的 tokenInput。具体 meter 按需调用 tokenizer，并计入模板、工具声明与媒体贡献。缺媒体事实时明确 deferred-media。实际发送阶段取得内容后只编码 payload，不重新计量。物化回执提交后沿发送围栏推进。

可选历史校准只有在原请求/响应、统计口径、完整输出组和相同适用依据均可证明时才使用。条件失效先回完整计量；不要求 Context 或原发起者驱动另一套增量 API。失败及精度规则见 [计量协议](../../model-contract/SPEC.md#可选校准及不可解释的历史)。

一段 append 文本的正常顺序是 block-open、block-delta("你")、block-delta("好")、block-seal("你好")。每步归约后的快照依次为 ""、"你"、"你好"、完整文本块。replace 块每次交新的完整在途值，不能走 append 路径。解码、runtime 映射共享步骤并固定序号、合法性归约、持久 preserve、观察发布按此顺序进行；供应商 finish_reason 后的合法用量尾帧仍属于原 dispatch。

## 家族适配的装配与一次发送

此图细化已采用 pi 技术栈的提供者路径，包职责见[组架构](../../docs/architecture.md#厂商适配的内聚范围)。家族名称不代替精确型号或实际服务商绑定。普通调用者与 adapter 作者消费 model-contract；选择实际工厂是装配者的责任，契约导入不触发装配。

```mermaid
sequenceDiagram
  participant A as 发行或独立程序装配
  participant F as 选中的厂商家族包
  participant K as Tokenizer引擎adapter
  participant P as 共享pi传输
  participant M as Model发送提供者
  A->>F: 取得精确型号与路由的适配贡献
  F->>K: 固定资源和配置，初始化并核验
  K-->>F: ModelTextTokenizer或明确失败
  F-->>A: 相容定义、meter、投影与响应解释及资源责任
  A->>P: 用显式家族贡献与运输依赖构造
  P-->>A: ModelTransport及装配资源拥有者
  M->>P: prepare固定请求与供应商
  P->>F: 使用原绑定的参数、消息和工具规则
  P-->>M: 待物化计划，未读媒体
  M->>P: materialize，完成连接准入与资源预约
  P->>F: 按实际表示编码 payload
  F-->>P: 请求 body 与实际序列化字节
  P-->>M: 物化回执（供应商、表示采用与 payload 摘要）
  M->>M: 持久提交、接收窗口及当前发送围栏
  M->>P: start一次真实发出
  P->>P: HTTP/SSE与有界读取，按家族规则解释
  P-->>M: TransportFact及真实终止
  M->>M: 共享到达映射、preserve及原结果保管
```

不需要本地 tokenizer 的 meter 明确采用对应方法，装配不虚构 count 实例。家族解释不执行隐藏网络调用或重试。发送资格、费用归属、控制、首内容和 ACK 继续沿本成员契约；包边界不另造这些规则。

## 契约消费与运行装配

```mermaid
sequenceDiagram
  participant A as 应用装配
  participant C as model-cordis-contract
  participant H as model-host-local
  participant M as model领域实现
  participant D as 已选择的端口提供者
  participant U as 原发起者或独立调用者
  A->>D: 取得commands、send、retry等依赖
  alt 不使用Cordis的托管程序
    A->>M: createModelRuntime(显式依赖, 配置)
    M-->>A: ModelProvider与ModelRuntime
  else Cordis单机宿主
    A->>H: 装载 ./cordis 具体插件与配置
    H->>C: 装载定义自有目录，业务门面继承唯一Service
    H->>M: createModelRuntime(注入依赖, 配置)
    M-->>H: ModelProvider与ModelRuntime
    H-->>A: 发布能力，按协议驱动恢复与调度
  end
  A-->>U: 注入符合model-contract的操作对象
  U->>M: 用主体、租户、原call及请求调用公开操作
  M-->>U: 沿共同契约交回结果或失败
```

ModelDependencies 和 ModelConfiguration 是 model 工厂的构造输入；每次请求、主体、租户和原调用身份是操作参数，不藏入全局 Context。不使用 Cordis 的托管程序也必须显式提供实例宿主、时钟和持久端口，不能以空实现假装耐久。直接 executeModel 则沿原独立单次路径，不暗建托管 runtime。其他实现可以使用不同构造方式，但必须兑现 model-contract 的行为。

插件撤除沿原资源交接和登记协议退出，不消除尚未承接的保管责任。分包不改变这些时序，也不把一次物理发送变成可撤回动作。两个契约包已实现各自的公开接口，宿主与托管运行尚未实现，图是目标装配设计。

## FLOW-MD10 持久操作与流交付

图示采用同一存储提交内的资格参加者和原调用事实。后端不具备该组合时不能声称通过。

```mermaid
sequenceDiagram
  participant C as 原发起者
  participant R as Runtime
  participant S as Commands与存储参加者
  participant H as 独立Model宿主
  participant D as CallDriver
  participant T as 发送边界
  C->>R: admit(原operation与固定输入)
  R->>S: 条件受理并提交容量和待办
  S-->>R: 原受理结果或提交未知
  alt 已确认受理
    R->>H: schedule(tenant,call)
    H->>D: drive(受信身份与continuity)
    D->>S: 核未决操作并claim
    D->>T: 准备和物化
    T->>S: 提交物化回执与接收窗口
    alt 提交已确认且当前资格成立
      T->>T: 围栏内同步start
      loop 有界读取
        T-->>D: 原dispatch流事实
        D->>S: preserve批次和游标
        S-->>D: 已耐久快照
        D-->>C: 发布已保存的内容
      end
    else 未知或失权
      D->>S: 核原操作或保存未发送事实
    end
  else 提交未知
    C->>R: 查询原operation，不换身份重发
  end
```

调度失败不撤销已持久受理，pending扫描负责补排。观察者退出不终止收集协程。读写背压只影响当前调用的资源；不能把未保存输出扔给观察者以腾空缓冲。

## FLOW-MD11 单机换代与清理接续

```mermaid
sequenceDiagram
  participant A as 装配协调者
  participant O as 旧提供者与宿主
  participant N as 新提供者与宿主
  participant S as Commands
  A->>O: quiesce停止新业务受理
  A->>O: binding.close停派发并等待原驱动交还
  alt 原进程正常排空
    O-->>A: 资源和原贡献已交还
  else 原进程失联
    A->>A: 取得进程已退出或全部发送能力已撤销的证据
  end
  A->>N: 构造并bind(driver)
  A->>N: recover(当前宿主资格)
  N->>S: scanPending与loadRecovery
  N->>S: 核原operation、旧写入与执行排除
  alt 已ACK
    N->>S: 续做清理及迟到账目
  else 原发送或首内容不确定
    N->>S: 保存未知收场，不重发同一回复
  else 可证明尚无内容且允许重试
    N->>S: 按原策略和次数形成下一合法dispatch
  end
```

心跳超时、查询失败和锁租约到期均不足以走“旧执行已排除”分支。无证据时后继保留阻塞原因，控制、原结果查询和依法保管仍按当前能力处理。恢复不会把清理待办转换为执行待办。

<a id="credential-resolve"></a>
## 凭据解析

承接已接受的[凭据对象](object-model.md#已实现的凭据对象)。每次获准的真实发出都重新解析。同一次发送的后续输出不再解析。存在性查询是另一次操作。发送本身只调用 `resolve`。

```mermaid
sequenceDiagram
  participant Call as 调用记录
  participant Keep as 本地保管库（model-host-local）
  participant Send as 发送端
  Note over Call,Keep: 存在性查询单独发生
  Call->>Keep: present
  Keep-->>Call: 是否存在，无秘密
  Note over Call,Send: 获准的真实发出
  Call->>Keep: resolve
  alt value
    Keep-->>Send: 仅本次的值
    Send->>Send: 发出并记下该值
  else absent unreadable denied unavailable
    Keep-->>Call: 该种类
    Note over Send: 不发送
  end
```

轮换后的下一次解析看到新值。撤销后的新解析是 `denied`。已经记入发送端的那一次保持已发送。进程重新打开同一保管库后，按打开时的绑定读取。关闭后的新解析停止，不改写已经发出的记录。
