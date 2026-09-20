# 组合边界

事实 frame 只作低延迟提示；客户端主动读取 SessionProjection `changes(after,to)` 的完整授权投影批，
同水位原子安装 history/state updates 后才推进 durable cursor。没有 frame 的 hidden-only 区间由
`coveredThrough` 证明覆盖，周期 `to=latest` 对账保证可达进展；具体 to 的响应不得越过 to。
DR `commitPosition{domain,seq}` 是完整批位置，record index 与 frame batch.index 只用于各自批内身份/完整性。floor 或 visibility
变化要求 full resync。订阅和逐帧各查一次权，撤权关闭交付但不停止工作。归档仍可只读，删除
使流关闭；慢客户端只丢 transient。durable changes/snapshot恢复事实与明确disposition；active通道
先建立有序callback，再读compact state/cut，以coveredThrough prefix安装，enqueue与empty→live共享线性化责任；
单 listener gap/溢出只撤该订阅并真正resubscribe，不宣称共享 source 失败；transformVersion 绑定
sourceGeneration。baseline 覆盖 started+chunk prefix，ended 只引用 durable disposition；新 attemptEpoch
安装后旧 epoch buffer 不可应用。commitPosition、projection completeTo 与客户端 installed cursor
分离；full snapshot 同水位原子安装 history+当前主体获准完整 attemptStates，source-lost/retention expiry不伪造outcome。
M 的 CAS revision 是 disposition 唯一写面；无 receipt 时只从 M ledger 的耐久 closing observation fold
outcome_unresolved，并以完整 attemptStateUpdate 增量交付，不能从 active snapshot 合成。snapshot 不接受 guessed
identity；缺席只产生客户端 local evidence_unavailable。late result 仍过 Step/Run/RN-05 business acceptance 门。正常 source 换代由 M marker
唯一映射为 E 控制帧。active handoff 的 `2*(MaxChunks+1)` 仅是当前有限模型进展配置，不是生产 sizing 契约。
M公开投影共用同一 `toPublic`/fold，
MediaRef 可在过程/终态两处引用但按 mediaId 只呈现一次。
