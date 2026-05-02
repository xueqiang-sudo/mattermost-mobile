// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import Markdown from '@components/markdown';
import {General, Screens} from '@constants';
import {useTheme} from '@context/theme';
import {bottomSheet, dismissBottomSheet, showModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const MAX_PREVIEW = 96;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    bar: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    preview: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
    },
    sheetInner: {
        flex: 1,
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    sheetTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 400, 'SemiBold'),
        marginBottom: 8,
    },
    editPress: {
        marginTop: 16,
        paddingVertical: 12,
    },
    editLabel: {
        color: theme.linkColor,
        ...typography('Body', 200, 'SemiBold'),
    },
}));

type Props = {
    canEditAnnouncement: boolean;
    channelId: string;
    channelType: ChannelType;
    headerMarkdown: string;
}

const ChannelAnnouncementBar = ({
    canEditAnnouncement,
    channelId,
    channelType,
    headerMarkdown,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const isDM = channelType === General.DM_CHANNEL;

    const preview = useMemo(() => {
        const oneLine = headerMarkdown.replace(/\s+/g, ' ').trim();
        if (oneLine.length <= MAX_PREVIEW) {
            return oneLine;
        }
        return `${oneLine.slice(0, MAX_PREVIEW)}…`;
    }, [headerMarkdown]);

    const openEditor = useCallback(() => {
        dismissBottomSheet();
        const title = isDM 
            ? intl.formatMessage({id: 'screens.edit_conversation_note', defaultMessage: 'Edit note'})
            : intl.formatMessage({id: 'screens.edit_channel_announcement', defaultMessage: 'Edit announcement'});
        showModal(Screens.EDIT_CHANNEL_ANNOUNCEMENT, title, {channelId});
    }, [channelId, intl, isDM]);

    const onPressBar = useCallback(() => {
        const renderContent = () => (
            <View style={styles.sheetInner}>
                <Text style={styles.sheetTitle}>
                    {isDM 
                        ? intl.formatMessage({id: 'channel_announcement.bottom_sheet.title.note', defaultMessage: 'Note'})
                        : intl.formatMessage({id: 'channel_announcement.bottom_sheet.title', defaultMessage: 'Announcement'})
                    }
                </Text>
                <ScrollView
                    keyboardShouldPersistTaps='handled'
                    nestedScrollEnabled={true}
                >
                    <Markdown
                        channelId={channelId}
                        baseTextStyle={{color: theme.centerChannelColor, ...typography('Body', 200, 'Regular')}}
                        disableGallery={true}
                        location={Screens.CHANNEL}
                        theme={theme}
                        value={headerMarkdown}
                    />
                </ScrollView>
                {canEditAnnouncement && (
                    <TouchableOpacity
                        onPress={openEditor}
                        style={styles.editPress}
                        testID='channel_announcement.bottom_sheet.edit'
                    >
                        <Text style={styles.editLabel}>
                            {isDM 
                                ? intl.formatMessage({id: 'channel_info.edit_note', defaultMessage: 'Edit note'})
                                : intl.formatMessage({id: 'channel_info.edit_announcement', defaultMessage: 'Edit announcement'})
                            }
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        );

        bottomSheet({
            title: '',
            renderContent,
            snapPoints: [1, '50%', '88%'],
            theme,
            closeButtonId: 'close-channel-announcement',
            scrollable: true,
        });
    }, [canEditAnnouncement, channelId, headerMarkdown, intl, isDM, openEditor, styles.editLabel, styles.editPress, styles.sheetInner, styles.sheetTitle, theme]);

    if (!headerMarkdown.trim()) {
        return null;
    }

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPressBar}
            style={styles.bar}
            testID='channel_header.announcement_bar'
        >
            <Text
                numberOfLines={2}
                ellipsizeMode='tail'
                style={styles.preview}
            >
                {preview}
            </Text>
        </TouchableOpacity>
    );
};

export default ChannelAnnouncementBar;
