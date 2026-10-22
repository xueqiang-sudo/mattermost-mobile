# iOS 发布指南

## 📋 发布前检查清单

### 1. 移除调试功能（重要！）

在发布到 App Store 之前，**必须**移除以下调试功能：

#### 在 `app/screens/invite_link/index.tsx` 中：

**移除以下按钮：**
- 🔍 Show Character Analysis 按钮
- 🧪 Test Parsing Steps 按钮
- 🧪 Test Invite Link 按钮（可选，但建议移除）

**移除以下调试面板：**
- 📊 Debug Info 面板（显示解析信息的面板）

**保留以下功能：**
- ✅ 邀请链接输入框
- ✅ 确认按钮
- ✅ 错误提示（但不要显示 debug 信息）

### 2. 版本号设置

编辑 `ios/Optibot/Info.plist`:

```xml
<key>CFBundleShortVersionString</key>
<string>1.0.0</string>  <!-- 用户看到的版本号 -->

<key>CFBundleVersion</key>
<string>1</string>  <!-- 每次上传必须递增 -->
```

### 3. 使用 Release 配置

确保 GitHub Actions 使用 **Release** 配置：

```yaml
- name: Build iOS
  run: |
    xcodebuild archive \
      -configuration Release \
      -scheme Optibot \
      -archivePath build/Optibot.xcarchive
```

### 4. 证书和配置文件

确保 GitHub Secrets 包含：
- ✅ `APP_STORE_CONNECT_API_KEY_ID`
- ✅ `APP_STORE_CONNECT_API_ISSUER_ID`
- ✅ `APP_STORE_CONNECT_API_KEY_CONTENT`
- ✅ `MATCH_PASSWORD`
- ✅ `MATCH_GIT_BASIC_AUTHORIZATION`

使用 **App Store Distribution** 证书（不是 Ad Hoc）

### 5. App Store Connect 准备

在 https://appstoreconnect.apple.com 准备：

- ✅ App 图标（1024x1024 PNG）
- ✅ 截图（至少 5 张）
  - iPhone 6.5" (3张)
  - iPhone 6.1" (3张)
  - iPad 12.9" (3张，如果支持 iPad)
- ✅ 应用描述（中文和英文）
- ✅ 关键词
- ✅ 支持 URL
- ✅ 隐私政策 URL
- ✅ 选择价格等级（免费/付费）

## 🚀 发布步骤

### 方法 1：从 TestFlight 直接发布（推荐）

1. 登录 App Store Connect
2. 进入你的 App
3. 点击 "App Store" 标签
4. 点击 "+ 版本或平台" → "iOS App"
5. 输入版本号（和 Info.plist 一致）
6. 在 "构建" 部分，点击 "选择构建"
7. **选择你从 GitHub Actions 上传的 TestFlight 版本**
8. 填写 "版本说明"
9. 选择发布方式：
   - 手动发布：审核通过后你手动点击发布
   - 自动发布：审核通过后自动发布
10. 点击 "添加以供审核"
11. 回答审核问题（出口合规等）
12. 提交审核

### 方法 2：重新编译正式发布版本

#### 本地编译：

```bash
cd ios
xcodebuild clean
xcodebuild archive \
  -configuration Release \
  -scheme Optibot \
  -archivePath build/Optibot.xcarchive

xcodebuild -exportArchive \
  -archivePath build/Optibot.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/ipa
```

#### 或使用 GitHub Actions：

触发你的 workflow，确保使用 Release 配置

## ⏱ 审核时间

- **审核时间**: 通常 24-48 小时
- **加速审核**: 如果有紧急 bug，可以申请加速审核
- **审核状态**: 可以在 App Store Connect 查看

## 🐛 审核被拒绝？

常见拒绝原因：

1. **崩溃或明显 bug**
   - 解决：测试所有功能，修复 bug

2. **缺少隐私政策**
   - 解决：提供隐私政策 URL

3. **元数据不完整**
   - 解决：填写所有必填字段

4. **包含调试代码**
   - 解决：移除调试按钮和调试信息

5. **功能不完整**
   - 解决：确保所有功能都可以正常使用

## ✅ 发布后检查

发布成功后：

1. 在 App Store 搜索你的应用
2. 下载并测试所有功能
3. 邀请链接功能
4. 登录/注册
5. 消息发送
6. 通知接收

## 📞 获取帮助

如果遇到审核问题：
- App Store Connect 的 "联系我们"
- Apple Developer Forums
- 或者联系 Mattermost 社区

---

**重要提示**: TestFlight 版本和正式版本使用相同的二进制文件，只是分发方式不同。如果你的 TestFlight 版本工作正常，可以直接用于正式发布！
