# kernel-basis 行为规格

本文件是 `@omne-harness/kernel-basis` 的候选契约，供 #248 请求技术接受。PanQiWei 接受之前，它不是现行实现承诺。`src` 仍是空导出。实现和探针文件搬迁归 #270。

包组织页已经接受三份入口。根入口导出操作结果，并且不导入 `@deepseek-ai/cordis`。插件辅助从 `./cordis` 导出。测试装配从 `./testing` 导出。本包不声明服务键，不收回其他能力的 Service 定义。

## 操作结果

根入口提供两种结果。失败字面量 `F` 由调用方契约规定。本包不规定共同的失败词汇。

```ts
type Outcome<T, F> = { ok: T } | { failure: F }
type Ack<F> = { ok: true } | { failure: F }
```

`succeed(value)` 返回 `{ ok: value }`。`ack()` 返回 `{ ok: true }`。`fail(failure)` 返回 `{ failure }`。不存在字符串 `'ok'`。

`isSuccess` 对 `Outcome` 和 `Ack` 都成立的条件是结果对象带有 `ok`。带值成功里 `ok` 是载荷 `T`。无值成功里 `ok` 只是 `true`，不携带业务载荷。两种类型不合并成一个信封。

根入口的源码、声明和运行不导入 Cordis。#270 在实现时核对安装闭包是否引入 Cordis。入口分开不等于安装闭包已经隔离。

## 插件辅助

`definePlugin` 接收 `name`、必填 `Config`、可选 `inject` 和 `apply`。`Config` 是 Standard Schema。它不声明服务键，不携带 `provide` 或 `intercept`。

必需依赖写在 `inject`。该服务换代或不在时，由 Cordis 卸载并重跑插件。可选依赖不写进 `inject`。

`resolveOptional` 在调用时执行 `ctx.get`。缺席结果是 `undefined`，插件保持装载。类型参数是调用方断言，不是本包证明的服务形状。

配置校验由 Cordis 4.0.4 在插件体之前执行。配置错误时插件加载失败，fiber 进入 `FAILED`。不能静默跳过缺失的引用。

`FIBER_STATE` 和 `fiberIsActive` 不是公开辅助。`ACTIVE` 不等于存储可写、远端可达或工作已恢复。Fiber 状态留在 Cordis。探针可以在内部对照状态，不从本包再导出一份。

## 测试装配

`./testing` 为一次测试创建 Context，装载测试传入的插件，并撤除它自己已经启动的 Fiber。启动失败时也撤除那些已启动的 Fiber。

它不关闭调用方传入的资源，不选择后端，不规定业务关闭顺序。产品关闭仍用 assembly 的关闭协议。导出函数的名字由 #270 选定，行为不因改名而变。

产品源码不得导入 `./testing`。

Cordis 负责运行中的依赖换代和 `fiber.restart`。测试装配不做这件事。关闭协议负责计划退出时的一组租约。关闭协议不打开代际，也不把租约迁到另一个提供者。

## 消费者

| 能力 | 入口 | 消费者类别 | 调用场景 | 失败 |
| --- | --- | --- | --- | --- |
| 带值操作结果 | 根 | 已接受的位置职责。新源码里还没有消费者 | 返回载荷或调用方自己的失败字面量 | `{ failure: F }` |
| 无值操作结果 | 根 | 同上 | 没有载荷的操作 | `{ failure: F }` |
| `definePlugin` | `./cordis` | IC-14 已点名的计划消费 | 声明函数插件 | 配置错误使 fiber 进入 `FAILED` |
| `resolveOptional` | `./cordis` | IC-9 已点名的计划消费 | 调用时读取可选服务 | 缺席为 `undefined` |
| 测试装配 | `./testing` | 已接受的入口职责。具体测试作者待各成员落地 | 测试里启动 Context | 启动失败仍撤除已启动的 Fiber |

旧包 `@omne-harness-lite/kernel-basis` 的 import 次数只是线索。它们不成为新消费者，也不要求恢复旧运行依赖。没有上表依据的辅助退出公开包。服务键留在各能力的定义拥有者。

## Cordis 证据

待核对版本是锁文件中的 `@deepseek-ai/cordis` 4.0.4。DeepSeek Harness 文档的 master 快照不是这个钉的保证。

| 行为 | 档 | 依据 |
| --- | --- | --- |
| 必需依赖换代时卸载并重跑 | 项目陈述，仍须用 4.0.4 探针复核 | 生命周期页写明 `inject` 决定重装配范围 |
| 可选服务用 `ctx.get`，缺席不卸载 | 官方文档线索，须对照 4.0.4 源码 | DeepSeek Harness 插件契约 |
| 配置在插件体之前按 Standard Schema 校验 | 项目陈述，引用 4.0.4 的 `registry.ts` 与 `fiber.ts` | IC-14 |
| effect 释放按登记反序开始，多个异步释放器并发 | 项目陈述 | 生命周期页。完成顺序不是业务关闭顺序 |
| `ACTIVE` 不是业务就绪 | 项目陈述 | 生命周期页 |
| 调用方 Context | 假设 | 本卡未跑探针 |
| isolate 的公开 API | 假设 | 本卡未跑探针 |
| `set()` 换值后依赖插件是否重跑 | 假设 | 本卡未跑探针 |
| 进入 `ACTIVE` 之后的异步错误 | 假设 | 本卡未跑探针 |

探针文件仍在 `packages.0.0.1.legacy/core/kernel-basis`。搬迁归 #270。本规格不把旧包当成新的辅助层。

## 验收对照

C1。上表给出消费者类别、调用场景和失败。Fiber 状态辅助不进入公开入口。

C2。三个入口的职责、失败和生命周期写在本文件。根入口不导入 Cordis。本包不侵占 assembly 的关闭协议，也不成为业务 Service 的目录。

C3。版本钉是 4.0.4。上表把假设留在假设。可复跑探针尚未在本卡执行。

C4。#270 按本文件实现公开行为、选定测试装配的导出名，并搬迁探针文件。本文件不声称生产包已经实现。D-03 接受技术选择。D-04 才接受整卡结果。
