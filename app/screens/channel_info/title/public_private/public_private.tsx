// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useManagedConfig} from '@mattermost/react-native-emm';
import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Platform, StyleSheet, Text, View} from 'react-native';

import FormattedText from '@components/formatted_text';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import {SNACK_BAR_TYPE} from '@constants/snack_bar';
import {ANDROID_33, OS_VERSION} from '@constants/versions';
import {useTheme} from '@context/theme';
import {bottomSheet, dismissBottomSheet} from '@screens/navigation';
import {CHANNEL_INFO_CARD_RADIUS} from '../../channel_info_constants';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    displayName?: string;
    purpose?: string;
}

const purposeMessages = defineMessages({
    label: {
        id: 'channel_info.purpose_label',
        defaultMessage: 'Purpose',
    },
    empty: {
        id: 'channel_info.purpose_empty',
        defaultMessage: 'No purpose description yet. You can add it under Edit group chat.',
    },
});

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    title: {
        color: theme.centerChannelColor,
        ...typography('Heading', 700, 'SemiBold'),
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

const style = StyleSheet.create({
    bottomsheet: {
        flex: 1,
    },
});

const PublicPrivate = ({displayName, purpose}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const managedConfig = useManagedConfig<ManagedConfig>();

    const styles = getStyleSheet(theme);
    const publicPrivateTestId = 'channel_info.title.public_private';

    const onCopy = useCallback(async () => {
        Clipboard.setString(purpose!);
        await dismissBottomSheet();
        if ((Platform.OS === OS_VERSION.ANDROID && Number(Platform.Version) < ANDROID_33) || Platform.OS === OS_VERSION.IOS) {
            showSnackBar({barType: SNACK_BAR_TYPE.TEXT_COPIED});
        }
    }, [purpose]);

    const handleLongPress = useCallback(() => {
        if (!purpose?.trim()) {
            return;
        }
        if (managedConfig?.copyAndPasteProtection !== 'true') {
            const renderContent = () => {
                return (
                    <View style={style.bottomsheet}>
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
                closeButtonId: 'close-mardown-link',
                renderContent,
                snapPoints: [1, bottomSheetSnapPoint(2, ITEM_HEIGHT)],
                title: intl.formatMessage({id: 'post.options.title', defaultMessage: 'Options'}),
                theme,
            });
        }
    }, [managedConfig?.copyAndPasteProtection, intl, theme, onCopy, purpose]);

    const purposeTrimmed = purpose?.trim() ?? '';

    return (
        <>
            <Text
                style={styles.title}
                testID={`${publicPrivateTestId}.display_name`}
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

export default PublicPrivate;
