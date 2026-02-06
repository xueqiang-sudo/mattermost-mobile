// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {View, StyleSheet} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {useTheme} from '@context/theme';

interface QRCodeGeneratorProps {

    /**
     * The data to be encoded in the QR code
     */
    data: string;

    /**
     * The size of the QR code in pixels
     * @default 200
     */
    size?: number;

    /**
     * The color of the QR code modules
     * @default '#000000'
     */
    color?: string;

    /**
     * The color of the QR code background
     * @default '#FFFFFF'
     */
    backgroundColor?: string;

    /**
     * Whether to show a border around the QR code
     * @default true
     */
    showBorder?: boolean;

    /**
     * The style of the container view
     */
    style?: any;
}

/**
 * A reusable QR code generator component
 * Generates a QR code based on the provided data
 */
const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({
    data,
    size = 200,
    color = '#000000',
    backgroundColor = '#FFFFFF',
    showBorder = true,
    style,
}) => {
    const theme = useTheme();

    return (
        <View
            style={[
                styles.container,
                showBorder && {
                    borderWidth: 1,
                    borderColor: theme.centerChannelColor,
                    borderRadius: 8,
                },
                style,
            ]}
        >
            <QRCode
                value={data}
                size={size}
                color={color}
                backgroundColor={backgroundColor}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 16,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default QRCodeGenerator;
