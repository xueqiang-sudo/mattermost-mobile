// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import NetworkManager from '@managers/network_manager';
import {popTopScreen} from '@screens/navigation';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {mergeNavigationOptions} from '@utils/navigation';

import type {AvailableScreens} from '@typings/screens/navigation';

const SAFE_AREA_EDGES: Edge[] = ['bottom', 'left', 'right'];
const CONFIRM_BUTTON_ID = 'transfer-ownership-confirm';

type Props = {
    componentId: AvailableScreens;
    companyId: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    searchWrap: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    searchInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.18),
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: theme.centerChannelColor,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        ...typography('Body', 100),
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    radio: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    radioSelected: {
        borderColor: theme.linkColor,
    },
    radioDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: theme.linkColor,
    },
    nameWrap: {
        flex: 1,
        marginLeft: 12,
    },
    displayName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        paddingVertical: 40,
    },
}));

const TransferOwnershipScreen = ({componentId, companyId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [transferMembers, setTransferMembers] = useState<UserProfile[]>([]);
    const [transferSearch, setTransferSearch] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [transferring, setTransferring] = useState(false);

    const handleClose = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    // Load members when screen opens
    useEffect(() => {
        if (!serverUrl || !companyId) {
            return;
        }
        setTransferSearch('');
        setSelectedUserId(null);
        const loadMembers = async () => {
            try {
                const client = NetworkManager.getClient(serverUrl);
                const me = await client.getMe();
                const members = await client.getTeamMembers(companyId, 0, 200);
                const userIds = members.
                    map((m: {user_id: string}) => m.user_id).
                    filter((id: string) => id !== me?.id);
                if (userIds.length > 0) {
                    const users = await client.getProfilesByIds(userIds);
                    setTransferMembers(users);
                } else {
                    setTransferMembers([]);
                }
            } catch {
                setTransferMembers([]);
            }
        };
        loadMembers();
    }, [serverUrl, companyId]);

    // Set up navigation bar confirm button
    useEffect(() => {
        const confirmText = intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'});
        mergeNavigationOptions(componentId, {
            topBar: {
                rightButtons: [
                    {
                        id: CONFIRM_BUTTON_ID,
                        text: selectedUserId ? confirmText : '',
                        enabled: Boolean(selectedUserId) && !transferring,
                        testID: 'transfer_ownership.confirm',
                    },
                ],
            },
        });
    }, [componentId, selectedUserId, transferring, intl]);

    const filteredTransferMembers = useMemo(() => {
        const term = transferSearch.trim().toLowerCase();
        if (!term) {
            return transferMembers;
        }
        return transferMembers.filter((u) =>
            u.username?.toLowerCase().includes(term) ||
            u.nickname?.toLowerCase().includes(term) ||
            u.email?.toLowerCase().includes(term) ||
            u.first_name?.toLowerCase().includes(term) ||
            u.last_name?.toLowerCase().includes(term),
        );
    }, [transferMembers, transferSearch]);

    const handleTransferConfirm = useCallback(async () => {
        if (!serverUrl || !companyId || !selectedUserId) {
            return;
        }
        const selectedUser = transferMembers.find((u) => u.id === selectedUserId);
        if (!selectedUser) {
            return;
        }

        const ok = await new Promise<boolean>((resolve) => {
            Alert.alert(
                intl.formatMessage({id: 'contacts.transfer_ownership', defaultMessage: '转移控制权'}),
                intl.formatMessage(
                    {id: 'contacts.transfer_confirm_message', defaultMessage: '将 {name} 设为该企业的新所有者？'},
                    {name: selectedUser.nickname || selectedUser.username},
                ),
                [
                    {text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}), style: 'cancel', onPress: () => resolve(false)},
                    {text: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}), onPress: () => resolve(true)},
                ],
            );
        });
        if (!ok) {
            return;
        }

        setTransferring(true);
        try {
            const client = NetworkManager.getClient(serverUrl);
            await client.transferTeamOwnership(companyId, selectedUserId);
            showSnackBar({
                barType: SNACK_BAR_TYPE.INFO_COPIED,
                type: MESSAGE_TYPE.SUCCESS,
                message: intl.formatMessage({id: 'contacts.transfer_ownership_success', defaultMessage: '控制权转移成功'}),
            });
            handleClose();
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'contacts.transfer_ownership_failed', defaultMessage: '转移控制权失败，请重试。'}),
            );
        } finally {
            setTransferring(false);
        }
    }, [serverUrl, companyId, selectedUserId, transferMembers, intl, handleClose]);

    useNavButtonPressed(CONFIRM_BUTTON_ID, componentId, handleTransferConfirm, [handleTransferConfirm]);

    return (
        <SafeAreaView edges={SAFE_AREA_EDGES} style={styles.container}>
            <View style={styles.searchWrap}>
                <TextInput
                    style={styles.searchInput}
                    value={transferSearch}
                    onChangeText={setTransferSearch}
                    placeholder={intl.formatMessage({id: 'contacts.transfer_search_placeholder', defaultMessage: '输入手机号,昵称...'})}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                    testID='transfer_ownership.search'
                />
            </View>
            <FlatList
                data={filteredTransferMembers}
                keyExtractor={(item) => item.id}
                renderItem={({item}) => {
                    const displayName = item.nickname || `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.username;
                    const isSelected = selectedUserId === item.id;
                    return (
                        <TouchableOpacity
                            style={styles.row}
                            onPress={() => setSelectedUserId(isSelected ? null : item.id)}
                        >
                            <View style={[styles.radio, isSelected && styles.radioSelected]}>
                                {isSelected && <View style={styles.radioDot}/>}
                            </View>
                            <ContactAvatar employee={item} size={36}/>
                            <View style={styles.nameWrap}>
                                <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                }}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'contacts.transfer_no_members', defaultMessage: '没有匹配的成员'})}
                    </Text>
                }
            />
        </SafeAreaView>
    );
};

export default TransferOwnershipScreen;
