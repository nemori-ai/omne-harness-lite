# Cloud Agent 镜像源

每个宿主一个目录。目录名与 `host_layout` 的宿主名相同：`cursor`、`codex`、`claude-code`。

现在有 [`cursor/`](cursor/README.md) 和 [`claude-code/`](claude-code/README.md)。Codex 的镜像以后加在同级目录。不要把运行时文件平铺在这一层。

`cursor/` 的运行时文件是 `Dockerfile`、`environment.json` 和 `install.sh`。编译把它们写到该宿主的 package 根。没有 package 根的宿主不能在这里建目录，`claude-code` 例外。

`claude-code/` 只有 `setup.sh` 和 `session-start.sh`。Claude Code 从云端环境设置读取 setup 脚本，不从检出读取。所以编译只检查这两个文件，不产生投影。

`README.md` 留在源目录，不进入投影。
