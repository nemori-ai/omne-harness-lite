# messages

`data.messages` v2 的纯函数包。采用依据、责任与限制见[实现节点](../../../.meta_harness/design/realization/packages/core/messages/README.md)及[契约](../../../.meta_harness/design/spec/data/messages/v2/contract.md)。

通过包名导入已构建公开入口；`./schema` 提供冻结原字节 Schema。`validate` 只检查形状，`judgeMessage` 与 `judgeModelInvocationRecord` 另查契约中的单值跨成员约束；文本接收先严格无损读取。成功结果是复制后的冻结值，拒绝不修补输入。

`LogPrefixView` 必须是调用方提供的完整、有序、已校验且一致的日志消息前缀。`judgeMessageInLog` 先检查表示，再检查前向引用；`judgePairing` 不承担追加或并发保证，压缩名单需要另外调用 `judgeCompactionList`。后者的表示必须已经过前两道门；外部输入缺席时返回 `undetermined`，不能当作合法。函数不读时间、日志或任何服务。

在仓库根运行 `pnpm --filter @omne-harness-lite/messages run build`、`typecheck`、`test`。先构建 workspace 依赖；测试不使用兄弟包源码别名。
