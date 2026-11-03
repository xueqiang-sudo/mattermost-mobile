# Webapp vs Mobile: 普通文件流程对比

## ❗ 发现的差异

### 差异 1: createPost 时的 `file_ids` 字段

**Webapp** (use_submit.tsx 第 398 行):
```typescript
const filePostDraft = {
    message: isPendingFile ? '' : `!{file:${fileId}}`,
    file_ids: [],  // ✅ 关键：始终为空！
    fileInfos: uploadedFileInfo ? [uploadedFileInfo] : [],
    pending_post_id: partPendingPostId,
    props: {
        pending_files: filePf ? [{...}] : [],
        upload_progress: filePf ? {...} : {},
    },
};
```

**Mobile** (draft_handler.tsx 第 469 行):
```typescript
message = '';
fileIds = [localFile.id!];  // ❌ 差异：包含 pending file_id！

props.pending_files = [{...}];
props.upload_progress = {...};
```

### 差异 2: patchPost 时的 `file_ids` 字段

**Webapp** (upload_manager.ts 第 246 行):
```typescript
await Client4.patchPost({
    id: targetPostId,
    message: updatedMessage,
    file_ids: [realFileId],  // ✅ 单个文件
    props: {
        ...(post.props || {}),
        upload_progress: null,
        pending_files: null,
    },
});
```

**Mobile** (post.ts updatePostFileIds):
```typescript
await client.patchPost({
    id: postId,
    message: updatedMessage,
    file_ids: realFileIds,  // ❌ 数组（但实际也是单个）
    props: newProps,  // 包含 upload_status: 'completed'
});
```

---

## 📊 完整对比表

| 字段 | Webapp createPost | Mobile createPost | 差异 |
|------|-------------------|-------------------|------|
| `message` | `''` (空) | `''` (空) | ✅ 一致 |
| `file_ids` | `[]` (空数组) | `[pending_id]` | ❌ **不一致** |
| `props.pending_files` | `[{client_id, name, size, mime_type, previewUrl}]` | `[{clientId, name, size, type}]` | ⚠️ 字段名不同 |
| `props.upload_progress` | `{clientId: {progress, status}}` | `{clientId: {progress, status}}` | ✅ 一致 |
| `props.upload_status` | ❌ 无 | ✅ `'uploading'` | ⚠️ Mobile 多了这个字段 |

| 字段 | Webapp patchPost | Mobile patchPost | 差异 |
|------|------------------|------------------|------|
| `message` | 替换 `!{file:pending_xxx}` → `!{file:real_id}` | 替换 `!{file:pending_xxx}` → `!{file:real_id}` | ✅ 一致 |
| `file_ids` | `[realFileId]` (单个) | `realFileIds` (数组，但实际单个) | ⚠️ 格式不同 |
| `props.upload_progress` | `null` | `null` | ✅ 一致 |
| `props.pending_files` | `null` | `null` | ✅ 一致 |
| `props.upload_status` | ❌ 无 | ✅ `'completed'` | ⚠️ Mobile 多了这个字段 |

---

## 🔍 差异分析

### 差异 1: `file_ids` 在 createPost 时

**Webapp**: `file_ids: []` (空数组)
- ✅ 优点：语义清晰，pending 文件还没有真实 file_id
- ✅ 接收端通过 `props.pending_files` 渲染"上传中"状态
- ✅ patchPost 时才添加真实 file_id

**Mobile**: `file_ids: [pending_id]` (pending file_id)
- ✅ 优点：本地数据库可以通过 file_ids 找到 File 记录
- ✅ 本地渲染进度条需要 file_ids 关联
- ❌ 语义不清晰：pending_id 不是真实的服务器 file_id

**影响**:
- Webapp 接收端看到 `file_ids: []`，知道文件还在上传
- Mobile 接收端看到 `file_ids: [pending_id]`，需要通过 `props.upload_status` 判断状态

### 差异 2: `props.pending_files` 字段名

**Webapp**: 
```typescript
pending_files: [{
    client_id: filePf.clientId,  // snake_case
    name: filePf.name,
    size: filePf.size,
    mime_type: filePf.type,      // snake_case
    previewUrl: filePf.previewUrl,
}]
```

**Mobile**:
```typescript
pending_files: [{
    clientId: localFile.clientId || localFile.id,  // camelCase
    name: localFile.name,
    size: localFile.size || 0,
    type: localFile.mime_type || 'application/octet-stream',  // 不是 mime_type
}]
```

**影响**:
- ❌ 字段名不一致（`client_id` vs `clientId`，`mime_type` vs `type`）
- ❌ 接收端解析时可能出错

### 差异 3: `props.upload_status` 字段

**Webapp**: ❌ 没有这个字段

**Mobile**: ✅ 有
```typescript
props: {
    upload_status: 'uploading',  // createPost 时
    upload_status: 'completed',  // patchPost 时
}
```

**影响**:
- ✅ Mobile 可以通过 `upload_status` 快速判断状态
- ❌ Webapp 没有这个字段，需要通过 `pending_files` 是否存在来判断

---

## 🎯 是否需要对齐？

### 建议 1: `file_ids` 字段（**不建议修改**）

**原因**:
- ✅ Mobile 的 `[pending_id]` 设计是为了本地数据库追踪
- ✅ 本地 File 记录需要通过 file_ids 关联
- ✅ 接收端可以通过 `props.upload_status` 或 `props.pending_files` 判断状态
- ❌ 改为 `[]` 会破坏本地数据库的关联逻辑

**结论**: 保持现状，这是架构差异导致的合理差异。

### 建议 2: `props.pending_files` 字段名（**建议对齐**）

**原因**:
- ❌ 字段名不一致会导致接收端解析错误
- ✅ 应该统一使用 snake_case（对齐服务器 API）
- ✅ 应该使用 `mime_type` 而不是 `type`

**修改建议**:
```typescript
props.pending_files = [{
    client_id: localFile.clientId || localFile.id,  // snake_case
    name: localFile.name,
    size: localFile.size || 0,
    mime_type: localFile.mime_type || 'application/octet-stream',  // snake_case
}];
```

### 建议 3: `props.upload_status` 字段（**保持现状**）

**原因**:
- ✅ Mobile 的 `upload_status` 是增强功能，便于快速判断状态
- ✅ 不影响接收端（接收端可以通过 `pending_files` 判断）
- ❌ Webapp 没有这个字段，但也不冲突

**结论**: 保持现状，这是 Mobile 的增强功能。

---

## 📝 修改方案

### 修改 1: 对齐 `props.pending_files` 字段名

**位置**: `app/components/post_draft/draft_handler/draft_handler.tsx` 第 471-476 行

**当前代码**:
```typescript
props.pending_files = [{
    clientId: localFile.clientId || localFile.id,  // ❌ camelCase
    name: localFile.name,
    size: localFile.size || 0,
    type: localFile.mime_type || 'application/octet-stream',  // ❌ 不是 mime_type
}];
```

**修改后**:
```typescript
props.pending_files = [{
    client_id: localFile.clientId || localFile.id,  // ✅ snake_case
    name: localFile.name,
    size: localFile.size || 0,
    mime_type: localFile.mime_type || 'application/octet-stream',  // ✅ snake_case
    previewUrl: null,  // ✅ 对齐 webapp（普通文件无 previewUrl）
}];
```

---

## 🔄 完整流程对比

### Webapp 流程

```
createPost:
  message: ''
  file_ids: []                    ← 空数组
  props:
    pending_files: [{client_id, name, size, mime_type, previewUrl}]
    upload_progress: {clientId: {progress: 0, status: 'uploading'}}
    ↓
上传文件
    ↓
patchPost:
  message: '!{file:real_id}'
  file_ids: [realFileId]          ← 单个真实 ID
  props:
    pending_files: null
    upload_progress: null
```

### Mobile 流程

```
createPost:
  message: ''
  file_ids: [pending_id]          ← pending file_id
  props:
    pending_files: [{clientId, name, size, type}]  ← 字段名不同
    upload_progress: {clientId: {progress: 0, status: 'uploading'}}
    upload_status: 'uploading'    ← 多了这个字段
    ↓
上传文件
    ↓
patchPost:
  message: '!{file:real_id}'
  file_ids: [realFileId]          ← 数组（但实际单个）
  props:
    pending_files: null
    upload_progress: null
    upload_status: 'completed'    ← 多了这个字段
```

---

## ✅ 总结

### 一致的部分

- ✅ `message`: createPost 时为空，patchPost 时包含 `!{file:real_id}`
- ✅ `props.upload_progress`: 格式一致
- ✅ `props.pending_files`: 存在性一致（createPost 时有，patchPost 时为 null）

### 差异的部分

- ⚠️ `file_ids`: createPost 时 Webapp 为空，Mobile 为 `[pending_id]`（**合理差异**）
- ❌ `props.pending_files` 字段名: Webapp 用 `client_id/mime_type`，Mobile 用 `clientId/type`（**需要对齐**）
- ⚠️ `props.upload_status`: Mobile 有，Webapp 无（**增强功能，保持现状**）

### 建议

1. ✅ **保持** `file_ids: [pending_id]`（架构差异，合理）
2. ❌ **修改** `props.pending_files` 字段名（对齐 snake_case）
3. ✅ **保持** `props.upload_status`（增强功能，不冲突）

---

## 📌 下一步行动

如果你希望对齐 `props.pending_files` 字段名，我可以立即修改。需要修改吗？
