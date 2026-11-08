# 会话存储的租户目录与部署枚举

`session-storage` 行持有租户登记表，并向存储登记会话组合。目录公开形状归 [sql-contract](../../../../packages/storage/sql-contract/SPEC.md)。系统枚举的裁定顺序归 [authorization AU-12](../../../../packages/identity/authorization/SPEC.md#au-12-系统动作授权端口判定顺序用途矩阵与维护授权读口)。本行通过这些公开端口履约，不另建身份或授予模型。

## 首次启动与已有部署

入口在装载 storage、identity、session 行之前调用 `prepareTenantDirectory({ storageRoot, directoryFile })`。参数来自最终解析树的 storage 与 session-storage 行配置。只有启用真实 session-storage 行时才准备目录。

`storageRoot` 整体不存在时，准备函数用非递归 `mkdir` 独占创建根目录，然后用 `wx` 创建合法空登记表并刷盘。祖先目录必须存在。`directoryFile` 必须是根目录的直接子文件，两者都必须是宿主平台的绝对路径。现有根目录必须已有可读、合法的登记表。

竞争中的 `EEXIST`、已有根目录缺表、半初始化、损坏 JSON、错误格式或推导规则、非法租户文本都会失败。失败不会补空表，也不会把文件内容或文件系统异常消息写入诊断。初始化失败可能留下新建的根目录或未完成的文件。再次启动仍会拒绝这份残留，修复不属于本函数。整个根目录被外部删除后的灾难恢复也不在此承诺内。

## 登记、发布与关闭

正常 `openTenantDirectory` 只打开现有登记表。读取、解析与只读查找不登记租户。放行的 create 先完成存储组合登记，再写目录文件，最后发布内存快照。目录只增不删，修订号是已登记租户数的十进制文本。

不同租户的异步组合登记可以交错。每个登记完成后，在同一个同步发布序列内，以最新快照加上本次租户写盘。因此并发登记不会覆盖之前成功发布的租户。同一租户的并发调用共用一次在途登记。

后续写入先检查登记表仍是文件，再写临时文件、刷盘、改名并刷盘目录。文件丢失或写入失败时返回 unavailable，已发布快照保持原状。存储组合可能已经登记，这不是回滚；调用者可以用相同输入重试。

部署必须保证该登记文件只有一个写者。多个进程同时改同一登记表不受支持。启动后外部改写或删除的实时检测不在保证内。Windows 不提供这里采用的目录刷盘操作，因此本实现不承诺目录项的断电耐久。文件数据仍执行 fsync。关闭停止新登记并等待在途登记，截止时尚未结束则报告 incomplete。

## 未登记租户的会话读与提交

目录里没有的租户没有会话，因为登记只由放行的 create 触发。经委派视图的会话读与提交（`readWork`、`readInput`、`queryOperation`、`queryControlOperation`、`readModelSelection`、四个 `history` 读和非 create 的 `commit`）对这样的租户答 `denied`，与「会话不存在」是同一个结局（[public-contract 会话判断次序第 6 步](../../../../packages/access/public-contract/SPEC.md#会话判断次序)）。访问裁定仍在先：裁定的 `denied` 与 `unavailable` 不被覆盖。绑定是 create 时不包装，租户在视图第一次解析时登记。

session-storage-sql 对目录缺项答 `unavailable`（[SPEC 失败表](../../../../packages/session/session-storage-sql/SPEC.md)），那是对装配故障的答复。不在这里转换时，没有建过会话的账号读别人的会话，公开契约会得到 `basis-unavailable`，既能区分「租户从未建过会话」与「租户有会话」，也诱使调用者重试。已知限制：登记表文件在运行中被外部删除或改写不在保证内（见上节），这时已登记租户也会按未登记答 `denied`。会话归属读口不受此条影响，见下节。

## 会话归属读口

本行用 session-storage-sql 的 `createSessionPrincipalBindings` 构造受信 `sessionPrincipalBindings`，所用的存储与目录和公开端口相同。这个名字只在受信作用域里可见，根上取不到（R2-D192）。没有登记的租户答 unavailable。

## 部署枚举

本行不持有授予表，也不自己核验主体。每次 `enumerate` 都按调用现取受信键 `systemActionAuthorization`（`authorization` 行提供），由它按发行授予表与运维者的收回、到期判断（R2-D245）。键缺席或答 `unavailable` 时枚举答 `unavailable`，不放行。不是系统主体的调用者在问授权之前就答 denied。请求固定为 tenant-domains/enumerate、系统资源 tenant-domains/registered-tenants、资源键 deployment 与 `noArguments()`。

只有 AU-12 允许后才读取一次完整快照，revision 与 entries 来自同一次读取。拒绝答 denied，依赖或目录不可用答 unavailable，两者都不含 entries。异常消息不向调用者披露。主体的 component 文本只选择授予记录，不能代替身份签发和核验。新请求不缓存此前的允许结论。

## 验证入口

`tests/rows/session-provider/unregistered-tenant.spec.ts` 在真实 Session 面与真实存储行上验证未登记租户的读答 `denied`，且与已登记租户读不存在的会话答复相同。`tests/rows/session-storage` 覆盖初始化、缺失、损坏、并发发布与授权枚举。`system-action-enumeration.spec.ts` 把真实 `authorization` 行与本行装在一起，验证运维者收回与到期对枚举生效、授权不可用时不放行、根上同名冒充服务读不到。`tests/rows/storage/restart-process.spec.ts` 用两个独立 Node 进程验证真实 SQLite 写入及重启后完整目录。该进程测试采用真实 identity 签发器与显式测试 grant，不证明发行授予表和扫描入口的完整组合。

```sh
pnpm --filter @omne-harness/harness-server exec vitest run tests/rows/storage tests/rows/session-storage --typecheck.enabled=false
```

## 受信的权限配值委派

已核验的 `permission-assignment` 委派提交经 `withSessionPermissionCommit` 进入治理协调。它保留原主体、命令、资格及 guards，核对绑定后按调用现取应用受信键 `sessionPermissionBackend`。根上的同名服务不可替换该键。未登记租户先答 denied，不调用后端；普通命令继续沿原端口，不读取此键。缺后端或选择失败答 unavailable，owner 为 `harness.session-permission-write`。

该键不是行的必需 inject，后端缺席不阻止普通会话服务启动。应用的 `sessionPermissionBackendModule` 只发布受信 reader；路由按原资格的租户选择后端，实际写入仍由 Governance 核验主体、持久绑定和提交依据。reader 不授予业务权限。

入口适配器卸载后，保留的旧引用和卸载前尚未完成的后端选择均返回缺席。下次调用重新读取当前服务。已经交给后端的操作及其耐久责任由后端关闭协议结算，卸载发布适配器不声称撤销业务写入，也不关闭它未拥有的存储或治理实例。

默认发行安装 Governance 行，按需开启租户 Governance/Assets/Settings 后端并保管关闭责任。行测试使用具名资格与后端替身验证接线和生命周期；组合测试验证真实登录、声明和映射写入；发行树测试验证默认装配。各自证据范围不能互相替代，也不直接授予交付接受。

## 生产材料与治理组合

默认 storageHost 异步构造生产材料目录。原 Session、Identity、Model 和 Tool 核心材料继续由 `storageCatalog` 提供；Governance、Assets、prepared Settings 及应用投影从各拥有者公开材料导出合并。Session 组合仍只选择原参加者，其 manifest 不因新增未选材料而变化。原始 Settings 修改写者不与 prepared 写者同时登记。

应用 `governanceStorageCombinations` 定义元数据、声明修改、资产、采用、目录、Settings 目录和 Session 权限设清所需的组合。每组先经 SQL 契约检查唯一表拥有者、事实依赖及迁移闭包，再得到摘要。函数只描述组合；租户提供者仍须在原租户域显式登记，不能把材料目录存在视为业务实例已就绪。登记可以同身份重试，不能假设多组登记整体原子成功。

Tool 发行快照核验成功才加入钉住该代次的发行参加者。快照不可用时，普通存储及原 Session 组合仍可装配，依赖 Tool 发行的治理组合拒绝构造。材料安装不发布资产、不创建租户持有、不采用声明，也不授予权限。这些行为仍归实际应用服务与其具名装配规则。
