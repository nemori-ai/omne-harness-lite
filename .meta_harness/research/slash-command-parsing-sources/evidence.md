# 可复核的来源与观察

来源多、需要分别核对，本页退为索引；逐条观察（路径、行号、原文、支持范围）在 `notes/` 五份笔记里。
结论见 [research.md](research.md)，论证与对照表见[当轮报告](reports/2026-09-23-slash-command-parsing.md)。

## 取证条件总览

| 来源 | 精确对象与版本 | 取得方式 | 来源立场与强度 | 笔记 |
|---|---|---|---|---|
| **Codex** | openai/codex `5c5308fc9a9ee789049d646ef11e5400384b9c6f`；官方文档离线副本 `codex-docs-2026-09-20` | 主检出钉住的 `tmp/sources/codex-5c5308f.tar.gz` **不含 TUI**；TUI 等路径从本机另一份同 SHA 克隆 `git archive` 到任务 scratchpad（归档 sha256 `6cc8bce3…7aae`），与钉住 tarball 的共有路径逐文件 `diff -rq` 一致；文档副本在主检出 `tmp/sources/codex-docs-2026-09-20.tar.gz` | 厂商源码与文档（自述）；GitHub issue（独立用户报告 + 维护者回复）。**TUI 源码本身没有钉存字节**，复现要靠任一 openai/codex 克隆 | [notes/codex.md](notes/codex.md)（CX-1 … CX-12） |
| **Claude Code** | `2.1.280`（`claude --version`；二进制 sha256 `1e08503d…925b`） | ① 官方文档 2026-09-23 `curl -sL` 原样字节，钉存于本包 [`sources/`](sources/provenance.json)（`SHA256SUMS` 同目录；hooks 页复用同程 topic 的钉存字节）；② 本机二进制 `strings -n 6` 字符串探针；③ 本机会话记录 `~/.claude/projects/**.jsonl` 结构字段；④ GitHub issue | ① 厂商自述；② 厂商产物，但只有字符串，不是源码；③ 本机实际运行留下的记录，只覆盖用过的命令，部分样本为 2.1.227；④ 独立用户报告 | [notes/claude-code.md](notes/claude-code.md)（CC-1 … CC-11） |
| **DSH** | deepseek-ai/deepseek-harness `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`） | 主检出 `tmp/sources/dsh-c291e79.tar.gz`（sha256 `f08cfc86…0860`）解包 `tmp/sources/extracted/dsh/` | 上游源码 + README + `.agents/notes/`（作者自述）；未检索 issue tracker | [notes/dsh.md](notes/dsh.md)（DS-1 … DS-8） |
| **omne-next** | `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5` | 本机 `/data/qiwei/repos/omne-next`（HEAD 核对一致、工作树无改动；路径不钉） | 本项目前身的代码与自述设计；命令框架整体未交付 | [notes/omne-next.md](notes/omne-next.md)（ON-1 … ON-5） |
| **pi** | earendil-works/pi `3390bd93630965a12a0a1a5c36ce890ec22f7e1d` | 主检出 `tmp/sources/pi-3390bd9.tar.gz` 解包 `tmp/sources/extracted/pi/` | 上游源码；只作对照 | [notes/pi.md](notes/pi.md)（PI-1、PI-2） |

## 钉存字节的校验与恢复

```sh
cd .meta_harness/research/slash-command-parsing-sources/sources
sha256sum -c SHA256SUMS          # 六份 .txt 与 provenance.json
# 重新抓取对比（页面会随上游更新，差异本身就是「版本失效」的信号）：
curl -sL https://code.claude.com/docs/en/slash-commands.md | sha256sum
```

`provenance.json` 记每份页面的上游 URL、抓取方式、页面内出现的最高版本注记与目标 sha256。
`slash-commands.md` 与 `skills.md` 同日返回逐字节相同的内容，只存一份。

## 冲突与分叉（按「文档说的不等于实现做的」逐处记）

| 对象 | 文档说法 | 实现 / 实测 | 本包取哪边 | 记录 |
|---|---|---|---|---|
| Codex custom prompts | 官方文档仍描述 `/prompts:<name>`（已标 deprecated） | `5c5308f` 代码里没有加载路径；维护者评论「deprecated and removed」 | 代码 | CX-7 |
| Codex 内建清单 | 文档表有 `/sandbox-add-read-dir`、`/personality`、`/agent` | 枚举里没有；枚举另有 `/recap /worktree /voice` 等 | 代码 | CX-11 |
| DSH 未知 `/xxx` | 注册表 README 与 2026-07-19 决策记录：适配器拒收，不变成 prompt | Web 客户端：无人认领即默认发送为 prompt | 代码 | DS-4 |
| DSH skill 手势位置 | tool-skill 源码注释：「first line starts with `/<name>`」 | 实现与 README：任意位置 | 代码 | DS-2 |
| omne-next 路径 | 设计：`/usr/bin` 须有字面发送路径 | 分类器代码把 `/usr/bin/…` 认作命令名 | 分别陈述（设计无实现） | ON-1、ON-4 |
| Claude Code 补全 vs 执行 | —— | 用户报告：补全只在第 0 字符弹出，执行却认第二行的命令（#89398，未复现） | 记为未核对 | CC-1 |

## 负面结论的强度

| 负面结论 | 强度 | 依据 |
|---|---|---|
| Codex `5c5308f` 没有用户定义的 `/` 命令 | 读遍未找到（`slash_commands.rs` 的菜单项类型只有两种；`grep "prompts:\|custom_prompt"` 只命中无关组件）+ 维护者评论 | CX-7 |
| Codex 的协议与内核没有斜杠命令概念 | 读遍未找到（`grep -rn slash` 于 `protocol/src`、`core/src`、`app-server-protocol/src`） | CX-1 |
| DSH 本 SHA 没有终端 TUI 的 `/` 适配器 | 读遍未找到（探针 `commands/change`、`remote.commands`、`ctx.commands`、`parseCommand`） | DS-4 |
| Claude Code 文档未覆盖「项目 skill 与非 skill 内建命令同名」 | 读遍未找到（skills 页同名表、同步 skill 让位段、命名规则段），未做实验 | CC-5 |
| 本轮没有任何一条负面结论是「构造反例验证过」的 | —— | 全部为只读取证 |

## 后续核对

- 上游升级时，grep 本页与 `notes/` 里的版本 token（`5c5308f`、`2.1.280`、`c291e796`、`6263fed`、`3390bd9`）找出需重核的记录。
- Claude Code 文档页重抓后 sha256 变化即说明页面已更新；先比对 `v2.1.` 注记的最高版本，再判断是否触及结论。
