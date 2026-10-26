# 云盘上传按钮崩溃修复

## 问题描述

用户点击云盘页面的"上传"按钮后，应用崩溃并显示错误：

```
undefined is not a function
TypeError: undefined is not a function
at anonymous (main.jsbundle:813461:53)
at _performTransitionSideEffects (main.jsbundle:29242:22)
at _receiveSignal (main.jsbundle:29198:45)
at onResponderRelease (main.jsbundle:29066:34)
```

## 问题分析

### 根本原因

**导入路径错误**：`cloud_drive_screen.tsx` 从错误的路径导入了 `showModal` 函数。

### 错误代码

**文件**: `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` (第 27 行)

```typescript
import {openUnifiedFileViewer, showModal} from '@utils/navigation';
//                                          ^^^^^^^^^^^^^^^^^^
//                                          ❌ 错误的导入路径
```

### 为什么崩溃？

1. `@utils/navigation/index.ts` 导入了 `showModal`：
   ```typescript
   import {goToScreen, showModal} from '@screens/navigation';
   ```

2. 但 `@utils/navigation/index.ts` **没有重新导出** `showModal`

3. 所以 `cloud_drive_screen.tsx` 导入的 `showModal` 是 `undefined`

4. 当用户点击上传按钮时，调用 `showModal(...)` 相当于调用 `undefined(...)`

5. 导致 `TypeError: undefined is not a function` 崩溃

### 正确的导入方式

所有其他文件都从 `@screens/navigation` 导入 `showModal`：

```typescript
// ✅ 正确的导入方式（来自其他文件）
import {dismissBottomSheet, showModal} from '@screens/navigation';
```

## 修复方案

### 修复代码

**文件**: `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`

```typescript
// 修复前 ❌
import {openUnifiedFileViewer, showModal} from '@utils/navigation';

// 修复后 ✅
import {openUnifiedFileViewer} from '@utils/navigation';
import {showModal} from '@screens/navigation';
```

### 修复说明

1. 将 `showModal` 的导入从 `@utils/navigation` 改为 `@screens/navigation`
2. 保持 `openUnifiedFileViewer` 从 `@utils/navigation` 导入（这个函数确实在那里导出）

## 验证步骤

### 1. 重新构建应用

```bash
cd /home/work/mattermost-mobile
cd ios && pod install && cd ..
npx react-native run-ios
```

### 2. 测试上传功能

- [ ] 进入云盘页面
- [ ] 点击"上传"按钮
- [ ] 选择文件
- [ ] 确认上传

### 3. 预期结果

- ✅ 点击"上传"按钮后，显示文件选择器
- ✅ 选择文件后，文件开始上传
- ✅ 上传成功后，文件列表刷新
- ✅ 不再出现崩溃

## 相关文件

### 修改的文件

1. ✅ `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 修复导入路径

### 相关文件

- `app/utils/navigation/index.ts` - 导出 `openUnifiedFileViewer` 但不导出 `showModal`
- `app/screens/navigation.ts` - 导出 `showModal` 函数
- `app/screens/home/apps/workbench_api.ts` - 导出 `uploadDriveFile` 函数

## 代码对比

### showModal 函数定义

**文件**: `app/screens/navigation.ts`

```typescript
export function showModal(
    name: string,
    title: string,
    passProps?: any,
    options?: Options,
) {
    Navigation.showModal({
        stack: {
            children: [{
                component: {
                    name,
                    passProps,
                    options: {
                        topBar: {
                            title: {
                                text: title,
                            },
                        },
                        ...options,
                    },
                },
            }],
        },
    });
}
```

### 上传功能实现

**文件**: `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`

```typescript
// ── Open file picker ──
const onOpenFilePicker = useCallback(() => {
    showModal(  // ← 现在 showModal 不再是 undefined
        Screens.FILE_PICKER,
        intl.formatMessage({id: 'workbench.drive.upload_title', defaultMessage: 'Upload Files'}),
        {
            onSend: onUploadFiles,
            channelId: '', // Not needed for cloud drive uploads
        },
    );
}, [onUploadFiles, intl]);
```

### uploadDriveFile API

**文件**: `app/screens/home/apps/workbench_api.ts`

```typescript
export async function uploadDriveFile(
    serverUrl: string,
    teamId: string,
    parentId: string,
    scope: string,
    fileUri: string,
    fileName: string,
    fileType: string,
): Promise<DriveFile> {
    const client = NetworkManager.getClient(serverUrl);
    const formData = new FormData();
    formData.append('parent_id', parentId);
    formData.append('scope', scope);
    formData.append('files', {
        uri: fileUri,
        name: fileName,
        type: fileType,
    } as any);

    const resp = await client.doFetch(
        `/api/v4/teams/${teamId}/drive/files`,
        {method: 'post', body: formData},
    );
    if (!resp.ok) {
        throw new Error(resp.error || 'Upload failed');
    }
    const files = resp.data || resp;
    return Array.isArray(files) ? files[0] : files;
}
```

## 其他检查

### 检查是否有其他文件有相同问题

```bash
grep -rn "from '@utils/navigation'" /home/work/mattermost-mobile/app \
  --include="*.tsx" --include="*.ts" | grep "showModal" | grep -v test
```

**结果**: (0 rows) - 没有其他文件有相同问题 ✅

### 检查 showModal 的正确导入方式

```bash
grep -rn "import.*showModal" /home/work/mattermost-mobile/app \
  --include="*.tsx" --include="*.ts" | grep -v "test\|node_modules" | head -15
```

**结果**: 所有其他文件都从 `@screens/navigation` 导入 ✅

## 性能影响

- **修复前**: 应用崩溃，无法上传文件
- **修复后**: 正常显示文件选择器，可以上传文件
- **性能影响**: 无

## 安全性

- ✅ **安全**: 修复只是修正了导入路径
- ✅ **无副作用**: 不影响其他功能
- ✅ **向后兼容**: 不改变 API 接口

## 测试用例

### 测试场景 1: 上传单个文件

```
Given: 用户在云盘页面
When: 点击"上传"按钮
Then:
  - 显示文件选择器
  - 选择一个文件
  - 文件开始上传
  - 上传成功后，文件列表刷新
  - 新文件出现在列表中
```

### 测试场景 2: 上传多个文件

```
Given: 用户在云盘页面
When: 点击"上传"按钮
Then:
  - 显示文件选择器
  - 选择多个文件
  - 文件依次上传
  - 所有文件上传成功后，文件列表刷新
  - 所有新文件出现在列表中
```

### 测试场景 3: 取消上传

```
Given: 用户在云盘页面
When: 点击"上传"按钮
Then:
  - 显示文件选择器
  - 点击取消
  - 文件选择器关闭
  - 不上传任何文件
  - 文件列表不变
```

## 总结

### 问题

- ❌ 云盘上传按钮点击后崩溃
- ❌ 错误: `TypeError: undefined is not a function`

### 原因

- ❌ `showModal` 从错误的路径导入
- ❌ `@utils/navigation` 没有导出 `showModal`
- ❌ 导入的 `showModal` 是 `undefined`

### 修复

- ✅ 将 `showModal` 的导入从 `@utils/navigation` 改为 `@screens/navigation`
- ✅ 保持 `openUnifiedFileViewer` 从 `@utils/navigation` 导入

### 验证

- ⏳ 重新构建应用
- ⏳ 测试上传功能
- ⏳ 确认不再崩溃

---

**修复日期**: 2026-10-26  
**修复人员**: Claude Code  
**测试状态**: ⏳ 待验证  
**修复类型**: Bug 修复（应用崩溃）  
**影响范围**: 云盘页面  
**严重程度**: 高（功能不可用）  
**修复文件数**: 1  
**状态**: ✅ 完成  
