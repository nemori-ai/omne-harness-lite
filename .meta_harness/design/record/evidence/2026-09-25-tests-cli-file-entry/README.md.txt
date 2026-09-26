# cli应用节点

- kind：assembly
- 交付面：[PF016](../../../product/PF-016-cli-tui-delivery-surface/README.md)（rev 7），本期治理CLI/TUI。
- 源码位置：`apps/cli`，D049文件输入增量已实现。
- 语义接受：CQ1 S1～10已由[D049](../../../record/decisions/governance-cli-file-entry-adoption/README.md)接受；消费CG2/CLS1及冻结CG1报告表示。
- 可实施：仅[governance.md](governance.md)的受保护文件CLI路径；全部命令、人读Preview/机器报告、单进程资源装配。没有秘密来源时tty-unsupported，不进入raw/2004。
- 绑定与验证：68项应用测试、两平台真实CLI子进程/PTY/管道验证通过；[verification](verification.md)及[bindings](bindings.yaml)按实际增量更新。详见[本次运行](../../../record/evidence/2026-09-25-tests-cli-file-entry/README.md)。提供者139测试独立保留，不当CLI测试。
- 待交付：TTY/交互密码、TUI、安装分发、部署升级与每日备份恢复。2004帧可信性仍为TTY候选的架构阻断，没有删去用户本期目标。

旧完整Agent形态的三进程/据点、斜杠命令与前端层次见[architecture.md](architecture.md)，均为后续候选；本期治理不要求先建据点或Agent工作会话。PF016 rev7是当前产品范围，产品不替代CQ1与D049接受依据。
