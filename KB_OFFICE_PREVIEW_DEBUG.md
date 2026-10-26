# 知识库 Office 文件预览调试

## 问题描述

用户反馈：知识库中点击 Office 文件（Word/Excel/PPT）时，显示"This file type cannot be previewed"，而不是预览文件内容。WebApp 中可以正常预览。

## 已添加的调试日志

为了确定问题出在哪个环节，我在 `openFilePreview` 函数中添加了详细的调试日志：

### 1. 函数入口日志

```typescript
debugLog('[KB] openFilePreview called:', JSON.stringify({
    docId: item.docId,
    fileName: item.fileName,
    fileSize: item.fileSize,
}));
```

### 2. URL 生成日志

```typescript
debugLog('[KB] URLs generated:', JSON.stringify({previewUrl, downloadUrl}));
```

### 3. 文件类型检查日志

```typescript
debugLog('[KB] File type check:', JSON.stringify({ext, isOffice}));
```

### 4. Office 文件处理日志

```typescript
debugLog('[KB] Office file, fetching mm_file_id');
debugLog('[KB] Got mm_file_id:', mmFileId);
debugLog('[KB] Got full file info', JSON.stringify({
    mm_file_id: mmFileId,
    pdf_preview_id: fullFileInfo.pdf_preview_id,
    has_preview_image: fullFileInfo.has_preview_image,
}));
```

### 5. FileInfo 构造日志

```typescript
debugLog('[KB] FileInfo constructed:', JSON.stringify({
    id: fileInfo.id,
    name: fileInfo.name,
    extension: fileInfo.extension,
    isImage: isImage(fileInfo),
    isVideo: isVideo(fileInfo),
    isAudio: isAudio(fileInfo),
}));
```

### 6. 文件打开日志

```typescript
debugLog('[KB] Opening media file');
// 或
debugLog('[KB] Opening document file with downloadAndPreviewFile');
```

### 7. 依赖数组修复

```typescript
// 修复前
}, [serverUrl, theme, intl]);

// 修复后
}, [serverUrl, theme, intl, downloadAndPreviewFile]);
```

## 验证步骤

### 1. 点击 Office 文件

- [ ] 进入知识库页面
- [ ] 点击一个 Office 文件（Word/Excel/PPT）
- [ ] 查看调试日志
- [ ] **将完整的日志内容发给我**

### 2. 日志分析

根据日志输出，我们可以确定问题出在哪个环节：

#### 情况 1：没有看到任何日志

- **问题**：`openFilePreview` 没有被调用
- **原因**：可能是点击事件没有触发
- **解决方案**：检查文件列表的点击事件绑定

#### 情况 2：看到 `openFilePreview called` 但没有 `Opening document file`

- **问题**：函数执行到一半就停止了
- **可能原因**：
  - Office 文件缺少 `mm_file_id`
  - URL 生成失败
  - `getKBFileInfo` API 调用失败
- **解决方案**：根据具体日志确定原因

#### 情况 3：看到 `Opening document file` 但显示"cannot be previewed"

- **问题**：`downloadAndPreviewFile` 被调用，但统一文件查看器显示不支持
- **可能原因**：
  - `UnifiedFileViewer` 不支持该文件类型
  - 文件下载失败
  - PDF 转换失败
- **解决方案**：检查 `UnifiedFileViewer` 的实现

#### 情况 4：看到错误的文件类型判断

- **问题**：Office 文件被错误地识别为其他类型
- **日志表现**：
  ```
  [KB] Opening media file  // 而不是 Opening document file
  ```
- **原因**：`isImage`/`isVideo`/`isAudio` 判断错误
- **解决方案**：检查文件扩展名和 MIME 类型

## 可能的问题和解决方案

### 问题 1：Office 文件缺少 `mm_file_id`

**日志表现**：
```
[KB] File type check: {ext: "docx", isOffice: true}
[KB] Office file, fetching mm_file_id
[KB] Got mm_file_id: ""  // 空字符串
[KB] Office file without mm_file_id, showing error
```

**原因**：
- 服务端还没有为这个 Office 文件创建 Mattermost FileInfo
- 文件刚上传，还没有被索引

**解决方案**：
- 检查服务端日志
- 确认文件是否正确上传到 OpenSquilla
- 检查 `getKBFileInfo` API 的实现

### 问题 2：`getKBFileInfo` API 失败

**日志表现**：
```
[KB] File type check: {ext: "docx", isOffice: true}
[KB] Office file, fetching mm_file_id
[KB] getKBFileInfo failed: Error: ...
```

**原因**：
- 网络请求失败
- API 端点不存在
- 权限问题

**解决方案**：
- 检查网络连接
- 确认 API 端点是否正确
- 检查用户权限

### 问题 3：`downloadAndPreviewFile` 执行但没有反应

**日志表现**：
```
[KB] Opening document file with downloadAndPreviewFile
```
之后没有更多日志，也没有预览界面。

**原因**：
- `downloadAndPreviewFile` 内部有错误
- 导航到统一文件查看器失败
- 下载失败但没有显示错误

**解决方案**：
- 检查 `app/hooks/files.ts` 中的 `useDownloadFileAndPreview` 实现
- 查看是否有其他错误日志
- 确认统一文件查看器是否正确注册

### 问题 4：统一文件查看器显示"cannot be previewed"

**日志表现**：
```
[KB] Opening document file with downloadAndPreviewFile
```
然后显示"This file type cannot be previewed"界面。

**原因**：
- `UnifiedFileViewer` 中的 `isViewableFile` 判断失败
- 文件扩展名不在支持列表中
- `hasPdfPreview` 返回 false

**解决方案**：
- 检查 `app/screens/unified_file_viewer/unified_file_viewer.tsx` 中的 `isViewableFile` 函数
- 确认 Office 文件的 `hasPdfPreview` 是否返回 true
- 检查 `app/utils/file/index.ts` 中的 `hasPdfPreview` 实现

## 预期的正常日志

如果一切正常，应该看到以下日志：

```
[KB] openFilePreview called: {"docId":"...","fileName":"test.docx","fileSize":12345}
[KB] URLs generated: {"previewUrl":"https://...","downloadUrl":"https://..."}
[KB] File type check: {"ext":"docx","isOffice":true}
[KB] Office file, fetching mm_file_id
[KB] Got mm_file_id: xyz789
[KB] Got full file info: {"mm_file_id":"xyz789","pdf_preview_id":"abc123","has_preview_image":false}
[KB] FileInfo constructed: {"id":"xyz789","name":"test.docx","extension":"docx","isImage":false,"isVideo":false,"isAudio":false}
[KB] Opening document file with downloadAndPreviewFile
```

然后应该看到统一文件查看器的日志：
```
[UnifiedFileViewer] Opening file: test.docx
[UnifiedFileViewer] File state: converting  // 或 viewable
[UnifiedFileViewer] PDF conversion started
[UnifiedFileViewer] Polling for PDF preview...
[UnifiedFileViewer] PDF ready, downloading...
[UnifiedFileViewer] Showing PDF preview
```

## 相关文件

### 修改的文件

- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 知识库主屏幕

### 相关文件

- `app/hooks/files.ts` - 文件下载和预览 Hook
- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 统一文件查看器
- `app/utils/file/index.ts` - 文件类型判断工具
- `app/screens/home/apps/workbench_api.ts` - 知识库 API

## 多语言支持

错误消息已经支持多语言（通过 `intl.formatMessage`）：

### 中文

```typescript
intl.formatMessage({
    id: 'workbench.kb.preview_unavailable',
    defaultMessage: 'This Office file cannot be previewed yet. Please try again later or download it.',
})
```

### 其他语言

只需在对应的语言文件中添加翻译：

```json
// i18n/zh.json
{
    "workbench.kb.preview_unavailable": "此 Office 文件暂时无法预览。请稍后再试或下载查看。"
}

// i18n/en.json
{
    "workbench.kb.preview_unavailable": "This Office file cannot be previewed yet. Please try again later or download it."
}
```

## 下一步

请执行以下操作：

1. **重新构建并运行应用**
2. **进入知识库页面**
3. **点击一个 Office 文件**
4. **查看调试日志**（可以在知识库页面或其他地方点击"调试日志"按钮查看）
5. **将完整的日志内容发给我**

根据日志，我可以确定问题所在并提供精确的修复方案。

## 对比 WebApp

WebApp 中可以正常预览，说明：
- ✅ 服务端 API 正常
- ✅ Office 文件已正确上传
- ✅ PDF 转换服务正常
- ✅ `mm_file_id` 应该存在

问题很可能出在：
- ❌ Mobile 端的 `downloadAndPreviewFile` 调用链
- ❌ `UnifiedFileViewer` 的文件类型判断
- ❌ PDF 转换的触发或轮询逻辑

---

**修改日期**: 2026-10-26
**修改人员**: Claude Code
**修改类型**: 添加调试日志 + 修复依赖数组
**目的**: 确定知识库 Office 文件无法预览的根本原因
