# 智能笔记本本地预览方案

## 📋 方案概述

实现了**先预览后上传**的智能文件处理流程，提升用户体验并优化存储空间使用。

### 核心特性

✅ **即时预览**：选择文件后立即显示，无需等待上传
✅ **本地存储**：编辑过程中所有媒体使用本地路径
✅ **按需上传**：仅在用户点击"保存"时才上传到服务器
✅ **智能识别**：自动识别文件类型（图片/视频/音频/文件）
✅ **批量处理**：一次性上传所有本地文件
✅ **错误处理**：部分文件上传失败时提示用户

## 🔄 工作流程

```
选择文件
  ↓
使用本地路径（file://...）
  ↓
立即显示预览
  ├─ 图片：显示缩略图
  ├─ 视频：显示第一帧 + 播放按钮
  ├─ 音频：显示波形图标 + 播放按钮
  └─ 文件：显示文件图标和信息
  ↓
用户编辑笔记
  ↓
点击"保存"
  ↓
批量上传所有本地文件
  ↓
更新块内容为服务器URL
  ↓
保存到数据库
```

## 📁 修改的文件

### 1. 新增文件

#### `smart_notebook_upload.ts`
文件上传工具函数，提供：

**核心函数**：
- `isLocalBlock(block)` - 检查块是否为本地文件
- `uploadLocalBlock(block)` - 上传单个本地文件
- `uploadAllLocalBlocks(blocks)` - 批量上传所有本地文件
- `cleanupLocalFiles(blocks)` - 清理本地临时文件（可选）

**使用示例**：
```typescript
// 检查是否本地
const isLocal = isLocalBlock(block);

// 批量上传
const result = await uploadAllLocalBlocks(serverUrl, userId, blocks, (current, total) => {
    console.log(`上传进度: ${current}/${total}`);
});

// 处理结果
if (result.success) {
    // 所有文件上传成功
    setBlocks(result.blocks);
} else {
    // 部分文件上传失败
    console.error('失败的文件:', result.errors);
}
```

### 2. 修改的文件

#### `smart_notebook_file_picker.tsx`
**主要改动**：
- ✅ 移除自动上传逻辑
- ✅ 使用本地文件路径（`block.content = localUri`）
- ✅ 标记本地文件（`meta.isLocal = true`）
- ✅ 支持视频选择（`mediaType: 'mixed'`）
- ✅ 保持原始质量（`quality: 1.0`）

**块结构**：
```typescript
{
    id: string,
    type: 'image' | 'video' | 'audio' | 'file',
    content: string, // 本地路径（file://... 或 /...）
    meta: {
        isLocal: true,        // 标记为本地文件
        caption: string,      // 文件名
        size: number,         // 文件大小
        mimeType: string,     // MIME 类型
        width?: number,       // 图片/视频宽度
        height?: number,      // 图片/视频高度
        duration?: number,    // 视频/音频时长（毫秒）
        extension?: string,   // 文件扩展名
    }
}
```

#### `block_editor.tsx`
**图片块增强**：
- ✅ 支持本地和远程图片
- ✅ 自动添加 `file://` 前缀
- ✅ 显示"本地"标记徽章
- ✅ 图片加载失败处理

**视频块增强**：
- ✅ 显示视频第一帧缩略图（本地视频）
- ✅ 播放按钮覆盖层
- ✅ 视频时长显示（`mm:ss` 格式）
- ✅ 本地/远程标记

**音频块增强**：
- ✅ 波形图标显示
- ✅ 播放按钮
- ✅ 文件大小和时长
- ✅ 本地/远程标记

**文件块增强**：
- ✅ 文件图标
- ✅ 文件名和大小
- ✅ 本地/远程标记

**新增辅助函数**：
```typescript
function formatDuration(ms: number): string
// 将毫秒转换为 mm:ss 格式
```

**新增样式**：
- `videoPreviewContainer` - 视频预览容器
- `videoThumbnail` - 视频缩略图
- `playButtonOverlay` - 播放按钮覆盖层
- `playButton` - 播放按钮样式
- `durationBadge` - 时长徽章
- `audioCard` - 音频卡片布局
- `fileCard` - 文件卡片布局
- `localBadge` - 本地标记徽章
- `localBadgeText` - 本地标记文字

#### `smart_note_detail_screen.tsx`
**保存流程优化**：
```typescript
const handleSave = useCallback(async () => {
    // 1. 批量上传本地文件
    const uploadResult = await uploadAllLocalBlocks(
        serverUrl,
        userId,
        blocks,
        (current, total) => {
            console.log(`上传进度: ${current}/${total}`);
        }
    );

    // 2. 处理上传失败
    if (uploadResult.errors.length > 0) {
        Alert.alert(
            '部分文件上传失败',
            `${uploadResult.errors.length} 个文件上传失败，其他文件已保存`
        );
    }

    // 3. 使用上传后的块保存笔记
    const blocksToSave = uploadResult.blocks;
    const noteTitle = title.trim() || extractTitleFromBlocks(blocksToSave);

    // 4. 保存到数据库
    await updateNote(serverUrl, userId, noteId, {
        title: noteTitle,
        blocks: blocksToSave,
    });

    // 5. 更新状态
    setBlocks(blocksToSave);
    setOriginalBlocks(JSON.parse(JSON.stringify(blocksToSave)));
}, [...]);
```

## 🎨 UI 设计

### 图片预览
```
┌─────────────────────────┐
│                         │
│     [图片预览 200px]     │
│                         │
└─────────────────────────┘
🖼️ 文件名.jpg        [本地]
```

### 视频预览
```
┌─────────────────────────┐
│                         │
│   [视频第一帧 200px]     │
│                         │
│      ▶️ [播放按钮]       │
│                  03:45  │
└─────────────────────────┘
🎥 文件名.mp4  12MB [本地]
```

### 音频预览
```
┌─────────────────────────┐
│ 🎤  文件名.mp3    ▶️    │
│     12MB • 03:45  [本地] │
└─────────────────────────┘
```

### 文件预览
```
┌─────────────────────────┐
│ 📄  文件名.pdf          │
│     12MB          [本地] │
└─────────────────────────┘
```

## 🔍 本地文件识别

### 判断逻辑
```typescript
function isLocalBlock(block: SmartNoteBlock): boolean {
    // 1. 检查 meta 标记
    if (block.meta?.isLocal) return true;

    // 2. 检查路径前缀
    if (block.content.startsWith('file://')) return true;
    if (block.content.startsWith('/')) return true;

    // 3. 检查远程 URL
    if (block.content.startsWith('http://')) return false;
    if (block.content.startsWith('https://')) return false;

    // 4. 默认本地
    return true;
}
```

### 路径处理
```typescript
// 标准化路径
let fileUri = block.content;
if (fileUri.startsWith('file://')) {
    fileUri = fileUri.substring(7);
}

// 构建完整路径
const imageUri = isLocal && !content.startsWith('file://')
    ? `file://${content}`
    : content;
```

## 📊 上传流程

### 批量上传策略
1. **扫描所有块**：识别本地文件
2. **逐个上传**：按顺序上传
3. **进度跟踪**：报告上传进度
4. **错误收集**：记录失败文件
5. **继续上传**：不因单个失败中断

### 上传结果处理
```typescript
type UploadResult = {
    success: boolean;           // 是否全部成功
    blocks: SmartNoteBlock[];  // 更新后的块
    errors: Array<{
        block: SmartNoteBlock;
        error: string;
    }>;
};
```

## ✅ 优势分析

### 1. 性能优化
- **即时响应**：选择后立即显示，无需等待网络
- **离线可用**：即使无网络也能流畅编辑
- **减少请求**：只在保存时上传一次

### 2. 用户体验
- **可取消**：保存前可以删除不想要的文件
- **可视化**：立即看到所有选择的文件
- **错误友好**：部分失败不影响其他文件

### 3. 存储优化
- **按需上传**：未保存的草稿不占用服务器空间
- **本地缓存**：已选文件保留在本地供预览
- **智能清理**：保存后可选择清理本地文件

## 🚀 后续优化

### 1. 视频播放功能
```typescript
// 使用 react-native-video
<Video
    source={{uri: videoUri}}
    style={style.videoPlayer}
    controls={true}
    paused={!isPlaying}
    onLoad={(data) => setDuration(data.duration)}
/>
```

### 2. 音频播放功能
```typescript
// 使用 react-native-sound-player
import SoundPlayer from 'react-native-sound-player';

const playAudio = async (uri: string) => {
    await SoundPlayer.playUrl(uri);
    setIsPlaying(true);
};
```

### 3. 上传进度条
```typescript
const [uploadProgress, setUploadProgress] = useState(0);

<ProgressBar
    progress={uploadProgress}
    color={theme.buttonBg}
    height={4}
/>
```

### 4. 本地文件清理
```typescript
// 保存成功后清理
await cleanupLocalFiles(blocks);

// 或延迟清理
setTimeout(async () => {
    await cleanupLocalFiles(blocks);
}, 7 * 24 * 60 * 60 * 1000); // 7天后
```

### 5. 图片压缩
```typescript
// 选择时压缩大图
import {compressImage} from '@utils/file/compress_chat_image';

const compressedUri = await compressImage(localUri, {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 0.8,
});
```

## 🧪 测试场景

### 基础功能
- ✅ 选择单张图片，立即显示预览
- ✅ 选择多张图片，全部显示预览
- ✅ 选择视频文件，显示第一帧
- ✅ 选择音频文件，显示波形图标
- ✅ 选择普通文件，显示文件图标

### 编辑操作
- ✅ 删除本地文件块
- ✅ 移动本地文件块顺序
- ✅ 在本地文件后添加新块

### 保存流程
- ✅ 保存包含本地文件的笔记
- ✅ 保存后本地路径替换为远程URL
- ✅ 保存后"本地"标记消失
- ✅ 部分文件上传失败时的提示

### 边界情况
- ✅ 大文件（>100MB）选择
- ✅ 网络断开时的保存
- ✅ 存储空间不足时的保存
- ✅ 文件名包含特殊字符

## 📝 国际化字符串

```json
{
  "smart_notebook.group_files": "群组文件",
  "smart_notebook.photo_album": "相册",
  "smart_notebook.local_files": "手机文件",
  "smart_notebook.select_file": "选择文件",
  "smart_notebook.coming_soon": "功能开发中...",
  "smart_notebook.selection_failed": "选择失败",
  "smart_notebook.upload_warning": "部分文件上传失败",
  "smart_notebook.upload_warning_message": "{count} 个文件上传失败，其他文件已保存",
  "smart_notebook.video_preview": "视频预览",
  "smart_notebook.video_preview_coming_soon": "视频播放功能开发中...",
  "smart_notebook.audio_preview": "音频预览",
  "smart_notebook.audio_preview_coming_soon": "音频播放功能开发中..."
}
```

## 🔒 安全考虑

### 1. 文件路径
- ✅ 使用 `file://` 协议访问本地文件
- ✅ 不暴露绝对路径到服务器
- ✅ 上传后替换为服务器URL

### 2. 文件权限
- ✅ 相册访问权限
- ✅ 存储访问权限
- ✅ 读取外部存储权限

### 3. 文件校验
- ✅ MIME 类型验证
- ✅ 文件大小限制
- ✅ 文件扩展名白名单

## 📦 依赖库

### 已使用
- `react-native-image-picker` - 图片和视频选择
- `react-native-document-picker` - 文件选择
- `expo-file-system` - 文件信息获取

### 待集成（播放功能）
- `react-native-video` - 视频播放
- `react-native-sound-player` - 音频播放

## 🎯 总结

这个方案实现了完美的"先预览后上传"体验：

1. **用户选择文件** → 立即显示本地预览
2. **编辑笔记内容** → 流畅无延迟
3. **点击保存按钮** → 批量上传到服务器
4. **更新笔记数据** → 本地路径替换为远程URL

这样既提升了用户体验，又优化了存储和网络使用！🎉
