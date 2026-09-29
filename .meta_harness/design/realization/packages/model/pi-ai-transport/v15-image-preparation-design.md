# v15 请求图片准备（候选）

2026-09-29 revision 1。语义依据为已接受 RT10 S57/S74/S77～83、MR9 S41～45；本提供者映射尚未采用、未实施，新增bindings 0，验收尚待。接续v13，和并行v14 refusal无语义替代关系。只交付已选图片同模态发送前处理，不实现完整上下文组装或跨模态renderings。

架构选择见[提案](../../../../record/proposals/model-request-image-preparation/README.md)。独立领域读数/三候选与四表在该包；pi/DSH/Sharp主源事实归 research/typescript-image-input-handling（HUB e9a5d13e + 26ddf358），本页不复制研究。

## 唯一公开接口归属与异步接缝

runtime `types.ts`仍拥有TransportAdapter/PlanInput/PlannedSemantics，v21定公共plan上下文。transport导出 `createImagePreparer` 与其技术policy/result类型，不新增Cordis服务键。公开无资源`planRequest`改为async并显式消费预先取得的prepare实例/上下文，不在调用时import native模块、读磁盘或联网；factory先加载codec且可判不可用。所有规划消费者一并破坏性升级，无同步兼容重载。

候选技术形状（接口名是技术属性，不是新领域词条）：

```ts
interface ImagePreparePolicy {
  sourceMaxBytes: number
  decodedMaxPixels: number
  decodedMaxDimension: number
  maxConcurrent: number
  maxInFlightBytes: number
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
// { prepare(input, reuseScope?): Promise<ImagePrepareResult>, close(): Promise<void> }
```

所有正值有限安全整数，qualitySteps有限非空、严格下降且每项1..100；sizeScaleSteps有限非空且在(0,1]内严格下降；min<=max；maxAttempts为整个格式×尺寸×质量遍历总上限。数据在factory/调用边界owned copy，policy在实例寿命内固定。格式实际能力由codec明示，不能宣称未加载格式可用。无默认2000px/4.5MiB/质量档：提供者导出经离线fixture验证的具名preset作为显式装配输入，preset的实际数字/验证证据是实现放行缺口，不把调用方猜值称完成。

prepare返回 `{prepared:{bytes,mediaType,width,height,sourceDigest,targetDigest,transformRevision,policyDigest,changed}}` 或 `{rejected:{reason}}`；reason精确为 malformed_image、unsupported_encoding、animated_input、source_resource_limit、decode_failed、no_candidate、aborted、provider_unavailable。实际owned bytes及维度是必需，不能仅交sha/URI。可独立调用的prepare输出不是planner来源令牌；plan只使用自己固定的preparer实现，禁止外部用户通过伪造结果跳过校验。

## 确定处理

先查原图来源/字节/格式、资源、页数与维度，再真实decode。动画不得取首帧；EXIF方向正置且移除方向标记；不得无配置flatten透明。允许PNG/JPEG/WebP输出，静态GIF输入是否可处理以probe和decoder检查为门，不自写GIF码流。最终MIME由实际输出encoder决定，声明必须相符。

若输入满足所有目标/资源约束、无必须旋转或格式改变，保持原字节。否则每个sizeScale按原始朝向修正后尺寸计算inside目标，不上采样；在该尺寸内依outputFormats顺序、qualitySteps顺序尝试（PNG无quality则只一次）。遇首个符合actualBytes<=targetMaxBytes、尺寸界限、alpha政策的候选即成功；计数到maxAttempts或缩至下限仍不符则no_candidate。每次从同一原解码像素生成，禁止累计对上次有损结果重编码。结果是这份有限政策的首个合规结果，不保证最佳画质或理论最小字节。

maxRequestBytes有限时不均分图片预算。先按单图cap选各图首个合规表示，再完整序列化；若超总量，按各图当前data URL的实际JSON字节贡献降序（相等按原位置）遍历可继续搜索的图片。每张继续枚举上述有限候选，只保留使该图完整wire贡献严格下降的候选；每次替换重新算整个serialized bytes，达到总量即停止。某图候选耗尽再处理下一图；所有图耗尽仍超限则no_candidate。maxAttemptsPerImage覆盖两段共同全部编码尝试，不重新计数或无限循环。MIME前缀、base64膨胀、JSON字符串实际值均参与，不能用raw总bytes替代。因为每图枚举的是固定有限集合、保持其最小已见wire贡献，枚举完后在该集合内不能靠另一种预算分配得到更小总量；不宣称覆盖集合外任意编码。需要不均匀两图案例（大图需要更多bytes，小图可明显缩小）证明不因固定均分误拒。此算法可在需要缩减总量时改变先前历史图片，因此真实prefix变化须触发full，不能为缓存稳定而忽略总量。

## 原事实与实际投影

原PlanInput保持原字节，H13 source摘要与original replaySelection首先对原输入验证。映射中的 source位置+sourceDigest只能来自这一步已验原图；真正改图是可信prepare计算，不接受caller声称合法派生。之后body构造只在对应图片位置换为实际准备bytes，其他字段/顺序/visibility不变。历史来源合法≠聚合O适用：prepared bytes变化使O原映射不再保证适用时full；源矛盾仍malformed、不可判来源仍unavailable。

图片的实际bytes同时进入统一投影、meter和最终serialized；最终gate不转换，send也不转换。多次调用相同输入同codec/policy应有同bytes；cache命中只省encode，不改变规划结果。

计量依据仍使用MR9现有字段，无新增持久DTO。共享basis合成函数将原meter.transformRevision、图片preparation算法/codec版本及影响表示的policy摘要编码为版本化compound transformRevision；无图片的请求保留原basis。这个函数及逆向校验唯一归projection模块，不得逐厂商补条件。meter贡献取得同一有效basis与其独立原transform依据，不能直接把compound字符串当模型的新算法；已有OpenAI replay直接比较原字符串的consumer须一起迁移。历史basis无法解释属于依据不足转full，禁止以字符串相似宣称可复用。输出组摘要使用它自己的既有projectionRevision，禁止顺手改输出事实编码；同请求的request/output投影版本关系沿MR9。

## 资源、取消与scope

codec在factory显式取得；内部调度限制并发/在途源与目标内存字节。decode像素仍有原生库自身limitInputPixels保护，不照抄DSH关闭上限。准备不引入native同步阻塞事件循环的fallback。

首版**不做超时后提前交回、也不做在途单飞**。signal已取消则不开始；处理中取消在native调用实际终结后回aborted且丢弃结果。prepare promise完成即该次native处理实际终结；close先拒新准入、取消所有owned任务、await它们终结，再清缓存和codec。若库hang，close保持未完成，不假报告stop；这不是有限停止保证，挂起诊断须可见。不得Promise.race后丢任务。上层lease.track涵盖此promise。

reuseScope为runtime v21提供的进程内opaque值，不是权限凭据。每scope独立复用表；WeakMap不替代总预算，所有表共同受maxCacheBytes/maxCacheEntries并按LRU淘汰。key=原bytes hash+媒体类型+有效目标cap/尺寸/alpha/format/quality政策+精确codec/算法；实际原bytes仍须有授权且完整校验，不能仅凭key读取。失败/半结果不缓存，缓存immutable owned bytes，不向caller暴露可变共享buffer。清理scope或cache只影响性能，不影响原图。

## 失败与观测

原封闭PlanFailure不扩新业务枚举。malformed_image/decode_failed为invalidInput malformed；unsupported_encoding/animated_input/source_resource_limit/no_candidate无法形成此提供者支持的可计量合规表示时为input_size_unavailable，并明确maxImageBytes或maxRequestBytes指标；不是modality_not_carried。profile缺上限沿input_limit_missing；确已固定实际候选且finalgate超限才报input_limit_exceeded及真实actual，不能报原图超限冒充变换后不可能达标。provider_unavailable及直接plan abort映射unavailable；invoke/service在原cancel信号先成立时依原取消终局，不制造响应或费用。

准备diagnostic仅含阶段、成功/拒绝、技术reason、数字尺寸/bytes、算法/配置修订和是否cache命中；不含原bytes/base64/路径、图片摘要或凭据。请求实际未发送必须保持可判，不制造上游失败。精确诊断事件绑定和所有调用失败映射须在实现前通过表达评审核对。

## 存储、证据、未决门

无新持久存储，原会话日志不写；临时数据仅内存且随计划/任务/缓存owner释放，跨owner同一提交要求0。独立与Cordis服务共用本函数。binding新增0，不把proposal场景当已跑测试。

验收完整沿提案IP-V1～10，另要求基于已安装exact codec的版本/平台记录、动画及恶图decode、EXIF/alpha、4MiB前后实际HTTPS、native取消drain、三轮cache编码计数、meter/wire哈希对应、原source篡改负控和库缺席零HTTP。actual库probe及显式preset、basis共享consumer迁移、runtimev21精确接口、独立节点评审均未闭合，不能从本文件存在推出可实施。
