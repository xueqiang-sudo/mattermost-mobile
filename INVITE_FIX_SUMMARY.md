# 邀请链接问题修复总结

## 已修复的问题

### 1. 标题重复 ✅
**问题：** 页面显示两个"通过邀请链接加入"标题
- 导航栏标题
- 页面内 header 标题

**修复：** 移除了页面内的 header 部分，只保留导航栏标题

**文件：** `app/screens/invite_link/index.tsx`

### 2. 输入清理功能 ✅
**问题：** 从微信等应用粘贴的内容可能包含隐藏字符（零宽空格、不间断空格等）

**修复：** 在 `handleInputChange` 中添加了清理逻辑：
```typescript
const cleaned = text
    .replace(/[-‍﻿]/g, '')  // 零宽字符
    .replace(/ /g, ' ')                 // 不间断空格 → 普通空格
    .replace(/\s+/g, ' ')                    // 多个空格 → 单个空格
    .trim();
```

**文件：** `app/screens/invite_link/index.tsx`

### 3. NetworkManager 未定义 ✅
**问题：** `NetworkManager.getClient()` 调用失败

**修复：** 改用 `await getAutoClient(serverUrl)`

**文件：** `app/screens/login/phone_form.tsx`

### 4. 详细的 Debug 日志 ✅
**添加位置：**
- `parseInviteFromUrl` - 解析过程
- `handleInputChange` - 输入变化（清理前后）
- `handleConfirm` - 确认按钮点击
- `phone_form.tsx` - 登录后处理

**文件：**
- `app/screens/invite_link/index.tsx`
- `app/screens/login/phone_form.tsx`
- `app/utils/deep_link/index.ts`

### 5. 测试按钮 ✅
**功能：** 点击后自动填入测试链接

**文件：** `app/screens/invite_link/index.tsx`

## 提交记录

```
37bd1bd 去掉邀请链接页面的重复标题
dd59ac8 修复邀请链接处理：添加输入清理和详细日志
```

## 下一步操作

### 1. 推送到 GitHub
```bash
git push origin main
```

### 2. 等待 GitHub Actions 打包
- 查看 Actions 运行状态
- 下载新的 APK/IPA

### 3. 安装新版本
- 卸载旧版本
- 安装新版本

### 4. 测试流程

#### 步骤 1: 打开邀请链接页面
```
登录页面 → "有邀请链接？点击这里"
```

#### 步骤 2: 输入邀请链接
```
https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw
```

**预期结果：**
- ✅ 只有一个标题（导航栏）
- ✅ 输入框显示清理后的链接
- ✅ 显示绿色提示："✅ Invite recognized, tap confirm to continue"

#### 步骤 3: 点击确认
**预期结果：**
- ✅ 返回登录页面
- ✅ Debug 日志显示邀请信息已存储

#### 步骤 4: 登录
**预期结果：**
- ✅ Debug 日志显示：
  ```
  [Login] Checking pending invite info after login
  [Login] Pending invite info {"hasPendingInvite":true,"invitedBy":"..."}
  [Login] Calling acceptInvitation API
  [Login] Successfully accepted contact invitation
  ```

#### 步骤 5: 验证结果
- ✅ A 的外部联系人列表中有 B
- ✅ B 的外部联系人列表中有 A
- ✅ 双方会话列表中有 GM 频道

## Debug 日志查看

### 预期的完整日志

**邀请链接页面：**
```
[InviteLink] Input changed (before cleaning)
{
  "originalText": "https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw",
  "cleanedText": "https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw",
  "hasChanged": false
}

[parseInviteFromUrl] Input {...}
[parseInviteFromUrl] Extracted params
{
  "id": "",
  "type": "",
  "invited_by": "npxp3ccyrbybieqhc535rgmxnw"
}
[parseInviteFromUrl] Returning valid result {...}

[InviteLink] Input changed (after cleaning)
{
  "text": "https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw",
  "result": {
    "id": "",
    "type": "",
    "invited_by": "npxp3ccyrbybieqhc535rgmxnw"
  },
  "isValid": true
}
```

**点击确认：**
```
[InviteLink] Confirm clicked {...}
[InviteLink] Parsing invite URL {...}
[InviteLink] Stored invite info {...}
```

**登录后：**
```
[Login] Checking pending invite info after login
[Login] Pending invite info {"hasPendingInvite":true,"invitedBy":"..."}
[Login] Processing invite after login {...}
[Login] Calling acceptInvitation API {"invitedBy":"..."}
[Login] Successfully accepted contact invitation {"invitedBy":"..."}
```

## 如果仍然失败

### 检查点 1: 输入是否被正确识别

**查看日志：**
```
[InviteLink] Input changed (after cleaning)
{
  "result": ???,
  "isValid": ???
}
```

**预期：**
- `result` 应该包含 `invited_by: "npxp3ccyrbybieqhc535rgmxnw"`
- `isValid` 应该是 `true`

**如果 `result` 是 `null` 或 `isValid` 是 `false`：**
- 截图完整的日志
- 检查 `originalText` 和 `cleanedText` 是否一致
- 检查是否有特殊的错误信息

### 检查点 2: acceptInvitation 是否成功

**查看日志：**
```
[Login] Calling acceptInvitation API {...}
[Login] Successfully accepted contact invitation {...}
```

**如果失败：**
- 查看具体错误信息
- 常见错误：
  - "No pending invitation found" → 让 A 重新生成邀请链接
  - "Self invite not allowed" → A 和 B 不能是同一用户
  - "Unauthorized" → 用户未登录或 session 过期

### 检查点 3: 联系人关系是否建立

**服务端验证：**
```sql
-- 检查邀请记录
SELECT * FROM contact_invitations
WHERE inviter_id = 'A的用户ID'
  AND status = 'accepted'
ORDER BY create_at DESC;

-- 检查联系人记录
SELECT * FROM employee_contacts
WHERE (employee_id = 'A的用户ID' AND contact_id = 'B的用户ID')
   OR (employee_id = 'B的用户ID' AND contact_id = 'A的用户ID');
```

## 测试按钮

如果手动输入仍然失败，可以点击 **"🧪 Test Invite Link"** 按钮：
- 自动填入测试链接
- 跳过复制粘贴环节
- 验证解析逻辑是否正常

**如果测试按钮有效，但手动输入失败：**
- 说明是复制粘贴的问题
- 检查复制来源（微信、浏览器等）
- 尝试在不同的应用中复制链接

## 文件清单

修改的文件：
- ✅ `app/screens/invite_link/index.tsx` - 邀请链接页面
- ✅ `app/screens/login/phone_form.tsx` - 登录表单
- ✅ `app/utils/deep_link/index.ts` - Deep link 处理
- ✅ `app/client/rest/users.ts` - API 客户端
- ✅ `types/launch/index.ts` - 类型定义

## 总结

本次修复主要包括：
1. **UI 优化** - 去掉重复标题
2. **输入清理** - 自动去除隐藏字符
3. **Bug 修复** - 修复 NetworkManager 未定义
4. **调试支持** - 添加详细的 debugLog

请推送代码并重新打包测试！🚀
