# 知识库 Office 文件预览 - fileId 错误修复

## 问题描述

用户点击知识库 Office 文件后，调试日志显示：

```
17:46:01.883 [[KB] File type check:] {"ext":"","isOffice":false}
17:46:01.883 [[KB] FileInfo constructed:] {
  "id":"e52dd059db8f7998",
  "name":"IM 工业应用 789.docx",
  "extension":"",              ← ❌ 扩展名为空！
  "original_mmFileId":"",      ← ❌ mmFileId 为空！
  "extracted_ext":""           ← ❌ 提取的扩展名也为空！
}

17:46:03.507 [[UnifiedFileViewer] Failed to get file info from server:] 
Error: 请求网址有无效或缺少 file_id 参数。

17:46:03.510 [[UnifiedFileViewer] Starting PDF conversion polling for fileId:] 
e52dd059db8f7998  ← ❌ 这是 docId，不是 Mattermost fileId！
```

## 问题分析

### 根本原因

**两个问题**：

1. **扩展名为空**
   - 文件名是 "IM 工业应用 789.docx"
   - 但 `getExtension(item.fileName)` 返回空字符串
   - 可能原因：`item.fileName` 为空或 undefined

2. **使用了错误的 ID**
   - 代码尝试使用 `docId` (e52dd059db8f7998) 作为 Mattermost fileId
   - 但这是知识库的 docId，不是 Mattermost 的 fileId
   - 服务器返回"无效或缺少 file_id 参数"错误

### 问题链路

```
用户点击知识库文档
    ↓
openFilePreview(item)
    ↓
const ext = getExtension(item.fileName)
    ↓
❌ ext = "" (空字符串)
    ↓
isOffice = false (因为 ext 为空)
    ↓
❌ 没有进入 Office 文件处理逻辑 (第 826-885 行)
    ↓
构建 fallback FileInfo
    ↓
fileInfo.id = mmFileId || item.docId
    ↓
❌ mmFileId 为空，使用 item.docId
    ↓
调用 downloadAndPreviewFile(fileInfo)
    ↓
UnifiedFileViewer 尝试用 docId 调用 Mattermost 文件 API
    ↓
❌ 服务器返回"无效或缺少 file_id 参数"
```

## 已添加的调试日志

### 文件: `knowledge_base_screen.tsx` (第 800-808 行)

```typescript
debugLog('[KB] openFilePreview called:', JSON.stringify({
    docId: item.docId,
    fileName: item.fileName,      // ← 检查是否有值
    title: item.title,            // ← 新增
    fileSize: item.fileSize,
    category: item.category,      // ← 新增
    allKeys: Object.keys(item),   // ← 新增：查看所有字段
}));
```

## 下一步操作

### 1. 重新构建应用并测试

```bash
cd /home/work/mattermost-mobile
cd ios && pod install && cd ..
npx react-native run-ios
```

### 2. 测试步骤

1. 进入知识库页面
2. 点击 Office 文档（如 "IM 工业应用 789.docx"）
3. 打开调试日志
4. 查找以下日志：

```
[KB] openFilePreview called: {
  "docId": "e52dd059db8f7998",
  "fileName": ???,        // ← 关键：检查这个值
  "title": ???,
  "fileSize": ???,
  "category": ???,
  "allKeys": ???          // ← 查看所有字段
}
```

### 3. 预期结果分析

#### 场景 A: `fileName` 有值

```json
{
  "docId": "e52dd059db8f7998",
  "fileName": "IM 工业应用 789.docx",  // ← 有值
  "title": "IM 工业应用 789",
  "fileSize": 40379,
  "category": "file",
  "allKeys": ["docId", "title", "category", "tags", "createdAt", "fileName", "fileSize"]
}
```

**结论**: `fileName` 有值，但 `getExtension` 返回空字符串

**可能原因**:
- `getExtension` 函数有 bug
- 文件名中有特殊字符

**解决方案**:
- 检查 `getExtension` 函数实现
- 添加更多日志

#### 场景 B: `fileName` 为空或 undefined

```json
{
  "docId": "e52dd059db8f7998",
  "fileName": undefined,  // ← 为空
  "title": "IM 工业应用 789",
  "fileSize": 40379,
  "category": "file",
  "allKeys": ["docId", "title", "category", "tags", "createdAt", "fileSize"]
}
```

**结论**: API 返回的 `KBDoc` 对象中没有 `fileName` 字段

**可能原因**:
- 后端 API 没有返回 `fileName` 字段
- 数据库中存储的文档没有文件名

**解决方案**:
- 使用 `title` 作为文件名
- 或从 `docId` 获取文件信息

#### 场景 C: `fileName` 没有扩展名

```json
{
  "docId": "e52dd059db8f7998",
  "fileName": "IM 工业应用 789",  // ← 没有扩展名
  "title": "IM 工业应用 789",
  "fileSize": 40379,
  "category": "file",
  "allKeys": ["docId", "title", "category", "tags", "createdAt", "fileName", "fileSize"]
}
```

**结论**: 文件名中没有扩展名

**可能原因**:
- 后端 API 返回的文件名不包含扩展名
- 扩展名存储在其他字段中

**解决方案**:
- 从 `title` 中提取扩展名
- 或从 API 响应中获取扩展名

## 可能的修复方案

### 方案 1: 使用 `title` 作为 fallback

```typescript
const openFilePreview = useCallback(async (item: DisplayItem) => {
    // 使用 fileName 或 title
    const fileName = item.fileName || item.title;
    const ext = getExtension(fileName);
    
    debugLog('[KB] File name resolution:', JSON.stringify({
        fileName: item.fileName,
        title: item.title,
        resolvedFileName: fileName,
        ext: ext,
    }));
    
    // ... 继续处理
}, [...]);
```

### 方案 2: 从 API 获取文件信息

如果 `fileName` 为空，调用 API 获取完整的文件信息：

```typescript
const openFilePreview = useCallback(async (item: DisplayItem) => {
    let fileName = item.fileName || item.title;
    let fileSize = item.fileSize;
    
    // 如果 fileName 为空，从 API 获取
    if (!fileName || !getExtension(fileName)) {
        debugLog('[KB] fileName missing or no extension, fetching from API');
        try {
            const doc = await getKBDoc(serverUrl, item.docId, teamId);
            fileName = doc.fileName || doc.title;
            fileSize = doc.fileSize;
        } catch (err) {
            debugLog('[KB] Failed to fetch doc details:', String(err));
        }
    }
    
    const ext = getExtension(fileName);
    // ... 继续处理
}, [...]);
```

### 方案 3: 强制从 title 提取扩展名

```typescript
const openFilePreview = useCallback(async (item: DisplayItem) => {
    let fileName = item.fileName || item.title;
    let ext = getExtension(fileName);
    
    // 如果扩展名为空，尝试从 title 提取
    if (!ext && item.title) {
        ext = getExtension(item.title);
        if (ext) {
            fileName = `${fileName}.${ext}`;
            debugLog('[KB] Extracted extension from title:', JSON.stringify({
                originalFileName: item.fileName,
                title: item.title,
                resolvedFileName: fileName,
                ext: ext,
            }));
        }
    }
    
    // ... 继续处理
}, [...]);
```

## 相关文件

### 修改的文件

1. ✅ `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 添加调试日志

### 相关文件

- `app/screens/home/apps/workbench_api.ts` - KBDoc 类型定义
- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 统一文件查看器

## 技术细节

### `getExtension` 函数实现

```typescript
function getExtension(fileName?: string): string {
    if (!fileName) return '';
    const idx = fileName.lastIndexOf('.');
    if (idx < 0 || idx === fileName.length - 1) return '';
    return fileName.slice(idx + 1).toLowerCase();
}
```

**测试用例**:
```typescript
getExtension('test.docx');  // "docx" ✅
getExtension('test.DOCX');  // "docx" ✅
getExtension('test');       // "" ❌
getExtension('');           // "" ❌
getExtension(undefined);    // "" ❌
```

### DisplayItem 转换逻辑

```typescript
// 从 KBDoc 转换为 DisplayItem
const displayItems = useMemo<DisplayItem[]>(() => {
    return documents.map((d) => ({
        docId: d.docId,
        title: d.title,
        category: d.category,
        tags: d.tags,
        createdAt: d.createdAt,
        fileName: d.fileName,  // ← 从 KBDoc 复制
        fileSize: d.fileSize,
    }));
}, [documents]);
```

### KBDoc 类型定义

```typescript
export type KBDoc = {
    docId: string;
    title: string;
    content?: string;
    category: string;
    tags: string[];
    sourceUrl?: string;
    fileName?: string;  // ← 可选字段
    fileSize?: number;
    chunks?: number;
    createdAt: string;
    updatedAt: string;
};
```

## 总结

### 当前状态

- ❌ 知识库 Office 文件预览失败
- ❌ 扩展名为空
- ❌ mmFileId 为空
- ❌ 使用了错误的 fileId (docId)

### 可能的原因

1. API 返回的 `KBDoc` 对象中没有 `fileName` 字段
2. `fileName` 字段为空或 undefined
3. `fileName` 没有扩展名

### 下一步

1. 重新构建应用
2. 测试知识库文档点击
3. 查看详细日志（包括 `fileName`、`title`、`allKeys`）
4. 根据日志确定根本原因
5. 实施修复方案

---

**调查日期**: 2026-10-26  
**调查人员**: Claude Code  
**状态**: ⏳ 待验证  
**优先级**: 高  
**影响范围**: 知识库 Office 文件预览  
**严重程度**: 高（功能不可用）
