# 优先两家完整输出贡献与纯图缓存增量

2026-09-29，revision 3，candidate，未接受、未实施；新增 bindings 0。实现基线 `b69f287d243b628210c1abce8f787fec8f95b508`。本页接续 D107 的 [v13](v13-output-history-design.md)、D109 的 [v15](v15-image-preparation-design.md)与[原 basis 适用接缝 revision 3](image-preparation-basis-applicability-candidate.md)，不覆盖其已接受字节。RT10/MR9 的 estimated、来源、历史组和 full/φ/δ 足以表达本增量；不新增公共契约或依赖 T29。

依据为 [OpenAI 窄研究](../../../../../research/model-request-adaptation/reports/2026-09-29-openai-closeout.md)、[Anthropic 窄研究](../../../../../research/model-request-adaptation/reports/2026-09-29-anthropic-closeout.md)，选择依据见[提案附页](../../../../record/proposals/model-input-usage-calibration/priority-family-choice.md)。原产品允许有依据的估算及可配置余量；以下均不是精确计数或可证明上界。

## 责任与共享算法

仍由公开独立 transport 函数及其既有 Cordis service 消费同一纯计量实现；没有新 plugin、fiber、registry、存储、后台任务或 Session/Run 行为。family 模块提供有限来源记录与必要的贡献前提，共享构件拥有来源校验、完整组覆盖、去重、精确数加总及 full/new/φ 组合。模型叶仅选择记录，不复制控制流程。共享分类必须区分普通可见、需完整组、不可解释三态；未知或 unsigned reasoning 不能以 false 落回 JSON 分词。实际 body 到输入投影由唯一已接受投影函数核验，不能把 body.messages 与 projection.units 直接字节相等当通用条件（Anthropic 合法缓存元数据已被排除）。

对完整历史输出组 g，令 O(g) 为原上游响应的已知 output_tokens，C(g) 为下一次输入贡献。本候选统一使用 **C(g)=O(g)+0（estimated）**。0 是净 framing 修正的明确估计假设，不表示隐藏推理为零；O 已含 reasoning，不再加 reasoning_tokens。无可信误差上界、置信区间或正负误差保证。OpenAI Pro 的 O 是 workload-related 代理，可能含多遍工作，不能声称等于一个上下文中的 token。

同一贡献函数在三个位置使用：full 对当前全部输入投影计量，完整组以 C(g) 替换；new 对新增区域做同样替换；φ 仅解释当前允许复用的原响应组。原 I 可复用且 basis 相同的迭代仍为 I+φ+δ；不得让 full/new 与 φ 用不同的组过滤或公式。所有组互斥覆盖，剩余可见输入走既有 meter；margin 只按现有统一政策应用一次。

算法顺序及失败：

1. 沿 RT10/v13 核原 response 身份、摘要、组顺序、所选 Assistant 来源及字段一致性。可判伪造、坏摘要、矛盾或非法形状仍是 `invalidInput`，不能降格 full 或 unavailable。
2. 整组须对应当前实际发送投影中一个完整、连续、唯一的 assistant 单元；其中 text、tool、signed/encrypted reasoning 全部在同一覆盖中，不允许只取 reasoning、跨组拼接或重复覆盖。同组 text/tool 不再普通分词。已接受的工具 ID 映射沿原规则，不发明等价转换。
3. 原 O 必须已知、来源为本次真实 upstream usage、响应完整，原输出字节/顺序未改；不得用推测 O、部分响应或实际非原组的派生表示。缺事实、未覆盖的不透明块、未知格式/算法或不在有限适用表时，该次必要贡献 `unavailable`，不按密文或 signature 的 JSON 长度分词，不丢历史。
4. 原/今 basis 只经已接受 C 的 `relateMeterBases` 与家族 `OriginalBasisApplies` 纯谓词解释；所有复合 revision 解析复用共享 inspect。谓词精确命中有限原记录，不用版本范围、前缀匹配或 current 条件替代 original。
5. 原 requestInput 缺席时，C 的 `currentOnly` 不制造原 basis。full/new 可以依合法 history.origin、原完整组及有限 O 记录判断；若家族另需原 signed prefix 而证据缺席则 unavailable。原依据 known/unknown、原 O 可解释、原 I 可复用是三个不同判断。
6. φ 仅在原 I 已知且 complete canonical basis 为 `sameEffective` 时可用。原 O 在 `changedEffective` 仍可能可解释；这不授权复用 I。六 Pro 的 scope_unknown 不可重锚。source_unavailable/no_observation/prefix_changed/basis_changed 的既有首原因次序不变。

不会修改 ModelResponse/outputHistory 中原值、摘要或 basis。图片准备只改变当前显式发送表示；历史真实性不因 projection 变化而豁免。当前未知 meter 语义不可发送；旧 O 可解释不能替当前 meter 建立语义。

## 有限家族记录

表中均为精确模型、固定 provider、原 binding 的起始适用行；每行还必须固定实际工厂产出的 algorithm/tokenizer/replay revision 和完整来源检查。实现时把这些值从该 commit 的工厂逐一导出为受测 fixture，并随实现提交给出明确目标 binding/revision 清单；不得猜测将来的 mp4 编号，不以接受本页自动接受任意后继来源。更改影响计量的当前实现必须分配新依据；后继 original 行须显式登记及验证。

| 家族行 | 模型 ID | 原 definition / implementation | 额外前提 |
| --- | --- | --- | --- |
| O6-A | openai/gpt-6-astra | 4 / pi-ai:openai/mp4-17 | 下述 OpenAI 域 |
| O6-S | openai/gpt-6-sol | 5 / pi-ai:openai/mp4-17 | 同上 |
| O6-L | openai/gpt-6-luna | 6 / pi-ai:openai/mp4-17 | 同上 |
| O6-AP | openai/gpt-6-astra-pro | 5 / pi-ai:openai/mp4-17 | 同上；I scope_unknown |
| O6-SP | openai/gpt-6-sol-pro | 5 / pi-ai:openai/mp4-17 | 同上；I scope_unknown |
| O6-LP | openai/gpt-6-luna-pro | 5 / pi-ai:openai/mp4-17 | 同上；I scope_unknown |
| O56-SP | openai/gpt-5.6-sol-pro | 7 / pi-ai:openai/mp4-17 | 同上；I scope_unknown |
| O56-TP | openai/gpt-5.6-terra-pro | 7 / pi-ai:openai/mp4-17 | 同上；I scope_unknown |
| O56-LP | openai/gpt-5.6-luna-pro | 7 / pi-ai:openai/mp4-17 | 同上；I scope_unknown |
| A55 | anthropic/claude-opus-5.5 | 3 / pi-ai:anthropic/mp4-17 | Anthropic 域；须原 signed prefix |
| A5 | anthropic/claude-opus-5 | 3 / pi-ai:anthropic/mp4-17 | Anthropic 域 |
| AS5 | anthropic/claude-sonnet-5 | 3 / pi-ai:anthropic/mp4-17 | Anthropic 域 |
| AF51 | anthropic/claude-fable-5.1 | 3 / pi-ai:anthropic/mp4-17 | Anthropic 域；须原 signed prefix |

现有 GPT5.6 sol/terra/luna 三个非 Pro 的已证贡献规则及 6/mp4-12、7/mp4-16、8/mp4-17 原记录保持；共享重构须回归它们，但不将其 all_turns 依据推广到九新叶。旧来源记录不是旧执行实现兼容层。

**OpenAI 域**：provider 精确 openai，当前和原模型相同；保持固定 provider 路由、不 fallback；仅当前既有 slug execution mode，reasoning.context **省略**，既有 effort 合法值。显式 current_turn/all_turns 不在九叶新增域。完整 reasoning_details 序列保留。官方 GPT5.6 默认 all_turns 不证明 GPT6 或 Pro；九叶采用 O 的依据是与完整回放工作量相关的估算，而不是声称隐藏路由已证 keep-all。六 Pro current I 坚持 scope_unknown，不能借旧源 ledger 的历史例外将 current reader 改为 contextual-known。

**Anthropic 域**：provider 精确 anthropic、同一模型、完整 `anthropic-claude-v1` 序列；signed reasoning.text 含非空 signature，encrypted 含非空 data。已支持的合法未知成员仍原样保留，未知 format 不进入估算域。四叶使用相同组算法；原生 keep-all 仅支持相关性，不证明 OR 净修正为零。Opus5.5/Fable5.1 必须能用原 requestInput 的已知源与前缀边界/摘要、当前实际投影，确认该组之前 system/tools/messages 的签名前缀未改变；只比较最新 user 或 model ID 不够。缺原 requestInput/source/prefix 明确 unavailable，不合成。其它两叶仍要求原完整组、同模型及当前组合满足现有追加/重算规则，不建立跨模型或修改签名回放的许可。

## 原 signed prefix 的包内承接

当前 new 输入只有 N，φ 只有目标组，不能从它们重建 P。planner 在来源校验通过、最终 projection 固定后，为需要强前缀的原组计算当前同 boundary 的 prefixDigest、inputEnvelopeDigest、projectionRevision 和所选组绝对位置；必须核 boundary 非负安全整数、不超当前长度且必须等于该完整组在当前投影中的起点；只要求小于等于会漏过在原 P 与 signed G 之间插入新消息的反例。现有 inputEnvelopeDigest 还含 generation/routing；本次将宽 envelope 与 prefix 完全相等作为足够条件，不冒称其就是原生签名语义摘要。effort/max_tokens 等合法变参会使宽摘要变化，但原 MR9 未保存可拆分的窄摘要，因此此时必要贡献 unavailable，而不是 invalidInput 或“签名非法”；不能去掉当前字段再与旧宽摘要比较。扩大到这些变参后的旧签名计量需要另立有依据的持久事实增量，本页不宣称已支持。对原已知 requestInput 比较这些事实，不使用 caller 的“已验证”布尔，不把 basis relation 当作 prefix relation。

本候选采用请求局部包内能力：共享 helper 由实际完整 projection 建立只读事实，使用 private WeakMap 以**本次最终冻结的 meter input 对象身份**关联；在同步 measure 调用前安装，finally 删除，不导出 package 公共入口，不存在跨请求全局 current slot。full 可直接从自有完整 projection 核验；new/φ 由上述同一事实计算函数承接，重入/并行的输入互不替代。事实仅含派生摘要与索引，不把 P 内容交给增量 tokenizer。planner 不能以传入摘要直接填表，原事实始终来自当前实际 projection。若实现 wrapper 复制 input，必须在最终传入对象处关联，不能失配后退化为信任。

独立调用 InputMeter 的 new/φ 没有该局部能力时，对需要 signed prefix 的组返回 unavailable；公开 invoke 与 Cordis service 都由 planner 建立它，因此能力相同。该局部能力只证明当前投影上下文，仍须原 source/摘要/完整组检查；无原 requestInput 仍 unavailable。无公开 DTO、持久字段或新服务。实施验收加入：伪造同形 input、跨请求复用、throw 后清理、同步重入、不同 prefix 同 N、边界与组起点不等（包括 P 与 G 间插入消息）、原事实缺席全部不能取得错误 prefix 通过。

## ND-G2：last_message 纯图末端

官方四叶现有配置只声明 `ttlValues:['1h']`、`breakpointLayouts:[['last_message']]`，本候选不扩大 TTL 或 layout 供给。TTL 必须从通过该 binding 校验的配置读取；wire 不填默认值、不依环境变量或写死 1h。普通有效 text、图文、tool-text 路径仍使用现有块标记。

现有选中末端为实际最后一条 eligible user/assistant/tool 消息。当且仅当它是 user、content 是非空纯 image_url 数组、每个图片已通过现有准备/最终门、没有后继输入消息且没有可附着 text 块，才将同一 last_message 断点发为 OpenRouter 正式顶层 `cache_control:{type:'ephemeral',ttl:configuredTTL}`。这是显式策略选择，不是 OpenRouter image_url 上的未知扩展。OR automatic 的最后可缓存块与此请求的末尾图片一致：整个末端前缀被覆盖，并非回溯此前 text。

不得补假 text、在图块上挂未获证明的扩展、退回上一轮消息或移除纯图支持。空消息/空数组不是此谓词的命中；末端没有可用缓存目标时明确规划 unavailable，不悄悄成功或让 automatic 移到前文。空 text 不当成有效缓存目标；只有空 text 的混合数组也不冒充本候选的纯图数组，明确 unavailable。合法非空 text 路径不变。多个断点、冲突的显式顶层控制、非 Anthropic 路由或其它 TTL/layout 不得进入该窄分支，沿配置非法输入或有效但不支持策略的现有失败面区分，不能增加公开结果枚举。

refusal 历史按现有 D108 文本映射；refusal 不创造缓存目标或 signed reasoning 组。上游拒绝/错误仍按实际终结记录，不能宣称缓存成功；reader 保全已知真实 usage/cost，未知不补零。

**缓存元数据投影中立性**：只对已由以上同一纯选择函数验证的 planner-owned 精确顶层控制，在 input-bearing projection 排除其两个键；现有合法 text 标记中立规则保留。任意用户来源、额外字段、不同端点/路由/TTL/layout 的 cache_control 不由“字段名相同”豁免。wire、encoded body bytes、摘要及发送前字节门仍保留实际控制。projection 必须换明确 revision；原/今完整 basis 不相等时不得因去缓存元数据就声称 I 可复用。

原生 signed-prefix 规则排除 cache_control，为此中立选择提供限定依据；OR 的具体转换仍须当前真实观察，不声称拥有原生 payload。自动/块标记的切换不改原历史，未证明同一末端不能剥字段。缓存命中最终只认真实 read/write usage；成功发送、出现控制字段或 token 下降均不能单独认定命中。

## 施工与接受义务

独立层次：共享输出组构件先固定内部接口；OpenAI/Anthropic 各自填有限记录与参数；cache planner/projection 同一 owner 修改；公开 invoke 与 service 复用它们。不得各家复制 whole-group helper。本次必须提交可删除/合并函数清单和实际删除 diff：将 openai-output-history.ts 的 coveredUnits/fullOpenAi56History/newOpenAi56History 中通用遍历、覆盖和计量组合移到唯一共享实现；openai-replay.ts 的完整 selection/source/O/实际单元校验抽为同一核，家族仅保留 format/provider/mode/prefix/有限记录；家族原有局部 basis 比较删除并调用 C relation。usage-scope.ts 的旧执行配置提升 current Pro 为 inherited_context_total 的过渡分支删除，当前六 Pro 坚持 unknown；合法已保存的原 O 解释表保留，不误删为兼容层。必须移除被替代旧函数及死入口，不能只叠加新 helper。参数化正反测试覆盖全部 16 叶（含三旧 GPT56 非 Pro），并证明 full/φ/δ 只调用一个贡献源。各实现提交列出实际改动 source hash、目标 definition/implementation/meter/projection revision；不留旧版执行兼容桥。包 README/README_ZH 同步解释 estimated、不可用范围、显式配置和直接函数用法。

| 编号 | 必须新增的可失败验收 | 通过条件 / 不能冒用 |
| --- | --- | --- |
| PF1 | 13 叶有限来源逐行、未知 revision/model/provider/context、签名/密文缺值、部分/乱序/重复组 | 合法原组 O 恰一次；来源矛盾先 invalidInput；未知必要解释 unavailable；密文/signature tokenizer 调用为零 |
| PF2 | 多组 full/new/φ、同组 text/tool、已知小数精确相加与超限/margin | 同一贡献函数和覆盖分配；稳定前缀不全量分词；当前 bytes/image 门仍精确执行；Pro I 不重锚 |
| PF3 | Opus5.5/Fable5.1 改 system/tools/前缀、缺 requestInput、合法仅尾追加、已允许 cache metadata 移动 | 前三不能伪造 prefix 通过；追加合法；metadata 中立不掩盖真实内容变化；其它两叶不误套跨模型许可 |
| PF4 | ND-G2 纯图单/多图、图文、tool 文本、空目标、空 text、错误 layout/TTL、额外 cache 字段、后继 assistant | 精确 wire 快照；仅合格纯图用顶层且 TTL 来自配置；其它有效路径不变；无目标明确失败、不回溯 |
| PF5 | 公共独立 invoke 与实际 Cordis service 各自组合；同一响应流生成历史后再请求，含 prepared image | 真实实现同路，完整组/usage 来源保留；新路径不能用提取函数或仅 plan fixture 替代组合验收 |
| PF6 | 每叶三轮实际同 provider 完整响应回放（尽可能含工具）：一组、再新增组、多组 | 记录完整 basis/wire/actual usage/估计误差及局限；普通叶观察 full→marginal→marginal；Pro 因 I 未知可 full，不能强制伪造 marginal |
| PF7 | 四 Anthropic 当前路由纯图实际发送及足量暖读、配置 TTL 对应证据 | 分别证明 wire 被接受及真实 cache read/write；原文字命中不覆盖纯图，不用等待时间或字段存在代替命中；TTL 到期证据仍沿既有完整认证要求 |
| PF8 | 不变行为的证据复用清单 | 精确旧源码/绑定/请求证据及无影响分析可复用；新 meter/wire 行为必须新验，旧收据不能改标签；GPT56 非 Pro 与 refusal/提醒回归按实际变更范围 |

PF6/PF7 的 paid 许可和真实费用仍由主线既有政策管理；它们阻止相关正式认证，不能阻止无凭据实现/工程验证。没有新有限状态机、跨 owner 同 commit 或持久关系，故不新增 TLA/Alloy 模型；原 RT10 的失效与来源不变量照旧，新增有限适用关系、互斥覆盖、去重和加总用参数化正反测试验证。该理由不声称现有 TLA 证明了估计误差、OR 转换或签名算法。

其余六厂商可复用研究→能力/证据矩阵→共享机制/厂商策略/型号窄记录→真实契约差异采用→离线及真实 public/service 差分验证的流程。不可直接推广本候选尚待实测的 O 代理、缓存映射、tokenizer 或签名前提；本次不扩其余六家施工范围。
