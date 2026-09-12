# 开发与 CI/CD 自动化

这里放仓库级自动化入口：组织检查、构建、产物处理，以及有实际交付对象后的
发布和部署调用。脚本负责顺序、参数、工作目录与退出状态，检查算法和可复用
行为归 [tools/](../tools/README.md) 等所属包，不在流水线与本地脚本中各实现一遍。

| 入口 | 作用 |
|---|---|
| [check.sh](check.sh) | 定位仓库根，依次运行文档检查、规格检查和测试；任一步失败即停止并返回非零 |

安装 Bash、Make、uv 并按[验证规范](../docs/maintenance/verification.md)准备环境后，
在根执行 `make check` 或 `./scripts/check.sh`。脚本也可通过绝对路径从其他目录调用。
需要比较冻结基线时使用 `make check BASELINE=<git-ref>` 或
`BASELINE=<git-ref> ./scripts/check.sh`；脚本不接受位置参数。

CI 配置将负责选择触发条件和环境，随后调用同一入口。当前尚未接入 CI 平台，
也没有发布或部署脚本；新增时按真实目标明确输入、产物和外部副作用。
形式工具环境单独使用 `make spec-tools` 检查；检查覆盖与未覆盖的含义以验证规范为准。

包专属的构建脚本和 skill 自带脚本随其所有者维护，不统一搬到这里。
源码位置与 workspace 分工见[workspace 规范](../docs/maintenance/workspace.md)。
