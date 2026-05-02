# 功能开发 Plan 模板（编码前必填）

在实现新功能或新屏之前，复制本节结构填写；**未经书面 Plan 与自检，不进入编码**。

规范出处：**Rules** → `.cursor/rules/mattermost-mobile-ai-standards.mdc`；**Skills（交付自检 A–G）** → `.cursor/skills/mattermost-mobile-delivery/SKILL.md`（Cursor Skill，非 rules）。

---

## 1. 页面 / 功能结构

- **目标**：一句话描述用户价值。
- **入口**：`Screens.*` 常量名、导航方式（push / modal / bottom sheet）。
- **模块边界**：代码落在 `app/screens/`、`app/components/` 还是 `app/products/<product>/`，理由。

## 2. 组件拆分策略

- **容器 vs 展示**：谁负责订阅 DB / 调 action，谁只收 props 渲染。
- **复用**：是否抽入 `app/components` 或产品目录；预计复用次数。
- **列表**：行组件是否独立文件；是否 `React.memo`；`keyExtractor` 策略。

## 3. 数据流设计

- **读**：用到的 `query*` / `observe*` / `get*`（文件路径级预期即可）。
- **写**：`@actions/local` 或 `@actions/remote`；错误是否返回 `{error}`。
- **短时状态**：是否使用 `EphemeralStore` / 其他 `app/store` 单例。

## 4. UI 设计说明（须达高级、克制、统一、专业；对齐 iOS / 高级 SaaS / 清晰金融类信息架构）

### 4.1 UI 结构草图（文字描述即可）

自上而下描述布局，例如：

- **顶部**：Header（标题 + 可选操作）
- **中间**：Section 标题 + Card 列表 / 表单卡片
- **底部**：主操作区（主按钮，固定或随内容）

（本屏实际草图：）

### 4.2 布局与分区

- 根容器（flex 方向、安全区、`KeyboardAware` 等是否与参考屏一致）。
- **是否卡片化 / 分 Section**：卡片圆角取值（**8 / 12 / 16 三选一**为主圆角，全屏统一）。
- **参考屏**：（填写具体文件路径，便于评审对齐）。

### 4.3 间距系统（强制刻度）

仅使用 **`4 / 8 / 12 / 16 / 20 / 24 / 32`**；**页面左右 padding** 选 **`16` 或 `20`**（本屏选定：____）。

| 语义常量名 | 数值（从刻度选） | 用途 |
|------------|------------------|------|
| `SCREEN_PADDING_H` | | 左右边距 |
| `SECTION_GAP` | | 大区块之间 |
| `CARD_PADDING` | | 卡片内边距 |
| `LIST_ITEM_GAP` | | 列表项间距 |

禁止无说明的 `13`、`17` 等孤立数值。

### 4.4 字体层级（四级固定）

| 层级 | 用途 | fontSize | fontWeight | lineHeight |
|------|------|----------|------------|------------|
| **Title** | 大标题 | | | |
| **Section** | 分区标题 | | | |
| **Body** | 正文 | | | |
| **Caption** | 辅助 / 元信息 | | | |

错误提示可归入 Caption 或单独一行，须指定字号行高且仍从受限集合选取。

### 4.5 颜色（必须映射 `theme`；单屏主色角色 ≤ 3–4）

| 角色 | `theme` 字段或 `changeOpacity(...)` | 是否 Primary 强调（仅关键操作） |
|------|-------------------------------------|--------------------------------|
| 页面背景 | | |
| 主文案 | | |
| 次要文案 / Caption | | |
| 分割 / 边框（subtle） | | |
| 链接 / 主按钮 | | |
| 错误（若需要） | | |

说明：**Primary / link 色**仅用于主按钮、关键链接，不用于大面积装饰。

### 4.6 视觉与交互（高级感）

- **留白**：区块间如何用间距拉开，避免贴边堆满。
- **边框 vs 阴影**：优先 **subtle border**；若用阴影，说明为轻阴影。
- **按钮**：禁用态如何表现（透明度 / 背景色）。
- **列表行**：点击反馈（`activeOpacity` 等）是否与项目内同类组件一致。
- **Loading / Empty / Error**：与第 6 节一致，此处可引用。

### 4.7 设计理由（必填）

用 3～6 条要点说明本设计如何服务：

- **可读性**（层级、行高、Caption）  
- **信息层级**（Section / Card / 主辅文）  
- **转化或任务完成**（主按钮位置、强调色使用范围）  
- **一致性**（与参考屏或设计系统的对齐点）

## 5. 国际化方案

- **Key 命名**：`screen.feature.element` 风格示例。
- **`defineMessages` / `useIntl` 位置**：（文件路径）。
- **翻译文件**：与 [CLAUDE.md](../../CLAUDE.md) 一致时，**仅**在 `assets/base/i18n/en.json` 增加默认文案；若团队要求多语言同步，同时遵守 `.cursor/rules/i18n-zh-en.mdc`。
- **defaultMessage**：必须与 `en.json` 对应条目一致。

## 6. 状态处理（Loading / Empty / Error）

- **Loading**：使用的组件（如 `<Loading>`）与出现条件。
- **Empty**：空态文案与是否复用 `section_notice` 等同域组件。
- **Error**：用户可见 copy（i18n）；`logError('[Context]', err)` 前缀约定；是否可重试。

---

## Plan 自检（必填：是/否 + 一句话理由）

| 检查项 | 是/否 | 理由 |
|--------|-------|------|
| 符合 WatermelonDB + actions + queries 分层与 react-native-navigation 生命周期 | | |
| 可扩展（新字段/状态是否局部化、避免巨石组件） | | |
| UI 与同产品域参考屏一致（间距、字体、主题色） | | |
| 间距仅使用 4/8/12/16/20/24/32，左右 padding 为 16 或 20 且全屏统一 | | |
| 已定义 Title / Section / Body / Caption 四级字体与行高，无同级混乱字号 | | |
| 颜色角色 ≤3–4，且全来自 `theme`；强调色仅用于关键操作 | | |
| Section + Card（或等价分区），留白充足，无 demo 式拥挤 | | |
| 圆角统一（8/12/16 择一为主），分割以 subtle border 为主 | | |
| 已规划 Loading / Empty / Error、主按钮 disabled、列表 press 反馈 | | |
| 已填写 §4.1 草图、§4.7 设计理由 | | |

**评审人 / 日期**：（可选）
