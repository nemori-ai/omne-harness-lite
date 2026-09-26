# 本次结果与四节点证据义务的对应

采用各节点 design／verification 与冻结 v1；输入快照坐标见 [audit.json](audit.json)。
表中「通过」只指该次实际运行与指定范围；旧 run 的义务不被抹去。

checks 的 [98/98 原运行](raw/hub/w1-checks-hub.log) 与 [100/100 后续运行](raw/hub/w1-checks-path-hub.log) 分别保留；
后续仅增加 asset-model 字面 `path.normalize` 所需导入许可及 CLI 正反例，四节点相关规则仍通过。
它没有扩大 identity 消费者覆盖或墙钟别名检查的范围。

## packages/core/kernel-basis

30 条具名结果均在 [spoke JSON](raw/kernel/test-results.json)；HUB 在同一产品包修订上 [30/30](raw/hub/w1-kernel-hub.log)。

| 义务 | 实际检查与范围 | 状态 |
|---|---|---|
| isolate 实例可见性／共享数据 | `isolate-hides-instances-not-data` 3 条；新条观察子 isolate 属性抛错，严格／非严格 get 均 undefined | 通过；不把属性抛错推及 get |
| async-control-not-bail | 同名 probe 2 条，bail 返回 Promise、serial 等解析值、emit 丢返回 | 通过 |
| provider 换代重跑 | `plugin-body-reruns-on-provider-change` 1 条 | 通过 |
| disposer 并发／逆序／异常／inactive | `effect-disposal-concurrent-not-ordered` 4 条 | 通过；不推断外部资源全成功释放 |
| optional 不登记依赖及中间态过滤 | `inject-has-no-optional-form` 3 条；真实状态由 Promise 屏障驱动，消费者 ACTIVE 且只跑一次 | 通过；LOADING／UNLOADING 非严格 get 仍注册 |
| provide 随 effect 收口／部分失败 | `provide-is-effect-managed` 2 条 | 通过；basis 是否升格另归其 owner |
| Config 与插件抛出后的失败 | `plugin-throw-fails-fiber` 3 条 | 通过 |
| FiberState 镜像与主动停步 | `fiber-state-readable` 2 条；新条保持 disposer 未完成时 UNLOADING=5，结束才 DISPOSED | 通过 |
| emit listener throw | 同名 probe 2 条 | 通过 |
| logger level order | 同名 probe 3 条 | 通过 |
| Outcome／bootAssembly／清单错误／部分失败 | `testing.spec.ts` 5 条 | 通过；服务值 close 仍归调用方 |
| 产品不 import testing | [checks test](raw/checks/test.log) 与 [HUB 24-rule scan](raw/hub/w1-checks-hub.log)，源码规则与正反例在 `input/checks/` 快照 | 通过于所扫描源；不推及未来消费者 |

## packages/core/identity-values

[259/259 原 log](raw/foundation/verification.log) 与 [HUB 结果](raw/hub/w1-foundation-hub.log) 对应八个测试文件。

| 义务／条款 | 实际检查与范围 | 状态 |
|---|---|---|
| V-1／形状面、Schema 副本 | `schema.spec.ts` 逐条消费冻结 examples 第 1～11 节；副本逐字节同规范，独立 audit 再核 | 通过；第 12／13 节与隔离不在形状面 |
| S-5/S-7/S-13 | 原 `values.spec.ts` 结构相等、规范 JSON 与 sameAccountDistinctTenants | 通过于纯值判定 |
| S-14/S-15 | 原 `predicates.spec.ts` 与新增 `affiliation.spec.ts`：模型 hash 守卫 + 6 ancestors + 36 shared pairs；实际 [Alloy solution](raw/foundation/alloy-fixture/coreCorrespondenceFixture-solution-0.json) | 通过于六组织 fixture；读快照与同提交仍归治理 |
| S-31 唯一空白表 | `opaque.spec.ts` 从冻结 contract 表导出 26 点，核 parser/Schema 首尾拒绝、中间保留、运行期不可修改 | 通过；完整 Unicode 词法新约束仍未裁 |
| 身份品牌／公开规则输入 | `opaque.spec.ts` 三品牌／五类型，负向类型断言；外部 built exports consumer runtime 与最终 tsc | 通过；LoginIdentifier/HandoffWarrant 不属于身份名单 |
| S-35 原语 | 原 `handoff-warrant.spec.ts` 正例、错标识／用途／密钥、伪造、非规范编码与重放 | 通过于签发核实原语；领域前置现读与密钥私有性归消费者／装配 |
| SC-1/SC-2/SC-9 规则形式 | `tools/ts-checks/tests/core-rules.spec.ts` 两向 fixture，SC-2 真实 AccountRow 内存变异；[98/98 与 scan](raw/hub/w1-checks-hub.log)、[coverage](raw/checks/coverage.json) | 规则形式已验证；SC-1 实际准入函数 0；SC-2／SC-9 仅语法直接形状部分，消费者整体未闭合 |

消费者 V-3～V-14、SC-3～SC-8 的完整义务不由本模块测试替代。
品牌不相容测试只是 S-2 的类型约束，不是契约 SC-3 的身份参数无默认值义务。

## packages/core/offer-expiry

[31/31 原 log](raw/foundation/verification.log) 与 [HUB 结果](raw/hub/w1-foundation-hub.log)；产品源码本次未变。

| 义务／条款 | 实际检查与范围 | 状态 |
|---|---|---|
| S-8 | `derive.spec.ts` 终结优先、严格不等号、目标 absent | 通过于纯函数 |
| S-20 | `derive.spec.ts` 不可用传播与终结优先 | 通过；不是实际存在性读面故障注入 |
| S-13 | acceptable 三种不可接受状态同 false | 通过；真实操作失败字面归消费者 |
| S-4/S-14 | timingFrom/parseOfferTtl 非法输入、正值、缺席分流；time.spec.ts | 通过；默认值启动失败归消费者／装配 |
| S-22 | schema.spec.ts 副本相同、Schema examples/x-counterexamples；审计逐字节 | 通过于形状，Schema 仍放行 expiresAt≤issuedAt 反例 |
| SC-OE-1/2 | checks 原消费者规则自测 + 24-rule scan | 通过于命名／语法覆盖范围，间接辅助函数不覆盖 |
| SC-OE-3 | `core-rules.spec.ts` 三种墙钟反例、显式时间合法、原真实扫描；[98/98 log](raw/hub/w1-checks-hub.log) | 三个直接调用反例已验证；别名不覆盖 |
| testClock／类型层 | testing.spec.ts 只前推、不可用；types.spec-d.ts | 通过于替身与类型，不证真实时钟 |

S-5/S-10、S-16/S-17、S-19 与 S-23～S-26 的真实操作／装配责任保持在对应 owner。

## packages/core/storage

本次逐条结果见 [正常 JSON](raw/storage-hub/enabled-UATxGq/report.json)，完整 19 条真实 SQLite 套件；
同套件的 [负向 JSON](raw/storage-hub/disabled-xzINMp/report.json) 保留实际失败。

| AI／OG 要求与协议 | 测试 | 本次状态 |
|---|---|---|
| R-1／P-1 原子与异常原样 | C-1a/b、C-1c | 通过 |
| R-2／P-11 唯一错误命名 | C-2、C-2b | 通过 |
| AI R-2 提交内重读／P-2 | C-3 | 通过 |
| AI R-2+R-3／P-12 并发创建 | C-13 | 通过 |
| AI R-3／OG R-3a／P-4 | C-4 | 通过于实际一次交错 |
| OG R-3b／P-5 | C-5 | 通过于实际一次交错 |
| AI R-3／OG R-3c／P-3 | C-6a/b | 通过 |
| OG R-3d／P-6 | C-7、C-7b | 通过 |
| R-4／P-7 关闭重开 | C-8 | 通过；没有跨进程重启 |
| R-5／P-8 不可用与撤除 | C-9a、C-9b | 通过 |
| P-8 缺陷与 P-13 嵌套拒绝 | C-14、C-15 | 通过 |
| AI R-6／P-9 释放唯一键 | C-10 | 通过 |
| AI R-7／OG R-6／P-10 两向引用 | C-11、C-12 | 正常通过；关外键后两条各因目标断言失败 |
| 套件自身与 C-11 负向义务 | `storage.conformance.real-sqlite`、`storage.conformance.detects-disabled-foreign-keys` | [外层 2/2](raw/hub/w1-storage-hub.log)；故障子进程 17pass/2fail，非成功退出冒充检出 |
| mapStorageError／协议类型／迁移组合 | 本次 foundation HUB 只 build/typecheck core/storage，未单跑包内测试 | 维持历史 run 已核范围；本 run 没有新的包内 runtime 结果 |

负向 fixture 通过公共驱动边界关闭外键，连接、事务、查询、错误映射与句柄关闭仍由真实实现承担。
它不新增产品行为，core 无 infra 反向依赖。本次不复跑 pg、真实账号／组织外键、跨 owner 动作链、断电或其它故障变异。
