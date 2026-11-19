const assert=require('node:assert/strict');
const {summarize,classify}=require('../frontend/pages/sync-center-core.js');
const base={records:[{id:'a',mg:30}],courses:[],intakes:[],plans:{},settings:{}};
const modified={...base,records:[{id:'a',mg:60}]};
const cloud={...base,records:[{id:'a',mg:90}]};
const draft=({base:b=base,state:s=modified,version=1,username='test'}={})=>
  ({key:'key-'+Math.random(),draft:{base:b,state:s,version,username}});
assert.equal(classify(draft(),base).kind,'pending');
assert.equal(classify(draft(),modified).kind,'already_in_cloud');
assert.equal(classify(draft(),cloud).kind,'possible_conflict');
assert.equal(classify(draft({state:base}),base).kind,'unchanged');
assert.equal(classify({key:'x',invalid:true},base).kind,'unreadable');
const result=summarize([draft(),draft({state:base}),{key:'bad',invalid:true}],base);
assert.equal(result.needsAction,2);
assert.equal(result.tally.pending,1);
assert.equal(result.tally.unchanged,1);
assert.equal(result.tally.unreadable,1);
assert.deepEqual(result.changed,['records']);
console.log('SYNC_CENTER_CLASSIFICATION_PASSED');
