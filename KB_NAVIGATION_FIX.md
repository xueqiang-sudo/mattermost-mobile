# 知识库文件选择崩溃修复

## 问题描述

**发生场景**：
1. 打开知识库 → 选择"选择文本" tab
2. 点击 + 按钮 → 打开文本编辑 modal
3. 在文本 modal 中点击"选择文件"按钮
4. App 直接崩溃，错误信息：
```
Couldn't find a navigation object. Is your component inside NavigationContainer?
```

**用户反馈**：
- 导航栏样式变成了系统导航栏（不是应用的自定义样式）
- App 完全崩溃，需要重启

---

## 根本原因分析

### 技术架构背景

应用使用了两种导航方式：
1. **导航栈** - 用于全屏页面（由 NavigationContainer 管理）
2. **Modal** - 用于浮层对话框（由 showModal/dismissModal 管理）

### 问题的触发流程

```
Step 1: 知识库屏幕 (在 NavigationContainer 内)
  ↓
Step 2: 用户点"选择文本" + 按钮
  ↓ setShowAddModal(true)
Step 3: 文本编辑 Modal 显示 (React state modal，不在导航栈中)
  └─ 这是一个 React component，通过 state 控制显示/隐藏
  └─ 不在 NavigationContainer 内！
  ↓
Step 4: 用户在文本 modal 中点"选择文件"
  ↓ showModal(FILE_PICKER)
Step 5: FILE_PICKER modal 显示 (modal 中嵌套 modal)
  ├─ FILE_PICKER 是通过 showModal() 打开的真实 modal
  ├─ 但它的 NavigationContainer 上下文丢失了
  ├─ 因为它位于文本 modal 内部
  └─ 文本 modal 没有 NavigationContainer 包装！
  ↓
Step 6: FILE_PICKER 的 onSend 回调 → onUploadKBFiles
  ├─ 调用 useNavigation() hook
  ├─ 尝试获取导航对象
  └─ ❌ 错误！没有找到 NavigationContainer！
```

### 为什么导航栏变成系统样式？

当应用检测到崩溃时：
1. React 错误边界捕获异常
2. 应用降级到 native 错误屏幕
3. Native 层使用系统导航栏（不是应用的自定义样式）
4. 用户看到系统样式导航栏 + 错误提示

---

## 修复方案

### 核心思路

**避免 modal 嵌套，确保 FILE_PICKER 在正确的导航上下文中打开**

### 修改 1: openAddScreen（L1101-1128）

**修改前**：
```typescript
const openAddScreen = useCallback(() => {
    if (activeCategory === 'file') {
        showModal(FILE_PICKER, ...);  // ❌ 在文本 modal 内打开
    } else if (activeCategory === 'text') {
        setShowAddModal(true);  // 打开文本 modal
    }
}, [...]);
```

**修改后**：
```typescript
const openAddScreen = useCallback(() => {
    if (activeCategory === 'file') {
        // ✅ 先关闭前面的 modal
        if (showAddModal) {
            setShowAddModal(false);  // 关闭文本/URL modal
        }
        
        // ✅ 延迟打开 FILE_PICKER（确保前面的 modal 完全关闭）
        setTimeout(() => {
            showModal(FILE_PICKER, ...);  // 在正确的上下文中打开
        }, 100);
    } else if (activeCategory === 'text') {
        setShowAddModal(true);
    }
}, [...]);
```

**效果**：
- 不再在 modal 内嵌套 modal
- FILE_PICKER 在正确的导航上下文中打开

### 修改 2: onUploadKBFiles（L1042-1068）

**修改前**：
```typescript
const onUploadKBFiles = async (files) => {
    // ... 上传文件 ...
    
    // 立刻更新文档列表
    performSearch(...);
};
```

**修改后**：
```typescript
const onUploadKBFiles = async (files) => {
    // ... 上传文件 ...
    
    // ✅ 关闭 FILE_PICKER modal
    try {
        await dismissModal({componentId: Screens.FILE_PICKER});
    } catch (e) {
        debugLog('Dismiss error:', e);
    }
    
    // ✅ 只有在 modal 关闭后，才更新文档列表
    try {
        performSearch(...);
    } catch (e) {
        debugLog('Refresh error:', e);
    }
};
```

**效果**：
- FILE_PICKER modal 明确关闭
- 更新文档列表时，所有 modal 都已关闭
- 导航上下文恢复正常

---

## 关键技术点

### 1. Modal 的两种类型

**类型 A：React State Modal（不在导航栈中）**
```typescript
const [showAddModal, setShowAddModal] = useState(false);

return (
    <>
        {showAddModal && (
            <Modal visible={showAddModal}>
                {/* 内容 */}
            </Modal>
        )}
    </>
);
```
- 通过 React state 控制显示/隐藏
- 不在 NavigationContainer 内
- 不能使用 useNavigation() hook

**类型 B：Navigation Modal（在导航栈中）**
```typescript
showModal(Screens.FILE_PICKER, ...);
dismissModal(...);
```
- 通过导航系统管理
- 在 NavigationContainer 内
- 可以使用 useNavigation() hook

### 2. useNavigation() Hook 的要求

```typescript
const navigation = useNavigation();  // 必须在 NavigationContainer 内调用
```

- 只能在 NavigationContainer 包装的组件中使用
- 不能在 State Modal 内的组件中使用
- 不能在 modal 嵌套 modal 的情况中使用

### 3. 延迟打开 FILE_PICKER 的原因

```typescript
setTimeout(() => {
    showModal(FILE_PICKER, ...);
}, 100);
```

- `setShowAddModal(false)` 只是改变状态
- React 需要时间来卸载组件
- 100ms 的延迟确保前面的 modal 完全从 DOM 中移除
- 这样 FILE_PICKER 才能在正确的上下文中打开

---

## 验证方法

修复后测试流程：

### 1. 基本功能测试
```
1. 打开知识库
2. 选择"选择文本" tab
3. 点 + 按钮 → 打开文本 modal
4. 点 modal 中的"选择文件"
5. ✅ FILE_PICKER 应该打开（不再崩溃）
6. 选择一个文件
7. ✅ 文件应该上传成功
8. ✅ 导航栏样式保持应用风格（不是系统样式）
```

### 2. 导航栏样式检查
```
✅ 应该看到：应用的自定义导航栏（和打开知识库时一样）
❌ 不应该看到：系统导航栏（蓝色 iOS style 或 Material Design）
```

### 3. 其他 tab 测试
```
1. 选择"选择 URL" tab → 点 + 按钮
2. 在 URL modal 中点"选择文件"
3. ✅ 应该也正常工作
```

---

## 相关代码位置

| 位置 | 修改内容 |
|------|--------|
| L29 | 新增 `dismissModal` 导入 |
| L1101-1128 | openAddScreen 逻辑修改 |
| L1042-1068 | onUploadKBFiles 逻辑修改 |

---

## 技术债务清单

### 已解决
✅ Modal 嵌套导致的导航上下文丢失  
✅ 确保 FILE_PICKER 在正确的导航栈中打开

### 未来改进方向
- [ ] 统一所有 modal 打开方式（避免混用 State Modal 和 Navigation Modal）
- [ ] 为 State Modal 创建专用的导航栈包装
- [ ] 添加更多的错误边界处理

---

## Commit

```
commit 29a9604
Author: xq_mattermost_server
修复知识库'选择文本'后点文件导致导航崩溃的问题
```

---

## FAQ

**Q: 为什么不直接使用 goToScreen 打开文件选择器？**  
A: 因为文件选择器需要是 modal（浮层），而不是全屏页面。goToScreen 是用于打开全屏页面的。

**Q: 100ms 的延迟是否太长？**  
A: 不会。对用户来说是无感知的，但足以让 React 完成卸载操作。

**Q: 能否完全避免 modal 嵌套？**  
A: 可以，通过重构 UI 架构。但这会很大的改动。当前的修复是最小化的改动。

**Q: 为什么之前没有这个问题？**  
A: 这是在最近的优化中才引入的。之前可能是用其他方式实现的。

---

## 测试覆盖

已测试场景：
- ✅ 选择文本 → 选择文件 → 上传
- ✅ 选择 URL → 选择文件 → 上传
- ✅ 导航栏样式保持一致
- ✅ 没有错误提示

---

**Status**: ✅ Fixed  
**Tested**: Yes  
**Backward Compatible**: Yes  
**Breaking Changes**: No
