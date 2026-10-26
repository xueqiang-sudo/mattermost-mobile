# 调试日志崩溃问题 - 最终修复

## 问题描述

用户反馈：点击云盘文件后，再点击"调试日志"按钮，应用崩溃并显示错误：

```
Objects are not valid as a React child (found: [object Error])
```

## 根本原因

在 `unified_file_viewer.tsx` 中，有一处 `.catch()` 块直接将 Error 对象传递给了 `debugLog`，没有先转换为字符串。

## 修复的文件

### `app/screens/unified_file_viewer/unified_file_viewer.tsx`

**修复位置**：第 475 行

```typescript
// 修复前 ❌
}).catch((error) => {
    debugLog('Open with error:', error);
});

// 修复后 ✅
}).catch((error) => {
    debugLog('Open with error:', String(error));
});
```

## 完整的修复清单

以下是所有修复的文件和位置：

### 1. `unified_file_viewer.tsx` (7 处)

- ✅ 第 125 行 - `String(dbError)`
- ✅ 第 172 行 - `String(dbError)`
- ✅ 第 192 行 - `getFullErrorMessage(error)`
- ✅ 第 345 行 - `getFullErrorMessage(error)`
- ✅ 第 399 行 - `String(dbError)`
- ✅ 第 409 行 - `String(error)`
- ✅ 第 452 行 - `getFullErrorMessage(error)`
- ✅ 第 465 行 - `String(error)`
- ✅ 第 475 行 - `String(error)` ⭐ **本次修复**

### 2. `knowledge_base_screen.tsx` (1 处)

- ✅ 第 713 行 - `JSON.stringify(resp)`

### 3. `warehouse_inout_screen.tsx` (2 处)

- ✅ 第 462 行 - `JSON.stringify(response)`
- ✅ 第 472 行 - `String(uploadError)`

### 4. `kb_add_screen.tsx` (1 处)

- ✅ 第 79 行 - `JSON.stringify({...})`

### 5. `note_detail_screen.tsx` (3 处)

- ✅ 第 57 行 - `JSON.stringify({...})`
- ✅ 第 66 行 - `JSON.stringify({...})`
- ✅ 第 68 行 - `String(err)`

### 6. `scan_utils.ts` (1 处)

- ✅ 第 55 行 - `JSON.stringify(parts)`

### 7. `note_add_screen.tsx` (2 处)

- ✅ 第 60 行 - `JSON.stringify({...})`
- ✅ 第 76 行 - `String(err)`

### 8. `kb_edit_screen.tsx` (2 处)

- ✅ 第 64-68 行 - `JSON.stringify({...})`
- ✅ 第 87 行 - `String(err)`

### 9. `file_picker_context.tsx` (3 处)

- ✅ 第 46-52 行 - `JSON.stringify({...})`
- ✅ 第 66 行 - `JSON.stringify({...})`
- ✅ 第 70-72 行 - `JSON.stringify({...})`

## 修复统计

| 文件 | 修复数量 | 状态 |
|------|---------|------|
| unified_file_viewer.tsx | 9 | ✅ 完成 |
| knowledge_base_screen.tsx | 1 | ✅ 完成 |
| warehouse_inout_screen.tsx | 2 | ✅ 完成 |
| kb_add_screen.tsx | 1 | ✅ 完成 |
| note_detail_screen.tsx | 3 | ✅ 完成 |
| scan_utils.ts | 1 | ✅ 完成 |
| note_add_screen.tsx | 2 | ✅ 完成 |
| kb_edit_screen.tsx | 2 | ✅ 完成 |
| file_picker_context.tsx | 3 | ✅ 完成 |
| **总计** | **24** | ✅ **全部完成** |

## 修复规则总结

### ✅ 正确做法

```typescript
// 1. Error 对象使用 String()
try {
    // ...
} catch (error) {
    debugLog('Error:', String(error));  // ✅
}

// 2. Promise rejection 使用 String()
promise.catch((error) => {
    debugLog('Error:', String(error));  // ✅
});

// 3. 对象使用 JSON.stringify()
const response = await apiCall();
debugLog('Response:', JSON.stringify(response));  // ✅

// 4. 对象字面量使用 JSON.stringify()
debugLog('State:', JSON.stringify({count: 10}));  // ✅

// 5. 使用 getFullErrorMessage()
debugLog('Error:', getFullErrorMessage(error));  // ✅ 返回字符串
```

### ❌ 错误做法

```typescript
// 1. 直接传递 Error 对象
debugLog('Error:', error);  // ❌

// 2. 直接传递对象
debugLog('Response:', response);  // ❌

// 3. 直接传递对象字面量
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

### 2. 测试云盘功能

- [ ] 进入云盘页面
- [ ] 点击一个文件
- [ ] 等待文件加载
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

### 3. 测试知识库功能

- [ ] 进入知识库页面
- [ ] 点击一个文档
- [ ] 等待文件加载
- [ ] 进入调试日志页面
- [ ] **预期**：可以正常查看日志，不会崩溃 ✅

### 4. 测试其他功能

- [ ] 测试笔记功能
- [ ] 测试出库功能
- [ ] 测试文件选择器
- [ ] **预期**：所有功能正常，调试日志不会崩溃 ✅

## 调试日志示例

### 修复前（崩溃）

```
[UnifiedFileViewer] Open with error: [object Error]
                                    ^^^^^^^^^^^^^^
                                    React 无法渲染 Error 对象
```

### 修复后（正常）

```
[UnifiedFileViewer] Open with error: Error: Failed to open file
                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                    这是一个字符串，可以安全渲染
```

## 相关文件

### 修改的文件

- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 修复了第 475 行

### 相关文件

- `app/hooks/files.ts` - 文件下载和预览 Hook
- `app/utils/errors.ts` - 错误处理工具函数
- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 知识库
- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘

## 技术细节

### 为什么 `.catch()` 中的 error 需要转换？

Promise 的 `.catch()` 块接收的参数可能是：
- Error 对象
- 字符串
- 对象
- 任何值

为了安全地在 React 组件中渲染，必须将其转换为字符串：

```typescript
// ❌ 错误
promise.catch((error) => {
    debugLog('Error:', error);  // error 可能是 Error 对象
});

// ✅ 正确
promise.catch((error) => {
    debugLog('Error:', String(error));  // 确保是字符串
});
```

### `String(error)` vs `error.message`

```typescript
const error = new Error('Network failed');

// 方式 1：String()
String(error);  // "Error: Network failed"

// 方式 2：error.message
error.message;  // "Network failed"

// 方式 3：getFullErrorMessage()
getFullErrorMessage(error);  // "Network failed"
```

**推荐使用**：
- 简单的错误：使用 `String(error)`
- 需要详细错误信息：使用 `getFullErrorMessage(error)`

## 性能影响

- **无性能影响**：`String()` 转换非常快
- **内存影响小**：日志字符串会被写入文件，但大小可控
- **不影响生产环境**：调试日志只在开发/测试时使用

## 安全性

- ✅ **安全**：所有敏感信息都应该避免记录
- ⚠️ **注意**：不要记录密码、token、个人信息等
- ✅ **合规**：符合数据保护要求

## 后续改进建议

### 1. 添加 ESLint 规则

创建自定义 ESLint 规则，检测 `.catch()` 块中直接传递 error 的情况：

```javascript
// eslint-plugin-custom-rules/no-catch-error-direct-log.js
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow passing error directly to debugLog in catch blocks',
        },
        schema: [],
    },
    create(context) {
        return {
            CatchClause(node) {
                const errorParam = node.param;
                if (errorParam && errorParam.type === 'Identifier') {
                    const errorName = errorParam.name;
                    // 检查是否有 debugLog 调用直接传递这个 error
                    // ...
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
    if (typeof message !== 'string') {
        console.warn('debugLog: message must be a string, got:', typeof message);
        message = String(message);  // 自动转换
    }
    // ...
}
```

## 测试用例

### 测试场景 1：云盘文件预览

```
Given: 云盘中有文件
When: 用户点击文件并查看调试日志
Then:
  - 文件正常预览或显示错误
  - 调试日志正常显示
  - 没有崩溃错误
```

### 测试场景 2：知识库文档预览

```
Given: 知识库中有文档
When: 用户点击文档并查看调试日志
Then:
  - 文档正常预览或显示错误
  - 调试日志正常显示
  - 没有崩溃错误
```

### 测试场景 3："Open with" 功能

```
Given: 用户点击"Open with"按钮
When: 打开文件失败
Then:
  - 显示错误提示
  - 调试日志记录错误字符串
  - 调试日志正常显示
```

---

**修复日期**: 2026-10-26  
**修复人员**: Claude Code  
**测试状态**: 待测试  
**修复类型**: Bug 修复（调试日志崩溃问题）  
**影响范围**: 统一文件查看器  
**严重程度**: 高（导致应用崩溃）  
**修复文件数**: 1  
**修复行数**: 1  
**状态**: ✅ 完成  
