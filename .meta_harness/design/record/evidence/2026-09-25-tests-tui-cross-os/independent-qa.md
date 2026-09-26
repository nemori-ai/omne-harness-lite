# D051-r3 治理 TUI 独立验收

**判决：Unable to verify 完整 TUI 交付。** 固定 r3 制品的 53 个可执行观察全部通过；Mac GUI/输入法、第二种实际终端及全部34项成功业务结果仍没有独立验收。本判决不等于产品接受。验证者 `tui-qa`，run id `d051-r3-qa-20260925-1400z`，基线提交 `cc01c8322e71d48d784bcb66e27cb81814fd4b6f`，工作树有未提交增量。

固定坐标：归档 `tmp/production-cli-onboarding/omne-cli-d051-r3.tar.gz` SHA-256 `90f5b283673d8ec9a66cfa86b3d2faae914fe5a8e9c1c4541dc5e1e87d4077dd`；搬离仓库 `/private/tmp/omne-cli-d051-r3-t0y6xucj/app`，BUILD_ID `a22d9a120e14f841d615b8de4fff08cd922a49de1fdfd0dde111b05935e9019d`；TUI application.js `523df18e2f2c2b7e5ecd1dfbf2035473bfcc49e73a2420ce2403878309eb2609`、framer.js `f17a9ef5b7db20a3bf1dda4960004af7814d474796e485fe6a777417ee175691`；真实中心入口 `apps/tenancy-host/dist/cli.js` `0c38fcc59fae65fea0fb7b3e3ef59ac919a40bece9ecf1fb90f45739174565e6`。Node v24.21.0，在 **macOS 真实 PTY** 以脚本合成 xterm 模式答复运行；不是实际 XTerm379 或 Linux 模拟器。本轮所有七个场景脚本退出码 0。

| 条目 | 冻结标准→触发/结果 | 独立脚本与证据 | 次数/命中 |
|---|---|---|---|
| Q01 | CQ2 S2/S11：帮助纯输出、非TTY/非法命令拒绝且无状态副作用 | `acceptance/smoke.py` → `evidence/d051-r3-smoke/` | 5/5 Pass |
| Q02–Q05 | CQ2 S3/S4/S6/S9：setup单动作、初始三读/身份、三页预览早确认拒绝、CLS外部切换后旧Use固定 | `acceptance/journey.py` → `evidence/d051-r3-journey/`，真实中心日志及 machine JSON | 4/4 Pass；S21目标请求恰一笔 |
| Q06 | CQ2 S7/S10/S11：正常退出、业务前信号、分块/未完粘贴、termios/2004恢复 | `acceptance/lifecycle.py` → `evidence/d051-r3-lifecycle/` | 4/4 Pass；r1 QA-01/02 原断言保持 |
| Q07a | CQ2 S8/S10：150,658字节帧的真实PTY读背压中不能假完成、恢复后无迟到帧 | `acceptance/backpressure.py` → `evidence/d051-r3-backpressure/` | 1/1 Pass；暂停读端时进程/raw/2004保持，恢复后排空与退出2 |
| Q07b | CQ2 S6/S8：旧修订尚有PTY输出时的`2`+Enter不能自动提交新预览 | `acceptance/revision_backpressure.py` → `evidence/d051-r3-revision-corrected/` | 1/1 Pass；早键后中心仍未配置，缩窗重绘后`2`仅保留为字段草稿，新的一次Enter才配置成功 |
| Q08 | CQ2 S7/S8：缩窗暂停及恢复未提交字段/完整身份 | `acceptance/backpressure.py` → 同上 | 1/1 Pass；100×40→40×10→100×40。CJK/emoji单元属性与实际GUI resize未测 |
| Q09a | CQ2 S5/S6/S12：全部34表单经真实TUI输入后到CG原预览，Intent与冻结表单、CQ1命令动作/operation对应 | `acceptance/forms_coverage.py` → `evidence/d051-r3-forms/summary.json`、逐表JSON、PTY原始流 | **34/34 Pass**；写操作于预览取消，读操作可触及真实中心；仅证实所走字段分支与输入映射 |
| Q09b | CQ2 S5/S6/S9：受保护文件登录、0644文件拒绝、主动改密令旧凭据失效 | `acceptance/secret_paths.py` → `evidence/d051-r3-secrets/`，machine CLI事实与中心日志 | 3/3 Pass；TUI秘密内容哨兵不在原始流，旧凭据CLI拒绝、新凭据同账号登录 |
| Q10 | D051实际终端矩阵、Mac GUI/IME、全部34项成功业务结果 | 本独立实例没有实际模拟器/IME设施 | 未覆盖 |

**本轮未发现所测范围的未修复缺陷。** [r2 的 QA-03](report-r2.md) 是 S37 非成功后额外现读 S36；r3 同一34表单脚本 34/34 通过，取消/拒绝分支不再出现附带 S36。S37 成功 Ack 后是否现读在主线回归中有证据，本独立场景未制造成功切换，不能冒称此边通过。r1 的 QA-01/02 同原生命周期断言再通过。

Q07b 的解释需精确：缩放后旧键形成的 `2` 可作为**未提交字段草稿**保留；它没有在旧帧或新帧写入期间自动调用 configure。完整新帧呈现后，人再按一次 Enter 才构成新的明确确认。最初 QA 脚本把“resize 必须清空草稿”当断言导致失败；CQ2 S8 要求撤销旧**确认资格**，不要求丢失字段草稿。无效尝试与修正运行均保留，最终脚本不放宽“早确认不得发送目标”的断言。

替身与残余风险：中心、TLS、CG/CLS、CLI/TUI 都是真实进程；模式问答由 QA PTY 对端脚本作答，只证明该协议边界下的行为。主线另有 Linux XTerm379 普通粘贴与 Unicode/resize 探针证据，但不是本独立 QA 运行，不能并作 Q10 通过。没有独立的 Mac IME、第二种终端、特殊粘贴、终端 scrollback 或所有可选/条件分支；34表单的 Preview 通过也不是34笔成功业务提交。强杀后的外层终端状态未测；进程自身无强杀后恢复保证。

清理：本轮真实中心及全部 PTY 子进程已退出，临时TLS/凭据/状态目录撤除；只写 `tmp/production-cli-onboarding/tui-qa/`。场景源 SHA-256：`smoke.py` `1522cc478c3603a3895e646158fc608b88f9c9802d6e59dfb2e81c14531737ab`；`journey.py` `830746ff659f6ffe2c9ac8ac8b43c04c40c5d4a22e47374d5efd3c2b3aba0e52`；`lifecycle.py` `9e38dfcc543524694a1bb293422eab030ce279286c9cb4035183fa4d9596edea`；`backpressure.py` `bd312a576444c11fdf9a39ef6447947495d5d9423497cc11d757866ed3a7e777`；`forms_coverage.py` `aaf20f269af9ad89f016c084638738a9550c7e1b49f0acd7521a139830bc81f0`；`secret_paths.py` `e4d458e0502726259574d328f0d667d832a9f13ecd131b767606b0a782c9b71d`；`revision_backpressure.py` `ba4884fc18a119fe34911d3c1d844d8d068c6f3dde84f92ca4254d7c4b446a60`；`center-fixture.mjs` `6ca4998ce20ef206f04c40c58e05966a199988c750539d5d2ac4c5259936abe2`。源码、制品或证据变化后本判决失效，须另开 run id。
