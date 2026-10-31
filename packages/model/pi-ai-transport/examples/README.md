# examples

本目录承载面向真实公开入口的使用示例。

## 允许的内容

可运行的示例代码与说明。

## 边界

示例只用公开入口，并写明运行前提。示例不代替测试或规格。

## 维护

公开入口变化时，同步示例并确认它仍能运行。

## 本包事实

[local-send.ts](local-send.ts) 是公开消费例与反例。本包的符号只从根入口 `@omne-harness/pi-ai-transport` 导入。请求与内容块从它们的拥有者 `@omne-harness/model-contract` 与 `@omne-harness/content-block` 导入。

- 消费例：脚本在 `127.0.0.1` 上启动本地 HTTPS 服务，建立网络资源，用一个只供本示例使用的小家族建立传输，再依次调用 `prepare`、`materialize` 与 `start`。调用方在 `start` 之前写入凭据槽，在 `start` 返回之后清空凭据槽。脚本打印回执中的摘要、文本增量与 `ended`。
- 反例：请求向模型显示一个内容引用。`materialize` 返回 `unsupported`，字段为 `/system/0`，没有请求发出。

运行前提：

1. Node 24 或更高版本，PATH 中有 `openssl`。
2. 先构建本包及其依赖：`pnpm --filter @omne-harness/pi-ai-transport... -r run build`。根入口解析到构建产物。
3. 在本包目录运行：`node --experimental-strip-types examples/local-send.ts`。

示例不访问公网。证书是自签证书，写在经 `realpathSync` 取得物理路径的私有临时目录中，读取后立即删除。慢层用例 [tests/examples.spec.ts](../tests/examples.spec.ts) 在子进程中运行本示例并核对输出。
