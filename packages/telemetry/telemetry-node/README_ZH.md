# @omne-harness/telemetry-node

[English](README.md)

工程遥测的 Node 提供者。第一版只有本地出口，不导出 OTel 链路与指标。根入口是运行时与禁用实现。`./cordis` 有两个插件工厂与 Cordis 日志桥。命令 `omne-telemetry-summary` 把记录离线聚合成热点报告。

## 职责与状态

本包兑现 [telemetry-contract](../telemetry-contract/README_ZH.md) 的端口：校验每条记录，放进有界队列，排空到本地出口，保有计数，并在关闭时返回 `CloseReport`。本地出口是应用交入的记录写函数（stdout 或 stderr），或 Pino 10.4.0 同步 destination 写的文件。

状态：第一版本地范围已采用。设计依据是 [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md) 的 B 线。RFC revision 2 已采用本地范围，推迟项不在此次决定中。运行时、禁用实现、日志桥与两个插件已经实现并有测试。

具名消费者：应用 `apps/harness-server` 创建运行时，装配 `telemetry` 行，并在关闭步骤里显式关闭运行时。

本包不做 OTel traces 与 metrics、OTLP 与 `health()`，也不做输出代的换代与管理面。这些是推迟项，见 RFC-0013「后续」。

## 使用

应用创建运行时并持有它：

```ts
import { randomBytes } from 'node:crypto'
import { createTelemetryRuntime } from '@omne-harness/telemetry-node'

const runtime = createTelemetryRuntime({
  generation: 'g1',
  instance: { owner: 'apps/harness-server', ref: 'run-1' },
  clock: { now: () => new Date(), monotonicMs: () => performance.now() },
  randomBytes: size => randomBytes(size),
  outlet: { kind: 'writer', write: record => writeRecord(record) },
  budgets: {
    maxRecordBytes: 16_384,
    maxQueueItems: 4096,
    maxQueueBytes: 8_388_608,
    maxOpenSegments: 1024,
    maxLogTextLength: 4096,
    summaryIntervalMs: 10_000,
    maxSegmentLifetimeMs: 3_600_000,
  },
  summary: line => process.stderr.write(`${line}\n`),
})

const report = await runtime.close(5000)
```

示例里的预算数只是示例，不是默认值。六个第一版预算没有默认值，数值由应用的配置给出。`maxSegmentLifetimeMs` 可选，缺省 3600000 毫秒（1 小时），见 SPEC.md TN-1 与 TN-6。

Cordis 集成从 `@omne-harness/telemetry-node/cordis` 导入：

```ts
import {
  createCordisLogBridge,
  createTelemetryNodePlugin,
} from '@omne-harness/telemetry-node/cordis'

const bridge = createCordisLogBridge({
  bootstrapCapacity: 256,
  write: writeRecord,
  clock,
  maxTextLength: 4096,
})
root.logger.exporter(bridge.exporter)
await root.plugin(createTelemetryNodePlugin({ runtime }))
bridge.attach(runtime, { replayBootstrap: false })
```

独立使用只需要根入口。根入口不导入 Cordis。安装本包会带入 `@deepseek-ai/cordis` 与 `pino`，因为 `dependencies` 属于整个包。

不需要遥测的部署用 `createDisabledTelemetry()` 与 `createDisabledTelemetryPlugin({ runtime })`。禁用实现是在场的提供者：每次调用答 `dropped(disabled)`，并在关闭报告里计数。

### 离线热点报告

命令 `omne-telemetry-summary` 读 JSON Lines（`serve` 的 stdout，或 `file` 出口的文件），打印按段统计的报告。在本仓库里先构建本包，再运行构建产物：

```sh
pnpm --filter @omne-harness/telemetry-node run build
node packages/telemetry/telemetry-node/dist/summary-cli.js telemetry.log
node packages/telemetry/telemetry-node/dist/summary-cli.js --json < telemetry.log
```

缺省输出是表格，段按 p95 降序。`--json` 打印机读报告。`--tenant` 与 `--from`、`--to` 筛选记录。聚合规则由根入口导出的纯函数 `summarizeTelemetry` 实现（[src/summary.ts](src/summary.ts)），见 SPEC.md TN-11。步骤与函数级 CPU profile 的用法见 [docs/flows.md](docs/flows.md#离线热点分析)。报告只供运维者在本机使用。

## 契约

- 公开类型：[src/index.ts](src/index.ts) 与 [src/cordis.ts](src/cordis.ts)，索引见 [docs/public-api.md](docs/public-api.md)。
- 类型以外的行为：[SPEC.md](SPEC.md)。它拥有准入次序、记录形状、排空、计数与摘要、段、关闭报告的填写规则、禁用实现、日志桥、插件与离线热点聚合。端口的共同规则归 telemetry-contract 的 SPEC。
- 错误：`createTelemetryRuntime` 对非法选项抛 `TypeError`，对打不开的文件抛 `Error`。端口操作、`ingestLog` 与日志桥的 exporter 不抛错。`close` 不拒绝。`summarizeTelemetry` 不抛错，非法行计入 `skipped`。`omne-telemetry-summary` 对用法错误以退出码 2 结束，对读不了的输入以退出码 1 结束。
- 资源：应用持有运行时并负责显式关闭。`file` 出口的文件描述符归运行时，`writer` 出口背后的流归应用。

## 设计

运行时由四个模块组成：`options` 校验选项，`pipeline` 持有队列、计数、摘要与关闭，`outlet` 封装两种出口，`emitter` 实现端口。离线聚合在运行时之外：`summary` 是纯函数，`summary-cli` 是它的命令行入口。设计见 [docs/architecture.md](docs/architecture.md)、[docs/object-model.md](docs/object-model.md) 与 [docs/flows.md](docs/flows.md)。

## 配置与运行

全部配置是 `createTelemetryRuntime` 的选项与 `createCordisLogBridge` 的选项。预算的含义与失败行为见 SPEC.md TN-1、TN-2、TN-6。运行环境是 Node 24 或更新的版本。`file` 出口需要一个可写、父目录已存在的路径。

应用负责：配置的校验与来源、stdout 的唯一写者、关闭顺序、把 `CloseReport` 与日志桥的计数写进关闭报告。

## 验证

在成员目录运行：

```sh
NO_COLOR=1 pnpm exec vitest run --mode fast
pnpm run typecheck
```

测试是单元测试和集成测试。文件出口用真实的临时文件，日志桥与插件用真实的 Cordis 4.0.4 `Context`，scope 由真实的 legal-identity 铸造。`tests/summary.spec.ts` 聚合运行时真实写出的记录，`tests/summary-cli.spec.ts` 在进程内调用命令。`tests/public-entry.spec.ts` 读取构建产物 `dist`，所以先运行 `pnpm run build`。在仓库根运行 `pnpm run lint:deps` 核对依赖方向。应用装配与关闭顺序不在本包覆盖范围内。

## 维护

改记录形状、关闭报告的填写规则或日志桥的状态，会影响 `apps/harness-server`。SPEC.md 的条款与测试同步修改。新增出口时，在 `outlet.ts` 加一种 `Outlet`，并在 SPEC TN-4、TN-7 写明它的确认边界与 transport 结果。`health()` 随 OTel 推迟；重开之前不加它。

## 目录结构与文档职责

```text
README.md, README_ZH.md   入口：用途、状态与本图
index.md                  包内阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
├── architecture.md       模块、状态与资源归属、机制
├── flows.md              准入到出口、关闭、日志桥的状态
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费方式与系统位置
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、校验与实现
├── cordis.ts             插件工厂与日志桥入口
├── log-bridge.ts         Cordis 日志桥
├── summary.ts            离线热点聚合
└── summary-cli.ts        命令 omne-telemetry-summary
tests/                    持续测试；fixtures/ 放测试输入
schema/                   对外 Schema（暂无）
verification/             models/ 与 proofs/（暂无）
adr/                      有持续消费者的实现取舍
examples/                 针对公开入口的示例
resources/                运行所需的非源码资源（无）
acceptance/               独立验收；fixtures/ 放其输入
```

每个目录有 README.md 说明职责，有 index.md 做导航。阅读路径见 [index.md](index.md)。
