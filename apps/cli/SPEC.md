# 治理 CLI 装配承诺

本页迁入已采用的应用集成责任。文件输入、动作、报告、退出码及终端原行为继续受
[CQ1/CQ2 和保持清单](../../.meta_harness/design/architecture/identity-integration/preservation.md)约束。
跨模块采用依据归 [CLI 生命周期修正](../../.meta_harness/design/architecture/identity-integration/cli-lifecycle.md)。

应用以同一个 assembly-lifecycle 协调器按 storage 工厂、CLS、HTTPS transport、CG 装载。
每行必须同步登记，ready 成功且 fiber ACTIVE 后才能向下一行开放。SQL 桥选择 SQLite full，
不运行中心迁移。交给 CLS 的数据库只由 CLS 关闭；控制代码不选择提供者。

createClientAssembly 在任何资源副作用前返回私有句柄。requestStop 同步停止准入，重复调用幂等。
clientStopped 只观察实际 CG 关闭成功，或在停止屏障后确认本代未分配 CG 的合法前缀。
公开前 setup 失败不能隐藏已分配 CG；具名观察资源在分配前同步接管原关闭尝试。
close 抛错或拒绝必须报告 client-close-failed 和70，保留原报告、借入依赖及未完成的 closed。
不得以回调报错、服务不可见、超时或自然进程退出代替静止证明。

CG 实际结束后，TUI 先等待输入帧及输出完成，再实际尝试终端恢复。
恢复结束后才放行 CLS 行的释放门；恢复抛错记录 input-restore-failed，仍允许后续存储收尾。
恢复或输入输出永不结束时，释放门不放行。CLS 关闭失败记录 state-close-failed，不能撤销已发生的恢复。
无 CG 的启动失败同样保留已分配 CLS 的表示门。资源尚未登记和分配时不虚构资源关闭责任。

closed 保留协调器报告及 fiber/端口撤除错误。正常本地打开失败保持原安全分类；
打开与清理双失败仍报告 internal-defect。所有诊断只包含稳定安全代码，不回显凭据或原始错误。

验证必须包含实际 SQLite/TLS/CLI、异常启动前缀、在途与迟到结果、取消、关闭故障和恢复次序。
既有有限模型、必要 PTY 与完整 GUI/IME 验收的各自范围保持，不互相替代。
