// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package com.mattermost.rnbeta

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import java.io.FileInputStream
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

    @ReactMethod
    fun getImageBrightness(imagePath: String, promise: Promise) {
        try {
            val uri = Uri.parse(imagePath)
            val inputStream = if (uri.scheme == null) {
                FileInputStream(imagePath)
            } else {
                reactApplicationContext.contentResolver.openInputStream(uri)
            }
            if (inputStream == null) {
                promise.resolve(null)
                return
            }

            val options = BitmapFactory.Options().apply {
                inPreferredConfig = android.graphics.Bitmap.Config.ARGB_8888
                inSampleSize = 8
            }

            val bitmap = inputStream.use { stream ->
                BitmapFactory.decodeStream(stream, null, options)
            }

            if (bitmap == null) {
                promise.resolve(null)
                return
            }

            val width = bitmap.width
            val height = bitmap.height
            if (width <= 0 || height <= 0) {
                bitmap.recycle()
                promise.resolve(null)
                return
            }

            val startX = (width * 0.2).toInt().coerceIn(0, width - 1)
            val endX = (width * 0.8).toInt().coerceIn(startX + 1, width)
            val startY = (height * 0.2).toInt().coerceIn(0, height - 1)
            val endY = (height * 0.8).toInt().coerceIn(startY + 1, height)

            var lumaSum = 0.0
            var count = 0
            val step = 2

            var y = startY
            while (y < endY) {
                var x = startX
                while (x < endX) {
                    val pixel = bitmap.getPixel(x, y)
                    val r = Color.red(pixel)
                    val g = Color.green(pixel)
                    val b = Color.blue(pixel)
                    lumaSum += (0.299 * r) + (0.587 * g) + (0.114 * b)
                    count += 1
                    x += step
                }
                y += step
            }

            bitmap.recycle()
            if (count == 0) {
                promise.resolve(null)
                return
            }

            promise.resolve(lumaSum / count)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun getAmbientLightLevel(promise: Promise) {
        val sensorManager = reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        if (sensorManager == null) {
            promise.resolve(null)
            return
        }

        val lightSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT)
        if (lightSensor == null) {
            promise.resolve(null)
            return
        }

        val mainHandler = Handler(Looper.getMainLooper())
        var resolved = false

        lateinit var listener: SensorEventListener
        val timeoutRunnable = Runnable {
            if (resolved) {
                return@Runnable
            }

            resolved = true
            sensorManager.unregisterListener(listener)
            promise.resolve(null)
        }

        listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent?) {
                if (resolved) {
                    return
                }

                resolved = true
                sensorManager.unregisterListener(this)
                mainHandler.removeCallbacks(timeoutRunnable)

                val lux = event?.values?.firstOrNull()
                promise.resolve(lux?.toDouble())
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }

        val registered = sensorManager.registerListener(listener, lightSensor, SensorManager.SENSOR_DELAY_NORMAL)
        if (!registered) {
            promise.resolve(null)
            return
        }

        mainHandler.postDelayed(timeoutRunnable, 600)
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
