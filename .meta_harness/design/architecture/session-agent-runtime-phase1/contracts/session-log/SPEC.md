# Session Log 迁移候选

未来正文归`packages/core/session-log`。保持精确[SL3](../../../../spec/capabilities/session-log/v3/contract.md)当前有效承诺，不从SL2或未迁consumer误推最新接受。新增行为只在新采用时切换，不改冻结原件。

## 公开形状的改变

沿现有LogEntry外壳、SessionRef、tenant、seq、run／attempt、dedupeKey、readKeys。payload改为明确拥有者＋版本＋判别值；message payload只容纳现行Message，Session事实由Session定义校验，model/tool/context payload由各原拥有者校验。
非消息的attempt_started属于Session事实，并保留Run、序号、时间与开始原因。Unknown-other保留原JsonValue且不可送模型；claimed-known非法导致unavailable／invalidInput，不能降为unknown。

`SourceToken`由本日志接口唯一拥有，闭合字段为tenant、session、journalGeneration、tail；分别使用既有TenantId、SessionRef及存储拥有者的代际和日志序号。projectionRuleVersion不是日志坐标，投影消费者单独携带。
append/readByKey/readSince现行shape与尾条件／栅栏行为逐项保持到消费者切换。新增`readPrefix(sourceToken)`读取一个固定已提交范围。无可信权限不读全journal。
新增内部`appendIn(unit,request)`：StorageUnit、已校验访问资格及AppendRequest；返回staged(条目、nextTail)、invalidInput／staleAttempt／conditionFailed／dedupeConflict。只暂存不承诺提交；unit过期拒绝，provider核验同AtomicStorage实例。
事务未知由外层协调返回unknownCommit，不把staged当成功回执。readPrefix遇generation不同／非法tail返回invalidInput，来源暂不可用返回unavailable。普通append独立提交，禁止隐式Ambient transaction。

新增操作的完整调用边界：LogAuthority是可信装配签发并在使用点重新核验的读／写资格引用，绑定显式tenant/session和原已认证主体；不是用户自报bool。其校验端口由日志construction注入，不依赖session-runtime类型或创建反向包依赖。

| 新操作 | 完整输入 | 闭合成功／失败 | 读取／提交和在途 |
|---|---|---|---|
| readPrefix | LogAuthority、SourceToken | prefix(readonly LogEntry[],SourceToken)；invalidInput／denied／unavailable | 核权后读取该已提交固定范围；追加不扩大返回tail。generation在读取期间不能核实或来源撤除返回unavailable，不返回截短成功 |
| appendIn | 同实例未结束StorageUnit、LogAuthority、AppendRequest | staged(条目,nextTail)；invalidInput／denied／staleAttempt／conditionFailed／dedupeConflict／unavailable | unit过期或外实例映到invalidInput；权限拒绝denied，权限／存储不可核unavailable。外层owner commit后才发生，失败／未知仍保原义务 |

LogAuthority的tenant/session须与request/token相等，形状或scope不相等为invalidInput；当前不准入为denied。readPrefix重复同token返回同值或明确不可用；其操作无通知，不因读而推进。appendIn的去重／同键异载荷与SL3相同，通知只在外层提交后按其已提交事实发出。

## 薄行为

SLN1：日志只追加，顺序、去重、尾条件、fence核验与普通失败行为不弱化；成功批次不可部分存在。
SLN2：appendIn日志和Session状态参加同一真实unit；独立普通append不能证明其原子性。迁移SQL提供者必须实现现有storage实例边界、约束和并发行为。
SLN3：消息与非消息判别可被下游无歧义读取；模型codec不拥有所有日志schema。消息没有“默认事实变提醒”通道。
SLN4：旧运行格式不保兼容；在正式切换消费者时破坏性迁移／删除被替代实现，历史证据继续保留。未接受前原消费者继续读原精确承诺，不双轨运行。
SLN5：读取固定prefix对普通append/afterCommit失败可复现；未知无关append照旧保留。context既有journal回放、效力及撤除承诺必须原样通过。

## 证据

同真实StorageUnit回滚／提交、参与者实例不匹配、并发append/fence/尾条件、unknown-append、claimed-known损坏、读权与generation、原context/工具/模型所有journal消费者合规。物理迁移不自动改变已有Schema URI，行为修订与位置迁移分别记录。
