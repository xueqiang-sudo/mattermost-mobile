// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {goToScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    getEntityRelations,
    type GraphRelation,
} from './smart_notebook_api';

// ---- Types ----

type Props = {
    entityUuid: string;
    entityName: string;
    entitySummary: string;
    userId: string;
};

// ---- Component ----

const EntityDetailScreen = ({entityUuid, entityName, entitySummary, userId}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [relations, setRelations] = useState<GraphRelation[]>([]);
    const [loading, setLoading] = useState(true);

    // Load relations on mount
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const result = await getEntityRelations(serverUrl, userId, entityUuid, entityName);
                setRelations(result.relations || []);
            } catch {
                setRelations([]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [serverUrl, userId, entityUuid, entityName]);

    // Navigate to another entity's detail page
    const navigateToEntity = useCallback((uuid: string, name: string, summary: string) => {
        goToScreen(Screens.ENTITY_DETAIL, name, {
            entityUuid: uuid,
            entityName: name,
            entitySummary: summary,
            userId,
        });
    }, [userId]);

    // Render relation item
    const renderRelation = useCallback(({item}: {item: GraphRelation}) => {
        const isSource = item.source === entityUuid || item.source === entityName;
        const otherName = isSource ? item.target : item.source;

        return (
            <TouchableOpacity
                style={style.relationCard}
                onPress={() => navigateToEntity('', otherName, '')}
                activeOpacity={0.7}
            >
                <View style={style.relationHeader}>
                    <CompassIcon
                        name={isSource ? 'arrow-right' : 'arrow-left'}
                        size={16}
                        color={theme.buttonBg}
                    />
                    <Text style={style.relationType}>{item.relation_type}</Text>
                </View>
                <Text style={style.relationEntityName}>{otherName}</Text>
                {item.summary ? (
                    <Text style={style.relationSummary} numberOfLines={2}>
                        {item.summary}
                    </Text>
                ) : null}
            </TouchableOpacity>
        );
    }, [entityUuid, entityName, style, theme, navigateToEntity]);

    return (
        <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
            {/* Entity summary */}
            {entitySummary ? (
                <View style={style.summarySection}>
                    <Text style={style.sectionTitle}>
                        {intl.formatMessage({id: 'entity_detail.summary', defaultMessage: '摘要'})}
                    </Text>
                    <Text style={style.summaryText}>{entitySummary}</Text>
                </View>
            ) : null}

            {/* Relations section */}
            <View style={style.relationsSection}>
                <Text style={style.sectionTitle}>
                    {intl.formatMessage(
                        {id: 'entity_detail.relations', defaultMessage: '关联关系 ({count})'},
                        {count: relations.length},
                    )}
                </Text>
            </View>

            {loading ? (
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            ) : (
                <FlatList
                    data={relations}
                    keyExtractor={(item, index) => item.uuid || String(index)}
                    renderItem={renderRelation}
                    contentContainerStyle={style.listContent}
                    ListEmptyComponent={
                        <View style={style.emptyContainer}>
                            <CompassIcon
                                name='share-variant-outline'
                                size={48}
                                color={changeOpacity(theme.centerChannelColor, 0.3)}
                            />
                            <Text style={style.emptyText}>
                                {intl.formatMessage({id: 'entity_detail.no_relations', defaultMessage: '暂无关联关系'})}
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
};

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: any) => ({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    summarySection: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    sectionTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonBg,
        marginBottom: 8,
    },
    summaryText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        lineHeight: 22,
    },
    relationsSection: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    relationCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    relationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    relationType: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    relationEntityName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    relationSummary: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        marginTop: 4,
        lineHeight: 18,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 48,
    },
    emptyText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginTop: 12,
        textAlign: 'center',
    },
}));

export default EntityDetailScreen;
