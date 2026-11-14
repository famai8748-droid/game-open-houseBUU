import os, json

brain = r'C:\Users\informatics\.gemini\antigravity\brain'
success = []
failed = []
for conv in os.listdir(brain):
    t = os.path.join(brain, conv, '.system_generated', 'logs', 'transcript_full.jsonl')
    if os.path.exists(t):
        with open(t, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
            if len(lines) > 0 and 'chunk_' in lines[0] and 'USER_REQUEST' in lines[0]:
                chunk_name = 'unknown'
                for w in lines[0].split():
                    if 'chunk_' in w:
                        chunk_name = w.replace('`', '').replace('"', '').replace("'", '')
                        break
                has_finish = False
                for l in lines:
                    try:
                        obj = json.loads(l)
                        for tc in obj.get('tool_calls') or []:
                            if tc.get('name') == 'finish':
                                has_finish = True
                    except:
                        pass
                if has_finish:
                    success.append((chunk_name, conv))
                else:
                    failed.append((chunk_name, conv))

print('SUCCESS:', sorted(success))
print('FAILED:', sorted(failed))
