# Content blocks 行为承诺

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 并实施第二阶段。
公开类型与当前 Schema 拥有形状。下列共享行为与调用拒绝表示同时适用；明确公开的保留 Schema 及独立规范输入继续约束相应消费者。

拒绝调用有正式的 before_action 拒绝依据，但没有工具执行。它以 denied 的 ToolResultBlock 表达，不能进入 ExecutionOutcome、执行账或后台执行完成提醒。

拒绝回复保留 callId、拒绝类别、原原因和正式结论引用。admission 的六种原因必须分别保留；extension_veto 和 admission_unavailable 分开表达。不得伪造成 failed、unavailable 或 interrupted。拒绝块不能带 offloaded。

模型可见的拒绝说明由协调拥有者写进 blocks；仅有结构化 reason 不保证模型收到说明。此包校验表示，不签发授权，也不证明所引用结论真实存在。

当前 Schema 的公开 URI 保持。当前资源由本成员维护。独立回归输入校验具名变化及其余形状未变，规范实例继续运行；不能用候选资源重新生成期望以消除差异。

## JSON 公开边界

本节按共享机制投影的限定采用
接续 README 的 JSON 承诺；不修订上面的调用拒绝语义。

readJsonStrict 拒绝解码后重名成员。普通安全整数字面量使用 number，
小数、指数、不安全整数及负零以 LosslessNumber 保留数字原文。
不能用 Number(source) 代替精确边界或相等判断。

copyJsonValue 返回自己拥有的独立深冻结 JSON 副本，拒绝非 JSON 值、访问器、循环及非 JSON 属性。
复制不调用普通 getter 或 toJSON；这不是 Proxy trap 不执行用户代码的保证。
writeJsonLossless 对非 JSON 值抛 TypeError，不静默省略无效输入。
无损读取及写入要求运行时支持 JSON.parse 的 source 和 JSON.rawJSON；缺失时不能宣称无损。

OpaqueJsonValue 只用于不透明交换。复制其表示不保留领域品牌，
包装、读取或成功校验不授予领域内容检查、租户访问或业务授权。
本节不把 index 的重导出解释成全部内部文件都属于公共 contract 层。

## 块身份、可见性与落盘

块是消息内容，不是消息或在途状态。BlockId 在整条消息内逐码点唯一，包含工具结果任意层和派生表示里的块；看得见完整消息的写入／接收边界保证它，单块 Schema 不能证明它。工具帧入口给自己产生的块分配标识，不能从 BlockId 前缀推次序、层级或归属。

两位 visibility 互不决定，没有缺省值。嵌套块可被某侧取用，当且仅当每层容器和它自己的该位都为真；派生块的容器是原块。压缩记录另行决定当前模型可读性，不翻块上的位。

全部成员一经落盘不改，包括嵌套块、标注、原因、opaque、派生表示与 transcript。转换在落盘前完成，不回补历史块。卸载先形成带摘要的真实结果，不能在日志里把原块替换；卸载结果不是占位。

块本身没有租户、Session、Run 或作者身份，归属来自承载记录。不得从文本、origin 或引用地址推归属；复制块或持有引用不带来解引用权限。解引用拥有者按调用方租户现判，未确定的存储来源／跨节点解析／保留政策不能补默认值。

## 媒体、派生表示与引用

模态从块类和媒体类型计算，不在块上存第二份：文本／思考／调用为 text，语音为 audio，图为 image；文件按 mediaType 的 type 取 text／image／audio／video，其余无模态。工具结果是容器，没有自己的模态。参数不影响模态；无模态不是第五个枚举值。

MediaType 由产生者按规定的小写 type/subtype、紧邻 token 参数写成规范形式，参数值大小写保留，消费者整串精确比较，不解释参数、不替产生者规范化。语音／图的引用 mediaType 必须与块逐字相同，不嗅探字节或按扩展名改判。

只有语音、图和文件可带派生表示与 transcript，两者同有同无。派生表示和 transcript 非空，派生块只允许文本／图／语音、不得再次带派生属性，模态须与原块不同；无模态原件不受此限。派生次序保留，不暗定组装优先级。producedBy 当前仅 system；转换件不是资产。未登记转换件时两者缺席合法，块仍按原模态约束模型。已登记转换件失败时，整条消息不落盘，不能丢弃全部派生属性后只写原件；未登记转换件的原样落盘例外单独适用。

AttachmentRef 相等仅比较逐码点相等的 (storage, key)；mediaType、bytes 与 name 不参与身份，bytes 只作说明。storage/key 是地址，外部消费者不得解析它们推租户或作者。字节读不到不改变引用形状，不得改写或删除块。

外来附件只有引用、没有其他意图时，image 必落图块，audio 必落语音块，其余（含 text／video）必落文件块；原引用不改。工具直接交回块的情况由工具作者选块类，不套用此规则。落块者仍负责 id 和 visibility。

CapabilityId 的形状与逐分量相等由本公开定义拥有；更严的 name 词法归 asset-model。origin.command 的词法归 slash-command。本包仅约束它们当前公开形状，不反向复制判定政策。

## 原文、参数与调用责任

文本 origin 只陈述来路，不授权、不改 visibility；缺席不表示人手输入。Skill 正文和斜杠原文逐字保留，提示词展开及留痕分别由 slash-command 的拥有者定义，不能把留痕造为另一类块。

思考 opaque 只由传输适配层解释；装配、日志、组装和呈现不读取其内部、不据其分支、不改写。落盘与回传保留同一个精确 JSON 值，缺席与 null 不互换；换供应商是否回带由传输适配层负责。

完整工具调用在封口后只解析一次参数。合法 ModelToolName 解析 RFC 8259 严格 JSON，任何层解码后重复键均落 rawArguments＋unparseable，不取前／后值，数值始终无损。非法名字不解析参数，保留收到的非空原名与 rawArguments。空名、非字符串或缺名仍 malformed。正常 arguments 分支由消费者直接取值，不从文本重解析。

未解析但完整的调用仍登记 CallId，工具执行方不得重解析、改名或执行，须即刻以 failed 结果回给模型。半截调用不解析、不给人／模型看、不登记调用；未收到的 callId/tool 缺席，不补；任何结果不指向它。

完整调用 CallId 在会话日志内逐码点唯一，登记者不得直接采用冲突的上游值。顶层结果指回对应完整调用；嵌套结果仅记执行内部调用，不进入此唯一范围、不与日志调用配对。占位与后来真实结果可以同 CallId，关系归 messages。标识生成与词法上界不由本包猜测。

工具结果的 outcome 是唯一收场依据，不从文字推断，不把缺席当完成或未知值降为 failed。backgrounded 只描述前台调用；后台执行自己的结果只能 completed／failed／interrupted／no_answer。结果中任意深度不得有工具调用块。

reason 的收场配对由 Schema 约束，写入者额外保证位置：占位不带 terminated_by_agent，只在后台收场提醒使用该原因。abnormal_interruption 配 failed，用户／运行取消和前台超时配 interrupted。backgrounded／interrupted 必带原因；failed 只可带 abnormal_interruption，普通失败原因写 blocks；completed／unavailable／no_answer 不带原因。denied 使用上方独立拒绝规则，不能挤进 ExecutionOutcome。

## 接收、拒绝与组合义务

非法表示在业务判定之前拒绝，不记录成一次执行失败或判定结果，不修补标注／原因、不删坏块留其余、不把未知种类当文本。成功只说明值合规，不签发权限或证明引用可读。

JSON 文本读失败或不能复制的非 JSON 值为 malformed。可读输入中命名拒绝的优先级固定为 kind_unknown > visibility_missing > incomplete_call_visible > call_in_result > modality_mismatch > malformed，按完整可见块树判定，与遍历次序无关；不把 arguments 或 opaque 内形似块的对象当块检查。非规范 mediaType 尚不能判模态，归 malformed。

无状态的纯值能力不拥有操作提交、幂等、事件、恢复或可逆效果。重要组合责任仍须真实兑现：消息内块唯一、日志内完整调用唯一、落盘不可变、opaque 无损不解释、引用跨节点解析及租户授权、失败封口和收场位置。跨进程不能以隔离标签或同进程引用替代协议保证。

验证方法和明确不覆盖的责任见 [verification/README.md](verification/README.md)。规范输入是断言依据，不是执行结果或第二份行为权威。


每个接收边界独立重验表示，不信上游“已校验”；线上每一跳显式承载两位标注，包括 false，不省略或补默认。内联字节不在传输中重压、改编码或因大小静默改引用／换形状；原图和语音字节保持。opaque 每跳不改写或重排其内容，不因不认识而丢弃。跨节点 BlockId 须协调或协议分域、同日志 CallId 登记须串行化或协议分域，不能各编各的。storage 在各节点须指同一存储，解引用仍由该拥有者现核调用方租户。
