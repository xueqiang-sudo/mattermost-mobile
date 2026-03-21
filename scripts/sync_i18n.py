#!/usr/bin/env python3
"""Sync zh-CN.json and zh-TW.json to match en.json key order."""
import json
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
i18n_dir = os.path.join(script_dir, '..', 'assets', 'base', 'i18n')
en_path = os.path.join(i18n_dir, 'en.json')
zh_cn_path = os.path.join(i18n_dir, 'zh-CN.json')
zh_tw_path = os.path.join(i18n_dir, 'zh-TW.json')

with open(en_path) as f:
    en = json.load(f)
with open(zh_cn_path) as f:
    zh_cn = json.load(f)
with open(zh_tw_path) as f:
    zh_tw = json.load(f)

en_keys = list(en.keys())

def build_synced(base, fallback):
    return {k: (base[k] if k in base else fallback.get(k, '')) for k in en_keys}

synced_zh_cn = build_synced(zh_cn, en)
synced_zh_tw = build_synced(zh_tw, en)

with open(zh_cn_path, 'w') as f:
    json.dump(synced_zh_cn, f, ensure_ascii=False, indent=2)
    f.write('\n')
with open(zh_tw_path, 'w') as f:
    json.dump(synced_zh_tw, f, ensure_ascii=False, indent=2)
    f.write('\n')

print(f'Synced {len(en_keys)} keys')
