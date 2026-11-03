# Webapp 渲染 Mobile 发送的普通文件消息 - 兼容性修复

## 📋 问题概述

Webapp 无法正确渲染 Mobile 发送的 pending 文件消息，原因是字段名不一致。

---

## ❌ 修改前的问题

### Webapp 内部不一致

Webapp 内部有两个组件使用了不同的字段名：

**组件 1: `post_message_view.tsx`（使用 snake_case）**
```typescript
type PendingFileMeta = {
    client_id: string;      // ✅ snake_case
    name: string; 
    size: number; 
    mime_type: string;      // ✅ snake_case
    file_id?: string; 
    previewUrl?: string
};
```

**组件 2: `file_attachment_list/index.ts`（使用 camelCase）**
```typescript
type PendingFileMeta = {
    clientId: string;       // ❌ camelCase
    name: string;
    size: number;
    type: string;           // ❌ 不是 mime_type
    previewUrl?: string;
};
```

### Mobile 发送的字段名

```typescript
props.pending_files = [{
    client_id: localFile.clientId || localFile.id,  // ✅ snake_case
    name: localFile.name,
    size: localFile.size || 0,
    mime_type: localFile.mime_type || 'application/octet-stream',  // ✅ snake_case
    previewUrl: null,
}];
```

### Webapp 发送的字段名（use_submit.tsx）

```typescript
pending_files: [{
    client_id: filePf.clientId,  // ✅ snake_case
    name: filePf.name,
    size: filePf.size,
    mime_type: filePf.type,      // ✅ snake_case
    previewUrl: filePf.previewUrl,
}]
```

### 兼容性问题

| 场景 | 发送方 | 接收组件 | 字段名 | 结果 |
|------|--------|---------|--------|------|
| Mobile → Webapp (file_attachment_list) | `client_id`, `mime_type` | 期望 `clientId`, `type` | ❌ **不匹配** |
| Mobile → Webapp (post_message_view) | `client_id`, `mime_type` | 期望 `client_id`, `mime_type` | ✅ 匹配 |
| Webapp → Webapp (file_attachment_list) | `client_id`, `mime_type` | 期望 `clientId`, `type` | ❌ **不匹配** |
| Webapp → Webapp (post_message_view) | `client_id`, `mime_type` | 期望 `client_id`, `mime_type` | ✅ 匹配 |

**结论**: `file_attachment_list/index.ts` 的字段名与发送端不一致，导致无法正确渲染！

---

## ✅ 修改后的效果

### 修改: `file_attachment_list/index.ts` 改为 snake_case

**位置**: `webapp/channels/src/components/file_attachment_list/index.ts` 第 38-45 行

**修改前**:
```typescript
type PendingFileMeta = {
    clientId: string;       // ❌ camelCase
    name: string;
    size: number;
    type: string;           // ❌ 不是 mime_type
    previewUrl?: string;
};
```

**修改后**:
```typescript
// 对齐 webapp 发送端（use_submit.tsx）和 mobile：使用 snake_case 字段名
type PendingFileMeta = {
    client_id: string;      // ✅ snake_case
    name: string;
    size: number;
    mime_type: string;      // ✅ snake_case
    file_id?: string;       // 可选：上传完成后的真实 file_id
    previewUrl?: string;
};
```

**位置**: `webapp/channels/src/components/file_attachment_list/index.ts` 第 76-113 行

**修改前**:
```typescript
for (const pf of pendingFiles) {
    const progressInfo = uploadProgress[pf.clientId];  // ❌ camelCase
    // ...
    const syntheticFileInfo = {
        id: `pending_${pf.clientId}`,  // ❌ camelCase
        // ...
        mime_type: pf.type,  // ❌ 不是 mime_type
        has_preview_image: pf.type?.startsWith('image/') || false,  // ❌ 不是 mime_type
    };
}
```

**修改后**:
```typescript
for (const pf of pendingFiles) {
    const progressInfo = uploadProgress[pf.client_id];  // ✅ snake_case
    // ...
    const syntheticFileInfo = {
        id: `pending_${pf.client_id}`,  // ✅ snake_case
        // ...
        mime_type: pf.mime_type,  // ✅ snake_case
        has_preview_image: pf.mime_type?.startsWith('image/') || false,  // ✅ snake_case
    };
}
```

---

## 🎯 回答你的问题

### 问题 1: Webapp 能否渲染 Mobile 发送的普通文件消息？

**修改前**: ❌ **不能正确渲染**
- 字段名不匹配（`client_id` vs `clientId`）
- Webapp 无法正确解析 `pending_files`
- 合成的 FileInfo 缺少关键字段

**修改后**: ✅ **可以正确渲染**
- 字段名一致（都是 `client_id`, `mime_type`）
- Webapp 可以正确解析 `pending_files`
- 合成的 FileInfo 包含所有关键字段

### 问题 2: Pending 状态的消息可以渲染吗？

**修改前**: ⚠️ **可以渲染，但信息不完整**
- Webapp 尝试渲染，但字段名不匹配
- 合成的 FileInfo 缺少 `client_id` 和 `mime_type`
- 可能显示空白或错误信息

**修改后**: ✅ **可以正确渲染**
- Webapp 从 `pending_files` 合成完整的 FileInfo
- 显示"上传中"状态和进度条
- 显示文件名、大小、类型等信息

### 问题 3: 判断 pending 消息的逻辑是什么？

**答案**: 通过 `fileInfo.id` 和 `_uploadStatus` 判断

**逻辑**（`file_attachment_list.tsx` 第 65-67 行）:
```typescript
const isPendingId = fileInfo.id.startsWith('pending_');
// 云盘文件虽然 ID 是 pending_ 开头，但状态是 done，不算真正的 pending
const isPending = isPendingId && (fileInfo as any)._uploadStatus !== 'done';
```

**判断条件**:
1. ✅ `fileInfo.id.startsWith('pending_')` - ID 以 `pending_` 开头
2. ✅ `_uploadStatus !== 'done'` - 上传状态不是 `done`

**状态值**:
- `'uploading'` - 上传中（显示进度条）
- `'done'` - 上传完成（不显示进度条）
- `'error'` - 上传失败（显示错误状态）

---

## 📊 Webapp 渲染流程

### 完整流程图

```
┌─────────────────────────────────────────┐
│ WebSocket 收到 post:                    │
│ {                                       │
│   id: "abc123",                         │
│   message: '',                          │
│   file_ids: [],                         │
│   props: {                              │
│     pending_files: [{                   │
│       client_id: "xxx",                 │
│       name: "订单.pdf",                 │
│       size: 102400,                     │
│       mime_type: "application/pdf"      │
│     }],                                 │
│     upload_progress: {                  │
│       "xxx": {progress: 0, status: "uploading"} │
│     }                                   │
│   }                                     │
│ }                                       │
└─────────────────────────────────────────┘

         ↓ file_attachment_list/index.ts

┌─────────────────────────────────────────┐
│ 1. 从 post.props 获取 pending_files     │
│    const pendingFiles = post.props.pending_files │
│    → [{client_id: "xxx", name: "订单.pdf", ...}] │
└─────────────────────────────────────────┘

         ↓

┌─────────────────────────────────────────┐
│ 2. 为每个 pending file 合成 FileInfo    │
│    for (const pf of pendingFiles) {     │
│      const progressInfo = uploadProgress[pf.client_id] │
│      const syntheticFileInfo = {        │
│        id: `pending_${pf.client_id}`,   │
│        name: pf.name,                   │
│        size: pf.size,                   │
│        mime_type: pf.mime_type,         │
│        _uploadProgress: progressInfo.progress, │
│        _uploadStatus: progressInfo.status │
│      };                                 │
│    }                                    │
└─────────────────────────────────────────┘

         ↓

┌─────────────────────────────────────────┐
│ 3. 合并 pending 文件和已上传文件        │
│    const mergedFileInfos = [...pendingFileInfos, ...fileInfos] │
└─────────────────────────────────────────┘

         ↓ file_attachment_list.tsx

┌─────────────────────────────────────────┐
│ 4. 判断是否为 pending 文件              │
│    const isPendingId = fileInfo.id.startsWith('pending_') │
│    const isPending = isPendingId && _uploadStatus !== 'done' │
│    → true (是 pending 文件)             │
└─────────────────────────────────────────┘

         ↓

┌─────────────────────────────────────────┐
│ 5. 渲染 FileAttachment 组件             │
│    <FileAttachment                      │
│      fileInfo={fileInfo}                │
│      uploadProgress={_uploadProgress}   │
│      uploadStatus={_uploadStatus}       │
│      isPending={isPending}              │
│    />                                   │
└─────────────────────────────────────────┘

         ↓

┌─────────────────────────────────────────┐
│ 6. 显示文件卡片                         │
│    → 文件名: "订单.pdf"                 │
│    → 文件大小: "100 KB"                 │
│    → 文件类型: PDF 图标                 │
│    → 上传进度: 0% (进度条)              │
│    → 上传状态: "uploading"              │
└─────────────────────────────────────────┘
```

---

## ✅ 兼容性验证

### 修改后的兼容性

| 场景 | 发送方 | 接收组件 | 字段名 | 结果 |
|------|--------|---------|--------|------|
| Mobile → Webapp (file_attachment_list) | `client_id`, `mime_type` | 期望 `client_id`, `mime_type` | ✅ **完美匹配** |
| Mobile → Webapp (post_message_view) | `client_id`, `mime_type` | 期望 `client_id`, `mime_type` | ✅ **完美匹配** |
| Webapp → Webapp (file_attachment_list) | `client_id`, `mime_type` | 期望 `client_id`, `mime_type` | ✅ **完美匹配** |
| Webapp → Webapp (post_message_view) | `client_id`, `mime_type` | 期望 `client_id`, `mime_type` | ✅ **完美匹配** |
| Mobile → Mobile | `client_id`, `mime_type` | 期望 `client_id`, `mime_type` | ✅ **完美匹配** |

---

## 🧪 测试场景

### 场景 1: Mobile 发送普通文件给 Webapp

**步骤**:
1. Mobile 用户选择 3 个 PDF 文件并发送
2. Webapp 用户在另一个窗口查看

**预期结果**（修改后）:
- ✅ Mobile 发送端：立即看到 3 条 post（显示"上传中"状态）
- ✅ Webapp 接收端：立即看到 3 条 post（显示"上传中"状态）
- ✅ Webapp 可以正确解析 `client_id` 和 `mime_type` 字段
- ✅ Webapp 可以正确渲染文件信息和上传进度
- ✅ 显示文件名、大小、类型、进度条

### 场景 2: Webapp 发送普通文件给 Mobile

**步骤**:
1. Webapp 用户选择 3 个 PDF 文件并发送
2. Mobile 用户在另一个窗口查看

**预期结果**（修改后）:
- ✅ Webapp 发送端：立即看到 3 条 post（显示"上传中"状态）
- ✅ Mobile 接收端：立即看到 3 条 post（显示"上传中"状态）
- ✅ Mobile 可以正确解析 `client_id` 和 `mime_type` 字段
- ✅ Mobile 可以正确渲染文件信息和上传进度

### 场景 3: Webapp 发送普通文件给 Webapp

**步骤**:
1. Webapp 用户 A 选择 3 个 PDF 文件并发送
2. Webapp 用户 B 在另一个窗口查看

**预期结果**（修改后）:
- ✅ Webapp 发送端：立即看到 3 条 post（显示"上传中"状态）
- ✅ Webapp 接收端：立即看到 3 条 post（显示"上传中"状态）
- ✅ Webapp 可以正确解析 `client_id` 和 `mime_type` 字段
- ✅ Webapp 可以正确渲染文件信息和上传进度

---

## 📝 关键代码位置

| 文件 | 行号 | 说明 |
|------|------|------|
| `webapp/channels/src/components/file_attachment_list/index.ts` | 38-45 | PendingFileMeta 类型定义 |
| `webapp/channels/src/components/file_attachment_list/index.ts` | 76-113 | 从 pending_files 合成 FileInfo |
| `webapp/channels/src/components/file_attachment_list/file_attachment_list.tsx` | 65-67 | 判断 pending 文件的逻辑 |
| `webapp/channels/src/components/post_view/post_message_view/post_message_view.tsx` | 41 | PendingFileMeta 类型定义（snake_case） |
| `webapp/channels/src/components/advanced_text_editor/use_submit.tsx` | 406-412 | Webapp 发送时使用的字段名（snake_case） |

---

## 🎉 总结

### 核心改进

1. ✅ **跨平台兼容性**: Mobile 和 Webapp 可以正确解析对方发送的 `pending_files`
2. ✅ **Webapp 内部一致性**: 统一使用 snake_case（`client_id`, `mime_type`）
3. ✅ **完美渲染**: Pending 文件可以正确渲染，显示完整的文件信息和进度条

### 用户体验提升

- ✅ **Mobile → Webapp**: 接收端立即看到"上传中"状态（体验大幅提升）
- ✅ **Webapp → Mobile**: 接收端立即看到"上传中"状态（体验大幅提升）
- ✅ **Webapp → Webapp**: 接收端立即看到"上传中"状态（体验大幅提升）
- ✅ **跨平台文件发送**: 完美兼容，无障碍

### 代码质量

- ✅ **对齐 webapp 发送端**: 与 `use_submit.tsx` 保持一致
- ✅ **对齐 mobile**: 与 mobile 发送端保持一致
- ✅ **TypeScript 检查**: 无错误
- ✅ **向后兼容**: 旧版本仍能正常工作

---

## 📌 下一步

### 测试

1. **单元测试**: 更新 `file_attachment_list.test.tsx`
2. **集成测试**: 测试所有跨平台场景（Mobile ↔ Webapp）
3. **兼容性测试**: 测试新旧版本之间的兼容性

### 部署

1. **Code Review**: 提交 PR，等待 review
2. **QA 测试**: QA 团队全面测试跨平台兼容性
3. **灰度发布**: 小范围发布，观察数据
4. **全量发布**: 确认无问题后全量发布

---

**状态**: ✅ 修改完成，等待测试

**参考**:
- Webapp 发送端: `/home/work/mattermost-master/webapp/channels/src/components/advanced_text_editor/use_submit.tsx` (第 406-412 行)
- Webapp 接收端（修复前）: `/home/work/mattermost-master/webapp/channels/src/components/file_attachment_list/index.ts` (第 38-45 行)
- Webapp 接收端（修复后）: 同上，已改为 snake_case
