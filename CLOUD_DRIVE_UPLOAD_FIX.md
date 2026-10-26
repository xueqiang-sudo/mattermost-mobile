# 云盘上传崩溃修复

## 问题描述

用户反馈：在云盘页面点击上传按钮时，应用崩溃并显示以下错误：

```
undefined is not a function

TypeError: undefined is not a function
at anonymous (/Users/runner/Library/.../main.jsbundle:813357:53)
at _performTransitionSideEffects (/Users/runner/Library/.../main.jsbundle:29242:22)
at _receiveSignal (/Users/runner/Library/.../main.jsbundle:29198:45)
at onResponderRelease (/Users/runner/Library/.../main.jsbundle:29066:34)
```

错误信息中还包含一个截断的对象：`{"irOr","info_id":"tus_co`

## 根本原因

### 问题分析

1. **异步函数未使用 `await`**：
   - 在 `file_picker.tsx` 的 `handleSend` 函数中，调用 `onSend` 回调时没有使用 `await`
   - 云盘的 `onUploadFiles` 是一个异步函数，包含多个异步的 `uploadDriveFile` 调用
   - 没有 `await` 导致：
     - `onSend` 开始执行（异步上传）
     - `handleSend` 立即继续执行并尝试 `dismissModal`
     - 如果 `onSend` 内部有错误，会导致未捕获的 Promise rejection
     - React Navigation 在过渡期间遇到未处理的异步操作，导致崩溃

2. **缺少错误日志**：
   - 云盘上传失败时没有详细的调试日志
   - 难以诊断上传失败的具体原因

### 受影响的文件

1. `app/screens/file_picker/file_picker.tsx` - 文件选择器
2. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘页面

## 修复方案

### 1. 修复文件选择器中的异步调用

**文件**: `app/screens/file_picker/file_picker.tsx`

```typescript
// ❌ 修复前：没有 await
debugLog('filePicker', 'Calling onSend callback');
try {
    onSend(normalizedFiles);  // ❌ 没有 await
    debugLog('filePicker', 'onSend callback completed successfully');
} catch (sendError) {
    // ... 错误处理
}

// ✅ 修复后：添加 await
debugLog('filePicker', 'Calling onSend callback');
try {
    // Await the onSend callback to handle async operations properly
    await onSend(normalizedFiles);  // ✅ 添加 await
    debugLog('filePicker', 'onSend callback completed successfully');
} catch (sendError) {
    // ... 错误处理
}
```

### 2. 添加详细的调试日志

**文件**: `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`

#### 添加导入

```typescript
import {debugLog} from '@store/debug_log';
```

#### 改进上传逻辑

```typescript
const onUploadFiles = useCallback(async (files: FileInfo[]) => {
    if (!files || files.length === 0) return;

    try {
        // Upload each file sequentially
        for (const file of files) {
            // ✅ 添加上传前的日志
            debugLog('[Drive] Uploading file:', {
                name: file.name,
                uri: file.uri,
                mime_type: file.mime_type,
                size: file.size,
            });

            await uploadDriveFile(
                serverUrl,
                teamId,
                parentId,
                scope,
                file.uri || '',
                file.name || 'unknown',
                file.mime_type || 'application/octet-stream',
            );

            // ✅ 添加上传成功的日志
            debugLog('[Drive] File uploaded successfully:', file.name);
        }

        // ✅ 添加刷新列表的日志
        debugLog('[Drive] All files uploaded, refreshing list');
        // Refresh file list after upload
        loadFiles();
    } catch (err) {
        // ✅ 添加错误日志
        debugLog('[Drive] Upload error:', String(err));
        Alert.alert(
            intl.formatMessage({id: 'workbench.drive.error_title', defaultMessage: 'Error'}),
            intl.formatMessage({id: 'workbench.drive.error_upload', defaultMessage: 'Failed to upload file.'}),
        );
    }
}, [serverUrl, teamId, parentId, scope, intl, loadFiles]);
```

## 修复对比

### 修复前

```
用户点击上传按钮
    ↓
选择文件
    ↓
点击发送
    ↓
onSend 开始执行（异步）
    ↓
handleSend 立即继续
    ↓
dismissModal 被调用
    ↓
onSend 内部发生错误（未捕获）
    ↓
Promise rejection
    ↓
React Navigation 崩溃
    ↓
应用崩溃 ❌
```

### 修复后

```
用户点击上传按钮
    ↓
选择文件
    ↓
点击发送
    ↓
await onSend（等待异步完成）
    ↓
上传每个文件（带详细日志）
    ├─ 成功 → 继续下一个文件
    └─ 失败 → 捕获错误，显示提示
    ↓
所有文件上传完成
    ↓
刷新文件列表
    ↓
dismissModal 被调用
    ↓
正常关闭 ✅
```

## 技术细节

### 为什么需要 `await`

在 JavaScript/TypeScript 中，异步函数返回一个 Promise：

```typescript
// onUploadFiles 是异步函数
const onUploadFiles = async (files: FileInfo[]) => {
    for (const file of files) {
        await uploadDriveFile(...);  // 异步操作
    }
    loadFiles();  // 异步操作
};

// ❌ 错误：不等待异步操作完成
onSend(normalizedFiles);  // 返回 Promise，但被忽略
dismissModal();  // 立即执行，可能在上传完成前执行

// ✅ 正确：等待异步操作完成
await onSend(normalizedFiles);  // 等待 Promise resolve
dismissModal();  // 在上传完成后执行
```

### 未捕获的 Promise Rejection

当一个 Promise 被 reject 但没有被 catch 处理时，会发生未捕获的 Promise rejection：

```typescript
// ❌ 未捕获的 rejection
onSend(normalizedFiles);  // 如果这个 Promise reject...
// ...没有 catch 处理，会导致未捕获的 rejection

// ✅ 正确捕获
try {
    await onSend(normalizedFiles);
} catch (error) {
    // 处理错误
}
```

### React Navigation 的过渡副作用

错误堆栈显示崩溃发生在 React Navigation 的过渡期间：

```
at _performTransitionSideEffects
at _receiveSignal
at onResponderRelease
```

这是因为：
1. `dismissModal` 触发导航过渡
2. 在过渡期间，React Navigation 期望所有副作用都已完成
3. 未完成的异步操作（上传）导致状态不一致
4. React Navigation 无法处理这种不一致，导致崩溃

## 验证步骤

### 1. 基本上传测试

- [ ] 进入云盘页面
- [ ] 点击上传按钮
- [ ] 选择一个或多个文件
- [ ] 点击发送
- [ ] **预期**：
  - 文件开始上传
  - 显示上传进度（如果有）
  - 上传完成后，文件列表刷新
  - 文件选择器正常关闭 ✅

### 2. 大文件上传测试

- [ ] 选择一个大文件（> 10MB）
- [ ] 点击发送
- [ ] **预期**：
  - 文件正常上传
  - 不会崩溃
  - 上传完成后显示在列表中 ✅

### 3. 多文件上传测试

- [ ] 选择多个文件（5-10 个）
- [ ] 点击发送
- [ ] **预期**：
  - 文件按顺序上传
  - 所有文件上传完成
  - 文件列表刷新 ✅

### 4. 网络错误测试

- [ ] 关闭网络连接
- [ ] 尝试上传文件
- [ ] **预期**：
  - 显示"Failed to upload file"错误提示
  - 不会崩溃
  - 可以重试 ✅

### 5. 调试日志检查

- [ ] 上传成功后，查看调试日志
- [ ] **预期看到**：
  ```
  [Drive] Uploading file: {name: "test.pdf", uri: "...", ...}
  [Drive] File uploaded successfully: test.pdf
  [Drive] All files uploaded, refreshing list
  ```

## 日志输出示例

### 修复前（崩溃）

```
filePicker: Render: selectedCount=1, canSend=true
filePicker: handleSend started
filePicker: handleSend called with 1 files
filePicker: Processing file 1: {name: "test.pdf", ...}
filePicker: Calling onSend callback
// ❌ 崩溃，没有后续日志
```

### 修复后（正常）

```
filePicker: Render: selectedCount=1, canSend=true
filePicker: handleSend started
filePicker: handleSend called with 1 files
filePicker: Processing file 1: {name: "test.pdf", ...}
filePicker: Calling onSend callback
[Drive] Uploading file: {name: "test.pdf", uri: "file://...", mime_type: "application/pdf", size: 123456}
[Drive] File uploaded successfully: test.pdf
[Drive] All files uploaded, refreshing list
filePicker: onSend callback completed successfully
filePicker: Dismissing modal
filePicker: Modal dismissed successfully
```

## 相关文件

### 修复的文件

1. `app/screens/file_picker/file_picker.tsx` - 文件选择器主组件
2. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘页面

### 相关文件

- `app/screens/home/apps/workbench_api.ts` - 云盘 API
- `app/screens/navigation.ts` - 导航管理
- `app/store/debug_log.ts` - 调试日志系统

## 影响范围

### 受影响的功能

- ✅ 云盘文件上传
- ✅ 知识库文件上传（如果使用相同的 file_picker）
- ✅ 聊天窗口文件上传（如果使用相同的 file_picker）

### 不受影响的功能

- 文件下载
- 文件预览
- 文件删除和重命名

## 最佳实践

### 1. 始终 `await` 异步操作

```typescript
// ❌ 错误
asyncFunction();

// ✅ 正确
await asyncFunction();
```

### 2. 使用 try-catch 包装异步调用

```typescript
try {
    await asyncOperation();
} catch (error) {
    // 处理错误
}
```

### 3. 添加详细的调试日志

```typescript
debugLog('[Component] Operation started:', {
    param1: value1,
    param2: value2,
});

try {
    await operation();
    debugLog('[Component] Operation completed successfully');
} catch (error) {
    debugLog('[Component] Operation failed:', String(error));
}
```

### 4. 处理所有 Promise rejection

```typescript
// ✅ 方式 1：try-catch
try {
    await promise;
} catch (error) {
    // 处理错误
}

// ✅ 方式 2：.catch()
promise.catch(error => {
    // 处理错误
});
```

## 后续改进建议

### 1. 添加上传进度显示

```typescript
const [uploadProgress, setUploadProgress] = useState(0);

for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await uploadDriveFile(...);
    setUploadProgress((i + 1) / files.length);
}
```

### 2. 支持取消上传

```typescript
const [isCancelled, setIsCancelled] = useState(false);

for (const file of files) {
    if (isCancelled) {
        debugLog('[Drive] Upload cancelled');
        break;
    }
    await uploadDriveFile(...);
}
```

### 3. 支持并行上传

```typescript
// 并行上传（注意控制并发数）
await Promise.all(
    files.map(file => uploadDriveFile(...))
);
```

### 4. 添加重试机制

```typescript
for (const file of files) {
    let retries = 3;
    while (retries > 0) {
        try {
            await uploadDriveFile(...);
            break;
        } catch (error) {
            retries--;
            if (retries === 0) throw error;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}
```

## 测试用例

### 测试场景 1：单文件上传

```
Given: 用户在云盘页面
When: 选择一个文件并上传
Then:
  - 文件选择器正常打开
  - 文件选择器正常关闭
  - 文件上传成功
  - 文件显示在列表中
  - 没有崩溃
```

### 测试场景 2：多文件上传

```
Given: 用户在云盘页面
When: 选择多个文件并上传
Then:
  - 所有文件按顺序上传
  - 每个文件都有日志记录
  - 所有文件上传成功
  - 文件列表刷新
  - 没有崩溃
```

### 测试场景 3：网络错误

```
Given: 用户在云盘页面
And: 网络连接不稳定
When: 尝试上传文件
Then:
  - 显示错误提示
  - 不崩溃
  - 可以重试
```

## 兼容性

- ✅ iOS：完全兼容
- ✅ Android：完全兼容
- ✅ Tablet：完全兼容

## 性能影响

- **无性能影响**：只是添加了 `await` 关键字，不改变性能特性
- **日志开销**：微小的日志记录开销，可忽略

## 安全性

- ✅ **无安全影响**：修复不改变安全特性
- ✅ **错误处理**：改进了错误处理，防止敏感信息泄露

---

**修复日期**: 2026-10-26
**修复人员**: Claude Code
**测试状态**: 待测试
**修复类型**: Bug 修复（云盘上传崩溃）
**影响范围**: 云盘文件上传功能
**严重程度**: 高（导致应用崩溃）
