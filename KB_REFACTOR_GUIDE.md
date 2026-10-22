# 知识库重构指南 - Modal 改为 Navigation

## 📋 概述

将知识库的 4 个 Modal 改为 Navigation 模式，彻底解决 iOS 手势冲突崩溃问题。

---

## ✅ 已完成

### 1. KB Detail Screen（文档详情）

**文件：** `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx` ✅

**功能：**
- 显示文档详情（Markdown 内容）
- 支持文件下载
- 支持删除文档
- 完整的错误处理
- 原生导航体验

---

## 🔄 待完成

### 2. KB Add Screen（添加文档）

**需要创建：** `app/screens/home/apps/knowledge_base/kb_add_screen.tsx`

**参考代码结构：**

```typescript
import {useNavigation, useRoute} from '@react-navigation/native';
import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DocumentPicker from 'react-native-document-picker';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme} from '@utils/theme';

import {createKBDocText, createKBDocURL, createKBDocFile} from '../workbench_api';

type KBAddScreenRouteParams = {
    teamId: string;
    onDocAdded?: () => void;
};

const KBAddScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const route = useRoute();

    const {teamId, onDocAdded} = (route.params as KBAddScreenRouteParams) || {};

    const [addType, setAddType] = useState<'text' | 'url' | 'file'>('text');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [url, setUrl] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);

    // 设置导航栏
    useEffect(() => {
        navigation.setOptions({
            title: intl.formatMessage({
                id: 'workbench.kb.add_title',
                defaultMessage: 'Add Document',
            }),
            headerLeft: () => (
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <CompassIcon name='close' size={24}/>
                </TouchableOpacity>
            ),
            headerRight: () => (
                <TouchableOpacity onPress={handleSave} disabled={loading}>
                    <Text>保存</Text>
                </TouchableOpacity>
            ),
        });
    }, [navigation, intl, loading]);

    // 选择文件
    const handlePickFile = async () => {
        try {
            const result = await DocumentPicker.pick({
                type: [DocumentPicker.types.allFiles],
            });
            setFile(result[0]);
            setTitle(result[0].name);
        } catch (err) {
            // 用户取消
        }
    };

    // 保存
    const handleSave = async () => {
        if (loading) return;

        try {
            setLoading(true);

            let result;
            if (addType === 'text') {
                if (!title.trim() || !content.trim()) {
                    Alert.alert('错误', '请填写标题和内容');
                    return;
                }
                result = await createKBDocText(serverUrl, teamId, title.trim(), content.trim());
            } else if (addType === 'url') {
                if (!title.trim() || !url.trim()) {
                    Alert.alert('错误', '请填写标题和 URL');
                    return;
                }
                result = await createKBDocURL(serverUrl, teamId, title.trim(), url.trim());
            } else if (addType === 'file') {
                if (!file) {
                    Alert.alert('错误', '请选择文件');
                    return;
                }
                result = await createKBDocFile(serverUrl, teamId, file);
            }

            if (result?.error) {
                throw new Error(result.error);
            }

            onDocAdded?.();
            navigation.goBack();
        } catch (err) {
            Alert.alert('错误', String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{flex: 1}}>
            {/* 类型选择 */}
            <View style={{flexDirection: 'row', padding: 16}}>
                <TouchableOpacity onPress={() => setAddType('text')}>
                    <Text>文本</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAddType('url')}>
                    <Text>URL</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAddType('file')}>
                    <Text>文件</Text>
                </TouchableOpacity>
            </View>

            {/* 表单 */}
            <View style={{padding: 16}}>
                {addType !== 'file' && (
                    <TextInput
                        placeholder="标题"
                        value={title}
                        onChangeText={setTitle}
                    />
                )}

                {addType === 'text' && (
                    <TextInput
                        placeholder="内容"
                        value={content}
                        onChangeText={setContent}
                        multiline
                    />
                )}

                {addType === 'url' && (
                    <TextInput
                        placeholder="URL"
                        value={url}
                        onChangeText={setUrl}
                        autoCapitalize="none"
                    />
                )}

                {addType === 'file' && (
                    <TouchableOpacity onPress={handlePickFile}>
                        <Text>{file ? file.name : '选择文件'}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </SafeAreaView>
    );
};

export default KBAddScreen;
```

---

### 3. KB Edit Screen（编辑文档）

**需要创建：** `app/screens/home/apps/knowledge_base/kb_edit_screen.tsx`

**参考代码结构：**

```typescript
import {useNavigation, useRoute} from '@react-navigation/native';
import React, {useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Text, TextInput, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme} from '@utils/theme';

import {updateKBDoc, type KBDoc} from '../workbench_api';

type KBEditScreenRouteParams = {
    doc: KBDoc;
    onDocUpdated?: () => void;
};

const KBEditScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const route = useRoute();

    const {doc, onDocUpdated} = (route.params as KBEditScreenRouteParams) || {};

    const [title, setTitle] = useState(doc?.title || '');
    const [content, setContent] = useState(doc?.content || '');
    const [loading, setLoading] = useState(false);

    // 设置导航栏
    useEffect(() => {
        navigation.setOptions({
            title: intl.formatMessage({
                id: 'workbench.kb.edit_title',
                defaultMessage: 'Edit Document',
            }),
            headerLeft: () => (
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <CompassIcon name='close' size={24}/>
                </TouchableOpacity>
            ),
            headerRight: () => (
                <TouchableOpacity onPress={handleSave} disabled={loading}>
                    <Text>保存</Text>
                </TouchableOpacity>
            ),
        });
    }, [navigation, intl, loading]);

    // 保存
    const handleSave = async () => {
        if (!title.trim() || !content.trim() || loading || !doc) {
            return;
        }

        try {
            setLoading(true);

            const result = await updateKBDoc(serverUrl, doc.docId, {
                title: title.trim(),
                content: content.trim(),
            });

            if (result?.error) {
                throw new Error(result.error);
            }

            onDocUpdated?.();
            navigation.goBack();
        } catch (err) {
            Alert.alert('错误', String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{flex: 1}}>
            <TextInput
                placeholder="标题"
                value={title}
                onChangeText={setTitle}
                style={{padding: 16, borderBottomWidth: 1}}
            />
            <TextInput
                placeholder="内容"
                value={content}
                onChangeText={setContent}
                multiline
                style={{flex: 1, padding: 16}}
            />
        </SafeAreaView>
    );
};

export default KBEditScreen;
```

---

## 🔧 修改 knowledge_base_screen.tsx

### 1. 移除 Modal 相关状态

```typescript
// 删除这些状态
const [detailDoc, setDetailDoc] = useState<KBDoc | null>(null);
const [detailLoading, setDetailLoading] = useState(false);
const [showAddModal, setShowAddModal] = useState(false);
const [editingDoc, setEditingDoc] = useState<KBDoc | null>(null);
```

### 2. 修改打开详情的函数

```typescript
// 修改前（Modal 方式）
const openDetail = useCallback(async (docId: string) => {
    setDetailDoc({docId, title: '...', content: '', ...});
    setDetailLoading(true);
    try {
        const doc = await getKBDoc(serverUrl, docId);
        setDetailDoc(doc);
    } finally {
        setDetailLoading(false);
    }
}, [serverUrl]);

// 修改后（Navigation 方式）
const openDetail = useCallback((docId: string, title?: string) => {
    navigation.navigate('KBDetail', {
        docId,
        docTitle: title,
        onDocUpdated: () => {
            // 刷新列表
            loadDocs();
        },
    });
}, [navigation, loadDocs]);
```

### 3. 修改添加文档

```typescript
// 修改前
const openAddModal = useCallback(() => {
    setShowAddModal(true);
}, []);

// 修改后
const openAddScreen = useCallback(() => {
    navigation.navigate('KBAdd', {
        teamId,
        onDocAdded: () => {
            loadDocs();
        },
    });
}, [navigation, teamId, loadDocs]);
```

### 4. 修改编辑文档

```typescript
// 修改前
const openEditModal = useCallback((doc: KBDoc) => {
    setEditingDoc(doc);
}, []);

// 修改后
const openEditScreen = useCallback((doc: KBDoc) => {
    navigation.navigate('KBEdit', {
        doc,
        onDocUpdated: () => {
            loadDocs();
        },
    });
}, [navigation, loadDocs]);
```

### 5. 移除 Modal 渲染

```typescript
// 删除这些 Modal
{/* ---- Detail Modal ---- */}
<Modal visible={detailDoc !== null}>
    ...
</Modal>

{/* ---- Add Document Modal ---- */}
<Modal visible={showAddModal}>
    ...
</Modal>

{/* ---- Edit Document Modal ---- */}
<Modal visible={editingDoc !== null}>
    ...
</Modal>
```

### 6. 移除 Modal 导入

```typescript
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    // Modal,  // 删除这行
    ScrollView,
    ...
} from 'react-native';
```

---

## 📋 注册路由

### 1. 添加 Screen 常量

**文件：** `app/constants/screens.ts`

```typescript
export const KB_DETAIL = 'KBDetail';
export const KB_ADD = 'KBAdd';
export const KB_EDIT = 'KBEdit';
```

### 2. 注册 Screen

**文件：** `app/init/app.ts` 或类似文件

```typescript
import KBDetailScreen from '@screens/home/apps/knowledge_base/kb_detail_screen';
import KBAddScreen from '@screens/home/apps/knowledge_base/kb_add_screen';
import KBEditScreen from '@screens/home/apps/knowledge_base/kb_edit_screen';

Navigation.registerComponent('KBDetail', () => KBDetailScreen);
Navigation.registerComponent('KBAdd', () => KBAddScreen);
Navigation.registerComponent('KBEdit', () => KBEditScreen);
```

---

## ⚠️ Ask AI Modal（保留）

**原因：**
- 对话界面，不需要导航
- 快速问答然后关闭
- 用户体验更适合 Modal

**但需要添加手势保护：**

```typescript
<Modal
    visible={showAskModal}
    presentationStyle='pageSheet'
    gestureEnabled={false}  // ← 添加这行
    onRequestClose={closeAskModal}
>
    ...
</Modal>
```

---

## 🧪 测试验证

### 功能测试

- [ ] 点击文档可以打开详情
- [ ] 详情页内容正确显示（Markdown）
- [ ] 详情页可以滚动
- [ ] 详情页下拉不会崩溃
- [ ] 详情页支持文件下载
- [ ] 详情页可以删除文档
- [ ] 点击"+"可以添加文档
- [ ] 添加文档支持文本/URL/文件
- [ ] 保存成功后自动返回
- [ ] 返回后列表自动刷新
- [ ] 详情页可以进入编辑
- [ ] 编辑文档可以修改标题和内容
- [ ] 编辑保存后自动返回
- [ ] 问 AI 功能正常

### iOS 手势测试

- [ ] 详情页侧滑返回
- [ ] 添加页侧滑返回
- [ ] 编辑页侧滑返回
- [ ] 详情页下拉滚动正常（不崩溃）
- [ ] 无崩溃或卡顿

---

## 📊 代码变更预估

### 新增文件
- `kb_detail_screen.tsx` (+300 行) ✅ 已完成
- `kb_add_screen.tsx` (+200 行) ⏳ 待创建
- `kb_edit_screen.tsx` (+150 行) ⏳ 待创建

### 修改文件
- `knowledge_base_screen.tsx` (-400 行, +50 行) ⏳ 待修改
- `screens.ts` (+3 行) ⏳ 待修改

### 总计
- **新增**: 650 行
- **删除**: 400 行
- **净增**: 250 行

---

## 💡 总结

**收益：**
- ✅ 彻底解决 iOS 崩溃
- ✅ 提升用户体验
- ✅ 统一应用风格
- ✅ 代码更易维护

**工作量：**
- 已完成 1/4（详情页）
- 还需要约 3-4 小时完成剩余部分

**建议：**
- 立即完成剩余工作
- 这是最高优先级任务

---

祝重构顺利！🚀
