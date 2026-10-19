---
id: plugin-throw-fails-fiber
upstream: cordis
version: 4.0.4
kind: positive
symbols:
  - "fiber.ts: resolveConfig 用 runtime.Config['~standard'].validate 校验 config，不通过即抛出，插件体不跑"
  - "fiber.ts: 插件体抛出 ⇒ fiber 记下错误，状态读作 FAILED；await fiber 以该错误拒绝"
  - "fiber.ts: FAILED 的 fiber 不 provide 任何服务——已注册的 effect 随失败收回"
lines:
  - "fiber.ts:50-53"
  - "fiber.ts:142-151"
  - "fiber.ts:576-578"
  - "fiber.ts:641-643"
probe: packages/core/kernel-basis/tests/basis/plugin-throw-fails-fiber.test.ts
checked: 2026-09-23
---

# 插件体抛出或 config 校验不过，fiber 就是 `FAILED`，什么服务都不出现

## 读数

一条 fiber 装载时先过 config：runtime 声明了 `Config`（Standard Schema）时，`resolveConfig` 调它的 `validate`，
**不通过即抛出，插件体根本不跑**。过了 config 再跑插件体；**插件体抛出**，fiber 记下错误，状态读作 `FAILED`，
`await fiber` 以那个错误拒绝，插件体里已经 `provide` 过的服务与已注册的 effect 一并收回——外面看不到半个服务。

**想当然的理解**：插件体抛错只是「这个插件坏了」，别的照常，或者已经 provide 的那一半还在。

**实际（4.0.4 取证）**：failed fiber 什么都不提供；它抛出的错误会传给 `ctx.plugin()` 的调用方。
装配据此就能做到「配置错误 ⇒ 启动失败、整个装配不半开」：每个插件把「缺密钥」「参数非法」写成 config 校验或插件体开头的抛出，
装配 `await` 每一条 fiber，任一拒绝就整体停下并逆序撤除已起的。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `fiber.ts` `resolveConfig` | 有 `Config` 就 `validate`，失败抛出（错误信息含 `invalid config`） | 给一个 `z.object({ ttl: positive })` 的插件传 `{ ttl: 0 }`，`await ctx.plugin(...)` 拒绝，插件体没跑 |
| `fiber.ts` 状态读取 | 记有错误 ⇒ `FAILED` | 插件体 `throw`，读 `fiber.state` |
| `fiber.ts` 失败收场 | 已 provide 的服务不可见 | 失败插件体里先 `provide('offers')` 再抛，`ctx.get('offers')` 为 `undefined` |

## probe 断言什么

probe 在 `packages/core/kernel-basis`，对 4.0.4 通过（2026-09-22 首跑，2026-09-23 升格为条目）：

1. 插件体抛 `Error('missing signing key')`：`await` 该 fiber 以同一错误拒绝，`fiber.state === FAILED`。
2. config `{ ttl: 0 }` 不过 `positive` 校验：拒绝且错误匹配 `/invalid config/`，`fiber.state === FAILED`，插件体没跑，`ctx.get('offers')` 为 `undefined`。
3. 对照：config `{ ttl: 5 }` ⇒ `ACTIVE`，插件体收到校验后的值。

上游若改为「校验失败也跑插件体」「抛出后仍保留已 provide 的服务」或「状态不读作 FAILED」，第 1、2 条失败——本条目随之失效。

## 核验范围

本条按函数插件与 `runtime.Config` 核验。`Service` 子类写静态 `Config` 的路径没有单独核验。该路径是否同样经 `resolveConfig` 校验，需另立 basis 条目核验后，才能写成已验证。

## 已知的误用

- **在插件体里 try/catch 吞掉配置错误再继续 provide**：得到一个半开的插件；「不半开」的前提正是让错误抛出去。
- **把「缺可选配置」也做成抛出**：那不是配置错误，是把可选做成了必需——可选走默认值或 `ctx.get`。
