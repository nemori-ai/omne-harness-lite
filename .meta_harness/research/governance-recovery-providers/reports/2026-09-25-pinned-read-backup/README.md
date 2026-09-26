# 固定只读观察下的SQLite备份探针

2026-09-25，Node24.21.0，macOS arm64与固定Linux arm64镜像node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6，均通过。独立readOnly连接BEGIN并实际SELECT固定观察，再执行backup(rate=4)。512行/1090页复制期间，在272次进度回调中的前10次，经另一个连接提交generation变更；副本仍全部为0，源全部为10，integrity_check通过。输入脚本与两份原始日志同目录。

这验证特定WAL/只读事务的快照承载，不证明任意写压、存储或进程终止下有时限，也未建立产品备份/发布/恢复/关闭的保证。[Node24.21精确文档](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/sqlite.md)描述backup的分批异步行为与外部连接变更触发重新复制的一般情形；本次探针补的是明确固定read transaction这个条件，不把一般文档解释成任何情形都不会重启。

复跑：Node24.21.0执行node pinned-backup.mjs；脚本只建合成私有临时库并清理，不读产品库。Linux将该脚本只读挂至上述镜像执行。没有新产品采用结论。
