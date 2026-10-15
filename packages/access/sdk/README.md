# 客户端 SDK

本成员拥有治理协议的客户端职责。消息和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。本页的行为在[行为规格](SPEC.md)。

## 阅读路径

客户端实现者先读公开契约的结果表，再读本成员的自动再送和缓存规则。内部说明见[内部设计](docs/internals.md)。

## 使用

SDK 把请求交给调用者提供的传输适配。注册和签发登录之前，调用者必须已经选定对端信任材料。信任核验失败时，SDK 不发送凭据或登录证明。传输适配证明请求字节没有发出时，SDK 自动再送一次。它不缓存准入允许。设计签名和发送不确定的样例在行为规格。那些类型现在不导出。

安装闭包不包含服务端接入，也不包含服务器存储类型。

## 验证

`tests/public-entry.spec.ts` 核对当前公开导出。结果句子在公开契约。

## English promise

This member owns the client duties for the governance protocol. Outcome meanings stay in the public contract. The SDK resends once only when the transport proves the request bytes were not sent. It does not cache an allow result. A failed trust check sends neither a credential nor a login proof. The design signatures in the behavior spec are not installed exports.
