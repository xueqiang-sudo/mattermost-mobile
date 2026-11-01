// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useRef} from 'react';
import {Dimensions, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import Svg, {Circle, Line, Text as SvgText, G} from 'react-native-svg';

import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type {GraphEntity, GraphRelation} from './smart_notebook_api';

// ---- Types ----

type SimNode = {
    uuid: string;
    name: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
};

type NodePosition = {
    x: number;
    y: number;
};

type KnowledgeGraphProps = {
    entities: GraphEntity[];
    relations: GraphRelation[];
    selectedUuid: string | null;
    onSelectEntity: (uuid: string | null) => void;
    theme: Theme;
};

// ---- Force-directed layout ----

function computeLayout(
    entities: GraphEntity[],
    relations: GraphRelation[],
    width: number,
    height: number,
): Map<string, NodePosition> {
    if (entities.length === 0) return new Map();

    const n = entities.length;
    const cx = width / 2;
    const cy = height / 2;

    // Build adjacency
    const nameToUuid = new Map<string, string>();
    entities.forEach((e) => nameToUuid.set(e.name, e.uuid));

    const edges: Array<{source: string; target: string}> = [];
    for (const rel of relations) {
        const srcUuid = nameToUuid.get(rel.source) || entities.find((e) => e.uuid === rel.source)?.uuid;
        const tgtUuid = nameToUuid.get(rel.target) || entities.find((e) => e.uuid === rel.target)?.uuid;
        if (srcUuid && tgtUuid) {
            edges.push({source: srcUuid, target: tgtUuid});
        }
    }

    // Initialize with circle layout
    const nodes: SimNode[] = entities.map((e, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const radius = Math.min(width, height) * 0.35;
        return {
            uuid: e.uuid,
            name: e.name,
            x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 20,
            y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 20,
            vx: 0,
            vy: 0,
        };
    });

    const nodeIndexMap = new Map<string, number>();
    nodes.forEach((node, i) => nodeIndexMap.set(node.uuid, i));

    // Force-directed simulation
    const iterations = Math.min(150, 60 + n * 2);
    const repulsionStrength = 4000 + n * 80;
    const attractionStrength = 0.006;
    const damping = 0.85;

    for (let iter = 0; iter < iterations; iter++) {
        const temp = 1 - iter / iterations;

        // Repulsion between all pairs
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                let dx = nodes[j].x - nodes[i].x;
                let dy = nodes[j].y - nodes[i].y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) dist = 1;

                const force = (repulsionStrength * temp) / (dist * dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                nodes[i].vx -= fx;
                nodes[i].vy -= fy;
                nodes[j].vx += fx;
                nodes[j].vy += fy;
            }
        }

        // Attraction along edges
        for (const edge of edges) {
            const si = nodeIndexMap.get(edge.source);
            const ti = nodeIndexMap.get(edge.target);
            if (si === undefined || ti === undefined) continue;

            const dx = nodes[ti].x - nodes[si].x;
            const dy = nodes[ti].y - nodes[si].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) continue;

            const force = dist * attractionStrength * temp;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            nodes[si].vx += fx;
            nodes[si].vy += fy;
            nodes[ti].vx -= fx;
            nodes[ti].vy -= fy;
        }

        // Center gravity
        for (const node of nodes) {
            node.vx += (cx - node.x) * 0.01 * temp;
            node.vy += (cy - node.y) * 0.01 * temp;
        }

        // Apply velocities with damping
        for (const node of nodes) {
            node.vx *= damping;
            node.vy *= damping;
            node.x += node.vx;
            node.y += node.vy;

            // Boundary constraints
            node.x = Math.max(40, Math.min(width - 40, node.x));
            node.y = Math.max(40, Math.min(height - 40, node.y));
        }
    }

    const result = new Map<string, NodePosition>();
    nodes.forEach((node) => {
        result.set(node.uuid, {x: node.x, y: node.y});
    });
    return result;
}

// ---- Component ----

const KnowledgeGraph = ({
    entities,
    relations,
    selectedUuid,
    onSelectEntity,
    theme,
}: KnowledgeGraphProps) => {
    const style = getStyleSheet(theme);
    const {width: screenWidth} = Dimensions.get('window');
    const graphWidth = screenWidth - 32;
    const graphHeight = 300;

    // Compute node positions
    const nodePositions = useMemo(() => {
        return computeLayout(entities, relations, graphWidth, graphHeight);
    }, [entities, relations, graphWidth, graphHeight]);

    // Build relation count for node sizing
    const relCountMap = useMemo(() => {
        const map = new Map<string, number>();
        entities.forEach((e) => map.set(e.uuid, 0));
        relations.forEach((rel) => {
            const src = entities.find((e) => e.uuid === rel.source || e.name === rel.source);
            const tgt = entities.find((e) => e.uuid === rel.target || e.name === rel.target);
            if (src) map.set(src.uuid, (map.get(src.uuid) || 0) + 1);
            if (tgt) map.set(tgt.uuid, (map.get(tgt.uuid) || 0) + 1);
        });
        return map;
    }, [entities, relations]);

    // Get related nodes for highlighting
    const relatedUuids = useMemo(() => {
        if (!selectedUuid) return new Set<string>();
        const related = new Set<string>();
        for (const rel of relations) {
            const srcEntity = entities.find((e) => e.uuid === rel.source || e.name === rel.source);
            const tgtEntity = entities.find((e) => e.uuid === rel.target || e.name === rel.target);
            if (srcEntity?.uuid === selectedUuid && tgtEntity) {
                related.add(tgtEntity.uuid);
            }
            if (tgtEntity?.uuid === selectedUuid && srcEntity) {
                related.add(srcEntity.uuid);
            }
        }
        return related;
    }, [selectedUuid, relations, entities]);

    // Pan and zoom state
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);
    const savedTranslateX = useRef(0);
    const savedTranslateY = useRef(0);
    const savedScale = useRef(1);

    // Gesture handler
    const gesture = useMemo(() => {
        return Gesture.Simultaneous(
            // Pan gesture
            Gesture.Pan()
                .onStart(() => {
                    savedTranslateX.current = translateX.value;
                    savedTranslateY.current = translateY.value;
                })
                .onUpdate((e) => {
                    translateX.value = savedTranslateX.current + e.translationX;
                    translateY.value = savedTranslateY.current + e.translationY;
                }),
            // Pinch gesture
            Gesture.Pinch()
                .onStart(() => {
                    savedScale.current = scale.value;
                })
                .onUpdate((e) => {
                    scale.value = Math.max(0.5, Math.min(3, savedScale.current * e.scale));
                }),
        );
    }, [translateX, translateY, scale]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            {translateX: translateX.value},
            {translateY: translateY.value},
            {scale: scale.value},
        ],
    }));

    // Handle node press
    const handleNodePress = useCallback((uuid: string) => {
        onSelectEntity(selectedUuid === uuid ? null : uuid);
    }, [selectedUuid, onSelectEntity]);

    // Reset view
    const handleReset = useCallback(() => {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
    }, [translateX, translateY, scale]);

    if (entities.length === 0) {
        return (
            <View style={style.emptyContainer}>
                <SvgText fill={changeOpacity(theme.centerChannelColor, 0.5)} fontSize={14} textAnchor='middle'>
                    暂无图谱数据
                </SvgText>
            </View>
        );
    }

    // Get node radius based on relation count
    const getNodeRadius = (uuid: string): number => {
        const count = relCountMap.get(uuid) || 0;
        return Math.max(18, Math.min(35, 18 + count * 3));
    };

    // Get node color
    const getNodeColor = (uuid: string): string => {
        if (uuid === selectedUuid) return theme.buttonBg;
        if (relatedUuids.has(uuid)) return changeOpacity(theme.buttonBg, 0.7);
        return changeOpacity(theme.centerChannelColor, 0.3);
    };

    // Get node text color
    const getNodeTextColor = (uuid: string): string => {
        if (uuid === selectedUuid || relatedUuids.has(uuid)) return theme.buttonColor;
        return theme.centerChannelColor;
    };

    // Check if edge is highlighted
    const isEdgeHighlighted = (rel: GraphRelation): boolean => {
        if (!selectedUuid) return false;
        const srcEntity = entities.find((e) => e.uuid === rel.source || e.name === rel.source);
        const tgtEntity = entities.find((e) => e.uuid === rel.target || e.name === rel.target);
        return srcEntity?.uuid === selectedUuid || tgtEntity?.uuid === selectedUuid;
    };

    return (
        <View style={style.container}>
            <GestureDetector gesture={gesture}>
                <Animated.View style={[style.graphContainer, animatedStyle]}>
                    <Svg width={graphWidth} height={graphHeight}>
                        {/* Edges */}
                        {relations.map((rel, idx) => {
                            const srcEntity = entities.find((e) => e.uuid === rel.source || e.name === rel.source);
                            const tgtEntity = entities.find((e) => e.uuid === rel.target || e.name === rel.target);
                            if (!srcEntity || !tgtEntity) return null;

                            const srcPos = nodePositions.get(srcEntity.uuid);
                            const tgtPos = nodePositions.get(tgtEntity.uuid);
                            if (!srcPos || !tgtPos) return null;

                            const highlighted = isEdgeHighlighted(rel);
                            const midX = (srcPos.x + tgtPos.x) / 2;
                            const midY = (srcPos.y + tgtPos.y) / 2;

                            return (
                                <G key={`edge-${idx}`}>
                                    <Line
                                        x1={srcPos.x}
                                        y1={srcPos.y}
                                        x2={tgtPos.x}
                                        y2={tgtPos.y}
                                        stroke={highlighted ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.2)}
                                        strokeWidth={highlighted ? 2 : 1}
                                    />
                                    {rel.relation_type && (
                                        <SvgText
                                            x={midX}
                                            y={midY - 5}
                                            fill={highlighted ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.5)}
                                            fontSize={9}
                                            textAnchor='middle'
                                        >
                                            {rel.relation_type}
                                        </SvgText>
                                    )}
                                </G>
                            );
                        })}

                        {/* Nodes */}
                        {entities.map((entity) => {
                            const pos = nodePositions.get(entity.uuid);
                            if (!pos) return null;

                            const radius = getNodeRadius(entity.uuid);
                            const color = getNodeColor(entity.uuid);
                            const textColor = getNodeTextColor(entity.uuid);
                            const displayName = entity.name.length > 6
                                ? entity.name.substring(0, 5) + '...'
                                : entity.name;

                            return (
                                <G
                                    key={entity.uuid}
                                    onPress={() => handleNodePress(entity.uuid)}
                                >
                                    <Circle
                                        cx={pos.x}
                                        cy={pos.y}
                                        r={radius}
                                        fill={color}
                                        stroke={entity.uuid === selectedUuid ? theme.buttonBg : 'transparent'}
                                        strokeWidth={2}
                                    />
                                    <SvgText
                                        x={pos.x}
                                        y={pos.y + 4}
                                        fill={textColor}
                                        fontSize={10}
                                        textAnchor='middle'
                                    >
                                        {displayName}
                                    </SvgText>
                                </G>
                            );
                        })}
                    </Svg>
                </Animated.View>
            </GestureDetector>
        </View>
    );
};

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        height: 300,
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        overflow: 'hidden',
    },
    graphContainer: {
        flex: 1,
    },
    emptyContainer: {
        height: 100,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

export default KnowledgeGraph;
