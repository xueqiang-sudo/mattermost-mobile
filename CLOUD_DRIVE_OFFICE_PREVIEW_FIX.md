# 云盘 Office 文件预览问题修复方案

## 问题描述

云盘点击 Office 文件后，总是显示"正在转换中"，无法预览文件内容。而 WebApp 中云盘 Office 文件是可以预览的。

## 根本原因

通过对比 WebApp 和移动端的实现，发现以下关键差异：

### 1. 缓存问题（最可能的原因）

**WebApp（成功）**:
```typescript
const url = `${Client4.getFileRoute(fileInfo.id)}/info?_t=${Date.now()}`;
const resp = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',  // ← 关键：禁用缓存
    headers: {'X-Requested-With': 'XMLHttpRequest'},
});
```

**移动端（失败）**:
```typescript
const client = NetworkManager.getClient(serverUrl);
const updatedFileInfo = await client.getFileInfo(fileId);
// ❌ 没有禁用缓存，可能一直获取到缓存的旧数据
```

### 2. 转换状态检查

**WebApp（成功）**:
```typescript
if (updatedFileInfo?.pdf_preview_id) {
    // 转换完成
}

if (updatedFileInfo?.pdf_conversion_status === 'failed') {
    // 转换失败
    console.log('Conversion failed:', updatedFileInfo?.pdf_conversion_error);
    this.stopPdfPoll();
}
```

**移动端（失败）**:
```typescript
if (updatedFileInfo.pdf_preview_id) {
    // 转换完成
}
// ❌ 没有检查 pdf_conversion_status
```

### 3. 轮询方式

**WebApp（成功）**:
```typescript
// 使用 recursive setTimeout（更可靠）
const doPoll = async () => {
    // ... 异步操作
    this.pdfPollTimer = setTimeout(doPoll, 2000);
};
```

**移动端（失败）**:
```typescript
// 使用 setInterval（可能在异步操作中出现问题）
pollingRef.current = setInterval(async () => {
    // ... 异步操作
}, 2000);
```

## 修复方案

### 方案 1：修复缓存问题（推荐）

修改 `app/screens/unified_file_viewer/unified_file_viewer.tsx` 中的轮询逻辑，添加缓存破坏参数：

```typescript
const startPolling = useCallback(async () => {
    pollingCountRef.current = 0;

    // Trigger conversion
    try {
        const client = NetworkManager.getClient(serverUrl);
        const result = await client.triggerPdfConversion(fileId);

        if (result.status === 'complete' && result.pdf_preview_id) {
            // 转换已完成
            const updatedFileInfo = await client.getFileInfo(fileId);
            // ... 显示 PDF
            return;
        }

        if (result.status === 'failed') {
            setFileState('unsupported');
            return;
        }
    } catch (error) {
        debugLog('[UnifiedFileViewer] PDF conversion trigger error:', String(error));
    }

    // 使用 recursive setTimeout 替代 setInterval
    const doPoll = async () => {
        pollingCountRef.current += 1;

        try {
            const client = NetworkManager.getClient(serverUrl);
            
            // 关键修复：添加时间戳破坏缓存
            const timestamp = Date.now();
            const updatedFileInfo = await client.getFileInfo(`${fileId}?_t=${timestamp}`);
            
            debugLog(`[UnifiedFileViewer] Poll #${pollingCountRef.current}:`, JSON.stringify({
                pdf_preview_id: updatedFileInfo?.pdf_preview_id || 'EMPTY',
                pdf_conversion_status: updatedFileInfo?.pdf_conversion_status,
                pdf_conversion_error: updatedFileInfo?.pdf_conversion_error,
            }));

            // 转换完成
            if (updatedFileInfo?.pdf_preview_id) {
                debugLog('[UnifiedFileViewer] ✓ PDF ready:', updatedFileInfo.pdf_preview_id);
                
                // Save to database
                try {
                    const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                    await operator.handleFiles({
                        files: [{...updatedFileInfo, id: fileId}],
                        prepareRecordsOnly: false,
                    });
                } catch (dbError) {
                    debugLog('Failed to save pdf_preview_id to database:', String(dbError));
                }

                const newFileInfo = {...currentFileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
                setCurrentFileInfo(newFileInfo);
                setFileState('viewable');
                downloadAndShowFile(newFileInfo);
                return;
            }

            // 检查转换失败
            if (updatedFileInfo?.pdf_conversion_status === 'failed') {
                debugLog('[UnifiedFileViewer] ✗ Conversion failed:', updatedFileInfo?.pdf_conversion_error);
                setFileState('unsupported');
                return;
            }

            // 超时
            if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
                debugLog('[UnifiedFileViewer] Poll timeout');
                setFileState('unsupported');
                return;
            }

            // 继续轮询（使用 setTimeout）
            pollingRef.current = setTimeout(doPoll, 2000);
        } catch (error) {
            debugLog(`[UnifiedFileViewer] Poll #${pollingCountRef.current} error:`, String(error));
            
            // 继续轮询，不要因为错误就停止
            if (pollingCountRef.current < MAX_POLLING_ATTEMPTS) {
                pollingRef.current = setTimeout(doPoll, 2000);
            } else {
                setFileState('unsupported');
            }
        }
    };

    // 启动第一次轮询
    pollingRef.current = setTimeout(doPoll, 2000);
}, [serverUrl, fileId, currentFileInfo, downloadAndShowFile]);
```

### 关键修改点

1. **添加时间戳破坏缓存**
   ```typescript
   const timestamp = Date.now();
   const updatedFileInfo = await client.getFileInfo(`${fileId}?_t=${timestamp}`);
   ```

2. **使用 recursive setTimeout 替代 setInterval**
   ```typescript
   // 旧代码：setInterval
   pollingRef.current = setInterval(async () => { ... }, 2000);
   
   // 新代码：recursive setTimeout
   const doPoll = async () => {
       // ...
       pollingRef.current = setTimeout(doPoll, 2000);
   };
   pollingRef.current = setTimeout(doPoll, 2000);
   ```

3. **检查转换状态**
   ```typescript
   if (updatedFileInfo?.pdf_conversion_status === 'failed') {
       debugLog('[UnifiedFileViewer] ✗ Conversion failed:', updatedFileInfo?.pdf_conversion_error);
       setFileState('unsupported');
       return;
   }
   ```

4. **添加详细的调试日志**
   ```typescript
   debugLog(`[UnifiedFileViewer] Poll #${pollingCountRef.current}:`, JSON.stringify({
       pdf_preview_id: updatedFileInfo?.pdf_preview_id || 'EMPTY',
       pdf_conversion_status: updatedFileInfo?.pdf_conversion_status,
       pdf_conversion_error: updatedFileInfo?.pdf_conversion_error,
   }));
   ```

### 需要检查的问题

**问题**：`client.getFileInfo()` 是否支持查询参数 `?_t=${timestamp}`？

**解决方案**：如果不支持，需要修改 API 调用方式：

```typescript
// 方案 1：直接在 URL 中添加参数
const response = await fetch(`${serverUrl}/api/v4/files/${fileId}/info?_t=${timestamp}`, {
    headers: {
        'Authorization': `Bearer ${token}`,
        'X-Requested-With': 'XMLHttpRequest',
    },
});

// 方案 2：修改 NetworkManager 或 Client 实现
// 在 mattermost-client/src/client4.ts 中添加 cache 参数
```

## 验证步骤

### 1. 重新构建应用

```bash
cd ios && pod install
npx react-native run-ios
```

### 2. 测试云盘文件预览

- [ ] 进入云盘页面
- [ ] 点击一个 Office 文档
- [ ] 观察屏幕显示
- [ ] 进入调试日志页面
- [ ] 查找以下日志：

```
[Drive] openFile called: {...}
[Drive] Got full file info: {...}
[UnifiedFileViewer] determineFileState called: {...}
[UnifiedFileViewer] Poll #1: {"pdf_preview_id": "", "pdf_conversion_status": "converting"}
[UnifiedFileViewer] Poll #2: {"pdf_preview_id": "", "pdf_conversion_status": "converting"}
[UnifiedFileViewer] Poll #3: {"pdf_preview_id": "abc123", "pdf_conversion_status": "complete"}
[UnifiedFileViewer] ✓ PDF ready: abc123
```

### 3. 预期结果

- ✅ 轮询日志显示每次都在获取最新数据（不是缓存）
- ✅ 能够检测到转换完成
- ✅ 能够检测到转换失败
- ✅ 最终成功显示 PDF 预览

## 相关文件

### 需要修改的文件

- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 修改轮询逻辑

### 相关文件

- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘页面
- `app/hooks/files.ts` - 文件下载和预览 Hook
- `app/utils/file/index.ts` - 文件类型判断

## 对比 WebApp 和移动端

| 特性 | WebApp | 移动端 | 状态 |
|------|--------|--------|------|
| 缓存控制 | `cache: 'no-store'` + `?_t=` | ❌ 无缓存控制 | 需要修复 |
| 转换状态检查 | ✅ 检查 `pdf_conversion_status` | ❌ 只检查 `pdf_preview_id` | 需要添加 |
| 轮询方式 | recursive `setTimeout` | `setInterval` | 需要修改 |
| 调试日志 | ✅ 详细的 console.log | ⚠️ 基本日志 | 需要增强 |

## 技术细节

### 为什么 `setInterval` 不如 recursive `setTimeout`？

**`setInterval` 的问题**：
```typescript
// 如果异步操作耗时超过间隔，会导致并发执行
setInterval(async () => {
    await longRunningOperation();  // 可能耗时 3 秒
}, 2000);  // 每 2 秒执行一次
// 结果：多个异步操作并发执行，可能导致资源竞争
```

**Recursive `setTimeout` 的优势**：
```typescript
// 确保上一次异步操作完成后才开始下一次
const doPoll = async () => {
    await longRunningOperation();  // 耗时 3 秒
    setTimeout(doPoll, 2000);  // 完成后再等待 2 秒
};
// 结果：顺序执行，不会有并发问题
```

### 缓存破坏的重要性

**问题**：HTTP 缓存可能返回旧数据
```typescript
// 第一次请求
GET /api/v4/files/abc123/info
Response: {pdf_preview_id: ""}

// 服务器转换完成
pdf_preview_id: "xyz789"

// 第二次请求（可能返回缓存）
GET /api/v4/files/abc123/info
Response: {pdf_preview_id: ""}  // ❌ 缓存的旧数据

// 使用缓存破坏
GET /api/v4/files/abc123/info?_t=1234567890
Response: {pdf_preview_id: "xyz789"}  // ✅ 最新数据
```

## 性能影响

- **缓存破坏**：每次请求都会访问服务器，增加少量网络流量
- **Recursive setTimeout**：与 setInterval 性能相同
- **详细日志**：增加少量字符串处理开销

**总体影响**：可忽略不计，只在预览 Office 文件时执行

## 安全性

- ✅ **安全**：所有操作都使用认证 token
- ✅ **无风险**：只是添加查询参数
- ✅ **合规**：符合数据保护要求

## 后续改进建议

### 1. 统一 Office 扩展名定义

当前存在三处不同的定义，建议统一：

```typescript
// app/constants/files.ts
export const OFFICE_EXTENSIONS = [
    'doc', 'docx',        // Word
    'xls', 'xlsx',        // Excel
    'ppt', 'pptx',        // PowerPoint
    'odt', 'ods', 'odp',  // LibreOffice
    'pages', 'numbers', 'keynote',  // Apple iWork
];
```

### 2. 添加重试机制

```typescript
if (updatedFileInfo?.pdf_conversion_status === 'failed') {
    // 尝试重新触发转换
    if (retryCount < 3) {
        retryCount++;
        await client.triggerPdfConversion(fileId);
        pollingRef.current = setTimeout(doPoll, 2000);
        return;
    }
    setFileState('unsupported');
}
```

### 3. 添加用户取消选项

```typescript
if (pollingCountRef.current >= 10) {
    // 显示取消按钮
    Alert.alert(
        'Converting',
        'PDF conversion is taking longer than expected. Continue waiting?',
        [
            {text: 'Cancel', onPress: () => setFileState('unsupported')},
            {text: 'Continue', onPress: () => pollingRef.current = setTimeout(doPoll, 2000)},
        ]
    );
}
```

---

**修复日期**: 2026-10-26  
**修复人员**: Claude Code  
**测试状态**: 待实施  
**修复类型**: Bug 修复（云盘 Office 文件预览失败）  
**影响范围**: 统一文件查看器  
**严重程度**: 高（功能不可用）  
**修复文件数**: 1  
**状态**: 📝 待实施  
