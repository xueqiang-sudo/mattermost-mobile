// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Side-effect bootstrap: OpenSans default on Text + disable system font scaling app-wide
 * (Text / TextInput). Import this module once at each JS entry (root index, share extension).
 */

import {Text, TextInput} from 'react-native';

import setFontFamily from './font_family';

setFontFamily();

// @ts-expect-error RN forwardRef Text typings omit defaultProps
Text.defaultProps = {
    ...Text.defaultProps,
    allowFontScaling: false,
    maxFontSizeMultiplier: 1,
};

TextInput.defaultProps = {
    ...TextInput.defaultProps,
    allowFontScaling: false,
    maxFontSizeMultiplier: 1,
};
