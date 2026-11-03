# 隐私合规整改测试计划

## 一、测试环境准备

### 必需工具
1. **Android Studio** - 编译APK
2. **ADB工具** - 设备调试
3. **隐私合规检测工具** - 复测（与检测机构使用的工具一致）
4. **抓包工具**（Charles/Wireshark）- 监控网络请求
5. **测试设备** - Android 10+ 真机

### 测试前检查
```bash
# 1. 清理构建缓存
cd android && ./gradlew clean

# 2. 构建Release APK
./gradlew assembleRelease

# 3. 安装到测试设备
adb install app/build/outputs/apk/release/app-release.apk
```

---

## 二、优先级1测试：SDK延迟初始化

### 测试场景1.1：新安装用户（未同意隐私协议）

**测试步骤**：
1. 卸载APP（确保干净状态）
2. 安装APP
3. **不要点击"同意"按钮**
4. 使用检测工具扫描APP

**预期结果**：
- ✅ 极光SDK未初始化
- ✅ 无AndroidID读取行为
- ✅ 无设备信息收集
- ✅ 无网络请求发送到极光服务器

**验证命令**：
```bash
# 检查JPush进程
adb shell ps | grep jpush
# 预期：无输出

# 检查网络请求
adb logcat | grep -i "jpush\|jiguang"
# 预期：无极光相关的网络请求日志
```

### 测试场景1.2：用户点击同意

**测试步骤**：
1. 在场景1.1的基础上
2. 阅读隐私政策
3. 点击"同意"按钮
4. 等待APP初始化完成
5. 使用检测工具扫描

**预期结果**：
- ✅ 极光SDK开始初始化
- ✅ 正常读取设备信息（AndroidID等）
- ✅ 正常注册推送服务
- ✅ 收到Registration ID

**验证命令**：
```bash
# 查看日志确认JPush初始化
adb logcat -s JPushManager ReactNative
# 预期看到：
# [JPushManager] 开始初始化极光推送
# [JPushManager] 极光 SDK 初始化成功
```

### 测试场景1.3：已同意用户再次启动

**测试步骤**：
1. 在场景1.2的基础上
2. 完全关闭APP（杀掉进程）
3. 重新启动APP
4. 观察启动流程

**预期结果**：
- ✅ 不再显示隐私协议弹窗
- ✅ APP启动时自动初始化JPush
- ✅ 推送服务正常工作

**验证命令**：
```bash
# 检查协议状态
adb shell run-as com.optibot.cn cat /data/data/com.optibot.cn/files/keychain.plist | grep launch_agreement
# 预期：存在已同意记录
```

### 测试场景1.4：推送功能端到端测试

**测试步骤**：
1. 完成场景1.2或1.3
2. 登录账号
3. 在另一台设备向该用户发送消息
4. 观察测试设备是否收到推送

**预期结果**：
- ✅ 收到推送通知
- ✅ 点击通知可跳转到对应频道
- ✅ 推送标题和内容正确

---

## 三、优先级2测试：权限清理

### 测试场景2.1：Manifest权限检查

**测试步骤**：
1. 构建APK
2. 解压APK查看AndroidManifest.xml

**验证命令**：
```bash
# 解压APK
unzip app-release.apk -d apk_extracted

# 检查是否包含被移除的权限
grep -E "ACCESS_BACKGROUND_LOCATION|ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|READ_PHONE_STATE|READ_CONTACTS|WRITE_CONTACTS" apk_extracted/AndroidManifest.xml
# 预期：无输出（说明权限已移除）

# 检查保留的权限
grep -E "CAMERA|RECORD_AUDIO|POST_NOTIFICATIONS" apk_extracted/AndroidManifest.xml
# 预期：有输出（说明这些权限保留）
```

### 测试场景2.2：运行时权限请求

**测试步骤**：
1. 安装APP（新安装）
2. 点击同意隐私协议
3. 进入应用
4. 使用需要相机的功能（扫描二维码）
5. 使用需要麦克风的功能（语音消息）

**预期结果**：
- ✅ 相机权限请求弹出
- ✅ 麦克风权限请求弹出
- ✅ **不会**弹出位置权限请求
- ✅ **不会**弹出联系人权限请求
- ✅ **不会**弹出电话权限请求

**验证命令**：
```bash
# 查看APP已获得的权限
adb shell dumpsys package com.optibot.cn | grep "permission:" | grep "granted=true"
# 预期：不包含被移除的权限
```

### 测试场景2.3：功能完整性测试

**测试步骤**：
1. 测试所有核心功能

**测试清单**：
- [ ] 视频通话（需要CAMERA）
- [ ] 语音消息（需要RECORD_AUDIO）
- [ ] 推送通知（需要POST_NOTIFICATIONS）
- [ ] 扫描二维码（需要CAMERA）
- [ ] 上传文件（需要存储权限）
- [ ] 后台推送（需要FOREGROUND_SERVICE）

**预期结果**：
- ✅ 所有核心功能正常工作
- ✅ 没有因为权限移除导致功能异常

---

## 四、优先级3测试：第三方SDK审计

### 测试场景3.1：依赖树检查

**测试步骤**：
1. 检查所有依赖

**验证命令**：
```bash
cd android && ./gradlew app:dependencies > dependencies.txt

# 检查是否包含数据分析SDK
grep -iE "firebase.*analytics|google.*analytics|facebook.*analytics" dependencies.txt
# 预期：无输出

# 确认Firebase Messaging存在
grep "firebase-messaging" dependencies.txt
# 预期：有输出（用于FCM推送）

# 确认Firebase Analytics不存在
grep "firebase-analytics" dependencies.txt
# 预期：无输出
```

### 测试场景3.2：网络请求监控

**测试步骤**：
1. 配置抓包工具（Charles）
2. 启动APP
3. 执行各种操作（登录、浏览、发消息等）
4. 监控网络请求

**预期结果**：
- ✅ 无请求发送到 `google-analytics.com`
- ✅ 无请求发送到 `facebook.com/tr` (Facebook tracking)
- ✅ 无请求发送到 `app-measurement.com` (Firebase Analytics)
- ✅ 仅有业务相关的网络请求

**验证命令**：
```bash
# 使用tcpdump抓包（需要root设备）
adb shell tcpdump -i any -w /sdcard/capture.pcap

# 或使用mitmproxy
mitmproxy --mode regular -p 8080
# 设置设备代理后操作APP
```

### 测试场景3.3：Firebase Analytics禁用验证

**测试步骤**：
1. 检查Manifest配置

**验证命令**：
```bash
# 解压APK
unzip app-release.apk -d apk_extracted

# 检查Firebase Analytics是否禁用
grep "firebase_analytics_collection_deactivated" apk_extracted/AndroidManifest.xml
# 预期输出：
# <meta-data android:name="firebase_analytics_collection_deactivated" android:value="true"/>
```

---

## 五、综合测试

### 测试场景5.1：完整用户旅程

**测试步骤**：
1. 卸载APP
2. 全新安装
3. 启动APP → 显示隐私协议
4. 点击同意 → JPush初始化
5. 登录账号
6. 加入频道
7. 发送消息
8. 接收推送
9. 视频通话
10. 语音消息

**预期结果**：
- ✅ 所有流程正常
- ✅ 无崩溃
- ✅ 推送正常
- ✅ 音视频功能正常

### 测试场景5.2：不同意隐私协议

**测试步骤**：
1. 卸载APP
2. 全新安装
3. 启动APP → 显示隐私协议
4. 点击"不同意"

**预期结果**：
- ✅ APP退出（BackHandler.exitApp()）
- ✅ 不会初始化任何SDK
- ✅ 不会收集任何信息

### 测试场景5.3：隐私合规复测模拟

**测试步骤**：
1. 使用与检测机构相同的检测工具
2. 按照检测标准执行全部53项检测
3. 重点关注之前不合规的项目

**重点关注项**：
- [ ] 场景5：SDK在用户同意前私自收集信息
- [ ] 场景3：个人信息违规使用与共享
- [ ] 场景2、3：定向推送与个性化推荐
- [ ] 场景8：权限申请与业务功能匹配度
- [ ] 场景5、6、7：广告分发与下载合规性

**预期结果**：
- ✅ 53项检测全部通过
- ✅ 无违规收集个人信息
- ✅ 无超范围收集个人信息
- ✅ 权限申请合理

---

## 六、测试报告模板

### 测试执行记录

| 测试场景 | 测试时间 | 测试人员 | 结果 | 备注 |
|---------|---------|---------|------|------|
| 1.1 新安装未同意 | | | ✅/❌ | |
| 1.2 点击同意 | | | ✅/❌ | |
| 1.3 已同意重启 | | | ✅/❌ | |
| 1.4 推送功能 | | | ✅/❌ | |
| 2.1 Manifest检查 | | | ✅/❌ | |
| 2.2 运行时权限 | | | ✅/❌ | |
| 2.3 功能完整性 | | | ✅/❌ | |
| 3.1 依赖树检查 | | | ✅/❌ | |
| 3.2 网络监控 | | | ✅/❌ | |
| 3.3 Firebase禁用 | | | ✅/❌ | |
| 5.1 完整旅程 | | | ✅/❌ | |
| 5.2 不同意协议 | | | ✅/❌ | |
| 5.3 合规复测 | | | ✅/❌ | |

### 问题跟踪

| 问题ID | 问题描述 | 严重程度 | 状态 | 负责人 |
|--------|---------|---------|------|--------|
| | | 高/中/低 | 待修复/已修复 | |

---

## 七、提交复测清单

### 提交前检查

- [ ] 所有测试场景通过
- [ ] 无崩溃和ANR
- [ ] 推送功能正常
- [ ] 音视频功能正常
- [ ] 隐私协议流程正确
- [ ] SDK延迟初始化生效
- [ ] 冗余权限已移除
- [ ] 无不必要的境外SDK
- [ ] 隐私政策文本已更新（含SDK清单）
- [ ] 法务审核通过

### 提交材料

1. **APK文件**
   - Release版本
   - 版本号：2.39.1（或更高）

2. **整改说明文档**
   - 详细描述每项整改措施
   - 提供代码变更清单
   - 附上测试报告

3. **隐私政策**
   - 更新后的隐私政策文本
   - 包含完整SDK清单
   - 包含权限使用说明

4. **测试报告**
   - 内部测试结果
   - 所有测试场景通过证明
   - 视频录屏（如需要）

---

## 八、回滚方案

如果测试发现问题，需要回滚：

```bash
# 回滚代码（使用git）
git revert HEAD~3..HEAD

# 重新构建
cd android && ./gradlew clean assembleRelease

# 重新安装
adb install -r app/build/outputs/apk/release/app-release.apk
```

---

## 九、联系方式

- 开发负责人：[待填写]
- 测试负责人：[待填写]
- 法务负责人：[待填写]
- 检测机构：[待填写]
