# 到达事件与生产者义务

[公开类型与判定](src/index.ts)及 [Schema](schema/arrival-events.schema.json)拥有信封和六类事件的形状。本页拥有序列含义、生产者及边界责任；没有共享状态、提交、事件身份、时间戳或持久回放。事件不是消息、日志条目或第八类块。到达装配是本语法的消费方式，状态及路由归宿主。

## 身份与块的一生

目标在所属 Session 内有意义，模型调用按 callId 与 dispatch 区分每次发出，工具执行按 callId 区分帧流。模型目标的 (callId, dispatch) 必须与对应 model-response 的调用／发出对值相同，适配器不得重新编号。工具转到后台仍是原帧流，不重建目标或流。标识按逐码点相等判断，dispatch 按精确数值相等判断，1 与 1.0 是同一值。模型目标 dispatch 必填、正整数，不补成 1。目标合法不证明该流存在、归调用者或引用可读；宿主按 Session 与目标路由。

生产者给非负整数 index，只在本流指回块，不是 BlockId，也不在收尾后持久留下。open 索引严格递增，可跳号；一索引终身只开一次，封口后不复用。可多块并开、交错填、任意封口次序；块在结果中的次序始终是 open 次序。fill／close 仅在已开、未封口时出现；带 index 的 trim 只须已开过，封口后仍可报告。

每块为 `open fill* [close]`；整流为任意 open／fill／close／trim，至多一次 account，再任意 open／fill／close／trim，最后恰一次 finish。finish 后不再有任何事件；account 前后均可有这四类事件。没有“流开始”事件。不把沉默或超时本身当 finish；生产者消失由宿主放弃成 lost，本页不保证进展。

open 说定 kind、fill、id、visibility、head，填法此后不变，各块独立，不从工具定义推断填法。append 仅 text／thinking／tool_call／voice，replace 可七类。标注缺一即 visibility_missing，不替生产者表态。BlockId 在整消息及任意内嵌块内唯一；模型侧传输适配分配，工具侧宿主帧入口分配。重复标识由消息落盘接收边界以 block_id_duplicate 拒绝，本流不另命名。

## 填、封口与首内容

追加文本／思考／调用参数片段为非空文本；调用参数全程原样，不中间解析。语音追加为非空标准 base64，使用 RFC 4648 带填充、无空白形式，归约相接解码后的字节，不相接编码串。替换文本／思考可为空，调用参数给整段原文；语音替换给非空标准 base64；图／文件／工具结果替换给整块，kind／id／visibility 及带出的 mediaType 与开块逐字一致。替换只改本块，不跨块；没填过就没有归约。

close 表示内容已到齐。调用 close 不带 block，只在到达装配接受封口时解析一次；其他六类必带完整块。封口块以最终内容为准，若填过，生产者必须保证它等于实际送达填的归约；中间节流／转发改了 fill 必须相应改封口块或不改内容。消费者不重算该等式，生产者须自行验证。

被截断、叫停或失去连续性的块不得伪造 close，尤其不能把半截参数标为收齐。实际已到内容由装配收场，不补全。首次内容是载荷非空 fill，或未填过且封口内容非空 close；open／trim／account／finish 都不算。空文本、空参数及只有思考 opaque 数据不算内容；不按模态排除内容。位置归到达装配，时刻与重发策略归宿主。

head 的媒体模态由 content-blocks 的 modalityOf 判断；合法 mediaType 与 voice／image／text／thinking 模态不合时为 head_modality_mismatch，file 可任意。非法媒体词法为 malformed，不先判模态。调用元数据来自已登记 callId，tool 不随填变化。缺必填或带禁止成员均 malformed。

presentation 缺席按 mediaType，媒体类型也缺席则按块类型呈现，不补提示。本次采用的 hint／language 集合尚未定义，任意带 presentation 的块头均 presentation_invalid，不静默降级。集合定义归 PF-016 的呈现层，采用新集合须先修订公开承诺及消费者。

## 节流、账与结局

发出侧只节流 fill；open／close／trim／account／finish 从不合并、截短或丢弃。可合并同块相邻追加（其他块事件不打断，但不跨封口），或去掉被后续替换的 fill；两者不改归约，仍报告 rate_merged。其他砍改变内容，每次必须报告，不默默丢；任何改变调用参数内容的砍都不能落成完整调用。装配后投递观察者的节流不进账。

trim 只报告，不改块。rate_merged 记录 n 个合一后未单独送达的 n−1 个；frame_too_long 报告一增量截短并送达；quota_exhausted／rejected 各报告一增量整个未送达。index 缺席表示落不到某块，不是默认块。文本按 UTF-8 字节，二进制按原字节计 omittedBytes；整块载荷及无载荷事件的计字节规则仍由账与实际节流拥有者明确，不能擅补。配对汇总归到达装配。

account 仅模型流存在，载荷两项都必填，未知写 unknown、source=none，不写零、估算或缺席。语法至多一次；承载记录恰一份，缺账由记录拥有者写全未知。工具的账沿工具执行记录传递，帧流上的 account 为 malformed，不伪造未知 token。账不进模型上下文。

finish 的 end 表示正常说完；max_tokens 只模型流合法；interrupted 仅有意停止；lost 表示生产者失去连续性或宿主放弃在途流。工具等待到点无应答、桥换代／卸载、帧断流或宿主撤除都为 lost，不能冒充有意停止，帧结局不改变执行本身收场。模型宿主停止、系统发起的运行取消（如会话归档）或撤除放弃为 lost，不带故障成因；用户取消本次模型运行归 interrupted。消息／响应的对应结局归其拥有者。

error 只在模型 lost 可带，FailureCause 归 loop-extension；状态码原样，不翻译。inBand=true 必伴 statusCode，表示开流后带内 code，非 HTTP 状态。lost 无 error 合法，不证明无故障、不补原因。生产者断流且仍能交事件时发 lost，无法交 finish 时由宿主 abandon；不能用别的事件替代 finish。

## 工具帧的额外边界

一帧仅工具经帧入口交出的 open／fill／close，trim／finish 由执行运行时交出，不是帧。媒体在顶层及任意嵌套层仅 AttachmentRef，禁止内联；语音块只能开后封口给引用，不能填内联字节。模型回复无此引用限制。工具帧的 open、整块 fill、close 块都 toModel=false，内嵌块按合取取用，不可配置放行。帧无 max_tokens 或 error；执行结局独立看工具消息。零帧、只有 finish 或没有登记流均可为正常形态。

## 表示拒绝与跨边界

判定结果以返回值承载。拒绝值固定优先级：event_unknown，互斥的 trim_reason_unknown／finish_reason_unknown，嵌套值的非 malformed 拒绝，presentation_invalid，head_modality_mismatch，fill_kind_not_appendable，frame_media_inline，replace_payload_shape，最后 malformed。嵌套块／账使用各自原名和自身次序，malformed 统一排最后。未知判别式不映射、忽略或补默认；形状拒绝不是执行失败或一次收场。

replace_payload_shape 及帧语音填字节的 frame_media_inline 须借此刻开着的块；没开或已封时不参与，交装配判序列，不当作合法放行。其他单信封约束每个接收边界重验，不信上游“已校验”。拒绝不补标注、改填法、将内联改引用或给 lost 补原因；宿主按被拒增量报告 rejected trim。

跨进程须按目标有序、恰一次送达，事件无序号，协议自带；信封须带 Session／租户或通道绑定 Session；dispatch 原样携带，已收尾目标迟到事件丢弃；首内容时间取消费侧收到时刻且明确时钟侧。转发改填仍须保持封口等式。表示合法不授予租户、Session 或引用读取资格。

## 验证与尚未实现的责任

[规范实例](tests/fixtures/arrival-examples.md)保持合法／非法输入及固定拒绝值。Schema 身份及固定引用图不因位置迁移改变；根模式不约束文档，显式校验定义项。表示形状不证明流的单调、唯一、次序、递归帧媒体、封口归约或真实路由；这些由实际拥有者测试。序列模型归 [到达装配](../stream-assembly/verification/models/README.md)，不建第二个平行状态机。

呈现集合归 PF-016；长度上限、额度及执行者归工具执行／PF-006，模型侧是否允许改变内容的砍归 PF-009。整块及无载荷字节口径归账接口与实际节流拥有者。此页不填参数或声称这些未实现责任已闭合，不定义恢复、外部效果可逆、事件持久化或中断提醒。
