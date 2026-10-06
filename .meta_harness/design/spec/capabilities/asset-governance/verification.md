# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：未开始。**`capability.asset-governance` v2 是 `candidate`，经独立评审第一轮（处置表），未接受、未冻结；尚无提供者设计、尚无源码、尚无装配。
> 下表登记的是**已经触发的证据义务**，不是已完成的检查。**十条规范场景一条都没演练，四条静态检查一条都没执行**——文件存在不代替结果。
> **本契约没有形式工件**，因此 `formal-tasks.json` 里没有它的任务；这不是把义务省掉，理由见[形式化工件](#形式化工件)。

## 证据义务

### 规范场景

| 规范条款 | 证据形式 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| [S-54 结构性禁止与权限判定分得开](v2/contract.md#s-54-结构性禁止与权限判定分得开) | 演练，四次调用同跑；**发起者之一必须是超管** | **未执行** | 责任：提供者。超管那一支是区分 `crossTenant` 与 `notPermitted` 的唯一输入——一个把租户层越界实现成权限判定的版本，只跑普通成员那一支看起来完全正常 |
| [S-55 上层锁住的，下层写不进去；解锁不回溯](v2/contract.md#s-55-上层锁住的下层写不进去解锁不回溯) | 演练 ＋ **真并发**一支 | **未执行** | 责任：提供者。**并发那一支不能用两次顺序调用代替**：顺序调用不经过 [S-21](v2/contract.md#s-21-读到的依据与写入落在同一次可串行化的提交里) 要保护的窗口。锁的**效果**（下层被截断）归 `capability.asset-evaluation` v2 的证据，本条只证写时守卫 |
| [S-56 移除与禁用可分辨](v2/contract.md#s-56-移除与禁用可分辨) | 演练，**两路同跑、看设置视图** | **未执行** | 责任：提供者。「agent 那一侧两者一样」归求值与装配的证据，不在本条 |
| [S-57 official 动不了，但可以不持有](v2/contract.md#s-57-official-动不了但可以不持有) | 演练 ＋ 同内容连调两次登记 | **未执行** | 责任：提供者。**「移除组织层那份之后出厂层那份还在」必须真读**——只看返回值 `ok` 证明不了官方件没被清空 |
| [S-58 先告知再移除](v2/contract.md#s-58-先告知再移除) | 演练 ＋ **真并发**一支（读到集合之后、提交之前插入一个新引用方） | **未执行** | 责任：提供者。tool、skill、slash_command 与 plugin 四类的组合引用已有出处（[契约 S-4](v2/contract.md#s-4-依赖方向与被消费的面) 正文契约侧），**agent_definition 仍缺**（[G-5](v2/contract.md#十二已知缺口)），演练的范围里不能有它。并发那一支证的是谓词读被保护——只锁已存在行的实现在这里露馅 |
| [S-59 版本号连续与认回](v2/contract.md#s-59-版本号连续与认回) | **真并发**演练 ＋ 重放 | **未执行** | 责任：提供者。**必须核存储里的版本线**，只看两方返回值会漏掉「两个都写进去了、只是一个返回失败」 |
| [S-60 提升不可逆](v2/contract.md#s-60-提升不可逆) | 演练（含「已分享出去」那一支）＋ 静态核对（写所有者的路径恰一条） | **未执行** | 责任：提供者与静态检查（[SC-1](#静态检查义务)）。**必须真读提升之后那份租户层持有**：只看返回值 `ok` 证明不了依据被改写、配值没被动 |
| [S-61 判不出来与判为拒绝分得开](v2/contract.md#s-61-判不出来与判为拒绝分得开) | **故障注入，三路** | **未执行** | 责任：提供者。**(c) 那一路要一个「投影规则缺席」的部署**——`loop_extension`、`agent_definition` 与 plugin 自己的项本版本来就推不出（[G-5](v2/contract.md#十二已知缺口)），它在真实装配里就会发生，不只是注入 |
| [S-62 不泄漏存在性](v2/contract.md#s-62-不泄漏存在性) | 演练，**两组同跑、比对逐字相同** | **未执行** | 责任：提供者。分开跑证明不了「不可区分」 |
| [S-63 钉住的不随发布走，分享来的钉不住](v2/contract.md#s-63-钉住的不随发布走分享来的钉不住) | 演练，**发布前后各读两层** | **未执行** | 责任：提供者。**必须比对发布前后的持有逐字不变**——一个「发布时顺手把 `current` 物化成号」的实现，只看表单会以为正确。表单按哪一版推依赖正文的投影规则（[G-5](v2/contract.md#十二已知缺口)），演练用已有规则的类别 |
| **每个操作的 `invalidInput`**（[S-17](v2/contract.md#s-17-缺席时的默认答案)、[S-18](v2/contract.md#s-18-失败值闭合)） | 演练：**二十四个操作**各传一次缺席／不合形状的身份参数；`registerOfficial` 缺一次 `meta`；写面各传一次出厂与工作区的 `scope`；配值面与项锁各传一次 `item = disabled`；`hold` 传一次不合形状的 `versionSelection`；`createDraft` 缺一次 `byAgent` | **未执行** | **必须观察到** `invalidInput`，**不是 `unavailable`、不是各自的 `…NotFound`、不是 `notPermitted`**。责任：提供者 |
| **记录的 name 不合正文契约的收窄**（[S-18](v2/contract.md#s-18-失败值闭合)、[S-24](v2/contract.md#s-24-createdraft-创建草稿)、[S-25](v2/contract.md#s-25-updatedraft-修订草稿)、[S-29](v2/contract.md#s-29-registerofficial-登记官方件) 的 ③） | 演练：以一个拼不出条目名的 `mcp` 接入点 name（例如以 `_` 结尾，`data.mcp-endpoint/v2#S-26` 第 3 条）各调一次 `createDraft`、`registerOfficial`；同名改成合收窄的再调一次。**草稿与发布那一支**换成斜杠命令（`mcp` 的 name 在 `createDraft` 时已判、此后不可改，经写面构造不出）：对一条名字不在保留区的自定义斜杠命令记录调 `updateDraft`，把绑定种类改成 ③ 型；再对一份草稿已被改成这样的记录调 `publish`（构造：直接写存储，模拟规则收紧之后的旧草稿）。**次序那一支**（[S-19](v2/contract.md#s-19-判定次序)，D-060 §七 M26）：以一个看不见那份记录的调用方对它调 `updateDraft`，`content` 的类别与记录不符 | **未执行** | **必须观察到** `invalidInput`，前一支**诊断值恰是 `name_not_projectable`**（`data.asset-model/v2#S-27` 原名携带），不是 `name_invalid`、不是 `malformed`、不是本契约另起的名字；合收窄的那一次照常成功、不修补名字。草稿与发布那一支两次都是 `invalidInput`、诊断 `name_reserved`（`data.slash-command/v2#S-4`）。次序那一支是 **`assetNotFound`**，不是 `invalidInput`——后者会泄漏记录的类别。责任：提供者 |
| **[S-19 判定次序](v2/contract.md#s-19-判定次序)** | 演练：[examples 第三节末](v2/examples.md#三十九个失败值各一个反例)的两个对照 ＋ 每个操作至少一对「两个条件同时成立」的输入 | **未执行** | 责任：提供者。**同一输入同一答案**——次序漂移的实现在单条件反例里全部正确 |
| **[examples.md](v2/examples.md) 的五条旅程（含删除与告知、读记录）与十九个反例** | 逐行演练，比对「结果」一列 | **未执行** | 责任：提供者。本页的结果列是起草者按条款手推的，**不是独立实现给出的**；第一次真跑时逐行记下与手推不一致的地方，回到契约裁 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。**本版全部「未开始」**，检查器形式归 realization。

| # | 检查什么 | 对应条款 | 状态 |
|---|---|---|---|
| SC-1 | 写记录所有者的路径恰一条（提升），且它只从租户写到该租户所在的组织；写持有依据的路径只有加入与提升两处；不存在写作者、写 `byAgent`、写 `origin`、改写或删除单个版本的路径 | [S-5](v2/contract.md#s-5-资产记录与它的两个标识)、[S-6](v2/contract.md#s-6-草稿与版本线)、[S-7](v2/contract.md#s-7-所有者与作者) | 未开始 |
| SC-2 | 写面的 `scope` 参数类型是 `ScopeLayerIdentity`，不是 `HoldingScope`；不存在写出厂层或工作区层持有的路径（[S-29](v2/contract.md#s-29-registerofficial-登记官方件) 建出厂层、按部署清单写它的 `immutable` 那一处除外） | [S-8](v2/contract.md#s-8-official-记录与出厂默认层的持有)、[S-9](v2/contract.md#s-9-持有本契约写得到的两层与写不到的两层) | 未开始 |
| SC-3 | 不存在以成员关系变化为触发的写路径；资格判定函数的入参只有（身份值, 持有记录, 成员资格效力） | [S-16](v2/contract.md#s-16-谁能做角色矩阵落成的四种资格)、[S-47](v2/contract.md#s-47-解除成员不动任何持有) | 未开始 |
| SC-4 | 直接入口的签名里没有 `lineage`、没有与 `caller` 分开的 `author`、没有 `sharing`、没有 `basis`；`byAgent` 在入口层按调用来源定、不取自请求体；`registerOfficial` 只在装配启动时调用、不在任何租户可达的入口上 | [S-46](v2/contract.md#s-46-组合入口资产流转的确认步骤)、[S-50](v2/contract.md#s-50-装配给的保证-vs-协议须给的保证) | 未开始 |

### 由别处承担、本契约只写明要求的

| 要求 | 谁的证据 |
|---|---|
| 锁截断、禁用析取、工作区滤权、团队资产不出那棵树 | `capability.asset-evaluation` v2 的结构模型与场景 |
| 解除成员之后再加入，持有原样可用（跨契约） | [`capability.organization-governance/v1#S-49`](../organization-governance/v1/contract.md#s-49-解除之后再加入回来的是同一个租户) 与本契约 [S-47](v2/contract.md#s-47-解除成员不动任何持有) **两侧一起跑**；只跑一侧证明不了 |
| 复制落地、分享确认与本契约组合入口的写入同一次提交（两份契约同一提供者，主线裁定 D-060 §一 PA-3） | `capability.asset-transfer` v2 的模型与演练 |
| [S-50](v2/contract.md#s-50-装配给的保证-vs-协议须给的保证) 左列（装配给的） | 装配与提供者设计的选型声明 ＋ 架构评审；它们失效的形态多半是**静默**的，上面的场景大多测不出 |

## 结果与反例

### 尚无的记录

上面全部义务尚无执行记录。首次执行时在此记录工具与版本、环境、配置、输入范围、可复现步骤与原始结果位置；
原始产物归 record/evidence/。记录时分开陈述：演练结果、故障注入结果、静态检查结果、真实组合的符合性。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建**；理由在[契约 S-53](v2/contract.md#s-53-本版选用哪些形式工件)与[包入口](README.md#版本包)。
**「未运行」如实登记**：没有模型，也就没有任务、没有执行、没有结果。
若评审认为 [S-21](v2/contract.md#s-21-读到的依据与写入落在同一次可串行化的提交里) 的谓词读保护值得一个行为模型（「确认集合之外冒出新引用方而删除照样成功」这一交错），
那是一条新增的证据义务，登记在这里、模型进新的候选修订；本版起草时判断它是存储给的前提，由 [S-58](v2/contract.md#s-58-先告知再移除) 的并发一支取证。

## 变化的影响

| 日期 | 改了什么 | 哪些证据仍适用、哪些要重建 |
|---|---|---|
| 2026-09-23 | **首次起草**（候选 v1） | 无既有证据。**本契约依赖的 `data.asset-model` v2 与本契约并行起草、尚未定型**：它的 `$defs` 名或两条判定条款一旦改名或改义，[契约 S-4](v2/contract.md#s-4-依赖方向与被消费的面) 的「资产数据形状侧」、[S-9](v2/contract.md#s-9-持有本契约写得到的两层与写不到的两层)～[S-11](v2/contract.md#s-11-禁用) 与 [examples](v2/examples.md) 的 JSON 要一起改；catalog 那一条依赖要在合流后补登（[包入口](README.md#catalog-映射)） |
| 2026-09-23 | **纳入主线对 `data.asset-model` 对齐后的六条更正**：① 记录不设「同所有者同标识至多一份」，唯一性只在持有上（`data.asset-model/v2#S-18`）；② 项锁对保留项 `disabled` 收 `invalidInput`（不另立失败值），官方件的持有上没有 `disabled` 真值；③ 持有带 `versionSelection`，`hold` 缺省 `current`，新增 [S-36 pinVersion](v2/contract.md#s-36-pinversion-钉住一个版本)／[S-37 unpinVersion](v2/contract.md#s-37-unpinversion-回到追随当前版本)，`shared` 恒为 `current`；④ `HoldingBasis` 五支、`hold` 自动定依据、不再收 `basis`；⑤ `createDraft` 必填 `byAgent`；⑥ 能力标识词法引 `data.asset-model/v2#S-2`。**随之的推导改动**：[S-27 提升](v2/contract.md#s-27-promotetoorganization-提升到组织)改为同提交把 caller 那一份持有的依据改写为 `organization`（不再要求先移除）；G-1、G-4、G-8 闭合，G-2 收窄，新增 G-18、G-19。**原 S-36～S-60 顺延为 S-38～S-62**，新增场景 S-63 | 无既有证据，不受影响。**条款号顺延**：本轮之前若有任何地方抄过本契约 S-36 及以后的号，全部要按 ＋2 对齐（registry 在本轮之后才登记） |
| 2026-09-24 | **整批对齐**（主线裁定 2026-09-23，待产品负责人确认，账本 S11 与 A 块）：`data.asset-model` 依赖按条款号补登，另登五份正文契约的规则条款（[S-4](v2/contract.md#s-4-依赖方向与被消费的面)）；租户格以 `organization` 依据持有经分享持有的那一份（S11-G2）；同一份记录不算替换、锁下只收 `current`（S11-G19，新 G-20）；所有者一侧只见本组织成员租户层的持有份数、删除告知发给持有租户（S11-G18）；新增 [S-64 readAsset](v2/contract.md#s-64-readasset-读一份资产记录)、[S-65 readVersion](v2/contract.md#s-65-readversion-读一个已发布版本)（S11-G9）；配值带 `since`（S11-G14）；审计 = 事件落成的记录条目，事件另带操作者与依据（S11-G17）；官方件在装配启动时按部署清单登记，`registerOfficial` 新增必填 `meta`、出厂层持有的锁按它写（A-M17；与 `capability.asset-evaluation` 的 PRE-4 对齐，原 G-11 闭合）；斜杠命令保留区按 `data.slash-command/v2#S-4` 判（原 G-15 闭合）；组合入口的写入并入资产流转确认的那一次提交（A-M5、PA-3）；删除后已发布版本作不可解引用的归档保留、持有方读到「已删除」（A-M25）；分享结束后的 `shared` 持有留着（A-M21）；配值写的过期编辑守卫记 G-21（A-M15 后半）；对账报回两条：「装配给」表加「事实可整体导出、导入」一行（R-98，消费 `data.asset-model/v2#S-25`），个人组织被清除后的资产去向记 G-22（R-A1）。G-2、G-9、G-11、G-14、G-15、G-17、G-18、G-19 闭合，G-5、G-6、G-10 收窄 | 无既有证据，不受影响。**新增义务**：[S-64](v2/contract.md#s-64-readasset-读一份资产记录)／[S-65](v2/contract.md#s-65-readversion-读一个已发布版本) 进 `invalidInput` 演练与判定次序；[S-55](v2/contract.md#s-55-上层锁住的下层写不进去解锁不回溯) 多了「同一份记录在锁下可持有」一支；examples 新增「删除与告知」一段。条款号只追加（S-64、S-65），既有号不动 |
| 2026-09-24 | **按 PF-003 rev 5 与 PF-002 rev 18 的凭据一条原地修订**（简报 spec-revision-2026-09-24 第二节）：头部依据改到 PF-003 rev 5、PF-002 rev 18（凭据「归谁」），PF-002 rev 17／19／20 与 PF-001 rev 19 的其余改动**未逐条复核**；[S-4](v2/contract.md#s-4-依赖方向与被消费的面) 补登 `data.mcp-endpoint/v2#S-13`、`data.connector/v2#S-12`，`#S-19` 一行注明与 rev 5 不合；[S-9](v2/contract.md#s-9-持有本契约写得到的两层与写不到的两层) 的 `shared` 一行写明被分享方可以是**租户格**（组织内分享、本人型分享），新增 [G-23](v2/contract.md#十二已知缺口)（`data.asset-model` 把 `shared` 限在组织格）；[S-13](v2/contract.md#s-13-引用方) 所有者一侧的引用方加上租户格的被分享方（推导：删除前要能告知到他）；[S-17](v2/contract.md#s-17-缺席时的默认答案) 删去 `author` 这个身份参数；[S-18](v2/contract.md#s-18-失败值闭合) 与 [S-38](v2/contract.md#s-38-assign-配值) 的组织层凭据类项由缺口转为规则——凭据类项按取值域为 `CredentialRef` 认，覆盖 MCP 凭据与连接件鉴权绑定，**G-10 闭合**，失败值仍是 `notPermitted`（与角色无关，名字已报主线）；[S-46](v2/contract.md#s-46-组合入口资产流转的确认步骤) 按两条通则重写：本人型的落地在发起那一次提交、`caller` 是发起者在落点组织的租户，组织型是确认的超管，**两种都 `caller` = 作者，不再另收 `author`**；分享取持有的 `scope` 可以是租户格；资格照直接入口判，「普通成员复制进自己租户级不需要超管」「超管选层」不需要额外放行；S-7 引注、S-48 操作者、[S-50](v2/contract.md#s-50-装配给的保证-vs-协议须给的保证) 两行、S-51、第十三节「资产流转」一行随之改；[examples 第四节](v2/examples.md#四角色矩阵--操作) 加组织层凭据类项一行与组合入口六行 | 本契约没有已执行的证据，**没有要作废的**。规范场景里涉及组合入口的（首次复制、分享取持有）要按两条通则与租户格写；静态检查义务 SC-4「直接入口没有与 `caller` 分开的 `author`」**仍适用，而且现在组合入口也没有**。租户格的 `shared` 受阻于 G-23 |
| 2026-09-24 | **修订第二轮**（主线裁定 R2-7、R2-8、R2-9、R2-16；候选未冻结，原地改）：**R2-8** 失败值 17 → **19**：组织层凭据类项由 `notPermitted` 改收新值 **`layerNotAllowed`**（结构性，与资产流转同名），分档权限的挑选不恰一档收新值 **`selectionNotSingleTier`**；[S-15](v2/contract.md#s-15-结构性禁止不是权限判定)（三个 → 四个结构性值）、[S-18](v2/contract.md#s-18-失败值闭合)、[S-19](v2/contract.md#s-19-判定次序) 第 7 步随之改。**R2-9** [S-38](v2/contract.md#s-38-assign-配值) 重写 ② 与 ⑥：租户层的**权限**挑选要落在组织那一层的界内（界 = 带锁的配值 ＋ 执行权限上不锁的恰 `{forbid}`），**设置项**仍按项锁挡；分档权限的挑选恰一档；写一条界不查外层（推导）；⑥ 的次序改为 `… lockedHere · valueOutOfDomain · layerNotAllowed · selectionNotSingleTier · lockedAbove · unavailable`（`lockedAbove` 由 `valueOutOfDomain` 之前移到之后——要先由声明知道项的种类；推导）；「租户配的值不必是组织允许集合的子集」那段按 rev 17 之前的读法写成，作废改写；[S-41](v2/contract.md#s-41-unlockassignment-解除该项的锁) 加 `selectionNotSingleTier`（推导：解锁把界变成挑选）；[S-10](v2/contract.md#s-10-属性配值与两把锁) 同步一句，顺手把 `usableBy`「三类」改成八类（上一轮漏改）。**新依赖** `capability.asset-evaluation` v2 的 S-23（界、挑选、分档的定义，不另写一份）——[S-4](v2/contract.md#s-4-依赖方向与被消费的面) 加一节，**catalog 未补登（本轮无写权，已报主线）**。**新缺口 [G-24](v2/contract.md#十二已知缺口)**：写面先配值、再加锁的两步流程写不出多档的界与空集的界。**R2-7（资产流转裁定的治理一侧）** [S-27](v2/contract.md#s-27-promotetoorganization-提升到组织) 不再被分享挡：② 去掉「至多只有 caller 自己那一份持有」，⑥ 去掉 `hasReferrers`，④ 写明同一提交里 caller 作为分享方的全部 `active` 分享结束（记录与规则归资产流转，它的 S-52）、被分享方的持有不动；[S-18](v2/contract.md#s-18-失败值闭合) `hasReferrers`、[S-21](v2/contract.md#s-21-读到的依据与写入落在同一次可串行化的提交里)、[S-22](v2/contract.md#s-22-先告知再移除或删除) 表、第八节不变量那一行随之改。**R2-16** [S-27](v2/contract.md#s-27-promotetoorganization-提升到组织) ④ 与末段：caller 那份持有的依据是「随所有者重算」，**不是一次持有变更**，引 PF-001 rev 19 §6.7「提升只换所有者，不动任何一份持有」——核对结论：一致，PF-001 正文没有与 ④ 相左的说法。**G-23 闭合**（`data.asset-model` 同轮放开租户格的 `shared`）。`examples.md`：第三节十七 → 十九行（加两行、`lockedAbove` 加一个权限例、`valueOutOfDomain` 的枚举 `deny` → `forbid`），锚点随标题改；创作旅程提升加 1b（分享中提升）；角色矩阵组织层凭据类项 → `layerNotAllowed`、租户层配值一行分设置与权限、租户格 `shared` 那一行去掉 G-23。规范场景 [S-55](v2/contract.md#s-55-上层锁住的下层写不进去解锁不回溯) 加权限一支、[S-60](v2/contract.md#s-60-提升不可逆) 另一支由 `hasReferrers` 改为提升成功且分享同提交结束 | 本契约没有已执行的证据，**没有要作废的**。V 行里 [S-19](v2/contract.md#s-19-判定次序) 的演练输入按新次序；「十九个反例」「S-55 权限一支」「S-60 另一支」首次执行时按本轮的期望。**对消费者**：`capability.asset-transfer` 的 G-15（提升被分享挡）由本轮在这一侧对齐；`capability.asset-evaluation` S-23 末段「写入面拒绝写界外的值」由 S-38 兑现 |
| 2026-09-24 | **修订第二轮追加**（主线追加裁定：资产流转 S-52 已交付、G-24 裁定、名字接受）：**S-52 的写入进删除与提升那一次提交**——[S-28](v2/contract.md#s-28-delete-删除一份资产记录) ④ 写明同一提交里以这份记录为资产的 `active` 分享置 `revoked`（`sourceDeleted`），⑧ 加「分享那一步写不下去 ⇒ 整次 `unavailable`、不删」；[S-27](v2/contract.md#s-27-promotetoorganization-提升到组织) ④ 改挂 `capability.asset-transfer/v2#S-52` 的链接、⑧ 同加；[S-50](v2/contract.md#s-50-装配给的保证-vs-协议须给的保证) 加一行（删除、提升与结束分享同一次提交）；S-4「不消费什么」写明 S-52 只作指路——那份契约消费本契约的 S-27、S-28，登它就成环。资产流转的 G-15 由此可关（主线）。上一行记的「catalog 未补登」已由主线补上（`capability.asset-evaluation` v2 [S-23]），头部注记随之改。**G-24 按主线裁定闭合**：[S-38](v2/contract.md#s-38-assign-配值) ① 加可选 `immutable`（随值加锁，等价于配值→加锁两步原子化），② 写明带锁写下的是界、可以多档或空集（空集依据 PF-002 §5.3「锁成空集」原话），④ 写锁、同值只加锁时 `since` 不动，⑦ 同值同锁重放先于 `lockedHere` 认回，⑨ 只加锁发 `locked`；[S-17](v2/contract.md#s-17-缺席时的默认答案) 加 `immutable` 一行（缺席即不加锁）；[S-10](v2/contract.md#s-10-属性配值与两把锁)、[S-18](v2/contract.md#s-18-失败值闭合)、[S-40](v2/contract.md#s-40-lockassignment-锁住该项)、[S-55](v2/contract.md#s-55-上层锁住的下层写不进去解锁不回溯) 同步。**表示改变**：`assign` 的输入多一个可选成员；旧调用形状仍合法、含义不变。**新缺口 [G-25](v2/contract.md#十二已知缺口)**：一条多档或空集的界，这一层解不了锁（S-41 按「不带锁的值仍须恰一档」拒）、又因 `lockedHere` 改不了清不掉，只能移除持有——已报主线。`examples.md`：第三节 `selectionNotSingleTier` 那一行加「带 `immutable: true` ⇒ `ok`」；角色矩阵组织层配值一行写明随值加锁同一格资格 | 本契约没有已执行的证据，没有要作废的。S-55 权限一支、第三节首次执行时按本轮的期望 |
| 2026-09-24 | **G-25 按主线裁定闭合**：[S-38](v2/contract.md#s-38-assign-配值) ② 带 `immutable` 为真时这一层自己的锁不挡（随值加锁替换这一层自己已上锁的值），`lockedHere` 只挡不带锁的改值与清除；**权限项上不论挑选还是界、带不带锁，都要落在组织那一层的界内**——裁定「前置仍是新界落在外层界内」，早先推导的「写一条界不查外层的界」作废（组织锁「问一下」、租户配「禁止」由 `ok` 改为 `lockedAbove`）；④ 替换已上锁的值时值变了 `since` 取提交时刻；⑦ 同值同锁重放不发事件、不带锁的同值写遇到已上锁照 `lockedHere`；⑨ 不变（值变了发 `assigned`）。[S-18](v2/contract.md#s-18-失败值闭合) 的 `lockedHere`、`lockedAbove` 两行，安全性质那一行，[S-41](v2/contract.md#s-41-unlockassignment-解除该项的锁) ②（写明两步出路与 flows §3.2 那条边走两步），[S-55](v2/contract.md#s-55-上层锁住的下层写不进去解锁不回溯) 权限一支随之改；G-25 行改为已闭合。`examples.md` 第三节 `lockedHere` 一行加「带 `immutable: true` ⇒ `ok`」，角色矩阵租户层配值一行改「值（挑选或界）」 | 本契约没有已执行的证据，没有要作废的。S-55 权限一支首次执行时按本轮的期望 |
| 2026-09-24 | **独立评审第一轮原地修订**（处置表；候选未冻结）：页首依据复核到 PF-002 rev 20、PF-001 rev 19，主线裁定全部改引 D-060（§一 PA-3；§三 R2-4/7/8/9/10/16、G-24、G-25），D-060 未收录的列成一段并注明已报主线；正文里的账本编号与施工标签删去，改为「主线裁定，文首」；[S-24](v2/contract.md#s-24-createdraft-创建草稿) ① 作者不是输入（K45）；[S-46](v2/contract.md#s-46-组合入口资产流转的确认步骤) `byAgent` 取自资产流转 S-11 写集合（K38）；[S-27](v2/contract.md#s-27-promotetoorganization-提升到组织)／[S-28](v2/contract.md#s-28-delete-删除一份资产记录) ⑨ 分享结束不通知（K39）；[S-18](v2/contract.md#s-18-失败值闭合)、[S-38](v2/contract.md#s-38-assign-配值) ② 凭据位非引用值 ⇒ `valueOutOfDomain`（K7）；[S-4](v2/contract.md#s-4-依赖方向与被消费的面) `loop_extension` 改引 `data.loop-extension/v2#S-40`（新依赖，README 依赖十一项）、写明对资产流转 S-52 的反向义务与 `byAgent`／`listSharings` 只作指路；S-5、S-6、S-13 按统一语言第四轮改写（无新词）；G-5 收窄（loop_extension 那一格随 `data.loop-extension/v2#S-40` 闭合）、G-6 ① 改引产品正文、G-2/7/9/11/14/17/18/19/21/23/24/25 依据改引；**新 [G-26](v2/contract.md#十二已知缺口)**（租户逐件打开工作区提供的本地命令型接入点与命令型 hook，本契约无写面）。`examples.md` 第三节 `valueOutOfDomain` 加凭据明文一例，两处账本编号删去。README 依赖十一项、失败值十九个、需求 rev 改到当前 | 本契约没有已执行的证据，没有要作废的。**新增义务**：失败值反例演练里 `valueOutOfDomain` 要有凭据明文那一支（区分「形状不合」与「凭据位写明文」只有一个值）；S-46 的演练要核 `byAgent` 与发起复制的调用上下文一致。**新依赖**：`data.loop-extension` v2 `S-40`（同批新增），catalog 已登；那一条改了须回头核对本契约 S-4 那一行与 S-38 的写时校验 |
| 2026-09-25 | **修复波 1b**（D-060 §六 L3、L11、N-7；候选未冻结，原地改）：**L11**——[S-18](v2/contract.md#s-18-失败值闭合) 的 `invalidInput` 写明记录的 name 不合正文契约收窄也归它，`data.asset-model/v2#S-27` 的那一个拒绝值（含原名携带的 `name_not_projectable`）随它作诊断、失败值仍只有 `invalidInput`；[S-24](v2/contract.md#s-24-createdraft-创建草稿)、[S-25](v2/contract.md#s-25-updatedraft-修订草稿)、[S-29](v2/contract.md#s-29-registerofficial-登记官方件) 的 ③ 补这一种；S-4 补 `data.asset-model` `#S-27` 与 `data.mcp-endpoint` `#S-26` 两行，页首依赖说明随之补。**N-7**——页首「D-060 尚未收录」那一组与 [S-13](v2/contract.md#s-13-引用方) 份数那一句改链 §六 N-7。**L3**——本包没有 `targetEnvironment` 的引用，无改动。**registry**：catalog 本契约对 `data.asset-model` 补 `S-27`、对 `data.mcp-endpoint` 补 `S-26`；covers、formal-tasks、id-namespaces 不变 | 无既有证据；上表加一行（未执行）。**失败值集合不变**（仍十九个），消费者穷举不受影响 |
| 2026-09-25 | **第二轮独立评审的处置**（修复波 2；D-060 §七 M26，候选未冻结，原地改；逐条见独立评审第二轮）：**判定次序改变**——按记录定位的操作里，依赖记录的 `invalidInput` 由最前移到记录可见、`notOwner`、角色之后（[S-19](v2/contract.md#s-19-判定次序)、[S-25](v2/contract.md#s-25-updatedraft-修订草稿) ③）；[S-26](v2/contract.md#s-26-publish-发布) ③ 写明发布时判名字。**失败值集合不变**（仍十九个），只是同时成立时报哪一个变了：看不见记录的调用方从此拿到 `assetNotFound` 而不是 `invalidInput`。第十三节加对 asset-evaluation S-42 的反向指路；S-38 ② 加拓展件三项的指路；「分档的权限」对干预力的认法由「恰是三档」放宽为「三档里含 `observe` 的非空子集」（M3 的对齐，推导，已报主线），否则声明低于 `veto` 的件的挑选不受「恰一档」约束。**对消费者**：没有已采用的消费者，无迁移；按旧次序写的测试须改期望值。证据义务「记录的 name 不合正文契约的收窄」那一行改构造、加次序一支，仍未执行 | 没有已执行的证据受影响 |
| 2026-09-25 | **修复波 3 跨批对齐**（drafter 丑；候选未冻结，原地改）：见下节。**语义不变**：失败值集合、操作、条款编号都没动；G-6 ③ 由「值没有名字」改为已裁的 `compositionCycle`，G-6 本身仍开着（② 与「发布时判环」未兑现） | 没有已执行的证据受影响 |

## 实现映射反推（2026-09-25）

起因：drafter 癸在修复波 3 把 `capability.asset-evaluation` 的 G-1 按 D-060 §八 M32 关闭，并报「本契约 G-6 ③ 该改引 `compositionCycle`」；主线在跨批对齐简报里交给丑。**裁定不代替接受**，本契约仍是 candidate。

| 裁定 | 落点 | 本契约推导的部分（已报主线） |
|---|---|---|
| **M32** 成环的值是 `compositionCycle`，带环 | [G-6](v2/contract.md#十二已知缺口) ③ 改为已裁、指 `capability.asset-evaluation` v2 S-15 ⑥；owner 一格去掉「③ 的值名」 | G-6 闭合（发布时判环）时本契约 [S-18](v2/contract.md#s-18-失败值闭合) 与 [S-26](v2/contract.md#s-26-publish-发布) ⑥ 收**同一个名字**，不另起——同一件事一个名字 |
| **M45** 求值走到本版读不了正文的一类即 `categoryUnsupported{category}` | G-6「影响」一格：本版求值判得到的环只有组合根指回自己那一种，走到 sub-agent 或 `plugin` 即以它失败，与 ② 同一个缺口；[第十三节](v2/contract.md#十三消费者核对)「资产求值」一行补两个失败值：它们**不回到本契约的写面**，写面照收 | 「写面照收、不因求值会失败而拒」是本契约的读法：S-26 本来就不判环、G-5 的几格本来就读不了，M32／M45 没有要求写面提前拒 |

**registry**：catalog 不变——G-6 与第十三节引 `capability.asset-evaluation` v2 S-15 只为说明值名与收场归谁（缺口与指路），本契约没有据它写出承诺或判定，不登依赖；covers、formal-tasks、id-namespaces 不变。
**对证据的影响**：没有既有证据；规范场景与静态检查不涉 G-6。
