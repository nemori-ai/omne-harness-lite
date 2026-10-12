# Call accounts 行为承诺

公开类型、必要校验与 Schema 拥有形状。本包提供无 IO 的账值接纳和精确求值，不拥有调用执行、授权、持久提交或恢复。模型响应与运行时拥有真实来源、账记录与引用责任；形状合法不证明账真实。

## 未知、原文与来源

unknown、已知零与缺席互不替代。未知照常成立、照常计数，不跳过、不估算补数。必填成员缺席非法。reasoning_tokens／upstream_inference_cost_usd 缺席表示上游没报；quantity／非模型 reference 表示报账方没给；工具 usage 缺席表示未经本系统调模型；endedAt／stoppedAt 缺席表示写账前没有相应时刻／实际停止观察；credentialScope 缺席表示自有费用未经范围凭据产生。工具账、补账及最终响应的 late 缺席具有“不晚”的确定含义；未处分 ready 没有 late，不作“不晚”断言。

金额固定为非负精确美元十进制，无小数位截断、舍入或二进制浮点近似。相等及加总均按精确数值。模型 Cost 的实际费用只取真实上游报告或独立补账，价目表估算、旧数和同类均值不进账。BYOK 的上游实收与 cost_usd 不互推，未核实的上游口径不补默认关系。

Usage 的 input_tokens、cache_read_tokens、cache_write_tokens 两两不相交，合为全部输入；output_tokens 已含 reasoning_tokens，两者已知时 reasoning 不超过 output。cache_tokens 与 total_tokens 只派生不存：前者为两个 cache 分量之和，后者为三个输入分量加 output；任一加数未知则和未知，reasoning 不再另加。source=upstream 至少一个输入／输出数已知；none 则四项全未知且无 reasoning。

Cost 的 upstream_usage 与 later_correction 均有已知金额；later_correction 只供派生有效费用，不覆盖原账。none 为未知且不带 upstream_inference_cost_usd。工具 CostItem 允许 service_reported、tool_reported、model_response 与 none 的原来源分支，来源与金额按公开定义配对；model_call 必带原 ResponseId reference，不把未知费用伪作零。

## 工具镜像、实际效果与帧

工具内部经本系统发出的每次模型请求，其 model_call item 只镜像原 ModelResponse，权威账始终归原响应，同 ResponseId 不镜像两次。工具 usage 当且仅当有 model_call item 才出现，是那些镜像用量之和，不独立汇入模型用量。reasoning_tokens 仅在所有镜像响应都报告时才出现；任一份缺席则工具汇总也缺席，不能只加已报告部分。items 空只表示没有记录费用，不证明免费；全部已知时 total_usd 精确等于各项之和，任一未知则 total_usd 未知。

externalEffect=confirmed 表示外部动作已了结或根本未开始，unknown 表示仍可能动作或花钱。收场、取消确认不证明实际停止；stoppedAt 只能来自实际观察，不早于 startedAt。endedAt 同样不早于开始，不从结果强补。frames 未知只表示计数持有者和在途连续性已丢失，活的拥有者不得用 unknown 隐藏丢计数。

TrimSummary 由实际合并／截断方计数。n 合一记 merged=n−1；cut 只数整帧未交付；omittedBytes 按 UTF-8 文本／原二进制字节计，合并不计。四个 byReason 全部存在，零必须显式写出：

- rate_merged = merged。
- quota_exhausted + rejected = cut。
- cut=0 且 frame_too_long=0 时 omittedBytes=0。
- frames 已知时 merged + cut + frame_too_long 不超过 emitted。

每帧至多计一次未原样交付，先截后拒仅按最终拒绝计。活拥有者应知道全部 TrimSummary；整个在途状态丢失时才是 frames unknown，不能构造分项未知的 TrimSummary。裁剪上限、额度和拒绝政策归实际帧／到达拥有者。

## 补账、分组与求值

原账不可改；补账独立追加，可以调低但不能负值。模型目标是 ResponseId，工具目标按会话日志归属＋callId 识别；generation_endpoint 只配模型响应。补账先证明目标存在和同一归属，按原目标尝试／Run 分组，不按补写位置。Instant 按同一实际时刻比较，不能按文本字典序选最新。

有效费用取目标最新补账；没有补账取原账。取自补账且以 Cost 呈现时 source=later_correction，原有 upstream_inference_cost_usd 原样带上，不因补账丢掉。任意同目标同瞬时却不同金额均构成 correction_tie，即使存在更晚补账也不能遮盖该冲突。重复相等补账不创造新费用；orphan_correction、duplicate_account、correction_tie 是求值失败，不是 unknown。

先完整接纳全部输入及必要关系，再求和；非法值不略过、不改成未知。空组的 (knownSum=0, unknownCount=0) 只说明组确实为空，不把遗漏或不可读来源当空组。存在未知时 knownSum 只是下界，unknownCount 独立保留。每次失败、重发和不同 dispatch 的真实 ResponseId 各记一笔；工具自有费用先按执行归并：own(t) 为全部非 model_call item 之和，任一未知则整体未知，无自有 item 则为0；有工具补账则以该目标新费用替代 own(t)。knownSum 只加每个响应／工具目标的已知有效费用，unknownCount 按未知目标数计，不按 item 数；工具自有 [1,unknown] 得该目标 (0,1)，不能得 (1,1)。model_call 镜像、工具 total 与 usage 不再重计，token 分量也仅从独立响应分别求已知和／未知数。

一条真实发出／一条流恰一份账。模型流已知发出而没收尾、没收到或拒收账时，承载拥有者追补全未知账，并保留拒收原因，不抹掉调用。工具被拒 CostItem 不进 items、不补零、不修补；空 items／拒报后是否另补 none 未知仍待 PF-006／工具执行拥有者裁定，不能据模型流规则自动补工具 item。账、补账与汇总不进入给模型的上下文。

## 归属、迟到与两阶段来源

成本归发起租户，用量归实际凭据范围。两项可能不同，不能按当前成员关系追改；工具 initiator 是租户，模型响应同名字段是中断方，不据同名互推。归属不是读权限。

写入时原尝试已被替代或原 Run 已终结，则记 late:true，仍归原尝试／Run，照常计费。模型响应看发出所在尝试，不看补写记录被归到的新尝试。工具账／补账及最终响应的 late 缺席表示原尝试当前且 Run 未终结，false 非法；ready 不预填提交时 late，其缺席不表示仍属当前尝试。Run 终结后汇总仍可能被迟到费用改变。实际前缀判定归写入者。

同 ResponseId 在 final、ACK 原账 witness、ready 之间唯一选择，顺序为 final > ACK witness > ready。先核同时存在来源的身份、全部关联与原始 usage/cost 一致性，不能以优先级遮盖坏来源。合法 ACK 释放后不强求已释放大 payload，仍核小锚点与原账；ACK 不是补账或处分，final 只替换所选阶段，不再加一笔。未知仍计未知，持久消息新增合法派生不改原账或产生新模型账。来源无法读取或授权／真实性不可核应由组合面返回 unavailable，不伪空组、不塞入本纯值拒绝枚举。

## 接纳顺序与验证

值有多个问题时，依次检查 correction_without_target（仅补账）、结构 malformed、negative_amount、unknown_with_source、total_not_unknown、组合 malformed。结构阶段不先判金额正负。未知枚举拒绝，不静默映射或修补；表示拒收在求值之前，既不证明调用没发生，也不表示没花钱。

[tests/fixtures](tests/fixtures/README.md)保留规范实例与独立原摘要。用实际值测试、精确手算、拒绝顺序和缺资源负控验证；真实来源选择、当前权限、跨记录关联、消息／账同提交及迟到恢复仍由消费方另行兑现。跨进程仍须保持上述身份、归属、一次结算与原值，不以同进程引用作为协议证明。


## 跨边界成立前提

工具执行与它内部发出的模型请求必须归同一账组；尤其后台跨尝试发出仍保原 Run／attempt，实际工具／模型拥有者共同保证，镜像不被计入不允许权威账落到另一组而消失。工具发起模型请求时如何传播原归属的正式交接仍待两 runtime 拥有者接续，不能以本纯函数或形状检查宣布已兑现。补账与原目标也须携相同身份／归属跨边界，按响应／调用身份幂等落盘，不让至少一次交付重计。

跨节点比较补账新旧前，须具名定义时钟偏差上界，或同一目标无时钟全序；定义前不得跨节点直接比较 at 取最新。起止时刻须明确时间源和取哪一边，不能拿两机钟差算时长。Instant 同时区语义相等不替代上述前提。每一跳仍保精确十进制，不以二进制浮点重编码。


工具目标补账的 obtainedVia 当前只有 manual 可用。自动晚到报账或自动查账的来源取值仍待产品负责人限定；此前只留对应记录，不进入有效费用，不伪写 manual。总成本减最后尝试成本只有两边均无未知时才是可用数，任一有未知则差也未知，两个下界相减不能作界。空组不等遗漏账，含未知的 knownSum 不能单独作为总额呈现。依赖名与 MCP 规范串／model_call 保留值是否相交，仍由 Tool Definition 名字拥有者限定，不按本纯模块猜词法。
