# 拖拽排序功能实现总结

## 完成的改造

### 1. 移除旧的工具条 (BlockActions)
- **问题**: 旧的工具条（上移/下移/删除/添加按钮）引起很多 bug，使用不方便
- **解决方案**: 完全移除 BlockActions 组件
- **文件**: `app/screens/home/apps/smart_notebook/block_editor.tsx`

### 2. 实现拖拽排序
- **技术**: 使用 `react-native-draggable-flatlist` 库
- **功能**: 
  - 每个块左侧显示拖拽手柄图标（仅编辑模式）
  - 长按拖拽手柄可移动块
  - 拖拽时块有高亮效果和阴影
  - 释放后自动更新块顺序
- **关键代码**:
  - `handleDragEnd`: 处理拖拽结束后的重新排序
  - `BlockWrapper`: 包装每个块，添加拖拽手柄和删除按钮
  - `DraggableFlatList`: 替代原有的 FlatList

### 3. 添加删除按钮
- **位置**: 每个块右侧显示垃圾桶图标（仅编辑模式）
- **样式**: 半透明红色，不干扰编辑
- **行为**: 点击直接删除该块
- **保护**: 最后一个块不会被删除，只会清空内容

### 4. + 按钮已存在
- **位置**: 顶部工具栏，文件图标按钮前面
- **功能**: 点击后在文档末尾添加段落块并自动聚焦
- **文件**: `app/screens/home/apps/smart_notebook/smart_note_detail_screen.tsx` (行 1217-1230)

## 技术细节

### 新增组件

#### BlockWrapper
```typescript
type BlockWrapperProps = {
    children: React.ReactNode;
    editable: boolean;
    onDrag: () => void;
    onDelete: () => void;
    isActive: boolean;
    theme: Theme;
};
```

包装每个块，提供：
- 左侧：拖拽手柄（`drag-vertical` 图标）
- 中间：块内容（flex: 1）
- 右侧：删除按钮（`trash-can-outline` 图标）

### 修改的组件

#### BlockItem
- 移除 props: `onMoveUp`, `onMoveDown`, `isFirst`, `isLast`
- 新增 props: `drag`, `isActive`
- 所有块类型（video, audio, image, file, divider, list, text）都用 BlockWrapper 包装

#### BlockEditor
- 替换 `FlatList` 为 `DraggableFlatList`
- 移除 `handleMoveUp` 和 `handleMoveDown`
- 新增 `handleDragEnd` 处理拖拽排序
- 更新 `renderItem` 传递 `drag` 和 `isActive` props

### 新增样式

```typescript
blockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
},
blockRowActive: {
    backgroundColor: changeOpacity(theme.buttonBg, 0.1),
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
},
dragHandle: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
},
blockContent: {
    flex: 1,
},
trashButton: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
},
```

## 依赖项

已在 `package.json` 中添加：
```json
"react-native-draggable-flatlist": "4.0.1"
```

**注意**: 需要运行 `npm install` 安装依赖（需要兼容的 Node 版本）

## 用户体验改进

1. **更直观**: 拖拽比点击上下箭头更自然
2. **更高效**: 一次拖拽可以移动多个位置，不需要多次点击
3. **更少 bug**: 移除了引起问题的工具条
4. **更简洁**: 删除按钮始终可见，不需要先选中块
5. **视觉反馈**: 拖拽时有高亮和阴影效果

## 测试建议

1. 拖拽不同类型的块（文本、图片、文件、列表等）
2. 拖拽到不同位置（开头、中间、结尾）
3. 删除不同类型的块
4. 确保最后一个块不能被删除（只清空）
5. 测试 + 按钮添加新块并自动聚焦
6. 测试编辑模式和只读模式的区别

## 已知限制

1. 需要兼容的 Node 版本才能安装依赖（^18.18.0 || ^20.0.0 || ^22.11.0）
2. 拖拽手柄只在编辑模式显示
3. 删除按钮只在编辑模式显示
4. 拖拽时滚动可能需要优化（DraggableFlatList 的 autoscroll 功能）
