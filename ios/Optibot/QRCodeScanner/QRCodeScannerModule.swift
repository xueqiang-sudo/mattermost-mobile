// Copyright (c) 2015-present Optibot, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Foundation
import Vision
import UIKit
import CoreImage

@objc(QRCodeScannerModule)
class QRCodeScannerModule: NSObject {
    
    @objc
    func scanImageAtPath(_ imagePath: String,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        // 处理不同的 URI 格式
        var imageURL: URL?
        if imagePath.hasPrefix("file://") {
            imageURL = URL(string: imagePath)
        } else if imagePath.hasPrefix("ph://") {
            // PHAsset URI，需要特殊处理
            reject("UNSUPPORTED_URI", "PHAsset URIs are not supported yet", nil)
            return
        } else {
            imageURL = URL(fileURLWithPath: imagePath)
        }
        
        guard let url = imageURL,
              let image = UIImage(contentsOfFile: url.path),
              let cgImage = image.cgImage else {
            reject("INVALID_IMAGE", "Cannot load image from path: \(imagePath)", nil)
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
                // payloadStringValue 由 Vision 框架解码，默认使用 UTF-8。
                // 对于使用 GBK/GB2312 编码的中国仓储条码，解码结果可能包含乱码。
                // 由于 iOS Vision 不提供 rawBytes 访问，乱码恢复由 JS 层处理。
                if let payload = observation.payloadStringValue {
                    var codeDict: [String: Any] = [
                        "value": payload,
                        "type": self.getBarcodeTypeName(observation.symbology),
                        "mayNeedEncodingRecovery": self.mayNeedEncodingRecovery(payload)
                    ]
                    
                    // 添加边界框信息
                    let boundingBox = observation.boundingBox
                    codeDict["boundingBox"] = [
                        "x": boundingBox.origin.x,
                        "y": boundingBox.origin.y,
                        "width": boundingBox.size.width,
                        "height": boundingBox.size.height
                    ]
                    
                    codes.append(codeDict)
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

    @objc
    func getImageBrightness(_ imagePath: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        var imageURL: URL?
        if imagePath.hasPrefix("file://") {
            imageURL = URL(string: imagePath)
        } else {
            imageURL = URL(fileURLWithPath: imagePath)
        }

        guard let url = imageURL,
              let ciImage = CIImage(contentsOf: url) else {
            resolve(NSNull())
            return
        }

        let extent = ciImage.extent
        let cropRect = CGRect(
            x: extent.origin.x + (extent.size.width * 0.2),
            y: extent.origin.y + (extent.size.height * 0.2),
            width: extent.size.width * 0.6,
            height: extent.size.height * 0.6
        )
        let extentVector = CIVector(x: cropRect.origin.x,
                                    y: cropRect.origin.y,
                                    z: cropRect.size.width,
                                    w: cropRect.size.height)
        guard let filter = CIFilter(name: "CIAreaAverage",
                                    parameters: [kCIInputImageKey: ciImage, kCIInputExtentKey: extentVector]) else {
            resolve(NSNull())
            return
        }

        guard let outputImage = filter.outputImage else {
            resolve(NSNull())
            return
        }

        var bitmap = [UInt8](repeating: 0, count: 4)
        let context = CIContext(options: nil)
        context.render(outputImage,
                       toBitmap: &bitmap,
                       rowBytes: 4,
                       bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                       format: .RGBA8,
                       colorSpace: CGColorSpaceCreateDeviceRGB())

        let r = Double(bitmap[0])
        let g = Double(bitmap[1])
        let b = Double(bitmap[2])
        let brightness = (0.299 * r) + (0.587 * g) + (0.114 * b)
        resolve(brightness)
    }
    
    private func getBarcodeTypeName(_ symbology: VNBarcodeSymbology) -> String {
        switch symbology {
        case .qr: return "qr"
        case .ean13: return "ean-13"
        case .ean8: return "ean-8"
        case .code128: return "code-128"
        case .code39: return "code-39"
        case .code93: return "code-93"
        case .aztec: return "aztec"
        case .dataMatrix: return "data-matrix"
        case .pdf417: return "pdf-417"
        case .upce: return "upc-e"
        default: return "unknown"
        }
    }
    
    /// 检测字符串是否可能需要编码恢复（包含 Unicode 替换字符 U+FFFD）
    private func mayNeedEncodingRecovery(_ str: String) -> Bool {
        return str.contains("")
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
