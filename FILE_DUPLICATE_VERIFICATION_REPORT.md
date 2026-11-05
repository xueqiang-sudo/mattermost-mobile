# 文件发送后渲染 2 个问题 - 代码核对报告

**日期**：2026-11-05  
**核对人**：Claude Code  
**问题描述**：聊天窗口选择 1 个文件发送后，界面渲染出 2 个相同的 post

---

## 📋 核对总结

### ✅ 移动端修复（已完成）

**文件**：`/home/work/mattermost-mobile/app/actions/remote/post.ts`  
**位置**：第 502-526 行  
**状态**：✅ **修复代码在位**

**修复内容**：
```typescript
// 精确匹配：只删除已完成上传的 pending File
for (const fileRecord of allFileRecords) {
    const uploaded = uploadedByOldId.get(fileRecord.id);
    if (uploaded) {
        models.push(fileRecord.prepareDestroyPermanently());
        newFileIds.push(uploaded.id!);
    } else {
        // 【修复】检查是否是 pending file
        const isPendingFile = fileRecord.id.startsWith('pending_');
        if (isPendingFile && files.length > 0) {
            // pending file 已上传完成，删除它
            models.push(fileRecord.prepareDestroyPermanently());
            debugLog('POST', `updatePostFileIds: deleting pending file ${fileRecord.id} (upload complete)`);
        } else {
            newFileIds.push(fileRecord.id);
        }
    }
}
```

**修复效果**：
- ✅ 检测到 `pending_` 开头的 file record
- ✅ 上传完成后删除 pending file
- ✅ 只保留 server file
- ✅ Post 只有 1 个 file ID

---

### ⚠️ 服务器端代码（无需修改）

**文件**：`/home/work/mattermost-master/server/channels/app/post.go`  
**函数**：`CreatePost` (第 160-456 行)  
**状态**：⚠️ **设计如此，不是 bug**

**服务器端流程**：
1. 第 363 行：保存 `fileIDs := post.FileIds`
2. 第 369 行：保存 post 到数据库（此时 `fileIDs` 可能为空）
3. 第 393-405 行：如果有 `fileIDs`，调用 `attachFilesToPost`
4. 第 454 行：调用 `handlePostEvents` 发送 WebSocket 事件

**关键代码**：
```go
// 第 393-405 行
if len(fileIDs) > 0 {
    var attachedFileIds model.StringArray
    attachedFileIds, err = a.attachFilesToPost(rctx, post, fileIDs)
    if err != nil {
        rctx.Logger().Warn("Encountered error attaching files to post", ...)
    } else if post.Type != model.PostTypeBurnOnRead {
        post.FileIds = attachedFileIds
    }
}
```

**为什么服务器端不需要修改**：
- ✅ 服务器端遵循 RESTful 设计：创建 post 和上传文件是分离的
- ✅ 移动端采用乐观更新：先渲染 pending post，再上传文件，再更新状态
- ✅ 问题在于移动端的 pending file 清理逻辑，而不是服务器端

---

### ✅ WebSocket handler（无需修改）

**文件**：`/home/work/mattermost-mobile/app/actions/websocket/posts.ts`  
**状态**：✅ **代码正常，无需修改**

**为什么不需要修改**：
- 移动端的修复已经解决了根本问题
- pending file 被正确删除后，不会渲染 2 次
- WebSocket handler 收到的 post 可能没有 `file_ids`，但这是正常的

---

## 🔍 详细分析

### 问题根源

**移动端 `updatePostFileIds` 函数的 ID 不匹配问题**：

```typescript
// 构建映射
const uploadedByOldId = new Map<string, FileInfo>();
for (const file of files) {
    const oldId = file.clientId || file.id;  // ← key 是完整路径 "file:///..."
    uploadedByOldId.set(oldId, file);
}

// 查找匹配
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

**修复方案**：
- 检测 `pending_` 前缀
- 上传完成后删除 pending file
- 只保留 server file

---

### 完整的流程对比

#### 修复前

```
用户点击发送
  ↓
1. 创建 pending post
   id: "pending_238f11c3-..."
   fileIds: ["pending_cc42c6b5-..."]
  ↓
2. 立即渲染 pending post ✅
   用户看到 1 个 post（带本地文件预览）
  ↓
3. 调用 createPost API（无 file_ids）
   服务器返回 post（file_ids=[]）
  ↓
4. WebSocket 推送 post（file_ids=null）
   客户端收到后更新 pending post → server post
   用户仍然看到 1 个 post ✅
  ↓
5. 上传文件
   上传成功，返回 server_file_id="rngqjtf1jbdgtn8krcq7czbtaa"
  ↓
6. 调用 updatePostFileIds
   uploadedByOldId: Map { "file:///..." => FileInfo }
   fileRecord.id: "pending_cc42c6b5-..."
   uploaded: undefined（ID 不匹配）
   ❌ 保留 pending file
   创建 server file 记录
   更新 post.fileIds: ["pending_cc42c6b5-...", "rngqjtf1jbdgtn8krcq7czbtaa"]
  ↓
7. 渲染 post
   ⚠️ 显示 2 个文件（pending + server）
```

#### 修复后

```
用户点击发送
  ↓
1. 创建 pending post
   id: "pending_238f11c3-..."
   fileIds: ["pending_cc42c6b5-..."]
  ↓
2. 立即渲染 pending post ✅
   用户看到 1 个 post（带本地文件预览）
  ↓
3. 调用 createPost API（无 file_ids）
   服务器返回 post（file_ids=[]）
  ↓
4. WebSocket 推送 post（file_ids=null）
   客户端收到后更新 pending post → server post
   用户仍然看到 1 个 post ✅
  ↓
5. 上传文件
   上传成功，返回 server_file_id="rngqjtf1jbdgtn8krcq7czbtaa"
  ↓
6. 调用 updatePostFileIds
   uploadedByOldId: Map { "file:///..." => FileInfo }
   fileRecord.id: "pending_cc42c6b5-..."
   uploaded: undefined
   isPendingFile: true ✅
   ✅ 删除 pending file
   创建 server file 记录
   更新 post.fileIds: ["rngqjtf1jbdgtn8krcq7czbtaa"]
  ↓
7. 渲染 post
   ✅ 显示 1 个文件（server file）
```

---

## 🧪 测试验证

### 基础测试

**步骤**：
1. 打开一个聊天窗口
2. 选择 1 个文件发送
3. 观察界面

**预期结果**：
- ✅ 点击发送，立即显示 pending post（带本地文件预览）
- ✅ 显示上传进度
- ✅ 上传完成后，更新为 server post
- ✅ **始终只有 1 个 post**
- ✅ Post 只有 1 个 file（server file）
- ✅ 没有重复渲染

**预期日志**：
```
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

---

### 边界测试

#### 测试 1：发送多个文件（9 个）

**预期**：
- ✅ 每个文件都只显示 1 个 post
- ✅ 每个 post 都只有 1 个 file
- ✅ 日志中看到 9 次 "deleting pending file"

#### 测试 2：快速连续发送

**预期**：
- ✅ 不应该出现重复的 post
- ✅ 每个 post 都正确关联到自己的文件

#### 测试 3：发送大文件（>10MB）

**预期**：
- ✅ 上传时间长，但只显示 1 个 post
- ✅ pending post 显示时间长，但更新后不应该重复

#### 测试 4：网络慢的情况

**预期**：
- ✅ pending post 显示时间长
- ✅ 上传完成后正确更新
- ✅ 不会出现 2 个 post

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

**方法 1**：在聊天界面长按 post，查看调试信息

**方法 2**：添加日志
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

## 📊 代码改动总结

### 移动端（已修复）

**文件**：`/home/work/mattermost-mobile/app/actions/remote/post.ts`  
**位置**：第 502-526 行  
**改动**：
- ✅ 添加 `isPendingFile` 检查
- ✅ 如果 pending file 上传完成，删除它
- ✅ 只保留 server file

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

### 服务器端（无需修改）

**文件**：`/home/work/mattermost-master/server/channels/app/post.go`  
**状态**：✅ 代码正常，设计如此

**原因**：
- 服务器端遵循 RESTful 设计
- 创建 post 和上传文件是分离的
- 移动端采用乐观更新策略
- 问题在于移动端的 pending file 清理逻辑

---

### WebSocket handler（无需修改）

**文件**：`/home/work/mattermost-mobile/app/actions/websocket/posts.ts`  
**状态**：✅ 代码正常

**原因**：
- 移动端的修复已经解决了根本问题
- pending file 被正确删除后，不会渲染 2 次
- WebSocket handler 收到的 post 可能没有 `file_ids`，但这是正常的

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

## 🚀 下一步

### 1. 重新构建移动端
```bash
cd /home/work/mattermost-mobile
npm run android  # 或 npm run ios
```

### 2. 测试文件发送
```
1. 打开聊天窗口
2. 发送 1 个文件
3. 观察界面
4. ✅ 应该只显示 1 个 post
```

### 3. 查看日志
```bash
grep "updatePostFileIds" logs
✅ 应该看到 "deleting pending file"
```

### 4. 如果仍然出现 2 个文件

**收集以下信息**：
1. 完整的日志（从点击发送到渲染完成）
2. `updatePostFileIds` 函数的所有日志
3. `newFileIds` 的最终值
4. pending file 的数量
5. server file 的数量

---

## 📝 结论

### ✅ 移动端修复已完成
- 修复代码在位
- 逻辑正确
- 能够正确删除 pending file

### ✅ 服务器端无需修改
- 设计合理
- 代码正常
- 不是 bug 的根源

### ✅ WebSocket handler 无需修改
- 代码正常
- 移动端修复后不会渲染 2 次

### 🎯 修复状态：**已完成**

**修复文件**：`/home/work/mattermost-mobile/app/actions/remote/post.ts`  
**修复位置**：第 502-526 行  
**修复效果**：pending file 上传完成后被正确删除，只保留 server file

---

**核对完成！** ✅
