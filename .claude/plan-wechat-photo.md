# 微信式发图改造 — 实现计划

5 个任务，全部一次做完。已确认决策：
- 独立「相册/Gallery」入口 → 改名「照片」，改用**自定义全屏网格页**（非系统 picker）
- 文件选择器 tab「相册/Photos」→ 改名「手机相册」
- 默认压缩（微信式），勾「原图」才传原图
- 手机相册的图 → 聊天显示成**文件卡片**（保留 .png 后缀、点开可预览）→ 用**前端强制文件卡片标记**（路线1）
- 文案支持多语言（en / zh-CN / zh-TW）

## 任务 A — 微信式压缩策略（默认压缩，原图除外）

**文件**：`app/utils/file/compress_chat_image.ts`、`app/constants/media_processing.ts`

- `compressChatImageAsset(file, options?)` 增加 `options.keepOriginal`：为 true 时直接返回原文件，跳过压缩。
- 压缩参数保持 `react-native-compressor` 的 `compressionMethod: 'auto'`（WhatsApp/微信档：自动按分辨率+质量压），不再受 `ENABLE_IMAGE_COMPRESS=false` 全局拦截——改为：默认压缩，`keepOriginal` 时跳过。
- `ENABLE_IMAGE_COMPRESS` 影响面（3 处生产代码）：`compress_chat_image.ts`、`file_picker/index.ts`（系统 picker quality + needsImageCompress）。本次只改聊天相册路径的行为，file_picker/index.ts 的系统 picker 分支不动（避免波及其它入口），风险最小。
- verify：选图不勾原图→上传体积明显小于原图；勾原图→体积等于原图。

## 任务 B — 原图圆形复选框 + 每图右上角选中圈

**文件**：`photo_album_tab.tsx`（已有选中圈 circleSelected/circleEmpty，确认样式明显即可）；新增底部「原图」圆形复选框。

- PhotoAlbumTab 底部工具条加一个圆形复选框 + 「原图」文案（i18n）。state：`originalImage: boolean`。
- 选中态圆圈填充 + 对勾；未选空心圈。
- 发送时把 `originalImage` 传入每个 asset 的处理：`keepOriginal = originalImage`，决定是否压缩。
- 每张图右上角选中圈：PhotoAlbumTab 已有（circleSelected 绿✓ / circleEmpty）。确认视觉明显；独立「照片」页复用同组件，天然一致。
- verify：UI 出现圆形原图开关；每图右上角有选中圈；勾原图后发送走 keepOriginal。

## 任务 C — 文案改名 + 多语言

- 独立入口「相册/Gallery」→「照片」(Photos / 照片 / 照片)
- 文件选择器 tab「相册/Photos」→「手机相册」(Phone Album / 手机相册 / 手機相簿)
- 「原图」(Original / 原图 / 原圖)
- 这些 i18n key 当前多数靠 defaultMessage 兜底；新增 key 补到 en.json / zh-CN.json / zh-TW.json 并设中文 defaultMessage。

## 任务 D — 「照片」入口改用自定义全屏网格页

**确认选择**：直接打开现有文件选择器并默认停在「照片」tab（复用代码，最小工作量）。
- `quick_actions_sheet.tsx` 的 `handleGalleryPress`：不再调 `PickerUtil.attachFileFromPhotoGallery`（系统 picker），改为打开 file_picker 并指定 initialTab=photo。
- 需确认 file_picker 支持 initialTab 参数；若不支持，加一个。
- verify：点「照片」→ 打开自定义网格页，默认在照片 tab，有选中圈 + 原图开关。

## 任务 E — 手机相册的图当文件发送（前端强制文件卡片标记，路线1）

**核心约束**：服务器按文件名后缀重推 mime（.png→image/png），故不能靠改 mime 让它持久显示成文件卡片。改用**前端标记**。

**标记存储**：post.props（Mattermost post.props 可存任意 JSON，跨服务器往返保留）。
- 发送时：手机相册 tab（source 标识为「作为文件发送」）产生的文件，其所属 post 的 `props.render_files_as_card = [fileId, ...]`。
- 渲染分流：`files.tsx`（有 post/props）读该 prop，向下传给 `file.tsx`，新增 `forceCard?: boolean`；`file.tsx:366` 分流改为 `isImage(file) && !forceCard` 才走内联图，否则走 DocumentFile 卡片。
- 点开预览：DocumentFile 卡片对图片类型本就支持点开预览（renderCardWithImage / gallery），保留 .png 后缀。
- **仅手机相册 tab** 走此标记；独立「照片」入口按正常图片内联显示（微信里"照片"就是图片）。
- 待核实点：files.tsx → file.tsx 的 props 下传链；post.props 在乐观发送 + 落库后都要带上标记。

## 风险与回滚
- 任务 A 改压缩默认行为：影响所有聊天发图体积。回滚=恢复 keepOriginal 默认值。
- 任务 E 改渲染分流：只加 `&& !forceCard`，不影响无标记的既有文件。
- 全程 `npx tsc --noEmit` 校验；新增 i18n key 校验 JSON。
- 不碰服务器仓库。

## 实现顺序
A（压缩）→ C（文案/i18n）→ B（原图开关 UI，依赖 A）→ D（照片入口，依赖网格页）→ E（文件卡片标记，最独立但最复杂）。每步 tsc 校验。
