# omne-harness-lite-spec-tools

开发期 Python 工具包，属于根 uv workspace，负责文档导航检查与形式工具环境检查。
它不是产品运行时依赖。源码与测试归本包。

本包只查链接、技能镜像与本机的形式工具环境。它不生成规格，也不判定行为契约是否完整、设计是否被接受或实现是否符合规格。

## 使用与开发

`pnpm run check:docs`、`pnpm run check:formal-tools`、`pnpm run test:python` 提供单项入口。
也可从仓库根显式选择成员：

```sh
uv run --locked --package omne-harness-lite-spec-tools omne-docs-check
uv run --locked --package omne-harness-lite-spec-tools omne-spec-tools-check
uv build --package omne-harness-lite-spec-tools --out-dir .dist/spec-tools
```

涉及仓库材料的命令默认从当前工作目录向上定位受检仓库，
也接受 `--root PATH`，不会把安装位置当作受检仓库。

`check:docs` 的扫描范围按受检根区分：

- 受检根是 Git 检出的顶层目录时，扫描跳过被 Git 忽略的目录。
  工具分两步取得这些目录：先用 `git ls-files --others --ignored --exclude-standard --directory` 列出候选，
  再用 `git check-ignore` 确认每个候选。只跳过已确认的目录。
- 受检根不是检出的顶层目录时，扫描不跳过任何被忽略的目录。

不论受检根是哪一种，固定排除的目录（`.git`、`node_modules`、`tmp`、`.worktrees` 等）都照常跳过。
环境检查仅检查本机 Java/JAR。

共同 URI 解析拒绝坏编码、file URI、根逃逸及过程材料别名。二进制图片只冻结字节；Markdown 必须可按 UTF-8 解码。

在本成员目录运行 `uv run --locked pytest` 检查包测试；根测试还覆盖 skill 生成器。
依赖在本包声明，根开发组只引用本地 workspace 成员和跨包开发工具。
