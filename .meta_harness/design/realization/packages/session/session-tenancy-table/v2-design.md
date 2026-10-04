# session-tenancy-table 设计 rev 2 候选

2026-09-27；**candidate，未接受、尚未建包**。`v2-design.md` 是提供者设计修订名，契约仍为已接受的 [`capability.session-tenancy/v2`](../../../../spec/capabilities/session-tenancy/v2/contract.md)。[旧设计](design.md)保持原文；本增量只接续验收种子允许范围和公开读组件的事务参与形态，不增加服务操作或产品会话创建能力。

## 输入与实施路径

主线将 `apps/model-request-acceptance` 指定为本程独立开发验收装配，读取链依据见[提案](../../../../record/proposals/model-request-adaptation/read-projection.md)。本节点继续用一个插件提供 `sessionTenancy.holdingTenant`；没有 config，不读 clock。公开闭包 `createSessionTenancyReader(storage)`、迁移片段和独立子入口 `./seed` 沿旧设计；以下新增名字、路径、服务投影、表和列均为**候选**。

Cordis 采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）。必需 inject `storage` 与依赖换代沿 basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)、[`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)。没有依赖 disposer 顺序的新机制（[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)）；旧设计对 provide 纳管的待核对主张仍需实际验证，本次不提升其证据状态。

存储继续依赖 [core/storage](../../core/storage/design.md#p-13-显式共同事务扩展) 已公开的 `Storage`、`AtomicStorage`、`StorageUnit`，实现由 [storage-sql](../../infra/storage-sql/README.md) 承接。共同事务不是本节点新发明：采用边界沿 [D-042](../../../../record/decisions/governance-participation-provider/decision.md) 的同一 SQLite 组合。本节点不另选数据库；单独读面原有协议范围保持，新增与 OG 的共同单元仅计划在本轮 SQLite 装配验收，不推定 PG 相干读成立。

## 契约责任到兑现点

| 契约责任                                | 插件/服务或公开组件（候选）                                                           | 采用与实现路径                                                                              | 依据或缺口                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ST2 S-5、S-6、S-8：唯一不变映射与一个读 | `createSessionTenancyReader(storage).holdingTenant`；服务只暴露同一个 `holdingTenant` | 旧设计同一 `session_tenancy` 表；按 SessionRef 查询并校验 TenantId，不缓存                  | 旧 V-1～V-6 保留；新增 V2-2/V2-3，尚无源码证据                                         |
| ST2 S-2：写映射不属服务契约             | `./seed` 的 `seedHoldingTenant(tx, session, tenant)`                                  | 真实写事务只插；同 session 同 tenant 幂等，异 tenant 抛唯一冲突，旧值保留；无 UPDATE/DELETE | 只扩大受控验收调用路径，V2-1 为可实施前置；产品会话写面仍 STT-1/STT-2                  |
| ST2 S-8；读取链一致性需要               | `reader.participate(unit).holdingTenant(session)` 技术读组件                          | 对同一存储 `assertStorage`，在 `unit.run` 内 `unit.query`；不再开普通 `storage.read`        | 现有 StorageUnit 可表达；reader 尚未实现此出口。V2-4/V2-5 待证，不增加 Cordis 服务方法 |
| ST2 S-7：拒绝/缺席/不可用分开           | 独立读面与单元参与组件共用行解码/查询                                                 | 非法 SessionRef 零查询；缺记录是 sessionNotFound；存储故障不补默认                          | 参与面保留异常给外层失败，普通出口映射 unavailable；见下文                             |
| ST2 S-10、S-11：装配责任和撤除          | 同一读服务/组件；装配拥有 storage/升级 guard                                          | 全部必需 fiber ACTIVE → `guard.confirm()` → 种子写入和受理；在途跑完实际事务                | V2-6；待验收应用节点接线，不把 seed 当产品创建事实                                     |

## seed 允许范围与结构前置

`@omne-harness-lite/session-tenancy-table/seed` 是唯一公开的种子子入口；根入口不转导出写函数，插件服务不携带它。新增开发验收入口使用真实存储写映射；它的写入效力仍仅供验收，不取得 PF-015 会话创建的产品含义。

候选静态允许集按**仓库根相对 POSIX 路径**匹配，允许的包说明符仅为上述完整 seed 子入口：

| 允许消费 seed 的路径                             | 范围                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `apps/model-request-acceptance/src/bootstrap.ts` | 唯一开发验收装配执行模块；由本应用执行入口调用，不供其他产品组件 import |
| `apps/model-request-acceptance/tests/**/*.ts`    | 此独立应用的验收测试                                                    |
| `apps/cli/tests/**/*.ts`                         | 旧设计已经允许的 CLI 验收测试                                           |

路径与检查器扫描根必须显式对齐；不能把通用 `isTestPath`、名字含 acceptance 或任意 `*.test.ts` 当豁免，亦不把整个 apps 目录放开。该执行模块的 exact 路径须由验收 app 节点同步采用；更名需同时调整节点和结构规则，不用宽泛目录绕过守卫。

结构守卫须同时检查静态 import、export-from/转导出、require、字面量 dynamic import，以及能解析到 seed 实现的相对或别名路径；禁止其他模块通过允许模块的转导出取得写函数。允许模块不返回 seed 函数或把它注册为服务。非字面量装载不得成为受限入口的逃逸路径：涉及该入口或转发模块却无法静态判定的导入明确报出，由调用点改成可判定路径。结构检查不承诺沙箱化任意执行代码或拥有数据库句柄的恶意组件。

旧 V-1 的 UPDATE/DELETE 检查与本次精确 import 允许集共同构成 STT-4 的实施前置。现有 `no-testing-import` 只针对 `./testing` 且一般测试均豁免，**不能**当作本 seed 守卫已经成立。必须有反例自测：允许路径的真实 import 通过；普通 app/src、产品插件、其他包 tests、仅改文件名为 test、允许模块转导出、相对穿透均失败。检查范围必须包括 packages、apps 及可转发它们的执行模块，不能只扫描 packages。

## 独立读与事务参与

候选 `createSessionTenancyReader(storage)` 返回普通 `holdingTenant` 与技术组件 `participate(unit)`；后者返回借用当前单元的 `{ holdingTenant }`。**Cordis `sessionTenancy` 投影只公开普通 `holdingTenant`**。需要共同单元的内部消费者经包公共工厂取得技术组件；不借 `ctx.get` 得到新的事务控制服务。

独立调用继续一次 `storage.read`，保持契约 S-7/S-8 的返回集合。参与调用与独立调用共用 SessionRef 校验、按主键取行及 TenantId 解码；参与组件不创建单元、不提交、不关闭存储、不写映射、不校验当前租户资格。

参与调用必须在有效的外层 `storage.atomic` 回调内执行：每次先 `unit.assertStorage(storage)`，再 `unit.run` 包住当前方法；在其内校验输入，合法时 `unit.query` 读同行。外层逐项 await 本读、`memberships.participate(unit).standing(tenant)` 与输入配方读取，不能 Promise.all 重叠使用单元。逃逸、已关闭、跨存储实例或并发重入按公共 StorageUnit 的 `StorageDefect` 处理，不伪造 unavailable 或 sessionNotFound。

参与组件不是独立操作的最终出口：`StorageUnavailable` 必须传播出 `unit.run`，使外层单元不可提交；外层 owner 在 atomic 收场后按自己的契约映射失败。不得在参与组件中 catch 后返回普通 unavailable，放任外层继续提交已有写入。非法输入/确知无记录可以返回判定值；外层若据此不能履行自己的操作，必须按它自己的提交规则拒绝，不从此值推导额外写授权。坏 TenantId/缺表等缺陷仍原样上抛。

当前 [evaluation-input-store](../../assets/evaluation-input-store/design.md) 草稿先在外层调用普通 holdingTenant，再进入同一 SQLite 单元读 OG 和配方；该做法以 ST2 S-6 的映射不可变前提成立。本增量提供可显式选择的同单元读组件，**不替那个节点改采用关系**。若其 owner 采用参与面，应在节点精确登记并用本轮真组合验证。这里不能从“同一个文件库”推断是同一 StorageUnit；提供者对象身份也必须相同。

## 存储要求与反例

旧 R-ST1～R-ST6 保持。新增要求不选后端，描述提供者需要承担的性质：

| 要求                                                                          | 对应责任                             | 共同对象与消费者                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| R-ST7：参与读必须绑定调用者给出的活跃同实例单元；无嵌套独立读；异常污染整单元 | ST2 S-8 的真实读取及调用方同事务要求 | 同一个 StorageUnit 和 `session_tenancy(session)` 行；读组件与外层写者共享同一事务。input-store 采用后须反向互指 |
| R-ST8：初次种子竞争在唯一约束上裁决；同值确认幂等、异值绝不覆盖               | ST2 S-5/S-6 的写侧前提               | 两个 seed 写者共同触碰 `session_tenancy_pkey`，P-2 冲突后可在当前事务重读；不能用进程锁或“已经写过”内存标志代替 |

两条必须能失败的真实交错：① A/B 同会话异租户并发 seed，只有一个值进入行，失败方不改变它；同租户并发两调用可以均完成且只有一行。② 同一 SQLite atomic 内先读映射，再现读 OG/配方，竞争方在中途提交 OG 变更；断言结果属于该原子单元的一个有效次序，不拼两份治理视图。后者实际冲突对象由 OG 的既有行/约束及 input-store 的 head/recipe 承担，不能把本只读映射当作治理写屏障。若改成独立事务或跨实例，验证必须能发现不满足共同单元或明确拒绝。

映射写入与 recipe 捕获仍不承诺跨两个普通调用全有全无：seed 可以先成功而 recipe 捕获失败；保持已写映射、后续显式重试捕获，不撤销或改租户。需要将二者同一提交时由采用方显式用同单元与既有 seed 组件表达，不能由应用两次 await 冒充原子性。

## 依赖与成对装卸

精确语义依赖继续为 ST2、identity-values/v1 与 messages/v2 S-24；messages 包即使已有 v4，也不得据根入口版本提升此契约。SessionRef 公共共享类型须与 v2 固定 Schema 对齐，表示校验读取其公开 `./schema/v2`，不解析 v4 消息全文作为新前置。

| 资源/贡献                 | owner 与可用时点                                                       | 失败                                                               | 撤除与保留                                                                      |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 普通读闭包与服务          | 独立调用者持有闭包；插件 fiber 提供 sessionTenancy，依赖 ACTIVE 后受理 | 无 config；制品/迁移缺陷明确启动或装配失败；运行期存储不可读按契约 | 插件关闭新准入；已进入读/参与单元跑完，由其 owner await；不取消既有事务，不删行 |
| 参与读视图                | 外层 atomic 调用者拥有 StorageUnit；本包仅借用                         | 过期/跨实例/重入是缺陷；存储异常传播使单元失败                     | 不保留 unit，不释放 OG 或 storage；离开单元视图不可复用                         |
| seed 子入口与已提交映射   | 允许路径的验收装配持有函数；确认升级后才写                             | 同值认回，异值抛；输入非法零写，不补租户                           | 函数没有注册资源；已提交行保留到验收工作根按自身销毁流程回收，本包不提供 DELETE |
| 迁移、storage、升级 guard | `apps/model-request-acceptance` 或原 CLI 验收装配                      | 必需 fiber 未 ACTIVE、确认失败就不受理/不 seed                     | 先停新调用、等事务实际结束，再关闭借用资源；沿旧 STT-3 保留断电边界             |

## 关键取舍

| 选择                                         | 落选方最强论证                                               | 本方弱点/复查条件                                                                | 置信度 |
| -------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------ |
| 保留 seed 子入口，增加精确开发验收路径       | 新产品写服务能统一权限和会话创建；只保留 CLI 测试允许集最窄  | 前者超出 ST2；本方必须新增静态守卫且不是安全沙箱。产品创建规则成立时按新契约接续 | 高     |
| 事务参与只放公共读组件，服务继续一个读       | 把 participate 放服务方便 input-store 注入；只给普通读更简单 | 消费者需经公共工厂显式组合，必须核同实例。S-6 足够的普通读消费者无需迁移         | 中高   |
| 复用 StorageUnit，不把普通 read 隐式变成参与 | 隐式事务上下文可少改调用点                                   | 显式接口增加接线但暴露共同提交责任；SQLite atomic 占用写者通道，吞吐需真实测量   | 高     |

## 缺口与受阻消费者

- **STT-6（S-2，旧 STT-4）**：新增 seed 允许集尚未经独立评审/采用，静态守卫未实施；owner 主线、ts-checks、本节点实施者。阻断验收 app 的 seed 使用与节点可实施声明；不扩成产品会话 API。
- **STT-7（S-8）**：reader 及参与出口尚无源码；owner 本节点实施者。input-store 若选同单元读，须在自己的节点采用同实例绑定并补 V2-4/V2-5，不可引用本稿当成已有方法。
- **STT-8（S-10/S-11）**：独立验收 app 须承接精确 bootstrap 路径、迁移、seed 的调用身份、全部 ACTIVE 后 guard.confirm 和受理次序。主线已点名 `apps/model-request-acceptance`，节点接线/实际证据仍待其 owner。
- 旧 STT-1/STT-2/STT-3/STT-5 继续成立：没有产品会话创建写面、完整生命周期仍归 PF-015、断电边界保留、正常产品 app 不因新增验收节点自动装上此提供者。
