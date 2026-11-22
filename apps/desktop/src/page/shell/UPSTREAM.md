# 来历

外壳的版式与侧栏的折叠动效取自外部项目 `pandazki/super-assistant`，提交 `3b967f58768714d57cd1bacf67b599d2aa7a8f53`。复用依据与共用界面件相同，见 [`packages/frontend/ui-kit/UPSTREAM.md`](../../../../../packages/frontend/ui-kit/UPSTREAM.md)。

## 取了哪几块

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本应用 |
| --- | --- | --- |
| `styles.css` 里壳的那一段：`.app-shell`、`.shell-sidebar`、品牌行、导航行、`.shell-secondary`、`.shell-workspace`，以及 768px 以上的折叠轨道 | `489f671735b0c91da06e972491c71a1346c6a4d641e1936ce85c9de3844a5565` | `src/page/styles.css` |
| `shell/shell.css` 的 `.shell-workspace { overflow: clip }` | `1d206fe746261f1f0c24fb4463287a612ba9a0b66cd265ab3ed18b0a08bad782` | `src/page/styles.css` |
| `shell/sidebar-motion.ts` | `5f1474e223fb426641a07314573d4354b0b90cff1c74f78c3019de20defc704d` | `src/page/shell/sidebar-motion.ts` |
| 侧栏底部的排法，按提交 `83c1616f44d000d1f333e929bfd94d31dff847da`（这份 `styles.css` 与上面的同一字节）：`styles.css` 的 `.shell-utility-nav`、`.shell-footer-meta`、`.shell-system-actions` 与窄条里它们竖排成一列；`shell/navigation.tsx`（`b28ca92299adc8d736d8625ed1eb7551d4aaa2913652709236e665281da845cc`）底部两样的次序。照来源的换行排法（OD-43）：`utility` 段的页面是一行安静的项，排不下才换行，每项长到分满这一行，项是 `.shell-utility-button` 的图标加名字（字与图标隔 8、控件高）；行首的一项从导航的图标列起，别的项两边收到 8，所以三项在四档字号下都排得进一行；项与项隔 1，与导航行相同。最后一行左边是侧栏区的 `utility` 项，右边是「外观」 | `489f671735b0c91da06e972491c71a1346c6a4d641e1936ce85c9de3844a5565` | `src/page/styles.css` 的 `.shell-utility-nav`、`.shell-footer-row`；`src/page/shell/sidebar.tsx` 的 `SidebarBody` |

## 改了哪几样

- CSS 变量前缀 `--pe-` 改为 `--omne-`。注释全部删去。
- 侧栏只留本应用有的部分：应用名、折叠按钮、连接状态、页面导航、侧栏区、明暗切换。窗口拖拽条、红绿灯留位、助理入口、等你处理的计数、窄屏抽屉、调试模式的标签不取。
- `sidebar-motion.ts`：宽度类型改为本地声明；重排时淡入的区块去掉来源的选中高亮块；`useReducedMotion` 取自共用界面件。
- 导航组件 `shell/navigation.tsx` 只当范本，按本应用的插入位置重写在 `shell.tsx`。
- 侧栏里的两个滚动区 `.shell-navigation-content`、`.shell-sidebar-primary` 向外伸出焦点环的余地，再把它作自己的内边距（S15、K1）：贴着侧栏边的抬起的件不被裁，里面的东西不挪。
- 家旁告知笺的宽度照来源 `assistant/told-note.css` 的 `.told-note[data-at='home']`：从形旁到折叠钮前一个行内间距。来源不管它往下写到哪里；本应用按笺的上沿到导航第一行的空地给它定行数的上限，不少于两行（`told.tsx`，OD-20）。

## 没取的

- `shell/sidebar-width.ts`：侧栏宽度的偏好经来源的桥保存，本应用的折叠状态不保存。
- `shell/platform.ts`、`shell/destinations.ts`、`shell/assistant-identity.tsx`、`backend/gate.tsx`、`backend/status-pill.tsx`。
