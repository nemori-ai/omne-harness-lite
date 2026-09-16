# 耐久记录 v1 符合性场景

这些场景固定 [contract](contract.md) 的 revision、顺序、身份与恢复边界。它们是候选规格的
验收义务，不表示当前 provider 已通过。

| 编号 | 触发与可观察结果 | 条款与证据归属 |
|---|---|---|
| DR-S01 同流三事实 | 空 stream 在一个 accepted append 写入三个有序 facts；三者共享 revision `1`，eventId 的 `recordIndex` 各不相同；下一 append 用 expected revision `1` 成功，用 `3` 冲突 | DR-01；records codec、writer 与恢复联合验收 |
| DR-S02 冻结顺序 replay | 通用批次分别只含一条、含四条 stream；四流输入故意不按 StreamRef 字典序排列，且一流有多 facts。writer 保存提交者冻结的 appends/records 数组，在线读取、重启恢复和 replay 得到相同 flatten 顺序及 eventId，无三流上限 | DR-01/03；adapter + JSONL 重启验收 |
| DR-S03 重复流与合法逆序 | 重复 StreamRef 到达 writer，在分配 batchSeq/eventId 前具名拒绝且不占 operation；两条唯一 StreamRef 的逆字典序 appends 则被接受、原样保存，不静默重排 | DR-01/02；records codec 与 writer 正负例 |
| DR-S04 prepare 身份 | prepare 产生临时 correlation；commit 后 facts 只以 DR 分配的 `(domain,batchSeq,recordIndex)` 为 eventId，临时值不能被消费方当成耐久身份 | DR-01/02；adapter 与 consumer 契约测试 |
| DR-S05 恢复修订一致 | 重启扫描含多 facts append 的完整前缀；assigned/durable/read/replay 都把每次 append 计作 `+1`，不按 fact count 推导 revision | DR-01/03/04；真实 JSONL 重启与差分 replay |
| DR-S06 二/三流封闭资格 | 受信 registration 资格只接受 `[personal-index,tenant:<target>]`，受信 init 资格只接受 `[bootstrap,personal-index,tenant:<target>]`；writer 从资格赋 `recordClass`/`source`。附加 system 流、第二 tenant 流、错次序/target/tenant、错 expected revision、错 domain/代际、重复提交、客户端伪造 recordClass/source 均拒绝且不占位置；普通唯一流逆序仍可写 | DR-01；codec、writer、Admission 联合正负例 |
| DR-S07 system-only conflict 保留目标 | 只让 personal-index CAS 冲突，目标 tenant revision 未变；writer 仅为原操作写另一个 provider-owned outcome envelope，不写二/三流成功 appends；`attemptedAppends` 保留原二/三流预期修订与顺序，outcome、同一 provider fact 保存相同原操作/摘要/来源/`UserRef`/target，`currents` 仅含索引；完整前缀重算一致，lookup 与重启 replay 认回同一冲突和 target，不再生成第二结果 | DR-01/02；真实 writer/codec/replay |
| DR-S08 严格格式 | v3 Schema 的 StreamRef、RevisionConflict、精确 OperationInput、五类封闭 CommitEnvelope、受限个人创建/冲突、writer epoch 与 journal line 必填/禁填字段一致；普通冲突行带四条业务 appends、错/缺 recordClass/source/attemptedAppends、额外/缺失字段、错版本/target/摘要/Counter 或非 canonical 字节均拒绝；发现旧格式字节保全原件且不按 v3 可写恢复 | DR-01/04；codec 与真实恢复负例 |
| DR-S09 普通耐久冲突 | 一流和四流条件提交都可在任一原业务 stream 上 CAS 失败；writer 在 `attemptedAppends` 保存原冻结 stream/expectedRevision 顺序，原业务 appends 全不应用，另为同一原 operation 写且同步唯一 `core.records/operation-outcomes` provider fact 与等值 generic outcome；重启从冲突前完整前缀重算 mismatch，一处伪造 expected/current 或前缀不可核实即拒绝/unknown。结果行写入未知时仍 unknown，不能提前报告 conflict | DR-01/02；真实 writer/codec/replay、故障注入 |
| DR-S10 writer epoch | 两个 domain 的空 journal 各自首条 v3 `writer.acquire` 为 epoch `1`，但其 domain64 operationId 不同且同步后才交 writer；同域重启写 epoch `2` 后旧 token 不可提交。完整未回执 acquire、旧格式、伪造 epoch fact、错误 domain64、前一 epoch/position/结果不一致及同步失败均不能交出新 writer | DR-01/03/04；真实锁、codec 与重启负例 |
