# D4 独立增量验收

2026-09-29。**本次适用的独立矩阵通过：transport 7/7、demo 2/2，两个包 typecheck 与指定文件格式检查通过。没有定位到产品缺陷。独立通过不是完整 D4 的最终接受。**

测试提交：`d2cf6bcbfacb793c51e6fd7cd45f271cd5bd0843`；基线 `0b345dd561666009d9518d512ab439c08852e6fe`；分支 `panqiwei/model-request-runtime-d4-acceptance`。仅新增两份 `acceptance-d4*.spec.ts`，产品/已有测试/规格/README/goldens 未改，tracked 工作树 clean。

## 依据及精确采用

开始前范围见 `gates.md`，源为 root 本次 D4 brief、HUB `tmp/model-request-runtime/DELIVERY-SCHEDULE-rev7.md` / `TODO.md`，以及 `IMPLEMENTATION.md` D4。中央 catalog 已核 MP6、MS6、MR9、Directory5、RT10 为 accepted，摘录 `catalog-selected.json`。`adopted-inputs.json` 逐 SHA 检查 D100/D101/D107 对应规范资源及 provider 精确稿；不是只读文件名或把 candidate 当已采用。

- D100：transport v9 当前迁移、directory v5、runtime v7 共享面；追加 runtime v13 三分 acquire SHA `777ae873be40ef1c6661a69036b91c034c7e809ebe65d3ebaafc05a4114f306c`。
- D101：MP6/RT8 计量政策和 transport v10 SHA `7151e835b4327583e77bf9d424c8e973ee039bd78f4c16ef7ad96916b2ca16d5`；当前消费后继 RT10。
- D076 追加：transport v11 registry 诊断 revision 2 SHA `e3f89afa2826a52a8f5800c67a1c7bb0e755df8f22e05f0aa7b635becdbc7ac6`。
- D107 后继：MR9/RT10、transport v12 revision 2 SHA `8e2c62b2379ef7741ad44112421b1e6440849ec43d4b54edd7d94c2ff8e41476`，UCT-V8；核心义务沿 RT10 S53/54/56/58/61/64。
- 实际目录/身份/组织提供者沿各 realization 已采用路径装配；没有新建或改动通用治理。Directory5 S16 是显式 scope chain 的内部读取；S20 是 runtime 使用的可信凭据口，不自行承诺身份准入。成员撤销和登录撤销在目录写入、应用实际身份准入检查。

## 逐门结果

| 门 | 结果 | 实际可辨别证据 | 限界 |
| --- | --- | --- | --- |
| D4-A 纯 import | Pass | 子进程先将 net/socket/tls/http/https/fetch 网络口改为计数后抛错，再导入公开 root/plugin；包括吞掉异常仍以网络次数失败的防护，最终零网络。 | 当前 Node 公开网络口，不宣称操作系统级通用 sandbox。 |
| D4-B official/custom 与公共/服务一致 | Pass | A 用精确官方 Claude Sonnet5 definition + 生产 Anthropic meter；B 是同模型明确新 implementation/definition revision 的可信自定义贡献。真实 Cordis `createModelPlugin` 装载生产 registry，A/B 均实际本地 TLS 发出。公共工厂与 service 的 A continuation 比较序列化 body、measurement、完整 inputCalibration 和 usage。 | B 复用真实公开 meter 算法并增加透明计数 delegate；新身份只用于验证可信代码贡献边界，不自称 B 获得官方或上游认证。 |
| D4-C A/B 换代与 φ | Pass（同进程贡献） | 持 A lease，注册 B，再开始 dispose A；A 停新准入但旧 lease 仍 plan/invoke。真实 A 上游 usage 建锚，重放时只调用 A φ/δ，φ 输入含保留回复而不含稳定前缀；B 用旧锚必须 full/basis_changed。A/B 结果分别保留各自完整 binding。A 实际 reader 输出原固定 reader revision 与同次观察。 | 同一程序代际的共享 reader 实现，未模拟替换已加载 JS module 的任意 reader 热补丁。reader 由旧 plan/实际 HTTP 固定，未新增独立 reader 注入口。 |
| D4-D 同 binding 冲突/部分初始化失败 | Pass | 相同 owner/cleanup/meter 幂等；相同 binding 换 φ 函数拒绝且无多余 registration，原退休后依然拒绝；新 Cordis contribution 的 provider 不匹配导致 fiber 失败，新 registry 零注册/引用/执行。 | 未穷举每种初始化资源失败；没有伪造 factory 成功返回或吞失败。 |
| D4-E 配置/组织/租户/撤销/轮换 | Pass | 合法可信 custom declaration 允许两套 layout，同 configuration revision 不同值的 lease 互不接受；非法 TTL 明确 invalidInput。实际 SQLite 目录中 organization 与 tenant 两层 custom profile、真实团队邀请/加入、跨组织及跨租户读取拒绝、普通成员写组织格拒绝、同档案旧配置修订不同值拒绝且行不变；withdrawn 可读。实际凭据轮换后新读新值、旧已取得值不变、他租户无凭据。真实移除成员后写入及应用准入拒绝，凭据 source 回调零执行；登录 revoke 后应用在 verify 拒绝。 | 目录原始按范围读和 trusted credential lookup 不是认证 API；它们不是本次成员撤销 oracle。没有把撤销说成自动取消已出门调用。 |
| D4-F 排空/实际停止/一次释放 | Pass | 非强制 retire 在真实 TLS reader 活动时返回 remaining_active，禁止新 acquire，cleanup 为 0；完成旧调用后显式重复 release 不重复 cleanup，最终引用/执行/注册均 0。强制 retire 使 lease signal aborted，但仍持引用；等待 outcome、实际 reader completion 与 socket close，再 release，cleanup 恰一次。另用显式未完成 callback 证明 force 不能冒认所有工作停止。 | callback 是受控等待工作，不伪装成生产 waiting owner。 |
| D4-G 新实例失败不遮旧 pending | Pass | 两个生产 registry 实例；新实例贡献 fiber 失败时旧实例实际 HTTPS reader 仍 executions>0；旧 retire waiting 可观察，待真实读完后才清理。 | 不宣称外域 Run、跨进程恢复或 D6 全实例 observer 的完整验收。 |
| D4-H runtime acquire 三分 | Pass（新 openCall 路径）；历史续接 Unverified | 实际 demo Cordis/目录/身份/STT/EvaluationInput/JSONL 装配：非法配置→invalidInput；缺精确定义→unavailable；修为可取得完整绑定→真实 TLS 发出并持久化 reply。两种拒绝均零 HTTP，日志无 opened/dispatched/response/ended 模型锚。 | 本增量未执行有历史锚的重新取得旧实现路径，也未穷举 awaiting_decision/resumable/reply_pending 全部保持引用状态；这些需与 root 已有 runtime/恢复证据逐条对账，不能靠这 9 项替代。 |

**未验不是发现缺实现。** 本次所有必需公共接口可用，没有确认需要新增产品接口或改规格的阻断。完整 D4 的剩余对账应补入：既有真实 service old-call/new-call、旧精确历史续接（旧实现不在时无隐式新版本发送）、三种等待状态的引用保持证据。若已有精确版本的独立真实证据有效，可复用；否则沿现有 app.bindModelRuntime/openCall/reconcile 与 JSONL 历史端口补测，无需造 Run/资产平台。

## 可辨别负控

`mutants.mjs` 只复制此 spoke dist/package.json，依赖和 tokenizer 只读链接回此 spoke，不改原 dist。正常 copied-control 使用同一独立 D4-C 测试通过；两个故意错误各只改 copied-dist 一处：

1. `newest-phi-on-old-lease`：旧 entry 保留 metadata，却将 measureReplay 指到 registry 最后注册 B；原测试在 A φ 调用次数断言失败（0≠1）。
2. `ignore-basis-identity`：忽略旧锚 basis 与当前 binding 关系；B 错进入 marginal，原测试 full/basis_changed 断言失败。

两次都为预期 AssertionError/exit 1，没有模块加载或未处理异常冒充检出；正常对照 exit 0。见 `mutants-final.log`、`mutant-results-final.json` 及 `mutants-final/*/run.log`。最后补充 B 的实际发送断言未改变以上前置 oracle；最终正常全矩阵仍通过。原 dist 文件 SHA 前后逐个相等。

## 实际命令与结果

在本 spoke 根执行；未使用共享 dist、在线下载或真实模型凭据。依赖安装 frozen/offline/ignore-scripts，build 单 workspace worker；测试 maxWorkers=1。

```bash
pnpm --filter '@omne-harness-lite/model-invocation-minimal-demo...' install --frozen-lockfile --offline --ignore-scripts
pnpm --filter '@omne-harness-lite/model-invocation-minimal-demo...' --workspace-concurrency=1 run build
pnpm --filter @omne-harness-lite/pi-ai-transport exec vitest run tests/acceptance-d4-contributions.spec.ts --maxWorkers=1
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/acceptance-d4-scopes.spec.ts --maxWorkers=1
pnpm --filter @omne-harness-lite/pi-ai-transport run typecheck
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck
pnpm exec prettier --check packages/model/pi-ai-transport/tests/acceptance-d4-contributions.spec.ts examples/model-invocation-minimal-demo/tests/acceptance-d4-scopes.spec.ts
```

对应 `install.log`、`build.log`、`transport-final.log`（7通过）、`demo-final.log`（2通过）、`transport-types-final.log`、`demo-types-final.log`、`format-check.log`，均 exit 0。反控运行 `node tmp/d4-acceptance/mutants.mjs`，结果见上一节；原路径已有 symlink，不覆写原证据重跑时需给新的输出目录。

## 首次失败和修正留存

没有删失败日志，没有放宽产品拒绝序列。如下均为验收夹具/断言或类型问题，具体保留在 numbered logs：

- transport-1：官方 meter 工厂正确拒绝任意新绑定；改为明确的可信 custom contribution 委托现有算法，未把它称为官方。假设存在 disabled cache 不符合实际 definition；改为自定义 declaration 中两套明确合法 layout。过早 release 发生在 reader 准入前，正确遭 invalidInput；改为 invocation owner 等实际 outcome 后 release。重复 fixture end 导致未处理 write-after-end，也在 fixture 修正。
- transport-2：新测试漏一个 `}`，transform 失败；之后真实测试正常。
- demo-1：新登录回到个人租户，不能沿用另一登录的 currentTenant；改用原登录真实 switch/currentTenant 的结果。日志目录需要 private 0700，补 fixture 权限。
- demo-2～4：publishLocalInputs expectedRevision 必须随真实连续提交前进；初始对内部目录/credential lookup 的成员撤销断言超出 Directory5 S16/S20，逐条核规范后移到应用实际准入。最终明确断言 membershipNotEffective、source 零次；不是通过放宽成任意失败。
- 第一次 typecheck：测试 helper 失败联合过窄，以及未收窄 RequestInputEvidence；只修新测试类型，后续两包 typecheck 均通过。

生成密钥、受控凭据和数据库仅为本机测试夹具，均留在 own tmp；没有读取/调用生产付费凭据。进程已退出，无常驻 reader/server。根调度可在保全本目录全部独有证据后退休 spoke；最终集成与接受由 root 负责。
