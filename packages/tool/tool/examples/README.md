# Tool runtime tutorial

This tutorial runs a real function author through public Tool entry points. It demonstrates admission, execution, settlement, model-visible pagination, and consumer delivery release. It also runs complete-argument failure and confirmed pre-start exclusion.

For Chinese setup instructions, see [运行教学示例](../README_ZH.md#运行教学示例). Public types belong to [the API reference](../docs/public-api.md). Behavior belongs to [SPEC](../SPEC.md).

## Prepare and run

Use Node.js 24 or later and pnpm 10.28.1 in a repository checkout. These workspace packages are private. The tutorial does not require credentials, a model service, a database, or Cordis.

Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --workspace-concurrency=1 --filter @omne-harness/tool... --filter @omne-harness/tool-host-local... -r run build
pnpm --filter @omne-harness/tool run examples
```

Reuse installed dependencies when the lockfile did not change. Rebuild after source changes. Node resolves the packages' public `dist` exports. Do not add `--conditions=source` or use another checkout's build.

To run the entry file directly:

```sh
pnpm --filter @omne-harness/tool exec node --experimental-strip-types examples/journey.ts
```

To check its types:

```sh
pnpm --filter @omne-harness/tool run typecheck
```

The program exits with code 0 after all three journeys complete. Assertions, operation failures, and cleanup failures produce a nonzero exit. The program preserves the journey error and cleanup error together.

## Read the three files

| File | Responsibility |
| --- | --- |
| [report-tool.ts](report-tool.ts) | Define the function tool, strict JSON parameter codec, output codec, and read-only report executor. The empty JSON Schema imposes no value shape. Construct legal text blocks through public validation. |
| [example-assembly.ts](../tests/example-assembly.ts) | Assemble public testing providers, current qualification, the source issuer and guard, the execution binding, and a controlled host. This file is dedicated tutorial support. It imports no existing unit-test helper or oracle. |
| [journey.ts](journey.ts) | Submit ordinary requests, inspect returned variants, query current state, consume results, and release each delivery. Keep the public operations visible. |

The assembly belongs under `tests/` because its providers are non-durable testing resources. The example calls those resources through public package exports. It does not import internal `src` files or use a source condition.

The binding reads the registered author through the public trusted `tool-contract/binding` entry. Ordinary callers do not receive that capability. It stages the launch intent, consumes the real start permit, and calls the memory execution source. It then executes the actual author through `createIndependentToolScope` and `executeTool`.

The author output passes its validator and codec. The binding preserves those bytes and publishes the actual result as a final source fact. The real driver receives the facts, acknowledges the source, preserves the result, and repairs the queue. No call, terminal, settlement, or delivery record is seeded.

## Follow the success journey

1. Keep the fixed request and full consumer position before `runtime.invoke`.
2. Inspect the invoke variant. An accepted state is the admission receipt.
3. Advance the controlled host and use `queries.lookup` to obtain current state.
4. Observe `settled`, `queue: released`, and `delivery: pending` together.
5. Invoke actual `Tools.help` with a new consumer position.
6. Use `readReply` to collect that new call's complete result. Apply P14 with `projectToolResult` before model consumption.
7. Use `present` for the source's first page. Give only the projection and actual help to the model consumer.
8. Copy visible `reference` and `next` into a new `Tools.read_result` invocation. Repeat until visible `content: end` and `next: null`.
9. Save each complete meta reply's processed text before releasing its own delivery.
10. Save all three source sections in order. Release the source delivery with evidence from that processing record.

Each meta invocation gets a new `consumer.position` and its own invocation reference. It returns a new ToolResult. The original source reference and result version remain fixed. The model function cannot access the runtime, ledger, hidden cursor, or source metadata.

The host's `readReply` reads the complete meta response before projection. It does not ask the model to interpret partial meta responses. The model-visible continuation comes from the projected source page status.

The consumer records retain the actual processed text, invocation reference, result, and delivery. Their evidence owner matches the actual delivery consumer. These records last only for this process.

## Expected output

The output includes actual help, visible continuation arguments, all report text, and new meta-call references. Generated invocation identities differ between runs. The final summaries are:

```text
slot released; source delivery remains pending
source summary {"pages":3,"sections":3,"sourceExecutions":1,"next":null}
PASS success with model-visible pagination; tutorial host closed
PASS complete arguments failure; tutorial host closed
PASS confirmed pre-start exclusion; tutorial host closed
All tutorial journeys completed; 6 consumer processing records retained in this process.
```

The default parameter codec checks complete strict JSON, including duplicate keys. It does not perform schema validation. The argument failure uses `complete: true` and duplicate JSON keys. It reaches an `arguments` terminal with a readable failure result and pending delivery. Environment preparations, binding starts, and report executions are all zero.

The exclusion journey invokes the source normally. Before the first host advancement, the qualified coordinator uses the original call and a legal operation with public `authority.exclude`. Only an `ok` reply permits the journey to continue. The observed terminal is `unavailable`, the effect and execution are `not-started`, and the binding and author never start.

## Identity, release, and unknown outcomes

The source provider associates the tenant, complete consumer, and fixed request with the original invocation. A new consumer position means a new call. Repeating the original intent is a recovery operation. Do not allocate a new position to handle an unknown response.

FIFO slot release permits another execution to run. Delivery release acknowledges a particular consumer's processing of a particular result. Environment release is a third responsibility. This tutorial does not drive real environment release or claim a complete drain protocol.

`releaseDelivery` does not delete the result, release an execution slot, or undo an external effect. The journey reads the fixed result again after delivery release.

| Outcome | Retain and inspect |
| --- | --- |
| Invoke `commit-unknown` | Keep the original fixed request, consumer, and invocation reference. Query that reference with `queries.lookup`. |
| Invoke `association-unknown` | Keep the complete original intent. Reconcile the same intent through the original source. There is no proven reference yet. |
| Delivery `commit-unknown` | Keep the completion record and returned operation. Query it with `queries.queryOperation`, then inspect current delivery state through the original invocation. |
| Exclusion failure or unknown | Keep the original call and exclusion operation. Continue observation through the same authority and original invocation. Do not infer `not-started` or release delivery. |

The program reports these conditions and exits nonzero. It does not automatically retry with a new identity. A reliable negative command answer rules out that command only. It does not prove that another delivery release never committed. See [delivery release](../SPEC.md#16-交付解除p08).

The host retains one instance and signal for each call. `schedule` queues work, and `advance` runs a bounded round without sleeps. Cleanup aborts those signals, waits for its source readers, withdraws its publications, and removes its installed driver. Process exit itself is not delivery completion or proof of environment cleanup.

## Common errors and limits

| Symptom | Action |
| --- | --- |
| Module or declaration cannot be resolved | Prepare workspace dependencies and build the package closure in this checkout. |
| TypeScript syntax fails under Node | Use Node.js 24 or later and the documented type-erasure command. |
| `Bounded host advancement ended` | Keep the original reference. Inspect current state and the configured provider failures. Do not replace the consumer position. |
| Reading returns a named error | Keep the actual failure. Check current qualification, the fixed reference, and byte budgets. Do not treat a completed meta call as successful source reading. |
| Delivery release is rejected | Check the exact result, delivery, complete consumer, and matching evidence owner. Record completion only after actual processing. |

The assembly supplies one known test principal, a legal test tenant, explicit scope qualification, a paired test issuer and guard, and memory providers. Its qualification is a teaching rule, not a production authorization system.

The real components are the function author, independent executor wrapper, runtime, ledger, driver, Tools author, and P14 projection. Storage, environment, custody, start authority, identity issuance, and scheduling remain in-process resources. The example uses the memory start authority, not `tool-host-local`'s local coordinator.

No real model, Agent, Session, durable store, production provider, restart recovery, cross-process coordination, attachment traversal, or external-effect exactly-once guarantee is demonstrated. Clock and environment obligations can remain in the ledger after settlement. The tutorial does not claim that every background responsibility is closed.

[Independent acceptance](../acceptance/README.md) has its own assembly and oracles. It does not import this tutorial. Unit-test and provider-composition coverage remains in [tests/README](../tests/README.md).

## 中文阅读提示

在仓库根执行上面的准备、构建与 `examples` 命令。程序使用公开 `dist`，无需模型凭据、数据库或 Cordis。锁文件未变且依赖已准备时，不重复安装。

先读 [journey.ts](journey.ts) 的主旅程，再读 [report-tool.ts](report-tool.ts) 的工具定义，最后看 [教学装配](../tests/example-assembly.ts)。装配位于 tests，是因为它使用公开的非耐久 testing 提供者。它不依赖既有测试夹具。

成功输出应显示 3 页、3 节正文和原 executor 仅执行 1 次。每次 help/read_result 都使用新消费位置，生成新的 ToolResult，并处理、记录和解除自己的 delivery。模型函数只收到 P14 投影与真实帮助，不接触隐藏页游标。

参数失败提交完整但含重复键的 JSON。它产生可读的 arguments 失败，环境准备、binding start 与作者执行均为零。发起失败先确认公开 authority.exclude，再推进原调用，得到 unavailable/not-started。

执行名额释放、结果 delivery 解除与环境资源释放各自独立。解除 delivery 前，消费方必须实际处理完整结果并保存匹配记录。解除之后固定结果仍可读。

unknown 保留原请求、完整 consumer、reference 或 operation，沿原身份查询或认回。不能换消费位置自动重试，也不能把 unknown 当成未启动。程序保留失败，清理错误也会使退出码非零。

本例只覆盖单进程非耐久组合。它不提供生产授权、真实 Agent/Session、耐久恢复、生产宿主或完整环境清理。常见错误与更完整的中文入口见 [README_ZH](../README_ZH.md#运行教学示例)。
