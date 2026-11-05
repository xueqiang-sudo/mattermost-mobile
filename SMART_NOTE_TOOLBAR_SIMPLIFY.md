# 智能笔记本工具条简化

## 📋 修改内容

### 1. 移除的按钮

- ❌ **图片按钮** (`uploadImage`)
  - 图标：`image-outline`
  - 功能：上传图片到智能笔记本
  
- ❌ **音视频按钮** (`uploadVideo`)
  - 图标：`video-outline`
  - 功能：上传视频或音频到智能笔记本

### 2. 保留的按钮

- ✅ **H1** - 标题块
- ✅ **•** - 无序列表
- ✅ **1.** - 有序列表
- ✅ **"** - 引用块
- ✅ **</>** - 代码块
- ✅ **文件夹** - 上传文件
- ✅ **麦克风** - 实时语音转文字（**放大**）

### 3. 麦克风按钮优化

#### 尺寸变化
- **图标大小**：20px → 28px（增大 40%）
- **内边距**：8px → 12px（增大 50%）
- **圆角**：4px → 6px（更圆润）
- **左边距**：增加 4px 间距

#### 样式对比

**之前**：
```typescript
// 普通按钮样式
style={style.toolbarBtn}
// padding: 8, borderRadius: 4
// icon size: 20
```

**之后**：
```typescript
// 大号按钮样式
style={style.toolbarBtnLarge}
// padding: 12, borderRadius: 6, marginLeft: 4
// icon size: 28
```

## 🔧 代码修改

### 修改的文件

**文件**: `/home/work/mattermost-mobile/app/screens/home/apps/smart_notebook/smart_note_detail_screen.tsx`

### 1. 移除图片和音视频按钮（第 981-986 行）

**修改前**：
```typescript
<TouchableOpacity onPress={uploadFile} style={style.toolbarBtn}>
    <CompassIcon name='folder-outline' size={20} color={theme.centerChannelColor}/>
</TouchableOpacity>
<TouchableOpacity onPress={uploadImage} style={style.toolbarBtn}>
    <CompassIcon name='image-outline' size={20} color={theme.centerChannelColor}/>
</TouchableOpacity>
<TouchableOpacity onPress={uploadVideo} style={style.toolbarBtn}>
    <CompassIcon name='video-outline' size={20} color={theme.centerChannelColor}/>
</TouchableOpacity>
```

**修改后**：
```typescript
<TouchableOpacity onPress={uploadFile} style={style.toolbarBtn}>
    <CompassIcon name='folder-outline' size={20} color={theme.centerChannelColor}/>
</TouchableOpacity>
// 图片和音视频按钮已移除
```

### 2. 添加大号按钮样式（第 1150-1158 行）

**新增样式**：
```typescript
toolbarBtnLarge: {
    padding: 12,        // 增大内边距
    borderRadius: 6,    // 更大圆角
    marginLeft: 4,      // 左边间距
},
```

### 3. 应用大号样式到麦克风按钮（第 992-1010 行）

**录音状态**：
```typescript
<TouchableOpacity
    onPress={async () => {
        const finalText = await stopStreaming();
        console.log('[SmartNote] Voice stopped, final text:', finalText);
    }}
    style={[style.toolbarBtnLarge, style.toolbarBtnActive]}  // ← 大号样式 + 激活状态
>
    <CompassIcon name='microphone' size={28} color={theme.dndIndicator}/>  // ← 28px 图标
</TouchableOpacity>
```

**空闲状态**：
```typescript
<TouchableOpacity
    onPress={async () => {
        const started = await startStreaming();
        if (!started) {
            Alert.alert(
                intl.formatMessage({id: 'smart_notebook.voice_error', defaultMessage: '语音转文字失败'}),
                voiceStreamResult.error || '启动失败',
            );
        }
    }}
    style={style.toolbarBtnLarge}  // ← 大号样式
>
    <CompassIcon name='microphone-outline' size={28} color={theme.centerChannelColor}/>  // ← 28px 图标
</TouchableOpacity>
```

## 📐 视觉效果

### 工具条布局

**修改前**：
```
┌──────────────────────────────────────────────────┐
│ H1  •  1.  "  </>  📁  🖼️  🎥  🎤              │
└──────────────────────────────────────────────────┘
  1  2  3  4  5   6   7   8   9
```

**修改后**：
```
┌──────────────────────────────────────────────────┐
│ H1  •  1.  "  </>  📁      🎤(大)               │
└──────────────────────────────────────────────────┘
  1  2  3  4  5   6         7
```

### 麦克风按钮对比

**之前**：
```
┌─────┐
│ 🎤  │  20px 图标，8px 内边距
└─────┘
```

**之后**：
```
┌───────────┐
│   🎤(大)  │  28px 图标，12px 内边距
└───────────┘
```

## 🎯 用户体验改进

### 1. 简化工具条
- 移除了不常用的媒体上传功能
- 工具条更简洁，聚焦于核心编辑功能
- 减少视觉干扰

### 2. 突出语音功能
- 麦克风按钮更大，更容易点击
- 语音转文字是智能笔记本的核心功能
- 更大的按钮尺寸提升可用性

### 3. 保持一致性
- 保留文件上传功能（可以上传任何文件，包括图片）
- 用户仍可以通过文件选择器上传图片或视频
- 只是移除了专门的快捷按钮

## 📊 功能影响

### 仍然可以上传图片/视频
用户可以通过以下方式：
1. **文件按钮** → 选择图片或视频文件
2. 系统文件选择器会显示所有文件类型
3. 上传后自动识别为媒体块

### 不影响已有内容
- 已上传的图片和视频仍然正常显示
- 媒体块的渲染逻辑没有变化
- 只是工具条入口被移除

## 🧪 测试建议

### 测试 1：工具条显示
1. 打开智能笔记本编辑模式
2. **预期**：看到 7 个按钮（H1, •, 1., ", </>, 📁, 🎤）
3. **确认**：没有图片（🖼️）和音视频（🎥）按钮

### 测试 2：麦克风按钮尺寸
1. 观察麦克风按钮
2. **预期**：比其他按钮明显更大
3. **测量**：图标 28px，内边距 12px

### 测试 3：文件上传仍可上传图片
1. 点击文件夹按钮（📁）
2. 选择一张图片
3. **预期**：图片正常上传并显示为媒体块

### 测试 4：录音按钮交互
1. 点击麦克风按钮
2. **预期**：开始录音，按钮变为激活状态（红色背景）
3. 再次点击
4. **预期**：停止录音，文字插入到编辑区

## ⚠️ 注意事项

### 1. 向后兼容
- 已有的图片和视频内容不受影响
- 媒体块的渲染逻辑没有变化
- 只是工具条入口被移除

### 2. 用户习惯
- 习惯使用快捷按钮的用户可能需要适应
- 可以通过文件夹按钮继续上传图片/视频
- 麦克风按钮变大，提升易用性

### 3. 响应式设计
- 工具条按钮数量减少，更适合小屏幕
- 麦克风按钮变大，更容易触摸
- 整体布局更平衡

## 🚀 后续优化建议

### 1. 更多格式支持
- 支持更多快捷插入格式（表格、分隔线等）
- 可以通过长按或右键菜单访问

### 2. 自定义工具条
- 允许用户自定义工具条按钮
- 保存用户偏好设置

### 3. 语音功能增强
- 添加语音设置按钮（语言选择）
- 显示实时转录预览
- 语音命令支持（"换行"、"删除"等）

## ✅ 完成状态

- [x] 移除图片按钮
- [x] 移除音视频按钮
- [x] 添加大号麦克风按钮样式
- [x] 应用大号样式到录音状态按钮
- [x] 应用大号样式到空闲状态按钮
- [x] 增大麦克风图标尺寸（20px → 28px）
- [x] 增大按钮内边距（8px → 12px）
- [x] 增加按钮圆角（4px → 6px）
- [x] 添加左边间距（4px）

## 📚 相关代码

- **工具条定义**: 第 960-1013 行
- **样式定义**: 第 1150-1158 行
- **麦克风功能**: 第 981-1011 行

---

**修改时间**: 2026-11-05  
**修改人员**: xq_mattermost_server  
**状态**: ✅ 已完成  
**测试**: 待真机验证
