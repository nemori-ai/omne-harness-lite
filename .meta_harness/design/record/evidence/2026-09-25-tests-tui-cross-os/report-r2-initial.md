# D051-r2 治理 TUI 独立验收

**判决：Unable to verify 完整 TUI 交付。** 本轮可执行的固定制品场景全通过；实际支持的 XTerm379 终端、第二种终端、Mac 输入法、旧修订在背压下的确认和完整表单仍缺独立验收。本报告只给 D051-r2 所测范围的结果，不作产品接受。

坐标：验证者 `tui-qa`，run id `d051-r2-qa-20260925-1319z`，基线提交 `cc01c8322e71d48d784bcb66e27cb81814fd4b6f`，工作树含未提交增量。验收运行在 macOS 的真实 PTY 上，以脚本合成 xterm 模式答复；这不是 Linux XTerm 模拟器。Node v24.21.0；搬离仓库制品 `/private/tmp/omne-cli-d051-r2-gbcxikmq/app`，BUILD_ID `6af1185e3f47ef1d11ef7f69291c688ccda6e5dad939a92c81804493ec66535f`，归档 SHA-256 `2952d2f6883397153dd417b214b83ccd9ee5264b3a3fe9eaf5f109b6368a4b47`，TUI application.js `de1c043ba609dd327184bb0f8fa0681bc98499b96f86879cfb11d7f8308a3656`，framer.js `f17a9ef5b7db20a3bf1dda4960004af7814d474796e485fe6a777417ee175691`。真实中心仓库 `apps/tenancy-host/dist/cli.js` SHA-256 `0c38fcc59fae65fea0fb7b3e3ef59ac919a40bece9ecf1fb90f45739174565e6`；执行中主线冻结了全部 dist。四个验收脚本退出码均 0。

| 条目 | 标准触发→可观察结果 | 场景脚本→证据 | 次数/命中与判定 |
|---|---|---|---|
| Q01 | CQ2 S2/S11：帮助纯输出、非TTY/非法调用拒绝、状态不创建 | `acceptance/smoke.py` → `evidence/d051-r2-smoke/` | 5/5 Pass |
| Q02 | CQ2 S3/S9：setup 最多一次根级动作后退出 | `acceptance/journey.py` → `evidence/d051-r2-journey/setup-health.*`、中心记录 | 1/1 Pass，health 后 exit0 |
| Q03 | CQ2 S4/S8：S36/S57/S60 初始现读，完整身份和来源可见 | 同一真实中心旅程 → `governance-create.screens.txt`、`machine.json` | 1/1 Pass |
| Q04 | CQ2 S6/S8：未读完预览不能确认；明确确认后目标只发一次 | 同一旅程，60×16 三页 → PTY 原始字节、屏幕记录、中心 S21 请求和机读租户列表 | 1/1 Pass；早确认拒绝、S21 恰一笔、租户数 1→2 |
| Q05 | CQ2 S3/S9：另一进程改 CLS 后旧 Use 不改绑 | 同一旅程，TUI 原 Alice 与 CLI 新 Bob ID 对照 | 1/1 Pass；旧 Use 显示冲突 exit4，未呈现 Bob 为旧 Use |
| Q06 | CQ2 S7/S10/S11：正常/业务前信号/分块粘贴/未完粘贴信号收场及模式恢复 | `acceptance/lifecycle.py` → `evidence/d051-r2-lifecycle/` | **4/4 Pass**；正常 exit0，取消 exit2，真尾前不退出，OS termios/2004 均恢复 |
| Q07 | CQ2 S8/S10：真实写回调背压、旧修订确认与迟到写 | `acceptance/backpressure.py` → `evidence/d051-r2-backpressure/`；50,000 行大帧、PTY 暂停读取 | 部分通过：读端停 300ms 进程仍活且保持 raw/2004，恢复读取后排空 150,658 字节、exit2、无恢复后旧帧；旧修订确认尚未测 |
| Q08 | CQ2 S7/S8：CJK、emoji、组合字、resize 后内容/宽度 | 同一脚本，100×40→40×10→100×40 | 部分通过：过小提示/暂停，未提交“4”及身份恢复；宽字符和单元格属性尚未测 |
| Q09 | CQ1/CQ2：机读纯净、CLI/TUI 同一事实 | `machine.json` 每命令恰一 JSON 记录；Q04/Q05 双通道结果相符 | 部分通过；未逐条验全部 34 表单与 Schema |
| Q10 | D051 终端矩阵：XTerm379 正常粘贴、至少两种终端/两尺寸、Mac GUI/IME、强杀/scrollback | 本轮为脚本回答 DECRQM 的真实 PTY；其边界不同于实际模拟器 | 未覆盖 |

**缺陷清单：本轮所测范围无未修复缺陷。** r1 的 QA-01 与 QA-02 依原断言复验命中 4/4；旧失败原始证据和 [r1 报告](report-r1.md)保留。QA 不把复验成功扩展为真实 XTerm、Mac IME、特殊粘贴或任意复用器都正确。

残余风险与替身边界：TLS、中心业务、CG/CLS 均是实际进程/存储；PTY 的 DECRQM/mode 顺序由 QA 脚本作答，无法验证模拟器对普通粘贴的过滤/排队、输入法、真实终端宽度表、GUI resize 和 scrollback。强杀不能让进程自我恢复，仍需对外层终端另验。文件秘密输入仅由 CLI 准备双账号，TUI 秘密路径及全部 34 表单没有独立逐条核验。探索观察：r1 切换 CLS 后先写会被 CG 本地冲突挡住；改为先成功写再切换，r2 旧 Use 明确报 exit4，这与固定捕获语义一致。前期 QA 设施迭代和无效尝试已在 r1 报告列出，r2 四组场景均一次通过。

清理：真实中心及全部 PTY 子进程已退出；TLS、凭据和客户端状态的临时目录自动撤除。仅写 `tmp/production-cli-onboarding/tui-qa/`。场景源 SHA-256：`smoke.py` `1522cc478c3603a3895e646158fc608b88f9c9802d6e59dfb2e81c14531737ab`，`journey.py` `830746ff659f6ffe2c9ac8ac8b43c04c40c5d4a22e47374d5efd3c2b3aba0e52`，`lifecycle.py` `9e38dfcc543524694a1bb293422eab030ce279286c9cb4035183fa4d9596edea`，`backpressure.py` `bd312a576444c11fdf9a39ef6447947495d5d9423497cc11d757866ed3a7e777`；`center-fixture.mjs` `6ca4998ce20ef206f04c40c58e05966a199988c750539d5d2ac4c5259936abe2`。这些文件或被测制品变化后须新运行，不沿用本判决。
