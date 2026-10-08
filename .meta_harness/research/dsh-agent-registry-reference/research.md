# DSH AgentRegistry 提供哪种引用，谁拥有执行寿命

- 调查对象与日期：DSH `639ed015397290b3745d163aafe02ffee4aa3f84` 的 agent registry；2026-09-29。
- 消费者：模型调用引用与生命周期提案。
- 最近核对：本轮首读，固定 SHA 与三份来源哈希见清单。
- 当前结论：该 registry 是进程内活对象门面与 factory 委托，不是耐久终态库；调用者 ownerCtx、runtime parent、裸查询对象与销毁句柄明确分开。完整 factory 销毁实现未核，文档次序有冲突。本结论不构成 DSH Agent 采用决定。

## 问题与区分条件

本轮核对四件不同的事：一个 ID 如何找到活对象、factory 如何注册及接收调用者、谁拿到销毁能力、对象离开登记后还能从哪里读到结果。存在 Map、disposer 或 typert wire ID，不足以把这些责任合成一个“持久可恢复运行注册表”。

本文“事实”限定实际读取到的源码分支和文档声明；“推断”写出必要前提；“未核”不填为保证。实际只读三份指定原文与 GitHub 元数据，未检索 issue tracker 或第三方迁移报告，不对整个 DSH 项目声称没有其他实现。

## 证据入口

[E0](evidence.md#e0-固定源码取得与校验)固定字节来源；[E1](evidence.md#e1-服务门面与-typert-引用)门面与引用；[E2](evidence.md#e2-map-身份与-exact-entry-detach)身份/撤除；[E3](evidence.md#e3-factory-effect-与-caller-context)factory/所有权；[E4](evidence.md#e4-handle-dispose-与文档次序冲突)销毁声明；[E5](evidence.md#e5-live-only-查询与耐久边界)查询边界；[E6](evidence.md#e6-测试声明覆盖及未执行范围)测试强度。

## 当前结论

### C1 registry 门面委托创建与恢复，不在门面中驱动模型

**事实：**AgentRegistry 扩展 Cordis Service 并发布 `agents`；create/resume 先取得唯一 factory，再调用它的 createAgent/resume。factory 缺席时拒绝。README 同样把创建/驱动分给具体 driver。registry 本身还负责活对象索引与进程内 initiator 归因，不能把这个类概括成纯粹无状态代理。

**推断：**只安装 registry 不足以产生模型执行；接口面和具体执行提供者可分别阅读。这个分离是 DSH 代码事实，不自动给本项目划定能力边界。

- 适用范围：固定版本的 AgentRegistry 方法体及 README。
- 代价与不适用：factory 是单槽而非按模型/租户多提供者选择器；创建、恢复、持久加载是否成功仍由实际 factory 和依赖负责，接口转发不证明它们已兑现。
- 来源：[E1](evidence.md#e1-服务门面与-typert-引用)、[E3](evidence.md#e3-factory-effect-与-caller-context)。
- 最近核对：2026-09-29 / 639ed015。

### C2 typert 将 wire ID 解析为当前裸 Agent 或其 ctx，不传递销毁句柄

**事实：**typert 注入范围内注册 agent lookup 与 agent Context host；wire 字段为 agentId、类型为 SessionId。两条 resolve 分别调用 get(id) 和 get(id)?.ctx。get 仅返回 entry.agent。

**推断：**这是活引用解析，不是把运行对象序列化到线上，也不是持久结果查询。原 ID 没有活 entry 时 lookup 得不到对象；同一 ID 后来重新登记时解析可得到新的对象。拿到 agent.ctx 不等于拿到 AgentHandle.dispose；也不由此证明所有能力都不可间接取消。

- 适用范围：该注册贡献和测试写下的 resolve/撤除断言；未审计 typert 内部、RPC 或安全授权实现。
- 代价与不适用：进程重启或登记撤除后的解析不由此恢复；wire ID 的存在不提供租户授权、跨进程对象连续性或耐久终态。
- 来源：[E1](evidence.md#e1-服务门面与-typert-引用)、[E5](evidence.md#e5-live-only-查询与耐久边界)。
- 最近核对：2026-09-29 / 639ed015。

### C3 Map 使用 SessionId 作键，exact entry 与 parent 对象身份另有作用

**事实：**store 是 Map<SessionId, AgentEntry>。enter 要求 agent.id 等于 agent.session.id，拒绝已有同键，然后保存完整 entry。owner 是显式 Agent 对象；isOwnedBy 用对象相等检查这个 owner。detach 捕获原 entry，删除前再检查当前 Map 中仍是该 entry。

**推断：**“相同键”“同一个生命周期 entry”“同一个父 Agent 对象”不是一件事。调用者持有旧 detach 时不能据同一 ID 删除后来 replacement；旧 parent 的相同字符串 ID 也不使它等于新 parent 对象。源码没有在 enter 中证明 owner 本身此刻仍 live；注释里的 live-owner 前提不能升级为这里的动态检查。

- 适用范围：单个 registry 实例内源码身份判断；测试中 same-ID replacement 与 ownership 断言。
- 代价与不适用：对象相等只覆盖进程内引用；Map 的唯一键边界不是分布式互斥、持久判重或租户域设计。本代码选择一份活 Agent 与 Session 共用 ID，不成为本项目领域身份约束。
- 来源：[E2](evidence.md#e2-map-身份与-exact-entry-detach)。
- 最近核对：2026-09-29 / 639ed015。

### C4 enter 与 announce 分离，查询到 entry 不证明创建监听已完成

**事实：**enter 立即插入 Map；announce 再核 exact agent、避免重复宣告并串行等待 created listeners。创建监听中请求 detach 会延后到当前 announce 展开完成，确保该次监听看到同一 entry。register 以 effect 把 enter 与 announce 组合；失败时依其清理范围撤除。disposed 监听失败被逐个捕获/记录，返回 Promise 的拒绝有处理，但 emitDisposed 不等待这些监听完成。

**推断：**get 非空仅证明当前登记存在，不单独证明初始化完成、模型仍执行或资源已排空。创建副作用已经被先前监听看到时，后面监听失败不会抹去观察；配对 disposed 是通知，不等于外部效应回滚。

- 适用范围：registry 三个方法与 agent.spec 中串行、回滚和重入断言；Cordis effect 实际调度本轮未运行。
- 代价与不适用：慢/悬挂创建监听延迟注册完成；README 明说监听不得等待自身初始化所阻塞的 idle/disposal，可能形成等待环。disposed 通知完成不是全部资源停止证明。
- 来源：[E2](evidence.md#e2-map-身份与-exact-entry-detach)、[E6](evidence.md#e6-测试声明覆盖及未执行范围)。
- 最近核对：2026-09-29 / 639ed015。

### C5 factory 注册由 effect 承载，原 disposer 身份与调用者 tracing 分开处理

**事实：**setFactory 在 effect 中拒绝第二个 factory、解开已有 symbols.original 保存目标，清理时清空槽位，并直接返回 effect 给出的 disposer。create/resume 取访问时的 this.ctx 作为 ownerCtx，对保存目标重新 getTraceable，再以这个 receiver 调用并显式传 ownerCtx。plain factory 同样收到该参数。测试分别断言 caller fiber、parentAgent 参数独立、owner 卸载清槽与 traced Service receiver 正确。

**推断：**factory 注册 Context 与某次调用的 owner Context 可以不同；parentAgent 选项也不能代替 caller 的资源寿命。注释特别把 disposer 原函数身份用于 Cordis 组合清理次序，这一约束属于被读取版本的 DSH 与 Cordis 交互，不由名字“effect”便自动成立。

- 适用范围：源码调用关系及作者测试断言；没有执行 Cordis、没有核当前本项目安装版本的同等行为。
- 代价与不适用：把 disposer 包一层可能丢掉注释所依赖的 identity-nesting 次序；该后果此轮是作者说明，未做区分 probe。清 factory 槽不等于此方法自身枚举并停止所有活 Agent，后者落在 factory 实现责任。
- 来源：[E3](evidence.md#e3-factory-effect-与-caller-context)。
- 最近核对：2026-09-29 / 639ed015。

### C6 AgentHandle 的销毁能力不同于裸 Agent，但完整拆卸次序尚不能确定

**事实：**AgentHandle 显式包含 agent 与异步 dispose；接口注释/README 约定 consumer holder 和结构性 factory provider 拥有生命周期责任。get 返回裸 Agent，不返回该 handle。bare Agent 仍有 cancel 等控制面，故“无 dispose handle”不等于“完全不能停止工作”。

**声明冲突：**index.ts 接口注释列出停止/等待 loop、撤 Agent、撤 Session、最后清 scope；README implementation 段则列停止/排空、清 scope、撤 Agent、撤 Session。二者同属固定 commit。本轮所读 factory tests 返回的是 stub dispose，没有验证真实顺序或 provider 卸载排空。

- 适用范围：能力形状与作者生命周期声明；完整执行次序属于待核，不把任选一处当实现事实。
- 代价与不适用：仅 registry detach 不停止 loop、不删除持久日志，也不替 handle/factory 完成排空。ownerCtx 约定的真实执行需 factory 提供者证据。
- 来源：[E4](evidence.md#e4-handle-dispose-与文档次序冲突)、[E6](evidence.md#e6-测试声明覆盖及未执行范围)。
- 最近核对：2026-09-29 / 639ed015。

### C7 live-only get 不能区分未创建与已撤除，也不提供耐久终态

**事实：**get 只有 store.get(id)?.agent；detach 删除 entry。该类没有持久终态表、终态读操作、磁盘写或耐久 outcome 句柄。list/roots 也只枚举当前 Map。resume 委托 factory 读取持久 Session，不是 registry 自身从 Map 恢复。

**推断：**两个不同历史——从未登记、已登记并撤除——在 get 上同为 undefined，所以不能从这个结果单独判断“已完成”“执行丢失”或“可重发”。这是源码可构造的条件读数，不是本次运行过的反例。DSH 的 Session/loop 别处可能保存历史；本结论不声称整个项目没有持久结果。

- 适用范围：完整阅读指定 index.ts、包 README 与指定测试后，对 registry get/list/roots 的窄结论。
- 代价与不适用：停机后查终态、取原结果、查独立运行中请求或授权接续，均不能仅由这个 Map API 推出；引入外部结果源会带来另行核对的身份/生命周期一致性责任，本文不选择实现路线。
- 来源：[E5](evidence.md#e5-live-only-查询与耐久边界)。
- 最近核对：2026-09-29 / 639ed015。

## 支撑假设

| 假设/前提 | 若不成立，哪些结论受影响 | 本轮核对 |
| --- | --- | --- |
| 原文字节确属指定 SHA | 全部源码定位 | raw Git blob SHA-1 与固定ref contents API逐项匹配；commit API同SHA |
| Cordis访问服务时this.ctx保持调用者语境，effect清理具有注释所述身份规则 | C5 实際 owner/顺序行为 | 读取调用代码与测试断言；未执行Cordis、未查其实现 |
| 具体factory履行ownerCtx与handle生命周期契约 | C6完整停止/排空行为 | 未核factory实现，且文档顺序有冲突 |
| 运行只涉及同一registry实例中的JS对象 | C3对象身份推断 | 代码前提；不推广到跨进程或恢复对象 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响消费时点 | 所需产物/责任 |
| --- | --- | --- | --- |
| 完整factory拆卸顺序及provider共同所有权 | 同SHA具体factory源码和针对真实handle的顺序测试；必要时本地有限probe | 设计若依赖该顺序时 | 后续来源核对owner；本轮未执行 |
| 原disposer identity与wrapper确切差别 | 固定Cordis版本的实现/官方测试及小型次序反例 | 将此作为Cordis保证前 | Cordis研究/提供者owner |
| caller失去Context时已创建handle的实际行为 | 真实factory下创建后撤caller，观测stop/drain/unregister | 生命周期投影依赖前 | 后续有限执行证据 |
| 本项目Session/Run与独立模型调用如何承载这些性质 | 对照本项目正式需求、契约及设计；不是从DSH类图反推 | 正式设计接受前 | 主线设计owner；不属于本研究裁决 |

## 采用与后续核对

未采用、无架构选择。用户只准复用 Cordis，本研究不构成复用 DSH Agent 或改写本项目 Session/Run 模型的授权。本次入库复核见 E0；版本变动时按 E0 的固定 SHA 与各结论入口复核，不在下游复制第二份事实权威。
