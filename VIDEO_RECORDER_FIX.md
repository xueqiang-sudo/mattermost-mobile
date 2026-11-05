# 视频录制页面问题修复

## 🐛 问题描述

用户报告的问题：
1. **录制页面无法关闭** - 点击左上角 X 按钮不会关闭录制页面
2. **录制完成后页面不消失** - 点录制、点停止后，录制页面还在
3. **录制的视频没有发送到聊天窗口** - 视频文件丢失

## 🔍 问题根因

### 1. 关闭方式错误
```typescript
// ❌ 错误的代码
const closeModal = useCallback(async () => {
    setTorchOn(false);
    await popTopScreen(componentId);  // 错误！
}, [componentId]);
```

**原因**：
- 录制页面是用 `goToScreen()` 以 **Modal** 方式打开的（全屏模态）
- 关闭 Modal 应该用 `dismissModal()`
- 但代码使用了 `popTopScreen()`（用于导航栈，不是 Modal）

### 2. 回调执行顺序错误
```typescript
// ❌ 错误的代码
onRecordingFinished: (video: VideoFile) => {
    void (async () => {
        await popTopScreen(componentId);  // 先关闭页面
        onVideoRecorded(video);           // 再调用回调（可能丢失）
    })();
}
```

**原因**：
- 先关闭页面，组件被销毁
- 回调 `onVideoRecorded` 可能无法执行
- 导致视频无法发送到聊天窗口

## ✅ 修复方案

### 修复1：使用正确的关闭方法

```typescript
// ✅ 修复后的代码
const closeModal = useCallback(async () => {
    setTorchOn(false);
    // 修复：使用 dismissModal 而不是 popTopScreen，因为这个页面是 Modal
    await dismissModal();
}, []);  // 不再依赖 componentId
```

### 修复2：调整执行顺序

```typescript
// ✅ 修复后的代码
onRecordingFinished: (video: VideoFile) => {
    setIsRecording(false);
    setTorchOn(false);

    // 修复：先调用回调发送视频，然后再关闭页面
    // 之前的顺序是先关闭页面，可能导致回调丢失
    try {
        console.log('[DraftVideoRecorder] calling onVideoRecorded callback first');
        onVideoRecorded(video);
        console.log('[DraftVideoRecorder] onVideoRecorded callback completed');
    } catch (error) {
        console.error('[DraftVideoRecorder] onVideoRecorded callback failed', error);
    }

    // 延迟关闭页面，确保回调完成
    setTimeout(() => {
        console.log('[DraftVideoRecorder] dismissing modal after delay');
        void dismissModal();
    }, 100);
}
```

## 📝 修改的文件

**文件**: `/home/work/mattermost-mobile/app/screens/draft_video_recorder/index.tsx`

### 改动点

1. **第364-367行**: `closeModal` 函数
   ```diff
   - await popTopScreen(componentId);
   + await dismissModal();
   ```

2. **第479-490行**: `onRecordingFinished` 回调
   ```diff
   - void (async () => {
   -     await popTopScreen(componentId);
   -     onVideoRecorded(video);
   - })();
   + try {
   +     onVideoRecorded(video);
   + } catch (error) {
   +     console.error('...', error);
   + }
   + setTimeout(() => {
   +     void dismissModal();
   + }, 100);
   ```

## 🧪 测试步骤

### 测试1：X按钮关闭
1. 打开聊天窗口
2. 点击加号（+）
3. 点击"录制"
4. **点击左上角 X 按钮**
5. ✅ **预期**: 录制页面关闭，返回聊天窗口

### 测试2：录制并发送
1. 打开聊天窗口
2. 点击加号（+）
3. 点击"录制"
4. **点击录制按钮开始录制**
5. 录制几秒钟
6. **点击停止按钮**
7. ✅ **预期**: 
   - 录制页面自动关闭
   - 视频发送到聊天窗口
   - 可以点发送按钮发送

### 测试3：取消录制
1. 开始录制
2. 点击取消按钮
3. ✅ **预期**: 录制页面关闭，不发送视频

## 🔧 相关代码

### Modal打开方式
```typescript
// show_modal.ts
export function showDraftVideoRecorderModal(passProps) {
    goToScreen(Screens.DRAFT_VIDEO_RECORDER, '', passProps, {
        modalPresentationStyle: OptionsModalPresentationStyle.fullScreen,
        // ... 其他配置
    });
}
```

### Modal vs Navigation Stack

| 打开方式 | 关闭方式 | 用途 |
|---------|---------|------|
| `goToScreen` (Modal) | `dismissModal()` | 全屏模态（如录制页面） |
| `pushScreen` (导航栈) | `popTopScreen()` | 页面堆栈（如详情页） |

## ⚠️ 注意事项

1. **不要混用关闭方式**
   - Modal 必须用 `dismissModal()`
   - 导航栈页面用 `popTopScreen()`
   - 用错会导致页面无法关闭

2. **回调执行顺序**
   - 涉及数据传递时，先执行回调
   - 再关闭页面
   - 避免组件销毁后回调失效

3. **错误处理**
   - 用 try-catch 包裹回调
   - 即使回调失败也关闭页面
   - 避免用户卡在录制页面

## 📚 相关文件

- `/app/screens/draft_video_recorder/index.tsx` - 录制页面组件
- `/app/screens/draft_video_recorder/show_modal.ts` - Modal打开方式
- `/app/screens/navigation.ts` - 导航方法定义

## ✅ 修复验证

- [x] X按钮可以关闭录制页面
- [x] 录制完成后页面自动关闭
- [x] 视频成功发送到聊天窗口
- [x] 取消录制正常工作
- [x] 错误处理完善

---

**修复时间**: 2026-11-05  
**修复人员**: xq_mattermost_server
