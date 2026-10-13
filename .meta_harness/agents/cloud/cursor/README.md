# Cursor Cloud Agent 镜像源

这里是 Cursor Cloud Agent 运行环境的手写源，位于 `cloud/cursor/`。同级的其他宿主目录留给 Codex 和 Claude Code。运行时文件是 `Dockerfile`、`environment.json` 和 `install.sh`。

`compile_agents.py` 把这三个文件投影到输出根的 `.cursor/`。`link_agents.py` 在执行仓库根创建 `.cursor`，它是指向 `.meta_harness/.cursor` 的相对软链接。不要在仓库根另建实体 `.cursor` 目录，也不要手改投影。

这份投影需要提交。Cursor 在执行安装脚本之前，从检出读取 `.cursor/environment.json`。skills 与 roles 的宿主投影可以在检出后重新生成，所以它们留在 `.meta_harness/.gitignore`。这份不能。

改源之后删除旧的 `.meta_harness/.cursor`，再按 [tooling](../../../tooling/README.md#根软链接) 重新编译并链接。内容或权限与源不一致时，编译拒绝覆盖。`make agents-check` 核对投影与根链接。

## Git 身份

author 与 committer 是潘其威(William)，邮箱是 `46810637+PanQiWei@users.noreply.github.com`。这是 GitHub 账号 PanQiWei 的 noreply 身份。

`/usr/local/bin/git` 在调用 `/usr/bin/git` 之前写回 `user.name` 和 `user.email`，并设置 `commit.gpgsign false`。`~/.gitconfig` 里的其他键保留。镜像环境变量 `GIT_AUTHOR_*` 与 `GIT_COMMITTER_*` 使用同一身份。因此宿主把 Cursor Agent 写入 `~/.gitconfig` 之后，下一次 git 调用仍以这个人作为作者。

## Matt skills

镜像安装[技能来源表](../../../../docs/engineering/skills.md#来源与项目采用)中的 Matt revision `b0618bc436ad893b3c5e84e55fba86586d34a404`。`npx skills` 会把该 revision 当成分支名，所以镜像先取出这个 commit，再执行 `-a cursor -g`。

技能正文在 ubuntu 用户的 `~/.agents/skills`。每个目录再链接到 `~/.cursor/skills`。镜像不运行 `setup-matt-pocock-skills`。安装完整插件不扩大方法采用范围。

环境构建如果复用已有基础镜像，就只运行 `install.sh`。这时脚本在当前用户是 ubuntu 且 `sudo` 不询问密码时，从投影的 Dockerfile 取出同一段包装脚本和同一个 revision，再安装一次。其他账户不改。
