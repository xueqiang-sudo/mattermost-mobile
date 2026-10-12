// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

type Props = {
    visible: boolean;
    companyId: string;
    onClose: () => void;
    onSuccess?: () => void;
    testIDPrefix?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.sidebarText, 0.1),
    },
    backBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
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
    nameWrap: {
        flex: 1,
        marginLeft: 12,
    },
    displayName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    username: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    confirmWrap: {
        padding: 20,
    },
    confirmText: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        marginBottom: 20,
    },
    btnRow: {
        flexDirection: 'row',
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        alignItems: 'center',
    },
    cancelBtnText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    confirmBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: theme.errorTextColor,
        alignItems: 'center',
    },
    confirmBtnText: {
        ...typography('Body', 200, 'SemiBold'),
        color: '#ffffff',
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        paddingVertical: 40,
    },
}));

const TransferOwnershipModal = ({visible, companyId, onClose, onSuccess, testIDPrefix = 'transfer_ownership_modal'}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [transferMembers, setTransferMembers] = useState<UserProfile[]>([]);
    const [transferSearch, setTransferSearch] = useState('');
    const [transferConfirmUser, setTransferConfirmUser] = useState<UserProfile | null>(null);
    const [transferring, setTransferring] = useState(false);

    // Load members when modal opens
    useEffect(() => {
        if (!visible || !serverUrl || !companyId) {
            return;
        }
        setTransferSearch('');
        setTransferConfirmUser(null);
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
    }, [visible, serverUrl, companyId]);

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

    const handleClose = useCallback(() => {
        setTransferConfirmUser(null);
        setTransferSearch('');
        onClose();
    }, [onClose]);

    const handleTransferConfirm = useCallback(async () => {
        if (!serverUrl || !companyId || !transferConfirmUser) {
            return;
        }
        setTransferring(true);
        try {
            const client = NetworkManager.getClient(serverUrl);
            await client.transferTeamOwnership(companyId, transferConfirmUser.id);
            showSnackBar({
                barType: SNACK_BAR_TYPE.INFO_COPIED,
                type: MESSAGE_TYPE.SUCCESS,
                message: intl.formatMessage({id: 'contacts.transfer_ownership_success', defaultMessage: '控制权转移成功'}),
            });
            setTransferConfirmUser(null);
            setTransferMembers([]);
            onClose();
            onSuccess?.();
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'contacts.transfer_ownership_failed', defaultMessage: '转移控制权失败，请重试。'}),
            );
        } finally {
            setTransferring(false);
        }
    }, [serverUrl, companyId, transferConfirmUser, intl, onClose, onSuccess]);

    return (
        <Modal
            visible={visible}
            animationType='slide'
            transparent={false}
            onRequestClose={handleClose}
            statusBarTranslucent={true}
        >
            <SafeAreaView edges={SAFE_AREA_EDGES} style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backBtn}
                        onPress={handleClose}
                        testID={`${testIDPrefix}.back`}
                    >
                        <CompassIcon
                            name='arrow-left'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {transferConfirmUser ?
                            intl.formatMessage({id: 'contacts.transfer_confirm', defaultMessage: '确认转移'}) :
                            intl.formatMessage({id: 'contacts.transfer_ownership', defaultMessage: '转移控制权'})
                        }
                    </Text>
                    <View style={styles.backBtn}/>
                </View>

                {transferConfirmUser ? (
                    <View style={styles.confirmWrap}>
                        <Text style={styles.confirmText}>
                            {intl.formatMessage(
                                {id: 'contacts.transfer_confirm_message', defaultMessage: '将 {name} 设为该企业的新所有者？'},
                                {name: transferConfirmUser.nickname || transferConfirmUser.username},
                            )}
                        </Text>
                        <View style={styles.btnRow}>
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={() => setTransferConfirmUser(null)}
                            >
                                <Text style={styles.cancelBtnText}>
                                    {intl.formatMessage({id: 'common.cancel', defaultMessage: '取消'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.confirmBtn}
                                onPress={handleTransferConfirm}
                                disabled={transferring}
                            >
                                <Text style={styles.confirmBtnText}>
                                    {transferring ?
                                        intl.formatMessage({id: 'mobile.post.saving', defaultMessage: '保存中...'}) :
                                        intl.formatMessage({id: 'contacts.transfer', defaultMessage: '转移'})
                                    }
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={{flex: 1}}>
                        <View style={styles.searchWrap}>
                            <TextInput
                                style={styles.searchInput}
                                value={transferSearch}
                                onChangeText={setTransferSearch}
                                placeholder={intl.formatMessage({id: 'contacts.transfer_search_placeholder', defaultMessage: '输入手机号,昵称...'})}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                testID={`${testIDPrefix}.search`}
                            />
                        </View>
                        <FlatList
                            data={filteredTransferMembers}
                            keyExtractor={(item) => item.id}
                            renderItem={({item}) => {
                                const displayName = item.nickname || `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.username;
                                return (
                                    <TouchableOpacity
                                        style={styles.row}
                                        onPress={() => setTransferConfirmUser(item)}
                                    >
                                        <ContactAvatar employee={item} size={36}/>
                                        <View style={styles.nameWrap}>
                                            <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
                                            <Text style={styles.username} numberOfLines={1}>@{item.username}{item.email ? ` · ${item.email}` : ''}</Text>
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
                    </View>
                )}
            </SafeAreaView>
        </Modal>
    );
};

export default TransferOwnershipModal;
