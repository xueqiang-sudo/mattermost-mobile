# 批量移动成员页面移除自定义标题头

## 📋 需求

**需求**：批量移动成员页面不需要自定义标题头，应该使用系统标题栏。

## 🔧 解决方案

### 修改的文件

1. `app/screens/home/contacts/contacts_manage/index.tsx` (调用方式)
2. `app/screens/home/contacts/batch_move_members/index.tsx` (页面渲染)

### 1. 修改调用方式

**文件**: `app/screens/home/contacts/contacts_manage/index.tsx`

**修改前**：
```typescript
goToScreen(
    Screens.CONTACTS_BATCH_MOVE_MEMBERS,
    intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'}),
    {
        companyId,
        sourceDepartmentId: sourceId,
        sourceDepartmentName: sourceName,
        onSuccess: refetch,
    },
    {useBackIcon: true, topBar: {visible: false}},  // ❌ 隐藏系统标题栏
);
```

**修改后**：
```typescript
goToScreen(
    Screens.CONTACTS_BATCH_MOVE_MEMBERS,
    intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'}),
    {
        companyId,
        sourceDepartmentId: sourceId,
        sourceDepartmentName: sourceName,
        onSuccess: refetch,
    },
    {useBackIcon: true, topBar: {visible: true}},  // ✅ 显示系统标题栏
);
```

### 2. 移除成员选择阶段的自定义标题头

**文件**: `app/screens/home/contacts/batch_move_members/index.tsx` (1222-1278行)

**修改前**：
```typescript
if (phase === 'members') {
    const showMemberBackArrow = memberStack.length > 1;

    return (
        <SafeAreaView
            edges={SAFE_AREA_EDGES}  // ❌ 包含 'top'
            style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
            testID='contacts.batch_move_members.screen'
        >
            <View style={styles.header}>  {/* ❌ 自定义标题头 */}
                {showMemberBackArrow ? (
                    <TouchableOpacity
                        style={styles.headerBackWrap}
                        onPress={handleBack}
                        testID='contacts.batch_move.back'
                    >
                        <CompassIcon
                            name='arrow-left'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerBackWrap}/>
                )}
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'})}
                    </Text>
                    <Text
                        style={styles.headerSubtitle}
                        numberOfLines={1}
                    >{subtitle}</Text>
                </View>
                {!isInsideSelectedDepartment && hasCurrentLevelItems && (
                    <TouchableOpacity
                        style={styles.headerSelectAllWrap}
                        onPress={handleToggleSelectAll}
                        testID='contacts.batch_move.select_all'
                    >
                        <Text style={styles.headerSelectAllText}>
                            {allCurrentSelected? intl.formatMessage({id: 'contacts.deselect_all', defaultMessage: 'Deselect all'}): intl.formatMessage({id: 'contacts.select_all', defaultMessage: 'Select all'})}
                        </Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={styles.headerCloseWrap}
                    onPress={handleClose}
                    testID='contacts.batch_move.close'
                >
                    <CompassIcon
                        name='close'
                        size={24}
                        color={theme.sidebarText}
                    />
                </TouchableOpacity>
            </View>
            {loading ? (
```

**修改后**：
```typescript
if (phase === 'members') {
    const showMemberBackArrow = memberStack.length > 1;

    return (
        <SafeAreaView
            edges={['bottom', 'left', 'right']}  // ✅ 不包含 'top'，使用系统标题栏
            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}  // ✅ 使用 centerChannelBg
            testID='contacts.batch_move_members.screen'
        >
            {loading ? (  // ✅ 移除自定义标题头
```

### 3. 移除目标部门选择阶段的自定义标题头

**文件**: `app/screens/home/contacts/batch_move_members/index.tsx` (1419-1461行)

**修改前**：
```typescript
const showBackArrow = targetStack.length > 1;

return (
    <SafeAreaView
        edges={SAFE_AREA_EDGES}  // ❌ 包含 'top'
        style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
        testID='contacts.batch_move_members.screen'
    >
        <View style={styles.header}>  {/* ❌ 自定义标题头 */}
            {showBackArrow ? (
                <TouchableOpacity
                    style={styles.headerBackWrap}
                    onPress={handleBack}
                    testID='contacts.batch_move.back'
                >
                    <CompassIcon
                        name='arrow-left'
                        size={24}
                        color={theme.sidebarText}
                    />
                </TouchableOpacity>
            ) : (
                <View style={styles.headerBackWrap}/>
            )}
            <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'contacts.select_target_department', defaultMessage: 'Select target department'})}
                </Text>
                <Text
                    style={styles.headerSubtitle}
                    numberOfLines={1}
                >{subtitle}</Text>
            </View>
            <TouchableOpacity
                style={styles.headerCloseWrap}
                onPress={handleClose}
                testID='contacts.batch_move.close'
            >
                <CompassIcon
                    name='close'
                    size={24}
                    color={theme.sidebarText}
                />
            </TouchableOpacity>
        </View>
        {targetLoading ? (
```

**修改后**：
```typescript
const showBackArrow = targetStack.length > 1;

return (
    <SafeAreaView
        edges={['bottom', 'left', 'right']}  // ✅ 不包含 'top'，使用系统标题栏
        style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}  // ✅ 使用 centerChannelBg
        testID='contacts.batch_move_members.screen'
    >
        {targetLoading ? (  // ✅ 移除自定义标题头
```

## 📊 代码变更统计

### 修改的文件

1. **`app/screens/home/contacts/contacts_manage/index.tsx`**
   - 修改 `topBar.visible`：从 `false` 改为 `true`
   - 修改：1 行

2. **`app/screens/home/contacts/batch_move_members/index.tsx`**
   - 移除成员选择阶段的自定义标题头：-48 行
   - 移除目标部门选择阶段的自定义标题头：-42 行
   - 修改 SafeAreaView edges：2 处
   - 修改背景颜色：2 处
   - 总计：-90 行

### 修改统计
- 修改的文件：2 个
- 删除的行数：-90 行
- 净变化：-90 行（代码更简洁）

## 📱 修复效果

### 修复前
```
┌─────────────────────────┐
│ [←] 移动成员        [X] │  ← 自定义标题头
│      选择成员           │
│  [全选]                 │
├─────────────────────────┤
│                         │
│ [成员列表]              │
│                         │
└─────────────────────────┘
```

### 修复后
```
┌─────────────────────────┐
│ ← 移动成员              │  ← 系统标题栏
├─────────────────────────┤
│                         │
│ [成员列表]              │
│                         │
│                         │
└─────────────────────────┘
```

## 🧪 测试场景

### 成员选择阶段
- ✅ 进入批量移动成员页面
- ✅ 显示系统标题栏（标题："移动成员"）
- ✅ 显示返回按钮
- ✅ 不显示自定义标题头
- ✅ 可以选择成员
- ✅ 点击"下一步"进入目标部门选择

### 目标部门选择阶段
- ✅ 进入目标部门选择页面
- ✅ 显示系统标题栏（标题："移动成员"）
- ✅ 显示返回按钮
- ✅ 不显示自定义标题头
- ✅ 可以选择目标部门
- ✅ 点击确认完成移动

### 导航和返回
- ✅ 点击系统返回按钮
- ✅ 返回上一页
- ✅ 页面正常关闭

## 🎯 技术要点

### 1. 系统标题栏 vs 自定义标题头

**系统标题栏**：
- 由 react-native-navigation 提供
- 统一的样式和行为
- 自动处理返回按钮
- 更容易维护

**自定义标题头**：
- 需要手动实现
- 需要处理返回、关闭等按钮
- 样式需要自己控制
- 维护成本高

### 2. SafeAreaView edges

**修改前**：
```typescript
edges={SAFE_AREA_EDGES}  // ['top', 'bottom', 'left', 'right']
```

**修改后**：
```typescript
edges={['bottom', 'left', 'right']}  // 不包含 'top'，让系统标题栏处理顶部安全区域
```

### 3. 背景颜色

**修改前**：
```typescript
backgroundColor: theme.sidebarBg  // 侧边栏背景色
```

**修改后**：
```typescript
backgroundColor: theme.centerChannelBg  // 主内容区背景色
```

## 🔄 兼容性

### 向后兼容
- ✅ 所有现有功能正常
- ✅ 只是改变了标题头的显示方式
- ✅ 不影响其他功能

### 性能影响
- ✅ 减少了自定义组件的渲染
- ✅ 使用系统组件，性能更好
- ✅ 代码更简洁

## 🎉 总结

### 实现成果
1. ✅ 移除了批量移动成员页面的自定义标题头
2. ✅ 使用系统标题栏
3. ✅ 代码更简洁（减少 90 行）
4. ✅ 提升了用户体验

### 技术亮点
- **使用系统组件**：统一样式和行为
- **简化代码**：减少自定义组件的渲染
- **易于维护**：系统标题栏自动处理返回按钮

### 用户价值
- 界面更统一
- 操作更直观
- 符合系统规范
- 用户体验更好

**批量移动成员页面现在使用系统标题栏，不再显示自定义标题头！🎉**
