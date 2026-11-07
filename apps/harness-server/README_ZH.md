# @omne-harness/harness-server

[English](README.md)

Harness Server 的应用装配。它经 Cordis 装载插件树，检查各行装载、报告就绪，并按次序关闭。两个模式使用同一棵树：`s0` 装载标记替身，作为检查运行；`serve` 以正式服务键装载同一批行，等停止请求。用它验证一次装配，或运行一个由运维者启动和停止的服务器进程。

## 职责与状态

本成员拥有装配入口：两层插件树、受信子树的可见性、就绪报告和有序关闭。它不拥有业务行为，可复用的行为留在 `packages/`。[SPEC.md](SPEC.md) 拥有 S0 入口的行为。它是工作规格，不是已接受的产品承诺。

已经实现：

- 两层插件树和边界 schema。
- 装载器、受信子树的可见性和就绪报告。
- 行快照 `src/s0/aa-rows.json`、它的生成脚本和差分检查。
- 发行内置 Tool 清单 `config/tool-release.json`、生成脚本 `scripts/tool-release.mjs` 与它的核对。见 [docs/rows/tool-release.md](docs/rows/tool-release.md)。
- Model 生产接线：`model-records`、`model-host` 两行、应用 Model 模块 `src/model/` 与真件 `modelHostAuthority`。见 [docs/rows/model-release.md](docs/rows/model-release.md)。
- 关闭协调器和进程入口 `dist/bin.js`。
- `./cordis` 导出，含 S0 替身插件。各行闭包把真实导出加进去。
- 真实模式的子命令 `serve`、行声明 `defineRow`、入口对象注册表与装载前检查。见 [docs/real-mode.md](docs/real-mode.md)。
- `telemetry` 行（工程遥测的 Node 提供者，本地第一版）、三态 Cordis 日志桥、入口诊断事件 `omne.entry.diagnostic`，以及有序关闭里的遥测关闭步骤。见 [docs/rows/telemetry.md](docs/rows/telemetry.md)。
- 应用里的会话诊断投影（RFC-0013 revision 2 A 线）：`model-records` 行提供 `modelDiagnostics`，`server-entry` 行注入 `agentJournal`、`modelDiagnostics`、`modelRuntime`，按调用现取 `toolRuntime`。本机单用户档披露投影的全部种类。见 [docs/rows/server-entry.md](docs/rows/server-entry.md) 与 [docs/rows/model-release.md](docs/rows/model-release.md#诊断读面-modeldiagnostics)。

SPEC.md 里的有序关闭规则（启动次序、停止状态后不再调用 `start`、启动期 `start` 抛出的处置）已经实现。`tests/shutdown.spec.ts` 与 `tests/s0-process.spec.ts` 覆盖它们。

S0 不接 HTTP，不创建租户，不打开业务状态根，不读真实秘密。S0 通过不表示租户可以创建或使用。

`serve` 模式以正式服务键装载同一批行。示例配置里，存储、身份、授权、会话存储与提供者、Agent 采用、采用来源、Tool 绑定、Tool 宿主、常驻引用桥接、服务端接入与遥测这些行是真实实现，其余行仍是替身。所以 `serve` 通过只检查装配，不检查完整的租户路径。

## 使用

### 在本机运行服务

一个人在自己的宿主上运行服务时，用本机单用户档。先构建，再配置一次，之后每次只运行 `serve`。Windows 与 Linux 的命令相同：

```sh
pnpm exec turbo run build --filter="@omne-harness/harness-server..." --filter="@omne-harness/cli..."
node apps/harness-server/dist/bin.js setup            # 提示输入模型凭据（OpenRouter API key），输入不显示
node apps/harness-server/dist/bin.js serve            # Ctrl+C 停止
```

- `setup` 把凭据放进状态目录里的保管库，把端口、工作区和 Shell 写进配置文件。配置文件里没有秘密。凭据也可以经管道给出，例如 `printf '%s\n' "$KEY" | node apps/harness-server/dist/bin.js setup`。
- 位置：Windows 上是 `%LOCALAPPDATA%\omne\config` 与 `%LOCALAPPDATA%\omne\state`。Linux 上是 `~/.config/omne` 与 `~/.local/state/omne`（遵守 `XDG_CONFIG_HOME`、`XDG_STATE_HOME`）。`OMNE_SERVER_HOME=<目录>` 把两者移到 `<目录>/config` 与 `<目录>/state`。
- 可选参数：`--port <n>`（默认 8787）、`--workspace <目录>`（默认 `<状态目录>/workspace`）、`--shell <可执行文件>`（Windows 默认 Windows PowerShell，其他平台默认 `/bin/bash`）。
- Shell 工具的环境是 `setup` 当时的 `PATH` 与少数白名单变量，不含名字像秘密的变量。Windows 上 PowerShell 以 `-ExecutionPolicy Bypass` 启动，能运行本地脚本，并带一段 UTF-8 前导，Shell 输出的中文能原样到达模型。白名单见 [SPEC.md](SPEC.md#shell-的环境)。
- 再次运行 `setup` 只检查，不覆盖。它会打开保管库，读不出时报错，不报 kept。改设置要加 `--reconfigure`。设置文件不合格时，要用默认值替换它，加 `--reset`。换凭据，或者用新的保管库替换读不出的那份，加 `--replace-credential`。
- `serve` 不带参数时读这份配置。没有运行过 `setup` 时，它提示先运行 `setup`，以退出码 2 退出。
- `omne` CLI 不带 `--server` 且没有 `OMNE_SERVER` 时，连接配置文件里的端口。

规则全文见 [SPEC.md](SPEC.md#本机单用户档)。

### 两个模式与全部参数

`s0` 与 `serve` 两个位置参数选择模式：

```sh
pnpm --filter @omne-harness/harness-server run build
node apps/harness-server/dist/bin.js s0 --distribution <绝对 JSON 路径> [--operator <绝对 JSON 路径>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
node apps/harness-server/dist/bin.js serve [--distribution <绝对 JSON 路径>] [--operator <绝对 JSON 路径>] [--readiness-timeout-ms <n>] [--shutdown-deadline-ms <n>] [--state-root <绝对目录>] [--stop-on-stdin-close]
```

`serve` 省略的参数取本机单用户档的值：发行文件用随应用的 `config/serve.distribution.json`，超时取 30000 与 10000 毫秒，运维者层与状态根来自 `setup` 的配置。

`s0` 写出启动结果后自动停止。`serve` 等停止请求：带 `--stop-on-stdin-close` 时标准输入关闭、SIGINT 或 SIGTERM。Windows 上只有关闭标准输入能让别的进程停止它。

`serve` 下，级别不高于 WARN 的 Cordis 日志与入口诊断都以 `telemetry` 记录写到 stdout（`kind: 'telemetry'`，每条一行 JSON）。原来的 `log` 记录（`{ kind: 'log', level, name, text }`）不再写出。这是本应用输出的破坏性变化，依据是 RFC-0013 的 B 线（候选）。stdout 只有一个写者，所以 `shutdown-result` 是最后一行。记录形状与关闭报告的 `telemetry` 字段见 [SPEC.md](SPEC.md#进程输出与退出码) 与 [docs/rows/telemetry.md](docs/rows/telemetry.md)。

用法错误时，标准错误先写 `<子命令>: <原因>`，再写该子命令的用法行。退出码为 2：

```text
usage: s0 --distribution <abs json> [--operator <abs json>] --readiness-timeout-ms <n> --shutdown-deadline-ms <n>
usage: serve [--distribution <abs json>] [--operator <abs json>] [--readiness-timeout-ms <n>] [--shutdown-deadline-ms <n>] [--state-root <abs dir>] [--stop-on-stdin-close]
usage: setup [--port <n>] [--workspace <dir>] [--shell <executable>] [--reconfigure] [--reset] [--replace-credential]
```

只有发行层时，`serve` 不能装载。发行层不写 `execution-host` 与 `agent-host` 的工厂数值，也不写 `agent-host` 的 `loopGuardPolicy`。进程以 `invalid-config` 退出，不进入服务（R2-D229）。运维者层必须给出这些值。省略 `--operator` 时，本机单用户档生成这一层：它从发行层每行的配置开始，再加上 `src/local/operator-defaults.ts` 里的数值。自己写 `--operator` 时要注意，`replace` 不合并：`agent-host` 要把发行层的 `jointCommits` 与 `coordination` 逐字重抄。本档的数值没有测量依据，`loopGuardPolicy` 只有占位采用。已知限制见 [SPEC.md](SPEC.md#已知限制)。

其他程序可以调用 `runS0` 并导入记录类型：

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

`./cordis` 导出含 S0 替身插件与各真实行的导出。导出名就是发行配置 JSON 里 `plugin` 的取值。示例发行配置是 `config/s0.distribution.json` 与 `config/serve.distribution.json`。`s0` 只接受 `stubPlugin`。`serve` 接受每个经 `defineRow` 声明的导出。

`src/s0/aa-rows.json` 是应用装配页的行快照。装载器和 `check:aa-rows` 读取它。不要手工编辑，用「维护」一节的命令再生。

## 契约

行为归 [SPEC.md](SPEC.md)：插件树与运维规则、装载前检查、就绪规则、输出记录、退出码，以及有序关闭。数据形状归 `src/types.ts`。

稳定的承诺：

- 根上不能按名取得受信名，子树行可以。
- PENDING 与 FAILED 分开报告。超时不把 PENDING 改为 FAILED。
- 关闭按 `entry`、`business`、`composition`、`storage` 四个阶段依次进行，全部阶段共用一个截止时间。错过截止时间的句柄记为 `incomplete`，下一阶段仍然执行。
- 报告先确定，之后才调用 `assemblyReportSettled()`。
- 退出码 `5` 表示启动成功而关闭 `incomplete`。
- `serve` 里真实行不依赖 S0 替身，不得到占位，只装在它声明的行 id 上。每条检查都在插件体运行之前决定。

实现细节可以改变：模块划分、替身插件的内部结构，以及快照文件的格式。

## 设计

装配入口创建根 `Context`，为每个作用域建一个私有标签，在隔离上下文中装载每一行，并读取真实的 fiber 状态。参加关闭的行向 `assemblyLifecycle` 登记句柄。协调者只持有句柄，不持有插件对象。协调者不关闭业务连接。

测试清单在 [tests/README.md](tests/README.md)，每个文件及其层级都在那里。真实模式见 [docs/real-mode.md](docs/real-mode.md)。

## 配置与运行

| 输入 | 作用 |
| --- | --- |
| `--distribution` | 发行层 JSON 的绝对路径。`serve` 省略时用 `config/serve.distribution.json`。 |
| `--operator` | 运维层 JSON 的绝对路径，可选。`serve` 省略时由本机单用户档生成。 |
| `--readiness-timeout-ms` | 正整数，就绪等待上限。`serve` 省略时为 30000。 |
| `--shutdown-deadline-ms` | 正整数，共用的关闭截止时间。`serve` 省略时为 10000。 |
| `--state-root` | 只在 `serve`。入口对象状态文件所在的已存在绝对目录。省略时用本机单用户档的状态目录。它的保护是前提：放在运维者的用户目录下。 |
| `--stop-on-stdin-close` | 只在 `serve`。标准输入关闭时发起计划停止。 |
| `OMNE_SERVER_HOME` | 环境变量。`setup` 与 `serve` 用 `<目录>/config` 与 `<目录>/state` 代替平台的标准目录。 |
| `LOCALAPPDATA`、`XDG_CONFIG_HOME`、`XDG_STATE_HOME` | 环境变量。决定平台的标准目录。 |

`setup` 的参数与行为见 [SPEC.md](SPEC.md#setup)。

要求：Node `>=24`，来自 `engines.node`。运行时依赖写在 `package.json`。`s0` 与带全部参数的 `serve` 不读环境变量，不读真实秘密。`setup` 从标准输入读模型凭据，写进状态目录的保管库。`serve` 的模型凭据只来自这个保管库。

## 验证

在仓库根运行：

```sh
pnpm run check:docs
pnpm --filter @omne-harness/harness-server run typecheck
pnpm --filter @omne-harness/harness-server run build
pnpm --filter @omne-harness/harness-server run test:fast
pnpm --filter @omne-harness/harness-server run test:slow
pnpm --filter @omne-harness/harness-server run check:aa-rows
pnpm --filter @omne-harness/harness-server run check:tool-release
```

`test:slow` 会启动 `dist/bin.js`，所以先运行 `build`。`check:tool-release` 从已构建的 `@omne-harness/tool-definitions` 重算 Tool 发行清单，所以先构建该包。

`check:aa-rows` 做三项检查，任何一项不通过时以非零退出码退出：

- 行快照 `src/s0/aa-rows.json` 与应用装配页的插件树和受信表相同。
- 规则 E1，受信名的读法。受信表里的名字只有两种读法：入口对象模块（`src/entry`）经 `env.readTrusted(name)` 读取；行源码（`src/rows`）只在受信表把这个名字列为该行可见时读取。入口模块在根上对受信名用 `get`、下标、`ctx.<名>` 或别名导入时不通过。行源码提到本行看不见的受信名时不通过。
- 规则 E2，签发调用点。`issueActingForTenant(` 与 `issueSystem(` 只出现在 `scripts/aa-trust-config.json` 的 `issuerCallSites` 与 `issuerDefinition` 列出的文件里。

`scripts/aa-trust-config.json` 的 `pending` 列出应当进受信表、但表里还没有的名字。检查按同样的规则扫描它们，只报告、不失败。表里已经列出的 pending 名字照常强制。现在这个列表为空。

扫描是词法扫描。受信名先赋给别的变量再读取时，扫描认不出。

测试使用替身与夹具行，不使用真实 SQL 提供者、真实身份和真实存储。替身通过不证明耐久性或真实供应商行为。

未覆盖：

- Windows 与 Linux 分别报告。一个平台的结果不覆盖另一个平台。
- 对 `ctx.reflect.store` 的反射遍历是已记录的非保证。

## 维护

先改 [SPEC.md](SPEC.md)，再改代码和测试。没有 S0 闭包计划的拥有者同意，不要改 `src/types.ts`，因为所有 S0 模块都依赖它。应用装配页改动插件树或受信子树表时，在同一次改动里重新生成行快照：

```sh
cd apps/harness-server
node scripts/aa-rows.mjs write --aa ../../docs/architecture/runtime/application-assembly.md --rows src/s0/aa-rows.json
```

`@omne-harness/tool-definitions` 或本应用版本变化时，先构建，再在同一次改动里重新生成 Tool 发行清单：

```sh
cd apps/harness-server
node scripts/tool-release.mjs write
```

然后手工更新 `src/s0/stubs.ts`，使它跟随变化的行。`tests/real-manifests-sync.spec.ts` 把每个真实行导出与这张表比较。装配页补丁落地时，在同一次改动里删掉 `KNOWN_GAPS` 的对应条目。

新增真实行时，新增 `src/rows/<行 id>/`，再在每个单写点加一条。清单见 [docs/real-mode.md](docs/real-mode.md)「新增一行的成本」。

本文件与 [README.md](README.md) 保持同步。两个文件表达同一份承诺。
