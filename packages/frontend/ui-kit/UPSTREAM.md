# 来历

本成员的设计语言、素材、字体与代码取自外部项目 `pandazki/super-assistant`，提交 `83c1616f44d000d1f333e929bfd94d31dff847da`。项目负责人在 2026-11-13 说它的设计语言、视觉、动画、素材、字体和前端技术栈都可以复用，并已全面授权。外部项目的仓库里没有 LICENSE 文件，复用依据只有这一条授权。每个来源文件的哈希在 [provenance.json](provenance.json)。

## 取了哪几块

| 块 | 来源（相对 `desktop/src/renderer/src/`） | 本成员 |
| --- | --- | --- |
| 设计 token | `design/tokens.css` | `src/styles/tokens.css` |
| 动效 | `design/motion.css`、`design/motion.ts`、`design/use-object-transition.ts` | `src/styles/motion.css`、`src/motion/` |
| 基线样式 | `styles.css` 的基线层、关键帧、减少动效、焦点、日期控件，以及折叠、空状态、页头、页列、分段、浮层的规则 | `src/styles/base.css`、`src/controls/controls.css`、`src/patterns/patterns.css` |
| 图标 | `design/icons/{brush,glyphs,glyph,index}.ts`、`icons.css` | `src/icons/`、`src/styles/icons.css` |
| 字体 | `public/fonts/` 的 Inter、JetBrains Mono 与各自的 OFL 文本，`assets/fonts/fonts.css` | `resources/fonts/`、`src/styles/fonts.css` |
| 霞鹜文楷 | `public/fonts/lxgw-wenkai/`（1.7.0，常规与粗体，按字符范围切成 194 片）与它的 OFL 文本，`assets/fonts/wenkai.css` | `resources/fonts/lxgw-wenkai/`、`resources/fonts/LICENSE.LXGWWenKai`、`src/styles/wenkai.css`（只改了字体文件的地址）。约 9 MB，负责人 2026-11-15 定纳入。它排在中文字体栈的第一位，页面只取用到的那几片 |
| 基础控件 | `components/ui/*.tsx`（十三个）、`components/ui.tsx`、`lib/utils.ts`、`keyboard/focus.ts` | `src/controls/`、`src/lib/` |
| 通用件 | `components/ai/*`、`disclosure`、`empty-state`、`loading-state`、`loading-ink`、`page-header`、`page-column`、`save-receipt`、`fact-list`、`code-surface`、`confirm/*`、`icon-button`、`inline-notice`、`ago`、`conversation/time.ts`，连同各自的 CSS | `src/patterns/` |
| 流式 Markdown | `conversation/prose.tsx`、`code-highlight.ts`、`markdown-diagrams.ts`，`conversation.css` 里 Markdown 的规则 | `src/prose/`、`src/styles/prose.css` |
| 主题 | `theme/controller.ts` | `src/theme/` |

## 改了哪几样

- CSS 变量前缀 `--pe-` 全部改为 `--omne-`；类名与动画名的前缀 `pe-` 也全部改为 `omne-`。Markdown 的根类名从 `conversation-markdown` 改为 `omne-prose`。
- 注释全部删去，只留许可声明与工具读的取时标注。
- 路径别名 `@/` 改为相对导入，导入写 `.ts` 与 `.tsx` 扩展名。
- 断开对来源自己东西的依赖：
  - `icon-button` 不再读尺寸偏好，提示偏移写成常量 4。
  - `inline-notice` 重写：属性是语气、标题、正文、详情、可选的动作，失败码到文案的映射归调用者。
  - 图标只留 `gentle` 一种风格，笔画的粗线分支与偏好订阅删去。
  - `prose` 去掉 `omne://` 与提及的链接解析，链接按外链处理；Markdown 控件的文案换成中文。
  - `focus.ts` 不认识外壳：没有落在键盘区里时，回退到调用者给的区，不给就不回退。
  - 主题控制器的偏好来源改为注入：`createThemeController({ read, write, system })`。
  - `time.ts` 与 `ago` 不再读多语言目录。
- 多语言：`sheet`、`confirm/*`、`state-word`、`prose` 的 Markdown 控件、图表（`frame`、`simple`、`series`）、`time.ts` 与 `ago` 的相对时间，文案都改为属性，缺省值是中文。
- `input` 去掉 `dark:` 的第二套颜色，颜色只走 `light-dark()`。
- 样式里的长度只读 token：各个 CSS 文件里大于 1px 的 px 与 rem 换成已有的 token 或 `--spacing` 的倍数；单处用到的长度在 `tokens.css` 里按角色起名，四档各写一个值。代码块右缘渐隐的 `--omne-code-edge` 改为 0 到 1 的系数，乘 `--omne-code-fade`。`patterns.css` 读的 `--omne-window-inset` 在 `tokens.css` 里定义，缺省 0。
- 字号档的控制器与一档一档调的函数（`src/size/`）是本成员写的：偏好的读写由调用者注入，自己不碰存储；四档的名字与系数是来源 `tokens.css` 里的那四档。
- 去掉的死代码：`brush.ts` 里只给来源的脚本用的函数。
- `styles.css` 里 `main.list-reading` 一类业务版式、壳与设置的类不取。

## 重新对齐

2026-11-21 从 `3b967f58768714d57cd1bacf67b599d2aa7a8f53` 对齐到 `83c1616f44d000d1f333e929bfd94d31dff847da`。两个提交之间，取过的文件里变了四个，[provenance.json](provenance.json) 里它们的哈希随之更新，`realigned` 记着起点与这四个文件：

| 来源文件 | 来源的改动 | 本成员 |
| --- | --- | --- |
| `components/ai/receipt-pill.tsx` | 回执多一种 `declined`：拒绝，用拒绝的记号与结束的语气 | `src/patterns/ai/receipt-pill.tsx` 照改 |
| `design/use-object-transition.ts` | 对象过渡落到看得见的那一面，跳过 `[inert]` 里同一个对象的视图 | `src/motion/use-object-transition.ts` 照改 |
| `i18n/state-labels.ts` | 多一个状态词 `notDone`（没做），算作 `released` | `src/patterns/ai/state-labels.ts` 照改，只取中文 |
| `design/icons/brush.ts` | 删去 `smoothPath` | 本成员本来就没有它，不用改 |

## 没取的

- 仓颉今楷：许可不许作为应用资产发布。
- 对话的气泡、输入框、转写区、会话列表、设置页的版式，壳的导航与侧栏。它们归各领域的界面模块与应用的外壳。
- `lucide-react`、`tw-animate-css`、路由库、react-query、多语言库。

## 许可

基础控件改自 shadcn/ui 的 new-york-v4 风格，MIT，声明在 [LICENSE.shadcn](LICENSE.shadcn)，这些文件的第一行写了许可标识。Inter、JetBrains Mono 与霞鹜文楷是 SIL OFL 1.1，许可文本放在 `resources/fonts/` 里字体旁边。
