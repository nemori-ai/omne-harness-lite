# 闭包规格 w2-skill

## 身份与位置
- 闭包：w2-skill
- 卡与修订：#0 r1（无卡；负责人 2026-11-03 会话内「W2 开工」）
- 工作树：/home/user/omne-harness-lite/.worktrees/w2-skill
- 分支：PanQiWei/skill-mcp-w2-skill
- 基线：b0f2ec7fb15a3f8572a36ef71af2fd30bf90ca01
- 清晰度：定

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：读取关口是安全敏感代码（无披露、依据不授予访问、快照竞争），策略 `security-sensitive` 给顶档、最低 high；不是内核原语，不用 xhigh。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：把 `@omne-harness/skill` 做成能在内存替身端口上跑通 Skill 首条旅程（检查 → 描述 → 读正文与资源 → 列举 → 导出）的通用实现，并把 `SkillAccess` 的符合性套件加进 `skill-contract/testing`。按 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/skill/plan.md 的切片 01→04 顺序做。

形状与决定：
- 以 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/skill/spec.md「已定事项」1–10、15、16 为准，逐条照做，不重新裁定。
- 读取 11 步与映射表以组页 `packages/skills/docs/architecture.md`「读取」「端口」为准；形状规则以 `packages/skills/skill-contract/SPEC.md`「读取的形状规则」为准。
- 三段结构的起点是 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/model/skill/access.ts（只取分法；它写在 W1 之前，类型以 F 的契约为准）。

不在范围内：`SkillCatalog`；`DirectorySource`（另一闭包）；改 `skill-contract` 已有签名或行为；新依赖；组页、领域页；顺手清理所改文件之外的代码。

### 写范围
- `packages/skills/skill/` — 本闭包的主成员；`src/`、`tests/`、`README.md`、`SPEC.md`、`documentation.json`、`acceptance/`、`examples/` 按模板要求；`package.json` 只允许改 `exports`、`files`、`scripts`
- `packages/skills/skill-contract/src/parse/manifest.ts` — 可加导出 `bodyOffsetOf`（已定事项 5）；现有导出的签名与行为不变
- `packages/skills/skill-contract/src/index.ts` — 可加：重导出 `bodyOffsetOf`
- `packages/skills/skill-contract/src/testing-access.ts`（新建） — `skillAccessConformance()` 与 `AccessFixture`
- `packages/skills/skill-contract/src/testing.ts` — 可加：重导出套件
- `packages/skills/skill-contract/tests/` — 可加：`manifest.ts:47–55` 边界夹具（SK2-8）、`bodyOffsetOf` 用例；现有用例原样通过
- `packages/skills/skill-contract/SPEC.md` — 只允许在「符合性套件」节加 `skillAccessConformance` 一段与「入口」表加一行；其余不改

### 排除的调用方
- `packages/skills/skill-host-local/` — 另一闭包并行写；停止条件：需要它配合时停下交回
- `packages/skills/skill-contract/src/{values,ports,failures,services,contract,snapshot,project}.ts` — 已有公开形状，本闭包不改；停止条件：实现需要改它们才成立时停下交回
- `packages/assets/assets`、`packages/common/*` — 只读；停止条件同上
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 共享文件，只由 reduce 写；停止条件：需要新依赖时停下交回
- `packages/skills/docs/`、`docs/domains/skills/` — 组页与领域页由 reduce 波末写回

## 验收清单
每条写命令、预期与具名变异。失败时先在基线上复跑同一检查。

1. `pnpm turbo run build typecheck test --filter=@omne-harness/skill --filter=@omne-harness/skill-contract` 退出 0。
2. SK2-1：`inspection.spec.ts` 覆盖已定事项 7 的每条映射。变异：`mapping.ts` 把 `entry-unreadable` 的检查映射改成 `outside-package` → 对应用例变红。
3. SK2-2：用例名含步号（如 `step-07-basis-unavailable`），11 步每个分支至少一条。变异：`pin.ts` 去掉快照摘要比较 → `step-07-*` 变红。
4. SK2-3：A1–A3 三条路径的答复对象 `deepStrictEqual`；无权主体对存在/不存在的能力同答。变异：`gate.ts` 把 `bad-basis` 改答 `basis-unavailable` → A1 变红。
5. SK2-4：`range.spec.ts` 六条规则 + `bodyOffsetOf` 用例（LF、CRLF、无头部、BOM、头部后紧跟 EOF）。变异：`range.ts` 终点不前移到字符边界 → 多字节用例变红。
6. SK2-5：`skillAccessConformance()` ≥13 条，本实现 + 内存替身全绿；把 `gate.ts` 第 2 步（`readCheck`）注释掉跑套件 → A1 变红，红灯输出存 `tmp/closures/w2-skill/red/`。
7. SK2-6：A7 `aborted`（替身在端口返回后中止 signal，断言没有内容且端口不再被调用）；A12 `export` 一个条目字节改动 → `version-changed` 且结果无 `entries`。
8. SK2-7：A13 来源 `open` 抛出时 `describe` 成功。
9. SK2-8：`pnpm run mutation --base b0f2ec7fb15a3f8572a36ef71af2fd30bf90ca01 --plan-only` 核范围含 `parse/manifest.ts`，正式跑后 47–55 行先前存活的边界变异被杀（读数记进交回，工具判「测量无效」时原样报）。
10. 契约旧用例：`pnpm turbo run test --filter=@omne-harness/skill-contract` 用例数不少于基线 364，且无改写（`git diff --stat` 对 `tests/` 只有新增）。
11. `src/` 里没有 `as`（`as const` 除外）、`any`、`class`：`grep -rnE "\bas\b(?! const)|\bany\b|^class " src` 为空（用 `rg -P`）。
12. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run format:check`、`pnpm run preflight`、`git ls-files --eol | grep -c w/crlf` 为 0。
13. 成员文档：`README.md`、`SPEC.md`（行为契约：三段、映射、范围规则引用契约 SPEC 不复制）、`documentation.json`、`acceptance/` 按 `docs/member-documentation.md`；`pnpm run check:docs` 通过。

## 实施规格
- `src/index.ts` 导出：`createPackageInspection`、`createSkillAccess`、`SkillPorts`。不导出三段函数（它们在 `src/access/` 内模块；测试直接 import 源文件）。
- `src/mapping.ts`：一张表 `sourceFailureTo(op: 'inspect' | 'read' | 'list' | 'export', failure: SourceFailure, basis: boolean)`，返回对应失败；`inspect` 的两种拒绝与两种失败在同一张表。只有这一处知道映射。
- `src/access/gate.ts`：`gate(ports, access, scope, capability, basis?) → Outcome<Gated, DescribeFailure>`，`Gated = { ref: SkillRef; declared: DeclaredProjection; layer; basis?: SkillMaterialBasis }`。第 1 步比较 `basis.capability` 与目标；第 2 步 `readCheck.check`；第 3 步 `resolution.resolve(…, { basis })`，`known-unavailable` 组装 `unavailable-stand-in`，`basis-not-lawful` → `basis-unavailable`，`none` → `not-available-to-you`，`unknown` → `unknown`。
- `src/access/pin.ts`：`pin(ports, gated, signal?) → Outcome<Pinned, PinFailure>`，`Pinned = { gated; digest: PackageDigest; snapshot; locator }`。第 5 步无摘要 → `unsupported(no-readable-package)`；第 7 步 `source.snapshot(locator)`，映射来源失败；摘要不等 → 带依据 `basis-unavailable`、不带 `adopted-material-changed`。
- `src/access/bytes.ts`：`verifiedBytes(ports, pinned, path, signal?) → Outcome<{ entry; bytes }, ByteFailure>`：第 9 步条目查找 → `resource-missing`；第 10 步 `source.open(locator, digest, path)` → 映射；`computeDigest(bytes)` 与条目摘要比较 → `version-changed`。
- `src/access/range.ts`：`sliceRange(bytes, encoding, requested?, bodyOffset?) → { content, range, total, complete }`，纯函数；文本解码用 `TextDecoder(encoding, { fatal: true, ignoreBOM: true })`，字符边界用 UTF-8 续字节规则（0b10xxxxxx）判断。
- `src/access/checkpoint.ts`：`checkpoint(signal) → 'aborted' | undefined`。
- `src/access/service.ts`：四个操作组合三段；`describe` 组装 `SkillDescription`（`material` 两态）；`read` 组装 `ReadResult`（`part` 的资源路径经 `toPackagePath`）；`list` 过滤控制文件（`isControlFile`）；`export` 对快照每个条目调 `verifiedBytes`，任一失败即返回，不交部分。
- `src/inspection.ts`：`createPackageInspection(source)`：`snapshot` → 映射 → 用 `open` 读 `SKILL.md` 与（条目存在时）`.omne/skill.json` → `parseSkillPackage({ snapshot, control, expectedName })` → 结果原样。
- `skill-contract/src/testing-access.ts`：套件用例 A1–A13 按 spec 已定事项 10；夹具由实现方工厂给出 `{ access, principals: { reader, stranger }, scope, capability: { adopted, standIn, missing, noPackage }, basis…}`，套件自己不构造服务。
- 命名账本：`SkillPorts`、`createPackageInspection`、`createSkillAccess`、`skillAccessConformance`、`AccessFixture`、`bodyOffsetOf`、`sliceRange`、`checkpoint`、`sourceFailureTo`、`gate`、`pin`、`verifiedBytes`。

## 性质及证据义务
- 无披露（SK2-3）与依据不授予访问（第 1 步）是 L3 性质：用例 + 变红证据 + reduce 逐行读 `gate.ts`、`mapping.ts`。
- 不交部分内容：`aborted`、`version-changed`、`export` 三处都要证明结果里没有内容字段。
- 不缓存：同一服务实例两次 `read`，第二次替身改答 `refused` → 第二次 `not-available-to-you`（用例）。
- 每个失败种类都是封闭集合中的成员：类型测试 `types.spec-d.ts` 钉死 `ReadFailure` 等联合不扩大。

## 施工计划
1. 切片 01：先写 `inspection.spec.ts` 的映射用例（红），再写 `mapping.ts`、`inspection.ts`（绿）。红灯输出存 `tmp/closures/w2-skill/red/01.txt`。
2. 切片 02：先写 A1–A3、A13 的本地用例（红），再写 `gate.ts`、`service.ts` 的 `describe`。
3. 切片 03：先写 11 步分支用例与 `range.spec.ts`（红），再写 `pin.ts`、`bytes.ts`、`range.ts`、`checkpoint.ts`、`bodyOffsetOf`、`read`/`list`。
4. 切片 04：`export`；把本地用例提炼成 `skillAccessConformance()`；`manifest.ts` 夹具；跑变异。
5. 成员文档与收尾门禁；交回。
每个切片一个或几个提交，提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖、改契约已有签名。规格不够时在授权范围内自定，并在交回逐条列理由（不能向派发者提问）。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w2-skill。另两位写者并行写 `packages/skills/skill-host-local` 与 `packages/mcp/mcp`，写范围不相交。派发者唯一合回。不跑 `pnpm run admission` 与仓库全量测试；变异只跑 `--plan-only` 核过范围的那一次。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w2-skill/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 再读：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/skill/spec.md 全文；同目录 plan.md；`packages/skills/skill-contract/SPEC.md`「读取的形状规则」「需求端口」「快照」；组页「读取」「端口」「检查与发现」。
- 契约源码：`packages/skills/skill-contract/src/{services,ports,failures,values,testing-source,testing-resolution,testing-read-check,testing-case}.ts`。
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC/README 时 asd-ste100（投影在工作树 `.claude/skills/`；没有生成时读 `.meta_harness/agents/skills/<名>/canonical/SKILL.md`）。
- 模板：成员已是 typescript-package@3.0.0 骨架；成员文档要求见 `docs/member-documentation.md`。

## 当前认知
- 已确认：基线上 `@omne-harness/skill` 是模板草稿，依赖已由 reduce 声明（assets、legal-identity、operation-result、skill-contract），build/typecheck 通过；`skill-contract` 364 例通过。
- 假设：`Access<P>` 只需透传给端口；文本编码只有 `utf-8`/`utf-16le`/`utf-16be`（以快照条目 `encoding` 的类型为准）。不成立时停下交回。
- 未知：无。

## 返回与恢复
内联交回：每个提交号；每条验收的命令与结果（含日志时间与提交号）；自定裁定清单；变红证据路径；变异读数；未覆盖项。过程输出留 /home/user/omne-harness-lite/.worktrees/w2-skill/tmp/closures/w2-skill/。中断后新写者从本规格 + 追加记录 + `git log` 接续。

## 已知会受影响的现有用例
- `skill-contract/tests/manifest.spec.ts`（若存在）：只新增，不改写现有断言。
- `skill-contract/tests/public-entry.spec.ts`：公开根导出集合增加 `bodyOffsetOf`、`./testing` 增加 `skillAccessConformance`，对应的导出集合断言按新增改写（简报明确要求的改写不算放宽）。

## 停止条件
- 需要改契约已有签名、需要新依赖、`sealSnapshot`/`parseSkillPackage` 的行为不足以实现 11 步时停下交回，写明已完成切片。
- 同一用例连试三种做法仍红时停下。

## 追加记录
- 2026-11-03T22:10Z 第 1 轮评审（reviews/skill-r1.md，三面：设计与实践、交付边界、L3 逐行 7 个探针）。下列每条先写会红的用例（证明变红时先还原源码并重新构建 dist）并把红灯存 tmp/closures/w2-skill/red/r2-*.txt。
- 2026-11-03T22:10Z **阻断 1（读取次序）**：第 5 步（`SkillRef` 无内容摘要 → `unsupported`）必须在第 6 步（`toPackagePath` → `bad-path`）之前；把第 5 步从 `pin` 拆到 `service.read` 的 `partOf` 之前（或 `partOf` 前先判 `ref.digest`）；用例：`noPackage` 能力带坏路径 → `unsupported`；删成员 SPEC「三段」节的偏离句。
- 2026-11-03T22:10Z **阻断 2（gate 的检查点）**：已定事项 3 签名修正为 `gate(ports, access, scope, capability, basis?, signal?)`；`describe` 不传；`readCheck.check` 与 `resolution.resolve` 前后各 `checkpoint`。用例：已中止的 signal 下 `read`/`list`/`export` 答 `aborted` 且 `check`/`resolve`/`snapshot`/`open` 调用 0 次；`check` 期间中止答 `aborted`。成员 SPEC:65 与 docs/architecture.md:43 的自述随之成立。
- 2026-11-03T22:10Z **阻断 3（映射一处）**：`sourceFailureTo` 的列改为 `'inspect' | 'snapshot' | 'open'`，删 `pin.ts` 的 `snapshotFailure`；`inspect` 列不收 `basis`。快照阶段的 `entry-not-found`/`bytes-mismatch` 在 `snapshot` 列映射为 `source-unavailable`（reduce 裁定，组页波末补行）。
- 2026-11-03T22:10Z N1（裁定）：读取判定答复不是 `granted`/`refused`/`unknown` 之一时答 `unknown`，不放行；`gatedOf` 的 default 分支同样收口为 `unknown`。用例：替身答 `{kind:'denied'}` 与 `{}` 都不交正文。
- 2026-11-03T22:10Z X3（裁定）：「请求终点」= 请求起点 + 请求长度；实际终点前移到不大于它的上一个字符边界。P5（字节 `61 C3 A9 62 63`，`{start:2,length:2}`）应答 `"b"`、`{start:3,length:1}`；改 `range.ts` 与用例，并在成员 SPEC「正文与范围」加一句消歧（契约 SPEC 的措辞由 reduce 波末处理）。
- 2026-11-03T22:10Z 裁定 5：`describe` 带依据且依据合法时，`material.basis` 的 digest 与资产版本取**依据**的（依据所指材料），与 `read`/`list` 的 `basis?.digest ?? ref.digest` 一致；用例：依据 digest 与 `ref.digest` 不同时 `describe` 交回依据的 digest。
- 2026-11-03T22:10Z 套件（`skill-contract/src/testing-access.ts`，可加）：`capability.checkedOnly` 改为必需（A3 必跑）；删无用例的 `capability.standIn` 或补 A14 `unavailable-stand-in`；A9 要求夹具可选提供 `capability.large`（>65536 字节的文本资源），没有则该条 `NotApplicable`；A7 加「已中止时四个端口调用 0 次」，夹具加 `world.calls(): { check, resolve, snapshot, open }`；`abortAfterSnapshot().opens` 的文档与实现对齐；A12 两条编号分开（A12a/A12b）；`readAll` 的重复 `read` 去掉。新增第二个夹具世界（对应端口只对 reader 可见、满足 PR5），`conformance.spec.ts` 在两个世界各跑一遍套件，都要全绿。
- 2026-11-03T22:10Z 契约 SPEC（扩大写范围）：删/改三处过时句（「与组页的差异」表「本版本的 ./testing 没有 SkillAccess 的套件」、「不在本成员」第 439 行、「持续验证」未覆盖句）；在「读取的形状规则」加 `bodyOffsetOf` 一句条款（定义、`undefined` 的条件、LF/CRLF）；「请求终点」消歧一句。
- 2026-11-03T22:10Z 设计建议一并做：S1 `PinFailure` 用 `Exclude<PinFailure, GateFailure>` 并修 spec-d；S2 去掉 `gate`/`pin` 的重载，`pin(ports, gated, moved: F, signal?)` 由调用方给「材料已变」失败值；S3 `verifiedBytes` 收 `PackageEntry`，`read` 自己做第 9 步，`export` 不再 O(n²)；S6 `Pinned` 带 `basis`，去掉三处 `basisOf` 与 `mediaType` 重复展开；S7 范围非法在操作开头抛 `TypeError`；S8 `readManifest` 直接用 `frontmatterBounds(bytes)`，`frontmatterOf` 并入；S10 `toEqual` → `toStrictEqual`（已定事项 9），删重复用例（`describe.spec` 的 A1–A3 副本、`mapping.spec` 的 `toBeDefined`）、死导出 `Registered`、`export { fail }`、动态 import；S11 成员 SPEC 验证表加「反例/变红」列。
- 2026-11-03T22:10Z 不做：S4（契约导出 `MANIFEST_PATH`/`PAGE_LIMIT`/`sameCapability`）进 W3 prep；`op` 两列不追认（按阻断 3 改三列）。

