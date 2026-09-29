# refusal 是独立文本增量字段，不自带本项目收场映射

- 调查对象与日期：OpenRouter Chat Completions 官方OpenAPI/流文档及官方TypeScript SDK；2026-09-29。
- 版本：docs `58426585252517e9cc38993b8c2681b355a960b0`；SDK `17de251b8db278092c401347c9444741f155214d`。
- 消费者：[传输提供者映射](../../design/realization/packages/model/pi-ai-transport/v14-refusal-design.md)，不涉及新的安全平台。
- 当前结论：官方将delta.refusal定义为可缺席、可null的拒答消息字符串增量；SDK解析并交给消费者，未把它当自动终止或转成content。映射到本项目可显示文本在载体上可表达，但其来源区分、顺序、首内容与收场仍需显式选择。真实Opus当次成员内容依然未知。

## 问题与区分条件

本研究区分“官方允许某种refusal形状”“SDK会如何读取它”“本项目既有契约可以表示哪些事实”和“真实那次响应是什么”。前两项可由固定primary源回答；第三项只能界定设计空间；第四项没有raw证据，不能猜测或付费补取。

## 当前结论

### R1 官方 refusal 值域是可缺席的 string 或 null，语义是拒答消息增量

OpenAPI ChatStreamDelta给refusal的说明是拒答消息增量，类型string/null且非必需；ChatAssistantMessage另将refusal说明为内容被拒时的拒答消息。SDK的Zod schema与可选TS类型一致。数组、对象、false、0不在该声明域；空串没有minLength约束，故在类型层合法。

这支持“合法非空refusal字符串是消息文本的增量”这一判断；不是布尔过滤旗标，也不应由此生成一个未收到的拒答句子。**“给用户显示”是本项目交付选择**：官方描述和字段类型足以支持文本候选，不是逐条内容展示许可、可见性标注或具体安全原因证明。

- 适用范围：本轮固定官方OpenAPI与SDK Chat Completions类型；不宣称每个provider都严格遵守。
- 代价/不适用：旧实现把空数组忽略的兼容行为不来自此官方值域；候选若收紧须显式处理与原已接受行为差异，不能悄改。
- 依据：[E1](evidence.md#e1-字段类型与含义)；最近核对2026-09-29。

### R2 refusal 与 content 为独立成员，没有查到互斥或相对顺序承诺

同一个ChatStreamDelta同时有可选content、reasoning、refusal、tool_calls；OpenAPI没有用oneOf或条件约束将content与refusal互斥。SDK按对象schema分别解析，亦无该项互斥检查。

**源码/Schema允许二者同对象，不等于证明真实provider会同时发送。**JSON成员排列不提供模型生成先后。未查到refusal必须先于/后于content、必须独占整个choice、或一出现便禁止后续content的官方规则。流中的不同帧有读取先后，但同帧两种片段的串接/分块仍是适配语义，不能凭对象key顺序补造。

- 适用范围：已读OpenAPI相关schema、官方overview/streaming与SDK低层reader；负面结论为限定范围内未找到，不是所有OpenRouter实现不存在约束。
- 代价/不适用：直接丢弃其中一个字段会丢可见事实；自动合并会丢来源区分，并引入同帧次序选择。
- 依据：[E1](evidence.md#e1-字段类型与含义)、[E3](evidence.md#e3-官方-sdk-reader-行为)；最近核对2026-09-29。

### R3 refusal 不等于某个 finish_reason，也不是传输错误字段

OpenRouter overview列出规范化finish_reason的五个名称：stop、length、tool_calls、content_filter、error；native_finish_reason为供应商原始收尾词。refusal是delta的字符串成员，finish_reason是choice的另一成员。所读primary来源没有定义两者的必然映射，也没有证明一段refusal必须由安全过滤引发。

官方流文档把中途错误表述为顶层error及相应error收尾。SDK对合法refusal不专门抛错；这说明reader能交付这个字段，**不证明其业务结果必定成功**。content_filter也不能仅因有拒答文本便自动改作stop。

- 适用范围：Chat Completions规范结构和读取机制；不套用Anthropic原生stop_reason的含义来推导OpenRouter映射。
- 代价/不适用：看到字段名就伪造statusCode、安全原因、error内容或finish_reason没有来源；有文本也不能抹去同帧真实error。
- 依据：[E2](evidence.md#e2-收尾计量与顺序)、[E3](evidence.md#e3-官方-sdk-reader-行为)；最近核对2026-09-29。

### R4 正常流的 usage 在 DONE 前另有末尾帧，重复 finish_reason 不是第二次收尾

固定官方streaming文档明确Chat Completions的末尾usage帧在[DONE]前，choices非空、delta不携内容，并重复finish_reason/native_finish_reason；overview也称usage在最后一帧一次给出。由此，收到finish_reason就停止读取可能拿不到之后的真实计量。

这是正常完成流的协议说明，不是取消、连接中断或协议失败后必然还能取得usage的保证。文档另写中途error后终止；SDK解析异常会cancel上游。**接受合法refusal后沿正常流读取后续usage**与**已有协议错之后继续排空未来usage**是两种独立决定；后者仍需定义可终止行为，不能从前者偷偷带入。

- 适用范围：OpenRouter Chat Completions；Responses/message API有不同事件终点。
- 代价/不适用：本次真实Opus是否存在后帧usage未知；不能把账未知改零，亦不能因文档说正常流有usage而假称本次已丢账。
- 依据：[E2](evidence.md#e2-收尾计量与顺序)；最近核对2026-09-29。

### R5 官方 SDK 的低层 reader 保留 refusal，既不自动显示也不自动拒绝

实际路径为chatSend的SSE匹配→响应schema创建EventStream→每条data JSON解析并按ChatStreamChunk/Choice/Delta验证→产出chunk；只有[DONE]在该回调返回done。refusal和finish_reason都没有专门结束分支；合法refusal字段保留在delta中交付，usage按chunk成员交付。值型不合schema、JSON坏或读取异常进入EventStream异常路径并cancel，不无限drain。

这是**源码阅读推导**，没有安装/运行SDK。SDK文档示例通常只打印content，不能把该示例省略refusal当成协议不支持；Responses专用stream-transformers也不是这个Chat reader，不能偷换证据。

- 适用范围：SDK固定commit的低层chat.send流，不推广其高级Responses/Agent helper。
- 代价/不适用：SDK没有替本项目选块类型、可见性、同帧顺序或MR outcome；采用其解释空间不等于采用SDK库、重试或其他缺省策略。
- 依据：[E3](evidence.md#e3-官方-sdk-reader-行为)；最近核对2026-09-29。

### R6 CB3能表达拒答字串，但MR9收场及拒答来源是否需持久仍不是协议决定

CB3 S8的text是给人和模型看的一段字符串，允许空串，因而**若候选决定把合法refusal增量作为普通可见文本**，现有文本载体能保存其字面内容；不必仅为string字段出现便推导第八种块。反面是：text本身不记录其来自refusal还是content，现有origin四枚举都与命令/skill有关，不能冒用或自添refusal。

需纠正任务简称：**MR9 S12 outcome实际闭合四值complete/truncated/interrupted/failed；三值是reply.ending**。S13要求complete/truncated有reply和首内容，failed后无reply、首内容后故障保留delivered且cause=interrupted_mid_reply。拒答字段不是第五种收场，也不能单独选择现有四值之一。若后来正常完整收尾、到限、用户取消或故障，各自能否映射现有形状取决于候选明确采用的终止/首内容规则；stopReason保留排查信息而不替代outcome权威。

- 适用范围：现行CB3、MR9和消息MS6字面契约承载力，不是新映射接受。
- 代价/不适用：若要求耐久区分“拒答来源”或还原两种字段，普通text独自不够；是否必须保存该区别由已授权语义决定，不能研究阶段擅自加schema或过滤平台。
- 依据：[E4](evidence.md#e4-本地契约及实际诊断边界)；最近核对2026-09-29。

## 未知与边界

当次 Opus 的 refusal 值型、字面、同帧关系和后续用量仍未知；不读原始付费响应、不重发请求。正常字符串域足以供提供者映射起草；若上游实际返回非法类型，支持合法字符串仍不会把那次请求变成成功。本轮没有政策接受或实现验证。
