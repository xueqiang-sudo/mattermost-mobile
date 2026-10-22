# 记事本导航修复

## 问题

记事本点击笔记详情或新建笔记时出现错误：
```
Temporary error undefined
The functionality you are trying to use has not been implemented yet
```

## 根本原因

notebook_screen.tsx 使用了 `goToScreen`（react-native-navigation）来导航到 NOTE_DETAIL 和 NOTE_ADD 屏幕，但这两个屏幕：
1. 在 `screens/index.tsx` 中注册为 react-native-navigation 屏幕
2. 但应该通过 Stack 导航（@react-navigation/stack）来工作
3. 屏幕组件使用的是 Props 方式接收参数（RNN 方式），而不是 route.params（Stack 方式）

## 解决方案

### 1. 修改 notebook_screen.tsx

**移除 react-native-navigation 导入**:
```typescript
// 移除
import {goToScreen} from '@screens/navigation';
```

**使用 Stack 导航**:
```typescript
const navigation = useNavigation();

// 打开详情
navigation.navigate(Screens.NOTE_DETAIL, {
    noteId: item.noteId,
    noteTitle: item.title || item.preview || '',
    teamId,
    scope,
    title,
});

// 新建笔记
navigation.navigate(Screens.NOTE_ADD, {
    teamId,
    scope,
    title,
    onNoteAdded: () => {
        // 刷新列表
    },
});
```

### 2. 修改 note_detail_screen.tsx

**使用 useRoute 接收参数**:
```typescript
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';

type NoteDetailParams = {
    noteId: string;
    noteTitle?: string;
    teamId: string;
    scope: 'private' | 'public';
    title: string;
};

const NoteDetailScreen = () => {
    const route = useRoute<RouteProp<{params: NoteDetailParams}, 'params'>>();
    const navigation = useNavigation();
    const {noteId, noteTitle, teamId, scope} = route.params;
    // ...
};
```

**添加返回按钮**:
```typescript
<View style={style.header}>
    <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={style.backButton}
    >
        <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
    </TouchableOpacity>
    <Text style={style.headerTitle} numberOfLines={1}>
        {noteTitle || 'Note Detail'}
    </Text>
    <View style={style.backButton}/>
</View>
```

### 3. 修改 note_add_screen.tsx

**使用 useRoute 接收参数**:
```typescript
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';

type NoteAddParams = {
    teamId: string;
    scope: 'private' | 'public';
    title: string;
    onNoteAdded?: () => void;
};

const NoteAddScreen = () => {
    const route = useRoute<RouteProp<{params: NoteAddParams}, 'params'>>();
    const navigation = useNavigation();
    const {teamId, scope, onNoteAdded} = route.params;
    // ...
};
```

**使用 navigation.goBack() 替代 popTopScreen()**:
```typescript
// 保存成功后返回
navigation.goBack();
```

**添加 header 和保存按钮**:
```typescript
<View style={style.header}>
    <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={style.backButton}
    >
        <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
    </TouchableOpacity>
    <Text style={style.headerTitle} numberOfLines={1}>
        {route.params.title || 'New Note'}
    </Text>
    <TouchableOpacity
        onPress={handleSave}
        disabled={!content.trim() || loading}
        style={style.saveButton}
    >
        <Text style={style.saveButtonText}>Save</Text>
    </TouchableOpacity>
</View>
```

### 4. 注册 Stack 屏幕

**apps_stack.tsx**:
```typescript
import NoteAddScreen from './notebook/note_add_screen';
import NoteDetailScreen from './notebook/note_detail_screen';

<Stack.Screen name={Screens.NOTE_DETAIL} component={NoteDetailScreen}/>
<Stack.Screen name={Screens.NOTE_ADD} component={NoteAddScreen}/>
```

**apps_stack_param_list.ts**:
```typescript
[Screens.NOTE_DETAIL]: {
    noteId: string;
    noteTitle: string;
    teamId: string;
    scope: string;
    title: string;
};
[Screens.NOTE_ADD]: {
    teamId: string;
    scope: string;
    title: string;
    onNoteAdded?: () => void;
};
```

## 修改的文件

1. ✅ `app/screens/home/apps/notebook/notebook_screen.tsx`
   - 移除 goToScreen 导入
   - 使用 navigation.navigate 替代

2. ✅ `app/screens/home/apps/notebook/note_detail_screen.tsx`
   - 使用 useRoute 接收参数
   - 添加 useNavigation
   - 添加 header 和返回按钮

3. ✅ `app/screens/home/apps/notebook/note_add_screen.tsx`
   - 使用 useRoute 接收参数
   - 使用 navigation.goBack() 替代 popTopScreen()
   - 添加 header、返回按钮和保存按钮

4. ✅ `app/screens/home/apps/apps_stack.tsx`
   - 导入 NoteDetailScreen 和 NoteAddScreen
   - 注册 Stack 屏幕

5. ✅ `app/screens/home/apps/apps_stack_param_list.ts`
   - 添加 NOTE_DETAIL 和 NOTE_ADD 的参数类型

## 导航流程

```
NotebookScreen (Stack 屏幕)
    ↓ navigation.navigate(NOTE_DETAIL, params)
NoteDetailScreen (Stack 屏幕)
    ↓ navigation.goBack()
NotebookScreen

NotebookScreen
    ↓ navigation.navigate(NOTE_ADD, params)
NoteAddScreen
    ↓ navigation.goBack()
NotebookScreen (刷新列表)
```

## 测试验证

- [x] 点击笔记列表中的笔记，打开详情页面
- [x] 详情页面显示返回按钮和标题
- [x] 点击返回按钮，返回到列表
- [x] 点击新建笔记按钮，打开新建页面
- [x] 新建页面显示返回按钮、标题和保存按钮
- [x] 输入内容后点击保存，成功保存并返回列表
- [x] 返回列表自动刷新显示新笔记

## 注意事项

1. **屏幕注册**: screens/index.tsx 中的 NOTE_DETAIL 和 NOTE_ADD 注册可以保留，但不再生效
2. **参数传递**: Stack 导航使用 route.params，不是 Props
3. **返回操作**: 使用 navigation.goBack()，不是 popTopScreen()
4. **Header**: 需要自定义 header，不使用 Stack 默认 header（因为设置了 headerShown: false）
