// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {Dimensions, StyleSheet, Text, View, type StyleProp, type TextStyle} from 'react-native';

type Props = {
    /** Title string (re-measures when this changes) */
    text: string;
    /** Typography/color styles applied to both measure and visible Text */
    textStyle: StyleProp<TextStyle>;
    testID?: string;
};

const WIDTH_EPSILON = 2;

/**
 * Single-line title: centered when it fits the slot, otherwise left-aligned with tail ellipsis.
 * Parent should give this component flex:1 and minWidth:0 inside a row so width is bounded.
 */
const AdaptiveTitleText = ({text, textStyle, testID}: Props) => {
    const [slotWidth, setSlotWidth] = useState(0);
    const [naturalWidth, setNaturalWidth] = useState(0);

    useEffect(() => {
        setNaturalWidth(0);
    }, [text]);

    const onSlotLayout = useCallback((e: {nativeEvent: {layout: {width: number}}}) => {
        setSlotWidth(e.nativeEvent.layout.width);
    }, []);

    const onMeasureLayout = useCallback((e: {nativeEvent: {lines: Array<{width: number}>}}) => {
        const w = e.nativeEvent.lines[0]?.width;
        if (typeof w === 'number' && w > 0) {
            setNaturalWidth(w);
        }
    }, []);

    const useCenter =
        slotWidth > 0 &&
        naturalWidth > 0 &&
        naturalWidth <= slotWidth + WIDTH_EPSILON;

    return (
        <View
            style={styles.slot}
            onLayout={onSlotLayout}
        >
            <Text
                style={[textStyle, styles.measureText]}
                onTextLayout={onMeasureLayout}
            >
                {text}
            </Text>
            <Text
                style={[textStyle, useCenter ? styles.visibleCenter : styles.visibleLeft]}
                numberOfLines={1}
                ellipsizeMode='tail'
                testID={testID}
            >
                {text}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    slot: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
    },
    measureText: {
        position: 'absolute',
        opacity: 0,
        left: 0,
        top: 0,
        zIndex: -1,
        maxWidth: 10000,
    },
    visibleCenter: {
        textAlign: 'center',
    },
    visibleLeft: {
        textAlign: 'left',
    },
    barTitleRoot: {
        ...StyleSheet.absoluteFillObject,
    },
});

export type ContactsBarEnterpriseTitleProps = {
    text: string;
    textStyle: StyleProp<TextStyle>;
    testID?: string;
    /** onLayout width of the full header row (including horizontal padding) */
    barWidth: number;
    /** Measured width of trailing actions (search, manage, etc.) */
    actionsBlockWidth: number;
    horizontalPadding?: number;
    /** Gap between title area and actions block (matches former title slot margin) */
    titleActionsGap?: number;
};

const barMeasureText = StyleSheet.create({
    hidden: {
        position: 'absolute',
        opacity: 0,
        left: 0,
        top: 0,
        zIndex: -1,
        maxWidth: 10000,
    },
});

/**
 * Contacts header title: horizontally centered on the full bar when the natural width fits between
 * left padding and the actions block; otherwise left-aligned with tail ellipsis.
 */
export function ContactsBarEnterpriseTitle({
    text,
    textStyle,
    testID,
    barWidth,
    actionsBlockWidth,
    horizontalPadding = 16,
    titleActionsGap = 8,
}: ContactsBarEnterpriseTitleProps) {
    const [naturalWidth, setNaturalWidth] = useState(0);

    useEffect(() => {
        setNaturalWidth(0);
    }, [text]);

    const onMeasureLayout = useCallback((e: {nativeEvent: {lines: Array<{width: number}>}}) => {
        const w = e.nativeEvent.lines[0]?.width;
        if (typeof w === 'number' && w > 0) {
            setNaturalWidth(w);
        }
    }, []);

    const W = barWidth > 0 ? barWidth : Dimensions.get('window').width;
    const L = horizontalPadding;
    const textMaxRight = W - horizontalPadding - actionsBlockWidth - titleActionsGap;
    const maxW = Math.max(0, textMaxRight - L);
    const tw = naturalWidth;

    const canCenter =
        W > 0 &&
        tw > 0 &&
        W / 2 - tw / 2 >= L - WIDTH_EPSILON &&
        W / 2 + tw / 2 <= textMaxRight + WIDTH_EPSILON;

    const boxCommon = {
        position: 'absolute' as const,
        top: 0,
        bottom: 0,
        justifyContent: 'center' as const,
    };

    return (
        <View
            style={styles.barTitleRoot}
            pointerEvents='none'
        >
            <Text
                style={[textStyle, barMeasureText.hidden]}
                onTextLayout={onMeasureLayout}
            >
                {text}
            </Text>
            {canCenter ? (
                <View
                    style={[
                        boxCommon,
                        {
                            left: W / 2 - tw / 2,
                            width: tw + WIDTH_EPSILON,
                        },
                    ]}
                >
                    <Text
                        style={textStyle}
                        numberOfLines={1}
                        testID={testID}
                    >
                        {text}
                    </Text>
                </View>
            ) : (
                <View
                    style={[
                        boxCommon,
                        {
                            left: L,
                            width: maxW,
                        },
                    ]}
                >
                    <Text
                        style={textStyle}
                        numberOfLines={1}
                        ellipsizeMode='tail'
                        testID={testID}
                    >
                        {text}
                    </Text>
                </View>
            )}
        </View>
    );
}

export default AdaptiveTitleText;
