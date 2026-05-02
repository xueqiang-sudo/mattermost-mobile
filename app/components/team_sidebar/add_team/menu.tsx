// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import SlideUpPanelItem from '@components/slide_up_panel_item';
import {Screens} from '@constants';
import {dismissBottomSheet, showModalWithBackButton} from '@screens/navigation';

import type UserModel from '@typings/database/models/servers/user';

type Props = {
    serverUrl: string;
    currentUser?: UserModel;
}

const AddTeamMenu = ({serverUrl, currentUser}: Props) => {
    const intl = useIntl();

    const createEnterprise = useCallback(async () => {
        await dismissBottomSheet();
        showModalWithBackButton(
            Screens.CREATE_TEAM,
            intl.formatMessage({id: 'create_team.title', defaultMessage: 'Create Enterprise'}),
            'close-team-sidebar-create-team',
            {
                serverUrl,
                nickname: currentUser?.nickname || '',
                userId: currentUser?.id || '',
            },
        );
    }, [intl, serverUrl, currentUser]);

    const joinEnterprise = useCallback(async () => {
        await dismissBottomSheet();
        showModalWithBackButton(
            Screens.JOIN_TEAM_QR,
            intl.formatMessage({id: 'join_team_qr.title', defaultMessage: 'Join Enterprise'}),
            'close-team-sidebar-join-team-qr',
            {
                serverUrl,
                nickname: currentUser?.nickname || '',
                userId: currentUser?.id || '',
            },
        );
    }, [intl, serverUrl, currentUser]);

    return (
        <>
            <SlideUpPanelItem
                leftIcon='plus-box-outline'
                text={intl.formatMessage({id: 'plus_menu.create_enterprise.title', defaultMessage: 'Create Enterprise'})}
                onPress={createEnterprise}
                testID='add_team_menu.create_enterprise'
            />
            <SlideUpPanelItem
                leftIcon='account-multiple-plus-outline'
                text={intl.formatMessage({id: 'plus_menu.join_enterprise.title', defaultMessage: 'Join Enterprise'})}
                onPress={joinEnterprise}
                testID='add_team_menu.join_enterprise'
            />
        </>
    );
};

export default AddTeamMenu;
