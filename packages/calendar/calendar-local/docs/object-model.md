# 对象模型

## 对象与关系

candidate 保管规范 snapshot、原材料和来源元数据；version 以原发布 operation 精确关联 candidate。pointer/generation 表达当前发布，operation/receipt 保管原结果，outbox 保管提交后反应。供应材料含 scope 下 opaque rawReference，不能作为可移植 authority 或 seed 身份。供应用 journal/probe 记录维护进度，不把 timer 状态当事实。

精确类型与 schema 见[定义索引](public-api.md)，本页不复制类型声明。

## 生命周期

SQL composition domain 与材料由本域适配器管理，底层连接/Worker 的最终释放由实际 SQL 提供者负责。provider 的 borrowed 只借用应用，owned 承担供应停止。runner 的 idle/running/stopped 与 inFlight、observerFailure 可观察；持久未完记录不随实例退出删除。
