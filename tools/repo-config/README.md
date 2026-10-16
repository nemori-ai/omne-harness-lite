# repo-config

本包存放仓库共享的工具配置预设。根目录的配置文件只用 `extends` 或 `require` 引用这里，规则在本包维护。

| 文件 | 内容 | 根目录入口 |
| --- | --- | --- |
| `tsconfig.base.json` | 编译选项：NodeNext、strict 与 `source` 条件 | `tsconfig.base.json` |
| `oxlint.json` | oxlint 的插件、类别与忽略路径 | `.oxlintrc.json` |
| `dependency-cruiser.cjs` | 依赖规则与解析选项 | `.dependency-cruiser.cjs` |

规则的含义与出处见 [repo-toolchain 的依赖规则](../repo-toolchain/README_ZH.md#依赖图与依赖规则)和[开发指南](../../docs/development.md#通用静态检查)。

oxfmt 的配置不支持 `extends`，所以 `.oxfmtrc.json` 仍放在根目录。

本包发布在 npm。使用方钉精确版本，根配置引用安装的预设：

- `tsconfig.base.json`：`"extends": "@omne-harness/repo-config/tsconfig.base.json"`。
- `.dependency-cruiser.cjs`：`module.exports = require('@omne-harness/repo-config/dependency-cruiser.cjs')`。
- `.oxlintrc.json`：oxlint 的 `extends` 只接受相对路径，写成 `"extends": ["./node_modules/@omne-harness/repo-config/oxlint.json"]`。

repo-toolchain 0.0.3 起，仓库守卫与架构抽取都认按包名的 `extends`。架构抽取只读一个版本里的文件，不应用安装预设的选项，把它列在 `configuration.installedExtends`。
