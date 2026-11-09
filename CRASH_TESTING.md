# 崩溃测试与故障排查指南

## 我添加的保护措施

### 1. SDK 初始化异常捕获

```kotlin
fun initializeSdk() {
    try {
        // 所有 SDK 初始化代码
    } catch (e: Exception) {
        // 记录错误但不崩溃
        nativeLog(this, "PrivacyVerify", "!!! SDK 初始化失败: ${e.message}")
        nativeLog(this, "PrivacyVerify", "!!! 堆栈: ${e.stackTraceToString()}")
        isSdkInitialized = true  // 避免重复调用
    }
}
```

### 2. 全局异常处理器

```kotlin
Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
    nativeLog(this, "CrashHandler", "未捕获异常: ${throwable.message}")
    nativeLog(this, "CrashHandler", "堆栈: ${throwable.stackTraceToString()}")
    defaultHandler?.uncaughtException(thread, throwable)
}
```

### 3. 文件 I/O 保护

```kotlin
fun nativeLog(context: Context, tag: String, message: String) {
    try {
        val logFile = File(context.cacheDir, NATIVE_LOG_FILE)
        logFile.appendText(line)
    } catch (e: Exception) {
        // 写文件失败不影响主流程
    }
}
```

---

## 测试步骤

### 测试 1：首次启动（未同意）

```bash
# 清除数据
adb shell pm clear com.optibot.cn

# 启动应用
adb shell am start -n com.optibot.cn/.PrivacyConsentActivity

# 观察
# ✅ 应该看到隐私政策弹窗
# ❌ 不应崩溃
```

**预期结果**：
- 应用正常启动
- 显示隐私政策弹窗
- 没有崩溃

### 测试 2：点击"同意"

```bash
# 在隐私政策弹窗中点击"同意"

# 观察 logcat
adb logcat | grep -E "PrivacyVerify|CrashHandler"
```

**预期结果**：
- 看到所有 SDK 初始化日志
- 没有 "SDK 初始化失败" 日志
- 没有 "未捕获异常" 日志
- MainActivity 正常启动

### 测试 3：点击"不同意"

```bash
# 清除数据后重新启动
adb shell pm clear com.optibot.cn
adb shell am start -n com.optibot.cn/.PrivacyConsentActivity

# 点击"不同意"
```

**预期结果**：
- 应用直接关闭（`finish()`）
- 没有崩溃
- 没有异常日志

### 测试 4：第二次启动（已同意）

```bash
# 在测试 2 之后，直接重新启动应用
adb shell am start -n com.optibot.cn/.MainActivity

# 观察
```

**预期结果**：
- 直接跳过隐私政策弹窗
- SDK 立即初始化
- 应用正常启动
- 没有崩溃

### 测试 5：Deep Link 绕过测试

```bash
# 清除数据
adb shell pm clear com.optibot.cn

# 尝试通过 Deep Link 直接启动 MainActivity
adb shell am start -a android.intent.action.VIEW -d "dedalix://test" com.optibot.cn

# 观察
```

**预期结果**：
- MainActivity 检测到未同意
- 自动跳转到 PrivacyConsentActivity
- 没有崩溃

---

## 如果发生崩溃

### 步骤 1：收集崩溃日志

```bash
# 查看完整崩溃堆栈
adb logcat -d | grep -A 50 "FATAL EXCEPTION"

# 查看我们的日志
adb logcat -d | grep -E "PrivacyVerify|CrashHandler"

# 保存到文件
adb logcat -d > crash_log.txt
```

### 步骤 2：分析崩溃原因

#### 常见崩溃场景 1：SDK 未初始化

**错误信息**：
```
NullPointerException: OkHttpClient not initialized
```

**原因**：
- 在同意前有代码尝试使用 OkHttpClient

**解决**：
- 检查是否有代码在 `Application.onCreate()` 中直接调用网络请求
- 确认所有网络调用都在 React Native 启动后

#### 常见崩溃场景 2：SoLoader 未初始化

**错误信息**：
```
UnsatisfiedLinkError: Native library not loaded
```

**原因**：
- React Native 尝试加载原生库，但 SoLoader 未初始化

**解决**：
- 确认 MainActivity 只在用户同意后才启动
- 检查 `MainActivity.onCreate()` 中的同意检查

#### 常见崩溃场景 3：TurboLog 未初始化

**错误信息**：
```
IllegalStateException: TurboLog not configured
```

**原因**：
- 在同意前有代码调用 TurboLog

**解决**：
- 检查是否有代码在 `Application.onCreate()` 中直接调用 TurboLog
- 使用 `nativeLog()` 替代

### 步骤 3：临时回滚

如果崩溃严重，可以临时回滚到原来的行为：

```kotlin
// MainApplication.kt
override fun onCreate() {
    super.onCreate()
    
    // 临时回滚：始终初始化 SDK（不检查同意状态）
    initializeSdk()
}
```

---

## 监控崩溃

### 方法 1：实时查看 logcat

```bash
# 监控所有崩溃相关日志
adb logcat | grep -E "FATAL|AndroidRuntime|PrivacyVerify|CrashHandler"
```

### 方法 2：使用崩溃报告工具

如果应用集成了 Crashlytics 或其他崩溃报告工具，查看：
- 崩溃堆栈
- 崩溃前的日志（包括我们的 PrivacyVerify 日志）
- 设备信息

### 方法 3：查看原生日志文件

```bash
# 即使应用崩溃，原生日志文件仍然保留
adb shell run-as com.optibot.cn cat cache/native_privacy.log

# 或拉取到本地
adb exec-out run-as com.optibot.cn cat cache/native_privacy.log > native_log.txt
```

---

## 常见问题

### Q1: 应用启动后立即崩溃

**可能原因**：
1. `getSharedPreferences()` 失败
2. `File()` 创建失败
3. 某个 SDK 初始化时立即崩溃

**排查步骤**：
```bash
# 1. 查看崩溃堆栈
adb logcat -d | grep -A 30 "FATAL EXCEPTION"

# 2. 查看我们的日志（如果写入了）
adb shell run-as com.optibot.cn cat cache/native_privacy.log
```

**解决方案**：
- 如果是 SharedPreferences 失败，检查权限
- 如果是 SDK 初始化失败，查看具体哪个 SDK
- 临时回滚到原来的初始化方式

### Q2: 点击"同意"后崩溃

**可能原因**：
1. `initializeSdk()` 中某个 SDK 初始化失败
2. MainActivity 启动失败
3. React Native 初始化失败

**排查步骤**：
```bash
# 查看崩溃前的最后日志
adb logcat -d | grep -B 5 "FATAL EXCEPTION"
```

**解决方案**：
- 查看 try-catch 是否捕获了异常（应该看到 "SDK 初始化失败"）
- 如果没有捕获，说明崩溃在 try-catch 之外
- 检查 MainActivity 的初始化代码

### Q3: 应用启动很慢

**可能原因**：
- 延迟初始化 SDK 需要时间
- 首次启动需要显示隐私政策弹窗

**这是正常的**：
- 首次启动：显示隐私政策 → 用户同意 → 初始化 SDK → 启动 React Native
- 后续启动：检查同意状态 → 初始化 SDK → 启动 React Native

### Q4: Deep Link 无法正常工作

**可能原因**：
- MainActivity 检测到未同意，跳转到 PrivacyConsentActivity
- 用户同意后需要重新触发 Deep Link

**解决方案**：
- 这是预期行为（隐私合规要求）
- 用户同意后，Deep Link 应该正常工作

---

## 回滚方案

如果修改导致严重问题，可以快速回滚：

### 方案 1：恢复原来的初始化方式

```kotlin
// MainApplication.kt
override fun onCreate() {
    super.onCreate()
    
    // 删除同意检查，直接初始化
    val tempFolder = File(applicationContext.cacheDir, RealPathUtil.CACHE_DIR_NAME)
    RealPathUtil.deleteTempFiles(tempFolder)
    TurboLog.configure(...)
    OkHttpClientProvider.setOkHttpClientFactory(RCTOkHttpClientFactory())
    // ... 其他初始化代码
}
```

### 方案 2：保留同意检查，但简化初始化

```kotlin
override fun onCreate() {
    super.onCreate()
    
    val hasConsent = getSharedPreferences(...)
    
    if (hasConsent) {
        // 只初始化必需的 SDK
        SoLoader.init(this, OpenSourceMergedSoMapping)
        ApplicationLifecycleDispatcher.onApplicationCreate(this)
    }
}
```

---

## 测试清单

在发布前，完成以下测试：

```markdown
## 基础功能测试
- [ ] 首次启动不崩溃
- [ ] 点击"同意"不崩溃
- [ ] 点击"不同意"不崩溃
- [ ] 第二次启动不崩溃
- [ ] Deep Link 不崩溃

## 日志验证
- [ ] 看到 "Application.onCreate === hasConsent=false"（首次）
- [ ] 看到 "SDK 初始化已延迟"（首次）
- [ ] 看到 "用户点击同意"（点击同意后）
- [ ] 看到所有 SDK 初始化日志
- [ ] 没有 "SDK 初始化失败" 日志
- [ ] 没有 "未捕获异常" 日志

## 功能验证
- [ ] 隐私政策弹窗正常显示
- [ ] "同意"按钮正常工作
- [ ] "不同意"按钮正常关闭应用
- [ ] MainActivity 正常启动
- [ ] React Native 正常加载
- [ ] 网络请求正常工作
- [ ] 推送通知正常工作

## 压力测试
- [ ] 连续启动 10 次不崩溃
- [ ] 快速点击"同意"不崩溃
- [ ] 在低端设备上正常启动
- [ ] 在网络不佳时正常启动
```

---

## 联系支持

如果遇到无法解决的问题：

1. **收集完整日志**
   ```bash
   adb logcat -d > full_log.txt
   adb shell run-as com.optibot.cn cat cache/native_privacy.log > native_log.txt
   ```

2. **记录复现步骤**
   - 设备型号
   - Android 版本
   - 操作步骤
   - 崩溃时机

3. **提交问题报告**
   - 附上日志文件
   - 描述问题现象
   - 说明预期行为
