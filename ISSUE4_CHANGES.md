# Issue 4: 添加成员页面改进 - 完成

## 问题描述
企业通讯录 → 添加成员页面存在以下问题：
1. 分组标题显示 `FORCE_TEAM_DEFAULT_DEPARTMENT` 而不是团队名称
2. 分组标题应该可以折叠（参考频道列表的折叠方式）

## 修改文件
- `app/screens/home/contacts/department_add_members/index.tsx`

## 改动详情

### 1. 导入必要的依赖
```typescript
// 第6行 - React Native 组件
import {Alert, FlatList, LayoutAnimation, Platform, Text, TextInput, TouchableOpacity, UIManager, View} from 'react-native';

// 第15行 - 常量
import {DEFAULT_TEAM_DEPARTMENT_NAME} from '@client/rest/constants';

// 第29-30行 - Android LayoutAnimation 支持
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
```

### 2. 新增样式（第121-137行）
- `sectionHeaderLeft`: 左侧 chevron + 文本布局
- `sectionHeaderCount`: 成员数量徽章样式
- 更新 `sectionHeader` 增加内边距

### 3. 替换默认部门名称（第443-445行）
```typescript
const displayName = m.sourceDepartmentName === DEFAULT_TEAM_DEPARTMENT_NAME
    ? companyName  // 使用团队名称替代 FORCE_TEAM_DEFAULT_DEPARTMENT
    : m.sourceDepartmentName;
```

### 4. 折叠状态管理（第434, 457-467行）
```typescript
const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

const toggleSection = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedSections((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        return next;
    });
}, []);
```

### 5. 渲染分组标题（第557-576行）
- 显示 chevron 图标（折叠时 chevron-right，展开时 chevron-down）
- 显示部门名称
- 显示成员数量（括号内）
- 点击切换折叠状态

### 6. 数据过滤（第601-613行）
```typescript
const flatListData = useMemo(() => {
    const items = [];
    for (const group of groupedMembers) {
        const collapsed = collapsedSections.has(group.key);
        items.push({type: 'header', key: `h-${group.key}`, departmentName: group.departmentName, memberCount: group.members.length});
        if (!collapsed) {  // 只在展开时添加成员
            for (const m of group.members) {
                items.push({type: 'member', key: `m-${m.employee.id}`, member: m});
            }
        }
    }
    return items;
}, [groupedMembers, collapsedSections]);
```

### 7. 渲染逻辑更新（第615-622行）
```typescript
const renderItem = useCallback(({item}) => {
    if (item.type === 'header') {
        const sectionKey = item.key.slice(2);  // 移除 'h-' 前缀
        return renderSectionHeader(sectionKey, item.departmentName, item.memberCount);
    }
    return renderMember(item.member);
}, [renderSectionHeader, renderMember]);
```

## 功能特性
✅ 默认部门显示为团队名称而非 `FORCE_TEAM_DEFAULT_DEPARTMENT`  
✅ 分组标题可点击折叠/展开  
✅ 使用 LayoutAnimation 实现平滑动画过渡  
✅ 显示每个分组的成员数量  
✅ Chevron 图标指示当前状态（折叠/展开）  
✅ 参考频道列表的折叠交互模式

## 测试建议
1. 打开企业通讯录 → 添加成员
2. 验证默认部门显示为团队名称
3. 点击分组标题，验证折叠/展开动画流畅
4. 验证折叠状态下成员列表隐藏，展开状态下显示
5. 验证成员数量显示正确
6. 验证 chevron 图标方向正确

## 技术要点
- 使用 `Set<string>` 管理折叠状态，O(1) 查找性能
- `LayoutAnimation.Presets.easeInEaseOut` 提供 iOS/Android 原生动画
- Android 需要启用 `setLayoutAnimationEnabledExperimental`
- 通过 module-level cache 模式避免 RNN passProps 序列化问题
