# @omne-harness/scrypt

[English](README.md)

给后来的登录和更换凭据使用的有界 scrypt。身份成员只保存不透明材料，不拆开参数。

## 职责与状态

本包做派生和校验。它不登录、不保存账号、不保管密钥。成员位置是 `packages/identity/scrypt`。部署负载是 `SCRYPT_PROFILE`。测量平台是 Node v26.0.0。声明的 engines 是 `>=24.18.0 <25`。

## 使用

用一份完整配置调用 `openScrypt`。`SCRYPT_PROFILE` 是部署配置。没有 Cordis 入口。

```ts
import { SCRYPT_PROFILE, openScrypt } from '@omne-harness/scrypt'

const opened = openScrypt(SCRYPT_PROFILE)
if (!opened.ok) throw new Error(opened.code)
const started = opened.module.derive('correct horse battery', () => ({ ok: true }))
if (!('done' in started)) throw new Error(started.code)
const derived = await started.done
await opened.module.close()
```

`close` 拒绝新工作，丢掉还在排队的工作，并等待已经开始的计算。

## 契约

类型没有写出的行为在 [SPEC.md](SPEC.md)。政策拒绝或非法配置不会调用 scrypt。`mismatch` 表示口令错误，或方案不是 `scrypt`。`unavailable` 表示材料损坏、超过当前预算，或计算失败。停止等待不会释放正在计算的名额。

## 设计

`openScrypt` 持有正在计算的份数、派生内存之和和队列。`planAdmission` 据此返回 `run`、`queue`、`memory_limit` 或 `queue_full`。`hashScrypt` 调用 Node `crypto.scrypt`，`maxmem` 设为 `128 * r * (N + p + 2)`。

## 配置与运行

传入完整的 `ScryptProfile`。缺字段、0 或非有限数会使 `openScrypt` 返回 `invalid_profile`。`N` 必须是大于 1 的安全整数 2 的幂。`openScrypt` 复制已接受的字段，调用方事后修改原对象不会改变这个模块。UTF-8 超过 4096 字节的秘密，或长过合法盐和结果的材料，在计算前得到 `unavailable`。接受的配置是 N = 131072、r = 8、p = 1、32 字节输出、16 字节盐、同时 1 份计算、队列 4 份。口令长度规则留在调用方传入的函数里。

## 验证

运行 `pnpm --filter @omne-harness/scrypt test`。RFC 7914 向量和一次接受配置的往返使用真实 Node scrypt。队列和取消测试使用暂停的计算函数。本包没有登录旅程测试。

## 维护

材料文本、准入计数或 `SCRYPT_PROFILE` 变化时，同步 SPEC.md 和 `tests/scrypt.spec.ts`。登录和凭据存储是以后的消费者。它们不在本包实现。
