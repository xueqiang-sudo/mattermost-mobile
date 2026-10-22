# IPA 合规检测完整修复指南

## 📋 问题清单

### ❌ 问题 1: 应用名称不一致

**现象：**
- 相机权限弹窗显示："**Dedalix**想要访问您的相机"
- 应该显示："**允知智构**想要访问您的相机"

**原因：**
- 英文 InfoPlist.strings 使用了 "Dedalix"
- 中文 InfoPlist.strings 使用了 "允知智构"
- 某些权限描述可能硬编码了应用名称

**修复：**
确保所有语言版本的权限描述使用 `$(PRODUCT_NAME)` 或正确的应用名称。

---

### ❌ 问题 2: 缺少账号注销功能

**App Store 要求：**
从 2022 年 6 月 30 日开始，提供账号创建的应用**必须**提供账号删除功能。

**当前状态：**
- ✅ 有"退出登录"功能
- ❌ 没有"删除账号"功能

**修复：**
需要添加账号注销/删除功能。

---

## 🔧 详细修复步骤

### 修复 1: 权限描述统一化

#### 已修复的文件（中文）
`ios/Optibot/i18n/zh-CN.lproj/InfoPlist.strings`

```
NSCameraUsageDescription = "用于拍摄照片发送消息、扫描二维码或进行视频通话。";
NSPhotoLibraryAddUsageDescription = "用于保存二维码图片和聊天中的照片到您的相册。";
NSPhotoLibraryUsageDescription = "用于选择照片发送消息或上传头像。";
NSMicrophoneUsageDescription = "用于发送语音消息和进行语音或视频通话。";
```

#### 需要检查的文件（其他语言）

**英文** `ios/Optibot/i18n/en.lproj/InfoPlist.strings`
- 当前使用 "Dedalix"
- 如果应用在国际市场发布，需要更新为 "Optibot" 或保持 "Dedalix"
- 权限描述已经比较清晰，可以保持

**其他语言文件列表：**
```
ios/Optibot/i18n/
├── de.lproj/InfoPlist.strings (德语)
├── es.lproj/InfoPlist.strings (西班牙语)
├── fr.lproj/InfoPlist.strings (法语)
├── it.lproj/InfoPlist.strings (意大利语)
├── ja.lproj/InfoPlist.strings (日语)
├── ko.lproj/InfoPlist.strings (韩语)
├── nl.lproj/InfoPlist.strings (荷兰语)
├── pl.lproj/InfoPlist.strings (波兰语)
├── pt-BR.lproj/InfoPlist.strings (葡萄牙语-巴西)
├── ru.lproj/InfoPlist.strings (俄语)
├── tr.lproj/InfoPlist.strings (土耳其语)
├── uk.lproj/InfoPlist.strings (乌克兰语)
├── zh-CN.lproj/InfoPlist.strings (简体中文) ✅ 已修复
└── zh-TW.lproj/InfoPlist.strings (繁体中文)
```

**建议：**
- 如果主要市场是中国，只需要修复中文即可
- 如果是国际市场，需要检查所有语言文件

---

### 修复 2: 添加账号注销功能

#### 方案 A: 完整的账号注销流程（推荐）

**1. 在"我"页面添加"注销账号"入口**

```typescript
// app/screens/account/index.tsx 或类似文件

const handleDeleteAccount = useCallback(async () => {
    Alert.alert(
        '注销账号',
        '注销后，您的所有数据将被删除且无法恢复。确定要注销吗？',
        [
            {text: '取消', style: 'cancel'},
            {
                text: '注销',
                style: 'destructive',
                onPress: async () => {
                    // 1. 显示确认对话框
                    // 2. 要求输入密码或验证码
                    // 3. 调用删除账号 API
                    // 4. 清除本地数据
                    // 5. 退出登录
                },
            },
        ],
    );
}, []);
```

**2. UI 设计**

在"退出登录"下方添加：

```
┌─────────────────────────────┐
│  退出登录                    │
└─────────────────────────────┘

┌─────────────────────────────┐
│  注销账号 (红色字体)          │
└─────────────────────────────┘
```

**3. 注销流程**

```
用户点击"注销账号"
    ↓
显示警告弹窗
"注销后，您的所有数据将被删除且无法恢复"
    ↓
用户确认
    ↓
要求身份验证（密码或验证码）
    ↓
调用后端 API: DELETE /api/v4/users/me
    ↓
等待后端处理（可能需要 24-72 小时）
    ↓
清除本地所有数据
    ↓
退出登录
    ↓
显示提示："账号注销申请已提交，将在 72 小时内完成"
```

**4. 后端 API（需要服务端支持）**

```typescript
// app/actions/remote/session.ts

export const deleteAccount = async (serverUrl: string) => {
    try {
        const client = await getAutoClient(serverUrl);
        // 调用 Mattermost API 删除用户
        await client.deleteUser('me');
        
        // 清除本地数据
        await DatabaseManager.destroyAllDatabases();
        await removeServerCredentials(serverUrl);
        
        return {success: true};
    } catch (error) {
        return {success: false, error};
    }
};
```

**5. App Store Connect 配置**

在 App Store Connect → App 隐私 → 隐私政策 URL 中，添加账号注销说明：

```
## 账号注销

您可以通过以下步骤注销您的账号：
1. 打开应用，进入"我"页面
2. 滑动到底部，点击"注销账号"
3. 按照提示完成注销流程

注意：
- 注销后，您的所有数据将被永久删除
- 注销申请将在 72 小时内完成
- 注销前请备份重要数据

如有问题，请联系：support@optibot.cn
```

#### 方案 B: 简化版本（仅联系方式）

如果后端暂不支持自动注销，可以提供联系方式：

```typescript
const handleDeleteAccount = useCallback(() => {
    Alert.alert(
        '注销账号',
        '如需注销账号，请联系客服：\n\n邮箱：support@optibot.cn\n电话：xxx-xxxx-xxxx\n\n我们将在 72 小时内处理您的请求。',
        [{text: '确定'}],
    );
}, []);
```

**优点：**
- 快速实现
- 满足 App Store 基本要求

**缺点：**
- 用户体验不佳
- 需要人工处理

---

## 📱 账号注销 UI 实现

### 在"我"页面添加

```typescript
// app/screens/my_account/index.tsx

<View style={styles.container}>
    {/* 现有菜单项 */}
    <MenuItem
        title="我的资料"
        onPress={handleProfile}
    />
    <MenuItem
        title="设定"
        onPress={handleSettings}
    />
    <MenuItem
        title="关于"
        onPress={handleAbout}
    />
    
    {/* 退出登录 */}
    <Button
        title="退出登录"
        onPress={handleLogout}
        style={styles.logoutButton}
    />
    
    {/* 新增：注销账号 */}
    <TouchableOpacity
        onPress={handleDeleteAccount}
        style={styles.deleteAccountButton}
    >
        <Text style={styles.deleteAccountText}>
            注销账号
        </Text>
    </TouchableOpacity>
</View>

const styles = StyleSheet.create({
    deleteAccountButton: {
        marginTop: 16,
        padding: 12,
        alignItems: 'center',
    },
    deleteAccountText: {
        color: '#FF3B30', // 红色
        fontSize: 14,
    },
});
```

---

## ✅ 验证清单

### 权限描述验证

- [ ] 打开应用，触发所有权限弹窗
- [ ] 确认显示"允知智构"而不是"Dedalix"
- [ ] 确认描述清晰、简洁

**测试步骤：**
1. 相机权限：聊天 → 点击 ➕ → 拍照
2. 照片读取：聊天 → 点击 ➕ → 相册
3. 照片保存：二维码页面 → 保存到相册
4. 麦克风：聊天 → 长按语音按钮

### 账号注销验证

- [ ] "我"页面有"注销账号"入口
- [ ] 点击后显示警告弹窗
- [ ] 用户确认后执行注销流程
- [ ] 注销成功后清除所有本地数据
- [ ] 返回登录页面

---

## 🚀 提交 App Store 前的最终检查

### 1. 权限描述

- [x] 中文权限描述已优化
- [ ] 检查其他语言（如果需要）
- [ ] 测试所有权限弹窗

### 2. 账号注销

- [ ] 添加"注销账号"功能
- [ ] 测试注销流程
- [ ] 更新隐私政策
- [ ] 在 App Store Connect 说明注销方式

### 3. 其他合规项

- [ ] 年龄分级设置正确
- [ ] App Privacy Details 填写完整
- [ ] 隐私政策 URL 有效
- [ ] 出口合规信息已确认

### 4. 元数据

- [ ] 应用描述完整
- [ ] 截图上传（至少 5 张）
- [ ] 关键词已填写
- [ ] 支持 URL 有效

---

## 📞 App Store 审核备注

提交审核时，添加说明：

```
尊敬的审核团队：

本次更新主要改进：

1. 优化权限描述
   - 更清晰、更简洁的中文权限说明
   - 移除了硬编码的应用名称

2. 添加账号注销功能
   - 用户可以在"我"页面底部找到"注销账号"入口
   - 提供完整的账号删除流程
   - 符合 App Store 审核指南 5.1.1(v)

测试账户：
用户名：demo@optibot.cn
密码：Demo123456

如有问题，请联系：
developer@optibot.cn
xxx-xxxx-xxxx

谢谢！
```

---

## ⏱ 时间估算

### 修复权限描述
- 修改文件：30 分钟
- 测试验证：30 分钟
- 重新编译上传：15-30 分钟
- **总计：约 1.5 小时**

### 添加账号注销功能

**方案 A（完整流程）：**
- UI 开发：2-3 小时
- 后端 API：2-4 小时
- 测试：1-2 小时
- **总计：约 1-2 天**

**方案 B（简化版本）：**
- UI 开发：30 分钟
- 测试：30 分钟
- **总计：约 1 小时**

---

## 🎯 优先级建议

### 高优先级（立即修复）
1. ✅ 权限描述中文优化（已完成）
2. ⚠️ 修复应用名称显示问题
3. ⚠️ 添加账号注销功能（至少简化版本）

### 中优先级（后续优化）
1. 完善账号注销流程（完整版本）
2. 检查其他语言的权限描述
3. 优化用户体验

### 低优先级（可选）
1. 添加更多语言支持
2. 国际化优化

---

## 📝 重要提示

1. **权限描述**
   - 必须清晰说明用途
   - 不能包含营销语言
   - 不能过于模糊

2. **账号注销**
   - App Store 强制要求
   - 必须在隐私政策中说明
   - 必须在 72 小时内完成删除

3. **应用名称**
   - 使用 `$(PRODUCT_NAME)` 变量
   - 避免硬编码
   - 保持所有语言一致

---

## 🔗 相关资源

- [App Store 审核指南](https://developer.apple.com/app-store/review/guidelines/)
- [账号注销要求](https://developer.apple.com/app-store/review/guidelines/#5.1.1)
- [权限描述最佳实践](https://developer.apple.com/design/human-interface-guidelines/patterns/privacy)

---

**下一步：**
1. 重新编译并上传（修复权限描述）
2. 添加账号注销功能（至少简化版本）
3. 提交 App Store 审核

祝发布顺利！🚀
