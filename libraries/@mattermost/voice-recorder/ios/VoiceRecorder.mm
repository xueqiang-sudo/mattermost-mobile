#import "VoiceRecorder.h"
#import "VoiceRecorder-Swift.h"

@implementation VoiceRecorder

RCT_EXPORT_MODULE(VoiceRecorder);

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

RCT_EXPORT_METHOD(startRecording:(NSString *)format
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 开始录音流程 ==========");
    NSLog(@"请求参数 - format: %@", format);
    
    VoiceRecorderWrapper *wrapper = [[VoiceRecorderWrapper alloc] init];
    [wrapper startRecording:format completion:^(BOOL success) {
        if (success) {
            NSLog(@"========== iOS 录音启动成功 ==========");
            resolve(@(success));
        } else {
            NSLog(@"========== iOS 录音启动失败 ==========");
            reject(@"RECORD_ERROR", @"Failed to start recording", nil);
        }
    }];
}

RCT_EXPORT_METHOD(stopRecording:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 停止录音流程 ==========");
    
    VoiceRecorderWrapper *wrapper = [[VoiceRecorderWrapper alloc] init];
    [wrapper stopRecording:^(NSDictionary *result) {
        NSLog(@"iOS 停止录音结果: %@", result);
        NSLog(@"========== iOS 停止录音完成 ==========");
        resolve(result);
    }];
}

RCT_EXPORT_METHOD(cancelRecording:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 取消录音流程 ==========");
    
    VoiceRecorderWrapper *wrapper = [[VoiceRecorderWrapper alloc] init];
    [wrapper cancelRecording];
    
    NSLog(@"========== iOS 取消录音完成 ==========");
    resolve(nil);
}

RCT_EXPORT_METHOD(addListener:(NSString *)eventName)
{
}

RCT_EXPORT_METHOD(removeListeners:(double)count)
{
}

/**
 * 删除指定的录音文件
 * @param filePath - 要删除的文件路径
 * @param resolve - Promise 成功回调
 * @param reject - Promise 失败回调
 */
RCT_EXPORT_METHOD(deleteRecordingFile:(NSString *)filePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 删除指定录音文件 ==========");
    NSLog(@"文件路径: %@", filePath);
    
    VoiceRecorderWrapper *wrapper = [[VoiceRecorderWrapper alloc] init];
    BOOL success = [wrapper deleteRecordingFile:filePath];
    
    NSLog(@"文件删除%@", success ? @"成功" : @"失败");
    NSLog(@"========== iOS 删除文件完成 ==========");
    resolve(@(success));
}

/**
 * 清理指定前缀的过期临时录音文件
 * @param prefix - 文件前缀
 * @param maxAgeMs - 文件最大保留时间（毫秒）
 * @param resolve - Promise 成功回调
 * @param reject - Promise 失败回调
 */
RCT_EXPORT_METHOD(cleanExpiredRecordingFiles:(NSString *)prefix
                  maxAgeMs:(double)maxAgeMs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"========== iOS 清理过期录音文件 ==========");
    NSLog(@"文件前缀: %@", prefix);
    NSLog(@"最大保留时间: %.0fms", maxAgeMs);
    
    VoiceRecorderWrapper *wrapper = [[VoiceRecorderWrapper alloc] init];
    NSInteger deletedCount = [wrapper cleanExpiredRecordingFiles:prefix maxAgeMs:maxAgeMs];
    
    NSLog(@"总共删除了 %ld 个过期文件", (long)deletedCount);
    NSLog(@"========== iOS 清理完成 ==========");
    resolve(@(deletedCount));
}

@end
