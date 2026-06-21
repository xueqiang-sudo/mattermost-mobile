// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {updateChannelNotifyProps} from '@actions/remote/channel';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {observeCurrentUser} from '@queries/servers/user';
import {popTopScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    channelId: string;
    initialNickname: string;
    componentId: AvailableScreens;
    currentUser?: UserModel;
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

const EditGroupNickname = ({
    channelId,
    initialNickname,
    componentId,
    currentUser,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const inputRef = useRef<TextInput>(null);

    const [nickname, setNickname] = useState(initialNickname);

    useEffect(() => {
        setNickname(initialNickname);
    }, [initialNickname]);

    const close = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, close);

    const handleConfirm = useCallback(async () => {
        const trimmed = nickname.trim();
        if (trimmed !== initialNickname) {
            await updateChannelNotifyProps(serverUrl, channelId, {nickname: trimmed});
        }
        close();
    }, [nickname, initialNickname, serverUrl, channelId, close]);

    const handleClear = useCallback(() => {
        setNickname('');
        inputRef.current?.focus();
    }, []);

    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
            <View style={styles.container}>
                <Text style={styles.hint}>
                    {intl.formatMessage({
                        id: 'gm_settings.nickname_hint',
                        defaultMessage: 'After changing your nickname, it will only be displayed within this group. Other members in the group can see it.',
                    })}
                </Text>

                <View style={styles.inputRow}>
                    <ProfilePicture
                        author={currentUser}
                        size={40}
                        showStatus={false}
                    />
                    <TextInput
                        ref={inputRef}
                        style={styles.input}
                        value={nickname}
                        onChangeText={setNickname}
                        placeholder={intl.formatMessage({
                            id: 'gm_settings.nickname_placeholder',
                            defaultMessage: 'Your real name will be used if empty',
                        })}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                        returnKeyType='done'
                        onSubmitEditing={handleConfirm}
                        autoFocus={true}
                    />
                    {nickname.length > 0 && (
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

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
}));

export default withDatabase(enhanced(EditGroupNickname));
