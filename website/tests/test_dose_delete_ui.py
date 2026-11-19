"""Dose deletion is opt-in, same handler in editor and list, and sync-safe."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
class Markup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags={}
        self.forms=[]
    def handle_starttag(self,tag,attrs):
        data=dict(attrs)
        if tag=="form":self.forms.append(data.get("id"))
        if data.get("id"):self.tags[data["id"]]=(tag,data)

class DoseDeleteUITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(ROOT/"web/index.html").read_text()
        cls.source=(ROOT/"frontend/06_ui.js").read_text()
        cls.record_source=(ROOT/"frontend/02_records.js").read_text()
    def test_native_confirmation_with_safe_default(self):
        parser=Markup();parser.feed(self.html)
        self.assertEqual(set(parser.forms),{"authForm","doseForm","intakeForm"})
        self.assertEqual(parser.tags["doseDelete"][0],"button")
        self.assertEqual(parser.tags["doseDelete"][1].get("type"),"button")
        self.assertIn("hidden",parser.tags["doseDelete"][1])
        self.assertEqual(parser.tags["deleteDoseDialog"][0],"dialog")
        self.assertEqual(parser.tags["deleteDoseDialog"][1].get("aria-labelledby"),"deleteDoseTitle")
        self.assertEqual(parser.tags["deleteDoseCancel"][1].get("type"),"button")
        self.assertIn("autofocus",parser.tags["deleteDoseCancel"][1])
        self.assertEqual(parser.tags["deleteDoseConfirm"][1].get("type"),"button")
        self.assertIn("确认删除",self.html)
    def test_edit_mode_only_and_shared_handler(self):
        self.assertIn('$("doseDelete").hidden=true;',self.source)
        self.assertIn('$("doseDelete").hidden=false;',self.source)
        self.assertIn('requestDoseDeletion(editingDoseId)',self.source)
        self.assertIn('del.onclick=()=>requestDoseDeletion(r.id);',self.record_source)
        dose_list=self.record_source[self.record_source.index("function renderRecords(){"):self.record_source.index("const DRINK_LABELS=")]
        self.assertNotIn("del.onclick=()=>{if(!confirm(",dose_list)
    def test_no_delete_before_user_confirms(self):
        self.assertIn('pendingDoseDeleteId=id;',self.source)
        self.assertIn('dialog.returnValue==="delete"',self.source)
        self.assertIn('if(confirmed&&id)applyConfirmedDoseDeletion(id)',self.source)
        self.assertIn('records=records.filter(r=>r.id!==id);',self.source)
        self.assertIn('if(!row)return;',self.source)
        self.assertIn('syncClearEditorFields(["doseTime","doseAmount","doseUnit"],row.drug);',self.source)
        start=self.source.index('function applyConfirmedDoseDeletion(id){')
        end=self.source.index('const WHEEL_ROW=',start)
        method=self.source[start:end]
        self.assertLess(method.index("persist();"),method.index("renderDrug();"))
        self.assertIn('appliedPointScenario=null;',method)
    def test_cancel_edit_clears_stale_delete_state(self):
        app=(ROOT/"frontend/07_app_mode.js").read_text()
        self.assertIn('if(form.id==="doseForm"&&editingDoseId)resetDoseEdit();',app)
        self.assertIn('if(form.id==="intakeForm"&&editingIntakeId)resetIntakeEdit();',app)
        css=(ROOT/"frontend/css/96-delete-dose.css").read_text()
        self.assertIn('.delete-dose-dialog:modal{overscroll-behavior:contain}',css)
        self.assertIn('.record-danger:focus-visible',css)
    def test_unmodeled_history_records_have_real_delete_action(self):
        app=(ROOT/"frontend/07_app_mode.js").read_text()
        self.assertIn('edit.textContent=modeled?"编辑":"删除";',app)
        self.assertIn('modeled?editRecord(row.id):requestDoseDeletion(row.id)',app)
        self.assertIn('未来时间，未计入已服用',app)

    def test_intake_edit_can_delete_and_recalculate(self):
        parser=Markup();parser.feed(self.html)
        self.assertEqual(parser.tags["intakeDelete"][0],"button")
        self.assertEqual(parser.tags["intakeDelete"][1].get("type"),"button")
        self.assertIn("hidden",parser.tags["intakeDelete"][1])
        self.assertIn('requestIntakeDeletion(editingIntakeId)',self.source)
        self.assertIn('applyConfirmedIntakeDeletion(intakeId)',self.source)
        self.assertIn('intakes=intakes.filter(row=>row.id!==id);',self.source)
        self.assertIn('del.onclick=()=>requestIntakeDeletion(x.id);',self.record_source)

    def test_no_backend_mutation_for_editor_delete_feature(self):
        self.assertIn('function requestDoseDeletion(id){',self.source)
        self.assertNotIn("fetch(",self.source[self.source.index("function requestDoseDeletion(id){"):self.source.index("const WHEEL_ROW=")])

if __name__=="__main__":
    unittest.main()
