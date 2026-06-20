// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {patchChannel} from '@actions/remote/channel';
import ChannelIcon from '@components/channel_icon';
import CompassIcon from '@components/compass_icon';
import General from '@constants/general';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    channelId: string;
    initialDisplayName: string;
    memberIds: string[];
    componentId: AvailableScreens;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    safeArea: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    container: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    hint: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 20,
        ...typography('Body', 75),
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
        paddingBottom: 12,
        marginBottom: 24,
    },
    input: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
        paddingVertical: 0,
        paddingHorizontal: 12,
    },
    clearBtn: {
        padding: 4,
    },
    clearIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
    },
    confirmBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
        paddingVertical: 12,
        alignItems: 'center',
    },
    confirmBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
}));

const EditGroupName = ({
    channelId,
    initialDisplayName,
    memberIds,
    componentId,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const inputRef = useRef<TextInput>(null);

    const [displayName, setDisplayName] = useState(initialDisplayName);

    useEffect(() => {
        setDisplayName(initialDisplayName);
    }, [initialDisplayName]);

    const close = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, close);

    const handleConfirm = useCallback(async () => {
        const trimmed = displayName.trim();
        if (trimmed && trimmed !== initialDisplayName) {
            await patchChannel(serverUrl, channelId, {display_name: trimmed});
        }
        close();
    }, [displayName, initialDisplayName, serverUrl, channelId, close]);

    const handleClear = useCallback(() => {
        setDisplayName('');
        inputRef.current?.focus();
    }, []);

    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
            <View style={styles.container}>
                <Text style={styles.hint}>
                    {intl.formatMessage({
                        id: 'gm_settings.group_name_hint',
                        defaultMessage: 'After changing the group name, other members will be notified in the group.',
                    })}
                </Text>

                <View style={styles.inputRow}>
                    <ChannelIcon
                        channelId={channelId}
                        name={initialDisplayName}
                        type={General.GM_CHANNEL}
                        isOnHome={true}
                        membersCount={memberIds.length}
                        size={40}
                        shared={false}
                    />
                    <TextInput
                        ref={inputRef}
                        style={styles.input}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder={intl.formatMessage({
                            id: 'gm_settings.group_name_placeholder',
                            defaultMessage: 'Enter group name',
                        })}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                        returnKeyType='done'
                        onSubmitEditing={handleConfirm}
                        autoFocus={true}
                    />
                    {displayName.length > 0 && (
                        <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
                            <CompassIcon name='close-circle' size={20} style={styles.clearIcon}/>
                        </TouchableOpacity>
                    )}
                </View>

                <TouchableOpacity onPress={handleConfirm} style={styles.confirmBtn}>
                    <Text style={styles.confirmBtnText}>
                        {intl.formatMessage({id: 'gm_settings.confirm', defaultMessage: 'Confirm'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default EditGroupName;
