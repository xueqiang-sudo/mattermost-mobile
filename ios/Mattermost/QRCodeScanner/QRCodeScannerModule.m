// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(QRCodeScannerModule, NSObject)

RCT_EXTERN_METHOD(scanImageAtPath:(NSString *)imagePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
