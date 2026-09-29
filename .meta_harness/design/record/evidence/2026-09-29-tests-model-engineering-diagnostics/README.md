# 模型路径工程可观测性 D6 实际验收

2026-09-29，主线依据用户交付与验收委托，按已采用 runtime v15 revision2 的 D6-V1～V11 逐子义务核对，接受本轮 D6 工程可观测性范围。作者补验由主线审读实际断言并在 HUB 复验新增关键组合；没有新增规范、绑定或外部监控平台。本结论不等于十三操作、逐模型认证、U4或完整纵线已交付。

[逐项矩阵](inputs/matrix-current.md)列出V1～V11每个生产构件、输入、oracle与适用范围；[跨层补验](inputs/t13-cross-layer.md)给出阶段与真实构件对应。[inputs.json](inputs.json)保存精确设计/源码/结果SHA，源码可从相应提交还原。[outputs](outputs/)保留实际原始结果，含多代pending测试输入的前两次失败。作者的自测未冒称独立验收；本报告是root结合作者报告、源码与HUB证据形成的有限技术接受。

## 关键接受证据

- V1/V2：两个实际认证session并发，真实Cordis/SQLite/JSONL/TLS；身份及因果按来源关联，跨tenant拒绝，独立invoke无需session，内部标识不进入wire。
- V3：准入、绑定、凭据、真实HTTPS排队/取消；真实invoke的content gate失败及迟到完成负例；实际SQLite+JSONL从opened无重发恢复，重复reconcile不补写。
- V4/V6：凭据恰为503与实际HTTP503共存，状态保真、回显脱敏；任意内容/getter拒收，查询/导出scope在IO前检查。实际foreign UID目录拒绝仅在本宿主uid1001、/root uid0且0700的条件下通过；其他宿主若跳过不自动继承此证据。
- V5/V7/V11：真实应用调用下sink抛错、拒绝、排队满、永不完成和文件write/fsync故障；回复与费用仍耐久，关闭明确不完整，实际释放后同owner才完成；Cordis发起dispose不等于物理结束，读面跨卸载/关闭保留。
- V8/V9：容量、滚段、过期、删除失败、半行、迟到open/read/close及未知关闭保留；真实任务未结束时共享查询许可不释放。高基数输入不扩标签，未知费用不填0，重启明确分代。
- V10：旧/新真实service的pending各为1，实际HTTPS后达到共享上限，第三代拒绝；旧网络实例closed不抹诊断pending，旧诊断失败后转终态，新实例pending不被覆盖；只淘汰最早终态快照，随后第三代可运行。结合原实际Cordis启动拒绝/热换/完整应用关闭用例，核对零新fiber/pool和关闭不完整的组合责任。

最后补验 `362f7766` 合为 `096af984`，HUB实际1/1通过；content gate2、queue/thenable2、queue满1、foreign UID2、三代service1、无重发恢复1（13个非目标跳过）等原始结果均随包保存。没有把数量相加当覆盖，也没有为已有有效证据再造一份同义oracle。双语demo文档的journalFileSystem、三个水位、真实卸载和关闭语义已在e5bcc490同步。

## 结论边界

V3/V10由多个针对真实生产边界的聚焦场景共同支撑，未声称一次巨型调度覆盖所有交错；内容门的transport端口、文件系统故障和诊断sink是明确受控输入。网络为本机TLS，无本轮付费模型请求；没有持续堆内存基准或外部监控后端保证。本验收不证明每个厂商/37型号都有相同上游行为。

实际源、生命周期、collector或journal后续改变须复验受影响义务；全仓实现映射既有metadata失败仍单列，不能将本接受写成整仓检查全绿。完整临时数据库、TLS材料和其它原失败日志由主线私有保全后再退休spoke，不发布凭据。
