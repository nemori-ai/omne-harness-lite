# scrypt

本包拥有有界的口令派生与校验。身份成员保存本包给出的不透明材料，不拆开里面的参数。本包不登录、不保存账号、不保管密钥。

PanQiWei 已在 #276 接受这份候选契约，并指定成员为 `packages/identity/scrypt`。生产数字按下面的已闭合决定。Node 24 重跑不作为本卡条件。测量平台是 darwin 25.5.0、arm64、Node v26.0.0、OpenSSL 3.6.2。包的 `engines` 仍写 `>=24.18.0 <25`，与同组其他包一致，本卡不放宽它。

## 已闭合的参数

`SCRYPT_PROFILE` 是本卡接受的部署配置。

| 字段 | 值 | 依据 |
| --- | --- | --- |
| N | 131072 | OWASP Password Storage Cheat Sheet 对 scrypt 的最低建议，也是旧包写明的缺省 |
| r | 8 | 同上 |
| p | 1 | 同上 |
| keylen | 32 | 同上。材料允许 16 到 64，派生使用 32 |
| saltBytes | 16 | 同上。盐由本包生成 |
| inFlight | 1 | 一份约 128 MiB。这台机器上一次派生约 200 毫秒。同时只算一份 |
| queue | 4 | 最多再等约 0.8 秒，然后拒绝。等候不占派生内存 |

单份内存是 `128 * r * (N + p + 2)`。这是 OpenSSL 3.6.2 接受的最小 `maxmem`。六个参数组各测 3 次，极差为 0。配置的内存预算是这个单份内存乘以 `inFlight`。缺字段、0 或非有限正数时，`openScrypt` 返回 `invalid_profile`，不创建模块。

`r` 或 `p` 为 0 时 Node 会改用默认的 8 和 1。这种配置在打开时拒绝。

## 结果

派生在计算前可以返回 `invalid_secret`、`policy_missing`、`policy_refused`、`memory_limit`、`queue_full`、`stopped` 或 `unavailable`。进入计算后，`done` 得到 `{ code: 'material', material }` 或 `{ code: 'unavailable' }`。取消尚未开始的等候时，`done` 得到 `{ code: 'left_queue' }`。

校验在计算前可以返回 `mismatch`、`unavailable`、`stopped`、`queue_full` 或 `memory_limit`。算完后，`done` 得到 `{ code: 'match' }`、`{ code: 'mismatch' }` 或 `{ code: 'unavailable' }`。

不认识的方案是 `mismatch`。材料损坏、参数超过当前配置的 N、r、p 或 keylen，或计算失败，是 `unavailable`。口令错误是 `mismatch`。收紧配置后，超预算的旧材料在计算前得到 `unavailable`。本包不迁移旧的 `$password-scrypt$` 字符串。

口令政策由调用方传入。本包不规定最短长度或字符类别。缺政策、政策抛错，或返回值没有布尔 `ok`，都不会当成通过。

停止等待不归还已经开始的名额。Node 的 `scrypt` 在这台机器上不会因 `AbortSignal` 停下来。`close` 拒绝新的派生和校验，让队列中尚未开始的等候离开，并等到已经开始的计算结束。

比较使用 `timingSafeEqual`。这避免按第一个不同字节提前返回。它不是对时序侧信道的证明。

材料形状是 `$scrypt$v=1$n=<N>,r=<r>,p=<p>,k=<keylen>$<盐>$<派生结果>`。盐和派生结果是无填充的 base64url。

## 验证

`pnpm --filter @omne-harness/scrypt test` 覆盖固定向量、计算前拒绝、队列、取消、关闭和接受配置的一次真实往返。探针 `tmp/issue-276-preparation/probe/probe.mjs` 保留 Node 26 上的 `maxmem` 测量。本卡不跑登录旅程。
