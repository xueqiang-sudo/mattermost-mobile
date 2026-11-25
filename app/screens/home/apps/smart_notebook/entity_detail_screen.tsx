// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    FlatList,
    ScrollView,
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
import DatabaseManager from '@database/manager';
import {goToScreen} from '@screens/navigation';
import {getCurrentUserId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    getGraphEntities,
    getGraphRelations,
    type GraphEntity,
    type GraphRelation,
} from './smart_notebook_api';

// ---- Types ----

type Props = {
    entityUuid: string;
    entityName: string;
    entitySummary: string;
    userId: string;
};

type RelationWithTarget = GraphRelation & {
    targetName: string;
    targetUuid: string;
    targetSummary: string;
    isSource: boolean;
};

// ---- Component ----

const EntityDetailScreen = ({entityUuid, entityName, entitySummary, userId}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [relations, setRelations] = useState<RelationWithTarget[]>([]);
    const [loading, setLoading] = useState(true);
    const [allEntities, setAllEntities] = useState<GraphEntity[]>([]);

    // Load all relations and entities
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [relResult, entResult] = await Promise.all([
                    getGraphRelations(serverUrl, userId),
                    getGraphEntities(serverUrl, userId),
                ]);

                const allRels = relResult.relations || [];
                const allEnts = entResult.entities || [];
                setAllEntities(allEnts);

                // Filter relations involving this entity
                const filtered: RelationWithTarget[] = [];
                for (const rel of allRels) {
                    const isSource = rel.source === entityUuid || rel.source === entityName;
                    const isTarget = rel.target === entityUuid || rel.target === entityName;

                    if (isSource || isTarget) {
                        // Find the other entity
                        const otherName = isSource ? rel.target : rel.source;
                        const otherEntity = allEnts.find(e =>
                            e.uuid === otherName || e.name === otherName
                        );

                        filtered.push({
                            ...rel,
                            targetName: otherEntity?.name || otherName,
                            targetUuid: otherEntity?.uuid || otherName,
                            targetSummary: otherEntity?.summary || '',
                            isSource,
                        });
                    }
                }

                setRelations(filtered);
            } catch (err) {
                console.error('[EntityDetail] Failed to load relations:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [serverUrl, userId, entityUuid, entityName]);

    // Navigate to another entity's detail page
    const handleRelationPress = useCallback((relation: RelationWithTarget) => {
        goToScreen(Screens.ENTITY_DETAIL, relation.targetName, {
            entityUuid: relation.targetUuid,
            entityName: relation.targetName,
            entitySummary: relation.targetSummary,
            userId,
        });
    }, [userId]);

    // Render relation item
    const renderRelation = useCallback(({item}: {item: RelationWithTarget}) => (
        <TouchableOpacity
            style={style.relationCard}
            onPress={() => handleRelationPress(item)}
            activeOpacity={0.7}
        >
            <View style={style.relationHeader}>
                <CompassIcon
                    name={item.isSource ? 'arrow-right' : 'arrow-left'}
                    size={16}
                    color={theme.buttonBg}
                />
                <Text style={style.relationType}>{item.relation_type}</Text>
            </View>
            <Text style={style.relationEntityName} numberOfLines={1}>
                {item.targetName}
            </Text>
            {item.summary ? (
                <Text style={style.relationSummary} numberOfLines={2}>
                    {item.summary}
                </Text>
            ) : null}
        </TouchableOpacity>
    ), [style, theme, handleRelationPress]);

    if (loading) {
        return (
            <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[style.container, {backgroundColor: theme.centerChannelBg}]}>
            <ScrollView
                style={style.container}
                contentContainerStyle={style.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Entity Summary */}
                {entitySummary ? (
                    <View style={style.summarySection}>
                        <Text style={style.sectionTitle}>
                            {intl.formatMessage({id: 'entity_detail.summary', defaultMessage: '摘要'})}
                        </Text>
                        <Text style={style.summaryText}>{entitySummary}</Text>
                    </View>
                ) : null}

                {/* Relations Section */}
                <View style={style.relationsSection}>
                    <Text style={style.sectionTitle}>
                        {intl.formatMessage(
                            {id: 'entity_detail.relations', defaultMessage: '关联关系 ({count})'},
                            {count: relations.length},
                        )}
                    </Text>
                </View>

                {relations.length > 0 ? (
                    relations.map((rel, index) => (
                        <TouchableOpacity
                            key={rel.uuid || index}
                            style={style.relationCard}
                            onPress={() => handleRelationPress(rel)}
                            activeOpacity={0.7}
                        >
                            <View style={style.relationHeader}>
                                <CompassIcon
                                    name={rel.isSource ? 'arrow-right' : 'arrow-left'}
                                    size={16}
                                    color={theme.buttonBg}
                                />
                                <Text style={style.relationType}>{rel.relation_type}</Text>
                            </View>
                            <Text style={style.relationEntityName} numberOfLines={1}>
                                {rel.targetName}
                            </Text>
                            {rel.summary ? (
                                <Text style={style.relationSummary} numberOfLines={2}>
                                    {rel.summary}
                                </Text>
                            ) : null}
                        </TouchableOpacity>
                    ))
                ) : (
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
                )}
            </ScrollView>
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
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    summarySection: {
        marginBottom: 16,
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
        marginBottom: 12,
    },
    relationCard: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
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
        textAlign: 'center',
        marginTop: 12,
    },
}));

export default EntityDetailScreen;
