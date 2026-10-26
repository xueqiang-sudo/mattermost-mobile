# 调试日志崩溃修复

## 问题描述

用户反馈：在云盘或知识库中点击文件预览，然后返回后，点击"调试日志"按钮时应用崩溃，显示以下错误：

```
Objects are not valid as a React child (found: [object Error]).
If you meant to render a collection of children, use an array instead.
```

## 根本原因

### 问题分析

1. **`debugLog` 函数的签名**：
   ```typescript
   export function debugLog(tag: string, message: string)
   ```
   - 期望 `message` 参数是 `string` 类型

2. **错误的调用方式**：
   ```typescript
   // ❌ 错误：直接传递 Error 对象
   debugLog('[KB] Preview error:', error);
   debugLog('[KB] getKBFileInfo failed', err);
   
   // ❌ 错误：直接传递对象
   debugLog('[KB] Got full file info', {
       mm_file_id: mmFileId,
       pdf_preview_id: fullFileInfo.pdf_preview_id,
   });
   ```

3. **崩溃原因**：
   - Error 对象和复杂对象被存储到 `entries` 数组中
   - 调试界面尝试渲染这些对象时，React 无法处理
   - React 报错："Objects are not valid as a React child"

### 受影响的文件

1. `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 7处
2. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 3处
3. `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx` - 3处

## 修复方案

### 修复原则

将所有非字符串类型的参数转换为字符串：

1. **Error 对象** → 使用 `String(err)`
2. **复杂对象** → 使用 `JSON.stringify(obj)`

### 修复的代码

#### 1. `knowledge_base_screen.tsx`

```typescript
// ✅ 修复前：直接记录 Error 对象
} catch (err) {
    debugLog('[KB] getKBFileInfo failed', err);
    debugLog('[KB] Init error:', err);
    debugLog('[KB] loadDocuments error:', err);
    debugLog('[KB] Preview error:', error);
}

// ✅ 修复后：转换为字符串
} catch (err) {
    debugLog('[KB] getKBFileInfo failed', String(err));
    debugLog('[KB] Init error:', String(err));
    debugLog('[KB] loadDocuments error:', String(err));
    debugLog('[KB] Preview error:', String(error));
}

// ✅ 修复前：直接记录对象
debugLog('[KB] Got full file info', {
    mm_file_id: mmFileId,
    pdf_preview_id: fullFileInfo.pdf_preview_id,
    has_preview_image: fullFileInfo.has_preview_image,
});

// ✅ 修复后：使用 JSON.stringify
debugLog('[KB] Got full file info', JSON.stringify({
    mm_file_id: mmFileId,
    pdf_preview_id: fullFileInfo.pdf_preview_id,
    has_preview_image: fullFileInfo.has_preview_image,
}));

// ✅ 修复前：记录 error 状态
debugLog('[KB] Rendering error state (no teamId):', error);
debugLog('[KB] Rendering main content, teamId:', teamId, 'loading:', loading, 'error:', error);

// ✅ 修复后：转换为字符串
debugLog('[KB] Rendering error state (no teamId):', String(error));
debugLog('[KB] Rendering main content, teamId:', teamId, 'loading:', loading, 'error:', String(error));
```

#### 2. `cloud_drive_screen.tsx`

```typescript
// ✅ 修复前：直接记录 Error 对象
} catch (err) {
    debugLog('[Drive] getFileInfo failed, falling back to manual construction', err);
    debugLog('[Drive] Open file error:', err);
}

// ✅ 修复后：转换为字符串
} catch (err) {
    debugLog('[Drive] getFileInfo failed, falling back to manual construction', String(err));
    debugLog('[Drive] Open file error:', String(err));
}

// ✅ 修复前：直接记录对象
debugLog('[Drive] Got full file info', {
    mm_file_id: file.mm_file_id,
    pdf_preview_id: fullFileInfo.pdf_preview_id,
    has_preview_image: fullFileInfo.has_preview_image,
});

// ✅ 修复后：使用 JSON.stringify
debugLog('[Drive] Got full file info', JSON.stringify({
    mm_file_id: file.mm_file_id,
    pdf_preview_id: fullFileInfo.pdf_preview_id,
    has_preview_image: fullFileInfo.has_preview_image,
}));
```

#### 3. `kb_detail_screen.tsx`

```typescript
// ✅ 修复前：直接记录 Error 对象
} catch (err) {
    debugLog('[KBDetail] getKBFileInfo failed', {error: String(err)});
    debugLog('[KBDetail] Download error:', err);
}

// ✅ 修复后：转换为字符串
} catch (err) {
    debugLog('[KBDetail] getKBFileInfo failed', String(err));
    debugLog('[KBDetail] Download error:', String(err));
}

// ✅ 修复前：直接记录对象
debugLog('[KBDetail] Got full file info', {
    mm_file_id: mmFileId,
    pdf_preview_id: fullFileInfo.pdf_preview_id,
});

// ✅ 修复后：使用 JSON.stringify
debugLog('[KBDetail] Got full file info', JSON.stringify({
    mm_file_id: mmFileId,
    pdf_preview_id: fullFileInfo.pdf_preview_id,
}));
```

## 修复统计

| 文件 | Error 对象修复 | 对象修复 | 总计 |
|------|---------------|---------|------|
| `knowledge_base_screen.tsx` | 6 | 1 | 7 |
| `cloud_drive_screen.tsx` | 2 | 1 | 3 |
| `kb_detail_screen.tsx` | 2 | 1 | 3 |
| **总计** | **10** | **3** | **13** |

## 修复对比

### 修复前

```typescript
// ❌ 问题代码
try {
    const info = await getKBFileInfo(serverUrl, item.docId, tid);
    debugLog('[KB] Got file info:', info); // ❌ 直接记录对象
} catch (err) {
    debugLog('[KB] Error:', err); // ❌ 直接记录 Error
}
```

### 修复后

```typescript
// ✅ 修复后的代码
try {
    const info = await getKBFileInfo(serverUrl, item.docId, tid);
    debugLog('[KB] Got file info:', JSON.stringify(info)); // ✅ 使用 JSON.stringify
} catch (err) {
    debugLog('[KB] Error:', String(err)); // ✅ 使用 String()
}
```

## 为什么这个修复有效

### `debugLog` 的工作原理

```typescript
export function debugLog(tag: string, message: string) {
    // 1. 创建日志条目
    const entry = {time, tag, message};
    entries.push(entry); // ← 存储到数组
    
    // 2. 写入控制台
    console.log(`[${time}] [${tag}] ${message}`);
    
    // 3. 写入文件
    writeAsStringAsync(LOG_FILE, content);
}
```

### 问题所在

```typescript
// ❌ 错误调用
debugLog('[KB] Error:', errorObject);
// entries = [{time: '...', tag: '[KB]', message: Error}]
//                                        ↑ Error 对象

// 调试界面渲染时
<Text>{entry.message}</Text> // ❌ React 无法渲染 Error 对象
```

### 修复后

```typescript
// ✅ 正确调用
debugLog('[KB] Error:', String(errorObject));
// entries = [{time: '...', tag: '[KB]', message: "Error: xxx"}]
//                                        ↑ 字符串

// 调试界面渲染时
<Text>{entry.message}</Text> // ✅ React 可以渲染字符串
```

## 验证步骤

### 1. 基本功能测试

- [ ] 进入知识库
- [ ] 点击一个文件预览
- [ ] 返回到列表
- [ ] 点击"调试日志"按钮
- [ ] **预期**：显示日志列表，**不崩溃**

### 2. 错误场景测试

- [ ] 关闭网络连接
- [ ] 点击知识库文件
- [ ] 应该显示错误提示
- [ ] 返回后点击"调试日志"
- [ ] **预期**：显示错误日志，**不崩溃**

### 3. 日志内容检查

- [ ] 检查日志中的错误信息是否可读
- [ ] 检查日志中的对象信息是否已转换为 JSON 字符串
- [ ] 确认日志格式正确

### 4. 云盘测试

- [ ] 进入云盘
- [ ] 点击一个文件预览
- [ ] 返回到列表
- [ ] 点击"调试日志"按钮
- [ ] **预期**：显示日志列表，**不崩溃**

## 日志输出示例

### 修复前（崩溃）

```
[11:59:01.234] [KB] Got full file info: [object Object]
[11:59:02.345] [KB] Error: [object Error]
```

调试界面尝试渲染 `[object Object]` 和 `[object Error]` 时崩溃。

### 修复后（正常）

```
[11:59:01.234] [KB] Got full file info: {"mm_file_id":"abc123","pdf_preview_id":"xyz789","has_preview_image":false}
[11:59:02.345] [KB] Error: Error: Network request failed
```

调试界面可以正常显示 JSON 字符串和错误消息字符串。

## 最佳实践

### ✅ 推荐做法

```typescript
// 1. Error 对象 → String(err)
catch (err) {
    debugLog('[Tag] Error:', String(err));
}

// 2. 复杂对象 → JSON.stringify(obj)
debugLog('[Tag] Data:', JSON.stringify({
    userId: '123',
    fileId: '456',
}));

// 3. 多个参数 → 分别转换
debugLog('[Tag] Info:', id, String(error));
```

### ❌ 避免做法

```typescript
// ❌ 不要直接传递 Error
debugLog('[Tag] Error:', err);

// ❌ 不要直接传递对象
debugLog('[Tag] Data:', {key: 'value'});

// ❌ 不要直接传递未知类型
debugLog('[Tag] Result:', unknownValue);
```

## 相关文件

### 修复的文件

1. `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx`
2. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`
3. `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx`

### 相关基础设施

- `app/store/debug_log.ts` - 调试日志系统
- 调试界面 - 显示调试日志的屏幕

## 技术细节

### `debugLog` 的类型签名

```typescript
export function debugLog(tag: string, message: string)
```

### TypeScript 类型检查的局限性

虽然 TypeScript 期望 `message` 是 `string`，但在 JavaScript 运行时中，任何类型的值都可以被传递。这导致了类型检查无法捕获这类错误。

### React 渲染的限制

React 不能直接渲染以下类型：
- Error 对象
- 普通对象（除非转换为字符串）
- 数组（除非每个元素都是可渲染的）

可以渲染的类型：
- 字符串
- 数字
- null / undefined
- React 元素
- 包含上述类型的数组

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
// 禁止直接传递 Error 或对象给 debugLog
'no-restricted-syntax': [
    'error',
    {
        selector: 'CallExpression[callee.name="debugLog"][arguments.1.type="Identifier"]',
        message: 'Use String(err) or JSON.stringify(obj) for debugLog message'
    }
]
```

### 3. 添加单元测试

```typescript
describe('debugLog', () => {
    it('should convert Error to string', () => {
        const err = new Error('test');
        debugLog('test', err);
        expect(entries[0].message).toBe('Error: test');
    });
    
    it('should convert object to JSON string', () => {
        const obj = {key: 'value'};
        debugLog('test', obj);
        expect(entries[0].message).toBe('{"key":"value"}');
    });
});
```

## 相关文档

- `FILE_PREVIEW_FIX.md` - 文件预览功能修复
- `FILE_PREVIEW_CRASH_FIX.md` - 文件预览崩溃修复
- 本文档 - 调试日志崩溃修复

---

**修复日期**: 2026-10-26
**修复人员**: Claude Code
**测试状态**: 待测试
**修复类型**: Bug 修复（调试日志崩溃）
**影响范围**: 知识库和云盘的调试日志记录
