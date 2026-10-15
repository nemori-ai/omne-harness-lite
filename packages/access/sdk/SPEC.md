# 客户端 SDK 行为规格

状态：Issue 274 修订 1 已接受的治理协议里，客户端职责写入本页。消息字段和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。本目录还不是可运行的治理 SDK。`src` 不导出治理操作。

## 客户端职责

SDK 是调用者使用完整 Harness 治理消息的客户端入口。它持有调用者提供的传输适配，以及调用者交给它的登录证明。它把请求交给传输适配，并把响应对回同一次 `messageId`。

SDK 对同一个 `outcome` 使用公开契约里的解释。它不另定拒绝原因，也不把超时写成没有业务效果。

## 自动再送与缓存

传输适配报告请求字节没有发出时，SDK 自动再送一次。适配不能证明这一点时，SDK 不自动再送。调用者自己发起的下一次调用是一次新调用，并遵守该操作自己的重复规则。

SDK 不缓存准入允许、登录证明或凭据。它不提供 `prefer-copy`。客户端应用可以保存屏幕投影。投影失败不改变已经返回的 `succeeded`。清掉投影不把 `unknown` 变成成功或没有发生。

这些治理调用不刷新登录的空闲计时。`public-health` 不带登录证明，也不带行事租户。

## 安装闭包

SDK 依赖公开契约，以及调用者提供的传输适配接口。它不依赖服务端接入。它不依赖服务器存储类型。

安装闭包以 SDK 成为发布产物之后的依赖清单为准。源码能够编译不能代替该清单。现在还没有这份治理实现的发布产物，所以闭包核对未运行。

## 使用示例

下面的对象说明调用方向。它不是本包现在导出的函数。

```ts
import { governanceOperation } from "@omne/access-public-contract";

export function revokeOwnLogin(proof: string, targetLoginId: string): unknown {
  return governanceOperation({
    protocolVersion: "governance-public/1",
    messageId: "caller-generated",
    operation: "revoke-login",
    loginProof: proof,
    body: { targetLoginId },
  });
}
```

`revoke-login` 的字段表禁止行事租户。这个调用不带 `actingTenant`。字段表写明必填的操作才带上当前选择。

## 验证

本页的核对是阅读公开契约，并确认 SDK 没有第二套结果含义。必须观察到的客户端规则是自动再送条件和不缓存允许。实现测试未运行。长期个人负责人尚未具名。
