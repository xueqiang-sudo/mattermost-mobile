# Office 文件预览问题 - 调试步骤

## 问题描述

点击知识库或云盘的 Office 文档后，显示"This file type cannot be previewed"，无法预览文件内容。

## 已添加的调试日志

为了精确定位问题，我在以下位置添加了详细的调试日志：

### 1. 知识库页面 (`knowledge_base_screen.tsx`)

```typescript
// 第 877-884 行
debugLog('[KB] FileInfo constructed:', JSON.stringify({
    id: fileInfo.id,
    name: fileInfo.name,
    extension: fileInfo.extension,
    pdf_preview_id: fileInfo.pdf_preview_id,      // ← 新增
    has_preview_image: fileInfo.has_preview_image, // ← 新增
    usingFullFileInfo: Boolean(fullFileInfo),        // ← 新增
}));
```

### 2. 云盘页面 (`cloud_drive_screen.tsx`)

```typescript
// 第 562-569 行
debugLog('[Drive] FileInfo constructed:', JSON.stringify({
    id: fileInfo.id,
    name: fileInfo.name,
    extension: fileInfo.extension,
    pdf_preview_id: fileInfo.pdf_preview_id,      // ← 新增
    has_preview_image: fileInfo.has_preview_image, // ← 新增
    hasPdfPreview: hasPdfPreview(fileInfo),
    usingFullFileInfo: Boolean(fullFileInfo),        // ← 新增
}));
```

### 3. 统一文件查看器 (`unified_file_viewer.tsx`)

```typescript
// 第 357-368 行 - 函数入口
debugLog('[UnifiedFileViewer] determineFileState called', JSON.stringify({
    fileId,
    fileName: fileInfo.name,
    extension: fileInfo.extension,
    pdf_preview_id: fileInfo.pdf_preview_id,
    has_preview_image: fileInfo.has_preview_image,
    isOffice: isOfficeFile(fileInfo),
    isViewable: isViewableFile(fileInfo),
}));

// 第 373 行 - Office 文件检测
debugLog('[UnifiedFileViewer] Office file detected, checking PDF preview');

// 第 379-383 行 - 服务器文件信息
debugLog('[UnifiedFileViewer] Server file info:', JSON.stringify({
    pdf_preview_id: updatedFileInfo.pdf_preview_id,
    has_preview_image: updatedFileInfo.has_preview_image,
}));

// 第 387 行 - PDF 预览可用
debugLog('[UnifiedFileViewer] PDF preview available, showing file');

// 第 394 行 - 获取文件信息失败
debugLog('[UnifiedFileViewer] Failed to get file info from server:', String(error));

// 第 399 行 - 开始转换
debugLog('[UnifiedFileViewer] No PDF preview, starting conversion');

// 第 406 行 - 文件可直接查看
debugLog('[UnifiedFileViewer] File is viewable, showing directly');

// 第 413 行 - 文件不支持
debugLog('[UnifiedFileViewer] File is unsupported');
```

## 调试步骤

### 步骤 1：重新构建应用

```bash
# iOS
cd ios && pod install && cd ..
npx react-native run-ios

# Android
npx react-native run-android
```

### 步骤 2：测试知识库 Office 文件

1. **进入知识库页面**
2. **点击一个 Office 文档**（.docx, .xlsx, .pptx）
3. **等待几秒钟**
4. **观察屏幕显示**：
   - 是否显示"正在转换文档..."？
   - 还是直接显示"此文件类型无法预览"？
5. **进入调试日志页面**
6. **查找并复制以下日志**：

```
[KB] Office file, fetching mm_file_id
[KB] Got mm_file_id: ???
[KB] Got full file info: {...}
[KB] FileInfo constructed: {...}
[KB] Opening document file with downloadAndPreviewFile
[UnifiedFileViewer] determineFileState called {...}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] Server file info: {...}
[UnifiedFileViewer] PDF preview available, showing file
// 或
[UnifiedFileViewer] No PDF preview, starting conversion
// 或
[UnifiedFileViewer] File is unsupported
```

### 步骤 3：测试云盘 Office 文件

1. **进入云盘页面**
2. **点击一个 Office 文档**
3. **等待几秒钟**
4. **观察屏幕显示**
5. **进入调试日志页面**
6. **查找并复制以下日志**：

```
[Drive] openFile called: {...}
[Drive] Office file, checking mm_file_id
[Drive] Fetching full file info for mm_file_id: ???
[Drive] Got full file info: {...}
[Drive] FileInfo constructed: {...}
[Drive] Opening document file with downloadAndPreviewFile
[UnifiedFileViewer] determineFileState called {...}
...
```

### 步骤 4：分析日志

根据日志输出，我们可以确定问题所在：

#### 情况 1：没有 `mm_file_id`

**日志表现**：
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

**日志表现**：
```
[KB] Got mm_file_id: xyz789
[KB] Got full file info: {"pdf_preview_id": "", ...}
[KB] FileInfo constructed: {"pdf_preview_id": "", "usingFullFileInfo": true}
[UnifiedFileViewer] determineFileState called {"pdf_preview_id": "", ...}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] Server file info: {"pdf_preview_id": "", ...}
[UnifiedFileViewer] No PDF preview, starting conversion
```

然后一直停在"converting"状态，或者转换为"unsupported"

**原因**：服务器还没有生成 PDF 预览，或转换失败

**解决方案**：
- 等待服务器完成 PDF 转换（通常需要 10-30 秒）
- 检查 PDF 转换服务是否正常工作
- 查看服务器日志
- 检查文件格式是否支持

#### 情况 3：有 `pdf_preview_id`，但仍然显示"unsupported"

**日志表现**：
```
[KB] Got mm_file_id: xyz789
[KB] Got full file info: {"pdf_preview_id": "abc123", ...}
[KB] FileInfo constructed: {"pdf_preview_id": "abc123", "usingFullFileInfo": true}
[UnifiedFileViewer] determineFileState called {"pdf_preview_id": "abc123", ...}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] Server file info: {"pdf_preview_id": "abc123", ...}
[UnifiedFileViewer] File is unsupported  // ❌ 不应该出现这个
```

**原因**：代码逻辑问题，`pdf_preview_id` 没有被正确使用

**解决方案**：我会立即修复代码

#### 情况 4：PDF 转换失败

**日志表现**：
```
[UnifiedFileViewer] determineFileState called {...}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] No PDF preview, starting conversion
[UnifiedFileViewer] Polling for PDF preview...
[UnifiedFileViewer] PDF conversion failed: ???
[UnifiedFileViewer] File is unsupported
```

**原因**：PDF 转换服务失败

**解决方案**：
- 检查服务器日志
- 确认转换服务是否正常运行
- 检查文件格式是否支持
- 检查文件大小是否超出限制

#### 情况 5：获取文件信息失败

**日志表现**：
```
[UnifiedFileViewer] determineFileState called {...}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] Failed to get file info from server: Error: ???
[UnifiedFileViewer] No PDF preview, starting conversion
```

**原因**：网络请求失败或服务器错误

**解决方案**：
- 检查网络连接
- 检查服务器状态
- 查看服务器日志

## 完整的日志示例

### 正常流程（文件可以预览）

```
[KB] Office file, fetching mm_file_id
[KB] Got mm_file_id: abc123xyz
[KB] Got full file info: {"pdf_preview_id":"def456uvw","has_preview_image":false}
[KB] FileInfo constructed: {"id":"abc123xyz","name":"document.docx","extension":"docx","pdf_preview_id":"def456uvw","has_preview_image":false,"usingFullFileInfo":true}
[KB] Opening document file with downloadAndPreviewFile
[UnifiedFileViewer] determineFileState called {"fileId":"abc123xyz","fileName":"document.docx","extension":"docx","pdf_preview_id":"def456uvw","has_preview_image":false,"isOffice":true,"isViewable":true}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] Server file info: {"pdf_preview_id":"def456uvw","has_preview_image":false}
[UnifiedFileViewer] PDF preview available, showing file
[UnifiedFileViewer] File state: viewable
[UnifiedFileViewer] Downloading PDF preview...
[UnifiedFileViewer] PDF downloaded, showing preview
```

### 转换流程（文件需要转换）

```
[KB] Office file, fetching mm_file_id
[KB] Got mm_file_id: abc123xyz
[KB] Got full file info: {"pdf_preview_id":"","has_preview_image":false}
[KB] FileInfo constructed: {"id":"abc123xyz","name":"document.docx","extension":"docx","pdf_preview_id":"","has_preview_image":false,"usingFullFileInfo":true}
[KB] Opening document file with downloadAndPreviewFile
[UnifiedFileViewer] determineFileState called {"fileId":"abc123xyz","fileName":"document.docx","extension":"docx","pdf_preview_id":"","has_preview_image":false,"isOffice":true,"isViewable":false}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] Server file info: {"pdf_preview_id":"","has_preview_image":false}
[UnifiedFileViewer] No PDF preview, starting conversion
[UnifiedFileViewer] File state: converting
[UnifiedFileViewer] Triggering PDF conversion...
[UnifiedFileViewer] Polling for PDF preview...
[UnifiedFileViewer] Polling attempt 1/30
[UnifiedFileViewer] Polling attempt 2/30
[UnifiedFileViewer] PDF is ready, downloading...
[UnifiedFileViewer] File state: viewable
[UnifiedFileViewer] Showing PDF preview
```

### 失败流程（转换失败）

```
[KB] Office file, fetching mm_file_id
[KB] Got mm_file_id: abc123xyz
[KB] Got full file info: {"pdf_preview_id":"","has_preview_image":false}
[KB] FileInfo constructed: {"id":"abc123xyz","name":"document.docx","extension":"docx","pdf_preview_id":"","has_preview_image":false,"usingFullFileInfo":true}
[KB] Opening document file with downloadAndPreviewFile
[UnifiedFileViewer] determineFileState called {"fileId":"abc123xyz","fileName":"document.docx","extension":"docx","pdf_preview_id":"","has_preview_image":false,"isOffice":true,"isViewable":false}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] Server file info: {"pdf_preview_id":"","has_preview_image":false}
[UnifiedFileViewer] No PDF preview, starting conversion
[UnifiedFileViewer] File state: converting
[UnifiedFileViewer] Triggering PDF conversion...
[UnifiedFileViewer] Polling for PDF preview...
[UnifiedFileViewer] Polling attempt 1/30
...
[UnifiedFileViewer] Polling attempt 30/30
[UnifiedFileViewer] PDF conversion timed out
[UnifiedFileViewer] File state: unsupported
```

## 下一步

请执行以下操作：

1. **重新构建应用**
2. **进入知识库或云盘**
3. **点击一个 Office 文档**
4. **等待几秒钟，观察屏幕显示**
5. **进入调试日志页面**
6. **查找并复制完整的日志**（包括所有 `[KB]`、`[Drive]`、`[UnifiedFileViewer]` 相关的日志）
7. **将日志发给我**

根据日志，我可以确定：
- ✅ 问题出在哪个环节
- ✅ 是服务器问题还是客户端问题
- ✅ 需要修复哪个文件
- ✅ 是否需要后端配合

## 常见问题

### Q1: 为什么需要 `pdf_preview_id`？

**A**: Office 文件不能直接在移动端预览，需要先转换为 PDF。服务器会为每个 Office 文件创建一个 PDF 预览版本，`pdf_preview_id` 就是这个 PDF 文件的 ID。

### Q2: PDF 转换需要多长时间？

**A**: 通常需要 10-30 秒，取决于文件大小和服务器负载。应用会轮询最多 30 次（每次间隔 1 秒）等待转换完成。

### Q3: 如果转换失败怎么办？

**A**: 会显示"此文件类型无法预览"页面，用户可以：
- 下载文件后用其他应用打开
- 等待一段时间后重试
- 联系管理员检查服务器状态

### Q4: WebApp 为什么可以预览？

**A**: WebApp 可能使用了不同的预览机制（如 LibreOffice Online、OnlyOffice 等），而移动端使用的是服务器端的 PDF 转换。

## 相关文件

### 修改的文件

- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 添加了调试日志
- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 添加了调试日志
- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 添加了详细的调试日志

### 相关文件

- `app/hooks/files.ts` - 文件下载和预览 Hook
- `app/utils/file/index.ts` - 文件类型判断
- `app/screens/unified_file_viewer/converting_view.tsx` - 转换中页面
- `app/screens/unified_file_viewer/unsupported_view.tsx` - 不支持页面

---

**更新日期**: 2026-10-26  
**更新人员**: Claude Code  
**状态**: 等待用户提供调试日志  
