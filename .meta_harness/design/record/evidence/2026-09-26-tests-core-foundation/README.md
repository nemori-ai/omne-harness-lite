# 2026-09-26 · Core 既有四包与 content-blocks 的测试及检查证据

本 run 登记 W1 中确实发生的单包运行、HUB 集成运行与检查器有效性自测。
登记检出基线为 `c51146bab56438b8a921b49dbaa956e2e38c893b`；本次登记没有重新运行产品测试。
结果消费方是四个既有节点与追加的 content-blocks [core 节点](../../../realization/README.md)，不表示独立验收或用户最终接受。
旧 run 原样保留，本 run 不覆盖它们。

## 输入与来源

- 规范坐标：`omne-harness-lite-design-2026-09-15 · data.identity-values · v1`、`data.offer-expiry · v1`、`data.content-blocks · v1`。
  [catalog](../../../registry/catalog.json) 登记三者 accepted；前二者由 [D-023](../../decisions/tenant-domain-design-acceptance/decision.md) 接受，content-blocks 由 D-041 接受；本次采用的冻结资源逐文件核对 [frozen](../../../registry/frozen.json) 全部相符。
- kernel-basis 与 storage 没有独立契约。采用各节点 design／verification、[D-025](../../decisions/cordis-adoption-version/decision.md)、storage 的 AI／OG R 清单；本次没有增造契约坐标。
  [D-041](../../decisions/assets-runtimes-contract-acceptance/decision.md)、[D-042](../../decisions/assets-runtimes-node-acceptance/decision.md)、[D-045](../../decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md) 提供后来设计及 content-blocks 的采用边界，不被当作实现证据。
- [audit.json](audit.json) 登记来源、输入与实现哈希复核；[SHA256.json](SHA256.json) 逐文件绑定本 run。
  `input/` 是从对应 Git 修订恢复的输入／配置快照，后缀 `.snapshot.txt` 表示证据快照，不能代替现行正文。
- `raw/kernel/`、`raw/foundation/`、`raw/checks/`、`raw/content-blocks/` 等复制主树已保留的原件，原 SHA manifest 一并保存。
  六份原 manifest 共 67 个文件全部逐字节相符；kernel 34 项、foundation 15 项、checks 29 项、后续 checks 6 项、content-blocks 6 项输入哈希另按各自源码修订核对。
  kernel 的五份 Cordis 发布物文件与 HUB 安装的同一 4.0.4 发布物逐字节相符，另留快照。
  `raw/*/README.md`／`handoff.md` 是原作者的导航与说明，执行结论以 log／机器报告为准。

**storage 原 spoke 的 ignored 日志已丢失。**调度复制时调用不存在的 `python`，随后错误退休了 spoke；
其源码提交 `247fc9e2` 完整保留，但作者摘要不能恢复原始运行证据。本 run **只登记实际完整保留的 HUB 重跑**：
[外层 log](raw/storage-hub/w1-storage-hub.log) 和两个子进程目录。
主树保存副本与 HUB 原件逐字节再次核对相符；没有声称原 spoke 运行原件仍在。

## 实际执行

命令均在对应检出运行。HUB 命令与外层退出 0 由主调度提供，原 log 已独立复制核对；
storage 子进程还自行保存了参数、源码修订、退出码、信号及超时状态。

| 运行与源码修订 | 实际命令／环境 | 结果与原始证据 |
|---|---|---|
| kernel spoke `1a229204abd9180c9e8078997b0697309c50184c`；HUB `0e39dc26` | `pnpm --filter @omne-harness-lite/kernel-basis run build`、`run typecheck`、`run test`；spoke 最终测试另用 verbose/json reporter | HUB build／typecheck／test 外层退出 0，11 文件 **30/30**，0 跳过／失败；[HUB log](raw/hub/w1-kernel-hub.log)、[spoke 具名原 log](raw/kernel/test-final.log)、[30 条机器结果](raw/kernel/test-results.json)、[环境与输入](raw/kernel/metadata.json) |
| foundation spoke `efe73eb5144d44c7f2d40b8908ffa469beb156aa`；HUB `f73078ba` | HUB `pnpm --filter './packages/core/**' run build`、`run typecheck`，分别 `identity-values`／`offer-expiry` 的 `run test` | 四包构建／类型检查退出 0；identity **259/259**、offer **31/31**，0 跳过／失败；[HUB log](raw/hub/w1-foundation-hub.log)、[spoke 命令与退出码](raw/foundation/verification.log)、[输入索引](raw/foundation/evidence-index.json) |
| foundation 外部消费者 | built `exports` 的 `node consumer.ts`；独立 `tsc --noEmit --strict --module NodeNext --moduleResolution NodeNext --skipLibCheck --types node consumer.ts` | runtime 与最终 tsc 退出 0；首次 tsc 缺 Node ambient types，**退出 1 原样保留**，补本地类型链接后重跑通过。未改产品源码；[原 log](raw/foundation/verification.log)、[消费者输入](raw/foundation/consumer/consumer.ts) |
| foundation 有限 Alloy 对照 | Alloy **6.2.0 / SAT4J**；冻结 `Affiliation.als` 原字节加 [query suffix](raw/foundation/affiliation-query-suffix.als)，`alloy exec -q -c coreCorrespondenceFixture -t json -o <fresh-dir> <query.als>` | 实际求解一个六组织 fixture，结果关系支持六个上级集合、36 个有序对；[receipt](raw/foundation/alloy-fixture/receipt.json)、[原始 solution](raw/foundation/alloy-fixture/coreCorrespondenceFixture-solution-0.json)；solution SHA-256 `bae82bdc1c92435c200141478e30ac1ea6807caca99585880df353686c08d7aa` |
| storage HUB，开始 `cdcc58ab9deb73f614dd4ab888ca4fddda274f56`，期间至 `c51146ba`；工具源码 `247fc9e2` | 锁定 install；`pnpm --filter @omne-harness-lite/core-verification... run build`，tool `run typecheck`、`run test` | 外层 **2/2**，退出 0；[HUB log](raw/hub/w1-storage-hub.log)、[安装 log](raw/storage-hub/w1-storage-install.log)。运行期间根 package、Node 下限、build 过滤与 catalog 有变，产品／fixture 未变；起止配置分别留快照，**不称固定 HEAD 下全树不变** |
| storage 正常子进程 | Node **v24.18.0**／SQLite **3.53.1**／Vitest **4.1.11**；真实公开 `openStorage`，临时文件 WAL，单主机；参数见 execution | **19/19**、0 跳过、退出 0；[execution](raw/storage-hub/enabled-UATxGq/execution.json)、[JSON](raw/storage-hub/enabled-UATxGq/report.json)、[stdout](raw/storage-hub/enabled-UATxGq/stdout.log)、[stderr](raw/storage-hub/enabled-UATxGq/stderr.log) |
| storage 故障子进程 | 相同真实套件；测试侧在写连接取得后、事务之前关闭并读回 `foreign_keys`；不是内存替身 | **17 通过、仅 C-11/C-12 失败，退出 1**；目标断言均为预期 `ReferenceViolation` 却收到 `undefined`。这是被检出的真实错误运行，未将它标成通过；[execution](raw/storage-hub/disabled-xzINMp/execution.json)、[JSON](raw/storage-hub/disabled-xzINMp/report.json)、[注入观察](raw/storage-hub/disabled-xzINMp/fixture.json)、[stdout](raw/storage-hub/disabled-xzINMp/stdout.log)、[stderr](raw/storage-hub/disabled-xzINMp/stderr.log) |
| checks spoke `93c29e65` + `30f8786d`；HUB `d8d1382d` | identity build；tool build／typecheck／test；`pnpm run lint:rules`。HUB 锁 SHA `630644f4887f4cb69565e6617155f0bd8935eb4edd8502154d254a0799b26e13`，当时未提交、后由 `4800b320` 提交同字节 | **98/98**，24 条规则真实源码扫描无违反，外层退出 0；[HUB log](raw/hub/w1-checks-hub.log)、[spoke test](raw/checks/test.log)、[原 coverage](raw/checks/coverage.json)。这是该修订的已发生运行，后续规则修正须另记运行 |
| checks 后续 spoke `46be369778959fa6b3cf8c1cb06a5c98cff6392f`；HUB `59669096`，期间至 `8e9b157b` | tool build／typecheck／test、`pnpm run lint:rules`；只增加 asset-model 的 `node:path`／`path` 导入许可和真实 CLI 正反 fixture。期间另一个提交只改开发文档导航，产品／工具源码／锁未变 | **100/100**、24-rule scan，无跳过／失败、外层退出 0；[新 HUB log](raw/hub/w1-checks-path-hub.log)、[spoke test](raw/checks-path-followup/test.log)、[精确输入 hash](raw/checks-path-followup/input-hashes.json)。旧 98 条运行原件保留；MCP 依赖未扩大 |
| content-blocks spoke `44b84525e998113b45e3b0b351caf1041f23cd75`，基线 `f73078ba`；HUB merge `be07910a2fc3f84f5d9909675b3736c5acba7b74`，含尚未提交的新包 lock importer | 先 `pnpm install --ignore-scripts`（新增workspace importer，非frozen）；`pnpm --filter @omne-harness-lite/content-blocks... run build`；本包 `run typecheck`／`run test`；随后 `pnpm run lint:rules` | 实际lock为之后47c4990a同字节，be079快照只表示已提交起点；[install原log](raw/hub/w1-content-install.log)。包三命令各退出0，5文件 **306/306**、无类型错误／跳过／失败；随后24-rule scan误报本包公开 `./schema` self-import，**外层退出1**；[完整HUB log](raw/hub/w1-content-hub.log)、[spoke build](raw/content-blocks/build.log)／[typecheck](raw/content-blocks/typecheck.log)／[test](raw/content-blocks/test.log)。spoke20规则旧scan不作当前纯性gate |
| content 检查器修正，运行起点 HEAD `be07910a`，含未提交两个工具文件与content importer lock；随后提交 `47c4990a` | tool typecheck／test；另次 tool build、scan24、formatcheck；已发生运行内容逐字节由47c恢复快照，不称起点已包含该提交 | **101/101**、类型检查退出0；build／scan24／format各0；[自测log](raw/hub/w1-own-schema-check.log)、[边界log](raw/hub/w1-content-boundary-hub.log)、[format原log](raw/hub/w1-own-schema-format.log)。仅允许本包公开Schema，仍拒运行时依赖；content产品源码44b84525不变 |
| content spoke 原公开探针与root独立重放 | 原 [node-probe.mjs](raw/content-blocks/node-probe.mjs) 在原 `tmp/content-blocks` 路径消费built入口；root重放HEAD `a213f590`，在HUB `packages/core/content-blocks` cwd下 `node --input-type=module < <HUB>/tmp/core-delivery/content-independent-probe.mjs` | Node24.18.0；原探针6字面，[原JSON](raw/content-blocks/node-probe.json)。root重放6数／3解码重复名／完整tool-call往返／精确bytes，退出0；[保存脚本](raw/hub/content-independent-probe.mjs)、[新JSON](raw/hub/w1-content-independent-replay.json)，脚本SHA `524b2e842cb775bc055783f1a0e16f67349c1370c11cffe2f420e92cf2189fdd`。此前直接heredoc的[首JSON](raw/hub/w1-content-independent.json)单独保留，不伪称当时已有源文件 |

产品单包环境为 Node v24.18.0、pnpm 10.28.1、Vitest 4.1.11、TypeScript 6.0.3；
Schema 校验采用 Ajv 8.20.0。kernel 直接依赖官方 Cordis **4.0.4**；storage 查询层为 Kysely 0.29.6。
spoke 与 HUB 锁／catalog 不是全树同字节；各运行精确配置分别见 `audit.json` 的快照索引。
identity／offer 两份包内 Schema 与冻结原件分别核为 `1d1f5743…`、`63a8ccb4…`，详见 audit。

## 结论与边界

[coverage.md](coverage.md) 逐项对应五节点义务；[cases.tsv](cases.tsv) 是 kernel 及 storage 子进程机器结果的派生索引，原 JSON 才是执行原件。

- kernel 只增加三份 probe：真实 UNLOADING；子 isolate 的 **Context 属性读取**抛错不回退；严格 optional 读取过滤 PENDING／LOADING／UNLOADING。
  `ctx.get` 不抛上述 isolate 错误；LOADING／UNLOADING 时非严格 get 仍读到已注册服务。没有运行内核源码变异测试，不推断后续 Cordis 版本。
- identity 公开冻结的唯一 26 点空白数组、三种身份品牌名单与五种身份类型名单；S-31 回归核首尾拒绝、中间保留、数组不可改。
  S-14/S-15 对照实际 Alloy 输出，**有限 fixture 不是全部结构或所有交错的证明**；Alloy 集合对照不证明链的序列顺序，近到远顺序由原单元用例承担。
- storage 负向 selftest 核目标失败、数量、零跳过、退出码、信号、超时及注入观察。它只支持外键关闭这一类错误的检出能力；不支持任意错误提供者都能被发现。
  开发工具消费 core 与真实 infra 的公开入口，产品 core 没有因此反依赖 infra。
- checks 的 SC-1 规则已有正反例，当前注册表与真实 `@identityDecision` 标注均空，**真实准入函数覆盖为 0**。
  SC-2 只核 typed 直接记录与真实 AccountRow 内存变异，不证普通 string 聚类键或关联表；SC-9 不覆盖跨文件／继承／重命名／复合记录。
  `Date.now()`、无参 `new Date()`、`performance.now()` 三个反例被检出；别名取墙钟仍不覆盖。
  checks98/100运行时十五个新 core 包的实际产品源文件均为0；后续content集成后，它的5个源码文件参加真实24规则扫描，其余十四包在该修订仍无产品源。规则 fixture 不被登记为那些包已实现或符合。
- content-blocks 的162行Schema实例／具名拒绝／跨成员检查、严格读写与opaque品牌属于模块内验证；数字采用原文保留的保守LosslessNumber表示。
  原Schema的22定义副本未改。深度128和100000字符是有界测试；SC-2真实参数解析准入、外部opaque消费者、每一处JSON跳点、落盘不变、块/调用唯一性与附件租户判定仍属对应owner。
- 本 run 没有消费者的租户隔离六路径、真实邀约提交、实际时钟同源／单调、部署内唯一性、跨进程持久、pg、断电或 OpenRouter 覆盖。
  静态检查、替身输入、有限模型求值与真实 SQLite 子进程分开陈述。接受、独立评审与最终验收状态不由测试通过提升。
