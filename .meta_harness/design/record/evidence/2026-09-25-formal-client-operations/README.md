# 治理客户端组合有限模型与Schema候选检查

2026-09-25；候选CG1，未采用。TLC1.7.4发行包（TLC2.19）、Temurin25容器，镜像和jar沿本批此前证据。r2正向920个不同状态、四不变量及EventuallyClosed检查通过；follow-selection、late-admission、early-dispose、flatten四负控均exit12且触发对应不变量。原始模型/config/日志在model-runs。

r1的late-admission因缺括号使badAdmission后值未约束，exit75，**不是负控成功**；修正赋值逻辑括号后r2全部重跑。其余r1输出保留，不倒写。模型只有一个使用、最多两个顺序调用和一次外部选择变更；没有TLS/SQL/真实关闭、缓存权限或秘密流证明。

Ajv2020对CG1 Input/Output与精确EC2/IV1/OE2引用编译成功，72个规范候选正/负例符合预期。路由载荷/回复由原EC2手写测试夹具投影，并按冻结Schema核对；不把与实现共享夹具当独立系统验证。后续规格评审修改后需按最终输入重新检查并另存快照，本运行未宣称后续修订已验证。
