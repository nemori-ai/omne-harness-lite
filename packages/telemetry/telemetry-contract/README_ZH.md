# @omne-harness/telemetry-contract

[English](README.md)

工程遥测的纯契约：作用域绑定、声明式定义、字段与绑定的校验、carrier 编解码、准入结果和关闭报告的形状。本包还持有一个有界捕获替身。Cordis 服务定义 `telemetry` 归成员 `@omne-harness/telemetry-cordis-contract`，所以安装本包不带入 Cordis。

## 职责与状态

本包拥有全部遥测提供者与发射领域共用的形状和规则。规则只在这里写一份。提供者调用 `validateFields` 与 `validateBinding`，不另写一份规则。

状态：候选，第一版。设计依据是 [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md) 的 B 线。RFC 还没有接受，所以 [SPEC.md](SPEC.md) 的全部条款都是候选。根入口与 `./testing` 已经实现并有测试。`health()` 随 OTel 推迟，第一版没有它。`Carrier`、`defineMetric` 与 `Emitter.record` 是预留：有形状、有校验、有测试，第一版没有消费者，为推迟的 OTel 链路与指标保留。

具名消费者：Cordis 定义成员 `telemetry-cordis-contract` 的抽象服务实现 `TelemetryPort`。Node 提供者 `telemetry-node` 用本包的函数校验。应用 `apps/harness-server` 声明入口诊断事件。Session 与 Agent 的遥测 facade 用本包的定义与端口。

本包不拥有输出格式、队列、采样、预算、SDK 与后端。它们归提供者。

## 使用

在发射领域里声明定义。用 `@omne-harness/legal-identity` 铸造的作用域绑定 emitter：

```ts
import { tenantScope, type TenantId } from '@omne-harness/legal-identity'
import { defineEvent, type TelemetryPort } from '@omne-harness/telemetry-contract'

const stepFailed = defineEvent({
  owner: 'packages/session/session',
  name: 'omne.session.step.failed',
  version: 1,
  level: 'error',
  schema: {
    code: { kind: 'enum', values: ['timeout', 'refused'] },
    step: { kind: 'ref', owner: 'packages/session/session', maxBytes: 64, optional: true },
  },
})

function report(port: TelemetryPort, tenant: TenantId): void {
  const emitter = port.bind({
    scope: tenantScope(tenant),
    component: 'session',
    instance: { owner: 'apps/harness-server', ref: 'process-1' },
  })
  emitter.event(stepFailed, { code: 'timeout' })
}
```

带 `optional: true` 的字段规则允许字段缺席。字段在场时照常校验。

独立使用只需要根入口。根入口在运行时只依赖 `@omne-harness/legal-identity`。本包的生产安装闭包里没有 Cordis。Cordis 集成从 `@omne-harness/telemetry-cordis-contract/cordis` 导入 `TelemetryService` 与 `telemetryKey`。发射领域的测试使用 `./testing` 的 `createCapturingTelemetry`。

本包没有初始化，也没有释放。emitter 是不可变的值。

## 契约

- 公开类型与运行时校验：[src/index.ts](src/index.ts)，索引见 [docs/public-api.md](docs/public-api.md)。
- 类型以外的行为：[SPEC.md](SPEC.md)。它拥有不抛错规则、字段规则、可选字段规则、作用域规则、carrier 格式、结构上限与关闭报告的确认边界。
- 错误：`define*` 与 `encodeCarrier` 对非法输入抛 `TypeError`。端口操作与校验函数不抛错，它们答 `dropped(invalid)` 或 `invalid`。

## 设计

根入口有五个纯模块：limits、definitions、fields、binding、carrier，另有端口类型。`./testing` 持有捕获替身。设计见 [docs/architecture.md](docs/architecture.md)、[docs/object-model.md](docs/object-model.md) 与 [docs/flows.md](docs/flows.md)。

## 配置与运行

本包没有配置。`TELEMETRY_LIMITS` 是契约的结构上限，不是运行预算。预算属于提供者配置。捕获替身只有一个选项 `capacity`（默认 1024）。

## 验证

在成员目录运行：

```sh
NO_COLOR=1 pnpm exec vitest run --mode fast
pnpm run typecheck
```

测试是单元测试和从公开入口做的契约测试。`tests/public-entry.spec.ts` 读取构建产物 `dist`，所以先运行 `pnpm run build`。它核对两个入口不到达任何 Cordis 模块和 Node 内置模块，并核对生产安装闭包没有通向 Cordis 的路径。在仓库根运行 `pnpm run lint:deps` 核对依赖方向。真实提供者和真实后端不在本包覆盖范围内，它们归 `telemetry-node`。

## 维护

改公开类型或 SPEC.md 的规则会影响 `telemetry-cordis-contract`、`telemetry-node` 与 `apps/harness-server`。规则只在一处改：`src/` 的校验函数。SPEC.md 的条款与测试同步修改。新增字段规则种类时，需要新增校验分支和 SPEC 条款，并核对它没有引入自由文本路径。不要给本包加 Cordis 依赖：安装闭包测试与 Agent 的公开入口测试都守着这一条。`health()` 随 OTel 推迟；重开之前不加它。

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
└── cordis.md             指针：Cordis 定义在另一个成员
src/                      公开定义、校验与实现
└── testing/              捕获替身
tests/                    持续测试；fixtures/ 放测试输入
schema/                   对外 Schema（暂无）
verification/             models/ 与 proofs/（暂无）
adr/                      有持续消费者的实现取舍
examples/                 针对公开入口的示例
resources/                运行所需的非源码资源（无）
acceptance/               独立验收；fixtures/ 放其输入
```

每个目录有 README.md 说明职责，有 index.md 做导航。阅读路径见 [index.md](index.md)。
