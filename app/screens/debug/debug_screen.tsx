// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {Clipboard, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {getDebugEntries, clearDebugLog} from '@store/debug_log';

const DebugScreen = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const entries = getDebugEntries();

    const handleCopy = useCallback(() => {
        const text = entries.map((e) => `[${e.time}] [${e.tag}] ${e.message}`).join('\n');
        Clipboard.setString(text);
    }, [entries]);

    const handleClear = useCallback(() => {
        clearDebugLog();
        setRefreshKey((k) => k + 1);
    }, []);

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <Text style={styles.title}>🔍 Debug Log ({entries.length})</Text>
                <View style={styles.buttons}>
                    <TouchableOpacity style={styles.button} onPress={handleCopy}>
                        <Text style={styles.buttonText}>Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.button} onPress={handleClear}>
                        <Text style={styles.buttonText}>Clear</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.refreshButton]}
                        onPress={() => setRefreshKey((k) => k + 1)}
                    >
                        <Text style={styles.buttonText}>↻</Text>
                    </TouchableOpacity>
                </View>
            </View>
            <ScrollView style={styles.scroll} key={refreshKey}>
                {entries.length === 0 && (
                    <Text style={styles.empty}>No debug entries yet.</Text>
                )}
                {entries.map((entry, idx) => (
                    <View key={idx} style={styles.row}>
                        <Text style={styles.time}>{entry.time}</Text>
                        <Text style={styles.tag}>[{entry.tag}]</Text>
                        <Text style={entry.tag === 'ERROR' ? styles.errorMsg : styles.message}>
                            {entry.message}
                        </Text>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#16213e',
        borderBottomWidth: 1,
        borderBottomColor: '#0f3460',
    },
    title: {
        color: '#e94560',
        fontSize: 16,
        fontWeight: 'bold',
    },
    buttons: {
        flexDirection: 'row',
        gap: 8,
    },
    button: {
        backgroundColor: '#0f3460',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    refreshButton: {
        paddingHorizontal: 10,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '600',
    },
    scroll: {
        flex: 1,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    empty: {
        color: '#888',
        textAlign: 'center',
        marginTop: 40,
        fontSize: 14,
    },
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingVertical: 2,
        borderBottomWidth: 0.5,
        borderBottomColor: '#1a1a3e',
        gap: 4,
    },
    time: {
        color: '#53a8b6',
        fontSize: 11,
        fontFamily: 'monospace',
    },
    tag: {
        color: '#e94560',
        fontSize: 11,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    message: {
        color: '#d4d4d4',
        fontSize: 11,
        fontFamily: 'monospace',
        flex: 1,
    },
    errorMsg: {
        color: '#ff6b6b',
        fontSize: 11,
        fontFamily: 'monospace',
        flex: 1,
        fontWeight: 'bold',
    },
});

export default DebugScreen;
