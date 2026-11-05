# 智能笔记本列表项回车自动续行功能

## 📋 功能描述

在智能笔记本中，当用户在列表块（无序列表、有序列表、待办列表）内按回车键时：
- 如果当前列表项**有内容**：自动创建相同类型的新列表项
- 如果当前列表项**为空**：转换为普通段落

### 支持的列表类型

1. **无序列表** (`bulleted-list`)
   - 前缀：`• `
   - 回车后：创建新的无序列表项

2. **有序列表** (`numbered-list`)
   - 前缀：`1. `, `2. `, `3. `...
   - 回车后：创建下一个序号的有序列表项
   - 例如：在 "1. 第一项" 后回车 → 创建 "2. "

3. **待办列表** (`checklist`)
   - 前缀：`☐ ` (未选中) 或 `☑ ` (已选中)
   - 回车后：创建新的未选中待办项

## 🎯 用户体验

### 示例 1：无序列表

```
用户输入：
• 第一项|  ← 光标在这里
[按回车]

结果：
• 第一项
• |  ← 光标移动到新行
```

### 示例 2：有序列表

```
用户输入：
1. 第一步|  ← 光标在这里
[按回车]

结果：
1. 第一步
2. |  ← 自动递增序号
```

### 示例 3：空列表项退出

```
用户输入：
• 第一项
• |  ← 空列表项，光标在这里
[按回车]

结果：
• 第一项
|  ← 转换为普通段落
```

## 🔧 技术实现

### 修改的文件

**文件**: `/home/work/mattermost-mobile/app/screens/home/apps/smart_notebook/block_editor.tsx`

### 关键改动

#### 1. BlockItem 组件 - 添加键盘事件处理

```typescript
// 处理回车键：列表项自动续行
const handleKeyPress = useCallback((e: any) => {
    if (e.nativeEvent.key === 'Enter') {
        // 检查是否是列表类型
        if (block.type === 'bulleted-list' || 
            block.type === 'numbered-list' || 
            block.type === 'checklist') {
            
            // 空列表项 → 转换为段落
            if (!block.content.trim()) {
                onChange(index, {
                    ...block, 
                    type: 'paragraph', 
                    content: '', 
                    meta: undefined
                });
                return;
            }

            // 有内容 → 创建新列表项
            let newMeta: any = {};
            if (block.type === 'numbered-list') {
                // 有序列表：序号加1
                const currentNumber = block.meta?.number || 1;
                newMeta = {number: currentNumber + 1};
            } else if (block.type === 'checklist') {
                // 待办列表：默认未选中
                newMeta = {checked: false};
            }

            // 创建新块并设置焦点
            onAddAfterWithFocus(index, block.type, newMeta);
        }
    }
}, [index, block, onChange, onAddAfterWithFocus]);
```

#### 2. TextInput - 绑定键盘事件

```typescript
<TextInput
    ref={textInputRef}
    style={[style.textInput, blockStyle]}
    value={block.content}
    onChangeText={handleContentChange}
    onFocus={handleFocus}
    onKeyPress={handleKeyPress}  // ← 新增
    placeholder={getPlaceholder()}
    multiline
    editable={editable}
    textAlignVertical='top'
/>
```

#### 3. BlockEditor 组件 - 管理焦点状态

```typescript
// 添加焦点状态
const [nextFocusIndex, setNextFocusIndex] = useState<number | null>(null);

// 处理列表项回车后的焦点定位
useEffect(() => {
    if (nextFocusIndex != null && 
        nextFocusIndex >= 0 && 
        nextFocusIndex < blocks.length) {
        setFocusedIndex(nextFocusIndex);
        setNextFocusIndex(null);  // 清除状态
    }
}, [nextFocusIndex, blocks.length]);

// 添加新块并设置焦点
const handleAddAfterWithFocus = useCallback((index, type, meta) => {
    const newBlock = createBlock(type || 'paragraph', '');
    if (meta) {
        newBlock.meta = meta;
    }
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    
    // 更新顺序
    newBlocks.forEach((b, i) => {
        b.order = i;
    });
    
    onChange(newBlocks);
    setNextFocusIndex(index + 1);  // 设置下一个焦点
}, [blocks, onChange]);
```

#### 4. BlockItem - 自动聚焦逻辑

```typescript
const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

// 自动聚焦 TextInput
useEffect(() => {
    if ((autoFocus || shouldAutoFocus) && textInputRef.current) {
        setTimeout(() => {
            textInputRef.current?.focus();
            setShouldAutoFocus(false);
        }, 100);
    }
}, [autoFocus, shouldAutoFocus]);

// 传递给 autoFocus 属性
autoFocus={pendingFocusIndex === index || nextFocusIndex === index}
```

### 数据流

```
用户按回车
    ↓
handleKeyPress 检测 Enter 键
    ↓
检查 block.type 是否是列表
    ↓
├─ 空内容 → onChange 转换为 paragraph
└─ 有内容 → onAddAfterWithFocus
                ↓
            创建新 block (相同类型 + meta)
                ↓
            插入到 blocks[index + 1]
                ↓
            setNextFocusIndex(index + 1)
                ↓
            useEffect 触发
                ↓
            setFocusedIndex(index + 1)
                ↓
            BlockItem 检测到 autoFocus=true
                ↓
            textInputRef.current.focus()
```

## 📝 类型定义

### BlockItemProps

```typescript
type BlockItemProps = {
    block: SmartNoteBlock;
    index: number;
    onChange: (index: number, block: SmartNoteBlock) => void;
    onDelete: (index: number) => void;
    onAddAfter: (index: number, type?: SmartNoteBlock['type'], meta?: any) => void;
    onAddAfterWithFocus: (index: number, type?: SmartNoteBlock['type'], meta?: any) => void;  // ← 新增
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    onFocus: (index: number) => void;
    // ...
};
```

### SmartNoteBlock.meta

```typescript
type SmartNoteBlock = {
    id: string;
    type: 'paragraph' | 'heading' | 'bulleted-list' | 'numbered-list' | ... ;
    content: string;
    order: number;
    meta?: Record<string, any>;  // ← 用于存储列表信息
    // bulleted-list: 无特殊 meta
    // numbered-list: { number: 1 }
    // checklist: { checked: false }
};
```

## 🧪 测试场景

### 场景 1：无序列表续行

1. 创建无序列表块
2. 输入 "购物清单"
3. 按回车
4. **预期**：创建新的无序列表项，光标移动到新项

### 场景 2：有序列表序号递增

1. 创建有序列表块
2. 输入 "第一步"
3. 按回车
4. **预期**：创建 "2. " 的新项

### 场景 3：待办列表状态

1. 创建待办列表块
2. 输入 "完成报告"
3. 按回车
4. **预期**：创建新的未选中待办项 "☐ "

### 场景 4：空列表项退出

1. 在列表末尾按回车（空内容）
2. **预期**：转换为普通段落，退出列表模式

### 场景 5：连续创建

1. 在列表项中输入内容
2. 连续按回车多次
3. **预期**：每次都能创建新的列表项

## ⚠️ 注意事项

### 1. 平台兼容性

- **Android**: `onKeyPress` 事件在大多数 Android 设备上可用
- **iOS**: 完全支持
- **旧设备**: 某些旧版 React Native 可能不支持 `onKeyPress`

**备选方案**（如果需要）：
```typescript
// 使用 onChangeText 检测换行符
const handleContentChange = useCallback((text: string) => {
    const lines = text.split('\n');
    if (lines.length > 1) {
        // 检测到换行，触发列表续行逻辑
        handleListContinuation(lines);
    }
    onChange(index, {...block, content: text});
}, [index, block, onChange]);
```

### 2. 性能考虑

- **焦点状态管理**：使用 `useState` 而不是全局状态
- **延迟聚焦**：`setTimeout(..., 100)` 确保 DOM 更新完成
- **清除状态**：使用后立即 `setNextFocusIndex(null)`

### 3. 用户体验优化

- **空内容退出**：避免创建空列表项
- **自动聚焦**：无缝的编辑体验
- **保持类型**：列表类型和 meta 信息正确传递

## 🚀 后续优化

### 1. Tab 键缩进

```typescript
if (e.nativeEvent.key === 'Tab') {
    // 增加缩进层级
    // 需要支持嵌套列表
}
```

### 2. Shift+Enter 换行

```typescript
if (e.nativeEvent.key === 'Enter' && e.nativeEvent.shiftKey) {
    // 在同一个列表项内换行
    // 不创建新列表项
}
```

### 3. 退格键删除

```typescript
if (e.nativeEvent.key === 'Backspace' && !block.content) {
    // 删除空列表项，返回上一个列表项
}
```

### 4. 拖拽排序

- 列表项支持长按拖拽
- 自动重新编号（有序列表）

## ✅ 完成状态

- [x] 无序列表回车续行
- [x] 有序列表回车续行（序号递增）
- [x] 待办列表回车续行
- [x] 空列表项转换为段落
- [x] 自动聚焦到新列表项
- [x] 保持列表类型和 meta 信息
- [x] 更新 block.order
- [x] 类型定义完整
- [x] 依赖数组正确

## 📚 参考资料

- [React Native TextInput onKeyPress](https://reactnative.dev/docs/textinput#onkeypress)
- [React Hooks useCallback](https://react.dev/reference/react/useCallback)
- [Smart Notebook Block Editor](./block_editor.tsx)

---

**实现时间**: 2026-11-05  
**实现人员**: xq_mattermost_server  
**状态**: ✅ 已完成  
**测试**: 待真机验证
