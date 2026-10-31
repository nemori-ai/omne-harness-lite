# 模态投影与转换：当前设计与未实现边界

产品规则归[产品入口](../../product.0.0.1.legacy/PF-013-model-profiles-and-invocation/README.md)；本页只维护尚无真实提供者的已采用技术行为及未决，不授予实现或验证状态。公开数据沿实际定义拥有者，不建空包。新增产品政策仍由产品负责人决定。

| 操作 | 资格、首拒绝与闭合失败 | 提交、重复 |
| --- | --- | --- |
| project  | 输入为合法可读日志前缀；授权归log reader，函数不授权；仅invalidInput | 纯fold，无提交；同L同集合；不能读log时caller明确失败，不传空集 |
| compatible  | 合法profile+已知projection；无授权；仅invalidInput | 纯 S⊆profile.inputModalities，blocked=S\input；不看output/大小/在册/范围；同输入同结论 |
| declareConverters  | 仅system assembly可达；所有shape先invalidInput，然后重复key→keyTaken；集合闭合invalidInput,keyTaken | 进程内整表原子生效，**没有耐久提交**；可声明空表表示已知无登记；旧新无混合/替换无unregistered窗口，失败旧表不变；同key引用再次声明可重复、不比较opaque converter身份 |
| convert  | 仅系统builtin消费；block为无renderings/transcript的voice/image/file、tenant为消息真实Session归属；invalidInput→registry未知converterFailed→每候选确无登记noConverter成功→调用/字节不可得converterFailed→transcript缺/空transcriptMissing→其余产出违约converterFailed | 不自己落盘；无去重，转换可不确定，重复是新外部效果；成功renderings/transcript随原消息同一次提交 |
| lookupConverter  | 仅合法key；无授权；失败仅invalidInput | 只读三支registered/unregistered/unavailable；答不出不是unregistered；只答登记不答converter当次可用 |

折叠定义接续（类型不表达）：只计已落日志消息的原块树，含任意nested tool_result，排除renderings；块及全部祖先toModel真且有modality、无transcript才入集合。不是“此刻模型可读”，压缩名单不抹掉模态；SystemMessage不落log且本期文本，非modal file不计。随前缀单调、追加可union、每prefix增量=重算，合法模型判定必须覆当次尾。后登converter不回扫历史改块/投影。

ConverterKey匹配：voice/image仅modality键；file取规范mediaType去参数，先media_type再非text modality，码点恰等，不嗅探/扩展名猜。image/png图块不走media_type键。转换产出恰一DerivedRendering、producedBy system、非空合法text/image/audio且每派生模态异于原输入（无modality file例外），无file/thought/call/result、无递归renderings，非空transcript。不能只给transcript、取多份第一份或删坏块“修好”。

接纳前跨域：非 Tool ref 来源由实现消息准入的提供者在接纳前调用系统转换，Agent 只看到接纳后的消息与派生表示。系统转换遍历所有模型可见、未派生的eligible块，有eligible才解析真实Session tenant/registry，纯文本/只给人消息不依赖这一侧。确无登记可原样落；registry未知、converter不可用/坏产出、取字节失败、时限/tenant解不出皆整条veto。失败reason至少blockID+failure+key（若已知），不含内容；一块失败全条消息/先前派生不落。它不在扩展位置上；模型回复只此系统件能加派生，接纳后改块非法。转换不发model调用，converter不是普通asset。撤除/换代时未知不能变noConverter，尚未落盘产出不能被写者私自补入日志。

当前 model-request-runtime `SelectionProjection`/`SelectionCompatibility`、session selection projection(prefix)端口已拥有消费者形状；引用它们，不造另一ModelProfile/SessionRef。旧无SessionRef及loop environment出处语句已被messages/session-tenancy/当前loop端口更新取代。现有端口未实现通用fold/converterregistry/builtin converter。仍未闭：附件字节授权/持久化/被veto字节保留，通用log投影协议真实owner与当前CheckedPrefix整合，时限值（归runner配置）、Converter活体完成/撤除的提供者机制；不扩完整Session协调。

验证义务与规范输入见[verification](verification/README.md)。尚未闭合的公共语义阻止相应提供者实施，不以迁移目录关闭业务缺口。
