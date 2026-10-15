# 图像成员

状态：技术设计已接受，见 [技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/277#issuecomment-6198093789)。本目录没有 `package.json`，不是 workspace 成员，不能从这里导入或运行代码。

本成员校验完整图像字节，并在预算内打开、编码和关闭。保存图像字节的调用方和准备模型输入的调用方使用同一份核对过的原始字节和声明。本成员不实现这两个调用方，也不决定 `Files()` 或 `Shell()` 的执行落点。

## 职责与状态

本成员拥有图像字节的预算、声明、打开句柄和关闭。执行环境拥有落点、隔离和设施就绪。content-block 只判断封闭图像块的形状，不解码像素。附件存储、模型图片请求和供应商尺寸搜索不在本成员。

六个预算维度沿已接受的资源预算。具体整数尚未测量，本成员不写入默认整数。

## 使用

调用方先提交六个维度。通过之后，把同一预算对象交给打开操作。

```typescript
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

Files 在打开成功时保存原始字节和声明，然后关闭。这里的保存不是 `Files()` 元工具的落点选择。

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

Model 在关闭前可以编码。编码不替换 `verifiedBytes`。

```typescript
const encoded = await opened.handle.encode({ format: 'png' })
await opened.handle.close()
```

打开操作不接收计时器。调用方用自己的计时器与打开操作赛跑时，原来的 Promise 继续。计时器先完成不释放预留，也不证明原生工作已停止。

独立调用方使用根入口，自己传入完整字节和预算对象。Cordis 调用方使用同一组操作。装配选择解码器，调用方不导入解码库。

## 契约

公开形状见[模型](docs/model.md)。打开、编码和关闭的步骤见[关键流程](docs/key-flow.md)。结果、失败、预留和关闭见 [SPEC](SPEC.md)。模块边界见[架构](docs/architecture.md)。Cordis 装配见[集成](docs/cordis.md)。根入口不导入 Cordis。

## 设计

打开句柄同时拥有光栅和一份预留。关闭句柄不再拥有它们。调用方用 `heldReservation()` 读取预算对象上的预留快照。模块边界、旧实现对照和要避开的问题见[架构](docs/architecture.md)。

## 配置与运行

预算数字由调用方传入。本成员不读取环境变量，也不保存默认上限。原生库的名字和版本写在调用方的 profile 里，不写进本目录。

输入是一份完整缓冲。流式输入不在本成员。

## 验证

设计已接受，运行验证尚未执行。实现之后，单元和契约测试从公开入口覆盖预算拒绝、打开前拒绝、编码和关闭。替身不代替这条公开入口上的真实解码。执行环境的隔离测试不覆盖本成员。

## 维护

改变预算、拒绝原因或句柄状态时，同时改 SPEC 和[模型](docs/model.md)。content-block 的图像形状保持不变。成为 workspace 成员时再添加 `package.json`，并同步组入口和包组织里的叶子说明。
