# @omne-harness/harness-server

[English](README.md)

Harness Server 装配的私有应用成员。S0 模式经真实 Cordis 装载标记替身，检查装载次序、可见性、就绪和有序关闭。它不处理任何请求。

## 职责与状态

本成员拥有 S0 装配入口：两层插件树、受信子树的可见性、就绪报告和有序关闭。它不拥有业务行为，可复用的行为留在 `packages/`。行为写在 [SPEC.md](SPEC.md)。该规格来自 #1001 的 S0 实施规格 r2，不是已接受的产品承诺。

已经实现：

- 两层插件树和边界 schema。
- 装载器、受信子树的可见性和就绪报告。
- 应用装配页的行快照 `src/s0/aa-rows.json`、它的生成脚本和差分检查。
- 关闭协调器和进程入口 `dist/bin.js`。
- `./cordis` 导出，只含 S0 替身插件。

SPEC.md「有序关闭」一节有三项裁定标明「待代码合回」：启动次序、停止状态后不再调用 `start`、启动期 `start` 抛出的处置。代码合回之前，它们是目标。

S0 不接 HTTP，不创建租户，不打开业务状态根，不读真实秘密。S0 通过不表示首条租户路径可运行。

## 使用

先构建，再运行进程入口：

```sh
pnpm --filter @omne-harness/harness-server run build
node apps/harness-server/dist/bin.js s0 --distribution <绝对 JSON 路径> [--operator <绝对 JSON 路径>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
```

用法错误时，stderr 先写 `s0: <原因>`，再写下面这行用法。退出码为 2：

```text
usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
```

`.` 导出提供类型和 `runS0`：

```ts
import { runS0 } from '@omne-harness/harness-server'
import type {
  RunS0Options,
  S0Record,
  S0Result,
  ShutdownReport,
  TreeRow,
} from '@omne-harness/harness-server'
```

`./cordis` 导出只含 S0 替身插件。导出名就是发行配置 JSON 里 `plugin` 的取值。示例发行配置是 `config/s0.distribution.json`。

`src/s0/aa-rows.json` 是应用装配页的行快照。装载器和 `check:aa-rows` 读取它。不要手工编辑，用「维护」一节的命令再生。

## 契约

行为归 [SPEC.md](SPEC.md)。它包含插件树与运维规则、装载前检查、就绪规则、输出记录、退出码，以及「有序关闭」一节。数据形状归 `src/types.ts`。

承诺摘要：

- 根上不能按名取得受信名，子树行可以。
- PENDING 与 FAILED 分开报告。超时不把 PENDING 改为 FAILED。
- 关闭按 `entry`、`business`、`composition`、`storage` 四个阶段依次进行，全部阶段共用一个截止时间。错过截止时间的句柄记为 `incomplete`，下一阶段仍然执行。
- 报告先确定，之后才调用 `assemblyReportSettled()`。
- 退出码 `5` 表示启动成功而关闭 `incomplete`。

## 设计

装配入口创建根 `Context`，为每个作用域建一个私有标签，在隔离上下文中装载每一行，并读取真实的 fiber 状态。参加关闭的行向 `assemblyLifecycle` 登记句柄。协调者只持有句柄，不持有插件对象。协调者不关闭业务连接。

## 配置与运行

| 输入                     | 作用                           |
| ------------------------ | ------------------------------ |
| `--distribution`         | 发行层 JSON 的绝对路径。       |
| `--operator`             | 运维层 JSON 的绝对路径，可选。 |
| `--readiness-timeout-ms` | 正整数，就绪等待上限。         |
| `--shutdown-deadline-ms` | 正整数，共用的关闭截止时间。   |

要求：Node `>=24`，来自 `engines.node`。运行时依赖是 `@deepseek-ai/cordis`、`@omne-harness/kernel-basis` 和 `zod`。进程不读环境变量，不读真实秘密。

## 验证

在仓库根运行：

```sh
pnpm run check:docs
pnpm --filter @omne-harness/harness-server run typecheck
pnpm --filter @omne-harness/harness-server run build
pnpm --filter @omne-harness/harness-server run test:fast
pnpm --filter @omne-harness/harness-server run test:slow
pnpm --filter @omne-harness/harness-server run check:aa-rows
```

`test:slow` 会启动 `dist/bin.js`，所以要先运行 `build`。`check:aa-rows` 比较行快照与应用装配页。

测试清单在 [tests/README.md](tests/README.md)。测试使用替身，不使用真实 SQL 提供者、真实身份和真实存储。替身通过不证明耐久性或真实供应商行为。

未覆盖：

- SPEC.md 中标明「待代码合回」的三项裁定，在代码合回之前没有通过的测试。
- Windows 与 Linux 分别报告。一个平台的结果不覆盖另一个平台。
- 对 `ctx.reflect.store` 的反射遍历是已记录的非保证。

## 维护

先改 [SPEC.md](SPEC.md)，再改代码和测试。没有 S0 闭包计划的拥有者同意，不要改 `src/types.ts`，因为所有 S0 模块都依赖它。应用装配页改动插件树或受信子树表时，在同一批次重新生成行快照：

```sh
cd apps/harness-server
node scripts/aa-rows.mjs write --aa ../../docs/architecture/runtime/application-assembly.md --rows src/s0/aa-rows.json
```

然后手工更新 `src/s0/stubs.ts`，使它跟随变化的行。

[README.md](README.md) 与本文件保持同步。两个文件表达同一份承诺。
