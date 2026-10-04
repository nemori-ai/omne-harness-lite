# 模型请求纵线的候选验证（2026-09-27）

本 run 保存研究原型、候选规格检查与有限生命周期模型；不是生产实现或模型 official 认证。执行树为 `panqiwei/model-request-runtime`，基线 `d4eaf7673bc161bf22f6682385151e080d3323ae`。候选未接受，原冻结资源未改。

| 实际运行 | 结果 | 范围与限制 |
|---|---|---|
| Adaptation 正向第二轮 | exit 0；20404 generated、5430 distinct、深度17、队列0 | 两版本、两个消费者（runtime/direct）、两个档案范围；登记、档案采用、停止准入为独立动作；采用失败不改档案。Stop/Release/Dispose 弱公平。没有网络、耐久提交、重启或真实提供者 |
| 三个 Adaptation 负控 | 各 exit12；分别反驳 NoAcquireRetired、NoDisposeWithLease、BindingPinned | 移除各自守卫或固定绑定规则；反例在 stdout。取消请求不等于停止，引用在停止后释放；单消费者至多 acquire 一次是模型构造，不当作保护证据 |
| 首轮 Adaptation | 四次 exit150，时序动作表达语法错误 | 原文保留；不是被规格反驳。第二轮修正语法后执行 |
| Cordis 4.0.4 生命周期原型 | 三场景通过 | 真实 effect 提前注销、旧版等待 runtime/direct 引用、强制取消后等待实际停止；调用所有者为模拟，无 HTTP/持久/时限政策；不是生产注册表 |
| profile v3 | 321 项 Schema 检查通过 | 表示校验，不替代目录判定或真实接收边界 |
| messages v4 | 159 项 Schema、11 项跨字段纯值对照符合预期 | 不证明接收边界、Alloy、日志或恢复 |
| response v4 | 58 项 Schema、12 项绑定判定、5 项精确值变异符合预期 | 不证明生产流解析或实际供应商校验 |
| directory v3 | 83 项结构检查通过 | 不证明耐久配置判重或并发行为 |
| runtime v3 独立模型 | 两正配置 exit0；四负控分别命中指定断言 | ContentGate 21 distinct、AdaptationBinding 49 distinct；单流/一个门/两版本/最多两发。原错误尝试保留；完整生命周期注册协议由本 run 的 Adaptation 单独承担 |

目录保存实际脚本、命令、环境、输入快照/哈希、stdout/stderr 与退出码；[整体摘要清单](input-and-output-hashes.json)。原运行 cwd/临时路径原样保留，不伪称在归档目录执行。复跑需按脚本入口显式指定源码与当前解释器，当前规范发生变化时须核输入哈希，不挪用旧结果。

本 run 没有无界证明、跨进程插件协议、正式提供者、存储故障、完整消费循环或用户总体验收。

## 连续调用补验

独立复审指出原型的排空 Promise 在一次归零后永久完成。新增 acquire A→release A→acquire B→dispose 的真实 Cordis 交错，旧原型在 B 尚有引用时 `disposed=true`，exit1：[原失败与输入](lifecycle-reuse-failure/stderr.txt)。改为停止新准入后才建立当次排空等待，新增交错与原三场景均 exit0：[修正结果](lifecycle-reuse-fixed/stdout.txt)、[对应输入](lifecycle-reuse-fixed/input.mjs)。旧三场景结论因此只适用于其原路径；生产排空方案需采用修正输入并继续验收。

## 后续实施组件证据（2026-09-27）

以上正文记述最初研究 run，原清单保留。D-078～D-080 的采用与后续源码检查另有精确输入，不能沿用最初的「候选未接受／没有正式提供者」推断当前状态。[MF4 组件检查](mf-component-checks.md)记录 76 项测试、403 项规则工具测试与构建制品消费者；[EIS 历史正文组件检查](eis-history-component-checks.md)记录 68 项 EIS 测试及 428 项规则工具测试。它们仍非真实 AR 生产者／报告完整链及独立应用验收，更非 37 模型 official 认证。

[当前文件与归档成员清单](input-and-output-hashes-v2.json)重新盘点现存材料；最初清单里的已压缩展开路径不再作为当前导航。[字面秘密扫描范围与结果](secret-scan-v2.json)覆盖当次现存文件、全部常规归档成员及嵌套包 tgz，检测明确列出的供应商 key 前缀及私钥 PEM，不能解释为一般秘密不存在的证明。
