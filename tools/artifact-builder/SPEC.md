# @omne-harness/artifact-builder

## 总体架构

artifact-builder 是开发期的应用归档库，不发布，也不是产品的运行依赖。公共入口 `src/index.ts` 导出 `inventory`（文件清单）、`digest`（摘要）、`packageArtifact` 与 `runPackaging`。应用的打包脚本静态适配它，由 `scripts/package-cli.sh` 这类入口调用。它没有自己的命令。

运行入口指向 `src`，固定的 Node 版本可以直接去类型执行。类型声明由 `build` 生成，`typecheck` 按 `source` 条件读源码，不先构建。首次打包不要求已经有 `dist/`。

## 领域边界

本包拥有：归档的文件闭包、构建标识与 `build-info.json` 的形状、归档的独占发布。

本包不拥有：每个应用归档里装什么、部署后检查什么。这些由应用的 `ArtifactDefinition` 给出。

## 心智模型

- 归档要么完整地出现在输出路径上，要么不出现。发布之后的报告失败不会撤回它。
- 打包期间锁文件或工作区清单变了，这次打包作废。

## 应然设计

- 输出路径必须以 `.tar.gz` 结尾，且不存在。
- 打包先构建成员及其上游，再用 `pnpm deploy --prod --offline` 把生产依赖部署进只属于本次的暂存目录。
- 文件清单拒绝指向闭包之外的软链接。`BUILD_ID` 与 `build-info.json` 是保留路径，应用不能自带。
- 应用在 `ArtifactDefinition.verifyScript` 里声明部署后检查时，工具在独立的 app 目录里执行这段 Node ESM 脚本。检查通过才计算清单、摘要与发布归档，失败不发布。
- 打包前后比较 `pnpm-lock.yaml` 与 `pnpm-workspace.yaml` 的摘要，不同则报 `build-input-changed`，不发布。
- 归档经独占的硬链接发布到输出路径。发布之后的输出或清理失败时，有效的归档可能已经留在输出路径上。
- 工具只清理自己的暂存目录。

## 原则与约束

- 部署生产依赖时沿用根工作区 `onlyBuiltDependencies` 的白名单，让获准的原生依赖完成安装脚本。不用 `--ignore-scripts` 生成缺少原生模块的归档，也不放开全部依赖的脚本。
- 打包期间保持源码、锁文件与共享的 `dist/` 稳定，不并行运行构建。

## 不变式

- 部署后检查失败时，输出路径上不出现归档。
- 已有的输出路径不被覆盖。
