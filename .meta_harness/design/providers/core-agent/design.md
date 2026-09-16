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

应用在同一协调权威内只创建一份 `AgentHost`；重复绑定拒绝 `authority_already_bound`，多个 Cordis Context 复用原 Host。Host 以完整 `SessionRef` 元组索引，`incarnationId` 采用跨重启不复用的分配依据；旧句柄不能跨恢复解析为新实例。这是 ARI-2/3 与 AR-4 的提供者责任，不能靠进程内单字符串键或计数器兑现。

## 依赖、Context、事件与绑定

| 依赖 | 解析和范围 | 工作绑定 | 缺席/撤除 |
|---|---|---|---|
| 当前访问验证 | `RuntimeAccess` 窄能力，按实际操作进入共同门 | 允许只覆盖该提交 | unavailable 默认拒绝；旧允许不复用 |
| Session attachment | `SessionAttachment` 由 Session provider 注册 | 精确 registration/generation + AgentRef | revoke 关准入；release unknown 保留责任 |
| Factory/driver | scope 内受管贡献，activate 明确选择 | 每次实例/工作固定实际 binding | 先阻止新使用并排空原使用者，再卸载 |
| admission/diagnostics | Registry 插件 required inject 的基础能力 | 实际 host/mount generation | provider 丢失封闭受影响准入，不复活旧实例 |

Registry、Factory 贡献及实例的受信 `apply` 捕获真实 `c.fiber`、本次 mount generation 和精确 registration；`ctx.plugin` 的 PromiseLike 返回值只用于 await/dispose，不用其 uid 或内部包装识别当前实例。最后的激活、工作与撤除门直接核对原 provider 的代次和真实存活：同 Fiber 再次 ACTIVE、同名服务重装或 consumer 仍 ACTIVE，都不能让旧闭包重新获得资格。注册管理能力只交受信装配/贡献者，旧撤回器只作用原 registration。

应用从唯一 AdmissionHost 向 AR 交付一份 `createUseIssuer("agent")` 发行能力；AR 不转交 issuer。AR 在真实资源 pin 与共同准入门内建立绑定原 AgentRef、Run epoch 和实际装配的 ExactUse，结算或具名接管后才解除；Session 的 `requiredUses` 引用该原使用关系，而不是凭可序列化的 binding 重新发行许可。

`activated`/`disposed` 是带精确 AgentRef 的进程内已提交事实通知，不是耐久日志或授权。Context 可达性和 initiator 只提供组合/归因，均不得绕过操作门。

## 激活审计耐久门

ready 发布和业务工作面可用是两个独立事实。AR 是激活操作的生命周期与准入 owner；S 提供 tenant 审计 stream 的耐久记录接口，保存 `agent.operation_recorded/1={agent,operationKind,phase,reason,relatedOperation}`。ready 提交后 AR 先保持工作面关闭，在门外等该激活记录耐久；之前不发放 WorkPermit。`activated` 只通知 ready 已成立，监听器的任何业务尝试仍须经工作门，不因收到通知而获准。

ready 提交时登记 `activated` 及其单调顺序号，退出提交时同样登记 `disposed`；门外分发器必须先分发已登记的 `activated` 再分发 `disposed`。通知不等审计回执：审计失败、晚到或并发 close 均不能让 `disposed` 越过 `activated`，也不能无限扣住退出通知。同步异常、异步拒绝和通知重入 close 均隔离，不回滚 ready。

审计耐久后，AR 只有在同一活动门重读实例仍为 ready 且所有其他准入事实仍有效时才开放工作面；审计在 closing/releasing/disposed 后完成不得重开实例。审计失败返回 `published_but_audit_unavailable`，保留可按原 attempt/AgentRef 查询的 publication、audit 与 exit 状态，关闭新工作并继续安全清理；重试查询/记录原尝试，不新建第二次激活。S 的日志不是活体恢复指令，审计不可用也不能阻止 close/release。

## 状态、并发与失败映射

Host 是 SessionRef→记录、发号与账目的写权威。activate 首次提交预留 preparing；门外异步准备；同一门内复核 host/mount/registration/generation/权限/attachment/资源后 ready。
关闭共享同一退出过程，状态依次 `closing→releasing→disposed`；资源/工作/attachment 未确认释放时保持占位和 blocked/unknown，不恢复整表快照删除别人的新贡献。

每个 WorkPermit 绑定 AgentRef、RunRef/epoch、业务执行权和整份实际装配。`checkWork` 在每个 Step/工具联合准入的同一活动 gate 核对原许可、Run epoch 和 ExactUse；`checkSettlement` 只在 closing 阶段允许 checkpoint、原已准入结果、停止或具名接管确认，releasing 后拒绝运行结果提交。settle 只在 WorkPermit/全部后代已结算或有具名接管证据时解除原 ExactUse；旧句柄、旧 disposer 和晚到结果只作用于原代际。

## 成对装载与撤除

| 资源/贡献 | 拥有者及可用点 | 部分失败 | 撤除与保留 |
|---|---|---|---|
| Registry 插件与 Host mount | 应用装配；required 依赖满足后 provide | 不发布服务或保留可诊断失败 | 先封闭所有新准入，等待实例收口，再释放 mount |
| Factory binding | 注册插件；登记成功后可被精确选择 | 原 registration 自行收口 | retire 关新 activate，等待 preparing/ready 使用者，旧 disposer 不碰新绑定 |
| 私有实例资源/attachment/driver | 稳定 runtime owner；共同 ready 发布且激活审计耐久后业务可用 | 预先登记回收，晚到资源归原尝试；审计失败关新工作 | 静止、移交、反向依赖释放、attachment release，最后撤占位 |

实例退出由同一个复合清理过程按 AR-12/CB-12 推进：先关新工作，持有 Run 时让 Run owner 耐久封闭原 epoch；待 TL 等独立 owner 确认结算或接管，再由 AR 解除工作使用，等驱动真实静止后按反向依赖释放资源与 attachment。失败项保留原资源身份、清理函数、错误与安全重试条件；超时、Context disposed 或本地表空都不释放占位。宿主替换须先收口原账目并完成 CC-06 同水位恢复，不建立并行的第二活体权威。

## F↔L/S 已确定交接

| 交接 | 已确定语义 | 尚未完成的提供者映射 |
|---|---|---|
| F↔L 激活与 Run 交付 | L 的 Session scheduler 是唯一发起者；有 ready 实例时先复用，无实例才 activate，再用新 epoch/WorkPermit 交付 Run | L 后续的新谱系 `capability.session@1`、`capability.run@1`、scheduler/driver 提供者坐标与实现待固定 |
| F↔L 实例退役 | 实例 driver 兑现 `requestRetire`、Yield、WorkPermit/ExactUse 结算与 `awaitQuiescent`；这些是分别的事实，超时/表空不等于真实静止 | L 的 Run driver 实现、真实工具/任务树结算及故障验证待完成 |
| F↔L 空闲与 Session 终态 | idle 必须读 Run 权威（无执行者且无可做事）。Session archived/deleted 耐久事实广播触发关闭空闲实例，门内重读真实状态，扫描修复丢失广播；崩溃后 Registry 从空表重建，不恢复活体 | L/S 的 Run 读面、Session 事实广播/扫描和裁决顺序待实现 |
| F↔S 激活审计 | F 保持准入与原 attempt 查询；S 耐久写入操作记录，返回 durable/unavailable 真实结果 | S 的新谱系耐久记录坐标、幂等写入与可查询 attempt 端口待固定 |

上述是 D-013/D-014 已确定交界在新谱系中的 provenance，不把已退役的 `capability.session-run` 复活为依赖。实现缺失只表示提供者尚未兑现，不重新打开这些已确定语义。

## 实施缺口与消费者影响

当前默认入口尚无完整 `createAgentHost`/Registry 行为；审计耐久门、Session link、IAM guard、scheduler/driver quiescence 和真实 resource cleanup 也未交付。
因此本设计可供后续实现和 S/L 的接口消费，但不能作为产品组合已验收的证据。实现变化必须保持新谱系精确条款和旧代际隔离。
