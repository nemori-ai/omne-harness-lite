---
kind: research
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/research/user-input-and-command-sources.md
source_sha256: 92355f97d8cc3a341529dfb6a6eecdacb5682bd4d40f86252ac7444938edf78e
source_anchor: "heading:# 用户输入与命令的来源核对"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: current-evidence-selection
---


# 用户输入与命令的来源核对

[PF-009 正文](../../../design_legacy/requirements/product/PF-009-multimodal-input-attachments-and-commands/requirements.md) · [研究索引](../README.md)

2026-09-12 按用户本轮输入要求核对 `omne-next` 提交
`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`。下列来源与固定提交 Git blob
逐字节核对；记录的是产品承诺及来源设计，不声明原系统或本项目实现完成。

## 来源与映射

| 来源 | 状态与本次范围 | PF-009 对应 |
|---|---|---|
| [原生多模态与附件][multimodal] | Accepted · current，ratified 2026-09-01；输入 Statement、AC-1～5 与 09-07 AC-8 | C1/C3/C4：混排保序、附件持久引用、租户隔离、限制与真实拒绝、模型可读/仅可见公开声明 |
| [语音输入与音频理解][audio] | Accepted · current，2026-09-03 授权、09-04 立档；Statement、AC-1～6 | C4：音频从旧收储可见档提升为原生听觉输入；不以静默转写替代 |
| [上下文化命令发现与受治理调用][commands] | Accepted · committed-future，2026-08-04；发现与 slash 分支、09-07 / 09-10 修订 | C5/C6：当前上下文目录、精确版本、当地补全、实时准入、明确解析与字面输入；保留独立会话排队命令的范围 |
| [跨设备快捷键设置][keys] | Accepted · committed-future，2026-08-04；Outcome、Actors、Required behavior | C2/C7：键盘控制、账号设置、平台差异、明确目标和真实控制结果；不是 slash 宏 |
| [原系统统一语言][language] | 历史访谈及设计词汇；§2.2 capability / slash_command / plugin | 解释 slash 绑定 Skill/Prompt 并装载上下文；本轮“Skill 手动调用走 slash”由用户直接确认，不依赖把整份旧术语表接受为本项目模型 |

## 有效修订与解释边界

- 多模态源开头有“全格式收储”，同时规定准入白名单、尺寸与配额；本轮不据前句
  承诺无限制接收任意字节。09-07 修订要求公开声明与门一致，并区分模型真的
  读到内容与只知道附件存在。接受声明不等于供应模型永远不会失败。
- 音频后续独立要求已经明确原生听觉输入，不能沿用旧实现“只收图片/PDF”或
  “音频只需文件名”的收窄。视频等其它格式按已确认适用范围与声明处理，不从
  一个 audio 块反推转写、视频抽帧或所有格式理解能力。
- 命令源的 09-07 修订限制的是**上下文装载型** slash 归约，不是所有命令。
  09-10 又要求入队命令提供服务端可解释的引用、版本、参数与安排声明，客户端
  不能自造插队权限；具体排队产品规则归该来源链接的 pending owner，未在本轮
  建立一套新的排队模型。
- 旧统一语言仍有“slash 恒归约为聊天”的宽泛句子，消费时采用上述较新修订。
  Skill 和 SlashCommand 是可相互绑定的不同定义，不因手动入口统一就合并。
- 键位源首批动作是 `interrupt`、`resume`、`cancel`、`force_stop`，pause/retry
  并未因相邻实现存在而获准。仅轻量 interrupt 有官方默认快捷键；取消/强停可
  主动绑定且保留显式控制。本项目精确动作及键位清单仍须与其运行语义一起建模。
- 来源还包含 official `$` 系统命令与多模态输出的独立承诺。本轮引用只展开
  用户指定的输入、keyboard 和 slash 范围，不用目录共存推出统一执行机制，
  也不把尚未专项登记理解为取消整体功能继承。

本轮未运行来源实现或验证端到端模型载荷。旧内容块字段、上传接口、LangChain
类型、解析器、缓存 epoch 及进程位置只保留来源身份，后续由语言无关规格决定。

[multimodal]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/northbound-native-multimodal-content-and-attachments.md
[audio]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/northbound-user-spoken-input-and-audio-comprehension.md
[commands]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/inbound-contextual-command-discovery-and-governed-invocation.md
[keys]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/useraccount-cross-device-session-run-control-keystroke-bindings.md
[language]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/bounded-contexts/ubiquitous-language.md
