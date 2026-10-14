# 应用归档开发工具

公共入口导出文件清单、摘要与packageArtifact；只在开发期由应用静态适配消费，不是产品运行依赖。运行入口指src，固定Node24.21.0可直接去类型执行；类型声明由build生成，整体typecheck先构建。首次打包不要求已经存在dist。

pnpm --filter @omne-harness/artifact-builder build/typecheck/test。实际脚本入口为scripts/package-cli.sh和scripts/package-tenancy-host.sh；保持源码、锁和共享dist稳定，不并行运行构建。只清自有暂存，完整归档经独占link发布；输出失败可能已经留下有效归档。完整设计与采用归D052。

部署生产依赖时沿用根工作区的 `onlyBuiltDependencies` 白名单，让获准的原生依赖完成安装脚本。不得用 `--ignore-scripts` 生成缺少原生模块的归档，也不得放开全部依赖脚本。应用可在静态 `ArtifactDefinition.verifyScript` 中声明部署后检查；工具从独立的 app 目录执行该 Node ESM 脚本。检查通过后才计算清单、摘要和发布归档；失败不发布。CLI 检查实际 Host 提供者解析到的 `node-pty` 原生模块。
