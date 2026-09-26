# 邀约终结有限模型与 Schema · 2026-09-24

TLC 2.19（官方TLA+ v1.7.4）+ Docker OpenJDK25，工具来源/hash及本地镜像限制同[登录模型环境](../2026-09-24-formal-login-candidates/README.md)。单 worker、网络关闭。复现时把相同hash的jar放入复制出的run目录运行run.py，不改本次输出。

run-2：正例113 generated / 82 distinct，未发现违反；覆盖终结覆写的负控触发 TerminalStable，允许过期/对象消失后首次终结的负控触发 NoLateSettlement，均退出12。attempt-1因IF表达式缺括号产生未赋值状态，退出75，不能作性质证据，原输入/输出全部保留。

Schema使用仓库uv锁定环境的jsonschema Draft202012Validator，17项通过：完整派生/终结枚举、declined、禁止持久expired/pending，以及原timing正反例。跨字段时间先后不在Schema能力内，既有反例仍明确允许形状通过。

只有单份邀约的原子行为与结构范围，不证明授权、真实SQL并发、领域成员/隶属效果、不可用优先级、当前产品可删除组织、数据迁移、物理故障或灾备。模型Remove只是假定的存在性输入。检查关闭死锁检测，不声明进展。原始输入分别在run-2与source-manifest，接受与实现状态另归registry/realization。
