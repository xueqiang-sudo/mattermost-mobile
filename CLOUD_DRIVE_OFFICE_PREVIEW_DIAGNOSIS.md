# 云盘 Office 文件预览问题诊断报告

## 问题描述

用户反馈：云盘点击 Office 文件后，总是显示"正在转换中"，无法预览文件内容。而 webapp 中云盘 Office 文件是可以预览的。

## 当前分析

### 移动端云盘文件预览流程

#### 1. 用户点击文件 → `openFile(file)`

```typescript
// app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx (第 490-588 行)
const openFile = useCallback(async (file: DriveFile) => {
    // 生成预览和下载 URL
    const previewUrl = getDrivePreviewUrl(serverUrl, teamId, file.id);
    const downloadUrl = getDriveDownloadUrl(serverUrl, teamId, file.id);
    
    // 检查是否为 Office 文件
    const ext = (file.extension || '').toLowerCase();
    const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'];
    const isOffice = officeExtensions.includes(ext);
    
    // Office 文件必须有 mm_file_id
    if (isOffice && !file.mm_file_id) {
        Alert.alert('Error', 'This Office file cannot be previewed yet...');
        return;
    }
    
    // 获取完整的文件信息（包括 pdf_preview_id）
    let fullFileInfo: FileInfo | null = null;
    if (file.mm_file_id) {
        const client = NetworkManager.getClient(serverUrl);
        fullFileInfo = await client.getFileInfo(file.mm_file_id);
        // fullFileInfo 包含 pdf_preview_id
    }
    
    // 构建 FileInfo
    const fileInfo: FileInfo = fullFileInfo || {
        id: file.mm_file_id || file.id,
        // ... 其他字段
        has_preview_image: false,
    };
    
    // 调用下载和预览
    downloadAndPreviewFile(fileInfo);
}, [...]);
```

#### 2. `downloadAndPreviewFile` Hook

```typescript
// app/hooks/files.ts (第 144-200 行)
const downloadAndPreviewFile = useCallback(async (file: FileInfo) => {
    debugLog('FILE', `[downloadAndPreviewFile] called: ...`);
    
    // 如果是 Office 文件且有 PDF 预览
    if (hasPdfPreview(file) && file.pdf_preview_id) {
        debugLog('FILE', `[downloadAndPreviewFile] Office file with PDF preview, downloading PDF`);
        // 下载 PDF 预览
        // ...
    } else {
        // 没有 PDF 预览，打开统一文件查看器（会触发转换）
        openUnifiedFileViewer(file);
    }
}, [...]);
```

#### 3. 统一文件查看器

```typescript
// app/screens/unified_file_viewer/unified_file_viewer.tsx
const determineFileState = useCallback(async () => {
    // 如果是 Office 文件
    if (isOfficeFile(fileInfo)) {
        try {
            const client = NetworkManager.getClient(serverUrl);
            const updatedFileInfo = await client.getFileInfo(fileId);
            
            // 如果服务器有 PDF 预览
            if (updatedFileInfo.pdf_preview_id) {
                const newFileInfo = {...fileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
                setCurrentFileInfo(newFileInfo);
                setFileState('viewable');
                downloadAndShowFile(newFileInfo);
                return;
            }
        } catch (error) {
            // ...
        }
        
        // 没有 PDF 预览，开始转换
        setFileState('converting');
        startPolling();
        return;
    }
}, [...]);
```

#### 4. PDF 转换轮询

```typescript
const startPolling = useCallback(async () => {
    // 触发 PDF 转换
    const client = NetworkManager.getClient(serverUrl);
    const result = await client.triggerPdfConversion(fileId);
    
    if (result.status === 'complete' && result.pdf_preview_id) {
        // 转换完成
        setFileState('viewable');
        downloadAndShowFile(newFileInfo);
        return;
    }
    
    if (result.status === 'converting' || result.status === 'queued') {
        // 开始轮询
        pollingRef.current = setInterval(async () => {
            pollingCountRef.current++;
            
            if (pollingCountRef.current > MAX_POLLING_ATTEMPTS) {
                // 超时
                setFileState('unsupported');
                return;
            }
            
            // 检查是否完成
            const updatedFileInfo = await client.getFileInfo(fileId);
            if (updatedFileInfo.pdf_preview_id) {
                // 转换完成
                clearInterval(pollingRef.current);
                setFileState('viewable');
                downloadAndShowFile(newFileInfo);
            }
        }, 1000);
    }
}, [...]);
```

### 可能的问题

#### 问题 1：FileInfo 构建时没有正确使用 fullFileInfo

**现象**：
- `fullFileInfo` 包含 `pdf_preview_id`
- 但是 `fileInfo` 没有正确传递这个信息

**检查点**：
```typescript
// 第 547 行
const fileInfo: FileInfo = fullFileInfo || {
    id: file.mm_file_id || file.id,
    // ...
};
```

如果 `fullFileInfo` 存在，`fileInfo` 应该就是 `fullFileInfo`，包含 `pdf_preview_id`。

#### 问题 2：`hasPdfPreview` 判断失败

**现象**：
- `fileInfo.pdf_preview_id` 存在
- 但是 `hasPdfPreview(fileInfo)` 返回 `false`

**检查点**：
```typescript
// app/utils/file/index.ts (第 357-362 行)
export const hasPdfPreview = (file?: FileInfo | FileModel): boolean => {
    if (!file) {
        return false;
    }
    return Boolean('pdf_preview_id' in file && file.pdf_preview_id);
};
```

这个函数很简单，不太可能出错，除非 `pdf_preview_id` 是空字符串。

#### 问题 3：统一文件查看器重复检查

**现象**：
- `downloadAndPreviewFile` 检查 `hasPdfPreview(file)` 返回 `false`
- 打开统一文件查看器
- 统一文件查看器再次检查 `getFileInfo(fileId)` 也返回没有 `pdf_preview_id`

**可能原因**：
- 服务器端确实没有生成 PDF 预览
- PDF 转换服务失败
- `mm_file_id` 不正确

#### 问题 4：PDF 转换一直失败

**现象**：
- 统一文件查看器调用 `triggerPdfConversion`
- 返回 `status: 'failed'` 或一直 `status: 'converting'`
- 轮询 30 次后超时，显示"unsupported"

**可能原因**：
- 服务器 PDF 转换服务问题
- 文件格式不支持
- 文件太大

## 需要调试的信息

### 调试日志

请提供以下完整的调试日志：

```
[Drive] openFile called: {...}
[Drive] URLs generated: {...}
[Drive] File type check: {...}
[Drive] Fetching full file info for mm_file_id: ???
[Drive] Got full file info: {...}
[Drive] FileInfo constructed: {...}
[Drive] Opening document file with downloadAndPreviewFile
[UnifiedFileViewer] determineFileState called: {...}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] Server file info: {...}
[UnifiedFileViewer] No PDF preview, starting conversion
[UnifiedFileViewer] Triggering PDF conversion...
[UnifiedFileViewer] Polling attempt 1/30
...
```

### 关键信息

1. **`fullFileInfo.pdf_preview_id` 的值**
   - 是空字符串 `""`？
   - 还是有实际的 ID？

2. **`fileInfo.pdf_preview_id` 的值**
   - 传递给 `downloadAndPreviewFile` 时是什么？

3. **统一文件查看器中 `updatedFileInfo.pdf_preview_id` 的值**
   - 服务器返回的是什么？

4. **PDF 转换的状态**
   - `triggerPdfConversion` 返回的 `status` 是什么？
   - 轮询过程中状态是否变化？

## 对比 WebApp

### WebApp 可能的实现

WebApp 可能使用以下方式预览 Office 文件：

1. **LibreOffice Online** - 在线预览，不需要 PDF 转换
2. **OnlyOffice** - 在线预览，不需要 PDF 转换
3. **Microsoft Office Online** - 在线预览
4. **PDF 转换** - 与移动端相同

### 需要对比的点

1. **WebApp 是否调用 PDF 转换 API？**
   - 如果不调用，使用什么方式预览？
   - 如果调用，如何处理转换失败？

2. **WebApp 如何检查 `pdf_preview_id`？**
   - 是否在文件信息中获取？
   - 是否有其他判断逻辑？

3. **WebApp 如何处理转换中的状态？**
   - 是否显示"正在转换"？
   - 转换需要多长时间？

## 解决方案

### 方案 1：修复 FileInfo 传递（如果问题 1）

确保 `fullFileInfo` 正确传递给 `downloadAndPreviewFile`：

```typescript
const fileInfo: FileInfo = fullFileInfo ? {
    ...fullFileInfo,
    // 确保所有必要字段都存在
} : {
    // fallback
};
```

### 方案 2：优化 PDF 转换逻辑（如果问题 4）

增加转换重试机制和更详细的错误信息：

```typescript
const startPolling = useCallback(async () => {
    const result = await client.triggerPdfConversion(fileId);
    
    debugLog('[UnifiedFileViewer] PDF conversion result:', JSON.stringify(result));
    
    if (result.status === 'failed') {
        debugLog('[UnifiedFileViewer] PDF conversion failed:', result.error);
        setFileState('unsupported');
        return;
    }
    
    // ...
}, [...]);
```

### 方案 3：使用 WebApp 相同的预览方式

如果 WebApp 使用在线预览（如 LibreOffice Online），移动端也应该使用相同的方式：

```typescript
// 使用 WebView 打开在线预览
const previewUrl = `${serverUrl}/api/v4/files/${fileId}/preview`;
openWebView(previewUrl);
```

## 下一步

1. **提供调试日志** - 完整的调试日志
2. **对比 WebApp** - 等待研究结果
3. **确定问题** - 根据日志和对比结果确定根本原因
4. **实施修复** - 应用相应的解决方案

---

**诊断日期**: 2026-10-26  
**诊断人员**: Claude Code  
**状态**: 等待调试日志和 WebApp 研究结果  
