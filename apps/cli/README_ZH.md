# @omne-harness/cli

[English](README.md)

`omne` 是 Harness Server 的命令行客户端。它打印帮助或构建版本，并经 SDK 向服务器发送操作：`register`、`login`、`create-session`、`send-input`、`read-history`、`cancel-run`、`stop-call`，以及 18 个治理操作，每个操作一个命令（例如 `create-organization`、`switch-current-tenant` 和 `revoke-login`）。用它从 shell、脚本或 CI 里驱动一个 Harness Server，不必自己写 TypeScript 调用 SDK。

## 职责与状态

本应用拥有进程入口 `omne`、参数解析、25 个命令、凭据读取、登录状态文件、构建身份，以及解析和创建状态目录的两个公开函数。接入边界见[包组织](../../docs/package-organization.md#最小-cli-的接入边界)。帮助、版本、用法错误与默认状态目录的规则已接受，写在 [SPEC.md](SPEC.md)。

已经实现：

- `omne --help` 和 `omne --version`。
- 25 个命令。每个命令经 SDK 发送一个公开操作，并打印一个 JSON 对象。`read-history` 读完一个会话的全部历史页，缺省打印给人读的文本，加 `--json` 打印一个 JSON 对象。18 个治理命令以操作名为名，以 `login.json` 里的租户行事。[SPEC.md](SPEC.md#治理命令)列出它们。
- `login.json` 随治理结果变化：`login` 保存响应里的 `loginId`，`switch-current-tenant` 更新租户，`revoke-login` 撤销本登录时删除该文件。
- 终端上不回显的凭据输入，以及从管道读取凭据。
- 状态目录里的 `login.json`，经临时文件加改名写入。
- 状态目录里的 `sessions.json`：`create-session` 建的每个会话和它的归属租户。写入方式相同。
- 其余参数一律按用法错误处理。
- 公开函数 `resolveStateDirectory` 和 `ensureStateDirectory`。

尚未实现：

- 会话观察和订阅命令。
- 经 pi-tui 的终端界面。终端和管道上的输出相同。
- 隶属请求、授权表达与准入判断的治理操作，以及本阶段不提供的操作的命令。

本应用只依赖 SDK，不导入公开契约、服务端包、Cordis 或 pi-tui。命令需要的消息类型和编码入口由 SDK 重新导出。

## 使用

先构建 SDK 和本应用，再运行二进制。当前目录不必是本仓库。

```sh
pnpm --filter @omne-harness/cli... run build
node apps/cli/dist/bin.js --help
printf '%s\n' "$CREDENTIAL" | node apps/cli/dist/bin.js register --login-identifier alice
printf '%s\n' "$CREDENTIAL" | node apps/cli/dist/bin.js login --login-identifier alice
node apps/cli/dist/bin.js create-session --definition default
node apps/cli/dist/bin.js send-input --session <id> --text 'hello'
node apps/cli/dist/bin.js read-history --session <id>
node apps/cli/dist/bin.js read-history --session <id> --json
node apps/cli/dist/bin.js cancel-run --session <id> --run <运行标识>
node apps/cli/dist/bin.js stop-call --session <id> --producer-kind model --call <调用标识>
```

一次典型的使用分四步。用 `register` 注册账号。用 `login` 签发登录，登录状态写入状态目录。用 `create-session` 创建会话。用 `send-input` 发送输入，用 `cancel-run` 或 `stop-call` 控制运行。

`register` 和 `login` 从标准输入读凭据，不接受命令行上的凭据选项，因为命令行会进入进程列表和 shell 历史。终端上命令关闭回显，在标准错误写提示；从管道读取时读到第一个换行。

服务地址的取值次序是 `--server`、`OMNE_SERVER`、（会话命令）`login` 记录的地址，最后是 `http://127.0.0.1:8787`。SDK 只接受回环 `http:` 地址，不合的地址按用法错误处理。

`read-history` 按页读完整个历史。缺省每个条目打印一段：文本、工具调用、工具结果，以及每个 Run 的开始与终结。加 `--json` 时，原始条目在 `body.entries` 里。读不到末尾时，命令仍打印已经读到的条目，在标准错误写原因，并以非零退出（`denied` 为 `3`，`basis-unavailable` 为 `4`，结果不确定为 `5`，读到不可用的页为 `1`）。规则见 [SPEC.md](SPEC.md#读历史)。

其余命令和 `read-history --json` 向标准输出写一个 JSON 对象，含四个键：

| 键        | 出现条件               | 内容                                      |
| --------- | ---------------------- | ----------------------------------------- |
| `result`  | 总是                   | `response` 或 `uncertain`                 |
| `outcome` | `result` 为 `response` | 公开契约的 outcome                        |
| `body`    | `result` 为 `response` | 响应体。`login` 的响应体去掉 `loginProof` |
| `request` | 总是                   | 本次调用发出的标识                        |

`request` 总是含 `messageId`，另含该操作使用过的创建、接受、输入或控制标识。要重试同一意图，用 `--create-call-id`、`--accept-id`、`--input-id` 或 `--control-id` 把原值传回。命令沿用这些标识，服务器因此能认出是同一次意图。`messageId` 换新的没有问题。

`uncertain` 表示命令没有可信答复。请求可能已经到达服务器，也可能没有。它既不是成功，也不是没有发生。退出码反映这一点：

| 退出码 | 条件                                                               |
| ------ | ------------------------------------------------------------------ |
| `0`    | `succeeded` 或 `no-change`                                         |
| `1`    | 本地失败：身份文件、状态目录、登录状态、凭据读取或标准输出写入失败 |
| `2`    | 用法错误，包括服务地址不合法                                       |
| `3`    | 其余拒绝，例如 `denied`、`not-found`、`unsupported`                |
| `4`    | `basis-unavailable`，稍后可再试                                    |
| `5`    | `uncertain` 或 `unknown` 结果                                      |

其他程序可以复用状态目录函数：

```ts
import { homedir } from 'node:os'
import { ensureStateDirectory, resolveStateDirectory } from '@omne-harness/cli'

const resolved = resolveStateDirectory({
  flag: undefined,
  environment: process.env.OMNE_HOME,
  home: homedir(),
})
if (resolved.kind === 'error') process.stderr.write(resolved.message)
else {
  const ready = ensureStateDirectory(resolved.path)
  if (ready.kind === 'error') process.stderr.write(ready.message)
}
```

## 契约

行为归 [SPEC.md](SPEC.md)：帮助文本、用法错误消息、退出码、身份错误、解析顺序、创建结果、命令表、凭据规则和登录状态。数据形状归 `src/index.ts` 导出的类型。

稳定的承诺：

- 帮助和版本只写标准输出，退出 `0`。
- 用法错误只写标准错误，退出 `2`。
- `dist/cli-identity.json` 缺失或无效时，`--version` 退出 `1`。
- 帮助、版本、用法错误和 `register` 不打开、不创建、不修改状态目录。只有 `login` 创建它。五个会话命令只读取它，只是 `create-session` 成功后还会写 `sessions.json`。
- 只有 `login.json` 含登录证明。任何标准输出、错误文本和其他状态文件都不含凭据或证明。
- `resolveStateDirectory` 不访问文件系统。
- `ensureStateDirectory` 不删除占用路径的文件或目录。它返回错误，不抛出异常。它新建的目录在 POSIX 上权限为 `0700`。
- POSIX 上，会话命令拒绝组或其他用户可读的 `login.json`，退出 `1`。

实现细节可以改变：模块划分、规格之外的帮助文本措辞，以及命令构造请求的方式。

## 设计

每个模块只做一件事：

- `src/catalog.ts` 放 `defineCatalog`、生产目录和 `renderHelp`。生产目录列出 `src/commands.ts` 的命令。
- `src/argv.ts` 放 `parseArgv`，是 `string[]` 和目录上的纯函数。
- `src/command-support.ts` 放执行器共用的部分：传输、用法错误消息，以及读登录文件并打开传输的 `loadLogin`。
- `src/governance-commands.ts` 放 18 个治理命令。每个命令是一张小表：接受哪些选项、不看登录时怎样检查、有了登录怎样构造请求，以及响应之后的本地改动。
- `src/commands.ts` 放七个账号与会话命令，并把治理命令排在它们之后。`register` 与 `login` 共用一个执行器，四个会话命令共用另一个，`read-history` 有自己的执行器。每个会话命令是一张小表：接受哪些选项、怎样检查、怎样构造请求。
- `src/history-command.ts` 放 `read-history`：翻页循环和结果对象。`src/history-render.ts` 把一个条目渲染成给人读的文本。
- `src/options.ts` 按命令的选项表读取 `--名字 值` 对和 `--json` 这类开关。
- `src/report.ts` 打印结果对象，并把 `result` 与 `outcome` 映射为退出码。
- `src/credential.ts` 读取凭据。`editCredential` 是终端上的纯行编辑函数。
- `src/login-state.ts` 读、写、删除 `login.json`。
- `src/session-owners.ts` 读写 `sessions.json`。
- `src/services.ts` 放真实服务：SDK 的 HTTP 传输适配、进程标准输入和随机标识。
- `src/identity.ts` 通过 `import.meta.url` 读取构建模块旁的 `cli-identity.json`。
- `src/run.ts` 把解析结果映射为输出和退出码。
- `src/bin.ts` 把进程交给 `run`，等标准输出写完，再设置 `process.exitCode`。
- `src/state-directory.ts` 放 `resolveStateDirectory` 和 `ensureStateDirectory`。

命令经 `CommandEnvironment` 取得一切与进程有关的东西：home 输入、服务地址输入和服务。测试不用 mock 框架就能替换传输、凭据读取或标识来源。结果都是带 `kind` 字段的可辨识联合，调用方用 `switch` 处理预期的失败，编译器检查每个分支。

构建把版本写进 `dist/cli-identity.json`。所以打印的版本跟随实际运行的产物，不跟随源码树。

## 配置与运行

| 输入                 | 效果                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `--home <directory>` | 状态目录。对 `register` 是用法错误。帮助和版本不使用它。                                   |
| `OMNE_HOME`          | 没有 `--home` 时的状态目录。帮助和版本不解析、也不创建该路径。空值是错误，不退回默认目录。 |
| `HOME`               | 默认状态目录是 `$HOME/.omne`。                                                             |
| `--server <url>`     | 服务地址，覆盖 `OMNE_SERVER`。                                                             |
| `OMNE_SERVER`        | 没有 `--server` 时的服务地址。空值视为没有。                                               |

运行要求：

- Node `>=24`，来自 `engines.node`。
- 唯一的运行时依赖是 `@omne-harness/sdk`。
- 构建需要 `typescript`，并从 `package.json` 写出 `dist/cli-identity.json`。

平台说明：

- POSIX 上，登录状态文件权限是 `0600`，新建的状态目录是 `0700`。
- Windows 上，本应用不收紧也不检查 `login.json` 的访问控制列表，也不检查 Node 报告的权限位。这是 [SPEC.md](SPEC.md) 中的已知限制。

## 验证

在仓库根运行测试和类型检查：

```sh
pnpm turbo run test --filter=@omne-harness/cli
pnpm turbo run typecheck --filter=@omne-harness/cli
```

测试任务先构建本应用及其依赖，所以 SDK 的 `dist` 是新的。类型检查不先构建。测试使用构建后的 `dist`，不使用 `src`。本目录里的 `pnpm test` 不构建。

测试种类按[包级测试责任](../../docs/verification.md#包级测试责任与边界)划分：

- 本进程内的命令测试。`tests/governance-commands.spec.ts` 覆盖 18 个治理命令：每个命令一条机读结果用例、`stage-not-provided` 应答、用法错误、`login` 保存的 `loginId`、`switch-current-tenant` 之后的登录文件，以及 `revoke-login` 的删除。`tests/commands.spec.ts` 用生产目录和真实的 SDK HTTP 传输适配，对 `127.0.0.1` 上的真实 HTTP 服务器（`tests/support/fake-service.ts`）运行。服务器按公开契约的线上形状答复每个操作。用例覆盖每个命令、退出码表、用法错误、状态目录规则、服务地址次序和不回显规则。
- `tests/read-history.spec.ts` 覆盖 `read-history`。测试服务按公开契约答复：首页请求带 `direction` 和 `pageBytes`，带游标的请求两者都不带，带游标又带这两个字段的请求答 `protocol-rejected`。用例覆盖三页翻页、每页请求的形状、文本、工具调用、工具结果与 Run 开始和终结的人读渲染、`--json`、每种 outcome 的退出码，以及读不完整的各种原因。
- 构建产物的进程测试。它们从仓库外的临时目录启动 `node dist/bin.js`，每个子进程使用新的环境，含 `PATH`、临时 `HOME`，以及可选的 `OMNE_HOME` 和 `OMNE_SERVER`。每个用例都起子进程，所以归慢层。
- 单元测试覆盖凭据读取与行编辑、登录状态文件、`parseArgv`、目录和状态目录函数。
- `tests/support/expected.ts` 从 SPEC.md 读两份帮助文本，测试拿构建结果与规格的原话比较。
- 安装闭包检查读取 `package.json` 和每个构建模块，核对 SDK 是唯一的运行时依赖，构建模块只导入 `node:` 模块、同目录构建模块和 SDK。
- `tests/packaging.spec.ts` 运行 `scripts/package-cli.sh`，核对归档条目、归档不含 source map、已存在的目标被拒绝，以及 `apps/cli/dist` 未被改动。

未覆盖：

- 没有对真实服务端接入的往返测试。测试服务器代它答复。
- 没有测试分配真实终端，所以一个在 `setRawMode` 失败的真实终端没有被验证。
- POSIX 的权限检查有测试，但在 Windows 上跳过，没有在 POSIX 机器上运行过。
- 只在 Windows 上运行过这些测试。
- 本地开发机的 Node 是 v26，没有在 Node 24 上另跑。

## 维护

修改帮助文本、消息或退出码时，同时修改 [SPEC.md](SPEC.md)、`src/commands.ts` 的命令表或 `src/report.ts`，以及 `tests/support/expected.ts`。两份帮助文本都来自 SPEC.md。

新增命令时，在 `src/commands.ts` 的 `productionCommands` 里加一条 `CommandSpec`。`renderHelp` 会带上它，`run` 用 `CommandEnvironment` 调用它的 `run`。会话命令是一张 `SessionCommand` 表，照现有四个写。需要状态目录的命令调用 `resolveStateDirectory`，自己不读 `process.env`。帮助和版本不得调用 `resolveStateDirectory` 或 `ensureStateDirectory`。同一次修改中，把命令的选项加入规格的命令表。

`scripts/package-cli.sh` 把本应用构建到自己的临时目录，再把其中的 `dist/` 写入一个新的 `.tar.gz`。它不删除、不写入 `apps/cli/dist`，所以运行已构建二进制的测试可以同时进行。构建步骤与 `build` 脚本相同，修改时同时修改 `tools/package.ts` 和 `build` 脚本。归档是构建产物，不是安装包：它不安装命令、不上传发布、也不配置账号。

本文件与 [README.md](README.md) 保持同步。两份文件表达同一组承诺。
