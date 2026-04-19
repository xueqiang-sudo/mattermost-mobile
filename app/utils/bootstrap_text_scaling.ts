// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Side-effect bootstrap: 不设置固定字体，跟随系统默认字体，并允许系统字体缩放
 * (Text / TextInput). Import this module once at each JS entry (root index, share extension).
 */

import {Text, TextInput} from 'react-native';

import setFontFamily from './font_family';

setFontFamily();

// @ts-expect-error RN forwardRef Text typings omit defaultProps
Text.defaultProps = {
    ...Text.defaultProps,
    allowFontScaling: true,
};

TextInput.defaultProps = {
    ...TextInput.defaultProps,
    allowFontScaling: true,
};
