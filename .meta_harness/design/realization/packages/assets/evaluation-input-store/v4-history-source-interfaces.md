# evaluation-input-store：注册表历史正文读取增量

2026-09-27，revision 1，**candidate，未接受，新增面尚未实现/验证**。节点及源码路径均为 `packages/assets/evaluation-input-store`，kind 为 provider。本稿只补一个公开受限技术闭包；不修改已采用 [design.md](design.md) 与 [v3-source-interfaces.md](v3-source-interfaces.md)，不增加领域操作、资产身份、存储权威或 Cordis 服务。文件名 v4 指本批 AR4/MF4 消费者，不表示另立 EIS 契约版本。

## 输入、采用状态与实际源码

精确坐标均在 baseline `omne-harness-lite-design-2026-09-15`，接受状态已核 [catalog](../../../../registry/catalog.json)。

| 输入                                                                                                                                                                               | 本稿使用的责任与状态                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-074 的 EIS design                                                                                       | 已采用，SHA-256 `01e0d2a1ff4fbdaab11321a1126bec8e0e3c01d91a18e8c1f6e3cd162a134bd4`；真实本地发布、不可变版本、STT/OG、存储与配置错误政策沿用                                                                            |
| D-077 的 source interfaces revision 1                                                                 | 已采用，SHA-256 `1d0be74b524b6609c2a1d61e5ce49ebdcf3247026b710458a951823ee83640b6`；固定根输入面与 S-66 面均保留用途，不扩成历史正文授权                                                                                |
| D-079；[MF4](../../../../spec/capabilities/assembly-manifest/v4/contract.md) S-6/S-11/S-18/S-21/S-24/S-36 | MF4 及其 [provider v4](../assembly-manifest-store/v4-design.md) 已采用。S-18 认回实际历史表，S-36 仅供 registry 认回固定 H 的最后 given，不能混用                                                                       |
| [AR4](../../../../spec/capabilities/asset-registry/v4/contract.md) S-7/S-18/S-20/S-25/S-26/S-31/S-33/S-48/S-51/S-52                                                                | 契约已接受；[AR4 provider v4](../../tools/asset-registry/v4-design.md) 是并行待审稿。历史表按原 capability/asset/version 恢复；完整 E/O、报告及换表用途校验属于 registry                                                |
| AM3、AE4、STT2、OG2；CB3、IV1、offer-expiry1、call-accounts2 公共数值构件                                                                                                          | 分别为 `data.asset-model/v3`、`capability.asset-evaluation/v4`、`capability.session-tenancy/v2`、`capability.organization-governance/v2`；严格 JSON、身份、Instant 与精确版本比较沿各自已采用公开面。不自动升级正文契约 |

已核 EIS 源码公开根、`./publication`、`./registry-inputs` 存在，**没有 `./registry-history`**。`registry-inputs` 读取固定根并用实际 selector/evaluate 核 C16，不满足本稿“不重求历史表”的用途；不能改名转调它来声称历史恢复完成。现有 `readSourceSnapshot` 把额外固定根正文与当前持有定义集合分开，这一边界继续保留。

已核 MF 包公开 `AssemblyManifestService.readHistory`、`ManifestRecord`、`ManifestTable` 与 `createAssemblyManifestStore`。S-18 交回的 `composition/content` 仍是严格 JSON；MF 不验证 AR 的完整表语义，源记录持久存在并不独自证明它是合法 AR fill。AM 包公开 `createAssetModelJudge`、`AssetVersion`、`AssetDefinition` 与 `BodyProviderUnavailableError`；AE4 根导出的 `defaultBodyContracts` 是本次固定正文闭包。旧 45 项 EIS 组件检查不覆盖新历史面。

## 契约责任到公开构件的投影

下表中的新入口、函数和技术类型均为**候选**，不当作已存在 API。

| 编号／契约责任                               | 插件、服务或公开构件                                              | 实现与采用版本                                             | 符合性依据或缺口                                                     |
| -------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| HI-1：AR4 S-7/S-18/S-25/S-26/S-33            | `./registry-history` 的 `createRegistryHistoryReader`             | 本包独立函数闭包；无新服务/fiber                           | 原表所指资产已不再 held 时仍读其原不可变版本；HI-V1/V2，尚未实现     |
| HI-2：MF4 S-18/S-21；AR4 S-31/S-48           | 闭包注入真实 MF4 `readHistory`，再次回读表与 tuple                | 仅消费 MF 公开面；AR 保留完整用途判定                      | 请求 DTO 不是授权；实际记录的同会话/表时刻/成员绑定是必需事实，HI-V3 |
| HI-3：STT2 S-8；OG2 S-26/S-63；AR4 S-20      | 真实 STT 归属、真实 OG 当前资格与 EIS atomic                      | 复用 D-042 参与面，不自建身份读面                          | 当前 effective 是门；捕获 standing 不豁免现核，HI-V4                 |
| HI-4：AM3 S-4/S-9/S-10；AE4 PRE-9            | 本源 immutable 元信息/版本实读，事务后共享 AM judge/BodyContracts | 固定 AM3/AE4 正文解释闭包；返回既有 `AssetVersion`         | 无损、capability/category/精确版本匹配；不复制 schema，HI-V2/V5      |
| HI-5：AR4 S-33/S-51/S-52；MF4 S-11/S-24/S-36 | 历史表读、原 fill 读、当前求值输入各自独立                        | 本面不调用 readGiven、selector 或 evaluate                 | 不用新 given、当前 C16 或当前 body 替代历史表；HI-V1/V6              |
| HI-6：AR4 失败/撤除边界；SYS-OBSERVABILITY   | 闭合结果、实例准入/排空、真实 IO 和 pure 计时                     | 复用已有诊断端口与存储生命周期；app owns、registry borrows | 不把 unavailable 当成功恢复、不以日志补来源，HI-V5/V7/V8             |

## 公开面、权限主体与依赖

候选子入口为 `@omne-harness-lite/evaluation-input-store/registry-history`；导出 `createRegistryHistoryReader(deps)`、`RegistryHistoryReader`、`RegistryHistoryRequest`、`RegistryHistoryResult` 和闭合阶段类型。返回 `{ read, close }`。只读闭包不注册到 `currentEvaluationInputs`，不从普通根入口转导出；registry 只得到 `Pick<RegistryHistoryReader, 'read'>`。本面不向 HTTP、模型、工具或租户脚本暴露。

**权限主体是可信装配所授权的 registry 实现。** app 必须在其已核入口身份与会话范围内调用 registry；STT/OG 是事实校验，不替代入口授权。传一个 tenant、session、合法报告或合法表时刻都不能取得这个闭包。框架消费者须在自己的可信装配显式承担同一前提，不声称 TypeScript 类型或 Cordis isolate 是安全沙箱。验收 app 的本机 owner 政策保持原采用范围，不在本节点新增产品授权策略。

候选依赖对象显式包含 `storage`、`storeKey`、`sessionTenancy`、`memberships`、`manifestHistory`、`diagnostics`、`onDiagnosticFailure`、`monotonicNow`。其中：

| 依赖               | 真实公开面及绑定                                                                              | 缺席、替换与范围                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `manifestHistory`  | `Pick<AssemblyManifestService, 'readHistory'>`，来自此次装配实际 MF4 实例；保留正确接收者绑定 | 不能注入请求方给的 record、总成功回调、私表查询或缓存 fixture。没有 append/readGiven 权力；旧实例不动态读取新 MF 句柄 |
| `sessionTenancy`   | 真实 `SessionTenancyService.holdingTenant`，STT2 已采用不可变映射                             | 未知或 tenant 不等即拒绝；不伪造会话、不补 recipe、不允许改归属                                                       |
| `memberships`      | `MembershipsService.participate(unit).standing(tenant)`，OG2/D-042                            | 当前 effective 必需；同 StorageUnit/storage 约束保留；参与异常交最外 atomic 终结                                      |
| `storage/storeKey` | 既有 AtomicStorage 与可信装配显式本地源绑定                                                   | EIS 与 OG 使用既定同 SQLite 组合；不按请求切换库/源、不跨 store 搜索，不从 tenant 推 storeKey                         |
| 纯构件             | CB3 严格 JSON、AM3 judge、AE4 `defaultBodyContracts`、公开精确数值工具                        | 制品闭包与本批 EIS/registry 相同；LC3 等传递正文版本仍精确钉住，不能自动读最新解释器；不从请求传自定义 validator      |
| 诊断/测时          | 现有同步诊断、失败后备端口与单调测量端口                                                      | 装配持有 sink 的容量/留存责任；缺失或非法静态配置启动失败，没有隐含时限或重试                                         |

历史读不依赖当前 deployment manifest、当前 scope holding、当前 root selector 或 creation recipe。它只使用实际原表关联的不可变正文，因此 source head 更新、移除持有、后来完整 fill 或角色改变不能自动改其版本。捕获 standing 既不是本面的输入也不是输出；本面不重新计算权限、availability 或 run 门控。AR 的 skill/run 报告门控、slash_command/session 的现读门控仍在 AR 原操作上，成功读正文不能跳过它们。

### 请求与结果

候选 `read(request: unknown)` 只接受七个必需成员，无默认、无 body/proof 布尔槽位：

| 成员                             | 类型与真实出处                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `session`                        | 既有 SessionRef；registry 已核操作/报告所属会话                                                                  |
| `tenant`                         | 既有 TenantId；可信入口核实且与实际 STT 对应                                                                     |
| `category`                       | AR4 S-5 六类之一：plugin、tool、skill、loop_extension、mcp、slash_command；能力标识的 category 必须相同          |
| `filledAt`                       | 原 `tables[category].filledAt`，复用 MF 当前公开 `Instant` 表示/判定；不是 now、字符串改写或任意生成时刻         |
| `capability`、`asset`、`version` | 已核原表 composition 的同一项；复用 AM3 CapabilityId/AssetRecordId 与正整数 JsonNumber，精确数值比较，不转浮点数 |

先严格无损复制并校验形状；所有真实回读与返回同样保持 JSON 的对象成员、数组次序、未知合法正文成员及精确数字。数值相等沿 CB/AM 既有规则，不把布尔当数字；对象/数组不能仅用字符串或 hash 判断相等。

候选闭合结果为：

- `{ version: AssetVersion }`：从实际不可变记录取完整 number/content/publishedAt/publishedBy（原缺席仍缺席），与请求精确版本及 capability/category 对应；返回操作自有、递归保护的值，不把存储缓冲/调用方对象作为可变别名。
- `{ failure: 'invalidInput' }`：七字段请求表示不合约；在任何真实读取之前返回。
- `{ failure: 'unavailable', stage }`：`stage` 恰为 `stopped | session_tenancy | manifest | history_binding | current_membership | source | body_provider | storage`。它是提供者技术诊断，不新增 AR 领域失败。

不存在 `none`、空正文、当前版本 fallback、`rootSourceMismatch` 或部分成功分支。AR 收到具名 unavailable 后沿其整类重建/操作失败规则处理；不得悄悄跳过缺正文条目。AR 在已校验内部参数之后收到 invalidInput 须暴露接线缺陷并沿自身依赖失败边界收口，不转嫁成用户表示错误。未知程序异常不吞成任意不可用。

## 一次历史读取的真实边界

1. **准入与归属。**表示校验通过、实例未停止后计入在途；真实 STT `holdingTenant(session)` 必须返回与请求相等的 tenant。归属未知/读不到/不等在这里拒绝，不触发另租户的 MF/source 读取。STT 映射已接受为不可变，故不要求把该读强塞进下一事务；不由历史参数建立映射。
2. **回读表关联。**通过绑定的真实 MF4 `readHistory(session, category, filledAt)` 完整 await 回读。核同一 session、原记录壳给出的 seq/ref、对应表实际存在且 filledAt 相等；其 composition 必须是可读取的原有序表项，所请求 capability/asset/精确 version 在同一项且恰一项匹配。按 AR4 S-48.4 做局部来源投影，不从 content.evaluation.assets 的“曾出现”代替实际表成员，尤其 reuse 已删除项不能再授权读取。元组缺失、重复、跨会话或表时刻不符为 history_binding。MF 的 recordNotFound/unavailable，或合法请求被依赖拒绝而不能认回源，映射 manifest；不找前一个时刻、最近 given 或 latest table。
3. **同一单元的当前资格与正文 IO。**MF 读结束后才申请一个 EIS `atomic`。在该单元调用实际 `memberships.participate(unit).standing(tenant)`；不是 effective 即 current_membership。随后只查询本 storeKey 下请求 asset 的已存元信息和已发布版本行，读完整有序版本序列作为 AM3 判定上下文，不读 draft/current holdings/recipe，不向 MF 再发嵌套调用。版本位置与版本号关系按既有存储规则核对，缺资产/缺精确版本/关联损坏为 source。不存在该旧源时不能把另一个资产的同名能力正文补来。
4. **事务后纯判定。**拥有全部原始读取值并实际结束 atomic 后，严格解析 JSON、核连续版本序列，以真实元信息和完整已发布版本构成 AM3 AssetDefinition 的历史读取投影，调用现有 AM judge/defaultBodyContracts（携带其能力名/origin 上下文）。不造假的 AssetDefinition 仅塞一条 vN，不因 draft 可读就采用 draft。核元信息 id/capability 与请求一致，并选择唯一精确版本；content.category 必须与请求 category 相同。判定失败为 source，真实 BodyProviderUnavailableError 为 body_provider。解析、body judge 与相等判定全为纯阶段，不调 selector、extractAgentDefinitionInputs 或 evaluate，也不生成 EvaluationInput。
5. **结果与诊断。**交回选中的真实完整版本；emit 裁剪诊断后结束在途所有权。纯阶段不再次读 DB/治理/manifest。诊断端口故障只走独立后备端口，不改业务结果；后备端口无递归重报。close 等待本次全部 Promise 收口。

第 2 步只补不可省的“真实表确实包含此 tuple”来源检查。**registry 仍负责**本次 readHead 的 H、记录 seq≤H、完整 E/O/filledBy 用途、given/mint 与完整分类筛选、reuse 的原 E/O 和真实子序列，以及 run 报告的 session/runId/attempt/category/filledAt 关联。MF 已存一个合法 JSON 表不证明这些性质；app 只能把本闭包交给履行这些前置的 registry。EIS 不复制整套 registry checker、不接受一个“已验证=true”代替真实 MF 读。

**S-36 的位置保持独立。**只有 reload/refresh 的固定根配方认回使用 AR4 S-51 的 readHead H→readGiven(H)→完整 fill 检查→`./registry-inputs`。本面的历史表可能依赖早于该 given 的 E1，不能强迫它匹配当前 given/root/C16，也不能要求原 asset 当前仍 held。普通 S-66 输入仍只含其真实当前持有的定义集合；本面读取的 unheld asset 不回写 scope、不注入普通 definitions、不改变 current 为 pinned。

## 存储要求、作用域与交错

没有新表、列、索引权威、持久缓存或迁移。EIS 仅读自己已有的 `evaluation_input_asset` 与 `evaluation_input_version`；发布者继续唯一拥有这些表的写权。MF 的私表无论是否恰在同一数据库都不被本节点访问。

| 要求／条款                          | 对存储提供者及装配的要求                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HI-R1：AM3 S-4/S-9；AR4 S-7/S-33    | 元信息身份与已发布整条版本不可改删；旧版本在持有移除后保留。版本→资产约束、严格无损文本和真实持久恢复沿 EIS 已采用要求。不增加删除/GC 政策                                                                    |
| HI-R2：OG2 S-26/S-63                | 当前资格和 EIS 正文读取在同一 AtomicStorage 事务排序；OG 的公开参与面断言同存储。资格撤销写者与本读的共同对象是同库真实 membership/organization 持久事实及其事务锁定，不是时间戳或进程锁；不读取/复制治理私表 |
| HI-R3：MF4 S-11/S-18/S-24；AR4 S-51 | MF 以其真实一致读交出不可变历史表；EIS 以自己的真实一致读交出正文。**没有跨 owner 的同一提交或共同快照要求**，不假设 MF 与 EIS 共用一条事务/锁；不向 MF 添加 participate 端口                                 |
| HI-R4：STT2 S-6/S-8；租户隔离       | 真实 session→tenant 不可变。表定位值与 MF session、EIS 当前资格都核同一 tenant；asset.owner 不强行等于 tenant（合法 official/组织源另有所有者），读取资格来自本会话已核原表，不是任意资产号                   |
| HI-R5：失败与收口                   | 必要 IO 不可用可识别；OG 参与抛错必须越过 atomic 实际终结再外映射；StorageUnavailable→storage。未声明的存储缺陷/程序异常继续暴露，不在 unit 中吞异常后正常提交，不做隐式修复/重试                             |

采用范围继续是 D-042 的同 SQLite EIS/OG 组合；本稿未选择新数据库。PG 或跨库 EIS/OG 不具有这份资格/正文同观察保证，保留缺口。MF 可以通过公开读与它分开部署，但其契约与真实生命周期前提仍必须兑现。

必须通过两条真实交错反证：

1. 旧表 T 已持久，读取 T 后另一个写者提交新 fill T2、EIS 发布 v2 并移除 v1 持有，再读取正文。结果仍为 T 的 v1；不得自动跳到 T2/v2，也无“末尾 head 必须最新”的附加要求。真实不可变行是理由，内存 cache 不是理由。
2. MF T 已读，OG 撤销与 EIS atomic 竞争。撤销先取得同库提交次序则本读拒绝；本读先取得并读到 effective 可完成该次旧正文读取，随后撤销不倒改已交值。不能宣称从返回一直到工具执行都冻结授权；使用方仍按 AR/runner 原时点核权。参与异常不能让本次借旧 captured effective 成功。

## 成对装载、依赖换代与关闭

无新增 Cordis 注册/effect；可独立调用的闭包由 app 构造。Cordis 采用版本仍为 D-025 的 4.0.4。依赖撤回会引起消费者重跑沿 basis [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，effect 清理不保序沿 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)，隔离不等于数据权限沿 [isolate-hides-instances-not-data](../../../../basis/cordis/isolate-hides-instances-not-data.md)；这些条目已有 probe，本增量实际宿主组合未验，不借它们推断自动排空。

| 取得／贡献                             | owner 与可用时点                                                 | 部分失败                                                    | 撤除／保留                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| MF/OG/STT/storage 借用引用             | app 在真实提供者 ACTIVE、迁移及既有 upgrade guard 确认后显式传入 | 任一静态依赖不合法构造失败，不发布 registry 入口            | history reader 不 close 借用依赖、不撤他人服务；持久历史不删除                                                                  |
| `RegistryHistoryReader` 的受理与在途集 | app 拥有；构造成功后只向此次 registry 实例传 read                | 后续 registry 初始化失败，app 先停消费再 await reader.close | close 幂等，先停止新受理（stopped），等待真实 STT/MF/atomic/纯阶段及诊断收口；没有取消即已停止的假设                            |
| registry 消费绑定                      | registry 借用读权、拥有自己的调用与缓存                          | 必须 await 在途调用；不留 detached Promise                  | app 先停 registry 新受理并排空，再 close 旧 history reader，之后才能关闭旧 MF/OG/STT/storage。registry 不擅自 close 借用 reader |
| 依赖热更/重建                          | app 负责按明确新 MF 实例重新构造 reader                          | 新闭包未就绪不能恢复消费；静态配置失败启动拒绝              | 不让新 registry 无声复用绑定旧已关闭 MF 的 reader；已接纳调用跑完各自观察点，旧报告仍沿原持久 locator 恢复，不重写引用          |

应用须把上述关闭顺序放在一个显式 await 的拥有者动作链中，不能靠多个 effect 的登记顺序。source reader 没有强制取消远端 MF 读的协议；被阻塞的实际调用没收口就不能报告排空。关闭等待若需取消/超时政策须由既定 owner 显式配置并验证，不在此写死时间。构造后不热改 dependency 对象；重建产生独立实例。

## 观测、静态边界与公开消费

遵守 [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md)。候选结构事件 `registry_history_read` 只带 session/tenant、category/filledAt、实际选中 manifest seq/ref、asset/version、结果/具名阶段、读取版本数/总字节数。来源事实只有实际读取成功后才记录，未知阶段不补假 seq/ref。正文、完整 E/O、配值、credential、原异常消息与未经裁剪的请求均不进入诊断。

分别测真实 STT 调用、真实 MF 读往返、EIS atomic 申请至实际锁取得、持锁至实际提交/回滚、事务后严格解码/AM/BodyContracts 纯阶段及总耗时。实际锁边界由存储组件可核观察点确认，不能用 JS 回调开始或纯计算耗时冒充。成功/失败、被撤销和在途 close 都关联同一次调用。选择/求值次数应为零，不因为做了纯值判断就记成 evaluate。sink 失败不改结果，后备只记诊断失效事实；sink 的容量、留存、输出权限归 app。

**候选 AST 边界须先于生产消费进入 gate。**该子入口可从本包自己的实现/测试引用；本仓库外部创建 factory 只允许 `apps/model-request-acceptance/src/bootstrap.ts` 及 EIS/registry/该 app 的 `tests/**/*.ts`。`packages/tools/asset-registry/src/**/*.ts` 只允许 `import type` 所需请求/结果/reader 类型，运行时 read 由 app 注入；不允许导入 factory、通过 namespace/dynamic import 取得、re-export、包根转导出或用本地 wrapper 洗出闭包。其他 apps/src、产品插件、runtime、runner、adapter、工具不得取得历史读取入口或 EIS/MF 私有 SQL。跨包只走公共 package exports，不用 src 路径与路径别名绕过。框架独立包消费者另用外部 fixture 验公开入口编译/运行，不扩大本仓库允许名单。

当前静态边界检查还未包含新子入口；既有 guard 通过不是新限制已生效。AST gate 须覆盖 named/namespace/dynamic import、类型与值区分、转导出及私有路径负控；不可只 grep 一种 import 拼写。入口授权、MF 真实来源和 STT/OG 调用也要真链负控，静态检查不称沙箱。

## 关键选择与代价

| 选择                                        | 落选方的最强论证                            | 本方案弱点／置信度                                                                                                                  |
| ------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 独立受限历史闭包，复用内部读数/纯构件       | 给现有 reader 加 purpose 参数可减少入口数   | 新增一个受限 export/关闭实例，需专门 guard；换来不会混淆 S-66 当前输入、固定根 C16 与历史表。高                                     |
| EIS 自行回读真实 MF 表，AR 保留完整用途校验 | 只传 AR 已验证 DTO 更快、少一次 IO          | 多一次 MF 往返及局部 tuple 投影；避免任何持有裸 asset/version 的调用被当成来源授权，不建立第二套 AR schema。中高，成本须 HI-V8 实测 |
| 当前资格＋历史表关联，原正文不依赖当前 held | 一律要求当前 holding 可统一普通 source 读取 | 需要精确限制用途/入口；否则可能扩大读权。但一律 current 会直接破坏 AR4 S-25/S-33 的旧报告恢复。高                                   |
| 两个独立观察点，显式 close 所有权           | 把 MF/EIS 加入同事务可简化统一观察描述      | 不提供跨 owner 全局最新快照；依赖不可变记录与版本。无契约同提交要求，不为方便加事务协议。高                                         |
| 读取完整已发布版本序列，复用 AM3 上下文判定 | 只读目标行更省 IO                           | 读量随版本数增长，须量测；不为绕过通用连续性/正文上下文判定造半份定义或新 judge。中，优化需依据真实成本另提                         |

## 覆盖缺口与受阻消费者

| 编号  | 缺口／条款                                                                                        | owner 与停止边界                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| HI-G1 | AR4 S-25/S-26/S-33/S-52 的真实旧报告/未持有旧版本成功恢复尚未实现                                 | EIS、registry、MF 与 acceptance app；本稿采用、接线及 HI-V1～V9 适用项完成前，AR4-G3 保持阻断。只返回 unavailable 不算本批交付         |
| HI-G2 | AR4 S-31/S-48/S-51 原表与报告用途完整校验由 AR 承担，本稿只做局部真来源复核                       | registry owner；无合法已核表、无可信主体或无法绑定真实 MF 时不调用本面，不以“源可读”补证原 fill。D-079 语义接受不等于 SI-G1 真组合已验 |
| HI-G3 | EIS/OG 同观察只采用 D-042 同库 SQLite；分享、workspace 可变承载、MCP 动作集的原来源没有被本面新增 | 对应 source/storage/治理 owner；不得将新入口当任意历史存储或权限快照，不能据本地成功扩大这些来源分支                                   |
| HI-G4 | 新 export/AST gate、factory 权限交付、MF 换代 close 次序及观测边界待实现/真实验证                 | EIS/静态工具/acceptance app owners；未满足时不开放产品消费。本面不改变 runtime S-66 与固定根 SI-2 的准入规则                           |

未发现必须由本稿新选的产品政策；历史表取源与当前资格前提沿现行契约和已采用来源边界。独立评审若发现原表 tuple 不足以兑现某个已定权限前置，应停止对应消费并回报该条款 owner，不能增加默认权限或回退私有 SQL。新增绑定为 0；本稿不自行接受，也不把文档检查当实际组合验证。
