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

[directory-journey.ts](directory-journey.ts) 用三个 Skill 成员的公开入口走完一次旅程：对根目录下的每个包目录 `inspect`，再在读取判定与对应端口的替身上建目录与读取，列出读者能读的摘要，按说明检索，读第一个命中的正文第一页。替身由调用方经 `standIns` 给出，示例自己不造：读取权与合法集合归真实集成方，示例不是产品装配。它作为测试 [tests/examples.spec.ts](../tests/examples.spec.ts) 运行：在成员目录先 `pnpm run build`，再 `pnpm test -- examples`；测试用 `@omne-harness/skill-contract/testing` 的内存替身与一个 `mkdtemp` 临时目录（两个合法包、一个非法包）。
