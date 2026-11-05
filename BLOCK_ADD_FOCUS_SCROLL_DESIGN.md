# 智能笔记本块添加后自动聚焦和智能滚动方案

## 📋 需求描述

当用户点击块右侧的"+"按钮时：
1. 在当前块下方创建新块
2. 光标自动聚焦到新块的 TextInput
3. 页面智能滚动，让新块处于编辑区中间位置
4. 提供流畅的编辑体验

## 🎯 解决方案

### 核心思路

```
点击"+"按钮
    ↓
handleAddAfter(index)
    ↓
创建新块并插入到 blocks[index + 1]
    ↓
setNextFocusIndex(index + 1)
    ↓
触发 useEffect 监听 nextFocusIndex
    ↓
├─ BlockItem 检测 autoFocus=true → textInputRef.focus()
└─ FlatList.scrollToIndex({ index, viewPosition: 0.5 })
```

### 关键技术点

#### 1. FlatList 引用管理

```typescript
const flatListRef = useRef<FlatList>(null);
```

#### 2. 智能滚动到中间

```typescript
// viewPosition 参数说明：
// 0 = 顶部对齐
// 0.5 = 中间对齐（推荐）
// 1 = 底部对齐
flatListRef.current?.scrollToIndex({
    index: targetIndex,
    animated: true,
    viewPosition: 0.5,  // 滚动到中间
});
```

#### 3. 延迟滚动（等待 DOM 更新）

```typescript
useEffect(() => {
    if (nextFocusIndex != null && nextFocusIndex >= 0 && nextFocusIndex < blocks.length) {
        // 设置焦点
        setFocusedIndex(nextFocusIndex);
        
        // 延迟滚动，确保新块已渲染
        setTimeout(() => {
            flatListRef.current?.scrollToIndex({
                index: nextFocusIndex,
                animated: true,
                viewPosition: 0.5,
            });
        }, 150);  // 等待 DOM 更新和焦点设置
        
        setNextFocusIndex(null);
    }
}, [nextFocusIndex, blocks.length]);
```

## 🔧 实现代码

### 1. 添加 FlatList 引用

```typescript
// ---- Main Block Editor Component ----
const BlockEditor = ({blocks, onChange, theme, editable, onFocusedIndexChange, pendingFocusIndex, onFocusApplied}: BlockEditorProps) => {
    const style = getBlockStyle(theme);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const [nextFocusIndex, setNextFocusIndex] = useState<number | null>(null);
    
    // 新增：FlatList 引用
    const flatListRef = useRef<FlatList>(null);
    
    // ... 其他代码
};
```

### 2. 修改 handleAddAfter 支持自动聚焦

```typescript
const handleAddAfter = useCallback((index: number, type?: SmartNoteBlock['type'], meta?: any) => {
    const newBlock = createBlock(type || 'paragraph', '');
    if (meta) {
        newBlock.meta = meta;
    }
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    // Update order
    newBlocks.forEach((b, i) => {
        b.order = i;
    });
    onChange(newBlocks);
    
    // 新增：设置下一个焦点（让"+"按钮也支持自动聚焦）
    setNextFocusIndex(index + 1);
}, [blocks, onChange]);
```

### 3. 添加智能滚动逻辑

```typescript
// 处理列表项回车或"+"按钮后的焦点定位和滚动
useEffect(() => {
    if (nextFocusIndex != null && nextFocusIndex >= 0 && nextFocusIndex < blocks.length) {
        // 设置焦点
        setFocusedIndex(nextFocusIndex);
        
        // 延迟滚动，确保新块已渲染并且焦点已设置
        setTimeout(() => {
            flatListRef.current?.scrollToIndex({
                index: nextFocusIndex,
                animated: true,
                viewPosition: 0.5,  // 滚动到中间位置
            });
        }, 150);  // 等待 DOM 更新
        
        // 清除状态
        setNextFocusIndex(null);
    }
}, [nextFocusIndex, blocks.length]);
```

### 4. 绑定 FlatList 引用

```typescript
return (
    <>
        <FlatList
            ref={flatListRef}  // 新增：绑定引用
            data={blocks}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={style.listContent}
            keyboardShouldPersistTaps='handled'
            scrollEnabled={false}
        />
        
        {/* 媒体播放器 Modal */}
        {/* ... */}
    </>
);
```

## 📐 滚动位置说明

### viewPosition 参数

```
viewPosition = 0 (顶部对齐)
┌──────────────────┐
│ 新块位置          │ ← 新块在顶部
│                  │
│                  │
│                  │
│                  │
└──────────────────┘

viewPosition = 0.5 (中间对齐 - 推荐)
┌──────────────────┐
│                  │
│                  │
│ 新块位置          │ ← 新块在中间
│                  │
│                  │
└──────────────────┘

viewPosition = 1 (底部对齐)
┌──────────────────┐
│                  │
│                  │
│                  │
│                  │
│ 新块位置          │ ← 新块在底部
└──────────────────┘
```

### 为什么选择 0.5（中间）？

✅ **优点**：
- 用户可以看到上下文（上方和下方的内容）
- 符合编辑习惯（类似 Word、Notion）
- 减少滚动次数
- 视觉焦点集中

❌ **其他选项的问题**：
- `viewPosition: 0` (顶部) - 看不到上方内容，需要向上滚动
- `viewPosition: 1` (底部) - 新块可能被键盘遮挡

## 🎨 用户体验流程

### 场景 1：点击"+"按钮

```
步骤 1: 用户点击块右侧的"+"按钮
┌──────────────────┐
│ 第一项内容        │ [+] ← 点击这里
│                  │
│                  │
└──────────────────┘

步骤 2: 创建新块并聚焦
┌──────────────────┐
│ 第一项内容        │
│                  │ ← 新块自动获得焦点
│ | 光标在这里      │ ← 自动滚动到中间
│                  │
└──────────────────┘

步骤 3: 用户开始输入
┌──────────────────┐
│ 第一项内容        │
│                  │
│ 第二项内容|       │ ← 用户输入
│                  │
└──────────────────┘
```

### 场景 2：列表项按回车

```
步骤 1: 用户在列表项末尾按回车
┌──────────────────┐
│ • 第一项内容|     │ ← 光标在这里
│                  │
│                  │
└──────────────────┘

步骤 2: 创建新列表项并聚焦
┌──────────────────┐
│ • 第一项内容      │
│                  │
│ • | 光标在这里    │ ← 新列表项，自动滚动到中间
│                  │
└──────────────────┘
```

## ⚠️ 注意事项

### 1. 延迟时间选择

```typescript
setTimeout(() => {
    flatListRef.current?.scrollToIndex({...});
}, 150);  // 150ms 延迟
```

**为什么需要延迟？**
- React 状态更新需要时间
- DOM 渲染需要时间
- TextInput 聚焦需要时间

**延迟时间建议**：
- **100ms** - 可能太短，DOM 未完全更新
- **150ms** - 推荐，平衡响应速度和稳定性
- **200ms** - 稍慢，但更稳定
- **>300ms** - 用户会感到明显延迟

### 2. scrollEnabled 设置

```typescript
<FlatList
    scrollEnabled={false}  // 禁用手动滚动
    // ...
/>
```

**原因**：
- 智能笔记本通常嵌入在 ScrollView 中
- 避免嵌套滚动冲突
- 通过程序控制滚动（scrollToIndex）

**注意**：
- 如果 `scrollEnabled={false}`，`scrollToIndex` 仍然可以工作
- 但用户不能手动滚动 FlatList

### 3. 键盘避让

```typescript
keyboardShouldPersistTaps='handled'
```

**作用**：
- 键盘弹出时不自动收起
- 点击 TextInput 保持键盘打开
- 提供更好的编辑体验

### 4. 边界情况处理

```typescript
if (nextFocusIndex != null && nextFocusIndex >= 0 && nextFocusIndex < blocks.length) {
    // 只在有效范围内滚动
}
```

**处理的边界情况**：
- `nextFocusIndex` 为 null
- 索引超出范围（< 0 或 >= blocks.length）
- FlatList 引用未初始化

## 🧪 测试场景

### 测试 1：点击"+"按钮

1. 打开智能笔记本
2. 在任意块上点击"+"按钮
3. **预期**：
   - ✅ 新块创建成功
   - ✅ 光标自动聚焦到新块
   - ✅ 新块滚动到屏幕中间
   - ✅ 键盘自动弹出

### 测试 2：连续点击"+"按钮

1. 在第一个块点击"+"
2. 在新块继续点击"+"
3. **预期**：
   - ✅ 每次都能创建新块
   - ✅ 每次都能正确聚焦
   - ✅ 页面平滑滚动

### 测试 3：列表项回车

1. 在无序列表项输入内容
2. 按回车键
3. **预期**：
   - ✅ 创建新列表项
   - ✅ 光标移动到新项
   - ✅ 页面滚动到中间

### 测试 4：多个块的情况

1. 创建 10 个以上的块
2. 在第 5 个块点击"+"
3. **预期**：
   - ✅ 新块（第 6 个）滚动到中间
   - ✅ 可以看到第 4、5、6、7 个块
   - ✅ 滚动动画流畅

## 📊 性能优化

### 1. 避免频繁滚动

```typescript
useEffect(() => {
    if (nextFocusIndex != null) {
        // 只在真正需要时滚动
        setTimeout(() => {
            flatListRef.current?.scrollToIndex({...});
        }, 150);
        setNextFocusIndex(null);  // 立即清除状态
    }
}, [nextFocusIndex]);
```

### 2. 使用动画

```typescript
animated: true  // 平滑滚动动画
```

**好处**：
- 用户体验更流畅
- 减少突兀感
- 帮助用户理解位置变化

### 3. 优化 FlatList

```typescript
<FlatList
    // 性能优化配置
    removeClippedSubviews={true}
    maxToRenderPerBatch={10}
    windowSize={5}
    // ...
/>
```

## 🚀 进阶功能

### 1. 自定义滚动位置

```typescript
// 允许用户偏好设置
const scrollPosition = userPreference === 'top' ? 0 : 
                       userPreference === 'bottom' ? 1 : 0.5;

flatListRef.current?.scrollToIndex({
    index: nextFocusIndex,
    viewPosition: scrollPosition,
});
```

### 2. 滚动偏移量

```typescript
// 考虑键盘高度的偏移
flatListRef.current?.scrollToOffset({
    offset: targetOffset - keyboardHeight / 2,
    animated: true,
});
```

### 3. 滚动完成回调

```typescript
flatListRef.current?.scrollToIndex({
    index: nextFocusIndex,
    animated: true,
    viewPosition: 0.5,
    // onComplete: () => {
    //     console.log('滚动完成');
    // }
});
```

## ✅ 实现清单

- [ ] 添加 `flatListRef` 引用
- [ ] 修改 `handleAddAfter` 设置 `nextFocusIndex`
- [ ] 添加 `useEffect` 监听 `nextFocusIndex`
- [ ] 实现 `scrollToIndex` 滚动到中间
- [ ] 设置延迟 150ms
- [ ] 绑定 FlatList 引用
- [ ] 测试"+"按钮聚焦
- [ ] 测试列表项回车聚焦
- [ ] 测试连续添加
- [ ] 测试多个块的情况
- [ ] 验证滚动动画流畅
- [ ] 验证键盘避让正常

## 📚 参考资料

- [React Native FlatList scrollToIndex](https://reactnative.dev/docs/flatlist#scrolltoindex)
- [React useRef Hook](https://react.dev/reference/react/useRef)
- [React Native TextInput focus](https://reactnative.dev/docs/textinput#focus)

---

**设计时间**: 2026-11-05  
**设计人员**: xq_mattermost_server  
**状态**: 📝 方案设计完成  
**实现**: 待编码
