# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。它覆盖独立消费与适用的 Harness 接入，引用系统架构与真实消费者，不成为新的架构源。

## 使用方式

出站：把收件口、采用身份与解析器交给工厂，得到 `AgentAccountOutlet`。

```ts
import { absentAccountTarget, createAgentAccountOutlet } from '@omne-harness/agent-context'

const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: absentAccountTarget })
const outcome = await outlet.deliver({ access, handoff })
```

`inbox` 是 `ContextAccountingInbox`（例如 `createContextAccounting` 返回的 `inbox`），`sender` 是本出站的采用身份。工厂返回值没有要释放的资源。

读取与准备：先建一个材料库，再把它交给两个工厂。两个工厂共用材料库，读取交出的证据才能在准备时解析。

```ts
import {
  absentStepResults,
  createAgentModelContext,
  createAgentRequests,
  createContextMaterials,
  firstWaveTools,
} from '@omne-harness/agent-context'

const materials = createContextMaterials({ owner, capacity: 256 })
const reader = createAgentModelContext({ materials, parts, eligibility, runtimeContext })
const requests = createAgentRequests({
  materials,
  parts,
  requestContext,
  preparation,
  conversions,
  model,
  resultCapacity,
  tools: firstWaveTools,
  stepResults: absentStepResults,
})
// 停止时：交回结算，再清空材料库。
const settled = await requests.close()
materials.close()
```

`parts` 是持有者借出的四个部件（K-RQ），`eligibility` 是读取资格的交接（K-RC），`runtimeContext` 是绑定到模型消费者类的读者面，`requestContext` 是登记面与操作组，`preparation` 是 Model 准备资源，`model` 是 Model 请求准备。Cordis 接入见 [cordis.md](cordis.md)。

## 消费者与定位

消费者是 Agent。`agent-host` 行静态 `inject` `agentRequests`、`agentModelContext` 与 `agentAccountOutlet`：主请求经前两个准备，收到的 Model 账目经第三个交给 Request Context。本包在 Context 组里是 Agent 与 Request Context、Runtime Context 之间的适配器，见[适配方案](../../request-context-contract/docs/context.md#适配方案)。会话侧部件由 `session-ad04` 行经 K-RQ 提供，读取资格由 `session-ad03` 行经 K-RC 提供。本包不导入这两个提供者。
