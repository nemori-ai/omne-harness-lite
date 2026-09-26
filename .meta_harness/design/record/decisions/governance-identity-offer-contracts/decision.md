# D-040 · 有限登录与邀约拒绝的基础规格

- 已接受，2026-09-24。主线在任务发起人“开搞”、治理CLI/TUI全闭环及后续[确认输入](../../../product/PF-017-governance-center-as-deployable-application/interviews/2026-09-24-production-cli-intake.md)授权内作技术采用；不是用户逐项选择内部接口的记录。
- 产品前提：PF-001 rev18、PF-016 rev7、PF-017 rev4。8h/1h、主动改密旧登录全失效、首批单机和延期灾备均有既定依据；接收方拒绝是既定范围内经独立产品评审的行为展开。
- 来源：[登录机制r3](../../proposals/governance-production-mechanisms/login-finalization.md)、[事务精化r2](../../proposals/governance-production-mechanisms/sql-transaction-refinement.md)、[独立架构/规格评审记录](../../proposals/governance-production-mechanisms/review.md)。评审不代替本决定。

## 接受范围

| 对象 | 采用内容 | 不表示 |
|---|---|---|
| capability.account-identity v3 S-1～S-54及formal资源 | 有限判定、凭据代际、成功活动同提交、主动更换、明确参与面、提交未确认语义、首次迁移、邀请内部标识解析 | AI提供者已升级，旧消费者可直接混用，新版治理/entry已接受 |
| data.offer-expiry v2 S-1～S-26及Schema/formal资源 | 增加declined终结，保留v1精确对象范围、时限严格比较、必要依赖失败和非法默认启动失败 | 资产消费者已支持拒绝、数据库迁移或并发SQL已经实现 |
| 事务精化r2的实施方向 | 显式参与面、唯一事务终结、提交后尽力通知；本期新生产组合仅SQLite | 可以隐式合并原Storage嵌套调用，或PG新组合已具备共同授权/无循环锁 |

资源精确字节由 registry/frozen.json 登记；模型正文/Schema的实跑输入与对应hash分别见[登录run5](../../evidence/2026-09-24-formal-login-candidates/README.md)、[邀约模型/Schema](../../evidence/2026-09-24-formal-offer-settlement/README.md)。接受前状态元数据与模型范围文字已整理，模型可执行字节、Schema与实跑对应。不改任何既有冻结资源。

## 可重复收益与保留前提

8h/1h及改密要求以显式状态/同提交表达；三组登录模型排除准入时间回填、观察绕锁及旧凭据快照借新代际签发的具体反例。数据库合并不能沿用内部catch后正常返回的旧包装，否则可能提交半份业务。显式参与面保留普通服务独立提交语义，工作量较大但避免隐藏提交点。

本期采用SQLite既有BEGIN IMMEDIATE与D-039 FULL提供者；PG新组合必须在开闸前拒绝，不降级为旧登录规则。共享PG存储及其旧消费者不受此项直接修改。所有成功字节和通知提交后释放，未知提交不得假报未发生；事件仍非可靠投递。

模型只证明所列有限状态安全性，不能替代真实SQL/多账号多登录/组织锁/重启/物理故障验证。邀约模型正例82 distinct，两个负控分别覆盖覆写和对象消失后首次终结；不声称独立超时负控、相等可达性、S25配置/清理已获模型证据。Schema17项是形状检查。

## 消费者与下一层门槛

| 当前消费者 | 当前采用 | 后续责任 |
|---|---|---|
| 注册组合v1 | AI v1相关条款 | 保留独立链；提供者升级前核S13/14/18/38及明确提交未知收场，不自动改版本 |
| 组织治理v1 | AI v1、OE v1 | 下一版明确拒绝、AI参与面、当前选择/清扫和同提交保证，再接受/迁移 |
| entry v1 / HTTPS绑定v1 | AI v2、OG v1等 | 入口下一版明确新版路由、预期租户、结果转换和Schema；HTTPS字节绑定另核兼容关系 |
| tenancy-host / CLI | 现有接受链或候选 | 节点绑定、迁移、实现/符合性和真实旅程就位前不可声明生产新版开闸 |

账号v1/v2及邀约v1继续保留给精确旧消费者。D-023/D-028的旧接受不撤销，推荐新版本不自动升级；本决定也不补齐恢复安全开放、TUI、离线分发或整机灾备验收。后续提供者/装配节点需独立定向评审，不能仅凭本规格存在开实现捷径。
