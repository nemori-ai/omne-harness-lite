你接到一项独立验收任务。首先进入下面给出的检出目录并核对它确实是你的工作位置，然后按本说明执行。
本次没有可以提问的派发者在线：标准写不成可观察结果或环境不满足时，按你的角色规定处置并在报告里写明。

## 交付增量的坐标

- 任务 ID：{TASK_ID}（run {RUN_ID}）；验证者身份 `tui-qa`
- 被测应用：治理 CLI/TUI，成员 `apps/cli`
- 干净检出：`{WORKDIR}`。这是一份独立检出，版本历史只有一个基线提交；提交坐标用 `git rev-parse HEAD` 取
- 构建方式：已由派发方在该检出内完成（`pnpm install --frozen-lockfile --offline` 与 `pnpm build`）；被测制品是 `apps/cli/dist/`，入口 `node apps/cli/dist/main.js`。不要重新构建，不要改动 `dist/`
- 变更范围：单次治理命令的非交互入口与机读通道，以及 `tui` 入口的非 TTY 准入
- 实现者的测试与完成声明没有随检出提供

## 本次验收范围

只判下面十条标准。治理 TUI 的交互界面（终端矩阵、宽字符、resize、退出还原、scrollback、输入法与粘贴）**不在本次增量范围内**：本环境没有受支持的终端模拟器，这几关列入「未覆盖」并写明原因即可，不影响本次判决。
本环境没有治理中心服务：凡需要中心才能观察的行为不在本次标准内。

## 验收标准

契约坐标均指 `.meta_harness/design/spec/compositions/governance-cli-entry/` 下的 `v1/contract.md`（CQ1）与 `v2/contract.md`（CQ2）。机读报告的形状见 CQ1 S-6 与 `.meta_harness/design/spec/compositions/governance-client-operations/`。

| ID | 来源 | 触发 | 可观察结果 |
|---|---|---|---|
| C1 | CQ1 S-2 | 无参数、`--help`、`--version`，输出经管道 | 退出 0；输出进程说明；不创建状态目录 |
| C2 | CQ1 S-6 | 人读命令（不带 `machine`），标准输出不是终端 | 明确拒绝：stderr 为 `omne: tty-required`，stdout 为空，退出 2；不创建状态目录 |
| C3 | CQ1 S-2、S-6 | `machine` 命令带未知选项、重复选项、额外位置参数、未知命令 | stderr 为封闭诊断代码；stdout 恰为一份未发起报告；退出 2；不创建状态目录 |
| C4 | CQ1 S-2 | `machine --help`、`machine --version` | 以输入不合报告；stdout 只有 CG 文档，不输出进程说明 |
| C5 | CQ1 S-3 | `--payload-file` 指向：重复成员、小数、指数写法、越界整数、非对象、尾随内容 | 每种都以 `invalid-json` 拒绝，报告为未发起、输入不合；载荷片段不回显 |
| C6 | CQ1 S-3 | `--payload-file` 指向：带 BOM 的文件、非法 UTF-8 | 每种都以 `invalid-encoding` 拒绝，报告为未发起、输入不合 |
| C7 | CQ1 S-2 | 载荷文件里出现该命令的秘密成员（值为 null 或空串也算） | 以 `secret-source` 拒绝 |
| C8 | CQ1 S-6 | 任一 `machine` 调用 | stdout 是恰好一行、以换行结束的合法 JSON 文档并符合报告 Schema；诊断只到 stderr 且只含封闭代码 |
| C9 | CQ2 S-2 | `tui --terminal-profile xterm-379`，标准输入输出不是终端 | 明确拒绝、不静默降级：stderr 为 `omne: tty-required`，stdout 为空，退出 2；`tui --help` 退出 0、说明里指出 machine 入口且不创建状态目录 |
| C10 | CQ1 S-5、S-6 | 全新状态目录下 `machine center health` | 报告为未受理、原因未配置，远端未发起；退出 2 |

## 启动方式与环境

- 命令：`node apps/cli/dist/main.js <参数>`，工作目录为检出根
- Node 24、Linux；locale 用 `C.UTF-8`；环境变量除 `PATH`、`HOME`、`LANG`/`LC_ALL` 外不依赖其他
- 状态目录：每个场景用 `--state-dir` 指向操作系统临时目录下你新建的绝对路径，其父目录须已存在；不使用默认的 `$HOME/.omne-harness-lite`
- 不连接任何后端；没有测试账号与租户

## 可写目录

- 验收场景：`apps/cli/acceptance/`
- 证据与报告：`tmp/qa/{RUN_ID}/`（`report.md` 与 `report.json` 放在这里）

## 可用的验证设施

shell、`node`、管道与重定向、`script`（伪终端）。没有无头终端驱动、替身后端与故障注入入口。

## 预算

重试上限 3 次；探索时间盒占总预算两成以内。

## 报告格式补充

`report.json` 除你的角色要求的四项外，给出 `verdict`（四态之一的英文原文）与 `criteria` 数组；数组每项是 `{ "id": "C1", "result": "pass" | "fail" | "not-run" | "unstable" }`，十条标准各一项。
