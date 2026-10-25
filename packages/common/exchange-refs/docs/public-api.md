# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

`package.json` 的 `exports` 只有一个入口 `.`。`source` 条件指向 [src/index.ts](../src/index.ts)，发布的 `types` 与 `import` 指向 `dist/index.d.ts` 与 `dist/index.js`。本包没有 `./cordis` 入口，也没有其他子路径。调用者不需要资格。

根入口没有运行时导出，由 [tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查。三个导出都只在类型层存在。

## 定义索引

三个导出都在 [src/index.ts](../src/index.ts)。

| 导出 | 种类 | 含义 |
| --- | --- | --- |
| `Adoption` | 类型 | [SPEC Adoption](../SPEC.md#adoption) |
| `DurableEvidence` | 类型 | [SPEC DurableEvidence](../SPEC.md#durable-evidence) |
| `ConsumerRef` | 类型 | [SPEC ConsumerRef](../SPEC.md#consumer-ref) |

失败行为：本包没有运行时代码，所以没有失败结果。值不合格时由接收域的判定拒绝，见 [SPEC.md](../SPEC.md#ownership)。
