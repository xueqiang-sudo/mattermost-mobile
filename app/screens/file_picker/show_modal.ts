// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {goToScreen} from '@screens/navigation';
import {Screens} from '@constants';
import {debugLog} from '@store/debug_log';

import type {FileInfo} from '@mattermost/types/files';

export const showFilePickerScreen = (channelId: string, onSend: (files: FileInfo[]) => void) => {
    debugLog('filePicker', `showFilePickerScreen called, channelId=${channelId}`);
    const passProps = {
        onSend,
        channelId,
    };

    const options = {
        topBar: {
            visible: false,
        },
    };

    goToScreen(Screens.FILE_PICKER, '', passProps, options);
};
