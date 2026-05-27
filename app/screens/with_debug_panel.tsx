// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// This screen is registered as a react-native-navigation overlay.
// It renders the DebugPanel floating on top of all other screens.
// Only imported/registered when __DEBUG_PANEL__ is true (enforced by screens/index.tsx).
//
// IMPORTANT: Do NOT use SafeAreaProvider here. SafeAreaProvider renders an
// internal native View (RNCSafeAreaProvider) that does not honour
// pointerEvents='box-none', which causes it to swallow all touches on the
// underlying screen even when the debug panel is closed.

import React from 'react';
import {StyleSheet, View} from 'react-native';

import DebugPanel from '@components/debug_panel';

const styles = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
    },
});

const WithDebugPanel = () => (
    <View
        style={styles.root}
        pointerEvents='box-none'
    >
        <DebugPanel/>
    </View>
);

export default WithDebugPanel;
