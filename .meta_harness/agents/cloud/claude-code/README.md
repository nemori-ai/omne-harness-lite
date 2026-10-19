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
5. 从 GitHub 添加 `michael-denyer/pstack-claude` 与 `mattpocock/skills` 两个 marketplace，在 user 作用域安装 `pstack` 与 `mattpocock-skills`。
6. 在 `~/.claude/settings.json` 登记 SessionStart 钩子。钩子运行检出里的 `session-start.sh`。
7. 检出已存在时，执行[开发指南](../../../../docs/development.md#准备可用的检出)的三条依赖命令，再生成 agent 投影。

`NODE_VERSION` 必须满足根 `package.json` 的 `engines`。`PNPM_VERSION` 必须等于 `packageManager`。更换其中之一时，同步修改本脚本和 [Cursor 源](../cursor/README.md) 的 Dockerfile。

脚本不运行 `setup-matt-pocock-skills`。该命令会在仓库写入第二份词表。

## session-start.sh：每次会话启动

`session-start.sh` 只在 `CLAUDE_CODE_REMOTE=true` 时工作。每次会话启动（matcher `startup`）它做这些事：

1. 把 `/opt/node26/bin` 写入 `CLAUDE_ENV_FILE`。Bash 工具的每条命令都先使用 Node 26。
1. 用 `gh api user` 查出开会话的 GitHub 账号，把 `GIT_AUTHOR_*` 与 `GIT_COMMITTER_*` 写入 `CLAUDE_ENV_FILE`。姓名取 GitHub username。邮箱取 `<id>+<login>@users.noreply.github.com`，因为接口不返回私密邮箱。这样提交按[贡献指南](../../../../CONTRIBUTING.md#形成可审阅的交付)以负责人署名。平台只用 Claude 身份的密钥签名，所以 GitHub 把这些提交显示为 Unverified。
2. 浅克隆先取完整历史。角色评估会检出固定的基线 commit，浅克隆缺少这些 commit。
3. `git fetch --prune origin`，再把本地 `main` 快进到 `origin/main`。当前分支是 `main` 时用 `git merge --ff-only`。其他分支时只更新 `main` 引用。
4. HEAD 变化或依赖目录缺失时，重新执行三条依赖命令。
5. agent 投影与源不一致时，删除被 Git 忽略的投影并重新生成。`.cursor` 下提交的三份文件保留。
6. 更新两个 marketplace，再把 `pstack` 与 `mattpocock-skills` 更新到上游最新版本。

脚本不丢弃本地工作。`main` 已分叉、或检出的 `main` 不能快进时，脚本输出诊断并保持原状。任何一步失败都只输出诊断，会话照常启动。

插件更新在下一次会话生效。Claude Code 在钩子运行之前已经加载了插件。

## 与技能来源表的差异

[技能来源表](../../../../docs/engineering/skills.md#来源与项目采用) 固定 pstack port 0.9.79 与 Matt 1.3.1 的 revision。本宿主按负责人要求跟随上游最新版本，所以实际版本可能比来源表新。版本差异按 [开发指南](../../../../docs/development.md#初始化-coding-agent-插件) 核对和报告。跟随最新版本不扩大方法采用范围。

## 未验证的部分

以下行为来自本地模拟和文档，没有在新的云端会话中观察：

- setup 脚本运行时检出是否已存在。不存在时，第 7 步跳过，首次会话的 `session-start.sh` 补做依赖与投影。
- user 作用域的插件与 SessionStart 钩子在云端会话中是否加载。
- 快照恢复之后，检出里被 Git 忽略的依赖与投影是否保留。
