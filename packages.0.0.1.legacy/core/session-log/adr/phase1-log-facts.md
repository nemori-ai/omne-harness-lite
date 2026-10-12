# Session日志的事实拥有者与事务边界

形状归[公开入口](../src/index.ts)，普通操作、固定坐标、权限与事务参与行为归[公共SPEC](../SPEC.md)。本文说明payload和同提交接口的责任划分，不另定义字段或接受状态。

## 事实与事务责任

沿现有LogEntry外壳、SessionRef、tenant、seq、run／attempt、dedupeKey、readKeys。payload改为明确拥有者＋版本＋判别值；message payload只容纳现行Message，Session事实由Session定义校验，model/tool/context payload由各原拥有者校验。
非消息的attempt_started属于Session事实，并保留Run、序号、时间与开始原因。Unknown-other保留原JsonValue且不可送模型；claimed-known非法导致unavailable／invalidInput，不能降为unknown。

`SourceToken`的公开形状由[根入口](../src/index.ts)唯一维护，类型之外的已实施规则见[SPEC的固定日志坐标](../SPEC.md#固定日志坐标)。本页不再维护其字段或校验定义。
append/readByKey/readSince的尾条件和栅栏规则仍归公共SPEC。`readPrefix(sourceToken)`读取一个固定已提交范围。无可信权限不读全journal。
内部`appendIn(unit,request)`：StorageUnit、已校验访问资格及AppendRequest；返回staged(条目、nextTail)、invalidInput／staleAttempt／conditionFailed／dedupeConflict。只暂存不承诺提交；unit过期拒绝，provider核验同AtomicStorage实例。
事务未知由外层协调返回unknownCommit，不把staged当成功回执。readPrefix遇generation不同／非法tail返回invalidInput，来源暂不可用返回unavailable。普通append独立提交，禁止隐式Ambient transaction。

参与操作的调用边界：LogAuthority是可信装配签发并在使用点重新核验的读／写资格引用，绑定显式tenant/session和原已认证主体；不是用户自报bool。其校验端口由日志construction注入，不依赖session-runtime类型或创建反向包依赖。

| 操作 | 完整输入 | 闭合成功／失败 | 读取／提交和在途 |
|---|---|---|---|
| readPrefix | LogAuthority、SourceToken | prefix(readonly LogEntry[],SourceToken)；invalidInput／denied／unavailable | 核权后读取该已提交固定范围；追加不扩大返回tail。generation在读取期间不能核实或来源撤除返回unavailable，不返回截短成功 |
| appendIn | 同实例未结束StorageUnit、LogAuthority、AppendRequest | staged(条目,nextTail)；invalidInput／denied／staleAttempt／conditionFailed／dedupeConflict／unavailable | unit过期或外实例映到invalidInput；权限拒绝denied，权限／存储不可核unavailable。外层owner commit后才发生，失败／未知仍保原义务 |

LogAuthority的tenant/session须与request/token相等，形状或scope不相等为invalidInput；当前不准入为denied。readPrefix重复同token返回同值或明确不可用；其操作无通知，不因读而推进。appendIn的去重／同键异载荷沿公共SPEC普通操作规则，通知只在外层提交后按其已提交事实发出。

## 薄行为

SLN1：日志只追加，顺序、去重、尾条件、fence核验与普通操作失败边界保持；成功批次不可部分存在。
SLN2：appendIn日志和Session状态参加同一真实unit；独立普通append不能证明其原子性。SQL提供者必须实现现有storage实例边界、约束和并发行为。
SLN3：消息与非消息判别可被下游无歧义读取；模型codec不拥有所有日志schema。消息没有“默认事实变提醒”通道。
SLN4：发布前演进不保留旧格式兼容；当前消费者使用同一公开定义，不设双轨实现。
SLN5：读取固定prefix对普通append/afterCommit失败可复现；未知无关append照旧保留。context既有journal回放、效力及撤除承诺必须原样通过。

## 证据

同真实StorageUnit回滚／提交、参与者实例不匹配、并发append/fence/尾条件、unknown-append、claimed-known损坏、读权与generation、原context/工具/模型所有journal消费者合规。物理迁移不自动改变已有Schema URI，行为修订与位置迁移分别记录。

本阶段操作的身份、授权、幂等、提交、通知与在途共用规则见[共用规则](../../session-runtime/adr/shared-operation-rules.md)。本文与该表一起读取；不从目录存在推断实现完成。

除已迁SourceToken边界外，本页是尚未切换的目标增量。现行[可信装配借用规格](../SPEC.md)及SL3仍约束当前消费者。F0同步切换公开类型和消费者后，将本页的行为并入唯一SPEC，再删除本增量页。不得长期并行维护两份现行规格。
