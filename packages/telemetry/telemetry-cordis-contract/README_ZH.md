# @omne-harness/telemetry-cordis-contract

[English](README.md)

工程遥测的 Cordis 服务定义：抽象类 `TelemetryService`、键常量 `telemetryKey`（`telemetry`）与 `Context.telemetry` 增补，都在 `./cordis`。根入口不导出值。纯契约是 `@omne-harness/telemetry-contract`。

## 职责与状态

本包拥有遥测唯一的 Cordis 接缝。提供者继承 `TelemetryService` 并实现 `bind` 与 `discard`。消费者注入 `telemetryKey`。服务不授权任何事：绑定里的 scope 说明记录属于谁，不说明调用方可以做什么。

状态：候选，第一版。设计依据是 [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md) 的 D02（三个成员，照 `model-contract` 与 `model-cordis-contract` 的先例）。RFC 还没有接受，所以 [SPEC.md](SPEC.md) 的全部条款都是候选。纯契约与 Cordis 定义分成两个成员，是为了让只依赖纯契约的领域成员的生产安装闭包里没有 Cordis；Agent 的公开入口测试守着这一条。

具名消费者：Node 提供者 `telemetry-node` 在它的 `./cordis` 里继承 `TelemetryService`。应用 `apps/harness-server` 在 `server-entry` 行注入 `telemetryKey`，在 `telemetry` 行提供它。

本包不拥有端口规则、字段规则、校验、carrier 与捕获替身。它们归 `telemetry-contract`。本包不拥有任何提供者、运行时或出口。它们归 `telemetry-node`。

## 使用

提供者继承服务，不另写键：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Binding, Emitter, TelemetryPort } from '@omne-harness/telemetry-contract'
import { TelemetryService } from '@omne-harness/telemetry-cordis-contract/cordis'

export function createTelemetryPlugin(port: TelemetryPort): new (ctx: Context) => TelemetryService {
  return class TelemetryPlugin extends TelemetryService {
    bind(binding: Binding): Emitter {
      return port.bind(binding)
    }

    discard: TelemetryPort['discard'] = (definition, reason) => port.discard(definition, reason)
  }
}
```

消费者注入键，读 `ctx.telemetry`：

```ts
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'

export const consumer = {
  inject: [telemetryKey],
  apply(ctx: Context) {
    const emitter = ctx.telemetry.bind({ scope, component: 'probe', instance })
    emitter.event(definition, fields)
  },
}
```

独立使用不是本包的目标：根入口不导出任何东西，`./cordis` 需要 `@deepseek-ai/cordis`。安装本包会带入 Cordis 与 `@omne-harness/telemetry-contract`。本包没有初始化，也没有释放。提供者在自己的插件上下文里创建资源。

## 契约

- 公开类型：[src/cordis.ts](src/cordis.ts)，索引见 [docs/public-api.md](docs/public-api.md)。
- 类型以外的行为：[SPEC.md](SPEC.md)。它拥有键规则、注入规则与不持有资源规则。
- 错误：服务自己不抛错。`bind` 与 emitter 的行为是 `telemetry-contract` 的端口契约（TC-1：不抛错）。

## 设计

一个抽象 `Service` 子类，只有一个静态字段，外加一处 `Context` 增补。设计见 [docs/architecture.md](docs/architecture.md)、[docs/object-model.md](docs/object-model.md) 与 [docs/flows.md](docs/flows.md)。

## 配置与运行

本包没有配置，除 Cordis 4.0.4（catalog）外没有环境要求。显式依赖：`@deepseek-ai/cordis` 与 `@omne-harness/telemetry-contract`。

## 验证

在成员目录运行：

```sh
pnpm run build
NO_COLOR=1 pnpm exec vitest run --mode fast
pnpm run typecheck
```

`tests/cordis-entry.spec.ts` 用真实的 Cordis `Context`：子类提供键，消费者按常量注入，提供者撤除后键不在场。`tests/public-entry.spec.ts` 读取构建产物 `dist`：根入口不导出任何东西、不到达任何模块；`./cordis` 导出两个名字并到达 Cordis。真实提供者不在本包覆盖范围内，它归 `telemetry-node`。

## 维护

改 `TelemetryService` 或它的键会影响 `telemetry-node`、`apps/harness-server` 与每个发射行。键只在静态字段写一次。给服务加方法时，先在 `telemetry-contract` 的 `TelemetryPort` 加对应成员。不要给根入口加值导出：根入口不带 Cordis（IC-4）。

## 目录结构与文档职责

```text
README.md, README_ZH.md   入口：用途、状态与本图
index.md                  包内阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
├── architecture.md       模块、状态与资源归属、机制
├── flows.md              关键流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费方式与系统位置
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、校验与实现
└── cordis.ts             telemetry 服务、键与 Context 增补
tests/                    持续测试；fixtures/ 放测试输入
schema/                   对外 Schema（无）
verification/             models/ 与 proofs/（无）
adr/                      有持续消费者的实现取舍（无）
examples/                 针对公开入口的示例（无）
resources/                运行所需的非源码资源（无）
acceptance/               独立验收；fixtures/ 放其输入（无）
```

每个目录有 README.md 说明职责，有 index.md 做导航。阅读路径见 [index.md](index.md)。
