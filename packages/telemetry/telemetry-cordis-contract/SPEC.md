# @omne-harness/telemetry-cordis-contract 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `src/cordis.ts` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。端口的行为（不抛错、字段与绑定校验、作用域、carrier、段、关闭报告）归 [telemetry-contract 的 SPEC](../telemetry-contract/SPEC.md)（TC-1～TC-15），本文件不重复。本文件的条款编号为 TS。

## 范围与依据

本包拥有遥测唯一的 Cordis 服务定义 `telemetry`：抽象类 `TelemetryService`、键常量 `telemetryKey` 与 `Context.telemetry` 增补。

状态：候选，第一版。设计依据是 [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md) 的 D02（纯契约、Cordis 定义与 Node 提供者三个成员）。RFC 还没有接受，接受前本文件的全部条款都是候选范围。拆分的直接依据是仓库约定：纯契约成员的安装闭包里不能有 Cordis（IC-4），而 `dependencies` 属于整个包，所以 Cordis 定义不能与纯契约同包。

本包不拥有：端口规则与校验（`telemetry-contract`）；提供者、运行时、出口与关闭报告（`telemetry-node`）；行、注入清单与装配（`apps/harness-server`）。

## 结果与不变量

### TS-1 键只写一次

服务键是 `TelemetryService.provide`，值为 `telemetry`。`telemetryKey` 取自它。提供者 `extends TelemetryService`，不另写键，也不自己 `ctx.provide`（IC-2）。消费者只引用 `telemetryKey`，不引用提供者的实现入口（IC-5）。

### TS-2 服务实现端口

`TelemetryService implements TelemetryPort`。第一版的端口只有 `bind(binding): Emitter`，由子类实现。`bind` 的行为归 telemetry-contract 的 TC-1、TC-2 与 TC-4：同步、不抛错、无效绑定得到答 `dropped(invalid)` 的 emitter。本包不在服务上加端口以外的方法。

### TS-3 注入与在场

发射方的行把 `telemetryKey` 写进 `inject` 数组字面量（IC-8）。键缺席时，注入它的插件停在 `PENDING`；遥测缺席是装配失败，不是静默的 no-op。关闭遥测由在场的禁用提供者表达，由 `telemetry-node` 兑现（IC-9）。一个 isolate 标签下只有一个 `telemetry` 提供者（IC-6）。

### TS-4 服务不授权

服务不核验主体，不从 `Binding.scope` 推断权限，也不授予任何权限（IC-18）。scope 是操作参数，由调用方显式给出，必须由 legal-identity 铸造（TC-4）。

### TS-5 根入口不导出值

根入口 `@omne-harness/telemetry-cordis-contract` 不导出任何值，也不导入 Cordis（IC-4）。Cordis 值只在 `./cordis`。

## 所有权、失败与生命周期

- 本包不创建、不持有、也不释放任何运行时资源。`TelemetryService` 的构造函数只调用 `super(ctx, 'telemetry')`。
- 提供者在自己的插件装载上下文里创建运行时资源，并负责撤除、排空与关闭报告。Service 方法里的 `this.ctx` 是调用方，所以提供者不在 `bind` 里创建或关闭共享资源。
- 提供者的 fiber 撤除后，键不在场：`ctx.get(telemetryKey)` 为 `undefined`。已经取得的 emitter 是不可变的值，随持有者消失（IC-13）。
- 本包没有异步控制、事件或登记目录（IC-10～IC-13）。

## 组合与验证

本包消费 `@deepseek-ai/cordis` 4.0.4（catalog）的 `Service` 与 `Context`，以及 `@omne-harness/telemetry-contract`（workspace 版本）的 `TelemetryPort`、`Binding`、`Emitter` 类型。

| 条款       | 持续验证                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| TS-1、TS-3 | `tests/cordis-entry.spec.ts`：真实 `Context` 上，子类提供键，消费者按 `telemetryKey` 注入并调用 `bind`            |
| TS-2       | 类型层：`TelemetryService implements TelemetryPort`，由 `pnpm run typecheck` 核对                                 |
| TS-5       | `tests/public-entry.spec.ts`：根入口不导出值、构建产物不到达任何模块；`./cordis` 导出两个名字并到达 Cordis        |
| 撤除后缺席 | `tests/cordis-entry.spec.ts`：`dispose` 后 `ctx.get(telemetryKey)` 为 `undefined`                                 |

未覆盖：TS-3 的「停在 `PENDING`」与 TS-4 由装配兑现，验证归 `apps/harness-server`（`tests/rows/telemetry/serve.spec.ts` A11）。真实提供者的 `bind` 归 `telemetry-node`。
