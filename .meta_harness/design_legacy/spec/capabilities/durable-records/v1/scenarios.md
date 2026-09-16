# 耐久记录 v1 符合性场景

这些是候选契约的验收义务，不表示当前 provider 已通过。

| 编号 | 触发与可观察结果 | 条款与证据归属 |
|---|---|---|
| DR-S01 同流三事实 | 可信普通输入 tenantId=t，唯一 stream scope 为 tenant t；一个 append 写入三个有序 facts，三者共享 revision 1、各有 recordIndex；下一 append expected 1 成功、3 冲突 | DR-01；codec、writer、恢复 |
| DR-S02 冻结顺序 replay | 同 tenant 的一流与四流批次故意逆字典序且一流多 facts；另以 tenantId=null 与全 system 流作正例。在线/重启 replay 顺序、revision、eventId 相同 | DR-01/03；真实重启 |
| DR-S03 重复流与跨 scope 拒绝 | 重复 StreamRef、tenantId=t 却混 system/另一 tenant、tenantId=null 却含 tenant 流均在分配位置前拒绝；同 scope 唯一流的逆序被原样接受 | DR-01/02；正负例 |
| DR-S04 prepare 身份 | OperationInput 无 namespace 字段；额外 namespace、错 principalId 拒绝。prepare 临时关联不冒充最终 eventId | DR-01/02；adapter |
| DR-S05 恢复修订一致 | 多 facts append 重启后每 append revision +1；普通输入 tenantId 与业务流 scope 仍双向对应 | DR-01/03/04；重启差分 |
| DR-S06 个人创建普通单流 | TG-01 T/C 使用 tenantId=target、受信 system principal、`tenant:<target>` 唯一 tenant-scope append；writer class/source 为 ordinary。A、digestA、凭据字段、system personal-index/bootstrap 或混 scope 均不能进入此批 | DR-01；Tenant/Records 联合 |
| DR-S07 同 UserRef 的另一 T 冲突 | 两个不同 F 的 T/C 都指向同一目标；先提交者创建 tenant/owner，后者 CAS 不匹配时 only provider-owned tenant-scope conflict outcome，attemptedAppends 保留原目标流条件，lookup 不误认先提交者 | DR-01/02；writer/replay |
| DR-S08 严格格式 | v3 Schema 仅 ordinary commit/conflict 与 writer epoch 三子类型；错 class/source、额外/缺失字段、错 tenant scope、摘要/Counter、非 canonical 字节或旧格式拒绝可写恢复并保全原件 | DR-01/04；codec/recovery |
| DR-S09 普通耐久冲突 | tenant t 或全 system 的一流/四流 CAS 失败，原业务 appends 不应用；完整前缀重算 mismatch、outcome/fact 相等，unknown 时不提前报 conflict | DR-01/02；故障注入 |
| DR-S10 writer epoch | 两 domain 空 journal 各首个 writer.acquire epoch 1 但 domain64 operationId 不同；同步后交 writer。同域重启 epoch 2，旧 token、错 domain、伪造事实或 sync 失败均不能取得写权 | DR-01/03/04；真锁与重启 |
