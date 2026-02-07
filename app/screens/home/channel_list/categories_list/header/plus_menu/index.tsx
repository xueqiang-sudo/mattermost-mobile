// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {dismissBottomSheet, showModal, showModalWithBackButton} from '@screens/navigation';

import PlusMenuItem from './item';
import PlusMenuSeparator from './separator';

import type UserModel from '@typings/database/models/servers/user';

type Props = {
    canCreateChannels: boolean;
    canJoinChannels: boolean;
    canInvitePeople: boolean;
    currentUser?: UserModel;
}

const PlusMenuList = ({canCreateChannels, canJoinChannels, canInvitePeople, currentUser}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();

    const browseChannels = useCallback(async () => {
        await dismissBottomSheet();

        const title = intl.formatMessage({id: 'browse_channels.title', defaultMessage: 'Browse channels'});
        const closeButton = CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor);

        showModal(Screens.BROWSE_CHANNELS, title, {
            closeButton,
        });
    }, [intl, theme]);

    const createNewChannel = useCallback(async () => {
        await dismissBottomSheet();

        const title = intl.formatMessage({id: 'mobile.create_channel.title', defaultMessage: 'New channel'});
        showModal(Screens.CREATE_OR_EDIT_CHANNEL, title);
    }, [intl]);

    const openDirectMessage = useCallback(async () => {
        await dismissBottomSheet();

        const title = intl.formatMessage({id: 'create_direct_message.title', defaultMessage: 'Create Direct Message'});
        const closeButton = CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor);
        showModal(Screens.CREATE_DIRECT_MESSAGE, title, {
            closeButton,
        });
    }, [intl, theme]);

    const invitePeopleToTeam = useCallback(async () => {
        await dismissBottomSheet();

        showModal(
            Screens.INVITE,
            intl.formatMessage({id: 'invite.title', defaultMessage: 'Invite'}),
        );
    }, [intl]);

    const scanQRCode = useCallback(async () => {
        await dismissBottomSheet();

        Alert.alert(
            intl.formatMessage({id: 'scan_qr_code.title', defaultMessage: 'Scan QR Code'}),
            intl.formatMessage({id: 'scan_qr_code.coming_soon', defaultMessage: 'This feature is under development'}),
            [{text: intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'})}],
        );
    }, [intl]);

    const createEnterprise = useCallback(async () => {
        await dismissBottomSheet();
        showModalWithBackButton(Screens.CREATE_TEAM, intl.formatMessage({id: 'create_team.title', defaultMessage: 'Create Enterprise'}), 'close-home-create-team', {
            serverUrl,
            nickname: currentUser?.nickname || '',
            userId: currentUser?.id || '',
        });
    }, [intl, serverUrl, currentUser]);

    const joinEnterprise = useCallback(async () => {
        await dismissBottomSheet();
        showModalWithBackButton(Screens.JOIN_TEAM_QR, intl.formatMessage({id: 'join_team_qr.title', defaultMessage: 'Join Enterprise'}), 'close-home-join-team-qr', {
            serverUrl,
            nickname: currentUser?.nickname || '',
            userId: currentUser?.id || '',
        });
    }, [intl, serverUrl, currentUser]);

    return (
        <>
            {canJoinChannels &&
            <PlusMenuItem
                pickerAction='browseChannels'
                onPress={browseChannels}
            />
            }
            {canCreateChannels &&
            <PlusMenuItem
                pickerAction='createNewChannel'
                onPress={createNewChannel}
            />
            }
            <PlusMenuItem
                pickerAction='openDirectMessage'
                onPress={openDirectMessage}
            />
            {canInvitePeople &&
            <>
                <PlusMenuSeparator/>
                <PlusMenuItem
                    pickerAction='invitePeopleToTeam'
                    onPress={invitePeopleToTeam}
                />
            </>
            }
            <PlusMenuSeparator/>
            <PlusMenuItem
                pickerAction='scanQRCode'
                onPress={scanQRCode}
            />
            <PlusMenuItem
                pickerAction='createEnterprise'
                onPress={createEnterprise}
            />
            <PlusMenuItem
                pickerAction='joinEnterprise'
                onPress={joinEnterprise}
            />
        </>
    );
};

export default PlusMenuList;
