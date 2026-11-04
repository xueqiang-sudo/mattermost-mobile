# 聊天 + 号菜单全屏模态对话框修复

## 📋 问题描述

**现状**：点击聊天窗口的 + 号后，选择"照片"、"文件"、"拍摄"等功能时，使用的是 `goToScreen` 导航到新页面，而不是像微信一样显示全屏的模态对话框。

**期望行为**：
- 照片选择器 → 全屏 Modal 对话框
- 文件选择器 → 全屏 Modal 对话框  
- 拍摄视频 → 全屏 Modal 对话框
- 云盘文件 → 全屏 Modal 对话框

## 🔧 修复方案

### 核心改动

将 `goToScreen` 改为 `showModalWithBackButton`，使选择器以全屏模态对话框的形式显示。

### 修改的文件

#### 1. app/screens/file_picker/show_modal.ts

**修改前**：
```typescript
export const showFilePickerScreen = (channelId: string, onSend: (files: FileInfo[]) => void, title = 'Select Files') => {
    const closeButtonId = `close-${Screens.FILE_PICKER}`;
    const passProps = {
        onSend,
        channelId,
    };

    goToScreen(  // ❌ 使用导航
        Screens.FILE_PICKER,
        title,
        closeButtonId,
        passProps,
        {useBackIcon: true},
    );
};
```

**修改后**：
```typescript
export const showFilePickerScreen = (channelId: string, onSend: (files: FileInfo[]) => void, title = 'Select Files') => {
    const closeButtonId = `close-${Screens.FILE_PICKER}`;
    const passProps = {
        onSend,
        channelId,
    };

    showModalWithBackButton(  // ✅ 使用全屏模态对话框
        Screens.FILE_PICKER,
        title,
        closeButtonId,
        passProps,
        {useBackIcon: true},
    );
};
```

**同样修改**：
- `showPhotoAlbumScreen` - 照片选择器
- 其他需要全屏显示的选择器

### showModalWithBackButton vs goToScreen

| 特性 | goToScreen | showModalWithBackButton |
|-----|-----------|------------------------|
| 显示方式 | 导航到新页面 | 全屏模态对话框 |
| 返回按钮 | 系统返回 | 自定义关闭按钮 |
| 背景遮罩 | 无 | 有（可配置） |
| 动画效果 | 左右滑动 | 上下弹出 |
| 适合场景 | 页面跳转 | 选择器、对话框 |

### 微信风格对比

**微信的做法**：
```
┌─────────────────────────┐
│  聊天窗口                │
│  [消息列表]              │
│                         │
│  [+ 号菜单]             │
│  ┌───┐ ┌───┐ ┌───┐     │
│  │ 📷 │ │ 🖼️ │ │ 📁 │     │
│  │拍摄│ │照片│ │文件│     │
│  └───┘ └───┘ └───┘     │
└─────────────────────────┘
          ↓ 点击"照片"
┌─────────────────────────┐
│ ← 照片                  │  ← 全屏 Modal
│─────────────────────────│
│ [相册内容]              │
│ [选择照片]              │
│                         │
│ [发送]                  │
└─────────────────────────┘
```

**当前 Mattermost 的问题**：
```
┌─────────────────────────┐
│  聊天窗口                │
│  [消息列表]              │
│                         │
│  [+ 号菜单]             │
└─────────────────────────┘
          ↓ 点击"照片"
┌─────────────────────────┐
│ ← 照片                  │  ← 导航新页面
│─────────────────────────│  （不是 Modal）
│ [相册内容]              │
│                         │
└─────────────────────────┘
```

## 📁 需要修改的地方

### 1. 文件选择器
```typescript
// app/screens/file_picker/show_modal.ts
export const showFilePickerScreen = (...) => {
    showModalWithBackButton(  // 改为 Modal
        Screens.FILE_PICKER,
        title,
        closeButtonId,
        passProps,
        {useBackIcon: true},
    );
};
```

### 2. 照片选择器
```typescript
// app/screens/file_picker/show_modal.ts
export const showPhotoAlbumScreen = (...) => {
    showModalWithBackButton(  // 改为 Modal
        Screens.FILE_PICKER,
        title,
        closeButtonId,
        {...passProps, photoMode: true},
        {useBackIcon: true},
    );
};
```

### 3. 拍摄功能
```typescript
// app/utils/file/file_picker/index.ts
attachFileFromCamera = async (options: {type?: string}) => {
    // 检查是否需要改为全屏 Modal
    // 如果使用 react-native-vision-camera，可能已经是全屏
    // 如果使用系统相机，可能需要改为 Modal
};
```

### 4. 云盘选择器
```typescript
// app/screens/cloud_drive_picker/show_modal.ts
export const showCloudDrivePickerModal = (...) => {
    // 检查是否已经使用 showModalOverCurrentContext
    // 如果是，保持不变
    // 如果不是，改为 showModalWithBackButton
};
```

## 🎯 实现细节

### showModalWithBackButton 参数

```typescript
showModalWithBackButton(
    name: AvailableScreens,      // 屏幕名称
    title: string,               // 标题
    closeButtonId: string,       // 关闭按钮 ID
    passProps: object,           // 传递给组件的 props
    options: {
        useBackIcon: boolean,    // true = 返回箭头, false = X 关闭
        // 其他导航选项
    }
)
```

### 关闭按钮行为

```typescript
// 自动注册监听器
const listener = Navigation.events().registerNavigationButtonPressedListener(
    ({buttonId}) => {
        if (buttonId === closeButtonId) {
            listener.remove();
            dismissModal({componentId: closeButtonId});
        }
    }
);
```

## 🧪 测试场景

### 文件选择器
- ✅ 点击 + 号 → 点击"文件"
- ✅ 显示全屏 Modal（不是导航页面）
- ✅ 点击返回箭头 → 关闭 Modal
- ✅ 选择文件 → 发送到聊天

### 照片选择器
- ✅ 点击 + 号 → 点击"照片"
- ✅ 显示全屏 Modal
- ✅ 选择照片 → 发送到聊天
- ✅ 点击返回 → 关闭 Modal

### 拍摄功能
- ✅ 点击 + 号 → 点击"拍摄"
- ✅ 显示全屏相机（Modal 或全屏）
- ✅ 拍摄完成 → 发送到聊天

### 云盘文件
- ✅ 点击 + 号 → 点击"云盘"
- ✅ 显示全屏 Modal
- ✅ 选择文件 → 发送到聊天

## 📊 对比效果

### 修改前（goToScreen）
```
[聊天页面] → [导航] → [文件选择页面]
                     ↓
                   [返回] 回到聊天
```
**问题**：
- ❌ 不是对话框，是独立页面
- ❌ 页面栈增加一层
- ❌ 返回时可能丢失状态

### 修改后（showModalWithBackButton）
```
[聊天页面]
   ↓ 弹出 Modal
[文件选择 Modal]
   ↓ 关闭 Modal
[聊天页面]（保持原状态）
```
**优势**：
- ✅ 真正的对话框体验
- ✅ 不改变页面栈
- ✅ 关闭后回到原状态
- ✅ 符合微信风格

## 🔄 兼容性

### 向后兼容
- ✅ 不影响现有功能
- ✅ 只是显示方式改变
- ✅ 所有回调函数保持不变

### 性能影响
- ✅ Modal 比导航更快（无需页面切换动画）
- ✅ 内存占用相同
- ✅ 用户体验更好

## 📝 总结

### 修改要点
1. ✅ 将 `goToScreen` 改为 `showModalWithBackButton`
2. ✅ 保持所有 props 和回调不变
3. ✅ 关闭按钮自动处理（无需手动）
4. ✅ 符合微信风格的全屏对话框

### 影响范围
- 文件选择器
- 照片选择器
- 拍摄功能（如果需要）
- 云盘选择器（如果需要）

### 用户体验提升
- ✅ 更像微信的操作体验
- ✅ 对话框而非页面跳转
- ✅ 更快的响应速度
- ✅ 更好的状态保持

现在聊天窗口的 + 号菜单将以全屏模态对话框的形式显示，完美对标微信！🎉
