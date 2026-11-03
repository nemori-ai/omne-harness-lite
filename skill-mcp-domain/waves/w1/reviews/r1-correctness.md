# W1 第 1 轮评审：正确性（摘要）

两边无阻断。评审者用 `node --conditions=source` 探针验证了每条反例，并对照下载的 MCP 2026-07-28 schema.ts、Key Changes、SEP-2663。

## Skill
- 应修 1：`parseSkillPackage` 在控制文件字节与快照不符时抛 TypeError；组页第 292 行与波规格失败语义要求返回 `version-changed`。
- 建议：YAML 格式错误时 `name-mismatch` 被 `malformed` 盖住（SPEC 第 128 行自定，写回组页时注明）；`scripts/../run.sh` 被判 `outside-package`，应为 `malformed`；类别端口把 `description`/`scripts`/`settings`/`package` 四个字段名收窄为保留字段（基线上 `"description":""` 合法，现在 malformed），需在 SPEC 写明；schema 的 `"const": 1` 对 `1.0` 放行而解析器拒绝；`./testing` 两成员形态不一致。
- 自报偏离三项均不违反：`toAssetVersion`/`toPackageDigest`；vitest（波规格自己定的）；`sealSnapshot` 收字节（比组页更强，代价是按内容存储的来源要先取全部字节）。

## MCP
- 应修 1：`inputRequests` 存在时不核对是对象，`{"resultType":"input_required","inputRequests":5}` 被当成合法多轮请求；应答 `protocolError`/`result-malformed`。
- 应修 2：`auth:"none"` 的正文可以声明 `source:"credential"` 的 env 项，加载期不拒绝；应判 `malformed` 或在 SPEC 写明运行时处置。
- 建议：省略 `content` 被当成 `complete`（协议要求 content 必需）；SPEC V4「对端自报的内容只经 Untrusted 交出」比实际宽（inputRequests、block.meta、definition 的 title/description/icons/_meta、fault.message/data 未包）；`mergeListing` 的修订条件只核调用方给的两个值，清单不绑定取得时读到的修订（交错反例）；S7 的 `preparation-failed` 把「需要授权」吞进去；内存 `UseEligibility` 替身 `setUnreadable(a,e,false)` 后默认 `granted`。
- 自报偏离四项均不违反：`cancelled`（SEP-2663 终态无 result，必要）；inputRequired 两字段可选；S7 原因集合；传输交原样应答。

## 范围外待裁决（组页拥有者 = reduce）
1. **`CallMode` 与 `mode-unsupported` 和 2026-07-28 冲突**：schema.ts 没有 `execution`/`taskSupport`；SEP-2663 写明「clients do not signal task preference on the request itself」，服务端逐次自行决定。对现代对端 `mode:'task'` 恒为「未发出」。
2. 任务 `input_required`：SEP-2663 要求经 `tasks/update` 交回答复，`McpTransport` 没有对应操作，`getTask` 丢掉了 `inputRequests`。
3. `stdio` + `oauth` 被接受；授权规范只用于 HTTP。
4. Skill 公开根的 `PackageInspection.inspect(locator)` 结构性带出 `PackageLocator`，与组页「调用方拿不到包定位」相抵。
