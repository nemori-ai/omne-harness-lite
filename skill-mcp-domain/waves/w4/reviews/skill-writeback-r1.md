# W4 Skill 切片 02 写回评审（review-docs，一次）

- 候选：父分支 `fa572db49`（范围 `4a8e8bbf0..fa572db49`，三份文件）。评审者：general-purpose 只读子代理，Opus 5.5 high，按 `review-docs`。14:09 交回（会话记录）。
- 结论：阻断 1，非阻断 7。三份文件与成员 SPEC 没有冲突的行为陈述。

## 阻断与处置

- `packages/skills/skill-contract/docs/cordis.md:3` 仍把 `skill-cordis-contract` 写成「具名文档目标」「随 Cordis 服务键一同建立」（写回范围外的消费者）。处置：并入本切片，改为现状（`84db0bace`）。复核：`grep -rn "具名文档目标\|尚非 workspace 成员" packages/skills packages/README.md docs/domains/skills --include=*.md` 无输出。单行机械可核的修复，用 grep 读数代替二次评审。

## 非阻断与处置（都在 `84db0bace`）

1. 组工程设计状态行只写三个成员：补 `@omne-harness/skill-cordis-contract` 与它的 SPEC 链接。
2. 领域页「M2 之前……」是排期说法：改为现状「目前这两个端口没有他域的提供者」。
3. 领域页与组工程设计复述「每次调用现取、不写 `inject`」：删去复述，改为引用成员规格。
4. 组入口「原是具名文档目标……」是历史叙述：删去。
5. 组入口「根入口……只指向 `skill-contract`」与成员事实（还依赖 `operation-result`）不符：限定为「在本组成员中只指向」。
6. 成员名裸写 `skill-cordis-contract`：成员表、状态句、依赖段与图、领域页都改为 `@omne-harness/skill-cordis-contract`。
7. 依赖图缺 `skill-host-local` → Cordis 发布包的边：补 `H --> R`。

另：评审列为范围外的 `packages/README.md` skills 行与维护段，同组页一起改（skills 行加 `skill-cordis-contract`；维护段改为「Skill 与 MCP 的成员已有实现（候选），只有 `mcp-cordis-contract` 仍是模板草稿」，MCP 切片 03 再同步）。

`check:docs`：`fa572db49` 与 `84db0bace` 上都 PASS（2825 个 Markdown 文件）。父分支已推送到 `84db0bace`。
