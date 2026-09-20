# P1 提供者映射迁移记录

本轮只迁移已接受映射的维护归属，不实现 JSONL/admission、不接受设计或产品。
固定迁移前提交为 `7af250ee19df1077a5143cac817558caa959a392`，
分支为 `design/dsh-p1-provider-mapping`；初始工作区干净。
原 [shared-interfaces.md](../../shared-interfaces.md) 字节 SHA-256 为
`8faa90a25b3009cee56027aa30b636051b8a972c6fcf9dfd28968fcad85b0fb5`。

原接口接受依据为 `8f4cfa9` / HUB `33f39cb` 的
[P0 记录](../p0-shared-interfaces/README.md)；
必需 Diagnostics 沿 D-010，目录资源管理沿 D-011 与
[当前 diagnostics 设计](../../../../../../packages/observation/diagnostics/design.md)。
两项诊断设计的接受不代表 D1 R1/关闭/锁/原生消费者最终产品门已通过。
当前终点沿 [runtime-baseline](../../runtime-baseline.md)，迁移不扩大实施范围。

## 责任与单一正文的对应

下表原行号均指上述完整迁移前提交，不引用浮动工作区行号。

| 原共享稿位置 | 保持的责任 | 当前维护位置 |
|---|---|---|
| 422 | createJsonlProvider 的参数、必需 Diagnostics 与返回端口 | [JSONL 公开入口](../../../../../../packages/storage/jsonl/design.md#公开入口依赖与实际状态) |
| 425–434 | 业务只拿窄 RecordPreparation/coordinator；先比较原输入并 lookup，再准备新后果 | [admission 窄边界](../../../../../../packages/coordination/admission/design.md#业务消费的窄边界) |
| 436–459 | prepare 的纯验证与真实 token；commit 同步排位、连续序号、修订和写泵；lookup/quarantine/completion | [JSONL 准备提交](../../../../../../packages/storage/jsonl/design.md#纯准备与同步提交) |
| 475–512 | operation 接纳分界、同输入/异输入、条件冲突的 provider 记录、原结果索引、容量和 unknown | [JSONL 原结果](../../../../../../packages/storage/jsonl/design.md#结果何时占用-operation-身份) |
| 528–546 | reader/readRange 的可信连续前缀、精确水位与完整批次，lookupOperation 的结果与未提交证明范围 | [JSONL 前缀读面](../../../../../../packages/storage/jsonl/design.md#精确前缀读取) |
| 550–626 | factory、AdmissionHost、严格同步回调、具名组合/参与者、ExactUse、私有 claim 表达 | [admission 接口](../../../../../../packages/coordination/admission/design.md#同步短门两份视图与精确使用) |
| 627–802 | 发行/capture/claim/释放守卫，快照与去重；双视图/publication，unknown 保有、原 owner 义务与调用次序 | [admission 同节与实例](../../../../../../packages/coordination/admission/design.md#调用顺序实例) |
| 829–913 | 唯一 writer 取得、同锁恢复、epoch 连续性、原生锁选择、acquire 清理、串行写/同步、尾部保全和 close/失败保有 | [JSONL 生命周期](../../../../../../packages/storage/jsonl/design.md#writer-epoch锁恢复与关闭) |
| 971–982 | 同步门、R1/R2、真实 ExactUse 重复/跨操作/并发释放/unknown/失败反例 | [admission 实施验收](../../../../../../packages/coordination/admission/design.md#实施验收与已有证据的范围) |
| 983–986 | R3 冲突重试/重启与 R5 取得/释放双故障 | [JSONL 实施验收](../../../../../../packages/storage/jsonl/design.md#实施验收与已有证据的范围) |
| 988–992 | coordinator 先关新门、等待记录结论及 durable 发布，再完成 writer 关闭；原效果/待办责任 | [admission 关闭](../../../../../../packages/coordination/admission/design.md#关闭与失败责任) |
| D-010 后增 factory 注入与依赖方向 | 受限 Diagnostics 必需消费；应用保有诊断管理资源，日志不代替审计 | 两包“公开入口、依赖与实际状态”引用诊断正文，不复制管理 API |
| 68–246、247–420、461–474、514–527、803–827 | 完整 DTO/Schema、records 数据/端口、原操作输入/业务记录边界、codec | 原共享稿保留，现有精确签名引用所属公共源码/README；不在新包抄写类型 |
| 915–959、994–999、1003–末尾 | G01–G10 字面量、P0 边界和原实际检查/评审记录 | 原共享稿保留；旧轮次状态已明确为历史，不冒充本轮检查 |

两包只以原 factory 装配，不新增 Cordis 插件、服务键或通用框架。
JSONL 当前只有 `/baseline`，admission 尚无产品代码；已有 records/work-data
公共签名和 codec 不等于真实 writer/协调实现。本轮没有修改产品、manifest、
根配置、spec/catalog/frozen、包 README、计划或其它设计正文。

## 内容关系检查

[check-migration.py](check-migration.py) 只比较文档和字节，不运行产品或机制模型。
它核对 10 段迁移正文及 8 段原地保留正文，并排除这些迁移段仍在 shared 维护。
仅允许以下三项表达调整，其余被核对段逐字匹配：

- admission TS 块补充来自现有公开包的 import；原声明与函数签名不变。
- JSONL 原操作结果标题从三级改为二级。
- epoch 段把“上述”明确指回共享 records 的 Principal 编码。

新增前言/导航说明归属、接受范围、实际实现状态和当前停止点；原 P1 验收义务
随提供者迁移。检查不能机械证明新增说明没有语义歧义，仍由独立复核审阅。
本轮未发现必须新增架构选择的反例；保留原设计尚待真实产品兑现的义务。

最终检查均退出 0：迁移对应 18 段通过，原证据 13 个文件字节不变，
docs-check 通过 455 份 Markdown 及关联检查，diff-check 无空白问题。
首次暂存检查发现两份新 design 文件末尾多一空行，修正后再核对；
[该次原始输出](staged-diff-initial.log)保留。此前工作区 diff 不包含未跟踪文件，
其通过不代表已检查新文件。这些结果只支持文档迁移，不支持产品正确性。
实际命令与输出保存在 [checks.json](checks.json)、
[迁移原始输出](migration-check.json)、[docs-check 原始输出](docs-check.log)、
[diff-check 原始输出](diff-check.log)。命令退出状态以 checks.json 为准：

```sh
python3 docs/proposals/core-capabilities/implementation/evidence/p1-provider-mapping/check-migration.py
make docs-check BASELINE=7af250e
git diff --check
```

脚本同时逐字节对比迁移前的 7 个 P0 共享证据文件、6 个原生锁证据文件，
并核对 records/work-data 公共源码/README、catalog/frozen 不变。
逐文件 hash 与实际写路径在 migration-check.json；本轮证据不改写原目录。
历史探针应在其原固定输入检出中解包复现：它们从完整旧共享稿提取声明，
不能在已迁移的新稿上重跑后宣称复现旧单模块编译。本轮没有执行这些探针。

## 未运行与临时资产

未运行 TDD、产品/集成测试、跨包 TS 编译、native 构建、锁/文件故障机制探针、
形式模型或模型请求。本轮仅文档维护；未来真实 writer、同锁恢复、双故障关闭、
admission publication/ExactUse 以及公开产物独立消费仍按原验收推进。

本树自用 `.venv/` 已由 `uv run --locked` 创建，Python 3.12.13、27 个锁定工具依赖，
仅用于 docs-check；没有创建本任务 tmp 资产。临时资产清单见
[assets.json](assets.json)。本轮没有安装产品依赖或改变锁文件。
证据中的提交身份以基线和 Git 提交本身定位，作者不自行记为已接受。

## HUB 核验与采用

主调度从固定提交独立运行原迁移脚本，并在合入后的 HUB 逐字节核对全部来源
文件，[hub-verification.json](hub-verification.json)记录 18 段/13 份原证据及
13 个迁移文件的核验范围。[HUB 文档日志](hub-docs-check.log)保留实际 455 份
文档检查结果。归属迁移的正式采用见[共享稿](../../shared-interfaces.md#p1-映射迁移的采用)，
仍不表示真实 JSONL/admission 已实现或已通过组合验收。
