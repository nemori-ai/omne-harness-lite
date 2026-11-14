# omne-harness-lite-spec-tools

## 总体架构

spec-tools 是开发期的 Python 包，属于根 uv workspace，不是产品运行时依赖。它有两个命令：

| 命令 | 根脚本 | 做什么 |
| --- | --- | --- |
| `omne-docs-check` | `pnpm run check:docs` | 检查全仓 Markdown 的链接与生成的技能镜像 |
| `omne-spec-tools-check` | `pnpm run check:formal-tools` | 检查本机的形式工具环境（Java 与工具 JAR） |

`omne-docs-check --help` 给出参数。`omne-spec-tools-check` 没有参数。包的测试随 `pnpm run test:python` 跑。

## 领域边界

本包拥有：链接与技能镜像的判定，本机形式工具环境的判定。

本包不拥有：

- 规格的生成，行为契约是否完整，设计是否被接受，实现是否符合规格。
- 形式模型的运行与覆盖：环境检查不执行 TLC 或 Alloy，也不证明模型覆盖。
- 设计链自己的身份、冻结与形式任务检查：归 `.meta_harness/tooling`。

消费者：测试运行器的常驻步骤 `check:docs`，以及预检。

## 心智模型

- 链接通过只说明导航是通的，不说明内容是对的。
- 受检仓库从当前工作目录向上找，或由 `--root` 给出，从不取本包的安装位置。

## 应然设计

### 链接检查的扫描范围

- 受检根是 Git 检出的顶层目录时，扫描跳过被 Git 忽略的目录。先用 `git ls-files --others --ignored --exclude-standard --directory` 列出候选，再用 `git check-ignore` 逐个确认，只跳过已确认的目录。
- 受检根不是检出的顶层目录时，不跳过任何被忽略的目录。
- 两种情形都跳过固定排除的目录：`.git`、`node_modules`、`tmp`、`.worktrees` 等。

### 链接的解析

- 共同的 URI 解析拒绝坏编码、`file` URI、逃出受检根的路径与过程材料的别名。
- 二进制图片只核字节。Markdown 必须能按 UTF-8 解码。

### 形式工具环境

环境检查只看本机的 Java 与工具 JAR，逐个报告找到的路径与摘要。它不执行 TLC 或 Alloy。

## 原则与约束

- 依赖在本包的 `pyproject.toml` 声明。根开发组只引用本地 workspace 成员与跨包的开发工具。
- 本包不判断行为与验收，只判断导航与环境。

## 不变式

- 受检根不是检出的顶层目录时，被 Git 忽略的目录照样扫描。
- 环境检查不运行任何形式模型。
