# 调试日志崩溃问题 - 完整修复

## 问题描述

用户反馈：点击知识库文档后，再点击"调试日志"按钮，应用崩溃并显示错误：

```
Objects are not valid as a React child (found: object with keys {ok, data})
```

## 根本原因

多处代码中直接将对象（如 API 响应对象、Error 对象、对象字面量）传递给 `debugLog` 函数，而不是先转换为字符串。当调试日志屏幕尝试在 `<Text>` 组件中渲染这些对象时，React 抛出错误。

## 修复的文件（共 11 个文件）

### 1. `app/screens/unified_file_viewer/unified_file_viewer.tsx` ✅

**修复位置**：6 处

```typescript
// 第 125, 172, 382 行 - Error 对象
debugLog('Failed to save pdf_preview_id to database:', String(dbError));

// 第 392 行 - Error 对象
debugLog('Failed to fetch file info from server:', String(error));

// 第 445, 455 行 - Error 对象
debugLog('Open with error:', String(error));
```

### 2. `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` ✅

**修复位置**：1 处

```typescript
// 第 713 行 - API 响应对象
debugLog('[KB] Got response:', JSON.stringify(resp));
```

**新增调试日志**：
```typescript
// 第 877-884 行
debugLog('[KB] FileInfo constructed:', JSON.stringify({
    id: fileInfo.id,
    name: fileInfo.name,
    extension: fileInfo.extension,
    pdf_preview_id: fileInfo.pdf_preview_id,
    has_preview_image: fileInfo.has_preview_image,
    usingFullFileInfo: Boolean(fullFileInfo),
}));
```

### 3. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` ✅

**新增调试日志**：
```typescript
// 第 562-569 行
debugLog('[Drive] FileInfo constructed:', JSON.stringify({
    id: fileInfo.id,
    name: fileInfo.name,
    extension: fileInfo.extension,
    pdf_preview_id: fileInfo.pdf_preview_id,
    has_preview_image: fileInfo.has_preview_image,
    hasPdfPreview: hasPdfPreview(fileInfo),
    usingFullFileInfo: Boolean(fullFileInfo),
}));
```

### 4. `app/screens/home/apps/erp/warehouse_inout_screen.tsx` ✅

**修复位置**：2 处

```typescript
// 第 462 行 - 上传响应对象
debugLog('UPLOAD', '上传响应:', JSON.stringify(response));

// 第 472 行 - 上传错误
debugLog('UPLOAD', '上传失败:', String(uploadError));
```

### 5. `app/screens/home/apps/knowledge_base/kb_add_screen.tsx` ✅

**修复位置**：1 处

```typescript
// 第 79 行 - 文件选择对象
debugLog('[KBAdd] File picked', JSON.stringify({name: result[0].name, size: result[0].size}));
```

### 6. `app/screens/home/apps/notebook/note_detail_screen.tsx` ✅

**修复位置**：3 处

```typescript
// 第 57 行 - 加载笔记
debugLog('[NoteDetail] Loading note', JSON.stringify({noteId, serverUrl}));

// 第 66 行 - 加载状态
debugLog('[NoteDetail] Note loaded', JSON.stringify({hasData: Boolean(result.data)}));

// 第 68 行 - 加载失败
debugLog('[NoteDetail] Load failed', String(err));
```

### 7. `app/screens/home/apps/erp/scan_utils.ts` ✅

**修复位置**：1 处

```typescript
// 第 55 行 - 数组
debugLog('SCAN_UTILS', `Tab格式分割字段数: ${parts.length}`, JSON.stringify(parts));
```

### 8. `app/screens/home/apps/apps.tsx` ✅

**新增调试日志**：
```typescript
// 第 228-232 行
debugLog('[Apps] Navigating to knowledge base', JSON.stringify({
    kb_write: dashboardAccess?.kb_write,
    kbWrite: dashboardAccess?.kb_write === true,
}));
```

### 9. `app/screens/home/apps/notebook/note_add_screen.tsx` ✅

**修复位置**：2 处

```typescript
// 第 60 行 - 保存笔记
debugLog('[NoteAdd] Saving note', JSON.stringify({teamId, scope, serverUrl}));

// 第 76 行 - 保存失败
debugLog('[NoteAdd] Save failed', String(err));
```

### 10. `app/screens/home/apps/knowledge_base/kb_edit_screen.tsx` ✅

**修复位置**：2 处

```typescript
// 第 64-68 行 - 保存文档
debugLog('[KBEdit] Saving document', JSON.stringify({
    docId: doc.docId,
    titleLength: title.trim().length,
    contentLength: content.trim().length,
}));

// 第 87 行 - 保存失败
debugLog('[KBEdit] Save failed', String(err));
```

### 11. `app/screens/file_picker/context/file_picker_context.tsx` ✅

**修复位置**：3 处

```typescript
// 第 46-52 行 - ADD_FILE
debugLog('FilePickerContext', `ADD_FILE: ${action.file.name || 'unnamed'}`, JSON.stringify({
    fileId: action.file.id,
    clientId: action.file.clientId,
    uri: action.file.uri,
    currentCount: state.selectedFiles.size,
    maxSelection: state.maxSelection,
}));

// 第 66 行 - ADD_FILE success
debugLog('FilePickerContext', `ADD_FILE success: new count = ${newMap.size}`, JSON.stringify({mapKey}));

// 第 70-72 行 - REMOVE_FILE
debugLog('FilePickerContext', `REMOVE_FILE: ${action.fileId}`, JSON.stringify({
    currentCount: state.selectedFiles.size,
}));
```

## 修复统计

| 文件 | 修复数量 | 类型 |
|------|---------|------|
| unified_file_viewer.tsx | 6 | Error 对象 |
| knowledge_base_screen.tsx | 1 | API 响应对象 |
| cloud_drive_screen.tsx | 0 (新增日志) | - |
| warehouse_inout_screen.tsx | 2 | 响应对象 + 错误 |
| kb_add_screen.tsx | 1 | 文件对象 |
| note_detail_screen.tsx | 3 | 对象 + 状态 + 错误 |
| scan_utils.ts | 1 | 数组 |
| apps.tsx | 0 (新增日志) | - |
| note_add_screen.tsx | 2 | 对象 + 错误 |
| kb_edit_screen.tsx | 2 | 对象 + 错误 |
| file_picker_context.tsx | 3 | 对象字面量 |
| **总计** | **21** | - |

## 修复规则

### ✅ 正确做法

```typescript
// 1. Error 对象使用 String()
try {
    // ...
} catch (error) {
    debugLog('Error:', String(error));  // ✅
}

// 2. 对象使用 JSON.stringify()
const response = await apiCall();
debugLog('Response:', JSON.stringify(response));  // ✅

// 3. 数组使用 JSON.stringify()
const items = [1, 2, 3];
debugLog('Items:', JSON.stringify(items));  // ✅

// 4. 对象字面量使用 JSON.stringify()
debugLog('State:', JSON.stringify({count: 10, status: 'active'}));  // ✅

// 5. 基本类型可以直接传递
debugLog('User ID:', userId);  // ✅ 字符串
debugLog('Count:', count);  // ✅ 数字
debugLog('Is admin:', isAdmin);  // ✅ 布尔值
```

### ❌ 错误做法

```typescript
// 1. 直接传递 Error 对象
debugLog('Error:', error);  // ❌

// 2. 直接传递对象
debugLog('Response:', response);  // ❌

// 3. 直接传递数组
debugLog('Items:', items);  // ❌

// 4. 直接传递对象字面量
debugLog('State:', {count: 10});  // ❌
```

## 验证步骤

### 1. 重新构建应用

```bash
# iOS
cd ios && pod install
npx react-native run-ios

# Android
npx react-native run-android
```

### 2. 测试知识库功能

- [ ] 进入知识库页面
- [ ] 点击一个文档
- [ ] 等待文件加载
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

### 3. 测试云盘功能

- [ ] 进入云盘页面
- [ ] 点击一个文档
- [ ] 等待文件加载
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

### 4. 测试笔记功能

- [ ] 进入记事本页面
- [ ] 添加/编辑笔记
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

### 5. 测试出库功能

- [ ] 进入出库页面
- [ ] 扫描条码
- [ ] 上传数据
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

### 6. 测试文件选择器

- [ ] 在任何可以上传文件的地方
- [ ] 打开文件选择器
- [ ] 选择文件
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

## 调试日志示例

### 修复前（崩溃）

```
[KB] Got response: {ok: true, data: {...}}
                    ^^^^^^^^^^^^^^^^^^^^^^^^
                    React 无法渲染这个对象
```

### 修复后（正常）

```
[KB] Got response: {"ok":true,"data":{"documents":[...]}}
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                    这是一个 JSON 字符串，可以安全渲染
```

## 技术细节

### 为什么 React 不能渲染对象？

React 的 `<Text>` 组件只能渲染：
- ✅ 字符串
- ✅ 数字
- ✅ 布尔值（不推荐）
- ✅ React 元素
- ✅ 数组（包含上述类型）

当尝试渲染普通对象（如 `{ok: true, data: {...}}`）或 Error 对象时，React 抛出错误：

```
Objects are not valid as a React child (found: [object Object])
```

### `String()` vs `JSON.stringify()`

#### `String(value)`

**适用场景**：Error 对象、基本类型

**示例**：
```typescript
const err = new Error('Network error');
String(err);  // "Error: Network error"

const num = 42;
String(num);  // "42"
```

#### `JSON.stringify(value)`

**适用场景**：对象、数组

**示例**：
```typescript
const response = {ok: true, data: [1, 2, 3]};
JSON.stringify(response);  // '{"ok":true,"data":[1,2,3]}'

const items = ['a', 'b', 'c'];
JSON.stringify(items);  // '["a","b","c"]'
```

## 相关文件

### 调试日志系统

- `app/store/debug_log.ts` - 调试日志存储和管理
- `app/screens/debug/debug_screen.tsx` - 调试日志显示屏幕

### 文件预览系统

- `app/hooks/files.ts` - 文件下载和预览 Hook
- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 统一文件查看器
- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 知识库主屏幕
- `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx` - 知识库详情屏幕
- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘屏幕

### 笔记功能

- `app/screens/home/apps/notebook/note_detail_screen.tsx` - 笔记详情
- `app/screens/home/apps/notebook/note_add_screen.tsx` - 添加笔记

### 知识库功能

- `app/screens/home/apps/knowledge_base/kb_edit_screen.tsx` - 编辑文档
- `app/screens/home/apps/knowledge_base/kb_add_screen.tsx` - 添加文档

### ERP 功能

- `app/screens/home/apps/erp/warehouse_inout_screen.tsx` - 出入库
- `app/screens/home/apps/erp/scan_utils.ts` - 扫描工具

### 文件选择器

- `app/screens/file_picker/context/file_picker_context.tsx` - 文件选择器上下文

## 性能影响

- **无性能影响**：`JSON.stringify()` 只在调试日志调用时执行
- **内存影响小**：日志字符串会被写入文件，但大小可控
- **不影响生产环境**：调试日志只在开发/测试时使用

## 安全性

- ✅ **安全**：所有敏感信息都应该避免记录
- ⚠️ **注意**：不要记录密码、token、个人信息等
- ✅ **合规**：符合数据保护要求

## 后续改进建议

### 1. 添加 ESLint 规则

创建自定义 ESLint 规则，检测 `debugLog` 调用中直接传递对象的情况：

```javascript
// eslint-plugin-custom-rules/no-debuglog-objects.js
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow passing objects directly to debugLog',
        },
        schema: [],
    },
    create(context) {
        return {
            CallExpression(node) {
                if (node.callee.name === 'debugLog') {
                    node.arguments.slice(1).forEach(arg => {
                        if (arg.type === 'ObjectExpression' || 
                            arg.type === 'ArrayExpression' ||
                            (arg.type === 'Identifier' && arg.name === 'error')) {
                            context.report({
                                node: arg,
                                message: 'Use JSON.stringify() or String() for objects/arrays/errors in debugLog',
                            });
                        }
                    });
                }
            },
        };
    },
};
```

### 2. 添加 TypeScript 类型检查

```typescript
// app/store/debug_log.ts
export function debugLog(tag: string, message: string): void {
    // 强制 message 必须是字符串
    if (typeof message !== 'string') {
        console.warn('debugLog: message must be a string');
        return;
    }
    // ...
}
```

### 3. 自动化测试

添加测试用例，确保所有 `debugLog` 调用都使用正确的参数类型。

## 测试用例

### 测试场景 1：知识库文档预览

```
Given: 知识库中有文档
When: 用户点击文档并查看调试日志
Then:
  - 文档正常预览
  - 调试日志正常显示
  - 没有崩溃错误
```

### 测试场景 2：云盘文档预览

```
Given: 云盘中有文档
When: 用户点击文档并查看调试日志
Then:
  - 文档正常预览
  - 调试日志正常显示
  - 没有崩溃错误
```

### 测试场景 3：笔记编辑

```
Given: 用户打开记事本
When: 添加/编辑笔记并查看调试日志
Then:
  - 笔记正常保存
  - 调试日志正常显示
  - 没有崩溃错误
```

### 测试场景 4：出库扫描

```
Given: 用户打开出库页面
When: 扫描条码并上传数据
Then:
  - 数据正常上传
  - 调试日志正常显示
  - 没有崩溃错误
```

---

**修复日期**: 2026-10-26  
**修复人员**: Claude Code  
**测试状态**: 待测试  
**修复类型**: Bug 修复（调试日志崩溃问题）  
**影响范围**: 调试日志系统、知识库、云盘、ERP、笔记本、文件选择器  
**严重程度**: 高（导致应用崩溃）  
**修复文件数**: 11  
**修复行数**: 21  
**状态**: ✅ 完成  
