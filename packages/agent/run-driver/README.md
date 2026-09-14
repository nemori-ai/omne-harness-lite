# run-driver

Run 驱动器提供者：Factory 贡献、纯决策函数 `decide`、节点拓扑与驱动位置 reducer。
本目录目前只有[提供者设计](design.md)，尚未建立 workspace 成员；目标契约为
[run-driver v2](../../../spec/capabilities/run-driver/v2/contract.md)，Cordis 边界由
[D-013](../../../docs/decisions/D-013-run-driver-cordis-boundary.md) 接受，对 Session/Run 的
映射由 [D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 闭合。现有
[loop](../loop/README.md) 是 DSH 源切片的投影层基线，不是本包的实现。建立成员时按
[workspace 规范](../../../docs/maintenance/workspace.md)加入 `package.json` 与 `src/`。
