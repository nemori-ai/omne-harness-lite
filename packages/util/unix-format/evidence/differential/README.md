# 与 Python 原实现的差分证据

本目录固定 TypeScript 移植与 `omne-next` 原实现的逐字节比对基线。

| 项 | 值 |
|---|---|
| 原实现 | `omne-next` 提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5` 的 `omne_core_v1/libs/omne_core_v1/omne_core_v1/data_model/unix_format/` |
| 基准生成 | 在该检出的虚拟环境中执行 `python golden.py > golden.json`（2026-09-14） |
| 比对方式 | [tests/differential.spec.ts](../../tests/differential.spec.ts) 用同名 fixture 调用各渲染函数，与 `golden.json` 逐字节相等；fixture 名单与基准名单必须一一对应 |
| 结果 | 51 例全部相同 |

覆盖三种信封（含空串 hint 与空步骤）、段落的两种标题与空行缩进、usage、命令
列表（含空 synopsis 与表情对齐）、表格的列宽、溢出收缩、无法收缩、默认封顶、
不封顶与 CJK、键值、bullet，以及行号块的槽宽、绝对起始、截断、封顶与码位计数。

未纳入比对的是 README 差异表中的接口形态差异（选项对象、`maxWidth` 单入口、
`Map` 支持）和新增的参数校验报错，由各单元测试单独固定。重新生成基准需要能
导入 `omne_core_v1` 的 omne-next 检出；`golden.json` 入库后，`pnpm test`
不依赖该检出即可持续核对移植未偏离基线。
