# Anthropic 缓存标记与校准输入投影的窄核对

2026-09-29；本地基线 `970cf35e798ec2e8e1592253a8fca8583e60f653`。对象仅为当前四条 Anthropic official definition 经 OpenRouter Chat Completions、固定 `provider=anthropic` 的生产路径，及 transport v12 候选的完整 wire 前缀摘要。四个本地 modelId 为 `anthropic/claude-opus-5.5`、`anthropic/claude-opus-5`、`anthropic/claude-sonnet-5`、`anthropic/claude-fable-5.1`；本次未重新确认其线上目录，也未发模型请求。

结论分两层：**正常 user 文本块不变、仅合法 cache_control 标记移到新增末尾，有第一方缓存语义支持将标记排除在输入内容投影之外**；这能消除已复现的普通 append 永久 full 反例。**assistant/tool 字符串与单 text 数组的往返包装需要另作限定**：原生 Anthropic 的 shorthand 文档、OR 当前 schema 和选定 pi 源码提供了清晰依据，但尚未核得 OR 服务端这两种表示的精确转换。本报告不以允许 estimated 为由掩盖旧 P 等价前提，也不要求先取得不存在的精确 tokenizer 才能使用有依据的新增估算。主线随后提出从新修订首轮起固定assistant/tool合法数组表示；该结构规避可消除跨轮异构表示，无需额外证明两种wire计数等价，见§3。

这是事实和条件约束输入，不是新的采用决定。最小修订方向由主线/提供者设计 owner 裁定，未改任何规格、realization 或产品源码。研究遵循 worktree-discipline 与 handbook 来源核对；[可重跑证据](../evidence/2026-09-29-anthropic-calibration-projection/README.md)限定了观察范围。

## 1. 当前代码反例是确定的

本地来源及 SHA 见 [sources.json](../evidence/2026-09-29-anthropic-calibration-projection/sources.json)。

| 原件 | 实际行为 | 支持范围 |
|---|---|---|
| `packages/model/pi-ai-transport/src/plan.ts:110–127,364–379` | `last_message` 每次标记最后一个 user/assistant/tool 的最后 text；非空 string 被临时包装成单 text 数组 | 本项目实际请求构造；不证明上游转换 |
| 同文件约218–273 | assistant文本原本join成string；tool结果文本原本join成string，空结果有明确占位，图像另映射到user消息 | 不能把后续string/array变化误认成来源历史被编辑 |
| `official-models/anthropic.ts:25–36` | 四条定义共用 explicit、`ttlValues=['1h']`、`breakpointLayouts=[['last_message']]` | 当前只生产此缓存配置，不把5m上游可用性当成本项目已支持 |
| `input-meters/anthropic.ts:290–355` | 既有estimated meter已经从已校验text块去掉cache_control；仍保留string与数组表示差别。opaque reasoning不按ciphertext计数 | 当前估算投影已有“缓存元数据不是prompt文字”的处理，但不是增量前缀证明 |
| [transport v12候选](../../../design/realization/packages/model/pi-ai-transport/v12-usage-calibration-design.md)「输入、输出与摘要预像」 | 前缀单元包含每条完整wire消息及cache标记；明确标记移动改变旧消息即full | 安全保守，但不能实现本路径普通append的增量目标；候选尚未实施 |

例如请求A旧尾为`user:[{type:text,text:Q,cache_control:1h}]`；追加回复和新问题后，请求B该旧尾变成`user:[{type:text,text:Q}]`，标记转到新增末尾。Q、role和块顺序全没变，完整wire旧前缀仍不同。这个反例**不依赖**字符串包装或上游token误差。

离线实验从上述 SHA 对应的真实 `addBreakpoint` 函数提取原函数体执行，仅移除其已知 TS 参数签名；不替换产品函数、不运行完整plan。23项形状检查通过；6次正常append中完整wire前缀相等 **0/6**，仅规范化合法user文本缓存标记的研究投影相等 **6/6**。真实文本/role/未知字段/非法TTL变化仍可区分；wire没有被投影函数修改。该结果是本地形状与成本路径证据，**不是**上游tokens相等测试或已实现的性能成果。

## 2. 第一方事实、适用层与缺口

本节网页均于2026-09-29读取，为滚动文档，未伪造不可变发布版本。固定源码版本另列。只依赖直接打开的第一方正文；搜索摘要的旧版说法不优先于实际正文。

**F1 — Anthropic缓存机制。** [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)的“How automatic prefix checking works”明确举出末端显式断点从第10块移到第15块、仍回查并命中原10块的例子；“Mixing different TTLs”用同一输入序列上的A/B/C位置划分读、1h写、5m写成本；“Cache storage and sharing”说明缓存不改变输出生成。其usage说明要求未缓存输入、缓存读、缓存写三项求和得到总输入。直接含义是缓存分区/寿命不等于新增prompt文本；文档未提供“任意provider/变换/隐藏保留下，改变标记永远保持相同窗口计数”的通用定理。

**F2 — OR明确接收该缓存控制。** [OpenRouter prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching)的Anthropic段落与TTL段落支持per-block `cache_control`，区分默认5m与显式1h；有user文本块示例。此证据适用于当前Chat Completions缓存控制入口；缓存命中不是校准复用的前置条件，未命中/过期也不意味着旧文本被改写。

**F3 — 原生Anthropic内容简写。** [Create a Message](https://platform.claude.com/docs/en/api/messages/create)的messages说明明确string是单text块数组的简写，并展示等价输入；同处说明连续相同role会合并为turn。因此可讨论string与**恰一个、仅text语义**的块等价，不能把任意多个块连接、role合并或工具结构重排都当等价。其直接范围是原生Messages API，不是OR服务端适配源码。

**F4 — OR当前类型确实接受数组，但未公布全部转换细节。** [OpenRouter OpenAPI](https://openrouter.ai/openapi.json)的`#/components/schemas/ChatAssistantMessage/properties/content`接受string、ChatContentItems数组或null；`ChatToolMessage/properties/content`接受string或ChatContentItems数组；`ChatContentText`含cache_control。故不能依据[overview](https://openrouter.ai/docs/api/reference/overview)的简表`tool.content:string`声称线上数组不合法。overview同时说明自定义provider的工具属性会转换映射。已检索这些页面及[tool-calling](https://openrouter.ai/docs/guides/features/tool-calling)，没有找到固定Anthropic路径将上述每一种形状转为原生消息的精确公开算法。**类型可接收不等于token/转换等价保证**。

**F5 — tool result的原生层不同。** [Anthropic Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)把结果放在user消息里的tool_result，内部content可以是string或嵌套块；关联id、结果次序与消息邻接有要求。OR `role:tool`因此还涉及包装/合并/关联转换，不可直接用顶层user字符串简写声明覆盖它；保留工具id、内容、错误语义和块顺序是必要条件。

**F6 — 实际选定pi版本可核。** 本项目`provenance.json`固定`earendil-works/pi` **0.86.1**、commit **`3390bd93630965a12a0a1a5c36ce890ec22f7e1d`**。已读取其[openai-completions.ts](https://github.com/earendil-works/pi/blob/3390bd93630965a12a0a1a5c36ce890ec22f7e1d/packages/ai/src/api/openai-completions.ts)，下载SHA与本项目记录同为`b06508ab22b6595d85d636db0737ac7c48adbf9d8d5ff61ba2bac94c9599ac51`。1070–1184行对Anthropic兼容缓存构造1h控制、标记最后对话消息并把非空string包装为单text数组；约1320、1342行仍先生成assistant string，约1414行生成tool string。此为选定client的实际做法，支持包装意图与来源；它没有提供OR服务端转换的普遍证明。本轮不以其他pi HEAD代替采用版本。

**F7 — count端点不是本题的硬界替代。** [Anthropic Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)说明count过程是估计、不运行缓存逻辑，即使输入带cache_control。本次未调用这个端点；它也不能替代经过OR实际适配的观察。

## 3. 可以成立的窄投影关系

以下是F1–F7对候选修订施加的可判条件，**不是已接受实现**。

**P1：当前普通user-text路径的缓存标记中立。** 保持固定模型/provider/投影版本、system/tools/envelope与隐藏保留语义不变；只在当前provider已支持的`messages[*].content[*]`合法text块上，排除已校验的`cache_control={type:ephemeral,ttl:1h}`；所有文本原串、role、块顺序、数量、tool_calls/tool_call_id、reasoning及未知成员保持。F1描述的旧prefix回查机制和F2的OR入口支持这条**输入内容投影**关系。它不以warm hit或某次数值相等为依据，不需要掌握Claude精确tokenizer；I仍取真实总输入，φ/δ可保持有依据estimated并应用现有配置余量。

P1的最窄可交付域是此前缀不含未解决的hidden-retention/转换问题的正常文本对话，旧/新user内容数组本来就一致。不得因“缓存控制中立”顺带免除已存在的reasoning回放、私有变换或真实provider核验；这些原有前提独立适用。要声明4条路由的全部工具循环都增量，还需要解决字符串包装变化：可以验证P2，也可以采用下述固定wire结构规避；不可拿P1测试代表完整交付。

**P2：string与单text数组的包装规范化。** F3/F4/F6使其成为有明确依据的窄候选，而不是任意JSON相似性猜测。有效形状只能是同一非空字符串与恰一个text块，块无其他输入语义字段，合法缓存控制之外没有额外成员；不能拼接多text块、把null/空数组/空文本混同，也不能改变外层role或工具关联。assistant与tool需要分开核，tool还涉及F5的原生层。当前未取得OR原生上游体，**未判定P2在整条服务端路径已等价**；离线P2仅展示若该关系成立，包装变化可以消除，并检出内容/id/reasoning变化。

**主线追加的结构规避：从新修订第一请求起固定合法表示。** 若planner始终将Anthropic非空assistant/tool文本写成恰一个text块数组，再由原缓存逻辑加/移标记，后续比较的是同形数组，不再比较旧string与新array。F4提供OR接收形状依据，F6提供选定client使用这一形状的事实；这条路径**不依赖P2的跨形状token等价假设**。它改变此前的wire构造，因此必须用新implementation/meter/transform/projection修订，旧basis不直接复用，第一次全量后响应重锚。empty assistant保留原合法空表示；不把null、空数组和空串并成一类，不拼接多块。后续计量只去已支持text块的缓存元数据，其余实际同形内容保持。

这是可实施的最小结构规避，不是“已经证明旧string与array一样”。不必仅为证明被消除的跨形状关系增加付费探针门槛；独立planner离线golden即可证明表示始终稳定。OR特定route接受组合、tool关联完整传递、隐藏保留和φ/δ误差仍属于既有真实组合验收，不因schema通过自动完成。若某路由实际上拒绝这种已声明形状，仍需按真实失败处理，不能退回逐轮漂移表示后声称增量目标已达成。本轮离线额外4项检查确认assistant/tool在研究构造的新修订里始终是数组，标记移动后的旧内容投影保持；没有执行产品实现或上游转换。

**TTL与位置不是同一配置权限问题。** 对已支持1h断点，位置从旧尾移动到新增尾是本次已证退化的触发，P1排除该标记即可保持旧内容前缀。原生及OR文档把5m/1h解释为缓存寿命/写入价格差别，但本地当前definition仅允许1h；本研究不授予5m或任意TTL请求。若以后支持两个合法TTL且实际输入内容规则不变，可由固定provider声明精确前后basis兼容；不能删掉整个binding.configuration、跳过TTL合法性或令caller布尔绕过basis检查。非法TTL仍拒绝；多断点顺序等请求有效性要求不会因计量投影而消失。

**对计量精度的边界。** 输入前缀同一是协议语义主张，φ/δ数值是度量精度主张，二者不混。P1依据是官方缓存协议描述；采用它不等于把现有legacy BPE升级exact。P2若实际OR转译未确认，不能仅把结果标签改estimated，就把不明的旧P当准确锚。反过来，只要P同一的适用依据成立，新增估算不需要绝对误差上界才可按当前政策准入。真实输入/role/tools/reasoning变化仍失效或需原有适配依据；不以配置余量掩盖漏计。

## 4. 对最小修订与验证的约束

MR9 S-41/RT10 S-77允许提供者规定版本化input-bearing projection；问题在v12候选选了完整wire作为该投影，并非数据契约强制全部wire元数据都进入prefix。若主线仅采用P1/P2规范化，最小影响面可限定在固定Anthropic适配贡献的计量投影及对应版本/依据，wire原样。若采用主线追加的稳定数组规避，则允许该固定贡献从新修订首轮起稳定选择合法wire表示；不改变实际文本、role、工具关联、消息处置、caps/modalities、last_message布局或1h TTL。两种路径不能混称wire完全不变。完整serialized仍是发送字节；request bytes、逐图bytes与图数仍对完整请求检查。前缀核验允许线性字节扫描，不为证明增量重新tokenize旧P。

排除字段须按已证路径白名单，不可递归删除所有名为cache_control的键；工具参数/结果正文中的同名业务数据必须保留。不做Unicode normalize、裁空白或多块合并来制造prefix命中。新投影版本与旧版默认不兼容，首次全量后重新锚定可接受；若声明兼容须由固定贡献owner给出精确关系，而不是改旧耐久payload。后续φ/δ应与同一投影解释一致，不能hash去标记、meter又当标记文字重复计算。

| 最小验证 | 能关闭的疑问 | 不能声称 |
|---|---|---|
| 当前23项离线形状检查与6次append反例 | 函数实际移动标记；完整wire恒失配；P1不改wire且只放过限定元数据变化 | 真实服务端语义/精确tokens或端到端提速 |
| 后继真实planner离线golden与调用计数 | 独立函数/service相同fixed贡献；正常append进入marginal；稳定P不交tokenizer；完整byte/image门仍执行；负控真变更回full | 上游转换已验证 |
| 授权后OR同体差分观察：原user数组仅移标记、合法TTL对照；独立assistant/tool string↔单text数组 | 在精确路由/版本/形状内核对实际上游体和usage，总input含cache分项；识别额外拼接、丢块或工具结构变化 | 少数相同tokens或warm hit不是普遍等价证明 |
| 内容/role/tools/id/reasoning/未知字段负控；cache miss/过期、长于lookback的追加 | 规范化不抹真实变化；计量复用不依赖服务器缓存命中 | 假设之外模型/平台/hidden规则的适用性 |

OR当前[OpenAPI ChatDebugOptions](https://openrouter.ai/openapi.json#/components/schemas/ChatDebugOptions)和[overview](https://openrouter.ai/docs/api/reference/overview)描述streaming `debug.echo_upstream_body`，可在流首取得适配后的上游body。**后来授权探针**可在合成非敏感输入上使用它，对原始上游体仅排除有依据的缓存元数据后比较；tool测试核嵌套tool_result的content/id/order。这个选项本次未使用，当前项目official route的extra也未因此开放；不得为研究改产品来绕过配置。

最小真实矩阵按user缓存、assistant包装、tool包装三组拆开，每组至少有一组同内容差分和一个真实内容变化负控；固定route及generation/工具参数。记录wire、actual upstream body、serving facts、总I及缓存分项、projection版本和观察日期。若body映射不一致，先解释确切差异；不能靠放大margin使等价“通过”。若只拿到usage而没有上游体，可作为经验支持，P2转换缺口仍不能宣称彻底关闭。缓存命中率不是本验收的成功指标；报告marginal比例、非新增实际内容变化检出、估计残差与适用域。

## 5. 用户指定的 omne-next 断点算法

本机 `/data/qiwei/repos/omne-next`，检索日期2026-09-29，HEAD **`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`**，读取时工作树clean。遵循该仓根与 `omne_harness`/libs局部AGENTS，只读现行 `omne_harness` 实现；未把冻结的 `omne/` 同名副本当依据。以下路径均相对该仓库；逐文件SHA见sources.json。这是本机固定commit事实，不宣称远端最新。

**算法原件**：`omne_harness/libs/omne_harness_agentic/omne_harness_agentic/middlewares/prompt_caching.py:264–353` 的 `_inject_cache_breakpoints` 每次从当前完整请求计算；先去掉messages已有的块级cache_control，复制必要消息，然后布点。原消息不原地修改；没有上一响应输入、LCP/hash状态、ContextVar计数或新增缓存store。模块开头明确说明改用消息类型以避开跨节点context复制导致的计数状态问题。

| 断点 | 精确选取 | 稳定性与默认值 |
|---|---|---|
| BP1 | 存在system时，其最后text块 | 内容不变则位置稳定；不是工具定义断点 |
| BP2 | 可选，倒序找最后HumanMessage，其最后text块 | 同一human turn内稳定，下一human出现时移动；默认关闭 |
| BP3 | progressive开启且消息非空，最后一条不是Human、也不是不带tool_calls的AI时，标记其最后text块 | 典型为Tool或带tool_calls的AI；随工具循环滚动；默认开启；末Human或最终AI跳过 |

需要有text块才能落标记；没有text的数组不虚构内容。字符串加标记时转数组，已有数组深拷贝后加标记。因此照搬该实现并不消除lite的字符串包装漂移。旧BP3标记会被清掉，**不是保留全部旧断点，也不是固定间隔checkpoint队列**。其“旧读新写”注释是依赖缓存已建立、TTL、路由一致与lookback等条件的目标，不能视作每次命中保证。

**TTL、上限与最长前缀各归谁。** 390–480行默认5m，各BP可独立覆写5m/1h，校验BP1≥BP2≥BP3；535–551行5m省略ttl成员、1h显式发送。代码通常新增至多3处标记；它只清messages旧标记，不通用清理任意system预注入标记，也没有最终全请求4处配额分配器，故不能对任意外部输入承诺总数≤3。代码没有20块距离感知/补点器、没有客户端历史最长公共前缀算法。F1中向前最多20个block边界回查属于**服务器缓存查找**；超过范围可能缓存miss，不等于校准锚的模型输入P改变。不能把缓存命中位置当作response usage前缀边界。

**实际装配及测试。** `omne_harness/libs/omne_harness_runtime_plane/omne_harness_runtime_plane/bootstrap/minimal_llm_agent_run_runner_assembly.py:218` 无参挂载，所以该默认装配是BP1+条件BP3、5m，不能把测试开启BP2或自定1h说成生产默认。`omne_harness/design_docs/cross-cutting/agentic-package-design.md:94`要求消息注入先形成最终序列，缓存断点后置。可复核测试原件：

- `omne_harness/libs/omne_harness_agentic/tests/unit/middlewares/test_prompt_caching.py`：272–480行布点、清旧标记、跳过最终AI和分BP TTL；485–545行默认/顺序校验；560–649行三次工具调用BP3向前移动；另有复制和OR路由pin不得覆盖既定路由的测试。
- 同目录 `test_broadcast_injection_prompt_cache_order.py`：真实中间件组合下最终追加先于缓存处理、原历史未被感知注入重写的断言；其byte-identical注释不是上游普遍协议证明。
- `omne_harness/libs/omne_harness_runtime_plane/tests/integration/bootstrap/test_official_middleware_prompt_caching_smoke.py:115–147`：fake model验证实际runner装配启用/关闭，不是OR在线命中或token等价测试。

本次仅阅读，**没有执行omne-next测试或模型请求**；源码节约比例注释没有复测，不作性能结论。

**与响应校准的协作推论。** 从当前完整请求纯计算断点，所有输入注入/转换先完成，再计算最终input-bearing P；仅剔除固定provider已声明合法的缓存元数据。断点选择不消费或改写前次response锚；usage重锚取总I，不能只取缓存读量。BP2/BP3滚动、缓存过期或miss不应自行使相同输入P失效；真实内容/system/tools/role/reasoning保留规则改变仍按原两类失效。无需新增全局state、持久断点索引或重复tokenize旧P。

在lite现有 `last_message + 1h`范围内，最小必要变化仍是B1的稳定合法wire表示与窄输入投影；**不用等三BP策略迁移才能消除本轮退化**。若后继采用omne-next BP1/BP2/BP3，需单独明确布局、BP2选择和TTL配置，因为它改变现有definition唯一last_message布局及1h声明，不是只更换计量算法。本研究不自行搬入其默认5m、额外断点或provider fallback策略。其清所有块级cache_control的做法，也不扩张本研究按精确字段/形状白名单的投影权限。

## 6. 当前可判、未判与责任

- **已判**：完整wire前缀方案在当前普通user append上永久full；P1有第一方协议语义依据并能在本地消除该反例；cache metadata去除不需要换wire。原生string简写、OR数组类型接收和选定pi包装实现均已核。
- **未判**：OR服务端assistant/tool两表示的精确原生映射（稳定wire规避不再依赖这个等价命题）、涉及hidden thinking时的保留同一性、具体φ/δ误差及真实性能。未运行模型/付费探针，无“所有四模型已验收”声明。
- **owner**：传输适配/计量提供者负责版本化P1/P2适用依据和实现；主线/architecture reviewer判断候选修订；spec作者仅在表达不足时补精确条款，不能自行放宽未知等价；独立验证者负责真实planner和授权OR差分证据。原core数据承载与同批日志责任不因这个provider局部问题重开。

失败获取记录：直接下载OR OpenAPI被403拒绝，已通过web工具读取原站对应schema，未伪造下载SHA；猜测的pi原生`api/anthropic.ts`路径404，未用它作证，采用路径的openai-completions.ts已按本项目provenance核实。此限制不影响上述已判本地反例及P1文档依据。
