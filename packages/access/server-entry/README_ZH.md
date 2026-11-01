# 服务端接入

与 [README.md](README.md) 是同一成员、同一份承诺。入口次序在 [SPEC.md](SPEC.md)，实现组织在 [docs/internals.md](docs/internals.md)。结果含义在公开契约，承载在公开契约的[承载绑定](../public-contract/docs/http-binding.md)（候选，待批复：#978 DP-2）。

公开入口是 `createServerEntry({ config, dependencies })`，返回 `start()` 与 `stop()`。它只在 `127.0.0.1` 上监听明文 HTTP/1.1，治理位置在 `/governance-public/1`，会话位置在 `/session-public/1`。依赖与配置字段的说明见 [README.md](README.md#使用)。

本阶段治理位置只提供注册激活与签发登录，会话位置提供七个会话操作与两个观察操作，观察流只有确认、心跳与 `ended` 帧。登录证明、凭据与签发者不进任何输出。
