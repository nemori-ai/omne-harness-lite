# @omne-harness/cli 行为规格

本页是 `apps/cli` 的长期行为规格。它写类型表达不了的行为：输出、退出码、错误文本、构建身份和状态目录的创建时机。公开类型以 `src/index.ts` 的导出为准，本页不重复类型定义。

## 采用状态

PanQiWei 于 2026-10-14 接受本页对 #246 revision 1 的行为。依据是他在当前会话中的原话：把相关内容调整为正式接受状态，若与源码冲突则更新规格。二进制名 `omne`、包名 `@omne-harness/cli`、退出码、帮助文本、用法错误消息、默认状态目录 `$HOME/.omne`，以及本页其余行为条款，按当前源码接受。

[包组织](../../docs/package-organization.md#最小-cli-的接入边界)只规定了 help 和 version 不能做什么。本页补上的是那些未定细节。

下列条款由 #978 波 1 采用，依据是 DP-2 决策记录（评论 6561904972）与 R1-D27（评论 6562041248）：

- 「[范围](#范围)」中候选命令面的列表，以及通过 SDK 使用系统能力的一段。
- 「[输出与退出码](#输出与退出码)」中登记命令之后的帮助文本。
- 「[状态目录](#状态目录)」开头一段。
- 「[命令](#命令)」一节起至「[命令结果与退出码](#命令结果与退出码)」的全部内容。
- 「[安装闭包](#安装闭包)」中命令面实现后的一段。
- 「[适用平台](#适用平台)」中登录状态文件的一句。

「[治理命令](#治理命令)」、登录状态文件的 `loginId` 键、`switch-current-tenant` 与 `revoke-login` 对登录状态文件的改写和删除，以及帮助文本里的 18 个治理命令，属于 M2 身份租户收口（波 2）的候选，依据是 R2-D203 至 R2-D206 与规格 4.7 节 G 组。`read-history` 命令是波 3 的候选，依据是 R2-D279：端到端用例发现 CLI 没有读历史的入口。`read-session-diagnostics` 命令按 RFC-0013 revision 2 的本地范围采用，依据是 [RFC-0013 的 A 线](../../docs/rfcs/RFC-0013-engineering-telemetry.md#a-线会话日志诊断投影)。命令名按该提案的 DA5 采用。「[设置命令](#设置命令)」与帮助文本里的 `setting` 是 Web 元工具一程切片 03 的候选，承接公开契约新增的四个设置操作。

本页其余条款保持上面的接受状态。批复后，需要的话本页再改采用状态。候选依据是包组织页「最小 CLI 的接入边界」：CLI 通过 SDK 使用系统能力，不导入 server-entry。本卡验证环境接受本机 Node v26.0.0。`package.json` 的 engines 是 `>=24`。Node 24 没有另跑。

## 范围

本成员拥有以下责任：

- 进程入口 `omne`。
- 命令行参数解析。
- 读取构建身份。
- 解析和创建状态目录的公开函数。

已接受的交付只有两条成功路径：单独的 `--help` 和单独的 `--version`。这两条路径不调用状态目录的创建。

候选的命令面由下面的责任组成。

- 八个会话与账号命令、18 个治理命令和设置命令 `setting`，见[命令](#命令)。
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

| 情况           | 消息                                                         |
| -------------- | ------------------------------------------------------------ |
| 缺少命令       | `omne: missing command\nRun omne --help for usage.\n`        |
| 缺少目录       | `omne: --home requires a directory\n`                        |
| 无法识别的参数 | `omne: unrecognized arguments\nRun omne --help for usage.\n` |

## 输出与退出码

| 结果         | stdout                                      | stderr                                         | 退出码 |
| ------------ | ------------------------------------------- | ---------------------------------------------- | ------ |
| help         | 帮助文本                                    | 空                                             | `0`    |
| version      | 身份文件中的 `version` 加一个换行，不带前缀 | 空                                             | `0`    |
| 身份文件无效 | 空                                          | `omne: build identity is missing or invalid\n` | `1`    |
| 用法错误     | 空                                          | 上表中的一条消息                               | `2`    |

进程设置 `process.exitCode`，不调用 `process.exit()`。这样管道上的 stdout 在进程退出前写完。

帮助文本由 `renderHelp(productionCatalog)` 生成，不是另一份手写文档。命令目录为空时，生成结果是下面的原文。最后一行之后有一个换行：

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

登记[命令](#命令)的 25 个命令与[读诊断投影](#读诊断投影)的 `read-session-diagnostics` 之后（八个会话与账号命令，后接 18 个治理命令，最后是 `setting`，共 27 个），生成结果是下面的原文。第三行改为 `Show help or version, or run a command.`，`This build has no other commands.` 不再出现。目录另登记 `--server` 与 `OMNE_SERVER` 两个选项。帮助文本只列每个命令的必需选项，可选选项见[命令](#命令)的命令表。每个选项在帮助里的取值名按取值的内容定：标识写 `<id>`，租户文本写 `<tenant>`，角色写 `<role>`，其余写 `<name>`。最后一行之后有一个换行：

```text
omne

Show help or version, or run a command.

  omne --help
  omne --version

Commands

  omne register --login-identifier <id>                                                                           Register and activate an account.
  omne login --login-identifier <id>                                                                              Issue a login and save it in the state directory.
  omne create-session --definition <name>                                                                         Create a session.
  omne send-input --session <id> --text <text>                                                                    Send a user message to a session.
  omne read-history --session <id>                                                                                Read the whole history of a session.
  omne read-session-diagnostics --session <id>                                                                    Read the diagnostics of the runs of a session.
  omne cancel-run --session <id> --run <id>                                                                       Cancel a run.
  omne stop-call --session <id> --producer-kind <kind> --call <id>                                                Stop a model or tool call.
  omne create-organization --name <name> --governance-model-id <id>                                               Create an organization.
  omne query-create-organization --target-create-call-id <id> --name <name> --governance-model-id <id>            Ask what an earlier create-organization call did.
  omne issue-member-invitation --invited-login-identifier <id>                                                    Invite an account to the organization of the acting tenant.
  omne accept-member-invitation --invitation-id <id>                                                              Accept an invitation.
  omne reject-member-invitation --invitation-id <id>                                                              Reject an invitation.
  omne withdraw-member-invitation --invitation-id <id>                                                            Withdraw an invitation that this tenant issued.
  omne query-invitation --invitation-id <id>                                                                      Read one invitation.
  omne query-received-invitations                                                                                 List the invitations this account received.
  omne query-issued-invitations                                                                                   List the invitations this tenant issued.
  omne query-own-memberships                                                                                      List the memberships of this account.
  omne query-organization-members --organization-id <id>                                                          List the members of an organization.
  omne leave-organization                                                                                         Leave the organization of the acting tenant.
  omne remove-member --organization-id <id> --account-id <id> --expected-role <role>                              Remove a member from an organization.
  omne change-member-role --organization-id <id> --account-id <id> --expected-role <role> --target-role <role>    Change the role of a member.
  omne switch-current-tenant --tenant-id <tenant>                                                                 Switch the current tenant of this login.
  omne query-current-tenant                                                                                       Read the current tenant of this login.
  omne revoke-login                                                                                               Revoke a login. Without --target-login, log out of this one.
  omne query-own-valid-logins                                                                                     List the valid logins of this account.
  omne setting list|set|show|unset                                                                                List the settings of the acting tenant, or set, show or unset a secret one.

  --home <directory>    State directory. Overrides OMNE_HOME.
  OMNE_HOME             State directory when --home is absent.
  --server <url>        Server address. Overrides OMNE_SERVER.
  OMNE_SERVER           Server address when --server is absent.

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

已接受的交付的进程入口不调用下面两个函数。候选命令面中，`login`、会话命令与治理命令使用它们，规则见[状态目录的创建时机](#状态目录的创建时机)。

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

| 路径状态                     | 结果                                                                    | 文件系统效果                                           |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| 已是目录                     | `ready`                                                                 | 不改动目录中的条目                                     |
| 不存在                       | `ready`                                                                 | 创建该目录和缺失的上级目录，目录中没有本函数创建的文件 |
| 已被普通文件或其他非目录占用 | `error`，消息为 `omne: state directory <path> is not a directory\n`     | 不删除占用的文件                                       |
| 上级是普通文件               | `error`，消息为 `omne: cannot create state directory <path>: ENOTDIR\n` | 不删除该文件                                           |
| 没有权限                     | `error`，消息为 `omne: cannot create state directory <path>: EACCES\n`  | 不创建目录                                             |

其他系统错误使用同一格式。消息带上系统错误码。拿不到错误码时，消息去掉 `: <code>` 部分。

## 命令

下列八个命令和[治理命令](#治理命令)是候选。每个命令对应公开契约的一个操作。命令名与操作名一致。操作的字段、`outcome` 和判断次序归[公开契约](../../packages/access/public-contract/SPEC.md)。路径、方法和状态码归[承载绑定表](../../packages/access/public-contract/docs/http-binding.md#承载绑定表)。CLI 经 SDK 发出请求。

所有选项都写成 `--名字 值`。不支持 `--名字=值`。选项可以出现在命令名之后的任意位置。`--home` 的规则同[参数解析](#参数解析)。

| 命令                       | 公开操作                   | 必需选项                                 | 可选选项                                                  | 说明                                                                                         |
| -------------------------- | -------------------------- | ---------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `register`                 | `register-and-activate`    | `--login-identifier`                     | `--server`                                                | 凭据按[凭据读取](#凭据读取)读取。不读写状态目录                                              |
| `login`                    | `issue-login`              | `--login-identifier`                     | `--server`                                                | 凭据按[凭据读取](#凭据读取)读取。成功后写登录状态文件                                        |
| `create-session`           | `create-session`           | `--definition`                           | `--purpose`、`--create-call-id`、`--server`               | `actingTenant` 取登录状态里的租户。成功后记下会话的归属租户，见[会话归属记录](#会话归属记录) |
| `send-input`               | `send-input`               | `--session`、`--text`                    | `--tenant`、`--accept-id`、`--input-id`、`--server`       | `--text` 包成一条用户消息，形状归 message 包                                                 |
| `read-history`             | `read-history`             | `--session`                              | `--tenant`、`--page-bytes`、`--json`、`--server`          | 读完整个历史，见[读历史](#读历史)                                                            |
| `read-session-diagnostics` | `read-session-diagnostics` | `--session`                              | `--run`、`--tenant`、`--page-bytes`、`--json`、`--server` | 读完诊断投影，见[读诊断投影](#读诊断投影)                                                    |
| `cancel-run`               | `cancel-run`               | `--session`、`--run`                     | `--urgency`、`--tenant`、`--control-id`、`--server`       | `--urgency` 取 `graceful` 或 `force`，默认 `graceful`                                        |
| `stop-call`                | `stop-call`                | `--session`、`--producer-kind`、`--call` | `--tenant`、`--control-id`、`--server`                    | `--producer-kind` 取 `model` 或 `tool`                                                       |

补充规则如下。

- 当前选择的租户（登录状态里的租户）只用于新建会话：`create-session` 的 `actingTenant`。对已有会话的 `send-input`、`read-history`、`read-session-diagnostics`、`cancel-run`、`stop-call`，body 的 `tenant` 取会话的归属租户，不取当前选择。会话的归属在创建时定下，之后不变。`tenant` 的来源按下列次序，没有可用来源时不回落到当前选择：
  1. `--tenant` 的值。
  2. [会话归属记录](#会话归属记录)里该会话的租户。
  3. 两者都没有：用法错误，退出 `2`，不发送请求。消息为 `omne <command>: the owner tenant of this session is unknown\nAdd --tenant <tenant>.\n`。

  给了 `--tenant` 时不读取归属记录。这是客户端填充：线上的 `tenant` 仍是必填字段，服务端仍核对它的账号。结果对象的 `request.tenant` 回显实际发送的租户文本，见[命令结果与退出码](#命令结果与退出码)。

- 命令生成缺省的标识。每次执行命令生成新的 `messageId`。SDK 的零字节再送沿用同一个 `messageId`。`--create-call-id`、`--accept-id`、`--input-id` 和 `--control-id` 缺省时也各生成一个新值。生成值用 `crypto.randomUUID()`。调用者要重试同一次操作时，必须用这些选项传入原来的值。
- 命令不提供 `query-create-session`、`query-send-input`、`observe-session` 和 `cancel-observation` 的入口。观察命令在后续波。
- `--json` 是开关，不带值，只属于 `read-history` 与 `read-session-diagnostics`。它可以出现在命令名之后的任意位置，重复出现是用法错误。

### 读历史

`read-history` 读一个会话的全部历史，按页读到服务端报告读完为止。请求的 `tenant` 取会话的归属租户，来源次序同上一节。

- 第一页的请求带 `cursor` 为 null、`direction` 为 `forward` 和 `pageBytes`。`pageBytes` 取 `--page-bytes`，缺省 `65536`，必须是不带前导零的正整数文本。超出部署上界时服务端答 `invalid`。
- 后续每页的请求只带上一页回复的 `next` 原文作 `cursor`，不带 `direction` 和 `pageBytes`。公开契约规定这两个字段只在 `cursor` 为 null 时出现，带上它们的请求是 `protocol-rejected`。每页用新的 `messageId`。
- 页的 `exhausted` 为真时读完。空页不表示读完。
- 读不完整时，命令仍输出已经读到的条目，标准错误写 `omne read-history: history incomplete after <n> entries: <原因>
  `，退出码非零。原因是下列之一：`page <k> was answered <outcome>`（第 k 页的 `outcome` 不是 `succeeded`）、`page <k> had no trusted answer`（没有可信答复）、`page <k> is not a history page`（成功的回复不是历史页）、`page <k> has no cursor but is not the last`（未读完却没有 `next`）、`page <k> did not advance the cursor`（`next` 与本页请求的 `cursor` 相同）、`more than 10000 pages`。
- 退出码：读完为 `0`。停在某页的 `outcome` 时，按[命令结果与退出码](#命令结果与退出码)的映射：`denied` 等为 `3`，`basis-unavailable` 为 `4`；没有可信答复为 `5`，另写 `omne read-history: result uncertain
  `。成功的页不可读成历史页、缺游标或游标不前进为 `1`。标准输出写入失败为 `1`。
- 人读输出（缺省）每个条目一段，首行为 `#<entryId> <kind>: <正文>`。消息条目的正文是各块的文本，块之间换行，续行缩进四个空格：`text` 块显示文本，`tool_call` 块显示 `[tool call <名> <callId>] <参数>`；参数是多命令工具的单槽调用形状（只有字符串 `command`，至多再有对象 `params`），且命令是不含空白的短名（字母、数字、`_`、`.`、`-`，至多 64 个字符）时，显示 `[tool call <名> <命令> <callId>] <params>`，没有 `params` 时不显示参数，`tool_result` 块显示 `[tool result <callId>]`，随后的文本块显示结果内容。`run.started` 显示 `Run <run> started (entry <entry>)`，`run.terminal` 显示 `Run <run> ended: <outcome>`；outcome 不是 completed 且条目的 `cause` 带 record 时，续行显示 `cause: <record>`，即 Agent 终结结论的原因记录，模型调用失败时形如 `<execution>/<step>/model-failed/<故障原因>/<诊断>`。其余种类和块显示种类名与截断的载荷。参数与载荷最多显示 500 个字符，超出处写 `...`。人读输出不是 JSON 对象。
- `--json` 输出一个 JSON 对象加换行，键同[命令结果与退出码](#命令结果与退出码)。`body` 是 `{ entries, complete }`：`entries` 是各页的条目原样拼接（`entryId`、`revision`、`kind`、`payload`），`complete` 说明是否读完。停在某页时 `outcome` 是该页的 `outcome`，`result` 为 `uncertain` 时没有 `outcome`。`request` 有 `messageId`（首页）和 `tenant`。

### 读诊断投影

`read-session-diagnostics` 读一个会话的诊断投影：每个 Run 怎样开始、怎样结束、失败的原因，以及每次模型调用与工具调用实际发生了什么。页的形状与闭合规则归公开契约的[会话诊断页](../../packages/access/public-contract/SPEC.md#会话诊断页)。命令按页读到服务端报告读完为止。请求的 `tenant` 取会话的归属租户，来源次序同[命令](#命令)一节。

- 第一页的请求带 `cursor` 为 null、`run` 和 `pageBytes`。`run` 取 `--run` 的值，缺省为 null，表示全部 Run，从最新开始。`pageBytes` 取 `--page-bytes`，缺省 `65536`，必须是不带前导零的正整数文本。超出部署上界时服务端答 `invalid`。
- 后续每页的请求只带上一页回复的 `next` 原文作 `cursor`，不带 `run` 和 `pageBytes`。公开契约规定这两个字段只在 `cursor` 为 null 时出现。每页用新的 `messageId`。
- 页的 `exhausted` 为真时读完。空页不表示读完。每页的 `gaps` 并入结果。缺口是结果的一部分，不是读取失败：它不改变退出码，也不写标准错误。
- 读不完整时，命令仍输出已经读到的 Run 与缺口，标准错误写 `omne read-session-diagnostics: incomplete after <n> runs: <原因>`，退出码非零。原因的写法同[读历史](#读历史)。成功的回复不是诊断页时，原因是 `page <k> is not a diagnostics page`。
- 退出码：读完为 `0`，缺口不改变它。停在某页的 `outcome` 时，按[命令结果与退出码](#命令结果与退出码)的映射：`denied` 等为 `3`，`basis-unavailable` 为 `4`；没有可信答复为 `5`，另写 `omne read-session-diagnostics: result uncertain\n`。成功的页不可读成诊断页、缺游标或游标不前进为 `1`。标准输出写入失败为 `1`。
- 人读输出（缺省）每个 Run 一段，Run 按页的次序。段的首行是 `Run <run> (entry <entry>, execution <execution>): <outcome>`。Run 未终结时 `<outcome>` 处写 `not ended`。页里带原因的 `unknown` 值一律写 `unknown (<原因>)`，下文记作 `unknown (<reason>)`。括号让原因不被读成闭合字段的值。不带原因的未知值（时刻、毫秒数、为 null 的字段、没有数值的项）只写 `unknown`。随后的行缩进两个空格，按下面的次序出现：
  - `started: position <position> at <时刻>`。没有时刻时写 `unknown`。
  - `attempts: <started>`。`released` 的某项计数或 `exited` 不为 `0` 时，同一行后面加括号，只写不为 `0` 的项。`released` 组写 `released: <reason> <n>, ...`，`<reason>` 按 `ended`、`bounded`、`cancelled`、`released`、`superseded` 的次序。`exited` 写 `exited <n>`。两组都有时，中间用 `; ` 分开。例如 `attempts: 2 (released: ended 1, superseded 1; exited 1)`。
  - `cause: <record>`。只在 Session 记录了原因文本时出现。
  - `reason: <原因>`。只在 Run 已终结且结束候选不是 `none` 时出现。原因是结束候选的种类加它的闭合字段，各项用空格分开：`model-refused <failure>`（例如 `model-refused capacity`）、`no-reply <cause> <upstreamStatus>`（例如 `no-reply upstream-unavailable 504`，字段为 null 时写 `unknown`）、`no-failure <conclusion>`、`cannot-fit <reason>`、`unknown (<reason>)`（例如 `unknown (denied)`）。`model-refused` 的 `failure` 与 `cannot-fit` 的 `reason` 为 `unknown` 时也写 `unknown (<reason>)`，例如 `model-refused unknown (unsupported)`。其余种类只写种类名。
  - 每个控制一行：`control <kind> at <position>: <target> <intent> <state>`。条目不带的字段写 `-`。
  - `model calls: <n>`。每次模型调用再缩进两个空格：`<purpose> <reference> -> call <call> (<phase>), <n> dispatch(es), coverage <coverage>`。调用未解析时写 `call unknown (<reason>)`。每次派发再缩进两个空格：`<dispatch> <adapter 的 name>: <send>, first content <firstContent>, <outcome>`。`outcome` 为 `completed` 时写 `completed <reason>`，为 `failed` 时写 `failed <cause> http <upstreamStatus>`（例如 `failed upstream-unavailable http 504`，状态为 null 时写 `unknown`）。派发行之下再缩进两个空格写两行。第一行 `timing: materialize <t>, send to first content <t>, execution <t>`，每项写毫秒数加 ` ms`，或 `unknown`。第二行 `account: <账目>`，是这次派发的账目。调用有执行事实时，最后一行是 `facts: <kind> <count>, ...`，没有时不出现。账目写作 `<usage 各项>; cost: <cost 各项>; duration <value>; receipt <receipt>`。每项写 `<名字> <数值> <单位> <状态>`。名字是 usage 项的 `name` 或 cost 项的 `source`。数值是 `lexeme`，没有时写 `unknown`。状态是 `known`、`provisional` 或 `unknown`。例如 `output_tokens unknown token unknown`。没有项时写 `none`。`duration` 没有值时写 `unknown`。账目不可读时写 `account: unknown (<reason>)`。
  - `tool calls: <n>`。每次工具调用：`<reference> -> call <call> (<phase>, <relation>), <terminal>`。`<terminal>` 是结局种类，有原因文本时加在后面，未终结写 `not ended`。状态未解析时写 `call unknown (<reason>)`。随后的行再缩进两个空格，依次是账目行、执行事实行与诊断行。账目行是 `account: <账目>`，写法同模型派发的账目。执行事实行是 `facts: <kind> <count>, ...`，只在有执行事实时出现。诊断是条目数组时写 `diagnostics: <条目数>`，然后每个条目一行，再缩进两个空格：`<operation> <phase> <code>`。诊断为 `unknown` 时写 `diagnostics: unknown (<reason>)`。
  - `messages: <kind> <count>, ...`。没有消息时不出现。
  - `facts: <kind> <count>, ...`：没有归到某次调用的执行事实。没有时不出现。

  全部 Run 之后，有缺口时写 `gaps: <n>`，然后每个缺口一行，缩进两个空格：`<source> <subject>: <reason>`。没有 Run 也没有缺口时不输出。人读输出不是 JSON 对象。它不含供应商错误原文、消息正文或工具参数，因为诊断页不带它们。

- `--json` 输出一个 JSON 对象加换行，键同[命令结果与退出码](#命令结果与退出码)。`body` 是 `{ runs, gaps, complete }`：`runs` 是各页的 Run 原样拼接，`gaps` 是各页的缺口原样拼接，`complete` 说明是否读完。停在某页时 `outcome` 是该页的 `outcome`，`result` 为 `uncertain` 时没有 `outcome`。`request` 有 `messageId`（首页）和 `tenant`。

### 治理命令

下面 18 个命令各对应公开契约的一个治理操作，命令名等于操作名。它们都经 SDK 的治理客户端，发往治理位置。每个命令都需要一份登录：证明取登录状态文件里的 `loginProof`，需要行事租户的操作把登录状态文件里的 `tenantId` 作为 `actingTenant`。命令不接受别的租户。哪些操作需要行事租户归[公开契约](../../packages/access/public-contract/SPEC.md)的字段表。所有命令都可以带 `--server`，服务地址的取值同[服务地址](#服务地址)。

| 命令                                                                                                    | 必需选项                                                                | 可选选项                                 | 说明                                                                      |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `create-organization`                                                                                   | `--name`、`--governance-model-id`                                       | `--create-call-id`                       | 有行事租户。`--create-call-id` 缺省时生成，重试同一次意图要传入原值       |
| `query-create-organization`                                                                             | `--target-create-call-id`、`--name`、`--governance-model-id`            | 无                                       | 无行事租户                                                                |
| `issue-member-invitation`                                                                               | `--invited-login-identifier`                                            | `--duration`                             | 有行事租户。时长的写法归部署配置                                          |
| `accept-member-invitation`、`reject-member-invitation`、`withdraw-member-invitation`                    | `--invitation-id`                                                       | 无                                       | 有行事租户。`expectedState` 恒为 `open`                                   |
| `query-invitation`                                                                                      | `--invitation-id`                                                       | 无                                       | 有行事租户                                                                |
| `query-received-invitations`、`query-own-memberships`、`query-current-tenant`、`query-own-valid-logins` | 无                                                                      | 无                                       | 无行事租户                                                                |
| `query-issued-invitations`、`leave-organization`                                                        | 无                                                                      | 无                                       | 有行事租户                                                                |
| `query-organization-members`                                                                            | `--organization-id`                                                     | `--include-removed`（`true` 或 `false`） | 有行事租户                                                                |
| `remove-member`                                                                                         | `--organization-id`、`--account-id`、`--expected-role`                  | 无                                       | 有行事租户                                                                |
| `change-member-role`                                                                                    | `--organization-id`、`--account-id`、`--expected-role`、`--target-role` | 无                                       | 有行事租户                                                                |
| `switch-current-tenant`                                                                                 | `--tenant-id`（租户文本）                                               | 无                                       | 有行事租户。成功后更新登录状态文件，见[登录状态](#登录状态)               |
| `revoke-login`                                                                                          | 无                                                                      | `--target-login`                         | 无行事租户。不带 `--target-login` 时目标是本登录，见[登录状态](#登录状态) |

- 命令在读登录状态之前先检查选项。选项缺失、重复、不属于该命令，或值不是对应的标识、租户文本或 `true`／`false`，是用法错误，退出 `2`，不发送请求。组织、账号和登录的标识文本，以及租户文本，由 SDK 读成身份值。
- 服务端声明本部署不提供某个操作时，答 `stage-not-provided`。命令按[命令结果与退出码](#命令结果与退出码)输出该结果，退出 `3`，不当作错误。
- 命令不提供观察、历史、隶属请求、授权表达与准入判断的入口。组织隶属、更换密码、阶段操作和这些操作都晚于本阶段。M2 部署的治理范围见服务端接入规格的[治理位置](../../packages/access/server-entry/SPEC.md#治理位置)。

### 设置命令

`setting` 管理行事租户自己的设置项。它有四个子命令，各对应公开契约的一个治理操作，见公开契约的[设置项](../../packages/access/public-contract/SPEC.md#设置项)。

| 子命令                            | 操作               | 选项       | 输出                                              |
| --------------------------------- | ------------------ | ---------- | ------------------------------------------------- |
| `setting list [<asset>]`          | `list-settings`    | `--server` | 结果对象，见[命令结果与退出码](#命令结果与退出码) |
| `setting set <asset> <item>`      | `set-setting`      | `--server` | 结果对象                                          |
| `setting show <asset> <item>`     | `describe-setting` | `--server`、`--json` | 缺省是两行摘要。加 `--json` 时是结果对象 |
| `setting unset <asset> <item>`    | `clear-setting`    | `--server` | 结果对象                                          |

- `<asset>` 写成 `[<category>:]<name>`。第一个冒号之前是 `category`，之后是 `name`。没有冒号时，请求的 `asset` 只有 `name`，不带 `category`。冒号前或冒号后为空，是用法错误。`<item>` 是该资产声明的项标识。
- 四个子命令都需要一份登录。证明取登录状态文件里的 `loginProof`，`actingTenant` 取同一文件里的 `tenantId`。命令不接受别的租户。
- 子命令缺失或不是这四个之一，是用法错误，消息用 `setting` 作命令名。缺少 `<asset>` 或 `<item>` 时，消息是 `omne setting <子命令>: missing <asset>` 或 `missing <item>`。多余的位置参数、未知选项和不合法的 `<asset>` 是无法识别的参数，消息用 `setting set` 这样的两词命令名。退出码都是 `2`，不发送请求。选项可以出现在子命令之后的任意位置。
- `set` 不接受命令行上的秘密。命令先读登录状态，再按[凭据读取](#凭据读取)的规则读秘密：TTY 上不回显，管道上读到第一个换行。没有登录时命令退出 `1`，不读秘密。秘密为空串时命令退出 `2`，消息为 `omne: empty secret\n`，不发送请求。
- 秘密只进入 `set-setting` 的请求。命令不把它写进标准输出、标准错误、状态目录或错误文本。`set` 的结果对象只带请求编号、租户与 `configuredAt`。
- `show` 的摘要写两行，每行以换行结尾：`Your key: <状态>` 是行事租户自己这一层，`Deployment default: <状态>` 是部署默认（官方层）。状态写 `not set`、`set`、`set, but revoked` 或 `set, but it cannot be read`；有配置时刻时后接 ` (configured at <时刻>)`。其他 `outcome` 只写 `Result: <outcome>`。没有可信答复时写 `Result: uncertain`，标准错误另写 `omne setting show: result uncertain`。`--json` 只属于 `show`，结果对象的 `body` 是 `{ own, official }`。
- `list` 的结果对象带全部条目：秘密项的 `state` 是行事租户这一层，`official` 是部署默认；普通设置项的 `state` 是 `not-writable`。
- 设置命令只读写行事租户这一层。部署默认由运维者在本机写入（服务端的 `setup`），本命令不提供写它的路径。
- 退出码按[命令结果与退出码](#命令结果与退出码)的映射。`unset` 在没有配置时答 `no-change`，退出 `0`。`not-writable` 退出 `3`。

### 服务地址

服务地址按下面的次序取值。

1. `--server` 的值。
2. 环境变量 `OMNE_SERVER`。
3. 登录状态文件里 `login` 记录的地址，仅会话命令与治理命令使用。
4. 本机配置的地址，仅 `register` 与 `login` 使用。`harness-server setup` 在本机写的配置文件 `server.json` 给出端口时，地址是 `http://127.0.0.1:<port>`。文件的位置与形状归 harness-server 的[本机单用户档](../harness-server/SPEC.md#本机单用户档)：设了 `OMNE_SERVER_HOME` 时是 `<目录>/config/server.json`；Windows 上是 `%LOCALAPPDATA%\omne\config\server.json`；其他平台是 `$XDG_CONFIG_HOME/omne/server.json`，默认 `~/.config/omne/server.json`。CLI 只读其中的 `port`。文件不存在时取下一项。文件读不出、不是 JSON、没有 1 至 65535 的整数 `port`，或 `OMNE_SERVER_HOME` 不是绝对路径时，命令退出 `1`，标准错误写一行原因（例如 `omne: the local server settings <path> give no port\n`），不读凭据，不发请求。
5. 默认值 `http://127.0.0.1:8787`。这是 CLI 自己的默认值，也是 `harness-server setup` 的默认端口。服务端的监听端口由装配配置给出，见[应用装配](../../docs/architecture/runtime/application-assembly.md)。两者不一致时，用户用 `--server` 或 `OMNE_SERVER` 给出地址。

CLI 把地址交给 SDK 的 HTTP 传输适配。适配拒绝地址时，命令按用法错误处理，消息为 `omne: --server must be a loopback http address\n`。哪些地址被拒绝是 SDK 的 M2 已知限制，见 SDK 的[已知限制](../../packages/access/sdk/SPEC.md#已知限制)。

### 命令的用法错误

命令的用法错误使用下面两条消息。退出码为 `2`。每条以换行结尾。

| 情况                                                                   | 消息                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 缺少必需选项                                                           | `omne <command>: missing <option>\nRun omne --help for usage.\n`       |
| 选项缺值、选项重复、选项不属于该命令、取值不合法、或出现多余的位置参数 | `omne <command>: unrecognized arguments\nRun omne --help for usage.\n` |

## 凭据与登录状态

### 凭据读取

`register` 和 `login` 需要账号凭据。命令不接受命令行上的凭据选项，因为命令行会进入进程列表和 shell 历史。

- 标准输入是 TTY 时，命令在标准错误写提示 `Credential: `，再从终端读一行，不回显。终端不能关闭回显时，命令退出 `1`，消息为 `omne: cannot read the credential without echo\n`。命令不退回带回显的读取。
- 标准输入不是 TTY 时，命令读到第一个换行或输入结束，去掉末尾的换行。
- 读到的凭据为空串时，命令退出 `2`，消息为 `omne: empty credential\n`。
- 凭据只用于构造请求。命令不把它写进标准输出、标准错误（提示除外）、状态目录、日志或错误文本。

### 登录状态

`login` 成功后，在状态目录写文件 `login.json`。文件内容是一个 JSON 对象，含 `version`（值为 `1`）、`server`、`loginIdentifier`、`issuedAt`、`tenantId` 和 `loginProof`。签发响应带 `loginId` 时，文件另含字符串键 `loginId`，值是这份登录的标识，供 `revoke-login` 使用；响应没有它时文件不含这个键。读文件时 `loginId` 可有可无，别的键不许多也不许少。`loginProof` 只存在于这个文件里。

- 写入先写临时文件，再改名。失败时旧文件保持原样。
- 文件权限是 `0600`。命令新建的状态目录权限是 `0700`。已有目录的权限不改。
- POSIX 上，会话命令读取该文件前检查权限。文件对组或其他用户可读时，命令退出 `1`，消息为 `omne: login state is readable by other users\n`。
- Windows 上命令不收紧访问控制，也不检查它。这是已知限制。
- 文件不存在时，会话命令退出 `1`，消息为 `omne: not logged in\nRun omne login first.\n`。文件内容不是预期形状时，消息为 `omne: login state is invalid\n`。两种情况都不创建状态目录。
- 登录证明有期限。过期或被撤销后，服务端答 `denied`，命令照常输出结果。用户重新执行 `login`。
- `switch-current-tenant` 答 `succeeded` 时，把文件里的 `tenantId` 改为响应 body 里的 `tenantId`，其余键不变。写法同上：临时文件加改名，失败时旧文件保持原样。答 `no-change`、`denied`、`basis-unavailable`、`stage-not-provided` 或其他结果，以及结果不确定时，不改文件。改写失败时，命令照常输出结果对象，标准错误写 `omne switch-current-tenant: cannot write login state <path>[: <code>]\n`，退出 `1`。之后的命令仍以旧租户行事。切换只影响之后的命令。已有会话的归属记录不变，见[会话归属记录](#会话归属记录)。
- `revoke-login` 不带 `--target-login` 时，目标是本登录，取文件里的 `loginId`。文件没有 `loginId` 时，命令不发送请求，用法错误，退出 `2`，标准错误写 `omne revoke-login: the login id of this login is unknown\nRun omne login again, or add --target-login <id>.\n`。带 `--target-login` 时目标是它的值。目标是本登录，指不带 `--target-login`，或它的值等于文件里的 `loginId`。目标是本登录且结果是 `succeeded` 或 `no-change` 时，命令删除 `login.json`，本机不再持有已失效的证明。`denied`、`not-visible`、`basis-unavailable`、`stage-not-provided`、结果不确定，以及目标是别的登录时，不删文件。删除失败时，命令照常输出结果对象，标准错误写 `omne revoke-login: cannot remove login state <path>[: <code>]\n`，退出 `1`。文件已经不在不算失败。命令只删 `login.json`，不删状态目录和 `sessions.json`。

### 会话归属记录

会话的归属租户在创建时定下，之后不变。会话标识是摘要，推不出租户，所以客户端自己记。`create-session` 的结果是 `succeeded`（含 `recovered` 为真）且带 `session` 时，命令在状态目录的 `sessions.json` 里记下「会话标识 → `actingTenant` 文本」。文件内容是一个 JSON 对象，含 `version`（值为 `1`）和 `sessions`（会话标识到租户文本的对象）。除此之外不存任何内容。

- 写入方式和权限同[登录状态](#登录状态)：临时文件加改名，权限 `0600`，同一个状态目录。
- 文件不存在是「没有记录」。读不了（目录、权限等）、不是 JSON、形状不对、含不是租户文本的值，都是本地失败，退出 `1`，消息为 `omne: cannot read session records <path>[: <code>]\n` 或 `omne: session records <path> are invalid\n`。命令不把它当作「没有记录」，也不回落到当前选择的租户。用户删除该文件，或对命令加 `--tenant`，可以继续。
- `create-session` 在发送请求之前先读该文件。文件损坏时退出 `1`，不发送请求，也就不会建出一个记不下的会话。
- 会话已创建但写不下记录时，命令照常输出结果对象，标准错误写 `omne create-session: cannot write session records <path>[: <code>]\n`，退出 `1`。之后对该会话的命令需要 `--tenant`。
- 已知限制：记录只覆盖本机状态目录里用 `create-session` 建的会话。别处建的会话、换了状态目录、或删了文件后，用 `--tenant` 指明。两个 `create-session` 同时在同一状态目录里写，后写的可能覆盖先写的那条记录。

### 状态目录的创建时机

候选命令面里只有 `login` 创建状态目录。治理命令与会话命令一样只读取目录。

| 命令                                                                                                  | 状态目录                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--help`、`--version`、用法错误                                                                       | 不解析，不创建，规则见[输出与退出码](#输出与退出码)                                                                               |
| `register`                                                                                            | 不解析，不创建，也不读 `OMNE_HOME`。带 `--home` 是用法错误，使用[命令的用法错误](#命令的用法错误)中「选项不属于该命令」那一条消息 |
| `login`                                                                                               | 在发送任何请求之前解析并创建。创建失败则退出 `1`，不发送凭据。凭据错误等非成功结果不删除已创建的空目录                            |
| 治理命令                                                                                              | 只读取目录。不存在时不创建，退出 `1`。`switch-current-tenant` 改写 `login.json`，`revoke-login` 可能删除它，两者都不创建目录      |
| `create-session`、`send-input`、`read-history`、`read-session-diagnostics`、`cancel-run`、`stop-call` | 只读取目录。不存在时不创建，退出 `1`。`create-session` 成功后在其中写 `sessions.json`，其余五个读它                               |

`login` 先创建目录再发送请求。这样可以降低签发成功后写不下登录证明的可能，但不能排除它。

签发成功后，写临时文件或改名仍可能失败。这时命令照常在标准输出写结果对象：`result` 为 `response`，`outcome` 为 `succeeded`，`body` 去掉 `loginProof`。标准错误写 `omne login: cannot write login state <path>: <code>\n`，拿不到错误码时去掉 `: <code>` 部分。命令退出 `1`。这份登录没有本机持有者。同一账号的另一份登录可以用输出里的 `loginId` 执行 `revoke-login --target-login` 撤销它，否则它在过期之前一直有效。这是已知限制。

## 命令结果与退出码

命令的结果写一个 JSON 对象到标准输出，后接一个换行。`read-history` 与 `read-session-diagnostics` 缺省的人读输出除外，见[读历史](#读历史)与[读诊断投影](#读诊断投影)。TTY 与非 TTY 的输出相同。本成员不加载终端界面。标准错误只在本地失败、凭据提示、用法错误和结果不确定时有内容。

对象的键如下。

| 键        | 出现条件               | 内容                                               |
| --------- | ---------------------- | -------------------------------------------------- |
| `result`  | 总是                   | `response` 或 `uncertain`                          |
| `outcome` | `result` 为 `response` | 公开契约的 `outcome`                               |
| `body`    | `result` 为 `response` | 响应的 `body`。`login` 的 `body` 去掉 `loginProof` |
| `request` | 总是                   | 一个对象，见下表                                   |

`request` 对象的键随命令而定。每个值都是本次发送使用的原文，包括命令生成的值和用户给出的值。

| 命令                                       | `request` 的键                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `register`、`login`                        | `messageId`                                                                           |
| `create-session`                           | `messageId`、`createCallId`、`tenant`（取 `actingTenant`）                            |
| `send-input`                               | `messageId`、`acceptId`、`inputId`、`tenant`                                          |
| `read-history`、`read-session-diagnostics` | `messageId`（首页）、`tenant`                                                         |
| `cancel-run`、`stop-call`                  | `messageId`、`controlId`、`tenant`                                                    |
| 有行事租户的治理命令                       | `messageId`、`tenant`（取 `actingTenant`）。`create-organization` 另有 `createCallId` |
| 无行事租户的治理命令                       | `messageId`。`revoke-login` 另有 `targetLoginId`                                      |
| `setting` 的子命令                         | `messageId`、`tenant`（取 `actingTenant`）                                            |

`result` 的含义如下。`response` 表示收到可信答复。`uncertain` 表示调用者没有可信答复，结果不确定。请求字节可能已经发出，也可能两次都没有发出，例如服务没有启动。SDK 只给出 `uncertain`，所以 CLI 不区分这两种情况。`uncertain` 不是成功，也不是没有发生。`request` 让用户可以用原标识重试同一意图。`messageId` 不必沿用。

`result` 为 `uncertain`，或 `outcome` 为 `unknown` 时，标准错误另写 `omne <command>: result uncertain\n`。

标准输出不含登录证明、凭据、签发者和游标密钥。

退出码如下。已接受的 `0`、`1`、`2` 含义不变。

| 退出码 | 条件                                                                                                                                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`    | `result` 为 `response`，`outcome` 是 `succeeded` 或 `no-change`                                                                                                                                                                                                              |
| `1`    | 本地失败：身份文件无效、状态目录、登录状态文件或会话归属记录的错误、凭据读取失败、标准输出写入失败。`login` 签发成功后写不下登录状态文件、`create-session` 成功后写不下会话归属记录也是 `1`，它优先于 `0`                                                                    |
| `2`    | 用法错误，包括服务地址不合法                                                                                                                                                                                                                                                 |
| `3`    | `result` 为 `response`，`outcome` 是其余的非成功结果：`denied`、`not-visible`、`uniform-auth-failure`、`not-loginable`、`protocol-rejected`、`stage-not-provided`、`invalid`、`archived`、`frozen`、`conflict`、`not-found`、`not-committed`、`unsupported`、`not-writable`、`need-decision` |
| `4`    | `result` 为 `response`，`outcome` 是 `basis-unavailable`。稍后可再试                                                                                                                                                                                                         |
| `5`    | `result` 为 `uncertain`，或 `outcome` 是 `unknown`。结果不确定                                                                                                                                                                                                               |

退出码 `3` 到 `5` 只由 `result` 与 `outcome` 决定，不由 HTTP 状态码决定。退出码共有 `0` 到 `5` 六个。

## 安装闭包

已接受的交付中，`package.json` 没有运行时依赖、peer 依赖或 optional 依赖。开发依赖只有 `typescript`、`vitest` 和 `@types/node`。构建产物只导入 `node:` 内置模块和 `dist` 内的相对模块。

命令面实现后，运行时依赖只有 `@omne-harness/sdk`。构建产物只导入 `node:` 内置模块、`dist` 内的相对模块和 `@omne-harness/sdk`。CLI 不直接导入公开契约、server-entry 和任何服务端包。SDK 重新导出 CLI 需要的消息类型与构造入口。`bin.omne` 指向 `./dist/bin.js`。该文件以 `#!/usr/bin/env node` 开头。`files` 只发布 `dist`。

## 适用平台

本规格适用于 macOS 和 Linux。Windows 上的路径分隔符和系统错误码可能不同，本规格不对 Windows 作出承诺。登录状态文件的权限规则只适用于 POSIX，Windows 上不收紧访问控制，见[登录状态](#登录状态)。测试覆盖与缺口见 [README 的验证一节](README.md#verification)。
