# 本期单机持久性档位 · 候选

目标由PF-017 rev4承接：普通进程/OS故障与断电不丢已确认事实，整机/磁盘损毁灾备验收延期。现有D-027的NORMAL只承诺进程崩溃，且明确要求未来改FULL时新决定并加config项；不能凭延期灾备恢复旧的可丢尾部取舍。

| 候选 | 可兑现范围 | 代价与不适用 |
|---|---|---|
| A：全仓库SQLite固定FULL | 在底层兑现同步请求的前提下强化WAL提交耐久 | 强制所有开发/测试消费者改变成本，撤销D-027的共享默认；缺少逐消费者选择 |
| B：SQLite提供者增加normal/full档位，tenancy-host固定选择full | 不改变存储事务/领域语义；本期中心的每个写入句柄显式FULL，复用消费者保留NORMAL默认 | 需保证每个新连接/重开均带同一配置，防装配遗漏；FULL每次提交额外同步，需真实中心回归 |
| C：迁移到PostgreSQL并配置持久提交 | 成熟数据库承担日志同步，保留统一Storage面 | 增加首批单机部署组件与现有pg升级回退缺口；本期没有必须换库的需求 |

推荐B。官方 [SQLite synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous) 区分WAL下NORMAL与FULL：本选择依赖操作系统/文件系统/设备兑现同步请求，不支持磁盘毁损或谎报同步的设备。测试能检查真实句柄参数、进程终止后数据与现有事务/升级行为，不能把SIGKILL称物理断电验证。

## 实施绑定候选

- `StorageSqlConfig`仅sqlite支增加可选 `synchronous: 'normal' | 'full'`；缺省沿D-027为normal，非法值在启动时明确拒绝。
- 传至openSqlite以及每个NodeSqliteDriver的打开路径，读/写句柄采用同一档位；只从枚举映射固定PRAGMA，不拼任意输入。
- `tenancy-host`装配的sqlite支明确给full；不提供让生产中心静默退回normal的环境开关。其他现有Storage调用保持原默认，PostgreSQL配置不新增无意义选项。
- 不改现有数据库结构、升级guard确认或领域契约版本；本项没有新跨进程协议或共享资源交接，不以此接受恢复旧备份开放。
- 验证真实写/读句柄的PRAGMA、非法值、缺省正常档、显式FULL档；在FULL跑存储符合性与中心e2e/升级回归。物理故障前提与未测范围保留。

提供者/装配设计定向评审后，主线才登记限定采用与实施；本页当前不取代D-027。
