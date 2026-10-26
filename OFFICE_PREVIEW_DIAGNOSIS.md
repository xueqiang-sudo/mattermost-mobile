# Office 文件预览问题诊断

## 问题描述

用户反馈：点击知识库或云盘的 Office 文档后，显示"This file type cannot be previewed"，无法预览文件内容。

## 问题分析

### 文件预览流程

1. **用户点击文件** → 调用 `openFilePreview`
2. **检查文件类型** → 如果是 Office 文件，获取 `mm_file_id`
3. **获取文件信息** → 调用 `client.getFileInfo(mmFileId)` 获取 `pdf_preview_id`
4. **打开文件查看器** → 调用 `downloadAndPreviewFile(fileInfo)`
5. **统一文件查看器** → 检查文件状态并决定显示方式

### 关键代码

#### 知识库 Office 文件处理

```typescript
// app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx (第 820-875 行)
if (isOffice) {
    const info = await getKBFileInfo(serverUrl, item.docId, tid);
    mmFileId = info.mm_file_id || '';
    
    // 获取完整的文件信息（包括 pdf_preview_id）
    const client = NetworkManager.getClient(serverUrl);
    fullFileInfo = await client.getFileInfo(mmFileId);
    
    // ✅ fullFileInfo 包含 pdf_preview_id
}

// ⚠️ 问题：这里构建 fileInfo 时没有包含 pdf_preview_id
const fileInfo: FileInfo = fullFileInfo || {
    id: mmFileId || item.docId,
    // ... 其他字段
    has_preview_image: false,  // ❌ 始终为 false
    // ❌ 缺少 pdf_preview_id
};
```

#### 统一文件查看器判断逻辑

```typescript
// app/screens/unified_file_viewer/unified_file_viewer.tsx (第 67-69 行)
const isViewableFile = (file: FileInfo): boolean => {
    return isPdf(file) || isTextFile(file) || isImage(file) || 
           isVideo(file) || isAudio(file) || 
           hasPdfPreview(file) ||  // ← 检查 has_preview_image 或 pdf_preview_id
           isAppleDocument(file);
};

// 第 367-398 行
if (isOfficeFile(fileInfo)) {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const updatedFileInfo = await client.getFileInfo(fileId);
        
        // ✅ 如果服务器有 PDF 预览，使用它
        if (updatedFileInfo.pdf_preview_id) {
            const newFileInfo = {...fileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
            setCurrentFileInfo(newFileInfo);
            setFileState('viewable');
            downloadAndShowFile(newFileInfo);
            return;
        }
    } catch (error) {
        debugLog('Failed to fetch file info from server:', String(error));
    }
    
    // ❌ 如果没有 pdf_preview_id，开始转换
    setFileState('converting');
    startPolling();
    return;
}
```

### 问题根源

知识库和云盘在调用文件预览时：

1. ✅ **已经获取了** `fullFileInfo`（包含 `pdf_preview_id`）
2. ✅ **传递给了** `downloadAndPreviewFile(fileInfo)`
3. ❌ **但是** `fileInfo` 可能没有正确包含 `pdf_preview_id`

让我检查 `fileInfo` 的构建逻辑：

```typescript
// 第 862-875 行
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
    link: downloadUrl,
    has_preview_image: false,
    archived: false,
} as FileInfo;
```

**问题**：
- 如果 `fullFileInfo` 存在，`fileInfo` 就是 `fullFileInfo` ✅
- 如果 `fullFileInfo` 不存在（不应该发生，因为前面已经获取了），`fileInfo` 就是手动构建的对象 ❌

## 解决方案

### 方案 1：确保 `fileInfo` 包含所有必要字段（推荐）

修改知识库的文件信息构建逻辑，确保包含 `pdf_preview_id`：

```typescript
// app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx

let fileInfo: FileInfo;

if (fullFileInfo) {
    // 使用服务器返回的完整文件信息
    fileInfo = fullFileInfo;
    debugLog('[KB] Using full file info with pdf_preview_id:', fullFileInfo.pdf_preview_id);
} else {
    // 构建基本文件信息（仅用于非 Office 文件或获取失败的情况）
    fileInfo = {
        id: mmFileId || item.docId,
        user_id: '',
        create_at: 0,
        name: item.fileName || item.title,
        extension: ext,
        size: item.fileSize || 0,
        mime_type: '',
        uri: previewUrl,
        localPath: '',
        link: downloadUrl,
        has_preview_image: false,
        archived: false,
    } as FileInfo;
}
```

### 方案 2：添加调试日志以诊断问题

在关键步骤添加详细的调试日志：

```typescript
// 在调用 downloadAndPreviewFile 之前
debugLog('[KB] About to call downloadAndPreviewFile', JSON.stringify({
    fileId: fileInfo.id,
    fileName: fileInfo.name,
    extension: fileInfo.extension,
    pdf_preview_id: fileInfo.pdf_preview_id,
    has_preview_image: fileInfo.has_preview_image,
}));

downloadAndPreviewFile(fileInfo);
```

### 方案 3：检查 `hasPdfPreview` 函数

确认 `hasPdfPreview` 函数是否正确判断 Office 文件：

```typescript
// app/utils/file/index.ts
export function hasPdfPreview(file: FileInfo): boolean {
    // 应该检查文件扩展名是否为 Office 格式
    const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    const ext = file.extension?.toLowerCase() || '';
    return officeExtensions.includes(ext) || Boolean(file.pdf_preview_id);
}
```

## 调试步骤

### 步骤 1：查看调试日志

请执行以下操作：

1. **重新构建应用**
2. **进入知识库或云盘**
3. **点击一个 Office 文档**
4. **等待几秒钟**（应该会看到"正在转换"）
5. **进入调试日志页面**
6. **查找并复制以下日志**：

```
[KB] Office file, fetching mm_file_id
[KB] Got mm_file_id: ???
[KB] Got full file info: {...}
[KB] FileInfo constructed: {...}
[KB] Opening document file with downloadAndPreviewFile
[UnifiedFileViewer] Opening file: ???
[UnifiedFileViewer] File state: ???
```

### 步骤 2：分析日志

根据日志输出，我们可以确定问题所在：

#### 情况 1：没有 `mm_file_id`

```
[KB] Got mm_file_id: ""
[KB] Office file without mm_file_id, showing error
```

**原因**：服务器没有为 Office 文件创建 Mattermost FileInfo

**解决方案**：
- 检查后端 `getKBFileInfo` API
- 确认文件是否正确上传
- 等待服务器索引文件

#### 情况 2：有 `mm_file_id`，但没有 `pdf_preview_id`

```
[KB] Got mm_file_id: xyz789
[KB] Got full file info: {"pdf_preview_id": "", ...}
[UnifiedFileViewer] File state: converting
```

然后一直停在"converting"状态，或者转换为"unsupported"

**原因**：服务器还没有生成 PDF 预览

**解决方案**：
- 等待服务器完成 PDF 转换
- 检查 PDF 转换服务是否正常工作
- 查看服务器日志

#### 情况 3：有 `pdf_preview_id`，但仍然显示"unsupported"

```
[KB] Got mm_file_id: xyz789
[KB] Got full file info: {"pdf_preview_id": "abc123", ...}
[UnifiedFileViewer] File state: unsupported
```

**原因**：`fileInfo` 没有正确传递给统一文件查看器

**解决方案**：使用方案 1 的代码修复

#### 情况 4：PDF 转换失败

```
[UnifiedFileViewer] File state: converting
[UnifiedFileViewer] PDF conversion started
[UnifiedFileViewer] Polling for PDF preview...
[UnifiedFileViewer] PDF conversion failed
[UnifiedFileViewer] File state: unsupported
```

**原因**：PDF 转换服务失败

**解决方案**：
- 检查服务器日志
- 确认转换服务是否正常运行
- 检查文件格式是否支持

## 临时解决方案

如果上述方案都不能解决问题，可以临时修改统一文件查看器，增加更详细的错误信息：

```typescript
// app/screens/unified_file_viewer/unified_file_viewer.tsx

const determineFileState = useCallback(async () => {
    debugLog('[UnifiedFileViewer] determineFileState called', JSON.stringify({
        fileId,
        fileName: fileInfo.name,
        extension: fileInfo.extension,
        pdf_preview_id: fileInfo.pdf_preview_id,
        isOffice: isOfficeFile(fileInfo),
    }));

    // ... 现有代码

    if (isOfficeFile(fileInfo)) {
        debugLog('[UnifiedFileViewer] Office file detected, checking PDF preview');
        try {
            const client = NetworkManager.getClient(serverUrl);
            const updatedFileInfo = await client.getFileInfo(fileId);
            
            debugLog('[UnifiedFileViewer] Server file info:', JSON.stringify({
                pdf_preview_id: updatedFileInfo.pdf_preview_id,
                has_preview_image: updatedFileInfo.has_preview_image,
            }));

            if (updatedFileInfo.pdf_preview_id) {
                debugLog('[UnifiedFileViewer] PDF preview available, showing file');
                // ... 显示文件
            } else {
                debugLog('[UnifiedFileViewer] No PDF preview, starting conversion');
                // ... 开始转换
            }
        } catch (error) {
            debugLog('[UnifiedFileViewer] Failed to get file info:', String(error));
        }
    }
}, [fileInfo, fileId, serverUrl]);
```

## 相关文件

### 知识库

- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 主屏幕
- `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx` - 详情屏幕

### 云盘

- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘屏幕

### 统一文件查看器

- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 主组件
- `app/screens/unified_file_viewer/converting_view.tsx` - 转换中页面
- `app/screens/unified_file_viewer/unsupported_view.tsx` - 不支持页面

### 工具函数

- `app/utils/file/index.ts` - 文件类型判断
- `app/hooks/files.ts` - 文件下载和预览 Hook

## 下一步

请执行以下操作：

1. **重新构建应用**
2. **进入知识库或云盘**
3. **点击一个 Office 文档**
4. **等待几秒钟**
5. **进入调试日志页面**
6. **查找并复制完整的日志**
7. **将日志发给我**

根据日志，我可以确定问题的根本原因并提供精确的修复方案。

## 可能的修复

如果日志显示 `pdf_preview_id` 存在但文件仍然无法预览，我会立即修复代码，确保：

1. ✅ 正确传递 `pdf_preview_id` 到统一文件查看器
2. ✅ 正确判断 Office 文件的可预览状态
3. ✅ 正确显示 PDF 预览而不是"unsupported"页面

---

**诊断日期**: 2026-10-26  
**诊断人员**: Claude Code  
**状态**: 等待用户提供调试日志  
