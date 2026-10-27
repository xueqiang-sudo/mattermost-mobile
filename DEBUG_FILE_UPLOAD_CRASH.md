# 文件上传崩溃问题 - 修复验证指南

## 修复清单 ✅

### 1. **核心修改 - file_picker.tsx**
- ✅ 调整 `onSend` 和 `dismissModal` 的执行顺序
  - **之前**: onSend → dismissModal (可能导致已卸载组件访问)
  - **现在**: dismissModal → onSend (避免组件被卸载)
- ✅ 增强日志详尽度
  - 添加分隔符 `=== handleSend STARTED/COMPLETED ===`
  - 更详细的文件验证日志

### 2. **photo_album_tab.tsx**
- ✅ 增强文件复制错误检查
  - 验证源文件存在
  - 验证缓存目录可用
  - 验证复制后文件存在
- ✅ 改进fallback逻辑
  - 如果复制失败，仍使用原始URI
  - 更详尽的错误日志

### 3. **files_tab.tsx**
- ✅ 增强DocumentPicker错误处理
  - 验证URI不为空
  - 验证文件名存在
  - 捕获dispatch错误

### 4. **group_files_tab.tsx**
- ✅ 增强toFileInfo转换错误处理
  - 添加try-catch
  - 详细的错误日志

### 5. **file_picker_context.tsx**
- ✅ 增强ADD_FILE操作的验证
  - 检查必需字段(uri)
  - 详细的状态日志
  - 清理缓存文件时的错误捕获

## 日志查看方法

### 方法1: 实时监听日志（推荐）
```bash
# 在真机测试时，获取持久化日志文件
adb pull /data/data/com.mattermost.rnbeta/cache/debug_logs/app_debug.log

# 或iOS
idevice_id -l  # 获取设备UUID
idevicepair pair # 配对设备
```

### 方法2: App内查看
需要在App中添加Debug Screen来查看持久化日志（如果已实现）

### 方法3: 编译后查看
日志路径: `<cacheDirectory>/debug_logs/app_debug.log`

## 测试步骤

### 场景1: 选择相册图片 (Photos)
1. 打开文件选择器
2. 点击 "Photos" 标签
3. 选择1-3张图片
4. 点击 "Send"
5. **观察**: 应立即关闭Modal，然后后台处理文件
6. **预期**: 不再崩溃，日志中能看到完整流程

### 场景2: 选择手机文件 (Phone Files)
1. 打开文件选择器
2. 点击 "Phone Files" 标签
3. 点击 "Select" 按钮
4. 选择1-3个文件
5. 点击 "Send"
6. **观察**: 应立即关闭Modal
7. **预期**: 不再崩溃

### 场景3: 选择群组文件 (Chat)
1. 打开文件选择器
2. 点击 "Chat" 标签
3. 如果有文件，选择其中1-2个
4. 点击 "Send"
5. **预期**: 不再崩溃

## 关键日志标志

成功的流程日志应该包含这些关键点:

```
[HH:MM:SS.mmm] [filePicker] === handleSend STARTED ===
[HH:MM:SS.mmm] [filePicker] handleSend called with N files
[HH:MM:SS.mmm] [filePicker] Processing file 1:
[HH:MM:SS.mmm] [filePicker] Normalized file 1:
[HH:MM:SS.mmm] [filePicker] All N files validated successfully
[HH:MM:SS.mmm] [filePicker] Dismissing modal first (before onSend)
[HH:MM:SS.mmm] [filePicker] Modal dismissed successfully
[HH:MM:SS.mmm] [filePicker] Calling onSend callback
[HH:MM:SS.mmm] [filePicker] onSend callback completed successfully
[HH:MM:SS.mmm] [filePicker] === handleSend COMPLETED ===
```

## 故障排查

### 如果仍然崩溃

1. **收集日志**: 
   ```bash
   adb pull /data/data/com.mattermost.rnbeta/cache/debug_logs/app_debug.log crash.log
   ```

2. **查找ERROR或异常**:
   ```bash
   grep "ERROR\|UNEXPECTED\|Exception" crash.log
   ```

3. **检查系统日志**:
   ```bash
   adb logcat -e "crash\|exception\|error" > logcat.log
   ```

4. **查找关键阶段**:
   - 搜索 `=== handleSend STARTED ===` - 如果看不到说明问题在UI层
   - 搜索 `=== handleSend COMPLETED ===` - 如果看不到说明问题在异步操作中
   - 搜索 `Modal dismissed successfully` - 如果看不到说明问题在dismissModal调用
   - 搜索 `onSend callback completed` - 如果看不到说明问题在onSend中

### 可能的错误场景

| 症状 | 可能原因 | 解决方案 |
|------|--------|--------|
| 缓存目录不存在 | 权限问题 | 检查Android权限 |
| 文件复制失败 | 存储空间不足 | 清理手机存储 |
| 已卸载组件警告 | 异步操作未完成 | 已通过修改顺序解决 |
| URI为空 | 文件选择器问题 | 检查DocumentPicker配置 |

## 预期结果

修复后，三个场景都应该：
✅ 点击Send后立即关闭弹窗  
✅ 文件在后台处理  
✅ 不再出现崩溃  
✅ 日志中能看到完整流程  

## 提交日志的格式

如果修复后仍有问题，请提交:
1. `app_debug.log` 文件
2. `logcat.log` 文件（Android）
3. 具体操作步骤
4. 测试设备型号和系统版本
