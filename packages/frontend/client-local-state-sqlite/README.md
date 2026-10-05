# @omne-harness-lite/client-local-state-sqlite

SQLite 本地治理记录提供者。纯入口见[src/index.ts](src/index.ts)，集成承诺见[SPEC](SPEC.md)。
调用者提供可信父目录下的专用私有目录，以及显式的 LocalStateStorageFactory。
工厂须以 full 耐久打开该文件，不执行中心迁移；返回的存储由本次 CLS 实例独占关闭。
公共记录、快照和结果类型归[client-local-state](../../core/client-local-state/README.md)。

Cordis 绑定从 `./cordis` 导入，依赖 `clientStateStorage` 具名资源。
使用结束须等待 `close()`；读取结果包含秘密，不直接打印。

开发验证：`pnpm --filter @omne-harness-lite/client-local-state-sqlite typecheck` 和
`pnpm --filter @omne-harness-lite/client-local-state-sqlite test`。
Node版本与环境准备见[开发指南](../../../docs/development.md)。
