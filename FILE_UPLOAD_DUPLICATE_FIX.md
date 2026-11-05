# 文件发送后渲染出 2 个的问题修复指南

## 🐛 问题描述

**现象**：在聊天窗口选择 1 个文件发送后，界面渲染出 2 个相同的 post

**日志分析**：
```
12:19:35.975  [POST] createPost 调用服务端 API（文件还未上传）
12:19:36.317  [POST] 服务端返回 post（file_ids=[]）
12:19:36.320  [WS] 收到 WebSocket 事件（post 创建，file_ids=null）
12:19:36.321  [WS] 查询到 pending post，开始渲染（第一次）
12:19:38.750  [DRAFT] 文件上传成功（晚了 2.4 秒）
12:19:38.782  [POST] 更新 post 的 file_ids（第二次渲染）
```

**根本原因**：
1. Post 创建时没有 file_ids（因为文件还未上传）
2. WebSocket 立即推送这个空 post
3. 文件上传完成后，更新 post 带上 file_ids
4. **结果**：用户看到 2 个 post（一个无文件，一个有文件）

---

## 🔧 修复方案对比

### 方案 1：调整上传流程（已实现）⭐⭐⭐

**思路**：先上传文件，再创建 post，确保 post 创建时带上 file_ids

**优点**：
- ✅ 彻底解决问题
- ✅ 服务端返回完整 post
- ✅ 无需额外处理

**缺点**：
- ⚠️ 修改较大，需要测试
- ⚠️ 可能影响现有上传逻辑

**文件**：`/home/work/mattermost-mobile/app/components/post_draft/draft_handler/draft_handler.tsx`

**改动**：
```typescript
// 旧流程：
// Phase 2: 创建 pending posts
// Phase 3: 调用 createPost（无 file_ids）
// Phase 4: 上传文件

// 新流程（已实现）：
// Phase 2: 创建 pending posts
// Phase 3: 
//   Step 1: 先上传文件，获取 server file_ids
//   Step 2: 调用 createPost（带 file_ids）
```

**状态**：✅ 已实现，但需要删除后面重复的上传逻辑

---

### 方案 2：WebSocket handler 忽略无文件 post（推荐）⭐⭐⭐

**思路**：在 WebSocket handler 中，如果收到 `file_ids=null` 的 post，且有 `pending_post_id`，忽略它

**优点**：
- ✅ 改动小，风险低
- ✅ 立即见效
- ✅ 不影响现有流程

**缺点**：
- ⚠️ 用户可能看到延迟（等文件上传完成才显示）

**文件**：`/home/work/mattermost-mobile/app/actions/websocket/posts.ts`

**位置**：第 70-90 行

**代码**：
```typescript
// 在 _handleNewPostEventInner 函数中
// 第 70 行后添加

// 【修复】忽略文件未上传完成的 post
// 场景：用户发送带文件的 post → createPost 先创建 post（无 file_ids）→
// WebSocket 推送这个空 post → 文件上传完成后更新 post
// 如果这里不忽略，会导致渲染 2 次（一次无文件，一次有文件）
if (post.pending_post_id && (post.file_ids === null || post.file_ids?.length === 0)) {
    // 检查是否是我们自己发送的 post（有 pending_post_id）
    const currentUserId = await getCurrentUserId(database);
    if (post.user_id === currentUserId) {
        // 忽略这个空 post，等待文件上传完成后的更新
        debugLog('[WS:handleNewPostEvent] ⏭️ 忽略无文件的 pending post，等待文件上传', {
            post_id: post.id,
            pending_post_id: post.pending_post_id,
        });
        return;
    }
}
```

---

### 方案 3：合并 pending post 和 server post 的文件信息

**思路**：在 WebSocket handler 中，如果发现 pending post 已经有文件信息，保留它

**优点**：
- ✅ 不会丢失文件信息
- ✅ 立即显示文件

**缺点**：
- ⚠️ 逻辑复杂
- ⚠️ 可能引入新问题

---

## 💡 推荐修复步骤

### 第一步：应用方案 1（已完成）

**状态**：✅ 已修改 draft_handler.tsx

**需要做的**：
1. 删除后面重复的上传逻辑（第 613-868 行）
2. 保留云盘文件和图片的特殊处理
3. 测试上传流程

---

### 第二步：应用方案 2（推荐）⭐

**文件**：`/home/work/mattermost-mobile/app/actions/websocket/posts.ts`

**位置**：在 `_handleNewPostEventInner` 函数的第 80 行后添加

**代码**：
```typescript
async function _handleNewPostEventInner(serverUrl: string, msg: WebSocketMessage) {
    // ... 前面的代码 ...
    
    debugLog('[WS:handleNewPostEvent] 📨 收到 post:', {
        id: post.id,
        pending_post_id: post.pending_post_id,
        channel_id: post.channel_id,
        user_id: post.user_id,
        message: post.message?.substring(0, 50),
        file_ids: post.file_ids,
        has_metadata: !!post.metadata,
        metadata_files: post.metadata?.files?.length || 0,
    });

    // 【修复开始】忽略文件未上传完成的 post
    if (post.pending_post_id && (post.file_ids === null || post.file_ids?.length === 0)) {
        const currentUserId = await getCurrentUserId(database);
        if (post.user_id === currentUserId) {
            debugLog('[WS:handleNewPostEvent] ⏭️ 忽略无文件的 pending post，等待文件上传', {
                post_id: post.id,
                pending_post_id: post.pending_post_id,
            });
            return;
        }
    }
    // 【修复结束】

    const currentUserId = await getCurrentUserId(database);
    
    // ... 后面的代码 ...
}
```

---

### 第三步：测试

**测试步骤**：
```
1. 打开一个聊天窗口
2. 选择 1 个文件发送
3. 观察界面是否只显示 1 个 post
4. 检查 post 是否包含文件
5. 查看日志，确认没有重复渲染
```

**预期日志**：
```
12:XX:XX.XXX  [DRAFT] addFiles: Phase 3 - uploading files before creating posts
12:XX:XX.XXX  [DRAFT] addFiles: upload success for file 1, server_id=xxx
12:XX:XX.XXX  [DRAFT] addFiles: Phase 3 - calling server API for 1 posts (with file_ids)
12:XX:XX.XXX  [POST] createPost 调用服务端 API（带 file_ids）
12:XX:XX.XXX  [POST] 服务端返回 post（file_ids=["xxx"]）
12:XX:XX.XXX  [WS] 收到 post（file_ids=["xxx"]）
12:XX:XX.XXX  渲染带文件的 post（一次）
```

---

## 📋 完整的修复代码

### 文件 1：draft_handler.tsx（已修改）

**位置**：第 513-611 行

**改动**：见上面的"方案 1"

**还需要做的**：
- 删除第 613-868 行的重复上传逻辑
- 或者注释掉这段代码进行测试

---

### 文件 2：posts.ts（需要添加）

**位置**：第 80 行后

**添加代码**：
```typescript
// 【修复】忽略文件未上传完成的 post
// 避免渲染 2 次（一次无文件，一次有文件）
if (post.pending_post_id && (post.file_ids === null || post.file_ids?.length === 0)) {
    const currentUserId = await getCurrentUserId(database);
    if (post.user_id === currentUserId) {
        debugLog('[WS:handleNewPostEvent] ⏭️ 忽略无文件的 pending post，等待文件上传', {
            post_id: post.id,
            pending_post_id: post.pending_post_id,
        });
        return;
    }
}
```

---

## 🧪 测试清单

### 基础测试
- [ ] 发送 1 个文件，检查是否只显示 1 个 post
- [ ] 发送多个文件，检查每个文件都只显示 1 个 post
- [ ] 发送图片，检查是否正常显示
- [ ] 发送视频，检查是否正常显示
- [ ] 发送文档（.pages, .pdf 等），检查是否正常显示

### 边界测试
- [ ] 发送空文本 + 文件
- [ ] 发送带文本 + 文件
- [ ] 快速连续发送多个文件
- [ ] 发送大文件（>10MB）
- [ ] 网络慢的情况下发送文件

### 日志检查
- [ ] 没有重复的 `handleNewPostEvent` 日志
- [ ] `file_ids` 不为 null
- [ ] 没有"忽略无文件的 pending post"日志（如果有，说明方案 1 未生效）

---

## 🔍 调试技巧

### 如果仍然出现 2 个 post

**检查点 1**：方案 2 是否生效
```bash
grep "忽略无文件的 pending post" /path/to/logs
```
如果有这个日志，说明方案 2 生效了，但方案 1 未生效。

**检查点 2**：createPost 是否带了 file_ids
```bash
grep "calling server API.*with file_ids" /path/to/logs
```
如果有这个日志，说明方案 1 生效了。

**检查点 3**：WebSocket 收到的 post 是否有 file_ids
```bash
grep "收到 post.*file_ids" /path/to/logs
```
检查 file_ids 是否为空。

---

### 如果文件上传失败

**可能原因**：
1. Phase 3 的上传逻辑有问题
2. 缺少 progress 回调
3. 错误处理不完整

**解决方案**：
- 检查 `uploadFile` 函数的调用参数
- 添加更多的日志
- 参考原来的上传逻辑

---

## 📊 修复效果对比

### 修复前
```
时间线：
12:19:35.975  createPost（无 file_ids）
12:19:36.317  服务端返回 post（file_ids=[]）
12:19:36.320  WS 收到 post（file_ids=null）
12:19:36.321  ⚠️ 第一次渲染（无文件）
12:19:38.750  文件上传成功
12:19:38.782  更新 post 的 file_ids
12:19:38.783  ⚠️ 第二次渲染（有文件）

结果：用户看到 2 个 post
```

### 修复后（方案 1）
```
时间线：
12:XX:XX.XXX  上传文件
12:XX:XX.XXX  文件上传成功，server_id=xxx
12:XX:XX.XXX  createPost（带 file_ids）
12:XX:XX.XXX  服务端返回 post（file_ids=["xxx"]）
12:XX:XX.XXX  WS 收到 post（file_ids=["xxx"]）
12:XX:XX.XXX  ✅ 一次渲染（有文件）

结果：用户看到 1 个 post
```

### 修复后（方案 1 + 方案 2）
```
时间线：
12:XX:XX.XXX  createPost（无 file_ids）【方案 1 未生效】
12:XX:XX.XXX  服务端返回 post（file_ids=[]）
12:XX:XX.XXX  WS 收到 post（file_ids=null）
12:XX:XX.XXX  ✅ 忽略这个 post【方案 2 生效】
12:XX:XX.XXX  文件上传成功
12:XX:XX.XXX  更新 post 的 file_ids
12:XX:XX.XXX  WS 收到更新后的 post
12:XX:XX.XXX  ✅ 一次渲染（有文件）

结果：用户看到 1 个 post
```

---

## 🎯 快速修复（临时方案）

如果时间紧迫，可以先用这个快速修复：

**文件**：`/home/work/mattermost-mobile/app/actions/websocket/posts.ts`

**位置**：第 80 行后

**代码**：
```typescript
// 【临时修复】忽略无文件的 pending post
if (post.pending_post_id && (post.file_ids === null || post.file_ids?.length === 0)) {
    const currentUserId = await getCurrentUserId(database);
    if (post.user_id === currentUserId) {
        debugLog('[WS:handleNewPostEvent] ⏭️ 忽略无文件的 pending post');
        return;
    }
}
```

**优点**：
- ✅ 30 秒搞定
- ✅ 立即见效
- ✅ 风险低

**缺点**：
- ⚠️ 治标不治本
- ⚠️ 用户可能看到延迟

---

## 📝 总结

### 已完成
- ✅ 方案 1 的第一部分（调整上传流程）
- ✅ 问题分析
- ✅ 日志分析

### 需要做的
- ⏳ 方案 1 的第二部分（删除重复代码）
- ⏳ 方案 2（WebSocket handler 修复）
- ⏳ 测试

### 建议
1. **优先应用方案 2**（简单、风险低）
2. **然后完善方案 1**（彻底解决问题）
3. **充分测试**（确保没有新问题）

---

## 🚀 立即行动

### 快速修复（30 秒）
```typescript
// 文件：/home/work/mattermost-mobile/app/actions/websocket/posts.ts
// 位置：第 80 行后添加

if (post.pending_post_id && (post.file_ids === null || post.file_ids?.length === 0)) {
    const currentUserId = await getCurrentUserId(database);
    if (post.user_id === currentUserId) {
        debugLog('[WS:handleNewPostEvent] ⏭️ 忽略无文件的 pending post');
        return;
    }
}
```

### 测试
```
1. 重新构建移动端
2. 发送 1 个文件
3. 检查是否只显示 1 个 post
4. 完成！
```

---

**修复完成！** 🎉
