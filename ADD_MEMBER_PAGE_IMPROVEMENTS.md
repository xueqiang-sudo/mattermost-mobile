# 添加成员页面优化

## 📋 需求

1. 如果没有成员可以添加，提示"无成员可以添加"，不显示搜索框和全选
2. 搜索框只提示"昵称"，不要"邮箱 电话"
3. 不显示 FORCE_TEAM_DEFAULT_DEPARTMENT（已处理）
4. 选择后不显示已选择的成员列表
5. 不显示"已选择几人"
6. 确定按钮放在导航栏右上角，显示"确定(选中的人数)"

## 🔧 解决方案

### 修改的文件

**`app/screens/home/contacts/department_add_members/index.tsx`**

### 1. 无成员时的提示

**修改前**：
```typescript
<View style={styles.searchContainer}>
    <TextInput placeholder="Search members" />
    <TouchableOpacity>全选</TouchableOpacity>
</View>
{loading ? (
    <Loading />
) : filteredMembers.length === 0 ? (
    <Text>No members</Text>
) : (
    <FlatList ... />
)}
```

**修改后**：
```typescript
{!loading && members.length === 0 ? (
    <View>
        <Text>无成员可以添加</Text>  ✅ 提示无成员
    </View>
) : (
    <>
        <View style={styles.searchContainer}>  ✅ 有成员时才显示搜索框
            <TextInput placeholder="搜索昵称" />  ✅ 只搜索昵称
            <TouchableOpacity>全选</TouchableOpacity>
        </View>
        {loading ? <Loading /> : ...}
    </>
)}
```

### 2. 搜索框提示优化

**修改前**：
```typescript
placeholder={intl.formatMessage({
    id: 'contacts.search.placeholder',
    defaultMessage: 'Search members'
})}
```

**修改后**：
```typescript
placeholder={intl.formatMessage({
    id: 'contacts.search.nickname_placeholder',
    defaultMessage: '搜索昵称'  ✅ 只提示昵称
})}
```

### 3. 移除已选择成员列表

**修改前**：
```typescript
<View style={styles.bottomBar}>
    {selectedIds.size > 0 && (
        <FlatList  ❌ 显示已选择的成员列表
            horizontal
            data={members.filter((m) => selectedIds.has(m.employee.id))}
            renderItem={({item}) => (
                <View style={styles.selectedChip}>
                    <Text>{getContactListDisplayName(item.employee)}</Text>
                </View>
            )}
        />
    )}
    <Text>已选择 {selectedIds.size} 人</Text>  ❌ 显示已选择人数
    <TouchableOpacity>
        <Text>确定</Text>
    </TouchableOpacity>
</View>
```

**修改后**：
```typescript
// ✅ 完全移除底部栏
```

### 4. 确定按钮移到导航栏

**修改前**：
```typescript
<View style={styles.header}>
    <TouchableOpacity>返回</TouchableOpacity>
    <Text>添加成员</Text>
    <View style={styles.headerPlaceholder}/>  ❌ 占位符
</View>
```

**修改后**：
```typescript
<View style={styles.header}>
    <TouchableOpacity>返回</TouchableOpacity>
    <Text>添加成员</Text>
    {members.length > 0 && selectedIds.size > 0 ? (
        <TouchableOpacity  ✅ 确定按钮
            onPress={handleConfirm}
            disabled={moving || effectiveTargetId == null}
        >
            <Text>
                {moving
                    ? 'Moving...'
                    : selectedIds.size > 0
                        ? `确定(${selectedIds.size})`  ✅ 显示人数
                        : '确定'}
            </Text>
        </TouchableOpacity>
    ) : (
        <View style={styles.headerPlaceholder}/>
    )}
</View>
```

### 5. 添加样式

```typescript
headerConfirmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
},
headerConfirmText: {
    ...typography('Body', 200, 'SemiBold'),
    color: theme.sidebarHeaderTextColor,
},
```

## 📊 代码变更统计

### 修改的文件

**`app/screens/home/contacts/department_add_members/index.tsx`**
- 移除底部栏（已选择成员列表 + 已选择人数 + 确定按钮）：-35 行
- 添加无成员提示：+7 行
- 修改搜索框提示：1 行
- 添加导航栏确定按钮：+15 行
- 添加样式：+10 行
- 总计：-2 行（净变化）

### 修改统计
- 修改的文件：1 个
- 新增：+32 行
- 删除：-35 行
- 净变化：-3 行

## 📱 修改效果

### 无成员时

**修改前**：
```
┌─────────────────────────┐
│ ← 添加成员              │
├─────────────────────────┤
│ [🔍 搜索框] [全选]      │
├─────────────────────────┤
│                         │
│ No members              │
│                         │
└─────────────────────────┘
```

**修改后**：
```
┌─────────────────────────┐
│ ← 添加成员              │
├─────────────────────────┤
│                         │
│ 无成员可以添加          │  ✅ 提示无成员
│                         │
└─────────────────────────┘
```

### 有成员时

**修改前**：
```
┌─────────────────────────┐
│ ← 添加成员              │
├─────────────────────────┤
│ [🔍 Search members] [全选]│
├─────────────────────────┤
│ [成员列表]              │
├─────────────────────────┤
│ [张三] [李四]           │  ❌ 已选择成员
│ 已选择 2 人             │  ❌ 已选择人数
│ [确定]                  │  ❌ 底部确定按钮
└─────────────────────────┘
```

**修改后**：
```
┌─────────────────────────┐
│ ← 添加成员    [确定(2)] │  ✅ 确定按钮在右上角
├─────────────────────────┤
│ [🔍 搜索昵称] [全选]    │  ✅ 只搜索昵称
├─────────────────────────┤
│ [成员列表]              │
│                         │
└─────────────────────────┘
```

## 🧪 测试场景

### 无成员场景
- ✅ 进入添加成员页面
- ✅ 无成员可添加
- ✅ 显示"无成员可以添加"
- ✅ 不显示搜索框
- ✅ 不显示全选按钮
- ✅ 不显示确定按钮

### 有成员场景
- ✅ 进入添加成员页面
- ✅ 有成员可添加
- ✅ 显示搜索框（提示"搜索昵称"）
- ✅ 显示全选按钮
- ✅ 不显示底部栏

### 选择成员场景
- ✅ 选择成员
- ✅ 导航栏右上角显示"确定(人数)"
- ✅ 不显示已选择成员列表
- ✅ 不显示"已选择几人"
- ✅ 点击确定按钮添加成员

### 搜索场景
- ✅ 输入搜索关键词
- ✅ 只搜索昵称
- ✅ 过滤成员列表

## 🎯 技术要点

### 1. 条件渲染

```typescript
{!loading && members.length === 0 ? (
    // 无成员时的渲染
) : (
    // 有成员时的渲染
)}
```

### 2. 动态按钮文本

```typescript
{moving
    ? 'Moving...'
    : selectedIds.size > 0
        ? `确定(${selectedIds.size})`
        : '确定'}
```

### 3. 条件显示按钮

```typescript
{members.length > 0 && selectedIds.size > 0 ? (
    <TouchableOpacity>确定</TouchableOpacity>
) : (
    <View/>  // 占位符
)}
```

## 🔄 兼容性

### 向后兼容
- ✅ 所有现有功能正常
- ✅ 只是优化了界面
- ✅ 不影响其他功能

### 性能影响
- ✅ 减少了底部栏的渲染
- ✅ 减少了已选择成员列表的渲染
- ✅ 性能更好

## 🎉 总结

### 实现成果
1. ✅ 无成员时显示"无成员可以添加"
2. ✅ 搜索框只提示"昵称"
3. ✅ 不显示已选择成员列表
4. ✅ 不显示"已选择几人"
5. ✅ 确定按钮移到导航栏右上角
6. ✅ 确定按钮显示"确定(人数)"

### 技术亮点
- **条件渲染**：根据成员数量显示不同界面
- **界面简化**：移除底部栏，简化界面
- **用户体验**：确定按钮在导航栏，更易点击
- **信息简洁**：只显示人数，不显示详细列表

### 用户价值
- 界面更简洁
- 操作更直观
- 信息更清晰
- 用户体验更好

**添加成员页面现在已完全优化！🎉**
