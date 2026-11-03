# 文件重复渲染 Bug 修复

## 📋 问题描述

### 用户反馈
在聊天窗口选择文件后，渲染出**两个相同的文件信息**：
- 一个显示"发送中"状态
- 一个是静态的（无进度条）

### 问题场景
1. 用户点击聊天窗口的 `+` 号
2. 选择"文件"
3. 选择手机文件
4. 结果：聊天窗口显示两个相同的文件卡片

---

## 🐛 Bug 分析

### 根本原因

**Mobile 端** (`app/components/files/index.ts` 第 72 行):

```typescript
// 修复前（错误逻辑）
const realFileId = progressInfo?.status === 'done' ? undefined : undefined;
if (dbFiles.some((f) => f.id === realFileId)) {
    continue;
}
```

**问题**:
- `realFileId` 无论如何都是 `undefined`
- 检查 `dbFiles.some((f) => f.id === undefined)` 永远为 `false`
- 导致重复检查失效

**Webapp 端** (`webapp/channels/src/components/file_attachment_list/index.ts` 第 90-93 行):

```typescript
// 修复前（不完整逻辑）
const realFileId = progressInfo?.realFileId;
if (realFileId && fileInfos.some((fi) => fi.id === realFileId)) {
    continue;
}
```

**问题**:
- 只检查真实文件 ID，不检查 pending ID
- 在 pending 状态下，`realFileId` 可能不存在
- 导致重复检查不完整

### 渲染流程分析

```
用户选择文件
    ↓
draft_handler.tsx:
  1. 创建 pending post（带 pending_files props）
  2. 创建 File 记录（id = "pending_xxx", post_id = post.id）
    ↓
files/index.ts 渲染:
  1. 从 DB 查询 File 记录 → 得到 [File {id: "pending_xxx"}]
  2. 从 pending_files 合成 FileInfo → 得到 [FileInfo {id: "pending_xxx"}]
  3. 合并两者 → [File, FileInfo]（重复！）
    ↓
❌ 显示两个相同的文件卡片
```

---

## 🔧 修复方案

### 修复 1: Mobile 端 (`app/components/files/index.ts`)

**修改前**（第 71-75 行）:
```typescript
// 如果 DB 中已有对应的真实文件记录（上传完成），跳过合成
const realFileId = progressInfo?.status === 'done' ? undefined : undefined;  // ❌ 永远返回 undefined
if (dbFiles.some((f) => f.id === realFileId)) {
    continue;
}
```

**修改后**:
```typescript
// 检查 DB 中是否已有对应的文件记录（通过 pending ID）
const pendingId = `pending_${pf.client_id}`;
if (dbFiles.some((f) => f.id === pendingId)) {
    // DB 中已有 pending 记录，跳过合成（避免重复渲染）
    continue;
}
```

**改进**:
- ✅ 检查 `pending_${client_id}` 是否已存在于 DB
- ✅ 如果存在，跳过合成，避免重复
- ✅ 逻辑清晰，易于理解

---

### 修复 2: Webapp 端 (`webapp/channels/src/components/file_attachment_list/index.ts`)

**修改前**（第 89-93 行）:
```typescript
// 如果已有真实 FileInfo（上传完成），跳过合成（避免重复渲染）
const realFileId = progressInfo?.realFileId;  // ❌ 只检查真实 ID
if (realFileId && fileInfos.some((fi) => fi.id === realFileId)) {
    continue;
}
```

**修改后**:
```typescript
// 检查是否已有对应的 FileInfo（通过 pending ID 或真实 ID），避免重复渲染
const pendingId = `pending_${pf.client_id}`;
if (fileInfos.some((fi) => fi.id === pendingId)) {
    // 已有 pending 记录，跳过合成
    continue;
}

// 如果有真实文件 ID，也检查是否已存在
const realFileId = progressInfo?.realFileId;
if (realFileId && fileInfos.some((fi) => fi.id === realFileId)) {
    // 已有真实记录，跳过合成
    continue;
}
```

**改进**:
- ✅ 先检查 pending ID（`pending_${client_id}`）
- ✅ 再检查真实 ID（`realFileId`）
- ✅ 双重检查，确保不重复

---

## ✅ 修复验证

### 测试用例 1: 选择单个文件

**步骤**:
1. 点击聊天窗口 `+` 号
2. 选择"文件"
3. 选择一个文件

**预期结果**（修复后）:
- ✅ 只显示一个文件卡片
- ✅ 显示"发送中"状态和进度条
- ✅ 上传完成后，进度条消失

**修复前**:
- ❌ 显示两个相同的文件卡片
- ❌ 一个有进度条，一个没有

---

### 测试用例 2: 选择多个文件

**步骤**:
1. 点击聊天窗口 `+` 号
2. 选择"文件"
3. 选择 3 个文件

**预期结果**（修复后）:
- ✅ 显示 3 个文件卡片
- ✅ 每个卡片都显示"发送中"状态
- ✅ 上传完成后，进度条消失

**修复前**:
- ❌ 显示 6 个文件卡片（每个文件重复两次）

---

### 测试用例 3: 接收端渲染

**步骤**:
1. A 用户发送文件给 B 用户
2. B 用户查看聊天窗口

**预期结果**（修复后）:
- ✅ B 用户只看到一个文件卡片
- ✅ 显示"上传中"状态（如果还在上传）
- ✅ 上传完成后，显示完整文件信息

**修复前**:
- ❌ B 用户可能看到两个文件卡片

---

## 📊 渲染流程对比

### 修复前

```
用户选择文件
    ↓
draft_handler.tsx:
  1. 创建 pending post（pending_files = [{client_id: "xxx", ...}]）
  2. 创建 File 记录（id = "pending_xxx", post_id = post.id）
    ↓
files/index.ts:
  1. dbFiles = [File {id: "pending_xxx"}]  ← 从 DB 查询
  2. pendingFileInfos = [FileInfo {id: "pending_xxx"}]  ← 从 pending_files 合成
  3. 检查重复：realFileId = undefined → 检查失败 ❌
  4. 合并：[...pendingFileInfos, ...dbFiles]
     = [FileInfo {id: "pending_xxx"}, File {id: "pending_xxx"}]  ← 重复！
    ↓
❌ 显示两个文件卡片
```

### 修复后

```
用户选择文件
    ↓
draft_handler.tsx:
  1. 创建 pending post（pending_files = [{client_id: "xxx", ...}]）
  2. 创建 File 记录（id = "pending_xxx", post_id = post.id）
    ↓
files/index.ts:
  1. dbFiles = [File {id: "pending_xxx"}]  ← 从 DB 查询
  2. 遍历 pending_files:
     - pendingId = "pending_xxx"
     - 检查：dbFiles.some((f) => f.id === "pending_xxx") → true ✅
     - 跳过合成
  3. pendingFileInfos = []  ← 空数组
  4. 合并：[...pendingFileInfos, ...dbFiles]
     = [File {id: "pending_xxx"}]  ← 不重复！
    ↓
✅ 只显示一个文件卡片
```

---

## 🧪 测试场景

### 场景 1: 发送单文件

**步骤**:
1. 打开聊天窗口
2. 点击 `+` → 选择"文件"
3. 选择一个 PDF 文件
4. 观察聊天窗口

**预期结果**:
- ✅ 立即显示一个文件卡片
- ✅ 显示文件名、大小、图标
- ✅ 显示"发送中"状态和进度条
- ✅ 上传完成后，进度条消失

---

### 场景 2: 发送多文件

**步骤**:
1. 打开聊天窗口
2. 点击 `+` → 选择"文件"
3. 选择 3 个不同的文件
4. 观察聊天窗口

**预期结果**:
- ✅ 立即显示 3 个文件卡片
- ✅ 每个卡片都显示"发送中"状态
- ✅ 上传完成后，所有进度条消失

---

### 场景 3: 接收端渲染

**步骤**:
1. A 用户发送文件给 B 用户
2. B 用户打开聊天窗口
3. 观察文件渲染

**预期结果**:
- ✅ B 用户只看到一个文件卡片
- ✅ 显示"上传中"状态（如果还在上传）
- ✅ 上传完成后，显示完整文件信息

---

## 📝 关键代码位置

| 文件 | 行号 | 说明 |
|------|------|------|
| `app/components/files/index.ts` | 71-75 | 检查 DB 中是否已有 pending 记录（mobile） |
| `webapp/channels/src/components/file_attachment_list/index.ts` | 89-100 | 检查是否已有 pending 或真实记录（webapp） |

---

## 🎉 总结

### 核心改进

1. ✅ **修复重复渲染**: 正确检查 pending ID 是否已存在
2. ✅ **逻辑清晰**: 使用 `pending_${client_id}` 进行匹配
3. ✅ **双重检查**: 同时检查 pending ID 和真实 ID（webapp）

### 用户体验提升

- ✅ **无重复卡片**: 每个文件只显示一次
- ✅ **状态一致**: 所有卡片都显示相同的状态
- ✅ **视觉清晰**: 聊天窗口不再混乱

### 代码质量

- ✅ **TypeScript 检查**: 无错误
- ✅ **向后兼容**: 不影响其他功能
- ✅ **代码清晰**: 注释详细，易于维护

---

## 📌 下一步

### 测试

1. **单元测试**: 测试重复检查逻辑
2. **集成测试**: 测试完整的文件发送流程
3. **回归测试**: 确保其他场景不受影响

### 部署

1. **Code Review**: 提交 PR，等待 review
2. **QA 测试**: QA 团队全面测试
3. **灰度发布**: 小范围发布，观察数据
4. **全量发布**: 确认无问题后全量发布

---

**状态**: ✅ 修复完成，等待测试

**参考**:
- 用户反馈: "选择文件后，渲染出来两个同样的文件信息"
- 相关文件: `app/components/files/index.ts`, `webapp/channels/src/components/file_attachment_list/index.ts`
