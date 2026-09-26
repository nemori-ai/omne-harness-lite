# messages

当前实现采用 `data.messages v3`（[规范](../../../.meta_harness/design/spec/data/messages/v3/contract.md)）。公开 `./schema` 为冻结 v3；`./schema/v2` 只保留完整冻结 v2 资源及原 `$id`，不提供 v2 领域行为兼容入口。


`data.messages` v2 的纯函数包。采用依据、责任与限制见[实现节点](../../../.meta_harness/design/realization/packages/core/messages/README.md)及[契约](../../../.meta_harness/design/spec/data/messages/v2/contract.md)。

通过包名导入已构建公开入口；`./schema` 提供冻结原字节 Schema。`validate` 只检查形状，`judgeMessage` 与 `judgeModelInvocationRecord` 另查契约中的单值跨成员约束；文本接收先严格无损读取。成功结果是复制后的冻结值，拒绝不修补输入。

`brandMessage`／`brandRecord` 是已解析交换表示到 TypeScript 领域表示的适配入口：先复制并检查完整冻结 Schema，恢复身份与不透明载荷的包装，非法前提抛 `TypeError`。`isWireMessage`／`isWireRecord` 和 `Wire<T>` 只表达 JSON 交换形状。适配不检查块标识唯一、媒体类型跨成员一致、消息配对等接收规则，不能代替 `judgeMessage`／`judgeModelInvocationRecord`；它供已经按自身契约完成判定的嵌入对象消费者使用。

`LogPrefixView` 必须是调用方提供的完整、有序、已校验且一致的日志消息前缀。`judgeMessageInLog` 先检查表示，再检查前向引用；`judgePairing` 不承担追加或并发保证，压缩名单需要另外调用 `judgeCompactionList`。后者的表示必须已经过前两道门；外部输入缺席时返回 `undetermined`，不能当作合法。函数不读时间、日志或任何服务。

在仓库根运行 `pnpm --filter @omne-harness-lite/messages run build`、`typecheck`、`test`。先构建 workspace 依赖；测试不使用兄弟包源码别名。
