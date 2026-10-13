# Cursor Cloud Agent 镜像源

这里是 Cursor Cloud Agent 运行环境的手写源，位于 `cloud/cursor/`。同级的其他宿主目录留给 Codex 和 Claude Code。运行时文件是 `Dockerfile`、`environment.json` 和 `install.sh`。

`compile_agents.py` 把这三个文件投影到输出根的 `.cursor/`。`link_agents.py` 在执行仓库根创建 `.cursor`，它是指向 `.meta_harness/.cursor` 的相对软链接。不要在仓库根另建实体 `.cursor` 目录，也不要手改投影。

这份投影需要提交。Cursor 在执行安装脚本之前，从检出读取 `.cursor/environment.json`。skills 与 roles 的宿主投影可以在检出后重新生成，所以它们留在 `.meta_harness/.gitignore`。这份不能。

改源之后删除旧的 `.meta_harness/.cursor`，再按 [tooling](../../../tooling/README.md#根软链接) 重新编译并链接。内容或权限与源不一致时，编译拒绝覆盖。`make agents-check` 核对投影与根链接。
