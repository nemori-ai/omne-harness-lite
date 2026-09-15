# TS/JS 统一格式化验证证据

HUB 已完成整合与根锁更新，当前结果见 [HUB 汇总](hub-summary.json)：
`4a5031d` 的冻结安装和完整 `pnpm check` 通过，包含 16 包独立产物与实际组合。
下面保留作者 spoke 的原始执行事实；其中“需由 HUB 更新锁”的后续动作已完成。

本记录验证 `de39a862614420da0d63b81e81d0013b6ebc2749` 上实施的格式化工具纵线。
实现提交为 `8f2e2c3f364d78b8808e09b7655f986008d48151`，纯机械格式化提交为
`55e9fad235e1c566420e82b2e79766cca919275d`，编辑器、真实 hook 与范围补强提交为
`99a6988cdee398f23f7f6ce28617b33da01f4917`。本记录只支持工具、范围和本次源码状态；
它不是架构接受结论，也不把本地 workflow 静态检查表述为 GitHub 托管运行。

## 环境与固定输入

- 最终记录时间：2026-09-14T05:49:53Z；Linux；Node `v24.18.0`；pnpm `10.28.1`；
  Python `3.12.13`。
- Prettier `3.9.6`，从官方 npm registry 查询；tarball integrity 为
  `sha512-OpN0zzVdiaiAhxpuuj5efpIS4sY9j7bY6uR5mnj5yPzGkdkjNKSJeUThPb60Jw29QuAZgA4o+/iB49kFiaBX6g==`。
- 本地准备实际使用 `pnpm install --ignore-scripts --lockfile=false`，没有运行依赖脚本，
  也没有改写 `pnpm-lock.yaml`。该锁文件 SHA-256 仍为
  `ede6eb94353b6ec5bb905aaa0f98fb0520cdbd6f8648bbdb0d20e2ade471bb18`。
- 根配置 SHA-256：`.prettierrc.json`
  `51c46350e88126103a0c240d8c8107e32c7c49975aef2946f480bd7c8a7e0a4a`；
  `.prettierignore`
  `76862d1a6ae7cdb7ba31983461adb8d86371c69659dd1a02718390fb15a0fb93`；
  `.editorconfig`
  `e488863a954e57c18616ed61713864beec06d8402e856744f41acf8442b7cc4a`。
- 任务输入快照的 Git blob：implementation README `4ba8172`、scope `931f2d6`、
  acceptance `11bd43b`、implementation-spec `7e9c28d`、plan `40e2188`、workspace
  `a0fa21b`、verification `999c7f1`。

## 验收对应

| 验收面 | 实际判据与结果 | 原始证据 |
|---|---|---|
| RED→write→GREEN 与幂等 | 固定基线的默认检查退出 1，列出 102 个文件；write 后 `pnpm format:check` 通过；第二次 write 前后 diff SHA-256 均为 `8f8cb84aac2dc34c2b9af6b9b9fd700b2d05bff89eb2b7d209270b4dacedec02` | [baseline-format-red.log](baseline-format-red.log)、[final-product-check.log](final-product-check.log) |
| 默认范围与排除边界 | 默认选择 `packages/`、`apps/`、`tools/`、`scripts/` 下的 TS/JS 与所属配置，以及根 TS/测试配置。本次机械提交修改其中 102 个已有文件；没有修改 `spec/`、`upstream/`、provenance 或 JSONL。独立夹具验证通用 `tools/*` TS、根 `tsconfig.test.json`、空格路径和显式越界路径 | [formatted-files.txt](formatted-files.txt)、`pnpm test:format` 输出见 [final-product-check.log](final-product-check.log) |
| 指定文件命令 | `pnpm format:write -- packages/model/llm/src/message.ts` 使用同一脚本和配置；适配器拒绝范围外或不存在的文件。写权限仍由调用者按任务进一步收窄 | [test-formatting.sh](../../../../../../scripts/test-formatting.sh) |
| index 与提交前检查 | 临时独立 Git 仓库分别构造“index 已格式化、worktree 未格式化”和反向情况；直接适配器前者通过、后者阻止，且两侧 hash 均未变化。随后安装真实 hook，通过 `git commit` 再证明未格式化 index 被拒绝、格式化 index 可提交且不同 worktree 副本保持未暂存。空匹配通过，空格路径可查，安装器重复安装幂等并拒绝覆盖不同 hook | [final-product-check.log](final-product-check.log)、含原 index/blob 与 worktree SHA-256 的 [hook-test-trace.log](hook-test-trace.log) |
| 编辑器与 CI | VS Code 推荐项按[扩展官方说明](https://github.com/prettier/prettier-vscode#prettierprettierpath)显式指定模块目录 `./node_modules/prettier`，禁止全局解析，并由测试核对该目录实际版本为 3.9.6；本地依赖缺失时指定路径加载失败。workflow 使用 Node 24、pnpm 10.28.1、冻结安装和 `pnpm format:check`，只读仓库且不写提交 | 本地文件由 `pnpm format:check` 覆盖；没有执行真实编辑器保存或 GitHub 托管 job。未信任 workspace 会按 VS Code 安全策略禁用本地模块设置，不属于可验证保存环境 |
| 机械格式化前后业务行为 | 基线和格式后状态均完成构建、严格类型、包测试、package-checks 13 项自测、15 个隔离 tarball 消费与实际组合，结果一致 | [baseline-product-check.log](baseline-product-check.log)、[final-product-check.log](final-product-check.log) |
| Python 与文档回归 | Python 工具 77 项测试通过；文档检查 404 个 Markdown 文件通过 | [final-python-tests.log](final-python-tests.log)、[final-make-check.log](final-make-check.log) |

## 局限与整合要求

本 spoke 未获准修改 `pnpm-lock.yaml`。因此当前分支上的
`pnpm install --frozen-lockfile --ignore-scripts` 按预期退出 1，明确报告根 manifest 新增
`prettier@3.9.6` 而 lock 不匹配；HUB 整合者必须更新统一锁文件，再验证冻结安装和
workflow 使用的同一命令，原始输出见
[integration-lock-required.log](integration-lock-required.log)。

`make check` 的 docs-check 已通过，但总命令在 spec-check 停止：环境未设置
`JAVA_BIN`，12 个 formal task 都明确报告工具缺失，随后步骤由本次单独命令覆盖。
这是未执行的形式模型环境范围，不是格式化通过证据，详见
[final-make-check.log](final-make-check.log)。本任务没有安装共享 Git hook，没有运行
真实编辑器保存动作或 GitHub workflow，也没有修改冻结规格、上游原件、来源映射和
黄金数据。

机器可读摘要和各日志 SHA-256 见 [results.json](results.json)。
