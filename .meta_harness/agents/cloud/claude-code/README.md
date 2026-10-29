# Claude Code on the web 环境源

这里是 Claude Code 云端会话（claude.ai/code）运行环境的手写源，位于 `cloud/claude-code/`。文件是 `setup.sh` 和 `session-start.sh`。

Claude Code 不从检出读取环境文件。setup 脚本保存在云端环境设置里。所以编译只检查这两个文件存在且可执行，不产生投影。

## setup.sh：构建环境快照

把 `setup.sh` 全文粘贴到云端环境设置（会话标题栏的环境菜单 → Edit）的 Setup script。改源之后再粘贴一次。平台以 root 在 Claude Code 启动前运行它，并缓存结果。缓存有效时，后续会话不再运行它。

脚本做这些事：

1. 安装 rsync。
2. 安装 Node 26.12.0 到 `/opt/node26`，核对 SHASUMS256。再用 npm 安装 pnpm 10.28.1。
3. 改写 `/etc/profile.d/nodejs.sh`，并在 `/root/.bashrc` 加一行，让 Node 26 排在镜像自带的 Node 22 之前。
4. 安装 uv 0.13.0 到 `/root/.local/bin`，替换镜像自带的旧版。
5. 从 GitHub 添加 `michael-denyer/pstack-claude` 与 `mattpocock/skills` 两个 marketplace，在 user 作用域安装 `pstack` 与 `mattpocock-skills`。再把 `unclebob/ub-mode` 默认分支 `master` 的 `SKILL.md` 下载到 `~/.claude/skills/ub-mode/`。下载完整且文件含 `name: ub-mode` 一行才替换旧文件。否则只输出诊断并保留旧文件，setup 继续。
6. 在 `~/.claude/settings.json` 登记 SessionStart 钩子。钩子运行检出里的 `session-start.sh`。
7. 检出已存在时，执行[开发指南](../../../../docs/development.md#准备可用的检出)的三条依赖命令，再生成 agent 投影。

`NODE_VERSION` 必须满足根 `package.json` 的 `engines`。`PNPM_VERSION` 必须等于 `packageManager`。更换其中之一时，同步修改本脚本和 [Cursor 源](../cursor/README.md) 的 Dockerfile。

脚本不运行 `setup-matt-pocock-skills`。该命令会在仓库写入第二份词表。

## session-start.sh：每次会话启动

`session-start.sh` 只在 `CLAUDE_CODE_REMOTE=true` 时工作。每次会话启动或恢复（matcher `startup|resume`）它做这些事：

1. 把 `/opt/node26/bin` 和 `NODE_USE_ENV_PROXY=1` 写入 `CLAUDE_ENV_FILE`。Bash 工具的每条命令都先使用 Node 26，Node 的 `fetch` 走代理。原因见[网络密钥与对外请求](#网络密钥与对外请求)。
1. 设置 git 作者与提交者，写入 `CLAUDE_ENV_FILE`。云端环境设置里配了 `GIT_AUTHOR_NAME` 或 `GIT_AUTHOR_EMAIL` 时，用这些值。缺的值用 `gh api user` 从开会话的 GitHub 账号取：姓名取 GitHub username，邮箱取 `<id>+<login>@users.noreply.github.com`，因为接口不返回私密邮箱。提交者与作者相同。这样提交按[贡献指南](../../../../CONTRIBUTING.md#形成可审阅的交付)以负责人署名。平台只用 Claude 身份的密钥签名，所以 GitHub 把这些提交显示为 Unverified。
2. 浅克隆先取完整历史。角色评估会检出固定的基线 commit，浅克隆缺少这些 commit。
3. `git fetch --prune origin`，再把本地 `main` 快进到 `origin/main`。当前分支是 `main` 时用 `git merge --ff-only`。其他分支时只更新 `main` 引用。
4. HEAD 变化、依赖目录缺失，或锁文件及根依赖配置与上次成功安装的摘要不同时，重新执行三条依赖命令。摘要保存在当前工作树的 Git 私有目录。三条命令全部成功后才记录摘要，失败时清除旧摘要，下次启动重试。首次启动没有摘要，也会同步依赖。
5. agent 投影与源不一致时，删除被 Git 忽略的投影并重新生成。`.cursor` 下提交的三份文件保留。
6. 更新两个 marketplace，再把 `pstack` 与 `mattpocock-skills` 更新到上游最新版本。再从 `master` 重新下载 ub-mode 的 `SKILL.md`。下载完整且文件含 `name: ub-mode` 一行才替换旧文件，否则删除临时文件、输出诊断并保留旧文件。

脚本不丢弃本地工作。`main` 已分叉、或检出的 `main` 不能快进时，脚本输出诊断并保持原状。任何一步失败都只输出诊断，会话照常启动。

如果 Claude Code 在钩子运行之前已经加载插件和技能，插件与 ub-mode 的更新要到下一次会话才生效。这一前提没有验证，见[未验证的部分](#未验证的部分)。

## 网络密钥与对外请求

云端会话的出站 HTTPS 经过代理。`HTTPS_PROXY` 指向本机代理端口。代理用自己的 CA 重新签发证书，平台已把 `/root/.ccr/ca-bundle.crt` 设进 `NODE_EXTRA_CA_CERTS`、`SSL_CERT_FILE`、`REQUESTS_CA_BUNDLE` 和 `CURL_CA_BUNDLE`。代理的诊断说明在 `/root/.ccr/README.md`。

在云端环境设置里配的 Network secret（网络密钥）不进入容器。容器里没有这个环境变量，也没有文件。代理在转发到对应主机时加上认证头。以 OpenRouter 为例：

- `OPENROUTER_API_KEY` 在容器里为空。这是预期结果，不是没配上。
- 不要读取这个变量，也不要设法取得 key 的明文。用 SDK 时，`apiKey` 填任意占位值。代理替换认证头。
- 请求必须经过代理。绕开代理的请求没有认证头，返回 401。
- 核对 key 是否生效：`curl -sS https://openrouter.ai/api/v1/key`。返回里的 `label` 是代理给出的掩码标签，`limit_remaining` 是剩余额度。

各工具是否经过代理：

| 工具 | 默认行为 | 处理 |
| --- | --- | --- |
| `curl` | 读 `HTTPS_PROXY`，经过代理 | 无 |
| Python 标准库、`requests` | 读 `HTTPS_PROXY`，经过代理 | 无 |
| Node `fetch` 与基于它的 SDK | 直连，返回 401 | 设 `NODE_USE_ENV_PROXY=1`。`session-start.sh` 已为 Bash 工具设置。脚本自己起的子进程如果清空了环境，要显式传入 |

`NODE_USE_ENV_PROXY` 在 Node 26 上可用。Node 22 也可用，但输出一条 experimental 警告。`NO_PROXY` 已包含 localhost 与内网地址段，本机服务仍然直连。

代理返回 403 或 407 时，目标主机不在本环境的网络策略里。不要重试，也不要绕开代理，报告被拦的主机。

## 与技能来源表的差异

[技能来源表](../../../../docs/engineering/skills.md#来源与项目采用) 固定 pstack port 0.9.79、Matt 1.3.1 与 ub-mode 的 revision。本宿主按负责人要求跟随上游最新版本，所以实际版本可能比来源表新。版本差异按 [开发指南](../../../../docs/development.md#初始化-coding-agent-插件) 核对和报告。跟随最新版本不扩大方法采用范围。

## 未验证的部分

以下行为来自本地模拟和文档，没有在新的云端会话中观察：

- setup 脚本运行时检出是否已存在。不存在时，第 7 步跳过，首次会话的 `session-start.sh` 补做依赖与投影。
- user 作用域的插件与 SessionStart 钩子在云端会话中是否加载。
- ub-mode 的下载经过代理是否成功，以及云端会话是否发现 `~/.claude/skills/ub-mode/`。
- 快照恢复之后，检出里被 Git 忽略的依赖与投影是否保留。
- Claude Code 是否在钩子运行之前已经加载插件和技能。
