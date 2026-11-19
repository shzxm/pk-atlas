const assert=require('node:assert/strict');
const crypto=require('node:crypto');
globalThis.crypto=crypto.webcrypto;
const x=require('../frontend/pages/data-portability-core.js');
const record={id:"journal-1",drug:"pregabalin",time:1790000000000,mg:75,unit:"mg",courseId:"day-2026-09-21",source:"ios-journal-17.1",journal:{substanceName:"Pregabalin",administrationRoute:"ORAL",stomachFullness:"EMPTY",isDoseAnEstimate:true,estimatedDoseStandardDeviation:6,experienceTitle:"原记录"}};
const state={records:[record],courses:[],intakes:[],plans:{},settings:{renal:{crcl:72},inverseMemory:{pregabalin:{adoptedPointPlan:{v:1}}}}};
const full=x.makeFull(state,{username:"test",version:12,confirmed:true});
assert.deepEqual(x.normalize(full),state);
assert.deepEqual(x.normalize(x.makeLegacy(state)),state);
const journal=x.makeJournal(state);
assert.deepEqual(journal.records,[record]);
assert.deepEqual(x.normalize(journal).records,[record]);
assert(x.makeJournalCsv(state).includes('"isDoseAnEstimate"'));
assert(x.makeJournalCsv(state).includes('"原记录"'));
let result=x.combine({records:[],courses:[],intakes:[],plans:{},settings:{}},full);
assert.equal(result.added,1);
assert.equal(result.settingsRestored,true);
assert.deepEqual(result.state.records,[record]);
assert.deepEqual(result.state.settings,state.settings);
result=x.combine(result.state,full);
assert.equal(result.added,0);assert.equal(result.skipped,1);
assert.equal(result.settingsRestored,false);
assert.throws(()=>x.combine({...state,records:[{...record,mg:85}]},full),/记录 ID 冲突/);
assert.throws(()=>x.normalize({records:[{...record,mg:-5}]}),/无效服药/);
assert.throws(()=>x.normalize({records:[{...record,time:NaN}]}),/无效服药/);
assert.throws(()=>x.normalize({format:"unknown"}),/不能识别/);
console.log("PORTABILITY_ROUND_TRIP_OK");


(async()=>{
  const originalHash=crypto.createHash('sha256').update(
    'iOS Journal 17.1|Pregabalin|1790000000000|75').digest('hex').slice(0,24);
  const native=x.makeNativeJournal(state);
  assert.equal(native.exportSource,'iOS Journal 17.1');
  assert.equal(native.experiences.length,1);
  const reconstructed=await x.parseAny(native);
  assert.equal(reconstructed.records[0].id,'journal17-'+originalHash);
  assert.equal(reconstructed.records[0].journal.experienceTitle,'原记录');
  assert.equal(reconstructed.records[0].mg,75);
  const dupe=x.combine({...state,records:[{...record,id:'journal17-'+originalHash}]},
                       reconstructed,{nativeImport:true});
  assert.equal(dupe.added,0);
  assert.equal(dupe.skipped,1);
  const siteRecord={id:"manual-1",drug:"pregabalin",time:1790000000000+120000,mg:75,unit:"mg"};
  const reviewed=x.combine({records:[siteRecord],courses:[],intakes:[],plans:{},settings:{}},
      reconstructed,{nativeImport:true});
  assert.equal(reviewed.state.records[1].drug,"journal:pregabalin-review");
  assert.equal(reviewed.state.records[1].journal.reviewStatus,"possibleDuplicate");
  console.log('NATIVE_17_1_ROUND_TRIP_OK');
})().catch(err=>{console.error(err);process.exitCode=1});
