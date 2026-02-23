// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal} from '@screens/navigation';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type AddUserToFriendsProps = {
    componentId: AvailableScreens;
    closeButtonId: string;
    uid?: string;
    ts?: string | number;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    emptyStateIcon: {
        marginBottom: 24,
    },
    emptyStateTitle: {
        color: theme.centerChannelColor,
        textAlign: 'center',
        ...typography('Heading', 400, 'SemiBold'),
    },
    dataSection: {
        marginTop: 24,
        alignSelf: 'stretch',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
    },
    dataRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    dataRowLast: {
        marginBottom: 0,
    },
    dataLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 75, 'SemiBold'),
        minWidth: 80,
    },
    dataValue: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
    },
}));

const AddUserToFriends = ({componentId, closeButtonId, uid, ts}: AddUserToFriendsProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const onClosePressed = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    const uidDisplay = uid ?? '-';
    const tsDisplay = ts != null ? String(ts) : '-';

    return (
        <View
            style={styles.container}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            testID='add_user_to_friends.screen'
        >
            <View style={styles.centerContainer}>
                <View style={styles.emptyStateIcon}>
                    <CompassIcon
                        name='account-outline'
                        size={64}
                        color={changeOpacity(theme.centerChannelColor, 0.4)}
                    />
                </View>
                <FormattedText
                    style={styles.emptyStateTitle}
                    id='add_user_to_friends.under_development'
                    defaultMessage='Feature under development'
                />
                <View style={styles.dataSection}>
                    <View style={styles.dataRow}>
                        <FormattedText
                            style={styles.dataLabel}
                            id='add_user_to_friends.uid_label'
                            defaultMessage='User ID'
                        />
                        <Text
                            style={styles.dataValue}
                            numberOfLines={1}
                            ellipsizeMode='middle'
                        >
                            {uidDisplay}
                        </Text>
                    </View>
                    <View style={[styles.dataRow, styles.dataRowLast]}>
                        <FormattedText
                            style={styles.dataLabel}
                            id='add_user_to_friends.ts_label'
                            defaultMessage='Timestamp'
                        />
                        <Text
                            style={styles.dataValue}
                            numberOfLines={1}
                        >
                            {tsDisplay}
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

export default AddUserToFriends;
