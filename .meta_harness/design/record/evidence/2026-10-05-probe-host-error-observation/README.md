# 宿主原始启动错误与真实完成观察

BASE `cdd05d1050dc9d7857f7eb3569d834ae4291c4d5`。使用现有真实 AssemblyLifetime、
startAssemblyWork、Cordis 4.0.4 与 StorageStartupFailure。运行坐标、环境输入散列和耗时见
[run](error-observation-probe.run.json)，驱动为 [probe](error-observation-probe.mjs)，
[实际输出](error-observation-probe.stdout)保留事件顺序和关闭报告。

两个受控行中，B setup 抛出原错误，A close 保持未完成。宿主代理已经持有同一个错误对象，
安全启动结果已经拒绝，而 closed 仍未完成。释放 A 后其 close 拒绝，最终报告同时保留 B setup
与 A close 两个失败。只在 closed 后观察错误的负控在释放前仍不可读。
代理没有执行额外 setup/close；实际资源由同一个 lifetime 逆序收场。

首次运行在最后清理误调用不存在的 Context.dispose，原驱动与 stderr 以 first 保留。
修正该调用后的首次成功以 initial-success 保留。最后一次只把模块路径改为相对仓库 cwd 解析，
重新运行通过，便于从仓库根执行 `node <本目录>/error-observation-probe.mjs`。
运行前需要构建精确 BASE 的 assembly-lifecycle 和 storage-sql 及依赖。

这是一个真实机制交错探针，安全错误投影由驱动模拟。它没有实现正式插件树、宿主装配、
独立工厂或网络服务，没有穷举并发或证明无条件进展。正式错误竞争、Fiber 快照、资源服务、
SQLite/TLS/Unix/CLI 仍由 T4 产品及独立验收负责。没有模型付费调用。
