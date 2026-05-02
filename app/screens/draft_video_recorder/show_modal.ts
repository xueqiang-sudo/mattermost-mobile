// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {OptionsModalPresentationStyle} from 'react-native-navigation';

import {Screens} from '@constants';
import {showModal} from '@screens/navigation';

import type {VideoFile} from 'react-native-vision-camera';

export type DraftVideoRecorderPassProps = {
    onVideoRecorded: (video: VideoFile) => void;
};

export function showDraftVideoRecorderModal(passProps: DraftVideoRecorderPassProps) {
    showModal(Screens.DRAFT_VIDEO_RECORDER, '', passProps, {
        modalPresentationStyle: OptionsModalPresentationStyle.fullScreen,
        layout: {
            backgroundColor: 'transparent',
            componentBackgroundColor: 'transparent',
        },
        statusBar: {
            visible: true,
            drawBehind: true,
            backgroundColor: 'transparent',
        },
        topBar: {
            visible: false,
        },
        modal: {
            swipeToDismiss: false,
        },
        hardwareBackButton: {
            dismissModalOnPress: false,
        },
    });
}
