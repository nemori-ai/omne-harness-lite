# Skill3 candidate 起草报告

本报告交回候选，不构成独立评审、技术接受、发布或实现验收。基线为 HUB `45c1b504ea7da5ff49042c6ecee3e489f76b2042`，依据 [施工简报](construction-brief.md)、[D-069](decision.md) 与 [产品负责人答复](user-ruling.json)。

## 交付清单

- 候选包 [`spec/data/skill-package/v3/`](../../../spec/data/skill-package/v3/contract.md)：完整 [`contract.md`](../../../spec/data/skill-package/v3/contract.md)、[`skill-package.schema.json`](../../../spec/data/skill-package/v3/skill-package.schema.json)、[`examples.md`](../../../spec/data/skill-package/v3/examples.md)。保留 S-1～S-32，共 32 条；仅 S-5／S-20／S-21／S-24 补本轮语义，S-1 澄清 AM2 精确引用 Skill2，S-22 更新自身 URI；其余 26 条逐字不变。沿原数据契约无操作、无提交点，操作九件事不适用。
- [candidate-diff.json](candidate-diff.json)：全部三份源资源与候选资源的 SHA-256、完整 unified diff、需求 rev、差异分类与候选登记补丁摘要。源2的三项摘要与正式冻结清单逐项相符；候选摘要不是冻结记录。
- [candidate-registry-patch.json](candidate-registry-patch.json)：**未应用的候选补丁**。拟追加 1 个 candidate catalog 条目、完整复制的 3 项依赖／13 个消费 clauses、22 条 `reviewed:false` covers；复用既有编号族，无新增 namespace／formal task／acceptance／frozen／lineage 条目。旧2与其它消费者登记均不改。
- [consumer-impact.json](consumer-impact.json)：5 个 catalog 精确钉2消费者、2 份外部 Schema 对2的精确引用（AM2／AM3；Skill2 自引用另列）、7 份已登记规范文档中的文本引用，以及 21 个源码／Schema／测试引用文件。候选 Schema 的 `$ref` 闭包含 14 份资源，逐份记录 `$id` 与摘要、逐边记录 JSON Pointer。
- 形式工件：本轮未触发新增行为或结构模型；**未运行** TLA+／Alloy。纯读入结果的新增证据义务由规范场景承接，不建立空模型。
- 检查器结果：本次正式树检查与内存 candidate catalog 检查均退出 0，具体输出与范围见下节。

本次写权限不含 topic `verification.md` 与正式 registry，故本轮「变化的影响」与新增证据义务登记在本报告及消费者影响清单，由主线在发布／采用时对齐可变入口。

## 承诺、裁定与推导

本契约继续拥有技能包的规范化形状、文本／目录承载形式及表示层拒绝。文本读入的完整映射图，包括最终被忽略的属性值、复杂键内部和 alias，须满足键唯一性；只有未知／未支持标量标签的 canonical 判等知识缺失确实阻止判断唯一性时，新增 `malformed`／M16 处置。已能确定不同的标签或复杂结构仍可成功；普通未知属性照旧忽略并留可见痕迹。目录读入承接同一失败，既有拒绝次序不变。

**简报／D-069 裁定**：拒绝上述无法判等输入、复用 M16、普通未知属性继续忽略、冻结2不动、Schema 只更新自身坐标元信息（`$id`、顶层 `title` 与顶层 `description` 的条款作用域）、依赖仍 AM2／CB2／TD2、其它消费者不自动升级。完整映射图检查范围与例子种类也由简报给定。

**本作者推导的表达**：以成对例子区分「未知关系决定唯一性」与「已知分量足以区分复杂键」；理由是同一输入中的未知标签并不总影响最终唯一性。新增目录成功／失败例子是 S-21 承接 S-20 的直接实例化。未新增产品政策、正式名、失败 token 或提供者机制。

**机械核对得到的影响**：AM2 的 skill 正文引用 Skill2，因此新3的 Schema 图也含完整旧2；必须保留两份不同 `$id` 的资源，不能只替换根文件。此为引用图事实，不是新提供者设计。

## 本轮变化的影响与证据义务

| 义务 | 本轮输入与可观察断言 | 状态／owner |
|---|---|---|
| V-4 文本读入 | 新增第6.1节14行：无法判等拒绝 M16；不同标签／已知分量可区分时成功；alias 同节点重复仍拒；未知值不需判等时成功；LF／CRLF 正文逐字、丢弃键可见痕迹 | **未开始**；Skill 文本读入提供者。实际比对结果与值，不用警告数量或解析成功替代 |
| V-5 目录读入 | 第10节新增3行：文本 M16 原样承接，合法 CRLF 文本照常成为包 | **未开始**；目录条目读入提供者。原有真实文件系统／符号链接义务仍由目录读取 owner 承担 |
| V-1 表示与精确资源 | 新3除自身坐标元信息（`$id`、顶层 `title` 与顶层 `description` 的条款作用域）外与旧2逐字相同；实际公开资源与解析图保持 AM2／CB2／TD2 及完整旧2；默认3／保留2入口的实际映射明确 | 源规格静态核对见下节；**提供者证据未开始**，主线及提供者 owner |
| V-2／V-3／V-6～V-9 与原 SC-1～SC-4 | 原义务按原范围保留；本轮未改正文逐字、归属、执行、权限、资源路径或属性投影语义 | 本轮未重跑；旧结果只在其原输入、前提与修订内有效 |

规范化 JSON 的 `$defs` 与约束不变，文本输入域已有新的确定拒绝；两者不能混称为完全相同契约。主线给定的提供者后续计划是默认 Skill3，显式 `./v2` 保留 JSON judge/types/body 与完整旧2 Schema；AM3／AE3／Slash2 的 Skill2 数据／正文消费须继续精确映射2，不保留旧2文本的 `undetermined` 行为。本作者只记录此计划的影响，未设计或实现该入口。

## 实际检查

2026-09-26，在本 HUB 使用其 `.venv/bin/python`，设置 `PYTHONDONTWRITEBYTECODE=1`；没有安装依赖、提交或写入 Git index。

正式树命令：

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal registered
```

实际退出码 **0**，末行原样为：

```text
PASS: design tree /data/qiwei/repos/omne-harness-lite/.worktrees/core-delivery/.meta_harness/design passed gate=internal; formal=registered.
```

该入口只把正式 catalog 的资源纳入 Schema 检查，所以另使用同一 `DesignValidator`，在 `_catalog` 的内存输入中追加本次 `catalog_append` 后运行 `validate()`；**没有改写任何 registry 文件**。实际退出码 **0**，末行原样为：

```text
PASS: in-memory candidate catalog overlay; no registry file written; 0 error(s); formal=registered.
```

两次输出均含 37 行 `FORMAL …: registered; execution was not requested`；它们只核登记，**不表示任何形式任务执行通过**。候选 covers 与 namespace 不在该工具校验范围，本轮另做源2映射复制、`reviewed:false` 与已有编号族的结构核对。

首稿定点字节、条款、实例与摘要核对的实际输出（仅描述本次元信息修正前的候选，不适用于修正后 Schema 摘要）：

```text
PASS: 32 clause identities; semantic changes S-5/S-20/S-21/S-24 and S-22 URI only; other 27 clauses byte-identical.
PASS: schema bytes differ only at root $id; 3 dependencies/13 clauses unchanged; 22 covers reviewed=false.
PASS: all source2 example rows retained; source2 frozen hashes and candidate resource/patch hashes match.
PASS: all 13 pre-existing resources in candidate schema closure match frozen hashes.
```

`git diff --stat -- .meta_harness/design/spec/data/skill-package/v2 .meta_harness/design/registry` 输出为空。以上是首稿起草所需静态一致性检查；**行为符合性测试、TLA+／Alloy、消费者验收均未运行**，首稿交回时尚未独立评审。

### 独立评审后的自身坐标元信息修正

独立 spec-reviewer 指出 Schema 顶层 `title` 与顶层 `description` 的条款作用域残留 v2。主线确认只修正这两处自身坐标元信息；加上首稿已改的 `$id`，相对源2恰有这三个顶层字段变化。`$defs`、约束、外部 `$ref`、外部 AM2 说明及读入语义保持不变。本轮同步完整差异、三资源摘要与消费者影响图中的根 Schema 摘要；候选仍未接受。

元信息修正后内存 candidate catalog 检查退出 **0**，输出：

```text
PASS: metadata-corrected candidate catalog overlay; no registry file written; 0 error(s); formal=registered.
```

### 冻结消费者引用澄清

同轮独立评审指出 S-1 与 CS-1 将 AM2 的冻结引用说成「本契约」会误指新3。主线授权机械纠正：AM2 仍精确引用 Skill2 的规范化 `SkillPackage`，与新3同形不等于采用新3；同一指代在抬头依赖表用途格与消费者表也同步澄清。S-1 记为坐标／引用澄清，S-22 仍仅更新 URI；CS-1 指向实际的 Skill2 条款。这些是说明已存在的消费者关系，不新增本契约的语义依赖，三依赖／13 clauses 不变。

最终修正后使用同一 HUB 的 `DesignValidator`，在内存 catalog 追加候选条目再检查全树；实际退出 **0**，输出原样为：

```text
FORMAL: 37 registration notes; execution was not requested.
PASS: final metadata/reference-corrected candidate catalog overlay; no registry file written; 0 error(s); formal=registered.
```

定点核对实际输出：

```text
PASS: only root $id/title/description coordinate metadata differs from source2 schema; all constraints, $defs, external refs and AM2 text byte-identical.
PASS: 32 clause identities; semantic changes S-5/S-20/S-21/S-24; coordinate-only S-1/S-22; other 26 clauses byte-identical.
PASS: source2 frozen hashes, 14 schema graph hashes, candidate hashes and full diffs match; 3 dependencies/13 clauses and 22 covers unchanged.
```

本轮不改三依赖、22条覆盖补丁或规范实例。形式工具与行为符合性测试仍未运行；独立评审的最终结论由 reviewer／主线记录，不由本作者接受。

## 报给主线

- 没有新政策问题或账本缺名。D-069 只关闭新3文本输入域中 SP-3 的政策未定；提供者 SP-3 的实现与实际证据仍须由 owner 闭合，不能把本候选完成当作实现完成。
- `data.skill-package/2` 的旧正文／topic verification 有历史 candidate、首版及旧接受路径措辞，与当前 registry 的 accepted／D-066 迁移登记不一致。旧2字节原样保留；新3自身状态与版本差异已写为 candidate，三项依赖状态按 catalog 写 accepted。主线可在版本外入口说明旧措辞的历史范围，本轮不据它否认冻结事实。
- `data.asset-model/2`、`data.asset-model/3` 等 schema 图与正文端口的保留2边界见 [consumer-impact.json](consumer-impact.json)。AM3／AE3／Slash2 不能仅因 normalized 形状相同而暗升文本语义；如工作区读入采用新3，显式采用责任归其 owner。
- 本轮无新增无词条概念；原包的 `environmentRequirement` 等规格层名字与已有裁定原样继承，不重命名。本轮 `canonical`／tag／alias 是简报给定的 YAML 表达，不作为新增领域词条定义。
- 候选登记补丁、topic 导航／verification 的本轮影响以及独立评审／接受／冻结，分别待主线处理；没有对应完成声明。

## 继承的已知缺口

| 坐标 | 未决内容 | owner |
|---|---|---|
| `data.skill-package/3#G-6` | 资源字节携带与核对、跨进程摘要表示 | 主线；搬运归 `capability.asset-transfer` 与提供者 |
| `data.skill-package/3#G-7` | 产品未要求的研究扩展是否纳入、归属内容或属性 | 主线；导入来源归导入器提供者 |
| `data.skill-package/3#G-9` | 技能与 `Skills()` 工具两份执行环境要求怎样合成 | `Skills()` 契约那一程，PF-007 §6.2 |

G-1～G-5、G-8 的既有闭合记录保留；无新 G-n。上述继承缺口不阻断 D-069 的窄候选起草，仍约束各自消费者。
