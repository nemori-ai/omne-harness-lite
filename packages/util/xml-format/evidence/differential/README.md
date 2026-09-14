# 与 Python 原实现的差分证据

本目录固定 TypeScript 移植与 `omne-next` 原实现的逐字节比对基线。

| 项 | 值 |
|---|---|
| 原实现 | `omne-next` 提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5` 的 `omne_core_v1/libs/omne_core_v1/omne_core_v1/data_model/xml_format/` |
| 基准生成 | 在该检出的虚拟环境中执行 `python golden.py > golden.json`（2026-09-14） |
| 比对方式 | [tests/differential.spec.ts](../../tests/differential.spec.ts) 用同名 fixture 调用 `formatXml`，与 `golden.json` 逐字节相等；fixture 名单与基准名单必须一一对应 |
| 结果 | `same` 组 47 例全部相同；`diff` 组 1 例（`Date` 默认渲染）按文档差异 |

`same` 组覆盖三种呈现、`includeWhen` 三种条件、标量与数组、对象项的默认放置与
`itemFields`、自渲染对象、`Map`/记录、点号路径、`omitRootTag`、`manualAttributes`、
缩进、转义、`attrs`，以及 system reminder 信封与伪造正文。

未纳入比对的是 README 差异表中有意不同的行为：`not_default`、时区选项、
未知字段名与非法名称的报错、可选字段的确定顺序、嵌套 `toXml` 的选项裁剪、
以及 `Date` 的 ISO 拼写（Python `isoformat()` 给 `+00:00`，JS `toISOString()`
给 `.000Z`）。这些由 [tests/format.spec.ts](../../tests/format.spec.ts) 单独固定。

重新生成基准需要能导入 `omne_core_v1` 的 omne-next 检出；`golden.json` 入库后，
`pnpm test` 不依赖该检出即可持续核对移植未偏离基线。
