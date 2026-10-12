# Model Response 当前采用边界

当前公开类型和 Schema 由本包拥有。F0 迁移消息依赖时，当前 Schema 身份升为 `data.model-response/v12`，包内仍只维护一份当前资源。

相对 MR11，仅更新 Schema 身份及两个 `AssistantMessage` 引用，使其指向 Message 当前 MS9 资源。AssistantMessage 的形状未变化。响应、待回复、输入校准、实际费用、无损表示、收场、原回复及 ACK 后采用的全部业务承诺由下方行为承诺接续；Schema 身份和这两个依赖版本的限定变化不新增其他行为或旧执行 codec。

验证应确认 25 个公开定义、两个私有成员校验器及完整资源图可编译。精确转换断言只允许上述三个位置改变，其余整个 Schema 结构应与 MR11 相等。业务性质和失败场景继续由本包原测试与真实模型消费者核验，Schema 编译不证明实际发送、耐久结算或当前权限。

## 发出责任、路由与计划

每个已确认耐久 dispatch 责任有唯一稳定 ResponseId，不复用、不因失败或恢复换号。一个调用各次 dispatch 在跨 attempt 后仍连续；发出所在 attempt 与补写条目归属不能混，账按原发出身份结算。调用归属／租户由实际记录壳给，响应不推第二身份。

provider 在原 providers 允许名单内，首发第一家，allowFallback=false 始终第一家；记录实际发出一家。upstreamModel、servingProvider、upstreamRequestId 只沿真实上游报告，没报缺席，不以请求路由补。指定与上游实际执行的原串不同不证明错配：命名空间可能不同，由提供者核真实对应。已明确偏离固定路由不能记符合路由的成功；处置沿既有分类，首内容前可按 unrecognized 留故障事实，首内容后适用 interrupted_mid_reply，并保两份原事实；selectedBy 看最终名字的真实来源，锁定即使恰同值仍为 layer_lock。

route.parameters 是该次原固定适配发送计划，不是 requested 合并原值。要求的每项恰按原值、adjusted 或 dropped 三分；名单项唯一互斥，缺席表示确知无项，不以空数组表达。adjusted.sent 等实际计划值，去 dropped 后空 extra 消失；各项与原 dispatched 事实逐一一致。责任锚耐久后零 send 也保原计划，不由参数存在推真实网络发送。

## 结局与原回复

合法组合如下，表外拒绝；最终 replyDisposition 与 reply 同在同缺，Pending 暂不含 disposition／late。

| outcome／事实 | reply | delivered | failure | firstTokenAt |
|---|---|---|---|---|
| complete | ending=complete | 无 | 无 | 必有 |
| truncated | ending=truncated_at_limit | 无 | 无 | 必有 |
| interrupted，有用户回复 | ending=interrupted_by_user | 无 | 无 | 必有 |
| interrupted，开口无回复 | 无 | 手里仍有已交付块则必有，失连续性可缺 | 无 | 必有 |
| interrupted，未开口 | 无 | 无 | 无 | 无 |
| failed，首内容前 | 无 | 无 | 必有，非 interrupted_mid_reply | 无 |
| failed，首内容后 | 无 | 必有 | 必有，interrupted_mid_reply | 必有 |

用户取消 Run 可交 interrupted_by_user；系统取消／归档／宿主撤下不冒称用户，无 Message，以 interrupted/run_cancelled 结算。runtime_lost 无 reply。中断不记故障，首内容后实际故障归 interrupted_mid_reply，保真实 HTTP／带内原码。vetoed／consumed 不改原 outcome、不添 failure；旧已交回复的调用不能重发。

reply.response 必等 id；reply 与 delivered 互斥，delivered 非空、不是 Message，保半截调用两位不可见。坏原响应不当作未发送来重试，故障／零内容没有 Message 的情况由真实中断提醒补充。

## 时刻、原账及留存

责任锚不等于实际网络开始。sentAt:null 仅供该耐久责任的 interrupted 结算，包括失联恢复及锚点后零次 send 的取消（后者不要求崩溃），不证零发送、免费或可重试；已知真实时刻保留，Pending 始终有真实非 null sentAt。全部实际时刻同源，sentAt ≤ firstTokenAt ≤ endedAt（适用者），不能混两机钟差。firstTokenAt 缺席是确知没开口，不是未知；opened 须先耐久再交内容，无确认事实不擅填缺席。

每个 dispatch（含全部失败历史）保原 usage/cost，未知不价表估算、不补零；补账独立追加、不覆盖原账，镜像／分组规则归 call-accounts。缓存读写只计实际报告，不以配置、TTL 或缓存镜像造用量。trims 缺席断言未砍，不写全零对象。

脱敏后原 headers 的对象、字符串／有序数组、空串／空数组／重复项原样保存，raw 本身不得空；写入前剥秘密，不能因诊断字段豁免。raw 正文过保留期或留存失败不损坏响应，不阻塞写账；事实来源不能只剩会过期的附件地址。

全部已写值不可改。response 序列只有无首内容的策略 failed 或合法 runtime_lost 可以有后继，至多最后一份有 reply；处置、late 及后继观察不追改历史。

## 输入校准与事实关系

countingBasis 精确绑定原适配／计量／投影修订与目标，上游事实和计量策略有真实采用来源；每项最终输入贡献只计一次。requestInput known 的 basis 与原固定投影相符，不能拿当前 provider 重新算旧值。prefixBoundary 是最终投影中有序输入单元数，不是日志 seq；prefixDigest 是该序列按 projectionRevision 求的 SHA-256，inputEnvelopeDigest 覆盖其余输入贡献及解释参数，两者恰好分割全部输入，不重计、不漏计。空序列仍计封装贡献。

from_usage 只在三个互斥输入分量全已知时使用；缺至少一项才可选 upstream_total，已知分项和不得超过 total。upstream_total 必须覆盖本次请求模型上下文的全部输入，不是账单 token、输入加输出的 total，也不是 response-cache 的免推理零。已含缓存的 total 不能再加缓存项造第二份总额；范围不可确认用 unavailable／scope_unknown，response-cache 用对应原因。与原 reported_total 矛盾属于 unavailable／inconsistent_usage，不择有利来源；actual=0 仅供完整真零。来源报出的同名 requestId/model/provider 与 route 同时存在须精确相等，敏感内容脱敏，不靠过期 raw 或自报可信布尔。

outputGroup 的投影修订独立耐久，requestInput unavailable 而 outputGroup known 合法；两者 known 时修订精确相同。摘要按原 reply／delivered 块序逐项对应，数量／顺序／重复保留，source=none 时原两种内容均无且摘要空；usageRef 指原响应，不复制 O。complete 是实际保留完整的证据，不从 HTTP 成功、outcome 或 output_tokens 推出，未知不能冒填 complete。

O 不能精确拆到每块，reasoning 已包含在 O 中，不另加；后继请求按真实回放的内容、角色／模板／边界计算，不直接 I+O。所有校准事实随原 ready／final 完整批固定；合法首次消息派生不修改原 inputCalibration，提交未知保原批，不重算原观察。

## Pending、final 与 ACK 例外

Pending 是完整原结果事实，不含处分／late；原 ref、origin、摘要及内容必须关联，合法形状不证来源。final 相对原 ready 只增真实 disposition 与最终提交时 late；首次 persisted 的合法媒体派生关系归 messages，不增删／重排原回复或改变原值，原证据与唯一消息分开。

合法 ACK 前按原保留／脱敏边界保完整 Pending 与必要内容引用，包括 raw/body 及输入／输出事实所指的支撑内容，不得只保 JSON 外壳而使必要引用提前失效；raw 仍沿正常 TTL，不扩大为全部附件永久保留。合法 ACK 只放开明确的模型自有副本保管义务。consumer 已自持完整值，仍核原语义摘要、当前 settle 权和小锚点；ACK 不生 final／消息、不授 persisted。并发 final 先胜者固定，相同处分认回、不同合法处分冲突。合法释放后不强索已释放 created／ready 全文；普通缺 payload 不等于 released，缺来源不得默认确认。

## 拒绝顺序与验证

先判成员层 outcome_unknown → dispatch_zero → cause_unknown，再其他成员 malformed。合法成员之后依次 reply_missing → reply_on_failure → reply_and_delivered → failure_missing → failure_on_interrupted → failure_on_success → reply_ending_mismatch → first_token_inconsistent，最后无专名组合 malformed。新增校准的精确关系校验在原具名跨成员拒绝后，以 malformed 表达，不改原故障分类。

纯判断只消费显式值，无 IO、授权或修改；必要来源不可核由事实消费方返回 unavailable，不把它冒作 shape 已证有效。固定规范输入、严格无损数、原资源图、独立精确 MS9 转换及负控由本包 tests 接续。真正发送、来源真实性、当前权限、引用保留、完整同批、停止与恢复仍由模型运行时／提供者验证；Schema 编译不关闭这些义务。
