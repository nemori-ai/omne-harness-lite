# 规范实例：合法与非法

属于 `data.call-accounts` v2 的规范实例。它是**本版的规范工件之一**，不是说明材料：
[`call-accounts.schema.json`](call-accounts.schema.json) 的每个定义项在这里各有一组正反实例，
非法的一律注明**得哪一个拒绝值、被哪一条挡住**。

**怎么读这张表**：每节开头的「校验对象」给出该节实例要拿去求值的 `$defs`。每张表四列：

| 列 | 是什么 |
|---|---|
| 实例 | JSON，内联代码 |
| Schema | **Schema 这一关**的预期：`通过` / `拒绝` |
| 契约判定 | 按契约的结论：`合法`，或 [S-27](contract.md#s-27-表示层拒绝值闭合) 五个拒绝值之一——**按那一条的次序**，一个值犯了几条只报第一个 |
| 依据 | 条款 |

**「Schema 通过」而「契约判定」是拒绝值的那几行，正是 Schema 表达不了的组合约束**（[S-27](contract.md#s-27-表示层拒绝值闭合) 的 `malformed` 第二半）：
它们留在这里，是为了让「Schema 校验通过不表示条款成立」有具体、可执行的例子。

**这个格式也是机检格式**：自检逐节按「校验对象」把第一列喂给校验器、拿第二列比对（[验证入口](../verification.md#结果与反例)）。
第四节以后的第三列要由**边界上的校验方**（到达语法的装配、报账、补账的写入者、读面）兑现，Schema 只兑现第二列。

**三条读法上的边界：**

- **`通过` 只说形状合规。**它不表示数是对的——查不出上游报错了数、工具报少了钱（[S-28](contract.md#s-28-表示层校验与判定分开)）。
- **示例里的标识串只是占位。**`ResponseId` 的词法归实现（[S-16](contract.md#s-16-responseid)）；
  `CallId` 的形状归 `data.content-blocks` v2（[`#S-14`](../../content-blocks/v2/contract.md#s-14-callid)）；`service` 对 MCP 接入点取能力标识规范串（[S-9](contract.md#s-9-costitem一次工具执行里的一笔)），依赖名的写法未定（[G-4](contract.md#十已知缺口)）。
  **不要从 `rsp_`、`call_`、`web_search` 这些写法推出任何规则。**
- **金额按精确十进制读**（[S-5](contract.md#s-5-金额美元十进制不截断)）。本页第 9 节的手算一律按十进制算，不按二进制浮点。

## 1. Unknown

**校验对象**：`$defs/Unknown`

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| `"unknown"` | 通过 | 合法 | [S-4](contract.md#s-4-未知是一个值不是零也不是缺席) |
| `"Unknown"` | 拒绝 | `malformed` | [S-29](contract.md#s-29-判别式与枚举闭合)：大小写严格，不做「最接近」映射 |
| `null` | 拒绝 | `malformed` | [S-29](contract.md#s-29-判别式与枚举闭合)：`null` 不是未知 |
| `""` | 拒绝 | `malformed` | [S-29](contract.md#s-29-判别式与枚举闭合) |
| `0` | 拒绝 | `malformed` | [S-4](contract.md#s-4-未知是一个值不是零也不是缺席)：零是数过了，不是数不出来 |

## 2. ResponseId

**校验对象**：`$defs/ResponseId`

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| `"rsp_1a2b"` | 通过 | 合法 | [S-16](contract.md#s-16-responseid) |
| `"01J9Q0ZK4M7Q2S"` | 通过 | 合法 | [S-16](contract.md#s-16-responseid)：不透明，形状不限定编码族 |
| `""` | 拒绝 | `malformed` | [S-16](contract.md#s-16-responseid)：非空 |
| `" rsp_1a2b"` | 拒绝 | `malformed` | [S-16](contract.md#s-16-responseid)：首字符不得在那个显式空白集合里 |
| `"rsp_1a2b\n"` | 拒绝 | `malformed` | [S-16](contract.md#s-16-responseid)：U+000A 在集合里；**这是 `$` 的回归用例**，理由见 `data.identity-values/v1#S-31` |
| `12345` | 拒绝 | `malformed` | [S-16](contract.md#s-16-responseid)：交换表示是字符串 |

## 3. Usage

**校验对象**：`$defs/Usage`

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| `{"input_tokens": 1520, "output_tokens": 311, "cache_read_tokens": 12288, "cache_write_tokens": "unknown", "reasoning_tokens": 128, "source": "upstream"}` | 通过 | 合法 | **U-1**。[S-6](contract.md#s-6-usage四项-token-与来源)：上游报了三项、没报写缓存那一项，那一项记未知；推理 128 是输出 311 的子集 |
| `{"input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none"}` | 通过 | 合法 | **U-2**。[S-6](contract.md#s-6-usage四项-token-与来源)、[S-20](contract.md#s-20-缺账或被拒收记未知不伪造)：流断了、上游什么都没报——全未知，不是全零 |
| `{"input_tokens": 1520, "output_tokens": 402, "cache_read_tokens": 12288, "cache_write_tokens": 0, "source": "upstream"}` | 通过 | 合法 | **U-3**。没报 `reasoning_tokens`：缺席 = 上游没报，不是零 |
| `{"input_tokens": 800, "output_tokens": 150, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}` | 通过 | 合法 | **U-4** |
| `{"input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}` | 通过 | 合法 | [S-6](contract.md#s-6-usage四项-token-与来源)：上游报了，就是零——与 U-2 是两回事 |
| `{"input_tokens": 1520, "output_tokens": 311, "cache_read_tokens": 12288, "source": "upstream"}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-未知是一个值不是零也不是缺席)：必填成员不得以缺席表达「不知道」 |
| `{"input_tokens": null, "output_tokens": 311, "cache_read_tokens": 12288, "cache_write_tokens": 0, "source": "upstream"}` | 拒绝 | `malformed` | [S-4](contract.md#s-4-未知是一个值不是零也不是缺席)：「不知道」只有 `"unknown"` 一种写法 |
| `{"input_tokens": "Unknown", "output_tokens": 311, "cache_read_tokens": 12288, "cache_write_tokens": 0, "source": "upstream"}` | 拒绝 | `malformed` | [S-29](contract.md#s-29-判别式与枚举闭合) |
| `{"input_tokens": 12.5, "output_tokens": 311, "cache_read_tokens": 12288, "cache_write_tokens": 0, "source": "upstream"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-usage四项-token-与来源)：token 数是整数 |
| `{"input_tokens": 1520, "output_tokens": -3, "cache_read_tokens": 12288, "cache_write_tokens": 0, "source": "upstream"}` | 拒绝 | `negative_amount` | [S-27](contract.md#s-27-表示层拒绝值闭合) |
| `{"input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "upstream"}` | 拒绝 | `unknown_with_source` | [S-6](contract.md#s-6-usage四项-token-与来源)：声称上游报过，却一项也没有——与 U-2 无从区分 |
| `{"input_tokens": 1520, "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none"}` | 拒绝 | `unknown_with_source` | [S-6](contract.md#s-6-usage四项-token-与来源)：说没报，手里却有一个数 |
| `{"input_tokens": "unknown", "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "reasoning_tokens": 0, "source": "none"}` | 拒绝 | `unknown_with_source` | [S-6](contract.md#s-6-usage四项-token-与来源)：`none` 不带 `reasoning_tokens` |
| `{"input_tokens": 1520, "output_tokens": 311, "cache_read_tokens": 12288, "cache_write_tokens": 0, "reasoning_tokens": 400, "source": "upstream"}` | **通过** | `malformed` | [S-6](contract.md#s-6-usage四项-token-与来源)：推理 400 大于输出 311，子集不能比全集大。**Schema 放它过去**——跨成员比较不在形状约束内 |
| `{"input_tokens": 1520, "output_tokens": 311, "cache_read_tokens": 12288, "cache_write_tokens": 0, "reasoning_tokens": "unknown", "source": "upstream"}` | 拒绝 | `malformed` | [S-6](contract.md#s-6-usage四项-token-与来源)：`reasoning_tokens` 没有未知这个取值，没报就不出现 |
| `{"input_tokens": 1520, "output_tokens": 402, "cache_read_tokens": 12288, "cache_write_tokens": 0, "total_tokens": 14210, "source": "upstream"}` | 拒绝 | `malformed` | [S-7](contract.md#s-7-派生量cache_tokens-与-total_tokens)：派生量不是成员，存下来就多一份可以对不上的数 |
| `{"input_tokens": 1520, "output_tokens": 402, "cache_tokens": 12288, "cache_write_tokens": 0, "cache_read_tokens": 12288, "source": "upstream"}` | 拒绝 | `malformed` | [S-7](contract.md#s-7-派生量cache_tokens-与-total_tokens) |
| `{"input_tokens": 1520, "output_tokens": 402, "cache_read_tokens": 12288, "cache_write_tokens": 0, "source": "estimated"}` | 拒绝 | `malformed` | [S-29](contract.md#s-29-判别式与枚举闭合)：来源闭合两值 |
| `{"input_tokens": -1, "output_tokens": 402, "cache_read_tokens": 12288, "cache_write_tokens": 0, "prompt_tokens": 1520, "source": "upstream"}` | 拒绝 | `malformed` | **判定次序**：多一个成员（结构）又有负数，[S-27](contract.md#s-27-表示层拒绝值闭合) 第 2 步先于第 3 步 |
| `{"input_tokens": -1, "output_tokens": "unknown", "cache_read_tokens": "unknown", "cache_write_tokens": "unknown", "source": "none"}` | 拒绝 | `negative_amount` | **判定次序**：负数又与来源对不上，第 3 步先于第 4 步 |

## 4. Cost

**校验对象**：`$defs/Cost`

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| `{"cost_usd": 0.004187, "source": "upstream_usage"}` | 通过 | 合法 | **C-1**。[S-8](contract.md#s-8-cost一次发出的费用) |
| `{"cost_usd": "unknown", "source": "none"}` | 通过 | 合法 | **C-2**。[S-8](contract.md#s-8-cost一次发出的费用)、[S-20](contract.md#s-20-缺账或被拒收记未知不伪造)：拿不到，不是零 |
| `{"cost_usd": 0.00512, "source": "upstream_usage"}` | 通过 | 合法 | **C-3** |
| `{"cost_usd": 0.0021, "source": "upstream_usage"}` | 通过 | 合法 | **C-4** |
| `{"cost_usd": 0, "source": "upstream_usage"}` | 通过 | 合法 | [S-8](contract.md#s-8-cost一次发出的费用)：上游报了零，就是零 |
| `{"cost_usd": 0.00512, "upstream_inference_cost_usd": 0.0049, "source": "upstream_usage"}` | 通过 | 合法 | [S-8](contract.md#s-8-cost一次发出的费用)：两个数照上游原样记，本契约不定二者关系 |
| `{"cost_usd": 0.0000000123456789012345, "source": "upstream_usage"}` | 通过 | 合法 | [S-5](contract.md#s-5-金额美元十进制不截断)：不设小数位上限，22 位有效数字照原样保住。**按二进制浮点读它会丢位**——那是实现的事（[G-9](contract.md#十已知缺口)） |
| `{"cost_usd": 0.0039, "source": "later_correction"}` | 通过 | 合法——**作为有效费用** | [S-22](contract.md#s-22-有效费用)：补账之后求出来的样子。**同一个值若出现在原账里，Schema 照样放过，却违反 [S-18](contract.md#s-18-原账不改)**——形状管不到「它在哪」，只能由写入路径只追加来保 |
| `{"cost_usd": 0.004, "source": "none"}` | 拒绝 | `unknown_with_source` | [S-8](contract.md#s-8-cost一次发出的费用) |
| `{"cost_usd": "unknown", "source": "upstream_usage"}` | 拒绝 | `unknown_with_source` | [S-8](contract.md#s-8-cost一次发出的费用)：声称上游报了，却没有数 |
| `{"cost_usd": "unknown", "source": "later_correction"}` | 拒绝 | `unknown_with_source` | [S-17](contract.md#s-17-costcorrection事后补账)：补账没有未知 |
| `{"cost_usd": "unknown", "upstream_inference_cost_usd": 0.001, "source": "none"}` | 拒绝 | `unknown_with_source` | [S-8](contract.md#s-8-cost一次发出的费用)：`none` 不带上游另报的那个数 |
| `{"cost_usd": -0.001, "source": "upstream_usage"}` | 拒绝 | `negative_amount` | [S-5](contract.md#s-5-金额美元十进制不截断) |
| `{"cost_usd": "0.004187", "source": "upstream_usage"}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-金额美元十进制不截断)：金额是 JSON 数字，不是字符串 |
| `{"cost_usd": 0.004187, "currency": "USD", "source": "upstream_usage"}` | 拒绝 | `malformed` | [S-5](contract.md#s-5-金额美元十进制不截断)：币种固定，没有币种成员 |
| `{"cost_usd": 0.0041, "source": "catalog_estimate"}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-cost一次发出的费用)：估算不是一个来源 |
| `{"cost_usd": 0.004187}` | 拒绝 | `malformed` | [S-8](contract.md#s-8-cost一次发出的费用)：`source` 必填 |

## 5. CostItem

**校验对象**：`$defs/CostItem`

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| `{"service": "web_search", "cost_usd": 0.005, "quantity": {"amount": 1, "unit": "request"}, "reference": "req-7Hq2", "source": "tool_reported"}` | 通过 | 合法 | **I-1**。[S-9](contract.md#s-9-costitem一次工具执行里的一笔)：工具作者报的一笔 |
| `{"service": "acme-crm", "cost_usd": "unknown", "quantity": {"amount": 3, "unit": "call"}, "source": "none"}` | 通过 | 合法 | **I-2**。[S-9](contract.md#s-9-costitem一次工具执行里的一笔)：用了三次、价钱不知道——`source` 说的是这个数的来路 |
| `{"service": "model_call", "cost_usd": 0.0021, "reference": "rsp_9c1e", "source": "model_response"}` | 通过 | 合法 | **I-3**。[S-10](contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)：镜像，`reference` 指向那份响应 |
| `{"service": "attachment-store", "cost_usd": 0.0002, "quantity": {"amount": 1048576, "unit": "byte"}, "source": "service_reported"}` | 通过 | 合法 | **I-4**。运行时从它管得着的服务收来的 |
| `{"service": "model_call", "cost_usd": "unknown", "reference": "rsp_2b7f", "source": "none"}` | 通过 | 合法 | [S-10](contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)：镜像一份费用未知的响应，照记未知 |
| `{"service": "web_search", "cost_usd": "unknown", "source": "tool_reported"}` | 拒绝 | `unknown_with_source` | [S-9](contract.md#s-9-costitem一次工具执行里的一笔)：工具报了价钱才是 `tool_reported`；没报价钱是 `none` |
| `{"service": "web_search", "cost_usd": 0.005, "source": "none"}` | 拒绝 | `unknown_with_source` | [S-9](contract.md#s-9-costitem一次工具执行里的一笔) |
| `{"service": "web_search", "cost_usd": 0.005, "source": "model_response"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-costitem一次工具执行里的一笔)：取自响应的数只能记在 `model_call` 名下 |
| `{"service": "model_call", "cost_usd": 0.0021, "source": "model_response"}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)：镜像必须指得回它的权威 |
| `{"service": "model_call", "cost_usd": 0.0021, "reference": "rsp_9c1e", "source": "tool_reported"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-costitem一次工具执行里的一笔)：`model_call` 的数只能取自那份响应 |
| `{"service": "model_call", "cost_usd": 0.0021, "reference": " rsp_9c1e", "source": "model_response"}` | 拒绝 | `malformed` | [S-10](contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)：`model_call` 的 `reference` 是一个 `ResponseId`，首尾不得有空白 |
| `{"service": "web_search", "cost_usd": 0.005, "quantity": {"amount": -1, "unit": "request"}, "source": "tool_reported"}` | 拒绝 | `negative_amount` | [S-27](contract.md#s-27-表示层拒绝值闭合)：计量数同样不许为负 |
| `{"service": "web_search", "cost_usd": 0.005, "quantity": {"amount": 1}, "source": "tool_reported"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-costitem一次工具执行里的一笔)：计量要带单位 |
| `{"service": "", "cost_usd": 0.005, "source": "tool_reported"}` | 拒绝 | `malformed` | [S-9](contract.md#s-9-costitem一次工具执行里的一笔)：谁收的钱不能是空的 |

## 6. TrimReason 与 TrimSummary

**校验对象**：`$defs/TrimReason`

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| `"rate_merged"` | 通过 | 合法 | [S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说) |
| `"quota_exhausted"` | 通过 | 合法 | [S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说) |
| `"throttled"` | 拒绝 | `malformed` | [S-29](contract.md#s-29-判别式与枚举闭合)：闭合四值 |

**校验对象**：`$defs/TrimSummary`

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| `{"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}` | 通过 | 合法 | **M-0**。一帧都没砍：四项写 0，不是不写 |
| `{"merged": 30, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 30, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}` | 通过 | 合法 | **M-1**。[S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说)：只合并，不丢字节 |
| `{"merged": 5, "cut": 3, "omittedBytes": 2048, "byReason": {"rate_merged": 5, "frame_too_long": 1, "quota_exhausted": 3, "rejected": 0}}` | 通过 | 合法 | **M-2**。合并 5、截短 1、额度用完后丢 3 |
| `{"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0}}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说)：`rejected` 那一项缺了——分不出「没发生」与「没记」 |
| `{"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0, "truncated": 0}}` | 拒绝 | `malformed` | [S-29](contract.md#s-29-判别式与枚举闭合)：键集合就是 `TrimReason` |
| `{"merged": 5, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 4, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}` | **通过** | `malformed` | [S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说)：`byReason.rate_merged` 必须等于 `merged` |
| `{"merged": 0, "cut": 2, "omittedBytes": 100, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 1, "rejected": 0}}` | **通过** | `malformed` | [S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说)：丢了 2 个，原因只说了 1 个——有一个是默默丢的 |
| `{"merged": 3, "cut": 0, "omittedBytes": 512, "byReason": {"rate_merged": 3, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}` | **通过** | `malformed` | [S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说)：没截也没丢，却报了丢字节——合并不计字节 |
| `{"merged": 0, "cut": -1, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}` | 拒绝 | `negative_amount` | [S-27](contract.md#s-27-表示层拒绝值闭合)：负数先于组合约束 |
| `{"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": "unknown", "rejected": 0}}` | 拒绝 | `malformed` | [S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说)：砍的那一方必然知道自己砍了什么，这里没有未知 |

## 7. ToolCallAccount

**校验对象**：`$defs/ToolCallAccount`

**机检前提**：`callId` 的形状取 `data.content-blocks` v2 的 `$defs/CallId`，`initiator` 与 `credentialScope` 取 `data.identity-values` v1 的 `TenantId` 与 `ScopeLayerIdentity`（后者限租户那一支），校验器按 `$id` 解析到它们。
**本节没有一行靠这三处的形状决定通过与否**，除了专门写明的那几行。

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| `{"callId": "call_5Jd9", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": "unknown", "items": [{"service": "web_search", "cost_usd": 0.005, "quantity": {"amount": 1, "unit": "request"}, "reference": "req-7Hq2", "source": "tool_reported"}, {"service": "acme-crm", "cost_usd": "unknown", "quantity": {"amount": 3, "unit": "call"}, "source": "none"}, {"service": "model_call", "cost_usd": 0.0021, "reference": "rsp_9c1e", "source": "model_response"}]}, "usage": {"input_tokens": 800, "output_tokens": 150, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}, "frames": {"emitted": 42, "trims": {"merged": 30, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 30, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:00:00Z", "endedAt": "2026-09-23T10:00:07.250Z"}}` | 通过 | 合法 | **T-1**。三笔（I-1、I-2、I-3）、一笔未知 ⇒ `total_usd` 未知（[S-12](contract.md#s-12-总额未知不当零加)）；有一笔 `model_call` ⇒ `usage` 出现，等于 U-4（[S-13](contract.md#s-13-经本系统调模型的用量汇总)）；帧数 M-1 |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z", "endedAt": "2026-09-23T10:01:00.040Z"}}` | 通过 | 合法 | **T-2**。[S-12](contract.md#s-12-总额未知不当零加)：没记下任何一笔 ⇒ 0（**不是**「没花钱」的承诺）；一帧没发是正常形态 |
| `{"callId": "call_3Rt6", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "unknown", "stoppedAt": "2026-09-23T10:40:12Z", "cost": {"total_usd": 0.0052, "items": [{"service": "web_search", "cost_usd": 0.005, "source": "tool_reported"}, {"service": "attachment-store", "cost_usd": 0.0002, "quantity": {"amount": 1048576, "unit": "byte"}, "source": "service_reported"}]}, "frames": {"emitted": 20, "trims": {"merged": 5, "cut": 3, "omittedBytes": 2048, "byReason": {"rate_merged": 5, "frame_too_long": 1, "quota_exhausted": 3, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:02:00Z"}}` | 通过 | 合法 | **T-3**。全部是数 ⇒ 总额 = 0.005 + 0.0002；没有 `model_call` ⇒ 没有 `usage`；`endedAt` 缺席——写账时没有可记的结束时刻；这是停机恢复时先回收、再追补的那一次，所以 `stoppedAt` 在、`externalEffect` 是 `unknown`（[S-11](contract.md#s-11-toolcallaccount一次工具执行的账)、[S-14](contract.md#s-14-wallclock)）；帧数 M-2 |
| `{"callId": "call_5Jd9", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0.0071, "items": [{"service": "web_search", "cost_usd": 0.005, "source": "tool_reported"}, {"service": "acme-crm", "cost_usd": "unknown", "source": "none"}, {"service": "model_call", "cost_usd": 0.0021, "reference": "rsp_9c1e", "source": "model_response"}]}, "usage": {"input_tokens": 800, "output_tokens": 150, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:00:00Z"}}` | 拒绝 | `total_not_unknown` | [S-12](contract.md#s-12-总额未知不当零加)：0.0071 就是把那笔未知当成了零 |
| `{"callId": "call_3Rt6", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0.0053, "items": [{"service": "web_search", "cost_usd": 0.005, "source": "tool_reported"}, {"service": "attachment-store", "cost_usd": 0.0002, "source": "service_reported"}]}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:02:00Z"}}` | **通过** | `malformed` | [S-12](contract.md#s-12-总额未知不当零加)：全部是数时总额恰等于各笔之和，0.0053 ≠ 0.0052 |
| `{"callId": "call_3Rt6", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": "unknown", "items": [{"service": "web_search", "cost_usd": 0.005, "source": "tool_reported"}, {"service": "attachment-store", "cost_usd": 0.0002, "source": "service_reported"}]}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:02:00Z"}}` | **通过** | `malformed` | [S-12](contract.md#s-12-总额未知不当零加)：每一笔都知道，总额就知道；写未知是扔掉了一个算得出的数 |
| `{"callId": "call_3Rt6", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0.005, "items": [{"service": "web_search", "cost_usd": 0.005, "source": "tool_reported"}]}, "usage": {"input_tokens": 800, "output_tokens": 150, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:02:00Z"}}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-经本系统调模型的用量汇总)：没有 `model_call`，用量汇总无从谈起 |
| `{"callId": "call_5Jd9", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0.0071, "items": [{"service": "web_search", "cost_usd": 0.005, "source": "tool_reported"}, {"service": "model_call", "cost_usd": 0.0021, "reference": "rsp_9c1e", "source": "model_response"}]}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:00:00Z"}}` | 拒绝 | `malformed` | [S-13](contract.md#s-13-经本系统调模型的用量汇总)：有 `model_call` 就得有 `usage` |
| `{"callId": "call_3Rt6", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:02:00Z", "endedAt": "2026-09-23T10:01:59Z"}}` | **通过** | `malformed` | [S-14](contract.md#s-14-wallclock)：结束早于开始。时刻按时间点语义比较，Schema 管不到 |
| `{"callId": "call_5Jd9", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0.0092, "items": [{"service": "web_search", "cost_usd": 0.005, "source": "tool_reported"}, {"service": "model_call", "cost_usd": 0.0021, "reference": "rsp_9c1e", "source": "model_response"}, {"service": "model_call", "cost_usd": 0.0021, "reference": "rsp_9c1e", "source": "model_response"}]}, "usage": {"input_tokens": 1600, "output_tokens": 300, "cache_read_tokens": 0, "cache_write_tokens": 0, "source": "upstream"}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:00:00Z"}}` | **通过** | `malformed` | [S-10](contract.md#s-10-model_call-那一笔是镜像权威在那份-modelresponse)：同一份响应镜像了两次——这次执行的钱与用量都翻倍了 |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 3, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 3, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z"}}` | **通过** | `malformed` | [S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说)：一帧没发，却合并了 3 帧——砍的不会比发的多 |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0, "items": []}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z"}}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-toolcallaccount一次工具执行的账)：`frames` 必填——没发帧写 0、数不出来写 `"unknown"`，都不是不写 |
| `{"callId": "call_4Nv2", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "unknown", "stoppedAt": "2026-09-23T11:20:05Z", "cost": {"total_usd": 0, "items": []}, "frames": "unknown", "wallClock": {"startedAt": "2026-09-23T11:15:00Z"}}` | 通过 | 合法 | **T-5**。[S-11](contract.md#s-11-toolcallaccount一次工具执行的账)：停机之后恢复时才追补这份账，持有帧计数的在途状态已经没了——发了几帧、砍了多少整份写 `"unknown"`，**不写 0** |
| `{"callId": "call_4Nv2", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "unknown", "stoppedAt": "2026-09-23T11:20:05Z", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": "unknown", "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T11:15:00Z"}}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-toolcallaccount一次工具执行的账)：数不出来是整份 `"unknown"`，不是只把帧数写成未知、砍的那几项照写 0 |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23"}}` | 拒绝 | `malformed` | [S-14](contract.md#s-14-wallclock)：日期不是时间点（`data.offer-expiry/v1#S-22`） |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z"}, "environment": "local"}` | 拒绝 | `malformed` | [S-3](contract.md#s-3-本契约明确不拥有什么)：「落在哪」由工具执行记录携带，不在账里 |
| `{"callId": "call_5Jd9", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "cost": {"total_usd": 0.1, "items": [{"service": "web_search", "cost_usd": -0.005, "source": "tool_reported"}, {"service": "acme-crm", "cost_usd": "unknown", "source": "none"}]}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:00:00Z"}}` | 拒绝 | `negative_amount` | **判定次序**：一笔为负、总额又是数配未知，第 3 步先于第 5 步 |
| `{"callId": "call_7Wq3", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "credentialScope": {"layer": "tenant", "tenant": {"organization": "org_7fd2c1", "account": "acc_91ab40"}}, "externalEffect": "confirmed", "late": true, "cost": {"total_usd": 0.002, "items": [{"service": "mcp/github", "cost_usd": 0.002, "source": "service_reported"}]}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:03:00Z", "endedAt": "2026-09-23T10:30:00Z"}}` | 通过 | 合法 | **T-4**。[S-38](contract.md#s-38-两种归属用量归凭据那一格成本归发起者)：接入点的凭据在发起租户自己那一格（组织那一层不持有 MCP 凭据，PF-002 rev 18 起）——用量归那一格、钱归发起者，两者照样分记；[S-39](contract.md#s-39-晚到的账)：运行终结之后才收场的后台执行，照样落、标 `late`；`service` 是接入点能力标识的规范串（[S-9](contract.md#s-9-costitem一次工具执行里的一笔)） |
| `{"callId": "call_8Kp1", "externalEffect": "confirmed", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z"}}` | 拒绝 | `malformed` | [S-38](contract.md#s-38-两种归属用量归凭据那一格成本归发起者)：`initiator` 必填，**不从「当前租户」补** |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z"}}` | 拒绝 | `malformed` | [S-11](contract.md#s-11-toolcallaccount一次工具执行的账)：`externalEffect` 必填——「不知道外面有没有做完」本身就是 `unknown`，不是不写 |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "partial", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z"}}` | 拒绝 | `malformed` | [S-29](contract.md#s-29-判别式与枚举闭合)：两值闭合 |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "confirmed", "late": false, "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z"}}` | 拒绝 | `malformed` | [S-39](contract.md#s-39-晚到的账)：`late` 只取 `true`，「不晚」只有缺席一种写法 |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "credentialScope": {"layer": "workspace"}, "externalEffect": "confirmed", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z"}}` | 拒绝 | `malformed` | [S-38](contract.md#s-38-两种归属用量归凭据那一格成本归发起者)：凭据只在租户那一格（`ScopeLayerIdentity` 的租户那一支） |
| `{"callId": "call_8Kp1", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "credentialScope": {"layer": "organization", "organization": "org_7fd2c1"}, "externalEffect": "confirmed", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:01:00Z"}}` | 拒绝 | `malformed` | [S-38](contract.md#s-38-两种归属用量归凭据那一格成本归发起者)：组织那一层不持有 MCP 凭据（PF-002 rev 18 起）——形状合法的 `ScopeLayerIdentity`，但不是租户那一支 |
| `{"callId": "call_3Rt6", "initiator": {"organization": "org_7fd2c1", "account": "acc_91ab40"}, "externalEffect": "unknown", "stoppedAt": "2026-09-23T10:01:59Z", "cost": {"total_usd": 0, "items": []}, "frames": {"emitted": 0, "trims": {"merged": 0, "cut": 0, "omittedBytes": 0, "byReason": {"rate_merged": 0, "frame_too_long": 0, "quota_exhausted": 0, "rejected": 0}}}, "wallClock": {"startedAt": "2026-09-23T10:02:00Z"}}` | **通过** | `malformed` | [S-14](contract.md#s-14-wallclock)：停下早于开始。Schema 管不到 |

## 8. CostCorrection

**校验对象**：`$defs/CostCorrection`（`callId` 的机检前提同第 7 节）

| 实例 | Schema | 契约判定 | 依据 |
|---|---|---|---|
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f"}, "cost_usd": 0.0039, "obtainedVia": "generation_endpoint", "at": "2026-09-23T10:05:00Z"}` | 通过 | 合法 | **K-1**。[S-17](contract.md#s-17-costcorrection事后补账)：向上游按请求号查回了那一次发出的费用 |
| `{"target": {"kind": "tool_execution", "callId": "call_5Jd9"}, "cost_usd": 0.0065, "obtainedVia": "manual", "at": "2026-09-23T11:00:00Z"}` | 通过 | 合法 | **K-2**。[S-17](contract.md#s-17-costcorrection事后补账)：补的是 T-1 的**自有部分**，不是 `total_usd` |
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f"}, "cost_usd": 0.0040, "obtainedVia": "manual", "at": "2026-09-23T10:30:00Z"}` | 通过 | 合法 | **K-3**。同一目标的第二条，更晚 |
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f"}, "cost_usd": 0.0041, "obtainedVia": "manual", "at": "2026-09-23T10:05:00Z"}` | 通过 | 合法 | **K-4**。单看合法；与 K-1 同 `at`、不同金额——**放进同一组就是平局**（第 9 节） |
| `{"cost_usd": 0.0039, "obtainedVia": "manual", "at": "2026-09-23T10:05:00Z"}` | 拒绝 | `correction_without_target` | [S-17](contract.md#s-17-costcorrection事后补账) |
| `{"target": {"kind": "model_response", "callId": "call_5Jd9"}, "cost_usd": 0.0039, "obtainedVia": "manual", "at": "2026-09-23T10:05:00Z"}` | 拒绝 | `correction_without_target` | [S-17](contract.md#s-17-costcorrection事后补账)：`kind` 与标识对不上 |
| `{"target": {"kind": "tool_call", "callId": "call_5Jd9"}, "cost_usd": 0.0039, "obtainedVia": "manual", "at": "2026-09-23T10:05:00Z"}` | 拒绝 | `correction_without_target` | [S-29](contract.md#s-29-判别式与枚举闭合)：`kind` 闭合两值 |
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f", "callId": "call_5Jd9"}, "cost_usd": 0.0039, "obtainedVia": "manual", "at": "2026-09-23T10:05:00Z"}` | 拒绝 | `correction_without_target` | [S-17](contract.md#s-17-costcorrection事后补账)：一条补账只补一个目标 |
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f"}, "cost_usd": "unknown", "obtainedVia": "manual", "at": "2026-09-23T10:05:00Z"}` | 拒绝 | `malformed` | [S-17](contract.md#s-17-costcorrection事后补账)：补账没有未知——什么也没拿到就不写 |
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f"}, "cost_usd": -0.0039, "obtainedVia": "manual", "at": "2026-09-23T10:05:00Z"}` | 拒绝 | `negative_amount` | [S-5](contract.md#s-5-金额美元十进制不截断)：补账可以把数改小，不能是负数 |
| `{"target": {"kind": "tool_execution", "callId": "call_5Jd9"}, "cost_usd": 0.0065, "obtainedVia": "generation_endpoint", "at": "2026-09-23T11:00:00Z"}` | 拒绝 | `malformed` | [S-17](contract.md#s-17-costcorrection事后补账)：工具执行没有上游请求号可查 |
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f"}, "cost_usd": 0.0039, "obtainedVia": "manual"}` | 拒绝 | `malformed` | [S-17](contract.md#s-17-costcorrection事后补账)：没有 `at` 就排不出新旧 |
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f"}, "cost_usd": 0.0039, "obtainedVia": "api", "at": "2026-09-23T10:05:00Z"}` | 拒绝 | `malformed` | [S-29](contract.md#s-29-判别式与枚举闭合) |
| `{"cost_usd": -0.0039, "obtainedVia": "manual", "at": "2026-09-23T10:05:00Z"}` | 拒绝 | `correction_without_target` | **判定次序**：缺目标又是负数，第 1 步先于第 3 步 |
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f"}, "cost_usd": 0.0042, "obtainedVia": "generation_endpoint", "at": "2026-09-24T09:00:00Z", "late": true}` | 通过 | 合法 | **K-5**。[S-39](contract.md#s-39-晚到的账)：运行终结之后才查回的费用，照样补、标 `late` |
| `{"target": {"kind": "model_response", "responseId": "rsp_2b7f"}, "cost_usd": 0.0042, "obtainedVia": "manual", "at": "2026-09-24T09:00:00Z", "late": "yes"}` | 拒绝 | `malformed` | [S-39](contract.md#s-39-晚到的账)：只取 `true` |

## 9. 手算汇总规则

**这一节不参与机检**（没有「校验对象」）。它把上面每一个带数的合法实例按契约的规则算一遍，
重点是**未知怎样传播**。一律按精确十进制加（[S-5](contract.md#s-5-金额美元十进制不截断)）。

### 9.1 一个运行，两次尝试

把上面的实例拼成一段真实的工作——**一个运行、两次尝试**，本组的归属由承载记录的条目给（[S-25](contract.md#s-25-按尝试记明细按-run-汇总)）：

| 目标 | 是什么 | 账 | 归哪次尝试 |
|---|---|---|---|
| r1 = `rsp_1a2b` | 一次完整的发出 | U-1 ＋ C-1 | 尝试 1 |
| r2 = `rsp_2b7f` | 下一次发出，首 token 之前流断了，随后这次尝试崩溃 | U-2 ＋ C-2（全未知，[S-20](contract.md#s-20-缺账或被拒收记未知不伪造)） | 尝试 1 |
| r3 = `rsp_3c4d` | 新尝试从 T1 重算、**照常再发**的那一次（[S-19](contract.md#s-19-每条到达流恰一份账两次发出两份)） | U-3 ＋ C-3 | 尝试 2 |
| t1 = `call_5Jd9` | 一次工具执行 | T-1 | 尝试 2 |
| r4 = `rsp_9c1e` | t1 替自己经本系统发出的那一次模型调用 | U-4 ＋ C-4 | 尝试 2（**与 t1 同组**，[S-24](contract.md#s-24-汇总不重复计)） |
| t2 = `call_8Kp1` | 一次没花钱、也没发帧的工具执行 | T-2 | 尝试 2 |

补账：K-1（目标 r2）、K-2（目标 t1），**各跟着目标分组**：K-1 归尝试 1，K-2 归尝试 2，二者都归这个运行。

### 9.2 每个带数的实例，逐个算

**Usage 的派生量**（[S-7](contract.md#s-7-派生量cache_tokens-与-total_tokens)）：

| 实例 | `cache_tokens` = read + write | `total_tokens` = input + read + write + output |
|---|---|---|
| U-1 | 12288 + `unknown` = **`unknown`** | 1520 + 12288 + `unknown` + 311 = **`unknown`** |
| U-2 | `unknown` + `unknown` = **`unknown`** | **`unknown`** |
| U-3 | 12288 + 0 = **12288** | 1520 + 12288 + 0 + 402 = **14210** |
| U-4 | 0 + 0 = **0** | 800 + 0 + 0 + 150 = **950** |
| 第 3 节第 5 行（全零） | **0** | **0**——与 U-2 的 `unknown` 是两回事 |

U-1 的 `reasoning_tokens` 128 **不另加**：它已在 `output_tokens` 311 里（128 ≤ 311）。

**ToolCallAccount**（[S-12](contract.md#s-12-总额未知不当零加)、[S-13](contract.md#s-13-经本系统调模型的用量汇总)、[S-15](contract.md#s-15-trimreason-与-trimsummary砍了要说)、[S-22](contract.md#s-22-有效费用)）：

| 实例 | `total_usd` 核对 | `own(t)`（不含 `model_call`） | `usage` 核对 | 帧数核对 |
|---|---|---|---|---|
| T-1 | 0.005 + `unknown` + 0.0021 = **`unknown`** ✓ | 0.005 + `unknown` = **`unknown`**（I-3 是镜像，不进） | 一笔 `model_call`（→ r4）⇒ 出现，= U-4 ✓；U-4 没有 `reasoning_tokens` ⇒ 汇总里也没有 | M-1：30 = 30；0 = 0 + 0；无截无丢 ⇒ 0 字节 ✓；30 + 0 + 0 = 30 ≤ 42 ✓；**送达 42 − 30 − 0 = 12 帧** |
| T-2 | 空 ⇒ **0** ✓ | **0** | 没有 `model_call` ⇒ 缺席 ✓ | M-0：全 0 ≤ 0 ✓ |
| T-3 | 0.005 + 0.0002 = **0.0052** ✓ | **0.0052** | 缺席 ✓ | M-2：5 = 5；3 = 3 + 0；有截有丢，2048 字节 ✓；5 + 3 + 1 = 9 ≤ 20 ✓；**送达 20 − 5 − 3 = 12 帧，其中 1 帧被截短** |

**若 T-1 的 I-2 事后拿到了价钱 0.0015**（假设，不是本组的事实）：`total_usd` = 0.005 + 0.0015 + 0.0021 = **0.0086**，`own` = 0.005 + 0.0015 = **0.0065**——
正好是 K-2 补上的那个数。**K-2 覆盖的是 0.0065 这一半，不是 0.0086**（[S-17](contract.md#s-17-costcorrection事后补账)）。

**单个 Cost 当作一个只有一个目标的组**（[S-23](contract.md#s-23-汇总已知之和与未知笔数)）：

| 实例 | `(knownSum, unknownCount)` |
|---|---|
| C-1 | (0.004187, 0) |
| C-2 | (0, 1)——**不是 (0, 0)**：拿不到的那一次照样是一个目标 |
| C-3 | (0.00512, 0) |
| C-4 | (0.0021, 0) |

### 9.3 有效费用，补账之前与之后

| 目标 | 补账之前 | 补账（组内最新） | 之后 |
|---|---|---|---|
| r1 | 0.004187 | — | 0.004187 |
| r2 | `unknown` | K-1：0.0039 | **0.0039**，以 `Cost` 的形状呈现为 `{"cost_usd": 0.0039, "source": "later_correction"}` |
| r3 | 0.00512 | — | 0.00512 |
| r4 | 0.0021 | — | 0.0021 |
| t1 | `own` = `unknown` | K-2：0.0065 | **0.0065** |
| t2 | `own` = 0 | — | 0 |

**原账一个字节都没改**：r2 的 C-2 仍是 `{"cost_usd": "unknown", "source": "none"}`，T-1 的 `total_usd` 仍是 `"unknown"`、I-3 仍是 0.0021（[S-18](contract.md#s-18-原账不改)）。

### 9.4 汇总

**补账之前**：

| 组 | 为数的有效费用 | `knownSum` | `unknownCount` | 怎么呈现 |
|---|---|---|---|---|
| 尝试 1 {r1, r2} | 0.004187 | **0.004187** | **1**（r2） | 「已知 0.004187 美元，另有 1 笔未知」 |
| 尝试 2 {r3, r4, t1, t2} | 0.00512 + 0.0021 + 0 | **0.00722** | **1**（t1） | 「已知 0.00722 美元，另有 1 笔未知」 |
| 运行 | 0.004187 + 0.00512 + 0.0021 + 0 | **0.011407** | **2** | 「已知 0.011407 美元，另有 2 笔未知」——**不是**「0.011407 美元」 |

**补账之后**（K-1、K-2）：

| 组 | 为数的有效费用 | `knownSum` | `unknownCount` | 怎么呈现 |
|---|---|---|---|---|
| 尝试 1 | 0.004187 + 0.0039 | **0.008087** | 0 | 0.008087 美元 |
| 尝试 2 | 0.00512 + 0.0021 + 0.0065 + 0 | **0.01372** | 0 | 0.01372 美元 |
| 运行 | 0.004187 + 0.0039 + 0.00512 + 0.0021 + 0.0065 + 0 | **0.021807** | 0 | 0.021807 美元 |

核对：0.008087 + 0.01372 = 0.021807 ✓。
**崩溃浪费掉的钱**（[S-25](contract.md#s-25-按尝试记明细按-run-汇总)）= 运行 − 最后一次尝试 = 0.021807 − 0.01372 = **0.008087**；
**补账之前这个差是 `unknown`**——两边都有未知，两个下界相减什么也不界定。

**token 用量按运行汇总**（只取各份 `ModelResponse` 的 `Usage`：r1～r4；**T-1 的 `usage` 不进**，[S-24](contract.md#s-24-汇总不重复计)）：

| 项 | 为数的 | 已知之和 | 未知笔数 |
|---|---|---|---|
| `input_tokens` | 1520 + 1520 + 800 | 3840 | 1（r2） |
| `output_tokens` | 311 + 402 + 150 | 863 | 1（r2） |
| `cache_read_tokens` | 12288 + 12288 + 0 | 24576 | 1（r2） |
| `cache_write_tokens` | 0 + 0 | 0 | 2（r1、r2） |

### 9.5 四种算错，各错在哪

| 错法 | 算出来 | 错在哪 |
|---|---|---|
| 把未知当零加，运行报「0.011407 美元」 | 0.011407 | [S-23](contract.md#s-23-汇总已知之和与未知笔数)：`unknownCount = 2` 时它只是下界 |
| 把 T-1 的镜像 I-3 也加进去 | 补账后 0.023907 | [S-24](contract.md#s-24-汇总不重复计)：r4 的 0.0021 计了两次 |
| 按「同一次调用」把 r2 与 r3 去重，只留 r3 | 补账后 0.017907 | [S-19](contract.md#s-19-每条到达流恰一份账两次发出两份)：两次发出，两笔钱都是真花掉的 |
| r4 没归进 t1 所在的组 | 补账后 0.019707，**没有任何报错** | [S-24](contract.md#s-24-汇总不重复计) 的前提：镜像不计、权威又不在组里，这笔钱就消失了（[G-3](contract.md#十已知缺口)） |

### 9.6 三种求值失败

| 情形 | 结果 | 依据 |
|---|---|---|
| 再加 K-3（目标 r2，10:30，0.0040） | **不是失败**：K-3 比 K-1 晚，r2 的有效费用变成 0.0040；尝试 1 = 0.008187，运行 = 0.021907 | [S-22](contract.md#s-22-有效费用) |
| 改加 K-4（目标 r2，10:05，0.0041）——与 K-1 同 `at`、金额不同 | 尝试 1 与运行的求值**明确失败**（补账平局）；尝试 2 不受影响，仍是 (0.01372, 0) | [S-22](contract.md#s-22-有效费用)、[S-23](contract.md#s-23-汇总已知之和与未知笔数) |
| 把 K-2 按写下它的那一刻归到了尝试 1（它的目标 t1 在尝试 2） | 尝试 1 的求值**明确失败**（孤立补账）——**不是**忽略它得 (0.008087, 0) | [S-25](contract.md#s-25-按尝试记明细按-run-汇总)：补账跟着目标分组 |
| 同一份 C-3 在运行那一组里落了两份（`rsp_3c4d` 出现两次） | 运行的求值**明确失败**（重复的账）——**不是**去重之后照常返回 | [S-23](contract.md#s-23-汇总已知之和与未知笔数) 第 4 件、[S-19](contract.md#s-19-每条到达流恰一份账两次发出两份) |

（第一行不是失败，列在这里是为了与第二行对照：**晚一点就是新的，同一刻而金额不同才判不出。**）


## 本批新增规范实例

完整机器实例见 [ready-examples.json](ready-examples.json)；schemaValid只判断形状，不能证明权限、摘要实际相等、来源、跨记录或持久化。引用内容缺失必须unavailable而非空结果；同ResponseId ready费用1.25、final费用1.25，总账仍1.25；无final时仍1.25；若ready费用unknown，则未知笔数1；补账0.8后为0.8且不改两份原值。

## R2 两阶段账身份

有回复结果永久 ready/pending 时也计一次；后来 final 引同 ResponseId 只替换所选阶段，不再加一笔。persisted 消息新增合法派生不改原 response usage/cost，不产生模型调用账。没有 reply 的响应直接 final。组合读面验收仍未开始。


## ACK组合验收场景（未执行）

| 场景 | 必须观察到 |
|---|---|
| consumer保存完整原值→ACK→无完整Session实现重复查询 | ACK独立确认；pending清理由runtime继续；released后旧ref/samekey小视图成功；无新provider/HTTP/全文重取 |
| complete+尚pending，两个consumer仅一个有当前ack权 | 当前权核验；read/旧handle无ACK权；有权者可确认，清理不等另一个consumer或处分；跨租户/撤权不泄存在 |
| 进行中的真实读取、闲置handle、observer待送队列并存 | 实际读取受保护完成或明确结束；未开始的全文交付关闭；idle/队列/私有缓存大引用解除；已交consumer副本保留 |
| 原persisted writer先赢/后赢/回执unknown晚提交 | ACK键与final键独立；真实旧writer未停止不释放；小账原值一致，final优先且只计一次；ACK不造处分 |
| 每个retiring/ACK提交/确认/删除前后crash-reopen | 未确认不删；unknown同源完整认回原批；删除状态与内容原子认回；不把Map空/timeout/fence视为停止 |
| ACK released后合法vetoed/consumed及独立persisted | 普通settleReply仍不授persisted；完整retainedResult核原身份/完整语义摘要/账；缺值wrongPhase，改值malformed，权限不可核unavailable |
| 新final首次追加前/unknown后crash | 发前完整原批耐久；unknown保留临时恢复责；确认+writer收束或真实停止+权威无批+政策结束才自动清除，无第二ACK、不复活原ready |
| 旧同creationKey：键重排/数值等值/巨大整数/sourceVersions变化 | 语义等值认回原采用事实与ACK摘要；不同输入creationConflict；不重读最新profile，精确大整数不binary64合并 |
| 原Usage/Cost未知、已知零、迟到补账 | 未知不补零；ACK原账非有效汇总；历史每个failed ResponseId仍单列；补账原算法/归属不变 |
| 两调用共享外部内容 | 只释放当前自有清单/保留权；另一调用及consumer副本不受损；真实外部owner配对解除；纯inline不等虚构provider |

以上是必须交付的真实组合证据，Schema与TLC均不能代替。消息派生扩展、原outputHistory/摘要真实性先行、真实late前缀与当前消息写权的前驱义务持续；ACK不会放宽。
