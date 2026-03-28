package com.mattermost.voicerecorder

import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.IOException

class VoiceRecorderModuleImpl(
    private val reactContext: ReactApplicationContext
) {
    companion object {
        const val NAME = "VoiceRecorder"
        private const val TAG = "VoiceRecorder"
    }

    private var mediaRecorder: MediaRecorder? = null
    private var recordingFilePath: String? = null
    private var recordingStartTime: Long = 0

    fun getTypedExportedConstants(): MutableMap<String, Any> {
        return mutableMapOf()
    }

    /**
     * 开始录音
     * @param format - 录音格式，可选：'aac' 或 'amr' (默认)
     * @param promise - Promise 回调
     */
    fun startRecording(format: String?, promise: Promise) {
        Log.d(TAG, "========== 开始录音流程 ==========")
        Log.d(TAG, "请求参数 - format: $format")
        
        try {
            Log.d(TAG, "步骤1：停止之前的录音（如果有）")
            stopRecordingInternal()

            Log.d(TAG, "步骤2：创建录音文件")
            val outputDir = reactContext.cacheDir
            val fileExtension = if (format == "aac") ".m4a" else ".amr"
            val outputFile = File.createTempFile("voice_", fileExtension, outputDir)
            recordingFilePath = outputFile.absolutePath
            Log.d(TAG, "录音文件路径: $recordingFilePath")
            Log.d(TAG, "录音格式: ${if (format == "aac") "AAC" else "AMR"}")

            Log.d(TAG, "步骤3：初始化 MediaRecorder")
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Log.d(TAG, "使用新的 MediaRecorder API (Android 12+)")
                MediaRecorder(reactContext)
            } else {
                Log.d(TAG, "使用旧的 MediaRecorder API (Android 11及以下)")
                @Suppress("DEPRECATION")
                MediaRecorder()
            }

            Log.d(TAG, "步骤4：配置音频源")
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            Log.d(TAG, "音频源已设置为: MIC")

            if (format == "aac") {
                Log.d(TAG, "步骤5：配置 AAC 格式参数")
                recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                recorder.setAudioEncodingBitRate(128000)
                recorder.setAudioSamplingRate(44100)
                Log.d(TAG, "AAC 配置 - 比特率: 128000, 采样率: 44100")
            } else {
                Log.d(TAG, "步骤5：配置 AMR 格式参数")
                recorder.setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB)
                Log.d(TAG, "AMR 配置 - 编码器: AMR_NB")
            }

            Log.d(TAG, "步骤6：设置输出文件")
            recorder.setOutputFile(recordingFilePath)

            Log.d(TAG, "步骤7：准备录音器")
            recorder.prepare()
            Log.d(TAG, "录音器准备完成")

            Log.d(TAG, "步骤8：开始录音")
            recorder.start()
            Log.d(TAG, "录音已开始")

            mediaRecorder = recorder
            recordingStartTime = System.currentTimeMillis()
            Log.d(TAG, "录音开始时间: $recordingStartTime")
            
            Log.d(TAG, "========== 录音启动成功 ==========")
            promise.resolve(true)
        } catch (e: IOException) {
            Log.e(TAG, "录音启动失败 - IOException", e)
            Log.e(TAG, "错误信息: ${e.message}")
            promise.reject("RECORD_ERROR", "Failed to start recording: ${e.message}", e)
        } catch (e: Exception) {
            Log.e(TAG, "录音启动失败 - 未知异常", e)
            Log.e(TAG, "错误信息: ${e.message}")
            promise.reject("RECORD_ERROR", "Failed to start recording: ${e.message}", e)
        }
    }

    fun stopRecording(promise: Promise) {
        Log.d(TAG, "========== 停止录音流程 ==========")
        val result = Arguments.createMap()

        try {
            val recorder = mediaRecorder
            if (recorder == null) {
                Log.w(TAG, "没有活跃的录音")
                result.putBoolean("success", false)
                result.putString("error", "No active recording")
                promise.resolve(result)
                return
            }

            Log.d(TAG, "停止录音器")
            recorder.stop()
            Log.d(TAG, "录音已停止")

            Log.d(TAG, "释放录音器资源")
            recorder.release()
            Log.d(TAG, "录音器资源已释放")

            val duration = if (recordingStartTime > 0) {
                val currentTime = System.currentTimeMillis()
                val durationMs = currentTime - recordingStartTime
                Log.d(TAG, "录音时长: ${durationMs}ms")
                durationMs.toInt()
            } else {
                Log.w(TAG, "录音开始时间无效，时长设为0")
                0
            }

            result.putBoolean("success", true)
            result.putString("filePath", recordingFilePath)
            result.putInt("durationMs", duration)
            Log.d(TAG, "录音文件路径: $recordingFilePath")
            Log.d(TAG, "========== 停止录音成功 ==========")
        } catch (e: Exception) {
            Log.e(TAG, "停止录音失败", e)
            Log.e(TAG, "错误信息: ${e.message}")
            deleteRecordingFile()
            result.putBoolean("success", false)
            result.putString("error", e.message)
        } finally {
            mediaRecorder = null
            recordingStartTime = 0
            Log.d(TAG, "重置录音状态")
        }

        promise.resolve(result)
    }

    fun cancelRecording(promise: Promise) {
        Log.d(TAG, "========== 取消录音流程 ==========")
        Log.d(TAG, "停止录音并删除文件")
        stopRecordingInternal()
        Log.d(TAG, "删除录音文件: $recordingFilePath")
        deleteRecordingFile()
        Log.d(TAG, "========== 取消录音完成 ==========")
        promise.resolve(null)
    }

    private fun stopRecordingInternal() {
        Log.d(TAG, "[内部方法] 停止录音器")
        val recorder = mediaRecorder ?: return
        Log.d(TAG, "[内部方法] 录音器状态: ${recorder != null}")

        try {
            Log.d(TAG, "[内部方法] 调用 stop()")
            recorder.stop()
            Log.d(TAG, "[内部方法] stop() 调用成功")
        } catch (e: Exception) {
            Log.e(TAG, "[内部方法] stop() 调用失败", e)
        }

        try {
            Log.d(TAG, "[内部方法] 调用 release()")
            recorder.release()
            Log.d(TAG, "[内部方法] release() 调用成功")
        } catch (e: Exception) {
            Log.e(TAG, "[内部方法] release() 调用失败", e)
        }

        mediaRecorder = null
        recordingStartTime = 0
        Log.d(TAG, "[内部方法] 录音器已重置")
    }

    private fun deleteRecordingFile() {
        val path = recordingFilePath ?: return
        Log.d(TAG, "[内部方法] 删除录音文件")
        Log.d(TAG, "[内部方法] 文件路径: $path")
        try {
            val file = File(path)
            if (file.exists()) {
                Log.d(TAG, "[内部方法] 文件存在，准备删除")
                val deleted = file.delete()
                Log.d(TAG, "[内部方法] 文件删除${if (deleted) "成功" else "失败"}")
            } else {
                Log.w(TAG, "[内部方法] 文件不存在: $path")
            }
        } catch (e: Exception) {
            Log.e(TAG, "[内部方法] 删除文件失败", e)
        }
        recordingFilePath = null
    }

    /**
     * 删除指定的录音文件
     * @param filePath - 要删除的文件路径
     * @param promise - Promise 回调
     */
    fun deleteRecordingFile(filePath: String, promise: Promise) {
        Log.d(TAG, "========== 删除指定录音文件 ==========")
        Log.d(TAG, "文件路径: $filePath")
        try {
            val file = File(filePath)
            if (!file.exists()) {
                Log.w(TAG, "文件不存在: $filePath")
                promise.resolve(false)
                return
            }
            
            val success = file.delete()
            Log.d(TAG, "文件删除${if (success) "成功" else "失败"}")
            promise.resolve(success)
        } catch (e: Exception) {
            Log.e(TAG, "删除文件失败", e)
            Log.e(TAG, "错误信息: ${e.message}")
            promise.resolve(false)
        }
        Log.d(TAG, "========== 删除文件完成 ==========")
    }

    /**
     * 清理指定前缀的过期临时录音文件
     * @param prefix - 文件前缀
     * @param maxAgeMs - 文件最大保留时间（毫秒）
     * @param promise - Promise 回调
     */
    fun cleanExpiredRecordingFiles(prefix: String, maxAgeMs: Double, promise: Promise) {
        Log.d(TAG, "========== 清理过期录音文件 ==========")
        Log.d(TAG, "文件前缀: $prefix")
        Log.d(TAG, "最大保留时间: ${maxAgeMs}ms")
        
        var deletedCount = 0
        try {
            val outputDir = reactContext.cacheDir
            Log.d(TAG, "缓存目录: ${outputDir.absolutePath}")
            
            val files = outputDir.listFiles()
            if (files == null) {
                Log.w(TAG, "无法列出缓存目录文件")
                promise.resolve(0)
                return
            }
            
            Log.d(TAG, "缓存目录文件总数: ${files.size}")
            val currentTime = System.currentTimeMillis()

            for (file in files) {
                if (file.name.startsWith(prefix)) {
                    val fileAgeMs = currentTime - file.lastModified()
                    Log.d(TAG, "检查文件: ${file.name}, 年龄: ${fileAgeMs}ms")
                    
                    if (fileAgeMs > maxAgeMs) {
                        val deleted = file.delete()
                        if (deleted) {
                            deletedCount++
                            Log.d(TAG, "已删除过期文件: ${file.name}")
                        } else {
                            Log.w(TAG, "删除文件失败: ${file.name}")
                        }
                    }
                }
            }
            
            Log.d(TAG, "总共删除了 $deletedCount 个过期文件")
        } catch (e: Exception) {
            Log.e(TAG, "清理过期文件失败", e)
            Log.e(TAG, "错误信息: ${e.message}")
        }
        
        Log.d(TAG, "========== 清理完成，共删除 $deletedCount 个文件 ==========")
        promise.resolve(deletedCount)
    }
}
