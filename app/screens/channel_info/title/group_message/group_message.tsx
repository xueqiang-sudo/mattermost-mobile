// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useManagedConfig} from '@mattermost/react-native-emm';
import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useMemo} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Platform, StyleSheet, Text, View} from 'react-native';

import FormattedText from '@components/formatted_text';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import {SNACK_BAR_TYPE} from '@constants/snack_bar';
import {ANDROID_33, OS_VERSION} from '@constants/versions';
import {useTheme} from '@context/theme';
import {CHANNEL_INFO_CARD_RADIUS} from '../../channel_info_constants';
import {bottomSheet, dismissBottomSheet} from '@screens/navigation';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import GroupAvatars from './avatars';

import type ChannelMembershipModel from '@typings/database/models/servers/channel_membership';

type Props = {
    currentUserId: string;
    displayName?: string;
    members: ChannelMembershipModel[];
    purpose?: string;
}

const purposeMessages = defineMessages({
    label: {
        id: 'channel_info.purpose_label',
        defaultMessage: 'Purpose',
    },
    empty: {
        id: 'channel_info.gm_purpose_empty',
        defaultMessage: 'No purpose yet. Add it under Edit discussion group.',
    },
});

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    avatars: {
        left: 0,
        marginBottom: 8,
    },
    title: {
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
    },
    purposeBlock: {
        marginTop: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: CHANNEL_INFO_CARD_RADIUS,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    purposeLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 6,
        ...typography('Body', 75, 'SemiBold'),
    },
    purposeBody: {
        color: changeOpacity(theme.centerChannelColor, 0.88),
        ...typography('Body', 200, 'Regular'),
    },
    purposePlaceholder: {
        color: changeOpacity(theme.centerChannelColor, 0.45),
        ...typography('Body', 200, 'Regular'),
    },
}));

const bottomSheetStyle = StyleSheet.create({
    bottomsheet: {
        flex: 1,
    },
});

const GroupMessage = ({currentUserId, displayName, members, purpose}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const managedConfig = useManagedConfig<ManagedConfig>();
    const styles = getStyleSheet(theme);
    const userIds = useMemo(() => members.map((cm) => cm.userId).filter((id) => id !== currentUserId),
        [members, currentUserId]);

    const purposeTrimmed = purpose?.trim() ?? '';
    const publicPrivateTestId = 'channel_info.title.group_message';

    const onCopy = useCallback(async () => {
        Clipboard.setString(purposeTrimmed);
        await dismissBottomSheet();
        if ((Platform.OS === OS_VERSION.ANDROID && Number(Platform.Version) < ANDROID_33) || Platform.OS === OS_VERSION.IOS) {
            showSnackBar({barType: SNACK_BAR_TYPE.TEXT_COPIED});
        }
    }, [purposeTrimmed]);

    const handleLongPress = useCallback(() => {
        if (!purposeTrimmed) {
            return;
        }
        if (managedConfig?.copyAndPasteProtection !== 'true') {
            const renderContent = () => {
                return (
                    <View style={bottomSheetStyle.bottomsheet}>
                        <SlideUpPanelItem
                            leftIcon='content-copy'
                            onPress={onCopy}
                            testID={`${publicPrivateTestId}.bottom_sheet.copy_purpose`}
                            text={intl.formatMessage({id: 'channel_info.copy_purpose_text', defaultMessage: 'Copy Purpose Text'})}
                        />
                        <SlideUpPanelItem
                            destructive={true}
                            leftIcon='cancel'
                            onPress={() => {
                                dismissBottomSheet();
                            }}
                            testID={`${publicPrivateTestId}.bottom_sheet.cancel`}
                            text={intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'})}
                        />
                    </View>
                );
            };

            bottomSheet({
                closeButtonId: 'close-gm-purpose-copy',
                renderContent,
                snapPoints: [1, bottomSheetSnapPoint(2, ITEM_HEIGHT)],
                title: intl.formatMessage({id: 'post.options.title', defaultMessage: 'Options'}),
                theme,
            });
        }
    }, [intl, managedConfig?.copyAndPasteProtection, onCopy, purposeTrimmed, theme]);

    return (
        <>
            <GroupAvatars
                userIds={userIds}
            />
            <Text
                style={styles.title}
                testID='channel_info.title.group_message.display_name'
            >
                {displayName}
            </Text>
            <View
                style={styles.purposeBlock}
                testID={`${publicPrivateTestId}.purpose_block`}
            >
                <FormattedText
                    {...purposeMessages.label}
                    style={styles.purposeLabel}
                    testID={`${publicPrivateTestId}.purpose_label`}
                />
                {purposeTrimmed ? (
                    <Text
                        onLongPress={handleLongPress}
                        style={styles.purposeBody}
                        testID={`${publicPrivateTestId}.purpose`}
                    >
                        {purposeTrimmed}
                    </Text>
                ) : (
                    <FormattedText
                        {...purposeMessages.empty}
                        style={styles.purposePlaceholder}
                        testID={`${publicPrivateTestId}.purpose_empty`}
                    />
                )}
            </View>
        </>
    );
};

export default GroupMessage;
