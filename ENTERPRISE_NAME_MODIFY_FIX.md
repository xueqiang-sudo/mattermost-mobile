# 修改企业名称对话框不显示修复

## 📋 问题

**现象**：点击"修改企业名称"后，没有任何反应，对话框没有弹出来。

**原因**：`dismissBottomSheet()` 和 `showModal()` 之间存在时序问题。底部菜单关闭动画尚未完成时就尝试显示对话框，导致对话框无法正确显示。

## 🔧 解决方案

### 修改的文件

**`app/screens/home/contacts/contacts_manage/index.tsx`** (666-675行)

### 修复代码

**修改前**：
```typescript
<SlideUpPanelItem
    leftIcon='pencil-outline'
    text={currentDepartmentId == null ? intl.formatMessage({id: 'contacts.modify_enterprise_name', defaultMessage: 'Modify enterprise name'}) : intl.formatMessage({id: 'contacts.modify_department_name', defaultMessage: 'Modify department name'})}
    onPress={async () => {
        await dismissBottomSheet();
        // ❌ 立即调用，底部菜单可能还没完全关闭
        if (currentDepartmentId == null) {
            handleModifyEnterpriseName();
        } else {
            handleModifyDepartmentName();
        }
    }}
    testID='contacts.manage.more.modify_name'
/>
```

**修改后**：
```typescript
<SlideUpPanelItem
    leftIcon='pencil-outline'
    text={currentDepartmentId == null ? intl.formatMessage({id: 'contacts.modify_enterprise_name', defaultMessage: 'Modify enterprise name'}) : intl.formatMessage({id: 'contacts.modify_department_name', defaultMessage: 'Modify department name'})}
    onPress={async () => {
        await dismissBottomSheet();
        // ✅ 等待底部菜单完全关闭后再显示对话框
        await new Promise(resolve => setTimeout(resolve, 300));
        if (currentDepartmentId == null) {
            handleModifyEnterpriseName();
        } else {
            handleModifyDepartmentName();
        }
    }}
    testID='contacts.manage.more.modify_name'
/>
```

## 📊 代码变更统计

### 修改的文件

**`app/screens/home/contacts/contacts_manage/index.tsx`**

- 添加延迟等待：+2 行
- 总计：+2 行

## 📱 修复效果

### 修复前
```
[通讯录管理页面]
       ↓ 点击"更多管理"
┌─────────────────┐
│ [修改企业名称]   │  ← 底部菜单显示
│ [批量移动成员]   │
│ [管理员列表]     │
└─────────────────┘
       ↓ 点击"修改企业名称"
[底部菜单关闭]
       ↓
[无任何反应] ❌  ← 对话框没有显示
```

### 修复后
```
[通讯录管理页面]
       ↓ 点击"更多管理"
┌─────────────────┐
│ [修改企业名称]   │  ← 底部菜单显示
│ [批量移动成员]   │
│ [管理员列表]     │
└─────────────────┘
       ↓ 点击"修改企业名称"
[底部菜单关闭]
       ↓ 等待 300ms
┌─────────────────┐
│  修改企业名称    │  ← 对话框正常显示
│                 │
│  [当前名称]     │
│                 │
│  [取消] [确认]  │
└─────────────────┘
```

## 🧪 测试场景

### 修改企业名称
- ✅ 点击"更多管理"按钮
- ✅ 底部菜单显示
- ✅ 点击"修改企业名称"
- ✅ 底部菜单关闭
- ✅ 等待 300ms
- ✅ 对话框正常显示
- ✅ 显示当前企业名称
- ✅ 可以修改名称
- ✅ 点击确认 → 保存成功

### 修改部门名称
- ✅ 进入子部门
- ✅ 点击"更多管理"按钮
- ✅ 底部菜单显示
- ✅ 点击"修改部门名称"
- ✅ 底部菜单关闭
- ✅ 等待 300ms
- ✅ 对话框正常显示
- ✅ 显示当前部门名称
- ✅ 可以修改名称
- ✅ 点击确认 → 保存成功

## 🎯 技术要点

### 1. 时序问题

**问题**：
- `dismissBottomSheet()` 是异步操作
- 底部菜单关闭需要时间（动画）
- 如果在动画完成前就显示对话框，会导致冲突

**解决方案**：
```typescript
await dismissBottomSheet();
await new Promise(resolve => setTimeout(resolve, 300));  // 等待动画完成
handleModifyEnterpriseName();  // 然后显示对话框
```

### 2. 延迟时间选择

**300ms 的原因**：
- 足够长：确保底部菜单动画完成
- 足够短：用户不会感到明显延迟
- 和聊天窗口的文件选择器保持一致

### 3. 异步操作顺序

**正确的顺序**：
```typescript
// 1. 关闭底部菜单
await dismissBottomSheet();

// 2. 等待动画完成
await new Promise(resolve => setTimeout(resolve, 300));

// 3. 显示对话框
await handleModifyEnterpriseName();
```

## 🔄 兼容性

### 向后兼容
- ✅ 所有现有功能正常
- ✅ 只是添加了延迟等待
- ✅ 不影响其他功能

### 性能影响
- ✅ 300ms 延迟对用户来说几乎无感知
- ✅ 确保对话框正确显示
- ✅ 用户体验更好

## 🎉 总结

### 实现成果
1. ✅ 修复了修改企业名称对话框不显示的问题
2. ✅ 修复了修改部门名称对话框不显示的问题
3. ✅ 添加了时序控制
4. ✅ 提升了用户体验

### 技术亮点
- **时序控制**：确保操作按正确顺序执行
- **延迟等待**：给动画足够的时间完成
- **用户友好**：300ms 延迟几乎无感知

### 用户价值
- 对话框正常显示
- 操作流程正常
- 用户体验更好
- 功能正常工作

**修改企业名称和修改部门名称现在都能正常显示对话框了！🎉**
