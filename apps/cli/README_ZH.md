# @omne-harness/cli

[English](README.md)

最小的 `omne` 命令。它打印帮助或版本，并运行六个经 SDK 访问服务端的命令：`register`、`login`、`create-session`、`send-input`、`cancel-run` 和 `stop-call`。

## 职责与状态

本应用成员拥有进程入口 `omne`、参数解析、六个命令、凭据读取、登录状态文件、构建身份，以及两个状态目录公开函数。边界来自[包组织](../../docs/package-organization.md#最小-cli-的接入边界)。帮助、版本、用法错误和默认状态目录的规则已经接受，写在 [SPEC.md](SPEC.md)。六个命令、登录状态和退出码 3 到 5 是 #978 波 1 的候选条款，SPEC.md 的采用状态里列出了它们。

已经实现：

- `omne --help` 和 `omne --version`。
- 六个命令。每个命令经 SDK 发送一个公开操作，并打印一个 JSON 对象。
- 终端上不回显的凭据输入，以及从管道读取凭据。
- 状态目录里的 `login.json`，经临时文件加改名写入。
- 其余参数一律按用法错误处理。
- 公开函数 `resolveStateDirectory` 和 `ensureStateDirectory`。

尚未实现：

- `read-history`、会话观察和订阅命令。它们在后续波。
- 经 pi-tui 的 TTY 呈现。
- `revoke-login`。M2 部署不提供它。

本成员只依赖 SDK。它不导入公开契约、服务端包、Cordis 或 pi-tui。

## 使用

先构建 SDK 和本成员，再运行二进制。当前目录不必是本仓库。

```sh
pnpm --filter @omne-harness/cli... run build
node apps/cli/dist/bin.js --help
printf '%s\n' "$CREDENTIAL" | node apps/cli/dist/bin.js login --login-identifier alice
node apps/cli/dist/bin.js create-session --definition default
node apps/cli/dist/bin.js send-input --session <id> --text 'hello'
node apps/cli/dist/bin.js cancel-run --session <id> --run <run id>
```

服务地址的取值次序是 `--server`、`OMNE_SERVER`、（会话命令）`login` 记录的地址，最后是 `http://127.0.0.1:8787`。SDK 只接受回环 `http:` 地址。

每个命令打印一个 JSON 对象，含 `result`、`outcome`、`body` 和 `request`。`request` 对象是命令发出的标识。要重试同一意图，用 `--create-call-id`、`--accept-id`、`--input-id` 或 `--control-id` 传回原值。退出码只由 `result` 与 `outcome` 决定：`0` 成功或无变化，`1` 本地失败，`2` 用法错误，`3` 其余拒绝，`4` `basis-unavailable`，`5` 结果不确定。

后续命令可以复用状态目录函数：

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

行为归 [SPEC.md](SPEC.md)。其中有帮助文本、用法错误消息、退出码、身份错误、解析顺序、创建结果、命令表、凭据规则和登录状态。数据形状归 `src/index.ts` 导出的类型。

承诺摘要：

- help 和 version 只写 stdout，退出 `0`。
- 用法错误只写 stderr，退出 `2`。
- `dist/cli-identity.json` 缺失或无效时，`--version` 退出 `1`。
- help、version、用法错误和 `register` 不打开、不创建、不修改状态目录。只有 `login` 创建它。四个会话命令只读取它。
- 除 `login.json` 外，任何输出、错误文本和状态文件都不含凭据。只有 `login.json` 含登录证明。
- `resolveStateDirectory` 不访问文件系统。
- `ensureStateDirectory` 不删除占用路径的文件或目录。它返回错误，不抛出异常。它新建的目录在 POSIX 上权限为 `0700`。

## 设计

每个模块只做一件事：

- `src/catalog.ts` 放 `defineCatalog`、生产目录和 `renderHelp`。生产目录列出 `src/commands.ts` 的六个命令。`bin.ts` 把目录、身份读取、home 与服务地址输入和服务交给 `run`。
- `src/argv.ts` 放 `parseArgv`。解析是 `string[]` 和目录上的纯函数。
- `src/commands.ts` 放六个命令。`register` 与 `login` 共用一个执行器，四个会话命令共用另一个。每个会话命令是一张小表：接受哪些选项、怎样检查、怎样构造请求。
- `src/options.ts` 按命令的选项表读取 `--名字 值` 对。
- `src/report.ts` 打印结果对象，并把 `result` 与 `outcome` 映射为退出码。
- `src/credential.ts` 读取凭据。`editCredential` 是终端上的纯行编辑函数。
- `src/login-state.ts` 读写 `login.json`。
- `src/services.ts` 放真实服务：SDK 的 HTTP 传输适配、进程标准输入和随机标识。
- `src/identity.ts` 通过 `import.meta.url` 读取构建模块旁的 `cli-identity.json`。
- `src/run.ts` 把解析结果映射为输出和退出码。命令要发请求，所以它是异步的。
- `src/bin.ts` 把进程交给 `run`，等标准输出写完，再设置 `process.exitCode`。标准输出写入失败时退出码为 `1`。
- `src/state-directory.ts` 放 `resolveStateDirectory` 和 `ensureStateDirectory`。

命令经 `CommandEnvironment` 取得一切与进程有关的东西：home 输入、服务地址输入和服务。测试不用 mock 框架就能替换传输、凭据读取或标识来源。

结果都是带 `kind` 字段的可辨识联合。预期的失败是返回值。调用方用 `switch` 处理，编译器检查每个分支。

版本来自构建写出的文件。这样打印的版本跟随实际运行的产物。

## 配置与运行

| 输入                 | 效果                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `--home <directory>` | 状态目录。对 `register` 是用法错误。help 和 version 不使用它。       |
| `OMNE_HOME`          | 没有 `--home` 时的状态目录。help 和 version 不解析、也不创建该路径。 |
| `HOME`               | `bin.ts` 调用 `os.homedir()`。默认状态目录是 `$HOME/.omne`。         |
| `--server <url>`     | 服务地址。覆盖 `OMNE_SERVER`。                                       |
| `OMNE_SERVER`        | 没有 `--server` 时的服务地址。空值视为没有。                         |

运行要求：

- Node `>=24`，来自 `engines.node`。
- 唯一的运行时依赖是 `@omne-harness/sdk`。
- 构建需要 `typescript`。构建从 `package.json` 写出 `dist/cli-identity.json`。

平台说明：

- 在 POSIX 上，会话命令拒绝组或其他用户可读的 `login.json`，并退出 `1`。
- 在 Windows 上，本成员不收紧也不检查 `login.json` 的访问控制列表。文件沿用所在目录的访问规则。这是 [SPEC.md](SPEC.md) 中的已知限制。Node 在那里报告的权限位不说明访问规则。

## 验证

在仓库根运行测试：

```sh
pnpm turbo run test --filter=@omne-harness/cli
pnpm turbo run typecheck --filter=@omne-harness/cli
```

测试任务先构建本包及其依赖，所以 SDK 的 `dist` 是新的。类型检查不先构建。测试使用构建后的 `dist`，不使用 `src`。本目录里的 `pnpm test` 不构建。

适用的测试种类按[包级测试责任](../../docs/verification.md#包级测试责任与边界)划分：

- 本进程内的命令测试。`tests/commands.spec.ts` 用生产目录和真实的 SDK HTTP 传输适配，对 `127.0.0.1` 上的真实 HTTP 服务器（`tests/support/fake-service.ts`）运行。服务器按公开契约的线上形状答复每个操作。凭据读取和标识来源由脚本给出。用例覆盖每个命令、退出码表、用法错误、状态目录规则、服务地址次序、带正控的不回显规则，以及标准输出写入失败。
- 构建 bin 的进程测试。`tests/help-version.spec.ts`、`tests/usage-errors.spec.ts` 和 `tests/commands-process.spec.ts` 在仓库外的临时目录启动 `node dist/bin.js`。每个子进程使用新的环境，含 `PATH`、临时 `HOME`，以及可选的 `OMNE_HOME` 和 `OMNE_SERVER`。每个用例都起子进程，所以这些文件归慢层。
- 单元测试。`tests/credential.spec.ts` 用假的终端流和管道流覆盖行编辑与读取。`tests/login-state.spec.ts` 覆盖登录状态文件。`tests/parse-argv.spec.ts`、`tests/catalog.spec.ts` 和 `tests/state-directory.spec.ts` 导入 `@omne-harness/cli`。
- 帮助文本。`tests/support/expected.ts` 从 SPEC.md 读两份帮助文本，所以测试拿构建结果与规格的原话比较。
- 安装闭包检查。`tests/package-boundary.spec.ts` 读取 `package.json` 和每个构建模块。它核对 SDK 是唯一的运行时依赖，并且构建模块只导入 `node:` 模块、同目录的构建模块和 SDK。它也核对至少有一个模块导入 SDK。
- 打包检查。`tests/packaging.spec.ts` 运行 `scripts/package-cli.sh`。它核对归档条目、归档不含 source map、已存在的目标被拒绝，以及 `apps/cli/dist` 下没有条目被删除或重写。它在慢层，因为它运行完整的 tsc 构建和 tar 进程。

未覆盖：

- 没有对真实服务端接入的往返测试。服务端接入是另一个成员。它合入后，线负责人把真实地址交给命令，运行这一轮往返。
- 没有测试分配 TTY。终端路径用假的流覆盖，所以一个报告 `isTTY` 却在 `setRawMode` 失败的真实终端没有被验证。
- POSIX 的权限拒绝、`0600` 文件权限和 `0700` 目录权限有测试，但在 Windows 上跳过，没有在本机运行过。
- 构建 bin 向已关闭的 stdout 管道写入失败的情形没有测试。`run` 里同一条路径用会抛出异常的 stdout 函数测试。
- 以 root 运行时，不可读目录和只读上级目录的用例会跳过。
- 只在 Windows 上运行过这些测试。
- 本地开发机的 Node 是 v26。没有在 Node 24 上另跑。`engines.node` 是 `>=24`。
- 没有测试通过 `pnpm pack` 在 workspace 之外安装本包。

## 维护

修改帮助文本、消息或退出码时，同时修改 [SPEC.md](SPEC.md)、`src/commands.ts` 里的命令表或 `src/report.ts`，以及 `tests/support/expected.ts`。两份帮助文本都来自 SPEC.md。

新增命令时，在 `src/commands.ts` 的 `productionCommands` 里加一条 `CommandSpec`。`renderHelp` 会带上它，`run` 用 `CommandEnvironment` 调用它的 `run`。会话命令是一张 `SessionCommand` 表，照现有四个写。需要状态目录的命令用 `homeFlag`、`environmentHome` 和 `homeDirectory` 调用 `resolveStateDirectory`。命令自己不读 `process.env`。help 和 version 不得调用 `resolveStateDirectory` 或 `ensureStateDirectory`。同一次修改中，把命令的选项加入规格的命令表和帮助文本。

`scripts/package-cli.sh` 把本成员构建到自己的临时目录，再把其中的 `dist/` 写入一个新的 `.tar.gz`。它不删除、不写入 `apps/cli/dist`，所以运行已构建 bin 的测试可以同时进行。归档不含 source map，因为归档不带源码。它先在临时目录里写归档，再复制到目标旁边，最后改名到目标路径。失败时它删除临时目录和未写完的归档，目标不会出现。构建步骤与成员的 `build` 脚本相同，修改时同时修改 `tools/package.ts` 和 `build` 脚本。它不安装命令、不上传发布、也不配置账号。这个归档不是旧的 B01 安装包。

本文件与 [README.md](README.md) 保持同步。两份文件表达同一组承诺。
