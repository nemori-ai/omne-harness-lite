# RT5 的精确消费者传播

本候选继承 D-086 已接受 RT4，唯一依赖升级是 MR4→MR5；新增同次已留存头事实 S-58→S-54→S-17 的公共交接。MR5 与 RT5 均未接受，header-handoff rev1 是候选方向依据；提供者设计、实现符合性和证据不随版本复制。旧消费者不自动升级。

| 消费者/输入 | 本候选保持或改变的精确关系 | 负责产物及完成条件 |
|---|---|---|
| RT4 十三服务操作与独立 invokeModel/构件 | 原 S-1～S-73、十三九项、四 outcome、无隐式重试、纯函数零日志依赖及 SL3 结算/恢复全部保留；S-54 增可选 rawHeaders，不增加第十四操作或 ResponseId | runtime spec/provider owner；原成功/拒绝/故障及 RT5-H1～H6，全链未验证 |
| MR5 | 精确消费原二十六条（S-3～S-24、S-35～S-38）；唯一头值源为 S-20，S-21/S-22 原留存边界不变；数组不能交旧 MR4 链 | response owner 与主线共同正式采用 MR5/RT5；MR5 有限 Schema 形状检查不代证事实来源、脱敏与过程保真 |
| TransportAdapter.send/read 与运输提供者 | 同次 send 公共 rawHeaders 是唯一交接权威；成功 R 仍不透明；失败/取消后不能丢已取得且留存的头，read 不覆盖、不另发 header arrival | transport/core/runtime owner；另立提供者投影，覆盖实际 HTTP 成功/失败、读体/解析中断、已取头取消与门失败；真实停止依旧必验 |
| 公开函数消费者 | S-54 返回头值无会话、租户、ResponseId、消息或自动入账；不从 R 私读，也不拼接数组，头不进 snapshot/onAccepted/诊断 | core 与各函数消费者 owner；明确公开接收面与制品、双语 literal 和 compiled 负控；不由本契约代选公开入口 |
| 完整响应写方与 runtime 提供者 | 原 [D-087 v4-design rev2](../../../../realization/packages/model/model-request-runtime/v4-design.md) 采用 RT4/MR4；新消费者须显式映射 rawHeaders→完整 MR5 raw.headers，并保持原参数/绑定/费用、原批优先、unknown 强门和实际停止 | runtime/host/全部写方 owner；新投影与采用不能只改版本号，旧投影接受不覆盖数组 |
| 共同日志构件与 codec | 原 [D-088 v4-log-codec-design rev2](../../../../realization/packages/model/model-request-runtime/v4-log-codec-design.md) 不自动采用 MR5；JSON 能保存数组不足以代表完整 MR5 可接收 | 共同 codec/core owner；明确所有 encode/decode 及公开完整形状守卫的精确版本，历史 wrapper/key/混用策略交主线与 provider owner 裁定，本候选不补兼容默认 |
| 外部 persisted 回复写方 | MessageId+ResponseId 完整批同提交；原函数 H 原样进 rsp；withRun 同次完整前缀+tailEquals，noRun 显式 unconditional，所有写方共同键与原批认回 | loop/回复消费者 owner；两种胜出顺序均无孤消息，无新 send；一次 append/reopen 验完整响应与头值来源 |
| session-log v3 | 仍是相同精确消费范围，显式第四参数、同一物理日志的比较/整批/持久/恢复不变 | 日志提供者与真实写方；不能以头增补免除 SL3 条件或以存储可写 JSON 声称新响应已采用 |
| 其余十六项 RT4 依赖 | 坐标、clauses、rebase_relation 逐值保持；包括 SL3/AR3/MS4/MP3/CA2；适配37模型验收、参数与缓存政策不扩范围 | 各原 owner；没有自动模型认证、资产升级、消息数据升级或全量产品 rev 重采纳 |
| run-attempt-facts v2 | 两个独立 bool 仍不是 RT5 的完整前缀；不新增 RAF2 规范依赖、不改旧消费者 | Run/loop owner；生产终结认法 G-28 与 RAF2 G-3 仍待，不把测试种子当生产定义 |
| loop-extension-runner v3（D-076 accepted） | 仍精确消费 RT3 的合法目标、发出守卫、S-67 默认件身份；RT5 不使它自动换版，writer 还需 SL3 条件 | runner owner 对 S-24/S-30/S-50/S-67 反向核对并显式选版；guard 相容不等于 writer 迁移完成 |
| 应用/宿主与观测消费者 | 显式原争用、时限与 S-20 政策；H 不入模型上下文、面向人默认展示或诊断 detail；本轮没有新观察队列 | 各 owner；真实 TLS→invoke→全部写方→append/reopen、秘密哨兵和实际停止；不把 mock/Schema/继承模型代真实 IO |

## 必须保持的停止与切换顺序

1. 先完成 MR5/RT5 及提供者和全部实际写方的精确采用；检查公开数据接收、共同业务键/读取键、消息响应全批认回、显式 condition、owner 政策和失败传播。未裁 codec wrapper/key 历史读取或混用策略，不由本候选补一个默认值；缺少必要采用，不把新数组值交入旧 MR4 消费链，也不在同一日志根混用 SL2/SL3 追加面。
2. 关闭旧业务准入，实际停止旧网络读取、门回调、追加与潜在 unfenced 结算者；不能仅以取消、函数 outcome、运行时撤除或新 fence 认作停止。已有 durable 锚点/意图、未知责任和已交接留存头事实仍保留，不补假响应。
3. 日志 owner 按被采用的生命周期协议关闭准入、排空旧任务、完成旧物理写者停止与资源/所有权交接，由新 owner 独占恢复真实日志。写入不可信时旧确认尾不能证明缺席；无法确认恢复条件保持 unavailable。
4. 在原 S-33 新尝试/重新承载时机权威读回；带 Run 时另确认共同日志新尝试的有效 fence。所有历史响应按稳定身份认回原完整批（包括其原头值）；未提交批才按新合法前缀重构 late。无 Run 保留独占重新承载与 late 缺席。
5. 所有应对账项收口后才按原守卫允许新的推进。接线变更不创造模型重发许可，不加载新模型版本重写旧绑定，不用新候选头覆盖已提交批，也不把历史 JSON 记录自动升级为新业务值。

## 证据和停止边界

本版四个 TLA 模块、十九配置逐字继承 RT4；六个新坐标任务只登记，未运行。模型不含 rawHeaders，不能证明实际观测/保留/脱敏/取消后交接；也不证明真实网络和文件写者停止。原三模型与 Settlement 各自性质/前提见 [formal](formal/README.md)。RT5-H1～H6 全部未执行，原十三操作与37模型验收同样未完成；具体状态见[版本外验证](../verification.md#v5-候选变化与证据)。

切换/放手/回复处置的回执未知不保证持久状态未变：消费者按 S-6/S-9/S-27/S-32/S-49 区分本实例待确认与权威记录；读当前选中不是本次命令恰一次认回，不自动重放未知切换。收口/重新承载是入口，owner 保留不保证未来调度；只有 S-71 前提成立且结算/恢复被实际调用，执行到许可预算内的真实提交机会，才有条件进展。全尾争用不保证无饥饿。

G-6 政策值、G-28 生产 Run 认法、G-29 共同业务键及真实提交/恢复组合、G-30 合法完整前缀的实际读取授权与供给和其他继承缺口仍由原 owner 承担；G-31 只完成候选表示/交接表达。PF-004/PF-001/PF-015 当前 rev13/rev23/rev13 与原采用 rev12/rev19/rev11 的全量差异重核不在本次 headers 增补，归产品原 owner 与主线。若合法前缀、共同日志、完整形状接收或实际提交机会不能成立，交主线改判，不删除不变量放行。
