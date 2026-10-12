# Message 当前采用边界

当前公开类型和 Schema 由本包拥有。F0 的消息／非消息隔离要求已按负责人明确要求采用；实现检查与交付 review 分别记录在任务 tmp。

## MS9 的限定变化

当前 Schema 身份为 `data.messages/v9`，默认公开入口仍是 `./schema`。包内只维护一份当前 Schema，不新增旧版执行入口。

相对既有 MS8，只有以下行为和形状变化：

- `AttemptStartedSource` 不再是 Message 的组成部分。`ReminderSource` 与 `SystemReminderMessage` 的来源枚举均不接受 `attempt_started`。
- 使用该来源的原 SystemReminder 在当前 `validate` 中失败，`judgeMessage` 返回 `malformed`。不会自动转换成其他 Message。
- Attempt 开始由 `session-runtime` 的具名事实 codec 拥有；作为 Session Log 的 fact 保存，不由 Message codec 或模型传输过滤器接管。
- 当前 Message 日志封装由 `session-log` 拥有，使用 `owner=messages`、`version=9`、`kind=message`。messages 不拥有 fact 分支，不能以该分支绕过 Message 校验。

其余 MS8 的形状、业务提醒、原 response、ACK、参数和无损表示承诺继续有效。下方行为承诺接续未改变部分，公开类型和必要校验拥有当前形状。既有传递依赖所需的 v6／v3／v2 Schema 仍保持精确字节，不提供旧执行 codec。

## 验证义务

当前公共定义为 53 个。测试应精确核对从 MS8 到当前 Schema 的身份变化、一个定义删除及两处引用删除，来源数量说明同步从十一种改为十种；其余整个 Schema 结构必须相等。历史规范行中 Attempt 提醒的三个正例改为明确拒绝，其他行保持原要求。真实模型请求必须保留业务提醒并排除 Attempt 事实；单一 Schema 校验不证明当前授权、日志同提交或模型调用行为。

## 消息身份与不可变日志

MessageId 在会话日志内逐码点唯一，不从字面解析租户、顺序或归属。消息内 BlockId 的唯一范围包括全部嵌套／派生块；createdAt 是完整消息形成时刻，不决定日志顺序。块次序保留，落盘后全部消息／块成员不可改。SystemMessage 每次组装现算，只含文本，不进会话日志。

各侧只读实际块标注和压缩名单，不从 Message 类型推给谁看；tool_internal 的 toModel=false 是硬约束，其余常见标注不作为默认授权。顶层合法块类归 Schema，origin 只在 User 顶层文本，嵌套仍守 content-blocks 规则。

消息没有租户、Session、Run、attempt 或作者，归属来自记录壳。source 中的 SessionRef／AgentRef 只指认，不授访问资格；不得从正文、标识、来源或流序猜归属。

## 回复、工具与过程消息

回复流正常 end 落 complete，max_tokens 落 truncated_at_limit。仅用户叫停或用户取消 Run 且已有内容交给用户，才落 interrupted_by_user；零内容不造空消息。系统归档／宿主停止以 lost 处理，无 Message、模型响应按 interrupted/run_cancelled 结算；故障断流也不造 Message，已交付部分归响应证据。complete 禁半截工具调用；非 complete 至少一块，中断回复内完整调用也不得执行。

同一 ResponseId 至多首次发布一条权威 AssistantMessage。响应 reply 保留原模型证据，消息保留原 id、response、块次序及全部原成员；只允许首次落盘前在原本无派生属性的合格媒体块上，依 content-blocks 的规则成对新增真实转换产物，不增删／调序原块、不剥已有派生比较、不回补历史。新增派生须真实来源、写入资格与整消息 id 唯一；producedBy 自报不证来源。正式组装只取唯一 persisted 消息，响应证据不算第二条。

工具真实结果按有没有既有占位决定去处：没有则 ToolMessage，已有 backgrounded 占位则唯一后台收场提醒。interrupted／abnormal_interruption 占位没有后续真实结果；卸载摘要是真结果，不是占位。ToolMessage 恰一结果块，terminated_by_agent 只能在后台提醒，不能在 ToolMessage。等待答复是原输入，不另造一种消息。

过程流非空才形成 ToolInternalMessage，不论执行本身成功或失败。过程 ending 与执行 outcome 独立：仅有意停止为 interrupted，失联、无应答、桥换代、宿主撤下或帧发送失败为 lost；工具返回失败仍可能有 complete 过程消息。发送帧失败不改变执行结果；停机丢失的未封口过程不落盘、不恢复成消息。

## 提醒、来源与感知

系统提醒正文供模型读，source 供系统判断，不解析正文寻事实。提醒一律追加，不按同来源仅留最新。来源闭合，已有系统来源不得借 extension 绕过；未知不当 extension。Extension payload 不透明，缺席与 null 原样区分；该件声明 event／state，说 state 须在正文交代变化。

runtime_context_changed 的 previous 与 current 必填，缺 previous 不等于 null。产生者须在正文说清从什么值变成什么值，只有“状态更新”不够。lastPerceived(block,P) 取完整日志前缀内最近 changed 的 current 或含该 block 的 snapshot 值，没有才 null；不按压缩后的模型可见视图算。空闲推送变更丢弃，下一尝试拉当前值，仅真实不同才追加变化；snapshot 是全量当前值、不伪作一次变化。结构合法不代替产生者核值相等和真实来源。

background_execution_finished 的 source.callId/outcome 与唯一结果块一致，结果仅 completed／failed／interrupted／no_answer。background_execution_interrupted 是恢复或有序撤下代落，结果为 failed＋abnormal_interruption，不冒称用户中断。两种合计同 callId 至多一条，必须在 backgrounded ToolMessage 后；系统依据结构化来源判是否已结束。

一次模型调用被中断或整个 Run 被中断，各追加对应层次的一条 interrupted 提醒，包括故障、截断或没看到任何内容的情况。Run 在调用间中断也追加 what=run 的提醒，about 可缺席；同一调用重试期间失败的 dispatch 不逐次另补提醒。用户和系统 by 区分；工具执行由占位／后台提醒交代，不另补模型式提醒。其他来源的有效形状和配对由当前公开定义约束；Attempt 事实明确排除，不能重引旧提醒。

## 压缩、可读性与完整前缀

块对模型可读，当且仅当该消息／块确实存在于完整前缀、它和全部祖先 toModel 为真、路径上没有被 silenced 的块。只有压缩可使既有可读块失读；不能只读最后一条压缩后面的日志，readable 也只是最终模型选取的必要条件。

压缩在追加／导入／复制的每个边界验证原完整前缀。名单不点自己、不点前缀外消息、不点不存在的块、不点该前缀仍悬着的后台占位及其任意子块／尚未答完卡片、不点最近模型请求当时尚未存在的消息；没有先前请求时名单必须空。卡片状态或请求边界等必要外部事实缺失须 undetermined，不能放行或补默认；非法名单不得修好再写。已不可读的块再次点名合法，作为无效果操作；落盘名单不事后作废。后来的后台结果不改变原追加点仍悬着的事实。

日志追加拥有者还须守七条跨记录不变量：MessageId 唯一；每条 ToolMessage 指向前面的顶层完整调用且同 callId 至多一条；每条 ToolInternalMessage 同样配对且至多一条；后台提醒在同 callId 的 backgrounded 消息后且两种合计至多一条；同 ResponseId 至多一 AssistantMessage；每份压缩名单对原前缀合法；没有 SystemMessage。违例是日志不一致，不是单条形状错误，消费者不得挑一条信。

## 技术记录、创建和引用

模型调用技术记录不是消息，不进组装或呈现，仅供对账。当前八种公开 kind 的形状归本包；原 immutable 绑定、快照和 requested parameters 在同调用不同 dispatch 上完整相同，credentialScope 可按实际发出不同。记录中的 parameters 是交适配前要求，实际发送计划由原 adjustments 的 sent 替换并删 dropped 项，空 extra 消失；名单唯一互斥，缺席表示确知无变化，不以空数组表达。

dispatched 责任锚先于发送、opened 先于内容交付、interrupt_intent 先于信号、selection_changed 先于生效。固定 adaptation 两处完整相等且 modelId 与 route 相同，精确配置与所有 cap／上游事实完整复制，不恢复最新目录。责任锚不证明网络实际开始；真实发送与费用归模型运行时。

ended 的 undispatched 只用于未发出，带出门前 cause；released 用于已有发出后放手，cause 缺席表示旧故障后放手、credential_unavailable 表示续发前缺凭据；interrupted 只记两发出之间的中断及 user／run_cancelled。经响应体终结不另写此记录，调用终结不是 Run 终结。

CallKey 不是创建判重键或权限；CreationKey 作用域为 tenant＋Session。created 原 input 和 adopted 保留同次完整事实及 sourceVersions；rejected 不伪造 adopted。首次创建拒绝的 ended 带 creationKey 与 payload 成对；先 accepted 后首次发出拒绝不带二者，不能混为一种。原 run／attempt 同在同缺，查询位置变化不改创建壳。

ModelCallPayloadRef 指原不可变 UTF-8 JSON 字节，locator＋version 不重绑定，原字节 hash 不能替代语义摘要。写 marker 前必须核完整原内容可取，created 时刻不是 sentAt；形状成功不证内容可得或当前授权。

## 无损语义摘要

摘要 role 为 model-call-creation-semantic-sha256/v1 或 model-call-retained-result-semantic-sha256/v1，覆盖完整原创建输入或原 Pending，角色进入字节域。仅接收既有严格无损合法 JSON 值。

T(null)=["z"]，T(boolean)=["b",0/1]，T(string)=["s",UTF-16 无符号代码单元整数数组]，T(array)=["a",逐项 T 数组]，T(object)=["o",逐项[键的 T,值的 T]数组]。对象键按无符号 UTF-16 代码单元字典序，前缀短者先；数组顺序／重复保留，不 Unicode 归一。缺席不同于 null，合法转义与原字符等价。

精确数字 T=["d",S,C,E]，三项为 ASCII 字符串：合并整数／小数数字并去前导零；全零统一 S="+",C="0",E="0"；非零取原符号、去系数尾零，C 首尾非零，E 为原显式指数（无则0）−小数位数＋去尾零数。E 用无加号／前导零的精确整数十进制，零为 "0"。不经 binary64、不展开巨大指数；1=1.0，−0=0，大整数邻值仍不同。

对紧凑无空白 ASCII JSON [role,T(V)] 算 SHA-256，输出小写 64 位 hex。代码单元整数无前导零，其余文本已转整数数组，不依赖字符串转义选择；可流式，空间不依赖指数展开。密码学碰撞安全是前提，不声称 TLA 证明它。纯摘要判定无 IO／授权／修改；不同 role 不能互认，原存储字节 hash 与此摘要不可互换。固定向量保留独立原期望，生产 ACK 前仍核真实原值来源。

## ACK 原账见证与释放边界

witness 是原 ready 的最小账，不是有效费用汇总或第二份账；ResponseId／dispatch／readyPosition／payload／origin 取原 ready 来源，时间、provider、credentialScope、原 usage/cost 及所有已知可选成员原样保留，不估算、不由当前档案填。仅 complete／truncated／有回复 interrupted 有此 witness，sentAt 为真实原时刻不可 null。readyPosition 是原 Session 的日志位置，不能借别的日志同号。

ACK 壳保原创建 origin，witness 保终结 dispatch 归属；tenant／Session／Run 与 CallKey 一致，attempt 可以跨尝试不同，分别核对应来源，不整壳盲等。无 Run 不造 Run，历史其他 dispatch 仍各自结算，不按 CallKey 合并费用。

ACK target 只指整调用唯一终结 response 或唯一有效无终结响应 ended，不指先前 failed 发出；terminalState 与原目标真实状态相符。有完整原 ready 而无可独立读 final 时，原 Pending 语义 digest 与 accountingWitness 成对必有；已独立读 final 时允许同缺，原已固定见证遇到 final 先赢仍需逐值一致。ended 禁见证／摘要，不造回复或账，unknown final 不当不存在。

releasablePayloads 是完整、无重复、本调用允许释放的精确引用清单，表示可释放而非已删除；只有真实无模型自有副本时空，不能作未知默认。合法 ACK 及实际释放后，仅清单内模型副本允许 released，不据此判 callNotFound／损坏；无合法 ACK 的缺失仍沿原 unavailable／malformed。marker、ACK、final、AssistantMessage、补账不删不改，不授删除其他调用／consumer 自存／外部拥有者内容的权力。

接收先形状再核 CallKey、创建键／摘要、origin、目标、见证与清单来源；矛盾 malformed，必要来源不可核 unavailable，不以 final 优先掩盖坏见证。ACK 是独立稳定幂等事实，不与 final 键或未定处分合批、不携清理进度、不造消息／处分或授 persisted 权。排空、unknown 提交、实际停止、同提交释放与恢复归模型运行时，不在本值协议里写调度实现。

## 接收与出门

接收完整值，不删坏块留其他、不补字段或未知枚举。表示阶段依次 type_unknown → kind_unknown → visibility_missing → incomplete_call_visible → call_in_result → modality_mismatch → block_id_duplicate → tool_message_block_count → tool_internal_block_visible_to_model → reminder_nature_mismatch → reminder_state_without_previous → compaction_self_reference → malformed；表示合法之后才核前缀的 compaction_forward_reference。压缩合法性、来源真实性与日志配对另判，不能把 shape 成功当业务许可。

传输出门直接映射 system／user／assistant／tool；system_reminder 与 compaction 必先译成带系统标识的面向模型消息，不能让 agent 自认其性质。后台收场提醒内的工具结果不得再译成该 callId 的第二个上游工具回答；每家适配方都须有受支持的提醒／压缩落点，不能因不识别而丢弃。tool_internal 不进模型请求。严格无损 JSON、块规则及原值不可变在跨进程仍成立，物理到达顺序或共享对象不代替绑定／配对／租户／完整原值协议。

同一 Session 的全部副本按同一全序观察消息与技术记录。压缩判定的前缀必须恰是实际追加前紧邻的完整前缀，判定与追加在同一定序点线性化，不能在其间插入其他记录后沿旧判定写入。每个接收边界重新核消息、完整值及前缀规则，不相信远端“已验”。

关于状态提醒，snapshot 不带前值、extension state 的前值仅在正文，沿现有形状接续；此解释与 PF-009 泛称的前／现值要求仍待其产品拥有者确认（原 G11）。不得以本次迁移宣称政策已裁定，不改变现有合法值。
