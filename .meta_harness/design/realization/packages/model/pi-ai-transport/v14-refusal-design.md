# OpenRouter refusal 字符串的既有文本映射

2026-09-29，revision 2，**candidate，未采用、未实施、未验证，新增 bindings 0**。接续 [现有 reader](design.md#上游的流怎样译成到达事件)、[v6 来源政策](v6-credential-path-design.md)、[v12 revision 2](v12-usage-calibration-design.md) 与 [v13](v13-output-history-design.md) 的原精确采用范围，接受状态由各自决定/registry 给出。

依据为 [候选比较与性质](../../../../record/proposals/openrouter-refusal-mapping/README.md)、[固定官方协议调查](../../../../../research/openrouter-refusal-mapping/README.md)。精确语义仍消费 CB3、AR2、SA3、MS6、MR9、RT10；没有新增持久字段、枚举、操作或公共函数参数，故不需要共享 spec 升版。只替换本节点旧 refusal 不承载及空数组忽略规则，其他成员旧规则不被暗改。

## 值域与确定映射

`choices[0].delta.refusal` 是普通模型回复文字的另一协议来源，**不是错误字段，也不是安全分类器**。

| 值 | 本候选处理 |
|---|---|
| 缺席、null、空串 | 无内容，不开块、不填、不算首内容 |
| 非空字符串，包括只有空白 | 按实际字符原样进入文本通道，不 trim、不补前缀、不生成提示语 |
| 数字、布尔、对象、任何数组（包括空数组） | `protocol` 失败，固定 localError，不把值转字符串，不沿旧空数组容忍逻辑 |

每个合法 delta 在交付它的任何内容前完成 refusal 值型校验；同帧非法 refusal 不允许先泄出 content 然后再发现非法。已由同帧 readFacts 累积器取得的合法计量仍保留。这与现有不承载检查在 content 前的位置一致，不扩成全帧事务新保证。

内容次序固定：先非空 `delta.content`，后非空 `delta.refusal`，然后沿既有 reasoning/details/tool_calls 顺序。这个同帧顺序是本地规范化选择，不是上游生成时间，也不取 JSON key 的出现顺序。跨帧按 SSE 消费次序进入同一文本通道。两者交错复用本次原 `textBlock`，每个非空片段发一次 fill；不因字段变化开第二条竞争文本通道，也不把后到 content 插到已交付 refusal 前。thinking/tool_call 仍沿原独立通道与首次开块次序，本增量不承诺重建跨模态逐字符生成时间。

第一次有实际文本（content 或 refusal）时沿已有 `open{text,append}` → `fill`；visibility 保持原两位皆真。无新 origin、presentation 或 opaque。`close` 带相接文本；length/用户中断/故障由既有装配收口。若已有 finish_reason，任何非空 refusal 和其他内容一样是“终止后出现内容”的 protocol 失败；缺席/null/空串不触发此条件。

## 首内容、历史与来源

refusal 的首个非空 fill 同普通 content 进入 RT10/AR2 的首内容门；open 本身不算首内容。runtime 必须先完成原“已开口”提交/许可再交付，门失败不允许先显示；开口后故障不自动重发。

持久 reply 与故障 delivered 各自保存实际文本，但二者的历史资格不同。故障 delivered 只在响应体里留痕，不成为消息，也不自动进入下一次请求。只有按既有选择规则实际选入上下文的合法 reply，才通过原文本投影完整回放；不能因文字来自 refusal 而另行过滤，也不凭内容猜安全原因。CB3 的可选 origin 缺席不表示它来自 content，更不表示用户手写；本稿不把拒答冒标为普通生成的安全许可。原始协议字段只有在 MR9 S20 原留存仍可取时可核，**不承诺从保存文本重建原生 refusal 字段**；raw 失效不影响文字或计量有效性。既有文本/history 摘要以实际保存块计算，禁止复用旧无拒答回复的摘要。

## 收场与计量

refusal 本身不改变 finish_reason。以下沿现行 MR9 S12/S13 与 MS6 S10，由 runtime/SA3 决定回复及已交付部分，reader 不另造 outcome：

| 真实终止 | reader / runtime / reply |
|---|---|
| stop 或 tool_calls，且到达 DONE、其他协议合法 | ended=end；有合法内容时 complete / ending=complete；无内容仍沿既有空回复判定，不制造文本 |
| length，且到达 DONE、其他协议合法 | ended=max_tokens；有合法内容时 truncated / ending=truncated_at_limit；无内容沿原空回复处理 |
| 用户中断 | aborted；沿原 initiator 与 interrupted，用户中断且有内容可产生 ending=interrupted_by_user；其它取消不假借此行产生 reply |
| 宿主取消/失联 | 沿现行取消/恢复区分，interrupted 的 initiator 和 reply/delivered 关系不改；本稿不实现 Session/Run |
| content_filter、error 或其他异常 finish_reason | 仍为 in_band 失败，不封成成功 reply；首内容后保留 delivered/cause=interrupted_mid_reply；首内容前沿既有分类 |
| 顶层 error 与 delta 同帧 | 先保留同帧合法 readFacts，再按既有 error 优先级失败；不交付该帧 delta，不吞真实 error |
| EOF 缺 DONE/finish、坏 JSON、重复 key、SSE 过限、非法类型、终止后内容、finish 改值 | 沿现有 stream_broken/protocol 分支，保留已知事实，实际 stop/stopped |

正常 stop/tool_calls/length 后继续读现行正常尾帧到 DONE，允许同值重复 finish 与无内容 usage 帧；不能仅因 refusal 或首个正常 finish 提前退出。usage/cost/observedInput 由原无损累积器解析；同帧、前帧、正常后帧都走同一个 owner，account 至多一次，不按拒答重新计量。缺 usage 仍明确未知，分项冲突保持原 unavailable，不用预测数填账。

**失败、取消、超时不是正常尾帧读取。** 一旦触发它们立即沿原 stop 并等待 stopped，只带已经取得的 facts；不为未来账单继续读，不加后台连接、不增加时限、不实现“无限 drain”。原 transport 单独函数消费者仍需给出有效 signal；整次调用的 timeout 由既有 runtime 装配负责，不在 reader 偷加固定 timeout。

## 来源政策与可观测性

拒答正文采用 D-095/v6 的真实 reply 内容边界，按保存文字交付；该决定明确未授权改写真实 reply/tool 回显，因此本次不新增内容脱敏器，也不宣称对任意生成内容的完整秘密保证。raw/error/header/local 原文、model/provider/id 等继续既有来源政策；诊断不打印拒答文字或原帧。真实 usage/cost 不因数值恰好等于凭据而改变。非法 refusal 的 localError 是固定文字，不含其值。若未来要求所有生成内容的秘密保证，应沿其 owner 另补设计，不能拿本窄映射私自实现。

## Cordis、版本与实施归属

无新 service/fiber/event/store/inject。现有稳定 modelTransport、可信模型插件、固定贡献引用保持；纯 readStream 是公共实现，所有八家通过 OpenRouter 的合法 refusal 共享此规则，不按 Anthropic 路由特判。新整份 reader/implementation revision 在发布前固定，不能热改旧 lease 捕获的闭包；旧引用完成后沿原 cleanup。具体递增哪些 binding 由实施批在采用后列出，37 型共享实现不等于37型真实认证。

存储新增 0，原 raw 附件保留和 Session log 同次追加不变，不新增跨 owner 共同提交。实现仅需既有 stream.ts 及相关受影响测试/公开说明；不改 runtime 的业务终态判定。README/README_ZH 应说明拒答文字作为文本、失败与账未知仍可能发生。

## 验收义务与采用前置

以下都是尚未执行的义务，不填 bindings 为已通过。由传输实现负责 RF-V1/V2/V4/V5/V6/V8，runtime 集成负责 V3/V7/V9；主线收齐当前 artifact/输入 hashes 与实际 exit 后验收。

| ID | 必须能失败的正反检查 |
|---|---|
| RF-V1 | 缺席/null/空串无 open/fill；纯空白为内容；合法字符串完整交付；false/0/对象/[]/非空数组 protocol，非法值不进 localError |
| RF-V2 | content→refusal→content 跨帧精确串接；同帧逆 key 排列仍 content 再 refusal；与 reasoning/tools 共存不丢/重排各自通道；终止后非空 refusal 拒绝、空值允许 |
| RF-V3 | 独立 invoke 实际首 refusal 通过首内容门且 firstContentAt/已开口正确；门拒绝零可见 fill；后来503/断流不得第二次 HTTP |
| RF-V4 | 非空 refusal × stop/tool_calls/length，正常尾帧重复 finish+usage+DONE，正确四outcome/三ending子集、精确无损账；拒答字段不补 error/statusCode |
| RF-V5 | refusal × content_filter/error/顶层 error/EOF/坏JSON/finish改变；已交付保留、该帧 error 优先、没有伪完整 reply；错误后未来 usage 帧未消费 |
| RF-V6 | usage 在前/同帧/正常后帧、重复/冲突/缺席，readFacts 与 account 同源且不双计，零不能代替未知 |
| RF-V7 | refusal 后取消/停滞超时，socket/reader/监听/lease 实际释放；后续无限不终结服务器由既有时限停止，无新增 drain/重试 |
| RF-V8 | 固定诊断不含拒答字面或敏感原值；raw/error 同值脱敏、独立503及实际数值计量保真；真实 reply 沿原政策，不冒称内容秘密保证 |
| RF-V9 | 受控 TLS 的公共 reader/invoke 与真实 Cordis service 共用生产代码；持久化/重开后下一轮线上 body 包含完整拒答文字；raw 留存失败/过期不可取不阻合法 reply 的文字回放、不伪造 origin；公开包两语言 README 示例/typecheck |

采用前置：主线确认本稿和三候选比较的精确修订；独立 architecture-reviewer 收齐 R1–R8、四表、逆向检查；确认无需共享 spec 升版；按 skill 完成 PF-013 projection 的受审快照交接。本候选不自动取代冻结 design.md，不允许实施者自行将 content_filter 改成功或把未知成本置零。正式模型路径再验属于模型认证，本地受控用例不声称复原此前 Opus 的真实拒答类型/后帧账单。
