# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口 | 内容 | 调用者 |
| --- | --- | --- |
| `@omne-harness/assets-protocol` | 契约值与类型，不导入 Cordis、Node 内置模块 | 服务端接入插件、客户端核心与界面，浏览器可用 |

## 定义索引

| 导出 | 种类 | 定义位置 | 条款 |
| --- | --- | --- | --- |
| `assetsProtocol` | 值：`assets/v1` 的协议契约 | [src/assets-protocol.ts](../src/assets-protocol.ts) | [SPEC.md](../SPEC.md#ap-1) |
| `AssetsProtocol` | 类型：`typeof assetsProtocol` | [src/assets-protocol.ts](../src/assets-protocol.ts) | [SPEC.md](../SPEC.md#ap-4) |
| `SettingView` | 类型：一项的视图 | [src/assets-protocol.ts](../src/assets-protocol.ts) | [SPEC.md](../SPEC.md#ap-5) |
| `SettingInput` | 类型：`set-setting` 要写的值 | [src/assets-protocol.ts](../src/assets-protocol.ts) | [SPEC.md](../SPEC.md#ap-3) |
