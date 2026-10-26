# 云盘 Office 文件点击无反应 - 调试日志添加

## 问题描述

用户反馈：点击云盘中的 Office 文件时，没有任何反应。

## 已添加的调试日志

为了确定问题出在哪个环节，我在以下关键位置添加了调试日志：

### 1. 文件点击事件 (`onFileTap`)

```typescript
const onFileTap = useCallback((file: DriveFile) => {
    debugLog('[Drive] onFileTap called:', {
        fileId: file.id,
        fileName: file.name,
        fileType: file.type,
        extension: file.extension,
    });

    if (file.type === 'folder') {
        debugLog('[Drive] Opening folder');
        openFolder(file);
    } else {
        debugLog('[Drive] Opening file');
        openFile(file);
    }
}, [openFolder, openFile]);
```

### 2. 文件打开逻辑 (`openFile`)

```typescript
const openFile = useCallback(async (file: DriveFile) => {
    debugLog('[Drive] openFile called:', {
        fileId: file.id,
        fileName: file.name,
        extension: file.extension,
        mm_file_id: file.mm_file_id,
    });

    // ... 生成 URL ...
    debugLog('[Drive] URLs generated:', {previewUrl, downloadUrl});

    // ... 文件类型检查 ...
    debugLog('[Drive] File type check:', {ext, isOffice});

    // ... 获取完整文件信息 ...
    debugLog('[Drive] Fetching full file info for mm_file_id:', file.mm_file_id);
    debugLog('[Drive] Got full file info', JSON.stringify({...}));

    // ... 构造 FileInfo ...
    debugLog('[Drive] FileInfo constructed:', {
        id: fileInfo.id,
        name: fileInfo.name,
        extension: fileInfo.extension,
        hasPdfPreview: hasPdfPreview(fileInfo),
    });

    // ... 判断文件类型并打开 ...
    if (isImage(fileInfo) || isVideo(fileInfo) || isAudio(fileInfo)) {
        debugLog('[Drive] Opening media file');
        showMediaViewer(fileInfo, serverUrl);
    } else {
        debugLog('[Drive] Opening document file with downloadAndPreviewFile');
        downloadAndPreviewFile(fileInfo);
    }
}, [...]);
```

## 验证步骤

### 1. 点击 Office 文件

- [ ] 进入云盘页面
- [ ] 点击一个 Office 文件（Word/Excel/PPT）
- [ ] 查看调试日志
- [ ] **预期看到以下日志**：

```
[Drive] onFileTap called: {fileId: "...", fileName: "test.docx", fileType: "file", extension: "docx"}
[Drive] Opening file
[Drive] openFile called: {fileId: "...", fileName: "test.docx", extension: "docx", mm_file_id: "..."}
[Drive] URLs generated: {previewUrl: "...", downloadUrl: "..."}
[Drive] File type check: {ext: "docx", isOffice: true}
[Drive] Fetching full file info for mm_file_id: ...
[Drive] Got full file info: {"mm_file_id":"...","pdf_preview_id":"...","has_preview_image":false}
[Drive] FileInfo constructed: {id: "...", name: "test.docx", extension: "docx", hasPdfPreview: true/false}
[Drive] Opening document file with downloadAndPreviewFile
```

### 2. 日志分析

根据日志输出，我们可以确定问题出在哪个环节：

#### 情况 1：没有看到任何日志
- **问题**：点击事件没有触发
- **原因**：可能是 TouchableOpacity 的 onPress 没有正确绑定
- **解决方案**：检查文件列表渲染逻辑

#### 情况 2：看到 `onFileTap called` 但没有 `openFile called`
- **问题**：`onFileTap` 被触发，但没有调用 `openFile`
- **原因**：可能是 `file.type` 判断错误，被识别为文件夹
- **解决方案**：检查 `file.type` 的值

#### 情况 3：看到 `openFile called` 但没有 `Opening document file`
- **问题**：`openFile` 执行到一半就停止了
- **可能原因**：
  - Office 文件缺少 `mm_file_id`，显示错误提示后返回
  - URL 生成失败
  - 文件类型检查出错
- **解决方案**：根据具体日志确定原因

#### 情况 4：看到 `Opening document file` 但没有预览界面
- **问题**：`downloadAndPreviewFile` 被调用，但没有打开预览界面
- **可能原因**：
  - `downloadAndPreviewFile` 内部有错误
  - 统一文件查看器没有正确打开
  - 下载失败但没有显示错误
- **解决方案**：检查 `useDownloadFileAndPreview` hook 的实现

## 可能的问题和解决方案

### 问题 1：Office 文件缺少 `mm_file_id`

**日志表现**：
```
[Drive] File type check: {ext: "docx", isOffice: true}
```
之后没有更多日志。

**原因**：
- Office 文件没有 `mm_file_id`
- 代码显示错误提示后直接返回

**解决方案**：
- 检查服务端是否正确为 Office 文件创建了 `mm_file_id`
- 确认错误提示是否正确显示

### 问题 2：`downloadAndPreviewFile` 执行但没有可见反应

**日志表现**：
```
[Drive] Opening document file with downloadAndPreviewFile
```
之后没有更多日志，也没有预览界面。

**可能原因**：
1. `downloadAndPreviewFile` 内部有异步错误
2. 导航到统一文件查看器失败
3. 下载失败但没有显示错误

**解决方案**：
- 检查 `app/hooks/files.ts` 中的 `useDownloadFileAndPreview` 实现
- 查看是否有其他错误日志
- 确认统一文件查看器是否正确注册

### 问题 3：文件类型判断错误

**日志表现**：
```
[Drive] Opening media file
```
而不是 `Opening document file`

**原因**：
- Office 文件被错误地识别为图片/视频/音频
- 可能是 `mime_type` 不正确

**解决方案**：
- 检查 `isImage`/`isVideo`/`isAudio` 的判断逻辑
- 确认文件的 `mime_type` 是否正确

## 下一步

请执行以下操作：

1. **重新构建并运行应用**
2. **进入云盘页面**
3. **点击一个 Office 文件**
4. **查看调试日志**（可以通过知识库页面的调试日志按钮查看）
5. **将完整的日志内容发给我**

根据日志，我可以确定问题所在并提供精确的修复方案。

## 相关代码

- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘主屏幕
- `app/hooks/files.ts` - 文件下载和预览 Hook
- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 统一文件查看器
- `app/utils/file/index.ts` - 文件类型判断工具

---

**修改日期**: 2026-10-26
**修改人员**: Claude Code
**修改类型**: 添加调试日志
**目的**: 确定云盘 Office 文件点击无反应的根本原因
