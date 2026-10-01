# 提供者成组独立架构评审与处置

2026-09-29。architecture-reviewer只读评审锁定提交 `807ac9938efba68d6c3f2c840dfd70adff1bdddd` 的五节点及README/verification：CA3、MS7、MR10、MP6资源增补和runtime v20。核相关契约/源码，未运行测试或形式工具；新增bindings0。结论不是采用或实现验收。

## 实际结论

四个core节点范围内无阻断；runtime的A责任边界成立，具体耐久路径未选定，不能释放完整durable ref实施。

| ID | 实际发现与反例 | 最小处置 |
|---|---|---|
| R-B1 阻断 | ST2/RT11 S85/S93/G39/MS7 S55硬指定保留记录；runtime又要求它与JSONL共同事务，但Storage.atomic不能包进SessionLog.append。先check再append期间GC可删除；marker已提交但回执unknown、引用登记未完成时GC也会误删 | 已有runtime私有Storage内容行可无独立GC，与有效引用及可能发布writer同存续；确认原bytes后marker，关闭不删、unknown/孤儿保留、版本不复用。外ref仍独立证明保留。条件化规范机制约束，不减存续保证 |
| R-N1 非阻断 | ST5授权SQL行与JSONL同事务比RT11共同次序更强；旧allowed→撤权→旧append是必防反例 | 外部受信准入协议；本地真实唯一入口锁覆盖全部写方、完整append及实际停后交权，跨进程无协议unavailable，不建完整治理 |
| R-N2 非阻断 | replyDerivations重复persistedMessage；当前official输出均text，transport构造text/thinking/tool_call，raw仅headers，无当前媒体派生前置事实 | 当前H19原值路径照用；原源/摘要矛盾仍invalidInput，真实派生缺来源unavailable，后继再设计最小DTO，不把未来媒体输出前置 |

无产品政策待裁。主线需选择具体技术分支；本轮无独立GC是成立的最小替代，未来独立回收不能借用其前提。

## 核查范围与限制

MP5/MP6独立JSON比较仅$id/title/description不同，其余完整对象相同；当前directory5/MP5→完整snapshot→MS7精确MP6判形成立，root不必升级，只补schema/v6。来源不能伪改，token准入仍RT承担。CA无第二账、MS唯一消息扩展关系、MR唯一pending/final关系。ST6真实权威head/定位/重建/O(1)、停止、撤权、冷恢复、unknown、资源制品图和并发均未验证。

## 作者修订

`97f04eed`选定无GC私有内容行并同步RT11/MS7条件；收窄ST5；H19新DTO移后继；SL3实际没有generation类型/head API，改为受信callFacts来源身份加现readByKey返回tail核当前性；MR纯helper明确pending完整先判再读取final。该提交已提交architecture-reviewer与spec-reviewer定点复核，尚无最终接受。旧节点稿保留于807ac993，不把本页处置冒充该稿已经通过。
