// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package com.mattermost.rnbeta

import android.net.Uri
import com.facebook.react.bridge.*
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage

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
                        result.putString("value", barcode.rawValue ?: barcode.displayValue)
                        result.putString("type", getBarcodeTypeName(barcode.format))
                        result.putInt("format", barcode.format)
                        
                        // 添加边界框信息
                        barcode.boundingBox?.let { box ->
                            val boundingBox = Arguments.createMap()
                            boundingBox.putInt("left", box.left)
                            boundingBox.putInt("top", box.top)
                            boundingBox.putInt("right", box.right)
                            boundingBox.putInt("bottom", box.bottom)
                            result.putMap("boundingBox", boundingBox)
                        }
                        
                        results.pushMap(result)
                    }
                    promise.resolve(results)
                }
                .addOnFailureListener { e ->
                    promise.reject("SCAN_ERROR", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("SCAN_ERROR", e.message, e)
        }
    }

    private fun getBarcodeTypeName(format: Int): String {
        return when (format) {
            Barcode.FORMAT_QR_CODE -> "qr"
            Barcode.FORMAT_EAN_13 -> "ean-13"
            Barcode.FORMAT_EAN_8 -> "ean-8"
            Barcode.FORMAT_CODE_128 -> "code-128"
            Barcode.FORMAT_CODE_39 -> "code-39"
            Barcode.FORMAT_CODE_93 -> "code-93"
            Barcode.FORMAT_CODABAR -> "codabar"
            Barcode.FORMAT_DATA_MATRIX -> "data-matrix"
            Barcode.FORMAT_AZTEC -> "aztec"
            Barcode.FORMAT_PDF417 -> "pdf-417"
            Barcode.FORMAT_ITF -> "itf"
            Barcode.FORMAT_UPC_A -> "upc-a"
            Barcode.FORMAT_UPC_E -> "upc-e"
            else -> "unknown"
        }
    }
}
