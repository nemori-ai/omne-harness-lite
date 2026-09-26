# AM3 与保留2正文的固定引用

HUB9e0103a1公开built编译器实测在当前AM3与六规范正文资源上，只补CB2/AM2仍存在TD2引用缺失；完整补CB2+AM2+TD2后当前AM3的25个defs全部编译。Skill2/MCP2/Slash2仍引用AM2/TD2；引用的精确$id不能靠同名3取代。实际13输入、脚本和完整逐def失败／成功原文见 [运行证据](../../design/record/evidence/2026-09-26-probe-core-schema-closure/README.md)。

适用范围为当前AM3全部defs的可达图及对应同契约/$id的标准正文资源；AM2自身AssetContent另指Loop2，Connector2 DeliveryTarget另指Messages2，未在本probe穷举全旧图。25/0不等同实际domain judge、MCP动作集/timeout域、AE组合或Connector实现。采用固定TD2私有资源以避免AM→TD产品代码环的机制，见 [D-068](../../design/record/decisions/core-implementation-spec-reconciliation/decision.md)，研究只给观察。
