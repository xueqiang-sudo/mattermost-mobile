# 文件预览崩溃修复

## 问题描述

用户反馈：点击知识库文件预览时，应用崩溃并显示以下错误：

```
Objects are not valid as a React child (found: [object Error]).
If you meant to render a collection of children, use an array instead.
```

## 根本原因

在 `kb_detail_screen.tsx`（知识库详情页）中，文件预览使用了 `openUnifiedFileViewer()` 直接打开文件查看器，而没有使用 `useDownloadFileAndPreview` hook。

这导致了以下问题：

1. **缺少下载和转换逻辑**：`openUnifiedFileViewer` 只是简单地导航到文件查看器屏幕，但没有处理：
   - 文件下载逻辑
   - Office 文件的 PDF 转换
   - 错误处理和重试机制
   - 进度显示

2. **FileInfo 对象不完整**：直接传递给 `openUnifiedFileViewer` 的 `fileInfo` 对象可能包含错误状态，而 `UnifiedFileViewer` 组件在渲染时试图显示这些错误对象，导致 React 渲染错误。

3. **不一致的行为**：与聊天窗口中的文件预览行为不一致，聊天窗口使用的是 `useDownloadFileAndPreview` hook。

## 修复方案

### 修复的文件

**`app/screens/home/apps/knowledge_base/kb_detail_screen.tsx`**

### 修复内容

#### 1. 添加 `useDownloadFileAndPreview` hook 导入

```typescript
// ✅ 添加导入
import {useDownloadFileAndPreview} from '@hooks/files';

// ❌ 移除不需要的导入
import {openUnifiedFileViewer} from '@utils/navigation';
```

#### 2. 使用 hook 并添加到依赖

```typescript
const KBDetailScreen = ({docId, docTitle, onDocUpdated}: Props) => {
    // ... 其他代码 ...

    // ✅ 添加 hook 使用
    // Use the same hook as chat window for consistent file preview behavior
    const {downloadAndPreviewFile} = useDownloadFileAndPreview(true);

    // ... 其他代码 ...
};
```

#### 3. 修改 `handleDownload` 函数

```typescript
const handleDownload = useCallback(async () => {
    // ... Office 文件检查和 FileInfo 构造逻辑 ...

    if (isImage(fileInfo) || isVideo(fileInfo) || isAudio(fileInfo)) {
        showMediaViewer(fileInfo, serverUrl);
    } else {
        // ✅ 修复：使用 downloadAndPreviewFile 替代 openUnifiedFileViewer
        // Use downloadAndPreviewFile for consistent behavior with chat window
        // This handles PDF preview, downloading, and conversion automatically
        downloadAndPreviewFile(fileInfo);
    }
}, [doc, serverUrl, intl, theme, downloadAndPreviewFile]); // ✅ 添加依赖
```

## 修复对比

### 修复前

```typescript
import {openUnifiedFileViewer} from '@utils/navigation';

const handleDownload = useCallback(async () => {
    // ... 构造 fileInfo ...
    
    if (isImage(fileInfo) || isVideo(fileInfo) || isAudio(fileInfo)) {
        showMediaViewer(fileInfo, serverUrl);
    } else {
        // ❌ 问题：直接打开查看器，没有下载和转换逻辑
        openUnifiedFileViewer(fileInfo, theme);
    }
}, [doc, serverUrl, intl, theme]);
```

### 修复后

```typescript
import {useDownloadFileAndPreview} from '@hooks/files';

const KBDetailScreen = ({docId, docTitle, onDocUpdated}: Props) => {
    // ✅ 使用 hook 处理下载和预览
    const {downloadAndPreviewFile} = useDownloadFileAndPreview(true);

    const handleDownload = useCallback(async () => {
        // ... 构造 fileInfo ...
        
        if (isImage(fileInfo) || isVideo(fileInfo) || isAudio(fileInfo)) {
            showMediaViewer(fileInfo, serverUrl);
        } else {
            // ✅ 使用 hook 处理下载、转换和预览
            downloadAndPreviewFile(fileInfo);
        }
    }, [doc, serverUrl, intl, theme, downloadAndPreviewFile]);
};
```

## 为什么这个修复有效

### `useDownloadFileAndPreview` hook 的优势

1. **统一的文件处理逻辑**：
   - 检查本地缓存
   - 下载文件
   - 处理 Office 文件的 PDF 转换
   - 错误处理和重试

2. **完整的 FileInfo 处理**：
   - 确保 FileInfo 对象包含所有必要的字段
   - 处理 `pdf_preview_id`
   - 管理下载进度

3. **一致的用户体验**：
   - 与聊天窗口的文件预览行为一致
   - 显示下载进度
   - 显示转换状态
   - 统一的错误提示

### 修复后的流程

```
用户点击知识库文件
    ↓
检查是否为 Office 文件
    ├─ 是 → 获取 mm_file_id
    │        ├─ 成功 → 获取完整 FileInfo
    │        │        ↓
    │        │   downloadAndPreviewFile()
    │        │        ↓
    │        │   检查是否有 PDF 预览
    │        │        ├─ 有 → 下载并显示 PDF
    │        │        └─ 无 → 触发转换 → 轮询 → 显示
    │        │
    │        └─ 失败 → 显示友好错误
    │
    └─ 否 → 构造基础 FileInfo
             ↓
        downloadAndPreviewFile()
             ↓
        下载并显示文件
```

## 相关修复

这次修复是对之前修复的补充：

1. **之前的修复**（`FILE_PREVIEW_FIX.md`）：
   - 修复了知识库和云盘的文件预览逻辑
   - 添加了 Office 文件的 mm_file_id 检查
   - 构造了完整的 FileInfo 对象
   - 添加了详细的调试日志

2. **这次修复**：
   - 修复了知识库详情页的文件预览崩溃问题
   - 使用了与聊天窗口一致的 hook
   - 确保了下载和转换逻辑的完整性

## 验证步骤

### 1. 知识库详情页文件预览测试

- [ ] 进入知识库文档详情页
- [ ] 点击下载按钮
- [ ] 观察以下场景：
  - **Office 文件（有 mm_file_id）**：应显示"Converting document..."然后显示 PDF
  - **Office 文件（无 mm_file_id）**：应显示友好错误提示
  - **PDF 文件**：应直接显示
  - **图片/视频/音频**：应使用 media viewer
  - **文本文件**：应使用 text viewer

### 2. 错误处理测试

- [ ] 网络错误时应显示友好错误
- [ ] 文件不存在时应显示友好错误
- [ ] 服务器错误时应显示友好错误

### 3. 一致性测试

- [ ] 比较聊天窗口和知识库详情页的文件预览行为
- [ ] 确认两者行为一致

## 技术细节

### `useDownloadFileAndPreview` hook

位置：`app/hooks/files.ts`

主要功能：
```typescript
export const useDownloadFileAndPreview = (enableSecureFilePreview: boolean) => {
    // 1. 下载进度管理
    const [progress, setProgress] = useState<number>(0);
    const [downloading, setDownloading] = useState(false);
    
    // 2. 打开文档（使用 UnifiedFileViewer）
    const openDocument = useCallback(async (file: FileInfo) => {
        openUnifiedFileViewer(file, theme, onDonePreviewingFile);
    }, [theme, onDonePreviewingFile]);
    
    // 3. 下载并预览文件
    const downloadAndPreviewFile = useCallback(async (file: FileInfo) => {
        // 处理 PDF 预览版本（Office 文件）
        if (hasPdfPreview(file) && file.pdf_preview_id) {
            // 下载 PDF 版本
        }
        // 检查本地缓存
        else if (await fileExists(file.localPath)) {
            // 直接打开
        }
        // 下载原文件
        else {
            // 下载并打开
        }
    }, [/* 依赖 */]);
    
    return {
        downloadAndPreviewFile,
        // ... 其他返回值
    };
};
```

### 为什么不能直接使用 `openUnifiedFileViewer`

`openUnifiedFileViewer` 只是一个导航函数，它：
- ✅ 导航到文件查看器屏幕
- ❌ 不处理文件下载
- ❌ 不处理 Office 文件的 PDF 转换
- ❌ 不处理错误和重试

而 `useDownloadFileAndPreview` hook：
- ✅ 处理完整的文件下载流程
- ✅ 处理 Office 文件的 PDF 转换
- ✅ 处理错误和重试
- ✅ 显示下载进度
- ✅ 在完成后调用 `openUnifiedFileViewer`

## 相关文件

- `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx` - 知识库详情页（已修复）
- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 知识库列表（已修复）
- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘（已修复）
- `app/hooks/files.ts` - 文件下载和预览 Hook
- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 统一文件查看器

## 参考文档

- `FILE_PREVIEW_FIX.md` - 之前的修复文档
- `UNIFIED_FILE_VIEWER_IMPLEMENTATION.md` - 统一文件查看器实现文档

---

**修复日期**: 2026-10-26
**修复人员**: Claude Code
**测试状态**: 待测试
**修复类型**: Bug 修复（崩溃）
