# governance-center-client 提供者

- kind：provider
- 修订：2026-09-24 r1，独立评审无阻断，D-038限定采用；首个受限增量已实现。
- 源码位置：`packages/frontend/governance-center-client`（首个受限增量已实现）。
- 责任：治理中心客户端传输的首个增量，仅公开 health；未来可供 CLI/TUI/Desktop 消费。没有登录存储、治理权限、会话据点或新的领域能力。
- 输入：`composition.governance-center-entry/v1` S-18/S-27/S-36、`composition.governance-center-entry-https-json/v1` S-4/S-5/S-9/S-15/S-17/S-18；两份版本由 D-028/D-029 接受并冻结，状态以 catalog 为准；证书信任沿 D-029。

## 分层状态

- 语义接受：上述已有协议的客户端一侧义务；没有新增客户端状态或命令契约接受。
- 可实施：[D-038](../../../../record/decisions/governance-health-client-adoption/README.md)接受，限于无秘密公开 health、信任核验与运输故障分类。不能据此实施登录/组织治理或本地凭据文件。
- 绑定：6条，仅登记本次实际测试覆盖的公开传输义务；完整CLI仍未实现。
- 实际验证：47项测试、两真实中心只读联调及Linux打包冒烟通过；精确范围与限制见 [verification](verification.md)。

| 问题 | 入口 |
|---|---|
| 公开操作、资源、故障、取消与候选比较 | [设计](design.md) |
| 已运行与待验证 | [验证](verification.md) |
| 条款绑定 | [bindings](bindings.yaml) |

采用与评审记录归 [CLI-TUI 提案](../../../../record/proposals/cli-tui/README.md)，采用归D-038，不在本节点重复完整交付面的领域定义。

2026-09-25：[D045](../../../../record/decisions/governance-protocol-client-adoption/README.md)在独立评审后接受[v2无状态业务协议增量](v2-design.md)。此增量待实现验证；D038 health旧证据不自动覆盖业务、本地状态或CLI。

D045增量已实现：exchangeGovernance与health共享运输、按各自协议解码；90项测试及macOS/Linux真实中心组合冒烟通过，见[实际证据](../../../../record/evidence/2026-09-25-tests-governance-protocol-client/README.md)。仍无本地登录保存和正式CLI。
