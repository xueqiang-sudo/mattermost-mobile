// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Foundation
import Vision
import UIKit

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
                if let payload = observation.payloadStringValue {
                    var codeDict: [String: Any] = [
                        "value": payload,
                        "type": self.getBarcodeTypeName(observation.symbology)
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
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
