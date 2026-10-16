# repo-config

本包存放仓库共享的工具配置预设。根目录的配置文件只用 `extends` 或 `require` 引用这里，规则在本包维护。

| 文件 | 内容 | 根目录入口 |
| --- | --- | --- |
| `tsconfig.base.json` | 编译选项：NodeNext、strict 与 `source` 条件 | `tsconfig.base.json` |
| `oxlint.json` | oxlint 的插件、类别与忽略路径 | `.oxlintrc.json` |
| `dependency-cruiser.cjs` | 依赖规则与解析选项 | `.dependency-cruiser.cjs` |

规则的含义与出处见 [repo-toolchain 的依赖规则](../repo-toolchain/README_ZH.md#依赖图与依赖规则)和[开发指南](../../docs/development.md#通用静态检查)。

oxfmt 的配置不支持 `extends`，所以 `.oxfmtrc.json` 仍放在根目录。

本包现在是 workspace 成员，根目录按相对路径引用它，还没有发布。发布到 npm、根目录改为钉精确版本，由后续工作卡完成。届时读取根配置的工具（仓库守卫、架构抽取）要同时支持按包名的 `extends`。
