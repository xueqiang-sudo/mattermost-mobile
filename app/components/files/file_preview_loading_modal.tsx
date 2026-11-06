// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {ActivityIndicator, Dimensions, Modal, Pressable, StyleSheet, Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

export type PreviewStep = 'idle' | 'converting' | 'downloading' | 'opening' | 'done';

type FilePreviewLoadingModalProps = {
    visible: boolean;
    fileName: string;
    currentStep: PreviewStep;
    steps: PreviewStep[];
    canCancel: boolean;
    onCancel: () => void;
};

const STEP_LABELS: Record<PreviewStep, string> = {
    converting: '转换文件格式',
    downloading: '下载文件',
    opening: '打开预览',
    idle: '',
    done: '',
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    overlay: {
        flex: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.5),
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 16,
        paddingVertical: 20,
        paddingHorizontal: 24,
        minWidth: 280,
        maxWidth: 340,
        height: Dimensions.get('window').height / 3,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 4},
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    header: {
        marginBottom: 12,
    },
    headerTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    fileName: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 12,
    },
    stepsContainer: {
        marginBottom: 12,
    },
    stepContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    stepIconContainer: {
        width: 28,
        alignItems: 'center',
        marginRight: 12,
    },
    stepCircle: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.24),
    },
    stepLabel: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        flex: 1,
    },
    stepLabelCurrent: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    stepLabelCompleted: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    cancelButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.24),
        marginTop: 4,
    },
    cancelText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
}));

const FilePreviewLoadingModal = ({
    visible,
    fileName,
    currentStep,
    steps,
    canCancel,
    onCancel,
}: FilePreviewLoadingModalProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const getStepStatus = (stepId: PreviewStep): 'completed' | 'current' | 'pending' => {
        if (currentStep === 'done') {
            return 'completed';
        }
        if (currentStep === stepId) {
            return 'current';
        }

        const currentIndex = steps.indexOf(currentStep);
        const stepIndex = steps.indexOf(stepId);

        if (stepIndex < currentIndex) {
            return 'completed';
        }
        return 'pending';
    };

    const renderStepIcon = (status: 'completed' | 'current' | 'pending') => {
        if (status === 'completed') {
            return (
                <CompassIcon
                    name='check-circle'
                    size={22}
                    color='#4CAF50'
                />
            );
        }
        if (status === 'current') {
            return <ActivityIndicator size='small' color={theme.buttonBg}/>;
        }
        return <View style={styles.stepCircle}/>;
    };

    // 【关键修复】如果步骤为空，显示默认的处理中状态
    const displaySteps = steps.length > 0 ? steps : [currentStep === 'idle' ? 'opening' : currentStep];

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType='fade'
            statusBarTranslucent={true}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text
                            style={styles.headerTitle}
                            numberOfLines={1}
                        >
                            正在处理文件
                        </Text>
                    </View>

                    {fileName ? (
                        <Text
                            style={styles.fileName}
                            numberOfLines={2}
                        >
                            {fileName}
                        </Text>
                    ) : null}

                    <View style={styles.stepsContainer}>
                        {displaySteps.map((step) => {
                            const status = getStepStatus(step);
                            return (
                                <View
                                    key={step}
                                    style={styles.stepContainer}
                                >
                                    <View style={styles.stepIconContainer}>
                                        {renderStepIcon(status)}
                                    </View>
                                    <Text style={[
                                        styles.stepLabel,
                                        status === 'current' && styles.stepLabelCurrent,
                                        status === 'completed' && styles.stepLabelCompleted,
                                    ]}>
                                        {STEP_LABELS[step]}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>

                    {canCancel && (
                        <Pressable
                            style={styles.cancelButton}
                            onPress={onCancel}
                        >
                            <Text style={styles.cancelText}>取消</Text>
                        </Pressable>
                    )}
                </View>
            </View>
        </Modal>
    );
};

export default FilePreviewLoadingModal;
