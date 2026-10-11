// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type PostModel from '@typings/database/models/servers/post';

type Props = {
    post: PostModel;
    theme: Theme;
};

type ProductionUpdateData = {
    step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    step_name: string;
    line_id: string;
    current_product?: string;
    spec?: string;
    operator: string;
    timestamp: number;
    data: Record<string, any>;
};

const STEP_ICONS: Record<number, string> = {
    1: '⚙️',
    2: '🔍',
    3: '🧵',
    4: '👁️',
    5: '🅿️',
    6: '📦',
    7: '✅',
    8: '📊',
};

// Parse ProductionUpdateData from message text (fallback when not in props)
function parseProductionDataFromMessage(message: string): ProductionUpdateData | undefined {
    if (!message) {
        return undefined;
    }

    const patterns = [
        /PRODUCTION_DATA\s*\n?([\s\S]*?\{[\s\S]*?\})\s*$/m,
        /```(?:json)?\s*\n?([\s\S]*?\{[\s\S]*?\})\s*```/m,
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match?.[1]) {
            try {
                const parsed = JSON.parse(match[1]);
                if (parsed?.step && parsed?.line_id) {
                    return parsed as ProductionUpdateData;
                }
            } catch {
                const jsonMatch = match[1].match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed?.step && parsed?.line_id) {
                            return parsed as ProductionUpdateData;
                        }
                    } catch {
                        // ignore
                    }
                }
            }
        }
    }

    const jsonMatch = message.match(/\{[\s\S]*"step"[\s\S]*"line_id"[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed?.step && parsed?.line_id) {
                return parsed as ProductionUpdateData;
            }
        } catch {
            // ignore
        }
    }

    return undefined;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    card: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        padding: 12,
        marginVertical: 4,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 8,
        gap: 6,
    },
    icon: {
        fontSize: 18,
    },
    step: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    line: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonBg,
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden',
    },
    badge: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.7),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden',
    },
    fields: {
        marginTop: 4,
    },
    field: {
        flexDirection: 'row',
        paddingVertical: 3,
    },
    fieldLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.6),
        width: 80,
    },
    fieldValue: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        flex: 1,
    },
    fieldHighlight: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        paddingHorizontal: 4,
        borderRadius: 4,
    },
    notes: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.7),
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    footer: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginTop: 6,
    },
    completionBadge: {
        ...typography('Body', 100, 'SemiBold'),
        color: '#4CAF50',
        backgroundColor: '#E8F5E9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        overflow: 'hidden',
        alignSelf: 'flex-start',
        marginBottom: 4,
    },
}));

function Field({label, value, highlight, style}: {label: string; value: any; highlight?: boolean; style: any}) {
    if (value == null || value === '') {
        return null;
    }
    return (
        <View style={style.field}>
            <Text style={style.fieldLabel}>{label}</Text>
            <Text style={[style.fieldValue, highlight && style.fieldHighlight]}>
                {String(value)}
            </Text>
        </View>
    );
}

function GenericFields({data, style}: {data: Record<string, any>; style: any}) {
    return (
        <View style={style.fields}>
            {Object.entries(data).map(([key, val]) => (
                val != null ? (
                    <Field
                        key={key}
                        label={key}
                        value={typeof val === 'object' ? JSON.stringify(val) : val}
                        style={style}
                    />
                ) : null
            ))}
        </View>
    );
}

function renderStepBody(data: ProductionUpdateData, style: any): React.ReactNode {
    const d = data.data;
    switch (data.step) {
        case 1: // 上机
            return (
                <View style={style.fields}>
                    <Field label='在机产品' value={d.current_product} style={style}/>
                    <Field label='规格' value={d.spec} style={style}/>
                    <Field label='开始时间' value={d.start_time} style={style}/>
                    <Field label='分配量' value={d.allocated_kg != null ? `${d.allocated_kg}kg` : undefined} style={style}/>
                    <Field label='日产量' value={d.daily_output_kg != null ? `${d.daily_output_kg}kg` : undefined} style={style}/>
                    <Field label='天数' value={d.duration_days != null ? `${d.duration_days}天` : undefined} style={style}/>
                    <Field label='丝饼数' value={d.roll_count} style={style}/>
                    <Field label='结束时间' value={d.end_time} style={style}/>
                </View>
            );
        case 2: // 上机质检
            return (
                <View style={style.fields}>
                    <Field label='质检结果' value={d.qc_result} style={style}/>
                </View>
            );
        case 3: // 卷绕落丝
            return (
                <View style={style.fields}>
                    <Field label='落丝时间' value={d.doffing_time} style={style}/>
                </View>
            );
        case 4: // 外检
            return (
                <View style={style.fields}>
                    <Field label='检测结果' value={d.inspection_result} style={style}/>
                    <Field label='丝饼数' value={d.roll_count} style={style}/>
                </View>
            );
        case 5: // 私车落位
            return (
                <View style={style.fields}>
                    <Field label='车位' value={d.cart_info} style={style}/>
                </View>
            );
        case 6: // 包装
            return (
                <View style={style.fields}>
                    <Field label='包装数' value={d.package_count ?? d.roll_count} style={style}/>
                    <Field label='包装规格' value={d.package_spec} style={style}/>
                </View>
            );
        case 7: // 生产完成
            return (
                <View style={style.fields}>
                    <Text style={style.completionBadge}>🎉 生产完成</Text>
                    <Field label='丝饼' value={d.roll_count} style={style}/>
                    <Field label='用时' value={d.duration_days != null ? `${d.duration_days}天` : undefined} style={style}/>
                    <Field label='日产量' value={d.daily_output_kg != null ? `${d.daily_output_kg}kg` : undefined} style={style}/>
                    <Field label='结束时间' value={d.actual_end_time ?? d.end_time} style={style}/>
                </View>
            );
        case 8: // 质检报告
            return (
                <View style={style.fields}>
                    <Field label='质检结果' value={d.qc_result} style={style}/>
                    <Field label='合格量' value={d.qualified_kg != null ? `${d.qualified_kg}kg` : undefined} highlight={true} style={style}/>
                    <Field label='废料' value={d.waste_kg != null ? `${d.waste_kg}kg` : undefined} style={style}/>
                    <Field label='过渡丝' value={d.transition_kg != null ? `${d.transition_kg}kg` : undefined} style={style}/>
                    <Field label='报告编号' value={d.report_id} style={style}/>
                </View>
            );
        default:
            return <GenericFields data={d} style={style}/>;
    }
}

const ProductionUpdateCard = ({post, theme}: Props) => {
    const style = getStyleSheet(theme);
    const props = post.props as Record<string, any> | undefined;
    let data: ProductionUpdateData | undefined = props?.production_data;

    // Fallback: try to parse from message text
    if (!data && post.message) {
        data = parseProductionDataFromMessage(post.message);
    }

    // Fallback: render message text if no structured data
    if (!data) {
        return <Text style={{color: theme.centerChannelColor}}>{post.message}</Text>;
    }

    const icon = STEP_ICONS[data.step] || '📋';
    const label = data.step_name || `Step ${data.step}`;
    const notes = (data.data?.notes as string) || '';
    const product = data.current_product || (data.data?.current_product as string) || '';
    const spec = data.spec || (data.data?.spec as string) || '';
    const ts = data.timestamp || (data.data?.timestamp as number) || 0;

    return (
        <View style={style.card}>
            <View style={style.header}>
                <Text style={style.icon}>{icon}</Text>
                <Text style={style.step}>{label}</Text>
                <Text style={style.line}>{data.line_id}</Text>
                {product ? <Text style={style.badge}>{product}</Text> : null}
                {spec ? <Text style={style.badge}>{spec}</Text> : null}
                {data.operator ? <Text style={style.badge}>{data.operator}</Text> : null}
            </View>
            {renderStepBody(data, style)}
            {notes ? <Text style={style.notes}>{notes}</Text> : null}
            {ts > 0 ? <Text style={style.footer}>{new Date(ts).toLocaleString()}</Text> : null}
        </View>
    );
};

export default ProductionUpdateCard;
