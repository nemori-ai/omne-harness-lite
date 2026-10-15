# 客户端 SDK 行为规格

本页拥有治理协议的客户端职责。消息字段和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。

## 客户端职责

SDK 是调用者使用完整 Harness 治理消息的客户端入口。它持有调用者提供的传输适配，以及调用者交给它的登录证明。它把请求交给传输适配，并把响应对回同一次 `messageId`。

注册和签发登录之前，调用者必须已经选定对端信任材料。信任核验失败时，SDK 不发送凭据或登录证明。

SDK 对同一个 `outcome` 使用公开契约里的解释。它不另定拒绝原因，也不把超时写成没有业务效果。

## 自动再送与缓存

传输适配报告请求字节没有发出时，SDK 自动再送一次。适配不能证明这一点时，SDK 不自动再送。调用者自己发起的下一次调用是一次新调用，并遵守该操作自己的重复规则。

SDK 不缓存准入允许、登录证明或凭据。它不提供 `prefer-copy`。客户端应用可以保存屏幕投影。投影失败不改变已经返回的 `succeeded`。清掉投影不把 `unknown` 变成成功或没有发生。

这些治理调用不刷新登录的空闲计时。`public-health` 不带登录证明，也不带行事租户。

## 安装闭包

SDK 依赖公开契约，以及调用者提供的传输适配接口。它不依赖服务端接入。它不依赖服务器存储类型。

安装闭包以 SDK 发布产物的依赖清单为准。源码能够编译不能代替该清单。

## 使用示例

调用形状如下。`messageId` 由调用者生成，示例里的值只是占位。`revoke-login` 的字段表禁止行事租户。字段表写明必填的操作才带上当前选择。

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

SDK 不另写结果含义。必须遵守的客户端规则是自动再送条件和不缓存允许。下列输入的结果以公开契约为准。

- 缺登录证明只有 `denied`。
- 留存期内的接续在激活完成时是 `succeeded`。已经激活后再注册是 `not-loginable`。
- 陌生账号接受邀请是 `not-visible`。过期邀请返回已有的过期终结。
- `query-current-tenant` 不带行事租户。
- `issue-login` 的 `basis-unavailable` 不来自凭据已匹配的分支。
- 四个阶段外操作在坏正文和坏证明下都是 `stage-not-provided`。

