# 调试日志崩溃问题最终修复

## 问题描述

用户反馈：点击知识库文档后，再点调试日志出现崩溃错误：

```
Objects are not valid as a React child (found: object with keys {ok, data})
```

## 根本原因

在多个文件中，`debugLog` 函数被调用时直接传递了对象（如 API 响应对象、数组等），而不是字符串。当调试日志屏幕尝试在 `<Text>` 组件中渲染这些对象时，React 会抛出错误。

## 修复的文件

### 1. `app/screens/unified_file_viewer/unified_file_viewer.tsx`

修复了 6 处 Error 对象直接传递的问题：

```typescript
// 第 125, 172, 382 行
debugLog('Failed to save pdf_preview_id to database:', String(dbError));

// 第 392 行
debugLog('Failed to fetch file info from server:', String(error));

// 第 445, 455 行
debugLog('Open with error:', String(error));
```

### 2. `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx`

修复了 API 响应对象直接传递的问题：

```typescript
// 第 713 行
debugLog('[KB] Got response:', JSON.stringify(resp));
```

这是导致用户报告错误的主要原因。`listKBDocs` API 返回的对象包含 `{ok, data}` 键，直接传递给了 `debugLog`。

### 3. `app/screens/home/apps/erp/warehouse_inout_screen.tsx`

修复了上传相关的问题：

```typescript
// 第 462 行
debugLog('UPLOAD', '上传响应:', JSON.stringify(response));

// 第 472 行
debugLog('UPLOAD', '上传失败:', String(uploadError));
```

### 4. `app/screens/home/apps/knowledge_base/kb_add_screen.tsx`

修复了文件选择对象直接传递的问题：

```typescript
// 第 79 行
debugLog('[KBAdd] File picked', JSON.stringify({name: result[0].name, size: result[0].size}));
```

### 5. `app/screens/home/apps/notebook/note_detail_screen.tsx`

修复了状态对象直接传递的问题：

```typescript
// 第 66 行
debugLog('[NoteDetail] Note loaded', JSON.stringify({hasData: Boolean(result.data)}));
```

### 6. `app/screens/home/apps/erp/scan_utils.ts`

修复了数组直接传递的问题：

```typescript
// 第 55 行
debugLog('SCAN_UTILS', `Tab格式分割字段数: ${parts.length}`, JSON.stringify(parts));
```

## 修复规则

所有 `debugLog` 调用必须遵循以下规则：

### 1. Error 对象使用 `String()`

```typescript
try {
    // ...
} catch (error) {
    debugLog('Error message:', String(error));  // ✅ 正确
    // debugLog('Error message:', error);       // ❌ 错误
}
```

### 2. 对象使用 `JSON.stringify()`

```typescript
const response = await apiCall();
debugLog('Response:', JSON.stringify(response));  // ✅ 正确
// debugLog('Response:', response);              // ❌ 错误
```

### 3. 数组使用 `JSON.stringify()`

```typescript
const items = [1, 2, 3];
debugLog('Items:', JSON.stringify(items));  // ✅ 正确
// debugLog('Items:', items);              // ❌ 错误
```

### 4. 基本类型可以直接传递

```typescript
debugLog('User ID:', userId);           // ✅ 字符串，正确
debugLog('Count:', count);              // ✅ 数字，正确
debugLog('Is admin:', isAdmin);         // ✅ 布尔值，正确
```

## 验证步骤

### 1. 知识库文档预览测试

- [ ] 进入知识库页面
- [ ] 点击一个文档（Office 文件）
- [ ] 等待文件加载
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

### 2. 云盘文档预览测试

- [ ] 进入云盘页面
- [ ] 点击一个文档（Office 文件）
- [ ] 等待文件加载
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

### 3. 知识添加测试

- [ ] 进入知识库页面
- [ ] 点击"添加文档"按钮
- [ ] 选择文件
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

### 4. 出库扫描测试

- [ ] 进入出库页面
- [ ] 扫描条码
- [ ] 上传数据
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

## 日志输出示例

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

### ERP 功能

- `app/screens/home/apps/erp/warehouse_inout_screen.tsx` - 出入库屏幕
- `app/screens/home/apps/erp/scan_utils.ts` - 扫描工具函数

### 其他功能

- `app/screens/home/apps/knowledge_base/kb_add_screen.tsx` - 知识库添加屏幕
- `app/screens/home/apps/notebook/note_detail_screen.tsx` - 笔记详情屏幕

## 技术细节

### 为什么 React 不能渲染对象？

React 的 `<Text>` 组件只能渲染：
- 字符串
- 数字
- 布尔值（虽然不推荐）
- React 元素
- 数组（包含上述类型）

当尝试渲染普通对象（如 `{ok: true, data: {...}}`）或 Error 对象时，React 会抛出错误，因为它不知道如何将对象转换为文本。

### `String()` vs `JSON.stringify()`

#### `String(value)`

- 适用于：Error 对象、基本类型
- 输出：`"Error: Something went wrong"`
- 示例：
  ```typescript
  const err = new Error('Network error');
  String(err);  // "Error: Network error"
  ```

#### `JSON.stringify(value)`

- 适用于：对象、数组
- 输出：`'{"ok":true,"data":{...}}'`
- 示例：
  ```typescript
  const response = {ok: true, data: [1, 2, 3]};
  JSON.stringify(response);  // '{"ok":true,"data":[1,2,3]}'
  ```

### 调试日志的最佳实践

1. **始终将对象转换为字符串**
   ```typescript
   debugLog('Response:', JSON.stringify(response));
   ```

2. **使用标签前缀**
   ```typescript
   debugLog('[KB] Loading documents...');
   ```

3. **包含上下文信息**
   ```typescript
   debugLog('[KB] Loading documents for teamId:', teamId);
   ```

4. **记录关键步骤**
   ```typescript
   debugLog('[KB] API call started');
   debugLog('[KB] API call completed:', JSON.stringify(response));
   debugLog('[KB] Documents parsed:', docs.length);
   ```

## 性能影响

- **无性能影响**：`JSON.stringify()` 只在调试日志调用时执行
- **内存影响极小**：日志字符串会被写入文件，但大小可控
- **不会影响生产环境**：调试日志只在开发/测试时使用

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
                            arg.type === 'ArrayExpression') {
                            context.report({
                                node: arg,
                                message: 'Use JSON.stringify() for objects/arrays in debugLog',
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
    // 只接受字符串类型的 message
    // ...
}
```

### 3. 自动化测试

添加测试用例，确保所有 `debugLog` 调用都使用正确的参数类型。

## 测试用例

### 测试场景 1：知识库文档预览

```
Given: 知识库中有 Office 文档
When: 用户点击文档并查看调试日志
Then:
  - 文档正常预览
  - 调试日志正常显示
  - 没有崩溃错误
```

### 测试场景 2：云盘文档预览

```
Given: 云盘中有 Office 文档
When: 用户点击文档并查看调试日志
Then:
  - 文档正常预览
  - 调试日志正常显示
  - 没有崩溃错误
```

### 测试场景 3：出库扫描上传

```
Given: 用户扫描了条码
When: 上传数据并查看调试日志
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
**影响范围**: 调试日志系统、知识库、云盘、ERP、笔记本  
**严重程度**: 高（导致应用崩溃）  
**修复文件数**: 6  
**修复行数**: 9  
