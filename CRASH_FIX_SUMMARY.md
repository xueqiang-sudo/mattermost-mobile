# 云盘和知识库上传崩溃修复总结

## 问题
- ❌ 云盘 → 上传 → 选择文件 → 发送 = **APP崩溃**
- ❌ 知识库 → 添加 → 选择文件 → 发送 = **APP崩溃**
- ✅ 聊天 → 加号 → 文件 → 选择 → 发送 = 正常

## 根本原因 🔍
在onSend回调的**async操作期间**，所依赖的state/context变成无效：

```
时间流:
Modal关闭 → Component卸载 → async操作仍在运行 → 访问已失效的state → CRASH
```

## 修复方式 ✅

### 核心策略：缓存Refs

**之前 (有问题)**:
```typescript
const onUploadFiles = async (files) => {
    for (const file of files) {
        await uploadDriveFile(serverUrl, teamId, ...);  // 直接用state
        //                   ↑ 可能已失效！
    }
}
```

**之后 (修复)**:
```typescript
const onUploadFiles = async (files) => {
    const cachedServerUrl = serverUrl;  // 保存快照
    const cachedTeamId = teamId;
    
    for (const file of files) {
        await uploadDriveFile(cachedServerUrl, cachedTeamId, ...);
        //                   ↑ 使用保存的值，不会失效
    }
}
```

## 修改的文件

| 文件 | 修改内容 |
|------|---------|
| **cloud_drive_screen.tsx** | 缓存serverUrl, teamId, parentId, scope, loadFiles |
| **knowledge_base_screen.tsx** | 缓存serverUrl, teamId, performSearch, loadDocuments |
| **kb_add_screen.tsx** | 增强onFileSelected错误处理 |
| **file_picker.tsx** | dismissModal前置，改进日志 |
| **photo_album_tab.tsx** | 文件复制验证 |
| **files_tab.tsx** | DocumentPicker错误处理 |
| **group_files_tab.tsx** | toFileInfo转换错误处理 |
| **file_picker_context.tsx** | ADD_FILE字段验证 |

## 测试方法

### 场景1: 云盘上传
```
1. 打开云盘
2. 点"+"按钮
3. 选择一个手机文件
4. 点"Send"
✅ 应立即关闭，文件后台上传
❌ 不应该崩溃
```

### 场景2: 知识库添加
```
1. 打开知识库
2. 点"+"按钮，选择"添加文档"
3. 选择相册或手机文件
4. 点"Send"
✅ 应立即关闭，文件后台处理
❌ 不应该崩溃
```

### 场景3: 对比验证（应该继续正常）
```
1. 打开聊天
2. 点"+"按钮
3. 选择文件标签页
4. 选择文件 → 发送
✅ 应该继续正常工作
```

## 日志诊断

修复后的完整日志应该看起来像：
```
[filePicker] === handleSend STARTED ===
[filePicker] Dismissing modal first (before onSend)
[filePicker] Modal dismissed successfully
[filePicker] Calling onSend callback
[Drive] === onUploadFiles START ===
[Drive] Cached refs: {hasServerUrl: true, hasTeamId: true, ...}
[Drive] Starting upload of 1 file(s)
[Drive] File uploaded successfully: example.pdf
[Drive] All files uploaded successfully, refreshing list
[Drive] === onUploadFiles COMPLETED ===
[filePicker] === handleSend COMPLETED ===
```

如果看到`ERROR`或`FAILED`，说明在那个阶段出了问题。

## 关键改进
1. ✅ 消除了async操作期间state失效的风险
2. ✅ 增强了错误日志来帮助诊断
3. ✅ 改进了文件操作的容错能力
4. ✅ 调整了执行顺序（dismissModal前置）

## Commit
```
commit 03d2ad5
Author: xq_mattermost_server
修复云盘和知识库文件上传崩溃问题 - 关键修复：缓存async操作的依赖引用
```

## 验证清单
- [ ] 重新构建app (npm install + compile)
- [ ] 真机测试场景1（云盘）
- [ ] 真机测试场景2（知识库）  
- [ ] 真机测试场景3（聊天对比）
- [ ] 查看debug日志确认完整流程
- [ ] 验证文件确实上传成功

---

**下次如果需要提供日志**, 执行:
```bash
adb pull /data/data/com.mattermost.rnbeta/cache/debug_logs/app_debug.log
```
