# 服务端接入

与 [README.md](README.md) 是同一成员、同一份承诺。入口次序在 [SPEC.md](SPEC.md)。结果含义在公开契约。远程字节流必须具备保密和完整。传输路线沿[技术基础的共同技术选择](../../../docs/architecture/technical-foundations.md#共同技术选择)：HTTP JSON 控制与查询，fetch SSE 单向观察。公开操作、认证、端点与订阅语义由公开契约拥有，HTTP 承载见其[承载绑定](../public-contract/docs/http-binding.md)。本页不选定具体保护协议。
