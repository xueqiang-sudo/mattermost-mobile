# 文件发送后渲染出 2 个 - 真正的问题修复

## 🎯 你的需求

**正确的流程**（乐观更新）：
```
1. 用户点击发送
2. 立即渲染 pending post（带本地文件预览）✅ 快
3. 后台上传文件
4. 上传完成后，更新 post 的 file_ids
5. ✅ 用户始终只看到 1 个 post
```

---

## 🐛 真正的问题

### 日志分析

```
12:19:38.750 [DRAFT] addFiles: upload successful for PYP Declaration.pages
12:19:38.752 [DRAFT] addFiles: upload complete for file 1
  id: "rngqjtf1jbdgtn8krcq7czbtaa"  ← 新的 server file ID
  clientId: "file:///.../PYP Declaration.pages"

12:19:38.782 [POST] updatePostFileIds: postId=pending_238f11c3-..., pendingPostId=undefined
  uploadedFiles: [{id:"rngqjtf1jbdgtn8krcq7czbtaa", clientId:"file:///..."}]
  uploadedByOldIdKeys: ["file:///..."]  ← ⚠️ key 是完整路径

12:19:38.782 [POST] updatePostFileIds: found 1 files by postId, 0 by pendingPostId
  existingFileIds: ["pending_cc42c6b5-2529-4819-a0d2-a8c3174c029c"]  ← ⚠️ pending file
  pendingFileIds: []

12:19:38.782 [POST] updatePostFileIds: keeping pending pending_cc42c6b5-...  ← ❌ 保留了 pending file
```

---

### 问题根源

**关键代码**（`updatePostFileIds` 函数）：

```typescript
// 构建 pendingFileId → 上传后 FileInfo 的映射
const uploadedByOldId = new Map<string, FileInfo>();
for (const file of files) {
    const oldId = file.clientId || file.id;  // ← oldId 是完整路径 "file:///..."
    uploadedByOldId.set(oldId, file);
}

// 查询当前 post 关联的所有 File 记录
const allFileRecords = [...existingFiles, ...pendingFiles];

// 精确匹配
for (const fileRecord of allFileRecords) {
    const uploaded = uploadedByOldId.get(fileRecord.id);  // ← fileRecord.id 是 "pending_xxx"
    if (uploaded) {
        // 删除旧记录
    } else {
        // ❌ 因为 ID 不匹配，pending file 被保留了
        newFileIds.push(fileRecord.id);
    }
}
```

**ID 不匹配**：
- `uploadedByOldId` 的 key：`"file:///.../PYP Declaration.pages"`
- `fileRecord.id`：`"pending_cc42c6b5-2529-4819-a0d2-a8c3174c029c"`
- **结果**：`uploaded` 为 `undefined`，pending file 被保留

**最终结果**：
- Post 的 `fileIds` 包含：
  1. `pending_cc42c6b5-...`（旧的 pending file，未删除）
  2. `rngqjtf1jbdgtn8krcq7czbtaa`（新的 server file）
- **渲染时显示 2 个文件**

---

## 🔧 修复方案

### 修复代码

**文件**：`/home/work/mattermost-mobile/app/actions/remote/post.ts`

**位置**：第 502-516 行

**改动**：

```typescript
// 精确匹配：只删除已完成上传的 pending File，保留仍在上传中的
for (const fileRecord of allFileRecords) {
    const uploaded = uploadedByOldId.get(fileRecord.id);
    if (uploaded) {
        // 这个 pending File 已上传完成，删除旧记录
        models.push(fileRecord.prepareDestroyPermanently());
        newFileIds.push(uploaded.id!);
        uploadedByOldId.delete(fileRecord.id);
        debugLog('POST', `updatePostFileIds: replacing ${fileRecord.id} → ${uploaded.id}`);
    } else {
        // 【修复】检查是否是 pending file（ID 以 pending_ 开头）
        // 如果是 pending file，且上传已完成（通过其他 key 匹配），也应该删除
        const isPendingFile = fileRecord.id.startsWith('pending_');
        if (isPendingFile && files.length > 0) {
            // 这个 pending file 对应的文件已上传完成（因为调用了 updatePostFileIds）
            // 删除它，使用新上传的 server file
            models.push(fileRecord.prepareDestroyPermanently());
            debugLog('POST', `updatePostFileIds: deleting pending file ${fileRecord.id} (upload complete)`);
        } else {
            // 这个 File 还在上传中，保留不动
            newFileIds.push(fileRecord.id);
            debugLog('POST', `updatePostFileIds: keeping pending ${fileRecord.id}`);
        }
    }
}
```

**修复逻辑**：
1. 如果 `fileRecord.id` 在 `uploadedByOldId` 中找不到
2. 检查 `fileRecord.id` 是否以 `pending_` 开头
3. 如果是 pending file，且调用了 `updatePostFileIds`（说明上传已完成）
4. **删除这个 pending file**
5. 使用新上传的 server file

---

## 📊 修复效果对比

### 修复前

```
Post 创建：
  fileIds: ["pending_cc42c6b5-..."]

文件上传成功：
  server_file_id: "rngqjtf1jbdgtn8krcq7czbtaa"

updatePostFileIds：
  uploadedByOldId: Map { "file:///..." => FileInfo }
  fileRecord.id: "pending_cc42c6b5-..."
  uploaded: undefined  ← ID 不匹配
  newFileIds: ["pending_cc42c6b5-..."]  ← 保留 pending
  创建新记录：
    FileInfo { id: "rngqjtf1jbdgtn8krcq7czbtaa" }
  更新 post.fileIds: ["pending_cc42c6b5-...", "rngqjtf1jbdgtn8krcq7czbtaa"]

渲染：
  ⚠️ 显示 2 个文件（pending + server）
```

### 修复后

```
Post 创建：
  fileIds: ["pending_cc42c6b5-..."]

文件上传成功：
  server_file_id: "rngqjtf1jbdgtn8krcq7czbtaa"

updatePostFileIds：
  uploadedByOldId: Map { "file:///..." => FileInfo }
  fileRecord.id: "pending_cc42c6b5-..."
  uploaded: undefined
  isPendingFile: true  ← 检测到 pending file
  删除 pending file
  newFileIds: ["rngqjtf1jbdgtn8krcq7czbtaa"]  ← 只保留 server file
  创建新记录：
    FileInfo { id: "rngqjtf1jbdgtn8krcq7czbtaa" }
  更新 post.fileIds: ["rngqjtf1jbdgtn8krcq7czbtaa"]

渲染：
  ✅ 显示 1 个文件（server file）
```

---

## 🧪 测试步骤

### 基础测试
```
1. 打开一个聊天窗口
2. 选择 1 个文件发送
3. 观察界面：
   - 应该立即显示 pending post（带本地文件预览）
   - 上传完成后，更新为 server post
   - ✅ 始终只有 1 个 post
```

### 日志检查
```
预期日志：

12:XX:XX.XXX [DRAFT] addFiles: Phase 2 COMPLETE, created 1 posts
12:XX:XX.XXX [DRAFT] addFiles: background upload - 1 files
12:XX:XX.XXX [DRAFT] addFiles: uploading file 1/1: PYP Declaration.pages
12:XX:XX.XXX [DRAFT] addFiles: upload callback for PYP Declaration.pages (code: 201)
12:XX:XX.XXX [DRAFT] addFiles: upload successful for PYP Declaration.pages
12:XX:XX.XXX [POST] updatePostFileIds: postId=pending_xxx
12:XX:XX.XXX [POST] updatePostFileIds: found 1 files by postId
12:XX:XX.XXX [POST] updatePostFileIds: deleting pending file pending_xxx (upload complete)  ← ✅
12:XX:XX.XXX [POST] updatePostFileIds: creating new file record rngqjtf1jbdgtn8krcq7czbtaa
12:XX:XX.XXX [POST] updatePostFileIds: complete
  newFileIds: ["rngqjtf1jbdgtn8krcq7czbtaa"]  ← ✅ 只有 server file ID
```

### 边界测试
```
1. 发送多个文件（9 个）
   - 每个文件都应该只显示 1 个 post
   - 每个 post 都应该只有 1 个 file

2. 快速连续发送
   - 不应该出现重复的 post

3. 发送大文件（>10MB）
   - 上传时间长，但应该只显示 1 个 post

4. 网络慢的情况
   - pending post 显示时间长，但更新后不应该重复
```

---

## 🔍 调试技巧

### 如果仍然出现 2 个文件

**检查日志**：
```bash
grep "updatePostFileIds" /path/to/logs
```

**关键日志**：
```
# ✅ 正常
[POST] updatePostFileIds: deleting pending file pending_xxx (upload complete)
[POST] updatePostFileIds: creating new file record rngqjtf1jbdgtn8krcq7czbtaa
[POST] updatePostFileIds: complete
  newFileIds: ["rngqjtf1jbdgtn8krcq7czbtaa"]

# ❌ 异常
[POST] updatePostFileIds: keeping pending pending_xxx  ← 保留了 pending file
[POST] updatePostFileIds: complete
  newFileIds: ["pending_xxx", "rngqjtf1jbdgtn8krcq7czbtaa"]  ← 有 2 个 ID
```

---

### 查看 post 的 fileIds

**方法**：在聊天界面长按 post，查看调试信息

**或者**：添加日志
```typescript
// 在 updatePostFileIds 函数末尾添加
debugLog('POST', `updatePostFileIds: final post.fileIds`, {
    postId: existingPost.id,
    fileIds: newFileIds,
    pendingCount: newFileIds.filter(id => id.startsWith('pending_')).length,
    serverCount: newFileIds.filter(id => !id.startsWith('pending_')).length,
});
```

---

## 📝 代码改动总结

### 文件：`/home/work/mattermost-mobile/app/actions/remote/post.ts`

**位置**：第 502-516 行

**改动**：
- 添加 `isPendingFile` 检查
- 如果 pending file 上传完成，删除它
- 只保留 server file

**新增代码**：
```typescript
const isPendingFile = fileRecord.id.startsWith('pending_');
if (isPendingFile && files.length > 0) {
    // 这个 pending file 对应的文件已上传完成
    models.push(fileRecord.prepareDestroyPermanently());
    debugLog('POST', `updatePostFileIds: deleting pending file ${fileRecord.id} (upload complete)`);
} else {
    // 这个 File 还在上传中，保留不动
    newFileIds.push(fileRecord.id);
    debugLog('POST', `updatePostFileIds: keeping pending ${fileRecord.id}`);
}
```

---

## 🎯 完整的流程

### 用户点击发送
```
1. 创建 pending post（本地）
   post = {
     id: "pending_238f11c3-...",
     fileIds: ["pending_cc42c6b5-..."],
     props: { pending_files: [...], upload_progress: {...} }
   }
   
2. 立即渲染 pending post ✅
   - 用户看到自己的 post
   - 显示本地文件预览
   - 显示上传进度
```

### 后台上传
```
3. 调用 createPost API（服务端）
   - 创建 server post
   - fileIds: []（文件还未上传）
   
4. WebSocket 推送 server post
   - 客户端收到 post
   - 检查 pending_post_id
   - 发现已有 pending post
   - 更新 pending post → server post
   - ✅ 用户仍然看到 1 个 post

5. 上传文件
   - 调用 uploadFile API
   - 显示上传进度
   - 上传成功，返回 server_file_id
```

### 更新状态
```
6. 调用 updatePostFileIds
   - 传入 server_file_id
   - 查找 pending file
   - 【修复】删除 pending file ✅
   - 创建 server file 记录
   - 更新 post.fileIds = [server_file_id]
   - ✅ 用户看到 1 个 post（带 server file）
```

---

## ✅ 预期结果

修复后，你应该看到：

1. ✅ 点击发送，立即显示 post
2. ✅ 显示上传进度
3. ✅ 上传完成后，更新为 server file
4. ✅ **始终只有 1 个 post**
5. ✅ Post 只有 1 个 file（server file）
6. ✅ 没有重复渲染

---

## 🚀 立即测试

```
1. 重新构建移动端
   npm run android  # 或 npm run ios

2. 打开聊天窗口
3. 发送 1 个文件
4. 观察界面
5. ✅ 应该只显示 1 个 post

6. 查看日志
   grep "updatePostFileIds" logs
   ✅ 应该看到 "deleting pending file"
```

---

**修复完成！** 🎉

## 📌 关键点

- **问题**：pending file 没有被删除，导致 post 有 2 个 file IDs
- **原因**：`uploadedByOldId` 的 key 和 `fileRecord.id` 不匹配
- **修复**：检测到 pending file 且上传完成时，直接删除
- **效果**：post 只有 1 个 file ID，渲染 1 次
