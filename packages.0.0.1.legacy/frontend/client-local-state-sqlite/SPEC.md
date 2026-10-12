# SQLite 本地状态提供者

本包实现公共 client-local-state。纯根导出 openClientLocalState 及本提供者打开类型/错误。
工厂显式接受 storage 依赖；`./cordis` 提供绑定，根源码/声明/运行闭包不加载内核。

共享业务与公开形状归[公共承诺](../../core/client-local-state/SPEC.md)，本页拥有具体提供者的资源、绑定和实际关闭责任。持续验证资源由实际接口及应用拥有者维护，不从包存在推断全部组合通过。

目录/文件私有检查、exclusive creation、原SQLite表与字段、full耐久、5秒受限打开等待
及错误分类保持。仅创建文件的一方初始化其身份，不因读到损坏自动重建。
工厂返回后，本实例拥有存储与目录句柄；close等待完整工作再关闭它们。
打开失败时清理实际拥有部分；打开与清理双失败保留 AggregateError，不吞掉任一失败。
单独绑定的装配者先结束消费者再撤依赖；管理装配沿已采用的逆序责任协议。

## 私有策略与存储责任

`state-data.ts` 唯一维护 raw Row 和 inspect/replace 记录端口。`state-sql.ts` 在原 read 或 atomic→mutate 回调内绑定实际存储，维护原表结构与独占创建者 initialize。端口不自行提交、缓存记录、修复布局或转换异常。

`store.ts` 拥有原布局解码、实例 token、CAS 优先级与准入/收场规则。一次读取的 catalog 与 rows 来自同一快照。replace 暂存完整原行，installed 仍须等待真实提交与原目录同步。提交确认或同步失败保持 unconfirmed。打开失败由 open 清理未交付资源；交付后只有本实例 close 调用拥有的 storage.close。

close同步停止准入并等待完整jobs，包括目录同步。存储与目录关闭分别记录结果，两者同时失败时仍须保留两项失败，不能让后执行的清理覆盖前一项失败。当前实现的双失败覆盖见[现状偏离](README_ZH.md#关闭失败的现状偏离)，不是应保持的规范。打开及清理双失败继续保留AggregateError次序。

## 独立和管理绑定

/cordis的clientLocalStatePlugin和managedClientLocalStatePlugin分别使用client-local-state-sqlite及client-local-state-sqlite-managed限定name。两者共用原严格directory配置和纯工厂，必需clientStateStorage；管理版另需assemblyLifetime并先同步登记。缺端口不回退独立模式。交出的数据库由本实例独占close，工厂桥不得代关或复用。公共工厂及独立、管理绑定的行为与资源协议不因信息迁移改变。
