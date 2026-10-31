# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

`package.json` 的 `exports` 只有一个入口 `.`。`source` 条件指向 [src/index.ts](../src/index.ts)，发布的 `types` 与 `import` 指向 `dist/index.d.ts` 与 `dist/index.js`。没有 `./cordis` 入口，也没有其他子路径。调用者不需要资格：任何需要模态词表或媒体类型识别的能力契约或实现都按包名 `@omne-harness/modality` 导入。

运行时导出恰为六个：`MODALITIES`、`isCanonicalMediaType`、`judgeMediaType`、`judgeModalities`、`judgeModality`、`missingModalities`。另有四个只在类型层存在的导出：`Modality` 与三个结果类型 `ModalityJudgment`、`ModalitiesJudgment`、`MediaTypeJudgment`。[tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查运行时导出，[tests/modality-types.spec-d.ts](../tests/modality-types.spec-d.ts) 检查三个结果类型与对应函数的返回类型相同。

## 定义索引

全部导出都在 [src/index.ts](../src/index.ts)。

| 导出 | 种类 | 行为 |
| --- | --- | --- |
| `Modality` | 类型 | 恰四个字面量，见 [SPEC 四种模态](../SPEC.md#四种模态) |
| `MODALITIES` | 冻结数组 | 四种模态，按 text、image、voice、video 的顺序，见 [SPEC 四种模态](../SPEC.md#四种模态) |
| `ModalityJudgment` | 类型 | `judgeModality` 的结果：`ok` 或 `rejected`，原因 `type`、`modality` |
| `ModalitiesJudgment` | 类型 | `judgeModalities` 的结果：`ok`（冻结数组）或 `rejected`，原因多一个 `duplicate`，另带 `index` |
| `MediaTypeJudgment` | 类型 | `judgeMediaType` 的结果：`ok`（规范形式与模态）或 `rejected`，原因 `type`、`media-type` |
| `judgeModality(value)` | 函数 | 判定一个值是不是模态字面量，见 [SPEC 判定模态](../SPEC.md#判定模态) |
| `judgeModalities(value)` | 函数 | 判定数组、元素已知、互不重复，可以为空，返回新的冻结数组。`index` 指第一个出错元素，非数组时为 `null`。是否要求非空归消费者。见 [SPEC 判定模态](../SPEC.md#判定模态) |
| `judgeMediaType(value)` | 函数 | 按 RFC 9110 文法判定，返回小写的 `type/subtype` 与按顶层类型识别的模态，不属于任何模态时为 `null`。对照表见 [SPEC 判定媒体类型](../SPEC.md#判定媒体类型) |
| `isCanonicalMediaType(value)` | 函数 | 判定成功且规范形式与输入完全相同时为 `true`，见 [SPEC 判定媒体类型](../SPEC.md#判定媒体类型) |
| `missingModalities(required, available)` | 函数 | `required` 中不在 `available` 里的模态，按 `MODALITIES` 顺序、去重、冻结，见 [SPEC 求缺失的模态](../SPEC.md#求缺失的模态) |

失败行为：判定函数对普通值不抛出异常，被拒绝的输入以带 `rejected` 的值返回。输入自身的 getter 或 Proxy 抛出的错误，以及引擎资源耗尽，原样传出。见 [SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期)。拒绝原因集合按函数不同，由上表的结果类型给出。
