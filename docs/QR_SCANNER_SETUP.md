# 扫一扫功能 - 设置说明

## 功能概述

扫一扫功能支持：
- ✅ 实时相机扫描二维码和条形码
- ✅ 从相册选择图片进行扫描
- ✅ 自动识别并打开 URL 链接
- ✅ 扫描结果打印到控制台

## 安装步骤

### 1. 安装 npm 依赖

```bash
npm install
```

### 2. Android 配置

已完成以下配置：
- ✅ `android/gradle.properties` 中添加了 `VisionCamera_enableCodeScanner=true`
- ✅ `android/app/build.gradle` 中添加了 MLKit 依赖
- ✅ `AndroidManifest.xml` 中已有相机权限

**重新编译 Android 应用：**
```bash
npm run android
```

### 3. iOS 配置

已完成以下配置：
- ✅ `Info.plist` 中已有相机权限说明
- ✅ 创建了原生模块代码

**安装 iOS 依赖并编译：**
```bash
cd ios
pod install
cd ..
npm run ios
```

## 原生模块说明

### Android 模块
- `QRCodeScannerModule.kt` - 使用 Google MLKit 扫描图片
- `QRCodeScannerPackage.kt` - 注册模块
- 已在 `MainApplication.kt` 中注册

### iOS 模块
- `QRCodeScannerModule.swift` - 使用 Apple Vision Framework
- `QRCodeScannerModule.m` - Objective-C 桥接

## 使用方式

1. 打开应用
2. 点击左上角 **+** 按钮
3. 选择"扫一扫"
4. 扫描方式：
   - **实时扫描**：将二维码放入扫描框
   - **图片扫描**：点击底部"从相册选择"按钮

## 扫描结果处理

扫描成功后：
1. 数据打印到控制台（包括类型、内容、坐标）
2. 如果是 URL，自动尝试打开
3. 延迟 500ms 后自动关闭扫描界面

## 故障排除

### 问题：点击"从相册选择"后提示"功能不可用"

**原因**：原生模块还未编译到应用中

**解决方案**：
```bash
# Android
npm run android

# iOS
cd ios && pod install && cd .. && npm run ios
```

### 问题：相机无法启动

**检查项**：
1. 确认已授予相机权限
2. 检查设备是否有后置摄像头
3. 查看控制台日志

### 问题：图片扫描失败

**可能原因**：
1. 图片不清晰
2. 二维码/条形码被遮挡
3. 图片格式不支持

**建议**：使用实时相机扫描，效果更好

## 支持的码类型

- QR Code（二维码）
- EAN-13 / EAN-8
- Code-128 / Code-39 / Code-93
- Aztec
- Data Matrix
- PDF-417
- UPC-E

## 技术栈

- `react-native-vision-camera` v4.7.3 - 实时相机扫描
- `react-native-image-picker` - 相册选择
- Google MLKit (Android) - 图片扫描
- Apple Vision Framework (iOS) - 图片扫描
