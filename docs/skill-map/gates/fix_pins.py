"""Remove bogus usage records whose key ends with CR (created by a CRLF name list), then pin the real names.
Uses Hermes' own lock + load/save so a live process does not race the write."""
import sys
sys.path.insert(0, r'C:/Users/tahar/AppData/Local/hermes/hermes-agent')
from tools import skill_usage as su

names = [n.strip() for n in open(sys.argv[1], encoding='utf-8').read().split() if n.strip()]
with su._usage_file_lock():
    data = su.load_usage()
    bogus = [k for k in data if k != k.strip()]
    for k in bogus:
        del data[k]
    ok = su.save_usage(data)
print('removed bogus', len(bogus), 'saved', ok)
res = {}
for n in names:
    res[n] = su.set_pinned(n, True)
data = su.load_usage()
pinned = [n for n in names if data.get(n, {}).get('pinned')]
print('pinned', len(pinned), 'of', len(names), 'refused', [n for n in names if not res[n]])
print('bogus left', [k for k in data if k != k.strip()])
