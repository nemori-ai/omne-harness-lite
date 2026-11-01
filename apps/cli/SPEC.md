# @omne-harness/cli 行为规格

本页是 `apps/cli` 的长期行为规格。它写类型表达不了的行为：输出、退出码、错误文本、构建身份和状态目录的创建时机。公开类型以 `src/index.ts` 的导出为准，本页不重复类型定义。

## 采用状态

PanQiWei 于 2026-10-14 接受本页对 #246 revision 1 的行为。依据是他在当前会话中的原话：把相关内容调整为正式接受状态，若与源码冲突则更新规格。二进制名 `omne`、包名 `@omne-harness/cli`、退出码、帮助文本、用法错误消息、默认状态目录 `$HOME/.omne`，以及本页其余行为条款，按当前源码接受。

[包组织](../../docs/package-organization.md#最小-cli-的接入边界)只规定了 help 和 version 不能做什么。本页补上的是那些未定细节。

「[命令](#命令)」一节起至「[命令结果与退出码](#命令结果与退出码)」是 #978 波 1 的候选，等待 Reduce 批复，尚未被接受。本页其余条款保持上面的接受状态。批复后，需要的话本页再改采用状态。候选依据是包组织页「最小 CLI 的接入边界」：CLI 通过 SDK 使用系统能力，不导入 server-entry。本卡验证环境接受本机 Node v26.0.0。`package.json` 的 engines 是 `>=24`。Node 24 没有另跑。

## 范围

本成员拥有以下责任：

- 进程入口 `omne`。
- 命令行参数解析。
- 读取构建身份。
- 解析和创建状态目录的公开函数。

已接受的交付只有两条成功路径：单独的 `--help` 和单独的 `--version`。这两条路径不调用状态目录的创建。

候选的命令面由下面的责任组成。

- 七个命令，见[命令](#命令)。
- 凭据读取与登录状态文件，见[凭据与登录状态](#凭据与登录状态)。
- 命令结果的输出与退出码，见[命令结果与退出码](#命令结果与退出码)。

本成员通过 SDK 使用系统能力。它不导入 server-entry、Cordis、服务端提供者、服务端业务存储或服务端装配树。2026-10-14 接受的「不依赖 SDK」一句只描述当时只有 help 和 version 的交付。包组织页的「最小 CLI 的接入边界」是这一句被改写的依据。命令面实现时，CLI 加入对 SDK 的依赖，见[安装闭包](#安装闭包)。本成员仍不加载 pi-tui。

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

帮助文本由 `renderHelp(productionCatalog)` 生成，不是另一份手写文档。命令目录为空时，生成结果是下面的原文。登记[命令](#命令)的七个命令之后，文本多出命令清单，实现闭包按生成结果补全本节。最后一行之后有一个换行：

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

已接受的交付的进程入口不调用下面两个函数。候选命令面中，`login` 与会话命令使用它们，规则见[状态目录的创建时机](#状态目录的创建时机)。

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

## 命令

下列七个命令是候选。每个命令对应公开契约的一个操作。命令名与操作名一致。操作的字段、`outcome` 和判断次序归[公开契约](../../packages/access/public-contract/SPEC.md)。路径、方法和状态码归[承载绑定表](../../packages/access/server-entry/docs/http-binding.md#承载绑定表)。CLI 经 SDK 发出请求。

所有选项都写成 `--名字 值`。不支持 `--名字=值`。选项可以出现在命令名之后的任意位置。`--home` 的规则同[参数解析](#参数解析)。

| 命令 | 公开操作 | 必需选项 | 可选选项 | 说明 |
| --- | --- | --- | --- | --- |
| `register` | `register-and-activate` | `--login-identifier` | `--server` | 凭据按[凭据读取](#凭据读取)读取。不读写状态目录 |
| `login` | `issue-login` | `--login-identifier` | `--server` | 凭据按[凭据读取](#凭据读取)读取。成功后写登录状态文件 |
| `create-session` | `create-session` | `--definition` | `--purpose`、`--create-call-id`、`--server` | `actingTenant` 取登录状态里的租户 |
| `send-input` | `send-input` | `--session`、`--text` | `--tenant`、`--accept-id`、`--input-id`、`--server` | `--text` 包成一条用户消息，形状归 message 包 |
| `read-history` | `read-history` | `--session` | `--tenant`、`--direction`、`--page-bytes`、`--cursor`、`--server` | 见下文 |
| `cancel-run` | `cancel-run` | `--session`、`--run` | `--urgency`、`--tenant`、`--control-id`、`--server` | `--urgency` 取 `graceful` 或 `force`，默认 `graceful` |
| `stop-call` | `stop-call` | `--session`、`--producer-kind`、`--call` | `--tenant`、`--control-id`、`--server` | `--producer-kind` 取 `model` 或 `tool` |

补充规则如下。

- `--tenant` 的默认值是登录状态里的租户。会话命令中，除 `create-session` 外都用它作 body 的 `tenant`。
- `read-history` 不带 `--cursor` 时，`cursor` 为 null，`--direction` 默认 `forward`，`--page-bytes` 默认 `16384`。带 `--cursor` 时，同时给出 `--direction` 或 `--page-bytes` 是用法错误。装配给出的 `pageBytes` 上界初值不得低于 16384。
- 命令生成缺省的标识。每次发送生成新的 `messageId`。`--create-call-id`、`--accept-id`、`--input-id` 和 `--control-id` 缺省时也各生成一个新值。生成值用 `crypto.randomUUID()`。调用者要重试同一次操作时，必须用这些选项传入原来的值。
- 命令不提供 `query-create-session`、`query-send-input`、`observe-session` 和 `cancel-observation` 的入口。观察命令在波 D。
- 命令不提供其余治理操作的入口。服务端对它们答 `stage-not-provided`，见[治理位置](../../packages/access/server-entry/docs/http-binding.md#治理位置)。
- 命令不提供退出登录。`revoke-login` 本部署不提供。用户删除登录状态文件，只是忘掉本机持有的证明。

### 服务地址

服务地址按下面的次序取值。

1. `--server` 的值。
2. 环境变量 `OMNE_SERVER`。
3. 登录状态文件里 `login` 记录的地址，仅会话命令使用。
4. 默认值 `http://127.0.0.1:8787`。端口以[名字与默认值](../../packages/access/server-entry/docs/http-binding.md#名字与默认值)为准。

地址必须是 `127.0.0.1` 或 `localhost` 上的 `http:` 地址。其他地址是用法错误，消息为 `omne: --server must be a loopback http address\n`。原因见 SDK 的 [HTTP 传输适配](../../packages/access/sdk/SPEC.md#http-传输适配)。

### 命令的用法错误

命令的用法错误使用下面两条消息。退出码为 `2`。每条以换行结尾。

| 情况 | 消息 |
| --- | --- |
| 缺少必需选项 | `omne <command>: missing <option>\nRun omne --help for usage.\n` |
| 选项缺值、选项重复、选项不属于该命令、取值不合法、或出现多余的位置参数 | `omne <command>: unrecognized arguments\nRun omne --help for usage.\n` |

## 凭据与登录状态

### 凭据读取

`register` 和 `login` 需要账号凭据。命令不接受命令行上的凭据选项，因为命令行会进入进程列表和 shell 历史。

- 标准输入是 TTY 时，命令在标准错误写提示 `Credential: `，再从终端读一行，不回显。终端不能关闭回显时，命令退出 `1`，消息为 `omne: cannot read the credential without echo\n`。命令不退回带回显的读取。
- 标准输入不是 TTY 时，命令读到第一个换行或输入结束，去掉末尾的换行。
- 读到的凭据为空串时，命令退出 `2`，消息为 `omne: empty credential\n`。
- 凭据只用于构造请求。命令不把它写进标准输出、标准错误（提示除外）、状态目录、日志或错误文本。

### 登录状态

`login` 成功后，在状态目录写文件 `login.json`。文件内容是一个 JSON 对象，含 `version`（值为 `1`）、`server`、`loginIdentifier`、`issuedAt`、`tenantId` 和 `loginProof`。`loginProof` 只存在于这个文件里。

- 写入先写临时文件，再改名。失败时旧文件保持原样。
- 文件权限是 `0600`。命令新建的状态目录权限是 `0700`。已有目录的权限不改。
- POSIX 上，会话命令读取该文件前检查权限。文件对组或其他用户可读时，命令退出 `1`，消息为 `omne: login state is readable by other users\n`。
- Windows 上命令不收紧访问控制，也不检查它。这是已知限制。
- 文件不存在时，会话命令退出 `1`，消息为 `omne: not logged in\nRun omne login first.\n`。文件内容不是预期形状时，消息为 `omne: login state is invalid\n`。两种情况都不创建状态目录。
- 登录证明有期限。过期或被撤销后，服务端答 `denied`，命令照常输出结果。用户重新执行 `login`。

### 状态目录的创建时机

候选命令面里只有 `login` 创建状态目录。

| 命令 | 状态目录 |
| --- | --- |
| `--help`、`--version`、用法错误 | 不解析，不创建，规则见[输出与退出码](#输出与退出码) |
| `register` | 不解析，不创建，也不读 `--home` 与 `OMNE_HOME` |
| `login` | 在发送任何请求之前解析并创建。创建失败则退出 `1`，不发送凭据。凭据错误等非成功结果不删除已创建的空目录 |
| `create-session`、`send-input`、`read-history`、`cancel-run`、`stop-call` | 只读取。不存在时不创建，退出 `1` |

`login` 先创建目录再发送请求。这样，签发成功后不会因为写不下登录证明而留下一份无人持有的登录。

## 命令结果与退出码

命令的结果写一个 JSON 对象到标准输出，后接一个换行。TTY 与非 TTY 的输出相同。本成员不加载终端界面。标准错误只在本地失败、凭据提示和用法错误时有内容。

对象的键如下。

| 键 | 出现条件 | 内容 |
| --- | --- | --- |
| `result` | 总是 | `response`、`uncertain` 或 `not-sent` |
| `outcome` | `result` 为 `response` | 公开契约的 `outcome` |
| `body` | `result` 为 `response` | 响应的 `body`。`login` 的 `body` 去掉 `loginProof` |
| `request` | 总是 | 本次发送使用的 `messageId`，以及该命令生成或收到的 `createCallId`、`acceptId`、`inputId`、`controlId` |

`result` 的含义如下。`response` 表示收到可信答复。`uncertain` 表示请求字节可能已经发出，调用者没有可信答复。`not-sent` 表示 SDK 按再送规则发了两次，两次都没有发出。`uncertain` 不是成功，也不是没有发生。`request` 让用户可以用原标识重试。

标准输出不含登录证明、凭据、签发者和游标密钥。

退出码如下。已接受的 `0`、`1`、`2` 含义不变。

| 退出码 | 条件 |
| --- | --- |
| `0` | `result` 为 `response`，`outcome` 是 `succeeded` 或 `no-change` |
| `1` | 本地失败：身份文件无效、状态目录或登录状态文件的错误、凭据读取失败、标准输出写入失败 |
| `2` | 用法错误，包括服务地址不合法 |
| `3` | `result` 为 `response`，`outcome` 是其余的非成功结果：`denied`、`not-visible`、`uniform-auth-failure`、`not-loginable`、`protocol-rejected`、`stage-not-provided`、`invalid`、`archived`、`frozen`、`conflict`、`not-found`、`not-committed`、`unsupported`、`need-decision` |
| `4` | `result` 为 `response`，`outcome` 是 `basis-unavailable`。稍后可再试 |
| `5` | `result` 为 `uncertain`，或 `outcome` 是 `unknown` |
| `6` | `result` 为 `not-sent` |

退出码 `3` 到 `6` 只由 `result` 与 `outcome` 决定，不由 HTTP 状态码决定。

## 安装闭包

已接受的交付中，`package.json` 没有运行时依赖、peer 依赖或 optional 依赖。开发依赖只有 `typescript`、`vitest` 和 `@types/node`。构建产物只导入 `node:` 内置模块和 `dist` 内的相对模块。

命令面实现后，运行时依赖只有 `@omne-harness/sdk`。构建产物只导入 `node:` 内置模块、`dist` 内的相对模块和 `@omne-harness/sdk`。CLI 不直接导入公开契约、server-entry 和任何服务端包。SDK 重新导出 CLI 需要的消息类型与构造入口。`tests/package-boundary.spec.ts` 中「无 SDK 依赖」的断言随命令面一起改为上述依赖规则。`bin.omne` 指向 `./dist/bin.js`。该文件以 `#!/usr/bin/env node` 开头。`files` 只发布 `dist`。

## 适用平台

本规格适用于 macOS 和 Linux。Windows 上的路径分隔符和系统错误码可能不同，本规格不对 Windows 作出承诺。登录状态文件的权限规则只适用于 POSIX，Windows 上不收紧访问控制，见[登录状态](#登录状态)。测试覆盖与缺口见 [README 的验证一节](README.md#verification)。
