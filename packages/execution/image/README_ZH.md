# @omne-harness/image

[English](README.md)

有界的图像准入、编码和关闭。

状态。技术设计已接受，见 [issue 277](https://github.com/nemori-ai/omne-harness-lite/issues/277#issuecomment-6198093789)。本目录是 workspace 成员。六个生产上限仍由调用方传入。本成员不保存默认整数。

## 职责与状态

本成员拥有图像字节的预算、声明、打开句柄和关闭。执行环境拥有落点、隔离和设施就绪。content-block 只判断封闭图像块的形状，不解码像素。附件存储、模型图片请求和供应商尺寸搜索不在本成员。

保存图像字节的调用方和准备模型输入的调用方使用同一份核对过的原始字节和声明。本成员不实现这两个调用方，也不决定 `Files()` 或 `Shell()` 的执行落点。

## 使用

调用方先提交六个维度。通过之后，把同一预算对象交给打开操作。

```typescript
import { imageBudget, open } from '@omne-harness/image'

const created = imageBudget({
  formats: profile.formats,
  maxWidth: profile.maxWidth,
  maxHeight: profile.maxHeight,
  maxDecodedBytes: profile.maxDecodedBytes,
  maxConcurrentDecodes: profile.maxConcurrentDecodes,
  maxInFlightBytes: profile.maxInFlightBytes,
})
```

`created.kind` 为 `rejected` 时，没有预算对象。

保存字节的调用方在打开成功时保存原始字节和声明，然后关闭。这里的保存不是 `Files()` 的落点选择。

```typescript
const opened = await open({ bytes, budget })
if (opened.kind === 'rejected') {
  return opened.reason
}
const stored = {
  bytes: opened.verifiedBytes,
  mediaType: opened.declaration.mediaType,
  orientedWidth: opened.declaration.orientedWidth,
  orientedHeight: opened.declaration.orientedHeight,
}
await opened.handle.close()
```

准备模型输入的调用方在关闭前可以编码。编码不替换 `verifiedBytes`。

```typescript
const encoded = await opened.handle.encode({ format: 'png' })
await opened.handle.close()
```

打开操作不接收计时器。调用方用自己的计时器与打开操作赛跑时，原来的 Promise 继续。计时器先完成不释放预留，也不证明原生工作已停止。

独立调用方使用根入口，自己传入完整字节和预算对象。Cordis 调用方装载 `./cordis`。服务键 `image` 上的 `open` 只接收字节，预算来自插件配置。编码和关闭仍在句柄上。调用方不导入解码库。

## 契约

公开形状见[模型](docs/model.md)。打开、编码和关闭的步骤见[关键流程](docs/key-flow.md)。结果、失败、预留和关闭见 [SPEC](SPEC.md)。模块边界见[架构](docs/architecture.md)。Cordis 装配见[集成](docs/cordis.md)。根入口不导入 Cordis。

## 设计

打开句柄同时拥有光栅和一份预留。关闭句柄不再拥有它们。调用方用 `heldReservation()` 读取预算对象上的预留快照。预留表是以这个对象为键的 `WeakMap`。只有 `imageBudget` 能造出这个键。

`src/index.ts` 拥有公开操作。`src/container.ts` 在光栅出现前读取 png、jpeg 和 webp 头。`src/adapter.ts` 拥有 sharp 0.35.3。`src/cordis.ts` 拥有服务键 `image` 和插件。

## 配置与运行

预算数字由调用方传入。本成员不读取环境变量，也不保存默认上限。输入是一份完整缓冲。流式输入不在本成员。

构建先删除 `dist`，再编译。

## 验证

`pnpm --filter @omne-harness/image test` 从公开入口和 `./cordis` 运行单元测试与契约测试。

这次命令在 Darwin 25.5.0 arm64、Node v26.0.0、sharp 0.35.3、libvips 8.18.3 上通过。本卡对预算和关闭的平台接受只覆盖 Node 26。成员声明的 Node 范围是 `>=26.0.0 <27`。其他 Node 版本没有运行，也不写成已支持。调用方停止等待的用例用的是 2048×2048 的夹具 PNG 和 1 毫秒超时。这些夹具数字不是生产上限。`nativeStop` 仍是 `not-proven`。

执行环境的隔离测试不覆盖本成员。

## 维护

改变预算、拒绝原因或句柄状态时，同时改 SPEC 和[模型](docs/model.md)。content-block 的图像形状保持不变。
