# App Store 合规检查清单

## 📋 待完成的合规项目

### 1. ⚠️ Declared Age Range（声明年龄范围）- 待完成

**问题：** App Store 审核提示 "Declared Age Range: 未集成该框架"

**原因：** 
- Apple 要求聊天类应用声明用户年龄范围
- 保护未成年用户，符合 COPPA 等法规

**解决方案（推荐方案 1）：**

#### 方案 1：在 App Store Connect 中配置（最简单）

1. 登录 [App Store Connect](https://appstoreconnect.apple.com)
2. 选择你的 App（Optibot / Mattermost Mobile）
3. 进入 **"App 隐私"** 标签页
4. 找到 **"年龄范围"** 或 **"Declared Age Range"** 部分
5. 点击编辑，选择适合的声明：
   - ☐ "此 App 适合所有年龄段"（包括儿童）
   - ☑ "此 App 不适合儿童"（推荐：大多数聊天应用）
   - ☐ "此 App 不适合 17 岁以下用户"（有限制内容）
6. 保存并提交审核

**无需修改代码！**

#### 方案 2：在 Info.plist 中添加（如果需要）

如果 App Store Connect 要求代码层面声明：

**文件：** `ios/Optibot/Info.plist`

**添加：**
```xml
<key>NSDeclaredAgeRange</key>
<string>17+</string>
```

**或者：**
```xml
<key>NSDeclaredAgeRange</key>
<dict>
    <key>minimumAge</key>
    <integer>17</integer>
</dict>
```

**修改命令：**
```bash
# 使用 PlistBuddy
/usr/libexec/PlistBuddy -c "Add :NSDeclaredAgeRange string 17+" ios/Optibot/Info.plist

# 或手动编辑
vim ios/Optibot/Info.plist
```

---

### 2. ✅ 账户删除功能 - 已完成

**状态：** ✅ 已集成

**位置：** `app/screens/home/me/me.tsx`

**功能：**
- "注销账号" 按钮
- 二次确认对话框
- 调用后端删除 API
- 清除本地数据

**审核要求：**
- ✅ 提供账户删除选项
- ✅ 删除所有用户数据
- ✅ 不可逆操作有确认

---

### 3. ✅ 权限描述 - 已完成

**状态：** ✅ 已修复

**位置：** `ios/Optibot/i18n/zh-CN.lproj/InfoPlist.strings`

**已修复的权限描述：**
- ✅ NSCameraUsageDescription - 相机权限
- ✅ NSPhotoLibraryUsageDescription - 照片库读取
- ✅ NSPhotoLibraryAddUsageDescription - 照片库写入
- ✅ NSMicrophoneUsageDescription - 麦克风权限

**要求：**
- ✅ 明确说明用途
- ✅ 使用中文描述
- ✅ 符合 iOS 规范

---

### 4. ✅ iOS 手势冲突修复 - 已完成

**状态：** ✅ 已修复

**修改内容：**
- ✅ 记事本详情页改为 Navigation
- ✅ 知识库详情页改为 Navigation
- ✅ 知识库添加页改为 Navigation
- ✅ 知识库编辑页改为 Navigation
- ✅ Ask AI 保留 Modal + gestureEnabled={false}

**解决的问题：**
- ✅ iOS 下拉手势与 ScrollView 冲突
- ✅ pageSheet Modal 导致崩溃
- ✅ 不支持 iOS 侧滑返回

---

### 5. ⚠️ 隐私标签（Privacy Labels）- 待检查

**位置：** App Store Connect → App 隐私

**需要声明的数据收集：**

#### 用户数据
- ☑ 联系方式（邮箱、用户名）
- ☑ 用户内容（消息、文件）
- ☑ 搜索历史
- ☑ 浏览历史

#### 使用数据
- ☑ 产品交互
- ☑ 性能数据

#### 诊断数据
- ☑ 崩溃日志
- ☑ 性能数据

**配置步骤：**
1. 登录 App Store Connect
2. 选择 App → "App 隐私"
3. 点击"数据类型" → 编辑
4. 勾选所有收集的数据类型
5. 说明用途（App 功能、分析等）
6. 保存并提交

---

### 6. ⚠️ App 隐私政策 URL - 待确认

**位置：** App Store Connect → App 隐私 → 隐私政策 URL

**要求：**
- ✅ 提供有效的隐私政策链接
- ✅ 中文版本
- ✅ 说明数据收集和使用
- ✅ 说明用户权利

**检查清单：**
- [ ] 隐私政策 URL 是否有效？
- [ ] 是否包含数据收集说明？
- [ ] 是否包含用户权利说明？
- [ ] 是否有中文版本？
- [ ] 是否符合 GDPR/CCPA？

---

### 7. ⚠️ 数据链接声明 - 待检查

**Apple 要求：** 声明是否将用户数据与第三方共享

**配置位置：** App Store Connect → App 隐私 → 数据链接

**需要回答：**
- [ ] 是否与第三方共享数据？
- [ ] 是否用于广告？
- [ ] 是否用于分析？
- [ ] 是否出售数据？

---

### 8. ⚠️ IDFA（广告标识符）使用 - 待确认

**检查是否使用：**
```bash
grep -rn "AdSupport\|ASIdentifierManager\|advertisingIdentifier" ios/
```

**如果使用了：**
- ✅ 需要在 App Store Connect 声明
- ✅ 需要 ATT（App Tracking Transparency）弹窗
- ✅ 需要在 Info.plist 添加 NSUserTrackingUsageDescription

**如果没有使用：**
- ✅ 在 App Store Connect 中选择"不使用 IDFA"

---

## 📝 App Store 审核前检查清单

### 提交前必做

- [ ] 配置 Declared Age Range（App Store Connect）
- [ ] 确认隐私标签完整（App Store Connect）
- [ ] 确认隐私政策 URL 有效
- [ ] 测试账户删除功能
- [ ] 测试所有权限弹窗
- [ ] 测试 iOS 手势（下拉、侧滑）
- [ ] 构建 Release 版本测试

### 代码层面

- [x] 账户删除功能已实现
- [x] 权限描述已修复
- [x] iOS 手势冲突已修复
- [ ] Declared Age Range（如果需要 Info.plist）
- [ ] 隐私标签（如果需要代码）

### App Store Connect 层面

- [ ] Declared Age Range 配置
- [ ] 隐私标签配置
- [ ] 隐私政策 URL
- [ ] 数据链接声明
- [ ] IDFA 使用声明
- [ ] 审核备注填写

---

## 🚀 快速操作指南

### 立即完成 Declared Age Range

**步骤 1：打开 App Store Connect**
```
https://appstoreconnect.apple.com
```

**步骤 2：选择 App**
- 点击你的 App（Optibot 或 Mattermost）

**步骤 3：进入 App 隐私**
- 点击左侧菜单 "App 隐私"

**步骤 4：配置年龄范围**
- 找到 "Declared Age Range" 或 "年龄范围"
- 选择 "此 App 不适合儿童"（推荐）
- 点击保存

**步骤 5：提交审核**
- 点击 "提交审核"
- 填写审核备注（可选）
- 等待审核通过

---

## 📊 合规状态总结

| 项目 | 状态 | 位置 | 操作 |
|------|------|------|------|
| 账户删除 | ✅ 已完成 | 代码 | 无需操作 |
| 权限描述 | ✅ 已完成 | Info.plist | 无需操作 |
| iOS 手势 | ✅ 已完成 | 代码 | 无需操作 |
| Declared Age Range | ⚠️ 待完成 | App Store Connect | 需配置 |
| 隐私标签 | ⚠️ 待检查 | App Store Connect | 需确认 |
| 隐私政策 URL | ⚠️ 待确认 | App Store Connect | 需验证 |
| 数据链接 | ⚠️ 待检查 | App Store Connect | 需配置 |
| IDFA 使用 | ⚠️ 待确认 | App Store Connect | 需声明 |

---

## 🎯 优先级

### 高优先级（阻塞审核）
1. **Declared Age Range** - 必须在 App Store Connect 配置
2. 隐私标签 - 必须完整声明
3. 隐私政策 URL - 必须有效

### 中优先级（影响用户体验）
4. 账户删除 - 已完成
5. 权限描述 - 已完成
6. iOS 手势 - 已完成

### 低优先级（可选）
7. 数据链接 - 建议配置
8. IDFA 声明 - 如使用则必须

---

## 💡 常见问题

### Q1: Declared Age Range 是什么？
A: Apple 要求 App 声明目标用户年龄范围，特别是聊天类应用，以保护未成年用户。

### Q2: 为什么聊天类应用必须集成？
A: 因为聊天应用可能包含用户生成内容（UGC），需要声明是否适合儿童。

### Q3: 选择哪个年龄范围？
A: 大多数聊天应用选择 **"不适合儿童"** 或 **"17+"**，除非你明确针对儿童市场。

### Q4: 需要修改代码吗？
A: **通常不需要**。在 App Store Connect 中配置即可。

### Q5: 配置后多久生效？
A: 立即生效，下次提交审核时会使用新配置。

---

## 📞 需要帮助？

### Apple 官方文档
- [App Store 审核指南](https://developer.apple.com/app-store/review/guidelines/)
- [隐私政策要求](https://developer.apple.com/app-store/app-privacy-details/)
- [Declared Age Range](https://developer.apple.com/documentation/bundleresources/information_property_list/nsdeclaredagerange)

### 联系 Apple
- App Store Connect 支持
- 开发者技术支持（DTS）

---

## ✅ 下一步行动

### 立即执行（5 分钟）
1. 打开 App Store Connect
2. 配置 Declared Age Range
3. 检查隐私标签
4. 确认隐私政策 URL

### 提交前（30 分钟）
1. 测试所有功能
2. 构建 Release 版本
3. 填写审核备注
4. 提交审核

### 等待审核（1-3 天）
1. 监控审核状态
2. 准备回复审核问题
3. 准备发布

---

**祝审核顺利！🎉**
