# 会话查询功能修复报告

## 问题描述

**Webapp 流程：**
1. 选择部门（下拉框）
2. 显示该部门的成员列表
3. 选择成员
4. 点击"查询会话"

**Mobile 修复前流程：**
1. ❌ 部门选择被注释掉（TODO）
2. ❌ 成员列表没有按部门过滤
3. 选择成员
4. 点击查询

**Mobile 修复后流程：**
1. ✅ 选择部门（下拉框）
2. ✅ 显示该部门的成员列表
3. ✅ 选择成员
4. ✅ 点击"查询会话"

## 修改内容

### 文件：`app/screens/home/apps/conversations/conversations_screen.tsx`

#### 1. 添加 NetworkManager 导入
```typescript
import NetworkManager from '@managers/network_manager';
```

#### 2. 实现部门加载
```typescript
// 修改前：TODO 注释，不加载部门
useEffect(() => {
    if (!teamId) return;
    setLoadingDepts(true);
    // TODO: Replace with actual API call when available
    setLoadingDepts(false);
}, [teamId]);

// 修改后：调用真实 API
useEffect(() => {
    if (!teamId || !serverUrl) return;
    setLoadingDepts(true);
    const loadDepartments = async () => {
        try {
            const client = NetworkManager.getClient(serverUrl);
            const result = await client.getDepartments(teamId, {page: 0, perPage: 100});
            setDepartments(result.departments || []);
        } catch (err) {
            console.error('Failed to load departments:', err);
            setDepartments([]);
        } finally {
            setLoadingDepts(false);
        }
    };
    loadDepartments();
}, [teamId, serverUrl]);
```

#### 3. 实现部门成员加载
```typescript
// 修改前：TODO 注释，不加载成员
useEffect(() => {
    if (!teamId || selectedDeptId === null) return;
    setLoadingMembers(true);
    // TODO: Replace with actual API call when available
    setMembers([]);
    setLoadingMembers(false);
}, [teamId, selectedDeptId]);

// 修改后：调用真实 API
useEffect(() => {
    if (!teamId || selectedDeptId === null || !serverUrl) {
        setMembers([]);
        return;
    }
    setLoadingMembers(true);
    const loadMembers = async () => {
        try {
            const client = NetworkManager.getClient(serverUrl);
            const result = await client.getDepartmentMembers(teamId, selectedDeptId, {page: 0, perPage: 100});
            setMembers(result.members || []);
        } catch (err) {
            console.error('Failed to load department members:', err);
            setMembers([]);
        } finally {
            setLoadingMembers(false);
        }
    };
    loadMembers();
}, [teamId, selectedDeptId, serverUrl]);
```

#### 4. 更新 UI 添加部门选择
```typescript
// 添加部门选择下拉框
<Text style={style.label}>
    {intl.formatMessage({id: 'workbench.conversations.select_department', defaultMessage: 'Select Department'})}
</Text>
<TouchableOpacity
    style={style.selectBtn}
    onPress={() => setShowDeptModal(true)}
    disabled={loadingDepts}
>
    <Text style={style.selectText}>
        {loadingDepts
            ? intl.formatMessage({id: 'workbench.loading', defaultMessage: 'Loading...'})
            : selectedDeptId !== null
                ? departments.find(d => d.id === selectedDeptId)?.name || ''
                : intl.formatMessage({id: 'workbench.conversations.choose_department', defaultMessage: 'Choose a department...'})
        }
    </Text>
    <CompassIcon name='chevron-down' size={20} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
</TouchableOpacity>

// 成员选择现在依赖部门选择
<TouchableOpacity
    style={[style.selectBtn, selectedDeptId === null && {opacity: 0.5}]}
    onPress={() => selectedDeptId !== null && setShowMemberModal(true)}
    disabled={selectedDeptId === null || loadingMembers}
>
    <Text style={style.selectText}>
        {loadingMembers
            ? intl.formatMessage({id: 'workbench.loading', defaultMessage: 'Loading...'})
            : selectedDeptId === null
                ? intl.formatMessage({id: 'workbench.conversations.select_department_first', defaultMessage: 'Select a department first'})
                : selectedMember
                    ? getMemberDisplayName(selectedMember)
                    : intl.formatMessage({id: 'workbench.conversations.choose_member', defaultMessage: 'Choose a member...'})
        }
    </Text>
    <CompassIcon name='chevron-down' size={20} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
</TouchableOpacity>
```

#### 5. 添加部门选择模态框
```typescript
{showDeptModal && (
    <View style={style.modalOverlay}>
        <View style={style.modalSheet}>
            <View style={style.modalHandle}/>
            <Text style={style.modalTitle}>
                {intl.formatMessage({id: 'workbench.conversations.select_department', defaultMessage: 'Select Department'})}
            </Text>
            <FlatList
                data={departments}
                keyExtractor={(item) => String(item.id)}
                renderItem={({item}) => (
                    <TouchableOpacity
                        style={style.listRow}
                        onPress={() => {
                            setSelectedDeptId(item.id);
                            setSelectedMember(null);  // 清空已选成员
                            setShowDeptModal(false);
                        }}
                    >
                        <Text style={style.listRowText}>{item.name}</Text>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View style={style.emptyContainer}>
                        <Text style={style.emptyText}>
                            {intl.formatMessage({id: 'workbench.conversations.no_departments', defaultMessage: 'No departments available'})}
                        </Text>
                    </View>
                }
            />
        </View>
    </View>
)}
```

## API 调用

### 获取部门列表
```typescript
client.getDepartments(teamId, {page: 0, perPage: 100})
// 返回：{ departments: Department[] }
```

### 获取部门成员
```typescript
client.getDepartmentMembers(teamId, departmentId, {page: 0, perPage: 100})
// 返回：{ members: Member[] }
```

## 验证

### 功能验证
1. ✅ 打开会话查询屏幕
2. ✅ 看到部门选择下拉框
3. ✅ 点击部门选择，显示部门列表模态框
4. ✅ 选择部门后，成员列表自动加载
5. ✅ 成员选择下拉框可用
6. ✅ 选择成员后，可以查询会话
7. ✅ 切换部门时，已选成员被清空

### 与 Webapp 对比
| 功能 | Webapp | Mobile（修复后） | 状态 |
|------|--------|-----------------|------|
| 部门选择 | ✅ | ✅ | 一致 |
| 部门成员加载 | ✅ | ✅ | 一致 |
| 成员选择 | ✅ | ✅ | 一致 |
| 查询会话 | ✅ | ✅ | 一致 |
| 流程顺序 | 部门→成员→查询 | 部门→成员→查询 | 一致 |

## 总结

✅ Mobile 会话查询功能现在与 Webapp 完全一致
✅ 用户可以按部门筛选成员，然后查询会话
✅ 所有 API 调用已实现，移除了 TODO 注释
✅ UI 交互流程与 Webapp 保持一致
