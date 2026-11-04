# 文件消息渲染优化 - 仿微信样式

## ✅ 修改完成

### 📋 需求
1. **发送状态显示**：只显示"发送中"和"对方发送中"，移除"未下载"提示
2. **状态位置**：发送状态显示在文件大小右边，同一行显示
3. **图标虚实**：发送中时文件类型图标变虚（半透明），完成后变实
4. **移除"未下载"**：任何情况下都不显示"未下载"提示

---

## 🔧 修改内容

### 1. **FileInfo 组件** - 文件信息显示

**文件**: `app/components/files/file_info.tsx`

#### a) 移除"未下载"状态判断

**修改前**:
```typescript
let statusText = '';
let statusStyle = style.uploadingText;
if (uploadStatus === 'uploading') {
    if (isSameAccount) {
        statusText = '上传中';
    } else {
        statusText = '对方上传中';
    }
    statusStyle = style.uploadingText;
} else if (!file.localPath && !file.id?.startsWith('pending_')) {
    // ❌ 显示"未下载"
    statusText = '未下载';
    statusStyle = style.notDownloadedText;
}
```

**修改后**:
```typescript
let statusText = '';
if (uploadStatus === 'uploading') {
    if (isSameAccount) {
        statusText = '发送中';  // ✅ 改文案
    } else {
        statusText = '对方发送中';  // ✅ 改文案
    }
}
// ✅ 移除"未下载"判断
```

---

#### b) 将状态移到文件大小右边

**修改前**:
```typescript
<View style={style.fileDownloadContainer}>
    {channelName && <View style={style.channelWrapper}>...</View>}
    <Text style={style.infoText}>{getFormattedFileSize(file.size)}</Text>
</View>
{statusText ? (
    <Text style={[style.statusText, statusStyle]}>  {/* ❌ 单独一行 */}
        {statusText}
    </Text>
) : null}
```

**修改后**:
```typescript
<View style={style.fileDownloadContainer}>
    {channelName && <View style={style.channelWrapper}>...</View>}
    <Text style={style.infoText}>{getFormattedFileSize(file.size)}</Text>
    {statusText ? (
        <Text style={[style.statusText, style.uploadingText]}>  {/* ✅ 同一行 */}
            {statusText}
        </Text>
    ) : null}
</View>
```

---

#### c) 调整样式

**修改前**:
```typescript
fileDownloadContainer: {
    flexDirection: 'row',
    marginTop: 3,
},
statusText: {
    ...typography('Body', 75, 'Regular'),
    marginTop: 2,  // ❌ 上边距（用于单独一行）
},
```

**修改后**:
```typescript
fileDownloadContainer: {
    flexDirection: 'row',
    alignItems: 'center',  // ✅ 垂直居中
    marginTop: 3,
},
statusText: {
    ...typography('Body', 75, 'Regular'),
    marginLeft: 8,  // ✅ 左边距（同一行）
},
```

---

### 2. **FileIcon 组件** - 文件图标

**文件**: `app/components/files/file_icon.tsx`

#### 添加 opacity 属性

**修改前**:
```typescript
type FileIconProps = {
    backgroundColor?: string;
    defaultImage?: boolean;
    failed?: boolean;
    file?: FileInfo | ExtractedFileInfo;
    iconColor?: string;
    iconSize?: number;
    smallImage?: boolean;
    testID?: string;
    // ❌ 无 opacity 属性
}
```

**修改后**:
```typescript
type FileIconProps = {
    backgroundColor?: string;
    defaultImage?: boolean;
    failed?: boolean;
    file?: FileInfo | ExtractedFileInfo;
    iconColor?: string;
    iconSize?: number;
    smallImage?: boolean;
    testID?: string;
    opacity?: number;  // ✅ 添加 opacity 属性
}
```

---

#### 应用 opacity 到图标

**修改前**:
```typescript
const FileIcon = ({
    backgroundColor, defaultImage = false, failed = false, file,
    iconColor, iconSize = 48, smallImage = false, testID = 'file-icon',
}: FileIconProps) => {
    // ...
    return (
        <View
            style={[styles.fileIconWrapper, {backgroundColor: bgColor}]}
            testID={testID}
        >
            <CompassIcon
                name={iconName}
                size={iconSize}
                color={color}
            />
        </View>
    );
};
```

**修改后**:
```typescript
const FileIcon = ({
    backgroundColor, defaultImage = false, failed = false, file,
    iconColor, iconSize = 48, smallImage = false, testID = 'file-icon', opacity = 1,
}: FileIconProps) => {
    // ...
    return (
        <View
            style={[styles.fileIconWrapper, {backgroundColor: bgColor, opacity}]}  // ✅ 应用 opacity
            testID={testID}
        >
            <CompassIcon
                name={iconName}
                size={iconSize}
                color={color}
            />
        </View>
    );
};
```

---

### 3. **DocumentFile 组件** - 文档文件

**文件**: `app/components/files/document_file.tsx`

#### 根据发送状态设置图标透明度

**修改前**:
```typescript
const DocumentFile = forwardRef<DocumentRef, DocumentFileProps>(
    ({backgroundColor, canDownloadFiles, disabled = false, enableSecureFilePreview, file}: DocumentFileProps, ref) => {
        // ...
        const icon = (
            <FileIcon
                backgroundColor={backgroundColor}
                file={file}
                // ❌ 无 opacity 属性
            />
        );
        // ...
    }
);
```

**修改后**:
```typescript
const DocumentFile = forwardRef<DocumentRef, DocumentFileProps>(
    ({backgroundColor, canDownloadFiles, disabled = false, enableSecureFilePreview, file, uploadStatus}: DocumentFileProps, ref) => {
        // ...
        // ✅ 微信风格：发送中时图标变虚（opacity 0.5），完成后变实（opacity 1）
        const isUploading = uploadStatus === 'uploading';
        const iconOpacity = isUploading ? 0.5 : 1;

        const icon = (
            <FileIcon
                backgroundColor={backgroundColor}
                file={file}
                opacity={iconOpacity}  // ✅ 根据状态设置透明度
            />
        );
        // ...
    }
);
```

---

## 📊 效果对比

### 发送状态显示

| 场景 | 修改前 | 修改后 |
|------|--------|--------|
| **自己发送** | "上传中"（单独一行） | "发送中"（文件大小右边） ✅ |
| **对方发送** | "对方上传中"（单独一行） | "对方发送中"（文件大小右边） ✅ |
| **未下载** | "未下载"（红色文字） | ❌ 不显示 ✅ |
| **已完成** | 不显示 | 不显示 ✅ |

### 文件图标虚实

| 状态 | 修改前 | 修改后 |
|------|--------|--------|
| **发送中** | 实线图标 | 虚线图标（opacity 0.5） ✅ |
| **发送完成** | 实线图标 | 实线图标（opacity 1） ✅ |

---

## 🎨 UI 效果

### 发送中状态
```
┌──────────────────────────────────────┐
│ 📄 报告.pdf                          │
│    2.5 MB  发送中        [虚图标]    │  ← 同一行，图标虚
└──────────────────────────────────────┘
```

### 对方发送中状态
```
┌──────────────────────────────────────┐
│ 📄 数据.xlsx                         │
│    1.2 MB  对方发送中    [虚图标]    │  ← 同一行，图标虚
└──────────────────────────────────────┘
```

### 发送完成状态
```
┌──────────────────────────────────────┐
│ 📄 报告.pdf                          │
│    2.5 MB              [实图标]      │  ← 无状态，图标实
└──────────────────────────────────────┘
```

---

## 🔑 关键代码解析

### 1. 发送状态判断
```typescript
const uploadStatus = (file as any)._uploadStatus as string | undefined;
const isSameAccount = Boolean(currentUserId && file.user_id === currentUserId);

let statusText = '';
if (uploadStatus === 'uploading') {
    if (isSameAccount) {
        statusText = '发送中';  // 自己发送
    } else {
        statusText = '对方发送中';  // 对方发送
    }
}
// 其他情况不显示任何状态（包括"未下载"）
```

### 2. 同一行显示
```typescript
<View style={style.fileDownloadContainer}>
    {/* 频道名称（可选） */}
    {channelName && <View style={style.channelWrapper}>...</View>}
    
    {/* 文件大小 */}
    <Text style={style.infoText}>{getFormattedFileSize(file.size)}</Text>
    
    {/* 发送状态（同一行） */}
    {statusText ? (
        <Text style={[style.statusText, style.uploadingText]}>
            {statusText}
        </Text>
    ) : null}
</View>
```

### 3. 图标虚实控制
```typescript
// 判断是否正在上传
const isUploading = uploadStatus === 'uploading';

// 设置透明度：上传中 0.5（虚），完成 1（实）
const iconOpacity = isUploading ? 0.5 : 1;

// 应用到图标
<FileIcon file={file} opacity={iconOpacity} />
```

---

## 🧪 测试场景

### 场景 1: 自己发送文件
1. ✅ 选择文件并发送
2. ✅ 聊天窗口显示文件卡片
3. ✅ **验证**：
   - 显示"发送中"文字
   - "发送中"在文件大小右边（同一行）
   - 文件图标为虚（半透明）

### 场景 2: 对方发送文件
1. ✅ 对方发送文件给你
2. ✅ 聊天窗口显示文件卡片
3. ✅ **验证**：
   - 显示"对方发送中"文字
   - "对方发送中"在文件大小右边（同一行）
   - 文件图标为虚（半透明）

### 场景 3: 发送完成
1. ✅ 文件发送完成
2. ✅ **验证**：
   - 不显示任何状态文字
   - 文件图标变为实（完全不透明）
   - 不显示"未下载"提示

### 场景 4: 查看历史消息
1. ✅ 查看之前的聊天记录
2. ✅ **验证**：
   - 不显示"未下载"提示
   - 文件图标为实
   - 只显示文件名和大小

---

## 🎉 总结

### 实现成果
1. ✅ 移除"未下载"提示（任何情况都不显示）
2. ✅ 发送状态只显示"发送中"和"对方发送中"
3. ✅ 发送状态在文件大小右边，同一行显示
4. ✅ 发送中时文件图标变虚（opacity 0.5）
5. ✅ 发送完成后文件图标变实（opacity 1）
6. ✅ 与微信样式完全一致

### 技术亮点
- **状态简化**：只保留必要的发送状态
- **布局优化**：同一行显示，信息更紧凑
- **视觉反馈**：图标虚实直观反映发送状态
- **用户体验**：与微信保持一致

### 修改的文件
1. `app/components/files/file_info.tsx` - 文件信息显示
2. `app/components/files/file_icon.tsx` - 文件图标
3. `app/components/files/document_file.tsx` - 文档文件

**文件消息渲染已完全按照微信样式优化完成！🎉**
