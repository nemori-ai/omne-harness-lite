# Agent 实例：资源治理、与 Run/Session 的接口、live-agent v1 的影响判断

[提案索引](README.md) · [状态机与级联](lifecycles.md) · [Session](session.md) · [Run](run.md) · [Cordis 视角](cordis.md)

实例的语义权威是 [live-agent v1](../../../spec/capabilities/live-agent/v1/contract.md)，
附着与发布归 [agent-session-binding v1](../../../spec/compositions/agent-session-binding/v1/contract.md)，
驱动器作为实例驱动的边界归 [D-013](../../decisions/D-013-run-driver-cordis-boundary.md)。
本文件不改写它们，只回答本轮联合设计对实例侧新增的三件事：实例生灭属于资源治理、
实例与 Run/Session 只在两个点相接、live-agent v1 是否需要新版本。

## 1. 实例的生灭是资源与装配的治理

实例是一次 incarnation：一份固定的装配加上它占用的资源（Context、驱动器对象、订阅、
工作许可账目）。它的创建与销毁由三类理由触发，都不改 Session、Run 与到达账本：

| 理由 | 触发者 | live-agent v1 的关闭原因 |
|---|---|---|
| 资源：空闲回收、容量、进程关机 | 应用装配的资源政策与 AR | [AR-11](../../../spec/capabilities/live-agent/v1/contract.md) 的"显式退役" |
| 装配：换驱动器实现、换必要提供者、代际变化 | 提供者撤除流程 | "装配替换""依赖撤除" |
| 治理：附着资格、租户权限、定义授权失效；Session 归档/删除 | TG/AU 的撤销屏障；宿主对 archived 事实的反应 | "显式退役"（宿主发起）或"依赖撤除" |
| 预期外：崩溃、断电 | 无触发者 | 无关闭事实；Registry 重启从空重建（[AR-7](../../../spec/capabilities/live-agent/v1/contract.md)） |

资源政策（空闲宽限多长、是否预热、容量上限）是应用装配与 AR 提供者设计的内容，不是
Session 或 Run 语义（用户裁决 U-25）。

## 2. 两个相接点

- **调度者需要执行一个 Run 时**：先查该 Session 是否有 ready 实例；有则经受限 Handle
  把 Run 交给它的驱动器（新 epoch、新 WorkPermit，[AR-8](../../../spec/capabilities/live-agent/v1/contract.md)、
  [CB-09](../../../spec/compositions/agent-session-binding/v1/contract.md)）；没有才调用
  `agents.activate`，走 [AR-4～6](../../../spec/capabilities/live-agent/v1/contract.md) 的预留、
  附着、准备、发布。多数重取不需要新实例。
- **实例要退役而 Run 在执行时**：AR 的共享退出过程（[AR-12](../../../spec/capabilities/live-agent/v1/contract.md)
  步骤 1）通知驱动器，驱动器到安全边界提交 Yield（[RD-14](../../../spec/capabilities/run-driver/v1/contract.md)），
  Run 状态不变、占位派生保留；静止（[CB-10](../../../spec/compositions/agent-session-binding/v1/contract.md)）
  后释放资源与附着。Run 之后是否续接回到调度者的铃。

运行中的三层关系：实例对 Run 是执行权租约（epoch 加 WorkPermit，非耐久）；驱动器对
实例与各能力是调用（经实例 Context 取装配结果与能力服务，方向永远是驱动器调能力）；
宿主对实例是经句柄调用（调度者与控制入口持句柄，Run 不持句柄）。租约那一层是不变量
的保护点（[R-2](invariants.md#run)、[L-1](invariants.md#关系与级联)），调用关系本身不保护
任何不变量，所以实例生灭可以完全交给资源治理。

## 3. 崩溃与重启

Registry 不耐久，重启从空重建（[AR-7](../../../spec/capabilities/live-agent/v1/contract.md)、
[AR-17](../../../spec/capabilities/live-agent/v1/contract.md) 的通知也不是耐久凭据）。恢复不
需要任何实例事实（[A-4](invariants.md#agent-实例)）：每个非终态 Run 的"执行者为空"由
"epoch 未被封闭但无实例持有该许可"派生，调度者在裁决扫描完成后按
[session.md §7](session.md#7-恢复顺序persistence-设计的输入) 的顺序重取。旧实例留下的
资源按残留处理，不能靠它判断 Run 状态。

## 4. live-agent v1 的影响判断

逐条核对本轮新增的义务是否已被 v1 覆盖：

| 本轮义务 | v1 条款 | 判断 |
|---|---|---|
| 实例可以 ready 而没有活动 Run；一个实例先后执行多个 Run | [AR-8/9](../../../spec/capabilities/live-agent/v1/contract.md)：工作许可按业务边界发行，实例不绑定单次工作 | 已覆盖；架构页已写明 |
| 退役时驱动器 Yield、Run 状态不变 | [AR-12](../../../spec/capabilities/live-agent/v1/contract.md) 步骤 1"处理当前工作到允许的停止或移交位置" | 已由 D-013 映射；Yield 是 Run 事实，不是 v1 的对象 |
| Session 归档后关闭空闲实例 | [AR-11](../../../spec/capabilities/live-agent/v1/contract.md) 关闭原因至少区分五类 | "显式退役"可承载；不需要新原因，但提供者设计要把归档写成宿主发起的显式退役并记依据 |
| 资格失效封闭准入而不 cancel | [AR-16](../../../spec/capabilities/live-agent/v1/contract.md)、[CB-06](../../../spec/compositions/agent-session-binding/v1/contract.md) | 已覆盖 |
| 通知不耐久、恢复不依赖实例事实 | [AR-17](../../../spec/capabilities/live-agent/v1/contract.md) | 已覆盖，与 A-4 一致 |
| 调度者先找 ready 实例再激活 | v1 未规定"谁激活"，只规定 activate 的语义 | 属于组合与提供者设计，不改 v1 |
| 多进程下旧 epoch 持有者的活性 | v1 明言未规定 | 保持缺口，不在本轮 |

结论：live-agent v1 不需要新版本。本轮对实例侧的全部要求由组合契约（三条关系与级联）
和 `packages/core/agent` 的提供者设计承载。

## 5. 对提供者设计的要求（`packages/core/agent/design.md` 修订输入）

- 增加调度者到 `activate`/`admit` 的消费关系：调度者是受信宿主服务，持受限 Handle。
- 退役流程与驱动器的 `requestRetire` / `awaitQuiescent` / `releaseResources` 端口沿 D-013；
  静止判据引用 [A-3](invariants.md#agent-实例)。
- 资源政策的挂点：空闲判定读 Run 的"执行者为空且无可干之事"，不读驱动器私有状态；
  回收即显式退役。
- 对 Session `lifecycle_changed{archived / deleted}` 广播的反应：关闭该 Session 的空闲实例
  （形状 3，幂等）。
- 崩溃后 Registry 从空重建；不提供任何"恢复实例"的入口。
