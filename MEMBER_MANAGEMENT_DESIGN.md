# 成员管理功能设计方案（方案 1）

## 📋 需求

**目标**：简化为成员管理，和 webapp 对齐

**核心功能**：
1. 在部门详情页添加成员管理功能
2. 支持选择多个成员
3. 支持批量移动到目标部门
4. 支持批量移除成员

## 🎯 设计方案

### 1. 成员管理入口

**位置**：部门详情页右上角"更多"按钮

**菜单项**：
- 成员管理（新增）
- 添加子部门
- 修改部门名称
- 删除部门

### 2. 成员管理界面

```
┌─────────────────────────┐
│ ← 成员管理              │  ← 系统标题栏
├─────────────────────────┤
│ [🔍 搜索成员]           │  ← 搜索框
├─────────────────────────┤
│ [☑ 全选]  [已选: 5]     │  ← 选择控制区
│ [移动到] [移除]         │  ← 批量操作按钮
├─────────────────────────┤
│ ☑ 张三                  │  ← 成员列表（Checkbox）
│   工程师                │
│                         │
│ ☑ 李四                  │
│   产品经理              │
│                         │
│ ☐ 王五                  │
│   设计师                │
└─────────────────────────┘
```

### 3. 移动到操作

**流程**：
1. 点击"移动到"按钮
2. 显示部门选择器（Modal）
3. 选择目标部门
4. 调用 `batchMoveContactEmployeeToDepartment` API
5. 刷新列表
6. 显示成功提示

**界面**：
```
┌─────────────────────────┐
│ 选择目标部门            │  ← Modal
├─────────────────────────┤
│ [🔍 搜索部门]           │
├─────────────────────────┤
│ 技术部                  │
│ 产品部                  │
│ 市场部                  │
└─────────────────────────┘
```

### 4. 移除操作

**流程**：
1. 点击"移除"按钮
2. 显示确认对话框
3. 确认后调用移除 API
4. 刷新列表
5. 显示成功提示

**确认对话框**：
```
┌─────────────────────────┐
│ 确认移除                │
│                         │
│ 确定要移除选中的 5 个   │
│ 成员吗？                │
│                         │
│ [取消]      [确认]      │
└─────────────────────────┘
```

## 📊 数据流

```
用户点击"成员管理"
    ↓
显示成员列表（带 Checkbox）
    ↓
用户选择多个成员
    ↓
点击"移动到"按钮
    ↓
显示部门选择器（Modal）
    ↓
选择目标部门
    ↓
调用 batchMoveContactEmployeeToDepartment API
    ↓
移动成功
    ↓
刷新成员列表
    ↓
显示成功提示
```

## 🔧 实现细节

### 1. 状态管理

```typescript
// 新增状态
const [memberManagementMode, setMemberManagementMode] = useState(false);
const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
const [searchTerm, setSearchTerm] = useState('');
const [showMoveToModal, setShowMoveToModal] = useState(false);
```

### 2. Checkbox 选择

```typescript
// 切换选择
const toggleMemberSelection = (memberId: string) => {
    setSelectedMemberIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(memberId)) {
            newSet.delete(memberId);
        } else {
            newSet.add(memberId);
        }
        return newSet;
    });
};

// 全选/取消全选
const toggleSelectAll = () => {
    if (selectedMemberIds.size === filteredEmployees.length) {
        setSelectedMemberIds(new Set());
    } else {
        setSelectedMemberIds(new Set(filteredEmployees.map(e => e.id)));
    }
};
```

### 3. 移动到操作

```typescript
const handleMoveTo = async (targetDepartmentId: number) => {
    const memberIds = Array.from(selectedMemberIds);
    await batchMoveContactEmployeeToDepartment(
        serverUrl,
        companyId,
        memberIds,
        targetDepartmentId,
    );
    setSelectedMemberIds(new Set());
    setShowMoveToModal(false);
    refetch();
    showSnackBar({
        barType: SNACK_BAR_TYPE.INFO,
        type: MESSAGE_TYPE.SUCCESS,
        text: intl.formatMessage({id: 'contacts.move_success', defaultMessage: '移动成功'}),
    });
};
```

### 4. 移除操作

```typescript
const handleRemove = async () => {
    const memberIds = Array.from(selectedMemberIds);
    await batchRemoveMembersFromDepartment(
        serverUrl,
        companyId,
        departmentId,
        memberIds,
    );
    setSelectedMemberIds(new Set());
    refetch();
    showSnackBar({
        barType: SNACK_BAR_TYPE.INFO,
        type: MESSAGE_TYPE.SUCCESS,
        text: intl.formatMessage({id: 'contacts.remove_success', defaultMessage: '移除成功'}),
    });
};
```

## 📱 界面设计

### 1. 成员列表项

```typescript
<TouchableOpacity
    style={styles.listItem}
    onPress={() => memberManagementMode ? toggleMemberSelection(emp.id) : handleEmployeePress(emp)}
>
    {memberManagementMode && (
        <View style={styles.checkbox}>
            <CompassIcon
                name={selectedMemberIds.has(emp.id) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={selectedMemberIds.has(emp.id) ? theme.buttonBg : theme.centerChannelColor}
            />
        </View>
    )}
    <ContactAvatar employee={emp} size={40}/>
    <View style={styles.listItemMain}>
        <Text style={styles.listItemName}>{getContactListDisplayName(emp)}</Text>
    </View>
</TouchableOpacity>
```

### 2. 批量操作栏

```typescript
{memberManagementMode && (
    <View style={styles.batchActionBar}>
        <TouchableOpacity onPress={toggleSelectAll}>
            <Text>
                {selectedMemberIds.size === filteredEmployees.length ? '取消全选' : '全选'}
            </Text>
        </TouchableOpacity>
        <Text>已选: {selectedMemberIds.size}</Text>
        <View style={styles.actionButtons}>
            <Button
                text="移动到"
                onPress={() => setShowMoveToModal(true)}
                disabled={selectedMemberIds.size === 0}
            />
            <Button
                text="移除"
                onPress={handleRemove}
                disabled={selectedMemberIds.size === 0}
            />
        </View>
    </View>
)}
```

## 📊 代码变更

### 修改的文件

1. **`app/screens/home/contacts/department_detail/index.tsx`**
   - 添加成员管理状态
   - 添加 Checkbox 选择
   - 添加批量操作栏
   - 添加移动到/移除功能
   - 预计：+200 行

2. **`app/screens/home/contacts/batch_move_members/index.tsx`**
   - 可以删除或保留作为目标部门选择器
   - 如果保留，只保留目标部门选择部分
   - 预计：-500 行（简化）

### 新增的文件

无（复用现有组件）

## 🎯 实现步骤

### 步骤 1：添加成员管理入口
- 在"更多"菜单中添加"成员管理"选项
- 点击进入成员管理模式

### 步骤 2：显示 Checkbox
- 成员列表项添加 Checkbox
- 点击切换选择状态
- 点击成员名仍可查看个人信息

### 步骤 3：批量操作栏
- 添加全选/取消全选按钮
- 添加已选数量显示
- 添加"移动到"和"移除"按钮

### 步骤 4：移动到功能
- 点击"移动到"显示部门选择器
- 选择目标部门
- 调用 API 移动成员
- 刷新列表

### 步骤 5：移除功能
- 点击"移除"显示确认对话框
- 确认后调用 API 移除成员
- 刷新列表

## ✅ 优势

### 和 webapp 对齐
- ✅ 设计模式一致
- ✅ 操作流程一致
- ✅ 用户体验一致

### 界面更简洁
- ✅ 减少页面层级
- ✅ 操作更直观
- ✅ 代码更简单

### 功能更完整
- ✅ 支持批量移动
- ✅ 支持批量移除
- ✅ 支持搜索和全选

## 🧪 测试场景

### 基础功能
- ✅ 进入成员管理模式
- ✅ 显示 Checkbox
- ✅ 选择成员
- ✅ 全选/取消全选

### 移动到
- ✅ 点击"移动到"
- ✅ 显示部门选择器
- ✅ 选择目标部门
- ✅ 移动成功
- ✅ 刷新列表

### 移除
- ✅ 点击"移除"
- ✅ 显示确认对话框
- ✅ 确认移除
- ✅ 移除成功
- ✅ 刷新列表

### 边界情况
- ✅ 未选择成员时按钮禁用
- ✅ 选择所有成员时"全选"变为"取消全选"
- ✅ 移动/移除成功后清空选择
- ✅ 网络错误时显示错误提示

## 🎉 总结

### 实现成果
1. ✅ 和 webapp 对齐
2. ✅ 界面更简洁
3. ✅ 功能更完整
4. ✅ 用户体验更好

### 技术亮点
- **复用现有组件**：减少开发量
- **简化流程**：减少页面层级
- **统一设计**：和 webapp 保持一致

### 用户价值
- 操作更直观
- 功能更完整
- 体验更好
- 符合用户习惯

**成员管理功能设计方案已完成，等待确认后开始实现！**
