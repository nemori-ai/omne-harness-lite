# 随包保存的原件

本目录是**当轮取证的原始产物**，保存在这里的唯一理由是：正文与报告里引用了它们，
而它们的来源要么会漂移（网页），要么需要重新跑一遍才能得到（命令输出、二进制解包）。
**它们不是结论**；结论在 [research.md](../../research.md)。

| 文件 | 是什么 | 怎么产生的 |
|---|---|---|
| `codex.txt` `codex-exec.txt` `claude.txt` `cursor-agent.txt` `kimi.txt` | 四家 CLI 的 `--help` 原文（codex 另含 `exec` 子命令） | 2026-09-21 本机实跑 `<bin> --help`，stdout+stderr 合并重定向 |
| `measure-raw.txt` | 启动耗时与峰值 RSS 的原始输出 | [`../measure.sh`](../measure.sh) 一次完整运行 |
| `measure-footprint.txt` | 体积、文件数、`ldd`/`objdump -T`、随包工具版本的原始输出 | 同日手工命令序列，内容已在[本机实测报告](../2026-09-21-本机实测.md)逐条转述 |
| `kimi-extract-sea.py` | 从 Kimi 二进制的 `NODE_SEA_BLOB` NOTE 段解出 `main.cjs` 与 209 个资产的脚本 | Kimi 那一路自写；**它是该路证据从二手跃到一手源码级的手段，值得随包留存** |
| `kimi-region.py` `kimi-sea-assets.json` | 按 `//#region` 定位 bundle 模块的辅助脚本；SEA 资产清单 | 同上 |
| `pi-blog-mariozechner-2025-11-30.txt` | Pi 作者 2025-11-30 博客全文纯文本（573 行） | 2026-09-21 抓取。**保存原因：它是 Pi 那一路"作者自述"的唯一一手来源，而外部 URL 会失效** |

校验和见 `SHA256SUMS`（`sha256sum -c SHA256SUMS` 可核）。
**这些文件按取得当日的状态冻结，后续轮次不要原地覆盖**——重新取证就另起一份带日期的文件。

## 落盘后的路径映射

七份报告是**当轮原貌，落盘后未改写一个字**。它们里面提到的路径是**取证当时**的工作区路径，
其中有些已随任务区清理而不存在。对照如下：

| 报告里写的路径 | 落盘后在哪 |
|---|---|
| `tmp/research-cli-tui/help/*.txt` | 本目录 `./*.txt` |
| `tmp/research-cli-tui/scratch/kimi-*.{py,json}` | 本目录同名文件 |
| `tmp/research-cli-tui/scratch/pi-blog-mariozechner-2025-11-30.txt` | 本目录同名文件 |
| `tmp/research-cli-tui/measure-raw.txt` / `measure-footprint.txt` | 本目录同名文件 |
| `tmp/research-cli-tui/reports/<家>.md` | `../2026-09-21-<家>.md` |
| `tmp/research-cli-tui/src/codex` | **已删除**（159 MB）。重取：`git clone --depth 1 https://github.com/openai/codex.git` 后 `git fetch origin 774d64258260f94628cc9fc55cfabd59a668571c` |
| `tmp/research-cli-tui/src/pi` | **已删除**。重取：`git clone --depth 1 https://github.com/earendil-works/pi.git` 后取 `890f920884f6d21fc7617d236ef9e1cc5d7a0ef8` |
| `/tmp/deepseek-harness` | 会话外的只读副本，commit `c291e7961a515f6d7af9304e7fd1d257929aef26` |

两份源码副本没有随包保存，因为它们可由记录在案的 commit SHA 精确重建，
而本目录的文件不能——命令输出与二进制解包产物只有重跑才有。
