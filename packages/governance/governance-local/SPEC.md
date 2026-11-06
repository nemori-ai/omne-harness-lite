# @omne-harness/governance-local 行为规格

## 范围与依据

本包实现 [治理贡献契约](../governance-contract/SPEC.md) 的本地持久提供者。领域职责和同提交要求归 [动态治理贡献](../../assets/docs/governance-contributions.md)。公共业务服务仍在实现；当前公开入口只提供迁移材料，不可作为已完成的 GovernanceCommands 或 GovernanceQueries 使用。

## 结果与不变量

### GL-01 单一关系拥有者

`governance.activation` 拥有全部 `gc_*` 表。迁移不建立指向 Settings、Assets 或 Identity 私表的外键，不读取这些领域的表。声明、注册、当前采用和操作回执在同一租户物理写域。

### GL-02 独立身份

声明唯一键为 owner、definition、version，不包含 digest。原操作键包含 scope、command owner、principal 和 operationId，不包含 epoch 或 generation。注册租约独立于声明，同声明可有多个租约。Schema 的唯一约束只守护本地一致性；声明来源和跨租户不可变性仍由定义权威核验，不由数据库表声称提供。

### GL-03 精确目标支持

每条支持记录绑定 scope、registration、definition、epoch 和 target。关系外键拒绝错误声明、错误 epoch 和不存在的成员。多个注册可以共同支持同一目标，多个相容声明也可选择同一目标。相容性由业务参与者判断。

撤除时只删除该注册的支持，选中目标等于当前支持关系的投影。投影的完整性属于单事务写者义务；外键并不能单独保证两者相等。

### GL-04 操作状态

accepted 保存原输入、受理 epoch 和原 SQL 身份，execution 为空。submitted 要求完整执行信封。committed 同时保存执行信封和原结果；aborted 保存终止结果，允许在形成执行信封前终止。pending 不得携带最终结果。持久状态形状不代替状态转换或身份资格校验。

### GL-05 有界读取

当前贡献通过 scope、epoch、state 索引访问。目标支持按 scope、epoch、definition、target 定位。恢复按仅含 accepted/submitted 的部分索引做 keyset 分页。声明历史不得成为当前目录的无条件全表输入。数据库规模测试的查询计划不构成端到端延迟保证。

## 所有权、失败与生命周期

`governanceSqlMigrations()` 返回固定模块、文件摘要和先决条件，不启动数据库或 Worker。装配者负责把材料加入真实 SqlStorage 组合并声明表拥有者；迁移执行和回滚归 SqlStorage。文件读取失败直接抛出，不返回假迁移。

关系使用 STRICT 和 WITHOUT ROWID。修订上界与公开契约一致。数据库不开放客户端任意 SQL；Schema 校验之外的当前主体、来源权威、预算、原结果认回、精确撤除及重装围栏仍由后续业务提供者兑现。`./cordis` 尚未提供运行服务，不允许假装动态注册已接通。

## 组合与验证

[关系测试](tests/schema.spec.ts) 检查约束、支持边、磁盘重开及历史数据下的查询计划。[材料测试](tests/materials.spec.ts) 将实际迁移交给真实 SQLite Worker，并重开同一域。该测试的 mutation participant 是具名夹具，只用于证明安装和保管，不证明业务服务。

[目标支持模型](../../human-intervention/human-intervention/verification/models/GovernanceTargetSupport.tla) 及其 [证明范围](../../human-intervention/human-intervention/verification/README.md#按租约保留目标支持) 定义集合不变量。完整公开入口、原操作恢复、当前事实、Identity 协调、Cordis 生命周期和独立验收仍须后续交付。
