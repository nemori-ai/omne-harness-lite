# 服务端接入

与 [README.md](README.md) 是同一成员、同一份承诺。入口次序在 [SPEC.md](SPEC.md)。结果含义在公开契约。远程字节流必须具备保密和完整。传输路线沿[技术基础的共同技术选择](../../../docs/architecture/technical-foundations.md#共同技术选择)：HTTP JSON 控制与查询，fetch SSE 单向观察。公开操作、认证与订阅语义由公开契约拥有。端点与 HTTP 绑定在[承载绑定正文](docs/http-binding.md)。M2 只在 `127.0.0.1` 上明文提供服务。
