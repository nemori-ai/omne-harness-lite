# 当前公开 Schema 定义闭包：原始证据归档

2026-09-29。保全 T26 独立验证者的原始结果，本归档者只核摘要，不重复宣称执行。源 commit 为 `19a3b968fa5effed845341612959621eaa8c4d1d`；前期静态审计源 `96ae5241b935f7735051f2ffae452a6d978c383c`。两点之间 core 无 diff，16 份触达规范资源 hash 与固定 Git 原件相等。原始 [RESULT](inputs/RESULT.md)、[结构化结果](inputs/RESULT.json)、[执行输出](inputs/execution.log)、[原命令](inputs/command.json)、[闭包](inputs/closure.json)、[完整原 SHA 清单](inputs/evidence-sha256.json)均保持字节；45 项长度及 SHA256 由本次归档逐项独立核对通过。

实际 exit0：MS7 的50公开定义、MR10的25公开定义分别用9份原字节规范资源完整编译；每图9次各移除一份资源，18例均实际 MissingRefError 且 missingSchema 精确等于被删URI；MR私有成员投影2入口也编译；7项测量自检通过。详情与限制以原结果为准。AE2/LC6仅静态审计，不冒实测。

这支持公开入口注册图的设计收窄，不表示生产注册、冷构建、当前制品、值关系、runtime或T29已完成。旧一次完整依赖defs遍历证明的是不同根集合，不要求继续保留无关资源。原测量脚本依赖其原worktree布局、固定commit及T26自有e66安装的公共schema-runtime；其编译器来源与字节在原审计中固定。本归档保留脚本而不改绝对路径/相对根为新“可运行版本”；重跑须在原命令布局复现依赖，不能直接在归档目录运行并覆盖证据。

`inputs/` 中报告、脚本、规范副本及失败尝试是不可改写的原始资料，不成为新的规格权威。采用由主线另记；实现仍须生产初始化/实际制品及新增源码影响复验。
