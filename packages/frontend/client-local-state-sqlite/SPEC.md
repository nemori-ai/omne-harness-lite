# SQLite 本地状态提供者

本包实现公共 client-local-state。纯根导出 openClientLocalState 及本提供者打开类型/错误。
工厂显式接受 storage 依赖；`./cordis` 提供绑定，根源码/声明/运行闭包不加载内核。

本批迁入公共形状和集成承诺。精确业务源、采用依据和仍有效的模型义务见
[身份迁移保持清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
本页不替代尚未迁移的完整操作条款；N5/N6 接续剩余旧源及资源登记。

目录/文件私有检查、exclusive creation、原SQLite表与字段、full耐久、5秒受限打开等待
及错误分类保持。仅创建文件的一方初始化其身份，不因读到损坏自动重建。
工厂返回后，本实例拥有存储与目录句柄；close等待完整工作再关闭它们。
打开失败时清理实际拥有部分；打开与清理双失败保留 AggregateError，不吞掉任一失败。
单独绑定的装配者先结束消费者再撤依赖；管理装配沿已采用的逆序责任协议。

## 私有策略与存储责任

`state-data.ts` 唯一维护 raw Row 和 inspect/replace 记录端口。`state-sql.ts` 在原 read 或 atomic→mutate 回调内绑定实际存储，维护原表结构与独占创建者 initialize。端口不自行提交、缓存记录、修复布局或转换异常。

`store.ts` 拥有原布局解码、实例 token、CAS 优先级与准入/收场规则。一次读取的 catalog 与 rows 来自同一快照。replace 暂存完整原行，installed 仍须等待真实提交与原目录同步。提交确认或同步失败保持 unconfirmed。打开失败由 open 清理未交付资源；交付后只有本实例 close 调用拥有的 storage.close。

close 同步停止准入并等待完整 jobs，包括目录同步。其原 try storage.close / finally directory.close 双失败仍由 finally 传播目录失败，不新增 AggregateError。打开及清理双失败继续原 AggregateError 次序。
