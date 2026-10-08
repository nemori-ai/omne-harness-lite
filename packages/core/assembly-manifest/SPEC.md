# Assembly manifest behavior and integration

The root owns public shapes, pure decisions and runtime-port types. It does not load Cordis or select a provider.
This page owns the six business operations and their integration behavior. Provider-specific SQL mechanisms belong to assembly-manifest-store.

## 记录、追加和读取

每会话只增记录，seq 从 1 起稠密单调不复用，空 head 明确为 0，只在同会话比较。EvaluationRef 全局唯一、opaque，不解析。given 原请求同会话幂等，mint 在提交时铸新 ref，reuse 只引用同会话已有 given/mint；每 session/category 的 filledAt 严增。composition/content 严格无损 JSON，拒重复键；append 不解释 AR 内容。

表示层先拒，业务次序 alreadyRecorded→evaluationRefConflict→recordNotFound→headMismatch→filledAtNotIncreasing。given 认回先于期望头，同 ref 内容不同不重写旧记录。head/ref/time 裁决与 parent/tables 写在同一提交点；同 H 并发只有一方成，拒绝零写，不靠进程锁。整批持久可见，成功后读己写、进程崩溃重开不丢、未提交半截不可见；不承诺物理断电无损。unavailable 是提交未确认、可能已成立，不能断言零写。mint/reuse 不幂等。

readHead 的 head 与每类 last 来自同一读视图，last 按最大提交 seq；readHistory 同 session/category/filledAt 永远原样认回。不可读不能猜 0/空/recordNotFound，也不拿旧缓存补。dependencyPresence 的 present/absent 由同一次真实事实视图给，任一未知／不可读整个 unavailable，不返部分、不补 absent；事实不进换表 seq，新实例不能沿用未取得的旧事实，事实写面不归 MF。

## 求值投影与固定 given

readEvaluation 共用 AE 全量值读，O 是组合精确排列。固定当前 head，取同会话 seq≤head 最大 given/mint；reuse 不是新源，不让 reuse 头把 E 退回过去。选源／读记录／返回 E/O/ref 用同读视图，最新源坏则失败、不回退旧合法源。无源 recordNotFound，坏投影 unavailable/invalid_evaluation_content，IO 不可读 unavailable。合法任意 content 仍可由 append 原样存，readHead/history 原样返；投影读取不修复、不证明新鲜／正文真值／授权，不补模型或时限默认。

readGiven 显式合法 H，表示层先核，真实读中核 H≤当前本会话 head；同一致读选 seq≤H 最大 **given**，mint/reuse 不参与。后续追加不扩大 H。原完整壳／tables/content 无损返，保留合法未知 content，不替 AR 解释 filledBy/六表/根。合法范围无 given 是 none；超范围须真读确认后 invalidInput，头不可读 unknown 不猜范围。坏壳／丢记录／不可读 unavailable，坏投影具名 unavailable，绝不回退旧 given。旧 H 在重开／追加后仍认同原值，零写、零修复、零铸 ref。

## 责任与留存

无事件监听／通知。SessionRef 不授权，此可信内部能力面不直接作为终端 API。given 重试可认回；mint/reuse 回执丢失只真读比对，不造认回键。替换不交接活业务状态，重开从存储事实。当前不删任何历史，结束／归档不清理；未来留存须新政策，不能删除运行报告所依记录。当前跨进程完整产品协调不由此能力宣称交付。

## Formal integration

`./cordis` owns `AssemblyManifestService`, key `assemblyManifest`, and their Context type.
The abstract service exposes the same six operations. It does not own storage or require borrowed adapters to close it.
A concrete provider must preserve session identity, classified failures, consistent reads and same-write rollback.
Service isolation does not grant tenant authorization.

`AssemblyManifestResources`, key `assemblyManifestResources`, carries borrowed `ManifestOptions` through injection.
Presence observations belong to the explicit source. Unknown facts stay unknown.
Diagnostics run after the real resource returns and exclude content and raw error messages.
A configured diagnostic requires a diagnosticFailure callback. Callback failure cannot replace the committed result or original defect.
Ports own their output and retention bounds. Neither resource service nor manifest provider closes them.

A provider captures storage and runtime ports for its generation. Withdrawal stops new valid work.
Already admitted work retains the captured resources through actual completion, including diagnostics.
Replacement does not release the old generation or undo SQL effects.
The assembly owner must retain borrowed resources until its selected concrete provider certifies actual drain.
Only a fulfilled drain observation permits release. Rejection or kernel disposal alone does not prove safe release.
No new Session coordination or cross-owner atomic transaction is promised here.
