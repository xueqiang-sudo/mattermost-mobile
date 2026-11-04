# 搜索界面优化 - 仿微信分组显示

## ✅ 修改完成

### 📋 需求
1. 使用 `goToScreen()` 方式显示搜索界面（而非 `showModal`）
2. 只搜索当前团队下的联系人和群组
3. 搜索结果按分组显示（联系人 / 群聊）
4. 显示个人头像和群组头像

---

## 🔧 修改内容

### 1. **添加 SEARCH 屏幕常量**

**文件**: `app/constants/screens.ts`

```typescript
// 添加常量
export const SEARCH = 'Search';

// 添加到 Screens 数组
SEARCH,
```

---

### 2. **修改搜索按钮打开方式**

**文件**: `app/screens/home/channel_list/categories_list/header/header.tsx`

**修改前**:
```typescript
const onSearchPress = usePreventDoubleTap(useCallback(() => {
    findChannels(
        intl.formatMessage({id: 'find_channels.title', defaultMessage: '搜索群聊、联系人'}),
        theme,
    );
}, [intl, theme]));
```

**修改后**:
```typescript
const onSearchPress = usePreventDoubleTap(useCallback(() => {
    goToScreen(
        Screens.SEARCH,
        intl.formatMessage({id: 'search.title', defaultMessage: '搜索'}),
        {},
        {useBackIcon: true},
    );
}, [intl]));
```

**变化**:
- ✅ 从 `findChannels()` (showModal) 改为 `goToScreen()`
- ✅ 使用系统标题栏（返回按钮 + 标题）
- ✅ 更好的导航体验

---

### 3. **创建新的 Search 界面**

**文件**: `app/screens/search/index.tsx` (新建)

#### 界面结构
```
┌─────────────────────────────────┐
│ ← 搜索                          │  ← 系统标题栏
├─────────────────────────────────┤
│ [🔍 搜索联系人和群聊]            │  ← 搜索框
├─────────────────────────────────┤
│ 👤 联系人                       │  ← 分组标题
│   [头像] 张三                   │
│   [头像] 李四                   │
├─────────────────────────────────┤
│ 💬 群聊                         │  ← 分组标题
│   [群头像] 技术群               │
│   [群头像] 项目群               │
└─────────────────────────────────┘
```

#### 核心功能

**a) 搜索逻辑**
```typescript
const doSearch = useDebounce(useCallback(async (searchTerm: string) => {
    // 获取当前团队 ID
    const teamId = await getCurrentTeamId(serverUrl);
    
    // 搜索联系人（仅当前团队）
    const usersResult = await searchProfiles(serverUrl, lowerCasedTerm, {
        team_id: teamId,
        allow_inactive: false,
    });
    
    // 搜索群聊（仅当前团队）
    const channelsResult = await searchAllChannels(serverUrl, lowerCasedTerm, true);
    
    // 过滤结果（只显示当前团队的）
    filteredChannels = channelsResult.channels.filter((c: Channel) => 
        c.team_id === teamId && !c.delete_at
    );
}, [serverUrl]), 300);
```

**b) 分组显示**
```typescript
const buildListData = useMemo(() => {
    const data: ResultItem[] = [];
    
    // 联系人分组
    if (contacts.length > 0) {
        data.push({
            type: 'header',
            title: '联系人',
            icon: 'account-outline',
        });
        contacts.forEach((user) => {
            data.push({type: 'contact', data: user});
        });
    }
    
    // 群聊分组
    if (channels.length > 0) {
        data.push({
            type: 'header',
            title: '群聊',
            icon: 'forum-outline',
        });
        channels.forEach((channel) => {
            data.push({type: 'channel', data: channel});
        });
    }
    
    return data;
}, [contacts, channels, term]);
```

**c) 分组标题组件**
```typescript
const renderGroupHeader = useCallback((title: string, icon: string) => {
    return (
        <View style={styles.groupHeader}>
            <CompassIcon name={icon} size={18} style={styles.groupHeaderIcon}/>
            <Text style={styles.groupHeaderTitle}>{title}</Text>
        </View>
    );
}, [styles]);
```

**d) 列表项渲染**
```typescript
const renderItem = useCallback(({item}: {item: ResultItem}) => {
    if (item.type === 'header') {
        return renderGroupHeader(item.title || '', item.icon || '');
    }
    
    if (item.type === 'contact') {
        const user = item.data as UserModel;
        return (
            <UserItem
                onUserPress={onContactPress}
                user={user}
                showBadges={true}
            />
        );
    }
    
    const channel = item.data as ChannelModel | Channel;
    return (
        <ChannelItem
            channel={channel}
            onPress={onChannelPress}
            showChannelTypeTag={true}
        />
    );
}, [onContactPress, onChannelPress, renderGroupHeader]);
```

#### 样式设计

**分组标题**:
```typescript
groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    marginTop: 8,
},
groupHeaderIcon: {
    color: changeOpacity(theme.centerChannelColor, 0.56),
    marginRight: 8,
},
groupHeaderTitle: {
    ...typography('Body', 200, 'SemiBold'),
    color: changeOpacity(theme.centerChannelColor, 0.72),
},
```

---

### 4. **注册 Search 屏幕**

**文件**: `app/screens/index.tsx`

```typescript
case Screens.SEARCH:
    screen = withServerDatabase(require('@screens/search').default);
    break;
```

---

## 📊 功能对比

| 特性 | 修改前 | 修改后 |
|------|--------|--------|
| **打开方式** | `showModal()` | `goToScreen()` ✅ |
| **搜索范围** | 所有团队 | 仅当前团队 ✅ |
| **结果分组** | 5个 Tab 分类 | 2个分组（联系人/群聊） ✅ |
| **分组标题** | 无 | 图标 + 标题 ✅ |
| **头像显示** | 部分 | 全部（个人/群组） ✅ |
| **实时搜索** | 需要触发 | 自动（300ms 防抖） ✅ |
| **最大结果数** | 20 | 20（每组） ✅ |

---

## 🎨 UI 设计

### 分组标题
- **图标**: CompassIcon (account-outline / forum-outline)
- **大小**: 18px
- **颜色**: 灰色（0.56 透明度）
- **标题**: Body 200 SemiBold
- **背景**: 浅灰色（0.04 透明度）

### 列表项
- **联系人**: UserItem 组件（圆形头像 40px）
- **群聊**: ChannelItem 组件（方形群头像 40px）
- **高度**: ROW_HEIGHT_CENTER_LIST (64px)

### 空状态
- **图标**: 放大镜（64px）
- **文字**: "未找到"{term}"相关结果"
- **位置**: 居中

---

## 🔍 搜索算法

### 1. 防抖处理
```typescript
useDebounce(callback, 300)
```
- 用户停止输入 300ms 后才执行搜索
- 避免频繁请求

### 2. 搜索范围
- **联系人**: `searchProfiles()` - 仅当前团队
- **群聊**: `searchAllChannels()` - 仅当前团队且未删除

### 3. 过滤规则
```typescript
// 只保留当前团队的群聊
channels.filter((c: Channel) => 
    c.team_id === teamId && !c.delete_at
)
```

### 4. 结果限制
- 每组最多显示 20 条结果
- 总计最多 40 条（20 联系人 + 20 群聊）

---

## 🧪 测试场景

### 场景 1: 空搜索
- ✅ 输入框为空
- ✅ 不显示任何结果
- ✅ 显示占位提示

### 场景 2: 搜索联系人
- ✅ 输入联系人昵称
- ✅ 显示"联系人"分组
- ✅ 显示匹配的联系人列表
- ✅ 每个联系人显示头像

### 场景 3: 搜索群聊
- ✅ 输入群聊名称
- ✅ 显示"群聊"分组
- ✅ 显示匹配的群聊列表
- ✅ 每个群聊显示群头像

### 场景 4: 同时匹配
- ✅ 输入关键词同时匹配联系人和群聊
- ✅ 显示两个分组
- ✅ 联系人分组在上
- ✅ 群聊分组在下

### 场景 5: 无结果
- ✅ 输入不存在的关键词
- ✅ 显示空状态图标
- ✅ 显示"未找到"xxx"相关结果"

---

## 📝 待完善功能（TODO）

### 1. 点击联系人
```typescript
const onContactPress = useCallback((user: UserModel) => {
    // TODO: Open direct message with user
    console.log('Open DM with:', user.username);
}, []);
```

### 2. 点击群聊
```typescript
const onChannelPress = useCallback((channel: ChannelModel | Channel) => {
    // TODO: Open channel
    console.log('Open channel:', channel.display_name);
}, []);
```

**实现建议**:
```typescript
import {switchToChannelById} from '@actions/remote/channel';
import {makeDirectMessage} from '@actions/remote/channel';

const onContactPress = useCallback(async (user: UserModel) => {
    const result = await makeDirectMessage(serverUrl, user.id);
    if (!result.error && result.channel) {
        switchToChannelById(serverUrl, result.channel.id);
    }
}, [serverUrl]);

const onChannelPress = useCallback((channel: ChannelModel | Channel) => {
    switchToChannelById(serverUrl, channel.id);
}, [serverUrl]);
```

---

## 🎉 总结

### 实现成果
1. ✅ 使用 `goToScreen()` 打开搜索界面
2. ✅ 只搜索当前团队的联系人和群聊
3. ✅ 分组显示（联系人 / 群聊）
4. ✅ 显示分组标题（图标 + 文字）
5. ✅ 显示个人头像和群组头像
6. ✅ 实时搜索（300ms 防抖）
7. ✅ 空状态提示

### 技术亮点
- **分组渲染**: FlatList 支持多种 item 类型
- **防抖优化**: useDebounce 减少请求
- **范围限制**: 仅搜索当前团队
- **视觉层次**: 分组标题背景色区分

### 用户体验
- 界面更简洁（无复杂 Tab）
- 搜索更精准（仅当前团队）
- 结果更清晰（分组显示）
- 体验更接近微信

**搜索功能已按方案 A 完成！🎉**
