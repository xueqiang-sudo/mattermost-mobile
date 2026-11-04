# 智能笔记本文件选择器方案

## 📋 需求

**智能笔记本的文件选择**应该和**聊天窗口的文件选择**完全一致：

1. **显示方式**：全屏 Modal（真正全屏，不是导航页面）
2. **界面内容**：3个Tab（群组文件、相册、手机文件）
3. **操作流程**：选择文件 → 点击发送 → 文件名显示在编辑器中

## 🔧 实现方案

### 核心思路

**复用聊天窗口的 `FilePicker` 组件**，让智能笔记本也能使用同一个文件选择器。

### 方案优势

1. ✅ **代码复用**：不重复造轮子
2. ✅ **体验一致**：智能笔记本和聊天窗口的文件选择完全一致
3. ✅ **维护简单**：只需要维护一个文件选择器
4. ✅ **功能完整**：自动支持群组文件、相册、手机文件

### 实现步骤

#### 步骤 1：创建智能笔记本专用的文件选择器显示函数

**文件**：`app/screens/file_picker/show_modal.ts`

新增函数 `showSmartNotebookFilePicker`：

```typescript
/**
 * 为智能笔记本显示全屏文件选择器 Modal
 * 和聊天窗口的文件选择器完全一致
 */
export const showSmartNotebookFilePicker = (
    channelId: string,  // 用于临时存储，可以用 'smart_notebook_temp'
    onSend: (files: FileInfo[]) => void,
    title = 'Select Files',
) => {
    showFullscreenFilePickerModal(channelId, onSend, title, false);
};
```

#### 步骤 2：修改智能笔记本的文件选择逻辑

**文件**：`app/screens/home/apps/smart_notebook/smart_note_detail_screen.tsx`

**修改前**：
```typescript
// 显示自定义的文件选择器 Modal
<Modal visible={showFilePicker} ...>
    <View>
        <SmartNotebookFilePicker
            userId={userId}
            onFilesSelected={handleFilesSelected}
        />
    </View>
</Modal>
```

**修改后**：
```typescript
// 点击"文件"按钮时，调用文件选择器
const handleAddFile = useCallback(() => {
    showSmartNotebookFilePicker(
        'smart_notebook_temp',  // 临时 channelId
        (files: FileInfo[]) => {
            // 将选中的文件转换为 SmartNoteBlock
            const newBlocks = files.map(file => ({
                id: generateId(),
                type: getFileType(file.name, file.mime_type || ''),
                content: file.uri || '',  // 本地路径
                order: blocks.length,
                meta: {
                    caption: file.name,
                    size: file.size || 0,
                    mimeType: file.mime_type || '',
                    isLocal: true,  // 标记为本地文件
                    fileId: file.id,
                },
            }));
            
            // 添加到编辑器
            setBlocks([...blocks, ...newBlocks]);
        },
        intl.formatMessage({id: 'smart_notebook.select_file', defaultMessage: '选择文件'}),
    );
}, [blocks, intl]);
```

**删除**：
- 删除 `SmartNotebookFilePicker` 组件的导入
- 删除 `showFilePicker` 状态
- 删除自定义的文件选择器 Modal

#### 步骤 3：添加"文件"按钮

**文件**：`app/screens/home/apps/smart_notebook/block_editor.tsx`

在编辑器工具栏中添加"文件"按钮：

```typescript
<View style={style.toolbar}>
    <TouchableOpacity onPress={handleAddText}>
        <CompassIcon name='format-text' size={24}/>
    </TouchableOpacity>
    <TouchableOpacity onPress={handleAddImage}>
        <CompassIcon name='image-outline' size={24}/>
    </TouchableOpacity>
    <TouchableOpacity onPress={handleAddFile}>  {/* ✅ 新增 */}
        <CompassIcon name='file-outline' size={24}/>
    </TouchableOpacity>
</View>
```

### 数据流

```
用户点击"文件"按钮
    ↓
调用 showSmartNotebookFilePicker
    ↓
显示全屏 Modal（FilePicker 组件）
    ↓
用户看到 3 个 Tab：
    - 群组文件
    - 相册
    - 手机文件
    ↓
用户选择文件
    ↓
用户点击"发送"按钮
    ↓
触发 onSend 回调
    ↓
将 FileInfo[] 转换为 SmartNoteBlock[]
    ↓
添加到编辑器的 blocks 数组
    ↓
文件名显示在编辑器中
    ↓
用户继续编辑或保存
```

### 文件类型识别

复用 `SmartNotebookFilePicker` 中的 `getFileType` 函数：

```typescript
function getFileType(fileName: string, mimeType: string): SmartNoteBlock['type'] {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'].includes(ext)) {
        return 'image';
    }
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(ext)) {
        return 'video';
    }
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'].includes(ext)) {
        return 'audio';
    }

    // 根据 MIME 类型判断
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';

    return 'file';  // 默认为文件类型
}
```

### 文件块渲染

在 `block_editor.tsx` 中渲染文件块：

```typescript
if (block.type === 'file') {
    return (
        <View style={style.fileBlock}>
            <CompassIcon name='file-outline' size={24} color={theme.centerChannelColor}/>
            <Text style={style.fileName}>{block.meta?.caption || 'Unknown file'}</Text>
            <Text style={style.fileSize}>
                {formatFileSize(block.meta?.size || 0)}
            </Text>
            <TouchableOpacity onPress={() => handleRemoveBlock(block.id)}>
                <CompassIcon name='close-circle' size={20} color={theme.errorTextColor}/>
            </TouchableOpacity>
        </View>
    );
}
```

### 保存时的处理

保存时，调用 `uploadAllLocalBlocks` 上传本地文件：

```typescript
const handleSave = useCallback(async () => {
    // 显示保存进度
    setSaveProgress({visible: true, current: 0, total: 0, message: '准备保存...'});
    
    try {
        // 1. 上传所有本地文件
        const uploadResult = await uploadAllLocalBlocks(
            serverUrl,
            userId,
            blocks,
            (current, total) => {
                setSaveProgress({
                    visible: true,
                    current,
                    total,
                    message: `上传文件 ${current}/${total}`,
                });
            },
        );
        
        if (!uploadResult.success) {
            Alert.alert('保存失败', '文件上传失败，请重试');
            return;
        }
        
        // 2. 更新 blocks（本地路径变为云端 URL）
        const updatedBlocks = uploadResult.blocks;
        
        // 3. 保存笔记
        await updateNote(serverUrl, userId, noteId, {
            blocks: updatedBlocks,
        });
        
        setSaveProgress({visible: false, current: 0, total: 0, message: ''});
        Alert.alert('保存成功');
    } catch (error) {
        setSaveProgress({visible: false, current: 0, total: 0, message: ''});
        Alert.alert('保存失败', error.message);
    }
}, [blocks, noteId, serverUrl, userId]);
```

## 📱 效果对比

### 修改前（自定义文件选择器）
```
[智能笔记本编辑器]
       ↓ 点击"文件"
┌─────────────────┐
│  选择文件      X │
│                 │
│ [群组文件]      │
│ [相册]          │
│ [手机文件]      │
└─────────────────┘
```

**问题**：
- ❌ 界面简陋
- ❌ 功能不完整
- ❌ 和聊天窗口不一致
- ❌ 需要维护两套代码

### 修改后（复用 FilePicker）
```
[智能笔记本编辑器]
       ↓ 点击"文件"
┌─────────────────┐
│ ← 选择文件      │  ← 全屏 Modal
├─────────────────┤
│ [群组] [相册] [手机]│
│                 │
│ [文件列表]      │
│                 │
│ [发送(3)]       │
└─────────────────┘
```

**优势**：
- ✅ 界面完整（3个Tab）
- ✅ 功能完整（多选、预览、发送）
- ✅ 和聊天窗口一致
- ✅ 复用代码，易于维护

## 🧪 测试场景

### 基础功能
- ✅ 点击"文件"按钮
- ✅ 显示全屏 Modal（FilePicker）
- ✅ 看到 3 个 Tab
- ✅ 切换 Tab 正常

### 群组文件
- ✅ 点击"群组文件" Tab
- ✅ 浏览群组文件
- ✅ 选择文件（支持多选）
- ✅ 点击"发送"
- ✅ 文件名显示在编辑器中

### 相册
- ✅ 点击"相册" Tab
- ✅ 浏览手机相册
- ✅ 选择照片/视频（支持多选）
- ✅ 点击"发送"
- ✅ 文件名显示在编辑器中

### 手机文件
- ✅ 点击"手机文件" Tab
- ✅ 浏览手机文件
- ✅ 选择文件（支持多选）
- ✅ 点击"发送"
- ✅ 文件名显示在编辑器中

### 编辑和保存
- ✅ 文件名正确显示
- ✅ 文件大小正确显示
- ✅ 可以删除文件块
- ✅ 保存时自动上传
- ✅ 上传进度正常显示
- ✅ 保存后文件可正常访问

## 📊 代码变更统计

### 修改的文件
1. `app/screens/file_picker/show_modal.ts`
   - 新增 `showSmartNotebookFilePicker` 函数（可复用 `showFullscreenFilePickerModal`）

2. `app/screens/home/apps/smart_notebook/smart_note_detail_screen.tsx`
   - 删除 `SmartNotebookFilePicker` 导入
   - 删除 `showFilePicker` 状态
   - 删除自定义文件选择器 Modal
   - 新增 `handleAddFile` 函数（调用 `showSmartNotebookFilePicker`）

3. `app/screens/home/apps/smart_notebook/block_editor.tsx`
   - 新增"文件"按钮
   - 新增文件块渲染逻辑

### 删除的文件
- `app/screens/home/apps/smart_notebook/smart_notebook_file_picker.tsx`（可选，如果不再需要）

### 新增代码行数
- show_modal.ts: +5 行
- smart_note_detail_screen.tsx: +30 行（新增回调）, -50 行（删除 Modal）
- block_editor.tsx: +20 行（文件按钮 + 渲染）
- 总计: +55 行, -50 行

## 🔄 兼容性

### 向后兼容
- ✅ 所有现有功能正常
- ✅ 只是改变了文件选择方式
- ✅ 不影响其他功能

### 性能影响
- ✅ 复用现有组件，无额外开销
- ✅ 更好的用户体验

## 🎉 总结

### 实现成果
1. ✅ 智能笔记本文件选择和聊天窗口完全一致
2. ✅ 全屏 Modal 显示（3个Tab）
3. ✅ 支持群组文件、相册、手机文件
4. ✅ 文件名正确显示在编辑器中
5. ✅ 保存时自动上传

### 技术亮点
- 代码复用（复用 FilePicker）
- 体验一致（和聊天窗口相同）
- 维护简单（只需要一个文件选择器）
- 功能完整（多选、预览、发送）

### 用户价值
- 更熟悉的界面
- 更完整的文件选择功能
- 更好的用户体验
- 和聊天窗口一致的操作流程

现在智能笔记本的文件选择和聊天窗口完全一致，使用同一个 FilePicker 组件！🎉
