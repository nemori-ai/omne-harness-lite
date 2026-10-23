# @omne-harness/operation-result 行为规格

本文件拥有 `@omne-harness/operation-result` 在公开类型以外的必要行为。公开形状与运行时校验归 [src/index.ts](src/index.ts)，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。本成员没有状态、资源或异步行为，下面的义务都是纯函数的输入输出关系。

## 范围与依据

本文件是 `@omne-harness/operation-result` 的目标契约。操作结果的形状和构造函数由 PanQiWei 在 [#248 技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/248#issuecomment-6176737639)中接受。拆成独立成员由 PanQiWei 在 [#371 技术采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/371#issuecomment-6229850851)中认可。类型名与含义不变，形状和函数从 `@omne-harness/kernel-basis` 原样迁来。

根入口是本成员唯一的公开入口。本成员 `dependencies` 为空，源码、声明和运行都不导入 Cordis。

## 结果与不变量

### 操作结果

根入口提供两种结果。失败字面量 `F` 由调用方契约规定。本包不规定共同的失败词汇。

```ts
type Outcome<T, F> = { ok: T } | { failure: F }
type Ack<F> = { ok: true } | { failure: F }
```

`succeed(value)` 返回 `{ ok: value }`。`ack()` 返回 `{ ok: true }`。`fail(failure)` 返回 `{ failure }`。不存在字符串 `'ok'`。

`isSuccess` 对 `Outcome` 和 `Ack` 都成立的条件是结果对象带有 `ok`。带值成功里 `ok` 是载荷 `T`。无值成功里 `ok` 只是 `true`，不携带业务载荷。两种类型不合并成一个信封。

## 所有权、失败与生命周期

本成员不持有身份、状态或资源，没有生命周期、取消、并发或恢复问题。`F` 的词汇、失败的含义和失败后的处置归调用方契约。本包不检查 `F` 的内容，也不把异常转成失败。没有外部副作用，所以没有可撤回的外部输出。

## 组合与验证

### 消费者

本节是当前直接消费者的唯一清单。下表按各成员 `package.json` 的声明依赖和 `src` 的静态导入区分类型与运行时值。`src` 两列不含 testing 支持代码，testing 列单列这些引用。源码链接给出对应导入位置，单元测试、acceptance 及示例中的引用不算生产调用证据。静态导入不证明消费者已经执行或完成组合验证。

| 成员及依赖声明 | src 类型导入 | src 运行时值导入 | src testing 支持导入 |
| --- | --- | --- | --- |
| [agent/agent-contract](../../agent/agent-contract/package.json) | `Outcome`（[源码](../../agent/agent-contract/src/evaluation.ts)） | `fail`, `succeed`（[源码](../../agent/agent-contract/src/identity.ts)） | 无 |
| [agent/agent-cordis-contract](../../agent/agent-cordis-contract/package.json) | `Outcome`（[源码](../../agent/agent-cordis-contract/src/cordis.ts)） | `fail`, `succeed`（[源码](../../agent/agent-cordis-contract/src/cordis.ts)） | 无 |
| [agent/agent](../../agent/agent/package.json) | `Outcome`（[源码](../../agent/agent/src/access.ts)） | `fail`, `succeed`（[源码](../../agent/agent/src/access.ts)） | 类型 `Outcome`（[源码](../../agent/agent/src/testing/clock.ts)）；值 `fail`, `succeed`（[源码](../../agent/agent/src/testing/clock.ts)） |
| [context/request-context-contract](../../context/request-context-contract/package.json) | `Outcome`（[源码](../../context/request-context-contract/src/refs.ts)） | 无 | 类型 `Outcome`（[源码](../../context/request-context-contract/src/testing/doubles.ts)） |
| [context/runtime-context-contract](../../context/runtime-context-contract/package.json) | `Outcome`（[源码](../../context/runtime-context-contract/src/decode.ts)） | `fail`, `succeed`（[源码](../../context/runtime-context-contract/src/decode.ts)） | 无 |
| [execution/execution-environment-contract](../../execution/execution-environment-contract/package.json) | `Outcome`（[源码](../../execution/execution-environment-contract/src/judge.ts)） | `fail`, `succeed`（[源码](../../execution/execution-environment-contract/src/judge.ts)） | 无 |
| [model/model-contract](../../model/model-contract/package.json) | `Outcome`（[源码](../../model/model-contract/src/conversion.ts)） | `fail`, `succeed`（[源码](../../model/model-contract/src/credential-values.ts)） | 类型 `Outcome`（[源码](../../model/model-contract/src/testing/conformance-kit.ts)）；值 `fail`, `succeed`（[源码](../../model/model-contract/src/testing/calls.ts)） |
| [model/model-cordis-contract](../../model/model-cordis-contract/package.json) | `Outcome`（[源码](../../model/model-cordis-contract/src/caller-fiber.ts)） | `fail`, `succeed`（[源码](../../model/model-cordis-contract/src/caller-fiber.ts)） | 无 |
| [model/model](../../model/model/package.json) | `Outcome`（[源码](../../model/model/src/execute.ts)） | `fail`, `succeed`（[源码](../../model/model/src/execute.ts)） | 类型 `Outcome`（[源码](../../model/model/src/testing/dispatch.ts)） |
| [model/pi-ai-anthropic](../../model/pi-ai-anthropic/package.json) | `Outcome`（[源码](../../model/pi-ai-anthropic/src/family.ts)） | 无 | 无 |
| [model/pi-ai-openai](../../model/pi-ai-openai/package.json) | `Outcome`（[源码](../../model/pi-ai-openai/src/family.ts)） | 无 | 无 |
| [model/pi-ai-transport](../../model/pi-ai-transport/package.json) | `Outcome`（[源码](../../model/pi-ai-transport/src/capacity.ts)） | 无 | 无 |
| [model/tokenizer-tiktoken](../../model/tokenizer-tiktoken/package.json) | `Outcome`（[源码](../../model/tokenizer-tiktoken/src/engine-version.ts)） | `fail`, `succeed`（[源码](../../model/tokenizer-tiktoken/src/engine-version.ts)） | 无 |
| [tool/tool-contract](../../tool/tool-contract/package.json) | `Outcome`（[源码](../../tool/tool-contract/src/author-context.ts)） | `fail`, `succeed`（[源码](../../tool/tool-contract/src/identity.ts)） | 类型 `Outcome`（[源码](../../tool/tool-contract/src/testing-case.ts)）；值 `fail`, `succeed`（[源码](../../tool/tool-contract/src/testing-clock.ts)） |
| [tool/tool-cordis-contract](../../tool/tool-cordis-contract/package.json) | `Outcome`（[源码](../../tool/tool-cordis-contract/src/cordis.ts)） | `fail`（[源码](../../tool/tool-cordis-contract/src/cordis.ts)） | 类型 `Outcome`（[源码](../../tool/tool-cordis-contract/src/testing.ts)）；值 `fail`, `succeed`（[源码](../../tool/tool-cordis-contract/src/testing.ts)） |
| [tool/tool-host-local](../../tool/tool-host-local/package.json) | `Outcome`（[源码](../../tool/tool-host-local/src/start-coordinator.ts)） | `fail`, `succeed`（[源码](../../tool/tool-host-local/src/start-coordinator.ts)） | 无 |
| [tool/tool](../../tool/tool/package.json) | `Outcome`（[源码](../../tool/tool/src/boundary.ts)） | `fail`, `succeed`（[源码](../../tool/tool/src/boundary.ts)） | 类型 `Outcome`（[源码](../../tool/tool/src/testing-ledger-values.ts)）；值 `fail`, `succeed`（[源码](../../tool/tool/src/testing-ledger-assembly.ts)） |

可用 `rg -n '@omne-harness/operation-result' packages apps tools --glob package.json --glob '**/src/**'` 复核声明和源码引用，再按 `import type` 及逐项 `type` 标记区分类型。本成员自己的公开入口测试不属于上表的外部消费者。消费者从公开入口导入，不复制结果类型。Cordis 不提供这些操作结果，纯契约也不应为它们引入 Cordis。

### 入口闭包

根入口的源码、生成的声明和运行都不导入 `@deepseek-ai/cordis`。调用 `succeed`、`ack`、`fail` 和 `isSuccess` 不创建 Context。`package.json` 的 `dependencies` 为空对象，所以安装本成员不带来 Cordis。本成员没有 `./cordis` 入口。

### 验收对照

C1。六个导出 `Outcome`、`Ack`、`succeed`、`ack`、`fail`、`isSuccess` 与 #248 接受的形状一致，类型名与含义没有变化。

C2。根入口运行时导出恰为 `ack`、`fail`、`isSuccess`、`succeed`。生成的 `dist/index.js` 与 `dist/index.d.ts` 不含 `@deepseek-ai/cordis`。

C3。三个构造函数和 `isSuccess` 的行为由 `tests/outcome.spec.ts` 从公开入口检查。C2 由 `tests/public-entry.spec.ts` 检查。
