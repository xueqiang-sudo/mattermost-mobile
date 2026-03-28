// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {Modal, StyleSheet, Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';

type VoiceToastType = 'too_short' | 'record_failed' | 'process_failed' | 'permission_denied';

type VoiceToastProps = {
    visible: boolean;
    type: VoiceToastType;
    message: string;
    onDismiss: () => void;
    duration?: number;
};

const DEFAULT_DURATION = 1500;

/**
 * 微信风格的语音提示组件
 * 在屏幕中央显示带有图标的提示信息
 */
const VoiceToast = React.memo(function VoiceToast({
    visible,
    type,
    message,
    onDismiss,
    duration = DEFAULT_DURATION,
}: VoiceToastProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (visible) {
            setIsVisible(true);
            const timer = setTimeout(() => {
                setIsVisible(false);
                onDismiss();
            }, duration);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [visible, duration, onDismiss]);

    if (!isVisible) {
        return null;
    }

    const getIconName = (): string => {
        switch (type) {
            case 'too_short':
                return 'alert-outline';
            case 'record_failed':
            case 'process_failed':
            case 'permission_denied':
            default:
                return 'close';
        }
    };

    return (
        <Modal
            visible={true}
            transparent={true}
            animationType={'fade'}
            statusBarTranslucent={true}
        >
            <View
                style={styles.overlayRoot}
                pointerEvents={'none'}
            >
                <View style={styles.card}>
                    <CompassIcon
                        name={getIconName()}
                        size={56}
                        color={'#FFFFFF'}
                    />
                    <Text style={styles.toastMessage}>{message}</Text>
                </View>
            </View>
        </Modal>
    );
});

const styles = StyleSheet.create({
    overlayRoot: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    card: {
        minWidth: 140,
        minHeight: 140,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.75)',
        paddingVertical: 24,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toastMessage: {
        color: 'rgba(255,255,255,0.95)',
        fontSize: 14,
        marginTop: 12,
        textAlign: 'center',
        lineHeight: 20,
    },
});

export default VoiceToast;
