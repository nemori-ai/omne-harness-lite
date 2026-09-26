# 开发与 CI/CD 自动化

这里放仓库级自动化入口：组织检查、构建、产物处理，以及有实际交付对象后的
发布和部署调用。脚本负责顺序、参数、工作目录与退出状态，检查算法和可复用
行为归 [tools/](../tools/README.md) 等所属包，不在流水线与本地脚本中各实现一遍。

| 入口 | 作用 |
|---|---|
| [package-tenancy-host.sh](package-tenancy-host.sh) | 构建治理中心全新本地.tar.gz归档；不安装、不启动、不上传，见[中心开发入口](../apps/tenancy-host/README.md) |
| [package-cli.sh](package-cli.sh) | 将现有CLI构建为指定的全新本地.tar.gz归档；不安装、不上传，使用与前提见[CLI开发入口](../apps/cli/README.md) |
| [check.sh](check.sh) | 定位仓库根，依次运行 agent 产物与根链接、文档、规格、Python 工具测试及产品包检查；任一步失败即停止并返回非零 |
| [format.sh](format.sh) | 用根配置和本地锁定 Prettier 检查或写入受维护文件；`staged` 模式只检查 Git index blob |
| [test-formatting.sh](test-formatting.sh) | 在临时独立 Git 仓库验证格式范围、幂等、部分暂存和 hook 安装边界 |
| [install-format-hook.sh](install-format-hook.sh) | 显式安装格式化 pre-commit hook；发现已有 hook 时拒绝覆盖 |

安装 Bash、Make、uv、Node/npm/pnpm 并按[验证规范](../docs/verification.md)准备环境后，
在根执行 `make check` 或 `./scripts/check.sh`。脚本也可通过绝对路径从其他目录调用。
需要比较冻结基线时使用 `make check BASELINE=<git-ref>` 或
`BASELINE=<git-ref> ./scripts/check.sh`；脚本不接受位置参数。

格式化命令由根 `package.json` 提供：`pnpm format:check` 检查完整受维护范围，
`pnpm format:write` 写入该范围；两者后接 `-- <仓库相对文件...>` 可收窄到明确文件。
`pnpm format:staged` 供 pre-commit hook 使用，`pnpm format:hook:install` 由开发者按需
显式安装本地 hook。安装命令不会覆盖已有 hook，也不应由共享自动化代替用户执行。

CI 配置将负责选择触发条件和环境，随后调用同一入口。当前尚未接入 CI 平台，
已有本地CLI制品脚本；远程发布或部署入口新增时按真实目标明确输入、产物和外部副作用。
形式工具环境单独使用 `make spec-tools` 检查；检查覆盖与未覆盖的含义以验证规范为准。

包专属的构建脚本和 skill 自带脚本随其所有者维护，不统一搬到这里。
源码位置与 workspace 分工见[workspace 规范](../docs/workspace.md)。
