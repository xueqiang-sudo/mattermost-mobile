# 智能笔记本支持的文件类型

## 📋 概述

智能笔记本现在支持**聊天群组中所有的文件类型**，包括 Office 文档、PDF、压缩包、代码文件等。每种文件类型都会显示对应的图标、文件名和大小。

## 🎯 支持的文件类型

### 1. Office 文档

#### Word 文档
- **扩展名**: `.doc`, `.docx`
- **MIME 类型**: `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- **图标**: `file-word-outline`
- **显示**: Word 图标 + 文件名 + 文件大小

#### Excel 表格
- **扩展名**: `.xls`, `.xlsx`
- **MIME 类型**: `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **图标**: `file-excel-outline`
- **显示**: Excel 图标 + 文件名 + 文件大小

#### PowerPoint 演示文稿
- **扩展名**: `.ppt`, `.pptx`
- **MIME 类型**: `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- **图标**: `file-powerpoint-outline`
- **显示**: PPT 图标 + 文件名 + 文件大小

### 2. PDF 文档

- **扩展名**: `.pdf`
- **MIME 类型**: `application/pdf`
- **图标**: `file-pdf-outline`
- **显示**: PDF 图标 + 文件名 + 文件大小

### 3. 压缩包

- **扩展名**: `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`
- **图标**: `folder-zip-outline`
- **显示**: 压缩包图标 + 文件名 + 文件大小

### 4. 文本文件

- **扩展名**: `.txt`, `.md`, `.log`, `.csv`, `.json`, `.xml`, `.html`, `.css`, `.js`, `.ts`
- **图标**: `file-document-outline`
- **显示**: 文档图标 + 文件名 + 文件大小

### 5. 代码文件

- **扩展名**: `.py`, `.java`, `.cpp`, `.c`, `.h`, `.php`, `.rb`, `.go`, `.rs`, `.swift`
- **图标**: `file-code-outline`
- **显示**: 代码图标 + 文件名 + 文件大小

### 6. 图片文件（已支持）

- **扩展名**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, `.svg`, `.ico`, `.tiff`
- **图标**: 图片预览
- **显示**: 图片预览 + 文件名

### 7. 视频文件（已支持）

- **扩展名**: `.mp4`, `.avi`, `.mov`, `.mkv`, `.webm`, `.flv`, `.wmv`, `.m4v`
- **图标**: 视频缩略图 + 播放按钮
- **显示**: 视频预览 + 文件名 + 文件大小 + 时长

### 8. 音频文件（已支持）

- **扩展名**: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`, `.wma`
- **图标**: `microphone-outline`
- **显示**: 音频卡片 + 文件名 + 文件大小 + 时长

### 9. 其他文件

- **扩展名**: 任何其他扩展名
- **图标**: `file-outline`
- **显示**: 通用文件图标 + 文件名 + 文件大小

## 🎨 图标映射

```typescript
function getFileIcon(fileName: string, mimeType?: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    // Office 文档
    if (['doc', 'docx'].includes(ext) || mimeType?.includes('wordprocessingml')) {
        return 'file-word-outline';
    }
    if (['xls', 'xlsx'].includes(ext) || mimeType?.includes('spreadsheetml')) {
        return 'file-excel-outline';
    }
    if (['ppt', 'pptx'].includes(ext) || mimeType?.includes('presentationml')) {
        return 'file-powerpoint-outline';
    }

    // PDF
    if (ext === 'pdf' || mimeType === 'application/pdf') {
        return 'file-pdf-outline';
    }

    // 压缩包
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
        return 'folder-zip-outline';
    }

    // 文本文件
    if (['txt', 'md', 'log', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(ext)) {
        return 'file-document-outline';
    }

    // 代码文件
    if (['py', 'java', 'cpp', 'c', 'h', 'php', 'rb', 'go', 'rs', 'swift'].includes(ext)) {
        return 'file-code-outline';
    }

    // 默认文件图标
    return 'file-outline';
}
```

## 📱 显示效果

### Office 文档示例

```
┌─────────────────────────┐
│ [W] 报告.docx           │  ← Word 图标
│     2.5 MB              │  ← 文件大小
│     [本地]              │  ← 本地文件标记
└─────────────────────────┘

┌─────────────────────────┐
│ [X] 数据表.xlsx         │  ← Excel 图标
│     1.2 MB              │
└─────────────────────────┘

┌─────────────────────────┐
│ [P] 演示文稿.pptx       │  ← PPT 图标
│     5.8 MB              │
└─────────────────────────┘
```

### PDF 文档示例

```
┌─────────────────────────┐
│ [PDF] 合同.pdf          │  ← PDF 图标
│      3.2 MB             │
└─────────────────────────┘
```

### 压缩包示例

```
┌─────────────────────────┐
│ [📦] 项目文件.zip       │  ← 压缩包图标
│      45.6 MB            │
└─────────────────────────┘
```

### 文本文件示例

```
┌─────────────────────────┐
│ [📄] 说明.txt           │  ← 文档图标
│      12 KB              │
└─────────────────────────┘

┌─────────────────────────┐
│ [📄] 配置文件.json      │
│      8 KB               │
└─────────────────────────┘
```

### 代码文件示例

```
┌─────────────────────────┐
│ [</>] main.py           │  ← 代码图标
│       4 KB              │
└─────────────────────────┘

┌─────────────────────────┐
│ [</>] App.js            │
│       15 KB             │
└─────────────────────────┘
```

## 🧪 测试场景

### 群组文件
- ✅ 选择 Word 文档 → 显示 Word 图标
- ✅ 选择 Excel 表格 → 显示 Excel 图标
- ✅ 选择 PPT 演示文稿 → 显示 PPT 图标
- ✅ 选择 PDF 文档 → 显示 PDF 图标
- ✅ 选择压缩包 → 显示压缩包图标

### 相册
- ✅ 选择照片 → 显示图片预览
- ✅ 选择视频 → 显示视频缩略图 + 播放按钮

### 手机文件
- ✅ 选择文本文件 → 显示文档图标
- ✅ 选择代码文件 → 显示代码图标
- ✅ 选择其他文件 → 显示通用文件图标

### 文件信息显示
- ✅ 所有文件都显示文件名
- ✅ 所有文件都显示文件大小
- ✅ 本地文件显示"本地"标记
- ✅ 保存后"本地"标记消失

## 📊 代码变更

### 修改的文件

**`app/screens/home/apps/smart_notebook/block_editor.tsx`**

1. **新增 `getFileIcon` 函数**（+40 行）
   - 根据文件扩展名和 MIME 类型返回对应图标
   - 支持 Office 文档、PDF、压缩包、文本、代码等

2. **更新文件块渲染逻辑**（修改 3 行）
   - 使用 `getFileIcon` 动态获取图标
   - 显示文件名和文件大小
   - 保持本地文件标记

### 总计
- 新增：+40 行
- 修改：3 行

## 🎯 技术要点

### 1. 文件类型识别

**双重识别机制**：
- **扩展名识别**：快速、简单
- **MIME 类型识别**：准确、可靠

```typescript
// 优先使用扩展名
if (['doc', 'docx'].includes(ext)) {
    return 'file-word-outline';
}

// 备用 MIME 类型
if (mimeType?.includes('wordprocessingml')) {
    return 'file-word-outline';
}
```

### 2. 图标选择

**使用 CompassIcon 组件**：
- 统一的图标风格
- 支持主题颜色
- 易于维护和扩展

### 3. 文件信息显示

**完整的信息展示**：
- 文件图标（根据类型）
- 文件名（`block.meta?.caption`）
- 文件大小（`formatFileSize(block.meta?.size)`）
- 本地文件标记（`block.meta?.isLocal`）

## 🔄 兼容性

### 向后兼容
- ✅ 所有现有功能正常
- ✅ 只是增强了图标显示
- ✅ 不影响其他功能

### 性能影响
- ✅ 图标查找算法简单高效
- ✅ 无额外开销
- ✅ 用户体验更好

## 🎉 总结

### 实现成果
1. ✅ 支持聊天群组中所有文件类型
2. ✅ Office 文档（Word、Excel、PPT）
3. ✅ PDF 文档
4. ✅ 压缩包
5. ✅ 文本文件
6. ✅ 代码文件
7. ✅ 图片、视频、音频
8. ✅ 每种文件类型显示对应图标
9. ✅ 所有文件显示文件名和大小
10. ✅ 本地文件有明确标记

### 技术亮点
- **智能识别**：根据扩展名和 MIME 类型双重识别
- **动态图标**：根据文件类型自动选择图标
- **信息完整**：文件名、大小、本地标记一应俱全
- **易于扩展**：添加新文件类型只需几行代码

### 用户价值
- 更直观的文件类型识别
- 更美观的界面显示
- 更完整的文件信息
- 更好的用户体验

现在智能笔记本支持聊天群组中所有的文件类型，每种文件都会显示对应的图标、文件名和大小！🎉
