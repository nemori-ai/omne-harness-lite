# 现有客户端与真实 SQLite 的收尾反例

2026-10-04 接续[首轮机制取证](../2026-10-04-probe-identity-lifecycle/README.md)，
运行了现有 CG Client、本地状态 CLS、storage-sql 与真实 Cordis Service 的组合。
BASE 为 `588628544ab92bd542f24efa1801634eb6eee56e`。
精确源码/构建输入散列、环境和命令见 [run.json](run.json)。

[驱动](real-client-probe.mjs)在登录动作已发出、等待答复时撤除本地状态提供者。
它使用 [协调原型](lifetime-prototype.mjs)。运输答复由受控 Promise 给出，未连接真实 TLS 服务。

[实际结果](real-client-probe.stdout)：

- 管理关闭：远端 success，本地 installed，无缺陷。关闭后重新打开真实 SQLite，确认新登录已保存。
- 直接 close 负控：远端 success，本地 defect，缺陷阶段 settlement。重开后确认没有保存新登录。

探针未把凭据或完整状态写入输出。数据库只含本次虚构身份，完成后删除专用临时目录。
输出保存了业务终结和重开观察；没有把目录路径当作持久身份。

前两次试图把状态目录放在工作树的临时路径，原私有路径检查拒绝为 unsafe-path。
两次原输入和 stderr 分别以 `first`、`second` 保留。
改用根拥有、sticky 的 `/tmp` 下本进程新建的私有目录后运行通过，没有改变产品检查。

本次走了现有 Client 的内部测试构造入口，以控制运输交错。
它不是新公共工厂或正式 managed binding 的验收，也不覆盖真实 TLS、CLI/PTY、双入口、
AI/scrypt、升级 guard 和任意拓扑。新实现仍须按 D0 接受范围由独立 QA 验证。
