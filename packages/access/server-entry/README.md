# 服务端接入

本成员拥有治理协议的入口职责。消息和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。本页的行为在[行为规格](SPEC.md)。

## 阅读路径

服务端实现者先读公开契约的判定次序，再读本成员怎样把登录证明交给身份成员。内部说明见[内部设计](docs/internals.md)。

## 使用

接入只处理已经完成传输保护的字节。它按公开契约的次序给出终端结果。它不改写 identity 返回的 `denied` 和 `basis-unavailable`。

本页不把 HTTP、WebSocket 或 stdio 定成传输。具体保护协议不在本页选定。远程字节流必须具备保密和完整。

## 验证

`tests/public-entry.spec.ts` 核对当前公开导出。结果句子在公开契约。

## English promise

This member owns the entry duties for the governance protocol. Outcome meanings stay in the public contract. The entry stops at the first terminal result and does not rewrite an identity result. Remote byte streams must stay confidential and intact. This page does not choose HTTP, WebSocket, stdio, or a named protection protocol.
