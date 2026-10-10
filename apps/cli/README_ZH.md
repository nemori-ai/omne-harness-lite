# OMNE CLI

[English](README.md)

CLI 用于开启终端对话、继续已有会话，以及管理治理中心和租户访问。
当前 B01 交付支持 Linux、多轮对话，以及通过 OpenRouter 模型发起真实 Shell 工具调用。
这是正式发布前的版本。本次不交付 macOS、优先插入、归档和运行中宿主的模型切换。

## 运行要求

- `PATH` 中有 **Node.js 24.21.0**。发行归档不包含 Node.js。
- Linux 上具备可用的 systemd 用户管理器和 scope，以及 `/usr/bin/env`、`/usr/bin/stty` 和 `/bin/bash`，供 Shell 使用。
- 可访问的治理中心及其 TLS 信任配置。安装 CLI 不会部署中心，部署入口见 [tenancy-host](../tenancy-host/README.md)。
- 用于模型请求的 OpenRouter 凭据，以及随包目录中已支持的模型。
- 交互命令需要独占 UTF-8 终端，窗口至少 60 列、16 行，并支持括号粘贴和替代屏的模式查询。

在当前本地终端或 SSH 会话中直接执行 `omne`。不需要 `DISPLAY`、X11 转发或 `OMNE_TERMINAL_PROFILE`。CLI 会查询终端实际能力，修改 `TERM` 不能补足缺失的能力。
终端须保留括号粘贴边界，并阻止粘贴正文伪造结束定界符。JSON 命令不依赖这些终端能力。

## 构建和安装

从仓库根目录生成归档，目标使用新的绝对路径：

```bash
./scripts/package-cli.sh /absolute/new/omne-cli.tar.gz
```

先创建输出父目录。目标文件必须不存在。
打包命令构建 CLI 的依赖闭包，从本机 pnpm 存储离线收集生产依赖，并检查部署目录中的实际 `node-pty` 原生模块。
依赖准备见[开发指南](../../docs/development.md)。打包期间不要修改源码、锁文件或 `dist`。
该命令只生成归档，不安装 CLI、不上传发行版，也不配置账号。

通过可信渠道取得归档和 SHA-256 摘要。解压前核对摘要，再安装到新目录：

```bash
set -eu
archive=/absolute/path/omne-cli.tar.gz
sha256sum "$archive"
build_id=$(tar -xOf "$archive" app/BUILD_ID)
install_dir="$HOME/.local/share/omne/builds/$build_id"
mkdir -p "$HOME/.local/share/omne/builds" "$HOME/.local/bin"
mkdir "$install_dir"
tar -xzf "$archive" -C "$install_dir"
ln -s "$install_dir/app/bin/omne.js" "$HOME/.local/bin/omne"
export PATH="$HOME/.local/bin:$PATH"
omne --version
omne --help
```

安装目录或命令链接已存在时，上述命令停止。不要覆盖正在使用的安装。
升级时解压到另一个新目录，再明确修改命令链接。
已有宿主继续使用原运行代码。切换代码不会停止宿主，也不保证旧代码能读取新版数据。
`BUILD_ID` 标识打包文件清单，不是签名，也不表示可重现构建。仓库构建没有该标识时显示 `development`。

## 开始对话

在本地终端或 SSH 会话中，替换工作目录：

```bash
cd /absolute/path/to/your-workspace
omne
```

当前目录成为新会话的 Shell 工作目录。继续已有会话时保留其原工作目录。
默认入口先补齐中心、登录和模型配置，再创建会话。

- 没有中心时，输入中心地址、显示名和 TLS 信任信息。
- 没有有效登录时，选择登录或注册。注册不自动登录；注册完成后明确选择登录。
- 已登录时，入口核对当前租户。登录动作本身不创建会话。
- 当前租户没有运行中的宿主时，选择已支持的模型；需要模型凭据时提供受保护的 OpenRouter 凭据文件。
- 已有宿主可读时，复用其初始模型和已保存凭据，不重复模型准备。

选择项需要输入显示的编号并按 Enter。确认前用 PageUp/PageDown 阅读全部页面。
在 **Message** 页面输入一条消息并按 Enter。等待 **Assistant** 页面，再按 Enter 返回输入。
随包会话定义包含 Shell。工具结果在有对应字段时显示输出、退出状态和截断计数。

手动检查时，先让模型记住一个独特的词，下一轮询问该词，再要求 Shell 在工作目录创建并读取文件。
在系统终端单独核对该文件。模型声称执行过，不等于工具实际执行。

## 用非交互命令注册和登录

将示例值替换为实际中心地址和私有文件：

```bash
omne center add https://center.example.org \
  --name personal-center --ca-file /absolute/private/center-ca.pem --json
omne register --center personal-center \
  --login-identifier your-login --credential-file /absolute/private/login-credential --json
omne login --center personal-center \
  --login-identifier your-login --credential-file /absolute/private/login-credential --json
```

信任选项只能选一个：`--system-ca`、`--ca-file <path>` 或 `--spki <sha256>`。
CLI 先核对中心的实际身份，再保存连接配置。
注册创建个人组织。
登录成功后准备并选中中心返回的租户。对于新账号，该租户是个人租户。
团队创建和接受邀请是另外的动作，不会自动切换当前租户。

凭据文件必须通过 CLI 的私有文件检查。私有目录使用 `0700`，凭据文件使用 `0600`。
完整 UTF-8 内容就是凭据，包括空格、BOM 和末尾换行。CLI 不会 trim。
`echo` 通常会增加换行；后续登录必须保留原始字节。本版本没有管理员密码重置。
不要把凭据内容放进命令参数、Git 或诊断报告。

## 退出和继续会话

Ctrl+G 取消当前输入或脱离对话。Ctrl+C 退出客户端。
单独按 Escape 不会取消。多行粘贴作为一个输入被拒绝，不会拆成多条消息提交。
输入输出结束后，客户端恢复终端状态。已经开始的粘贴必须结束，才能归还终端。

脱离只结束客户端等待，不停止租户宿主，也不取消已受理的 Run。
退出提示给出会话 ID。将下面的 `SESSION_ID` 替换为实际 ID：

```bash
omne --session SESSION_ID
```

每个新 Run 开始前检查当前登录有效性。登录到期不停止正在执行的 Run。
如果排队消息需要重新登录，完成登录并保留原回执，不要重发已受理消息。
运行中的宿主能观察新登录并重新核对待处理输入。

## 模型选择与边界

所有模型请求经 OpenRouter 发送。模型定义和输入计量器来自[随包模型目录](../../packages/model/pi-ai-transport/README_ZH.md)。
CLI 将统一的 `officialCatalog` 导入租户模型目录，再根据已登记条目生成选择列表。
模型定义、路由和输入计量器由模型包维护，CLI 不另写一份逐型号列表。
模型在上游可用，不表示已经在当前 CLI 注册。
当前目录尚未包含 `openai/gpt-6.1-sol`；修改名称或使用 `openai/gpt-6-sol` 不能代替该模型的接入。

模型使用要求已注册，并与当前装配的输入模态相容。本次不约束账号额度。
当前 CLI 没有为已有宿主切换模型的命令。界面中的初始模型也不是每个会话当前运行状态的报告。
不要通过修改 SQLite、替换模型标识或删除锁来切换模型。

## 命令一览

准确语法见 `omne --help`。用 `--home <absolute-path>` 选择独立状态根目录。
非 TTY 治理命令需要 `--json` 和全部必要参数。JSON 模式即使在 TTY 中也不会补交互答案。

| 命令 | 作用 |
| --- | --- |
| `omne` | 准备身份和模型配置，然后创建会话。 |
| `omne --session <id>` | 附着指定会话。 |
| `omne --message-file <path> --json [--session <id>]` | 提交 JSON 用户消息并观察对应 Run。 |
| `omne center add <endpoint> --name <name> <trust-option>` | 保存经过核验的治理中心。 |
| `omne tenant create --name <name>` | 创建具名团队组织并准备其租户。 |
| `omne tenant add --invitation <id>` | 接受邀请并准备其租户。 |
| `omne tenant switch <tenant-reference>` | 切换到当前中心及账号下已核验的租户。 |
| `omne register --login-identifier <id> --credential-file <path> [--center <name>]` | 注册账号。 |
| `omne login --login-identifier <id> --credential-file <path> [--center <name>]` | 登录并准备所选租户。 |
| `omne logout` | 注销当前登录。 |
| `omne logins list` | 读取当前账号的登录状态。 |
| `omne logins revoke --handle <handle>` | 撤销指定登录状态。 |
| `omne credential change --current-credential-file <path> --new-credential-file <path>` | 更改账号凭据。 |

租户引用是 CLI 返回的完整 `TenantBinding` JSON，包含 `formatVersion`、`centerId`，以及带 `organization` 和 `account` 的 `tenant`。
把该 JSON 作为一个带引号的参数传入。目录 key、显示名或单独的组织 ID 都不是租户引用。
旧 `machine` 前缀、`tui` 别名和原治理命令集已经移除。

## 提交 JSON 消息

此路径要求当前租户的宿主已配置并运行。文件内容必须是完整 `UserMessage`，不是普通提示词文本。例如：

```json
{
  "id": "manual-message-001",
  "type": "user",
  "createdAt": "2026-10-10T12:00:00Z",
  "blocks": [
    {
      "id": "manual-text-001",
      "kind": "text",
      "text": "Reply with hello.",
      "visibility": { "toHuman": true, "toModel": true }
    }
  ]
}
```

每条新消息使用新的消息 ID、内容块 ID、实际创建时间和独立文件。提交前替换上述示例值：

```bash
omne --message-file /absolute/path/message.json --json
omne --message-file /absolute/path/next-message.json --json --session SESSION_ID
```

没有 `--session` 时，CLI 先按宿主实际创建偏好创建会话，再提交消息。
有 `--session` 时，消息进入该已有会话。响应保留操作身份和回执。
结果不明或等待超时，不证明输入未受理。保留返回结果，不要自动换一组 ID 重试。

| 退出码 | 含义 |
| --- | --- |
| `0` | 动作完成；消息命令已观察到对应 Run 完成。 |
| `2` | 输入无效、终端不支持或明确拒绝。 |
| `3` | 不可用或尚未就绪；消息 Run 失败或取消。 |
| `4` | 结果未确认，或输入已受理但 Run 尚未完成。 |
| `70` | 内部缺陷、输出失败或收尾失败。 |

同时检查结构化结果和退出码。远端成功不能覆盖本机准备或收尾失败。

## 本机文件和运行责任

状态根依次选择 `--home`、`OMNE_HOME`、`~/.omne`。显式 home 必须是绝对路径，且不能是文件系统根目录。
无效路径明确失败，不回落当前目录。帮助和版本查询不创建状态。

```text
~/.omne/
├── config.sqlite
├── run/
│   ├── login/                         # Login preparation / 登录准备
│   └── <tenant-digest>.sock
└── tenants/<key>/
    ├── tenant.json
    ├── auth/
    │   ├── client.sqlite
    │   └── credentials/
    ├── data/
    │   └── runtime.sqlite
    ├── sessions/
    ├── assets/
    ├── logs/
    │   └── session-host.log
    ├── cache/
    └── run/
```

目录按需创建。SQLite 还可能创建 WAL 和共享内存文件。
租户 key 由精确的中心、组织和账号身份计算。`tenant.json` 保存该绑定，不保存凭据。
私有目录要求 `0700`，私有文件要求 `0600`。不安全的所属用户、链接或权限导致拒绝，不会自动修复。
这些检查不隔离同一个 OS 用户的进程。

CLI 通过本机 socket 访问独立租户宿主。宿主拥有 Session/Agent 执行，以及独立的 Model 和 Tool 执行池。
Clock 是借入的运行服务。一个会话、Cordis fiber 或异步任务不代表独占一个 OS 线程。
CLI 不再运行另一套 agent loop。所有权、准入、持久化和收场行为见[应用契约](SPEC.md)。

## 排查与开发

- 终端拒绝时，检查窗口尺寸、TTY 独占、括号粘贴及模式查询 2004 和 1049。无需 X11 显示器。缺少这些能力的终端仍不受支持，JSON 治理命令仍可使用。
- 登录拒绝时，用原凭据文件重新登录。中心连接失败不表示登录已撤销。
- 已有宿主不可读时，查看错误和 `logs/session-host.log`。不要删除锁或启动第二个拥有者。
- 输入已受理但未结束时，保留回执并核对状态，不要直接重发。
- 升级代码时，状态继续保留在独立目录，并确认哪些宿主仍在使用旧代码。

仓库开发构建使用：

```bash
pnpm install --frozen-lockfile
pnpm build
node apps/cli/dist/main.js --help
```

实现变更后运行受影响成员检查：

```bash
pnpm --filter @omne-harness-lite/cli typecheck
pnpm --filter @omne-harness-lite/cli test
```

修改公开依赖后，先构建依赖再检查消费者。这些命令不代替真实终端或付费供应商验收。
参见[验收场景](acceptance/README.md)、[验证义务](verification/README.md)和[开发指南](../../docs/development.md)。
本机账号、凭据、临时计划和执行日志不进入受版本管理的文档。应用契约继续归 [SPEC.md](SPEC.md)。
