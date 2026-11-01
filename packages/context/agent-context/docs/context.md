# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。它覆盖独立消费与适用的 Harness 接入，引用系统架构与真实消费者，不成为新的架构源。

## 使用方式

独立使用：把收件口、采用身份与解析器交给工厂，得到 `AgentAccountOutlet`。

```ts
import { absentAccountTarget, createAgentAccountOutlet } from '@omne-harness/agent-context'

const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: absentAccountTarget })
const outcome = await outlet.deliver({ access, handoff })
```

`inbox` 是 `ContextAccountingInbox`（例如 `createContextAccounting` 返回的 `inbox`），`sender` 是本出站的采用身份。工厂返回值没有要释放的资源。Cordis 接入见 [cordis.md](cordis.md)。

## 消费者与定位

消费者是 Agent：它把收到的 Model 账目经 `agentAccountOutlet` 交给 Request Context（装配页的 `agent-host` 行静态 `inject` 该键）。本包在 Context 组里是 Agent 与 Request Context 之间的适配器，见[适配方案](../../request-context-contract/docs/context.md#适配方案)。本波它只承接账目出站。
