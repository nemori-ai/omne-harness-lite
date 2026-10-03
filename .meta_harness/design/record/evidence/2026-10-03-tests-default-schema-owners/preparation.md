# D-116 三默认 owner：独立验收准备

状态：**仅准备，未执行，没有判决。** 阅读的草稿为 `1ebd4435aaad45eef141be97b71142d930098312`，父提交 `955965ddf`。草稿尚未自测、格式化，也不是验收冻结坐标。准备期间 ROOT 持有唯一 CPU 7 通道。

依据：`default-owners-next-slice.md`、`construction-65-plan-r4.md` 第 6 步、正式 D-116、正式提案 design.md 的 AM 与三默认 owner 段。未发现明确规格矛盾。以下判据来自派发，不用草稿行为反推标准。

| 标准 | 触发与可观察结果 | 独立场景 |
| --- | --- | --- |
| 1. 三包 native src/dist 首用 | 新进程导入真实公开入口，AM 主图 compile 请求为 0；真实公开动作首次请求完整主图；第二次动作不增加该 owner 主图编译。按 Ajv 实例区分消费者，作者请求另计 | worker.mjs lifecycle，三包 × src/dist |
| 2. AE 发布资源与职责 | 五份 Schema 与生产资源值相等但对象不同；递归冻结；每个对象 Reflect.set/deleteProperty 均失败；职责函数保持生产端口的原引用。LC3 包装对真实声明、能力名与有限定义产生原结果 | worker.mjs snapshot，src/dist |
| 3. 发布与首用间变异 | 先解析并导入消费者实际依赖的公开 AE，后修改原 LC3 的 $id、嵌套 enum；发布值与真实公开业务结果不变。随后导入 EIS/registry，实际首用成功，构建器观察到的 LC3 资源仍为旧值 | worker.mjs cross，src/dist；同进程真实 SQLite 与 registry |
| 4. 原错误与可重试 | 在首次 AM 真实 compile 请求抛出唯一错误对象；公开动作捕获同一对象。恢复真实 compile，下一动作成功且完整新实例主图重新编译；后续动作复用成功实例 | worker.mjs retry，三包 × src/dist |
| 5. 显式工厂与作者 | 坏配置显式工厂当场 TypeError；有效显式工厂当场完整主图；相同作者 Schema 连续两次调用仍真实临时编译，调用值与 Schema 未变 | worker.mjs explicit，src/dist |
| 6. 既有业务、类型、依赖/结构 | 成功与拒绝的公开输出写结构记录，并在冻结基线上对拍；按最终实际 diff 的影响面运行既有必要层及类型/依赖/结构检查，不改预期 | worker.mjs 的业务记录；待冻结后的范围简报 |

执行准备采用原生 Node `--experimental-transform-types --experimental-import-meta-resolve`。观察真实 Ajv2020 prototype 上的 compile/addSchema，调用原方法；没有替换 AM 或生产职责函数。记录 AM 的 `$ref`、实例编号、阶段和成功/异常。注入故障只拦截第一次真实 AM compile 请求，恢复后仍走真实编译。此观察能区分默认主图和临时作者编译；不会使用漏计 ESM 的 Module._load。

EIS 的 `createEvaluationInputReader(nonempty deployedOfficial)` 本来就调用 AM，是首用。独立 seed 进程用既有真实 SQLite 装配、注册、发布与 recipe 捕获准备状态。观察进程以 `boot(existingFile, [])` 装配，后给目标公开 factory 原清单；第二个 factory 复用 EIS owner。真实 read 可以另外首次构造 AE owner，不把这算作 EIS 重复构造。

registry 既有 fixture() 会消费 AE。观察进程先用 fixture() 准备有效输入、记录 AE 的主图；之后导入 registry，观察新增的 registry 主图。另有全新进程直接 import registry 的零主图阶段，避免预暖掩盖导入行为。cross 场景用消费者入口作为 parentURL 解析 AE；源码 AE 入口与 bare package AE/dist 不假定为同一实例。

生产 port 已冻结，因此职责引用检查和实际委派结果是运行证据；不能声称已成功改写冻结 port 的函数。LC3 捕获原 judge 的源码绑定另作只读交叉检查，不能由只数 getter 代替业务证据。五份原 Schema 中部分提供者本来就发布冻结副本；“原 JSON 可改”反控针对真实 JSON 子入口，不要求提供者自己的已冻结 schema 可写。

脚本写在 `scenarios/`，证据只写 `evidence/`。`freeze.json` 的执行锁默认关闭。ROOT 必须提供最终候选、基线、干净副本/已交付构建、外部 TMP、可用 SQLite seed 设施、最终检查范围，并明确转移执行通道。收到这些输入后，QA 才把冻结输入填入自有配置。准备期不调用脚本、不安装、不构建、不创建工作树、不切 ROOT 分支。

所有实际子进程须串行 CPU 7、单次 nice 5，worker/member/workspace 均为 1。重试最多 3 次，每次失败另存日志。原 qa65-main-r1/r2 报告保持原样。非 TUI 交付面，终端八关不适用。本准备未读取实现新增测试作为 oracle，也未运行任何检查。
