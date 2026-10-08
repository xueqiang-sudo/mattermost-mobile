// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RNUtils from '@mattermost/rnutils';
import {Image} from 'expo-image';
import {type RefObject} from 'react';
import {DeviceEventEmitter, Keyboard, Platform, View} from 'react-native';
import {Navigation, type Options, type OptionsLayout} from 'react-native-navigation';

import {Events, Screens} from '@constants';
import {allOrientations, showOverlay} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {isAudio, isVideo} from '@utils/file';
import {urlSafeBase64Encode} from '@utils/security';

export const clamp = (value: number, lowerBound: number, upperBound: number) => {
    'worklet';
    return Math.min(Math.max(lowerBound, value), upperBound);
};

export const freezeOtherScreens = (value: boolean) => {
    DeviceEventEmitter.emit(Events.FREEZE_SCREEN, value);
};

export function measureViewInWindow(ref: RefObject<View>): Promise<{x: number; y: number; width: number; height: number}> {
    return new Promise((resolve) => {
        if (ref.current) {
            ref.current.measure((x, y, width, height, pageX, pageY) => {
                resolve({x: pageX, y: pageY, width, height});
            });
        } else {
            resolve({x: 0, y: 0, width: 0, height: 0});
        }
    });
}

let isShowing = false;

/**
 * 直接预览单个文件。点哪个文件就传哪个文件，不需要构建 items 数组。
 */
export function showMediaViewer(file: FileInfo) {
    if (isShowing) {
        return;
    }

    const uri = file.localPath || file.uri || '';
    if (!uri) {
        debugLog('MEDIA', `showMediaViewer: no uri for file ${file.id}`);
        return;
    }

    isShowing = true;

    try {
        Keyboard.dismiss();

        const type = isVideo(file) ? 'video' : isAudio(file) ? 'audio' : 'image';
        const options: Options = {
            layout: {backgroundColor: '#000'},
            overlay: {interceptTouchOutside: true},
            statusBar: {backgroundColor: '#000', style: 'light'},
        };

        if (Platform.OS === 'ios') {
            const layout: OptionsLayout = {orientation: allOrientations};
            Navigation.setDefaultOptions({layout});
            RNUtils.unlockOrientation();
        }

        showOverlay(Screens.MEDIA_VIEWER, {uri, type, name: file.name}, options);
    } catch (error: any) {
        debugLog('MEDIA', `showMediaViewer: ${error?.message || error}`);
    } finally {
        isShowing = false;
    }
}

export const getImageSize = async (serverUrl: string, uri: string, cacheKey: string) => {
    const image = await Image.loadAsync({uri, cacheKey, cachePath: urlSafeBase64Encode(serverUrl)});
    return {width: image.width, height: image.height};
};
