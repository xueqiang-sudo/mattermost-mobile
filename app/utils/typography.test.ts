// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {typography, type FontSizes, type FontStyles, type FontTypes} from './typography';

describe('Typography', () => {
    const testCases: Array<[FontTypes, FontSizes, FontStyles | undefined]> = [
        ['Heading', 1200, 'SemiBold'],
        ['Heading', 1000, 'Regular'],
        ['Heading', 900, 'Regular'],
        ['Heading', 800, 'Light'],
        ['Heading', 700, 'Regular'],
        ['Heading', 600, 'Regular'],
        ['Heading', 600, undefined],
        ['Body', 500, 'Regular'],
        ['Body', 400, 'Regular'],
        ['Body', 300, 'Light'],
        ['Body', 200, 'SemiBold'],
        ['Body', 100, 'Light'],
        ['Body', 75, 'Regular'],
        ['Body', 50, 'Regular'],
        ['Body', 25, 'Light'],
        ['Body', 25, undefined],
    ];

    testCases.forEach(([type, size, style]) => {
        it(`returns correct typography for type: ${type}, size: ${size}, style: ${style}`, () => {
            const result = typography(type, size, style);
            expect(result).toBeDefined();

            switch (size) {
                case 1200:
                    expect(result.fontSize).toBe(66);
                    expect(result.lineHeight).toBe(48);
                    expect(result.letterSpacing).toBe(-0.02);
                    break;
                case 1000:
                    expect(result.fontSize).toBe(40);
                    expect(result.lineHeight).toBe(48);
                    expect(result.letterSpacing).toBe(-0.02);
                    break;
                case 900:
                    expect(result.fontSize).toBe(36);
                    expect(result.lineHeight).toBe(44);
                    expect(result.letterSpacing).toBe(-0.02);
                    break;
                case 800:
                    expect(result.fontSize).toBe(32);
                    expect(result.lineHeight).toBe(40);
                    expect(result.letterSpacing).toBe(-0.01);
                    break;
                case 700:
                    expect(result.fontSize).toBe(28);
                    expect(result.lineHeight).toBe(36);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                case 600:
                    expect(result.fontSize).toBe(25);
                    expect(result.lineHeight).toBe(30);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                case 500:
                    expect(result.fontSize).toBe(22);
                    expect(result.lineHeight).toBe(28);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                case 400:
                    expect(result.fontSize).toBe(20);
                    expect(result.lineHeight).toBe(28);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                case 300:
                    expect(result.fontSize).toBe(18);
                    expect(result.lineHeight).toBe(24);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                case 200:
                    expect(result.fontSize).toBe(16);
                    expect(result.lineHeight).toBe(24);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                case 100:
                    expect(result.fontSize).toBe(14);
                    expect(result.lineHeight).toBe(20);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                case 75:
                    expect(result.fontSize).toBe(12);
                    expect(result.lineHeight).toBe(16);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                case 50:
                    expect(result.fontSize).toBe(11);
                    expect(result.lineHeight).toBe(16);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                case 25:
                    expect(result.fontSize).toBe(10);
                    expect(result.lineHeight).toBe(16);
                    expect(result.letterSpacing).toBeUndefined();
                    break;
                default:
                    throw new Error(`Unexpected font size: ${size}`);
            }

            switch (style) {
                case 'SemiBold':
                    expect(result.fontWeight).toBe('600');
                    break;
                case 'Regular':
                    expect(result.fontWeight).toBe('400');
                    break;
                case 'Light':
                    expect(result.fontWeight).toBe('300');
                    break;
                default:
                    if (type === 'Heading') {
                        expect(result.fontWeight).toBe('600');
                    } else {
                        expect(result.fontWeight).toBe('400');
                    }
            }
        });
    });
});
