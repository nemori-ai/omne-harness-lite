# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、运行方式与当前缺口
- [support.ts](support.ts)：共用的租户、作用域、端口替身与操作辅助
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合
- [conformance.spec.ts](conformance.spec.ts)：整套 `runtimeContextConformance` 对机制实例
- [cross-tenant.spec.ts](cross-tenant.spec.ts)：跨租户的签发、登记、发布与读取被拒，回调零调用
- [read-cache.spec.ts](read-cache.spec.ts)：读取缓存的键、命中核对、容量与投影版本的推进
- [lifecycle.spec.ts](lifecycle.spec.ts)：关闭时在途操作答关闭、关闭与撤除的结算上界
- [refresh.spec.ts](refresh.spec.ts)：恢复后供值的合并、并发上限与重试间隔
- [replay-checkpoints.spec.ts](replay-checkpoints.spec.ts)：没有步提交的 `checkpointed` 块在恢复材料里缺席
- [diagnostics.spec.ts](diagnostics.spec.ts)：诊断不带块值，变化出口与诊断出口抛错不改结果
- [bind-caller.spec.ts](bind-caller.spec.ts)：`bind` 的调用方声明在访问核对之后比较
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空
