// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import FilePicker from './file_picker';
import {showModalOverCurrentContext} from '@screens/navigation';
import {Screens} from '@constants';

import type {FileInfo} from '@mattermost/types/files';

export const showFilePickerModal = (onSend: (files: FileInfo[]) => void) => {
    const passProps = {
        onSend,
    };

    const options = {
        topBar: {
            visible: false,
        },
    };

    showModalOverCurrentContext(Screens.FILE_PICKER, passProps, options);
};
