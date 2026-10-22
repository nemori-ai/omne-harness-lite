# Session 能力组

## 责任与范围

本组拥有会话的业务治理与耐久事实：会话身份、会话日志、Run 与执行尝试的治理事实、会话模式与设置，以及判断未结工作的依据。Session 不是第四个 runtime。Agent、Model、Tool 的执行生命周期归各自的 runtime；Session 认识这些邻域，邻域不认识 Session。全组设计是候选，技术接受、实现与提供者分别判断。系统级的五个锚点与六个邻域的角色见[会话与工作](../../docs/architecture/runtime/session-and-run.md#总前提)。

## 成员与依赖

| 成员 | 责任 |
| --- | --- |
| [session-contract](session-contract/README.md) | 四个调用方面、构造依赖端口与出站端口的接口，事件目录，领域服务与归约的纯函数签名，`session.*` 块声明。不依赖任何邻域契约，也不依赖 Cordis |
| [session-cordis-contract](session-cordis-contract/README.md) | 唯一 Cordis 服务定义：四个面挂同一个服务键，调用方类，出站端口的服务键与事件 |
| [session](session/README.md) | 无 Cordis 的治理机制：命令处理、归约、投影、受理流水线拓展点编排、协调器与调度器的决策算法、缓存与策略对象 |
| [session-cordis](session-cordis/README.md) | Cordis 服务实现：现取时钟、事务、身份与出站端口的代理，通知订阅，扫描者单实例绑定。计时逻辑在 `session` 的调度器 |
| [session-adapters](session-adapters/README.md) | 与六个邻域以及身份、空闲来源相接的适配插件，是组内唯一导入邻域契约的成员 |
| [session-storage-sql](session-storage-sql/README.md) | 事务端口的 SQL 实现：迁移片段、存储参加者模块、权威表与派生索引、读路径与符合性套件 |

依赖方向、落位判据与 Cordis 落位见[组架构](docs/architecture.md)。

## 关键协作

调用方从纯契约进入，按自己的角色取对应的面。应用装配者选择实现与提供者，Cordis 插件只依赖唯一服务定义。Session 与邻域之间的协作全部经邻域的公开契约，由 `session-adapters` 承接；跨成员与跨邻域的流程从[协作入口](docs/key-flows.md)进入，各读者的起点见[按读者选择阅读路径](docs/key-flows.md#按读者选择阅读路径)。

## 组合验证

源入口与安装闭包分别核对。受理同提交、唯一推进、终态不可反转、日志提交后再确认、归档后的作用域释放和故障恢复，按[公共规格](session-contract/SPEC.md)与真实邻域协调者一起验证；包骨架与契约测试都不证明这些性质。跨能力的兑现义务见 [SW-M01](session/docs/architecture/mechanisms.md#sw-m01-技术兑现义务)。

## 维护

公开承诺、构造机制、框架装配、邻域适配与存储介质分别在各自成员维护。新增或迁移成员时，同步[包组织](../../docs/package-organization.md)、实际消费者与文档登记。具名个人维护者仍由负责人指定。
