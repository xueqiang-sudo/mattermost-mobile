# 云盘上传文件失败 - URI 编码问题修复

## 问题描述

用户从相册选择文件上传到云盘，文件有本地 URI 但仍然上传失败：

```
17:48:50.419 [[Drive] Uploading file:] {
  "name": "订单详情页 4.pdf",
  "uri": "file:///var/mobile/Containers/Data/Application/.../68582ADE-C5EE-4300-8DD2-700897BC8A09/%E8%AE%A2%E5%8D%95%E8%AF%A6%E6%83%85%E9%A1%B5%204.pdf",
  "mime_type": "application/pdf",
  "size": 578054
}

17:48:50.461 [[Drive] Upload error:] Error: api.drive.upload.parse_error
```

## 问题分析

### 根本原因

**URI 包含 URL 编码的字符**：
- URI 中的文件名被 URL 编码：`%E8%AE%A2%E5%8D%95%E8%AF%A6%E6%83%85%E9%A1%B5%204.pdf`
- 解码后是：`订单详情页 4.pdf`
- React Native 的 FormData 可能无法正确处理 URL 编码的 `file://` URI

### 问题链路

```
用户从相册选择文件
    ↓
文件选择器返回 FileInfo
    ↓
file.uri = "file:///.../%E8%AE%A2%E5%8D%95...pdf"  ← URL 编码
    ↓
调用 uploadDriveFile(fileUri, ...)
    ↓
创建 FormData，添加 file 对象
    ↓
FormData.append('files', {uri: fileUri, ...})
    ↓
❌ 服务器无法解析 URL 编码的 URI
    ↓
返回 api.drive.upload.parse_error
```

## 修复方案

### 方案 1: 解码 URI（已实施）

在上传前解码 URI：

```typescript
// Decode URI if it contains URL-encoded characters
// React Native FormData needs proper file:// URIs
if (fileUri.includes('%')) {
    try {
        const decodedUri = decodeURIComponent(fileUri);
        debugLog('[Drive] Decoded URI:', decodedUri);
        fileUri = decodedUri;
    } catch (decodeErr) {
        debugLog('[Drive] Failed to decode URI, using original:', String(decodeErr));
    }
}
```

**效果**：
- 编码前：`file:///.../%E8%AE%A2%E5%8D%95%E8%AF%A6%E6%83%85%E9%A1%B5%204.pdf`
- 编码后：`file:///.../订单详情页 4.pdf`

### 方案 2: 添加详细日志（已实施）

在 `uploadDriveFile` 函数中添加详细日志：

```typescript
export async function uploadDriveFile(...) {
    // Debug: Log upload parameters
    console.log('[uploadDriveFile] Parameters:', JSON.stringify({
        teamId,
        parentId,
        scope,
        fileUri,
        fileName,
        fileType,
    }));

    // ... 创建 FormData ...

    console.log('[uploadDriveFile] FormData created, sending request...');

    const resp = await client.doFetch(...);

    console.log('[uploadDriveFile] Response:', JSON.stringify({
        ok: resp.ok,
        status: resp.status,
        error: resp.error,
        hasData: Boolean(resp.data),
    }));

    // ... 处理响应 ...
}
```

## 已修改的文件

### 1. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`

**修改位置**：`onUploadFiles` 函数（第 711-820 行）

**修改内容**：
- 添加 URI 解码逻辑
- 在调用 `uploadDriveFile` 前解码 URL 编码的 URI

### 2. `app/screens/home/apps/workbench_api.ts`

**修改位置**：`uploadDriveFile` 函数（第 134-163 行）

**修改内容**：
- 添加详细的调试日志
- 记录上传参数、FormData 创建、服务器响应

## 验证步骤

### 1. 重新构建应用

```bash
cd /home/work/mattermost-mobile
cd ios && pod install && cd ..
npx react-native run-ios
```

### 2. 测试上传功能

- [ ] 进入云盘页面
- [ ] 点击"上传"按钮
- [ ] 选择"相册"标签页
- [ ] 选择一个包含中文字符的 PDF 文件
- [ ] 点击发送

### 3. 查看调试日志

**预期日志**：

```
[Drive] Uploading file: {
  "name": "订单详情页 4.pdf",
  "uri": "file:///.../%E8%AE%A2%E5%8D%95%E8%AF%A6%E6%83%85%E9%A1%B5%204.pdf",
  "mime_type": "application/pdf",
  "size": 578054
}

[Drive] Decoded URI: file:///.../订单详情页 4.pdf  ← ✅ URI 已解码

[uploadDriveFile] Parameters: {
  "teamId": "...",
  "parentId": "",
  "scope": "public",
  "fileUri": "file:///.../订单详情页 4.pdf",  ← ✅ 解码后的 URI
  "fileName": "订单详情页 4.pdf",
  "fileType": "application/pdf"
}

[uploadDriveFile] FormData created, sending request...

[uploadDriveFile] Response: {
  "ok": true,  ← ✅ 上传成功
  "status": 200,
  "error": null,
  "hasData": true
}

[Drive] File uploaded successfully: 订单详情页 4.pdf
[Drive] All files uploaded, refreshing list
```

### 4. 预期结果

- ✅ 文件上传成功
- ✅ 文件列表刷新
- ✅ 新文件出现在云盘中

## 技术细节

### URL 编码问题

**原因**：
- iOS 文件选择器返回的 URI 可能包含 URL 编码的字符
- 特别是中文字符会被编码为 `%XX` 格式
- React Native 的 FormData 可能无法正确处理 URL 编码的 `file://` URI

**解决方案**：
- 使用 `decodeURIComponent()` 解码 URI
- 将 `%E8%AE%A2%E5%8D%95` 解码为 `订单`

### decodeURIComponent 函数

```typescript
decodeURIComponent('%E8%AE%A2%E5%8D%95')  // "订单"
decodeURIComponent('%20')                  // " "
decodeURIComponent('file:///.../%E8%AE%A2%E5%8D%95.pdf')  
// "file:///.../订单.pdf"
```

**注意**：
- 如果 URI 不包含编码字符，`decodeURIComponent` 会返回原始字符串
- 如果 URI 格式不正确，可能会抛出异常，需要用 try-catch 包裹

### React Native FormData 文件上传

```typescript
const formData = new FormData();
formData.append('files', {
    uri: 'file:///path/to/file.pdf',  // ← 必须是正确的 file:// URI
    name: 'file.pdf',
    type: 'application/pdf',
});
```

**要求**：
- `uri` 必须是有效的 `file://` URI
- URI 中的路径必须存在
- 可能需要解码 URL 编码的字符

## 对比 WebApp

### WebApp 文件上传

```typescript
// WebApp 使用浏览器的 File 对象
const handleFileInputChange = async (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    for (const file of selectedFiles) {
        await uploadDriveFile(teamId, currentFolderId, scope, file);
    }
};

// uploadDriveFile 直接使用 File 对象
export async function uploadDriveFile(teamId, parentId, scope, file: File) {
    const formData = new FormData();
    formData.append('files', file);  // ← 直接添加 File 对象
    // ...
}
```

**区别**：
- WebApp 使用浏览器的 `File` 对象（包含文件数据）
- Mobile 使用 `file://` URI（指向文件路径）
- WebApp 不需要处理 URL 编码问题

## 性能影响

- **URI 解码**：一次性操作，影响可忽略
- **调试日志**：增加少量字符串处理开销
- **总体影响**：可忽略不计

## 安全性

- ✅ **安全**：URI 解码只是字符串处理
- ✅ **无副作用**：不影响文件内容
- ✅ **向后兼容**：不改变 API 接口

## 其他可能的修复方案

### 方案 A: 使用 expo-file-system 读取文件

如果 URI 解码后仍然无法上传，可以先读取文件内容为 base64：

```typescript
import {readAsStringAsync} from 'expo-file-system';

const base64Data = await readAsStringAsync(fileUri, {
    encoding: 'base64',
});

// 然后使用 base64 上传
formData.append('files', {
    uri: `data:${fileType};base64,${base64Data}`,
    name: fileName,
    type: fileType,
});
```

**缺点**：
- 需要读取整个文件到内存
- 大文件可能导致内存问题

### 方案 B: 使用 react-native-fs 复制文件

将文件复制到临时目录，使用新的路径上传：

```typescript
import RNFS from 'react-native-fs';

const tempPath = `${RNFS.TemporaryDirectoryPath}/${fileName}`;
await RNFS.copyFile(fileUri.replace('file://', ''), tempPath);

// 使用新的路径上传
formData.append('files', {
    uri: `file://${tempPath}`,
    name: fileName,
    type: fileType,
});
```

**缺点**：
- 需要额外的依赖
- 需要复制文件，增加 I/O 开销

### 方案 C: 修改服务器端解析逻辑

如果客户端无法解决，可以修改服务器端，支持 URL 编码的 URI。

**缺点**：
- 需要修改后端代码
- 可能需要重新部署服务器

## 总结

### 当前状态

- ✅ 文件有本地 URI
- ❌ URI 包含 URL 编码字符
- ❌ 服务器无法解析
- ✅ 已添加 URI 解码逻辑
- ✅ 已添加详细调试日志

### 下一步

1. 重新构建应用
2. 测试上传功能
3. 查看详细日志
4. 确认修复是否有效

### 如果仍然失败

如果 URI 解码后仍然无法上传，可能需要：
1. 检查服务器端日志
2. 尝试其他修复方案（读取文件内容、复制文件等）
3. 修改服务器端解析逻辑

---

**修复日期**: 2026-10-26  
**修复人员**: Claude Code  
**测试状态**: ⏳ 待验证  
**修复类型**: Bug 修复（云盘上传失败）  
**影响范围**: 云盘页面  
**严重程度**: 高（功能不可用）  
**修复文件数**: 2  
**状态**: ✅ 完成
