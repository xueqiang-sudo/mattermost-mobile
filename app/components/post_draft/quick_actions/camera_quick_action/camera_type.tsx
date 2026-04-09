// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Alert, View} from 'react-native';

import FormattedText from '@components/formatted_text';
import SlideUpPanelItem from '@components/slide_up_panel_item';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {dismissBottomSheet} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {CameraOptions} from 'react-native-image-picker';

type Props = {
    onPress: (options: CameraOptions) => void;
    onVisionVideoPress?: () => void;
}

const getStyle = makeStyleSheetFromTheme((theme: Theme) => ({
    title: {
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
        marginBottom: 8,
    },

}));

const CameraType = ({onPress, onVisionVideoPress}: Props) => {
    const theme = useTheme();
    const isTablet = useIsTablet();
    const style = getStyle(theme);
    const intl = useIntl();

    const onPhoto = async () => {
        const options: CameraOptions = {
            quality: 0.8,
            mediaType: 'photo',
            saveToPhotos: false,
        };

        await dismissBottomSheet();
        onPress(options);
    };

    const onVideo = () => {
        if (onVisionVideoPress) {
            void dismissBottomSheet().then(() => onVisionVideoPress());
            return;
        }
        const title = intl.formatMessage({
            id: 'mobile.camera_video.record_notice_title',
            defaultMessage: 'Record video',
        });
        const message = intl.formatMessage({
            id: 'mobile.camera_video.record_notice_message',
            defaultMessage:
                'Video is limited to 1 minute. The system camera may show a different duration; recording will still stop at 1 minute. The recording screen is provided by your device — use the back gesture or key to discard when available.',
        });
        const options: CameraOptions = {
            videoQuality: 'high',
            mediaType: 'video',
            saveToPhotos: false,
            durationLimit: 60,
        };

        Alert.alert(title, message, [
            {
                text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}),
                style: 'cancel',
            },
            {
                text: intl.formatMessage({
                    id: 'mobile.camera_video.record_notice_continue',
                    defaultMessage: 'Continue',
                }),
                onPress: async () => {
                    await dismissBottomSheet();
                    onPress(options);
                },
            },
        ]);
    };

    const onCancel = async () => {
        await dismissBottomSheet();
    };

    return (
        <View>
            {!isTablet &&
            <FormattedText
                id='mobile.camera_type.title'
                defaultMessage='Camera options'
                style={style.title}
            />
            }
            <SlideUpPanelItem
                leftIcon='camera-outline'
                onPress={onPhoto}
                testID='camera_type.photo'
                text={intl.formatMessage({id: 'camera_type.photo.option', defaultMessage: 'Capture Photo'})}
            />
            <SlideUpPanelItem
                leftIcon='video-outline'
                onPress={onVideo}
                testID='camera_type.video'
                text={intl.formatMessage({id: 'camera_type.video.option', defaultMessage: 'Record Video'})}
            />
            <SlideUpPanelItem
                leftIcon='close'
                onPress={onCancel}
                testID='camera_type.cancel'
                text={intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'})}
            />
        </View>
    );
};

export default CameraType;
