# 耐久记录 v1 符合性场景

这些场景固定 [contract](contract.md) 的 revision、顺序、身份与恢复边界。它们是候选规格的
验收义务，不表示当前 provider 已通过。

| 编号 | 触发与可观察结果 | 条款与证据归属 |
|---|---|---|
| DR-S01 同流三事实 | 可信普通输入 `tenantId=t`，唯一 stream scope 也是 tenant `t`；一个 accepted append 写入三个有序 facts，三者共享 revision `1`、不同 recordIndex；下一 append expected `1` 成功，`3` 冲突 | DR-01；records codec、writer 与恢复联合验收 |
| DR-S02 冻结顺序 replay | 可信普通输入 `tenantId=t` 的一流与四流批次中，每条业务 stream 都是 tenant `t`，四流故意逆字典序且一流多 facts；另以 `tenantId=null` 及全 system 流作正例。writer 保持冻结数组，在线读取/重启 replay 的 flatten 顺序、revision 与 eventId 相同，无三流上限 | DR-01/03；adapter + JSONL 重启验收 |
| DR-S03 重复流与合法逆序 | 重复 StreamRef、`tenantId=t` 却混 system/另一 tenant 流、`tenantId=null` 却含 tenant 流均在分配 batchSeq/eventId 前拒绝且不占 operation；两条唯一且同 scope 的逆字典序 appends 被原样接受 | DR-01/02；records codec 与 writer 正负例 |
| DR-S04 prepare 身份 | 受信准备提供完整 `OperationRef.namespace` 与 principal；`OperationInput` 没有 namespace 字段，客户端在 canonicalInput 额外插入它须拒绝，错绑 principalId 也须拒绝。prepare 的临时 correlation 不冒充 commit 后 `(domain,batchSeq,recordIndex)` eventId | DR-01/02；adapter 与 consumer 契约测试 |
| DR-S05 恢复修订一致 | 重启扫描含多 facts append 的完整前缀；assigned/durable/read/replay 都把每次 append 计作 `+1`，并重核 ordinary 输入 tenantId 与业务流 scope 的双向对应，不按 fact count 或落后投影推导 revision/身份 | DR-01/03/04；真实 JSONL 重启与差分 replay |
| DR-S06 二/三流封闭资格 | registration/init 的 `canonicalInput.tenantId` 均为 null，但只有受信来源及本代资格才能分别写 `[personal-index,tenant:<target>]` 与 `[bootstrap,personal-index,tenant:<target>]`；writer 从资格赋 class/source。改成非 null、换原 Account namespace、附加流、错次序/target/expected/domain/代际或客户端自报来源均拒绝；普通 null 输入也不能冒用此混合许可 | DR-01；codec、writer、Admission 联合正负例 |
| DR-S07 system-only conflict 保留目标 | personal 输入仍为 `tenantId=null`；只让 personal-index CAS 冲突，目标 tenant head 未变。唯一 provider-owned system outcome 的 attemptedAppends 仍保存原 system+target tenant 候选和预期修订；结果/fact 保留原 Account 引用/摘要/来源/UserRef/target，currents 仅索引，完整前缀重算与 lookup/replay 认回同一结果 | DR-01/02；真实 writer/codec/replay |
| DR-S08 严格格式 | v3 Schema 的 OperationInput 禁填 namespace，五类封闭 CommitEnvelope 与 journal line 必填/禁填一致；普通冲突行夹四条业务 appends、错/缺 class/source/attemptedAppends、错输入 tenantId 或身份、额外/缺失字段、错版本/target/摘要/Counter 或非 canonical 字节均拒绝；旧格式保全原件且不按 v3 可写恢复 | DR-01/04；codec 与真实恢复负例 |
| DR-S09 普通耐久冲突 | 一流和四流的 tenant `t` 或全 system 条件提交可 CAS 失败；attemptedAppends 的 scope 与原输入 tenantId 双向对应，原业务 appends 全不应用，结果 stream 分别取 tenant `t` 或 system。重启按冲突前完整前缀重算 mismatch；伪造 expected/current、混 scope 或未核实前缀均拒绝/unknown，结果写入未知不提前报 conflict | DR-01/02；真实 writer/codec/replay、故障注入 |
| DR-S10 writer epoch | 两个 domain 的空 journal 首条 `writer.acquire` 输入均 `tenantId=null`、唯一 stream 为 provider-owned system，epoch 均 `1` 但 domain64 operationId 不同；同步后才交 writer。同域重启取 epoch `2`，旧 token、错 domain64、错输入 tenantId、伪造 epoch fact 或同步失败均不能交出新 writer | DR-01/03/04；真实锁、codec 与重启负例 |
