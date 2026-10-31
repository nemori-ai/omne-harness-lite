# 对象模型

本文件描述本包内部对象的职责、身份、状态、关联、组合、继承与生命周期。本包是值包，只有类型、一个冻结列表和五个纯函数，没有 class、继承或持久状态，所以下面写实际的值模型和不适用项。

## 对象与关系

本包有三类值。

```text
Modality           = 'text' | 'image' | 'voice' | 'video'
MODALITIES         = 冻结数组，按 text、image、voice、video 的顺序

ModalityJudgment   = { ok: Modality } | { rejected: 'type' | 'modality' }
ModalitiesJudgment = { ok: readonly Modality[] }
                   | { rejected: 'type' | 'modality' | 'duplicate'; index: number | null }
MediaTypeJudgment  = { ok: { mediaType: string; modality: Modality | null } }
                   | { rejected: 'type' | 'media-type' }
```

三个判定结果都是「成功带 `ok`，拒绝带 `rejected`」。这与 `operation-result` 的 `ok`、`failure` 不同。判定结果的拒绝原因是封闭的小集合，不是调用方的失败词汇，所以本包不依赖 `operation-result`，两者各自独立。

`MediaTypeJudgment` 的 `modality` 为 `null` 表示合法的媒体类型不属于任何模态。它不是拒绝。拒绝只用于输入本身不合格。把二者分开，是因为统一语言明确说媒体类型落在四种之外是一种正常情况，例如一份 PDF。

值没有身份。两个判定结果相等当且仅当结构相等。`MODALITIES` 是模块里唯一共享的值，冻结，不可改。

## 生命周期

判定结果由调用方调用函数时创建，之后只读使用，没有变化和销毁责任。本包不持有任何已创建的结果，不缓存，不注册。
