# Modal 导航上下文修复总结

## 问题概述

在 modal 中使用 `useNavigation()` hook 会导致崩溃，因为 modal 没有 NavigationContainer 上下文。

错误信息：
```
Couldn't find a navigation object. Is your component inside NavigationContainer?
```

## 修复的三个地方

### 1. 知识库"选择文本"→"选择文件" 流程 (Commit: da8b840)

**问题**:
- 用户在知识库选择"选择文本" tab
- 打开文本编辑 modal（React state modal）
- 在文本 modal 中点"选择文件"
- FILE_PICKER modal 嵌套在文本 modal 中
- onUploadKBFiles 调用 goToScreen，导致崩溃

**修复**:
- 先关闭前面的 modal（setShowAddModal(false)）
- 延迟 100ms 再打开 FILE_PICKER
- 文件上传后关闭 FILE_PICKER 再更新列表

**文件**:
- knowledge_base_screen.tsx

### 2. 知识库右上角+号打开文件选择器 (Commit: d124338)

**问题**:
- 知识库页面右上角+号打开 FILE_PICKER modal
- FilePickerContent 使用 useNavigation()
- Modal 中没有 NavigationContainer 上下文

**修复**:
- 移除 useNavigation() hook
- 用 dismissModal({componentId}) 替代 navigation.goBack()
- dismissModal 可以在任何上下文中使用

**文件**:
- file_picker.tsx
- 移除 `useNavigation` 导入
- 删除 `navigation` 变量
- 修改返回按钮逻辑

### 3. 补充修复：缺失导入 (Commit: 131f07d)

**问题**:
- 修复2中移除 useNavigation 时不小心删除了过多导入
- FilePickerContent 仍然使用 `theme` 变量
- 缺少 `useTheme` 导入导致编译错误

**修复**:
- 添加回 `useTheme` 导入

**文件**:
- file_picker.tsx

## 技术总结

### Modal 的两种类型

**1. React State Modal（不在导航栈中）**
```typescript
const [showModal, setShowModal] = useState(false);
{showModal && <Modal>...</Modal>}
```
- 不能使用 `useNavigation()`
- 用 `state` 和 callback 管理

**2. Navigation Modal（在导航栈中）**
```typescript
showModal(Screens.FILE_PICKER, ...);
dismissModal({componentId: ...});
```
- 可以使用 `useNavigation()`
- 用 `dismissModal` 关闭

### 关键原则

1. **避免 modal 嵌套** - 先关闭前面的 modal，延迟后打开新 modal
2. **不在 modal 中使用 useNavigation** - 改用 dismissModal
3. **确保导入齐全** - 修改时注意不要删除必需的 hook 导入

## 验证步骤

修复后需要**完整重新编译**：
```bash
npm install
npm run ios   # 或 npm run android
```

老的编译版本仍会显示旧错误。

## 相关提交

| Commit | 修复内容 | 文件 |
|--------|--------|------|
| da8b840 | 知识库文本→文件流程 modal 嵌套问题 | knowledge_base_screen.tsx |
| d124338 | 知识库+号 FILE_PICKER useNavigation 崩溃 | file_picker.tsx |
| 131f07d | 补充缺失的 useTheme 导入 | file_picker.tsx |

## 测试场景

- ✅ 知识库"选择文本"→ 点"选择文件"
- ✅ 知识库右上角+号→ 点"File"标签
- ✅ 云盘页面上传按钮
- ✅ 文件选择器中的返回按钮
