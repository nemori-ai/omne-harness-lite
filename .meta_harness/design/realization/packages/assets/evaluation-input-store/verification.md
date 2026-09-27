# evaluation-input-store 验证与证据

对应 [候选设计](design.md)、runtime3 S-66、AE4 S-6/S-7/S-15/S-29 与 PRE-1～PRE-9、AD1 S-2/S-9、session-tenancy2 S-8、OG2 S-26/S-63；依赖接受状态查 [registry catalog](../../../../registry/catalog.json)。**尚未建包；以下均未执行，绑定 0 条。** 旧 Invocation/Adaptation 模型没有当前源，AE 纯函数测试也不证明持久来源；不为新节点借用这些证据提升状态。

## 共同前提

- 真实 sqlite 文件库、同一 AtomicStorage 实例及真实 account/organization-governance 公开服务；构造本地有效 tenant，不能用 memberships 恒真替身。
- app 使用已获准的 session-tenancy 发布入口，先写真实映射，再捕获 recipe。所有启动迁移在第一次受理前确认；NORMAL 的断电边界保持，不把进程 SIGKILL 等同断电。
- 实际根资产、版本正文、部署 official manifest、层持有与配值经本节点发布面落库，重开后再读。不得直接将一个 fixture EvaluationInput 交给 runtime 来替代本节点。
- 公共函数和 Cordis 包装都须消费实际构件；模拟故障只能改变指定的负控点，保留正常生产链。损坏库 fixture 的读失败测试不得称为合法业务写入。

## 待执行义务

| # | 条款与场景 | 可失败的断言 / 证据 | owner |
| --- | --- | --- | --- |
| EIS-V1 | S-66、AE4 C15/C16/PRE-9、AD1 S-2：真实治理建 tenant → 发布 A/v1 根正文、引用资产与各层持有 → 真实 session 映射 → 捕获 recipe → 重开 → read → evaluate | 实际返回 root.source 对应库中同一不可变正文；references/attributes 精确匹配，正文未知字段和精确数字回读无损；定义、持有、session、standing 均有真实发布/捕获记录，不能是固定回调 | 本节点 + AE/AD + acceptance app |
| EIS-V2 | S-66①②③⑥⑧：错误 session/tenant、另一租户源、缺 recipe、缺 scope、源不可读、历史 manifest 仍有合法 E | 畸形参数 invalidInput；其余具名 unavailable，零成功输入；绝不借别会话、旧 E、固定时限、空定义或进程身份补齐。显式空的已发布层可成功，缺行不能等同空 | 本节点 + runtime |
| EIS-V3 | S-66 来源1、AE4 PRE-3、OG2 S-63：创建时 capture standing；通过真实 OG changeRole/remove 改当前成员事实，之后 read；在 read/capture 的真实参与调用注入存储异常 | 有效而角色变化时 input.standing 仍为捕获值；撤销后 read unavailable；资格不可读也拒绝。重启不刷新/改写 captured standing，伪造有效常量或复制当前角色的变异失败。参与异常先到共同单元终结/回滚，再由 atomic 外层映射；记录实际终结早于对外失败，负控在 unit 内吞异常后正常返回须被检出；未确认提交不得断言无效果 | 本节点 + OG + acceptance app |
| EIS-V4 | PRE-1/S-66④：在读取资格与输入之间用另一真实事务改层锁/持有或撤销成员；同时两个发布者竞争同一 expectedRevision；在读取源选择与正文之间发布 v2 | 同 SQLite atomic 保持整次有效旧输入或完整新输入，不出现新持有配旧资格/旧锁；两个发布者恰一批成功，版本前缀不变。负控拆成独立资格读及输入读、去掉 revision 判定/约束，必须分别产生断言失败。记录实际连接/事务与调度屏障 | 本节点 + storage/OG |
| EIS-V5 | AM3 S-9/S-18、AE4 C9/C15/C16：current 发布 v2 后读新版；pinned 保持指定版；锁/禁用/usableBy 导致不同资产选择；只改 source 版本或把旧 body 与新版本混拼；等值数字拼写与精确值 | 与共享 AE 选择构件同一结果；不改 versionSelection、不读取 draft、不用字典序选版本，2 与 2e0 不成为两个版本。已发布版本修改/缺号拒绝，缺正文/无确定根源 unavailable；root 声明未知项不被忽略。超大数字比较另测公共工具，不能伪造缺少 1…n 前缀的“合法超大版本线” | 本节点 + AE/AD |
| EIS-V6 | PRE-2/4/5/7/8：出厂 manifest 少 official 或 meta 未锁；organization 外层来源失效；shared/沿 shared；明确无 workspace 与已挂载但读不到；需要尝试动作集 | factory 不完整拒绝；已知失效与未知分别处理，不能把未知 share/workspace 丢掉继续。no-workspace/no-MCP 正常分支必须真实可运行；受阻分支 unavailable，不返回空 fetched。不冒称工作区、分享或执行权限纵线已验 | 本节点 + acceptance app；受限来源 owners |
| EIS-V7 | AM3 持久/原子及 S-66：发布记录/版本/层行写至中途杀进程、提交后回执前杀进程、同文件重开；捕获后重开 | 未提交整批不可见；已提交版本及配值齐全；捕获事实不变；修订和实际表可核结果未知，不自动重放改写已发布版本。不存在只有新 source 标号而正文仍旧的状态 | 本节点 + storage |
| EIS-V8 | S-66 消费时点：开 C1 后通过真实发布面修改组织/租户 model 及两个时限，**不 reload manifest**；再 effectiveModel 开 C2、C1 dispatchAgain；另注入缺时限和源失败 | C2 basis 使用新锁，C1 adaptation/model 保持原绑定；C1 新发出使用当前时限，已发出不追改。所有失败零 HTTP，无新锚点/响应/终结，原调用状态保留。核生产者 evaluate 准入与 runtime evaluate 两次的同值 input/同 BodyContracts，并记录两次求值的次数、各耗时和输入规模；在真实 SQL 边界分别量测 atomic 申请至取得事务锁的排队时间、取得锁至实际提交/回滚释放的持锁时间，关联持有数、资产数、读取版本数和版本正文总字节数，覆盖不同规模及竞争读取，保留实际边界读数而不以纯计算耗时估算；不新增缓存/validator。selector 成功但后续 C10/环/不支持类别失败不得从端口成功返回 | runtime + 本节点 + acceptance app |
| EIS-V9 | S-66⑨/S-63：正常读取、资格失效、source 缺席、版本/正文不符、诊断端口中断 | 依据可关联 session/真实 tenant/源修订/actual root source 与失败阶段；无正文、配值原文、秘密；诊断失败可见且不能生成业务成功或假事务终态。输入对象被外部修改不改变已返回的复制值 | 本节点 + 观测 owner |
| EIS-V10 | 真实 Cordis4.0.4 卸载/替换依赖，同时存在阻塞 atomic 读/发布；直接闭包消费者重复同场景 | 关闭准入后的新调用拒绝；在途 Promise 真正结束后才关闭 storage/OG。取消请求不等于已停，不丢子任务或提前释放同一 unit；旧闭包不能读新实例隐式资源，重开仍读实际源 | 本节点 + kernel/storage + acceptance app |

## 静态与制品核对

公开包消费者只导入各 owner 的公开入口；新节点无读取 OG 私有表或源码私有路径、无拷贝选择算法/输入 Schema、无 manifest→input 反推。发布入口只由验收装配/明确的框架消费者持有，runtime 的服务面只有 read。检查器要带违规即失败的负控，不只统计方法名。实际包导出及严格类型采用真实 AE4/AD1/OG2/storage 制品验证，不能以源码可读冒充制品可用。

## 覆盖缺口

| gap | 受阻责任 | owner 与闭合条件 |
| --- | --- | --- |
| EIS-1 | S-66/AE4 已明确区分捕获配方与当前资格；精确采用状态见 catalog，真实检查仍未验 | spec 接受者及本节点/OG owners；EIS-V3/V4，不自行豁免当前资格 |
| EIS-2 | 根 selector、AD1 提取的公开组件与两次纯求值采用闭包 | core AE/AD owners；真实共享实现及制品消费，完整纯准入用已有 evaluate，不另建输入 judge；两次计算仍不能证明 PRE 来源 |
| EIS-3 | shared/workspace/MCP 分支 | 各来源 owner；本轮正确拒绝，不声称实现这些分支；no-workspace/no-MCP 本机源仍须完整验收 |
| EIS-4 | 真实会话映射写入允许范围 | session-tenancy owner/主线更新新 app 采用与导入检查；无产品会话创建承诺 |
| EIS-5 | PG、跨库或据点远端副本 | storage/治理 owner 另行给相干读协议与证据；当前有限 SQLite 结果不外推 |
| EIS-6 | 全部实现与实际组合 | 本节点/runtime/acceptance app；EIS-V1～V10 的适用范围逐项执行、独立验收后才登记绑定 |

## 实际执行

2026-09-27，rev 2 补充 SQL 成本量测及 OG2 S-63 参与异常边界后，实际运行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal registered --gate internal`，退出 0，输出末行为 `PASS: design tree /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/.meta_harness/design passed gate=internal; formal=registered.`。formal 项只报告 `registered; execution was not requested`。

本节点无实现测试、真实 IO 或 formal run。文档检查不表示独立评审、采用或实际实现完成。

## 部署清单与固定根读取补充义务（candidate，2026-09-27）

对应 [v3-source-interfaces.md](v3-source-interfaces.md)，只是新增技术投影的证据义务，不改上文已采用设计或历史结果。新增 bindings 为 0；当前 EIS 有施工源码，但两个新增接口尚未采用/实现验证。D-074 的 EIS/registry 输入哈希与当前字节一致；本段不能据此声称新接口已接受。

| 编号／条款 | 真组合与可失败的判据 | owner／状态 |
| --- | --- | --- |
| SI-V1：AM3 S-20；AE4 PRE-2 | 可信配置包含一条 meta=true、一条 meta=false 的真实官方能力及各自出厂持有：完整对应才能发布。分别反转两锁、漏一部署项、添额外项、重复能力、meta缺席/非布尔、向发布请求自带 meta 权威，均拒绝且 head/版本/层不变；不可从命名前缀判定。移除其中任一 iff 校验的负控必须失败 | EIS/acceptance app；未执行 |
| SI-V2：AM3 S-20；EIS 发布原子性 | 本批只更新 tenant、不带 factory，仍真读旧 factory 并核完整部署项；部署清单 meta 改变而旧持有未改，不能绕过。两个发布者竞争同一 head、写到中途故障、回执未知后重开；完整清单与目标表同批，未确认不能猜成功。旧裸 CapabilityId[] head 明确拒绝，不补 false、不从 immutable 推 meta；更换构造参数后原闭包的冻结清单不随外部对象修改 | EIS/storage；未执行；旧库接续 SI-G2 待 owner 明确 |
| SI-V3：AR3 S-22/S-23/S-24/S-48；AE4 PRE-9 | 真实 A/v1 正文→evaluate→fill/given，同会话 manifest 认回原装配来源→受限 read。源码不从 E.values 拼 root；实际固定 body 的 references/attributes/unknown字段/精确数与 A/v1 一致。重新完整 fill A/v2 与重启后，必须有可核实的新原装配依据；缺定位值、错误会话壳、root 生效项缺失/不唯一不调用 read，不用 source_at_creation 或最近 readEvaluation 猜根 | registry/manifest/EIS/app；来源认回 SI-G1 阻断完整重启场景 |
| SI-V4：AE4 C16；AR3 S-16/S-23⑥⑧/S-24⑥⑧/S-50.5 | 先固定 A/v1，再只更新真实 current 持有为 B/v1 或 A/v2；固定读的实际 selector 与 evaluate 产生可核对 C16 rootSourceMismatch。真正 registry reload、refresh start/continue 均 unavailable，六表/head/history不变、零新报告；input 中 rootSource/正文仍 A/v1，current 未改 pinned、旧持有未伪造。单独注入 invalidInput 或假诊断字符串不能通过；负控自动改 rootSource、吞 C16、返回权限分项失败必须失败 | EIS/AE4/registry/app；未执行 |
| SI-V5：AE4 C16 无根分支及 AR3 失败顺序 | 当前无生效根时 selector missing，不制造 mismatch；固定正文仍真实可读，AE 按自身规则交 unresolved，registry沿既有失败处理。另以真实正文造 compositionCycle/categoryUnsupported，输入面不能吞成 unavailable；registry必须原样转交。缺 purpose、畸形 rootSource、错tenant、缺固定版本、body provider unavailable、纯构件抛程序异常分别核闭合分支，不能一律转 C16 或 invalidInput | EIS/core/registry；未执行 |
| SI-V6：OG2 S-26/S-63；AE4 PRE-1/PRE-3；AR3 S-20/S-24② | 真 OG 改角色但仍 effective：reload input.standing 取本次当前角色，refresh 取捕获角色；两者当资格撤销/未知均 unavailable。撤销和发布在读取前后两种事务交错，固定正文/当前holders/versions/资格来自同一 SQLite 原子单元，跨 storage 实例参与被拒。参与异常逃出 unit 并实际终结后才外映射；吞异常后成功返回的负控失败 | EIS/OG/storage/app；未执行 |
| SI-V7：事务后纯阶段与 SYS-OBSERVABILITY | 在真实 storage 锁取得/释放边界与公共 extract/selector/evaluate 边界记录时点：最后实际事务结束必须先于纯阶段。测申请→锁取得、持锁→提交/回滚、各纯计算次数/耗时，关联输入规模；混入membership前耗时当锁排队、纯计算留在事务内或用JS回调开始假冒SQL锁取得的负控失败。body/配值/秘密哨兵不得出现在诊断；sink失效只独立降级 | EIS/storage/观测/app；未执行 |
| SI-V8：公开边界、版本闭包、装卸 | 独立包消费者仅通过 `./registry-inputs` 和各 owner 公共入口编译/运行；runtime服务仍仅 S-66 read。违规产品runtime/adapter/工具 import、转导出或私有表访问负控失败；无复制Schema/选择器/BodyContracts。close时停新调用并等待被阻塞的实际atomic与纯阶段，storage最后关；旧闭包不读新实例依赖，无隐藏重试/悬空Promise | EIS/结构检查/app；未执行 |

新增停止点分别为 SI-G1（原装配来源认回，registry owner）、SI-G2（旧裸部署格式接续，EIS/storage/装配 owner）、SI-G3（工作区/MCP/分享实际来源，对应 owner）、SI-G4（本稿采用及真实组合证据，主线/实施者）。新增输入面不能关闭完整产品会话、工作区或中心复制缺口；无真实来源保持 unavailable。成功与失配都使用公共纯构件及真实源，不以 fixture EvaluationInput 或假身份服务替代。

本补充实际运行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`，exit 0，末行 `PASS: design tree … passed gate=internal; formal=skip.`；形式项均明确 skipped。新补充稿的 Prettier check 与两条授权路径的 `git diff --check` 均 exit 0。字节核对确认原 design SHA 仍为 `01e0d2a1ff4fbdaab11321a1126bec8e0e3c01d91a18e8c1f6e3cd162a134bd4`、本节之前 verification 的 SHA 仍为 D-074 的 `96c0cb5fa64ff0ccdd060ae604fa8c6e296a2172b465cd15c1b5e6803a855d26`。这里没有新实现测试或模型验证结果，不新增 bindings。

## 2026-09-27 实际组件实现与检查

源码已建于 `packages/assets/evaluation-input-store`，包含普通读取、受限固定根读取、发布/捕获、迁移及 Cordis 插件。D-074/D-077 的采用范围不变。真实 SQLite/account/login/OG/STT 组件测试共 45 项通过，build 与 typecheck 退出 0；静态边界工具完整 386 项测试通过，实际源码扫描通过。实际记录见 [组件证据补充](../../../../record/evidence/2026-09-27-probe-model-request-runtime/component-checks.md)。

本次为实施者组件检查；没有独立验收结论，不将各表的场景自动标成完整通过。原 fill 来源认回 SI-G1 仍待 manifest/registry 真组合；runtime 消费、两次求值的端到端量测、完整 source 竞争负控及验收应用未完成。bindings 仍为 0，生产模型认证仍为 0/37。上文“无实现”的历史读数由本段接续，不重写旧采用输入。

## 历史正文读取增量义务（candidate，2026-09-27）

对应 [v4-history-source-interfaces revision 1](v4-history-source-interfaces.md)。D-079 已接受 MF4/AR4 契约和 MF4 provider；本增量尚未接受，新增 `./registry-history` 尚未实现。以下均**未执行**，旧 45 项检查不补证本面，bindings 保持 0。HI-G1/AR4-G3 在真实成功恢复完成前保持阻断；不得把 unavailable 当本轮验收终点。

共同前提：真实 SQLite 文件库、真实 account/login/OG/STT，真实 EIS 发布和不可变版本；真实 evaluate→AR fill→MF append 存下原表。随后真实 AR/MF 公共 readHead/readHistory、真实历史 source 和 AR lookup/list 组合，销毁并重新构造提供者。允许注入故障点，正常路径不得替换为 fake membership、手写 record 回调、private SQL 读、fixture EvaluationInput 或 EffectiveAssembly 反建正文。损坏库 fixture 必须明确是负控，不能称合法发布。该闭包不发模型 HTTP，不产生计费；这些组件证据不能计为模型认证。

| 编号／条款 | 可失败的验收义务 | owner／证据界限 |
| --- | --- | --- |
| HI-V1：AR4 S-7/S-18/S-25/S-26/S-33；MF4 S-18/S-24 | 从真实 A/v1 正文、显式 O 和求值建立 fill 与旧 run 报告；之后真实发布 v2、移除 v1 持有并换表，再关闭/重开 MF/EIS/registry，以旧报告 lookup/list。必须成功返回旧表的 A/v1 正文/顺序及原报告 availability；不换新 body/current table/given。另用当前六类表全部换过和 reuse 收窄的局面恢复保留下来的原条目；对具名缺源分支返回 unavailable 不能让这项通过 | registry/MF/EIS/app；完整成功链未执行，HI-G1/AR4-G3 |
| HI-V2：AM3 S-4/S-9/S-10；CB3 无损；AE4 PRE-9 | 正文放未知合法成员、嵌套数组、大整数/精确小数；版本号以数值等价表示核对，返回完整 AssetVersion 且原 publishedBy 缺席保留。真实发布后更改调用方对象不得影响已存/已返回值。查出的源 id/capability/category/精确版本须逐项一致；相同 capability 的别资产、v2/草稿替代 v1、浮点舍入、浅共享变异负控均失败 | EIS/core/app；真实 IO 加纯值判定，不能只测类型编译 |
| HI-V3：MF4 S-18/S-21；AR4 S-31/S-48 | 使用真实 MF.readHistory 记录实际调用次数和返回壳。分别改 session/tenant/category/filledAt/capability/asset/version、让 tuple 仅存在 E.assets 而不在实际表、reuse 已删项、重复 tuple、壳/session/表时刻不符，均不得交正文；跨租户 STT 不符必须零 MF/source 读取。MF 坏/缺源不能转 none、空正文或回退旧时刻；inject 一个未经真实 MF 的任意 DTO 不能完成正常路径 | EIS/MF/registry；AR 仍另验完整 E/O/filledBy/reuse 和报告 runId/attempt，不把局部 tuple checker 当全 AR 验证 |
| HI-V4：STT2 S-8；OG2 S-26/S-63；AR4 S-20 | 真实创建 effective tenant 后改角色、撤销、恢复：历史读只以本次当前资格为门，不从 captured standing 兜底、不重求 report gate；所有 AR 原现读/报告门控仍运行。真实撤销分别在 EIS atomic 之前与之后排序，核各自结果；跨 storage 参与拒绝。参与异常必须传播到 atomic 终结/回滚后映射，unit 内吞错后成功的变异失败 | EIS/OG/registry/storage；不宣称返回至工具执行期间持续授权 |
| HI-V5：AR4 S-33 失败；提供者闭合结果 | 畸形七字段请求在任何依赖读取前 invalidInput；无映射、tenant 不符、MF recordNotFound/unavailable、坏表关联、资格未知、缺目标版本、坏严格 JSON、正文 provider 缺席与存储不可用分别落既定 stage。内部已合法请求被下游拒绝不归用户 invalidInput；程序异常必须暴露。一个条目不可读令 AR 整类重建 unavailable、零部分表/新报告/写入；故障恢复后真实原版本可重新读，不缓存失败为永久 absence | EIS/registry；正常请求与故障 fixture 分开记录 |
| HI-V6：AR4 S-51/S-52；MF4 S-36；runtime3 S-66 | H 的旧表读出后并发新 given/mint/reuse，EIS 再发布 v2/移除旧持有；历史面仍读实际旧 tuple 的 v1，不调用 readGiven/selector/evaluate，不要求最新 H/C16。独立固定根 reload/refresh 仍经 readGiven(H) 和 registry-inputs 产生真实 C16；历史面成功不能吞那条失败。再调普通 S-66：unheld 历史资产不得混入 definitions，scope/current-pinned 均无写改 | EIS/MF/registry/runtime/app；三个读取用途分别记录，不能互借成功 |
| HI-V7：装卸与依赖换代 | 阻塞真实 MF 读和 EIS atomic，调用 close：新调用 stopped，在途没收口 close 不完成，registry 不 close 借用 reader，storage/MF 不提前关闭。模拟新 MF provider 及新 registry：app 明确停旧准入/排空/close，再传新真实 MF；对新 registry 偷用旧关闭 reader 的负控失败。旧报告继续依持久原 locator 恢复；无悬空 Promise、无隐藏重试，无取消请求冒充实际停止 | EIS/registry/app；公共闭包与真实 Cordis 宿主各测；basis probe 不能代替本组合 |
| HI-V8：真实观测与 pure 边界 | 记录 STT/MF 实际读往返、atomic 实际锁取得/释放、事务后解码/AM/BodyContracts 开始/结束；最后实际事务结束必须先于纯阶段。不同版本数/字节数及并发发布压力下分别量测 MF 额外回读、排队、持锁和 pure 成本，不用回调开始冒充锁取得。selector/evaluate 计数必须 0。正文/配值/secret 哨兵不在 log/trace，sink 与后备失效不得伪造成功或改变失败；阶段未知不补 seq/ref | EIS/storage/观测/app；明确量测环境与范围，没有本轮吞吐保证 |
| HI-V9：公开入口、AST 与权限交付 | 正常 app bootstrap 构造真实依赖，registry 仅 type import＋借用 read，外部独立包 fixture 经 exports 编译/运行。分别让 runtime/runner/adapter/tool/其他 apps/src 导入或转导出新面；named、namespace、dynamic import、路径别名/private src/私表访问及 wrapper 转发负控必须被 gate 否定。registry src 值导入 factory 也拒绝。未获闭包的租户即使知道 tuple 也无调用入口，tenant 参数不充授权 | EIS/静态工具/app；AST 不宣称进程内安全沙箱，真实闭包分发与入口授权另验 |

覆盖缺口：HI-G1 是旧报告与未持有版本的成功交付，owner 为 registry/MF/EIS/app；HI-G2 的报告/原表完整用途校验仍归 AR owner，不由本面判定；HI-G3 保留跨库 EIS/OG 与非本机历史来源分支；HI-G4 是新入口 guard、关闭和观测接线。新稿静态检查结果只能证明文档可被工具读取，实际组合与独立验收状态仍为尚无，不新增 formal 或 bindings。

## 2026-09-27 历史正文组件检查补充

D-080 精确采用后的源码、配置及原始运行见[历史正文组件证据](../../../../record/evidence/2026-09-27-probe-model-request-runtime/eis-history-component-checks.md)。EIS68/工具428项测试、构建/类型检查及实际27+6规则扫描通过。保留 HI-V1～9 的原待执行义务，不将完整组自动标为通过：真实 MF tuple fixture/本机发布版本/STT/OG atomic/重开/零 IO/close/异常分离只关闭归档内组件场景。AR完整producer及旧报告成功恢复、完整制品/宿主换代、装配退化查询和OS边界尚未验证，HI-G1/AR4-G3/SI-G1仍开放；bindings0。
