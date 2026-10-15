# 服务端接入

本成员拥有治理协议的入口职责。消息和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。本页的行为在[行为规格](SPEC.md)。

本目录已有 workspace 草稿。`src/index.ts` 不导出治理路由。文档不表示可运行的治理服务器已经存在。

## 阅读路径

服务端实现者先读公开契约的判定次序，再读本成员怎样把登录证明交给身份成员。内部说明见[内部设计](docs/internals.md)。

## 使用

接入只处理已经完成传输保护的字节。它按公开契约的次序给出终端结果。它不改写 identity 返回的 `denied` 和 `basis-unavailable`。

本页不选择 HTTP、WebSocket 或 stdio。

## 验证

`tests/public-entry.spec.ts` 仍只核对公开导出。治理入口的实现测试未运行。长期个人负责人尚未具名。
