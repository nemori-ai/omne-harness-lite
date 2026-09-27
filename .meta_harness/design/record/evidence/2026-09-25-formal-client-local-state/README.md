# 客户端本地比较替换有限模型

2026-09-25；TLC 1.7.4发行jar（TLC 2.19），SHA256 936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88；eclipse-temurin:25-jre，容器镜像ID f379f3a12f81844d554a11a3bdfc532aab0efdd4f3d49966f4d22bcdf49ccc9b，单worker，无外网。

r2：945 generated /437 distinct、队列0、exit0；TypeOK、NoStaleOverwrite、NoForeignSnapshot、NoFalseNoChange、EventuallyDone通过。三负控均exit12，分别违反NoStaleOverwrite（拆比较/写）、NoForeignSnapshot（忽略存储代际）、NoFalseNoChange（已写说没写）。模型hash99b2140d38d55dd7fcf1e3a056e7fb036564e6c665b607a7d94f8b49070d5336；四运行输入相同。

r1仍保留：240distinct，提交与确认合并，不用于r2关于分阶段的声明。r2分开Read、RemoteReturn、Finalize、Report，允许已写/未写都unconfirmed；Reset一次外部存储重建。有限两个调用，不覆盖operationId恢复归因、字段/秘密过滤、OS权限、真实SQL/fsync或网络真实进展。EventuallyDone依赖公平调度和有限脚本阶段可结束，不能外推整次CLI/TUI必定完成。

另附本地节点复用审查触发的SQLite初始化资源修复验证：3个真实DatabaseSync故障测试与原38符合性共41通过。PRAGMA失败时未登记句柄关闭，失败读句柄不占池名额。源码快照随后续提供者证据保存；此日志不是本地状态提供者已实现的证明。

命令：java -XX:+UseParallelGC -cp /tlc.jar tlc2.TLC -workers 1 -config <cfg> LocalChoice.tla，经docker --network none在每份输入目录执行；退出码汇总在r2/summary.json。输入与输出原文完整保存，非无条件形式化证明。
