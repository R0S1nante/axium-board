import test from 'node:test';
import assert from 'node:assert/strict';
import {lightingFor,localMinutes,safeTaskUrl,tasksFor} from '../assets/office/studio.mjs';
test('auto lighting changes at 17:00 Almaty, reaches night at 19:00 and daylight at 08:00',()=>{
  assert.equal(lightingFor(1019).night,0);
  assert.equal(lightingFor(1020).night,.35);
  assert.ok(lightingFor(1080).night>lightingFor(1020).night);
  assert.equal(lightingFor(1140).night,1);
  assert.equal(lightingFor(359).night,1);
  assert.equal(lightingFor(420).night,.5);
  assert.equal(lightingFor(480).night,0);
  assert.equal(localMinutes(new Date('2026-10-24T12:00:00Z')),1020);
});
test('manual previews override the clock and lighting variables remain bounded',()=>{
  assert.equal(lightingFor(0,'day').night,0);
  assert.equal(lightingFor(600,'night').night,1);
  assert.equal(lightingFor(600,'evening').night,.58);
  for(let minute=0;minute<1440;minute++)for(const [key,value]of Object.entries(lightingFor(minute))){if(typeof value==='number')assert.ok(value>=0&&value<=1,key+' at '+minute);}
});
test('board task ownership includes waiting tasks and ignores absent owners',()=>{
  const rows=[{title:'A',owners:['Дима'],status:'week'},{title:'B',owners:['Дарья'],status:'waiting'},{title:'C',owners:[' дИМа '],status:'overdue'},{title:'D'},{title:'E',owner:'Дима',status:'later'}];
  assert.deepEqual(tasksFor(rows,'Дима').map(x=>x.title),['C','A','E']);
  assert.deepEqual(tasksFor(rows,'Дарья').map(x=>x.title),['B']);
});
test('task links accept web links and reject executable schemes',()=>{
  assert.equal(safeTaskUrl('javascript:alert(1)'),null);
  assert.equal(safeTaskUrl('data:text/html,hello'),null);
  assert.equal(safeTaskUrl('garbage'),null);
  assert.equal(safeTaskUrl('https://trello.com/c/example'),'https://trello.com/c/example');
});
