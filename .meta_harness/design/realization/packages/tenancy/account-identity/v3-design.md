# Account identity v3 提供者修订 · D-041局部采用

本稿只绑定 D-040 已接受的 AI v3，不提升当前 v2 实现状态。沿用原插件、accounts/logins 服务与 credentials 可选解析；无新插件、跨领域表写入或后台刷新。具体共同作用域采用已实现的 core/storage P-13，普通 Storage 不隐式嵌套。

## 状态与迁移

追加 account_identity_bounded_logins 迁移，原片段字节与名字不改。账号新增 credential_revision 非负安全整数，初始 0；登录新增 credential_revision、last_activity_at，分别初始 0、原 issued_at。迁移同提交将所有既有登录 revoked=1，旧无限登录不能借部署时间再活八小时。新签发写 g=账号当前G，I=L=签发时刻。后续重启/迁移不重写这些列。字段不是独立对象，仍由原账号/登录 owner 拥有。

采用 SQLite。正常登录观察也走 AtomicStorage.atomic，沿 BEGIN IMMEDIATE 串行边界，不能用普通 read 绕过暂存活动。新中心 PG 配置在启动前拒绝；共享存储 PG 不删除。账号产生/激活/清除仍保留独立事务；注册组合须核新版收场后才迁移消费者。

G/g 用安全整数；读非法值为 StorageDefect，G+1 溢出为 StorageUnavailable。期限加法用已采用 Instant 整数毫秒，溢出不可用。有效性只有一个函数，同时接收同事务账号/登录事实与可信 Clock；先判缺失、撤销、未激活、代次，再按需取时，恰到截止无效。listEffective 在一个共同事务中用一次可信时刻过滤全部行，必须含调用方，否则失败。无需时钟即可拒绝的分支不强取时。

## 显式参与面与普通面

AccountsService 仍保留现有四个普通方法；新增 participate(unit) 返回只有 read 与 resolveActivatedIdentifier 两个方法的参与对象。后者仅供已授权邀请组合，不建独立方法或线上查名。read 会落首次未激活到期事实，不能按只读 SQL 实现。

LoginsService 增加 changeCredential 普通面及 participate(unit)。参与对象只给 exchange、verify、revoke、listEffective、finalizeActivity、commitCredentialChange。issue 不给参与面。每次参与方法先核 unit.assertStorage(deps.storage)，再以 unit.run 包裹整个 owner 调用；内部语句经 query/mutate。异常逃出 run 即污染，不能提前 catch 成 unavailable。普通方法创建 atomic 后调用相同内部函数，在事务结束之后映射 StorageUnavailable。不得伪造一个 Storage 给旧服务从而隐式重用普通面。

各方法语句之间不并发；通知通过 unit.afterCommit 登记，实际提交后调用原 notifier，回滚/未确认提交不发。凭据更新不发新事件或逐条撤销事件。输入表示失败和明确业务拒绝沿冻结失败集合，不被包装成缺陷；数据库错误与必要最终时钟失败传播回滚。任何拒绝后不留业务写，唯一允许的单调到期事实沿 AI3 S-51。

## 凭据准备与重核

issue 在事务外读取账号材料/G快照并验证凭据，提交内重核相同账号、G、已激活，再签发；旧快照不得读最新G并套给旧凭据。

changeCredential 的普通面先解析输入，独立原子边界校验发起登录并读账号材料/G，然后在写锁外验证当前凭据、核政策、派生新材料。先当前凭据，后政策；政策缺席为 credential-rejected，验证/派生不可用为 storage-unavailable。准备成功由包内 WeakMap 生成一次性不透明票据，含发起句柄、账号、G及新材料；不导出可构造载荷、不落盘、不日志。票据只供该服务实例，提交尝试后销毁，失败也不自动重用。

入口改密需要相同准备阶段，但线上出示物必须先经 exchange 取得可信句柄；提供显式 prepareCredentialChange 组合内部面，其输入为按来源取得的句柄和两份凭据，返回准备票据或 S-50 失败。该面不是单独的成功改密，也不做 touch。最终共同事务由 commitCredentialChange 重读同账号/G；G变了先报 current-credential-rejected，再核登录有效性；两者成立才更新材料和G+1。原普通 changeCredential 组合上述两阶段。票据即使检查仍需相同存储域的 unit；不能从品牌类型推断安全。

## 最终活动

finalizeActivity 仅供 entry 在该次参与业务成功后调用，参数为已准入的句柄。无独立入口。先取最终可信时钟，即使业务已撤销自身也必须满足 AI3 S-49 的必要时钟条件；再以该时点重判，仍有效更新L，否则不写。时间不可用抛 StorageUnavailable 使全部业务回滚。实际提交与暂存之间所有观察者同被保护。

## 生命周期与归属

提供者没有自有连接、定时器、跨请求准备缓存以外的资源。准备票据随调用结束/失败丢弃，WeakMap不延长票据可达生命周期。存储资源归 storage-sql，凭据计算资源归 credentials。

中心有序停服由 entry 闸门停止新请求并排空，再撤除领域依赖与存储；共同事务归入口，存储关闭排空实际事务。参与对象不能跨请求保存；故障撤除期间仍在途的临时结果不得提前对外发送，依赖失效须传播到拥有者。本稿不假定 Cordis dispose 自动取消/回滚数据库事务；应用须以实际 lifecycle 测试证明闸门与排空顺序。独立模块使用者同样承担先停止准入再等待调用的顺序；本提供者无自动分布式交接承诺。

## 验证与开放门槛

真实 SQLite 覆盖绝对/空闲等号、成功与失败活动、最终时钟失败整体回滚、暂存暂停时 verify/exchange/list 等观察受阻、改密和旧凭据签发两种竞争顺序、票据跨实例/重复/关闭作用域、通知提交后及未知提交、旧库迁移一次性失效/重启不续期。保留普通注册/清除链回归。中心与 OG 选择清扫的共同保护另由对应 owner 验证，不能由 AI 包局部测试宣称闭合。

本稿已由D-041在独立架构评审后接受供局部实现；bindings 不预填。OG2/entry2/注册组合精确采用未完成前不开放新版生产中心。

## 装配门槛（评审后明确）

entry必须跟踪包括事务外凭据准备的完整业务Promise，host据业务收场关闭依赖；当前运输drain不足以证明静止。host旧全局迁移前缀须保持，新AI片段追加到完整旧序列之后。两项不由AI局部测试背书。
