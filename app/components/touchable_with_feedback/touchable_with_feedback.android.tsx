// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable new-cap */

import React, {memo} from 'react';
import {Pressable, TouchableNativeFeedback, TouchableWithoutFeedback, View, type StyleProp, type ViewStyle, type PressableStateCallbackType} from 'react-native';

type TouchableProps = {
    children: React.ReactNode | React.ReactNode[];
    borderlessRipple?: boolean;
    rippleRadius?: number;
    onPress?: () => void;
    onLongPress?: () => void;
    disabled?: boolean;
    hitSlop?: {top: number; bottom: number; left: number; right: number};
    style?: StyleProp<ViewStyle>;
    testID: string;
    type: 'native' | 'opacity' | 'none';
    underlayColor: string;
    [key: string]: unknown;
}

const TouchableWithFeedbackAndroid = ({borderlessRipple = false, children, rippleRadius, testID, type = 'native', underlayColor, ...props}: TouchableProps) => {
    switch (type) {
        case 'native':
            return (
                <TouchableNativeFeedback
                    testID={testID}
                    {...props}
                    style={[props.style]}
                    background={TouchableNativeFeedback.Ripple(underlayColor || '#fff', borderlessRipple, rippleRadius)}
                >
                    <View>
                        {children}
                    </View>
                </TouchableNativeFeedback>
            );
        case 'opacity':
            // 使用 Pressable 替代 TouchableOpacity 解决 vivo 手机第一次点击无响应问题
            // vivo OriginOS / Funtouch OS 在输入法组合状态下会拦截 TouchableOpacity 的 onPress 用于关闭 IME 组合
            // Pressable 基于 React Native 新手势系统，不受此影响
            return (
                <Pressable
                    testID={testID}
                    {...props}
                    style={(state: PressableStateCallbackType) => {
                        // 模仿 TouchableOpacity 的 opacity 效果
                        const baseStyle = Array.isArray(props.style) ? props.style : [props.style];
                        return [
                            ...baseStyle,
                            {opacity: state.pressed && !props.disabled ? 0.4 : 1},
                        ];
                    }}
                >
                    {children}
                </Pressable>
            );
        default:
            return (
                <TouchableWithoutFeedback
                    testID={testID}
                    {...props}
                >
                    {children}
                </TouchableWithoutFeedback>
            );
    }
};

export default memo(TouchableWithFeedbackAndroid);
