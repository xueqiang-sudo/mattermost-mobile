# 云盘 Office 文件预览 - 权限错误分析

## 问题描述

用户点击云盘 Office 文件后，调试日志显示：

```
17:06:35.780 [[Drive] Opening document file with downloadAndPreviewFile]
17:06:35.780 [FILE] [downloadAndPreviewFile] called: name=IM 工业应用.docx, ext=docx, 
               hasPdfPreview=false, pdf_preview_id=undefined

17:06:37.856 [[UnifiedFileViewer] determineFileState called] {
  "fileId": "atwbgac1rjdqbpquqhif tj49gy",
  "fileName": "IM 工业应用.docx",
  "extension": "docx",
  "isOffice": true
}

17:06:37.857 [[UnifiedFileViewer] Office file detected, checking PDF preview]

17:06:37.893 [[UnifiedFileViewer] Failed to get file info from server:] 
             Error: 您没有对应的权限。

17:06:37.893 [[UnifiedFileViewer] Permission denied, cannot preview this file]
```

## 问题分析

### 当前流程

```
用户点击云盘 Office 文件
    ↓
cloud_drive_screen.tsx: openFile(file)
    ↓
检查 file.mm_file_id 是否存在
    ├─ 不存在 → 显示错误 "This Office file cannot be previewed yet"
    └─ 存在 → 继续
        ↓
调用 client.getFileInfo(mm_file_id) 获取完整文件信息
    ├─ 成功 → 使用 fullFileInfo
    └─ 失败 → 使用 fallback FileInfo
        ↓
调用 downloadAndPreviewFile(fileInfo)
    ↓
打开 UnifiedFileViewer
    ↓
UnifiedFileViewer: determineFileState()
    ↓
检测到 Office 文件，尝试获取 PDF 预览
    ↓
调用 client.getFileInfo(fileId)
    ↓
❌ 服务器返回 "您没有对应的权限"
    ↓
设置 fileState = 'unsupported'
    ↓
显示 "This file type cannot be previewed" 页面
```

### 根本原因

**服务器返回权限错误**：当 `UnifiedFileViewer` 尝试通过 `mm_file_id` 访问 Mattermost 文件 API 时，服务器返回 "您没有对应的权限"。

### 可能的原因

#### 原因 1: `mm_file_id` 指向的文件权限不正确

**可能情况**:
- 云盘文件上传时，创建了对应的 Mattermost 文件
- 但该 Mattermost 文件的权限设置不正确
- 当前用户没有访问该文件的权限

**验证方法**:
```bash
# 直接调用 Mattermost 文件 API
curl -X GET "https://ai.optibot.cn:8065/api/v4/files/atwbgac1rjdqbpquqhif tj49gy" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**预期结果**:
- ✅ 200 OK - 返回文件信息
- ❌ 403 Forbidden - 权限错误

#### 原因 2: `mm_file_id` 不正确

**可能情况**:
- 云盘数据库中的 `mm_file_id` 字段存储了错误的值
- 该 ID 指向一个不存在或无权访问的文件

**验证方法**:
```sql
-- 查询云盘文件的 mm_file_id
SELECT id, name, mm_file_id, owner_id, creator_id
FROM drive_files
WHERE id = 'tssztgoqtgeucdd6xkaba19dy';
```

**检查**:
- `mm_file_id` 是否存在？
- `mm_file_id` 对应的 Mattermost 文件是否存在？
- 当前用户是否有权限访问该文件？

#### 原因 3: 文件所有权问题

**可能情况**:
- 云盘文件属于用户 A
- 但 `mm_file_id` 指向的文件属于用户 B
- 用户 A 没有访问用户 B 文件的权限

**验证方法**:
```sql
-- 查询文件所有权
SELECT 
    df.id as drive_file_id,
    df.name as drive_file_name,
    df.owner_id as drive_owner,
    df.creator_id as drive_creator,
    df.mm_file_id,
    f.userid as mattermost_file_owner
FROM drive_files df
LEFT JOIN fileinfo f ON f.id = df.mm_file_id
WHERE df.id = 'tssztgoqtgeucdd6xkaba19dy';
```

**检查**:
- `drive_owner` 是否等于 `mattermost_file_owner`？
- 如果不等，说明文件所有权不一致

#### 原因 4: Token 权限不足

**可能情况**:
- 用户的 Token 没有访问该文件的权限
- Token 过期或无效

**验证方法**:
- 重新登录
- 使用新的 Token 测试

## 当前代码逻辑

### cloud_drive_screen.tsx (第 490-602 行)

```typescript
const openFile = useCallback(async (file: DriveFile) => {
    // 检查 Office 文件是否有 mm_file_id
    if (isOffice && !file.mm_file_id) {
        Alert.alert('Error', 'This Office file cannot be previewed yet...');
        return;
    }

    // 尝试获取完整文件信息
    let fullFileInfo: FileInfo | null = null;
    if (file.mm_file_id) {
        try {
            fullFileInfo = await client.getFileInfo(`${file.mm_file_id}?_t=${timestamp}`);
        } catch (e) {
            fullFileInfo = await client.getFileInfo(file.mm_file_id);
        }
    }

    // 构建 FileInfo
    const fileInfo: FileInfo = fullFileInfo || {
        id: file.mm_file_id || file.id,  // ← 使用 mm_file_id
        // ...
    };

    // 调用 downloadAndPreviewFile
    downloadAndPreviewFile(fileInfo);
}, [...]);
```

### unified_file_viewer.tsx (第 420-465 行)

```typescript
const determineFileState = useCallback(async () => {
    if (isOfficeFile(fileInfo)) {
        try {
            const updatedFileInfo = await client.getFileInfo(fileId);
            
            if (updatedFileInfo.pdf_preview_id) {
                // PDF 预览可用
                setFileState('viewable');
                downloadAndShowFile(newFileInfo);
                return;
            }
        } catch (error) {
            const errorMessage = String(error);
            
            // 权限错误检测
            if (errorMessage.includes('权限') || errorMessage.includes('permission')) {
                debugLog('[UnifiedFileViewer] Permission denied, cannot preview this file');
                setFileState('unsupported');  // ← 显示不支持页面
                return;
            }
        }
        
        // 开始 PDF 转换
        setFileState('converting');
        startPolling();
    }
}, [...]);
```

## 解决方案

### 方案 1: 使用云盘自己的预览 API（推荐）

**思路**: 云盘有自己的预览 API `/api/v4/teams/${teamId}/drive/files/${fileId}/preview`，可以直接使用这个 API，而不依赖 Mattermost 文件 API。

**优点**:
- 不需要 `mm_file_id`
- 权限由云盘 API 控制，更一致
- 减少对外部 API 的依赖

**缺点**:
- 需要服务器端支持 Office 文件预览
- 可能需要额外的转换逻辑

**实现**:
```typescript
const openFile = useCallback(async (file: DriveFile) => {
    if (isOffice) {
        // 使用云盘预览 API
        const previewUrl = getDrivePreviewUrl(serverUrl, teamId, file.id);
        
        // 直接在 WebView 中打开预览
        navigation.navigate(Screens.WEBVIEW, {
            url: previewUrl,
            title: file.name,
        });
        return;
    }
    
    // 非 Office 文件使用原有逻辑
    // ...
}, [...]);
```

### 方案 2: 修复服务器端权限问题

**思路**: 检查服务器端为什么返回权限错误，并修复权限设置。

**步骤**:
1. 检查 `mm_file_id` 是否正确
2. 检查文件所有权是否一致
3. 检查用户是否有访问权限
4. 修复服务器端权限逻辑

**验证**:
```bash
# 直接调用 Mattermost 文件 API
curl -X GET "https://ai.optibot.cn:8065/api/v4/files/${mm_file_id}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 方案 3: 降级到下载模式

**思路**: 如果无法预览，直接提供下载选项。

**实现**:
```typescript
if (errorMessage.includes('权限') || errorMessage.includes('permission')) {
    debugLog('[UnifiedFileViewer] Permission denied, showing download option');
    
    Alert.alert(
        'Permission Denied',
        'You do not have permission to preview this file. Would you like to download it?',
        [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Download', onPress: () => handleDownload()},
        ]
    );
    
    setFileState('unsupported');
    return;
}
```

### 方案 4: 添加更详细的错误信息

**思路**: 在错误页面显示更详细的信息，帮助用户理解问题。

**实现**:
```typescript
{fileState === 'unsupported' && (
    <View style={styles.unsupportedContainer}>
        <CompassIcon name='file-alert-outline' size={64} color={theme.centerChannelColor}/>
        <Text style={styles.unsupportedTitle}>
            {intl.formatMessage({id: 'file_viewer.unsupported', defaultMessage: 'This file type cannot be previewed'})}
        </Text>
        <Text style={styles.unsupportedSubtitle}>
            {intl.formatMessage({id: 'file_viewer.unsupported_subtitle', defaultMessage: 'You can download it and open with another app'})}
        </Text>
        <Text style={styles.errorMessage}>
            Error: Permission denied. Please contact your administrator.
        </Text>
        <TouchableOpacity onPress={handleDownload} style={styles.downloadButton}>
            <Text>{intl.formatMessage({id: 'file_viewer.download', defaultMessage: 'Download'})}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleOpenWith} style={styles.openWithButton}>
            <Text>{intl.formatMessage({id: 'file_viewer.open_with', defaultMessage: 'Open with'})}</Text>
        </TouchableOpacity>
    </View>
)}
```

## 调试步骤

### 1. 检查 `mm_file_id`

```sql
-- 查询云盘文件信息
SELECT id, name, mm_file_id, owner_id, creator_id, scope
FROM drive_files
WHERE name = 'IM 工业应用.docx';
```

### 2. 检查 Mattermost 文件

```sql
-- 查询 Mattermost 文件信息
SELECT id, userid, postid, createat, name, extension
FROM fileinfo
WHERE id = 'atwbgac1rjdqbpquqhif tj49gy';
```

### 3. 直接调用 API

```bash
# 获取 Token
TOKEN="YOUR_TOKEN"

# 调用 Mattermost 文件 API
curl -X GET "https://ai.optibot.cn:8065/api/v4/files/atwbgac1rjdqbpquqhif tj49gy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# 调用云盘预览 API
curl -X GET "https://ai.optibot.cn:8065/api/v4/teams/${teamId}/drive/files/${driveFileId}/preview" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. 检查服务器日志

```bash
# 查看 Mattermost 服务器日志
docker logs mattermost-docker-server 2>&1 | grep -i "permission\|file.*atwbgac1rjdqbpquqhif tj49gy"
```

## 对比 WebApp

### WebApp 如何处理云盘 Office 文件？

需要检查 `/home/work/mattermost-master/webapp` 中的云盘实现：

1. WebApp 是否使用 `mm_file_id`？
2. WebApp 是否使用云盘自己的预览 API？
3. WebApp 如何处理权限错误？

**检查文件**:
- `webapp/channels/src/components/sidebar/workbench_panel/cloud_drive_tab.tsx`
- `webapp/channels/src/components/sidebar/workbench_panel/cloud_drive_api.ts`

## 相关文件

### 移动端文件

- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘页面
- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 统一文件查看器
- `app/screens/home/apps/workbench_api.ts` - 云盘 API

### 服务器端文件（待检查）

- `/home/work/mattermost-master/server/.../drive_file.go` - 云盘文件处理
- `/home/work/mattermost-master/server/.../file_info.go` - Mattermost 文件处理

## 总结

### 当前状态

- ✅ 权限错误检测已实现（显示 "unsupported" 页面）
- ❌ 用户无法预览 Office 文件
- ❌ 根本原因未确定

### 可能的原因

1. `mm_file_id` 指向的文件权限不正确
2. `mm_file_id` 不正确
3. 文件所有权问题
4. Token 权限不足

### 下一步

1. 检查数据库中的 `mm_file_id` 是否正确
2. 直接调用 Mattermost 文件 API 测试权限
3. 检查服务器端权限逻辑
4. 考虑使用云盘自己的预览 API

---

**调查日期**: 2026-10-26  
**调查人员**: Claude Code  
**状态**: ⏳ 调查中  
**优先级**: 高  
**影响范围**: 云盘 Office 文件预览  
**严重程度**: 中（功能不可用，但有降级方案）
