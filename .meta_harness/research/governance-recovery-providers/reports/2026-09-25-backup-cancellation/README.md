# Node24.21备份取消与固定读观察释放

2026-09-25，macOS/Linux arm64，Node24.21.0，合成512行库。两平台在第二次进度回调抛出指定异常，backup Promise以同一异常拒绝；此时原固定只读事务仍归调用方。释放读观察并关闭后checkpoint(TRUNCATE)成功，WAL变为0；随后新备份成功且generation为2。固定读期间的被动checkpoint观察为1154页/0已检查点。中断目标在本实验为0字节，不能外推所有失败都无残留。原始脚本/日志/精确源随包。

[官方Node24.21源码](https://raw.githubusercontent.com/nodejs/node/v24.21.0/src/node_sqlite.cc)的BackupJob在捕获progress回调异常后先Finalize，再拒绝Promise；Finalize结束SQLite备份、关闭目标连接并撤销source备份登记。调用方读事务没有随之结束。消费者是单机备份候选的取消/排空与WAL成本设计，研究不作采用。

边界：这只验证具有进度回调机会时的取消。没有任意磁盘IO时限、空间上限、磁盘满注入、崩溃后清理、正式产品维护接口或恢复开放证明。当前固定读结果不能用于声称备份期间业务写入无成本。

复跑：Node24.21执行node cancel-backup.mjs；Linux只读挂脚本到node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6执行。脚本只创建并清除自有临时合成数据库，不访问用户数据库。
