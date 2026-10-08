# @omne-harness-lite/image-codec

[English](README.md)

通用图片协议、字节校验和显式 Sharp 算法适配由本包单一维护。Files 与模型图片准备共用它。模型政策、请求预算和持久缓存不在本包。

`createSharpImageCodec(loadedSharp)` 接收已加载的 Sharp；根入口不主动加载原生库。每次成功 decode 返回独立图片句柄，调用方必须在 finally 中等待 close。取消不能代替关闭，也不说明原生任务已经停止。

类型及必要校验从公开根消费。[SPEC](SPEC.md) 约束资源和失败行为。工具链与队列见[开发指南](../../../docs/development.md)。
