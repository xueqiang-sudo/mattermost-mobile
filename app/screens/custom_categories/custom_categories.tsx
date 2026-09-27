// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    FlatList,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {popTopScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    teamId: string;
};

type Category = {
    id: string;
    display_name: string;
    type: 'custom' | 'channels' | 'direct_messages' | 'favorites';
    channel_ids: string[];
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerButton: {padding: 8},
    headerTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    listContent: {padding: 16},
    card: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    cardTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    cardMeta: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    badge: {
        display: 'inline-block',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: changeOpacity(theme.linkColor, 0.15),
    },
    badgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.linkColor,
    },
    createContainer: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    createInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    createButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
    },
    createButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 12,
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
}));

const CustomCategoriesScreen = ({componentId, teamId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [creating, setCreating] = useState(false);

    const handleBack = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    const loadCategories = useCallback(async () => {
        setLoading(true);
        try {
            const {default: NetworkManager} = await import('@managers/network_manager');
            const client = NetworkManager.getClient(serverUrl);
            const data = await client.doFetch(`/users/me/teams/${teamId}/channels/categories`, {method: 'get'});
            setCategories(data || []);
        } catch {
            setCategories([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl, teamId]);

    useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    const handleCreateCategory = usePreventDoubleTap(useCallback(async () => {
        if (!newCategoryName.trim() || creating) {
            return;
        }
        setCreating(true);
        try {
            const {default: NetworkManager} = await import('@managers/network_manager');
            const client = NetworkManager.getClient(serverUrl);
            await client.doFetch(`/users/me/teams/${teamId}/channels/categories`, {
                method: 'post',
                body: JSON.stringify({
                    display_name: newCategoryName.trim(),
                    type: 'custom',
                    channel_ids: [],
                }),
            });
            setNewCategoryName('');
            await loadCategories();
        } catch (error) {
            Alert.alert(
                intl.formatMessage({id: 'custom_categories.create_error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'custom_categories.create_error_message', defaultMessage: 'Failed to create category. Please try again.'}),
            );
        } finally {
            setCreating(false);
        }
    }, [newCategoryName, creating, serverUrl, teamId, intl, loadCategories]));

    const handleCategoryPress = useCallback((category: Category) => {
        // TODO: Open category detail to manage channels
        console.log('Category pressed:', category.id);
    }, []);

    const renderCategory = ({item}: {item: Category}) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => handleCategoryPress(item)}
            activeOpacity={0.7}
        >
            <Text style={styles.cardTitle}>{item.display_name}</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.type}</Text>
                </View>
                <Text style={styles.cardMeta}>
                    {' · '}{item.channel_ids.length} channels
                </Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.flex} testID='custom_categories.screen'>
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
                    <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'custom_categories.title', defaultMessage: 'Custom Categories'})}
                </Text>
                <View style={{width: 40}}/>
            </View>

            <View style={styles.createContainer}>
                <TextInput
                    style={styles.createInput}
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                    placeholder={intl.formatMessage({id: 'custom_categories.placeholder', defaultMessage: 'Category name'})}
                />
                <TouchableOpacity
                    style={[styles.createButton, !newCategoryName.trim() && {opacity: 0.5}]}
                    onPress={handleCreateCategory}
                    disabled={!newCategoryName.trim() || creating}
                >
                    <Text style={styles.createButtonText}>
                        {creating
                            ? intl.formatMessage({id: 'custom_categories.creating', defaultMessage: 'Creating...'})
                            : intl.formatMessage({id: 'custom_categories.create', defaultMessage: 'Create Category'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <Loading color={theme.centerChannelColor} size='small'/>
                </View>
            ) : categories.length === 0 ? (
                <View style={styles.emptyState}>
                    <CompassIcon name='folder-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'custom_categories.empty', defaultMessage: 'No custom categories yet. Create one above.'})}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={categories}
                    keyExtractor={(item) => item.id}
                    renderItem={renderCategory}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </SafeAreaView>
    );
};

export default CustomCategoriesScreen;
