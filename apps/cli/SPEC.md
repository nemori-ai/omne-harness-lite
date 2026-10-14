# @omne-harness/cli 行为规格

本页是 `apps/cli` 的长期行为规格。它写类型表达不了的行为：输出、退出码、错误文本、构建身份和状态目录的创建时机。公开类型以 `src/index.ts` 的导出为准，本页不重复类型定义。

## 采用状态

PanQiWei 于 2026-10-14 接受本页对 #246 revision 1 的行为。依据是他在当前会话中的原话：把相关内容调整为正式接受状态，若与源码冲突则更新规格。二进制名 `omne`、包名 `@omne-harness/cli`、退出码、帮助文本、用法错误消息、默认状态目录 `$HOME/.omne`，以及本页其余行为条款，按当前源码接受。

[包组织](../../docs/package-organization.md#最小-cli-的接入边界)只规定了 help 和 version 不能做什么。本页补上的是那些未定细节。本卡验证环境接受本机 Node v26.0.0。`package.json` 的 engines 仍是 `>=24.18.0 <25`。Node 24 没有另跑。

## 范围

本成员拥有以下责任：

- 进程入口 `omne`。
- 命令行参数解析。
- 读取构建身份。
- 解析和创建状态目录的公开函数。

本次交付只有两条成功路径：单独的 `--help` 和单独的 `--version`。没有命令调用状态目录的创建。本成员不依赖 SDK、Cordis、pi-tui 或任何服务端包。

## 参数解析

`parseArgv(argv)` 是 `string[]` 的纯函数。它不读环境变量，不访问文件系统。规则按下面的顺序判断：

1. 数组恰好是 `['--help']` 时，结果是 `{ kind: 'help' }`。
2. 数组恰好是 `['--version']` 时，结果是 `{ kind: 'version' }`。
3. 数组为空时，结果是用法错误，消息为「缺少命令」。
4. 数组中任一个 `--home` 后面没有参数，或后面的参数以 `-` 开头时，结果是用法错误，消息为「缺少目录」。
5. 其余数组都是用法错误，消息为「无法识别的参数」。

因此，`-h`、`-v`、未知单词、`--help --version` 和 `--version --help` 都是用法错误。生产目录没有命令，所以单独的 `--home <目录>`，以及它和 `--help` 或 `--version` 的组合，仍是用法错误。`--home=<目录>` 是无法识别的参数。`--home ''` 也是无法识别的参数，因为空串不以 `-` 开头。

已登记命令可以带 `--home <目录>`。目录可以出现在命令名之前或之后。解析结果是 `{ kind: 'command', command, args, homeFlag }`。`args` 不再包含这一对。`homeFlag` 是目录字符串。`bin.ts` 另外把 `process.env.OMNE_HOME` 和 `os.homedir()` 放进 `CliRuntime`。`run` 把这三项合成 `CommandEnvironment` 交给命令的 `run`。help 和 version 不调用 `resolveStateDirectory` 或 `ensureStateDirectory`。读取环境变量和 `os.homedir()` 不创建目录。

用法错误的消息原文如下。每条都以换行结尾：

| 情况 | 消息 |
| --- | --- |
| 缺少命令 | `omne: missing command\nRun omne --help for usage.\n` |
| 缺少目录 | `omne: --home requires a directory\n` |
| 无法识别的参数 | `omne: unrecognized arguments\nRun omne --help for usage.\n` |

## 输出与退出码

| 结果 | stdout | stderr | 退出码 |
| --- | --- | --- | --- |
| help | 帮助文本 | 空 | `0` |
| version | 身份文件中的 `version` 加一个换行，不带前缀 | 空 | `0` |
| 身份文件无效 | 空 | `omne: build identity is missing or invalid\n` | `1` |
| 用法错误 | 空 | 上表中的一条消息 | `2` |

进程设置 `process.exitCode`，不调用 `process.exit()`。这样管道上的 stdout 在进程退出前写完。

帮助文本由 `renderHelp(productionCatalog)` 生成，不是另一份手写文档。生产目录的命令列表是空的，所以生成结果仍是下面的原文。最后一行之后有一个换行：

```text
omne

Show help or version. This build has no other commands.

  omne --help
  omne --version

  --home <directory>    State directory. Overrides OMNE_HOME.
  OMNE_HOME             State directory when --home is absent.

The default state directory is $HOME/.omne.
--help and --version do not open or create a state directory.
```

help、version 和用法错误三条路径都不调用状态目录的解析或创建。它们不打开、不创建、不修改 `OMNE_HOME`、`--home` 指向的路径或 `$HOME/.omne`。`OMNE_HOME` 不存在、不可读、是普通文件，或是已有目录时，结果都一样。

stdin、stdout、stderr 不是 TTY 时，输出与上面相同。本成员不加载终端界面。

## 构建身份

构建按顺序执行三步：

1. 删除 `dist`。
2. 用 `tsc -p tsconfig.build.json` 编译 `src`。
3. 运行 `scripts/write-identity.mjs`，把 `package.json` 的 `name` 和 `version` 写进 `dist/cli-identity.json`。

身份文件与 `dist/bin.js` 在同一目录。运行时通过构建模块的 `import.meta.url` 找到这个文件。运行时不读 `package.json`、git 或另一份 `dist`。

`--version` 在以下情况退出 `1`，并写身份错误消息：

- 身份文件不存在。
- 身份文件不可读。
- 内容不是 JSON。
- 内容不是对象，或对象没有字符串类型的 `version`。

`readBuildIdentity()` 返回 `{ kind: 'identity', version }` 或 `{ kind: 'error', message }`。它不抛出异常。`bin.ts` 把它作为 `readIdentity` 交给 `run`。只有 `--version` 调用这次读取。

## 状态目录

本次交付的进程入口不调用下面两个函数。它们供后续命令使用。

### 解析

`resolveStateDirectory({ flag, environment, home })` 只计算路径。它不创建、不打开，也不检查该路径。三个输入都是字符串或 `undefined`。调用方传入 `--home` 的值、`process.env.OMNE_HOME` 和 `os.homedir()`。函数按下面的顺序判断：

1. `flag` 去掉首尾空白后不为空：结果是 `{ kind: 'resolved', path, source: 'flag' }`，`path` 是去掉空白后的值。
2. 否则，`environment` 存在且去掉首尾空白后不为空：结果是 `{ kind: 'resolved', path, source: 'environment' }`。
3. 否则，`environment` 存在但为空串或只有空白：结果是 `{ kind: 'error', message: 'omne: OMNE_HOME is empty\n' }`。函数不退回默认目录。
4. 否则，`home` 是非空字符串：结果是 `{ kind: 'resolved', path, source: 'default' }`，`path` 等于 `path.join(home, '.omne')`。
5. 否则：结果是 `{ kind: 'error', message: 'omne: no home directory for the default state path\n' }`。

只有空白的 `flag` 不报错，它按第 2 步继续判断。

### 创建

`ensureStateDirectory(path)` 返回 `{ kind: 'ready', path }` 或 `{ kind: 'error', message }`。下列情况都返回结果，不抛出异常：

| 路径状态 | 结果 | 文件系统效果 |
| --- | --- | --- |
| 已是目录 | `ready` | 不改动目录中的条目 |
| 不存在 | `ready` | 创建该目录和缺失的上级目录，目录中没有本函数创建的文件 |
| 已被普通文件或其他非目录占用 | `error`，消息为 `omne: state directory <path> is not a directory\n` | 不删除占用的文件 |
| 上级是普通文件 | `error`，消息为 `omne: cannot create state directory <path>: ENOTDIR\n` | 不删除该文件 |
| 没有权限 | `error`，消息为 `omne: cannot create state directory <path>: EACCES\n` | 不创建目录 |

其他系统错误使用同一格式。消息带上系统错误码。拿不到错误码时，消息去掉 `: <code>` 部分。

## 安装闭包

`package.json` 没有运行时依赖、peer 依赖或 optional 依赖。开发依赖只有 `typescript`、`vitest` 和 `@types/node`。构建产物只导入 `node:` 内置模块和 `dist` 内的相对模块。`bin.omne` 指向 `./dist/bin.js`。该文件以 `#!/usr/bin/env node` 开头。`files` 只发布 `dist`。

## 适用平台

本规格适用于 macOS 和 Linux。Windows 上的路径分隔符和系统错误码可能不同，本规格不对 Windows 作出承诺。测试覆盖与缺口见 [README 的验证一节](README.md#verification)。
