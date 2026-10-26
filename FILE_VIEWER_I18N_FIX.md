# 文件预览页面多语言支持修复

## 问题描述

用户反馈：点击知识库或云盘的 Office 文档后，显示的页面全是英文，不支持多语言：

- "This file type cannot be previewed"
- "You can download it and open with another app"
- "Download" 按钮
- "Open with" 按钮

需要支持以下三种语言：
- English (en)
- 中文简体 (zh-CN)
- 中文繁体 (zh-TW)

## 修复的文件

### 1. 组件文件（已支持多语言）

以下组件已经正确使用了 `intl.formatMessage`，只需要在语言文件中添加翻译即可：

#### `app/screens/unified_file_viewer/unsupported_view.tsx`

```typescript
<Text style={styles.message}>
    {intl.formatMessage({
        id: 'file_viewer.unsupported',
        defaultMessage: 'This file type cannot be previewed',
    })}
</Text>
<Text style={styles.submessage}>
    {intl.formatMessage({
        id: 'file_viewer.unsupported_subtitle',
        defaultMessage: 'You can download it and open with another app',
    })}
</Text>
<Text style={styles.secondaryButtonText}>
    {intl.formatMessage({
        id: 'file_viewer.download',
        defaultMessage: 'Download',
    })}
</Text>
<Text style={styles.primaryButtonText}>
    {intl.formatMessage({
        id: 'file_viewer.open_with',
        defaultMessage: 'Open with',
    })}
</Text>
```

#### `app/screens/unified_file_viewer/converting_view.tsx`

```typescript
<Text style={styles.text}>
    {intl.formatMessage({
        id: 'file.converting',
        defaultMessage: 'Converting document...',
    })}
</Text>
<Text style={styles.subtext}>
    {intl.formatMessage({
        id: 'file_viewer.converting_subtitle',
        defaultMessage: 'Please wait, preview will be available soon',
    })}
</Text>
```

### 2. 语言文件（添加翻译）

#### `assets/base/i18n/en.json` (English)

```json
"file.converting": "Converting document...",
"file_viewer.converting_subtitle": "Please wait, preview will be available soon",
"file_viewer.unsupported": "This file type cannot be previewed",
"file_viewer.unsupported_subtitle": "You can download it and open with another app",
"file_viewer.download": "Download",
"file_viewer.open_with": "Open with",
```

#### `assets/base/i18n/zh-CN.json` (中文简体)

```json
"file.converting": "正在转换文档...",
"file_viewer.converting_subtitle": "请稍候，预览即将可用",
"file_viewer.unsupported": "此文件类型无法预览",
"file_viewer.unsupported_subtitle": "您可以下载后用其他应用打开",
"file_viewer.download": "下载",
"file_viewer.open_with": "用其他应用打开",
```

#### `assets/base/i18n/zh-TW.json` (中文繁体)

```json
"file.converting": "正在轉換文件...",
"file_viewer.converting_subtitle": "請稍候，預覽稍後即可使用",
"file_viewer.unsupported": "此文件類型無法預覽",
"file_viewer.unsupported_subtitle": "您可以下載後用其他應用打開",
"file_viewer.download": "下載",
"file_viewer.open_with": "用其他應用打開",
```

## 翻译对照表

| 翻译键 | English | 中文简体 | 中文繁体 |
|--------|---------|---------|---------|
| `file.converting` | Converting document... | 正在转换文档... | 正在轉換文件... |
| `file_viewer.converting_subtitle` | Please wait, preview will be available soon | 请稍候，预览即将可用 | 請稍候，預覽稍後即可使用 |
| `file_viewer.unsupported` | This file type cannot be previewed | 此文件类型无法预览 | 此文件類型無法預覽 |
| `file_viewer.unsupported_subtitle` | You can download it and open with another app | 您可以下载后用其他应用打开 | 您可以下載後用其他應用打開 |
| `file_viewer.download` | Download | 下载 | 下載 |
| `file_viewer.open_with` | Open with | 用其他应用打开 | 用其他應用打開 |

## 影响的页面

### 1. 转换中页面 (ConvertingView)

当用户点击 Office 文档时，系统会先将文档转换为 PDF，此时显示"正在转换"页面：

```
┌─────────────────────────────────────┐
│                                     │
│         [文件图标]                   │
│                                     │
│       document.docx                 │
│                                     │
│          ⟳ (转圈动画)               │
│                                     │
│   English: Converting document...   │
│   中文简体: 正在转换文档...          │
│   中文繁体: 正在轉換文件...          │
│                                     │
│   English: Please wait, preview     │
│            will be available soon   │
│   中文简体: 请稍候，预览即将可用     │
│   中文繁体: 請稍候，預覽稍後即可使用 │
│                                     │
└─────────────────────────────────────┘
```

### 2. 不支持预览页面 (UnsupportedView)

当文件类型无法预览时（如某些特殊格式），显示此页面：

```
┌─────────────────────────────────────┐
│                                     │
│         [文件图标]                   │
│                                     │
│       document.xyz                  │
│        1.2 MB                       │
│                                     │
│   English: This file type cannot    │
│            be previewed             │
│   中文简体: 此文件类型无法预览       │
│   中文繁体: 此文件類型無法預覽       │
│                                     │
│   English: You can download it and  │
│            open with another app    │
│   中文简体: 您可以下载后用其他应用   │
│            打开                     │
│   中文繁体: 您可以下載後用其他應用   │
│            打開                     │
│                                     │
│   ┌─────────┐  ┌─────────┐         │
│   │ Download│  │Open with│         │
│   │  下载   │  │用其他应用│         │
│   │  下載   │  │用其他應用│         │
│   └─────────┘  └─────────┘         │
│                                     │
└─────────────────────────────────────┘
```

## 验证步骤

### 1. 测试中文简体

- [ ] 将设备/应用语言设置为中文简体
- [ ] 进入知识库或云盘
- [ ] 点击一个 Office 文档
- [ ] **预期**：
  - 转换页面显示"正在转换文档..."
  - 如果无法预览，显示"此文件类型无法预览"
  - 按钮显示"下载"和"用其他应用打开"

### 2. 测试中文繁体

- [ ] 将设备/应用语言设置为中文繁体
- [ ] 进入知识库或云盘
- [ ] 点击一个 Office 文档
- [ ] **预期**：
  - 转换页面显示"正在轉換文件..."
  - 如果无法预览，显示"此文件類型無法預覽"
  - 按钮显示"下載"和"用其他應用打開"

### 3. 测试英文

- [ ] 将设备/应用语言设置为英文
- [ ] 进入知识库或云盘
- [ ] 点击一个 Office 文档
- [ ] **预期**：
  - 转换页面显示"Converting document..."
  - 如果无法预览，显示"This file type cannot be previewed"
  - 按钮显示"Download"和"Open with"

## 技术细节

### `react-intl` 多语言机制

应用使用 `react-intl` 库实现多语言支持：

```typescript
import {useIntl} from 'react-intl';

const Component = () => {
    const intl = useIntl();
    
    return (
        <Text>
            {intl.formatMessage({
                id: 'translation.key',
                defaultMessage: 'Default text if translation not found',
            })}
        </Text>
    );
};
```

### 语言文件加载流程

1. **应用启动** → 检测设备语言
2. **加载语言文件** → 根据设备语言加载对应的 JSON 文件
3. **渲染组件** → 组件调用 `intl.formatMessage`
4. **查找翻译** → 在语言文件中查找对应的 `id`
5. **显示文本** → 如果找到翻译则显示，否则显示 `defaultMessage`

### 语言文件位置

```
assets/
└── base/
    └── i18n/
        ├── en.json       # English
        ├── zh-CN.json    # 中文简体
        └── zh-TW.json    # 中文繁体
```

## 相关文件

### 组件文件

- `app/screens/unified_file_viewer/unsupported_view.tsx` - 不支持预览页面
- `app/screens/unified_file_viewer/converting_view.tsx` - 转换中页面
- `app/screens/unified_file_viewer/unified_file_viewer.tsx` - 统一文件查看器主组件

### 语言文件

- `assets/base/i18n/en.json` - 英文翻译
- `assets/base/i18n/zh-CN.json` - 中文简体翻译
- `assets/base/i18n/zh-TW.json` - 中文繁体翻译

### 相关文件

- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 知识库页面
- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘页面
- `app/hooks/files.ts` - 文件下载和预览 Hook

## 常见问题

### Q1: 为什么之前显示英文？

**A**: 组件代码中已经使用了 `intl.formatMessage`，但语言文件中缺少对应的翻译键（`file_viewer.unsupported`、`file_viewer.download` 等），所以回退到了 `defaultMessage`（英文）。

### Q2: 如何添加新的语言支持？

**A**: 
1. 在 `assets/base/i18n/` 目录下创建新的语言文件（如 `ja.json`）
2. 翻译所有需要的键值对
3. 应用会根据设备语言自动加载对应的语言文件

### Q3: 如果翻译缺失会怎样？

**A**: 会显示 `defaultMessage` 中的文本（通常是英文）。

### Q4: 如何测试不同的语言？

**A**: 
1. 在设备设置中更改语言
2. 或者在应用中添加语言切换功能
3. 或者临时修改代码强制加载特定语言文件

## 扩展翻译

如果需要添加更多语言的翻译，请按照以下格式添加到对应的语言文件：

### 日语 (ja.json)

```json
"file.converting": "ドキュメントを変換中...",
"file_viewer.converting_subtitle": "お待ちください、まもなくプレビューが表示されます",
"file_viewer.unsupported": "このファイル形式はプレビューできません",
"file_viewer.unsupported_subtitle": "ダウンロードして他のアプリで開くことができます",
"file_viewer.download": "ダウンロード",
"file_viewer.open_with": "他のアプリで開く",
```

### 韩语 (ko.json)

```json
"file.converting": "문서 변환 중...",
"file_viewer.converting_subtitle": "잠시만 기다려주세요. 곧 미리보기를 사용할 수 있습니다",
"file_viewer.unsupported": "이 파일 형식은 미리볼 수 없습니다",
"file_viewer.unsupported_subtitle": "다운로드하여 다른 앱으로 열 수 있습니다",
"file_viewer.download": "다운로드",
"file_viewer.open_with": "다른 앱으로 열기",
```

## 性能影响

- **无性能影响**：翻译文件在应用启动时加载一次
- **内存影响小**：每个语言文件约 100-200 KB
- **不影响渲染**：翻译查找是 O(1) 的哈希表查找

## 安全性

- ✅ **安全**：所有翻译都是静态文本
- ✅ **无风险**：不包含用户输入或动态内容
- ✅ **合规**：符合数据保护要求

## 后续改进建议

### 1. 添加翻译完整性检查

创建脚本检查所有语言文件是否包含相同的翻译键：

```javascript
// scripts/check-i18n.js
const fs = require('fs');

const languages = ['en', 'zh-CN', 'zh-TW'];
const files = languages.map(lang => 
    JSON.parse(fs.readFileSync(`assets/base/i18n/${lang}.json`, 'utf8'))
);

const enKeys = Object.keys(files[0]);
const missing = {};

languages.slice(1).forEach((lang, index) => {
    const langKeys = Object.keys(files[index + 1]);
    const missingKeys = enKeys.filter(key => !langKeys.includes(key));
    if (missingKeys.length > 0) {
        missing[lang] = missingKeys;
    }
});

if (Object.keys(missing).length > 0) {
    console.error('Missing translations:', missing);
    process.exit(1);
}
```

### 2. 添加自动翻译 API

集成自动翻译服务（如 Google Translate API）来快速生成初始翻译，然后人工校对。

### 3. 添加翻译管理工具

使用翻译管理平台（如 Crowdin、Transifex）来管理翻译工作流。

## 测试用例

### 测试场景 1：Office 文档转换

```
Given: 用户点击 Office 文档
When: 文档正在转换为 PDF
Then:
  - 显示转换中页面
  - 文本使用正确的语言
  - 用户可以理解当前状态
```

### 测试场景 2：不支持的文件类型

```
Given: 用户点击不支持的文件类型
When: 无法预览该文件
Then:
  - 显示不支持页面
  - 文本使用正确的语言
  - 用户可以下载或用其他应用打开
```

### 测试场景 3：语言切换

```
Given: 用户更改了应用语言
When: 重新打开文件预览
Then:
  - 显示新语言的文本
  - 所有按钮和提示都正确翻译
```

---

**修复日期**: 2026-10-26  
**修复人员**: Claude Code  
**测试状态**: 待测试  
**修复类型**: 多语言支持  
**影响范围**: 文件预览页面（知识库、云盘）  
**严重程度**: 中（影响用户体验）  
**修复文件数**: 3（语言文件）  
**新增翻译键**: 6  
