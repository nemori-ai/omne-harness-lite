# 模型Runtime的限定整改输入

当前接受精确源为[RT12](../../../spec/capabilities/model-request-runtime/v12/contract.md)、MS8／MR11／CA4／SL3及registry接受条目；SPEC目前只迁入纯retryDelay，不能据此声称全部十五操作已转薄规格。
提供者现有`ModelRuntimeService`／`RuntimeConstruction`及十五操作已组合，生产G28来源、全部写方、当前主体和真实OpenRouter认证仍需宿主证据；类型不认证来源。

## 必须切换的责任

1. 十五操作公开类型从model-request-runtime-local迁到core/model-request-runtime纯根；providers实现同一接口。定义./cordis增`ModelRuntimeService`静态唯一键；函数createModelRuntime仍是独立公开能力，其consumer可不经Cordis。
2. 现有服务操作及失败联合保持其精确语义，不因移动省掉observe／read／close／acknowledge或费用。Session协调不接管模型send/retry/first-token/凭据／响应／结算。
3. AttemptStartedSource从messages移除；settlement-prefix改为Session事实＋原准入证明端口。原调用归因以历史issued证明与原固定输入核实，不能只认最新attempt作为原账归因，也不能读任意用户提交的start事实认证。
4. G28终结来源由Session唯一终态事实／同prefix端口提供；原withRun批次保持实际tail条件和原late值，迟到保存不重算成本归属。未知来源仍unavailable而非猜测未终结。
5. 模型计划只消费Session组装后的固定messages＋完整profile/tools/参数；不得重新扫描日志生成所有Session上下文，不在transport层根据字符串删attempt消息。
6. prepareCall之后实际open/dispatch的发起准入接入Session原子issued端口，并对齐原已出门锚点及唯一execution owner claim；重复证明仅可查询，不能授权第二发出；当前授权／原位置证明必需。调用的独立执行池和原ACK custody按已采用生命周期接续，不因Agent scope撤除取消。

原模型提供者实现可信OriginalIssueParticipant：在协调者给出的同实例unit内暂存原已出门及唯一执行claim，不独立commit或IO；统一提交之后由原执行拥有者发出。该窄端口及实际准入桥作为construction明确输入，不让Session读取模型私有表，也不将Session类型反向塞进独立模型核心；未来协议必须提供等价原子准入证据。原RT12的已出门、dispatch序号、first-token和恢复语义保持。
Session的保管凭证只有在原完整Pending及必要引用已可靠保存后，才可映到原acknowledgeCall接受条件；它不写replyDisposition或最终费用。ACK适配由原模型拥有者定义，不共用一个假布尔ACK。

旧有效源仍是原操作行为权威；采用切换时建立逐条保留／改变／移交表，把消费者、原验证、Schema身份及正式接受一并移动。没有接受与删后验证不删旧源；没有运行兼容过渡或两份现行承诺。

首卡需要真实生产G28／Session起止来源和准入接线；现有demo/reference适配只作已知事实，不能当完整生产宿主。
