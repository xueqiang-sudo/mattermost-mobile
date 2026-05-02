// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {EmojiIndicesByAlias, Emojis} from '@utils/emoji';

export const PANEL_SCROLL_MAX_HEIGHT = 228;
export const H_PADDING = 10;

/** 排序权重：数字越小在「全部」里越靠前（仅 Emoji 页排序用） */
export const EMOJI_PRIORITY_ALIASES: readonly string[] = [
    'grinning', 'smiley', 'smile', 'grin', 'laughing', 'satisfied', 'sweat_smile',
    'joy', 'rofl', 'blush', 'wink', 'yum', 'sunglasses', 'heart_eyes',
    'kissing_heart', 'thinking_face', 'neutral_face', 'expressionless', 'disappointed_relieved', 'grimacing', 'nauseated_face',
    'rolling_eyes', 'innocent', 'upside_down_face', 'relieved', 'sleeping', 'dizzy_face', 'pleading_face',
    'confused', 'worried', 'hushed', 'shushing_face', 'zipper_mouth_face', 'face_with_monocle', 'smirk',
    'face_with_hand_over_mouth', 'face_with_rolling_eyes', 'unamused', 'sleepy', 'drooling_face', 'mask', 'face_with_thermometer',
    'persevere', 'weary', 'tired_face', 'fearful', 'cold_sweat', 'scream', 'sob',
    'cry', 'anguished', 'frowning', 'slightly_frowning_face', 'disappointed', 'pensive', 'confounded',
    'angry', 'rage', 'triumph', 'flushed', 'face_with_symbols_over_mouth', 'sneezing_face', 'face_with_head_bandage',
    'face_vomiting', 'smiling_imp', 'imp', 'clown_face', 'ghost', 'skull', 'robot_face',
];

/**
 * 「全部表情」集合：
 * - 以常用脸部表情优先（EMOJI_PRIORITY_ALIASES）
 * - 同时包含历史“趣味”页里的手势/符号/物件，保证只保留一个 tab 后仍可访问这些表情。
 */
export const COMMON_EMOJI_ALIASES: readonly string[] = [
    ...EMOJI_PRIORITY_ALIASES,
    'wave', 'clap', 'raised_hands', 'muscle', 'ok_hand', 'thumbsup', 'thumbsdown',
    'pray', 'point_up_2', 'v', 'fist_raised', 'lips', 'heart', 'broken_heart',
    'hatching_chick', 'fire', '100', 'sparkles', 'star2', 'tada', 'gift',
    'moneybag', 'beer', 'coffee', 'birthday', 'rose', 'wilted_rose', 'bomb',
    'poop', 'new_moon_with_face', 'sun_with_face', 'soccer', 'basketball', 'dart', 'pig',
    'jack_o_lantern',
];

type EmojiRow = {image?: string};

/**
 * 去重策略（中文说明）：
 * 1) 先通过 alias 获取 emojiIndex；
 * 2) 再优先用 Emojis[index].image（码位十六进制）作为唯一键；
 * 3) image 缺失时回退到 index 键。
 * 这样可同时避免“同 alias 重复”和“不同 alias 但同字形”两类重复。
 */
export function dedupeAliasesByEmojiGlyph(names: readonly string[]): string[] {
    const seenImage = new Set<string>();
    const out: string[] = [];
    for (const name of names) {
        const emojiIndex = EmojiIndicesByAlias.get(name);
        if (emojiIndex === undefined) {
            continue;
        }
        const emoji = Emojis[emojiIndex] as EmojiRow;
        const imageKey = emoji?.image ?? `idx:${emojiIndex}`;
        if (seenImage.has(imageKey)) {
            continue;
        }
        seenImage.add(imageKey);
        out.push(name);
    }
    return out;
}
