# 模型消息投影薄规格

状态：F0 实施候选。公开函数已有实现，交付验收与负责人 review 尚未完成。Session 提供者的缓存发布、逐出及在途 pin 属于后续装配。

来源PF-009消息／标注、PF-010压缩／组装，PF-012原reply、PF-013模态，用户日志投影及复杂度要求。非消息判别由session-log拥有，函数不自造日志权威。

## 形状

`ProjectionInput`含固定的[Session Log SourceToken](../session-log/SPEC.md#固定日志坐标)、readonly合法日志条目、组装规则版本与外部输入键。原响应索引从同一固定日志范围建立，不另读其他尾部。缓存必须带完整外部输入键；外部键包括采用AgentDefinition／assembly、system prompt、context generation、model profile／模态、tools／参数来源版本。
缺必要来源、版本不可核实或已宣称本owner的无效数据是失败，不当缓存命中。键取自明确版本或对实际规范化输入作摘要；只有键必须比较时可用摘要，摘要相同且源变化不构成无条件证明，必要时校验实际输入。
`Projection`返回sourceToken、inputKey、分段消息／原来源对应、可读块索引、处理进度及可观测workCounters。`Materialized`为readonly Message列表和来源映射；原Message类型从公开messages入口取用。
`CacheOwner`由公开factory创建，是单Session独占的可变派生资源；其状态变化显式，不把增量更新称为纯函数。索引由owner私有维护，避免每次复制全部索引。`Projection`是该owner返回的不可变派生视图；materialize仅接受本模块创建的视图，不接受调用者伪造的可变对象。视图携带固定source与完整inputKey。缓存包含必要历史摘要索引，不含凭据。固定Segment不可变，共享前缀不复写。

| 函数 | 输入 | 成功／失败 | 效果 |
|---|---|---|---|
| `projectMessages` | 完整ProjectionInput、可选可信owner codecs | projected(Projection)；invalidInput(reason:shape/source/pairing/claimedPayload/compaction)、unavailable(reason:requiredSource) | 纯冷建，不写log/存储，不请求模型 |
| `createProjectionCache` | 完整ProjectionInput、CacheOptions | ready(CacheOwner,Projection)；invalidInput；unavailable(reason:requiredSource/capacity) | 创建独占派生状态，O(N+B)；不IO |
| `extendProjection` | 独占CacheOwner、新固定source、规则及严格连续增量 | projected(Projection,reusedSegments)；rebuildRequired(reason:generation/gap/rule/external/corrupt/impactUnknown/capacity)；invalidInput或unavailable | 追加索引和段；旧prefix受影响时要求冷建 |
| `materializeMessages` | 本模块返回的Projection | materialized(Messages,sources,outputMessages,outputBlocks)或invalidInput | 枚举有效消息/块，输出O(K+B) |
| `projectionKey` | ProjectionRules | key或invalidInput/unavailable | 成本与输入键字节数成正比 |
| `releaseProjectionCache` | 本模块创建且未逐出的CacheOwner | released或invalidInput | 删除可变索引的owner关联；旧视图仍可读取 |

`CacheOptions.limits` 必须显式给出 entries、blocks、bytes 三个正安全整数。本模块不提供默认容量。bytes 计量规范化输入 JSON 的 UTF-8 字节，不等同于 JavaScript 堆大小。entries、blocks 限制索引规模。超界不得发布半更新的新视图。

`external: null` 只允许一次无缓存的耐久历史投影。此模式的 system 必须为空，且不声称已采用模型配置、工具或其他请求侧输入。createProjectionCache 对此模式返回 unavailable(requiredSource)。真正请求缓存仍须带八项当前来源键。缺压缩所需 pendingCardBlocks 或 lastModelRequestPrefixLength 时，有 silenced 引用的消息返回 unavailable(requiredSource)，不补假空集合。

可信 owner codec 必须是无 IO 的校验函数。声明为本 owner 的错误 payload 返回 invalidInput(claimedPayload)；需要但不可用的 codec 返回 unavailable(requiredSource)。其他 owner 的合法事实不成为模型消息。

冷projectMessages与materialize是纯计算。createProjectionCache创建显式CacheOwner；extendProjection只在owner独占准入内修改私有派生索引，返回不可变分段视图，新视图不改旧视图。任意旧引用失效点可整体线性重建，不强制引入持久数据结构库。缓存获取／发布／逐出属于Session provider端口，不偷偷IO。API边界可用异常表示内部未知缺陷，不能返回一份少了消息的“成功”。

CacheOwner不能同时被两次增量调用使用；违反独占输入前提返回invalidInput。提供者逐出owner后不得再次使用；原不可变视图仍可被在途请求持有。相同token且无增量只认回原视图，不重复追加；失败不把半更新索引发布为成功，不能恢复旧有效索引时返回rebuildRequired(corrupt)。

## 行为与算法义务

MP1：相同固定日志范围、完整外部输入与规则版本，冷／热／失效重建结果在消息顺序、内容、可读块及来源上相同。
MP2：仅合法消息和明确组装输入进模型；attempt/调度/fence/费用事实一律不自动成为消息。真正业务reminder保留。
MP3：缺模型可读标记默认拒送，CompactionMessage引用影响旧块而非整段截断；悬着的内容按产品规则保留，非法压缩名单拒绝而非静默丢。
MP4：冷建至多两次线性遍历：第一遍建立原响应、消息、块与压缩引用索引；第二遍按顺序选择有效块并检查原call配对。每条目/块/引用边只处理常数次；不得在每个assistant/tool消息上回扫全prefix。
MP5：冷/全部失效成本O(N+B)；N包含条目、块与引用边，B为输入检查/输出字节。hash期望常数不冒称最坏O(1)；恶意冲突防护或索引实现的严格界另验。
MP6：追加热路径O(ΔN+受影响后缀+B)，同键定位期望O(1)或O(log N)；输出O(K+B)单列。共享未变segments，禁止每轮array-copy全部prefix导致累积二次复制。
MP7：缓存失效包括generation／gap、来源已重建或截断、规则/任一外部键变化、损坏、旧引用影响无法确定；全失效仍走MP4冷建，再生成缓存。
MP8：append-only事实不变，但有效模型前缀因压缩/采用/当前输入可以变化；不得用“日志只追加”证明永不失效。
MP9：provider有界当前缓存及在途pin，回收不影响事实；发布核验预期来源，不能把旧tail缓存标成最新。跨租户/Session不复用缓存，旧generation只供明确原请求的历史重建。
MP10：投影保持原reply，不把转换后的模型表示回写原response；沿合法来源保留tool-call/results配对。供应方缓存／计费不属于本地保证。

## 验证义务

冷／热差分覆盖纯追加、内部事实、多个压缩引用旧块、外部键全维改变、失效损坏、generation改变、并发缓存发布、二租户、原response/tool配对、无标记/悬着块以及payload内容。
用独立参考选择器和可计数规模试验检查N/2N/4N冷线性、热Δ、prefix共享／避免全copy；计时仅辅助。原源码的二次路径以操作计数或profile证明移除，短样本计时不能当复杂度证明。
算法论证和有限试验均不证明完整生产实现；实施后真实request serialization、字节成本和供应方payload需单验。

本阶段操作的身份、授权、幂等、提交、通知与在途共用规则见[共用规则](../session-runtime/adr/shared-operation-rules.md)。本文与该表一起读取；不从目录存在推断实现完成。
