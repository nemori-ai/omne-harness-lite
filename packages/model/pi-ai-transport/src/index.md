# src 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口，只转出五个公开类型
- [family.ts](family.ts)：已接受的家族贡献接口类型
- [capacity.ts](capacity.ts)：连接容量、预约与座位
- [diagnostics.ts](diagnostics.ts)：诊断事件与观察者隔离
- [sse.ts](sse.ts)：字节流到 SSE 事件 data 文本，改编自 pi
- [frames.ts](frames.ts)：SSE data 文本到协议帧
- [http.ts](http.ts)：一次同步发起的 HTTPS 交换
- [network.ts](network.ts)：网络资源的组合与关闭排空
