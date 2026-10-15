# 客户端 SDK

本成员拥有治理协议的客户端职责。消息和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。本页的行为在[行为规格](SPEC.md)。

本目录已有 workspace 草稿。`src/index.ts` 不导出治理操作。文档不表示可运行的 SDK 已经存在。

## 阅读路径

客户端实现者先读公开契约的结果表，再读本成员的自动再送和缓存规则。内部说明见[内部设计](docs/internals.md)。

## 使用

SDK 把请求交给调用者提供的传输适配。传输适配证明请求字节没有发出时，SDK 自动再送一次。它不缓存准入允许。

安装闭包不包含服务端接入，也不包含服务器存储类型。现在还没有治理 SDK 的发布产物，这项核对未运行。

## 验证

`tests/public-entry.spec.ts` 仍只核对公开导出。治理行为的实现测试未运行。长期个人负责人尚未具名。

## English promise

This member owns the client duties for the governance protocol. Outcome meanings stay in the public contract. The SDK resends once only when the transport proves the request bytes were not sent. It does not cache an allow result. It does not export a runnable governance operation.
