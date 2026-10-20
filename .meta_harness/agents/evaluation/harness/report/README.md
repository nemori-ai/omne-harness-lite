# 报告页生成器

`build-report-lite.mjs` 把一个流的结果目录渲染成一张自包含的 `report.html`，并写出 `trajectory/scores.tsv`。
运行器的 `report` 子命令默认用它：`pnpm run role-eval report <用例集目录>`。只依赖 Node 自带模块，需要 `node` 在 PATH 上。

## 来历

2026-10-01 从 Claude Code 2.1.286 自带的 `claude-api` skill 里原样拷入（原路径 `shared/evals/report/build-report-lite.mjs`，
拷入时的 SHA-256 是 `af79ca5fa5f06747dbcaa1d40017c8c8e81e0aa11cb8e32b848043893cdb03c7`）。原文件没有附带许可声明。
拷进来是负责人定的：评估不该依赖某个宿主装没装那个 skill。**从这一刻起它归本仓库维护**，上游再变不会自动跟进；
要对上游的新版本，拿上面的哈希找到拷入时的那一版再比差异。

## 它读什么

结果目录的布局就是运行器写出的那一套（见[运行器说明](../README.md#留下什么)）：`_state.json` 里的指标定义，
每个变体目录（只认 `baseline` 与 `v<N>`）下的 `results.jsonl`、`errors.jsonl` 与 `traces/`。文件头部的注释是它对输入的全部约定。

它只画 `_state.json` 里的第一个指标；其余指标、区间与花费看 `summary` 子命令。它不渲染 markdown、不内嵌轨迹、
不执行数据里的任何东西，磁盘上读到的每个字符串都转义后才进页面。

文件头注释里的 `.claude/hillclimb/<flow>/` 是上游的默认目录，本仓库不用那个位置。
