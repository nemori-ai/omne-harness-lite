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

| 能力 | 入口 | 已接受依据 | 具名消费者 | 为什么不直接用 Cordis |
| --- | --- | --- | --- | --- |
| 带值操作结果 | 根 | #248 与 #371 技术采用决定 | `tool-contract`、`tool`、`tool-cordis-contract`、`model-contract`。当前轨道没有生产调用点 | Cordis 没有这种结果类型，也不应让契约包依赖 Cordis |
| 无值操作结果 | 根 | 同上 | 同上 | 同上 |

本轨道上没有业务成员的生产调用点。公开入口由本成员测试消费。上面四个消费者在合入本轨道时按公开入口导入，不复制结果类型。

### 入口闭包

根入口的源码、生成的声明和运行都不导入 `@deepseek-ai/cordis`。调用 `succeed`、`ack`、`fail` 和 `isSuccess` 不创建 Context。`package.json` 的 `dependencies` 为空对象，所以安装本成员不带来 Cordis。本成员没有 `./cordis` 入口。

### 验收对照

C1。六个导出 `Outcome`、`Ack`、`succeed`、`ack`、`fail`、`isSuccess` 与 #248 接受的形状一致，类型名与含义没有变化。

C2。根入口运行时导出恰为 `ack`、`fail`、`isSuccess`、`succeed`。生成的 `dist/index.js` 与 `dist/index.d.ts` 不含 `@deepseek-ai/cordis`。

C3。三个构造函数和 `isSuccess` 的行为由 `tests/outcome.spec.ts` 从公开入口检查。C2 由 `tests/public-entry.spec.ts` 检查。
