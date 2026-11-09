# 隐私合规日志查看指南

## 修改说明

我已添加了完整的日志追踪系统，让你可以在应用内查看 SDK 初始化步骤。

### 工作原理

```
原生层 (MainApplication.kt)
    ↓ 写入日志到文件
    ↓ cacheDirectory/native_privacy.log
    ↓
JS 层 (index.ts)
    ↓ 启动时读取原生日志文件
    ↓ 解析并合并到 debugLog
    ↓
应用内查看 (debugLog)
    ↓ 在 DebugScreen 或控制台查看
```

---

## 如何查看日志

### 方法 1：使用 DebugScreen（推荐）

如果你的应用有 DebugScreen 功能：

1. **清除应用数据**
   ```bash
   adb shell pm clear com.optibot.cn
   ```

2. **启动应用**

3. **打开 DebugScreen**（通常是摇一摇或特定手势）

4. **查看日志**
   - 搜索 `Native:PrivacyVerify` 标签
   - 你会看到所有原生层的初始化步骤

### 方法 2：查看控制台日志

```bash
# 启动应用后查看 Metro 控制台或 adb logcat
adb logcat | grep "PrivacyVerify"
```

### 方法 3：直接读取日志文件

```bash
# 在设备上查看原生日志文件
adb shell run-as com.optibot.cn cat cache/native_privacy.log
```

---

## 预期日志内容

### 首次启动（用户未同意）

```
[14:23:45.123] [PrivacyVerify] === Application.onCreate === hasConsent=false
[14:23:45.124] [PrivacyVerify] === 用户未同意，SDK 初始化已延迟 ===
```

**此时不应看到任何 SDK 初始化日志！**

---

### 用户点击"同意"后

```
[14:23:50.456] [PrivacyVerify] === 用户点击同意，保存同意状态 ===
[14:23:50.457] [PrivacyVerify] === 开始调用 initializeSdk() ===
[14:23:50.458] [PrivacyVerify] === 开始初始化 SDK（用户已同意） ===
[14:23:50.459] [PrivacyVerify] 清理临时缓存目录: /data/.../cache/temp_files
[14:23:50.465] [PrivacyVerify] TurboLog.configure 完成
[14:23:50.470] [PrivacyVerify] 初始化 OkHttpClient...
[14:23:50.475] [PrivacyVerify] OkHttpClient 初始化完成
[14:23:50.480] [PrivacyVerify] 初始化 ExpoImageOkHttpClient...
[14:23:50.485] [PrivacyVerify] ExpoImageOkHttpClient 初始化完成
[14:23:50.490] [PrivacyVerify] 初始化 SoLoader...
[14:23:50.520] [PrivacyVerify] SoLoader 初始化完成
[14:23:50.525] [PrivacyVerify] 设置通知渠道...
[14:23:50.530] [PrivacyVerify] 通知渠道设置完成
[14:23:50.535] [PrivacyVerify] 初始化 ApplicationLifecycleDispatcher...
[14:23:50.540] [PrivacyVerify] ApplicationLifecycleDispatcher 初始化完成
[14:23:50.545] [PrivacyVerify] === SDK 初始化全部完成 ===
```

---

### 第二次启动（用户已同意）

```
[14:24:10.123] [PrivacyVerify] === Application.onCreate === hasConsent=true
[14:24:10.124] [PrivacyVerify] === 用户已同意，立即初始化 SDK ===
[14:24:10.125] [PrivacyVerify] === 开始初始化 SDK（用户已同意） ===
[14:24:10.126] [PrivacyVerify] 清理临时缓存目录: /data/.../cache/temp_files
...
[14:24:10.200] [PrivacyVerify] === SDK 初始化全部完成 ===
```

---

## 关键验证点

### ✅ 必须满足的条件

1. **首次启动**（清除数据后）
   - [ ] 看到 `hasConsent=false`
   - [ ] 看到 "SDK 初始化已延迟"
   - [ ] **不应看到** "开始初始化 SDK"
   - [ ] **不应看到** OkHttpClient、SoLoader 等初始化日志

2. **点击"同意"后**
   - [ ] 看到 "用户点击同意"
   - [ ] 看到 "开始调用 initializeSdk()"
   - [ ] 看到所有 SDK 按顺序初始化
   - [ ] 看到 "SDK 初始化全部完成"

3. **第二次启动**
   - [ ] 看到 `hasConsent=true`
   - [ ] 立即开始 SDK 初始化（无需等待用户同意）

---

## 在 debugLog 中的显示

在应用的 debugLog 中，你会看到带有 `Native:` 前缀的日志：

```
[14:23:50.456] [Native:PrivacyVerify] [14:23:50.456] === 用户点击同意，保存同意状态 ===
[14:23:50.457] [Native:PrivacyVerify] [14:23:50.457] === 开始调用 initializeSdk() ===
...
```

或者在 Metro 控制台看到：

```
[14:23:50.456] [Native:PrivacyVerify] [14:23:50.456] === 用户点击同意，保存同意状态 ===
```

---

## 故障排查

### 问题 1：看不到原生日志

**原因**：
- JS 层启动代码未执行
- 日志文件路径错误

**解决**：
```bash
# 检查日志文件是否存在
adb shell run-as com.optibot.cn ls -la cache/ | grep native_privacy
```

### 问题 2：日志内容为空

**原因**：
- 原生层未写入日志
- 日志已被读取并删除

**解决**：
- 清除应用数据后重新启动
- 在同意隐私政策前检查文件是否存在

### 问题 3：日志格式不对

**原因**：
- 正则表达式匹配失败

**解决**：
- 检查 `index.ts` 中的解析代码
- 确认原生日志格式为 `[HH:mm:ss.SSS] [Tag] Message`

---

## 代码位置

### 原生层日志写入
- **文件**：`android/app/src/main/java/com/optibot/cn/MainApplication.kt`
- **函数**：`nativeLog()`
- **日志文件**：`cacheDirectory/native_privacy.log`

### JS 层日志读取
- **文件**：`index.ts`
- **位置**：TurboLogger.configure() 之后
- **功能**：读取原生日志并合并到 debugLog

---

## 测试脚本

```bash
#!/bin/bash

echo "=== 隐私合规日志验证 ==="
echo ""

# 清除应用数据
echo "1. 清除应用数据..."
adb shell pm clear com.optibot.cn

# 启动应用
echo "2. 启动应用..."
adb shell am start -n com.optibot.cn/.PrivacyConsentActivity

# 等待用户操作
echo ""
echo "请在应用中点击"同意"按钮..."
echo "按 Enter 继续..."
read

# 检查原生日志文件
echo ""
echo "3. 检查原生日志文件..."
adb shell run-as com.optibot.cn cat cache/native_privacy.log

echo ""
echo "=== 验证完成 ==="
```

---

## 下一步

1. **重新编译 APK**
   ```bash
   cd android && ./gradlew assembleDebug
   ```

2. **安装并测试**
   ```bash
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

3. **查看日志**
   - 使用 DebugScreen
   - 或查看 Metro 控制台
   - 或使用 adb logcat

4. **验证合规性**
   - 确认 SDK 在用户同意后才初始化
   - 确认没有提前收集设备信息
