# @omne-harness-lite/model-request-runtime

[English](README.md)

调用一次显式模型传输，把响应流装配为最终结果，提供取消、内容时限和异步首内容门。本包是实验性 ESM workspace 成员，尚未发布到 npm。

当前实现范围是独立函数。耐久十三操作服务、Cordis 插件、租户准入、恢复、重试和回复结算尚待交付。精确采用与覆盖见[实现映射](../../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md)。

## 公开接口

| 导出 | 用途 |
| --- | --- |
| `invokeModel(input)` | 返回包含 `outcome`、`snapshot()` 与 `abort()` 的句柄 |
| `classifyCause(facts, hasContent, table)` | 按显式状态码表分类来源，保留原始状态码 |
| `TransportAdapter`、`PlanInput` | 调用者持有的 plan/send/read 端口与显式请求输入 |
| `InvocationPolicy`、`ModelInvocationResult` | 调度、脱敏、诊断政策与尚未结算的结果投影 |

## 调用显式传入的请求

将两个包声明为直接 workspace 依赖。先按[传输示例](../pi-ai-transport/README_ZH.md#只规划提醒不发送请求)构造 `PlanInput`，再交入明确持有的凭据和取消信号。示例函数只在被调用时发送，不读环境凭据。

```ts
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createPiAiTransport, type TransportOptions } from '@omne-harness-lite/pi-ai-transport'

export async function invokeOnce(
  request: PlanInput, transportOptions: TransportOptions, credential: string, signal: AbortSignal,
  beforeFirstContent?: () => Promise<void>,
) {
  const transport = createPiAiTransport(transportOptions)
  const fragmentLength = transportOptions.policy.credentialFragmentMinLength
  try {
    const handle = invokeModel({
      ...request, transport, credential, signal,
      ...(beforeFirstContent ? { beforeFirstContent } : {}),
      policy: {
        now: () => new Date().toISOString(),
        schedule: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
        firstContentTimeoutMs: 60000, idleContentTimeoutMs: 60000,
        statusCauseTable: { '401': 'credential_unavailable', '429': 'upstream_unavailable', '503': 'upstream_unavailable' },
        redact: text => {
          let value = text.split(credential).join('█')
          for (let offset = 0; offset <= credential.length - fragmentLength; offset++)
            value = value.split(credential.slice(offset, offset + fragmentLength)).join('█')
          return value
        },
        diagnostic: event => { console.log(event.kind) },
      },
    })
    console.log(handle.snapshot().position)
    return await handle.outcome
  } finally { await transport.close() }
}
```

transportOptions.definitions 必须显式给已核实的完整定义与自持网络政策。没有默认 pilot，officialModelIds 只列目标；缺定义或旧形状在资源建立前失败。传输 README 的教学值不能配真实凭据使用。

示例状态码表和脱敏器属于调用者政策，不是全局强制默认值。生产调用者应交入完整已确认政策。输出上限、供应商、快照、绑定和消息全部来自 request，函数不自行查找。

异步工作开始前，调用固定自己持有的请求值及政策成员；借用函数和资源的寿命仍归调用者。使用动态适配引用时，交入 `lease.transport`，用 `lease.track(...)` 登记调用结果及独立的异步内容门/结算，等待它们实际停止后释放。

## 观察、内容门与取消

`handle.snapshot()` 读取已接受序列，不再次发送。可选 `onAccepted(event, snapshot)` 观察同一序列。交入 `beforeFirstContent` 后，内容在门成功前保持不可见；门失败会停止执行，返回本地失败且不交出私有块。没有交门时不具有耐久落盘保证。

调用 `handle.abort()` 或中止传入信号后，等待 `handle.outcome` 再释放资源。出网前取消返回 `{ cancelledBeforeSend: true }`，没有请求结果。已开始发送的调用收敛为 `complete`、`truncated`、`interrupted` 或 `failed`。首内容后失败保留已经交付的部分。usage、缓存零与未知、精确实报费用保真；上游缺身份时不从请求路由补造。

规划拒绝不产生模型响应。意外实现缺陷仍表现为被拒绝的 promise。结果没有会话、租户、ResponseId，也没有耐久入账或回复落盘含义。

## 开发与验证

```sh
pnpm --filter @omne-harness-lite/model-request-runtime... run build
pnpm --filter @omne-harness-lite/model-request-runtime run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime run test
```

配套传输测试用真实本地 HTTPS 和公开 core 装配器验证本函数。完整服务/耐久保证及真实模型认证仍需后续阶段验收。
