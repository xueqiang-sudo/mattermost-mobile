// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useManagedConfig} from '@mattermost/react-native-emm';
import Clipboard from '@react-native-clipboard/clipboard';
import moment from 'moment';
import React, {useCallback, useMemo} from 'react';
import {useIntl, defineMessages} from 'react-intl';
import {Platform, StyleSheet, Text, View} from 'react-native';

import CustomStatusExpiry from '@components/custom_status/custom_status_expiry';
import Emoji from '@components/emoji';
import FormattedDate from '@components/formatted_date';
import FormattedText from '@components/formatted_text';
import Markdown from '@components/markdown';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {General, Screens} from '@constants';
import {SNACK_BAR_TYPE} from '@constants/snack_bar';
import {ANDROID_33, OS_VERSION} from '@constants/versions';
import {useTheme} from '@context/theme';
import {bottomSheet, dismissBottomSheet, showModal} from '@screens/navigation';
import {CHANNEL_INFO_CARD_RADIUS} from '../channel_info_constants';
import {bottomSheetSnapPoint, isEmail} from '@utils/helpers';
import {channelSupportsAnnouncementUx} from '@utils/channel';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    canEditAnnouncement?: boolean;
    channelId: string;
    channelType?: ChannelType;
    createdAt: number;
    createdBy: string;
    customStatus?: UserCustomStatus;
    header?: string;
    isCustomStatusEnabled: boolean;
}

const headerMetadata = {header: {width: 1, height: 1}};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        marginBottom: 0,
    },
    item: {
        marginTop: 16,
    },
    extraHeading: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 8,
        ...typography('Body', 75),
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 0,
    },
    /** 公告体系：整块公告与编辑入口放在轻量卡片内，层次更清晰。 */
    announcementPanel: {
        marginTop: 2,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: CHANNEL_INFO_CARD_RADIUS,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
    },
    announcementPanelHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    announcementPanelHeaderRowTight: {
        marginBottom: 6,
    },
    /** 公告为区块标题，字阶与字重高于正文，避免与内容「长得一样」。 */
    announcementPanelHeading: {
        color: theme.centerChannelColor,
        ...typography('Heading', 200, 'SemiBold'),
    },
    announcementBody: {
        color: changeOpacity(theme.centerChannelColor, 0.92),
        ...typography('Body', 200, 'Regular'),
    },
    announcementEmpty: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        ...typography('Body', 200, 'Regular'),
    },
    editAnnouncement: {
        color: theme.linkColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    header: {
        color: theme.centerChannelColor,
        ...typography('Body', 200),
        fontWeight: undefined,
    },
    created: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        ...typography('Body', 75),
    },
    customStatus: {
        alignItems: 'center',
        flexDirection: 'row',
    },
    customStatusEmoji: {
        marginRight: 10,
    },
    customStatusLabel: {
        color: theme.centerChannelColor,
        marginRight: 8,
        ...typography('Body', 200),
    },
    customStatusExpiry: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75),
    },
}));

const style = StyleSheet.create({
    bottomSheet: {
        flex: 1,
    },
});

const headerTestId = 'channel_info.extra.header';

const messages = defineMessages({
    copyEmail: {
        id: 'mobile.markdown.link.copy_email',
        defaultMessage: 'Copy Email Address',
    },
    copyURL: {
        id: 'mobile.markdown.link.copy_url',
        defaultMessage: 'Copy URL',
    },
    announcementEmpty: {
        id: 'channel_info.announcement_empty',
        defaultMessage: 'No announcement yet. Use Edit announcement above to add one.',
    },
});

const onCopy = async (text: string, isLink?: boolean) => {
    Clipboard.setString(text);
    await dismissBottomSheet();
    if ((Platform.OS === OS_VERSION.ANDROID && Number(Platform.Version) < ANDROID_33) || Platform.OS === OS_VERSION.IOS) {
        showSnackBar({
            barType: isLink ? SNACK_BAR_TYPE.LINK_COPIED : SNACK_BAR_TYPE.TEXT_COPIED,
        });
    }
};

const Extra = ({
    canEditAnnouncement = false,
    channelId,
    channelType,
    createdAt,
    createdBy,
    customStatus,
    header,
    isCustomStatusEnabled,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const managedConfig = useManagedConfig<ManagedConfig>();

    const styles = getStyleSheet(theme);
    const usesAnnouncementUx = channelSupportsAnnouncementUx(channelType);
    const isDM = channelType === General.DM_CHANNEL;
    const hasAnnouncementText = Boolean(header && String(header).trim());
    const showAnnouncementSection =
        usesAnnouncementUx && (hasAnnouncementText || canEditAnnouncement);
    const showLegacyHeaderSection = !usesAnnouncementUx && Boolean(header);

    const onEditAnnouncement = useCallback(() => {
        const title = isDM 
            ? intl.formatMessage({id: 'screens.edit_conversation_note', defaultMessage: 'Edit note'})
            : intl.formatMessage({id: 'screens.edit_channel_announcement', defaultMessage: 'Edit announcement'});
        showModal(Screens.EDIT_CHANNEL_ANNOUNCEMENT, title, {channelId});
    }, [channelId, intl, isDM]);

    const created = useMemo(() => ({
        user: createdBy,
        date: (
            <FormattedDate
                style={styles.created}
                value={createdAt}
            />
        ),
    }), [createdAt, createdBy, styles.created]);

    const handleLongPress = useCallback((url?: string) => {
        if (managedConfig?.copyAndPasteProtection !== 'true') {

            const cleanUrl = url?.replace(/^mailto:/, '') || '';
            const isEmailLink = isEmail(cleanUrl);

            const renderContent = () => (
                <View
                    testID={`${headerTestId}.bottom_sheet`}
                    style={style.bottomSheet}
                >
                    <SlideUpPanelItem
                        leftIcon='content-copy'
                        onPress={() => {
                            onCopy(header!);
                        }}
                        testID={`${headerTestId}.bottom_sheet.copy_header_text`}
                        text={intl.formatMessage(
                            usesAnnouncementUx ? {
                                id: 'mobile.markdown.copy_announcement',
                                defaultMessage: 'Copy announcement text',
                            } : {
                                id: 'mobile.markdown.copy_header',
                                defaultMessage: 'Copy header text',
                            },
                        )}
                    />
                    {Boolean(url) && (
                        <SlideUpPanelItem
                            leftIcon='link-variant'
                            onPress={() => {
                                onCopy(cleanUrl, true);
                            }}
                            testID={`${headerTestId}.bottom_sheet.copy_url`}
                            text={intl.formatMessage(isEmailLink ? messages.copyEmail : messages.copyURL)}
                        />
                    )}
                    <SlideUpPanelItem
                        destructive={true}
                        leftIcon='cancel'
                        onPress={() => {
                            dismissBottomSheet();
                        }}
                        testID={`${headerTestId}.bottom_sheet.cancel`}
                        text={intl.formatMessage({
                            id: 'common.cancel',
                            defaultMessage: 'Cancel',
                        })}
                    />
                </View>
            );

            bottomSheet({
                closeButtonId: 'close-markdown-link',
                renderContent,
                snapPoints: [1, bottomSheetSnapPoint(url ? 3 : 2, ITEM_HEIGHT)],
                title: intl.formatMessage({id: 'post.options.title', defaultMessage: 'Options'}),
                theme,
            });
        }
    }, [managedConfig?.copyAndPasteProtection, intl, theme, header, usesAnnouncementUx]);

    const touchableHandleLongPress = useCallback(() => {
        if (header && String(header).trim()) {
            handleLongPress();
        }
    }, [handleLongPress, header]);

    return (
        <View style={styles.container}>
            {isCustomStatusEnabled && Boolean(customStatus) &&
            <View style={styles.item}>
                <FormattedText
                    id='channel_info.custom_status'
                    defaultMessage='Custom status:'
                    style={styles.extraHeading}
                />
                <View style={styles.customStatus}>
                    {Boolean(customStatus?.emoji) &&
                    <View
                        style={styles.customStatusEmoji}
                        testID={`channel_info.custom_status.custom_status_emoji.${customStatus?.emoji}`}
                    >
                        <Emoji
                            emojiName={customStatus!.emoji!}
                            size={24}
                        />
                    </View>
                    }
                    {Boolean(customStatus?.text) &&
                    <Text
                        style={styles.customStatusLabel}
                        testID='channel_info.custom_status.custom_status_text'
                    >
                        {customStatus?.text}
                    </Text>
                    }
                    {Boolean(customStatus?.duration) &&
                    <CustomStatusExpiry
                        time={moment(customStatus?.expires_at)}
                        theme={theme}
                        textStyles={styles.customStatusExpiry}
                        withinBrackets={false}
                        showPrefix={true}
                        showToday={true}
                        showTimeCompulsory={false}
                        testID={`channel_info.custom_status.custom_status_duration.${customStatus?.duration}.custom_status_expiry`}
                    />
                    }
                </View>
            </View>
            }
            {(showAnnouncementSection || showLegacyHeaderSection) &&
            <View style={styles.item}>
                {usesAnnouncementUx ? (
                    <View style={styles.announcementPanel}>
                        <View style={[styles.announcementPanelHeaderRow, !hasAnnouncementText && styles.announcementPanelHeaderRowTight]}>
                            <FormattedText
                                id={isDM ? 'channel_info.note' : 'channel_info.announcement'}
                                defaultMessage={isDM ? 'Note' : 'Announcement'}
                                style={styles.announcementPanelHeading}
                                testID={headerTestId}
                            />
                            {canEditAnnouncement && (
                                <TouchableWithFeedback
                                    type='opacity'
                                    onPress={onEditAnnouncement}
                                    testID={`${headerTestId}.edit_announcement`}
                                >
                                    <Text style={styles.editAnnouncement}>
                                        {intl.formatMessage(isDM 
                                            ? {id: 'channel_info.edit_note', defaultMessage: 'Edit note'}
                                            : {id: 'channel_info.edit_announcement', defaultMessage: 'Edit announcement'}
                                        )}
                                    </Text>
                                </TouchableWithFeedback>
                            )}
                        </View>
                        {hasAnnouncementText ? (
                            <TouchableWithFeedback
                                type='opacity'
                                activeOpacity={0.8}
                                onLongPress={touchableHandleLongPress}
                            >
                                <Markdown
                                    channelId={channelId}
                                    baseTextStyle={styles.announcementBody}
                                    disableBlockQuote={true}
                                    disableCodeBlock={true}
                                    disableGallery={true}
                                    disableHeading={true}
                                    disableTables={true}
                                    location={Screens.CHANNEL_INFO}
                                    theme={theme}
                                    imagesMetadata={headerMetadata}
                                    value={header}
                                    onLinkLongPress={handleLongPress}
                                />
                            </TouchableWithFeedback>
                        ) : (
                            <Text
                                style={styles.announcementEmpty}
                                testID={`${headerTestId}.empty`}
                            >
                                {intl.formatMessage(messages.announcementEmpty)}
                            </Text>
                        )}
                    </View>
                ) : (
                    <>
                        <View style={styles.headerRow}>
                            <FormattedText
                                id='channel_info.header'
                                defaultMessage='Header:'
                                style={styles.extraHeading}
                                testID={headerTestId}
                            />
                        </View>
                        <TouchableWithFeedback
                            type='opacity'
                            activeOpacity={0.8}
                            onLongPress={touchableHandleLongPress}
                        >
                            <Markdown
                                channelId={channelId}
                                baseTextStyle={styles.header}
                                disableBlockQuote={true}
                                disableCodeBlock={true}
                                disableGallery={true}
                                disableHeading={true}
                                disableTables={true}
                                location={Screens.CHANNEL_INFO}
                                theme={theme}
                                imagesMetadata={headerMetadata}
                                value={header}
                                onLinkLongPress={handleLongPress}
                            />
                        </TouchableWithFeedback>
                    </>
                )}
            </View>
            }
            {Boolean(createdAt && createdBy) &&
            <View style={styles.item}>
                <FormattedText
                    id='channel_intro.createdBy'
                    defaultMessage='Created by {user} on {date}'
                    style={styles.created}
                    values={created}
                    testID='channel_info.extra.created_by'
                />
            </View>
            }
            {Boolean(createdAt && !createdBy) &&
            <View style={styles.item}>
                <FormattedText
                    id='channel_intro.createdOn'
                    defaultMessage='Created on {date}'
                    style={styles.created}
                    values={created}
                    testID='channel_info.extra.created_on'
                />
            </View>
            }
        </View>
    );
};

export default Extra;
