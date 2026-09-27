# @omne-harness-lite/client-local-state

本地治理记录的提供者，公开入口见`src/index.ts`；设计与保证归[实现节点](../../../.meta_harness/design/realization/packages/frontend/client-local-state/README.md)。调用者须提供已存在可信父目录下的专用私有目录，使用结束等待`close()`。

开发验证：在仓库根执行`pnpm --filter @omne-harness-lite/client-local-state typecheck`、`pnpm --filter @omne-harness-lite/client-local-state test`。Node版本和环境准备见[开发指南](../../../docs/development.md)。读取结果包含秘密，不直接打印。
