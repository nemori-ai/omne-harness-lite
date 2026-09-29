# 图片准备与原计量依据适用表接缝（候选附页）

2026-09-29 revision 3。只补 D109 已接受 [v15 r4](v15-image-preparation-design.md) 的共享 relation 如何取得原窄映射依据；不改受审字节、不扩公开 InputMeter、不新增业务契约或原观察字段。相关 runtime v21 不变。本页候选须独立评审及主线后继接受。

## 已存在的两个不同事实

HUB 后继 `8125e085adfdb78bd9fa06381fb5127124f659bb`（共享 refusal reader 的37绑定发布）的 `input-meters/openai-replay.ts` 私有 sourceBindings 已列明 GPT5.6 的 definition/implementation/algorithm/replay 三行：6/mp4-12、7/mp4-16、8/mp4-17。目标 meter 是8/mp4-17，原6/mp4-12 的已证完整输出组仍可在 full/new 中使用；这并不允许把该原输入 I 当成当前前缀计量。`openai-output-history.ts:basisMatches` 又分别守 full/new 当前依据。两个来源必须共用 transformation 解析，但原 ledger 不在 InputMeter 中，不能凭 modelId 在共享 helper 内推断。D109 当时的716400a3只有前两行且target7/mp4-16；本接缝按上述后继8/mp4-17源码核对，不能把后继字节冒充716400a3。

## 最窄内部接口

共享 `meter-transform.ts` 的 relation 增加**内部显式策略参数**，由已有家族实现闭包提供，不从 PlanInput/profile/configuration/HTTP 数据读取：

```ts
type OriginalBasisApplies = (
  original: CountingBasis,
  originalBase: KnownTransformRevision,
) => boolean
// relateMeterBases(current, originalOrUndefined, meter, originalApplies?)
```

KnownTransformRevision 是已有 shared inspect 的只读成功视图，不是调用者伪造的 known 标签。省略 originalApplies 时采用共享 `exactMeterBasis`：要求原 model/provider、definition modelId/revision、implementation name/revision、meter/tokenizer/replay/projection 与当前固定 meter 的相应项逐一相符；transform 由 shared inspect 核对基础 revision，不能直接比较或剥去任意前缀。InputMeter 没有 configuration 值，不能假装从 meter 核验它；原完整 binding/configuration 仍先经现有 schema/原 history origin 一致性核验，完整 effective equality 包含 configuration，其语义参数合法性继续由原 group/selection 守卫负责。

闭包只表达已版本化的**原依据可解释性**，不得声明前缀 I 兼容，不得跳过原事实校验。共享 helper 不按 modelId 分派 ledger；InputMeter 公共字段不增加 sourceBindings、函数或兼容布尔。只有包内家族 helper 在构造/调用时固定该纯函数。已有三个 GPT5.6 型号共用一张家族有限表及一个 predicate，不逐型号复制分支。

## 唯一 relation 的执行顺序

1. 沿原边界 own/validate 当前依据与原事实；已明确的来源/摘要/usage 矛盾先 invalidInput，不能被回调拒绝降成 unavailable，也不能改写 observation。当前必须由实际固定 meter 的完整身份解释。
2. shared inspect 解析当前 transform 并核基础 revision；原依据存在时同样只由 shared inspect 解析。这个版本允许的基础 revision 仍是该固定 meter 已接受的基础依据；不因传 predicate 就增加另一基础 revision 的解释能力。已知 `image-input/1` 非规范/结构坏为 invalidInput，未知语义为 unavailable。full 按既有返回类型把 invalidInput 映射 unavailable，planner 原source矛盾仍保 malformed。
3. original 存在且上述验证通过后，调用纯 originalApplies（缺席则 exactMeterBasis）。实际返回必须严格 boolean true 才成立；false、throw、非boolean或thenable都 unavailable。thenable 拒绝必须被观察，但不能 await 后接受；不把异步策略引进算法。callback 不可变更输入，共享构件只给递归冻结的 owned JSON副本及派生视图，不仅依赖 TypeScript readonly；开发负控须验证原观察不被改变。
4. original 可解释之后，完整 current/original countingBasis canonical equality 才判 sameEffective；不相等为 changedEffective。不是只比较 base、prepared descriptor 或 binding revision。changedEffective 仅允许各消费者按已有规则 full 回退，绝不意味着 I 兼容。
5. 若 original 为 undefined，只验证当前并返回独立 `currentOnly` 成功分支及 current base；不能返回 sameEffective、更不能合成一份历史 observation。full/new 当前守卫可消费 currentOnly；φ 必须有原观察且只接受 sameEffective。此小判别仅属内部 helper，无新持久事实或规范枚举。

## GPT5.6 的一张原表和三个消费者

将现有 sourceBindings 保留在家族实现中，抽出一个纯 originalApplies 闭包；原 group helper 校验也引用同一张表，不能新造并列的第二份可演化表。predicate 核原 model/provider、binding definition/implementation、该行 algorithm/replay、已采用 tokenizer/projection、sharedKnownBase 的基础 revision，并保持原来源模型/服务商/参数守卫。凡先前在 group helper 才有的 original-origin/usage/outputGroup/selection 真实性条件仍在那里核，不用 relation 代替。

- `fullOpenAi56History` 与 `newOpenAi56History` 通过 shared relation 的 currentOnly 检查当前。每个被替换的完整原 O 组，先原事实/selection 核验，再带 finite-table predicate 核原依据；sameEffective 或 changedEffective 都仍需原 O 对当前实际内容适用才可用该组。不得因 I 失效就删掉真实 O 或密文。
- `estimateOpenAi56Group` 的 target meter 原8/mp4-17严格守卫保留，current countingBasis 从 full/new/φ 现有显式入口传入，不能用原 basis 猜本次 current。原 sourceBindings 不被 helper 内“任何差异都changed”替代。
- `estimateOpenAi56Replay` φ 先核真实原事实，带同一个 predicate 调 relation；只有 sameEffective 能消费 I。changedEffective 沿原 full 回退；unknown source unavailable，不把 relation 判成 changedEffective。
- 当历史 requestInput 为 unavailable，group helper 继续依已验证 history.origin + outputGroup/O 的既有入口；origin 的 binding 仍须命中同一 finite ledger，其他来源守卫照旧。没有原 countingBasis 就不调用“伪原basis”的 relation，更不能由 currentOnly 推出原I可用。φ 缺原观察沿 no_observation/source_unavailable 既有优先级，不合成历史。

共享 calibration/planner 只在其已有同一固定 meter 可解释范围内使用缺省 predicate。它不需要也不能获取 GPT ledger 作为跨模型全局规则：旧 binding 在通用前缀判定不满足 exact 时走既有不可复用/full 路径，由 full 家族映射决定其 O 可解释性；不能把此处 unavailable 当成“整条请求永久失败”而阻止原已定义 full。反之 full 的未命中原有限表仍 unavailable，不得绕过估算 opaque。RT10 首原因 source_unavailable、no_observation、prefix_changed、basis_changed 仍由原 fallback owner 按既有优先级给出；本 helper 不重排它们。

## relation 到通用 fallback 的精确映射

RT10 S77 是权威顺序；8125e085 的 calibration.ts 仍先查 basis 再查 prefix，本增量必须更正这段控制流，不能把“沿既有”理解为照搬其先后。来源结构、原摘要/事实矛盾及已知坏 compound 的 invalidInput 都先作为非法输入处理，不参与 full 回退原因排序。当前依据自身不可解释时不能计量当前请求，最终 unavailable，不借原观察放行。

对于原事实合法、当前依据可解释的候选，独立收集以下适用条件，只取第一项，随后都调用同一个 full：

| 顺序 | 条件 | fallbackReason |
| --- | --- | --- |
| 1 | 现有受信来源读取明确 unavailable，或当前所需 usage/source 口径无法取得（如现有 scope_unknown）；不把单纯原算法不在窄表当来源读取失败 | source_unavailable |
| 2 | 没有观察候选，或原 requestInput unavailable/observedInput unavailable，不存在可供复用的 I | no_observation |
| 3 | 已知原输入的边界/实际非新增前缀/固定envelope与当前不等，含合法图片准备导致的实际变化 | prefix_changed |
| 4 | relation changedEffective，或 relation unavailable 因原 basis 的算法/版本/窄表无法解释、无法判兼容，或既有实际模型/服务商/reader依据不匹配 | basis_changed |

第四项的 unavailable **仍是 relation unavailable，不得改其返回为 changedEffective**。RT10 明确 basis_changed 包含不能判兼容，因此旧6/mp4-12在通用exact缺省predicate被拒、与原完全未知binding，两者都不能复用I且允许尝试full，但并未得到同一份原O适用性结论。full 家族helper对旧6可凭既有finite ledger计其O；未知行仍unavailable，不估算未知opaque为普通字串。若来源读取不可用且前缀/依据也变，记录source_unavailable；prefix和basis同变记录prefix_changed。未知 transformation 的原语义是第4项、未知当前语义为计量unavailable；已知格式坏始终invalid而非任何fallback。

只在以上条件均不适用、relation sameEffective、观察完整且原selection适用时尝试φ；φ自身不可用沿既有后续回退规则。currentOnly不满足这一条件。full无法给出当前合法计量时最终仍沿既有input_size_unavailable等对应出口，不能为了输出fallbackReason制造成功measurement。

## 边界、选择与验收

延续已封存领域读数：真实观察不改、算法失效全量重算、已有原O来源可解释。选内部显式 closure 的成本是一个参数和共享 predicate 提取；扩 InputMeter 会使所有厂商承担非普遍公开承诺；共享 helper 按modelId分派则把家族窄关系塞进公共机制。后两者不采用。无新对象、Cordis服务、存储或同提交边；关键性质由现有来源/输出组验收加以下负控承载，新增实际 bindings 0。

BR1：当前8/mp4-17+compound，原已证6/mp4-12/plain及7/mp4-16/plain，full/new保留O可用，φ不可用I。BR2：原未列definition/implementation返回unavailable，不changedEffective。BR3：相同完整basis同、两个已知但不同compound为changed，绝不自动兼容。BR4：坏compound invalid，未知版本unavailable，坏原摘要仍malformed先行。BR5：origin-only真实原组沿既有途径可计O，不伪造原θ/I。BR6：predicate返回false/throw/Promise/非boolean、试图改原对象，均不产生成功relation或修改持久原事实。BR7：full/new/φ均用同一ledger/共同inspect，缺显式current不能借原source补齐；通用fallback未知与已知变化分类、首原因优先级不变。

不做新算法研究；来源是HUB现有已采用有限表及C实施owner给出的内部接缝反例，后者仅线索不代替设计权威。本页未实现、未跑工程验收，独立定点评审及主线接受仍待。
