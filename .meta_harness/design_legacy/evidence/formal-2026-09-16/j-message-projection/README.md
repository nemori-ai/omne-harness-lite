# J：授权投影与 active 更新的联合有限检查

本包消费 D-018/D-020 已接受的方向与当前候选契约，验证 E/Session/M
在一个客户端 reducer 上的有限交错；不新增组合契约，不改变接受、发布或实现状态。
长期消费者是 MS-22/23 客户端、SE-10 投影提供者与 J 联合验证审阅者。

## 输入与复现

[run-report.json](run-report.json) 固定四份当前契约、两份决定、模型、配置及执行脚本的
SHA-256，记录 Java/TLC 工具哈希、版本、每次命令、退出码、状态数与日志哈希。
使用本包 [reproduce.py](reproduce.py)，传入现有 Java 与 tla2tools.jar：

```sh
python3 .meta_harness/design/evidence/formal-2026-09-16/j-message-projection/reproduce.py --java /absolute/path/to/java --jar /absolute/path/to/tla2tools.jar
```

脚本从自身位置定位同一检出中的模型，scratch 仅写入该检出的 tmp/j-message。
日志为实际执行结果；负例成功指 TLC 检出指定性质违反，不能将其非零退出码记成检查通过。
源基线为 d6669f28072e759f40a64386836b333f06d71d4c；输入哈希比基线名更精确。

## 模型边界与性质

[JointProjectionRecovery](../../../spec/capabilities/message-stream/v1/formal/JointProjectionRecovery.tla)
用同一状态机交错 M 提交、Session 投影、Changes 接收/正文读取/原子安装、
授权换代后的 full snapshot、source/subscriber 换代及延迟 active capture 安装。
固定一个 tenant/Session/domain/projection generation、一个 attempt/epoch；
三个完整批依次为 closing.pending、durable unknown、已通过 M 接纳门的 success refinement。
授权版本最多三代（可见→隐藏→恢复），源最多两代，源失联一次，active capture 一次。
所有这些是检查界，非产品数量限制。

| 条款切片 | 本次可检查性质 | 抽象或未验证部分 |
|---|---|---|
| MS-07/08/11/22、SE-03/10 | AtomicCoverage、ProjectedView：收到响应不推进游标，正文和 pending 状态随完整安装单元发布；隐藏授权集合可仅推进覆盖 | Changes 将当前位置至完整水位的所有批合并为一个安装动作；未枚举逐批分页、部分成功或正文失败 |
| MS-12/22、SE-10 | SnapshotCAS：旧 token/visibility/asOf 响应不能安装；新 Changes 与旧 snapshot 可竞争；隐藏集合不产生 close | 保留一个在途 snapshot，并允许完整 Changes 独立原子安装；token 换代由授权变化触发；floor、retention、多视图细节与 projection generation 变化不在状态域 |
| MS-22/24、MC-06 | TerminalDominates、CloseExactlyOnce：unknown 首次 close、refinement 不再 close，迟到 active 不重开；ended/source loss 不推进游标或结算 | M ledger、接纳门与 CAS 正确性作为输入前提；未验证 abandoned/fence、不同 epoch 或所有 outcome |
| MS-23、MC-12/13/14 | ActiveGeneration：capture 的 source/subscriber/visibility 必须仍匹配；durable 恢复无需等待 active | 注册先于 capture、源绑定 transform、compact fold 正确作为输入前提；不模拟 marker 队列、有界缓存、chunk 去重或 toPublic |
| CT-01/02/03/04、MS-21 | 仅固定当前媒体契约哈希；historyBody 是已可安装公开正文的布尔抽象 | 媒体占用/耐久、读取授权、CallRef 来源及逐块投影均未验证，不将正文读取动作当媒体符合性证据 |

revision/close bookkeeping 在隐藏快照后保留，historyBody/pending 则按当前授权集合替换；
保留已见终态防止将 absence 当作业务回退，不宣称隐藏对象不存在。
旧已呈现视图可以在授权变化与新快照安装之间存在；本模型检查的是旧响应不能再次安装，
没有证明即时清屏或授权系统的实现安全。

FairSpec 只对有限提交、投影、Fetch、ReadBodies、Install、Reject 加弱公平。
有限换代终止后这些动作可最终执行，Converges 检查 cursor=3、reset 清除和授权版本追平；
即使 active 从未完成、sourceLost 保持 true、hint 不到达，也不阻断 durable 进展。
不承诺无限故障/换代下收敛、墙钟轮询界或 active 最终 live。
sourceLost 仅记录发生过一次源失联；后续 capture 未模拟源恢复资格，故也不验证
源失联后的 resubscribe/live 安全。只验证失联通知不会自行关闭 attempt 或阻断 durable 对账。

## 实际正反例与审阅

Safety 与 Progress 各探索 105,844 个状态；五个独立 mutant 分别删除接收/安装边界、
snapshot CAS、仅 asOf 条件、active generation 检查及 terminal 支配。原始检查见 [Safety 日志](raw/Safety.log)；
[报告](run-report.json) 给出实际结果，完整反例保留在对应日志。
有限状态检查只支持这些输入与假设，不是无界证明、实现符合性或全部 J 门闭合。
独立审阅应核对条款投影、隐含前提、每个 mutant 的指定反例及证据哈希；
本包不自行宣布审阅通过。

独立审阅指出初版单响应槽无法令旧 snapshot 的 asOf 落后已安装 cursor。
现通过 FetchSnapshot/ConcurrentChanges 保留在途快照并允许较新 Changes 安装；
StaleAsOfMutation 仅绕过水位检查，实际反例验证该保护不是空条件。

2026-09-16 独立 spec-reviewer 对修订模型与七份日志完成只读复核并抽查哈希，
确认上述缺口关闭，本次有限表达与证据范围内无剩余阻塞；未独立重跑 TLC。
该意见不构成语义接受、发布或实现验收，保留上表全部未验证范围。
