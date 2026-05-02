package com.mattermost.voicerecorder

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException

class VoiceRecorderModuleImpl(
    private val reactContext: ReactApplicationContext,
) {
    companion object {
        const val NAME = "VoiceRecorder"
        private const val TAG = "VoiceRecorder"
    }

    private val mutex = Mutex()
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var mediaRecorder: MediaRecorder? = null
    private var recordingFilePath: String? = null
    private var recordingStartTime: Long = 0

    fun getTypedExportedConstants(): MutableMap<String, Any> {
        return mutableMapOf()
    }

    private fun hasRecordPermission(): Boolean {
        return reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun deleteFileAtPath(path: String): Boolean {
        return try {
            val file = File(path)
            when {
                !file.exists() -> false
                file.delete() -> true
                else -> false
            }
        } catch (e: Exception) {
            Log.e(TAG, "[deleteFileAtPath] failed: $path", e)
            false
        }
    }

    fun invalidate() {
        Log.d(TAG, "invalidate: cancel scope and release recorder")
        coroutineScope.cancel()
        runBlocking {
            mutex.withLock {
                stopRecordingInternalLocked()
                deleteRecordingFileLocked()
            }
        }
    }

    fun startRecording(options: ReadableMap?, promise: Promise) {
        Log.d(TAG, "========== 开始录音流程 ==========")
        val format = options?.getString("format")
        val prefix = options?.getString("prefix")
        Log.d(TAG, "请求参数 - format: $format, prefix: $prefix")

        coroutineScope.launch {
            if (!hasRecordPermission()) {
                Log.e(TAG, "RECORD_AUDIO not granted")
                withContext(Dispatchers.Main) {
                    promise.reject("PERMISSION_DENIED", "Microphone permission not granted")
                }
                return@launch
            }

            try {
                mutex.withLock {
                    if (mediaRecorder != null) {
                        Log.d(TAG, "停止之前的录音")
                        stopRecordingInternalLocked()
                    }

                    val outputDir = reactContext.cacheDir
                    val fileExtension = if (format == "aac") ".m4a" else ".amr"
                    val filePrefix = prefix ?: "voice_"
                    val outputFile = File.createTempFile(filePrefix, fileExtension, outputDir)
                    recordingFilePath = outputFile.absolutePath
                    Log.d(TAG, "录音文件路径: $recordingFilePath")

                    val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        MediaRecorder(reactContext)
                    } else {
                        @Suppress("DEPRECATION")
                        MediaRecorder()
                    }

                    try {
                        recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
                        if (format == "aac") {
                            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                            recorder.setAudioEncodingBitRate(128000)
                            recorder.setAudioSamplingRate(44100)
                        } else {
                            recorder.setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
                            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB)
                        }
                        recorder.setOutputFile(recordingFilePath)
                        recorder.prepare()
                        recorder.start()
                        mediaRecorder = recorder
                        recordingStartTime = System.currentTimeMillis()
                        Log.d(TAG, "========== 录音启动成功 ==========")
                    } catch (e: Exception) {
                        Log.e(TAG, "录音启动失败，释放 MediaRecorder", e)
                        try {
                            recorder.release()
                        } catch (releaseEx: Exception) {
                            Log.e(TAG, "release() after start failure", releaseEx)
                        }
                        deleteRecordingFileLocked()
                        throw e
                    }
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(true)
                }
            } catch (e: SecurityException) {
                Log.e(TAG, "录音启动 SecurityException", e)
                withContext(Dispatchers.Main) {
                    promise.reject(
                        "PERMISSION_DENIED",
                        "Microphone permission denied: ${e.message}",
                        e,
                    )
                }
            } catch (e: IOException) {
                Log.e(TAG, "录音启动 IOException", e)
                withContext(Dispatchers.Main) {
                    promise.reject("RECORD_ERROR", "Failed to start recording: ${e.message}", e)
                }
            } catch (e: Exception) {
                Log.e(TAG, "录音启动失败", e)
                withContext(Dispatchers.Main) {
                    promise.reject("RECORD_ERROR", "Failed to start recording: ${e.message}", e)
                }
            }
        }
    }

    fun stopRecording(promise: Promise) {
        Log.d(TAG, "========== 停止录音流程 ==========")

        coroutineScope.launch {
            val result = Arguments.createMap()
            mutex.withLock {
                val recorder = mediaRecorder
                if (recorder == null) {
                    Log.w(TAG, "没有活跃的录音")
                    result.putBoolean("success", false)
                    result.putString("error", "No active recording")
                } else {
                    val savedPath = recordingFilePath
                    val startTimeMs = recordingStartTime
                    var stopOk = true

                    try {
                        try {
                            recorder.stop()
                            Log.d(TAG, "录音已停止")
                        } catch (e: IllegalStateException) {
                            Log.e(TAG, "recorder.stop() IllegalStateException", e)
                            stopOk = false
                        } catch (e: RuntimeException) {
                            Log.e(TAG, "recorder.stop() failed", e)
                            stopOk = false
                        }

                        try {
                            recorder.release()
                            Log.d(TAG, "录音器资源已释放")
                        } catch (e: Exception) {
                            Log.e(TAG, "recorder.release() failed", e)
                        }

                        mediaRecorder = null
                        recordingStartTime = 0

                        if (!stopOk) {
                            savedPath?.let { deleteFileAtPath(it) }
                            recordingFilePath = null
                            result.putBoolean("success", false)
                            result.putString("error", "Failed to stop recording")
                        } else {
                            val durationMs = if (startTimeMs > 0) {
                                (System.currentTimeMillis() - startTimeMs).toInt()
                            } else {
                                Log.w(TAG, "录音开始时间无效，时长设为0")
                                0
                            }
                            result.putBoolean("success", true)
                            result.putString("filePath", savedPath)
                            result.putInt("durationMs", durationMs)
                            recordingFilePath = null
                            Log.d(TAG, "录音文件路径: $savedPath, 时长: ${durationMs}ms")
                            Log.d(TAG, "========== 停止录音成功 ==========")
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "停止录音失败", e)
                        savedPath?.let { deleteFileAtPath(it) }
                        recordingFilePath = null
                        mediaRecorder = null
                        recordingStartTime = 0
                        result.putBoolean("success", false)
                        result.putString("error", e.message)
                    }
                }
            }

            withContext(Dispatchers.Main) {
                promise.resolve(result)
            }
        }
    }

    fun cancelRecording(promise: Promise) {
        Log.d(TAG, "========== 取消录音流程 ==========")
        coroutineScope.launch {
            mutex.withLock {
                stopRecordingInternalLocked()
                deleteRecordingFileLocked()
            }
            Log.d(TAG, "========== 取消录音完成 ==========")
            withContext(Dispatchers.Main) {
                promise.resolve(null)
            }
        }
    }

    fun deleteRecordingFile(filePath: String, promise: Promise) {
        Log.d(TAG, "========== 删除指定录音文件 ==========")
        Log.d(TAG, "文件路径: $filePath")
        coroutineScope.launch {
            val success = mutex.withLock {
                val deleted = deleteFileAtPath(filePath)
                if (filePath == recordingFilePath) {
                    recordingFilePath = null
                }
                deleted
            }

            Log.d(TAG, "========== 删除文件完成 ==========")
            withContext(Dispatchers.Main) {
                promise.resolve(success)
            }
        }
    }

    fun cleanExpiredRecordingFiles(prefix: String, maxAgeMs: Double, promise: Promise) {
        Log.d(TAG, "========== 清理过期录音文件 ==========")
        Log.d(TAG, "文件前缀: $prefix, 最大保留时间: ${maxAgeMs}ms")
        coroutineScope.launch {
            var deletedCount = 0
            try {
                val activePath = mutex.withLock { recordingFilePath }
                val outputDir = reactContext.cacheDir
                val files = outputDir.listFiles()
                if (files != null) {
                    val currentTime = System.currentTimeMillis()
                    for (file in files) {
                        if (!file.name.startsWith(prefix)) {
                            continue
                        }
                        if (file.absolutePath == activePath) {
                            Log.d(TAG, "跳过当前录音文件: ${file.name}")
                            continue
                        }
                        val fileAgeMs = currentTime - file.lastModified()
                        if (fileAgeMs > maxAgeMs && file.delete()) {
                            deletedCount++
                            Log.d(TAG, "已删除过期文件: ${file.name}")
                        } else if (fileAgeMs > maxAgeMs) {
                            Log.w(TAG, "删除文件失败: ${file.name}")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "清理过期文件失败", e)
            }

            withContext(Dispatchers.Main) {
                promise.resolve(deletedCount)
            }
        }
    }

    private fun stopRecordingInternalLocked() {
        val recorder = mediaRecorder ?: return
        try {
            recorder.stop()
        } catch (e: IllegalStateException) {
            Log.e(TAG, "[内部] stop() IllegalStateException", e)
        } catch (e: Exception) {
            Log.e(TAG, "[内部] stop() 失败", e)
        }
        try {
            recorder.release()
        } catch (e: Exception) {
            Log.e(TAG, "[内部] release() 失败", e)
        }
        mediaRecorder = null
        recordingStartTime = 0
    }

    private fun deleteRecordingFileLocked() {
        val path = recordingFilePath ?: return
        deleteFileAtPath(path)
        recordingFilePath = null
    }
}
