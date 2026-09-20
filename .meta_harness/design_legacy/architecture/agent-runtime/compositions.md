# Agent 运行时组合视图

| 场景 | 参与能力 | 整体责任与成立前提 | 实现/证据缺口 |
|---|---|---|---|
| 激活既有 Session | identity + live-agent + binding + Session/IAM provider | Registry 先预留；私有准备；共同屏障复核权限、attachment、Factory 和 owner 后发布 | Session/IAM provider 与共同门尚未实现 |
| 工作准入与稳定绑定 | live-agent + 业务 Run/工具能力 | 精确 AgentRef、工作许可、当前授权和业务执行权共同成立；工作固定实际绑定 | L/G/S 后续接口未取得 |
| 实例退出与 Session 保留 | live-agent + binding | 关准入、驱动静止、移交确认、按依赖释放、解除 attachment，最后释放占位 | 无真实资源/故障组合证据 |
| 提供者撤除 | live-agent + binding + Cordis 生命周期 | 先阻止新使用并协调使用者收口，再卸载；异常丢失保留失败/未知 | 仅语言无关义务和候选 provider 映射 |

重新 activate 不是恢复 Run，dispose 也不删除 Session 或撤销外部效果。跨进程协调、持久恢复与业务控制仍是明确缺口。
