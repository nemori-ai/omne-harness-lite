# Entry2 / HT2 提供者增量 · 候选

依据EC2 S1～54、HT2、D040 AI3/OE2、D042 OG2、D043 AR2、P13及原节点。保留入口/运维两个插件与运输模块；不把领域状态迁移放进apps，不开放PG新组合。候选待独立架构评审和EC2/HT2采用。

## 服务与同一提交

入口新增必需accounts参与面，storage必须AtomicStorage。普通EntryServices只用于免认人注册/签发及改密准备；单独定义AuthenticatedServices，只包含AI/OG参与面，不能把普通issue、createPersonal、registration伪装为参与操作。两类路由显式使用不同服务类型；scopeLayers参与版虽纯计算也经过unit.run，避免闭域引用误用。

普通认证路由：先在无存储阶段解析JSON、public health、版本和信封，并完成出示物absent/multiple/malformed三项纯表示判定（这些拒绝不能依赖atomic能否开始）；仅出示物表示合格时，同一个storage.atomic内部依次AI参与exchange→载荷检查→OG参与currentTenant及expectedTenant比较→补授权→领域参与调用→规范结果投影/Schema检查→成功时AI finalizeActivity→真实提交后交出完整字节。共同存储对象是同一SQLite文件及其中账号/登录/选择/成员/邀约/业务记录，由BEGIN IMMEDIATE保护；参与提供者自身确认同StorageUnit。

expectedTenant只在EC2 Schema要求的路由出现；用IV tenantIdEquals与同边界真实选择比较，不作为授权依据。切换操作比较旧选择后写目标；当前身份查询不带预期。缺少/多出/不合格字段仍按原判定次序处理。

保留原normalize/toWire/逐路由失败表，成功必须合Result_schema，入口字符串/具名结果须合本次Exchange。可暂时构造字节但不在提交前交给运输。内部Decision若为不可用或缺陷，抛出携带该安全Decision的内部回滚标记，使唯一外层atomic结束后才能转换。逃出AI/OG参与面的StorageUnavailable直接穿过认证、推导、补授权、invoke的catch到外层；其他参与异常污染单元，外层记缺陷而不提交。不能因旧代码把异常转换成Decision就继续commit。确定的前置拒绝不写业务/不touch，允许AI条款的首次未激活到期事实；任何不可判定整体回滚。

补授权仍逐组织顺序读取并按EC2优先级合成；纯领域返回的不可用读数不短路为拒绝。存储异常使单元失效，不在失效单元继续SQL。多组织读数不可用与存储致命失败必须区分；前者按合成规则，后者退出共同边界。

## 改密与新路由

AI3 S50作为专门的准备/提交路径：初次认人→载荷/当前及新凭据表示检查→普通prepareCredentialChange（慢派生在写事务外）→独立最终atomic→commitCredentialChange(ticket)→成功Schema→finalizeActivity→提交。最终区间不先exchange，必须由AI先G后登录重核；否则竞态会被错误归成普通登录拒绝。错误/到期/缺陷均按EC2 S52收场，准备票据不出网络、不入日志、不跨调用复用。该成功不签发新登录，旧登录不补活。

按登录标识邀请在共同区间先确认当前有效超管，再AI内部resolveActivatedIdentifier，再OG issueInvitation；不能先查目标泄漏存在性。未知/未激活统一accountDoesNotExist；输入不合格与基础设施不可用保持独立。拒绝两条直接投影OG61/62，事件及业务副作用仍归OG。

路由31条，AI3/OG2/AR2精确坐标；稳定health仍entry/v1#S18。此提供者构建显式把唯一线上版本字符串`2`映射到HT2；不保留`1`别名。版本不匹配固定133字节及公开health完全继承，业务答复消费EC2 Schema/OE2；旧测试客户端须明确改版本/路由与预期身份，不能把不合法payload当覆盖领域分支。

## 完整业务生命周期

每个已收齐并接纳的请求由入口持有完整Promise，从事务外准备直到最后判定/提交/工程记录结束；运输socket销毁不从集合移除任务。立即观察拒绝，调用者仍收到原结果。EntryRuntime一个effect先关新准入、发停止通知并执行运输有界drain，再等待全部接纳工作真实结束；最后关闭通知出口。该等待必须在finally中执行，使用allSettled观察每份完整Promise：运输drain/retire异常或某个业务拒绝都不能跳过其余工作的静止。撤除先设置入口自己的关闭准入标志，即使运输清理异常，answer也不再接纳新业务；清理错误保留可观测日志，不假设Cordis会将其上抛给host。运输等待超时只影响是否能发送，不能释放业务依赖。

host已有逆序逐fiber等待；入口真实排空完成前不轮到账号/clock/storage。总关闭上界届满时现有host记录未完成并停止后续依赖释放，不能声称完整关闭。直接可信调用者的Promise不在入口集合内，仍按AI/OG/AR节点责任单独静止。本期不添加后台清扫。依赖热换代让旧入口关闭准入并等待旧请求；新代不会从旧请求重取绑定。动态撤除不能假定已提交效果可逆。

## 验证门槛

继承JSON/HTTP成帧、错误固定字节、秘密遮蔽及两张面隔离场景；更新精确Schema/路由。新增真实SQLite跨owner：角色撤销/预期租户切换竞争、业务暂存后时钟失败回滚、不合Schema的成功回滚、异常被旧catch转换仍不能提交、成功L同提交及自撤销/改密不复活、G先于登录重核、按名邀请先授权。长准备跨运输drain上界仍保留存储；完成前旧fiber撤除不得返回静止，完成后无旧任务再次发起调用。模型分别覆盖抽象分类/提交/预期比较，不替代这些SQL/生命周期证据。
