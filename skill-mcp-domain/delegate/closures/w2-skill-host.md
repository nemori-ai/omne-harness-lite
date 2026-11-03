# 闭包规格 w2-skill-host

## 身份与位置
- 闭包：w2-skill-host
- 卡与修订：#0 r1（无卡；负责人 2026-11-03 会话内「W2 开工」）
- 工作树：/home/user/omne-harness-lite/.worktrees/w2-skill-host
- 分支：PanQiWei/skill-mcp-w2-skill-host
- 基线：b0f2ec7fb15a3f8572a36ef71af2fd30bf90ca01
- 清晰度：定

## 模型与推理强度
developer，implementation_kind product，Claude Opus 5.5（claude-opus-5-5），effort high。理由：单成员提供者，规格与符合性套件完整，默认档；文件系统接缝的设计有判断，取 high。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：把 `@omne-harness/skill-host-local` 做成只读当前目录的 `SkillPackageSource` 实现 `createDirectorySource`，通过契约的 `skillPackageSourceConformance()`，并用注入的文件系统接缝证明权限类失败。按 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/skill/plan.md 的切片 05→06 顺序做。

形状与决定：以 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/skill/spec.md「已定事项」11–16 为准；`DirectorySource` 的行为以组页 `packages/skills/docs/architecture.md`「端口」中 `DirectorySource` 段为准；端口要求以 `packages/skills/skill-contract/SPEC.md`「需求端口」为准。

不在范围内：`@omne-harness/skill` 的服务；内容存储来源；缓存或索引；Cordis 插件；新依赖；组页。

### 写范围
- `packages/skills/skill-host-local/` — 本闭包唯一的写入目录；`package.json` 只允许改 `exports`、`files`、`scripts`

### 排除的调用方
- `packages/skills/skill/`、`packages/skills/skill-contract/` — 另一闭包并行写前者；后者只读；停止条件：契约的 `sealSnapshot` 或套件不足以证明本实现时停下交回
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 只由 reduce 写；停止条件：需要新依赖时停下交回
- `packages/skills/docs/`、`docs/domains/skills/` — reduce 波末写回

## 验收清单
1. `pnpm turbo run build typecheck test --filter=@omne-harness/skill-host-local` 退出 0。
2. SK2-9：`conformance.spec.ts` 用真实临时目录（`mkdtemp`）跑 `skillPackageSourceConformance()` 全绿。变异：`walk.ts` 不排除目录条目 → PS1/PS2 变红。
3. SK2-10：`links.spec.ts`：包内链接读所指字节；根外链接 → `snapshot` 答 `outside-package`；成环与悬空 → `entry-unreadable`；FIFO（`mkfifo`，无命令时 `NotApplicable`）与 unix socket（`net.createServer`）→ `entry-unreadable`。变异：`walk.ts` 用字符串前缀代替 `realpath` 判根外 → 「链接指向根目录的兄弟目录、名字以根名为前缀」的用例变红。
4. SK2-11：`permissions.spec.ts` 注入 `DirectoryFs`：`readFile` 抛 `EACCES` → `snapshot` 答 `entry-unreadable`、`open` 答 `unavailable`；根目录 `readdir` 抛 `EACCES` → `unavailable`；根目录 `ENOENT` → `package-not-found`；不依赖 root。
5. SK2-12：`race.spec.ts`：取快照后改文件，`open` 原样交出新字节（与快照条目摘要不同）。
6. `content-store` 定位 → `package-not-found`（用例）。
7. `src/` 无 `as`（`as const` 除外）、`any`、`class`。
8. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run format:check`、`pnpm run preflight`、`git ls-files --eol | grep -c w/crlf` 为 0。
9. 成员文档与示例：`README.md`「行为」节写失败映射（已定事项 12）；`SPEC.md`；`examples/inspect-directory.ts` 对 `examples/sample-skill/` 做 `snapshot` + `parseSkillPackage` 并打印定义或拒绝；`node --experimental-strip-types examples/inspect-directory.ts` 可运行；`pnpm run check:docs` 通过。

## 实施规格
- `src/index.ts`：`createDirectorySource(options?: { fs?: DirectoryFs })`、`DirectoryFs` 类型。
- `src/fs.ts`：`DirectoryFs = { readdir(path): Promise<Dirent-like[]>（name、isFile、isDirectory、isSymbolicLink）; lstat(path); realpath(path); readFile(path): Promise<Uint8Array> }` 与 `nodeFs(): DirectoryFs`（`node:fs/promises`）。错误用 `code` 字段分类（`ENOENT`、`EACCES`、`EPERM`、`ELOOP`、`ENOTDIR`、`EIO`…），不解析消息文本。
- `src/walk.ts`：`collect(fs, root) → Outcome<{ rootName; files: { path; bytes }[] }, SourceFailure>`：`realpath(root)` 失败 `ENOENT`/`ENOTDIR` → `package-not-found`，其他 → `unavailable`；递归 `readdir`；链接用 `realpath` 解析后判是否在 `rootReal + sep` 之下（不是字符串前缀，是路径段比较）；解析失败 `ELOOP`/`ENOENT` → `entry-unreadable`；非文件非目录非链接 → `entry-unreadable`；文件读失败 `EACCES`/`EPERM`/`EIO` → `entry-unreadable`。路径用 `/` 连接的包内相对路径。
- `src/directory-source.ts`：`snapshot` = `collect` → `sealSnapshot(rootName, files)`（`sealSnapshot` 自己的缺陷 `invalid-root-name` 等按契约答复原样映射；根名空只在根是 `/` 时出现 → `package-not-found`）；`open` = 解析 `root/path` 的 `realpath` 并判根内 → 读字节；`ENOENT` → `entry-not-found`，根外 → `outside-package`，其他 → `unavailable`。`open` 忽略 `digest` 参数（本来源不按内容存放；写进 README）。
- 命名账本：`createDirectorySource`、`DirectoryFs`、`nodeFs`、`collect`。

## 性质及证据义务
- 根外判定用解析后的路径段比较（L2 热点，reduce 读 `walk.ts`）。
- 只读、不缓存：同一实例两次 `snapshot` 之间改文件，第二次摘要不同（用例）。
- 失败集合封闭：类型测试钉 `SourceFailure` 不扩大。

## 施工计划
1. 切片 05：先写 `conformance.spec.ts`（红：导出不存在），再写 `fs.ts`、`walk.ts`、`directory-source.ts`（绿）；再写 `links.spec.ts`（红→绿）。
2. 切片 06：`permissions.spec.ts`、`race.spec.ts`；示例；文档；门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖。规格不够时在授权范围内自定并在交回列理由。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w2-skill-host。另两位写者并行写 `packages/skills/skill` 与 `packages/mcp/mcp`。派发者唯一合回。不跑 `admission` 与仓库全量测试。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w2-skill-host/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 再读：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/skill/spec.md 已定事项 11–16 与判据 SK2-9–12；组页「端口」`DirectorySource` 段；契约 SPEC「需求端口」「快照」；`skill-contract/src/{testing-source,snapshot,values}.ts`。
- 必须加载：ub-mode；pstack:typescript-best-practices；写文档时 asd-ste100。
- 模板：typescript-package@3.0.0 骨架；`docs/member-documentation.md`。

## 当前认知
- 已确认：基线上成员是模板草稿，依赖已声明（operation-result、skill-contract），build/typecheck 通过。
- 假设：容器以 root 运行，所以真实 `chmod` 不能制造 EACCES，权限用例只用注入接缝；unix socket 与 FIFO 在本机可建。不成立时对应用例 `NotApplicable` 并在交回写明。
- 未知：无。

## 返回与恢复
内联交回：提交号；每条验收的命令与结果；自定裁定；`NotApplicable` 的用例与原因；未覆盖项。过程输出留工作树 `tmp/closures/w2-skill-host/`。

## 已知会受影响的现有用例
- `tests/public-entry.spec.ts`：导出集合按新增改写。

## 停止条件
- 契约套件对本来源有不可满足的用例（例如要求按内容摘要查找）时，不改套件，停下交回并写明用例编号。

## 追加记录
（无）
