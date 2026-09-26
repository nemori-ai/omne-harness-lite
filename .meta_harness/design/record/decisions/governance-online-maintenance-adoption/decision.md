# D-055 · 不停服备份、校验与隔离恢复

2026-09-26，主线依据用户完整治理CLI/TUI交付授权与INT010不停服选择，接受PF017rev5下的EC3 S1～59、HT3 S1～33及登记资源；采用[分工候选B](../../proposals/governance-production-mechanisms/maintenance-ownership.md)与本包provider-snapshot.json所列R2/R3提供者。规范保留受审稿candidate字样，当前状态以本决定和registry为准；接受不代表已实现或生产完成。

EC3正文受审SHA8c638900033558faffb077a4a67d34be51c94c580c171745533eb4c8a73aae19；HT3正文1836b2ba0a08ed03d28d98617cf5ca8d35ac6619863ab9cbf2b8d347df02c91a。冻结资源不原地覆盖旧v1/v2。本中心升级采用新opsVersion=1，仅full-health/backup/backup-status；员工线上protocolVersion=2、31业务路由与固定字节不变，既有CG/CLI继续消费原业务承诺，不要求员工因运维更新强制升级。离线verify/restore不成为网络路由。

source.run由原SqlStorage拥有整个维护工作；entry ops拥有中心封装/状态/发布，host静态组合，不新增fiber或治理授权。在线一个属主单槽，离线各调用作用域单槽，同工作根跨进程互斥；不同根可并行检查同一只读封装，输入各自固定、目标独占，无全机IO总量封顶。所有owner检查同一副本的物理/结构/身份/底线，不能以迁移登记或摘要代替实际表列约束。生产打开统一拒绝永久隔离根中的明文和非SQLite封装；保护根/标记永不由清理撤下。

采用独占发布与真实文件/目录同步，新创建备份目录还须同步其已存在父目录。发布确认失败unknown保留输出，不自动重试；只读verify不消除发布未知，新status实际重新确认才可计每日有效。采用每小时onlyIfDue、观察年龄20小时到期、24小时缺失监测、固定容量和人工保留，timer不拉起已停止中心。仅同机副本，无整机损毁RPO/RTO声明。恢复输出保持隔离，没有extract/serve/reset或安全再开放命令。

正常关闭30秒改诊断并继续真实等待；controller/storage各自收场观察槽及guard.pending共同判结果。source owner只能在所有子工作与资源真实结束后释放。R3仅将完整integrity/FK检查放原任务拥有的单worker，必须结果和实际exit均成立；取消/消息/超时不等于结束。存储SQL R3受审SHA bf13ed44ac08163113eb9d017ccddb1fe4920a83482fb94981c6719d9a796dfe，模块边界B不变。

独立规格联合复评、架构R2/R3及施工计划review本范围无阻断，发现与处置见[评审记录](../../proposals/governance-production-mechanisms/review.md)。[有限模型](../../evidence/2026-09-25-formal-center-maintenance/README.md)两正配置184 distinct及四预期反例，只覆盖一个已受理任务；[worker研究](../../../../research/governance-recovery-providers/reports/2026-09-26-snapshot-check-worker/README.md)与既有备份/取消/systemd探针只提供机制依据，不代替产品组合。

本次准许按受审施工计划增量实施。当前没有维护产品源码；必须补全真实SQL/文件/worker/关闭异常、支持制品×生产打开路径×隔离残余矩阵、在线业务与clock续约、真实systemd、旧固定CLI连接新中心、新归档和独立QA，全部完整后再按用户指定Claude Code fable最终review。正式支持保护规则从本次新制品起，具体BUILD_ID在最终证据列出，在那之前不得声称已有制品属于此支持集合。安全再开放与旧升级契约归属缺口保持，不借本决定补造政策。
