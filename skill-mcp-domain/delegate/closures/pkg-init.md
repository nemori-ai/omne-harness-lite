# 闭包规格 pkg-init

## 身份与位置
- 闭包：pkg-init
- 卡与修订：#0 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/pkg-init
- 分支：PanQiWei/skill-mcp-pkg-init
- 基线：15fe147c129cfaa4d3b209d27366ae478010bd9e
- 清晰度：定

无卡。负责人 2026-11-03 明确要求：两个领域的源码包现在开始初始化或改名，相关登记文档与配置一并完成。上一层：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/docs-landing/spec.md。

## 模型与推理强度
developer，Claude Opus 5.5，effort high。implementation_kind product。理由：跨两个能力组建包、改名并同步文档与锁文件，需守模板结构扫描与包组织规则；不写业务实现。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：用官方包模板 `typescript-package@3.0.0` 建立 Skill 与 MCP 两组第一波成员的草稿骨架，把现有 Skill 纯契约成员改名，使三个能力组（Tool、Skill、MCP）的成员命名一致；同步组页与真实消费者的登记。

派发者已经定下的决定（照做，不重新裁定）：
- D1 改名：现有 `@omne-harness/skill`（目录 `packages/skills/skill`）改为 `@omne-harness/skill-contract`（目录 `packages/skills/skill-contract`）。它仍是纯契约成员，公开形状与行为不变（`skillBodyContract` 等原导出原样保留）。依据：Tool 组是 `tool-contract`（纯契约）加 `tool`（通用实现），MCP 组是 `mcp-contract` 加 `mcp`；Skill 组对齐同一命名。用 `git mv` 保留历史。
- D2 原具名目标 `skill-access`（通用实现）改名为 `skill`，包名 `@omne-harness/skill`，目录 `packages/skills/skill`。职责不变：`PackageInspection`、`SkillCatalog`、`SkillAccess` 三个应用服务。
- D3 本闭包新建五个第一波草稿成员，变体都用 `module`：
  - `packages/skills/skill`（`@omne-harness/skill`，通用实现）
  - `packages/skills/skill-host-local`（`@omne-harness/skill-host-local`，第一波只有目录来源 `DirectorySource`）
  - `packages/mcp/mcp-contract`（`@omne-harness/mcp-contract`，纯契约）
  - `packages/mcp/mcp`（`@omne-harness/mcp`，通用实现）
  - `packages/mcp/mcp-host-local`（`@omne-harness/mcp-host-local`，本地宿主）
  两个 host-local 的 Cordis 插件部分属于 Cordis 服务键波，到时再补 `src/cordis.ts`；本闭包不生成绑定变体。
- D4 `skill-cordis-contract` 与 `mcp-cordis-contract` 不在本闭包建立。它们属于 Cordis 服务键波，[包组织](../../../../docs/package-organization.md#文档归属与维护路径)规定「未实现目标不造空成员」。组页继续把它们写作具名文档目标。
- D5 草稿只生成模板骨架，保留模板的 PACKAGE_TEMPLATE_DRAFT 与文档占位标记，不写采用标识 `omneHarness.packageTemplate`，不写业务代码、类型或 SPEC 正文。`package.json` 的 `description` 写一句与组页职责一致的英文说明。
- D6 依赖只声明源码真实导入的包。草稿不导入任何 workspace 包时，`dependencies` 留空；不预先加 `@modelcontextprotocol/client`、`@deepseek-ai/cordis` 或公共值成员，也不改 `pnpm-workspace.yaml` 的 catalog。
- D7 不改 `docs/architecture/constraints.json` 与 `.dependency-cruiser.cjs`。成员间不成环、组间不成环由现有通用规则检查。
- D8 新成员的 `package.json` 字段顺序、脚本与 devDependencies 以模板生成结果为准，与 `packages/skills/skill-contract/package.json` 不一致之处不手工拉齐，交回时列出差异。

不在范围内：业务实现、成员 SPEC 正文、Cordis 绑定、约束文件、产品页、统一语言、其他能力组的成员。

### 写范围
- `packages/skills/skill` — 现有纯契约成员，经 `git mv` 改名为 `packages/skills/skill-contract`；随后在原路径新建通用实现草稿（模板生成）
- `packages/skills/skill-contract`（新建） — 由 `packages/skills/skill` 改名而来；只改包名、自身文档里的包名与路径、测试里的导入名
- `packages/skills/skill-host-local`（新建） — 草稿（模板生成）
- `packages/mcp/mcp-contract`（新建） — 草稿（模板生成）
- `packages/mcp/mcp`（新建） — 草稿（模板生成）
- `packages/mcp/mcp-host-local`（新建） — 草稿（模板生成）
- `packages/skills/README.md` — 成员表、成员名、依赖图
- `packages/skills/docs/architecture.md` — 成员名与改名决定
- `packages/skills/docs/key-flows.md` — 成员名
- `packages/skills/documentation.json` — 组登记，如扫描要求
- `packages/mcp/README.md` — 成员表与状态
- `packages/mcp/docs/architecture.md` — 成员状态
- `packages/mcp/docs/key-flows.md` — 成员状态
- `packages/mcp/documentation.json` — 组登记，如扫描要求
- `docs/domains/skills` — 只改成员名与成员状态的说法
- `docs/domains/mcp` — 只改成员名与成员状态的说法
- `packages/assets/assets/SPEC.md` — 只改第 220 行附近「`@omne-harness/skill` 登记 `skill`」中的包名
- `pnpm-lock.yaml` — 只由 `pnpm install` 改写 importers
### 排除的调用方
- `tools/product-checks/src/rules/core-pure-imports.ts` 与 `tools/product-checks/tests/schema-v2-subpaths.spec.ts` 中的 `@omne-harness/skill-package` — 那是封存旧包 `skill-package` 的名字，不是本闭包改名的对象，不改
- `.meta_harness/**`、`docs/` 中 Skill 与 MCP 领域页以外的正文 — 只在 grep 发现指向 `packages/skills/skill` 路径或 `@omne-harness/skill` 包名的链接时停下交回，不自行改
- `apps/**` — 本闭包不改；停止条件：发现应用导入了被改名的包时停下交回

## 验收清单
- A1 结构：`pnpm package:template scan --member packages/skills/skill-contract --json` 与五个新成员各自的 scan 不报结构缺项以外的错误（草稿未贴采用标识属预期，交回中写明每个成员的标识、结构、集成读数）；`pnpm package:template scan --group skills --json` 与 `--group mcp --json` 的读数写进交回。
- A2 构建与测试：`pnpm turbo run build typecheck test --filter=./packages/skills/* --filter=./packages/mcp/*` 退出 0。`skill-contract` 原有测试全部仍通过，测试数与基线相同。
- A3 改名完整：`git grep -n "@omne-harness/skill\b" -- . ':!tmp' ':!pnpm-lock.yaml'` 的每一处命中都指新的通用实现 `@omne-harness/skill`，或是 `@omne-harness/skill-package` 封存包；`git grep -n "skill-access" -- . ':!tmp'` 无命中；`git grep -n "packages/skills/skill/" -- . ':!tmp'` 只指新的通用实现。命令与结果写进交回。
- A4 文档：`pnpm run check:docs` 与 `pnpm run check:design` 退出 0；组页与领域页的成员表和实际 workspace 成员一致（哪些是 workspace 草稿成员，哪些仍是具名文档目标）。组页 Q-SK02–06、Q-MC02–06 与「完整行为候选的正式承接缺口」的标题逐字不变。
- A5 依赖：`pnpm run lint:deps` 退出 0。
- 收尾门禁：`pnpm run preflight`；`pnpm run format:check`；`pnpm run lint:rules`；`git ls-files --eol` 的 w/crlf 只允许基线已有的两个 legacy LICENSE。失败时先在基线上复跑同一命令，区分既有失败与本闭包引入的失败。
- 接受级别 L1。提交 trailer：Harness: claude-code、Agent-Role: developer；作者用环境变量里的 PanQiWei 身份，不写 Co-Authored-By。改名与新建分两个提交：先改名（含消费者同步），再建草稿与登记。

## 实施规格
负责人原则：两个领域只交付领域内部与用本领域词表达的对外契约；组页不点名调用方。成员职责、允许的生产依赖与分波以组页 `packages/skills/README.md`「成员与依赖」与 `packages/mcp/README.md`「成员与依赖」为准，只按 D1–D4 改名与改状态。

### 命名账本
- Skill 组：skill-contract（纯契约，原 skill）、skill（通用实现，原 skill-access）、skill-cordis-contract（未建）、skill-host-local。
- MCP 组：mcp-contract、mcp、mcp-cordis-contract（未建）、mcp-host-local。

## 性质及证据义务
- 改名不改行为：`skill-contract` 的导出集合与测试结果与基线一致；交回中附改名前后 `src/index.ts` 导出名清单。
- 文档与实际成员一致：交回中列出每个组页成员表的前后对照。

## 施工计划
1. 在基线上跑 A2 中 `packages/skills/skill` 的 build、typecheck、test 与收尾门禁，存输出。
2. 提交一：`git mv packages/skills/skill packages/skills/skill-contract`，改包名与自身文档、测试导入，改 assets SPEC 一处，跑 `pnpm install` 更新锁文件，跑 A2、A3 中相关部分。
3. 提交二：用 `pnpm package:template create --group <组> --name <成员> --variant module --write` 生成五个草稿，填 `description`，改组页、领域页与 documentation.json，跑 `pnpm install`，跑全部验收与门禁。

## 自主范围与动作授权
允许：写范围内改文件；`git mv`；`pnpm install`（只为更新 workspace importers，锁文件中除新增与改名成员的 importers 外不得有其他变化）；本地提交。不允许：推送、合并、改写范围外文件、新增或升级第三方依赖。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/pkg-init。派发者同时在父工作树的 tmp 下做建模，不改受控文件。派发者唯一合回。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/pkg-init/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 规则：/home/user/omne-harness-lite/.worktrees/pkg-init/docs/package-organization.md「成员的必选结构」「完整生成树」；/home/user/omne-harness-lite/.worktrees/pkg-init/tools/dev-flow/templates/package/README_ZH.md；/home/user/omne-harness-lite/.worktrees/pkg-init/docs/member-documentation.md
- 必须加载：asd-ste100（改文档时）。

## 当前认知
- 已确认：`@omne-harness/skill` 在 workspace 内没有代码消费者，只有组页、assets SPEC 第 220 行提到它；`tools/product-checks` 中的是封存包 `@omne-harness/skill-package`。`pnpm package:template create --group skills --name skill-host-local --variant module` 预览成功。
- 假设：模板生成的草稿能直接通过 build、typecheck 与 test。
- 未知：`pnpm run preflight` 对未贴标草稿成员的读数。

## 返回与恢复
内联交回：两个提交号、每条验收的命令与结果、导出名清单对照、成员表前后对照、package.json 与 skill-contract 的差异、未覆盖项。过程输出留 /home/user/omne-harness-lite/.worktrees/pkg-init/tmp/pkg-init/。

## 已知会受影响的现有用例
- `packages/skills/skill/tests/contract.spec.ts`、`tests/public-entry.spec.ts`：改名后随包移动，导入名改为 `@omne-harness/skill-contract`。

## 停止条件
- 必须改写范围外文件才能通过检查时停下交回。
- 模板草稿不能通过 build、typecheck 或 test，且修复需要写业务代码时停下交回。
- `pnpm install` 改动了第三方依赖的解析结果时停下交回。

## 追加记录
