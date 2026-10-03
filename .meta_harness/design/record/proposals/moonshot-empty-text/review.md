# 独立选择评审与处置

2026-10-03，主会话归档 `design-reviewer` 的只读评审。评审对象：v16 revision 1，SHA-256 `4496691143b5b0b631b0a21fb2dd882126ddb4e2be667880381248d587f1ef47`；当时工作树分支 `panqiwei/pi-isolation`，报告未单独记录源码 HEAD。判据为手册 `references/review/choice.md`。2026-10-03 归档时 reviewer 只恢复原结论，没有重审、改文件或运行工具。

## 结论

本次范围无阻断、无非阻断选择发现、无新增政策裁决项。

1. 顺序为标记加入后、图片准备与计量前，保留空白、全空串、标记和原输入；与 RT12 S-57／S-74、CB3 S-22 一致。
2. 完整模型／definition／implementation／provider 匹配，新行为由 mp4-19 指认，符合 MP6 S-29。
3. 最终 body→units／envelope／摘要编码 C 未变，投影 /3 保持；实际前缀变化仍由摘要识别。
4. Moonshot 工厂从当前官方定义取实现修订；当前 basis 守卫比较完整绑定。计量器继续 full-only，无需改算法或 tokenizer。
5. 原前缀改变时 prefix_changed；前缀不变而 implementation 改变时 basis_changed，回落 full，不冒充兼容。消息不删，跨度不因此错位。
6. catalog 修订和指纹、示例序号已有承接；无新增存储、资源、事件或跨 owner 提交责任。

## 输入与未覆盖

读取 RT12 S-57、S-74、S-77～S-83；MP6 S-29～S-31；CB3 S-8、S-22；节点映射与绑定、研究稿，以及 planner、projection、Moonshot 定义／meter、catalog、公共 meter、transform、calibration、history 和示例目录消费者。

没有运行测试、形式工具或付费请求；未附设计评审工具输出，依赖图读数未核。现行 tokenizer implementationBindings 与当前 reader 夹具仍消费旧坐标，交实施迁移；既有 Cordis 生命周期仅判本增量有无新增责任。纯文本与历史位置的上游行为仍未知。

## 处置及保留义务

主会话技术采用窄规则。MV5-1～9 全部保留，尤其两种旧 observation 失效、新 provenance／当前夹具迁移、非目标负控和修后真实请求。检查执行按 D-115 的负责人后继要求计算影响面，不入全机队列。评审本身不产生采用或运行证据。
