// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

declare module 'react-native' {
    interface NativeModulesStatic {
        QRCodeScanner: {
            scanImageAtPath: (imagePath: string) => Promise<Array<{
                value: string;
                type: string;
                format?: number;
                boundingBox?: {
                    left?: number;
                    top?: number;
                    right?: number;
                    bottom?: number;
                    x?: number;
                    y?: number;
                    width?: number;
                    height?: number;
                };
            }> | null>;
        };
    }
}
