// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Modal, Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    visible: boolean;
    selectedDate: string; // YYYY-MM-DD or empty
    onConfirm: (date: string) => void;
    onCancel: () => void;
}

const WEEKDAY_KEYS = [
    {id: 'gm_settings.weekday_mon', defaultMessage: 'Mon'},
    {id: 'gm_settings.weekday_tue', defaultMessage: 'Tue'},
    {id: 'gm_settings.weekday_wed', defaultMessage: 'Wed'},
    {id: 'gm_settings.weekday_thu', defaultMessage: 'Thu'},
    {id: 'gm_settings.weekday_fri', defaultMessage: 'Fri'},
    {id: 'gm_settings.weekday_sat', defaultMessage: 'Sat'},
    {id: 'gm_settings.weekday_sun', defaultMessage: 'Sun'},
];

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay();
    // Convert Sunday=0 to Monday-based: Mon=0, Tue=1, ..., Sun=6
    return day === 0 ? 6 : day - 1;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    overlay: {
        flex: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.5),
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 20,
        width: 320,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    header: {
        fontSize: 16,
        color: theme.centerChannelColor,
        ...typography('Heading', 400, 'SemiBold'),
        textAlign: 'center',
        marginBottom: 16,
    },
    nav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    navButton: {
        padding: 8,
    },
    navIcon: {
        color: theme.centerChannelColor,
    },
    navTitle: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    weekdayRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    weekdayCell: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 4,
    },
    weekdayText: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        ...typography('Body', 75, 'SemiBold'),
    },
    dayGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        alignItems: 'center',
        paddingVertical: 8,
    },
    dayText: {
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    daySelected: {
        backgroundColor: theme.buttonBg,
        borderRadius: 20,
        overflow: 'hidden',
    },
    daySelectedText: {
        color: theme.buttonColor,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 16,
        gap: 12,
    },
    footerButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 4,
    },
    cancelButtonText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 100, 'SemiBold'),
    },
    confirmButtonText: {
        color: theme.buttonBg,
        ...typography('Body', 100, 'SemiBold'),
    },
}));

const DatePickerModal = ({visible, selectedDate, onConfirm, onCancel}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const now = new Date();
    const initial = selectedDate ? new Date(selectedDate + 'T00:00:00') : now;
    const [viewYear, setViewYear] = useState(initial.getFullYear());
    const [viewMonth, setViewMonth] = useState(initial.getMonth());
    const [selectedDay, setSelectedDay] = useState<number | null>(initial.getDate());

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

    const calendarDays = useMemo(() => {
        const cells: Array<{day: number; empty: boolean}> = [];
        for (let i = 0; i < firstDay; i++) {
            cells.push({day: 0, empty: true});
        }
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({day: d, empty: false});
        }
        return cells;
    }, [daysInMonth, firstDay]);

    const handlePrevMonth = useCallback(() => {
        if (viewMonth === 0) {
            setViewYear(viewYear - 1);
            setViewMonth(11);
        } else {
            setViewMonth(viewMonth - 1);
        }
        setSelectedDay(null);
    }, [viewMonth, viewYear]);

    const handleNextMonth = useCallback(() => {
        if (viewMonth === 11) {
            setViewYear(viewYear + 1);
            setViewMonth(0);
        } else {
            setViewMonth(viewMonth + 1);
        }
        setSelectedDay(null);
    }, [viewMonth, viewYear]);

    const handleDayPress = useCallback((day: number) => {
        setSelectedDay(day);
    }, []);

    const handleConfirm = useCallback(() => {
        const day = selectedDay || 1;
        const month = String(viewMonth + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        onConfirm(`${viewYear}-${month}-${dayStr}`);
    }, [selectedDay, viewYear, viewMonth, onConfirm]);

    const monthTitle = intl.formatMessage(
        {id: 'gm_settings.date_picker_title', defaultMessage: '{year}/{month}'},
        {year: viewYear, month: viewMonth + 1},
    );

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType='fade'
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <Text style={styles.header}>
                        {intl.formatMessage({id: 'gm_settings.select_send_date', defaultMessage: 'Select Send Date'})}
                    </Text>

                    {/* Month navigation */}
                    <View style={styles.nav}>
                        <TouchableOpacity style={styles.navButton} onPress={handlePrevMonth}>
                            <CompassIcon name='chevron-left' size={24} style={styles.navIcon}/>
                        </TouchableOpacity>
                        <Text style={styles.navTitle}>{monthTitle}</Text>
                        <TouchableOpacity style={styles.navButton} onPress={handleNextMonth}>
                            <CompassIcon name='chevron-right' size={24} style={styles.navIcon}/>
                        </TouchableOpacity>
                    </View>

                    {/* Weekday headers */}
                    <View style={styles.weekdayRow}>
                        {WEEKDAY_KEYS.map((wd) => (
                            <View key={wd.id} style={styles.weekdayCell}>
                                <Text style={styles.weekdayText}>{intl.formatMessage(wd)}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Day grid */}
                    <View style={styles.dayGrid}>
                        {calendarDays.map((cell, i) => {
                            if (cell.empty) {
                                return <View key={`empty-${i}`} style={styles.dayCell}/>;
                            }
                            const isSelected = selectedDay === cell.day;
                            return (
                                <TouchableOpacity
                                    key={cell.day}
                                    style={[styles.dayCell, isSelected && styles.daySelected]}
                                    onPress={() => handleDayPress(cell.day)}
                                >
                                    <Text style={[styles.dayText, isSelected && styles.daySelectedText]}>
                                        {cell.day}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Footer buttons */}
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.footerButton} onPress={onCancel}>
                            <Text style={styles.cancelButtonText}>
                                {intl.formatMessage({id: 'gm_settings.cancel', defaultMessage: 'Cancel'})}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.footerButton} onPress={handleConfirm}>
                            <Text style={styles.confirmButtonText}>
                                {intl.formatMessage({id: 'gm_settings.confirm', defaultMessage: 'Confirm'})}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default DatePickerModal;
