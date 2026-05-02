# 扫一扫 - 图片扫码支持说明

## 当前状态

扫一扫功能已添加"从相册选择"按钮，但图片扫码功能需要原生模块支持。

## 为什么需要原生支持？

`react-native-vision-camera` 的代码扫描器仅支持实时相机流，不支持静态图片扫描。

经过调研发现：
- `@mgcrea/vision-camera-barcode-scanner` - 仅支持实时相机扫描，不支持图片
- `vision-camera-code-scanner` - 已归档，不再维护

要实现图片扫码，必须使用平台原生 API：
- **Android**: Google MLKit Vision Barcode Scanning
- **iOS**: Apple Vision Framework

## 实现方案

### 方案 1: 创建原生模块（推荐）

这是唯一可行的方案，需要为 Android 和 iOS 分别实现原生代码。

### 具体实现步骤

#### Android (使用 MLKit)

1. 在 `android/app/build.gradle` 添加依赖：
```gradle
dependencies {
    implementation 'com.google.mlkit:barcode-scanning:17.2.0'
}
```

2. 创建原生模块 `QRCodeScannerModule.kt`:
```kotlin
package com.mattermost.rnbeta

import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.*
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.io.File

class QRCodeScannerModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "QRCodeScanner"

    @ReactMethod
    fun scanImageAtPath(imagePath: String, promise: Promise) {
        try {
            val uri = Uri.parse(imagePath)
            val image = InputImage.fromFilePath(reactApplicationContext, uri)
            
            val scanner = BarcodeScanning.getClient()
            scanner.process(image)
                .addOnSuccessListener { barcodes ->
                    if (barcodes.isEmpty()) {
                        promise.resolve(null)
                        return@addOnSuccessListener
                    }
                    
                    val results = Arguments.createArray()
                    for (barcode in barcodes) {
                        val result = Arguments.createMap()
                        result.putString("value", barcode.rawValue)
                        result.putString("type", getBarcodeType(barcode.valueType))
                        results.pushMap(result)
                    }
                    promise.resolve(results)
                }
                .addOnFailureListener { e ->
                    promise.reject("SCAN_ERROR", e.message)
                }
        } catch (e: Exception) {
            promise.reject("SCAN_ERROR", e.message)
        }
    }

    private fun getBarcodeType(type: Int): String {
        return when (type) {
            Barcode.TYPE_URL -> "url"
            Barcode.TYPE_TEXT -> "text"
            Barcode.TYPE_EMAIL -> "email"
            Barcode.TYPE_PHONE -> "phone"
            else -> "unknown"
        }
    }
}
```

#### iOS (使用 Vision Framework)

创建原生模块 `QRCodeScannerModule.swift`:

```swift
import Foundation
import Vision
import UIKit

@objc(QRCodeScannerModule)
class QRCodeScannerModule: NSObject {
    
    @objc
    func scanImageAtPath(_ imagePath: String, 
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        guard let url = URL(string: imagePath),
              let image = UIImage(contentsOfFile: url.path),
              let cgImage = image.cgImage else {
            reject("INVALID_IMAGE", "Cannot load image", nil)
            return
        }
        
        let request = VNDetectBarcodesRequest { request, error in
            if let error = error {
                reject("SCAN_ERROR", error.localizedDescription, error)
                return
            }
            
            guard let results = request.results as? [VNBarcodeObservation],
                  !results.isEmpty else {
                resolve(NSNull())
                return
            }
            
            var codes: [[String: Any]] = []
            for observation in results {
                if let payload = observation.payloadStringValue {
                    codes.append([
                        "value": payload,
                        "type": self.getBarcodeType(observation.symbology)
                    ])
                }
            }
            resolve(codes)
        }
        
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
        } catch {
            reject("SCAN_ERROR", error.localizedDescription, error)
        }
    }
    
    private func getBarcodeType(_ symbology: VNBarcodeSymbology) -> String {
        switch symbology {
        case .qr: return "qr"
        case .ean13: return "ean-13"
        case .ean8: return "ean-8"
        case .code128: return "code-128"
        default: return "unknown"
        }
    }
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
```

## 在 React Native 中使用原生模块

修改 `handlePickImage` 函数：

```typescript
import {NativeModules} from 'react-native';
const {QRCodeScanner} = NativeModules;

const handlePickImage = useCallback(() => {
    launchImageLibrary({
        mediaType: 'photo',
        quality: 1,
    }, async (response) => {
        if (response.didCancel || response.errorCode) {
            return;
        }

        if (response.assets && response.assets.length > 0) {
            const asset = response.assets[0];
            try {
                const codes = await QRCodeScanner.scanImageAtPath(asset.uri);
                if (codes && codes.length > 0) {
                    const code = codes[0];
                    logInfo('从图片扫描到:', code.value);
                    // 处理扫描结果...
                } else {
                    Alert.alert('未识别到二维码', '图片中未找到二维码或条形码');
                }
            } catch (error) {
                logInfo('扫描图片失败:', error);
                Alert.alert('扫描失败', '无法识别图片中的二维码');
            }
        }
    });
}, []);
```

## 推荐实现步骤

1. 评估是否需要图片扫码功能（大多数用户使用实时扫描）
2. 如果需要，优先考虑使用第三方库
3. 如果需要自定义，创建原生模块
4. 在 iOS 和 Android 上分别测试

## 参考资源

- [Google MLKit Barcode Scanning](https://developers.google.com/ml-kit/vision/barcode-scanning)
- [Apple Vision Framework](https://developer.apple.com/documentation/vision)
- [React Native Native Modules](https://reactnative.dev/docs/native-modules-intro)
