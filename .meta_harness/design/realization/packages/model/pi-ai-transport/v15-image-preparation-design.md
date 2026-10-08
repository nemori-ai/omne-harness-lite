# v15 请求图片准备（）

2026-09-29 revision 4。语义依据为已接受 [RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md) S57/S74/S77～83、[MR9](../../../../spec/data/model-response/v9/contract.md) S41～45；本提供者映射尚未采用、未实施，新增bindings 0，验收尚待。接续v13，和并行v14 refusal无语义替代关系。只交付已选图片同模态发送前处理，不实现完整上下文组装或跨模态renderings。

架构选择见提案。独立领域读数/三候选与四表在该包；pi/DSH/Sharp主源事实归 research/typescript-image-input-handling（HUB e9a5d13e + 26ddf358），本页不复制研究。

## 唯一公开接口归属与异步接缝

runtime `types.ts`仍拥有TransportAdapter/PlanInput/PlannedSemantics，v21定公共plan上下文。transport导出 `createImagePreparer` 与其技术policy/result类型，不新增Cordis服务键。公开无资源`planRequest`改为async并显式消费预先取得的prepare实例/上下文，不在调用时import native模块、读磁盘或联网；装配先加载codec，factory显式接收已加载codec且可判不可用。所有规划消费者一并破坏性升级，无同步兼容重载。

候选技术形状（接口名是技术属性，不是新领域词条）：

```ts
interface ImagePreparePolicy {
  sourceMaxBytes: number
  decodedMaxPixels: number
  decodedMaxDimension: number
  maxConcurrent: number
  maxInFlightBytes: number
  candidateMaxBytes: number
  maxAttemptsPerImage: number
  maxCacheBytes: number
  maxCacheEntries: number
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
  qualitySteps: readonly number[]
  sizeScaleSteps: readonly number[]
  outputFormats: readonly ('png' | 'jpeg' | 'webp')[]
  alphaBackground: null | { r: number; g: number; b: number }
}
interface ImagePrepareInput {
  bytes: Uint8Array
  mediaType: string
  targetMaxBytes: number
  signal: AbortSignal
}
// createImagePreparer(policy, explicitlyLoadedCodec) ->
// { ready: { prepareRequestImages(input, reuseScope?): Promise<ImagePrepareResult>, clearScope(scope: object): void, close(): Promise<void> } }
// or { unavailable: true }; invalid policy/codec descriptor throws TypeError before resource acquisition
```

所有正值有限安全整数，qualitySteps有限非空、严格下降且每项1..100；sizeScaleSteps有限非空且在(0,1]内严格下降；min<=max；maxAttempts限定固定候选列表可访问的逻辑序号前缀，和实际codec调用次数、cache冷热无关。数据在factory/调用边界owned copy，policy在实例寿命内固定。格式实际能力由codec明示，不能宣称未加载格式可用。无默认2000px/4.5MiB/质量档：提供者导出经离线fixture验证的具名preset作为显式装配输入，preset的实际数字/验证证据是实现放行缺口，不把调用方猜值称完成。

公开入口修订为 `prepareRequestImages({ images, maxRequestBytes, nonImageWireBytes, signal }, reuseScope?)`，单图使用images长度1，无另外一套搜索函数。images每项沿上述ImagePrepareInput的bytes/mediaType/targetMaxBytes，并有唯一稳定request位置；signal从batch统一给。nonImageWireBytes是transport已拥有的最终body中图片data URL字符串值以空串替代后用同一JSON编码器得到的UTF8精确长度，包含全部键、引号与分隔符；图像预算贡献是各实际data URL的JSON转义内容UTF8字节数。参数/缓存标记/工具投影先固定，不能在成功后加入新输入；纯standalone调用者须显式提供同口径的其余wire字节，是否可信由组合caller负责，最终planner仍独立重新序列化验收。

返回 `{prepared:{images:[{bytes,mediaType,width,height,sourceDigest,targetDigest,transformRevision,policyDigest,changed,candidateOrdinal}], exploredThrough: number[]}}` 或 `{rejected:{reason}}`；reason精确为 malformed_image、unsupported_encoding、animated_input、source_resource_limit、decode_failed、no_candidate、aborted、provider_unavailable。batch内部持有所有图片两阶段cursor及逻辑预算，直到选择完整请求结果后才一次返回，不把“首个图输出”当继续搜索令牌。所有bytes owned，不仅交hash/URI。独立helper输出不是planner来源令牌；plan只使用自己固定的可信preparer实现。

## 确定处理

先查原图来源/字节/格式、资源、页数与维度，再真实decode。动画不得取首帧；EXIF方向正置且移除方向标记；不得无配置flatten透明。允许PNG/JPEG/WebP输出，静态GIF输入是否可处理以probe和decoder检查为门，不自写GIF码流。最终MIME由实际输出encoder决定，声明必须相符。

若输入满足所有目标/资源约束、无必须旋转或格式改变，保持原字节。否则每个sizeScale按原始朝向修正后尺寸计算inside目标，不上采样；在该尺寸内依outputFormats顺序、qualitySteps顺序尝试（PNG无quality则只一次）。遇首个符合actualBytes<=targetMaxBytes、尺寸界限、alpha政策的候选即成功；固定候选列表前缀耗尽或缩至下限仍不符则no_candidate。每次从同一原解码像素生成，禁止累计对上次有损结果重编码。结果是这份有限政策的首个合规结果，不保证最佳画质或理论最小字节。

maxRequestBytes有限时不均分图片预算。先按单图cap选各图首个合规表示，再完整序列化；若超总量，按各图当前data URL的实际JSON字节贡献降序（相等按原位置）遍历可继续搜索的图片。每张继续枚举上述有限候选，只保留使该图完整wire贡献严格下降的候选；每次替换重新算整个serialized bytes，达到总量即停止。某图候选耗尽再处理下一图；所有图耗尽仍超限则no_candidate。maxAttemptsPerImage覆盖两段共同候选逻辑序号前缀，不重新计数或无限循环。MIME前缀、base64膨胀、JSON字符串实际值均参与，不能用raw总bytes替代。因为每图枚举的是固定有限集合、保持其最小已见wire贡献，枚举完后在该集合内不能靠另一种预算分配得到更小总量；不宣称覆盖集合外任意编码。需要不均匀两图案例（大图需要更多bytes，小图可明显缩小）证明不因固定均分误拒。此算法可在需要缩减总量时改变先前历史图片，因此真实prefix变化须触发full，不能为缓存稳定而忽略总量。

## 原事实与实际投影

原PlanInput保持原字节，H13 source摘要与original replaySelection首先对原输入验证。映射中的 source位置+sourceDigest只能来自这一步已验原图；真正改图是可信prepare计算，不接受caller声称合法派生。之后body构造只在对应图片位置换为实际准备bytes，其他字段/顺序/visibility不变。历史来源合法≠聚合O适用：prepared bytes变化使O原映射不再保证适用时full；源矛盾仍malformed、不可判来源仍unavailable。

图片的实际bytes同时进入统一投影、meter和最终serialized；最终gate不转换，send也不转换。多次调用相同输入同codec/policy应有同bytes；cache命中只省encode，不改变规划结果。

计量依据仍使用MR9现有字段，无新增持久DTO或可演化观察权威。只扩展现有 `ReplayMeterInput` 必填 `countingBasis: CountingBasis`（当前实际请求的θ）；full已有 `projection.requestInput.countingBasis`，δ已有 `countingBasis`，不重复给第二份current basis。原φ只有observation的原θ，无法表达本次准备后的θ，故此参数必要。原observation与所有outputHistory值保持逐字不变。

一个共享 `meter-transform.ts` 拥有以下纯函数，三个公开meter口统一调用它，模型窄映射只消费已核对的base revision视图，不解析compound、不新增按modelId控制流：

- `composeTransformRevision(base, preparation)`：无图片准备语义时返回原base；否则返回具名版本 `image-input/1:` 加canonical JSON数组 `[base,algorithmRevision,codecRevision,policyDigest]`。仅非空字符串和64位小写hex policyDigest合法；canonical重编码必须逐字一致，禁止歧义/额外成员。准备descriptor来自plan固定实现及owned policy，不能来自caller的compatible布尔。
- `inspectTransformRevision(revision, expectedBase)`：返回 `known{base,preparation}`、`unknown`、`invalid`。本版前缀但结构/规范编码非法为invalid；其他未知版本为unknown；plain revision仅在与明确expectedBase逐字一致时known。known compound内base与expectedBase不等不是兼容，返回unknown；不strip未知prefix冒充plain。
- `relateMeterBases(current, original, meter)`：先按现有exact binding/model/provider/tokenizer/meter/replay/projection语义核current是否由固定meter解释，再由共享inspect核当前base。original先保留来源/摘要/usage原规则；其每个原basis字段按原窄映射的已版本化适用关系核对，不能只看base。返回 `sameEffective`（完整current/original θ相同）、`changedEffective`（两者均可解释但θ不同）、`unavailable`或`invalidInput`。返回另带只读派生base视图用于既有模型公式，不改原事实。版本化兼容声明仍须RT10 S77规定的依据；本增量不声明不同compound自动兼容。

planner full/φ/δ共用current basis。φ必须`sameEffective`再消费I+φ；changedEffective走full并保留RT10 S77首原因顺序：source_unavailable、no_observation、prefix_changed、basis_changed，prefix和θ同变不能覆盖prefix_changed，原来源矛盾先invalidInput而不是走本函数。full/δ可按已经核实的原base、完整原O及实际选择使用其原映射；图片准备确实改变所回放原图时，原O映射不能解释便对该实际内容full计量或unavailable，不能仅因base相等消费整组O。full不借changedEffective删掉仍真实的原O/opaque证据。

公开独立full取projection currentθ，独立δ/φ取显式currentθ；每个口先调用同一relate/inspect验证，known malformed compound为invalidInput（full依现类型为unavailable），未知语义为unavailable。调用者不能在φ只交原θ而让当前θ缺省等于它。planner在调用meter前核currentθ等于由本次固定meter+真实准备descriptor合成的值，actual projection与prepared bytes来自同一owned plan，传伪descriptor/伪planned不成立。独立meter仍按既有显式输入/适用依据边界；不得从原projection摘要相同推断来源授权。

共享consumer迁移范围精确为 `input-meter.ts` 的ReplayMeterInput、`projection.ts` 的basis构造、`calibration.ts` 的φ交接、所有独立φ调用/fixtures，以及当前直接比较raw transformRevision的公共OpenAI replay helper改用共同base视图。full/δ既有参数不增重复basis，不改每型号定义或MR9 schema。IP-V7新增同compound→marginal、合法descriptor变更→full、已知坏compound→拒、未知版本→unavailable、坏原摘要→malformed五项；另保留GPT5.6原O full/φ/δ覆盖。

## 资源、取消与scope

codec在factory显式取得；内部调度限制并发/在途源与目标内存字节。decode像素仍有原生库自身limitInputPixels保护，不照抄DSH关闭上限。准备不引入native同步阻塞事件循环的fallback。

首版**不做超时后提前交回、也不做在途单飞**。signal已取消则不开始；处理中取消在native调用实际终结后回aborted且丢弃结果。prepare promise完成即该次native处理实际终结；close先拒新准入、取消所有owned任务、await它们终结，再清缓存和codec。若库hang，close保持未完成，不假报告stop；这不是有限停止保证，挂起诊断须可见。不得Promise.race后丢任务。上层lease.track涵盖此promise。

reuseScope为runtime v21提供的进程内opaque值，不是权限凭据。每scope独立复用表；WeakMap不替代总预算，所有表共同受maxCacheBytes/maxCacheEntries并按LRU淘汰。key=原bytes hash+媒体类型+有效目标cap/尺寸/alpha/format/quality政策+精确codec/算法；实际原bytes仍须有授权且完整校验，不能仅凭key读取。失败/半结果不缓存，缓存immutable owned bytes，不向caller暴露可变共享buffer。清理scope或cache只影响性能，不影响原图。

## 失败与观测

原封闭PlanFailure不扩新业务枚举。malformed_image/decode_failed为invalidInput malformed；unsupported_encoding/animated_input/source_resource_limit/no_candidate无法形成此提供者支持的可计量合规表示时为input_size_unavailable，并明确maxImageBytes或maxRequestBytes指标；不是modality_not_carried。profile缺上限沿input_limit_missing；确已固定实际候选且finalgate超限才报input_limit_exceeded及真实actual，不能报原图超限冒充变换后不可能达标。provider_unavailable及直接plan abort映射unavailable；invoke/service在原cancel信号先成立时依原取消终局，不制造响应或费用。

准备diagnostic仅含阶段、成功/拒绝、技术reason、数字尺寸/bytes、算法/配置修订和是否cache命中；不含原bytes/base64/路径、图片摘要或凭据。请求实际未发送必须保持可判，不制造上游失败。精确诊断事件绑定和所有调用失败映射须在实现前通过表达评审核对。

## 存储、证据、未决门

无新持久存储，原会话日志不写；临时数据仅内存且随计划/任务/缓存owner释放，跨owner同一提交要求0。独立与Cordis服务共用本函数。binding新增0，不把proposal场景当已跑测试。

验收完整沿提案IP-V1～10，另要求基于已安装exact codec的版本/平台记录、动画及恶图decode、EXIF/alpha、4MiB前后实际HTTPS、native取消drain、三轮cache编码计数、meter/wire哈希对应、原source篡改负控和库缺席零HTTP。actual库probe及显式preset候选见下（尚未主线采用），basis共享consumer迁移、runtimev21精确接口与工程符合性尚待；独立节点评审实际状态见提案review，不能从本文件存在推出可实施。


## revision 2：搜索序号与cache同一成功集合

原r1保存在commit 8b205cc5，r2处置独立节点评审B1/B2。候选0是合法可透传原图（可不发生encode），候选1..K由原图朝向修正后尺寸与完整policy按固定顺序枚举。格式不适用/alpha冲突/尺寸低于下限等仍占逻辑位置但标不可用；PNG各尺寸只列一个逻辑项。每图仅允许ordinal<=maxAttemptsPerImage，0不消耗编码搜索位置。first阶段和总量阶段持有同一exploredThrough，继续只走更大的ordinal，不能重置额度。

cache存的是每个逻辑candidateOrdinal的已验证结果或确定不可用事实；key还包含原图/全部策略/库/算法，资源不足/取消/临时库故障不缓存为不可用。命中候选2时，batch仍将exploredThrough推进至2；不因少做两次encode获得candidate3。相同完整请求、相同资源可用前提下，冷/热/淘汰重算访问同一候选前缀并作相同选择，encoder实际调用数可以不同。总预算阶段的比较及稳定排序只看固定候选实际wire贡献，不能按缓存是否存在排序。

必须以review反例验证：candidate1超单图、2过单图但整请求超、3整请求过、maxAttempts=2，冷/热都拒；maxAttempts=3，冷/热都过同candidate3。不均匀两图、候选体积非单调、alpha不可用项、逻辑前缀耗尽均有有限fixture。禁止缓存首个结果却丢候选位置，也禁止把encode计数当逻辑搜索预算。

## 同日HUB GPT5.6 consumer对齐（r2来源补充）

主线后续HUB `57558332`／`c03ba417` 已改变当前consumer，spoke基线d136efaa未包含这些代码；本页依据`git show`只读核对，不能按旧Replay一个点迁移。精确接缝：

| 当前入口 | 必须保持与替换的守卫 |
|---|---|
| `openai-output-history.ts:basisMatches` → `fullOpenAi56History` | current basis binding/model/provider/tokenizer/meter/replay/projection逐项校验保持，raw transform比较改共用inspect的current base视图；full不能丢原O |
| 同一`basisMatches` → `newOpenAi56History` | δ同上消费已有current countingBasis；不得只改full |
| `openai-replay.ts:estimateOpenAi56Group` target meter守卫 | target meter依然是原窄算法身份，target transform仍检查它的已采用基础依据`openrouter-wire/2`，不把compound写回meter定义；当前effectiveθ从显式current countingBasis进入共享核验 |
| 同一group helper原sourceBindings有限表 | 原definition/implementation/algorithm/replay有限映射表保留，不能因拆compound而放宽原来源名单；原sourceθ若known，其base transform经共用inspect后仍须等原已证`openrouter-wire/2`，其他字段按原表保持；requestInput unavailable仍沿原origin+outputGroup/O来源，不凭空造原θ |
| `estimateOpenAi56Replay` φ wrapper | 传当前countingBasis；消费I时先由共享relation确定完整effectiveθ相同，否则回full；group历史O映射不能被错误当作不同θ前缀I兼容声明 |

现有group helper本质上同时供full/new和φ使用，所以不能把“θ变化禁止复用I”错施为“所有旧O都不可用”。公共桥接分开current可解释性、原来源窄表适用性、前缀I相容性三个判定；full/new只需前两者及其实际selection适用依据，φ叠加第三者。该拆分不修改MR9原事实或来源授权，也不是每型号新条件分支。新增consumer测试包括旧已接受sourceBindings各行在current带准备compound时full/new可用、φ按θ失效回full；伪造sourceBinding或坏原摘要仍拒。


## revision 3：失败、资源与显式配置闭合

r2保存在commit 7d1ab3aa，r3处置表达审查三项阻断。以下精确结果替代前文reason-only草图；没有新增RT业务枚举。

`createImagePreparer(policy, explicitlyLoadedCodec)`是同步构造：缺项/未知字段/非法值/不符合接口的codec descriptor抛TypeError，发生在取得任务/cache资源之前；descriptor合法但codec当前不可用返回`{unavailable:true}`；成功`{ready:preparer}`。codec句柄**借用**，必须在整个preparer寿命内有效，preparer.close不会销毁共享codec；codec owner须在所有借用preparer.close完成后销毁。独立caller同时是owner时先close preparer后dispose codec。构造不做import、文件IO或联网；异步显式加载codec由装配先完成并把异常映射为依赖不可用。

batch输入精确值域：images为有限数组（允许空数组）；每项`position`非空字符串且batch内唯一，`bytes`为非共享ArrayBuffer承载的Uint8Array（Buffer可），`mediaType`非空且须与实际格式一致，`targetMaxBytes`正安全整数；不接受SharedArrayBuffer、访问器对象或任意隐式coercion。`maxRequestBytes`为正安全整数或显式null（仅无适用有限总量cap，未知上游事实不能被改成unbounded）；缺席非法。`nonImageWireBytes`非负安全整数；signal必需AbortSignal；scope可省略，无scope即不跨调用缓存。空数组也按nonImageWireBytes与总量cap检查，无图不需decode。已知所有适用有限上限取较小者，上游unknown仍保持事实unknown。

公开调用返回封闭分类：

| rejected.reason | 必需附加字段 | plan映射 |
|---|---|---|
| malformed_input | 无内容的field技术定位（不带值） | invalidInput malformed |
| malformed_image / decode_failed | imageIndex | invalidInput malformed |
| unsupported_encoding / animated_input / source_resource_limit | imageIndex | input_size_unavailable metrics=[maxImageBytes]，诊断明确非模态不支持/非实际目标超限 |
| no_candidate | stage=per_image时imageIndex必需；stage=request_total时不带imageIndex | 分别input_size_unavailable metrics=[maxImageBytes]或[maxRequestBytes] |
| aborted | 无 | direct plan unavailable；invoke/service依先成立取消终局 |
| provider_unavailable | cause=closed/codec_unavailable/busy/codec_failure | unavailable；不伪造上游故障或0费用 |

上述是技术helper值域，范围外异常不能静默当成功：未知native异常收束owned任务后provider_unavailable codec_failure，脱敏诊断保留实际阶段。已被库明确判坏输入的decode错误才是decode_failed。失败阶段由batch内部实际发生点记录，不通过第二次搜索猜metric。policy构造失败在服务装配暴露；不能建一个静默放行实例。合法factory但计划配置不足仍按RT10现有配置拒绝。

资源准入**不排队、不自动重试**。batch开始时检查closed/已取消及可判输入长度；原子保留一个batch并发槽与全部将拥有的源字节预算，然后才owned copy，不在满额时先copy。任何预算或maxConcurrent满额立即provider_unavailable busy。metadata后在栅格解码前额外保留width×height×4的RGBA8工作预算和配置允许的输出工作预算；不足则释放本batch全部保留并返回busy，零HTTP。每次编码前按显式candidateMaxBytes保留可接纳输出额度；native返回的结果只有actualBytes<=candidateMaxBytes才转入可保留候选，超过则此ordinal不可用、立即丢弃引用而不加入cache或计划。这个额度不声称限制native内部或返回瞬间的临时分配。批内图片顺序处理，候选结果不用则及时释放，最终输出转交计划owner时计账责任随buffer转移，不能还占cache预算却假释放总持有量。cache预算与在途预算分开统计，缓存引用同buffer不重复计物理拥有；对外返回owned copy须先有对应预算。

`maxInFlightBytes`只约束本构件显式保留/拥有的源、RGBA8工作和输出buffer预算；不是native RSS或全进程峰值保证。编码器内部临时分配由其明确像素/边长界限约束，实际内存峰值须另测。未知native分配不冒精确字节。输出工作额度为配置candidateMaxBytes；它约束本构件会保留的编码结果，不是encoder最大可能输出的事实或native RSS硬上限。大于此额度的候选即使小于某个超大profile cap也属本提供者搜索范围外，不能误报上游限制。必须以oversized-candidate负控验证不进入cache/plan及任务真正终结后释放；native内存峰值单独测量。

重复/并发close共享同一终结Promise；第一次同步关闭准入，随后取消并await全部真实任务、清缓存。成功后重复close仍完成；没有新的任务或codec销毁。任何未终结native任务使该Promise仍未完成，不假成功。公开`clearScope(scope)`同步删除该scope当前缓存表；之后新请求可建新表，旧在途任务保留自有结果但完成时若原表已不再当前则不得重新发布进新表。它不取消任务、不释放仍由任务持有的buffer，反复调用无副作用。scope退出/淘汰由runtime调用此口删除对应缓存引用；in-flight计划已有owned输出不受影响，codec owner关系不变。runtime scope表只淘汰无在途引用者，transport总cache限额仍独立生效。

### model-image-balanced-v1 本地preset候选

数值是可替换技术配置，需主线技术采用，不是上游限制或无条件支持所有输入。sourceMaxBytes=16MiB，decodedMaxPixels=16,000,000，decodedMaxDimension=8192；maxConcurrent=2，maxInFlightBytes=256MiB，candidateMaxBytes=16MiB；maxCacheBytes=64MiB，maxCacheEntries=128，runtime maxScopes=64；maxWidth/maxHeight=2048，minWidth/minHeight=32；qualitySteps=[85,70,55]；sizeScaleSteps=[1,.75,.5,.25,.125]；outputFormats=[png,jpeg,webp]；alphaBackground=null；maxAttemptsPerImage=35（每尺寸PNG1+JPEG3+WebP3，5档）。不需处理的小图仍原样透传，不因preset min尺寸放大或重编码。资源/质量配置必须随包公开，租户可信装配可更改但不得扩大profile与已知上游cap。

明确算法输入尺寸：先按min(1,maxWidth/orientedWidth,maxHeight/orientedHeight)取得inside基准，再乘scale；目标宽高各向下取整，最小1；低于policy minWidth/minHeight候选标不可用且仍占ordinal。保持长宽比的库inside resize负责像素，rounding后的实际尺寸重新核；永不上采样。PNG encoder固定compressionLevel=9；JPEG/WebP用所列quality，WebP effort固定4；这些与codec版本均入policy摘要，后续改值改revision。

已做codec参数样本观察：sharp0.35.3/libvips8.18.3、Node24.18 linuxx64，synthetic 1400² PNG 5,890,980B在max2048不放大、JPEG q85后1,400,709B。r2 codec probe另8/8覆盖alpha/EXIF/两帧/像素limit/截断/确定性/native真排空；有限搜索oracle4场景+4096组合过。它们**没有**证明完整preset、最大资源边界、native峰值、产品HTTP或全部IP-V1～10；这些是实施后验收义务，不能用这份数值表假关闭。candidateMaxBytes是明确保留政策，无须伪造某编码器普适最大输出公式。


## revision 4：已加载codec唯一接口与无图边界

r3原稿保存在commit ad99ae15。以下是transport包公开技术协议，不是新Cordis服务或领域能力。`explicitlyLoadedCodec`必须符合`LoadedImageCodec`，不能直接传Sharp构造函数；提供者导出`createSharpImageCodec(loadedSharp)`薄适配工厂，loadedSharp是调用方显式已import的sharp0.35.3默认导出，工厂读取其versions给精确revision，不内部加载。借用与可替换适配器按同一协议核，可信实现不得原地改变revision对应行为。

```ts
type CodecFailure = { failure: 'bad_input' | 'unsupported' | 'unavailable' | 'internal' }
type CodecResult<T> = { ok: T } | CodecFailure
interface ImageMetadata {
  mediaType: string
  width: number
  height: number
  pages: number
  orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  hasAlpha: boolean
}
interface DecodeLimits { maxPixels: number; maxDimension: number }
interface ImageEncodeSpec {
  format: 'png' | 'jpeg' | 'webp'
  width: number
  height: number
  quality: number | null // PNG null，JPEG/WebP 1..100
  pngCompressionLevel: number // 0..9
  webpEffort: number // 0..6
  alphaBackground: null | { r: number; g: number; b: number }
}
interface EncodedImage { bytes: Uint8Array; mediaType: string; width: number; height: number }
interface DecodedImage {
  readonly width: number // 实际应用EXIF后的尺寸
  readonly height: number
  readonly hasAlpha: boolean
  encode(spec: ImageEncodeSpec): Promise<CodecResult<EncodedImage>>
  close(): Promise<void>
}
interface LoadedImageCodec {
  readonly name: string
  readonly revision: string
  readonly inputMediaTypes: readonly string[]
  readonly outputFormats: readonly ('png' | 'jpeg' | 'webp')[]
  readonly available: () => boolean
  inspect(bytes: Uint8Array, limits: DecodeLimits): Promise<CodecResult<ImageMetadata>>
  decode(bytes: Uint8Array, metadata: ImageMetadata, limits: DecodeLimits): Promise<CodecResult<DecodedImage>>
}
```

字段必需、无多余数据成员；name/revision及格式集合非空、集合去重，尺寸/pages/limit正有限安全整数；r/g/b为0..255整数。工厂检查descriptor结构和方法存在并固定metadata副本，不靠`available=true`证明codec行为；可信adapter行为仍由符合性测试承担。available只读实例是否尚可消费，不隐式网络/加载；false使准备provider_unavailable。inspect不宣称像素已解码，必须返回实际格式/帧数；若不能确定页数或格式，unsupported，不默认单帧。元数据无EXIF方向表示orientation=1（无方向变换），不是未知填值。

inspect→检查实际MIME/动画/资源→保留RGBA8预算→decode。decode必须对同一owned源字节做真实全单帧像素解码、校验metadata对应、应用EXIF方向、采用明确sRGB/RGBA8工作语义；结果尺寸/alpha交回后再次核对。这个内部工作表示不会修改原bytes；可透传原图时解码后仍发送原bytes。encode从同一decoded原像素出发、不级联有损产物，inside保持比例、withoutEnlargement、按spec透明政策编码；实际输出类型与尺寸必须核验。库真实不支持格式为unsupported、明确坏输入为bad_input、关闭为unavailable、其他库故障为internal；不得把native异常全归bad_input。方法Promise只有该方法实际native任务终结后才完成，拒绝和异常亦必须先收束其任务；preparer收到未知异常按internal收口并诊断。

DecodedImage是本batch独占、不可序列化的短时资源句柄，既不是模型runtime句柄也不是新持久对象。它close同步关encode准入，await已有encode实际完成后释放栅格引用；重复/并发close复用同一Promise。preparer在每图处理结束/任意失败finally等待close，再放对应保留预算；不能只等顶层helper结果而遗弃decoded资源。借用LoadedImageCodec本身不被preparer销毁；codec owner先等待全部preparer.close再按具体提供者销毁自己的外部资源，协议不猜所有codec都有全局dispose函数。

sourceMaxBytes/decodedMaxPixels限制、policy与codec metadata/encode所有值必须由公开helper验证，独立调用接口不能依赖planner已经验过。sharp版本、libvips完整versions、平台/架构、适配器RGBA8/EXIF/sRGB行为revision进入codec revision；像素语义或encoder行为改变必须新revision，不能静默热改同一实现。文件IO、URL、凭据与持久写仍禁止；source code加载在装配阶段已完成。

**无图exact边界**：仅images=[]时nonImageWireBytes等于完整实际请求字节；planner确知其超适用maxRequestBytes，直接按原RT10 `input_limit_exceeded{basis:exact,metric:maxRequestBytes,actual,limit}`拒绝。helper独立调用空images时也返回专门 `{rejected:{reason:'exact_request_limit_exceeded',actualBytes,limitBytes}}`，映射相同，不能映成size_unavailable。有图时nonImageWireBytes只是完整量的下界，哪怕已超cap也不得把它写成exact actual；可无需搜索直接返回 `no_candidate{stage:request_total}`，plan映射原input_size_unavailable(maxRequestBytes)，诊断说明是非图片部分已使搜索无可行结果，不伪造完整actual。其余无合规图片候选仍按per_image/request_total的no_candidate。该exact值仅为技术helper结果，未新增RT业务枚举。

## 当前采用范围

选中图片的请求期缩放/重编码与有限搜索；统一异步 plan/context、真实准备任务生命周期、受信作用域隔离及 full/φ/δ 的共享计量依据。既有 RT10/MR9 精确语义不改变，无新持久对象或服务键。

技术采用不表示实现或实际验证已完成。验证义务：IP-V1..IP-V10；取消等待 native 实际停止后释放；缓存冷热同结果与资源上限/native 峰值；实际 HTTPS、包制品和双语消费者；计量与实际 wire 同一依据。
范围之外：完整 Session/Run/Agent；媒体平台/外部下载/持久派生；仅由图片采用提升 T29 引用生命周期范围。
