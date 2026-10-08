# model-request-runtime：RT5 来源定界与公共调用接线

当前技术采用范围与排除见本页“当前采用范围”；不据此宣称实现或验证完成。

## 来源与纯政策

[RT5 S-20](../../../../spec/capabilities/model-request-runtime/v5/contract.md#s-20-写入之前脱敏)、[MR5 S-21](../../../../spec/data/model-response/v5/contract.md#s-21-写入之前脱敏)的凭据判定由原能力owner拥有。单凭全序列化结果出现与凭据相同的字面值，不能否定独立取得的真实状态、身份或费用。通用redactor不知业务来源，不能自行决定豁免；本页只明确本调用owner的接线。

| 来源 | 接线责任 |
| --- | --- |
| 本次实际使用的凭据、上游header/raw/error、local error文本或动态诊断原文 | 在相应公共交付/写入前使用本次绑定的共享text/headers/json；raw/error覆盖任意字段名、key与所有scalar，不设status/id/cost字段名白名单 |
| 实际HTTP响应status、指定SSE error.code协议位置通过合法状态表示接收得到的status事实 | 保留实际值。HTTP200不替代带内码；提取后的状态事实和raw/error中同值副本分别处理，任意raw字段不因此成为协议状态 |
| 已合法取得的请求/目录身份、合法解析的usage/cost | 沿原事实接收和保真承诺。raw/error/header中同名副本仍完整脱敏；不根据日志字段名豁免原文 |
| 上游frame中的model/provider/generation等字符串 | 仅有协议位置、字段名或string类型不证明是独立验证的身份；沿原transport对这些上游字符串的text处理，不增加字段名豁免。另行独立验证的身份才适用上一行；本增量不引入验证机制 |
| 合法业务reply/delivered、文本/思考/工具参数片段 | 沿RT5 S-59和SA3原文归约/一次解析/可见与落盘一致性。本页不授权改写它们；真实凭据回显的完整政策仍受阻，见边界 |

凭据字符串可合法恰为503、true或null。本页不收紧凭据准入来避碰撞，不将真实状态/费用替成unknown或零，不把完整ModelResponse交给通用json redactor。处理后的raw/error仍叫原样；纯政策算法和无默认承诺沿D093，不复制第二个matcher。

## 明确的公共面迁移

- `InvocationPolicy`移除旧任意`redact(string):string`口，改为必需显式`credentialRedaction: CredentialRedactionConfig`。使用原公开`createCredentialRedactionPolicy`完整校验/复制/冻结，再以本次credential绑定，发生在plan/send之前；非法沿已有invalidInput且零HTTP。不以identity函数/缺省配置继续调用。
- core类型`Failure/Timing/ResponseOutcome/ParameterAdjustment/RawHeaders`明确来自`@omne-harness-lite/model-response/v5`。`TransportFailure.headers`删除；`SendResult`只有response/failed/aborted三个分支可带同次可选`rawHeaders`，rejected不能带。`StreamEnd`不增加头权威。
- `ModelInvocationResult.rawHeaders?: RawHeaders`承接send的已处理头，在收到send结果后、进入read或内容门之前保留本次自有值，所有原outcome继续携带。缺席不是空map，数组不能join/trim/去重，取消/reader未进入/解析失败不擦掉已采头。
- runtime按同次绑定政策守住自己的raw/error/header/local动态原文边界；transport必须在send/read公共返回前已经处理，runtime的防线不能事后证明早先send没有泄漏。两端必须来自同一装配显式配置的冻结值，不能只比较某个最小长度或中途重读latest。

纯`redact`和policy构造接口不改。没有新的领域failure/outcome。policy缺失或非法在发送前拒绝；合法处理函数失败不能先交原文再诊断。不得根据异常message猜它属于哪一种错误；处理器调用所在的封闭阶段提供来源。

## 处理失败的唯一出口

下面是已有RT5 S-54/S-58/S-59、MR5 S-15与提供者local来源的技术映射，不新增错误代码、第五收场或另一份H权威。`localError`及诊断kind只用实现拥有的固定阶段文本，不能插入原错误、输入、header名或raw片段。处理缺陷作为可观测本地缺陷，不吞成模型正常完成。

| 发生处及已知事实 | 必须交出的结果与停止责任 |
| --- | --- |
| 配置校验失败、bind返回rejected，尚未send | 已判定非法配置或bind拒绝时invoke拒绝invalidInput，零次send。纯bind在plan/send之前抛受控processing defect时，以固定阶段的受控实现异常明确失败并诊断，零次send，不造带sentAt的ModelInvocationResult，也不把合法输入谎报invalidInput。处理函数不接收原文作为备用输出 |
| send已经开始而纯处理器bind抛defect、尚无上游失败事实 | 交failed{source:local, localError:固定阶段文本}，不交rejected或正常完成。没有取得连接时无需伪造stop，已取得的资源仍由实际owner关闭并确认 |
| 上游H表示非法，或headers返回rejected | 提供者端口违约：整份H不交，不能逐项过滤坏值。已独立确定的HTTP失败仍交同一http_status/statusCode并增加固定本地阶段留痕；没有该失败则交local失败。停止本次实际请求/reader，等待stopped后交结果；禁止据非法值宣称该H合规 |
| S-58交出之前，合法H的处理/留存抛受控defect，但H尚未成功留存 | 严格沿S-54可选留存失败：该H缺席，给固定本地缺陷诊断，继续保留实际既有收场，不用{}、raw fallback或额外业务故障。此行仅适用于可选H留存，不覆盖错误正文或其他必需处理 |
| H已处理且留存；HTTP非2xx错误体的json处理返回rejected或抛defect | 保留同次H；failed仍是已知http_status及实际statusCode，upstreamError不交未经成功处理的值，localError记固定error_body_policy阶段，同时诊断提供者处理缺陷。不得改成connect、正常结束或无H Promise rejection |
| H已交invoke；SSE error已按合法协议取得带内code，随后error JSON处理失败 | read交failed，保持in_band、实际合法code与inBand条件；未经处理的error副本缺席，固定本地阶段留痕；无合法code时仍不造码。H由invoke已有值保留，不在StreamEnd再带H |
| 其余必需raw/error/text处理返回rejected或抛defect，已有独立失败来源 | 保留已经合法取得的失败来源及状态，省略不安全载荷，固定本地阶段留痕；不把处理缺陷归因给未知上游。实际资源先停止 |
| 其余必需raw/error/text处理失败，尚无独立失败来源 | 交local失败并固定阶段留痕；invoke按原classifyCause在首内容前为unrecognized、已有内容为interrupted_mid_reply，保留实际已经获准的片段。不是正常end，也不把该故障假称upstream_unavailable |
| invoke接收send已交的合法、自有不可变且经同次政策处理的H | S-58交出即已留存；立刻固定持有其合法原值，可以共享该不可变值，不以receiver再次分配/再次headers处理为前提。不得重开可选H留存窗口，不另造第二次headers脱敏故障点；receiver不重新解释来源。结构或自有不可变表示非法仍是独立端口违约，不当成合法H。后续错误载荷处理失败不清H |
| invoke对failed载荷处理时出现上述失败 | 按已有独立失败来源/必需处理阶段规则。已交合法H原值保持；不安全载荷不进入Failure或诊断；后续local阶段文本无需再依赖已失效处理器才能交出 |

这些捕获仅围住已绑定纯处理器的调用及相应值接收，不用一个catch-all把任意时钟、模型规划、装配算法或存储异常伪装成本表分支。输入表示违约和合法处理器defect必须用不同固定诊断；两者都不能附原异常。单纯可选H留存失败的专门规则仅在S-58交出之前适用，优先于同阶段的“必需处理失败”；S-58交出后sender/receiver之间不存在第二个可选留存窗口。

**终局与取消**：已有实际确定的终局不变；尚未确定时，显式取消/已触发时限仍沿原invoke与transport竞争规则，不能因为处理缺陷覆盖已执行取消。非2xx status已取得是独立失败事实，但不等于错误体任务已停止或终局已交。readError在停止收口、交失败前仍检查实际取消；若实际取消赢，交aborted并携同次H。req.error不能在收到非2xx后抢成connect无头分支。H是否存在不决定取消优先级。

**实际收口**：send内部的错误体处理分支先停止ClientRequest/IncomingMessage并等待原stopped及连接release；read内部处理失败先停止response，再等待stopped与generator finally。invoke处理自身失败载荷时请求controller.abort并完成现有reader.return；不得把仅发出abort请求当实际停止，亦不在已正常停止后改其终局。诊断sink失败按既有隔离规则不改变业务。

## 生命周期与消费者

沿既有invokeModel显式时钟/调度/取消/诊断/内容门，policy快照属于本次调用。config不进Context，绑定不导出凭据/内部窗口；不新增plugin、fiber、service或事件。已有网络与reader实际停止责任保持，原始网络句柄不公开。

实际消费者需同时迁移policy构造、send类型及完整MR5响应接收。原根invokeModel在本次明确版本采用后改变技术输入；没有redact兼容fallback。更新本包双语README/实际调用tests、transport固定配置与消费者，旧制品继续沿其原值排空，不接管旧opaque对象。新的耐久消费者明确使用[D094 codec v2](v5-log-codec-design.md)；旧mrr1根不隐式升级。

## 义务与未闭边界

| ID | 可失败断言 |
| --- | --- |
| CP-V1 | 实际凭据503+真实HTTP503/HTTP200带内503，status事实保真；raw/error任意同名/异名字段、key、number/bool/null匹配值被替换，诊断不泄漏。改变为全记录redact或按字段名免洗必须失败 |
| CP-V2 | 完整三参数config显式传入、调用开始冻结；非法/旧redact-only policy零send；变更源config不改变在途规则；不新增算法默认 |
| CP-V3 | actualsend→invoke四outcome保留同次H，有序数组/空map/缺席可区分；门等待/取消/读失败/未进入reader不丢H，无第二出口 |
| CP-V5 | H已采后故意触发json/text处理defect或rejected，实际HTTP/带内来源与状态保持、不泄漏原文、H保持；显式取消竞争与实际TLS/socket/reader/stopped/connection release收口。只在纯函数自测不计通过 |
| CP-V4 | 实际制品公开函数/双语原样示例、受影响build/type/tests/rules和真实TLS异常收口。动态错误受控、sink失败不改变业务、存在原始失败日志 |

尚未执行义务，不把D093纯构件pass计成接线pass。raw.body附件继续沿R5R-G3未采用；真实业务内容凭据回显在逐片可见、工具参数原文、一次解析和落盘一致性之间需要原产品/契约owner裁定，本页不宣称完整S20、全成员秘密保护或所有观测出口已覆盖。新增头接线不提前认证十三操作、37模型、全部结算/恢复或M1。

## 当前采用范围

RT5/MR5 的按来源定界凭据政策与两节点 revision 3 接线；同一次完整配置显式校验/冻结，共享 text/headers/json；直接 send 的零连接非法配置门；单一 rawHeaders 的固定交接与处理故障出口。

技术采用不表示实现或实际验证已完成。验证义务：CP-V1..CP-V5；PH-V；完整内容秘密边界和 G29-P/H；实际 TLS/socket/reader/回调收口；各既有操作及模型认证按实际当前实现范围验证。
范围之外：RT6 模态候选；给所有业务 reply/tool 内容追加未声明保密保证；冻结规范变更。
