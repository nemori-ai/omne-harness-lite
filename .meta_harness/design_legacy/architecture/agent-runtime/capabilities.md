# Agent 运行时能力地图

| 能力身份及职责 | 精确契约 | 状态与扩展点 | 依赖/组合 | 提供者与状态 |
|---|---|---|---|---|
| `data.agent-runtime-identity`：SessionRef/AgentRef 共享含义 | [v1](../../spec/data/agent-runtime-identity/v1/contract.md)，新谱系候选 | 可传输值，无运行状态 | 被 live-agent/binding 消费 | [core-agent](../../providers/core-agent/README.md)，Schema 已有、分配器未实现 |
| `capability.live-agent`：活体占位、实例代际、工作许可和退出 | [v1](../../spec/capabilities/live-agent/v1/contract.md)，新谱系候选 | preparing→ready→closing→releasing→disposed；Factory 贡献 | [binding](../../spec/compositions/agent-session-binding/v1/contract.md) | [core-agent](../../providers/core-agent/README.md)，目标 AgentHost/Registry 未实现 |
| Session/Run 等相邻能力 | F 不拥有其契约 | 长期事实和业务执行分别独立 | binding 只规定 attachment 端口；后续 F→S/L | 后续纵线给精确提供者 |

三个对象保持正交：identity 是共享值；live-agent 是可替换活体资源能力；Session attachment 是跨能力交接。
Cordis Context/插件树负责组合，不能取得 Session/Run 的语义所有权。
