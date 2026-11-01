# Agent 的具体 Cordis 装配

状态：完整 Cordis 宿主插件的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受，尚未实现。根入口已实现独立 `createLocalModelReceiver` 工厂及宿主状态创建；`./cordis` 仍为空导出。服务定义与目录插件 `agentInstancesPlugin` 已在 agent-cordis-contract 实现。接收组件的实际范围见 [SPEC](../SPEC.md#独立结果接收组件)，不能据此声明完整 reserve、实例启动或生产 Model 解析器已实现。

唯一 Service、键、增补、事件、登记协议及 IC-1 至 IC-19 的符合性映射消费 [Cordis 定义](../../agent-cordis-contract/docs/cordis.md)，不得复制或重声明。本页只写本插件特有的装配：插件与入口、静态依赖与局部依赖、配置、装载、停止准入与撤除、候选发行行、实例作用域和租户。

## 插件与入口

插件 `agentHostPlugin` 由 `@omne-harness/agent-host-local/cordis` 导出，名称是 `agent-host`。它用 `@omne-harness/kernel-basis/cordis` 的 `definePlugin` 构造。导出名是设计中的名称，实现时以实际源码为准。

插件在一个插件体内逐个构造四个服务面：`agentInstanceHost`、`agentPublicationAuthority`、`agentExecutionRecovery` 和 `agentInstanceProvision`。每个子类 `extends` 定义入口的抽象类，不另写键，四个键登记在这一条 fiber 上（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。选择一条 fiber 的理由是：四个服务面共用宿主进程内的同一份状态，即预约表、槽表、宿主持有的 runtime 和 `route` 的路由。它们必须一起出现、一起撤除。如果分成几条 fiber，一个服务面撤除后另一个仍可能被调用，并读到已经失效的状态。目录 `agentInstances` 不是本插件的服务面。目录是定义入口导出的具体注册表，以独立的目录插件 `agent-instances` 装载。本包不拥有 Model 与 Tool 的运行寿命。结果接收方由宿主持有，独立于这些 Agent 实例；实例贡献 fiber 的撤除不销毁接收方及其待办状态。

## 注入、配置与生命周期

Agent 核心的原位置解释、Journal 交接和材料保管服务保持可独立取得。独立装配注入执行记录提供者；有外部协调者的装配注入具备共同受理与终结保证的 Journal 适配器。宿主插件不直接 inject 外部协调者自己定义的服务。这不包括 Agent 定义的端口 `agentMessageHandoff`：它由外部协调者或独立调用方的提供者实现，宿主以静态 inject 取得。模型 `modelRuntime` 与请求准备 `agentRequests` 也以静态 inject 取得。只有六项局部必需依赖经阶段适配器取得：工具、扩展、卡片、动作准入、材料和具名读取，见下文“局部依赖与可选依赖”。缺席时保存原位置或按已定缺失策略收束，不把不存在的能力伪装为实现。计划换代先经 Journal.detach 保存 checkpoint 并撤旧 attachment；外部协调者把此交接与自己的换代资格排序相接；非计划卸载停止新动作，当前恢复者依法认回。调用方退出不传播Model/Tool取消。

### 接收组件的宿主寿命

独立接收组件由宿主在 Agent 实例之外装配和持有，不新增 Cordis 服务键。装配者显式传入共同提供者、权威核验依赖、账目出站、容量与宿主状态，不能分别注入来自不同权威状态的接收视图。依赖和逐次接收行为归 [SPEC](../SPEC.md#独立结果接收组件) 与 [J02](../../agent-contract/SPEC.md#结果接收)。

Agent 实例 dispose、detach 或重建不清空接收状态。接收组件重装配继续使用同一宿主状态，以 recover 恢复 received 账目待办。宿主驱动可重试待办，保留 blocked 待办及其诊断，不因重装配自动重发。停止组件的本次驱动不取消已受理的共同提交，也不删除已保存的材料。内存状态不承诺进程重启恢复。耐久宿主另须保存接收与出站业务事实；实际 Promise 和驱动代仅用于本进程的任务控制。

完整插件仍须由其实现接入这个组件；本节不声称 reserve、实例启动或生产 Model 的接收方解析器已实现。

### 静态依赖

每个实际插件的inject使用定义键常量数组字面量。宿主插件的静态必需依赖是工厂依赖表中标为“必需”的十项：

```ts
import {
  agentAccessCheckKey, agentAdoptionsKey, agentClockKey, agentConditionsKey, agentJournalKey,
  agentMessageHandoffKey, agentModelContextKey, agentModelSelectionKey, agentRequestsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { definePlugin } from '@omne-harness/kernel-basis/cordis'

export const agentHostPlugin = definePlugin({
  name: 'agent-host',
  inject: [
    agentAccessCheckKey, agentJournalKey, agentAdoptionsKey, agentConditionsKey, agentRequestsKey,
    agentModelSelectionKey, agentModelContextKey, agentMessageHandoffKey, agentClockKey, modelRuntimeKey,
  ],
  Config: agentHostConfig,
  apply(ctx, config) { /* 见“装载” */ },
})
```

除这十项外，宿主插件还静态 inject 运行时对象 `agentHostPrincipal`，即装配入口签发的系统主体“Agent 宿主维护主体”。它与 `toolResidencyPrincipal` 同一做法，不进插件配置，也不是工厂的依赖。宿主用它代实例所属租户发布、停用和撤登记，见[实例的取得与回收](../../agent-cordis-contract/docs/cordis.md#实例的取得与回收)。

数组不在运行时拼接，也不经变量转手。写进数组的依赖缺席时，宿主插件停在 PENDING，插件体不运行；它换提供者时，Cordis 卸载并重新运行插件体，见 Cordis 页的[依赖与定义拥有者](../../agent-cordis-contract/docs/cordis.md#依赖与定义拥有者)。依赖逐项的必需性、缺席与换代结果只归[通用工厂](../../agent/docs/public-api.md#依赖逐项分类)，取得方式由本页拥有，Cordis 页的取得方式表只写键、取得方式与该键特有的 Cordis 事实。

### 局部依赖与可选依赖

局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

局部必需依赖是 `toolRuntime`、`agentExtensions`、`agentDecisionCards`、`agentActionAdmission`、`agentMaterials` 和 `agentReads`。适配器在阶段开始时先用 `ctx.get` 预检提供者，缺席立即返回 unavailable，不等待 Cordis 的 PENDING。提供者在场时，适配器以 `ctx.inject([键], cb)` 开阶段子 fiber，在 `cb` 内使用该依赖（[IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)）；预检与 `cb` 开始之间提供者离场时按 Cordis 页的有界等待处置。在场报告的去向见[Cordis 装配中工厂的依赖从哪里来](../../agent/docs/architecture/open-questions.md#cordis-装配中工厂的依赖从哪里来)。已进入的阶段不换提供者，下一阶段在新的子 fiber 内重新取得。工厂在创建时要求采用的定义所声明的必需能力在场。适配器用同一个 `ctx.get` 检查向工厂报告提供者当前是否在场，缺席使创建返回 unavailable。

可选依赖是目录。`reserve` 时，宿主经 `ctx.get(agentInstances)` 现取目录，接受 undefined。目录缺席时 reserve 返回 unavailable。装配者可以不经宿主，把工厂的 `registration` 设为 null，创建不发布的实例。

外域的变更通知是可选的唤醒提示。Tool 的 Cordis 定义声明了 [`tool-cordis-contract/call-changed`](../../../tool/tool-cordis-contract/docs/cordis.md#配置与变更通知)，载荷只有租户、ToolCallId 与 ToolRevision。实例进入等待节点时，宿主在自己的 fiber 上经 `ctx.on` 监听该事件，按本实例的租户与 associated Tool PendingCall 的调用引用解出的 call 过滤。intent 尚无调用身份，不能用本地猜测的 ID 匹配通知。历史未知后的新拒绝不解除原 pending、材料或交接责任，宿主不能将其当成无调用。关联命中即唤醒 runtime 重读原调用；离开等待时撤除监听。这个监听不依赖 `toolRuntime` 提供者在场，没有发送者时只是不会被唤醒。通知可以丢失、重复或先于监听到达，所以它不是事实源：唤醒后仍以 inspect 或 lookup 的结果为准，遗漏由 reconciliationDelayMs 的持久重读兜底，规则见[等待、唤醒与公平](../../agent/docs/architecture/mechanisms.md#等待唤醒与公平)。监听器失败只记诊断，不改变 Tool 一侧已提交的结果。Model 的 Cordis 定义当前没有同类通知。Model 结果由实例外的接收方共同提交到 Journal，loop 只以 Journal 条目为采用依据，经 Journal 事件提示和 timer 唤醒后重读，不轮询 Model 收场。

Agent消费者与三个运行实例宿主按共同图组合。Runtime Context/Request Context/HITL的完整服务定义若以后成为各原拥有者的公共接缝，应在同一采用中将本消费投影适配到该定义，不能保留两个含义相同的权威服务面。当前这些Agent端口拥有者是实际消费形状的Agent成员，未授予外域业务写权。

### 配置

插件的 `Config` 是 Standard Schema，字段来自[通用工厂的配置表](../../agent/docs/public-api.md#工厂配置)的全部取值项，规则归 Cordis 页的[配置](../../agent-cordis-contract/docs/cordis.md#配置)。字段的单位与校验规则只写在工厂配置表，本页不复述。默认值由装配提供。宿主另有一项自己的配置 `instanceIdleMs`：实例空闲回收时长，正整数，单位毫秒，初值由装配给。它不是工厂的取值项。AgentDefinition、扩展采用、当前模式和调用方工作身份不写进配置树；连续否决不新增次数上限。配置错误使插件加载失败。

### 装载

插件体按下列次序工作。

1. 校验配置。配置错误时抛出，fiber 进入 FAILED，插件体后面的步骤不执行。
2. 保存宿主自己的长期 Context。实例的贡献 fiber 都建在它之下，不建在调用方的 Context 之下。
3. 构造 `agentInstanceHost`、`agentPublicationAuthority`、`agentExecutionRecovery` 和 `agentInstanceProvision` 四个服务面。

装载不创建实例，也不发布登记。实例在调用方对某个槽调用 `acquire` 之后才存在，规则见[实例的取得与回收](../../agent-cordis-contract/docs/cordis.md#实例的取得与回收)。宿主自己完成下列次序，装配者和应用成员不调用 `reserve` 与 `publish`。

1. `reserve`：宿主以调用方的 Access 核验 reserve 资格，以自己派生的操作身份预约实例身份，创建该实例的登记句柄，记录预约。
2. 创建 idle runtime：宿主插件调用工厂。宿主传入 reserve 得到的登记句柄、已核验的租户、scope 与精确采用。静态依赖是宿主 inject 得到的同一批服务实例，局部依赖是宿主的阶段适配器。工厂返回 `AgentProvider`。
3. 持有：宿主持有 runtime、观察句柄和 `AgentProvider.control`，它们不进入登记输入。
4. `publish`：宿主以宿主主体、实例所属租户的 Access 核验 publish 资格，在宿主 Context 之下为该实例创建贡献 fiber，在这条 fiber 内经 `ctx.get(agentInstances).register` 登记。宿主对登记的义务（认回、复用贡献 fiber、重试结论一致）见 Cordis 页的[登记输入与撤除协议](../../agent-cordis-contract/docs/cordis.md#登记输入与撤除协议)。

同一槽的并发 `acquire` 共用这一次建立，得到同一个实例。槽内的实例已标记回收时，`acquire` 不等它，建立新实例。工厂返回 unsupported 或 unavailable 时，宿主原样返回，不发布，并撤销预约。宿主主体被拒时，发布失败使 `acquire` 返回同一失败。

宿主的 `route` 只对已发布的实例返回运行对象，登记撤除后返回 null。

### 停止准入与撤除

运行实例登记的贡献权限只交受信宿主。目录register验证原实例预约，在调用方fiber的effect中增加并条件撤除；connect不授发布权。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

计划停用一个实例按下列次序进行。`AgentRuntimeControl` 只交给宿主，所以 quiesce 由宿主调用，并且只由宿主发起：空闲回收与有序关闭。应用成员没有公开的停用入口。宿主以宿主主体、实例所属租户的 Access 核验 quiesce，经登记句柄的撤登记核验 withdraw。宿主主体被拒或不可用时，实例保持 published，宿主记录 error 级诊断，下一次空闲到期再试，不声称已回收。宿主显式等待每一步。

1. 宿主对实例调用 `AgentRuntimeControl.quiesce`。runtime 进入 draining，新的 invoke 与 resume 返回 unavailable。
2. runtime 对每个在途 execution 调用 detach，交接原位置与责任。任一交接未知时，quiesce 返回 unresolved，登记保持 published，宿主也不卸载贡献 fiber。
3. 全部交清后，quiesce 经登记句柄撤销本实例的登记。目录删除条目并发出 `instance-retired`，然后 quiesce 返回 drained。行为见 SPEC 的“[交接与停用](../../agent-contract/SPEC.md#交接与停用)”。
4. 宿主收到 drained 之后，卸载该实例的贡献 fiber，释放本实例持有的订阅和资源。

撤登记与卸载 fiber 是配对的。登记 effect 随调用方 fiber 撤除，所以贡献 fiber 一旦卸载，登记随之消失。多个 effect 的释放是并发的，不保证次序，所以上面的次序由宿主显式等待，不靠 disposer 的执行顺序。

空闲回收与有序关闭是宿主的义务，规则见[实例的取得与回收](../../agent-cordis-contract/docs/cordis.md#实例的取得与回收)，宿主这一侧的做法如下。

- 空闲计时：实例经登记句柄 `report` 为 `idle` 后，宿主用 `agentClock.waitUntil` 计时 `instanceIdleMs`。转为 `occupied` 就取消计时。
- 回收的保护点：计时到期的回调里，宿主不经 `await`，依次读该实例最近一次 `report`，不是 `idle` 就放弃本次回收，是 `idle` 就在槽表标记“回收中”，然后同步调用 quiesce。回收标记使后到的 `acquire` 不再返回旧实例。runtime 一侧的两条同步义务见[通用工厂](../../agent/docs/public-api.md#quiesce-与执行槽的同步义务)。
- 回收的结果：quiesce 返回 drained 后，宿主卸载贡献 fiber，从槽表删除该实例，并以原因证据（owner `agent-host`，record 写 `idle-reclaim`）记录。返回 unresolved 时，登记保持 published，撤销回收标记，槽表恢复。
- 有序关闭：`assemblyLifecycle` 停止时，宿主以宿主主体对全部实例调用 quiesce。unresolved 的实例留给 fiber 卸载，按“非计划卸载”处置。

### 在途责任

撤登记和卸载贡献 fiber 都不取消 Model 与 Tool 的独立执行。它们各自的执行归 Model 与 Tool 的提供者。已发生的外部效果不声称可逆。execution 的原记录、结果保管和交付责任在 Journal，不挂在贡献 fiber 上。依赖突然丢失时，宿主停止该实例新的受保护动作，保存可确认的进度，报告未知。不能把 disposer 的完成当成 detach 成功。

### 换代

宿主插件的静态依赖换提供者时，Cordis 卸载并重新运行插件体，旧实例的登记随贡献 fiber 撤除。这相当于原 runtime 失联。重新启用得到新的实例身份，不继承原登记。仍在途的 execution 由恢复者经 `resume` 走 Journal 的 attach 认回，路径选择见 SPEC 的“[恢复与接管](../../agent-contract/SPEC.md#恢复与接管)”。计划换代使用[停止准入与撤除](#停止准入与撤除)的 quiesce 次序，先准备并验证新实例，再撤旧授新。

影响半径是整个宿主。十项静态依赖中任一项非计划换代，等于本宿主插件全部实例的全部在途 execution 同时失联。它们的挂接仍是 active，所以恢复需要持 takeover 资格的主体，只持 resume 资格的主体不能恢复它们。一次良性的适配器重绑定因此是整个宿主范围的失联，不是单个实例的事件。目录插件静态 inject `agentAccessCheck`，它随同一类换代一起重跑。

十项中缺席时工厂无法运作的依赖是：`agentJournal`、`agentAccessCheck`、`agentAdoptions`、`agentClock` 与 `modelRuntime`，工厂没有它们不能校验绑定、核验资格、解析采用、调度等待或受理主请求。`agentConditions`、`agentRequests`、`agentModelSelection`、`agentModelContext` 与 `agentMessageHandoff` 只在请求准备与消息准入处使用；工厂在创建时仍要求它们在场，必需性见工厂页。本部署按[应用装配页的裁定](../../../../docs/architecture/runtime/application-assembly.md#插件树)将全部十项设为静态 inject。缺任一项时宿主停在 PENDING，不改为首次使用时才失败。对应[开放问题](../../agent/docs/architecture/open-questions.md#静态注入依赖是否改为使用点取得)已关闭；该裁定不缩小上述换代半径。

## 候选发行行

下面两行是设计中的行，不是已发布的插件树。发行层的行 id 是对运维者层的稳定承诺（[IC-15](../../../../docs/architecture/cordis-integration-conventions.md#ic-15)、[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。运维者层可以按行 id 整行替换配置、停用或插入新行，指向不存在的行 id 使启动失败。授权适配器、Journal 提供者、时钟等运行对象由装配入口提供为服务，不进入行的配置。

| 行 id | 插件标识 | 配置 |
| --- | --- | --- |
| agent-host | 包 `@omne-harness/agent-host-local`，`./cordis` 的导出名 `agentHostPlugin` | 见下方示例 |
| agent-instances | 包 `@omne-harness/agent-cordis-contract`，`./cordis` 的导出名 `agentInstancesPlugin` | 空对象 |

示例的数值只示意格式，不是默认值。默认值由装配提供。

```json
{
  "id": "agent-host",
  "plugin": { "package": "@omne-harness/agent-host-local", "export": "agentHostPlugin" },
  "config": {
    "observerBufferBytes": 1048576,
    "reconciliationDelayMs": 1000,
    "reconciliationBatchLimit": 100,
    "denialBackoffMs": 1000,
    "instanceIdleMs": 300000,
    "toolConcurrency": 4,
    "jointCommits": ["message", "context-transition", "custody", "processed"],
    "coordination": "coordinated",
    "loopGuardPolicy": { "owner": "agent", "name": "loop-guard-default", "revision": "1", "digest": "sha256:…" }
  }
}
```

独立调用的装配把 `coordination` 设为 `standalone`、`jointCommits` 设为空列表，并选择 standalone 的 Journal 绑定。有外部协调者的装配把 `coordination` 设为 `coordinated`，列出它需要的共同提交种类，并选择声明了 coordinated 模式与对应参加者的 Journal 绑定。两项与绑定声明不符时，宿主插件的创建返回 unsupported，不保存任何状态，见[通用工厂](../../agent/docs/public-api.md#工厂配置)。

## 实例作用域与复用

宿主先 reserve 唯一实例身份，创建纯 provider，最后在该实例的贡献 fiber 中经目录发布登记。登记输入不含运行对象。idle 与 occupied 是同一登记，execution 完成不销毁 fiber。runtime 实例不是插件，不进插件树（[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。一个作用域只绑定一个固定 tenant/scope/definition；应用可持有多个作用域，但不能从树位置推断权限。作用域是租户加实例身份，再加挂在调用方 fiber 上的登记。事件按这个身份过滤，撤除只撤这些登记，故障和登记不漏到别的实例。

可重建缓存随 runtime 寿命，执行输入、取消状态和输出游标随 execution 隔离。阶段子 fiber 只持有该阶段借用关系，撤除它不撤 Model/Tool 原宿主贡献。依赖突然丢失时禁止新效果，保存可确认进度并报告未知；不能将 disposer 的完成当成 Journal.detach 成功。

### 租户

租户是每次操作的参数，不从 `ctx`、isolate 标签、插件实例或“谁装了这个插件”推断（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。reserve 与 publish 的 Access 显式携带租户。runtime 构造时绑定的租户与安全作用域是身份绑定，不是配置。宿主核对登记的租户与预约的租户一致，不一致按跨租户拒绝。规则见 SPEC 的“[租户与作用域绑定](../../agent-contract/SPEC.md#租户与作用域绑定)”。目录键是显式租户加实例身份。

## 验证义务

外部协调者的装配须验证：协调者已可靠受理而通知尚未到达时，Agent 不能越过原输入完成；不能先提交一域再提交另一域。独立装配须验证消费者不回复终态批准也能完成。两者均核原输入身份、共同事件保存、查询未知与旧挂接失权；加载成功不证明这些性质。

实现时验证静态 inject、局部依赖撤除、旧引用拒绝和先业务交接后 dispose。另须验证：Journal 提供者没有声明装配所需的共同提交时工厂返回 unsupported；贡献 fiber 卸载后登记消失；旧登记身份的晚到撤除不撤后继；quiesce 返回 unresolved 时宿主不撤登记。`./cordis` 入口测试只核对完整插件未实现。根入口另以真实工厂和同源内存 Journal 验证 supported/unsupported、共同保存及原 handoff 重试；两者都不证明本节完整插件生命周期。
