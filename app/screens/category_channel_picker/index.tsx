// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {moveChannelToCategory} from '@actions/remote/category';
import ChannelItem from '@components/channel_item';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {showSnackBar} from '@utils/snack_bar';

import type {AvailableScreens} from '@typings/screens/navigation';
import type ChannelModel from '@typings/database/models/servers/channel';

type Props = {
    componentId: AvailableScreens;
    categoryId: string;
    categoryName: string;
    teamId: string;
    allChannels: ChannelModel[];
    currentChannelIds: string[];
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
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    headerTitle: {
        flex: 1,
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    headerButton: {
        padding: 8,
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    searchInput: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        ...typography('Body', 100),
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
    channelInfo: {
        flex: 1,
        marginLeft: 12,
    },
    channelName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    channelDescription: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.16),
        backgroundColor: theme.centerChannelBg,
    },
    footerText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    doneButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 4,
        backgroundColor: theme.buttonBg,
    },
    doneText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
}));

export default function CategoryChannelPicker({
    componentId,
    categoryId,
    categoryName,
    teamId,
    allChannels,
    currentChannelIds,
}: Props) {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentChannelIds));
    const [searchQuery, setSearchQuery] = useState('');
    const [saving, setSaving] = useState(false);

    const filteredChannels = useMemo(() => {
        if (!searchQuery.trim()) {
            return allChannels;
        }
        const query = searchQuery.toLowerCase();
        return allChannels.filter((channel) =>
            channel.displayName.toLowerCase().includes(query) ||
            channel.name.toLowerCase().includes(query),
        );
    }, [allChannels, searchQuery]);

    const handleToggleChannel = useCallback((channelId: string) => {
        setSelectedIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(channelId)) {
                newSet.delete(channelId);
            } else {
                newSet.add(channelId);
            }
            return newSet;
        });
    }, []);

    const handleDone = useCallback(async () => {
        setSaving(true);

        try {
            // Find channels to add (selected but not in category)
            const toAdd = Array.from(selectedIds).filter((id) => !currentChannelIds.includes(id));

            // Find channels to remove (in category but not selected)
            const toRemove = currentChannelIds.filter((id) => !selectedIds.has(id));

            // Move channels to category
            for (const channelId of toAdd) {
                const {error} = await moveChannelToCategory(serverUrl, channelId, categoryId);
                if (error) {
                    showSnackBar({
                        barType: 'INFO',
                        customMessage: intl.formatMessage(
                            {id: 'category_channel_picker.move_error', defaultMessage: 'Failed to move some channels'},
                        ),
                    });
                    break;
                }
            }

            // Move channels out of category (they will go back to default categories)
            for (const channelId of toRemove) {
                const {error} = await moveChannelToCategory(serverUrl, channelId, '');
                if (error) {
                    showSnackBar({
                        barType: 'INFO',
                        customMessage: intl.formatMessage(
                            {id: 'category_channel_picker.move_error', defaultMessage: 'Failed to move some channels'},
                        ),
                    });
                    break;
                }
            }

            const addedCount = toAdd.length;
            const removedCount = toRemove.length;

            if (addedCount > 0 || removedCount > 0) {
                showSnackBar({
                    barType: 'SUCCESS',
                    customMessage: intl.formatMessage(
                        {id: 'category_channel_picker.updated', defaultMessage: 'Category updated: {added} added, {removed} removed'},
                        {added: addedCount, removed: removedCount},
                    ),
                });
            }

            await dismissModal({componentId});
        } catch (error) {
            showSnackBar({
                barType: 'ERROR',
                customMessage: intl.formatMessage(
                    {id: 'category_channel_picker.error', defaultMessage: 'Failed to update category'},
                ),
            });
        } finally {
            setSaving(false);
        }
    }, [selectedIds, currentChannelIds, categoryId, serverUrl, componentId, intl]);

    const handleCancel = useCallback(async () => {
        await dismissModal({componentId});
    }, [componentId]);

    const renderChannel = useCallback(({item}: {item: ChannelModel}) => {
        const isSelected = selectedIds.has(item.id);
        return (
            <TouchableOpacity
                onPress={() => handleToggleChannel(item.id)}
                style={styles.channelItem}
            >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && (
                        <CompassIcon
                            name='check'
                            size={16}
                            color={theme.buttonColor}
                        />
                    )}
                </View>
                <View style={styles.channelInfo}>
                    <Text style={styles.channelName} numberOfLines={1}>
                        {item.displayName}
                    </Text>
                    {item.purpose && (
                        <Text style={styles.channelDescription} numberOfLines={1}>
                            {item.purpose}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    }, [selectedIds, handleToggleChannel, styles, theme.buttonColor]);

    const selectedCount = selectedIds.size;
    const originalCount = currentChannelIds.length;
    const hasChanges = selectedCount !== originalCount ||
        Array.from(selectedIds).some((id) => !currentChannelIds.includes(id)) ||
        currentChannelIds.some((id) => !selectedIds.has(id));

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
                    <CompassIcon
                        name='close'
                        size={24}
                        color={theme.centerChannelColor}
                    />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {categoryName}
                </Text>
                <View style={{width: 40}}/>
            </View>

            <View style={styles.searchContainer}>
                <TextInput
                    placeholder={intl.formatMessage({
                        id: 'category_channel_picker.search',
                        defaultMessage: 'Search channels',
                    })}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={styles.searchInput}
                />
            </View>

            <FlatList
                data={filteredChannels}
                renderItem={renderChannel}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={true}
            />

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    {intl.formatMessage(
                        {id: 'category_channel_picker.selected', defaultMessage: '{count} channels selected'},
                        {count: selectedCount},
                    )}
                </Text>
                <TouchableOpacity
                    onPress={handleDone}
                    disabled={!hasChanges || saving}
                    style={[styles.doneButton, (!hasChanges || saving) && {opacity: 0.5}]}
                >
                    <Text style={styles.doneText}>
                        {intl.formatMessage({id: 'category_channel_picker.done', defaultMessage: 'Done'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
