# 云盘 Office 文件预览修复 - 实施方案

## 问题总结

云盘 Office 文件总是显示"正在转换中"，无法预览。通过对比 WebApp 发现**4个关键问题**：

### 1. ✅ 缓存问题（HTTP 缓存）
- **WebApp**: 使用 `cache: 'no-store'` + `?_t=timestamp`
- **移动端**: 没有禁用缓存，获取到旧数据

### 2. ✅ 转换状态检查缺失
- **WebApp**: 检查 `pdf_conversion_status === 'failed'`
- **移动端**: 只检查 `pdf_preview_id`

### 3. ✅ 轮询方式不当
- **WebApp**: 使用 recursive `setTimeout`（更可靠）
- **移动端**: 使用 `setInterval`（可能并发执行）

### 4. ⭐ **本地数据库缓存问题**（新发现）
- **WebApp**: 无本地数据库，每次都从服务器获取最新数据
- **移动端**: 有本地数据库（WatermelonDB），可能缓存了旧的 FileInfo

## 修复方案

### 修复 1: unified_file_viewer.tsx - 轮询逻辑

**文件**: `app/screens/unified_file_viewer/unified_file_viewer.tsx`

**修改内容**:

#### 1.1 修改 `startPolling` 函数（第 105-200 行）

**旧代码**（有问题）:
```typescript
const startPolling = useCallback(async () => {
    pollingCountRef.current = 0;

    // Trigger conversion
    try {
        const client = NetworkManager.getClient(serverUrl);
        const result = await client.triggerPdfConversion(fileId);
        
        if (result.status === 'complete' && result.pdf_preview_id) {
            // ...
        }
    } catch (error) {
        // ...
    }

    // ❌ 使用 setInterval，可能导致并发执行
    pollingRef.current = setInterval(async () => {
        pollingCountRef.current += 1;
        
        try {
            const client = NetworkManager.getClient(serverUrl);
            // ❌ 没有缓存破坏参数
            const updatedFileInfo = await client.getFileInfo(fileId);
            
            if (updatedFileInfo.pdf_preview_id) {
                // ...
            }
            
            // ❌ 不检查转换状态
            
            if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
                clearInterval(pollingRef.current);
                setFileState('unsupported');
            }
        } catch (error) {
            clearInterval(pollingRef.current);
            setFileState('unsupported');
        }
    }, 2000);
}, [...]);
```

**新代码**（修复后）:
```typescript
const startPolling = useCallback(async () => {
    pollingCountRef.current = 0;

    debugLog('[UnifiedFileViewer] Starting PDF conversion polling');

    // Trigger conversion
    try {
        const client = NetworkManager.getClient(serverUrl);
        const result = await client.triggerPdfConversion(fileId);
        
        debugLog('[UnifiedFileViewer] Trigger conversion result:', JSON.stringify(result));

        if (result.status === 'complete' && result.pdf_preview_id) {
            debugLog('[UnifiedFileViewer] ✓ PDF already ready:', result.pdf_preview_id);
            const updatedFileInfo = await client.getFileInfo(fileId);
            if (updatedFileInfo.pdf_preview_id) {
                const newFileInfo = {...currentFileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
                setCurrentFileInfo(newFileInfo);
                setFileState('viewable');
                downloadAndShowFile(newFileInfo);
                return;
            }
        }

        if (result.status === 'failed') {
            debugLog('[UnifiedFileViewer] ✗ Conversion failed:', result.error);
            setFileState('unsupported');
            return;
        }
    } catch (error) {
        debugLog('[UnifiedFileViewer] Trigger conversion error:', String(error));
    }

    // ✅ 使用 recursive setTimeout 替代 setInterval
    const doPoll = async () => {
        pollingCountRef.current += 1;

        try {
            const client = NetworkManager.getClient(serverUrl);
            
            // ✅ 添加时间戳破坏缓存
            const timestamp = Date.now();
            let updatedFileInfo: FileInfo;
            
            try {
                // 尝试带时间戳的请求
                updatedFileInfo = await client.getFileInfo(`${fileId}?_t=${timestamp}`);
            } catch (e) {
                // 如果不支持查询参数，回退到普通请求
                updatedFileInfo = await client.getFileInfo(fileId);
            }
            
            debugLog(`[UnifiedFileViewer] Poll #${pollingCountRef.current}:`, JSON.stringify({
                pdf_preview_id: updatedFileInfo?.pdf_preview_id || 'EMPTY',
                pdf_conversion_status: (updatedFileInfo as any)?.pdf_conversion_status || 'unknown',
                pdf_conversion_error: (updatedFileInfo as any)?.pdf_conversion_error || 'none',
            }));

            // ✅ 转换完成
            if (updatedFileInfo?.pdf_preview_id) {
                debugLog('[UnifiedFileViewer] ✓ PDF ready:', updatedFileInfo.pdf_preview_id);
                
                // Save to database
                try {
                    const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                    await operator.handleFiles({
                        files: [{...updatedFileInfo, id: fileId}],
                        prepareRecordsOnly: false,
                    });
                    debugLog('[UnifiedFileViewer] Saved pdf_preview_id to database');
                } catch (dbError) {
                    debugLog('[UnifiedFileViewer] Failed to save to database:', String(dbError));
                }

                const newFileInfo = {...currentFileInfo, pdf_preview_id: updatedFileInfo.pdf_preview_id};
                setCurrentFileInfo(newFileInfo);
                setFileState('viewable');
                downloadAndShowFile(newFileInfo);
                return;
            }

            // ✅ 检查转换失败
            const conversionStatus = (updatedFileInfo as any)?.pdf_conversion_status;
            if (conversionStatus === 'failed') {
                const conversionError = (updatedFileInfo as any)?.pdf_conversion_error;
                debugLog('[UnifiedFileViewer] ✗ Conversion failed:', conversionError);
                setFileState('unsupported');
                return;
            }

            // 超时
            if (pollingCountRef.current >= MAX_POLLING_ATTEMPTS) {
                debugLog('[UnifiedFileViewer] Poll timeout after', MAX_POLLING_ATTEMPTS, 'attempts');
                setFileState('unsupported');
                return;
            }

            // ✅ 继续轮询（使用 setTimeout）
            pollingRef.current = setTimeout(doPoll, 2000);
        } catch (error) {
            debugLog(`[UnifiedFileViewer] Poll #${pollingCountRef.current} error:`, String(error));
            
            // 继续轮询，不要因为错误就停止
            if (pollingCountRef.current < MAX_POLLING_ATTEMPTS) {
                pollingRef.current = setTimeout(doPoll, 2000);
            } else {
                debugLog('[UnifiedFileViewer] Poll timeout after error');
                setFileState('unsupported');
            }
        }
    };

    // 启动第一次轮询
    pollingRef.current = setTimeout(doPoll, 2000);
}, [serverUrl, fileId, currentFileInfo, downloadAndShowFile]);
```

### 修复 2: 清理数据库缓存（可选，但推荐）

**问题**：本地数据库可能缓存了没有 `pdf_preview_id` 的旧 FileInfo

**解决方案**：在轮询开始前，先清理数据库中的旧记录

```typescript
const startPolling = useCallback(async () => {
    pollingCountRef.current = 0;

    // ✅ 清理数据库中的旧缓存（可选）
    try {
        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        // 删除旧的文件记录，强制从服务器获取最新数据
        await operator.deleteFile(fileId);
        debugLog('[UnifiedFileViewer] Cleared old file cache from database');
    } catch (error) {
        debugLog('[UnifiedFileViewer] Failed to clear cache:', String(error));
    }

    // ... 继续轮询逻辑
}, [...]);
```

### 修复 3: 确保使用服务器数据而非本地缓存

**文件**: `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`

**修改 `openFile` 函数**（第 528-545 行）:

```typescript
// Fetch full file info including pdf_preview_id if already converted
let fullFileInfo: FileInfo | null = null;
if (file.mm_file_id) {
    debugLog('[Drive] Fetching full file info for mm_file_id:', file.mm_file_id);
    try {
        const NetworkManager = (await import('@managers/network_manager')).default;
        const client = NetworkManager.getClient(serverUrl);
        
        // ✅ 添加时间戳破坏缓存
        const timestamp = Date.now();
        try {
            fullFileInfo = await client.getFileInfo(`${file.mm_file_id}?_t=${timestamp}`);
        } catch (e) {
            // 回退到普通请求
            fullFileInfo = await client.getFileInfo(file.mm_file_id);
        }
        
        debugLog('[Drive] Got full file info', JSON.stringify({
            mm_file_id: file.mm_file_id,
            pdf_preview_id: fullFileInfo.pdf_preview_id,
            has_preview_image: fullFileInfo.has_preview_image,
            pdf_conversion_status: (fullFileInfo as any)?.pdf_conversion_status,
        }));
    } catch (err) {
        debugLog('[Drive] getFileInfo failed, falling back to manual construction', String(err));
    }
}
```

## 关键修改点总结

### ✅ 1. 添加缓存破坏参数
```typescript
const timestamp = Date.now();
const updatedFileInfo = await client.getFileInfo(`${fileId}?_t=${timestamp}`);
```

### ✅ 2. 使用 recursive setTimeout
```typescript
const doPoll = async () => {
    // ... 轮询逻辑
    pollingRef.current = setTimeout(doPoll, 2000);  // 上一次完成后再等待
};
pollingRef.current = setTimeout(doPoll, 2000);
```

### ✅ 3. 检查转换状态
```typescript
const conversionStatus = (updatedFileInfo as any)?.pdf_conversion_status;
if (conversionStatus === 'failed') {
    debugLog('[UnifiedFileViewer] ✗ Conversion failed');
    setFileState('unsupported');
    return;
}
```

### ✅ 4. 清理数据库缓存（可选）
```typescript
await operator.deleteFile(fileId);  // 删除旧缓存
```

### ✅ 5. 添加详细调试日志
```typescript
debugLog(`[UnifiedFileViewer] Poll #${pollingCountRef.current}:`, JSON.stringify({
    pdf_preview_id: updatedFileInfo?.pdf_preview_id || 'EMPTY',
    pdf_conversion_status: (updatedFileInfo as any)?.pdf_conversion_status || 'unknown',
    pdf_conversion_error: (updatedFileInfo as any)?.pdf_conversion_error || 'none',
}));
```

## 验证步骤

### 1. 重新构建应用
```bash
cd ios && pod install
npx react-native run-ios
```

### 2. 测试云盘文件预览
- [ ] 进入云盘页面
- [ ] 点击一个 Office 文档（.docx, .xlsx, .pptx）
- [ ] 观察屏幕显示
- [ ] 进入调试日志页面
- [ ] 查找以下日志

### 3. 预期日志

```
[Drive] openFile called: {"fileId":"abc","fileName":"test.docx","extension":"docx","mm_file_id":"xyz"}
[Drive] Fetching full file info for mm_file_id: xyz
[Drive] Got full file info: {"mm_file_id":"xyz","pdf_preview_id":"","pdf_conversion_status":"none"}
[Drive] FileInfo constructed: {"pdf_preview_id":"","hasPdfPreview":false,"usingFullFileInfo":true}
[Drive] Opening document file with downloadAndPreviewFile
[UnifiedFileViewer] determineFileState called: {"fileId":"xyz","pdf_preview_id":"","isOffice":true}
[UnifiedFileViewer] Office file detected, checking PDF preview
[UnifiedFileViewer] Server file info: {"pdf_preview_id":"","pdf_conversion_status":"none"}
[UnifiedFileViewer] Starting PDF conversion polling
[UnifiedFileViewer] Trigger conversion result: {"status":"converting","message":"PDF conversion started"}
[UnifiedFileViewer] Poll #1: {"pdf_preview_id":"EMPTY","pdf_conversion_status":"converting","pdf_conversion_error":"none"}
[UnifiedFileViewer] Poll #2: {"pdf_preview_id":"EMPTY","pdf_conversion_status":"converting","pdf_conversion_error":"none"}
[UnifiedFileViewer] Poll #3: {"pdf_preview_id":"pdf123","pdf_conversion_status":"complete","pdf_conversion_error":"none"}
[UnifiedFileViewer] ✓ PDF ready: pdf123
[UnifiedFileViewer] Saved pdf_preview_id to database
[UnifiedFileViewer] File state: viewable
[UnifiedFileViewer] Downloading PDF preview...
[UnifiedFileViewer] PDF downloaded, showing preview
```

## 数据库缓存问题分析

### 为什么本地数据库会导致问题？

**移动端的数据库缓存流程**：
```
1. 第一次获取 FileInfo
   → 从服务器获取（pdf_preview_id: ""）
   → 保存到本地数据库

2. PDF 转换完成
   → 服务器更新（pdf_preview_id: "pdf123"）

3. 第二次获取 FileInfo
   → ❌ 可能从本地数据库读取（pdf_preview_id: ""）
   → ❌ 没有从服务器获取最新数据
```

**WebApp 无数据库缓存**：
```
1. 第一次获取 FileInfo
   → 从服务器获取（pdf_preview_id: ""）

2. PDF 转换完成
   → 服务器更新（pdf_preview_id: "pdf123"）

3. 第二次获取 FileInfo
   → ✅ 从服务器获取（pdf_preview_id: "pdf123"）
   → ✅ 始终获取最新数据
```

### 解决方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| 添加 `?_t=timestamp` | 简单，不影响数据库 | 需要服务器支持查询参数 | ⭐⭐⭐⭐⭐ |
| 清理数据库缓存 | 彻底解决缓存问题 | 可能影响其他功能 | ⭐⭐⭐⭐ |
| 禁用数据库缓存 | 总是获取最新数据 | 性能下降 | ⭐⭐ |
| 强制刷新数据库 | 手动控制 | 复杂 | ⭐⭐⭐ |

## 性能影响

- **缓存破坏**：每次请求访问服务器，增加少量网络流量
- **数据库清理**：一次性操作，影响可忽略
- **Recursive setTimeout**：与 setInterval 性能相同
- **详细日志**：增加少量字符串处理开销

**总体影响**：可忽略不计，只在预览 Office 文件时执行

## 安全性

- ✅ **安全**：所有操作都使用认证 token
- ✅ **无风险**：只是添加查询参数
- ✅ **合规**：符合数据保护要求

## 相关文件

### 需要修改的文件
1. `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 修改轮询逻辑
2. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 添加缓存破坏

### 相关文件
- `app/hooks/files.ts` - 文件下载和预览 Hook
- `app/database/manager.ts` - 数据库管理
- `app/database/operator/file_handler.ts` - 文件数据库操作

## 实施顺序

1. ✅ **第一步**：修改轮询逻辑（unified_file_viewer.tsx）
2. ✅ **第二步**：添加缓存破坏参数（cloud_drive_screen.tsx）
3. ✅ **第三步**：测试并验证
4. ⚠️ **第四步**（可选）：清理数据库缓存

## 预期结果

修复后，云盘 Office 文件应该能够：

1. ✅ 正确触发 PDF 转换
2. ✅ 实时获取转换状态（不被缓存）
3. ✅ 检测转换完成
4. ✅ 检测转换失败
5. ✅ 最终成功显示 PDF 预览

---

**修复日期**: 2026-10-26  
**修复人员**: Claude Code  
**状态**: 🚀 立即实施  
**优先级**: 高  
