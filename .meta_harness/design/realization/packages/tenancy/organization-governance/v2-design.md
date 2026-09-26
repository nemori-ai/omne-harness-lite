# OG v2 提供者修订 · 候选

输入：OG2候选S1～64、D040的AI3/OE2、D041的AI3提供者及core/storage P13。当前实现仍OG1；本稿不构成采用。

## 边界与共同存储对象

沿用organizations、memberships、offers、organization-purge四服务，不新增插件。账号/登录列仅由AI参与面读取；OG只写organization、membership、invitation、affiliation_request、current_tenant_selection、team_creation_key。共同保护为同一SQLite文件的BEGIN IMMEDIATE：账号代次/登录活动、当前选择记录、成员/角色、邀约终结和业务效果都在这一边界内。禁止PG新组合开放，不能拿SQLite结论推导PG锁序。

## 显式操作上下文

将现有函数中的deps.storage.read/write改为内部OperationContext.query/mutate；这两个方法绑定同一StorageUnit，不能被当作普通Storage提供出去。内部上下文还携带同scope的AI accounts.read和logins.verify、clock/config/logger及提交后通知登记。所有owner操作由unit.run包住，query/mutate之间顺序await；内部不把存储异常转换为unavailable。

普通服务每次自己storage.atomic→owner函数→真实结束后映射StorageUnavailable；参与服务participate(unit)只给OG2 S63允许的操作集合，每个方法核验存储实例并unit.run，不重新建立事务。两面共享业务函数而不是伪造Storage包装旧服务；外层参与返回只是临时结果。通知全部经unit.afterCommit，提交不明不发、监听失败不改结果。

S20创建个人组织、S53清除不给外层参与面，继续各自普通独立提交；各自内部的AI18查询也用其所拥有的unit，账号留存事实与组织写处于同一边界。这不把注册三步合并：AI13、OG20、AI14仍分别完成提交。与旧实现的账户快照窗口相比保护更强；旧允许交错不等于必须保留这个窗口，测试须证明新的序列下不出现孤儿/误激活，而非强迫已排除的次序发生。

## 登录观察与清扫

当前选择查询/切换在本操作unit内由AI17重验，再读/写current_tenant_selection。清扫先列候选句柄，每个句柄的有效性检查和删除同一unit；不可用不能当失效。清扫不touch、不假造撤销事件。entry的expectedTenant比较和最终成功活动归entry2，OG不接受网络身份当授权依据。

所有普通治理读取也建立独立atomic，确保授权、列表和终结的必要读数一致；读操作不自行touch。期限经过时钟不支持的窗口则unavailable，不等待需要同一writer的clock续约。

## 拒绝与状态

offers增加declineInvitation(AccountId,InvitationId)和declineAffiliationRequest(TenantId,AffiliationRequestId)，原操作与参与操作均可调用。先按OG61/62核授权；不存在/错误接收者按各自not-found，普通成员/失效超管拒绝隶属为notAuthorized。按OE2先终结后必要时钟/指定对象现读；pending写declined，同类既有declined在当前仍授权时ok，其他终结或expired为alreadyConcluded。无成员/隶属写，无事件。

原表settled列是text，不需要改旧timing或重写旧记录；解析及合法写集合增加declined，所有读面/列表返回它。既有接受/撤回不得覆盖declined；两个方向都保持原授权、末位超管、不成环规则。

时间计算溢出明确unavailable；非法发起时长仍invalidOfferDuration，不能合并。OE2纯提供者负责安全计算可判性，OG映射到对应失败。默认值不合法仍加载即失败。

## 装卸及验证

没有新增自有连接/定时器。普通调用归本服务直到atomic结束，参与调用归entry。不经entry的可信调用方及清扫触发者必须持有完整调用Promise、停止新工作的准入，并在装配关闭依赖前等待调用真正结束；逐条事务完成不代表整轮清扫已经静止。本期不装入自动清扫，未来触发者必须落实同一责任。entry须跟踪完整业务Promise，host待静止后关必要依赖；当前运输drain不能作为兑现。注册链撤除仍由注册owner在步骤边界停止后续动作，已进入普通OG操作由OG完成/回滚，不把断开引用当撤销数据库效果。

真实SQLite验证拒绝的授权矩阵/重复/过期/接受撤回竞争与无副作用，末位超管/无环回归，全部状态读面declined；业务已暂存后最终clock失败回滚且不发通知；当前选择清扫与活动暂存竞争；普通/参与范围与跨存储/关闭/并发误用。旧注册交错夹具须对准实际读取完成或提交时刻，不能为让旧断言通过重新打开被新边界关闭的窗口。模型仍是抽象前提，不替代SQL精化。

待OG2采用及独立节点架构评审；不提前修改实现状态或bindings。
