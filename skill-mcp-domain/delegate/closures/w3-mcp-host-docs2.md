# 闭包规格 w3-mcp-host-docs2

## 身份与位置
- 闭包：w3-mcp-host-docs2
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
- 分支：PanQiWei/skill-mcp-w3-mcp-host
- 基线：06b98034dc600ff4d0f7b45b079f917d534937fe
- 清晰度：定

`w3-mcp-host` 第 2 轮之后的表达与证据闭包（PR #1138）。基线是 `w3-mcp-host-fix2`（代码，head `0695f2ba4`）与 `w3-mcp-host-formal2`（TLA+，head `0caa8b577`）合并之后的 head。代码与模型已经定了，本闭包只让文档与它们一致、把证据写全。依据：
- 评审记录与卡拥有者的裁定：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2.md`（B 面 NB6–NB13 中标「改」的项；E 面「用例 → 缺陷 → 变红」一条）。
- fix2 的交回第 8 节「让排除文件过时的位置」与第 6 节变异表：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-host-fix2.md`。
- formal2 的交回第 9 节：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-host-formal2.md`。

## 模型与推理强度
developer，implementation_kind verification，Claude Sonnet 5.5（claude-sonnet-5-5），effort high。理由：代码与模型已定，规格逐项列出的文档修订与证据整理，单成员、无设计判断 → 经济档。

## 目标边界
目标：成员的 SPEC、README、`docs/`、`index.md`、`verification/` 与最终 head 的代码和模型一致；探索器一侧的证据表、运行记录与负控名按 fix2 的交回重写；产出一张「用例 → 缺陷 → 变红」表，供卡上的最终证据引用。

### 已定的事（不重新裁定）
1. **探索器证据**：成员 SPEC「性质与证据」的证据表探索器一列，与 `verification/README.md` 的「两种证据能变红」「动作映射」「状态映射」「运行命令」「证据状态」各节，按 fix2 的交回改：新 V4（观察调用方的 promise）、三个端口可答 `hang`、负控名以 `tests/model/mutants.ts` 为准（`mV2-forgets-close` 两处替换、`mV4-close-settles-after-line`、`mV4-caller-follows-workflow`、`mV6-authorizing-abandoned` 与四个 `mStdio-*`）、变异做法 `node tests/model/mutate.ts`（不再引用 tmp 里的脚本）；动作映射「实现」一列写 fix2 交回的名字（`work`、`begin`、`sendOut`、`stop`、`callHandle`、`refusalOf`、出发点 `departed` 等），删掉「以 fix2 交回为准」的占位句。V1 的探索器负控说明改写：`Deferred` 已不存在，按新结构说明为什么单点变异不足以让 V1 变红，或者给出能让它变红的变异。运行记录表在本闭包基线上重跑探索器（快层与慢层）取数。
2. **锚点、路径与编号**（B NB7）：契约条款的链接按契约 SPEC 现行的锚点 id 改（T4、T5 不是 `#t8`）；`SPEC.md` 里探针的运行路径改为 `tests/probes/`；「契约裁定 2」写明是哪张表。
3. **复述与过程记述**（B NB11，N1、N10、N12 的残留）：成员 SPEC 的自定 4、H9、H12 删去对契约条款的逐句复述，只写本成员的兑现方式并指条款；评审轮次与卡内编号（「MC3-10」「代码修复轮交回」「第 1 轮评审阻断 A5/A4」等）换成缺陷描述；运行过程的记述（「同一时段本机另有会话……」）删掉。
4. **README**（B NB12）：两种语言的「读不懂的行」改为「解析不了的行」；`README_ZH.md:65` 按 fix2 交回第 8 节改。
5. **`docs/` 与导航**（B NB13，fix2 交回第 8 节）：`flows.md`、`architecture.md`、`object-model.md`、`context.md` 按最终代码改（`Pending` 的结算与出发点、连接模式的判别联合、`StdioLine` 的写计数、`cancelRequest` 当即返回、`close()` 当场结算不等发现）；`architecture.md:37` 的「等到 `close()` 或 `signal`」按契约 D14、I05、O04 改；复述处挂条款指针；`index.md` 列出「性质与证据」与「与契约的已知偏离」；`tests/index.md`、`tests/README.md` 列出 `model/` 与 `probes/`；`tests/fixtures/README.md` 补 `settle.ts`。
6. **钉住的契约修订**（B NB6）：成员 SPEC 依据表钉的契约修订改为本闭包基线（契约在基线上已含 T5、T9 的本轮句子）。
7. **「用例 → 缺陷 → 变红」表**（E）：一张表，每行写：变异号或负控名、所在文件与改动、用例全名、变红输出的一两行摘录、运行时的 head。来源：fix2 的 `mutate.ts`（12 个负控，在本闭包基线上重跑一次取摘录）、fix2 交回第 4 节验收 2 的红灯表（基线 `db06b5b70` 上的输出摘录，引用 fix2 的日志）、第 1 轮已有的 m10、m11 变异（引用原日志）。表写进 `tmp/closures/w3-mcp-host/docs2/red-table.md`，派发者把它贴到卡上。

### 写范围
- `packages/mcp/mcp-host-local/SPEC.md` — 第 1、2、3、6 条涉及的句子
- `packages/mcp/mcp-host-local/README.md` — 第 4 条
- `packages/mcp/mcp-host-local/README_ZH.md` — 第 4 条
- `packages/mcp/mcp-host-local/docs/` — 第 5 条
- `packages/mcp/mcp-host-local/index.md` — 第 5 条
- `packages/mcp/mcp-host-local/tests/index.md` — 第 5 条
- `packages/mcp/mcp-host-local/tests/README.md` — 第 5 条
- `packages/mcp/mcp-host-local/tests/fixtures/README.md` — 第 5 条
- `packages/mcp/mcp-host-local/verification/README.md` — 第 1 条
- `packages/mcp/mcp-host-local/verification/models/README.md` — 只在第 1 条的改动让它的句子过时时改
- `tmp/closures/w3-mcp-host/docs2/`（新建） — 探索器运行日志、变异重跑日志、红灯表、门禁输出

### 排除的调用方
- `packages/mcp/mcp-host-local/src/`、`tests/` 的代码与用例、`verification/models/` 的模块与配置：代码与模型已定。
- 契约 `packages/mcp/mcp-contract/`：fix2 已改。发现契约文档与代码不一致，写进交回，不改。
- `packages/mcp/mcp/`：调用口在另一棵树。

## 验收清单
1. `pnpm run check:docs`、`check:design`、`format:check`、`lint:rules` 退出 0；输出尾部与日志哈希写进交回。
2. `git diff --name-only <基线>..HEAD` 只含写范围内的文件。
3. `git grep -n "Deferred\|mV2-send-after-close\|mV4-close-after-line\|以 .w3-mcp-host-fix2. 交回为准\|mutate.py" -- packages/mcp/mcp-host-local` 在文档里为 0 处（代码里的同名标识符不算，逐条说明）。
4. B 的 NB6–NB13 与 fix2 交回第 8 节逐条写「已改」与位置。
5. 第 7 条的红灯表存在，12 个负控的摘录取自本闭包基线上的重跑（日志哈希），其余行写出处日志。
6. 探索器在本闭包基线上重跑（`pnpm --filter @omne-harness/mcp-host-local exec vitest run tests/model`，快层与慢层各一次），运行记录表的数取自这次运行；日志哈希写进交回。

## 实施规格
- 中文文档按 asd-ste100 的语言无关规则；英文 README 用 STE-flavored。
- 只写现状与依据，不写评审轮次与过程；编号要能在仓库里解析。
- 行为只写在成员 SPEC 与契约 SPEC；README 与 `docs/` 只复述并指向条款。

## 性质及证据义务
- 每条证据写运行时的 head 与日志哈希；没有运行的写「未验证」。

## 施工计划
1. 读裁定、两份交回与基线上的代码名字。
2. 第 1、6 条（证据与探索器运行）。
3. 第 2–5 条（文档）。
4. 第 7 条（红灯表）。
5. 门禁、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行 `@omne-harness/mcp-host-local` 的用例、探索器与 `tests/model/mutate.ts`、仓库文档检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、改代码与用例。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host。并行的有 `w3-mcp-call-fix2`（另一棵树）。用例用 `VITEST_MAX_WORKERS=4`。不跑 `admission`、仓库全量测试与差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r2.md
- 两份交回：`delegate/handbacks/w3-mcp-host-fix2.md`、`delegate/handbacks/w3-mcp-host-formal2.md`（同一任务 tmp 目录）
- 必须加载：asd-ste100

## 当前认知
- 已确认：派发者在 fix2 头 `0695f2ba4` 上复跑：三个成员 19/19、慢层 235 通过（两种传输的符合性套件 0 失败）、`lint:rules` 通过、`mutate.ts` 12 个负控全部变红（日志 `fabd677df965c026`）。formal2 头 `0caa8b577` 上复跑：12 个配置符合判读、14 个有效动作的变异各自变红。
- 已确认：成员 SPEC 不在格式化维护范围内（`scripts/format.sh check` 拒绝它）。
- 已确认：fix2 让 `hang` 计入探索器的违约预算，场景的状态数都变了。

## 返回与恢复
每个提交号；验收各条的命令、结果、输出尾部与日志哈希；第 3 条的 `grep` 输出与说明；第 4 条的逐条位置；红灯表的路径；未覆盖项。

## 已知会受影响的现有用例
- 没有用例改动。

## 停止条件
- 某条文档要求与最终代码或模型不符，而改代码或模型在范围外。
- 探索器或负控在本闭包基线上的结果与派发者的复跑不同。

## 追加记录
- 2026-11-06 01:55 派发前：简报检查退出 0；108 条 `caller-outside-scope` 警告全是标识符 `hang`（探索器端口的答复名）在代码里的匹配，本闭包不改代码。01:56 派出。
- 2026-11-06 02:16 交回（head `a31a05ee7`，3 个提交，只改文档；交回全文存 `delegate/handbacks/w3-mcp-host-docs2.md`）。派发者核对：树干净，10 个文件全在写范围。写者自裁全部采纳（删去已进契约的自定 4 并改编号；`README_ZH.md:65` 按「共用规则已在契约根」改写；`flows.md` 失败表加条款列；运行记录的数取自对每个场景直接调用 `explore()`，`verification/README.md` 写明了取数做法）。交回的两处尾巴由派发者自己补（`720a5d08a`）：V1 能变红的变异入库为负控 `mV1-sends-after-settled`（`minimal` 报 `V1-line.send-after-settle`，源码按字节还原，日志 `tmp/closures/w3-mcp-host/owner/mutate-v1.log`），SPEC 证据表与 `verification/README.md` 改用它的名字；契约 `docs/public-api.md` 的 `./testing` 一行补全 SPEC「三个入口」列出的导出。第 1 轮 m10、m11 里有 12 行在原日志里没变红：那些变异改的是第 1 轮的 `src/`，不能在现行代码上复跑，照实留在红灯表 D.2，现行代码的变异强度由第 3 轮的差分变异量。
