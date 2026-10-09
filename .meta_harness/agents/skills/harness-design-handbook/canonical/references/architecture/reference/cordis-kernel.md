# Cordis 最小内核模型


这一节用于提供者与装配设计：装配之前必须知道内核会兑现什么、不会兑现什么，
否则提供者设计会把内核不给的保证当成已有的。它不是做领域读数与承载读数时的参照。下面是做这类判断的最小事实集，
核对于 `@deepseek-ai/cordis` 4.0.2 源码（行号均指该包 `src/`），辅以 DSH 修订 [`c291e796`][dsh-docs] 的文档；
二者冲突以源码为准。本次实际采用的版本仍从工作区的采用决定读取，与此基线不同就按[来源核对](../../source-check.md)重验。

- **Fiber 是所有权单位，Context 只是解析入口。** `ctx.plugin(plugin, config)` 应用一次插件并返回一条 Fiber
  （`registry.ts:316`）；同一插件可被应用多次，每次一条 fiber（`registry.ts:139-140`）。子 fiber 的 dispose
  注册为父 fiber 的一个 effect（`fiber.ts:265`），父卸载必然带走子。`Fiber.uid` 只是本次 registry 内的实例身份
  （`fiber.ts:185-186`），不能充当持久身份或租户键。
- **加载由依赖声明驱动，重载是常态而非异常。** `inject` 列出必需服务，不齐就停在 `PENDING`；六态为
  `PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING`（`fiber.ts:139-153`）。`Fiber.store` 是必需服务实现的快照
  （`fiber.ts:197-198`），其代际由各提供者 fiber 的 uid 拼成，任一必需服务换了提供者就先卸载再重跑插件体
  （`fiber.ts:611-639`；`ctx.inject(deps, cb)` 同义，`registry.ts:167-176`）；`check` 谓词返回假或提供者非
  `ACTIVE` 亦然（`reflect.ts:274`、`reflect.ts:241`）。所以插件体必须可重复执行，
  跨重载要保留的事实不能只活在插件体的闭包里。
- **只有 effect 注册的副作用被纳管。** `ctx.effect(fn, label)` 收集 disposer，接受单个、Promise 与（异步）生成器多个
  （`fiber.ts:403-418`）。同一 effect 内逆序释放（`fiber.ts:431`）；fiber 卸载时各 effect 也按逆注册序取出
  （`utils.ts:27-31`），但随即由 `Promise.all` 并发驱动，异常只写日志不上抛（`fiber.ts:675-686`）。
  逆序只约束启动顺序：要"先排空再关后端"这类次序和结算，必须自己在一个 effect 内组合。fiber 已进入
  `UNLOADING` 或已 dispose 时再建 effect 抛 `CordisError('INACTIVE_EFFECT')`（`fiber.ts:351-353`、`fiber.ts:419-422`）。
- **服务身份是「服务名 + isolate 标签」，同标签下唯一。** 实现登记在按 isolate symbol 索引的扁平 store，
  同标签重复 provide 直接抛错（`reflect.ts:289-290`）——没有"子上下文默认遮蔽父服务"这回事，要并存两份实现
  就得 `ctx.isolate(name, label)`，同 label 的两次调用合流（`context.ts:121-125`）。解析沿 fiber 链向上，
  父的 isolate 标签一旦不同就抛错、不再上溯（`reflect.ts:154-166`）；换实现引起的重载与 `internal/service`
  默认也只在同标签内传播（`reflect.ts:314`）。提供者 fiber 不在 `ACTIVE` 时该服务读不到（`reflect.ts:237-241`）。
- **事件是五种派发，不是一条消息总线。** `emit` 同步派发且不等待返回的 Promise（`events.ts:194-196`），
  `parallel` 并发全等，`serial` 顺序逐个 await，`bail` 同步到首个 bail 值，`waterfall` 是 around 中间件、
  外层先跑、不调 `next()` 即短路（`events.ts:183-243`）。派发模式是事件契约的一部分。过滤器取自派发时的
  `thisArg`：不带 thisArg 的 `ctx.emit(name, ...)` **不过滤**，`on(..., { global: true })` 的监听者一律绕过过滤
  （`events.ts:165-175`）；服务的默认过滤器比较 isolate 标签（`service.ts:61-63`）。
- **配置沿上下文向下注入。** `ctx.intercept(name, config)` 只影响其下装载的插件，祖先在先、近者在后合并
  （`context.ts:128-145`、`service.ts:86-102`）；`fiber.update(config)` 先走 `internal/update` waterfall
  （HMR 可否决或替换）再重启该 fiber（`fiber.ts:736-752`）。

| 原语                                          | 它是什么                                                        | 装配时用它回答                 |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| `Context`                                     | 解析入口；`extend`/`isolate`/`intercept` 派生子上下文           | 谁看得见什么，配置从哪来       |
| `Fiber`                                       | 一次插件应用的运行实例，持有 config、依赖快照、effect 与清理    | 谁拥有资源，何时对外可用       |
| `inject` / `Fiber.store`                      | 必需服务声明与其实现快照                                        | 依赖缺席或更换时谁被卸载重跑   |
| `ctx.provide` / `Service`                     | 在某个 isolate 标签下登记一份实现                               | 能力对消费者的服务面           |
| `ctx.effect`                                  | 纳管的副作用及其 disposer                                       | 撤除时释放什么、交接什么       |
| `ctx.isolate` / `ctx.intercept`               | 服务可见性作用域 / 向下游注入服务配置                           | 作用域实例与政策下发           |
| `emit` `parallel` `serial` `bail` `waterfall` | 五种派发                                                        | 是否等待、谁决定结果、失败去哪 |

`isolate` 隔离的是服务实例的**可见性**，不是数据本身：一个服务实例内部握着跨租户的数据句柄，隔离多少次都无效，
租户判定仍归数据访问层的身份校验。上游 DSH 在 Cordis 之上另有 `dsh-scope` 等包，它自述不是沙箱也不是权限边界，
其 Known Limitations 属于那个以 agent 为键的上层 scope，不能算到 Cordis 原生 `isolate` 头上。
纯数据或纯计算不必制造 Fiber；插件数量和服务键数量都不表示能力维度。

### 什么时候必须去读官方文档

上面足以支撑边界判断。设计一旦依赖下列精确行为，就停下来核对；方法与记录格式归[来源核对](../../source-check.md)，
历史修订的定位线索与来源清单归 [Cordis 映射](cordis-mapping.md)。

| 设计开始依赖                                                   | 去读采用版本的源码，再对照官方页                     |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| 精确的重载/卸载时机、并发重入、`await()` 与 `restart()` 的结算 | `src/fiber.ts` + [fiber API][fiber-api]              |
| 某个事件的等待、顺序、返回值或过滤语义                         | `src/events.ts` + [events API][events-api]、[Primer 派发表][primer] |
| config 校验、`internal/update`、HMR 或 loader 的取值时机       | `src/registry.ts` + [registry API][registry-api]、[Primer Loader 段][primer] |
| 服务解析、`provide`/`set`/`accessor`/`mixin` 与 isolate 的交互 | `src/reflect.ts`、`src/service.ts` + [service API][service-api]、[context API][context-api] |
| 复用某个 DSH 上层包（scope、agent 等）或判断跨 realm 与装配    | 该包自己的 README + [DSH 架构][dsh-arch]；上游应用策略不是原语契约 |

不在上述情况就不要展开整个上游仓库。核对结论按"主张 → 采用对象/版本 → 原始证据位置 → 适用范围"留下；
上游行为是事实，采用与否仍是本项目的选择。


[dsh-docs]: https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/docs
[primer]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-primer.md
[fiber-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/fiber.md
[events-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/events.md
[registry-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/registry.md
[service-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/service.md
[context-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/context.md
[dsh-arch]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/architecture.md
