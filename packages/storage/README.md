# 存储能力组

本组是条件性工程位置，依据为[数据与状态](../../docs/architecture/data-and-state.md)与[目标包组织](../../docs/package-organization.md#目标目录)。本组有两个成员：`sql-contract` 与 `sqlite-provider`。

## 责任与范围

数据拥有者确认事实、持久边界、保留与查询责任。存储契约规定共同提交的结果。相邻领域的业务规则和事实权威留在原拥有者。

## 成员与依赖

- [sql-contract](sql-contract/README_ZH.md)：SQL 存储契约的 workspace 成员，已建立。拥有身份、提交与认回结果、登记、读取、材料与清单摘要、关闭控制口、三个 Cordis 服务定义，以及内存替身与符合性套件。根与 `./worker` 不导入 Cordis。行为正文是[契约规格](sql-contract/SPEC.md)。设计依据是 #687 revision 2 采用的 SQL r2 规格。
- `sqlite-provider`：SQLite 提供者成员，由 #687 第二段交付。依赖 sql-contract，不被 sql-contract 依赖。设计与行为正文是[提供者规格](sqlite-provider/SPEC.md)，探针观察在[探针观察](sqlite-provider/docs/probe-observations.md)。成员的包文件、源码与测试由另一项写入负责，本入口不证明它们已存在。
- 旧的目标文档 `docs/storage-contract/`（S1、S2 与它的 README）已按替换清单写回上述两个成员并退出，旧字节留在 Git 历史。

依赖方向见[包边界与公开入口](../../docs/package-organization.md#包边界与公开入口)。PostgreSQL 提供者尚未建立。

## 关键协作

调用方、提交协调者、事实拥有者的命令和存储提供者参加同一次提交。结果与失败在[契约规格](sql-contract/SPEC.md)的提交、查询与失败分类。提供者怎样兑现它们，在[提供者规格](sqlite-provider/SPEC.md)的事务域、组提交、失败处理与关闭。

## 组合验证

组合验证检查共同提交、未知结果和恢复。场景 C01 至 C23 在[契约规格的验证义务](sql-contract/SPEC.md#161-场景)。这些场景是义务，不是已运行的结果。[存储 Worker 探针](../../tools/storage-probe/README.md)保留现有设计验证，观察记录在[探针观察](sqlite-provider/docs/probe-observations.md)。生产提供者的符合性套件尚未运行。当 `synchronous` 为 `FULL` 时，普通进程终止证明进程级持久。断电耐久另以故障试验为证据。

下列项在写入本入口时都未运行：Node Worker、驱动事务状态探测、真实材料、authorizer 逃逸路径、跨进程排除、Windows 故障注入、SQL-T01 断电、E9、Cordis 实际装配。

### 已知限制

下列限制的唯一正文是[提供者规格](sqlite-provider/SPEC.md#已知限制)。这里列出编号与触发条件，供组级导航。

| 编号 | 限制 | 后续触发条件 |
| --- | --- | --- |
| L-1 | 资格核验与提交之间的窗口，上界是一次 check→commit 路径 | 真实多进程或高并发撤权需求 |
| L-2 | 真实单轮中的可合并窗口尚未证实 | V4 的真实轨迹 |
| L-3 | 写 Worker 不做空闲关闭，同时打开的域数受 `maxWorkers` 限制 | 部署租户数接近该上限 |
| L-4 | 跨进程写者排除不在保证内 | 多进程部署 |
| L-5 | 单条 SQL 的 CPU 与内存没有硬上限；Node 同步语句没有已验证的中断；`recovering` 没有时间上界 | handler 负载验证失败，或出现卡死的原生调用 |
| L-6 | 慢语句期间持续提交的内存上界没有探针 | V2 |
| L-7 | 材料摘要不防御能写构建目录的攻击者 | 构建目录不受受信部署保护 |
| L-8 | WAL 阈值不是磁盘空间的硬保证 | 磁盘空间告警 |
| L-9 | authorizer 能否看到默认值中的时间函数待实测 | V2 |

## 维护

组维护者同步导航和组合责任。契约维护者同步契约规格的结果模型。提供者维护者同步提供者规格。长期个人负责人尚未具名。建立真实包前核对[成员文档规范](../../docs/member-documentation.md)和[开发指南](../../docs/development.md#创建和整改产品包)。统一行为正文在各成员的 SPEC，组根只保留本入口。
