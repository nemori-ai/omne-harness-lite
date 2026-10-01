# D093 共享凭据脱敏纯构件：有限实施签收

2026-09-28。持续消费者为 `packages/model/model-request-runtime` 的纯政策／绑定／text/header/raw-error JSON 公开面，以及后续本纵线的生产接线。主调度依用户授予的实施与验收职责，在 [D-093](../../decisions/model-credential-policy-adoption/decision.md) 精确限定范围内，技术签收 [v5-redaction-design rev2](../../../realization/packages/model/model-request-runtime/v5-redaction-design.md) 的纯构件实施。设计 SHA `843b6101c7ff4f50cf8f4bd755a2617688e935cb0fdb9843cba97b4b90b1c6c2`，源码 `f6a5d1f2` 经 `7f580351` 合入，当前核对 HUB `4a268c91` 的四个专用源码／测试仍逐字相同。共享入口与双语文档后续同时加入选择构件，已核对原 literal 保留，实际集成回归通过。

签收的是显式配置校验及所有权、已知凭据全值与片段／有限描述的原输入区间并集、敏感头剥除和有序值形状、可脱敏 raw/error JSON 的所有键和 scalar，以及限定域内的错误、冻结与幂等处理。没有新增领域承诺、规范版本、状态或可观测性的全链保证。新增规范绑定 0；不能据本记录关闭完整 S-20、PH-G2 或跨 owner 义务。

[作者原报告](author-report.md)记录 233 runtime tests、两个独立构建制品、双语原样消费与四项编译行为负控；数字原型 Proxy 的原失败及修复后 Get trap 0 均保留。[独立原报告](independent-report.md)的 GI-1～GI-7 四态结果均为 **Pass**：独立区间／scalar／header oracle，15 新公开制品与 718 成员逐字核对、2,432 安装文件清单、两份双语 literal，以及三个实际 TS 变异编译成功后被同一未改 oracle 捕获。独立执行来源为 HEAD `7f580351`，不将旧档改写为当前 HUB 的新运行。

HUB 自身在 G6 集成上 build/typecheck/233 tests、P4 组合上 297 tests 与 44 本地 HTTPS，以及后续真实 auth／守卫组合的相应 build/type/rules/format/docs 检查均保留原始收据和输出，例如 [G6 测试](hub-checks/g6-hub/test/result.json)、[组合 HTTPS](hub-checks/p4-hub/https/result.json)及 [auth 测试](hub-checks/auth-hub/test/result.json)。首次 auth 扫描与依赖清理构建并行而暂缺 identity dist 的 exit1 保留；构建完成后的新运行 exit0，不把前次作为产品缺陷或抹去。主线 [逐成员审计](audits/REPORT.json)核对 435 独立 payload 与 437 archive members；初次审计把 `relative` 路径键误读为 `path` 的 setup failure 和原脚本保留，不算行为负控。

原始输入／源码／公开 tarballs／编译变异／环境／配置／PID 和 wait 退出码／完整 stdout-stderr／首次失败在 [作者档案（已外置）](../2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件) 与 [独立档案（已外置）](../2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件) 保全，共 1,088 与 437 成员；[SHA 清单](archive-hashes.json)已逐字核对，每成员读回。档案内 BRIEF 仅为实际测量的历史 provenance，不是新的设计正文或权威。原报告绝对路径只追溯原执行；恢复读取用两个原档的相对成员路径。第三方 node_modules 未入档，其版本／安装文件哈希和产品制品保留；执行时需按各原报告准备匹配的工具链。

独立六个有限资源场景包含 262,144 字符 text／已知凭据、64 有限描述、128 头名及 100,000 层 JSON。原报告明确 CPU 非独占，RSS 采样最大值不是无条件峰值，post-scenario maxRSS 不冒称进程最终高水位。未运行 TLA+/Alloy；配置值域、有限 oracle 与负控不能证明无界性能或同进程沙箱。

仍未覆盖：生产政策资格／同快照接线、raw.body 保真字节和附件、真实 TLS/send/stop/invoke→append/reopen 头链、必需状态／身份／费用与凭据 literal 碰撞 G4（含 V=503）、完整十三服务操作及 37 模型认证。新增付费 0。这是本纯构件的有限实施签收，人的总体交付接受未发生；后续复用仍须核对变更输入与实际装配。

归档维护检查另行保留：首次因收据目录缺少 README 的本地链接规则失败，随后改为链接实际收据。修正后的 design tree（internal，formal skip）与领域对象检查通过；完整 `make design-check` 在 realization 节点对账仍报告 10 项格式／产品修订坐标问题，相关九份输入均与 HUB `4a268c91` 逐字相同。本记录没有修补无关节点，也不宣称全仓设计检查通过。

## 2026-10-01 归档位置变更

原运行结论和原始摘要保持。成批源码、制品及依赖归档已按用户选择移出 Git，原文件逐 SHA-256 保全；取回位置、字节摘要及历史提交映射见[归档迁移记录](../2026-10-01-checks-model-runtime-repository-cleanup/README.md)。原清单中的路径是运行时地址，读取外置文件时按迁移清单恢复，不能把本机保全称为远程备份。
