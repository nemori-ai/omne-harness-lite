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
