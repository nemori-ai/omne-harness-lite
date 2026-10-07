# 应用归档开发工具

公共入口导出文件清单、摘要与packageArtifact；只在开发期由应用静态适配消费，不是产品运行依赖。运行入口指src，固定Node24.21.0可直接去类型执行；类型声明由build生成，整体typecheck先构建。首次打包不要求已经存在dist。

pnpm --filter @omne-harness-lite/artifact-builder build/typecheck/test。实际脚本入口为scripts/package-cli.sh和scripts/package-tenancy-host.sh；保持源码、锁和共享dist稳定，不并行运行构建。只清自有暂存，完整归档经独占link发布；输出失败可能已经留下有效归档。完整设计与采用归D052。
