// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {InteractionManager, Text, View} from 'react-native';
import {useIntl} from 'react-intl';
import Tooltip from 'react-native-walkthrough-tooltip';

import {storeScheduledPostTutorial} from '@actions/app/global';
import CompassIcon from '@components/compass_icon';
import ScheduledPostTooltip from '@components/post_draft/send_button/scheduled_post_tooltip';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {changeOpacity, getWeChatCompactSendButtonBackground, makeStyleSheetFromTheme} from '@utils/theme';

type Props = {
    testID: string;
    disabled: boolean;
    sendMessage: () => void;
    showScheduledPostOptions: () => void;
    scheduledPostFeatureTooltipWatched: boolean;
    scheduledPostEnabled: boolean;

    /** 微信风格：圆形绿色发送键 */
    weChatCompact?: boolean;
}

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    const weChatSendBg = getWeChatCompactSendButtonBackground(theme);
    return {
        disableButton: {
            backgroundColor: changeOpacity(theme.buttonBg, 0.3),
        },
        sendButtonContainer: {
            justifyContent: 'flex-end',
            paddingRight: 8,
        },
        sendButton: {
            backgroundColor: theme.buttonBg,
            borderRadius: 4,
            height: 32,
            width: 80,
            alignItems: 'center',
            justifyContent: 'center',
        },
        scheduledPostTooltipStyle: {
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 2},
            shadowRadius: 2,
            shadowOpacity: 0.16,
            elevation: 24,
            width: 250,
            height: 140,
        },
        /** 与 draft_input weChatInputShell minHeight 一致，避免「输入框 / 按住说话」与发送键高度不齐 */
        sendButtonWeChat: {
            height: 40,
            minWidth: 52,
            paddingHorizontal: 14,
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
        },
        sendButtonWeChatActive: {
            backgroundColor: weChatSendBg,
        },
        sendButtonWeChatDisabled: {
            backgroundColor: changeOpacity(weChatSendBg, 0.35),
        },
        sendButtonContainerWeChat: {
            justifyContent: 'flex-end',
            paddingRight: 2,
            paddingLeft: 2,
            marginBottom: 2,
        },
        sendButtonText: {
            fontSize: 16,
            fontWeight: '500',
        },
    };
});

const WECHAT_SEND_ICON = '#FFFFFF';

const SendButton: React.FC<Props> = ({
    testID,
    disabled,
    sendMessage,
    showScheduledPostOptions,
    scheduledPostFeatureTooltipWatched,
    scheduledPostEnabled,
    weChatCompact,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const sendButtonTestID = `${testID}.send.button` + (disabled ? '.disabled' : '');
    const style = getStyleSheet(theme);

    const [scheduledPostTooltipVisible, setScheduledPostTooltipVisible] = useState(false);

    useEffect(() => {
        if (scheduledPostFeatureTooltipWatched || !scheduledPostEnabled) {
            return;
        }

        InteractionManager.runAfterInteractions(() => {
            setScheduledPostTooltipVisible(true);
        });

        // This effect is intended to run only on the first mount, so dependencies are omitted intentionally.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onCloseScheduledPostTooltip = useCallback(() => {
        setScheduledPostTooltipVisible(false);
        storeScheduledPostTutorial();
    }, []);

    const viewStyle = useMemo(() => {
        if (weChatCompact) {
            return [
                style.sendButtonWeChat,
                disabled ? style.sendButtonWeChatDisabled : style.sendButtonWeChatActive,
            ];
        }
        return [style.sendButton, disabled ? style.disableButton : {}];
    }, [disabled, style, weChatCompact]);

    const buttonColor = weChatCompact ? (disabled ? changeOpacity(WECHAT_SEND_ICON, 0.5) : WECHAT_SEND_ICON) : (disabled ? changeOpacity(theme.buttonColor, 0.5) : theme.buttonColor);

    const sendMessageWithDoubleTapPrevention = usePreventDoubleTap(sendMessage);

    return (
        <TouchableWithFeedback
            testID={sendButtonTestID}
            onPress={sendMessageWithDoubleTapPrevention}
            style={weChatCompact ? style.sendButtonContainerWeChat : style.sendButtonContainer}
            type={'opacity'}
            disabled={disabled}
            onLongPress={scheduledPostEnabled ? showScheduledPostOptions : undefined}
        >
            <Tooltip
                isVisible={scheduledPostTooltipVisible}
                useInteractionManager={true}
                placement='top'
                content={<ScheduledPostTooltip onClose={onCloseScheduledPostTooltip}/>}
                onClose={onCloseScheduledPostTooltip}
                tooltipStyle={style.scheduledPostTooltipStyle}
            >
                <View style={viewStyle}>
                    {weChatCompact ? (
                        <Text style={[style.sendButtonText, {color: buttonColor}]}>
                            {intl.formatMessage({id: 'post_draft.send', defaultMessage: 'Send'})}
                        </Text>
                    ) : (
                        <CompassIcon
                            name='send'
                            size={24}
                            color={buttonColor}
                        />
                    )}
                </View>
            </Tooltip>
        </TouchableWithFeedback>
    );
};

export default SendButton;
