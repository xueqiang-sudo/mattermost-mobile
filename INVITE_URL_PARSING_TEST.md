# 邀请链接解析问题诊断

## 问题描述
输入邀请链接后提示"无法识别邀请链接"

```
https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw
```

## 已添加的调试日志

在 `parseInviteFromUrl` 函数中添加了详细的 debugLog：

```
[parseInviteFromUrl] Input {...}
[parseInviteFromUrl] Parsing URL {...}
[parseInviteFromUrl] Extracted params {...}
[parseInviteFromUrl] Returning valid result {...}
```

## 测试步骤

### 1. 重新构建 App
```bash
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/
```

### 2. 清空 Debug 日志

### 3. 操作流程
1. 打开 App → 登录页面
2. 点击 "有邀请链接？点击这里"
3. 粘贴邀请链接：
   ```
   https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw
   ```
4. 点击 "确认"

### 4. 查看 Debug 日志

**预期的日志（成功）：**
```
[parseInviteFromUrl] Input
{
  "input": "https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw",
  "trimmed": "https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw"
}

[parseInviteFromUrl] Parsing URL
{
  "urlStr": "https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw"
}

[parseInviteFromUrl] Extracted params
{
  "id": "",
  "type": "",
  "invited_by": "npxp3ccyrbybieqhc535rgmxnw"
}

[parseInviteFromUrl] Returning valid result
{
  "id": "",
  "type": "",
  "invited_by": "npxp3ccyrbybieqhc535rgmxnw"
}

[InviteLink] Confirm clicked {...}

[InviteLink] Parsing invite URL
{
  "inputValue": "https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw",
  "result": {
    "id": "",
    "type": "",
    "invited_by": "npxp3ccyrbybieqhc535rgmxnw"
  }
}

[InviteLink] Stored invite info
{
  "inviteId": "",
  "inviteType": "",
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw"
}
```

## 可能的问题

### 问题 A: URL 解析失败

**日志：**
```
[parseInviteFromUrl] URL parsing failed
{
  "error": "TypeError: Invalid URL"
}
```

**原因：** URL 格式不正确

**解决：**
- 确保链接完整：`https://ai.optibot.cn:8065/invite?invited_by=xxx`
- 检查是否有特殊字符或空格

### 问题 B: invited_by 参数未被识别

**日志：**
```
[parseInviteFromUrl] Extracted params
{
  "id": "",
  "type": "",
  "invited_by": ""  ← 这里是空的！
}

[parseInviteFromUrl] No id or invited_by found
```

**原因：** URL 参数名称不正确

**检查：**
- 确认参数名是 `invited_by`（不是 `invitedBy` 或其他）
- 确认链接中有 `?invited_by=xxx` 部分

### 问题 C: 输入值不是预期的链接

**日志：**
```
[InviteLink] Confirm clicked
{
  "inputValue": "某个其他值",  ← 这里不是预期的链接
  "inputValueLength": 10
}
```

**原因：** 输入框中的值不是你粘贴的链接

**检查：**
- 确认粘贴后输入框显示的是完整链接
- 确认没有意外清空或修改

### 问题 D: handleInputChange 没有被调用

**日志：**
没有 `[parseInviteFromUrl] Input` 日志

**原因：** 输入事件没有触发

**检查：**
- 确认输入框的 `onChangeText` 事件绑定正确
- 尝试手动输入而不是粘贴

## 手动测试

你可以在 JavaScript 控制台中测试这个函数：

```javascript
function parseInviteFromUrl(input) {
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    try {
        const urlStr = trimmed.startsWith('http') ? trimmed : `https://placeholder${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
        const url = new URL(urlStr);
        const id = url.searchParams.get('id') || url.searchParams.get('invite_id') || url.searchParams.get('iid') || '';
        const type = url.searchParams.get('type') || '';
        const invited_by = url.searchParams.get('invited_by') || '';
        if (id || invited_by) {
            return {id, type, invited_by};
        }
    } catch {
        // Not a valid URL
    }

    if (/^[a-z0-9]+$/i.test(trimmed)) {
        return {id: trimmed, type: '', invited_by: ''};
    }

    return null;
}

// 测试你的链接
const result = parseInviteFromUrl('https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw');
console.log(result);
// 预期输出: {id: "", type: "", invited_by: "npxp3ccyrbybieqhc535rgmxnw"}
```

## 临时解决方案

如果仍然无法识别，你可以尝试：

### 方式 1: 只输入 invited_by 的值
```
npxp3ccyrbybieqhc535rgmxnw
```

这会被当作 `id` 处理，但仍然可以工作。

### 方式 2: 使用不同格式的链接
```
/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw
```

或者

```
invite?invited_by=npxp3ccyrbybieqhc535rgmxnw
```

## 下一步

1. ✅ **重新构建 App**
2. ✅ **清空 Debug 日志**
3. ✅ **按照流程操作**
4. ✅ **查看 Debug 日志**
5. ✅ **截图或导出日志发给我**

特别关注以下日志：
- `[parseInviteFromUrl] Extracted params` → 查看 `invited_by` 是否被正确提取
- `[InviteLink] Confirm clicked` → 查看 `inputValue` 是否是你输入的链接

这样我就能准确定位问题了！
