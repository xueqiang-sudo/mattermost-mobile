# iOS 合规修复指南

## 📋 问题清单

### 1. 权限描述问题

#### 当前问题
从截图可以看到，照片权限描述为：
> "允知智构"想要加入你的"照片"
> 启用对你的照片库的写入权限意味着您可以从 Dedalix 下载的照片和视频保存到您的设备。

**问题：**
- ❌ 权限描述不够清晰
- ❌ 用户可能不理解为什么需要照片权限
- ❌ App Store 审核可能拒绝

#### 修复方案

编辑 `ios/Optibot/Info.plist`，找到并修改以下键：

```xml
<!-- 照片库写入权限 -->
<key>NSPhotoLibraryAddUsageDescription</key>
<string>用于保存二维码图片和聊天中的照片到您的相册</string>

<!-- 照片库读取权限（如果有） -->
<key>NSPhotoLibraryUsageDescription</key>
<string>用于选择照片发送消息或上传头像</string>

<!-- 相机权限（如果有） -->
<key>NSCameraUsageDescription</key>
<string>用于拍摄照片发送消息、扫描二维码或视频通话</string>
```

### 2. App Store 审核必需的权限描述

如果你的应用使用了以下权限，**必须**提供清晰的描述：

```xml
<!-- 网络权限（一般不需要描述，但确保有） -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>

<!-- 麦克风权限（如果有语音消息） -->
<key>NSMicrophoneUsageDescription</key>
<string>用于发送语音消息和进行语音通话</string>

<!-- 通知权限 -->
<key>NSUserNotificationsUsageDescription</key>
<string>用于接收新消息提醒和重要通知</string>

<!-- Face ID（如果支持） -->
<key>NSFaceIDUsageDescription</key>
<string>用于使用 Face ID 快速登录应用</string>

<!-- 位置权限（如果有） -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>用于在消息中分享您的位置</string>
```

### 3. 隐私政策

**App Store 强制要求：**
- ✅ 必须有隐私政策 URL
- ✅ 必须在 App Store Connect 填写
- ✅ 必须在应用内可访问

**建议的隐私政策内容：**
```
1. 我们收集哪些数据
   - 账户信息（用户名、邮箱）
   - 消息内容（加密存储）
   - 设备信息（用于推送通知）

2. 我们如何使用数据
   - 提供即时通讯服务
   - 发送推送通知
   - 改善用户体验

3. 数据共享
   - 不会出售给第三方
   - 仅在用户授权范围内使用

4. 用户权利
   - 可以删除账户
   - 可以导出数据
   - 可以撤回同意

5. 联系方式
   - 邮箱：privacy@optibot.cn
   - 电话：xxx-xxxx-xxxx
```

### 4. App Privacy Details（App Store Connect）

在 App Store Connect 填写隐私信息：

**数据类型：**
- ✅ Contact Info（联系信息）
- ✅ User Content（用户内容 - 消息）
- ✅ Identifiers（标识符）
- ✅ Usage Data（使用数据）

**数据用途：**
- ✅ App Functionality（应用功能）
- ✅ Product Personalization（产品个性化）

**数据链接：**
- ✅ Data Linked to User（数据与用户关联）

**数据追踪：**
- ❌ 不用于追踪（除非你有广告）

### 5. 年龄分级

根据应用内容设置年龄分级：

**Mattermost 是工作通讯工具：**
- ✅ 适合 17+（因为可能有用户生成内容）
- ✅ 不包含暴力、色情等内容
- ✅ 不包含赌博

在 App Store Connect → App 信息 → 年龄分级，选择：
- 无限制的网络访问
- 用户生成内容
- 无其他限制

### 6. 应用类别

选择正确的应用类别：
- **主类别**: 商务 (Business)
- **副类别**: 效率 (Productivity)

### 7. 截图要求

**必须提供以下截图：**

#### iPhone 6.5 英寸（3 张）
- 分辨率: 1284 x 2778 或 1290 x 2796
- 内容:
  1. 登录页面
  2. 聊天界面
  3. 联系人列表

#### iPhone 6.1 英寸（3 张）
- 分辨率: 1179 x 2556 或 1170 x 2532
- 内容: 同上

#### iPad 12.9 英寸（如果需要支持 iPad）
- 分辨率: 2048 x 2732
- 内容: 同上

**截图规范：**
- ✅ 使用真实设备截图
- ✅ 包含完整界面（包括状态栏）
- ✅ 不包含个人信息
- ✅ 使用模拟数据或测试账户

### 8. 应用描述

**中文描述模板：**
```
Optibot 是一款专为企业设计的安全即时通讯平台，帮助团队高效协作。

主要功能：
• 实时消息：发送文本、图片、文件
• 频道管理：创建公开或私密频道
• 语音/视频通话：支持一对一和群组通话
• 企业级安全：端到端加密，数据自主可控
• 多平台同步：iOS、Android、Web、桌面端无缝同步

特色：
✓ 私有化部署，数据完全掌控
✓ 丰富的 API 和插件生态
✓ 支持大规模用户并发
✓ 符合企业合规要求

联系我们：
邮箱：support@optibot.cn
官网：https://optibot.cn
```

**关键词（最多 100 字符）：**
```
企业通讯,即时通讯,团队协作,聊天软件,消息平台,私有化部署,安全通讯,工作沟通,团队管理,办公协作
```

### 9. 支持 URL 和营销 URL

**支持 URL（必需）：**
```
https://optibot.cn/support
或
https://optibot.cn/help
```

**营销 URL（可选）：**
```
https://optibot.cn
```

**隐私政策 URL（必需）：**
```
https://optibot.cn/privacy
```

### 10. 出口合规信息

如果你的应用使用了加密（Mattermost 使用了 TLS/HTTPS），需要填写出口合规：

**问题 1**: 你的应用是否使用加密？
- ✅ 是

**问题 2**: 你的应用是否符合以下例外条件？
- ✅ 是（如果只使用标准 HTTPS/TLS）

**豁免声明：**
```
本应用仅使用标准的 TLS/HTTPS 加密用于数据传输安全，
符合 BIS 例外条款 Category 5 Part 2。
```

### 11. IDFA（广告标识符）

**如果你的应用不包含广告：**
- ❌ 不使用 IDFA
- ❌ 不投放广告

**在 App Store Connect：**
- 选择"否，我们不使用广告标识符"

### 12. 应用审核备注

在提交审核时，添加备注帮助审核人员：

```
尊敬的 App Store 审核团队：

这是一款企业级即时通讯应用，主要功能包括：
1. 实时消息通讯
2. 团队协作
3. 文件共享
4. 音视频通话

测试账户：
用户名：demo@optibot.cn
密码：Demo123456

服务器地址：https://ai.optibot.cn:8065

如有任何问题，请联系：
邮箱：developer@optibot.cn
电话：xxx-xxxx-xxxx

谢谢！
```

### 13. 版本说明（What's New）

如果是更新版本，填写版本说明：

```
版本 2.39.0 更新内容：
• 新增：邀请链接功能优化
• 新增：iOS 兼容性改进
• 修复：若干已知问题
• 优化：性能和稳定性提升
```

## 🚀 提交前检查清单

- [ ] 修改 Info.plist 中的权限描述
- [ ] 准备隐私政策 URL
- [ ] 准备 5 张以上截图（不同尺寸）
- [ ] 填写应用描述（中英文）
- [ ] 填写关键词
- [ ] 设置年龄分级
- [ ] 填写 App Privacy Details
- [ ] 填写出口合规信息
- [ ] 准备测试账户
- [ ] 填写审核备注

## ⏱ 审核时间线

- **首次提交**: 24-72 小时
- **更新提交**: 12-48 小时
- **加速审核**: 申请后 24 小时内

## 📞 获取帮助

如果审核被拒绝：
1. 仔细阅读拒绝原因
2. 在 Resolution Center 回复
3. 必要时打电话：+1-408-996-1010（美国）

---

**重要提示**: 在修复权限描述后，需要重新编译 IPA 并重新上传到 App Store Connect！
