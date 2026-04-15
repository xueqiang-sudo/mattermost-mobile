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

const SCREEN_PADDING_H = 16;
const CARD_RADIUS = 12;
const TEAM_ICON_SIZE = 48;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        outer: {
            paddingHorizontal: SCREEN_PADDING_H,
            paddingTop: 16,
            paddingBottom: 12,
            backgroundColor: theme.centerChannelBg,
        },
        card: {
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            paddingVertical: 16,
            paddingHorizontal: 16,
            borderRadius: CARD_RADIUS,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.1),
            backgroundColor: theme.centerChannelBg,
        },
        iconContainer: {
            width: TEAM_ICON_SIZE,
            height: TEAM_ICON_SIZE,
            borderRadius: 12,
            overflow: 'hidden',
        },
        textContainer: {
            flex: 1,
            flexDirection: 'column',
            marginLeft: 12,
            minWidth: 0,
        },
        teamText: {
            color: theme.centerChannelColor,
            ...typography('Body', 100, 'SemiBold'),
        },
        serverText: {
            color: changeOpacity(theme.centerChannelColor, 0.56),
            marginTop: 4,
            ...typography('Body', 75, 'Regular'),
        },
        shareLink: {
            marginLeft: 8,
        },
        shareLinkButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 40,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: changeOpacity(theme.buttonBg, 0.45),
            backgroundColor: 'transparent',
        },
        shareLinkText: {
            color: theme.buttonBg,
            ...typography('Body', 75, 'SemiBold'),
            marginLeft: 6,
            flexShrink: 1,
        },
        shareLinkIcon: {
            color: theme.buttonBg,
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

    const handleOnLayoutContainer = useCallback((e: LayoutChangeEvent) => {
        onLayoutContainer(e);
    }, [onLayoutContainer]);

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
            style={styles.outer}
            onLayout={handleOnLayoutContainer}
        >
            <View style={styles.card}>
                <View style={styles.iconContainer}>
                    <TeamIcon
                        id={teamId}
                        displayName={teamDisplayName}
                        lastIconUpdate={teamLastIconUpdate}
                        selected={false}
                        textColor={theme.centerChannelColor}
                        backgroundColor={changeOpacity(theme.centerChannelColor, 0.12)}
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
                    accessibilityRole='button'
                >
                    <View
                        style={styles.shareLinkButton}
                        testID='invite.share_link.button'
                    >
                        <CompassIcon
                            name='export-variant'
                            size={18}
                            style={styles.shareLinkIcon}
                        />
                        <FormattedText
                            id='invite.shareLink'
                            defaultMessage='Share link'
                            style={styles.shareLinkText}
                            numberOfLines={1}
                        />
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    );
}
