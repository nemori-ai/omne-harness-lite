# Core Agent 提供者设计

- 对象：`packages/core/agent`；`f98ac926` 的当前设计把定向 DSH agent/scope fork 作为最小提供者施工输入，协议来源映射到 `cd16f1`
- 采用候选：新谱系 `data.agent-runtime-identity@1`、`capability.live-agent@1`、`composition.agent-session-binding@1`
- 分层状态：legacy 设计曾被接受；新坐标未接受；provider 尚未实现/验证完整 AR/CB

## 实现路径与来源

复用官方 Cordis `4.0.2`，定向维护 DSH scope/agent 原语，在项目侧实现 AgentHost、Registry、私有实例插件及窄协议。
来源依据见 [研究](../../research/dsh-cordis-dynamic/README.md)；不导入完整 DSH Harness，也不把上游事件/清理语义当产品保证。

## 能力到 Cordis 的投影

| 契约责任 | 插件/服务/贡献 | 源码与状态 | 符合性缺口 |
|---|---|---|---|
| ARI 分配、SessionRef→活体占位 | 一个应用部署唯一 `AgentHost` | 目标设计；当前未实现 | 持久唯一 incarnation/启动命名空间与单协调权威测试 |
| AR-1～AR-17 Registry 表面 | `AgentRegistryPlugin` 提供受限 `agents` 服务；私有 `AgentInstancePlugin` | 候选 `protocols.ts` 起点 | activate/admit/settle/close 与失败诊断未交付 |
| Factory 动态选择 | 向 Host 注册精确 factoryKey/scope/version 的受管贡献 | 目标接口；不另建全局 Factory 服务 | 重复键、旧 disposer、撤除竞争验证 |
| CB-01～CB-14 组合 | Host 门 + Session attachment/RuntimeAccess/Factory/Resource 窄端口 | provider 组合设计 | Session/IAM provider 未实现，共同撤销屏障无实测 |

独立能力维度对应独立 Registry/实例插件边界；identity 数据本身不成为插件。binding 的共同提交由 Host 组合边界实现，不造第四个转发服务。

## 依赖、Context、事件与绑定

| 依赖 | 解析和范围 | 工作绑定 | 缺席/撤除 |
|---|---|---|---|
| 当前访问验证 | `RuntimeAccess` 窄能力，按实际操作进入共同门 | 允许只覆盖该提交 | unavailable 默认拒绝；旧允许不复用 |
| Session attachment | `SessionAttachment` 由 Session provider 注册 | 精确 registration/generation + AgentRef | revoke 关准入；release unknown 保留责任 |
| Factory/driver | scope 内受管贡献，activate 明确选择 | 每次实例/工作固定实际 binding | 先阻止新使用并排空原使用者，再卸载 |
| admission/diagnostics | Registry 插件 required inject 的基础能力 | 实际 host/mount generation | provider 丢失封闭受影响准入，不复活旧实例 |

`activated`/`disposed` 是带精确 AgentRef 的进程内已提交事实通知，不是耐久日志或授权。Context 可达性和 initiator 只提供组合/归因，均不得绕过操作门。

## 状态、并发与失败映射

Host 是 SessionRef→记录、发号与账目的写权威。activate 首次提交预留 preparing；门外异步准备；同一门内复核 host/mount/registration/generation/权限/attachment/资源后 ready。
关闭共享同一退出过程，状态依次 `closing→releasing→disposed`；资源/工作/attachment 未确认释放时保持占位和 blocked/unknown，不恢复整表快照删除别人的新贡献。

每个 WorkPermit 绑定 AgentRef、业务执行权和确切依赖；settle 只结算真实后代。旧句柄、旧 disposer 和晚到结果只作用于原代际，外部效果仍交给原工作权威。

## 成对装载与撤除

| 资源/贡献 | 拥有者及可用点 | 部分失败 | 撤除与保留 |
|---|---|---|---|
| Registry 插件与 Host mount | 应用装配；required 依赖满足后 provide | 不发布服务或保留可诊断失败 | 先封闭所有新准入，等待实例收口，再释放 mount |
| Factory binding | 注册插件；登记成功后可被精确选择 | 原 registration 自行收口 | retire 关新 activate，等待 preparing/ready 使用者，旧 disposer 不碰新绑定 |
| 私有实例资源/attachment/driver | 稳定 runtime owner；共同发布后业务可用 | 预先登记回收，晚到资源归原尝试 | 静止、移交、反向依赖释放、attachment release，最后撤占位 |

## 实施缺口与消费者影响

当前默认入口尚无完整 `createAgentHost`/Registry 行为；Session link、IAM guard、driver quiescence 和真实 resource cleanup 也未交付。
因此本设计可供后续实现和 S/L 的接口消费，但不能作为产品组合已验收的证据。实现变化必须保持新谱系精确条款和旧代际隔离。
