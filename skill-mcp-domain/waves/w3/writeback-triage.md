# W3 波末写回条目分类表

核对基线：分支 `PanQiWei/skill-mcp`，头 `3289bee2f`，2026-11-06。只读核对，未改任何仓库文件。

## 读法

- 分类：A 已有裁定可直接写回；B 要卡拥有者裁定；C 来源写明要负责人（人）裁定；D 已过时或本次不需要改目标页。
- 行号是当前树上的行号。「Skill 组页」是 `packages/skills/docs/architecture.md`，「MCP 组页」是 `packages/mcp/docs/architecture.md`。「契约 SPEC」指对应成员的 `SPEC.md`。
- 编号：`GS-nn` 来自 `gaps-skills.md`；`SC-Ln`、`CM-Ln` 是两份契约 SPEC「与组页的差异」表的行（n 是 SPEC 里的行号）；`G1–G8` 来自 `mcp-contract-r1.md`；`W-n` 是本次在当前树上对照后新列的条目。takeover-plan 第 8 节的子项和 context-pack 5.3 的点名项没有自己的编号，并入对应的 `GS`、`SC`、`W` 行，来源列写明。
- `delegate/closures/w3-skill-fix.md` 简写为「skill-fix 规格」；`reviews/skill-fix-r2.md` 为「skill-fix 第 2 轮」。
- 清单外的同源页（`packages/skills/docs/key-flows.md`、`packages/mcp/docs/key-flows.md`）在表后单列，不占编号。

## 表

| 编号 | 来源 | 目标页与行号 | 现状一句 | 要改成什么一句 | 分类 | 依据或候选 |
| --- | --- | --- | --- | --- | --- | --- |
| GS-01 | gaps-skills GS-01；SC-L81 | Skill 组页 l.307、l.315、l.419 | 写「对集合中的每个身份先核验，任一身份 `unknown` 时整次 `unknown`」 | 先按 `capabilities` 过滤与 `search` 匹配，只对留下的身份核验；空 `capabilities` 不调端口；请求外身份的 `unknown` 不使整次 `unknown` | A | `waves/w3/skill/spec.md` 已定事项 5、6（l.45–46）；契约第 2 轮裁定 R2；契约 SPEC l.81 已写「组页写回前以本页为准」 |
| SC-L82 | 契约 SPEC「与组页的差异」l.82 | Skill 组页映射表 l.270–277 | 表里没有 `open` 答 `entry-unreadable` 的行 | 加一行：`open` 答 `entry-unreadable` 时，`read`/`list`/`export` 为 `source-unavailable`，`inspect` 拒绝为 `malformed` | A | `waves/w3/skill/spec.md` 已定事项 9（l.49） |
| GS-02 | gaps-skills GS-02；SC-L84 | Skill 组页 l.273、l.305（检查与发现第 3 类）、l.415、l.416 | 快照阶段 `bytes-mismatch` 时 `inspect` 答 `version-changed` | 快照阶段 `entry-not-found`、`bytes-mismatch` 时 `inspect` 都答 `source-unavailable`；`version-changed` 只留给 `open` 阶段与检查途中字节不符 | A | skill-fix 规格第 2 条（l.20）；契约 SPEC l.84。注意账本原写「组页拥有者裁定」，规格已选候选 A |
| GS-03 | gaps-skills GS-03 | Skill 组页 l.349 | 第 5 步写「这一步由成员的 `materialOf` 承担，见成员规格［阶段］」 | 删函数名与成员链接，只留规则：带依据时所钉材料是依据本身，否则是 `SkillRef` 的材料；`material.basis` 同一规则 | A | GS-03 处置；skill-fix 规格第 6 条（l.24）「组页（GS-01、GS-03、GS-09）不改，波末写回」 |
| GS-04 | gaps-skills GS-04；SC-L85；skill-fix 第 2 轮 N1 | Skill 组页 l.355（第 11 步） | 写「`bodyOffsetOf` 答 `undefined` 时整个条目是正文」 | 所钉材料的 `SKILL.md` 没有合法头部定界时，`read` 的正文答 `source-unavailable`，不交内容；写明只在资产摘要不来自检查通过的包时可达 | A | skill-fix 规格第 3 条（l.21）。账本原处置是「登记已知限制」，规格改成了答 `source-unavailable`，以规格与契约 SPEC l.85 为准。来源的退出条件之一是「负责人裁定改答失败」，规格走的正是这一条路，由卡拥有者选定，负责人复核时可收回 |
| GS-05 | gaps-skills GS-05 | Skill 组页 l.359（`signal` 段）、l.418（`aborted` 行） | 写「调用方中止后，操作答 `aborted`，不再调用端口」，没有前提 | 加前提：每次端口调用都会结束；中止的响应时间受端口时间限制，端口不结束时操作不答复 | C | 来源写明「处置：负责人裁定」，候选 A（改承诺，组页写明前提与「中止的响应时间受端口时间限制」）、候选 B（改实现：端口调用与 `signal` 竞争，丢弃迟到答复；改变资源所有权，需要设计）。现状：卡拥有者已在 skill-fix 规格第 4 条（l.22）选候选 A 并落进契约 SPEC l.370 与 skill SPEC l.107；本次写回按候选 A，负责人复核时可收回 |
| GS-06 | gaps-skills GS-06；SC-L83 | Skill 组页 l.242–250（各端口的要求）、l.347（第 3 步） | 只写「包定位只取自 `resolve` 交来的 `SkillRef`」 | 加：`resolve` 答 `adopted` 时引用必须指向所请求的身份，带依据时来源层、资产版本、内容摘要必须等于依据的；`known-unavailable` 的能力标识必须是所请求的身份；不合即没有作答（`unknown`） | A | skill-fix 规格第 1 条（l.19）；owner-rulings 第 7 条；契约 SPEC l.83 |
| GS-07 | gaps-skills GS-07 | Skill 组页 l.484（验证） | 写「当前没有选定的机制，也没有行为模型」 | 指向 `skill` 成员的性质账本与 `ReadGate.tla`、探索器，写明证据范围（有限范围、前提 P0） | A | 事实同步，无语义选择。成员侧导航已由 skill-fix 规格第 6 条完成；组页这一句账本处置写「拥有者写回」，规格没有单列，请卡拥有者确认这一句归本次写回 |
| GS-08 | gaps-skills GS-08 | 无目标页 | 被吞掉的异常没有诊断出口 | 不改组页 | D | 处置是「登记为已知限制」，已在 `skill` SPEC「端口答复在运行期也封闭」登记，退出条件归观测拥有者 |
| GS-09 | gaps-skills GS-09 | 总括，见各 `SC-L*` 行 | 契约「与组页的差异」表的行与组页不同 | 逐行写回 | A | 逐行结果见 `SC-L63–L80`（D）与 `SC-L81–L89`（A，除另注）。GS-10 末条（步骤表没写范围非法在端口之前抛 `TypeError`）见 W-1 |
| W-1 | gaps-skills GS-10 末条 | Skill 组页 l.343–356（读取步骤表） | 步骤表没写「范围非法时在任何端口之前抛 `TypeError`」的位置 | 在第 1 步之前加一句范围校验 | A | GS-10 末条「可随 GS-09 写回」；契约 SPEC 与 skill SPEC l.32 已写次序 |
| SC-L63–L80 | 契约 SPEC「与组页的差异」前 18 行（2026-11-03 裁定） | Skill 组页 | 逐行核对：入口 `./provider`、`kind` 判别联合、`entry-unreadable`、`sealSnapshot` 收字节与拒绝空或含 `/` 的包根名、头部 YAML 读不出判 `malformed`、含 `..` 判 `malformed`、保留字段、`list`/`export` 收 `signal`、`outside-package`、快照阶段的检查例外、`name-invalid`、不依赖 content-block、`unsupported` 只有 `no-readable-package`、`skillAccessConformance`，组页现文都已含 | 无 | D | 组页已写回（见 `7aa026548`、`68102be46`、`db26bc15b`）。余下四行（控制字节与快照不对应、值守卫 `isX`、套件无框架、`toPackagePath` 仍规范化）组页没有写，也不冲突，成员 SPEC 是唯一源 |
| SC-L86 | 契约 SPEC l.86；skill-fix 第 2 轮 B1（裁定 l.32）；takeover-plan 第 8 节首条（读取第 5 步） | Skill 组页 l.349（第 5 步）、l.417（`unsupported` 行）、l.442（SK-D02）、l.457（承接缺口表 `SkillResolution` 行）、l.480（验证第 10 项）、l.182（G5 行） | 全部无条件写「资产正文缺 `package.digest` 时 `read`/`list`/`export` 答 `unsupported`，带不带依据都一样」 | 改为：不带依据时才答 `unsupported`；带依据时端口带回依据的内容摘要（PR3），第 5 步总是通过，结果由第 6、7 步决定，来源没有包时答 `basis-unavailable` | A | skill-fix 第 2 轮 B1 裁定（`reviews/skill-fix-r2.md` l.32）；契约 SPEC l.86 |
| SC-L87 | 契约 SPEC l.87；takeover-plan 第 8 节首条（「描述」五处 `:164`、`:182`、`:363`、`:441`、`:480`） | Skill 组页 l.164、l.182、l.348（第 4 步）、l.363、l.441、l.480 | 写「正文缺 `package.digest` 时 `describe` 不带材料依据，标明『没有可读的包』」，没分带不带依据 | 改为：不带依据时才如此；带依据时 `describe` 交出依据所指的材料，不标「没有可读的包」 | A | 同 SC-L86 的 B1 裁定；契约 SPEC l.87。takeover-plan 列五处，核对后还有 l.348 同一句 |
| SC-L88 | 契约 SPEC l.88；`waves/w3/wave-pack.md`「生态兼容」；skill-fix 规格 2026-11-04T15:05Z 追加记录；skill-fix 第 2 轮 N1 | Skill 组页 l.304、l.323、l.326、l.331、l.479；l.85（`SkillDefinition` 行，补兼容提示） | 包格式规则拒绝：头部 YAML 读不出即 `malformed`、`name` 与包根目录名不同一律 `name-mismatch`、`metadata` 非文本映射 | 四种软偏离接受并带兼容提示（逐行读出 name 与说明、说明超长、`metadata` 非文本映射、name 与目录名不同）；`name-mismatch` 只在给了 `expectedName` 且不等时判 | A | 负责人 2026-11-04 要求（wave-pack「生态兼容」，优先于本页其余条目）；契约 SPEC l.88 |
| SC-L89 | 契约 SPEC l.89；owner-rulings 第 5 条 | Skill 组页 l.82（`SkillManifest` 行） | 写 description 长 1 到 1024 个字符 | 改为上限 16384 个字符，指向契约 SPEC#values；注明官方规格写 1024 | A | owner-rulings 第 5 条（`reviews/skill-fix-owner-rulings.md`，「维持 16384 上限」） |
| TP-pins-S | takeover-plan 第 8 节首条（组设计钉） | `skill-host-local/SPEC.md` l.11；`skill/SPEC.md` l.12；`skill-contract/SPEC.md` l.11、l.13 | l.11、l.12 钉 `b0f2ec7fb`，契约 l.11、l.13 钉 `21175c9f9`，都是组页旧版本 | 移到 Skill 组页写回的提交 | A | takeover-plan 第 8 节首条与 owner-rulings 第 2 条（「写回时一起移三份 SPEC 的组设计钉」）。契约 l.13 是资产成员的钉，不是组页的钉：`21175c9f9..HEAD` 在 `packages/assets/assets/src` 只加 112 行，diff 里没有 `BodyContract`、`CapabilityId`、`Declarations` 的行，可以一起移。移动时 SPEC 开头「采用的范围」格要对照写回后的组页复核 |
| W-2 | context-pack 5.3；`waves/w4/plan.md` l.198（W3-E「正式承接缺口表中 W1–W3 已交付的行」） | Skill 组页 l.5（状态句）、l.579–583（承接缺口表前言与第一行） | l.5 与 l.579 写「`SkillCatalog` 仍只有接口，没有实现」「Cordis 插件部分还没有实现」；第一行状态「候选，尚未承接」 | `SkillCatalog` 已实现（`createSkillCatalog`，`skill/src/catalog.ts`），改写状态句与第一行状态；Cordis 两行保持 | A | `waves/w4/plan.md` l.198；context-pack 5.3 第一条。事实核对：`skill/README.md` l.5、`skill/src/index.ts` l.4 |
| W-3 | context-pack 5.3 | 领域页：`docs/domains/skills/architecture.md` l.3；`docs/domains/skills/key-flows.md` l.3、l.9、l.72；组入口 `packages/skills/README.md` l.3、l.16、l.56 | l.3、l.16 写 `SkillCatalog` 没有实现；key-flows l.9 写 name 与目录名不一致一律拒绝；l.72 无条件写缺 digest 时 `describe` 不带依据、`read` 答 `unsupported`；README l.56 写「目前没有核实行为」 | 与 W-2、SC-L86、SC-L87、SC-L88、GS-07 同步 | A | 同上各条的依据。README l.56 的措辞随 GS-07 改 |
| CM-L166–L175 | mcp-contract SPEC「与组页的差异」10 行（2026-11-03 裁定，「组页随后写回」） | MCP 组页 | 逐行核对：对端账号只由 `peerAccountOf` 得出、不读任务支持方式、调用不带 `mode`、凭据缺值答复、`taskResult` 有 `cancelled`、`cancelTask` 只答已请求、`inputRequired` 两项各自可选、未知 `resultType` 答 `protocolError`、`CredentialUse` 按用途分型，组页现文都已含（l.39、l.170–171、l.438、l.471–472、l.527、l.529） | 无 | D | 已由 `78e978ab6` 及之前的写回完成 |
| TP-4 | takeover-plan 第 8 节（交付边界冲突 4）；`reviews/mcp-lifecycle-r2.md` 冲突项裁定 1 | MCP 组页 l.194（不变式 5）；`mcp/mcp/SPEC.md` 已按此写（MC-5） | 写「连接时限从取凭据开始计时」 | 建连时限从 `attempt()` 之后起计，覆盖其后对遗留进程的再停、取凭据到协商与失败后的收场；每次 `ensure` 另有从入口起的临界区时限，加入在途建连的调用另有从加入起的时限；保留「刷新取分页另起一个时限」 | A | `reviews/mcp-lifecycle-r2.md` 冲突项裁定 1（「以成员 SPEC 为准；组页写回已登记在接手计划波末项」）；成员 SPEC MC-5 与「时限」条。连接时限起点 |
| GM-5 | gaps-mcp 不变式 5、S8、已知限制「拆除的端口挂起」 | MCP 组页 l.399–403（`Connections` 已知限制三条） | 写：端口 reject 时「进程与句柄的归宿不保证」；落点永不答复时 `release`/`closeAll` 答 `no-process`；`closeAll` 不阻止之后的建连 | 删这三条，改指 `mcp` SPEC 的「已知限制」（l.405 已指向它）。三条都与现行成员 SPEC 不同：reject 经 MC-14、MC-15 吸收；落点在途时报 `unconfirmed`；`closeAll` 之后不再建连（契约裁定 5、30） | A | 契约 SPEC「2026-07-28 核对后的裁定」第 4、5、6、30 条；`mcp` SPEC MC-10、MC-14、已知限制；接手裁定 K1–K3。组页自己写「全部已知限制见 mcp SPEC」，删复述不引入新语义 |
| GM-其余 | gaps-mcp 不变式 1–4、6，S1–S9，AV 至 T 各行，成员 SPEC 四节 | 无目标页 | 实现缺陷（N1、N2、N3、B1、P2、A1）与成员 SPEC 过头陈述 | 不改组页 | D | 缺陷已在 `w3-mcp-lifecycle` 与调用口修复闭包改实现或改成员 SPEC；组页不变式 1–6 的文字对现行实现仍成立（不变式 5 的起点见 TP-4） |
| GM-P3 | gaps-mcp 第四节末行（W3 评审待裁 P3「discover 途中关停」，写「只有负责人能定」） | 无目标页 | 关停落在 `discover` 途中时 `ensure` 仍答 ok | 不改组页 | C | 来源写「只有负责人能定」，照录：已定事项 5 只在取得凭据之后与进程交来之后核关停，关停之后不再答 ok 是否要求由负责人定。现状：卡拥有者已让 MC-5 在取得凭据之后、进程交来之后、协商成立之后各核一次，契约裁定 5、30 与 `reviews/mcp-lifecycle-r1.md` l.110 的 F3 同向，等于选了「要求」；负责人复核时可收回。条目在成员 SPEC，不在目标页，所以对组页没有写回动作，只需负责人知情 |
| G1–G8 | `reviews/mcp-contract-r1.md` 第 3 轮摘要「组页冲突 G1–G8（波末写回）」 | MCP 组页（范围未知） | 全文未留存：该评审在云端会话里。已查：`reviews/*.md`、`delegate/closures/*.md`、`HANDOFF.md`、`waves/w4/plan.md`（只重复「G1–G8」）；卡 #1119 全部评论（`gh issue view 1119 --comments`，无命中）；记录分支工作树 `skill-mcp-records`（只有同一份摘要） | 见候选 | B | 候选一：从云端会话取原文逐条对号。候选二：以下表 W-4 至 W-9 与 TP-4、GM-5 为组页冲突的现行清单，把「G1–G8」登记为「原文不存在，由现行对照取代」。推荐候选二：G1–G8 针对第 3 轮的契约头 `c407fab9d`，之后契约又改了 30 多条裁定，旧冲突多半已变形；现行对照直接依据当前契约与成员 SPEC，且 W-4 至 W-9 共 6 项数量与 G1–G8 相近。候选二的代价：若原文里有现行对照没覆盖的冲突就丢了，所以请卡拥有者先确认会话还在 |
| W-4 | `waves/w3/wave-pack.md`「生态兼容」；`waves/w3/mcp/spec.md` l.28；`mcp-host-local/SPEC.md` l.12、l.121–；契约裁定「真实传输兑现时」第 6 条 | MCP 组页 l.83（协议基线第 2 项）、l.87（第 4 项）、l.350、l.624 | l.83 写「官方 SDK 只出现在 mcp-host-local 的两个 `McpTransport` 实现里」；l.87 与 l.624 写「不支持 HTTP+SSE」；l.350 写「官方 SDK 只出现在实现里」 | 协议层优先复用官方 SDK，只在 SDK 违反三条硬承诺时自写（现实现的产品源码不导入 SDK）；Streamable HTTP 传输对只会旧 HTTP+SSE 的对端回退一次（`WireContext.mode` 是 `sse`） | A | 负责人 2026-11-04 要求（wave-pack「生态兼容」）；`waves/w3/mcp/spec.md` l.28；契约 SPEC T3 与裁定第 6 条；host-local SPEC「与 SDK 的复用关系」 |
| W-5 | takeover-plan 第 8 节「小卡：RFC-0001 的 SDK 版本」；host-local SPEC l.12–13；契约 SPEC l.20 | MCP 组页 l.72、l.624、l.694；`packages/mcp/README.md` l.20、l.29 | 写 SDK 2.3.1，是对 RFC-0001 第 4 版行的转述；现行成员已按 2.4.0 实现与核对 | 见候选 | B | 候选一：组页保留对 RFC 行的转述（2.3.1），在 l.72 后加一句「W3 实际采用 2.4.0，见 host-local SPEC；RFC 同步归小卡」。候选二：组页先改 2.4.0（组页与它转述的 RFC 行不一致）。推荐候选一：组页写「依据层」，RFC 行是唯一源，改写应随 RFC 小卡；README l.20、l.29 的图与版本同样处理（l.20 还有「候选，workspace 模板草稿成员」要按 W-6 改） |
| W-6 | context-pack 5.3；`waves/w4/plan.md` l.198 | MCP 组页 l.3、l.606、l.690、l.705–712（前言与四行状态）；`packages/mcp/README.md` l.3、l.18、l.20；领域页 `docs/domains/mcp/architecture.md` l.3；`packages/mcp/docs/key-flows.md` l.3 | 写 `createMcpCore` 交出四个服务、调用口「在第三波」、`mcp-host-local` 是「模板草稿」、承接表各行「未承接」 | `createMcp` 交出五个服务（`inspection`、`discovery`、`invoker`、`status`、`connections`）；调用口与任务操作已实现；host-local 已实现（stdio、Streamable HTTP、旧 SSE 回退）；承接表状态按现状写「候选，已有实现，尚未技术接受」 | A | `waves/w4/plan.md` l.198；context-pack 5.3 末条；`mcp/README.md`（成员）l.15；`mcp-host-local/README.md` l.5–14 |
| W-7 | 契约 SPEC「2026-07-28 核对后的裁定」第 1 条 | MCP 组页 l.430 | 写「mcp 成员让 `refresh` 另收调用方的中止 `signal`，这是对契约的偏离」 | `refresh` 的请求带 `signal?`（契约 S5），不再是偏离；删「偏离」一句与指向成员 SPEC「偏离」表的链接（该表已无这一行） | A | 契约裁定第 1 条；`mcp` SPEC l.158–163 偏离表三行里没有它 |
| W-8 | 契约 SPEC 裁定第 17 条 | MCP 组页 l.690 | 写 `mcpTransportConformance` 由契约测试入口导出「（第三波）」 | 去掉波次，写已导出 | A | 契约裁定第 17 条；W-6 同一行状态句 |
| W-9 | context-pack 5.3；契约 `Connections`、`ActionInvoker` 的服务定义 | MCP 组页 l.49（对外提供）、l.391–396（应用服务表）、l.466–472（状态口节）；`packages/mcp/mcp/README_ZH.md` l.9 与英文 README 同行 | 「状态口」一词同时指任务四操作、`EndpointStatus` 与 `release`/`closeAll`；任务四操作其实在 `ActionInvoker`，`release`/`closeAll` 在 `Connections`；成员 README 另称「连接口」 | 见候选 | B | 候选一：口名跟服务走，新设「连接口」专指 `Connections`，任务四操作并入调用口，改组页、领域页、领域流程与成员 README 的口名。候选二：口名不动，只在 l.49 与状态口节各补一句每个操作所在的服务（l.391–396 的表已给出这一映射），并把成员 README 的「连接口」改回表里的叫法。推荐候选二：契约与领域页都不用「连接口」，改名要动领域页与图，没有已提出的需求要它（范围原则）；错位只是措辞。候选二还要处理 `#### 状态口` 的小节标题：它现在罩着四个任务操作，而契约 R7 把「读口、状态口与任务操作」分作三类，写者要把标题或首句改成与表一致 |
| W-10 | 契约裁定第 26、2 条（`McpPorts.checkOutput` 必填、`clock?`） | MCP 组页 l.31–41（需求端口）、l.525 | 组页只写五个需求端口，没写装配方必须另给一个输出校验函数、可选给时钟 | 见候选 | B | 候选一：需求端口节末加一段「另两个非端口注入」。候选二：不写，行为与形状只在契约 SPEC S3、O1。推荐候选二：它们是装配方给的函数，不是需求端口；组页自己说「操作形状见契约 SPEC」；卡正文已有 takeover-plan 第 8 节第 4 项的限定（additive 加限定） |
| TP-pins-M | takeover-plan 第 8 节首条同类（只点名了 Skill 四行） | `mcp/SPEC.md` l.10（`b0f2ec7fb`）；`mcp-contract/SPEC.md` l.11（`21175c9f9`）；`mcp-host-local/SPEC.md` l.10（`03505c68f`） | 三行钉的都是组页旧版本；`03505c68f` 现在等于组页头，写回之后也会过时 | 见候选 | B | 候选一：与 MCP 组页写回同一提交一起移（三行）。候选二：不移。推荐候选一：不移则写回后立刻出现「钉旧版」，与 Skill 侧处理不一致。takeover-plan 没点名 MCP 三行，所以列 B |
| TP-5 | takeover-plan 第 8 节第三条 | `packages/mcp/mcp/README.md` 与 `README_ZH.md` 的 l.70、l.76–83、l.91、l.95（两种语言行号相同） | 「契约」l.70、「SPEC MC-14 怎样兑现」l.76–83、「配置与运行」l.91、「验证」l.95 复述 SPEC 的机制与逐条测试清单 | 删复述，只留用法、装配与指向 SPEC 的链接；卡正文「连接时限起点」一并（见 TP-4） | A | takeover-plan 第 8 节第三条（卡拥有者的接手计划）；`docs/engineering/documentation.md` 唯一源规则 |
| W-11 | 同 TP-5 | `packages/mcp/mcp/README.md` 与 `README_ZH.md` 的 l.74（模块清单） | 一段列出全部模块与职责 | 见候选 | B | 候选一：保留，作为模块导航。候选二：删，指向 `docs/architecture.md`（它已有 `internal/teardown`、`internal/late`、`internal/scope` 等 4 处说明）。推荐候选二：与 TP-5「只留用法、装配、链接」一致，模块职责已有 `docs/architecture.md` 这一个源；takeover-plan 没点名这一行，所以单列 |
| CC-S | skill-contract SPEC「本页封闭的组页未定项」l.39–55（9 行）；source 3 的第二张表 | Skill 组页 l.71、l.77、l.87、l.306、l.324、l.346、l.491、l.524、l.539 | 组页对这些点只写「精确形状见成员规格」，不留「未定」措辞 | 无 | D | 抽查 l.72（精确类型归 `values.ts`）、l.88（`SafeReason`）、l.317–（诊断编号）、l.502（读取目标、字节范围）均已指向契约 SPEC 条款；契约 l.54 另写「第 492 行不在本页封闭」，其拥有者是资产规格拥有者，不是组页 |
| CC-M | mcp-contract SPEC「本页封闭的组页未定项」l.135–156（16 行）与「未封闭项」l.738–740 | MCP 组页 l.170、l.181、l.318、l.330、l.343、l.355、l.374、l.401、l.430、l.445、l.465、l.525、l.599–604（原行号，现行号随写回移动） | 组页在这些点已链到契约条款（S7、S4、E5、PL、UE、R4、R3、R2、S2、T6、R1、S3、C1），或写作剩余义务 | 无 | D | 抽查 l.646（分页数与上界链到 C1、S3）、l.384（授权发现链到 R4）、l.180（`degraded` 原因链到 S7）。未封闭项两条仍然开着，不属本次写回：`deriveDeclarations` 取得清单（组页第 601 行）是领域页登记的剩余义务（`docs/domains/mcp/architecture.md` l.52 与本页 l.738 同一件），归资产 SPEC 拥有者；C1 对 `inputSchema` 的容错归停放项 `w3-mcp-listing`（`waves/w4/plan.md` 范围原则）。组页只说「清单整份发布」（l.290、l.313），没有写「一项不合法整份拒绝」，所以不需要改 |
| TP-8 | takeover-plan 第 8 节第三、四、五条 | 无目标页 | 卡正文、波段 MCP 规格（已标 [x]）、卡评论 | 本表不展开 | D | 第 8 节的卡正文项（SDK 版本、测试验证拥有者、W3 行、冲突项写回）与「`waves/w3/mcp/spec.md` 同步」不在目标页清单；规格同步已完成（第 8 节 [x]）。WF5「出处在途」已由 `3289bee2f` 改为契约 T5 链接 |
| CP-Cordis | context-pack 5.3、第 7 节第 6 条 | Skill 组页 l.587–588；MCP 组页承接缺口表（缺 Cordis 行） | Skill 两行「尚未承接」；MCP 表没有 Cordis 行 | 本次不改 | D | 现状仍然准确；措辞与新增行由 W4-4 在 Cordis 服务键落地时写（`waves/w4/plan.md`；context-pack 第 7 节第 6 条）。MCP 的 `Connections` 是否要服务键也是 W4-0 的决定（context-pack 第 7 节第 3 条） |

## 同一处被几条来源点到

| 目标处 | 合并的条目 | 合并写法 |
| --- | --- | --- |
| Skill 组页 l.349（读取第 5 步） | GS-03、SC-L86、takeover-plan 第 8 节首条 | 一次改写：先删函数名，再按「不带依据才答 `unsupported`」改第一句；带依据时所钉材料规则保留 |
| Skill 组页 l.164、l.182、l.348、l.363、l.441、l.480 | SC-L87（takeover-plan 点名的五处加 l.348）、SC-L86 | 同一个限定词「不带依据时」；l.182、l.442、l.457、l.480、l.417 属 SC-L86，其余属 SC-L87，同一次扫一遍 |
| Skill 组页 l.273、l.305、l.415、l.416 | GS-02、SC-L84 | 一个映射改动，四处文字同步 |
| Skill 组页 l.270–277 | SC-L82、GS-02 | 同一张映射表，一次改 |
| Skill 组页 l.307、l.315、l.419 | GS-01、SC-L81 | 同一规则 |
| Skill 组页 l.355 | GS-04、SC-L85、skill-fix 第 2 轮 N1 | 同一规则 |
| Skill 组页 l.82、l.304、l.323、l.326、l.331、l.479 | SC-L88、SC-L89、`wave-pack`「生态兼容」 | 同一条兼容策略，先写策略一句，再改各处 |
| Skill 组页 l.5、l.579–583；领域页与 README 状态句 | W-2、W-3 | 一次扫完状态句，`SkillCatalog` 已实现 |
| Skill 组页 l.484；README l.56 | GS-07、W-3 | 同一处验证状态 |
| 四份 Skill SPEC 的钉 | TP-pins-S、owner-rulings 第 2 条 | 与 Skill 组页写回同一提交 |
| MCP 组页 l.194 与 `mcp/README*` l.70、l.91 | TP-4、TP-5、`reviews/mcp-lifecycle-r2.md` 冲突项 1 | 起点以 MC-5 为准；README 删复述时不再重写起点 |
| MCP 组页 l.399–403 | GM-5、GM-其余、契约裁定 4、5、6、30 | 删三条，指向 SPEC 已知限制 |
| MCP 组页 l.72、l.83、l.87、l.350、l.624、l.694；`packages/mcp/README.md` l.20、l.29 | W-4、W-5 | W-4（SDK 位置与 SSE，A）与 W-5（版本号，B）在同一行时拆开：先做 A 改动，版本号等 W-5 裁定 |
| MCP 组页 l.3、l.606、l.690、l.705–712；`packages/mcp/README.md` l.3、l.18、l.20 | W-6、W-8、context-pack 5.3 | 一次扫完状态与波次句 |
| MCP 组页 l.49、l.391–396、l.466–472 | W-9、context-pack 5.3 | 同一处口名问题 |
| `G1–G8` | W-4 至 W-9、TP-4、GM-5 | 若卡拥有者选候选二，这些行就是 G1–G8 的取代清单 |

## 清单外的同源页（供卡拥有者决定是否并入）

- `packages/skills/docs/key-flows.md`：l.3（`SkillCatalog` 没有实现）、l.44（name 与目录名不一致一律拒绝，随 SC-L88）、l.60–64 与 l.75–76（目录先核验，随 GS-01）、l.118、l.156、l.161、l.183、l.202（缺 digest 的 `unsupported` 与 `describe`，随 SC-L86、SC-L87）、l.19–20、l.33–34、l.124（`bytes-mismatch` 在检查与快照阶段的答复，随 GS-02）。
- `packages/mcp/docs/key-flows.md`：l.3（调用口「在第三波」，随 W-6）。其余行没有逐行读，写者开工时按同一批条目 grep。
- `docs/domains/mcp/` 下 grep「SSE」「closeAll」「不支持」无命中，领域页只有状态句要改（W-6）。

## 核对的边界

- `G1–G8` 原文不存在于任何落盘文件，上表 B 类候选二是替代方案，不是对号。
- MCP 组页只对照了点名的区域：协议基线、不变式 1–6 与并发、应用服务各口、已知限制、承接缺口表、状态句。没有逐行核对「调用结果」「内容交付」「设置声明」等节。契约裁定第 1–31 条里只有第 1、4、5、6、17、30 条找到了组页对应的陈旧文字。写者开工时对其余裁定做一次 grep，见到新冲突回卡拥有者。
- Skill 组页的行号来自当前树；写回提交会移动行号，写者按文字定位，行号只作指引。

## 卡拥有者裁定（2026-11-06 09:58 UTC）

- **G1–G8：候选二。** 现行对照（W-4 至 W-9、TP-4、GM-5）取代 G1–G8，登记为「原文未留存，由现行对照取代」。原文在 W1–W3 前段的云端会话里，本机取不到；第 3 轮之后契约又改了 30 多条裁定，按当前契约对照才是应然。为补候选二的代价，MCP 写者对组页没逐行核对的各节（「调用结果」「内容交付」「设置声明」及其余）按契约裁定第 1–31 条与 SPEC 条款再 grep 一遍；见到新冲突，属于同一类陈旧文字的照改，属于新的语义分歧的停下回报。
- **W-5：候选一。** 组页保留对 RFC-0001 行的转述，在该处加一句「W3 实际采用 2.4.0，见 `mcp-host-local` SPEC；RFC 的同步归小卡」。`packages/mcp/README.md` 同样处理。
- **W-9：候选二。** 口名不动，补每个操作所在的服务；`#### 状态口` 小节的标题或首句改成与应用服务表、契约 R7 一致；成员 README 的「连接口」改回表里的叫法。
- **W-10：候选二。** 不写；`checkOutput` 与 `clock` 归契约 S3、O1。
- **TP-pins-M：候选一。** 三行钉与 MCP 组页写回同一提交移到写回之后的组页提交。
- **W-11：候选二。** 删 `packages/mcp/mcp/README*.md` 的模块清单，指向 `docs/architecture.md`。
- **GS-05（C）：按候选 A 写回。** 卡拥有者在 `w3-skill-fix` 规格第 4 条已选 A，并已落进契约与成员 SPEC。波末交接里列给负责人复核，可收回。
- **GM-P3（C）：组页无写回。** 波末交接里列给负责人知情，可收回。
- **清单外的同源页：并入。** `packages/skills/docs/key-flows.md` 随 Skill 写回，`packages/mcp/docs/key-flows.md` 随 MCP 写回。不并入就会留下第二个陈旧来源。
- **D 类：** 不动。CP-Cordis 归 W4-4。
