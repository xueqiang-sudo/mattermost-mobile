// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, FlatList, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {fetchUserTodos, type UserTodo} from '../apps/api';

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    headerTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
        marginLeft: 12,
    },
    card: {
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        borderWidth: 0.5,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    channelName: {
        color: theme.buttonBg,
        ...typography('Body', 75, 'SemiBold'),
        marginBottom: 6,
    },
    todoText: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
        lineHeight: 22,
    },
    date: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        ...typography('Body', 50, 'Regular'),
        marginTop: 8,
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
        marginTop: 12,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

const TodosScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

    const [todos, setTodos] = useState<UserTodo[]>([]);
    const [loading, setLoading] = useState(true);

    const loadTodos = useCallback(async () => {
        setLoading(true);
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            const data = await fetchUserTodos(serverUrl, teamId);
            setTodos(data);
        } catch (e) {
            setTodos([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl]);

    useEffect(() => {
        loadTodos();
    }, [loadTodos]);

    const renderItem = ({item}: {item: UserTodo}) => (
        <View style={styles.card}>
            {item.channel_name ? (
                <Text style={styles.channelName}># {item.channel_name}</Text>
            ) : null}
            <Text style={styles.todoText}>{item.memory}</Text>
            {item.date ? (
                <Text style={styles.date}>{item.date}</Text>
            ) : null}
        </View>
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']} testID='todos.screen'>
            <View style={styles.header}>
                <CompassIcon name='format-list-checks' size={24} color={theme.centerChannelColor}/>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'workspace.todos.title', defaultMessage: '待办事项'})}
                </Text>
            </View>
            {todos.length === 0 ? (
                <View style={styles.empty}>
                    <CompassIcon name='check-circle-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'workspace.todos.empty', defaultMessage: '暂无待办事项'})}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={todos}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{paddingBottom: 20}}
                />
            )}
        </SafeAreaView>
    );
};

export default TodosScreen;
