# 输入总量随响应校准的最小方案

状态：U0 revision 1 候选。用户已确定追加式响应计量依据、稳定前缀加新增量、两类失效及全量回退；本包推荐承载候选 C，未经独立评审或接受。不存在新的正式领域对象、服务或后台校准进程。数学变量和字段草名只在本包有效。

## 1. 必须承载的性质与归属

| 性质 | 既有宿主与本次增量 | 反查/反例 |
|---|---|---|
| 过去已经实际计入的输入总量不再逐轮分词 | ModelResponse 保留同次输入 observation；纯规划器消费它 | 只保存本地预测不能把历史变成实测 |
| 新增贡献和历史实测的精度分别可见 | 窄模型适配函数与 InputMeter，纯输入/输出 | output usage 直接等于回放输入会把隐藏输出错算 |
| 只复用同一实际前缀及兼容计量依据 | 最终请求投影的规划责任；service 提供授权历史关联 | 相同 modelId 与相同 seq 都不足以证明相同输入 |
| 不回写历史；计量来源与原 response/reply 一起提交 | 既有 ModelResponse payload、settlement owner、session-log 原批追加 | 单独更新“最新 token 总量”会与回复批次失配 |
| standalone 与 service 得到相同规划语义 | 独立公开纯函数和显式参数；runtime 是消费者 | 纯函数偷偷查当前 tenant/log 会失去独立可用性 |
| unknown、估算及上界不伪装 exact | 既有 MP6/RT9 计量精度与后继数据字段 | 配置余量不是证明，未知不能置零 |
| 换代、恢复、乱序不换掉原始来源 | 既有 binding lease、调用身份、原批恢复 | 重试恢复时用当前适配器重写原 payload 不成立 |

这些性质落在现有请求规划、响应数据、传输适配与日志结算边界。没有需进入 kernel 的业务规则，也没有新的跨 owner 同提交存储对象：仍是 SL3 的原 session-log batch。双盲未达成的过程限制见 README；本节是读实现后的人工性质核对。

## 2. 迭代函数及精度

令第 k 次可信响应提供状态 `S_k=(P_k, θ_k, I_k, G_k)`：

- `P_k`：该次发送的**最终输入**边界及可核对身份；包括实际消息投影、system、tools 和输入计量相关 envelope。日志 prefix seq 只是定位资料之一。
- `θ_k`：本次输入计量口径及其版本化兼容依据。
- `I_k`：归一化后与该输入对应的上游输入总量。本文“准确”以这个总量与目标窗口输入口径相同为前提；账单准确不自动证明这一点。
- `G_k`：同次响应实际得到的输出组与其已有 usage、reply、block 顺序及来源的关联；不是逐块 token 分账。

若下一次最终输入为 `P_k ⊕ replay(G_k) ⊕ N`，则

```text
φθ(G|P) = Cθ(P ⊕ replay(G)) − Cθ(P)
δθ(N|P,G) = Cθ(P ⊕ replay(G) ⊕ N) − Cθ(P ⊕ replay(G))
Ĉnext = I_k + φ̂θ(G_k|P_k) + δ̂θ(N|P_k,G_k)
```

φ 是明确的模型适配函数：它解释**此次实际选入**的上次输出如何成为输入。`O_k`（包括可能的 reasoning）是它可用的事实之一，不能无条件替换 φ。它返回 exact / upperBound / estimated / unavailable 及依据。δ 是新增边际计量，须包括消息模板、分隔、system/reminder/tools 变化所致边界影响；单独对新增字符串分词并不一般等于边际。无法给正确边际语义时回退全量，或按已有 estimated 政策明确估算。边界修正可为负；不得强行把每条差分定义为非负独立 token 数。

设 `I_k=Cθ(P_k)`，则

```text
Cnext − Ĉnext = (φθ − φ̂θ) + (δθ − δ̂θ)
```

误差只来自锚后新增部分。下一可信响应令 `I_(k+1)=Cθ(P_(k+1))`，直接替换前一输入锚；不把前次预测值加进去。以首次可信响应为基，逐次应用这一替换可归纳证明：**历史预测误差不跨成功校准累积**。这不证明每次发前误差为零，也不证明缺 usage 的长段期间误差不会增长。

输出组仅在尚未包含于锚的输入中时计一次。第 k 次 input usage 不含该次新生成回复；第 k+1 次 input usage 若含该回复，重锚后它已经归入 I，不能再加 O/φ。多轮未取得 usage 时保留旧有效锚，计量其后全部新增组；不要把最近请求假装已校准。

精度合成规则：所有部分 exact 才能称 exact；有效保守上界与 exact 相加可形成上界；任一 estimated 使整体仅为 estimated；unavailable 不会被零补齐。estimated 的配置余量沿 MP6/RT9，表示按政策准入，不承诺实际不会超窗。若具有与窗口同口径的准确 I、可证明 φ/δ 上界、准确输出预留/窗口限制，则上界检查可给条件性不越窗保证。没有这些前提，构造同一旧 I 而新增输入分别为 1 与 W+1 token，即可反驳“只靠滞后 usage 保证发前不超窗”。样本最大残差也不是上界证明。

## 3. 两类失效与最终投影核验

只设两个失效条件：

1. **非新增部分的实际前缀变化**：消息删改/重排/可见性变化、compaction、system/tools 变化导致旧输入前缀不再成立，或上游实际重写不能对应本地保留前缀。
2. **统计依据实质变化或兼容不能证明**：模型、tokenizer、计量算法、provider 模板、隐藏思考保留/计费到窗口映射等改变计量函数。是否变化由版本化兼容证据决定；“字符串没变”不是证据，“provider 变了”也不自动意味着语义一定不兼容，但无兼容证据就回退。

各种实际场景归入这两类，不增加平级的特殊开关。旧 usage 缺失/错误只是没有可用 observation，不是结构上的第三类失效。

前缀核验发生在**最终输入投影形成后**。最小方案记录规范化输入前缀的边界、内容摘要与 envelope 摘要、投影版本和计量依据；由当前授权输入重建并比较。同 tenant/session 的 seq 负责找回来源，不能代替内容相等。摘要依赖抗碰撞假设，不应宣称无条件数学同一；能直接比较时可直接比较。不得因哈希相同就容忍不同 canonicalization 版本。输入外的 timeout 等字段是否影响 C 由计量依据定义，不盲目把整个含 request id 的 envelope 当输入。

核验允许必要的线性字节扫描/序列化，**不能为了判增量又把稳定历史全量 tokenize**。仍需发送完整上下文，字节序列化并未消失。现有基准不足以支持建设 Merkle 树、持久分词索引或额外服务。长期留存摘要和现有引用即可，不为本功能重复存储全部输入正文。

```text
plan(explicitFinalInput, explicitEvidence?, binding, policy):
  θ := binding.countingBasis
  if evidence is trusted and has compatible θ and matches unchanged prefix:
      additions := finalInput minus that proven prefix (includes replayed response)
      estimate := observedInput + measureMarginal(additions, evidence, θ)
  else:
      estimate := fullMeter(finalInput, θ)
  check exact wire bytes/images and existing output/window admission policy
  return frozenPlan(finalInput, θ, estimate, sourceDescription)

observe(originalPlan, actualResponse):
  extract input observation and same-response output group from original source
  if input observation is absent/inconsistent or does not correspond to plan input:
      return explicit unavailable evidence (do not create an exact anchor)
  return immutable response evidence for originalPlan/input and actualResponse

settle(originalResponse, originalReply, evidence):
  append original response payload carrying evidence with existing reply batch
  confirmed commit -> this response may be selected as later durable evidence
  unknown commit -> recover/resubmit same original batch bytes; do not rederive
```

这是纯值迭代，不需要维护一个“当前锚”后台状态。后继消费者从适合其实际分支的响应选择状态。无有效响应时是冷态，全量 meter；响应后才取得实测锚。无法计量的冷态仍按现行 unavailable 行为处理，不以新方案自动删除 opaque 内容。

## 4. 当次响应中的事实与耐久责任

候选字段 `inputCalibration` 包含下列技术值；名称待规格作者与统一语言 owner 核定：

| 字段组 | 权威来源与最小内容 | 不得做的事 |
|---|---|---|
| requestInput | 原固定 plan 的输入投影身份、边界、basis；service 的来源引用 | 用后来重新组装的请求替换原发送身份 |
| observedInput | `from_usage` 引用完整归一化分项，或 `upstream_total` 保存同次来源确知的独立总量，或 `unavailable` | 与 usage 建第二份冲突总量；把 estimated 填入实际 usage |
| outputGroup | 原 response/reply 身份与实际接收块的有序对应、完整性，引用同次 O/可选 reasoning usage | 把 caller 声称的来源当可信；按字符长度猜 encrypted thinking |
| provenance | 原 binding/route/provider、adapter/projection 版本、来源种类、必要原值字段路径 | 包含凭据；只靠 modelId；依赖会过期的 raw-body 附件 |

CA2 将 input_tokens（未缓存且不含写入）、cache_read_tokens、cache_write_tokens 作为互斥输入分项，三者齐全时相加得 I。当前 OR adapter 在缓存分项缺失时可能保留 unknown，而原始 prompt total 仍已知；可把该独立已知总量放入 `upstream_total`，不填补或改写 CA2 unknown。分项齐全时从 usage 导出即可，不再存重复数；若同次完整分项与总量矛盾，不能建立可信校准。精确 schema 与来源判定由后继规格落实。

传输层拥有提取上游事实及规范化含义；pure invokeModel 返回无 tenant/log 身份的显式证据值。service 依据原调用与授权日志为它关联 MR.id、reply.id/message.id、message.response，以及整条 reply 内容相等的验证；opaque 块还核对 id/index/details 顺序。输出 usage 的 source 与实际 route binding 必须同次；所用 maxOutputTokens 若参与界，应取 MR.route.parameters 的实际发送值，不能用当前 profile/requested 上限。

证据进入**当次 ModelResponse payload**，与原 reply 走已有 SL3 同一提交批次。不会更新历史回复、原 visibility 或新建计量 ledger。写入结果 unknown 时持有原完整批次；恢复只能确认或重送原值。耐久前不能发布“已提交的锚”，恢复也不能凭当前 meter 配置重造旧证据。迟到响应、失败/中断响应如有准确 input observation 可保留该事实；output 不完整就明确相应不完整，不制造完整回复。原 binding 生命周期沿 RT9 S53，直到实际停止和结算责任结束。

输入前缀缓存只是输入重复利用，缓存读/写 token 仍可能占窗口。response cache 是复用旧输出，某些上游返回零 billable usage；最小方案不把这种零值建为新输入锚。已有有效锚可继续使用；若以后要复用缓存原始响应的计量，必须新增明确原响应来源证明，不能本次顺手假定。

## 5. 场景走查

| 场景 | 本方案动作与保证边界 |
|---|---|
| 首次请求/很大新增/工具结果/图片 | 首次全量，稳定锚后只计新增；新增量不能省。图片/字节硬门继续精确，图像 token 依提供者精度；本研究不发图像请求 |
| 多轮 append | 上轮 response 回放＋本轮新内容是新增；取得 usage 后整体重锚，历史误差清零 |
| system/reminder/tools | 能证明只是输入末尾新增才走 δ；改变既有前缀或口径则两类失效回退 |
| opaque/signed/encrypted thinking | 已进入准确 I 的老 opaque 部分无需再猜长度；最新 G 仍需 φ。完整组来源与选入一致可使用有依据的映射，缺证据只能 estimated/unavailable |
| 截断/abort/缺 usage | 已知输入 observation 可独立保留；缺失部分 unknown。不完整 G 不套完整 O；没有新 I 则继续旧锚计所有新增或冷态回退 |
| 部分回复可见、veto/consumed | 只对实际选入输出求 φ；未入输入的输出不算。缺部分映射不能按完整 O 精确平摊 |
| compaction/裁剪/换模型 | 两类规则判断失效；用户允许全量计第一次，响应后重锚；不维护删除 delta |
| 并发分支/重试/乱序 | 按实际输入前缀和来源选响应，不采用全局“最后到达计数”。每次 attempt 独立 usage 与结算；相同 seq 在不同日志/分支不等同 |
| input cache/response cache | 前者按总输入含缓存部分，后者零 billable 不当零上下文。缓存命中本身不改变输入事实 |

对 Anthropic 而言，准确 I **解除已被该输入锚覆盖的旧 signed thinking 的未知 token 瓶颈**。它不从 aggregate 还原各 signature 长度，也不自动解决最新回复 φ。完整输出 usage、隐藏思考保留规则、原输入/组身份与实际 replay 必须绑定；O 已含 reasoning 时再加 reasoning 会多计，丢弃 thinking 却加完整 O 也会多计，直接拿可见 summary 长度则可能少计。实务模型/OR passthrough 前提见研究报告，不泛称所有模型都精确。

## 6. PF 可见性与压缩的关系

[PF-010 rev6 §5.7、§6.10–6.16](../../../product/PF-010-context-management-and-assembly/design.md)规定以一个追加的 CompactionMessage 同时带摘要和静默列表，不修改被引用消息的原 visibility。MS6 [S27–S29](../../../spec/data/messages/v6/contract.md)从日志前缀中所有静默列表推导可读性：存在于前缀、所有祖先 toModel=true、路径未被静默；容器静默覆盖后代。必要但非充分：可读不代表本次一定选入。不能以“最后一条摘要后”替代完整规则。最后一次模型请求之后的消息及 pending 等占位不能随意静默；压缩后仍要补足运行时元上下文。

因此用户描述的一次 compaction 翻 agent-visible，在现行契约是**一次追加记录改变派生可读性**；不是批量回写历史 flag。本方案对实际投影前缀变化失效，全量计新摘要、剩余消息和重引入元上下文，第一次响应后重锚，足以覆盖这项规则，无需复杂删除差分。

aggregate 不提供逐条真值。旧输入 60，本次 100，两条新内容共 40；贡献为 (10,30) 和 (20,20) 都满足同一 observation。t>1 无额外方程不可辨识；逐 block 同理。当前上游 usage 的 modality/cache/reasoning 分项也不是逐 message/block 明细。即使逐次取得差分，也只是给定顺序的边际，模板/BPE 边界使它不能任意移到删除/重排后的上下文。

未来压缩候选选择可以使用语义价值、年龄和**明确标 estimated 的条目长度**，触发总量可用校准输入＋新增估计；选定新上下文后全量重算。它不要求逐条精确归因。但 PF §6.8“压缩后能发下一请求”的硬后置条件，与 RT9 允许 estimated 准入间有保证口径差异（G1）；本包不实现压缩，不把 estimated pass 宣称 PF 硬保证已经实现。

## 7. 公开面、两次规划与 Cordis

`InputMeter` 当前仅接 final body/serialized，不足以验证历史来源。后继公开规划面显式接受可选证据、当前最终输入与版本化适配器；窄纯函数检验/选择前缀并计新增，输出计量值、精度及来源描述。调用者无历史证据时全量运行，独立 invokeModel 不必依赖 tenant、session、registry、log。service 在自己的授权边界拿已提交原响应并建立关联，将结果作为显式值交给相同纯函数。不能通过全局变量或日志查询藏依赖，也不能加一个具有自造业务身份的 calibration service。

openCall 和 dispatch 当前两次 plan 的安全语义不删。**第一步由两次都使用增量 evaluator 消除重复的长历史 tokenize**，仍做各自必要的输入/依据/准入检查。若后继实现复用 fixed plan，必须绑定同一最终输入、policy、binding、生命周期，重验取消/门禁；任何相关变化重新 plan，不接受 caller 的 skip 标志。局部可丢弃缓存归调用 lease，settle/unload 清除；缓存不是权威。没有性能证据前不要求持久索引或跨调用 plan cache。

Cordis 继续承担既有插件作用域、依赖注入、贡献换代和 binding lease。纯计量函数不发生 IO；传输贡献拥有版本化 φ/meter 实现；调用持有固定版本直至结束，新贡献不覆写进行中调用。durable 事实仍归 response 与 session log；卸载只清派生缓存，不抹耐久事实，不把 settle 控制转成事件观察器副作用。公开函数、service 装配及传输贡献各有原作用域，不新添 kernel 原语。

## 8. 精确影响与开放事项

| 权威边界 | 后继候选变更 | 保留 |
|---|---|---|
| MR8 → 暂称 MR9 | response 可选计量证据、原输入/输出来源、不可变与同次对应校验 | 原 usage、route、reply 身份与不可回写 |
| RT9 → 暂称 RT10 | S54/S57/S58/S60 显式纯规划证据；S68–S75 同批来源、恢复、计量/准入证据；InputMeter增量接口与失效 | 单次发送、固定计划、取消门禁、原批结算、现有操作身份 |
| MP6 → 暂称 MP7（如需） | 增量/φ 精度与依据版本化兼容要求，沿现行 estimated 余量 | 不把估算政策变硬保证，不改输出预留口径 |
| CA2、MS6、SL3 | 预计不改语义；仅若 MR schema 引用闭包需要再精确核对 | cache互斥分项、派生可见性、原批追加 |
| core/model-response、model/pi-ai-transport、model/model-request-runtime realization | 分别映射证据 schema、来源提取/φ，以及同一 runtime 节点中的公开规划/授权来源/结算 owner；必须另写候选修订 | 既有 provider 与 lease 边界，无新 store |

G1：未来 compaction 的硬 fit 承诺如何与 estimated 准入对齐，交产品/架构 owner；仅阻断本包对压缩硬保证的声明。G2：具体模型 φ 的 exact/上界依据尚缺实际 OR 观察；首个实现不能冒称已证，允许依现行政策 estimated 或 unavailable。G3：规范化输入投影及 θ 的精确字段、兼容证据提供者，需规格施工将以下原则写成可判条件；无法证明者回退，不猜兼容。G4：候选字段的正式命名及后继版本号由相应 owner 核定；本包无权限登记。其他既定方向无需重开产品取舍。

验证交接见 construction brief；本包尚无新 TLA+/实现测试结果。研究中的离线计时证明当前纯 text meter 的成本，不证明所有 provider 的窗口、φ 或新方案已经实现正确。
