---
id: RFC-0010
title: json-text 的值树原样写出
revision: 1
status: accepted
owner: PanQiWei
---

# RFC-0010：json-text 的值树原样写出

规则与维护责任见[RFC入口](README.md)。本提案只改变 [RFC-0006](RFC-0006-json-canonical-text.md) 中「json-text 不增加写出函数」这一项。规范写出仍按 RFC-0006 使用 RFC 8785，不在 json-text 内。

## 问题与有效输入

json-text 把文本读成带 `kind` 的值树（`JsonValue`）。数字留在源词法 `lexeme` 里，对象项保持文本中的顺序。几个成员要把这样的值树写回文本，并要求写出的文本与读入的值一致：

- Tool 把工具参数值树写成文本交给工具，并按写出的字节数执行字节预算。tool-contract 与 tool 今天各有一份手写的值树写出代码。2026-10-17 Tool 在其中一份里修了一个缺陷。
- stream-arrival 为工具调用参数计算步骤指纹。现有的递归 `stable()` 遇到很深的参数抛 `RangeError`。用显式栈的写出函数取指纹可以消除这个错误。
- 模型提供者可能要把工具参数值树写成供应商 API 要求的 JSON 字符串。这一项是推断，尚未有实现。

RFC-0006 的写出方案是 RFC 8785。RFC 8785 输入的是 JavaScript 值：对象键重新排序，数字改写成规范形式，`1.0` 写成 `1`，超出双精度的整数会失去精度。这些消费者要的是原样写回，所以 RFC 8785 不适用。RFC-0006 不让 json-text 写出，理由是手写编码器的数字规则会与 RFC 8785 分叉。原样写出照抄 `lexeme`，不重新格式化数字，所以不存在这种分叉。

| 当前要求或承诺 | 核对修订与条款 | 本提案受什么约束 |
| --- | --- | --- |
| [RFC-0006](RFC-0006-json-canonical-text.md) | revision 1，accepted 2026-10-15，「建议与改变范围」的 `json-text` 行与「实质备选」的「在 `json-text` 手写编码器」行 | 规范写出、存储摘要算法与读取契约保持 RFC-0006 的决定 |
| [公共 JSON 文本读取](../architecture/cross-cutting-concepts.md#json-text-reader) | 读取函数、值树判定函数、预算、失败顺序 | 读取与判定契约不变 |
| [#373 接受](https://github.com/nemori-ai/omne-harness-lite/issues/373#issuecomment-6244619652) | 2026-10-18，revision 2，只含 `judgeJsonValue` | 本提案的写出函数是新增公开面，不改变 #373 的接受范围 |

## 建议与改变范围

JSON 写出分成两个操作：

1. **规范写出。** 同一 JSON 值每次得到同一串字节。按 RFC-0006 使用 RFC 8785 库，不在 json-text 内。用于摘要和持久比较。
2. **原样写出。** json-text 的根入口发布 `writeJsonText(value: JsonValue): string`。它把值树写回文本：
   - 没有空白；
   - `number` 节点写 `lexeme` 原文，不重新格式化；
   - 对象键按 `entries` 的顺序，不排序；
   - 字符串与键按 JSON 字符串转义，孤立代理码元写成 `\uXXXX`；
   - 用显式栈，很深的树不抛 `RangeError`。

原样写出只接受已判定的值树。缺少或不认识 `kind`、字段类型不对、`lexeme` 不合 RFC 8259 数字文法、对象项的键不是字符串时，抛 `TypeError`。重复键、环和共享子树是前置条件，输入违反它们时不承诺行为。写出函数不设大小上限，字节预算由调用者承担。

往返保证：对 `readJsonText` 的任一产出，`writeJsonText` 写出的文本再经 `readJsonText` 读回，值树相等。这条在读出该树所用的同一份 `limits` 内成立，因为写出的文本不比原文长：原文里的每个转义都不比写出的转义短，空白被去掉，数字照抄。

原样写出不是规范写出。两份内容相同但键顺序或数字写法不同的值树，写出的字节不同。需要同值同字节的调用方必须用规范写出。

| 受影响拥有者 | 现行保证或机制 | 拟改变内容 | 必须保持的条件与例外 |
| --- | --- | --- | --- |
| `json-text` | 只读取与判定，不写出（RFC-0006） | 增加 `writeJsonText` | 读取、判定、预算与失败顺序不变；不实现规范写出 |
| [共同表示](../architecture/cross-cutting-concepts.md#表示与校验) | 「读取器不提供写出」 | 写明规范写出与原样写出的分工 | 规范写出仍是 RFC 8785 |
| Tool 的值树写出副本 | tool-contract 与 tool 各有一份 | 改用 `writeJsonText` | Tool 的字节预算与超预算即停仍归 Tool |
| stream-arrival 的步骤指纹 | 递归 `stable()` | 工具调用参数改用 `writeJsonText` 取指纹 | 其余步骤字段的指纹规则不变 |

## 实质备选

| 方案 | 如何满足目标 | 代价、风险和失败后果 | 推荐或放弃理由 |
| --- | --- | --- | --- |
| json-text 发布原样写出 | 一个拥有者，读取、判定与写出用同一套数字文法 | json-text 增加一个公开函数 | 推荐 |
| 各消费者保留自己的写出代码 | 不改 json-text | 至少三份副本；数字写法或键顺序一旦不一致，Tool 的字节数与发出的文本对不上 | 放弃。已经出现过副本缺陷 |
| 原样写出也用 RFC 8785 | 一个写出库 | 数字被改写、键被重排、大整数失去精度，往返不成立 | 放弃。不满足原样写回 |
| 先转成 JavaScript 值再用 `JSON.stringify` | 调用少 | 数字失去源词法，大整数失去精度 | 放弃 |

## 验证与消费者切换

json-text 的测试锁定：输出无空白、数字原样、键序不变、转义与孤立代理、十万层深树、二十万成员宽对象、等长长键线性、与 `readJsonText` 的往返，以及每一类 `TypeError`。

消费者切换：

- Tool 主干把 tool-contract 与 tool 的值树写出改用 `writeJsonText`（事项 O17），字节数改为写出文本的 UTF-8 字节数。
- stream-arrival 的步骤指纹对工具调用参数改用 `writeJsonText`，随消息与流式到达的工具调用部件改动一同交付。
- 模型提供者需要时直接使用 `writeJsonText`。

## 决定范围

- 有权决定者：PanQiWei（RFC-0006 的决定者，json-text 与架构页「公共 JSON 文本读取」的拥有者）。
- 决定日期及对应revision：2026-10-18，revision 1。依据是 PanQiWei 在 #342 Model 主干会话中的原话：「那么就修改 RFC」，针对「json-text 是否拥有原样写出」的待裁定项。本页由该会话代笔。
- 采用范围：「建议与改变范围」全部条款。json-text 发布原样写出 `writeJsonText`；规范写出仍按 RFC-0006。
- 不采用范围及必要理由：无。
- 未决与依赖停止点：无。

## 写回现行正文

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换或解除依据及确认者 |
| --- | --- | --- | --- |
| 原样写出的签名、行为、`TypeError` 与往返保证 | [公共 JSON 文本读取](../architecture/cross-cutting-concepts.md#json-text-reader) | 已写回 | 随 json-text 原样写出的交付同批写入 |
| 规范写出与原样写出的分工 | [共同表示](../architecture/cross-cutting-concepts.md#表示与校验) | 已写回 | 同上 |

## 后继关系与维护

| 后继提案或更正依据 | 部分或全部取代的精确范围 | 当前规范入口 |
| --- | --- | --- |
| 无 | 无 | 架构页「公共 JSON 文本读取」 |
