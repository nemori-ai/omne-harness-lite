# D-050 · 治理CLI可搬运归档

2026-09-25，主线按用户完整治理CLI/TUI实施授权，采用[CLI-TUI提案§13](../../proposals/cli-tui/governance-client.md)候选A及[节点packaging](../../../realization/apps/cli/packaging.md)（本次SHA256 e86c9f7eb7f5c5fc8022bab2f9a74910372271a3a58e04c14383542ecced572f）。这是D049现有应用的开发分发工具，不新增领域对象/能力或修改冻结CQ1；不取代其文件输入边界。

独立architecture-reviewer在候选A/B/C比较、真实portable研究范围内无阻断。建议补充构建输入稳定前提，主线已纳入：同一dist/锁不能并发改写，发布前复核锁与工作区配置，发现变化不回滚他人修改。其余责任：固定工具链、pnpm生产闭包、只拥有暂存和指定新归档、完整文件后link独占发布、失败不覆盖既有目标；发布后stdout失败不删有效归档。BUILD_ID只为构建字节身份，--version纯说明，不读本地登录或中心。

依据[三平台原型研究](../../../../research/agent-harness-cli-tui/reports/2026-09-25-cli-portable-probe/README.md)：Mac arm64及Linux arm64/amd64、Node24.21.0的搬离仓库实际治理旅程通过。约57MiB/79包为已知成本，core/storage的runtime conformance依赖不因打包擅自裁掉；pnpm临时配置不迁移根工作区。Mac Intel未验，不冒称支持已验证。

只接受实施；最终脚本的子进程失败、坏软链、目标竞争、发布后输出失败及真实归档尚待测试。上传、可信分发渠道、全局安装、运行时下载和状态升级不在工具内；摘要不是来源认证。完整TUI、中心部署与每日备份/恢复仍未交付。本地归档不承诺新的掉电耐久。
