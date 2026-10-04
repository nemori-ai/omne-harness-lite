# MS8 ACK候选验证义务

## 变化的影响

2026-09-29，从已接受v7派生v8；S-56～S-59为ACK增量。MS7 S-52～S-55→MS8 S-56～S-59：新增ACK技术记录及语义摘要、小账见证；Message不加类型。Schema新增形状，旧必填/closed union保持；原字节digest与值digest区别。

## 批内对齐及证据边界

PF-013 rev17 §6.19为ACK新依据，其余需求只继承source-alignment列出的已消费范围。四后继统一CallKey/creationKey及现有失败域；ACK不是处分，ModelCallAcknowledgedRecord唯一归MS8，Pending完整值唯一归MR11，Usage/Cost归CA4，ACK操作/清理责任归RT12。相同ResponseId原事实在final、ACK小见证、ready间选择一次；先核所有仍需可核来源，不以优先级隐藏矛盾。

RT12→MR11/MS8/CA4，MR11→MS8/CA4，MS8→CA4；CA不反向引用MR/MS。MS8原CredentialScope/ResponseId等防环就地表示沿D-060 M2，与MR11逐字形状/含义对齐；ACK witness引用MS内已有def，未新增第二同义定义。MS8 created仍MP6、dispatched仍MP5；MR11原响应仍MP5。SL3和CB3/LC6等其余依赖精确保持。纯invokeModel不加Session/ACK；纯sum仍显式收已选一份账。

所有前驱冻结内容保持。继承模型/实例仅证明原配置表达的性质；本批不重跑或重登为新ACK证明。lineage.json仅表达legacy baseline迁入，不适合普通后继，因此不改；id-namespaces无新族。catalog登记四candidate/resources与真实消费clause，covers新增ACK范围，formal-tasks仅ACK两个正配置；负控不登记成功任务。

## 证据义务与当前状态

| 范围 | 落点 | 状态与限制 |
|---|---|---|
| 三新Schema的显式defs/root、封闭ACK/见证/角色分支 | ack-examples.json及继承正反实例 | 实际执行结果由topic外verification与本批运行记录维护；不证明事实来源 |
| 无损语义摘要、角色分隔、等值/异值 | MS8 semantic-digest-vectors.json | 固定编码/摘要向量；工具独立编码器校核，不代真实生产codec/密码学证明 |
| ACK前提、原读/写排空、两域确认后删除/旧ref/原账一次 | RT12 formal/AckLifecycle.tla + AckLifecycle.cfg | 有限状态模型；各变异负控单列，不登记成功任务 |
| 公平恢复/清理及实际任务终止下进展 | RT12 AckProgress.cfg | 消费者重返/处分发生不作前提；有限模型不代物理崩溃协议 |
| 私有缓存/idle/未开始交付引用解除及真实读保护 | 真实runtime内存/资源边界 | 未开始；不指定GC回收时刻 |
| 当前ACK/settle权限、消息原子写权、实际停止、SQL删除未知、外部保留配对 | 下表真实故障/重开/多调用组合 | 未开始；caller bool/Map缺席不能关闭 |
| ACK后新的final临时原批耐久与自动清理 | 原结算写方+Storage | 未开始；模型仅抽象保有临时完整批，不证明真实字节或durability |

继承形式工件未在本批重跑；与前驱逐字hash对照可证明继承身份，不能声称覆盖ACK。新模型不证明真实授权来源、跨租户隔离、字节hash/无损JSON、物理外部保留、SQL/日志耐久或O(1)I/O。

## ACK组合验收场景（未执行）

| 场景 | 必须观察到 |
|---|---|
| consumer保存完整原值→ACK→无完整Session实现重复查询 | ACK独立确认；pending清理由runtime继续；released后旧ref/samekey小视图成功；无新provider/HTTP/全文重取 |
| complete+尚pending，两个consumer仅一个有当前ack权 | 当前权核验；read/旧handle无ACK权；有权者可确认，清理不等另一个consumer或处分；跨租户/撤权不泄存在 |
| 进行中的真实读取、闲置handle、observer待送队列并存 | 实际读取受保护完成或明确结束；未开始的全文交付关闭；idle/队列/私有缓存大引用解除；已交consumer副本保留 |
| 原persisted writer先赢/后赢/回执unknown晚提交 | ACK键与final键独立；真实旧writer未停止不释放；小账原值一致，final优先且只计一次；ACK不造处分 |
| 每个retiring/ACK提交/确认/删除前后crash-reopen | 未确认不删；unknown同源完整认回原批；删除状态与内容原子认回；不把Map空/timeout/fence视为停止 |
| ACK released后合法vetoed/consumed及独立persisted | 普通settleReply仍不授persisted；完整retainedResult核原身份/完整语义摘要/账；缺值wrongPhase，改值malformed，权限不可核unavailable |
| 新final首次追加前/unknown后crash | 发前完整原批耐久；unknown保留临时恢复责；确认+writer收束或真实停止+权威无批+政策结束才自动清除，无第二ACK、不复活原ready |
| 旧同creationKey：键重排/数值等值/巨大整数/sourceVersions变化 | 语义等值认回原采用事实与ACK摘要；不同输入creationConflict；不重读最新profile，精确大整数不binary64合并 |
| 原Usage/Cost未知、已知零、迟到补账 | 未知不补零；ACK原账非有效汇总；历史每个failed ResponseId仍单列；补账原算法/归属不变 |
| 两调用共享外部内容 | 只释放当前自有清单/保留权；另一调用及consumer副本不受损；真实外部owner配对解除；纯inline不等虚构provider |

以上是必须交付的真实组合证据，Schema与TLC均不能代替。消息派生扩展、原outputHistory/摘要真实性先行、真实late前缀与当前消息写权的前驱义务持续；ACK不会放宽。

## 已知缺口与报给主线

MS8新增缺口见contract末节（RT G-41/G-42；MS G-15；MR G-19；CA G-14），owner及前驱未闭合义务保留。新技术表示均无独立词条，不新造领域对象。ACK后新写临时责任采主线候选技术页；独立复评/接受由主线负责，本起草不accept。
