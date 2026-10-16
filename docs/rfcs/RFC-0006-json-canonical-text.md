---
id: RFC-0006
title: JSON 文本的规范写出
revision: 1
status: accepted
owner: PanQiWei
---

# RFC-0006：JSON 文本的规范写出

规则与维护责任见[RFC入口](README.md)。本提案补公共 JSON 的写出方向。读取方向已经由 [RFC-0001](RFC-0001-technical-foundations.md) 和架构页「公共 JSON 文本读取」约定，并由 [json-text 实现接受](https://github.com/nemori-ai/omne-harness-lite/issues/242#issuecomment-6173933512) 固定到当前实现。本提案不重开那次接受。

## 问题与有效输入

协议版本 1 的输入摘要、以及以后要比较的持久 JSON 文本，都要求同一份值每次写出同一串字节。现行正文只约定了不可信文本怎么读。它没有约定已经通过字段 codec 的值怎么规范地写回文本。

`JSON.stringify` 不保证对象键顺序，也不使用 RFC 8785 的数字形式。手写第二套编码器会和读取侧的数字词法分叉。`@omne-harness/json-text` 只读取，不写出。

| 当前要求或承诺 | 核对修订与条款 | 本提案受什么约束 |
| --- | --- | --- |
| [RFC-0001](RFC-0001-technical-foundations.md) revision 4，「严格JSON与数值」 | 读取用 jsonc-parser 3.3.1。禁止 `JSON.parse` 作为严格边界。增量读取必须保留同一拒绝语义 | 本提案不改读取库，不把 visitor 写回已接受实现 |
| [公共 JSON 文本读取](../architecture/cross-cutting-concepts.md#json-text-reader) | 签名、预算、失败顺序、数字保留源词法 | 读取成功之后才运行字段 codec。写出不是读取的逆操作 |
| [json-text 实现接受](https://github.com/nemori-ai/omne-harness-lite/issues/242#issuecomment-6173933512) | 2026-10-15。范围是两个读取函数、公开结果类型、六项预算、失败顺序、扫描器实现和叶子名 | 不含分块读取、规范写出、`stream-json` |
| [存储事务规格](../../packages/storage/docs/storage-contract/SPEC.md)「公开类型」 | 协议版本 1 的摘要输入是命令数组的规范 JSON：键字典序、命令按 participant 排序、无空白、UTF-8 | 排序和空白规则保持。本提案补「规范 JSON」用哪一套写出算法 |

## 建议与改变范围

读取和写出分成两个操作。

读取不可信文本继续用已接受的 `@omne-harness/json-text`。它使用 `jsonc-parser` 3.3.1 的扫描器，不用 visitor，不用 `JSON.parse`。数字留在源词法里。

规范写出只接受已经是 JSON 数据的值。算法用 [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)。对象键按该标准排序。数组顺序保持调用方排好的顺序。空白不进入结果。`undefined`、BigInt、NaN、Infinity、Date 和函数不是 JSON，写出拒绝它们，不自行转换。

存储协议版本 1 先按自己的规则排列命令并拒绝重复的 participant，再把这份命令数组交给 RFC 8785。摘要对写出的 UTF-8 字节做 SHA-256。

实现调用一份 RFC 8785 库。不在 `json-text` 里手写编码器。库的精确包名和版本在实现该成员时钉进 catalog，本提案不提前造这个包。

| 受影响拥有者 | 现行保证或机制 | 拟改变内容 | 必须保持的条件与例外 |
| --- | --- | --- | --- |
| 跨系统表示 | 只约定严格读取 | 增加规范写出算法 RFC 8785 | 读取契约、预算和失败顺序不变 |
| `json-text` | 已接受的读取器 | 不增加写出函数 | 分块读取和增量读取仍不在本次 |
| 存储事务规格 | 规范 JSON 的排序和空白 | 写出算法指向本提案 | 协议版本仍是 `"1"`。改变写出算法才升版本 |

## 实质备选

| 方案 | 如何满足目标 | 代价、风险和失败后果 | 推荐或放弃理由 |
| --- | --- | --- | --- |
| RFC 8785 | 同一 JSON 值得到同一字节串 | 需要一个实现库。非 JSON 值必须在边界拒绝 | 推荐。标准已经定义键序和数字形式 |
| `JSON.stringify` | 调用少 | 键序和数字形式随引擎变化，摘要会裂开 | 放弃。不能当协议版本 1 的写出 |
| 在 `json-text` 手写编码器 | 少一个依赖 | 与 RFC 8785 的数字规则容易分叉 | 放弃。读取器不拥有写出 |
| lossless-json 同时负责读和写 | 一个库两边都有 | 裸用会接受等值重复键。读取侧已经因此不选它 | 放弃。不替换已接受的读取器 |

## 验证与消费者切换

读取侧继续跑 `json-text` 已有测试。本提案不要求重写那些测试。

写出侧在实现成员出现后，用固定向量证明：同一对象的键以不同顺序输入，得到同一字节串；数组顺序变化会改变字节串；NaN 和 BigInt 被拒绝。存储摘要测试只比较 SHA-256，不断言 SQL。

PanQiWei 于 2026-10-15 接受本提案 revision 1。接受之后，规范写出以写回后的技术基础和共同表示为准。

## 决定范围

- 有权决定者：PanQiWei。依据是 2026-10-15 在 #247 执行会话的原话：「正式接受 RFC-0006」。
- 决定日期及对应revision：2026-10-15，revision 1
- 采用范围：建议节的全部写出规则。规范写出使用 RFC 8785。读取继续使用已接受的 `@omne-harness/json-text`。存储协议版本 1 先排列命令，再把命令数组交给 RFC 8785，摘要对写出的 UTF-8 字节做 SHA-256。
- 不采用范围及必要理由：不采用 `JSON.stringify`、在 `json-text` 内手写编码器，或用 lossless-json 替换读取器。不提前创建写出成员，不在本决定里钉 catalog 包名。分块读取和 `stream-json` 仍不在 json-text 的已接受范围。
- 未决与依赖停止点：写出库的包名和版本留到实现该成员时钉进 catalog。库未钉之前，不得把某个包名写成已经采用的依赖。

## 写回现行正文

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换或解除依据及确认者 |
| --- | --- | --- | --- |
| 规范写出采用 RFC 8785 | [技术基础](../architecture/technical-foundations.md)「严格JSON与数值」；[共同表示](../architecture/cross-cutting-concepts.md#表示与校验)；[存储事务规格](../../packages/storage/docs/storage-contract/SPEC.md)「公开类型」的摘要算法句 | 已写回 | PanQiWei，2026-10-15 接受 revision 1。同日写入这三处现行正文 |
| 读取侧保持已接受实现 | [公共 JSON 文本读取](../architecture/cross-cutting-concepts.md#json-text-reader) 与 `packages/common/json-text` | 免除写回 | 读取契约已经写在架构页。2026-10-15 的实现接受不改变该契约 |

## 后继关系与维护

| 后继提案或更正依据 | 部分或全部取代的精确范围 | 当前规范入口 |
| --- | --- | --- |
| 无 | 无 | 读取见架构页「公共 JSON 文本读取」。规范写出见技术基础「严格JSON与数值」和共同表示 |
