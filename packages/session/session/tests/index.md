# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、替身、运行方式与当前缺口
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的运行时导出
- [conformance.spec.ts](conformance.spec.ts)：事务套件经四个面，内存替身对
- [conformance-sql.spec.ts](conformance-sql.spec.ts)：事务套件经四个面，真实 SQL 提供者对（慢层）
- [access.spec.ts](access.spec.ts)：一次访问裁定、失败分支、调用方类与另一租户
- [pipeline.spec.ts](pipeline.spec.ts)：命令处理器流水线
- [construction.spec.ts](construction.spec.ts)：启动条件与配置核对
- [advance.spec.ts](advance.spec.ts)：S1、C2 开 Run、会话槽引用、S4、S3
- [complexity.spec.ts](complexity.spec.ts)：SS-02 确定性计数
- [measure.spec.ts](measure.spec.ts)：测量事件
- [control.spec.ts](control.spec.ts)：控制传播（SC-02 至 SC-08），夹具为 [fixtures/control-fixture.ts](fixtures/control-fixture.ts)：本地取消传播原操作与原执行，后继 Run 不接原取消；单调用控制保持原范围，原关联不足时不发送；受理不结清责任，未知先查询原身份；离开传播的控制不再重放，重复通知不绕过间隔与上限，关闭停止发送，在途发送只保留一个任务；外部唤醒、启动与周期扫描找回已保存的控制，未提交的取消不传播；租户间控制独立，主体失败不调用 Agent
- [fixtures/](fixtures/index.md)：替身装配与真实 SQL 装配
