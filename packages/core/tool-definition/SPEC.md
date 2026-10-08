# Tool definition 行为补充

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 并实施第二阶段。
本页接续 ToolResult.isError 与执行环境权限声明的具名新增语义；公开类型、当前 Schema、返回判定和规范化共同实现该形状。其余有效行为由本页下方接续，规范实例与 retained Schema 的验证义务保持。

isError 为 true 表示正常返回的业务失败。省略或 false 表示正常返回的成功。字符串返回始终按成功归一，不能从文本含有“错误”等词推定失败。

该字段不表示执行准入拒绝、运行时中断或调用异常，也不携带执行账。判定与规范化须保留省略、false 和 true 的区别，不修改作者输入。

当前 Schema 的公开 URI 保持。具名变化之外的形状继续接受原冻结资源的比对，原正反例继续运行；旧资源的字节与历史散列不改写。

## 执行环境权限声明

本增量沿2026-10-06用户授权的PR1协议交付。ENVIRONMENT_PERMISSION_VALUES是executionEnvironment内建权限项的三态形状源，与execute动作权限及targetEnvironment落点设置分开。声明函数要求有权配置方显式给出factoryDefault，不提供隐式初值；无环境声明的工具不产生此项。声明不是已授权限，当前求值及组织／租户收窄仍由资产及授权领域拥有。除这个具名新增声明入口外，原ToolDefinition数据与冻结Schema不变；实际输入生产及工具采用链在PR2验证，不能凭常量值自签授权。

## 模型面与参数 Schema

每个定义只产一个模型条目。single input 原样；multi 恰为 flat command＋args，命令按码点升序，说明按规定原文连接，不展示命令参数；args 缺席按 {}，实际调用以所选 commands[c].input 判断。工具名冒号整体转 __，三个禁相邻序列保证单射；不能拆名猜来源。正常 modelName 到 runtime 起执行前才逆转，rawArguments＋unparseable 分支不得逆转或执行。

作者参数 Schema 顶层为 object 且有对象 properties。递归位置仅是根、properties 各成员、items、对象形 additionalProperties、anyOf／oneOf 各支；清单外不深入。每个位置的 properties 成员须非空 description。仅收 type、properties、required、description、enum、const、items、additionalProperties、anyOf、oneOf、minimum、maximum、minLength、maxLength、pattern、format、default；参数名和 enum／const／default 数据不是关键字。同缺说明和非法关键字时先 parameter_description_missing。

format 只作注解，不据此拒参数。根 additionalProperties 缺席仅在私有判定视图读 false，不改作者值或模型 payload，嵌套按 Draft 原义。定义准入与一次调用参数失败分开；其他准入全部通过后才编译，合法但本实现不支持为 schema_unsupported，不退为部分判断或全放行。MCP 合法但 unsupported 必须产生同形 stand-in，原因为 schema_unsupported；作者工具 unsupported 不得转替换件。坏形状不能借此变成不可见、forbid 或 stand-in。一次参数判断不支持／超时须收该次 failed{schema_unsupported} 并带说明，不牵连同批、不照常执行。

parameter judge 及编译 cache 归调用者，不设随作者 Schema 增长的模块级 cache。各线程独立；同步纯判断不能自己终止，真实运行者拥有墙钟策略和可终止 worker；500ms 不作为本 core 的全局政策。

当前 pattern 限项为至多1024码点、无嵌套无界量词、无实际 AST Backreference、有限计数上界至多1000；方言先 non-u 后 u，同输入同限项同结论。不按源码子串误禁八进制／字面 Character。

## 设置、依赖与执行边界

设置存在性与类别由声明确定。背景许可不等于设置，缺席不许后台；阈值不授许可，有阈值须许可 true，无阈值不自动转后台。不存在的项不能配值，duration 按时长值等价。

依赖函数显式收已求值 targetEnvironment，存在性须与声明相同，未声明传 undefined；不按作者 default 回填。声明投影取作者默认，依赖投影取有效值，是不同步骤。composes.skills 是能力引用，不是必需依赖。

返回字符串永远文本，不解析 JSON；归一成调用者 id 的一个两面可见文本块。content 空不等卸载；content／summary 不能含任何 tool_call，包括完整 unparseable。先 ContentBlock 原拒绝，再 call-in-content，保留 retained2 与 current3 对坏调用的差异。offload raw 不进消息／日志，placeholder 大小与取回途径不能代替系统摘要。附件声明和模态核对由真实 runtime 负责；MCP 输出免结果端模态核对，附件声明仍核。

## 接纳与验证

先 malformed M1／M2，再 paradigm_unknown → commands_forbidden → commands_missing → input_not_schema → parameter_description_missing → binding_layer_unknown → setting_category_unknown → permission_unknown → tool_origin_unknown → name_reserved_sequence，再其余 malformed，最后 schema_unsupported；保持 M1～M27 与块拒绝原名，不重排或修补。

固定 Schema 在构建生成、首次实际消费加载，缺资源／定义／生成物原抛，不回退。tests 维护原准入、参数判断、pattern、返回、依赖及完整转换负控。正常业务 isError、权限声明与执行准入保持区分；真实授权、墙钟终止、offload、模态／附件和后台落点由工具 runtime 及其他真正拥有者另验。纯合法值不证明这些效果已兑现。

## 多命令生成与同版协议

生成对象恰有 type="object"、properties、required=["command"]、additionalProperties=false。properties 恰有 command 与 args；command 恰有 type="string"、enum 与 description。enum 为命令键按 Unicode 码点升序；description 各行恰为 `name + " \u2014 " + commands[name].description`，行间一个 U+000A，无尾换行。args 恰有 type="object" 和 description，不有 properties；说明逐字为「所选命令的参数；各命令的参数用法经 Tools().inspect 取得」。不从 help 多加枚举或字段。

模型条目、参数判断和真实派发使用同份定义；help／inspect 同版。跨节点携能指认该版的事实，不能发v1条目后用当前v2判断原调用。每个接收定义／返回边界重验，接参数的节点按自己的明确上限再判；同步调用不自授跨节点版本或准入事实。

## 跨边界消费责任

每个接收边界重新核定义、参数和返回，资源与版本引用不自授权限；按原完整同版事实判断，不能据远端准入成功跳过自己上限或原归属的检查。

## 声明推出与依赖满足

仅 authored 推出正文设置／权限；MCP 的 execute 归 endpoint 逐动作声明，不另推独立 execute。targetEnvironment 为 placement_identity，域引用 TargetEnvironment；backgroundThreshold／timeout 为 preference，域是 Duration；concurrency 为 preference，域为整数≥1；execute 恒有，为 permission、域 [forbid,auto,ask]。各默认原样取定义所给声明，不由提供者换域或默补策略。

依赖全部且必需，实际使用与声明一致。调用端模态由当前有效模型满足，结果端由模型输入能力或转换件满足；结果核 content、summary 与带媒体 raw，非 text 模态须在 outputModalities，无模态文件不受此限。附件必须已声明并实际落在所声明存储；违例收该次 failed{result_rejected}、不进日志。MCP 输出模态免核仍不免附件声明；needs.attachmentStorage 的依赖名与 AttachmentRef.storage 的对应仍待 PF-006 拥有者限定，不由本页补默认；mediaType→Modality 继续沿 content-blocks 已定义映射。

消费者不得读工具定义来决定解析帧、等待或卸载，不能按 paradigm 等间接推断这些承载政策；它们归真正运行时与到达能力。
