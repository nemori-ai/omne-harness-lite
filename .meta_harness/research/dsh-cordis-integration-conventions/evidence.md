# 可复核的来源与观察

## E1　DSH 源码归档

- 消费对象：[research.md](research.md) 约定表的全部出处、「`dsh-scope` 两处文档说法相反」。
- 来源与精确修订：deepseek-ai/deepseek-harness master `639ed015397290b3745d163aafe02ffee4aa3f84`
  （提交时间 2026-09-29T17:21:31+08:00，「Merge pull request #5479 … release-dsh-0.2.0-rc.2」；根 `package.json` 的 `version` 为 `0.2.0-rc.2`）。
- 来源立场：DSH 团队自己的约定、文档与脚本，即作者自述；它们说明 DSH 宣称并（部分）检查了什么，不说明这些约定的效果。
  DSH 自己承认或可观察到的缺口，在约定表 #15～#17 与「`dsh-scope` 两处文档说法相反」里如实列出。
- 取得方式：2026-10-02 `git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git` 后，以 git 2.25.1
  `git archive --format=tar.gz 639ed015397290b3745d163aafe02ffee4aa3f84` 归档为主检出 `tmp/sources/dsh-639ed01.tar.gz`
  （被 Git 忽略的本机副本），sha256 `1781486d61eea19975b1221042148dfd4259e8561ba23f9ec0c4f3f66e85f7b6`；同日重跑一次得同一哈希。校验：

  ```
  cd tmp/sources && grep dsh-639ed01 SHA256SUMS | sha256sum -c -
  ```

  约定表的每一行出处都在解开的归档里用 `sed -n '<行>p' <文件>` 逐行核过（2026-10-02，主线自核，不是 subagent 转述）。
- 实际观察：见 research.md 约定表；负面结论（#7「未找到成文的事件命名规则」、#15「包级没有方向规则」）列明了检索过的位置与关键词。
  #15 起初只检索了工具名（`dependency-cruiser`、`madge` 等）而误判为「没有任何包级检查」，按 `scripts/` 文件名二次检索后找到
  `verify-module-graph`、`verify-package-dependencies`、`verify-optional-dependency-imports`、`verify-client-domain-graph` 四项，逐个读了脚本头部后改为现在的表述。
- 支持范围：只支持 `639ed015` 这一版的文字与脚本；不支持「DSH 的运行时行为与文档一致」——本 topic 没有运行 DSH，也没有读 `dsh-scope` 的实现。
- 后续核对：DSH 升版后，grep 本页与 research.md 里的 `639ed015`，命中的出处逐行重核。

## E2　本仓库所装 Cordis 的来历

- 消费对象：research.md「本仓库所装的 `@deepseek-ai/cordis` 4.0.4 就是 DSH vendor 并发布的那份」。
- 来源与精确修订：DSH `639ed015`；本仓库主线 `a68f1558b`。
- 取得方式与实际观察：
  - DSH 侧：`vendor/cordis/package.json` 第 4 行 `"version": "4.0.4"`，`repository` 为 `git+https://github.com/deepseek-ai/deepseek-harness.git`、`directory: vendor/cordis`；
    `vendor/README.md` 第 17 行记上游为 cordiverse/cordis `packages/core` 的 4.0.0-rc.7、提交 `56b3d4f725681cf4556c1a8695a709cc3b6eed74`；
    第 29～57 行「Local modifications」共 22 条，覆盖整个 vendor 集合（`cordis`、`loader`、`include`、`hmr` 等）。
  - 本仓库侧：`pnpm-workspace.yaml` 第 12 行 `'@deepseek-ai/cordis': 4.0.4`；`pnpm-lock.yaml` 解析出 `@deepseek-ai/cordis@4.0.4`；
    安装后的 `node_modules/.pnpm/@deepseek-ai+cordis@4.0.4*/node_modules/@deepseek-ai/cordis/package.json` 的 `repository` 与 DSH 侧相同。
- 支持范围：支持「同一个发布物」；不支持「4.0.4 与 DSH `639ed015` 上的 `vendor/cordis/src` 逐字节相同」——没有比对 npm 包内容与归档源码。
