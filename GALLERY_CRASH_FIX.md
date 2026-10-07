# 图片全屏查看崩溃问题修复说明

## 问题描述
在聊天窗口中点击图片进入全屏查看模式时，应用直接崩溃。

## 根本原因
在 React Native Reanimated 3 中，**worklet** 函数运行在 UI 线程上，而普通的 JavaScript 函数必须在 JS 线程上执行。当在 worklet 回调中直接调用 JS 函数时，会尝试在错误的线程上执行代码，导致应用崩溃。

必须使用 `runOnJS()` 来桥接 UI 线程到 JS 线程的函数调用。

## 修复的文件

### 1. `app/screens/gallery/lightbox_swipeout/index.tsx`
**问题**: 在动画完成回调中直接调用 `onAnimationFinished()`

```typescript
// ❌ 错误 - 会导致崩溃
animationProgress.value = withTiming(0, pagerTimingConfig, () => {
    'worklet';
    opacity.value = 1;
    onAnimationFinished();  // 直接在 worklet 中调用 JS 函数
});

// ✅ 正确 - 使用 runOnJS 桥接
animationProgress.value = withTiming(0, pagerTimingConfig, () => {
    'worklet';
    opacity.value = 1;
    runOnJS(onAnimationFinished)();  // 正确桥接到 JS 线程
});
```

**修改**:
- 添加了 `runOnJS` 到导入列表
- 第79行: `onAnimationFinished()` → `runOnJS(onAnimationFinished)()`

---

### 2. `app/screens/gallery/pager/gestures/useLightboxPanGesture.ts`
**问题**: 在手势结束时的动画回调中直接调用 `onAnimationFinished()` (两处)

```typescript
// ❌ 错误 - 第88行
animationProgress.value = withTiming(0, pagerTimingConfig, () => {
    'worklet';
    opacity.value = 1;
    onAnimationFinished();  // 崩溃
});

// ✅ 正确
animationProgress.value = withTiming(0, pagerTimingConfig, () => {
    'worklet';
    opacity.value = 1;
    runOnJS(onAnimationFinished)();
});
```

```typescript
// ❌ 错误 - 第109行
childTranslateY.value = withSpring(..., { ... }, () => {
    onAnimationFinished();  // 崩溃
});

// ✅ 正确
childTranslateY.value = withSpring(..., { ... }, () => {
    runOnJS(onAnimationFinished)();
});
```

**修改**:
- 第88行: `onAnimationFinished()` → `runOnJS(onAnimationFinished)()`
- 第109行: `onAnimationFinished()` → `runOnJS(onAnimationFinished)()`

---

### 3. `app/screens/gallery/lightbox_swipeout/lightbox.tsx`
**问题**: 在 worklet 函数中直接调用 `requestAnimationFrame` (这是一个 JS API)

```typescript
// ❌ 错误 - requestAnimationFrame 是 JS API，不能在 worklet 中直接调用
const animateOnMount = () => {
    'worklet';
    requestAnimationFrame(() => {  // 崩溃
        opacity.value = 0;
    });
};

// ✅ 正确 - 使用 runOnJS 包装
const animateOnMount = () => {
    'worklet';
    runOnJS(requestAnimationFrame)(() => {
        opacity.value = 0;
    });
};
```

**修改**:
- 第67行: `requestAnimationFrame(...)` → `runOnJS(requestAnimationFrame)(...)`

---

## 技术背景

### React Native Reanimated 3 的线程模型

```
┌─────────────────┐         ┌──────────────────┐
│   JS Thread     │         │    UI Thread     │
│                 │         │                  │
│  • React 组件   │  桥接   │  • Worklet 函数  │
│  • 状态管理     │ ◄─────► │  • 动画执行      │
│  • 业务逻辑     │ runOnJS │  • 手势处理      │
│  • 网络请求     │         │  • 60fps 渲染    │
└─────────────────┘         └──────────────────┘
```

### 关键规则

1. **标记为 `'worklet'` 的函数**运行在 UI 线程
2. **普通 JS 函数**必须在 JS 线程执行
3. **从 worklet 调用 JS 函数**必须使用 `runOnJS(fn)()`
4. **JS API** (如 `requestAnimationFrame`, `setTimeout`, `console.log`) 不能在 worklet 中直接调用

### 常见错误模式

```typescript
// ❌ 错误
const workletFn = () => {
    'worklet';
    callback();              // 如果 callback 是 JS 函数会崩溃
    setTimeout(...);         // JS API 会崩溃
    console.log(...);        // JS API 会崩溃
};

// ✅ 正确
const workletFn = () => {
    'worklet';
    runOnJS(callback)();
    runOnJS(setTimeout)(...);
    runOnJS(console.log)(...);
};
```

## 测试建议

修复后，请测试以下场景：

1. ✅ 点击图片进入全屏查看
2. ✅ 在全屏模式下左右滑动切换图片
3. ✅ 上下滑动关闭全屏查看
4. ✅ 双击缩放图片
5. ✅ 单击全屏查看的图片（应该关闭）
6. ✅ 点击关闭按钮退出全屏
7. ✅ Android 返回键退出全屏

## 验证清单

- [x] TypeScript 编译通过 (`npm run tsc`)
- [x] ESLint 检查通过 (`npm run lint`)
- [ ] 实际设备测试（iOS）
- [ ] 实际设备测试（Android）
- [ ] 全屏查看打开/关闭流畅无崩溃
- [ ] 手势交互正常
- [ ] 动画过渡自然

## 之前的尝试

从 git 历史可以看到之前做了多次尝试：
- `d269399`: 添加了 worklet 指令 ✓
- `a6a2bbe`: 优化了 useWindowDimensions 和延迟渲染 ✓
- `7ccda3c`: 调整了 numToRender 参数
- `8fa727a`: 调整了关闭按钮样式
- `ab36aa0`: 其他不相关的修改

**本次修复解决了根本原因**：跨线程函数调用未正确桥接。

## 相关文件

- `app/screens/gallery/gallery.tsx` - 画廊主组件
- `app/screens/gallery/lightbox_swipeout/index.tsx` - Lightbox 滑动退出 ✏️
- `app/screens/gallery/lightbox_swipeout/lightbox.tsx` - Lightbox 动画 ✏️
- `app/screens/gallery/pager/gestures/useLightboxPanGesture.ts` - 手势处理 ✏️
- `app/screens/gallery/renderers/image/transformer.tsx` - 图片变换器
- `app/screens/gallery/renderers/image/gestures/useTransformerSingleTap.ts` - 单击手势

---

**修复完成时间**: 2026-10-07  
**修复者**: Claude Code  
**问题级别**: 严重（应用崩溃）  
**影响范围**: 所有图片全屏查看功能
