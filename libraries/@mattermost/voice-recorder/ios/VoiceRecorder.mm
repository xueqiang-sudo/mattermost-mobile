#import "VoiceRecorder.h"
#import "VoiceRecorderWrapper.h"

@implementation VoiceRecorder
{
    VoiceRecorderWrapper *_recorderWrapper;
}

RCT_EXPORT_MODULE(VoiceRecorder);

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

- (VoiceRecorderWrapper *)recorderWrapper
{
    if (_recorderWrapper == nil) {
        _recorderWrapper = [[VoiceRecorderWrapper alloc] init];
    }
    return _recorderWrapper;
}

RCT_EXPORT_METHOD(startRecording:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 开始录音流程 ==========");
    NSLog(@"请求参数 - options: %@", options);

    [[self recorderWrapper] startRecording:options completion:^(BOOL success, NSString *_Nullable errorCode) {
        if (success) {
            NSLog(@"========== iOS 录音启动成功 ==========");
            resolve(@(success));
            return;
        }
        NSLog(@"========== iOS 录音启动失败 ==========");
        if (errorCode != nil && [errorCode isEqualToString:@"PERMISSION_DENIED"]) {
            reject(@"PERMISSION_DENIED", @"Microphone permission not granted", nil);
        } else {
            reject(@"RECORD_ERROR", @"Failed to start recording", nil);
        }
    }];
}

RCT_EXPORT_METHOD(stopRecording:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 停止录音流程 ==========");

    [[self recorderWrapper] stopRecordingWithCompletion:^(NSDictionary *result) {
        NSLog(@"iOS 停止录音结果: %@", result);
        NSLog(@"========== iOS 停止录音完成 ==========");
        resolve(result);
    }];
}

RCT_EXPORT_METHOD(cancelRecording:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 取消录音流程 ==========");

    [[self recorderWrapper] cancelRecording];

    NSLog(@"========== iOS 取消录音完成 ==========");
    resolve(nil);
}

RCT_EXPORT_METHOD(addListener:(NSString *)eventName)
{
}

RCT_EXPORT_METHOD(removeListeners:(double)count)
{
}

RCT_EXPORT_METHOD(deleteRecordingFile:(NSString *)filePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 删除指定录音文件 ==========");
    NSLog(@"文件路径: %@", filePath);

    BOOL success = [[self recorderWrapper] deleteRecordingFileWithFilePath:filePath];

    NSLog(@"文件删除%@", success ? @"成功" : @"失败");
    NSLog(@"========== iOS 删除文件完成 ==========");
    resolve(@(success));
}

RCT_EXPORT_METHOD(cleanExpiredRecordingFiles:(NSString *)prefix
                  maxAgeMs:(double)maxAgeMs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 清理过期录音文件 ==========");
    NSLog(@"文件前缀: %@", prefix);
    NSLog(@"最大保留时间: %.0fms", maxAgeMs);

    NSInteger deletedCount = [[self recorderWrapper] cleanExpiredRecordingFilesWithPrefix:prefix maxAgeMs:maxAgeMs];

    NSLog(@"总共删除了 %ld 个过期文件", (long)deletedCount);
    NSLog(@"========== iOS 清理完成 ==========");
    resolve(@(deletedCount));
}

@end
