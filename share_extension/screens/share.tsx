// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIntl} from 'react-intl';
import {from as from$} from 'rxjs';

import {MM_TABLES} from '@constants/database';
import ChannelIcon from '@components/channel_icon';
import CompassIcon from '@components/compass_icon';
import DatabaseManager from '@database/manager';
import {getActiveServerUrl} from '@queries/app/servers';
import {getServerCredentials} from '@init/credentials';
import NoMemberships from '@share/components/error/no_memberships';
import NoServers from '@share/components/error/no_servers';
import FilePreview from '@share/components/file_preview';
import {hasChannels} from '@share/queries';
import {setShareExtensionState, setShareExtensionChannelId, useShareExtensionState} from '@share/state';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type {SharedItem} from '@mattermost/rnshare';
import type ChannelModel from '@typings/database/models/servers/channel';

const {SERVER: {CHANNEL}} = MM_TABLES;

type Props = {
    hasChannelMemberships: boolean;
    initialServerUrl: string;
    files: SharedItem[];
    linkPreviewUrl?: string;
    message?: string;
    theme: Theme;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    headerTitle: {
        flex: 1,
        fontSize: 17,
        fontWeight: '600',
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    headerButton: {
        padding: 8,
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    searchInput: {
        height: 36,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 8,
        paddingHorizontal: 12,
        fontSize: 15,
        color: theme.centerChannelColor,
    },
    channelItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    channelItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    checkboxSelected: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    channelIcon: {
        width: 40,
        height: 40,
        marginRight: 12,
    },
    channelInfo: {
        flex: 1,
    },
    channelName: {
        fontSize: 16,
        fontWeight: '500',
        color: theme.centerChannelColor,
    },
    teamName: {
        fontSize: 12,
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginTop: 2,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    emptyText: {
        fontSize: 15,
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
    },
    serverBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    serverLabel: {
        fontSize: 13,
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginRight: 6,
    },
    serverName: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.buttonBg,
    },
}));

const ShareScreen = ({hasChannelMemberships, initialServerUrl, files, linkPreviewUrl, message, theme}: Props) => {
    const intl = useIntl();
    const styles = getStyles(theme);
    const state = useShareExtensionState();

    const [channels, setChannels] = useState<ChannelModel[]>([]);
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const serverUrl = state.serverUrl || initialServerUrl;
    const hasServers = useMemo(() => Object.keys(DatabaseManager.serverDatabases).length > 0, []);

    // Initialize state on mount
    useEffect(() => {
        setShareExtensionState({
            files,
            linkPreviewUrl,
            message,
            serverUrl: initialServerUrl,
        });
    }, []);

    // Load channels when serverUrl changes
    useEffect(() => {
        if (!serverUrl) {
            return;
        }
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            database.get<ChannelModel>(CHANNEL).query().fetch().then((allChannels) => {
                setChannels(allChannels);

                // Auto-select current channel if available
                if (state.channelId) {
                    setSelectedChannelId(state.channelId);
                }
            });
        } catch {
            setChannels([]);
        }
    }, [serverUrl]);

    const filteredChannels = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        return channels.filter((channel) => {
            if (!channel.displayName && !channel.name) {
                return false;
            }
            if (query) {
                const name = channel.displayName?.toLowerCase() || '';
                const channelName = channel.name?.toLowerCase() || '';
                return name.includes(query) || channelName.includes(query);
            }
            return true;
        });
    }, [channels, searchQuery]);

    const handleSelectChannel = useCallback((channel: ChannelModel) => {
        const newId = selectedChannelId === channel.id ? null : channel.id;
        setSelectedChannelId(newId);
        if (newId) {
            setShareExtensionChannelId(newId);
        }
    }, [selectedChannelId]);

    const handleSend = useCallback(async () => {
        if (!selectedChannelId) {
            Alert.alert(
                intl.formatMessage({id: 'forward.select_channel', defaultMessage: 'Select Channel'}),
                intl.formatMessage({id: 'forward.select_channel_message', defaultMessage: 'Please select a channel to forward the message'}),
            );
            return;
        }

        if (!serverUrl || !state.userId) {
            return;
        }

        let text = message || '';
        if (linkPreviewUrl) {
            text = text ? `${text}\n\n${linkPreviewUrl}` : linkPreviewUrl;
        }

        const credentials = await getServerCredentials(serverUrl);
        if (credentials?.token) {
            state.closeExtension({
                serverUrl,
                token: credentials.token,
                channelId: selectedChannelId,
                files,
                message: text,
                userId: state.userId,
                preauthSecret: credentials.preauthSecret,
            });
        }
    }, [selectedChannelId, serverUrl, state.userId, state.closeExtension, message, linkPreviewUrl, files, intl]);

    const handleClose = useCallback(() => {
        state.closeExtension(null);
    }, [state.closeExtension]);

    const renderChannelItem = useCallback(({item: channel}: {item: ChannelModel}) => {
        const isSelected = selectedChannelId === channel.id;

        return (
            <Pressable
                style={[styles.channelItem, isSelected && styles.channelItemSelected]}
                onPress={() => handleSelectChannel(channel)}
            >
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && (
                        <CompassIcon
                            name='check'
                            size={16}
                            color='#fff'
                        />
                    )}
                </View>
                <View style={styles.channelIcon}>
                    <ChannelIcon
                        channelId={channel.id}
                        membersCount={channel.memberCount || 0}
                        name={channel.name}
                        shared={channel.shared || false}
                        size={40}
                        type={channel.type}
                        listModalAvatar={true}
                        isOnCenterBg={true}
                    />
                </View>
                <View style={styles.channelInfo}>
                    <Text style={styles.channelName} numberOfLines={1}>
                        {channel.displayName || channel.name}
                    </Text>
                    {channel.teamName && (
                        <Text style={styles.teamName} numberOfLines={1}>
                            {channel.teamName}
                        </Text>
                    )}
                </View>
            </Pressable>
        );
    }, [selectedChannelId, handleSelectChannel, styles, theme]);

    const renderEmptyState = useCallback(() => (
        <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
                {searchQuery ?
                    intl.formatMessage({id: 'forward.no_channels_found', defaultMessage: 'No channels found'}) :
                    intl.formatMessage({id: 'forward.no_channels', defaultMessage: 'No channels available'})
                }
            </Text>
        </View>
    ), [searchQuery, styles, intl]);

    // Error states
    if (!hasServers) {
        return (
            <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <NoServers theme={theme}/>
            </SafeAreaView>
        );
    }

    if (!hasChannelMemberships) {
        return (
            <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <NoMemberships theme={theme}/>
            </SafeAreaView>
        );
    }

    const canSend = Boolean(selectedChannelId) && (Boolean(message) || files.length > 0 || Boolean(linkPreviewUrl));

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <Pressable style={styles.headerButton} onPress={handleClose}>
                    <CompassIcon
                        name='close'
                        size={24}
                        color={theme.centerChannelColor}
                    />
                </Pressable>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'share_extension.title', defaultMessage: 'Share'})}
                </Text>
                <Pressable
                    style={styles.headerButton}
                    onPress={handleSend}
                    disabled={!canSend}
                >
                    <Text style={{
                        fontSize: 17,
                        fontWeight: '600',
                        color: canSend ? theme.buttonBg : changeOpacity(theme.buttonBg, 0.4),
                    }}>
                        {selectedChannelId
                            ? `${intl.formatMessage({id: 'forward.send', defaultMessage: 'Send'})} (1)`
                            : intl.formatMessage({id: 'forward.send', defaultMessage: 'Send'})
                        }
                    </Text>
                </Pressable>
            </View>

            {files.length > 0 && (
                <FilePreview files={files} theme={theme}/>
            )}

            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder={intl.formatMessage({id: 'forward.search_placeholder', defaultMessage: 'Search groups...'})}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.56)}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize='none'
                    autoCorrect={false}
                />
            </View>

            <FlatList
                data={filteredChannels}
                renderItem={renderChannelItem}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={renderEmptyState}
            />
        </SafeAreaView>
    );
};

const enhanced = withObservables([], () => ({
    initialServerUrl: from$(getActiveServerUrl()),
    hasChannelMemberships: from$(hasChannels()),
}));

export default enhanced(ShareScreen);
