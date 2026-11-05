# 智能笔记本标题对话框多语言实现总结

## 📋 概述

本文档总结智能笔记本标题输入对话框的完整多语言实现方案。

## 🌍 多语言支持要点

### 1. 所有用户可见文本必须使用 intl.formatMessage

**✅ 正确示例**：
```typescript
<Text>
    {intl.formatMessage({
        id: 'smart_notebook.enter_title',
        defaultMessage: '请输入标题',
    })}
</Text>
```

**❌ 错误示例**：
```typescript
<Text>请输入标题</Text>  // 硬编码，不支持多语言
```

### 2. 标题对话框完整代码（支持多语言）

```typescript
<Modal
    visible={showTitleDialog}
    transparent={true}
    animationType='fade'
    onRequestClose={() => {
        setShowTitleDialog(false);
        setTitleInput('');
    }}
>
    <View style={style.titleDialogOverlay}>
        <View style={style.titleDialogContainer}>
            {/* ✅ 对话框标题 - 多语言 */}
            <Text style={style.titleDialogTitle}>
                {intl.formatMessage({
                    id: 'smart_notebook.enter_title',
                    defaultMessage: '请输入标题',
                })}
            </Text>
            
            {/* ✅ 对话框消息 - 多语言 */}
            <Text style={style.titleDialogMessage}>
                {intl.formatMessage({
                    id: 'smart_notebook.enter_title_message',
                    defaultMessage: '您的笔记还没有标题，请输入一个标题：',
                })}
            </Text>
            
            {/* ✅ 输入框占位符 - 多语言 */}
            <TextInput
                style={style.titleDialogInput}
                value={titleInput}
                onChangeText={setTitleInput}
                placeholder={intl.formatMessage({
                    id: 'smart_notebook.untitled',
                    defaultMessage: '无标题',
                })}
                autoFocus
            />
            
            {/* ✅ 按钮文本 - 多语言 */}
            <View style={style.titleDialogButtons}>
                <TouchableOpacity
                    onPress={() => {
                        setShowTitleDialog(false);
                        setTitleInput('');
                    }}
                    style={[style.titleDialogBtn, style.titleDialogBtnCancel]}
                >
                    <Text style={style.titleDialogBtnTextCancel}>
                        {intl.formatMessage({
                            id: 'smart_notebook.cancel',
                            defaultMessage: '取消',
                        })}
                    </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                    onPress={async () => {
                        setShowTitleDialog(false);
                        // ✅ 默认标题也使用多语言
                        const newTitle = titleInput.trim() || intl.formatMessage({
                            id: 'smart_notebook.untitled',
                            defaultMessage: '无标题',
                        });
                        setTitleInput('');
                        setTitle(newTitle);
                        await performSaveWithNewTitle(newTitle);
                    }}
                    style={[style.titleDialogBtn, style.titleDialogBtnConfirm]}
                >
                    <Text style={style.titleDialogBtnTextConfirm}>
                        {intl.formatMessage({
                            id: 'smart_notebook.save',
                            defaultMessage: '保存',
                        })}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    </View>
</Modal>
```

## 📝 必需的翻译键

### 英文 (en.json)

```json
{
  "smart_notebook.enter_title": "Enter Title",
  "smart_notebook.enter_title_message": "Your note doesn't have a title yet. Please enter a title:",
  "smart_notebook.untitled": "Untitled",
  "smart_notebook.cancel": "Cancel",
  "smart_notebook.save": "Save"
}
```

### 简体中文 (zh-CN.json)

```json
{
  "smart_notebook.enter_title": "请输入标题",
  "smart_notebook.enter_title_message": "您的笔记还没有标题，请输入一个标题：",
  "smart_notebook.untitled": "无标题",
  "smart_notebook.cancel": "取消",
  "smart_notebook.save": "保存"
}
```

### 繁体中文 (zh-TW.json)

```json
{
  "smart_notebook.enter_title": "請輸入標題",
  "smart_notebook.enter_title_message": "您的筆記還沒有標題，請輸入一個標題：",
  "smart_notebook.untitled": "無標題",
  "smart_notebook.cancel": "取消",
  "smart_notebook.save": "儲存"
}
```

## 🔧 实施步骤

### 步骤 1: 添加翻译到 i18n 文件

将上述 JSON 内容追加到以下文件末尾：
1. `/home/work/mattermost-mobile/assets/base/i18n/en.json`
2. `/home/work/mattermost-mobile/assets/base/i18n/zh-CN.json`
3. `/home/work/mattermost-mobile/assets/base/i18n/zh-TW.json`

**注意**：
- 确保 JSON 格式正确（最后一个键后面不要有逗号）
- 使用双引号，不要用单引号
- 键名保持一致性

### 步骤 2: 在代码中使用 intl.formatMessage

在所有用户可见的地方使用 `intl.formatMessage`：

```typescript
// 导入 intl
import {useIntl} from 'react-intl';

// 在组件中
const intl = useIntl();

// 使用
<Text>
    {intl.formatMessage({
        id: 'smart_notebook.enter_title',
        defaultMessage: '请输入标题',
    })}
</Text>
```

### 步骤 3: 测试多语言

1. **切换设备语言到英文**
   - 设置 → 语言 → English
   - 打开智能笔记本
   - 点击保存（无标题）
   - **预期**：对话框显示 "Enter Title"、"Cancel"、"Save"

2. **切换设备语言到简体中文**
   - 设置 → 语言 → 简体中文
   - 打开智能笔记本
   - 点击保存（无标题）
   - **预期**：对话框显示 "请输入标题"、"取消"、"保存"

3. **切换设备语言到繁体中文**
   - 设置 → 语言 → 繁體中文
   - 打开智能笔记本
   - 点击保存（无标题）
   - **预期**：对话框显示 "請輸入標題"、"取消"、"儲存"

## ⚠️ 常见问题

### 问题 1: 文本显示为 defaultMessage

**原因**：i18n 文件中缺少对应的翻译键

**解决方法**：
1. 检查 JSON 文件中是否添加了该键
2. 检查键名是否拼写正确
3. 重启应用以重新加载 i18n 文件

### 问题 2: JSON 格式错误

**常见错误**：
```json
{
  "key1": "value1",
  "key2": "value2",  // ❌ 最后一行不要有逗号
}
```

**正确格式**：
```json
{
  "key1": "value1",
  "key2": "value2"  // ✅ 没有逗号
}
```

### 问题 3: 特殊字符转义

如果文本包含特殊字符，需要转义：

```json
{
  "smart_notebook.message_with_quote": "他说：\"你好\"",
  "smart_notebook.message_with_newline": "第一行\n第二行"
}
```

## 🎯 完整的多语言检查清单

### 代码层面

- [ ] 所有用户可见文本使用 `intl.formatMessage`
- [ ] 占位符文本使用多语言
- [ ] 按钮文本使用多语言
- [ ] 错误消息使用多语言
- [ ] 成功消息使用多语言
- [ ] 对话框标题使用多语言
- [ ] 对话框消息使用多语言

### i18n 文件层面

- [ ] en.json 包含所有翻译键
- [ ] zh-CN.json 包含所有翻译键
- [ ] zh-TW.json 包含所有翻译键
- [ ] JSON 格式正确（无多余逗号）
- [ ] 键名一致
- [ ] 翻译准确

### 测试层面

- [ ] 英文环境测试通过
- [ ] 简体中文环境测试通过
- [ ] 繁体中文环境测试通过
- [ ] 切换语言后文本正确更新
- [ ] 缺失翻译时显示 defaultMessage
- [ ] 特殊字符正确显示

## 📊 翻译对照表

| 键名 | 英文 | 简体中文 | 繁体中文 |
|------|------|---------|---------|
| enter_title | Enter Title | 请输入标题 | 請輸入標題 |
| enter_title_message | Your note doesn't have a title yet. Please enter a title: | 您的笔记还没有标题，请输入一个标题： | 您的筆記還沒有標題，請輸入一個標題： |
| untitled | Untitled | 无标题 | 無標題 |
| cancel | Cancel | 取消 | 取消 |
| save | Save | 保存 | 儲存 |
| success | Success | 成功 | 成功 |
| error | Error | 错误 | 錯誤 |

## 🚀 扩展语言

如果需要支持更多语言，参考以下翻译：

### 日文 (ja.json)
```json
{
  "smart_notebook.enter_title": "タイトルを入力",
  "smart_notebook.enter_title_message": "ノートにタイトルがありません。タイトルを入力してください：",
  "smart_notebook.untitled": "無題",
  "smart_notebook.cancel": "キャンセル",
  "smart_notebook.save": "保存"
}
```

### 韩文 (ko.json)
```json
{
  "smart_notebook.enter_title": "제목 입력",
  "smart_notebook.enter_title_message": "노트에 제목이 없습니다. 제목을 입력해주세요:",
  "smart_notebook.untitled": "제목 없음",
  "smart_notebook.cancel": "취소",
  "smart_notebook.save": "저장"
}
```

## 📚 相关文档

- **完整 i18n 翻译**: `/home/work/mattermost-mobile/SMART_NOTEBOOK_I18N.md`
- **标题对话框设计**: `/home/work/mattermost-mobile/SMART_NOTE_TITLE_DIALOG_DESIGN.md`
- **React Intl 文档**: https://formatjs.io/docs/react-intl/

## ✅ 实施总结

### 已完成

- [x] 设计多语言支持方案
- [x] 准备完整翻译（英文、简体中文、繁体中文）
- [x] 提供完整代码示例
- [x] 创建测试清单

### 待实施

- [ ] 将翻译添加到 i18n 文件
- [ ] 在代码中使用 intl.formatMessage
- [ ] 测试所有语言环境
- [ ] 修复发现的问题

---

**创建时间**: 2026-11-05  
**维护人员**: xq_mattermost_server  
**状态**: ✅ 方案完成，待实施  
**优先级**: 高（必须在发布前完成）
