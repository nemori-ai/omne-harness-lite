# 记录端口与 codec：验证边界

本轮只核对来源 hash、契约映射与设计边界。旧测试日志绑定 legacy baseline，未作为新 v1 结果复用。
后续符合性测试须固定实现 commit、装配、真实后端与失败注入；缺项存在时状态保持 partial/blocked。

新增验收矩阵：

| 场景 | 必须断言 |
|---|---|
| 同流三 facts | 一次 accepted append 后 revision 为 `1`，三个 facts 的 eventId 不同；下一次 CAS=`1` 成功、CAS=`3` 冲突 |
| 通用冻结顺序 | 一流与四流批次均可提交；四流故意逆 StreamRef 字典序且其中一流有多 facts，codec 保留原 appends/records 数组，拒绝重复流但接受唯一流的任意次序；eventId 按原 flatten 位置 |
| codec round-trip/replay | 通用 CommitEnvelope、receipt、readRange 与恢复得到相同 revision、冻结 flatten order 和 eventId；临时 correlation 不出现在 eventId 字段 |
| 通用 CAS conflict | 一流/四流任一原业务流冲突时只生成同 operation 的 provider-owned `core.records/operation-outcomes` 单 append，scope 随原可信 tenant、`operation.conflict/3` 与普通 outcome 等值、无个人字段、`requiredUses=[]`；attemptedAppends 按原冻结流/期望修订保留，冲突前完整前缀重算的 currents 必须一致，未耐久不得返回最终 conflict |
| writer.acquire 编码 | `core.writer` 的 `writer-epochs` 单 append、`writer.epoch/3`、规范输入、含 domain64 的 operationId、committed epoch、`requiredUses=[]` 一致；两个 domain 的初始 epoch 操作不碰撞，旧调用不能伪造保留 namespace，codec 成功不证明已持锁同步或新 writer 可交出 |
| personal creation 二/三流 | 真实受信绑定只接受 registration `[personal-index,tenant:<target>]` 或 init `[bootstrap,personal-index,tenant:<target>]`；伪来源、额外/少 system/tenant 流、错次序/target/revision/domain/代际拒绝且不分配位置；普通唯一流逆序仍合法 |
| system-only conflict | personal-index CAS 独自冲突时 attemptedAppends 保留原二/三流期望修订，v3 durable outcome 与同一 provider fact 均保留原 target/来源/操作/摘要/`UserRef`；`currents` 仅真实 mismatch，完整前缀重算及重启 lookup 一致 |
| v3 codec 与旧字节 | 五类 `recordClass`/可信 `source` 的封闭形状、JournalLine 长度/摘要、canonicalInput 摘要、通用/受限 envelope 均校验；错/缺 recordClass/source/attemptedAppends、额外/缺失字段、错版本/target、outcome/fact 不一致、非 canonical 字节拒绝；实际旧候选前缀保全原件且不能按 v3 可写恢复 |

这些项当前均未在新 v1 坐标下执行，不能从旧测试名或源码形状推断为通过。
验收还须清点开发环境实际 journal 字节；若发现旧候选格式，由独立处置决定如何
保全或弃用，不把其读取/迁移作为本候选协议的兼容要求。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。
