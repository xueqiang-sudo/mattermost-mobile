# 智能笔记本文件和图片选择功能实现

## 功能概述

为智能笔记本添加了完整的文件和图片选择功能，支持：
- **群组文件**：从云盘选择文件（待实现）
- **相册**：从手机相册选择图片（支持多选）
- **手机文件**：从手机存储选择任意文件（支持多选）

选择后文件会直接显示在编辑器中，支持：
- 图片：显示预览缩略图
- 视频：显示视频图标和播放按钮
- 音频：显示音频图标和播放按钮
- 普通文件：显示文件图标和文件信息

## 修改的文件

### 1. 新增文件

#### `smart_notebook_file_picker.tsx`
文件选择器组件，提供三种选择方式：
- 群组文件（待实现云盘选择器集成）
- 相册图片（支持多选，使用 `react-native-image-picker`）
- 手机文件（支持多选，使用 `react-native-document-picker`）

**主要功能**：
```typescript
type SmartNotebookFilePickerProps = {
    userId: string;
    onFilesSelected: (blocks: SmartNoteBlock[]) => void;
};
```

- 自动识别文件类型（图片/视频/音频/普通文件）
- 批量上传多个文件
- 为每个文件创建对应的块

### 2. 修改的文件

#### `smart_note_detail_screen.tsx`
- 添加了 `showFilePicker` 状态控制文件选择器显示
- 添加了 `handleFilesSelected` 回调处理选中的文件
- 修改了 `uploadFile` 函数，改为打开文件选择器底部弹窗
- 添加了 Bottom Sheet Modal 显示文件选择器
- 添加了相关样式

**新增状态**：
```typescript
const [showFilePicker, setShowFilePicker] = useState(false);
```

**新增回调**：
```typescript
const handleFilesSelected = useCallback((newBlocks: SmartNoteBlock[]) => {
    setBlocks(prev => [...prev, ...newBlocks]);
    setShowFilePicker(false);
}, []);
```

#### `block_editor.tsx`
增强了媒体块的渲染：

1. **图片块**：
   - 显示实际图片预览（200px 高度）
   - 底部显示文件名和图标

2. **视频块**：
   - 显示视频图标（蓝色背景）
   - 显示文件名和大小
   - 显示播放按钮图标

3. **音频块**：
   - 显示麦克风图标（蓝色背景）
   - 显示文件名和大小
   - 显示播放按钮图标

4. **文件块**（新增）：
   - 显示文件图标
   - 显示文件名和大小

**新增辅助函数**：
```typescript
function formatFileSize(bytes: number): string
```

**新增样式**：
- `imagePreview`: 图片预览样式
- `mediaInfo`: 媒体信息容器
- `mediaIconContainer`: 图标容器
- `mediaMeta`: 元数据（文件大小）样式

#### `smart_notebook_api.ts`
- 在 `SmartNoteBlock` 类型中添加了 `'file'` 类型

## 使用流程

### 选择文件
1. 用户在编辑模式下点击工具栏的文件夹图标
2. 弹出底部文件选择器
3. 选择来源：群组文件 / 相册 / 手机文件
4. 选择一个或多个文件
5. 文件自动上传并插入到编辑器

### 文件显示
- **图片**：直接显示预览图，点击可聚焦
- **视频**：显示视频卡片，点击可聚焦（后续可添加播放功能）
- **音频**：显示音频卡片，点击可聚焦（后续可添加播放功能）
- **文件**：显示文件卡片，点击可聚焦（后续可添加预览功能）

### 编辑操作
- 点击任意块可聚焦，显示操作工具栏
- 工具栏包含：上移、下移、添加、删除按钮
- 只有当前聚焦的块显示工具栏

## 待完成功能

### 1. 群组文件选择器
需要集成云盘选择器组件，参考：
- `/app/screens/cloud_drive_picker/cloud_drive_picker.tsx`
- 需要支持多选文件
- 需要传递 channelId 和 teamId

### 2. 媒体预览
点击媒体块时的预览功能：
- 图片：全屏预览，支持缩放
- 视频：视频播放器
- 音频：音频播放器
- 文件：使用统一文件查看器

可参考：
- `/app/screens/unified_file_viewer/`
- 使用 `goToScreen` 导航到预览页面

### 3. 文件上传进度
- 显示上传进度条
- 参考 `/app/components/upload_progress_panel.tsx`

## 技术细节

### 文件上传
使用 `uploadMedia` API：
```typescript
const uploadResult = await uploadMedia(serverUrl, userId, {
    uri: fileUri,
    name: fileName,
    type: mimeType,
});
```

### 块结构
```typescript
{
    id: string,
    type: 'image' | 'video' | 'audio' | 'file',
    content: string, // URL
    order: number,
    meta: {
        caption: string,      // 文件名
        size: number,         // 文件大小
        mimeType: string,     // MIME 类型
        width?: number,       // 图片宽度
        height?: number,      // 图片高度
    }
}
```

### 多选支持
- 相册：`selectionLimit: 0`（无限制）
- 文件：`allowMultiSelection: true`

## 测试建议

1. **基础功能**：
   - 选择单张图片
   - 选择多张图片
   - 选择视频文件
   - 选择音频文件
   - 选择普通文件

2. **编辑操作**：
   - 移动块顺序
   - 删除块
   - 添加新块

3. **边界情况**：
   - 大文件上传
   - 网络错误处理
   - 取消选择

4. **UI/UX**：
   - 不同屏幕尺寸
   - 深色/浅色主题
   - 横竖屏切换

## 参考实现

### Webapp 智能笔记本
位置：`/home/work/mattermost-master/webapp`
- 文件上传：`channels/src/components/file_upload/`
- 附件显示：`channels/src/components/file_info_preview/`

### 现有文件选择器
- 云盘选择器：`/app/screens/cloud_drive_picker/`
- 文件选择器：`/app/screens/file_picker/`
- 统一文件查看器：`/app/screens/unified_file_viewer/`

## 国际化字符串

需要添加的翻译键：
```json
{
  "smart_notebook.group_files": "群组文件",
  "smart_notebook.photo_album": "相册",
  "smart_notebook.local_files": "手机文件",
  "smart_notebook.select_file": "选择文件",
  "smart_notebook.coming_soon": "功能开发中...",
  "smart_notebook.upload_failed": "上传失败"
}
```

## 后续优化

1. **性能优化**：
   - 图片压缩
   - 懒加载
   - 虚拟列表优化

2. **用户体验**：
   - 拖拽排序
   - 批量操作
   - 撤销/重做

3. **功能增强**：
   - 文件分类筛选
   - 搜索功能
   - 最近使用

## 注意事项

1. **文件类型识别**：根据扩展名自动识别
2. **文件大小限制**：需要后端配置
3. **网络状态**：上传前检查网络连接
4. **错误处理**：友好的错误提示
5. **权限管理**：相册和存储权限
