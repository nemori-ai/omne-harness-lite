# Session 状态提供者验证边界

来源固定为 `packages/session/session/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `1660d823fa3e3419cd420ca9a92b33c3a4a357f06558735471763da89d3d6eeb`）。基础 Session fork 有实际源码和测试，但完整 queue/inbound/scheduler/links 仍是目标设计。
本轮只验证来源可恢复、设计树可解析及契约映射；没有把旧 review、日志或文档状态提升成
新 v1 的实现证据。实现验收至少覆盖真实装载/撤除、准备后撤权、重复与冲突、取消/超时、
迟到结果、崩溃恢复、旧代句柄以及资源排空。

Round-2 另验：用户 hold 与 RN-05 barrier 独立；A non-placeholder stopping+B running 不撤 B，但阻止 supplement/C；首次 take 写 created+issued，terminal 只写 state.changed+epoch.closed，reacquire 回执丢失 lookup 原 operation。

新结构链另验：组合者不制造 Run closed，只合并 Run owner 无副作用 preparation 并在 CC submit 让 owner guard
复核；SessionProjection changes 对 closing.pending 也返回完整 in_progress update，full snapshot 不接收 guessed
identity、只返回授权完整集合。durable business unknown 首次 close，而 outcome_unresolved 保持 in_progress。

Revision/identity/recovery 联合验收：Run 首次三 facts 同 append 后 revision=1，下一操作 expected=1 成功而
expected=3 冲突；相反跨流 prepare 顺序产生同一 canonical envelope/eventId，同批相对引用只在 commit
解析，临时 correlation 不泄漏为 eventId。Session root 成功但 Run root 失败不得安装或 reopen；旧 host/owner
代 ack 不影响新代，恢复后原 blocked completion 原件不变，新 lookup 仅带 baselineRef 认回且不重复执行 attempt。

扫描分页按完整 DR commitPosition 批，不按 `(stream,seq)` 或 fact count 切；单批超页大小整批独占，复扫幂等且跨 owner 关系不被半批水位掩盖。

新增跨边界场景：`frames(S)` 与 Session 三条权威流、Run 流在同域按提交位置对齐；Tools 是帧事实 writer，Session 治理保留期和当前 `read_content` 控制披露。单 Session root fold 成功不开放读/写面，只有 CC-06 全 required roots 同水位原子发布后才可用；随后 accepted-arrival 扫描完成前不发 epoch。

SE-14 裁决矩阵至少固定：A 列 call settlement 与 call wait release 同批，gate restored 与 gate wait release 同批，approval/provisional readiness 不释放 call wait；B 列原发起 Run 非终态的 provisional 一次接续保持 `refs=run`，无开放登记也可在下一 Step 就绪；原 Run 已 completed/failed/superseded、同 Session 另有活动 Run 时按 C 的 queue/converted，不借指新 Run。`system` 只进 context，`hook_continuation` 只进 queue/trigger，后者在 take 前来源失效时结算 `closed(source_invalid)` 并记录。RD-18 取入合格 text 时只在 waiting 空闲点合并 queue taken 与下一 Step，保留原 Run/epoch；command/trigger、RN-05 barrier 或 hold 均不得误走此路径。
