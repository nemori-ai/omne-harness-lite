# JSONL 存储提供者：验证边界

本轮只核对来源 hash、契约映射与设计边界。旧源码输入 `7152a7192c84fa49c27255bfdb4f9b0e86ad8eb5` 的[成员验证](../../../../packages/storage/jsonl/evidence/provider/README.md)记录 build/typecheck/test 及真实 flock、同步、部分写和故障后清理；固定 HUB `31197742905a3c66fc3e650c153d65d014372c21` 的[跨包组合验证](../../../../apps/local-harness/evidence/storage-admission/README.md)记录旧 JSONL/admission/diagnostics 行为和环境。这些是旧 P1 的**实际历史证据**，不是新 v1 `core-journal/3`、个人租户创建、普通批次 v3 codec 或新 provider 换代的符合性报告；旧日志不得复用为新 PASS。

新 v1 符合性须固定实施 revision、装配与真实后端环境，保留原始命令/结果，并注入真实失败；未覆盖项保持 partial/blocked。[设计映射](design.md#待代码与环境验收)
列出当前 `/1` 端口、codec 与 writer 的代码差额；DR 候选的字段仍须随独立规格评审
锁定后按精确版本验证，不能用旧 `/1`、`/2` golden line 填空。

新增真实后端矩阵：

| 场景 | 在线与重启后的共同断言 |
|---|---|
| factory/DI 与容量 | 缺域、目录绑定、Diagnostics 或合法 limits 时拒绝建立；容量不足发生在接纳前，不能占 seq/key；诊断失败不改变存储 unknown/result，短门无诊断 I/O |
| prepare/submit 边界 | prepare 无 I/O、不占位置或原操作；冻结数据、同 writer 不可伪造 token 和 `requiredUses` 绑定；commit 在当前调用栈同步去重/CAS/排位，真正 write 在退出该栈后串行 |
| 同键重试和结果 | 同键同输入的 pending、committed 和 durable conflict 认回原票据/结果；同键异输入不覆盖原键；非法输入、关闭/隔离、容量不足均无新接纳；unknown 保留原键及查询责任 |
| 同流三 facts | 首次 receipt/head revision 为 `1`，三 facts 各有不同 eventId；下一次 expected=`1` 成功、expected=`3` 的原操作得到耐久普通 conflict，重启认回原结果 |
| 通用冻结次序 | 一流与四流批次均可用；四流故意逆 StreamRef 字典序且其中一流有多个 facts，writer 原样保存冻结 appends/records 数组，在线/恢复 flatten 与 eventId 一致，不设置三流上限 |
| 重复与逆序直达 writer | 重复 StreamRef 在分配 seq、占 operation 或写盘前具名拒绝；唯一流的逆字典序输入原样接受，不静默重排；两类 journal 字节与 head 分别符合拒绝/成功结果 |
| 普通 CAS conflict | 一流/四流在任一原业务 stream CAS 不匹配时，原业务批次全不应用；同原操作仅有一个 provider-owned `core.records/operation-outcomes` 批次，ordinary outcome/fact 等值、无个人字段；`attemptedAppends` 为原冻结流/期望修订的全部有序投影，`currents` 仅含真实 mismatch；sync 未核实时仍 unknown，重启 lookup 相同 |
| 精确前缀读取/lookup | readRange 只返完整 envelope 与原水位内序号；坏/未达水位具名拒绝；已核实 committed/conflict 原样认回；仅持锁并同步的完整前缀可证明存储 `not_committed`，不能据此推断外部效果 |
| 锁、epoch、清理 | 两进程争同一稳定 inode，暂停者不能被偷锁，死亡者由 OS 释放；空域首条 v3 `writer.acquire` 为 epoch `1`，重启持锁核实后写 epoch `2` 并同步才交新 writer，旧 token 不可提交；未回执完整 acquire、伪造 epoch、同步失败和各取锁后故障点保持 retained cleanup owner/原锁，重复 retryRelease 不伪报 released，释放前无第二 writer |
| 写入与恢复 | 短 write、部分行、LF 后、file sync 前/后、目录 sync 前/后、回执前分别注入；未 sync 不前移 durable，故障后无越位写；断尾先保全并 sync 原件再截回，完整坏行/中段缺口/未知格式原件保留并阻断可写恢复 |
| replay/recovery | 扫描完整前缀重建的 stream heads、operation lookup、receipt 与 eventId 等于在线结果；冲突行之前的完整前缀重算每个 attempted stream 的 head、非空 mismatch 及其原序，篡改 attempted expected/head 或 outcome/fact 须阻断可写恢复；完整无回执行同步后按 committed 或 conflict outcome 认回，不把完整冲突行误报成功 |
| close 与换代 | close 先关新提交，再排空/sync/释放；失败具名保留 pending/lock 状态；旧 token/epoch fenced；新 provider 只在旧 writer 释放且前缀/操作结果一致后取得写权 |
| 二/三流资格封闭 | 真实 Admission/Tenant Host 与 writer 联合检验 registration `[personal-index,tenant:<target>]`、init `[bootstrap,personal-index,tenant:<target>]`；错来源、额外/少流、错次序/target/revision/domain/代际及伪造字段在写盘和分配位置前拒绝，普通唯一流逆序仍可用 |
| system-only conflict | 仅 personal-index CAS 冲突时另写同原操作的 provider outcome envelope，不写成功批次；`attemptedAppends` 仍为原二/三流全部有序期望修订，`currents` 只含索引，v3 outcome 与 fact version `3` 的绑定字段一致，lookup/replay 同结果去重 |
| v3 严格 replay 与旧字节 | 五类 `recordClass` 与可信 `source` 对应封闭形状，核 exact `OperationInput`、canonicalInput/inputDigest、JournalLine 长度/摘要及 operation/principal 绑定；伪造 source、缺失/多余字段、错版本/摘要、错 target、个人创建错次序、非 canonical 字节及损坏前缀阻断可写恢复；旧候选或未知格式字节先保全原件，再拒绝按 v3 可写恢复，无兼容读取或转换假设 |
| unknown 后原操作重备 | 回执丢失与暂时 not_seen 保持原目标/占位；只有旧 writer 完整前缀证明未提交且占位安全解除后，当前代才可同绑定重备 |

当前没有绑定新 v1 坐标的执行报告。上述矩阵是验收任务，不是结果；旧实现和旧测试只作为待核对输入。真实文件系统支持集合须列名，网络文件系统、模拟断电后的设备缓存和任意磁盘故障均不能由本地 flock/fsync 测试推断。

宿主映射以 [设计映射](design.md) 的实际 factory/纯过程/ports 边界为准；本文不以 Cordis 插件包装
冒充当前实现。若未来增加插件投影，须另行验证 Context 生命周期、撤除和应用装配。
