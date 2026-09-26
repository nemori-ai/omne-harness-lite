# D051-r2 治理 TUI 独立验收补充判决

**判决：Fail。** 在原先 15/15 可执行场景通过后，扩展 34 表单验收发现 QA-03。先前的 [r2 初始报告](report-r2-initial.md) 保留其当时的 `Unable to verify` 及覆盖范围；本补充把同一固定制品的新证据纳入判决，不改旧运行。验证者 `tui-qa`，run id `d051-r2-qa-20260925-1340z`，基线提交 `cc01c8322e71d48d784bcb66e27cb81814fd4b6f`，Node v24.21.0。归档 SHA-256 `2952d2f6883397153dd417b214b83ccd9ee5264b3a3fe9eaf5f109b6368a4b47`，BUILD_ID `6af1185e3f47ef1d11ef7f69291c688ccda6e5dad939a92c81804493ec66535f`，真实中心入口 SHA-256 `0c38fcc59fae65fea0fb7b3e3ef59ac919a40bece9ecf1fb90f45739174565e6`。所有独立运行是 **macOS PTY 合成模式答复**，不是 Linux XTerm 模拟器。

| 条目 | CQ2 标准与实际场景 | 证据 | 结果 |
|---|---|---|---|
| Q01 | S2/S11 帮助、非法输入、非TTY | `acceptance/smoke.py` → `evidence/d051-r2-smoke/` | 5/5 Pass |
| Q02–Q05 | S3/S4/S6/S9 真实中心 setup、身份、预览、固定 Use | `acceptance/journey.py` → `evidence/d051-r2-journey/` | 4/4 Pass |
| Q06 | S7/S10/S11 正常/信号/粘贴收场 | `acceptance/lifecycle.py` → `evidence/d051-r2-lifecycle/` | 4/4 Pass |
| Q07 | S8/S10 PTY 输出背压及关闭写屏障 | `acceptance/backpressure.py` → `evidence/d051-r2-backpressure/` | 1/1 Pass；旧修订确认另测 |
| Q08 | S8 100×40→40×10→100×40 字段与身份保持 | 同上 | 1/1 Pass；Unicode/IME 未测 |
| Q09a | S5/S6/S12 全34表单进入真实 CG Preview，Intent 按冻结 CQ2 对齐 | `acceptance/forms_coverage.py` → `evidence/d051-r2-forms-attempt2/` | **33/34**；S37 非成功后多读 S36 |
| Q09b | S5/S6/S9 受保护文件 TUI 登录、拒绝0644文件、主动改密 | `acceptance/secret_paths.py` → `evidence/d051-r2-secrets-attempt1/` | 3/3 Pass；旧凭据 CLI 拒绝，新凭据同账号登录 |
| Q10 | 实际两种终端、Mac GUI/IME、全34项成功业务语义 | 本轮无该独立设施 | 未覆盖 |

**QA-03，中等严重度。** 触发：TUI `Tenant switch` 的 CG Preview 选择 Cancel。旧制品 S37 报告为 `admission.blocked/invalid-input`、`remote.not-attempted`、exit2，之后界面却自动发起 S36 `Tenant current` 并要求结算。冻结 CQ2 S9 只要求 S37 **成功 Ack 后**现读；这笔额外业务读取会改变活动时间和可见事实。复现 `forms_coverage.py`，`evidence/d051-r2-forms-attempt2/governance-all.raw` 的相邻结果帧及同目录 `center.json` 的 S36 请求。建议 `tui-developer` 改后续读取条件，独立 QA 复验。r2 中其余33项仅证明字段、条件、非秘密 Intent、原预览与取消；它们不证明33笔目标操作成功提交。密码路径三项另有真实提交证据。

替身/残余：中心/TLS/CG/CLS是真实进程；PTY 模式答复由脚本给出，不证明终端对普通粘贴、IME、宽度表或 scrollback 的实现。可选字段仅走默认省略，所有角色/有效期/信任分支未穷尽。`Center configure` Preview 的 `trust.source=system` 是 CG2 S6 的安全摘要；首轮 QA 曾把它误与提交的 `{mode:ca}` 直接比较，已在第二轮按契约投影纠正，不列产品缺陷。原始首轮和第二轮都保留。

清理：中心与 PTY 进程均退出，临时 TLS/凭据/状态目录撤除，仅在 `tmp/production-cli-onboarding/tui-qa/` 写入。此报告不是产品接受。
