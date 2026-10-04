# 历史正文实际组件检查（2026-09-27）

D-080 采用后实现受限 `./registry-history`。EIS 全组件 68 项测试通过（既有 45 项与本次 23 项），构建及 EIS/工具类型检查退出 0；静态工具 428 项测试通过，实际 27 包规则与 6 仓库规则扫描通过。源码、配置、失败及成功原始输出见[归档](eis-history-component-checks-run-1.tar.gz)和[逐文件 SHA](eis-history-component-checks-inputs.json)，每个归档成员均读回复核。provider key/private PEM 字面模式命中 0。

使用真实 account/login/OG/STT、公开本机发布与 MF4 读取验证：旧表绑定 v1，在发布 v2、移除旧持有、换新表及 SQLite 重开后仍读 v1；普通当前输入中没有重新塞入旧资产。错误租户或未知会话在 STT 拒绝，零 MF/source IO；原表 tuple 不在、重复、reuse 删除项及精确大整数不匹配均拒绝。严格 JSON、物理版本位置、元信息、缺版本损坏不回退新源，实际 schema 缺陷上抛。

另一真实 OG 实例与读取竞争：历史读已取得 SQLite atomic 并核当前有效资格时，撤销写者不能先取得锁；本次正文读取成功后写者完成撤销，之后的读取拒绝。计时与成员事实没有由固定成功回调替代，观测包装完整转发到真实实现。close 在此前空闲之后仍等待实际 MF IO；新 reader 显式绑定新 MF 实例，借用库和服务保留。

首轮测试工具试图 spy 冻结公开服务方法失败，原始输出保留；修正为调用计数并完整转发真实服务，未改零 IO 或恢复断言。诊断双输出同时失败不会替换本组件/普通当前输入结果或原缺陷；独立装配退化状态仍未实现，不能声称覆盖缺口必然可查。

MF tuple 是明确的组件 fixture，不冒充真实 AR 完整 fill 或报告 producer。AR4 的完整 E/O/filledBy/reuse、报告 session/run/attempt、原根、reload CAS 与旧报告恢复仍待真实组合；HI-G1/AR4-G3 未关闭。独立制品消费、完整宿主换代、OS 权限和跨库/shared/workspace/MCP 来源未验证。bindings 不自动新增，official 认证仍 0/37。
