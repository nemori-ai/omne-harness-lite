# examples

本目录承载面向真实公开入口的使用示例。

## 允许的内容

可运行的示例代码与说明。

## 边界

示例只用公开入口，并写明运行前提。示例不代替测试或规格。

## 维护

公开入口变化时，同步示例并确认它仍能运行。

## 本包事实

[inspect-directory.ts](inspect-directory.ts) 对一个目录取快照，读 `SKILL.md` 与 `.omne/skill.json`，再交给 `parseSkillPackage`，打印定义、来源失败或第一个拒绝原因。不给参数时它检查 [sample-skill/](sample-skill/)。在成员目录先运行 `pnpm run build`，再运行 `node --experimental-strip-types examples/inspect-directory.ts [目录]`。成功时退出码为 0，失败或拒绝时为 1。`pnpm run typecheck` 也检查示例。
