# @omne-harness/cli

[English](README.md)

最小的 `omne` 命令。这一版只打印帮助或版本，没有其他命令。

## 职责与状态

本应用成员拥有进程入口 `omne`、参数解析、构建身份，以及两个状态目录公开函数。边界来自[包组织](../../docs/package-organization.md#最小-cli-的接入边界)。成员名、二进制名、退出码、消息和状态目录规则是 #246 的交付提议，写在 [SPEC.md](SPEC.md)。仓库负责人在评审时接受或替换它们。

已经实现：

- `omne --help` 和 `omne --version`。
- 其余参数一律按用法错误处理。
- 公开函数 `resolveStateDirectory` 和 `ensureStateDirectory`。

尚未实现：

- 调用 SDK 的命令。
- 经 pi-tui 的 TTY 呈现。
- 创建状态目录的命令。

本成员不依赖 SDK、Cordis、pi-tui 或任何服务端包。

## 使用

先构建本成员，再运行二进制。当前目录不必是本仓库。

```sh
pnpm --filter @omne-harness/cli run build
node apps/cli/dist/bin.js --help
node apps/cli/dist/bin.js --version
```

`--version` 打印 `0.0.0` 加一个换行。其余参数组合都以退出码 `2` 结束。例如 `omne`、`omne -h` 和 `omne --help --version` 都退出 `2`。

后续命令先解析状态目录，只在需要写入时才创建它：

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

行为归 [SPEC.md](SPEC.md)。其中有帮助文本、三条用法错误消息、退出码、身份错误、解析顺序和创建结果。数据形状归 `src/index.ts` 导出的类型。

承诺摘要：

- help 和 version 只写 stdout，退出 `0`。
- 用法错误只写 stderr，退出 `2`。
- `dist/cli-identity.json` 缺失或无效时，`--version` 退出 `1`。
- 上述路径都不打开、不创建、不修改状态目录。
- `resolveStateDirectory` 不访问文件系统。
- `ensureStateDirectory` 不删除占用路径的文件或目录。它返回错误，不抛出异常。

## 设计

每个模块只做一件事：

- `src/catalog.ts` 放 `defineCatalog`、生产目录和 `renderHelp`。生产目录没有命令，所以进程帮助文本仍是锁定的原文。`bin.ts` 把目录、身份读取和 home 输入交给 `run`。
- `src/argv.ts` 放 `parseArgv`。解析是 `string[]` 和目录上的纯函数。默认目录是生产目录。
- `src/identity.ts` 通过 `import.meta.url` 读取构建模块旁的 `cli-identity.json`。
- `src/run.ts` 把解析结果映射为输出和退出码。只有它调用 `readBuildIdentity`。
- `src/bin.ts` 把 `process.argv` 和进程的输出流交给 `run`，再设置 `process.exitCode`。
- `src/state-directory.ts` 放 `resolveStateDirectory` 和 `ensureStateDirectory`。

结果都是带 `kind` 字段的可辨识联合。预期的失败是返回值。调用方用 `switch` 处理，编译器检查每个分支。

版本来自构建写出的文件。这样打印的版本跟随实际运行的产物。复制出的 `dist` 打印它自己身份文件里的版本。

## 配置与运行

| 输入 | 现在的效果 |
| --- | --- |
| `--home <directory>` | 用法错误。后续命令把它作为 `flag` 传给 `resolveStateDirectory`。 |
| `OMNE_HOME` | 进程不读取。后续命令把它作为 `environment` 传入。 |
| `HOME` | 进程不读取。后续命令用 `os.homedir()` 取得默认目录的上级。 |

运行要求：

- Node `>=24.18.0 <25`，来自 `engines.node`。
- 不安装运行时依赖。
- 构建需要 `typescript`。构建从 `package.json` 写出 `dist/cli-identity.json`。

进程不打开网络连接、数据库或状态目录。

## 验证

在本目录运行测试：

```sh
pnpm test
pnpm run typecheck
```

两个脚本都先构建。测试使用构建后的 `dist`，不使用 `src`。

适用的测试种类按[包级测试责任](../../docs/verification.md#包级测试责任与边界)划分：

- 构建进程的契约测试。`tests/help-version.spec.ts` 和 `tests/usage-errors.spec.ts` 在仓库外的临时目录启动 `node dist/bin.js`。每个子进程使用新的环境，只有 `PATH`、临时 `HOME` 和可选的 `OMNE_HOME`。每个测试核对退出码、stdout 原文、stderr 原文，以及临时目录下的文件。每个用例都起子进程，所以两个文件归慢层。
- 经包名的单元与契约测试。`tests/parse-argv.spec.ts` 和 `tests/state-directory.spec.ts` 导入 `@omne-harness/cli`。状态目录测试使用 `os.tmpdir()` 下的子目录，不使用开发者的 home。
- 安装闭包检查。`tests/package-boundary.spec.ts` 读取 `package.json` 和每个构建模块。它核对没有运行时依赖，并且构建模块只导入 `node:` 模块和同目录的构建模块。

集成测试和端到端测试不适用。本成员还没有存储、服务或用户旅程。help 和 version 的子进程测试不是完整的用户旅程。

未覆盖：

- 子进程测试使用管道 stdio。没有测试分配 TTY。
- 以 root 运行时，不可读目录和只读上级目录的用例会跳过，因为 root 不受这些权限限制。
- 没有在 Windows 上测试。
- 本地开发机的 Node 是 v26。测试没有在 Node 24 上运行过。
- 没有测试通过 `pnpm pack` 在 workspace 之外安装本包。

## 维护

修改帮助文本、消息或退出码时，同时修改 [SPEC.md](SPEC.md)、`src/argv.ts` 或 `src/run.ts`，以及 `tests/support/expected.ts` 中的字面量。

新增命令时，往目录里追加一条 `CommandSpec`。`renderHelp` 会带上它，`run` 调用它的 `run`。生产目录的命令列表是空的。需要状态目录的命令先调用 `resolveStateDirectory`，再调用 `ensureStateDirectory`。help 和 version 不得调用这两个函数。调用 SDK 的命令要把 SDK 加为依赖，并在同一次修改中更新安装闭包测试和 SPEC.md。

`scripts/package-cli.sh` 仍指向 `apps/cli/tools/package.ts`。这个文件不存在。发布打包还不属于本成员。

本文件与 [README.md](README.md) 保持同步。两份文件表达同一组承诺。
