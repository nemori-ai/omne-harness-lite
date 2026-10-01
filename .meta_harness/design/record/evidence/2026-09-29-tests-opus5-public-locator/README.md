# 2026-09-29 opus5-public-locator 安全执行证据（待主线接受）

Opus 5 单 public locator：1 个唯一 entryId / upstreamRequestId；input=58、output=152、reasoning=148、cache read/write=0/0；实际费用 $0.00409。此 scenario 明确不启动 service。此次 outcome=complete，没有复现旧失败。

执行源码提交为 `703a119effafdc212286df6aadc51d147f3dea9e`。`source-proof.json` 中 13 份 tracked 源文件以 `git show <commit>:<path>` 取字节并与原执行 manifest 的 SHA256 相等；7 份 runner 脚本来自已冻结 runner-v2，同样逐项匹配 manifest。另登记冻结目录顶层 11 个 mjs 的哈希，未把未引用的 4 份声称为本次执行依赖。源码归档只便于审计，不是可重新执行 paid 请求的授权。

## 离线复核

在任意工作目录运行（Python 3 标准库，无网络、无安装、无 build）：

```sh
python3 /absolute/path/to/this-package/verify.py
python3 /absolute/path/to/this-package/verify.py --repo /absolute/path/to/omne-harness-lite
```

第一条只需本包；第二条额外从显式仓库的 `703a119effafdc212286df6aadc51d147f3dea9e` 重新核 tracked 字节。脚本使用自身目录，移动进 record/evidence 后不依赖 parents 层数。不会导入或运行 archived runner，也不会读取当前 ledger。`checksums.json` 覆盖包内除自身外每个文件；其自身 SHA 作为交接包标识。数值由 Decimal 解析，费用不经浮点加和。

`receipts/` 是原 paid 目录的顶层安全 JSON；`catalog/` 保留公开原始 catalog/raw；`approved-scenario.json` 保留原批准场景；`selected-ledger-entries.json` 仅含 1 个列明 entryId。未递归读取或复制 service-data，未读取凭据/config/key/.env。manifest 内 budget 数是原预约上限，不能当作实际费用。

## 验证范围与未覆盖

- 验证 SHA、批准输入关联、唯一 entryId 与 upstreamRequestId、summary/receipt/selected-ledger 数值一致，以及存在时 observed/durable 内容一致、关闭回执标志和顺序、缓存读写字段。
- durable 与关闭仅是 runner 已记录的事实及其内部一致性；没有独立读取会话存储，不证明物理同批写入。service 的 liveWireSha256 仍为 unavailable，不把 approved local wire SHA 当作实际发送 wire 证明。
- 本包没有 full/marginal 模式记录，不能据此声称已核增量路径。缓存样本不构成普遍 tokenizer/cache 保证。
- 两个本轮所选目录均无 failure receipt；保留原文件，不创造或删改失败记录。旧 `tmp/priority-certification/paid-claude-opus-5-cache-20260929-hub1/` 的 unknown 与既有记录不受影响；本包不复制该旧目录、不改变其 ledger 状态、不解释原失败原因。
- catalog 与费用仅对应此次冻结输入和执行。没有认证其它 effort/模态/模型，也没有用新成功覆盖旧失败。是否移入 tracked evidence 及最后技术接受由主线负责。

离线负控记录见 `verifier-negative-results.json`：字节篡改和选定 ledger 费用篡改必须失败；Sol 另核关闭顺序篡改必须失败。它们是本次校验器的负控，不是 paid 执行失败。原文件按字节恢复后重新通过。费用另按冻结 catalog 的本样本适用基础费率复算（含缓存读写，reasoning 已在 output 中，不重复计费）；未触及分档阈值，不推广成其它请求的报价规则。
