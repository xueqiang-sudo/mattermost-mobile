// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Screens} from '@constants';
import {showModalWithBackButton} from '@screens/navigation';

export const showCloudDrivePickerModal = (channelId: string, teamId: string) => {
    const title = '';
    const closeButtonId = `close-${Screens.CLOUD_DRIVE_PICKER}`;
    showModalWithBackButton(
        Screens.CLOUD_DRIVE_PICKER,
        title,
        closeButtonId,
        {channelId, teamId},
        {useBackIcon: true},
    );
};
