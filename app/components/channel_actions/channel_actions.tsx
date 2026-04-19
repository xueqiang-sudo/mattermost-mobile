// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';

import ChannelInfoStartButton from '@calls/components/channel_info_start';
import AddMembersBox from '@components/channel_actions/add_members_box';
import CopyChannelLinkBox from '@components/channel_actions/copy_channel_link_box';
import EditAnnouncementBox from '@components/channel_actions/edit_announcement_box';
import MutedBox from '@components/channel_actions/mute_box';
import SetHeaderBox from '@components/channel_actions/set_header_box';
import {useServerUrl} from '@context/server';
import {dismissBottomSheet} from '@screens/navigation';
import {channelSupportsAnnouncementUx, isDirectMessageChannel} from '@utils/channel';

type Props = {
    channelId: string;
    channelType?: ChannelType;
    inModal?: boolean;
    dismissChannelInfo: () => void;
    callsEnabled: boolean;
    testID?: string;
    canEditAnnouncement?: boolean;
    canManageMembers?: boolean;
    /** When set (e.g. Channel Info modal), quick actions use this container style on each OptionBox. */
    optionBoxContainerStyle?: StyleProp<ViewStyle>;
}

export const CHANNEL_ACTIONS_OPTIONS_HEIGHT = 62;

const styles = StyleSheet.create({
    wrapper: {
        flexDirection: 'row',
        height: CHANNEL_ACTIONS_OPTIONS_HEIGHT,
    },
    separator: {
        width: 8,
    },
});

const ChannelActions = ({
    channelId,
    channelType,
    inModal = false,
    dismissChannelInfo,
    callsEnabled,
    canEditAnnouncement = false,
    canManageMembers = false,
    optionBoxContainerStyle,
    testID,
}: Props) => {
    const serverUrl = useServerUrl();

    const onCopyLinkAnimationEnd = useCallback(() => {
        if (!inModal) {
            requestAnimationFrame(async () => {
                await dismissBottomSheet();
            });
        }
    }, [inModal]);

    const isDM = isDirectMessageChannel(channelType);

    return (
        <View style={styles.wrapper}>
            <MutedBox
                channelId={channelId}
                containerStyle={optionBoxContainerStyle}
                showSnackBar={!inModal}
                testID={testID}
            />
            {isDM && (
                <>
                    <View style={styles.separator}/>
                    <SetHeaderBox
                        channelId={channelId}
                        containerStyle={optionBoxContainerStyle}
                        inModal={inModal}
                        testID={`${testID}.set_header.action`}
                    />
                </>
            )}
            {/**
             * 频道信息弹窗（inModal）内已在「公告」区块提供编辑入口，快捷栏不再重复。
             * 静音与各后续按钮之间仅保留一段 8px 分隔：由各区块自行前置分隔，避免「静音后固定分隔 + 区块前再分隔」叠成 16px。
             */}
            {channelSupportsAnnouncementUx(channelType) && canEditAnnouncement && !inModal && (
                <>
                    <View style={styles.separator}/>
                    <EditAnnouncementBox
                        channelId={channelId}
                        containerStyle={optionBoxContainerStyle}
                        inModal={inModal}
                        testID={`${testID}.edit_announcement.action`}
                    />
                </>
            )}
            {canManageMembers &&
                <>
                    <View style={styles.separator}/>
                    <AddMembersBox
                        channelId={channelId}
                        containerStyle={optionBoxContainerStyle}
                        inModal={inModal}
                        testID={`${testID}.add_members.action`}
                    />
                </>
            }
            {!isDM && !callsEnabled &&
                <>
                    <View style={styles.separator}/>
                    <CopyChannelLinkBox
                        channelId={channelId}
                        containerStyle={optionBoxContainerStyle}
                        onAnimationEnd={onCopyLinkAnimationEnd}
                        testID={`${testID}.copy_channel_link.action`}
                    />
                </>
            }
            {callsEnabled &&
                <>
                    <View style={styles.separator}/>
                    <ChannelInfoStartButton
                        boxContainerStyle={optionBoxContainerStyle}
                        channelId={channelId}
                        dismissChannelInfo={dismissChannelInfo}
                        serverUrl={serverUrl}
                    />
                </>
            }
        </View>
    );
};

export default ChannelActions;
