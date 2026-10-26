# 知识库和云盘文件预览修复

## 问题描述

用户反馈：在 mattermost-mobile 中，知识库和云盘的文件点击后无法预览，但 webapp 可以正常预览。

## 根本原因

通过对比 webapp 和 mobile 代码，发现以下关键差异：

### 1. **Office 文件 mm_file_id 检查不一致**

| 位置 | WebApp | Mobile (修复前) | Mobile (修复后) |
|------|--------|----------------|----------------|
| **知识库** | ✅ 预先检查 mm_file_id | ❌ 没有检查，静默失败 | ✅ 预先检查并显示友好错误 |
| **云盘** | ✅ 预先检查 mm_file_id | ⚠️ 有检查但错误处理不完善 | ✅ 显示友好错误并记录日志 |
| **知识库详情** | ✅ 预先检查 mm_file_id | ❌ 没有检查，静默失败 | ✅ 预先检查并显示友好错误 |

### 2. **FileInfo 构造不完整**

**WebApp 构造的 FileInfo**:
```typescript
{
    id: mmFileId,
    name: filename,
    extension,
    size: doc.fileSize || 0,
    mime_type: '',
    has_preview_image: false,
    archived: false,
    link: previewUrl,  // ✅ 包含 link 字段作为 fallback URL
    user_id: currentUserId,
    channel_id: '',
    create_at: new Date(doc.createdAt).getTime(),
    update_at: new Date(doc.updatedAt).getTime(),
    delete_at: 0,
    width: 0,
    height: 0,
    clientId: '',
}
```

**Mobile 修复前的 FileInfo**:
```typescript
{
    id: mmFileId || item.docId,
    user_id: '',
    create_at: 0,
    name: item.fileName || item.title,
    extension: ext,
    size: item.fileSize || 0,
    mime_type: '',
    uri: url,
    localPath: '',
    // ❌ 缺少 link 字段
    // ❌ 缺少 has_preview_image
    // ❌ 缺少 archived
}
```

### 3. **错误处理不够友好**

**WebApp**: 在打开模态框之前就检查并显示错误
**Mobile 修复前**: 静默失败，用户不知道发生了什么
**Mobile 修复后**: 预先检查并显示友好的错误提示

### 4. **缺少调试日志**

**Mobile 修复前**: 关键步骤没有日志记录
**Mobile 修复后**: 添加详细的调试日志，方便问题排查

## 修复内容

### 修复的文件

1. **`app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx`**
   - `openFilePreview()` 函数 (行 789-866)

2. **`app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`**
   - `openFile()` 函数 (行 488-561)

3. **`app/screens/home/apps/knowledge_base/kb_detail_screen.tsx`**
   - `handleDownload()` 函数 (行 105-181)

### 修复要点

#### 1. 知识库主屏幕 (knowledge_base_screen.tsx)

```typescript
// ✅ 修复点 1: 预先检查 Office 文件的 mm_file_id
if (isOffice) {
    try {
        const info = await getKBFileInfo(serverUrl, item.docId, tid);
        mmFileId = info.mm_file_id || '';

        // 如果没有 mm_file_id，显示友好错误
        if (!mmFileId) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                intl.formatMessage({
                    id: 'workbench.kb.preview_unavailable',
                    defaultMessage: 'This Office file cannot be previewed yet. Please try again later or download it.',
                }),
            );
            return;
        }

        // 获取完整的文件信息（包括 pdf_preview_id）
        const client = NetworkManager.getClient(serverUrl);
        fullFileInfo = await client.getFileInfo(mmFileId);
        debugLog('[KB] Got full file info', {
            mm_file_id: mmFileId,
            pdf_preview_id: fullFileInfo.pdf_preview_id,
            has_preview_image: fullFileInfo.has_preview_image,
        });
    } catch (err) {
        debugLog('[KB] getKBFileInfo failed', err);
        // 显示友好错误而不是静默失败
        Alert.alert(/* ... */);
        return;
    }
}

// ✅ 修复点 2: 构造完整的 FileInfo
const fileInfo: FileInfo = fullFileInfo || {
    id: mmFileId || item.docId,
    user_id: '',
    create_at: 0,
    name: item.fileName || item.title,
    extension: ext,
    size: item.fileSize || 0,
    mime_type: '',
    uri: previewUrl,
    localPath: '',
    link: downloadUrl,           // ✅ 添加 link 字段
    has_preview_image: false,    // ✅ 添加 has_preview_image
    archived: false,             // ✅ 添加 archived
} as FileInfo;

// ✅ 修复点 3: 添加调试日志
debugLog('[KB] Got full file info', { /* ... */ });
```

#### 2. 云盘主屏幕 (cloud_drive_screen.tsx)

```typescript
// ✅ 修复点 1: 添加调试日志
if (file.mm_file_id) {
    try {
        const client = NetworkManager.getClient(serverUrl);
        fullFileInfo = await client.getFileInfo(file.mm_file_id);
        debugLog('[Drive] Got full file info', {
            mm_file_id: file.mm_file_id,
            pdf_preview_id: fullFileInfo.pdf_preview_id,
            has_preview_image: fullFileInfo.has_preview_image,
        });
    } catch (err) {
        debugLog('[Drive] getFileInfo failed, falling back to manual construction', err);
        // Continue with manual construction as fallback
    }
}

// ✅ 修复点 2: 添加错误日志
} catch (err) {
    debugLog('[Drive] Open file error:', err);  // ✅ 添加日志
    Alert.alert(/* ... */);
}
```

#### 3. 知识库详情页 (kb_detail_screen.tsx)

```typescript
// ✅ 修复点 1: 预先检查 Office 文件的 mm_file_id
if (isOffice) {
    try {
        const info = await getKBFileInfo(serverUrl, doc.docId, teamId);
        mmFileId = info.mm_file_id || '';

        // 如果没有 mm_file_id，显示友好错误
        if (!mmFileId) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                intl.formatMessage({
                    id: 'workbench.kb.preview_unavailable',
                    defaultMessage: 'This Office file cannot be previewed yet. Please try again later or download it.',
                }),
            );
            return;
        }

        // 获取完整的文件信息（包括 pdf_preview_id）
        const NetworkManager = (await import('@managers/network_manager')).default;
        const client = NetworkManager.getClient(serverUrl);
        fullFileInfo = await client.getFileInfo(mmFileId);
        debugLog('[KBDetail] Got full file info', {
            mm_file_id: mmFileId,
            pdf_preview_id: fullFileInfo.pdf_preview_id,
        });
    } catch (err) {
        debugLog('[KBDetail] getKBFileInfo failed', {error: String(err)});
        // 显示友好错误而不是静默失败
        Alert.alert(/* ... */);
        return;
    }
}

// ✅ 修复点 2: 构造完整的 FileInfo
const fileInfo: FileInfo = fullFileInfo || {
    id: mmFileId || doc.docId,
    user_id: '',
    create_at: 0,
    name: fileName,
    extension,
    size: doc.fileSize || 0,
    mime_type: '',
    uri: previewUrl,
    localPath: previewUrl,
    link: downloadUrl,           // ✅ 添加 link 字段
    has_preview_image: false,    // ✅ 添加 has_preview_image
    archived: false,             // ✅ 添加 archived
} as FileInfo;
```

## 修复流程图

### 知识库文件预览流程

```
用户点击知识库文件
    ↓
检查是否为 Office 文件
    ├─ 是 → 调用 getKBFileInfo() 获取 mm_file_id
    │        ├─ 成功 → 获取完整 FileInfo（包含 pdf_preview_id）
    │        │        ├─ 有 pdf_preview_id → 直接下载并显示 PDF
    │        │        └─ 无 pdf_preview_id → 触发 PDF 转换 → 轮询 → 显示
    │        └─ 失败 → 显示友好错误提示
    │
    └─ 否 → 构造基础 FileInfo
             ├─ 媒体文件 → showMediaViewer()
             └─ 其他文件 → downloadAndPreviewFile()
```

### 云盘文件预览流程

```
用户点击云盘文件
    ↓
检查 file.mm_file_id 是否存在
    ├─ Office 文件且无 mm_file_id → 显示友好错误提示
    ├─ 有 mm_file_id → 获取完整 FileInfo（包含 pdf_preview_id）
    │                   ├─ 媒体文件 → showMediaViewer()
    │                   └─ 其他文件 → downloadAndPreviewFile()
    └─ 非 Office 文件 → 构造基础 FileInfo
                        ├─ 媒体文件 → showMediaViewer()
                        └─ 其他文件 → downloadAndPreviewFile()
```

## 验证步骤

### 1. 知识库文件预览测试

- [ ] 测试知识库中的 Office 文件（doc/docx/xls/xlsx/ppt/pptx）
  - [ ] 有 mm_file_id 且已转换 → 应立即显示 PDF
  - [ ] 有 mm_file_id 但未转换 → 应显示"转换中"状态
  - [ ] 无 mm_file_id → 应显示友好错误提示
- [ ] 测试知识库中的 PDF 文件 → 应直接显示
- [ ] 测试知识库中的图片/视频/音频 → 应使用 media viewer
- [ ] 测试知识库中的文本文件 → 应使用 text viewer

### 2. 云盘文件预览测试

- [ ] 测试云盘中的 Office 文件
  - [ ] 有 mm_file_id 且已转换 → 应立即显示 PDF
  - [ ] 有 mm_file_id 但未转换 → 应显示"转换中"状态
  - [ ] 无 mm_file_id → 应显示友好错误提示
- [ ] 测试云盘中的 PDF 文件 → 应直接显示
- [ ] 测试云盘中的图片/视频/音频 → 应使用 media viewer
- [ ] 测试云盘中的文本文件 → 应使用 text viewer

### 3. 调试日志测试

- [ ] 检查知识库文件预览的日志输出
- [ ] 检查云盘文件预览的日志输出
- [ ] 检查错误情况的日志记录

### 4. 边界情况测试

- [ ] 网络错误时的表现
- [ ] 文件不存在时的表现
- [ ] 服务器不支持 PDF 转换时的表现

## 技术细节

### PDF 转换流程

1. **触发转换**: `POST /api/v4/files/{id}/convert`
   - 服务器返回 `status: 'complete'` → 立即使用 PDF
   - 服务器返回 `status: 'converting'` → 开始轮询
   - 服务器返回 `status: 'failed'` → 显示错误

2. **轮询状态**: `GET /api/v4/files/{id}/info`
   - 每 2 秒检查一次
   - 最多轮询 30 次（60 秒超时）
   - 检查 `pdf_preview_id` 字段

3. **下载 PDF**: 使用 `pdf_preview_id` 下载并显示

### mm_file_id 的作用

- **知识库**: OpenSquilla 的 docId 需要转换为 Mattermost 的 file_id
- **云盘**: 直接使用 `mm_file_id` 字段
- **作用**: 启用服务器端的 PDF 转换功能 (`/api/v4/files/{id}/convert`)

### FileInfo 字段说明

- `id`: Mattermost 文件 ID（用于 PDF 转换）
- `link`: 下载 URL（作为 fallback）
- `has_preview_image`: 是否有预览图
- `archived`: 是否已归档
- `pdf_preview_id`: PDF 预览版本的 ID（Office 文件转换后）

## 与 WebApp 的对比

### WebApp 的优势

1. **预先检查**: 在打开模态框之前检查 mm_file_id
2. **友好错误**: 用户立即知道问题所在
3. **完整信息**: FileInfo 包含所有必要字段
4. **详细日志**: 关键步骤都有日志记录

### Mobile 修复后的改进

1. ✅ 与 WebApp 保持一致的检查逻辑
2. ✅ 显示友好的错误提示
3. ✅ 构造完整的 FileInfo 对象
4. ✅ 添加详细的调试日志
5. ✅ 统一的用户体验

## 相关文件

- `/app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx`
- `/app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`
- `/app/screens/home/apps/knowledge_base/kb_detail_screen.tsx`
- `/app/hooks/files.ts` - 文件下载和预览 Hook
- `/app/screens/unified_file_viewer/unified_file_viewer.tsx` - 统一文件查看器
- `/app/utils/file/index.ts` - 文件类型检测工具

## 参考

- WebApp 实现: `/channels/src/components/sidebar/workbench_panel/knowledge_base_tab.tsx`
- WebApp 实现: `/channels/src/components/sidebar/workbench_panel/cloud_drive_tab.tsx`
- WebApp 文件预览模态框: `/channels/src/components/file_preview_modal/file_preview_modal.tsx`

## 测试设备

- iOS: iPhone / iPad
- Android: 各种 Android 设备

## 版本要求

- Mattermost Server: 支持 PDF 转换 API 的版本
- Mobile App: 包含 UnifiedFileViewer 的版本

## 已知限制

1. **Office 文件需要服务器索引**: 如果服务器还没有为 Office 文件创建 mm_file_id，则无法预览
2. **PDF 转换需要时间**: 大型 Office 文件可能需要几秒钟转换
3. **网络依赖**: 需要网络连接来下载和转换文件

## 未来改进

1. **缓存机制**: 已转换的 PDF 应持久缓存
2. **离线支持**: 已下载的文件应支持离线查看
3. **错误重试**: 转换失败时提供重试选项
4. **进度反馈**: 显示下载和转换的详细进度

---

**修复日期**: 2026-10-26
**修复人员**: Claude Code
**测试状态**: 待测试
