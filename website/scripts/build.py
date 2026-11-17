#!/usr/bin/env python3
"""Build the deployed browser bundle from ordered, reviewable source slices."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
PARTS = ('01_core.js','01_sync.js','02_auth.js','02_records.js','02_day.js','03_model.js','04_inverse_overview.js','04_inverse_setup.js','04_inverse_solver.js','05_chart.js','06_presentation.js','07_app_mode.js','07_device_sessions.js','07_offline.js','06_ui.js')
STYLE_PARTS = ('00-foundation.css','10-responsive.css','20-workflow.css','30-reference.css','40-modern-guidance.css','50-studio-redesign.css','70-duo-and-chart.css','80-edge-navigation.css','90-pwa-app.css','95-boot-login.css','96-delete-dose.css','97-sessions-offline.css')
source = ''.join((ROOT / 'frontend' / name).read_text() for name in PARTS)
catalog = json.loads((ROOT / 'shared/catalog.json').read_text())
marker = '/* PK_CATALOG: generated from shared/catalog.json by scripts/build.py */'
assert source.count(marker) == 1
injected = ('const DRUGS = ' + json.dumps(catalog['drugs'],ensure_ascii=False,separators=(',',':')) + ';\n'
            + 'const FOOD_INFO = ' + json.dumps(catalog['food'],ensure_ascii=False,separators=(',',':')) + ';')
source = source.replace(marker, injected)
(ROOT / 'web/app.js').write_text(source)
(ROOT / 'web/styles.css').write_text(''.join((ROOT / 'frontend/css' / name).read_text() for name in STYLE_PARTS))
HTML_PARTS = ('00-document.html','10-shell.html','20-account.html','30-journal.html',
              '40-timeline.html','50-records.html','60-results.html','70-reference.html',
              '80-dialogs.html')
(ROOT / 'web/index.html').write_text(''.join((ROOT / 'frontend/html' / name).read_text()
                                         for name in HTML_PARTS))
(ROOT / 'web/support.css').write_text((ROOT / 'frontend/css/60-support-pages.css').read_text())
# Standalone authenticated diagnostics and portable import/export tools.
# This does not append code into the scientific calculation bundle.
for name in ('data-center.html','data-center.css','data-center.js',
             'data-portability-core.js','sync-center-core.js','push-diagnostics.js'):
    (ROOT / 'web' / name).write_text((ROOT / 'frontend/pages' / name).read_text())
for page in ('quick','install','api'):
    (ROOT / 'web' / (page+'.css')).write_text((ROOT / 'frontend/css/support' / (page+'.css')).read_text())
(ROOT / 'backend/drugs.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
print('built app.js',len(source.encode()),'bytes')
