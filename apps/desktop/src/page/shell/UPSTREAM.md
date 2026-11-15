# 来历

外壳的版式与侧栏的折叠动效取自外部项目 `pandazki/super-assistant`，提交 `3b967f58768714d57cd1bacf67b599d2aa7a8f53`。复用依据与共用界面件相同，见 [`packages/frontend/ui-kit/UPSTREAM.md`](../../../../../packages/frontend/ui-kit/UPSTREAM.md)。

## 取了哪几块

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本应用 |
| --- | --- | --- |
| `styles.css` 里壳的那一段：`.app-shell`、`.shell-sidebar`、品牌行、导航行、`.shell-secondary`、`.shell-workspace`，以及 768px 以上的折叠轨道 | `489f671735b0c91da06e972491c71a1346c6a4d641e1936ce85c9de3844a5565` | `src/page/styles.css` |
| `shell/shell.css` 的 `.shell-workspace { overflow: clip }` | `1d206fe746261f1f0c24fb4463287a612ba9a0b66cd265ab3ed18b0a08bad782` | `src/page/styles.css` |
| `shell/sidebar-motion.ts` | `5f1474e223fb426641a07314573d4354b0b90cff1c74f78c3019de20defc704d` | `src/page/shell/sidebar-motion.ts` |

## 改了哪几样

- CSS 变量前缀 `--pe-` 改为 `--omne-`。注释全部删去。
- 侧栏只留本应用有的部分：应用名、折叠按钮、连接状态、页面导航、侧栏区、明暗切换。窗口拖拽条、红绿灯留位、助理入口、等你处理的计数、窄屏抽屉、调试模式的标签不取。
- `sidebar-motion.ts`：宽度类型改为本地声明；重排时淡入的区块去掉来源的选中高亮块；`useReducedMotion` 取自共用界面件。
- 导航组件 `shell/navigation.tsx` 只当范本，按本应用的插入位置重写在 `shell.tsx`。

## 没取的

- `shell/sidebar-width.ts`：侧栏宽度的偏好经来源的桥保存，本应用的折叠状态不保存。
- `shell/platform.ts`、`shell/destinations.ts`、`shell/assistant-identity.tsx`、`backend/gate.tsx`、`backend/status-pill.tsx`。
