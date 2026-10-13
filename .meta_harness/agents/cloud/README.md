# Cloud Agent 镜像源

每个宿主一个目录。目录名与 `host_layout` 的宿主名相同：`cursor`、`codex`、`claude-code`。

现在只有 [`cursor/`](cursor/README.md)。Codex 和 Claude Code 的镜像以后加在同级目录。不要把 Dockerfile、`environment.json` 或 `install.sh` 平铺在这一层。

每个宿主目录的运行时文件是 `Dockerfile`、`environment.json` 和 `install.sh`。`README.md` 留在源目录，不进入投影。编译按宿主写到该宿主的 package 根。没有 package 根的宿主不能在这里建目录。
