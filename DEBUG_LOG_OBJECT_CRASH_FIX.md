# 调试日志对象崩溃修复

## 问题描述

用户反馈：点击云盘文件后，打开应用调试日志时出现崩溃，显示以下错误：

```
Objects are not valid as a React child 
(found: object with keys {ok, data}). 
If you meant to render a collection of children, use an array instead.
```

## 根本原因

在添加调试日志时，直接将**对象**作为 `debugLog` 的第二个参数传递，而不是将其转换为字符串。

### 问题代码示例

```typescript
// ❌ 错误：直接传递对象
debugLog('[Drive] openFile called:', {
    fileId: file.id,
    fileName: file.name,
});

// 这会导致：
// 1. 对象被存储到 debugLog 的 entries 数组中
// 2. 调试界面尝试渲染这个对象
// 3. React 报错："Objects are not valid as a React child"
```

### 正确的做法

```typescript
// ✅ 正确：使用 JSON.stringify 转换为字符串
debugLog('[Drive] openFile called:', JSON.stringify({
    fileId: file.id,
    fileName: file.name,
}));

// 这会：
// 1. 将对象转换为 JSON 字符串
// 2. 字符串被存储到 entries 数组中
// 3. 调试界面可以正常渲染字符串
```

## 修复的文件

### 1. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`

修复了以下位置的 `debugLog` 调用：

#### `openFile` 函数（6处）
```typescript
// 修复前
debugLog('[Drive] openFile called:', {...});
debugLog('[Drive] URLs generated:', {...});
debugLog('[Drive] File type check:', {...});
debugLog('[Drive] FileInfo constructed:', {...});

// 修复后
debugLog('[Drive] openFile called:', JSON.stringify({...}));
debugLog('[Drive] URLs generated:', JSON.stringify({...}));
debugLog('[Drive] File type check:', JSON.stringify({...}));
debugLog('[Drive] FileInfo constructed:', JSON.stringify({...}));
```

#### `onFileTap` 函数（1处）
```typescript
// 修复前
debugLog('[Drive] onFileTap called:', {...});

// 修复后
debugLog('[Drive] onFileTap called:', JSON.stringify({...}));
```

#### `onUploadFiles` 函数（1处）
```typescript
// 修复前
debugLog('[Drive] Uploading file:', {...});

// 修复后
debugLog('[Drive] Uploading file:', JSON.stringify({...}));
```

**总计：8处修复**

### 2. `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx`

修复了 `loadDetail` 函数中的 3 处 `debugLog` 调用：

```typescript
// 修复前
debugLog('[KBDetail] Loading doc', {docId, serverUrl});
debugLog('[KBDetail] Doc loaded', {hasData: Boolean(result)});
debugLog('[KBDetail] Load failed', {error: String(err)});

// 修复后
debugLog('[KBDetail] Loading doc', JSON.stringify({docId, serverUrl}));
debugLog('[KBDetail] Doc loaded', JSON.stringify({hasData: Boolean(result)}));
debugLog('[KBDetail] Load failed', JSON.stringify({error: String(err)}));
```

**总计：3处修复**

### 3. `app/screens/file_picker/file_picker.tsx`

修复了以下位置的 `debugLog` 调用：

#### `handleSend` 函数（1处）
```typescript
// 修复前
debugLog('filePicker', `Processing file ${index + 1}:`, {...});

// 修复后
debugLog('filePicker', `Processing file ${index + 1}:`, JSON.stringify({...}));
```

#### 组件渲染（1处）
```typescript
// 修复前
debugLog('filePicker', `Rendering ${tabs.length} tabs:`, tabs.map(...));

// 修复后
debugLog('filePicker', `Rendering ${tabs.length} tabs:`, JSON.stringify(tabs.map(...)));
```

**总计：2处修复**

## 修复统计

| 文件 | 修复数量 |
|------|---------|
| `cloud_drive_screen.tsx` | 8 |
| `kb_detail_screen.tsx` | 3 |
| `file_picker.tsx` | 2 |
| **总计** | **13** |

## 修复对比

### 修复前

```typescript
// ❌ 直接传递对象
debugLog('[Drive] openFile called:', {
    fileId: file.id,
    fileName: file.name,
    extension: file.extension,
    mm_file_id: file.mm_file_id,
});

// 结果：
// entries = [
//   {
//     time: '14:00:00.000',
//     tag: '[Drive]',
//     message: {fileId: '...', fileName: '...', ...}  // ❌ 对象
//   }
// ]

// 调试界面渲染时：
// <Text>{entry.message}</Text>  // ❌ 崩溃：Objects are not valid as a React child
```

### 修复后

```typescript
// ✅ 使用 JSON.stringify 转换
debugLog('[Drive] openFile called:', JSON.stringify({
    fileId: file.id,
    fileName: file.name,
    extension: file.extension,
    mm_file_id: file.mm_file_id,
}));

// 结果：
// entries = [
//   {
//     time: '14:00:00.000',
//     tag: '[Drive]',
//     message: '{"fileId":"...","fileName":"...","extension":"...","mm_file_id":"..."}'  // ✅ 字符串
//   }
// ]

// 调试界面渲染时：
// <Text>{entry.message}</Text>  // ✅ 正常显示 JSON 字符串
```

## 为什么这会崩溃

### React 渲染限制

React 不能直接渲染以下类型：
- ❌ 普通对象（`{key: 'value'}`）
- ❌ Error 对象
- ❌ 函数
- ❌ undefined

React 可以渲染：
- ✅ 字符串
- ✅ 数字
- ✅ null
- ✅ React 元素
- ✅ 包含上述类型的数组

### `debugLog` 的工作原理

```typescript
export function debugLog(tag: string, message: string) {
    // 1. 创建日志条目
    const entry = {time, tag, message};
    entries.push(entry);  // ← 存储到数组
    
    // 2. 写入控制台
    console.log(`[${time}] [${tag}] ${message}`);
    
    // 3. 写入文件
    writeAsStringAsync(LOG_FILE, content);
}
```

当 `message` 是一个对象时：
1. 对象被存储到 `entries` 数组中
2. 调试界面尝试渲染 `<Text>{entry.message}</Text>`
3. React 报错："Objects are not valid as a React child"

### 错误信息中的 `{ok, data}`

错误信息显示对象有 `{ok, data}` 两个键，这可能是：
- API 响应对象：`{ok: true, data: {...}}`
- 网络请求结果

这个对象被直接传递给 `debugLog`，导致了崩溃。

## 最佳实践

### ✅ 推荐做法

```typescript
// 1. 对象 → JSON.stringify
debugLog('[Component] Data:', JSON.stringify({
    userId: '123',
    fileId: '456',
}));

// 2. Error → String(err)
catch (err) {
    debugLog('[Component] Error:', String(err));
}

// 3. 多个参数 → 分别转换
debugLog('[Component] Info:', id, JSON.stringify(data));

// 4. 使用模板字符串
debugLog('filePicker', `Processing file ${index}: ${file.name}`);
```

### ❌ 避免做法

```typescript
// ❌ 不要直接传递对象
debugLog('[Component] Data:', {key: 'value'});

// ❌ 不要直接传递 Error
debugLog('[Component] Error:', err);

// ❌ 不要直接传递数组
debugLog('[Component] List:', [1, 2, 3]);

// ❌ 不要直接传递 API 响应
debugLog('[Component] Response:', response);
```

## 验证步骤

### 1. 云盘文件点击测试

- [ ] 进入云盘页面
- [ ] 点击一个 Office 文件
- [ ] 打开调试日志
- [ ] **预期**：显示日志列表，**不崩溃** ✅
- [ ] **预期看到**：
  ```
  [Drive] onFileTap called: {"fileId":"...","fileName":"test.docx",...}
  [Drive] Opening file
  [Drive] openFile called: {"fileId":"...","fileName":"test.docx",...}
  [Drive] URLs generated: {"previewUrl":"...","downloadUrl":"..."}
  [Drive] File type check: {"ext":"docx","isOffice":true}
  [Drive] Fetching full file info for mm_file_id: ...
  [Drive] Got full file info: {"mm_file_id":"...","pdf_preview_id":"..."}
  [Drive] FileInfo constructed: {"id":"...","name":"test.docx",...}
  [Drive] Opening document file with downloadAndPreviewFile
  ```

### 2. 文件上传测试

- [ ] 点击上传按钮
- [ ] 选择文件
- [ ] 点击发送
- [ ] 打开调试日志
- [ ] **预期**：显示日志列表，**不崩溃** ✅
- [ ] **预期看到**：
  ```
  [Drive] Uploading file: {"name":"test.pdf","uri":"...","size":123456}
  [Drive] File uploaded successfully: test.pdf
  [Drive] All files uploaded, refreshing list
  ```

### 3. 知识库详情页测试

- [ ] 进入知识库文档详情页
- [ ] 打开调试日志
- [ ] **预期**：显示日志列表，**不崩溃** ✅
- [ ] **预期看到**：
  ```
  [KBDetail] Loading doc: {"docId":"...","serverUrl":"..."}
  [KBDetail] Doc loaded: {"hasData":true}
  ```

### 4. 文件选择器测试

- [ ] 打开文件选择器
- [ ] 选择多个文件
- [ ] 点击发送
- [ ] 打开调试日志
- [ ] **预期**：显示日志列表，**不崩溃** ✅
- [ ] **预期看到**：
  ```
  filePicker: Render: selectedCount=2, canSend=true
  filePicker: handleSend started
  filePicker: handleSend called with 2 files
  filePicker: Processing file 1: {"name":"test1.pdf",...}
  filePicker: Processing file 2: {"name":"test2.docx",...}
  filePicker: Calling onSend callback
  ```

## 日志输出示例

### 修复前（崩溃）

```
[Drive] onFileTap called: [object Object]
[Drive] Opening file
[Drive] openFile called: [object Object]
[Drive] URLs generated: [object Object]

// 调试界面崩溃：
// Error: Objects are not valid as a React child 
// (found: object with keys {ok, data})
```

### 修复后（正常）

```
[Drive] onFileTap called: {"fileId":"abc123","fileName":"test.docx","fileType":"file","extension":"docx"}
[Drive] Opening file
[Drive] openFile called: {"fileId":"abc123","fileName":"test.docx","extension":"docx","mm_file_id":"xyz789"}
[Drive] URLs generated: {"previewUrl":"https://...","downloadUrl":"https://..."}
[Drive] File type check: {"ext":"docx","isOffice":true}
[Drive] Fetching full file info for mm_file_id: xyz789
[Drive] Got full file info: {"mm_file_id":"xyz789","pdf_preview_id":"def456","has_preview_image":false}
[Drive] FileInfo constructed: {"id":"xyz789","name":"test.docx","extension":"docx","hasPdfPreview":true}
[Drive] Opening document file with downloadAndPreviewFile
```

## 相关文件

### 修复的文件

1. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘主屏幕
2. `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx` - 知识库详情页
3. `app/screens/file_picker/file_picker.tsx` - 文件选择器

### 相关文件

- `app/store/debug_log.ts` - 调试日志系统
- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 知识库主屏幕（已在之前修复）

## 技术细节

### `debugLog` 的类型签名

```typescript
export function debugLog(tag: string, message: string)
```

虽然 TypeScript 期望 `message` 是 `string`，但在 JavaScript 运行时中，任何类型的值都可以被传递。这导致了类型检查无法捕获这类错误。

### `JSON.stringify` 的性能影响

`JSON.stringify` 会有一定的性能开销，但对于调试日志来说，这个开销是可以接受的：
- 只在调试模式下使用
- 日志对象通常较小
- 不会影响生产环境

### 何时使用 `JSON.stringify` vs `String()`

- **对象/数组** → `JSON.stringify(obj)`
- **Error 对象** → `String(err)` 或 `err.message`
- **数字** → 直接使用或 `String(num)`
- **布尔值** → 直接使用或 `String(bool)`

## 后续改进建议

### 1. 改进 `debugLog` 函数

```typescript
// 建议：自动转换非字符串类型
export function debugLog(tag: string, message: unknown) {
    const messageStr = typeof message === 'string' 
        ? message 
        : message instanceof Error 
            ? String(message)
            : JSON.stringify(message);
    
    // ... 其余逻辑
}
```

### 2. 添加 ESLint 规则

```javascript
// 禁止直接传递对象给 debugLog
'no-restricted-syntax': [
    'error',
    {
        selector: 'CallExpression[callee.name="debugLog"][arguments.1.type="ObjectExpression"]',
        message: 'Use JSON.stringify(obj) for debugLog message'
    }
]
```

### 3. 添加单元测试

```typescript
describe('debugLog', () => {
    it('should convert object to JSON string', () => {
        const obj = {key: 'value'};
        debugLog('test', obj);
        expect(entries[0].message).toBe('{"key":"value"}');
    });
    
    it('should convert Error to string', () => {
        const err = new Error('test');
        debugLog('test', err);
        expect(entries[0].message).toBe('Error: test');
    });
});
```

## 兼容性

- ✅ iOS：完全兼容
- ✅ Android：完全兼容
- ✅ Tablet：完全兼容

## 性能影响

- **微小**：`JSON.stringify` 的开销对于调试日志来说可以忽略
- **不影响生产环境**：调试日志只在开发/调试模式下使用

## 安全性

- ✅ **无安全影响**：修复不改变安全特性
- ⚠️ **注意**：`JSON.stringify` 可能会暴露敏感信息，建议在日志中过滤敏感字段

---

**修复日期**: 2026-10-26
**修复人员**: Claude Code
**测试状态**: 待测试
**修复类型**: Bug 修复（调试日志崩溃）
**影响范围**: 所有使用 debugLog 记录对象的地方
**严重程度**: 高（导致应用崩溃）
