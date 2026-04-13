// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {
    Platform,
    View,
    Text,
    TouchableOpacity,
    type LayoutChangeEvent,
} from 'react-native';
import Share, {type ShareOptions} from 'react-native-share';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import TeamIcon from '@components/team_sidebar/team_list/team_item/team_icon';
import {useServerDisplayName} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';

/**
 * 生成主题相关的样式表
 * @param theme - 当前应用的主题
 * @returns 样式表对象
 */
const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            paddingVertical: 20,
            paddingHorizontal: 20,
            backgroundColor: theme.centerChannelBg,
            borderBottomWidth: 1,
            borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        },
        iconContainer: {
            width: 56,
            height: 56,
            borderRadius: 16,
            overflow: 'hidden',
            shadowColor: theme.centerChannelColor,
            shadowOpacity: 0.1,
            shadowRadius: 8,
            shadowOffset: {
                width: 0,
                height: 2,
            },
            elevation: 2,
        },
        textContainer: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            marginLeft: 16,
        },
        teamText: {
            color: theme.centerChannelColor,
            ...typography('Heading', 200, 'SemiBold'),
            letterSpacing: 0.3,
        },
        serverText: {
            color: changeOpacity(theme.centerChannelColor, 0.5),
            marginTop: 4,
            ...typography('Body', 100, 'Regular'),
        },
        shareLink: {
            display: 'flex',
        },
        shareLinkButton: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            height: 48,
            paddingHorizontal: 20,
            backgroundColor: theme.buttonBg,
            borderRadius: 16,
            shadowColor: theme.buttonBg,
            shadowOpacity: 0.25,
            shadowRadius: 12,
            shadowOffset: {
                width: 0,
                height: 6,
            },
            elevation: 4,
        },
        shareLinkText: {
            color: theme.buttonColor,
            ...typography('Body', 100, 'SemiBold'),
            paddingLeft: 10,
            letterSpacing: 0.3,
        },
        shareLinkIcon: {
            color: theme.buttonColor,
        },
    };
});

type SelectionTeamBarProps = {
    teamId: string;
    teamDisplayName: string;
    teamLastIconUpdate: number;
    teamInviteId: string;
    serverUrl: string;
    onLayoutContainer: (e: LayoutChangeEvent) => void;
    onClose: () => Promise<void>;
}

/**
 * 邀请界面顶部的团队信息栏组件
 * 显示团队图标、名称、服务器信息，并提供分享邀请链接的功能
 */
export default function SelectionTeamBar({
    teamId,
    teamDisplayName,
    teamLastIconUpdate,
    teamInviteId,
    serverUrl,
    onLayoutContainer,
    onClose,
}: SelectionTeamBarProps) {
    const {formatMessage} = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverDisplayName = useServerDisplayName();

    /**
     * 处理容器布局变化
     * @param e - 布局变化事件
     */
    const handleOnLayoutContainer = useCallback((e: LayoutChangeEvent) => {
        onLayoutContainer(e);
    }, [onLayoutContainer]);

    /**
     * 处理分享邀请链接
     * 生成邀请链接并调用系统分享功能
     */
    const handleShareLink = usePreventDoubleTap(useCallback(async () => {
        const url = `${serverUrl}/signup_user_complete/?id=${teamInviteId}`;
        const title = formatMessage({id: 'invite_people_to_team.title', defaultMessage: 'Join the {team} enterprise'}, {team: teamDisplayName});
        const message = formatMessage({id: 'invite_people_to_team.message', defaultMessage: 'Here’s a link to collaborate and communicate with us on Mattermost.'});
        const icon = 'data:<data_type>/<file_extension>;base64,<base64_data>';

        const options: ShareOptions = Platform.select({
            ios: {
                activityItemSources: [
                    {
                        placeholderItem: {
                            type: 'url',
                            content: url,
                        },
                        item: {
                            default: {
                                type: 'text',
                                content: `${message} ${url}`,
                            },
                            copyToPasteBoard: {
                                type: 'url',
                                content: url,
                            },
                        },
                        subject: {
                            default: title,
                        },
                        linkMetadata: {
                            originalUrl: url,
                            url,
                            title,
                            icon,
                        },
                    },
                ],
            },
            default: {
                title,
                subject: title,
                url,
                showAppsToView: true,
            },
        });

        await onClose();

        Share.open(
            options,
        ).catch(() => {
            // do nothing
        });
    }, [formatMessage, onClose, serverUrl, teamDisplayName, teamInviteId]));

    return (
        <View
            style={styles.container}
            onLayout={handleOnLayoutContainer}
        >
            <View style={styles.iconContainer}>
                <TeamIcon
                    id={teamId}
                    displayName={teamDisplayName}
                    lastIconUpdate={teamLastIconUpdate}
                    selected={false}
                    textColor={theme.centerChannelColor}
                    backgroundColor={changeOpacity(theme.centerChannelColor, 0.16)}
                    testID='invite.team_icon'
                />
            </View>
            <View style={styles.textContainer}>
                <Text
                    style={styles.teamText}
                    numberOfLines={1}
                    testID='invite.team_display_name'
                >
                    {teamDisplayName}
                </Text>
                <Text
                    style={styles.serverText}
                    numberOfLines={1}
                    testID='invite.server_display_name'
                >
                    {serverDisplayName}
                </Text>
            </View>
            <TouchableOpacity
                onPress={handleShareLink}
                style={styles.shareLink}
            >
                <View
                    style={styles.shareLinkButton}
                    testID='invite.share_link.button'
                >
                    <CompassIcon
                        name='export-variant'
                        size={20}
                        style={styles.shareLinkIcon}
                    />
                    <FormattedText
                        id='invite.shareLink'
                        defaultMessage='Share link'
                        style={styles.shareLinkText}
                    />
                </View>
            </TouchableOpacity>
        </View>
    );
}
