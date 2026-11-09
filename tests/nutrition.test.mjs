import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,defaultNutritionSettings,nutritionDay,nutritionMealTotals,validateNutritionSettings,NUTRITION_FOODS} from '../public/engine.js';
import {initialState,validateState,createStravaWorkspace} from '../public/storage.js';
const intake=()=>({...defaultNutritionSettings(),confirmed:true,age:34,heightCm:181,massKg:75,equationSex:'male',goal:'gradual-loss',targetKg:73,targetDate:'2027-02-28',health:'none',allergies:'none',toleratedCarbsHour:80});
const profile=()=>({...defaultProfile(),nutrition:intake()});
const ride=(minutes=100,unit='W')=>({id:'prescription',date:'2026-11-10',minutes,title:'Endurance foundation',steps:minutes?[{target:193,unit,minutes,repetitions:1}]:[]});
const plan=w=>({version:'test-snapshot',workouts:[w]});
const menu=(minutes=100,unit='W',p=profile(),gym=[])=>nutritionDay(p,plan(ride(minutes,unit)),'2026-11-10',gym);
test('five ovo-lacto meals with three portable meals and on-bike fuel counted exactly once',()=>{
 const m=menu();assert.equal(m.ready,true);assert.equal(m.meals.length,5);assert.equal(m.meals.filter(x=>x.portable).length,3);assert.equal(m.rideFuel.gramsPerHour,45);
 const food=nutritionMealTotals(m.meals.flatMap(x=>x.ingredients));assert.equal(m.totals.carbs,food.carbs+75);assert.equal(m.totals.kcal,food.kcal+300);assert.equal(m.training.planVersion,'test-snapshot');assert.ok(m.meals.every(x=>x.ingredients.every(i=>NUTRITION_FOODS[i.food])));
});
test('cycling energy uses watt snapshot and subtracts baseline allowance to avoid double counting',()=>{
 const m=menu();const work=193*6000/1000;assert.equal(m.targets.cyclingWorkKj,work);assert.ok(Math.abs(m.targets.cyclingKcal-(work/(4.184*.24)-m.targets.nonTrainingKcal*100/1440))<1e-8);assert.equal(m.targets.energyKcal,m.targets.nonTrainingKcal+m.targets.cyclingKcal);assert.equal(m.targets.restDayAdjustmentKcal,0);
});
test('long rides respect tolerance and receive full fueling; gym is a separate energy allowance',()=>{
 const m=menu(215);assert.equal(m.rideFuel.gramsPerHour,75);assert.equal(m.targets.restDayAdjustmentKcal,0);assert.ok(m.totals.carbs>=450);assert.ok(m.totals.kcal>=m.targets.energyKcal*.9);
 const p=profile();p.nutrition.toleratedCarbsHour=40;assert.equal(menu(215,'W',p).rideFuel.gramsPerHour,40);
 const g=menu(100,'W',profile(),[{date:'2026-11-10',ready:true,paused:false,minutes:41}]);assert.equal(g.training.strengthMinutes,41);assert.equal(g.targets.strengthKcal,2.5*75*41/60);assert.match(g.meals[4].timing,/lifting/);
});
test('rest-day adjustment is small, explicit, absent before long work and after goal date',()=>{
 assert.equal(menu(0).targets.restDayAdjustmentKcal,150);const w=ride(0);const m=nutritionDay(profile(),{workouts:[w,{...ride(200),date:'2026-11-11'}]},w.date);assert.equal(m.targets.restDayAdjustmentKcal,0);
 const p=profile();p.nutrition.targetDate='2026-11-01';assert.equal(menu(0,'W',p).targets.restDayAdjustmentKcal,0);
});
test('missing watts, unknown training, or unconsented/out-of-range equations do not invent energy',()=>{
 assert.equal(menu(100,'RPE / 10').targets.energyKcal,null);const m=nutritionDay(profile(),null,'2026-11-10');assert.equal(m.training.knownSchedule,false);assert.equal(m.targets.energyKcal,null);
 for(const update of [{age:40},{equationSex:'none'}]){const p=profile();Object.assign(p.nutrition,update);assert.equal(menu(100,'W',p).targets.energyKcal,null);p.nutrition.restDayKcal=2500;assert.ok(menu(100,'W',p).targets.energyKcal>2500);}
});
test('unconfirmed intake, exclusions, allergies, restrictions and gain pause automatic portions',()=>{
 for(const update of [{confirmed:false},{allergies:'present'},{health:'review'},{excludedFoods:['egg']},{goal:'gain'},{targetKg:50}]){const p=profile();Object.assign(p.nutrition,update);const m=menu(100,'W',p);assert.equal(m.ready,false);assert.equal(m.meals.length,0);}
 assert.throws(()=>validateNutritionSettings({...intake(),age:17}));assert.throws(()=>validateNutritionSettings({...intake(),massKg:NaN}));assert.throws(()=>nutritionMealTotals([{food:'not-a-food',grams:100}]));
});
test('food quantities retain USDA source and actual nutrient energy; supplements never silently added',()=>{
 assert.equal(nutritionMealTotals([{food:'oats',grams:100}]).kcal,379);assert.match(NUTRITION_FOODS.rice.label,/cooked/i);const m=menu();assert.equal(m.supplements.length,8);assert.match(m.supplements.find(x=>x.name==='Iron').status,/No automatic/);assert.ok(m.meals.every(x=>x.ingredients.every(i=>i.grams>0)));
});
test('intake persists and validates but derived menus are not added to stored state',()=>{
 const s=initialState();s.profile=profile();validateState(s);const remote=createStravaWorkspace(s,[]);const before=JSON.stringify(remote);nutritionDay(remote.profile,plan(ride()),'2026-11-10');assert.equal(JSON.stringify(remote),before);assert.deepEqual(remote.profile.nutrition,intake());
});

test('runtime food catalog matches documented provenance and bounded portions remain reviewable',async()=>{
 const {readFile}=await import('node:fs/promises');const documented=JSON.parse(await readFile(new URL('../docs/NUTRITION-FOODS.json',import.meta.url),'utf8'));assert.deepEqual(NUTRITION_FOODS,documented);
 const m=menu(215);assert.ok(m.totals.carbs<=m.targets.carbsG[1]);assert.ok(m.totals.kcal>=m.targets.energyKcal*.9);assert.equal(menu(100,'W',profile(),[{date:'2026-11-10',ready:true,paused:true,minutes:40}]).training.strengthMinutes,0);
 const p=profile();p.nutrition.toleratedCarbsHour=null;assert.equal(menu(100,'W',p).rideFuel.gramsPerHour,30);p.nutrition.breakfastLeadMinutes=60;assert.match(menu(100,'W',p).meals[0].title,/Rice/);
 assert.throws(()=>validateNutritionSettings({...intake(),targetDate:42}));assert.throws(()=>validateNutritionSettings({...intake(),age:34.5}));
});
