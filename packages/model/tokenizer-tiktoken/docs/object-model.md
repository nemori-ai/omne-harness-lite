# 对象模型

本文件描述本包内部对象的职责、身份、状态、关联、组合、继承与生命周期，配类图。它不强迫实现改成 class；纯函数或值包写实际模型与不适用项。

## 对象与关系

本包没有类层次。对象都是普通值与闭包：

```mermaid
classDiagram
  class TiktokenResources {
    definition: TokenizerDefinition
    ranks: TiktokenRanks
    specialTokens: Record~string, number~
  }
  class TiktokenRanks {
    patStr: string
    specialTokens: Record~string, number~
    bpeRanks: string
  }
  class ModelTextTokenizer {
    definition: TokenizerDefinition
    count(segments)
  }
  class Tiktoken
  TiktokenResources --> TiktokenRanks
  ModelTextTokenizer --> Tiktoken : 闭包持有
  ModelTextTokenizer --> "特殊 token 名集合" : 闭包持有
```

- `TiktokenResources` 与 `TiktokenRanks` 归调用方。本包只在初始化时读取它们。
- 返回的 tokenizer 是冻结的普通对象。`definition` 是传入定义的冻结副本。`count` 是闭包，持有 js-tiktoken 引擎与特殊 token 名集合。tokenizer 没有身份字段，两个 tokenizer 用 `definition` 区分。

## 生命周期

- 创建：`createTiktokenTokenizer` 在三项核对成立后创建引擎与 tokenizer。
- 变化：tokenizer 创建之后不变。调用方修改传入的资源，不影响它。
- 销毁：没有需要释放的资源。调用方丢弃引用后，由垃圾回收释放内存。
- 进程级状态：`engine-version.ts` 缓存一次读取结果，进程结束时消失。
