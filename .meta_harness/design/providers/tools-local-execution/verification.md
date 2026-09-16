# 本地执行提供者验证边界

本页把来源观察、独立实施线的局部结果与当前 v1 联合验收分开。来源
`packages/tools/local-execution/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
的 SHA-256 为 `c2d2d03382754351a0e6413cf7158b1212541aab0e911ef1f0def27705b66cbc`。
当前 [Tools TL-07～09](../../spec/capabilities/tools/v1/contract.md)、
[Run RN-05](../../spec/capabilities/run/v1/contract.md)与
[DR v1](../../spec/capabilities/durable-records/v1/contract.md)仍为 candidate；
旧基线接受/测试不能自动转为新坐标符合性。

## 固定来源证据与限制

| 原件与精确修订 | 实际观察 | 不支持的主张 |
|---|---|---|
| `docs/proposals/core-capabilities/implementation/evidence/tool-decision-design/cordis-current-window-output.json` @ `0a6e91ea643497f309f1a69f8adecc8a98751df3`，SHA-256 `8159bb03807cf52f9e20f12a799835638d47401e01491651988d3cde75a6e3ef`；原脚本/命令见同修订 `checks.json` | 对固定 Cordis 4.0.2 发行物观察到 Fiber 先 UNLOADING、effect 稍后清理、依赖重现后旧闭包仍可能存在 | 不证明 LE/TL 的当前性门、持久准入、stop 或 host 装卸已实现；早期两次探针失败属于探针误认 plugin 外壳，不能算产品 RED |
| 同目录 `file-journal-window.mjs` 和 `file-window-output.json` @ `e6c0b8c5d1a7cc3b282c809498a241a66ad71b9d`，SHA-256 分别为 `288c4956fc92ff9afd1dd1fabaa22d258361269ce7ef2d529c384f32c1366a38` / `3f3e8abe0c00e277465a0fe0db4750656d0fc63e4a9f2256f6615bae2a16e545` | Node/Linux/ext4 上观察到文件效果与独立 marker 之间存在崩溃窗口；`0a6e91e` 保留原输出，未重跑 | marker 不是 DR journal，不证明接纳去重、原子提交、效果恰一次、墓碑或断电恢复 |
| 独立产品实施分支 `feat/minimal-runtime` 的 `e14a34c`、`245ef05`，文件 `packages/tools/local-execution/src/{filesystem,host}.ts` 与 `tests/stop-before-rename.spec.ts` | `e14a34c` 固定 stop 先于 rename 与 rename 先发后 stop 的真实宿主交错；`245ef05` 把 rename 前其他 read/write 新文件步骤放入原串行门并跟踪末次临时文件 lstat。实施协调记录报告本地 build/typecheck、29/29 tests 通过 | 这些提交尚未并入本 HUB；只证明局部文件停止边界，不证明许可时 exposure、TL 交付、RN-05 聚合、DR 新 codec、跨进程恢复或全部资源权限 |

旧 `docs/` 原件退休后，以上 `commit:path` 和校验哈希仍是回查依据；不要把临时协调记录、旧 probe 的限制或旧 `/1` 字节形状解释为新设计接受或实现验证。

## 当前 v1 反例与阻断

| 性质 | 现有保护点/证据 | 仍需取得的目标结果 |
|---|---|---|
| TL-07 exposure 与接纳空窗 | 旧 LE 设计只在 accepted 开放；局部 stop 测试从已有 execution 启动 | 在 permit 先于 LE accepted、accepted 先于回执、stop 先于 start、崩溃/换代四类顺序中证明同 call/attempt/epoch/owner generation 的 exposure 从较早时点有持久 owner；未认回不能报集合为空。TL/LE 精确提交/CC-05 交接 owner 仍待定 |
| TL-09 三轴与 RN-05 门 | 旧内部 `active/sealed/released/happened` 不是 TL 词表；局部 LE 是 cooperative fence | 证明 `physical:quiescent|isolated|unknown`、`cleanup:done|retained`、`effect:none|possible|confirmed` 同一进展事实；本地 cooperative unknown 永不假升级。只有同 call/attempt/epoch/generation/fence 的 quiescent 或经资格核实的 forced isolation 关闭 exposure；业务 settled(unknown)、超时和错代不关闭 Run 门 |
| stop 与文件动作发出 | `e14a34c`/`245ef05` 有 stop→rename、in-flight lstat 的局部真实交错 | 产品级覆盖每个 pre-rename Node 动作的 stop-first/launch-first、迟到 handle、未 rename 临时资源清理、已发 rename 后 fsync/revision/close 必要收口、这些步骤失败及崩溃。确认结果、效果与清理三轴分开；不能以局部 29/29 替代完整 AC20/23 |
| DR/CC 恢复与终态交付 | 旧 kill 探针仅有独立 marker；当前 HUB 无 LE 产品源码 | 确定普通业务批次/冲突/writer epoch 的新 codec，按完整同水位前缀恢复 tombstone/exposure/终态，旧代不能重启 I/O；TL-15 结算与 inbound arrival 同批或按 CC-05 交接，Session 独立裁决，不由 LE 直接置 Run ready |
| 资源/预算/帧/撤除 | 旧设计提供目标边界，T-R1 仅观测 Cordis 状态窗口 | 真正 ResourceFacts/ExactUse、BG 预算来源与零费用证据、授权帧披露、复合关闭和旧闭包竞争在目标应用装配中分别验收；缺失时相应消费保持 unavailable |

验证须固定实现 commit、DR/records codec、实际 OS/文件系统与应用装配、故障注入
输入及原始结果。`packages/tools/local-execution` 的旧设计源可以退休，前提是本页列出的
证据出处保留为 Git 历史；当前目标提供者的联合符合性仍是 blocked。
