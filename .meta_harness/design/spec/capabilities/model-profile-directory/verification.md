# 验证覆盖与实际证据

`capability.model-profile-directory` v1（candidate）的证据义务与执行状态。本文件可更新，位于规范版本目录之外；
结果始终绑定实际规范与实现修订。

**当前状态：全部义务「未开始」。**没有实现，没有执行过任何场景；本页不含任何通过记录。

## 证据义务

### 形式工件

**无。**本版不建 TLA+、Alloy 或 Schema，理由在[契约 S-24](v1/contract.md#s-24-本版选用哪些形式工件)：
每个写操作单次提交、没有跨提交的状态机；路由名唯一与「一范围一把」是单存储里的唯一性谓词，写进模型只会是被建模方式吸收的原子动作，**没有一条会在条款被违反时失败的断言**。
因此下表**不把任何条款登记为「已由模型覆盖」**。

### 规范场景

| 条款与性质 | 场景 | 证据形式与前提 | 状态 |
|---|---|---|---|
| [S-15](v1/contract.md#s-15-withdrawprofile)、[S-33](v1/contract.md#s-33-relistprofile)、[S-16](v1/contract.md#s-16-readprofile) 行不删、撤回与恢复在册都改同一行、各自幂等、撤回不重发事件、恢复不发事件 | [S-25](v1/contract.md#s-25-建档撤回再读已撤回仍读得出)；[examples §2](v1/examples.md#2-自建档案建认回撤回再读) 第 11～14 步 | 对真实存储的集成测试；恢复之后逐成员比对 | 未开始 |
| [S-14](v1/contract.md#s-14-registerprofile) ④、[S-18](v1/contract.md#s-18-loadmanifest) ④ 判名与写入同提交，边界覆盖那一格；只比同一格（官方与自建、组织层与租户层、不同组织都并存） | [S-26](v1/contract.md#s-26-同名两条只有先成的一条成立) | **必须真跑并发**（同一格两位超管同时建同名；另建租户层、别的组织、官方清单同名各一次，都成功）；前提：提供者的存储兑现 S-22 第一行 | 未开始 |
| [S-14](v1/contract.md#s-14-registerprofile) ⑦ 认回 | S-26 另一支 | 同一输入原样重发 | 未开始 |
| [S-18](v1/contract.md#s-18-loadmanifest) 五种处置（含 `relisted`：同一行回到在册）、序号单调、整份不半装、不读自建行；原样重装交回记下的那一份处置（重启之后也是） | [S-27](v1/contract.md#s-27-清单的五种处置与旧清单被拒) | 逐支演练；含一份带坏条目的清单、一条与某自建档案同名的条目；**重启一支**须对真实存储跑（重启之后再原样重装） | 未开始 |
| [S-20](v1/contract.md#s-20-resolvecredential) 取哪一把（租户那一把，否则只对官方档案取出厂格那一把）、读不到不落到出厂格、个人范围与组织层永不取；[S-32](v1/contract.md#s-32-unbindcredential) 解绑后按「没配」取；[S-19](v1/contract.md#s-19-bindcredential) 组织身份即 `invalidInput` | [S-28](v1/contract.md#s-28-取最具体的一把读不到不回落) | **故障注入**：让租户那一格的读失败；另跑有无出厂格那一把两种部署；官方与自建两种来源各问一次 | 未开始 |
| [S-31](v1/contract.md#s-31-updateprofile) 只改可改项、改完整份过校验、`updatedAt` 只随上游五项动、身份分量不可改 | [examples §2](v1/examples.md#2-自建档案建认回撤回再读) 第 8～10 步 | 对真实存储的集成测试；并发两次修订按提交先后 | 未开始 |
| [S-12](v1/contract.md#s-12-秘密只在一个问法里出现) 秘密与引用不出本契约 | [S-29](v1/contract.md#s-29-秘密不出本契约) | 以已知原文扫全部返回、失败说明与事件；另加静态检查：读面返回类型里没有凭据与引用 | 未开始 |
| [S-14](v1/contract.md#s-14-registerprofile) 末段、[S-16](v1/contract.md#s-16-readprofile) ② 授权先于解析；[S-13](v1/contract.md#s-13-这一节每个操作写全九件事) 授权依赖不可用时 `unavailable` 先于一切要读存储才判得出的值 | [S-30](v1/contract.md#s-30-无权者探不到名字) | 两次失败逐字比较；**故障注入**：成员资格判定以 `unavailable` 失败、名字已占，须得 `unavailable` 而不是 `routeNameTaken` | 未开始 |
| [S-9](v1/contract.md#s-9-缺席时的默认答案) 失败值闭合与判定次序 | [examples §6](v1/examples.md#6-每个失败值一个反例) | 每个失败值一个反例 ＋ 三条次序回归例（含成员资格不可用那一条） | 未开始 |
| [S-14](v1/contract.md#s-14-registerprofile) ⑧、[S-18](v1/contract.md#s-18-loadmanifest) ⑧ 建档内容带 `registration`／`updatedAt` 即 `invalidInput`（`malformed`） | [examples §6](v1/examples.md#6-每个失败值一个反例) 那一行 | 表示层校验的单元测试；前提：`data.model-profile` v1 的建档内容文档种类定稿 | 未开始 |
| [S-17](v1/contract.md#s-17-listprofiles) 从路由名到一行的规则以允许集合为显式参数、不按 (租户, 路由名) 缓存 | [examples §5](v1/examples.md#5-同路由名不同的格各有一条都成立) 末三行 | 同一租户、同一路由名、两份不同的允许集合各求一次，胜出行随允许集合变；允许集合读不到时失败 | 未开始 |

### 由别处承担、本契约只写明要求的

| 要求 | 由谁承担 | 本契约位置 |
|---|---|---|
| 跨进程的新鲜度上界、单调读、秘密送达与轮换传播、调用方鉴别 | 中心 ↔ 据点的组合契约（尚未立） | [S-22](v1/contract.md#s-22-装配给的保证-vs-协议须给的保证)、[G-7](v1/contract.md#十已知缺口) |
| 取值只交传输适配、锚是发起调用的租户、来源取自那次调用绑定的有效模型 | `capability.model-request-runtime` v1 | [S-12](v1/contract.md#s-12-秘密只在一个问法里出现)、[S-20](v1/contract.md#s-20-resolvecredential) ① |
| 「范围允许」的求值 | `capability.asset-evaluation` v1 | [S-3](v1/contract.md#s-3-本契约明确不承诺什么) |

## 独立评审

**第一轮**：spec-reviewer（只读），2026-09-24，基线 HUB `765b01dc`（批 R5：本契约与 `capability.model-request-runtime`、`capability.modality-projection` 同批）。
处置按主线的修复简报（2026-09-24，裁定 K17、K35、K42 与全局规矩 G1～G6）；**评审意见不代替接受**，本契约仍是 candidate。

| 发现 | 处置 | 落点 |
|---|---|---|
| MPD-1（阻断：⑥ 把 `unavailable` 排在 `routeNameTaken`／`profileNotFound` 之后，授权依赖不可用时字面会漏出名字） | **改**（裁定 K35）：S-13 写明授权所依赖的成员资格判定 `unavailable` 即立即以 `unavailable` 收场，先于一切要读存储才判得出的值；S-14、S-15、S-16、S-18、S-20、S-31、S-33 各张 ⑥ 重排；S-10 补谓词求值次序（第一个合取项不成立用不着成员资格判定）；场景 S-30 加故障注入一支；examples §6 回归例加一条 | [S-10](v1/contract.md#s-10-配置资格谁能在哪一格写)、[S-13](v1/contract.md#s-13-这一节每个操作写全九件事)、各操作 ⑥、[S-30](v1/contract.md#s-30-无权者探不到名字)；examples §6 |
| MPD-2（输入不带 `registration`／`updatedAt`，却要过要求它们的 S-24） | **改**（裁定 K17）：S-14、S-18 的输入改为 `data.model-profile` v1 S-28 的「建档内容」（`ModelProfileContent`；不带那两个成员，带了即 `malformed`）；建档的 `origin` 不是 `custom` 取本契约自己的 `origin_not_custom`（与那份契约交接时定），清单条目的 `origin` 不是 `official` 按清单形状取 `malformed`；S-4 被消费面与 catalog 加 S-28；examples §6 加两行 | [S-14](v1/contract.md#s-14-registerprofile) ①⑧、[S-18](v1/contract.md#s-18-loadmanifest) ①⑧、[S-4](v1/contract.md#s-4-依赖方向与被消费的面) |
| MPD-3（原样重装要交回第一次的处置，但处置不是耐久事实） | **改**：把「那一次装入交回的处置」列进本契约的耐久事实，与序号、档案行同一提交；⑦ 改为交回记下的那一份、「内容逐条相等」写明拿当前在册的官方行比；场景 S-27 加重启一支；examples §1 第 2 步随之改 | [S-18](v1/contract.md#s-18-loadmanifest) ④⑥⑦⑧、[S-23](v1/contract.md#s-23-依赖不可用撤除与重启)、第七节不变量、[S-27](v1/contract.md#s-27-清单的五种处置与旧清单被拒) |
| MPD-4（胜出行只以 (T, r) 为参数，第二道滤依赖未列出的允许集合） | **改**（裁定 K42）：S-17 末段写成三参数 `胜出行(T, r, A)`／`落点(T, r, A)`，`A` 是「用哪个模型」设置在会话格上的允许集合、元素是路由名，不按 (T, r) 缓存、读不到即失败；`capability.model-request-runtime` v1 的 G-4 同轮闭合；examples §5 加三行 | [S-17](v1/contract.md#s-17-listprofiles) 末段；examples §5 |
| MPD-5（PF-001、PF-002 rev 落后） | **改**：复核到 PF-001 rev 17、PF-002 rev 20（结论见[变化的影响](#变化的影响)本轮一条），不改条款 | 契约页首 |
| MPD-6（examples §5 仍写「待产品负责人确认，G-11」；S-26「隶属树」一句已无判定意义） | **改**：两处删去或改写 | examples §5、[S-26](v1/contract.md#s-26-同名两条只有先成的一条成立) |
| MPD-7（「保管方」「官方档案清单」「发布序号」无词条也未标；外部条款没按坐标写） | **改**：设计依据的词条表下列「（无词条）」四项（保管方、官方档案清单、发布序号、建档内容），报给主线；S-16、S-17 等处外部条款改为 `…/v1#S-n` 链接 | 契约「统一语言」一段、[S-16](v1/contract.md#s-16-readprofile)、[S-17](v1/contract.md#s-17-listprofiles) |

## 实际执行

**尚无。**

## 结果与反例

**尚无。**

## 变化的影响

- **2026-09-23 起草**：首版，无旧证据。
- **2026-09-24 整批对齐（候选，未冻结，原地改）**：依据行写「主线裁定 2026-09-23，待产品负责人确认」的，出处在主线的裁定清单（账本 S16-e、S16-f、PC-2、RP-22）。
  - **撞名改判落地**（RP-22、PC-2）：S-14 ④ 的比较范围读判定那一刻的隶属树，新增对 `capability.organization-governance/v1#S-34`、`data.identity-values/v1#S-15` 的消费；提交边界改为「全部档案行」；隶属变化后的同名并存被 `data.model-profile` 接受。S-26 场景改为「同一棵树里恰一条成功、另一棵树同名成功」；实例的 `routeNameTaken` 反例改为同一棵树里的一次，另加跨树成功的一行。**G-2 闭合**。
  - **出厂格那一把**（S16-f）：S-6、S-7、S-20 改为链的最末一格、由装配给、写面够不着；**G-3 闭合**；它是否只供官方档案另立 **G-10**（PF-013 owner）。
  - **两个新写面**（S16-e）：[S-31](v1/contract.md#s-31-updateprofile) `updateProfile`、[S-32](v1/contract.md#s-32-unbindcredential) `unbindCredential`，九件事写全；**G-5、G-6 闭合**；实例第 2、4 节加五步。
  - **对证据的影响**：没有既有证据（全部未开始）；S-26、S-28 的场景内容变了，首次执行按新内容。
- **2026-09-24 规格修订批（PF-013 rev 10 之后；候选，未冻结，原地改）**。依据：PF-013 rev 10 裁决 33–38 与 decisions P33–P36（账本 U-1、U-2），主线施工简报第三节：
  - **凭据只在租户层**（裁决 33）：[S-7](v1/contract.md#s-7-凭据绑定) 绑定改以 `TenantId` 为键、没有组织那一支；[S-19](v1/contract.md#s-19-bindcredential)、[S-32](v1/contract.md#s-32-unbindcredential) 的输入由 `scope: ScopeLayerIdentity` 改为 `tenant: TenantId`，给组织身份即 `invalidInput`；[S-6](v1/contract.md#s-6-范围链) 写明凭据那一侧只有租户那一格与出厂格。**G-4 闭合**。
  - **[S-20](v1/contract.md#s-20-resolvecredential) resolveCredential 删「否则组织层」**：输入改为 `tenant` 加这次要用的档案的来源 `origin`；租户有则租户那一把（不论来源），否则只对官方档案取出厂格那一把，自建档案不落到出厂格（P33、P34）。**G-10 闭合**；`present` 答出的 `scope` 只剩租户一支与出厂格。
  - **撤回可恢复**（裁决 37、P35、P36）：新增 [S-33](v1/contract.md#s-33-relistprofile) 恢复在册（九件事写全；服务面名当时账本未给，后由主线裁为 `relistProfile`，见下条）；[S-18](v1/contract.md#s-18-loadmanifest) 处置表 `notRelisted` 改 `relisted`；[S-15](v1/contract.md#s-15-withdrawprofile) ⑦ 改指 S-33；[S-8](v1/contract.md#s-8-官方档案清单与发布序号) 序号的理由改写（撤回可恢复，但旧清单仍不该有效力）。**G-1 闭合**。
  - **同一范围内唯一**（裁决 35、38）：[S-14](v1/contract.md#s-14-registerprofile) ④ 只比同一格、不读隶属关系，提交边界收窄到那一格；[S-18](v1/contract.md#s-18-loadmanifest) 的 `routeNameTaken` 处置删去（清单装入不读自建行）；catalog 去掉对 `capability.organization-governance` S-34 与 `data.identity-values` S-15 的消费。组织层与租户层同名并存这一读法另立 **G-11**（待产品负责人确认）。
  - **对证据的影响**：没有既有证据（全部未开始）；S-25、S-26、S-27、S-28 的场景内容变了，上表对应各行已改；examples 第 1、2、4、5、6 节改写。
- **U-2 裁定（原 [G-1](v1/contract.md#十已知缺口)）**已由上一条落地。
- **2026-09-24 主线裁定落地（候选，未冻结，原地改）**：
  - **官方档案只读统一一个拒绝值 `officialProfileReadOnly`**：[S-15](v1/contract.md#s-15-withdrawprofile)、[S-31](v1/contract.md#s-31-updateprofile)、[S-33](v1/contract.md#s-33-relistprofile) 三处 ③⑥ 同名，取代 `officialProfileNotWithdrawable`（撤回）与修订、恢复两处的 `invalidInput`；[S-9](v1/contract.md#s-9-缺席时的默认答案) 失败值集合同步（仍是八个）；S-31 次序改为「形状 → 结构性禁止 → 授权 → 解析」。
  - **S-33 服务面名 `relistProfile`**，标题与锚点随之改（`#s-33-relistprofile`）；S-18 处置值 `relisted` 保留；**恢复在册不加通知**，S-33 ⑨ 写明本版只有撤回一个通知、正确性靠现读。
  - **已撤回的行允许修订**：[S-31](v1/contract.md#s-31-updateprofile) ④ 注明 flows §3.1「恢复之后照常修订」不是禁止。
  - 产品依据改 PF-013 rev 11（rev 11 只动转换件呈现落点，不影响本契约条款）。
  - **S-18 服务面名 `loadManifest`**（主线裁定 2026-09-24）：标题与锚点随之改（`#s-18-loadmanifest`，本包 42 处引用一并改，工作区别处没有引用）；操作清单、账本说明句、裁定表同步。
  - **`manifestNotNewer` 收入账本**（主线裁定 2026-09-24）：值名不变，裁定表那一行改为「由主线裁定收入账本」。
  - **另引的产品依据对到 PF-016 rev 6、PF-002 rev 19**：核两份 changelog 最新节——PF-016 rev 6 把「组织那一把」改为不存在、新增 §6.21，本契约引的 §6.11 未变；PF-002 rev 17–19 不涉及模型档案与模型凭据（rev 18 组织那一层不持有 MCP 凭据，与本契约 S-7 同向）。不改条款。
  - **对证据的影响**：没有既有证据；examples 第 2 节第 11–14 步、第 6 节失败表与回归例改写。
- **2026-09-24 产品负责人裁定 G-11（候选，未冻结，原地改）**：原话「允许并存，它就像资产一样，路由名就是能力，从下往上（租户 -> 组织 -> official）在运行时覆盖」。
  - **G-11 闭合**：组织层与租户层同名并存正式化；[S-14](v1/contract.md#s-14-registerprofile) ④ 的判定不变（只比同一格）。设计依据表「档案的身份」一行、S-4 末注、规范场景 S-26 的「待确认」去掉；「发布后」一段删去「尤其 G-11」。
  - **同名按层覆盖的先后**：[S-6](v1/contract.md#s-6-范围链) 加一条「链的先后就是同名覆盖的先后」；[S-17](v1/contract.md#s-17-listprofiles) 末段写明同一路由名在链上有多条时取最具体一格（租户 > 组织 > 出厂默认），列表本身仍列全部行、按行存在判（不看在册状态，已撤回或用不了的最具体那条要不要让位是 `capability.model-request-runtime` v1 G-15）；[S-16](v1/contract.md#s-16-readprofile) 写明按引用读不做覆盖、⑧ 的「不回退到别层同名」不因覆盖放宽。消费者核对表那一行补「同名几条谁覆盖谁」。
  - **catalog 不变**：运行时已消费本契约 S-6、S-17。covers 里 PF-013 §4「档案的身份」那一条补 S-6、S-17。
  - **对证据的影响**：没有既有证据；场景 S-26 的内容不变（只改措辞）。覆盖的先后没有独立场景，由运行时的场景 S-48 与实例第 9、10 节兑现。
- **2026-09-24 主线裁定 G-15（运行时那边闭合；候选，未冻结，原地改）**：同名按层覆盖挑胜者时**先滤掉已撤回的行，再取最具体一格**（类推 PF-002 §5.6）。[S-17](v1/contract.md#s-17-listprofiles) 末段由「按行是否存在判、不看在册状态」改为「只滤已撤回；凭据、范围、模态都不参与挑胜者」，指向运行时 G-15 的那句删去；[S-6](v1/contract.md#s-6-范围链) 那一条补「已撤回的行不参与」；[S-16](v1/contract.md#s-16-readprofile) 末段改写（⑧ 管按引用读，覆盖不放宽它）。不改操作，对证据无影响。
- **2026-09-24 主线裁定：范围不允许的也在挑胜者前滤掉（候选，未冻结，原地改）**：[S-17](v1/contract.md#s-17-listprofiles) 末段与 [S-6](v1/contract.md#s-6-范围链)、[S-16](v1/contract.md#s-16-readprofile) 末段补「这个范围不允许的行不参与」；这一道滤由读的一方用 `capability.asset-evaluation` 的求值做，本契约不判范围允许（S-3）。不改操作，对证据无影响。
- **2026-09-24 PF-013 rev 12 最后一轮简化（候选，未冻结，原地改）**：产品正文定「用哪个模型」记路由名；主线裁以产品为准。[S-17](v1/contract.md#s-17-listprofiles) 末段改写为**从路由名到一行的唯一规则**：`C → C₁（在册）→ C₂（范围允许）→ 胜出行`，以及没有胜出行时的「落点」与三种收场（范围不允许／都撤回即「已下架」／链上没有这个名字）；规则归本契约、不另开操作，「范围允许」仍由读的一方用 asset-evaluation 的求值给。[S-16](v1/contract.md#s-16-readprofile) 末段注明按引用读一行供目录内部与治理面用；消费者核对表里「用哪个模型」的取值校验改指 S-17 末段。头部对到 PF-013 rev 12。不改操作；对证据无影响。
- **2026-09-24 第一轮独立评审处置**（基线 HUB `765b01dc`；逐条见[独立评审](#独立评审)，未冻结，原地改）：
  - **产品依据复核**：PF-001 rev 16 → 17——「权限锁的是界、不锁的是挑选」「提升不动持有」与三处方向词对齐，本契约只引 PF-001 的配置资格与范围链，无变化。PF-002 rev 19 → 20——连接件的事件目录、订阅、投递与触发会话的默认运行模式，不触模型档案与模型凭据，无变化。PF-013 rev 12、PF-016 rev 6 未变。
  - **K35／MPD-1**：判定次序改为 `unavailable` 先于一切要读存储才判得出的值；七张 ⑥ 重排。**K17／MPD-2**：输入改为建档内容（`data.model-profile/v1#S-28` 的 `ModelProfileContent`）；建档 `origin` 不是 `custom` 取 `origin_not_custom`。**MPD-3**：装入交回的处置成为耐久事实。**K42／MPD-4**：胜出行三参数。
  - **依据**：「主线裁定……待产品负责人确认；账本 Sxx」改为 D-040 小节链接，本轮三条链 [D-040 §五 K17、K35、K42](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)；D-040 仍未收录的几条（`officialProfileReadOnly`、`relistProfile`／`loadManifest`／`relisted`、恢复在册不发通知、已撤回可修订）留在 [G-8](v1/contract.md#十已知缺口)，owner 主线。
  - **catalog**：`data.model-profile` 的消费 clauses 加建档内容那一条；**covers** 本契约条目未增减，改注见各条。
  - **对证据的影响**：没有既有证据（全部未开始）；场景 S-27、S-30 内容变了，上表对应各行已改；examples §1、§5、§6 改写。
  - **对消费者**：`capability.model-request-runtime` 调 S-17 末段的规则时须带允许集合 `A`（按会话格取）；中心的管理页与系统发布按建档内容交输入。
