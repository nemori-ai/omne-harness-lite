---
kind: system-requirement
ids: [SYS-ALIGNMENT]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/system/interest-alignment.md
source_sha256: 54b8ad574b0a19495c9fc306ed21e42f4b7c77a6501e30d830b817ead624a00b
source_anchor: "heading:# SYS-ALIGNMENT：与服务对象始终保持利益对齐"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# SYS-ALIGNMENT：与服务对象始终保持利益对齐

系统要求（迁移坐标：`.meta_harness/design/requirements/system/README.md`）

## 已确认要求

2026-09-12 用户明确：系统服务于**组织或个人**，并能够与所服务的组织或个人
**始终保持利益对齐**。本段为确认范围，适用于最终产品状态。

## 待澄清

利益对齐的具体含义、判断方式与持续维持方式仍待介绍。多服务对象利益出现冲突
时的适用规则尚未明确；不能以实现便利决定优先顺序。依赖这些含义的精确承诺不定稿。

[PF-001](../../product/PF-001-tenant-organization-context/requirements.md) 已明确多组织归属及
协作上下文差异；租户隔离与权限判断不能被当作已经实现全部利益对齐的证据。
