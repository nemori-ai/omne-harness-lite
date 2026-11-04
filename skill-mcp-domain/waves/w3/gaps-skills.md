# Skill 应然—实然差距账本（初稿，w3-skill-model，基线 e0b68a7c3）

应然：组页 `packages/skills/docs/architecture.md`「应用服务」「检查与发现」「读取」（含「端口」映射表与「失败种类」中被这三节引用的行）、`packages/skills/skill-contract/SPEC.md`、`packages/skills/skill/SPEC.md`。实然：e0b68a7c3 的 `packages/skills/skill/src/`。证据列中的「探索器」指本闭包的 `tests/model/`，「模型」指 `verification/models/ReadGate.tla`。

处置只有三种：改实现；改承诺并给理由；登记为已知限制并给退出条件。「W2 写回」指提交 7aa026548（「写回 W2 裁定：组页……同步成员 SPEC/README」）。

## 一、W2 写回是否把实然抄成了应然

逐项核对 7aa026548 对组页的改动：

| 写回项 | 来历 | 判断 |
| --- | --- | --- |
| 读取第 5 步在第 6 步之前 | W2 评审 B1：实现原先先查路径；reduce 裁定改实现，组页原文不变 | 应然保留，实现被改正。不是抄写 |
| `describe` 带依据时 `material.basis` 取依据 | W2 裁定 5：实现原先取 `SkillRef` 的 digest；改实现 | 应然保留。不是抄写 |
| `signal` 检查点含两个判定端口 | W2 评审 B2：实现原先漏掉；改实现，组页补写 | 应然加强。不是抄写 |
| 映射表加「快照阶段 `entry-not-found`/`bytes-mismatch`」一行 | W2 实现先有 `pin.ts` 的二次映射（W2 评审设计面 B1），reduce 裁定 3「在授权内」后写回组页 | **部分抄写**，见 GS-02 |
| 第 5 步写「这一步由成员的 `materialOf` 承担」 | 成员实现的函数分解写进组页 | **抄写（结构）**，见 GS-03 |
| 第 11 步「没有合法头部时整个条目是正文」 | W2 裁定 X4「保持」实现行为 | **抄写，有裁定无理由**，见 GS-04 |
| 第 11 步「请求终点是请求起点加请求长度」 | W2 L3 X3：两种读法，reduce 选字面读法，实现随之改 | 应然消歧。不是抄写 |
| 「验证」节改写 | 状态句 | 已过时，见 GS-07 |

## 二、差距条目

### GS-01 目录先核验还是先过滤

- 应然：组页「应用服务」`SkillCatalog` 行与「检查与发现」：「对集合中的每个身份，`SkillCatalog` 先经 `SkillReadCheck.check` 核验……任一身份答 `unknown` 时，整次操作返回 `unknown`」。
- 实然：`catalog.ts` 的 `listing` 先按 `capabilities` 或查询过滤，只对留下的身份调用 `check`（`grantedOf`）。空的 `capabilities` 不调用任何端口。
- 差距：组页与实现不同。契约 SPEC「与组页的差异」已登记（W3 已定事项 5、6，第 2 轮裁定 R2），写明「组页拥有者写回组页之前，以本页为准」。
- 处置：改承诺（组页写回）。理由：契约裁定。注意：这一差异改变了 S2 的「相关答复」：请求外身份的 `unknown` 不再使整次 `unknown`。
- 证据：探索器 S2 的目录预期按契约（先过滤）推出，24,398 组合中目录 5,016 组合通过。

### GS-02 快照阶段 `bytes-mismatch` 在 `inspect` 列答 `version-changed`

- 应然：组页「端口」映射表（W2 写回行）：快照阶段的 `entry-not-found` 或 `bytes-mismatch`，「快照不对单个条目作答，这样作答的来源不守端口契约」，`read`/`list`/`export` 为 `source-unavailable`；`inspect` 为 `source-unavailable`（`entry-not-found`）或 `version-changed`（`bytes-mismatch`）。
- 实然：`mapping.ts` 的 `TABLE`：`bytes-mismatch.inspect = VERSION_CHANGED`，`bytes-mismatch.snapshot = SOURCE_UNAVAILABLE`。`inspect` 不分调用点。
- 差距：同一种违约在两列含义不同。该行给出的理由（来源不守契约）只支撑 `source-unavailable`。`version-changed` 的含义是「检查途中字节与条目摘要不符」，快照阶段没有读出任何条目字节。这一格来自「`inspect` 不分调用点」的实现选择，不是独立的应然决定。
- 处置：组页拥有者裁定。候选 A（改承诺并改实现）：`inspect` 对快照阶段的 `bytes-mismatch` 答 `source-unavailable`，映射表加 `inspect` 的调用点。候选 B（改承诺）：保留并写明理由。
- 证据：`tests/mapping.spec.ts` 编码现状。模型只区分 `notFound`、`entryNotFound` 与 `undecided`，不覆盖这一格。

### GS-03 组页写进了成员的函数分解

- 应然（应有的层次）：组页写规则，成员 SPEC 写怎样切分。
- 实然：组页「读取」第 5 步写「这一步由成员的 `materialOf` 承担，见成员规格[阶段]」。
- 差距：组的承诺依赖了一个成员的内部函数名。成员重构 `materialOf` 时组页随之失效。
- 处置：改承诺：组页第 5 步只留规则（所钉材料：带依据时是依据本身，否则是引用的材料），删去函数名。成员 SPEC「阶段」保留不变。
- 证据：7aa026548 的组页改动。

### GS-04 没有合法头部的 `SKILL.md` 整个当作正文

- 应然：组页「读取」第 11 步（W2 写回）：`bodyOffsetOf` 答 `undefined` 时整个条目是正文。组页「包格式规则」：`SKILL.md` 开头与闭合定界行都逐字为 `---`，否则 `inspect` 拒绝。
- 实然：`service.ts` `bodyOffsetOf(bytes.ok) ?? 0`。
- 差距：条款由实现行为经裁定 X4「保持」得到，没有写出理由。按包格式规则推断（未验证资产登记一侧）：所钉材料来自 `inspect` 通过的包时，第 10 步核对条目摘要之后，这种字节不可达；只有资产记下的摘要不来自检查通过的包时才可达。在可达的情形下，「整个条目当正文」把头部之外的未知字节当作方法正文交出。
- 处置：登记为已知限制。退出条件：资产一侧确认摘要只来自 `inspect` 通过的包后，把条款改写为写明不可达的防御条款；或负责人裁定改答失败（例如 `version-changed` 或新的不支持之处）。
- 证据：探索器 S4 覆盖了无头部的正文（85 个文本），行为与条款一致。

### GS-05 中止的响应受端口时间限制

- 应然：组页「读取」：「调用方中止后，操作答 `aborted`，不再调用端口，也不交部分内容」。成员 SPEC：「端口自己收不到 `signal`，一次已经发出的端口调用由端口跑完」。
- 实然：`checkpoint.ts` 只在端口调用前后查 `signal`。端口挂起时，操作不答。
- 差距：组页没有写这个前提（性质账本 P0）。端口不终止时中止没有响应，这是活性缺口，不是安全缺口。
- 处置：负责人裁定。候选 A（改承诺）：组页写明前提与「中止的响应时间受端口时间限制」。候选 B（改实现）：把端口调用与 `signal` 竞争，中止后丢弃迟到的答复。候选 B 改变资源所有权（迟到答复的去向），需要设计。
- 证据：S6 模型与探索器都以 P0 为前提，不覆盖不终止的端口。

### GS-06 对应端口的引用不核对身份

- 应然：组页「读取」第 3 步「包定位只取自 `resolve` 交来的 `SkillRef`」；组页「失败种类」与 SYS-TENANT「跨租户访问默认拒绝」；契约 PR1（端口义务：`adopted` 的引用名为所请求的身份）。契约「端口答复的统一处置」核对表只核对 `ref` 的形状。
- 实然：`gate.ts` 的 `gatedOf` 直接使用 `answer.ref`。`materialOf` 用 `ref.capability` 组成结果的依据。
- 差距：违反 PR1 的对应端口能让 Skill 交出另一身份的材料。最小复现（`tmp/closures/w3-skill-model/probe/ref-mismatch.mts`）：`alice` 能读 `alpha`、不能读 `beta`；对应端口对 `alpha` 答 `adopted`，引用是 `beta` 的材料；`describe(alice, alpha)` 交出 `capability: beta` 与 `beta` 的依据，`read(alice, alpha, 正文)` 交出 `Body 0 of beta`。这在 S1、S3 的前提之外，但它是 L3 边界上唯一完全信任端口内容的一点，后果是越权读出。
- 处置：改承诺并改实现（候选）：统一处置表加一条「`adopted` 的 `ref.capability` 与请求的身份 `sameCapability`，否则不合，当作没有作答」；带依据时再核对 `ref` 的来源层与资产版本等于依据的。需要契约拥有者裁定。
- 证据：探针输出（见上）。

### GS-07 验证与导航已过时

- 应然：组页「验证」节：「当前没有选定的机制，也没有行为模型」。成员 `index.md`：「verification/：模型、论证与证明（本包没有）」。`documentation.json`：`verification-*` 与 `verification-models-*` 为 `not-applicable`。`tests/index.md` 没有列出 `model/`。
- 实然：本闭包之后有 `verification/models/ReadGate.tla`（TLC 有限范围通过）与 `tests/model/` 探索器。
- 差距：四处导航与状态过时。它们不在本闭包的写范围内。
- 处置：改承诺（拥有者写回）：组页「验证」指向成员的性质账本；成员 `index.md` 与 `tests/index.md` 加一行；`documentation.json` 改为 `applicable`。`check:docs` 当前通过，它不检查这一致性。

### GS-08 被吞掉的异常没有诊断出口

- 应然：成员 SPEC「端口答复在运行期也封闭」：「被吞掉的异常没有诊断出口，这一点留给与观测拥有者的后续议题」。
- 实然：`port-answer.ts` 的 `answered` 吞掉全部异常，包括本包解析代码自己的缺陷。
- 差距：已登记的观测缺口。
- 处置：登记为已知限制。退出条件：观测拥有者给出诊断出口后，`answered` 把吞掉的异常交给它。
- 证据：S2 只核对答复，不核对诊断。

### GS-09 契约「与组页的差异」表未写回组页

- 应然：契约 SPEC「与组页的差异」表有 20 行，写明「组页拥有者写回组页之前，以本页为准」。
- 实然：实现按契约。
- 差距：组页与契约在 20 处不同（GS-01 是其中一行）。按 W3 结构性处置，应然的唯一源在组页与成员规格之间有一个暂时的双源。
- 处置：改承诺：组页拥有者逐行写回或拒绝，波末账本只留有退出条件的项。

### GS-10 已核对、无差距的条款

下列条款由本闭包的模型或探索器核对，实然与应然一致（有限范围）：

- 第 1–3 步三条路径同答 `not-available-to-you`（S1，探索器 180,960 组合；模型 `ReadGate_Disclosure.cfg`）。
- 读取判定或对应端口没有作答时 `unknown`，来源没有作答时 `source-unavailable`，`inspect` 同样（S2）。
- 带同一依据的各页不拼版本；来源在快照与 `open` 之间变化时答 `version-changed`，在快照之前变化时答 `basis-unavailable` 或 `adopted-material-changed`（S3）。
- 字节范围六条规则、请求终点、正文起点（S4，含 CRLF 头部与无终止符的闭合行）。
- 目录答复与核验完成次序无关（S5）。
- 每次端口调用前后查 `signal`，已中止时不调用端口（S6）。
- 范围非法时在任何端口之前抛 `TypeError`（S4 探索器 6 种非法范围）。组页「读取」的步骤表没有写这一步的位置（契约与成员 SPEC 写了），属于轻微的表述缺口，可随 GS-09 写回。
