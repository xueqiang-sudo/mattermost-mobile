// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {ENABLE_INTERNAL_GROUPS} from '@constants/channel';
import {useTheme} from '@context/theme';
import {dismissBottomSheet, showModal} from '@screens/navigation';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {changeOpacity} from '@utils/theme';

import PlusMenuItem from './item';
import PlusMenuSeparator from './separator';

type Props = {
    canCreateChannels: boolean;
    canInvitePeople: boolean;
}

const PlusMenuList = ({canCreateChannels, canInvitePeople}: Props) => {
    const intl = useIntl();
    const theme = useTheme();

    const createNewChannel = useCallback(async () => {
        await dismissBottomSheet();

        const title = intl.formatMessage({id: 'mobile.create_channel.title', defaultMessage: 'New channel'});
        showModal(Screens.CREATE_OR_EDIT_CHANNEL, title);
    }, [intl]);

    const openGroupChat = useCallback(async () => {
        await dismissBottomSheet();

        const title = intl.formatMessage({id: 'plus_menu.open_group_chat.title', defaultMessage: 'Start group chat'});
        const closeIconColor = theme.sidebarHeaderTextColor;
        const closeButton = CompassIcon.getImageSourceSync('close', 24, closeIconColor);
        showModal(Screens.CREATE_DIRECT_MESSAGE, title, {
            closeButton,
            variant: 'group_only',
        });
    }, [intl, theme]);

    const openPrivateChat = useCallback(async () => {
        await dismissBottomSheet();

        const title = intl.formatMessage({id: 'plus_menu.open_private_chat.title', defaultMessage: 'Start private chat'});
        const closeIconColor = theme.sidebarHeaderTextColor;
        const closeButton = CompassIcon.getImageSourceSync('close', 24, closeIconColor);
        showModal(Screens.CREATE_DIRECT_MESSAGE, title, {
            closeButton,
            variant: 'dm_only',
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
        showQrScannerModal(intl);
    }, [intl]);

    return (
        <>
            <PlusMenuItem
                pickerAction='openGroupChat'
                onPress={openGroupChat}
            />
            <PlusMenuItem
                pickerAction='openPrivateChat'
                onPress={openPrivateChat}
            />
            {canCreateChannels && ENABLE_INTERNAL_GROUPS &&
            <PlusMenuItem
                pickerAction='createNewChannel'
                onPress={createNewChannel}
            />
            }
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
        </>
    );
};

export default PlusMenuList;
