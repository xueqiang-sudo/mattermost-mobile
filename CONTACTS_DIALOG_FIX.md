# 企业通讯录对话框修复

## 📋 问题

1. **添加子部门** - 点击后不显示了（应该显示小对话框）
2. **修改企业名称** - 点击后不显示了（应该显示小对话框）
3. **修改部门名称** - 点击后不显示了（应该显示小对话框）

**原因**：使用了 `goToScreen`（导航到新页面），但 `useCustomInputModal` hook 提供的是 `showModal` 方法（显示模态对话框）。

## 🔧 解决方案

### 核心修复

将所有的 `input.goToScreen({...})` 改为 `input.showModal({...})`。

### 修改的文件

#### 1. contacts_manage/index.tsx

**添加子部门**：
```typescript
// 修改前
const name = await subDeptInput.goToScreen({
    title: intl.formatMessage({id: 'contacts.add_sub_department', defaultMessage: 'Add Sub-department'}),
    placeholder: intl.formatMessage({id: 'contacts.sub_department_name_placeholder', defaultMessage: 'Enter department name'}),
    confirmContent: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
    cancelContent: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
});

// 修改后
const name = await subDeptInput.showModal({
    title: intl.formatMessage({id: 'contacts.add_sub_department', defaultMessage: 'Add Sub-department'}),
    placeholder: intl.formatMessage({id: 'contacts.sub_department_name_placeholder', defaultMessage: 'Enter department name'}),
    confirmContent: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
    cancelContent: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
});
```

**修改企业名称**：
```typescript
// 修改前
const name = await modifyEnterpriseNameInput.goToScreen({
    title: intl.formatMessage({id: 'contacts.modify_enterprise_name', defaultMessage: 'Modify enterprise name'}),
    placeholder: intl.formatMessage({id: 'contacts.enterprise_name_placeholder', defaultMessage: 'Enterprise name'}),
    defaultValue: currentName,
    confirmContent: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
    cancelContent: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
});

// 修改后
const name = await modifyEnterpriseNameInput.showModal({
    title: intl.formatMessage({id: 'contacts.modify_enterprise_name', defaultMessage: 'Modify enterprise name'}),
    placeholder: intl.formatMessage({id: 'contacts.enterprise_name_placeholder', defaultMessage: 'Enterprise name'}),
    defaultValue: currentName,
    confirmContent: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}),
    cancelContent: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
});
```

#### 2. department_detail/index.tsx

**添加子部门**：
```typescript
// 修改前
const name = await subDeptInput.goToScreen({...});

// 修改后
const name = await subDeptInput.showModal({...});
```

**修改部门名称**：
```typescript
// 修改前
const name = await modifyDeptNameInput.goToScreen({...});

// 修改后
const name = await modifyDeptNameInput.showModal({...});
```

## 📱 效果对比

### 修改前（goToScreen）
```
[通讯录管理页面]
       ↓ 点击"添加子部门"
[导航到新页面]  ❌ 不显示
```

**问题**：
- ❌ `useCustomInputModal` 没有 `goToScreen` 方法
- ❌ 调用失败，对话框不显示
- ❌ 用户无法输入

### 修改后（showModal）
```
[通讯录管理页面]
       ↓ 点击"添加子部门"
┌─────────────────┐
│  添加子部门      │  ← 小对话框（Modal）
│                 │
│  [输入框]       │
│                 │
│  [取消] [确认]  │
└─────────────────┘
```

**优势**：
- ✅ 正确调用 `showModal` 方法
- ✅ 显示小对话框（Modal）
- ✅ 对话框在屏幕中央
- ✅ 背景变暗
- ✅ 用户可以输入

## 🎯 技术要点

### useCustomInputModal Hook

```typescript
interface UseCustomInputModalReturn {
    visible: boolean;
    options: CustomInputModalOptions;
    showModal: (modalOptions: CustomInputModalOptions) => Promise<string | null>;  // ✅ 正确方法
    handleConfirm: (value: string) => void;
    handleCancel: () => void;
}
```

**注意**：
- 只提供 `showModal` 方法
- 不提供 `goToScreen` 方法
- 调用 `goToScreen` 会导致运行时错误

### 使用方式

```typescript
const inputModal = useCustomInputModal();

// 显示对话框
const result = await inputModal.showModal({
    title: '对话框标题',
    placeholder: '输入提示',
    defaultValue: '默认值（可选）',
    confirmContent: '确认',
    cancelContent: '取消',
});

// 处理结果
if (result) {
    // 用户点击确认，result 是输入值
    console.log('用户输入:', result);
} else {
    // 用户点击取消
    console.log('用户取消');
}
```

## 🧪 测试场景

### 添加子部门
- ✅ 点击"添加子部门"
- ✅ 显示小对话框（Modal）
- ✅ 对话框在屏幕中央
- ✅ 可以输入部门名称
- ✅ 点击确认 → 创建部门
- ✅ 点击取消 → 关闭对话框

### 修改企业名称
- ✅ 点击"修改企业名称"
- ✅ 显示小对话框（Modal）
- ✅ 显示当前企业名称
- ✅ 可以修改企业名称
- ✅ 点击确认 → 保存修改
- ✅ 点击取消 → 关闭对话框

### 修改部门名称
- ✅ 点击"修改部门名称"
- ✅ 显示小对话框（Modal）
- ✅ 显示当前部门名称
- ✅ 可以修改部门名称
- ✅ 点击确认 → 保存修改
- ✅ 点击取消 → 关闭对话框

## 📊 代码变更统计

### 修改的文件
1. `app/screens/home/contacts/contacts_manage/index.tsx`
   - 修改 `handleAddSubDepartment`：`goToScreen` → `showModal`
   - 修改 `handleModifyEnterpriseName`：`goToScreen` → `showModal`

2. `app/screens/home/contacts/department_detail/index.tsx`
   - 修改 `handleAddSubDepartment`：`goToScreen` → `showModal`
   - 修改 `handleModifyDepartmentName`：`goToScreen` → `showModal`

### 修改行数
- 每个函数修改 1 行（方法名改变）
- 总计：4 行修改

## 🔄 兼容性

### 向后兼容
- ✅ 所有现有功能正常
- ✅ 只是修复了错误的方法调用
- ✅ 不影响其他功能

### 性能影响
- ✅ Modal 比导航更快
- ✅ 用户体验更好

## 🎉 总结

### 实现成果
1. ✅ 添加子部门正常显示（小对话框）
2. ✅ 修改企业名称正常显示（小对话框）
3. ✅ 修改部门名称正常显示（小对话框）
4. ✅ 对话框在屏幕中央
5. ✅ 用户体验更好

### 技术亮点
- 正确使用 `useCustomInputModal` hook
- 调用正确的 `showModal` 方法
- 修复了运行时错误

### 用户价值
- 功能正常工作
- 对话框显示正常
- 符合用户习惯
- 更好的用户体验

现在企业通讯录的"添加子部门"、"修改企业名称"、"修改部门名称"都正常显示小对话框（Modal）了！🎉

## 📝 待处理

以下功能还需要处理：

1. **批量移动成员** - 去掉自定义标题头（涉及复杂功能逻辑）
2. **管理员列表** - 去掉自定义标题头 + 修复加载失败问题

这些需要单独处理，因为自定义标题头包含了复杂的功能（返回、全选、关闭等按钮）。
