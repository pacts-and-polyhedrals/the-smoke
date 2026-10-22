import {STAT_KEYS,DIE_LADDER} from './config.mjs';
import {statModifier, guardValue} from './rules/core.mjs';
import {guardPenalty} from './rules/conditions.mjs';

const {ArrayField, BooleanField, HTMLField, NumberField, ObjectField, SchemaField, StringField} = foundry.data.fields;
const N = (o = {}) => new NumberField({required: true, nullable: false, integer: true, initial: 0, ...o});
const S = (initial = '') => new StringField({required: true, blank: true, initial});
const B = (initial = false) => new BooleanField({required: true, initial});
const H = () => new HTMLField({required: true, blank: true, initial: ''});
const res = (v = 0, max = v) => new SchemaField({value: N({min: 0, initial: v}), max: N({min: 0, initial: max})});
const die = (d = 4) => new SchemaField({die: N({choices:DIE_LADDER, min: 4, max: 20, initial: d})});

class PersonData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      stats: new SchemaField(Object.fromEntries(STAT_KEYS.map(k => [k, die(4)]))),
      stage: N({min: 1, max: 33, initial: 1}),
      advancement:new SchemaField({available:N({min:0}),spent:N({min:0})}),
      resources: new SchemaField({health: res(10), hustle: res(3)}),
      heat: new SchemaField({value: N({min: 0, max: 5}), coolSince: N({min: 0}), seenBy: S()}),
      cash: N({min: 0, initial: 40}),
      stash: N({min: 0}),
      rep: new SchemaField({crew: N(), street: N(), police: N(), xp: N({min: 0})}),
      creation: new SchemaField({done: B(), background: S(), levelledTo: N({min: 1, max: 33, initial: 1}), milestoneRewards:S('[]')}),
      guard: new SchemaField({base: N({min: 0, initial: 4}), armour: N(), value: N({min: 0, initial: 9})}),
      armour: N({min: 0}),
      states: new SchemaField({onARoll: B(), offGame: B(), down: B(), surrendered: B(), reactionUsed:B(), downRounds:N({min:0})}),
      identity: new SchemaField({alias: S(), ends: S('Hackney'), crew: S('The Chainring'), look: S(), hustle: S(), vice: S(), bond: S(), ambition: S(), pronouns: S(), age: S()}),
      role: S('civilian'),           // pc, crew, gang, police, paramedic, fire, civilian, suspect
      disposition: S('neutral'),
      movement: S('1 zone'),
      biography: H(), notes: H()
    };
  }
  prepareDerivedData() {
    this.statMods = Object.fromEntries(STAT_KEYS.map(k => {
      try { return [k, statModifier(this.stats[k]?.die ?? 4)]; } catch (_e) { return [k, 2]; }
    }));
    const conditions = new Set((this.parent?.items ?? []).filter(i => i.type === 'condition').map(i => i.name));
    const wornItem=(this.parent?.items??[]).filter(i=>i.type==='armour'&&i.system.equipped).at(-1);
    const worn=Number(wornItem?.system.guard||0);
    this.guard.armour = worn;
    try {
      this.guard.value = Math.max(0, guardValue({base: this.guard.base, movDie: this.stats.mov.die, grtDie: this.stats.grt.die, armour: worn}) + guardPenalty(conditions));
    } catch (_e) { this.guard.value = 9; }
    this.armour=Number(wornItem?.system.reduction||0);
    this.heatStars = Math.max(0, Math.min(5, Number(this.heat.value || 0)));
  }
}
export class CharacterData extends PersonData {
  static defineSchema(){return {...super.defineSchema(),stats:new SchemaField(Object.fromEntries(STAT_KEYS.map((k,i)=>[k,die(i===0?8:i<4?6:4)])))};}
}
export class NPCData extends PersonData {}

export class VehicleData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      vehicle: new SchemaField({
        klass: S('car'), size: N({min: 0, initial: 2}), perfDie: N({choices:DIE_LADDER,min: 4, max: 20, initial: 6}), handling: N({min: -4, max: 4}),
        speed: N({min: 0, initial: 9}), body: res(12), destroyed:B(), armour: N({min: 0}), fuel: res(10),
        crewFull: N({min: 1, initial: 1}), passengers: N({min: 0, initial: 3}), fireControl: N({min: 0}), crewDie: N({min: 0, max: 20}),
        crewAssignments: S('[]'), control: S('driver'), aiPilot: S(),
        value: N({min: 0, initial: 5000}), lock: S('medium'), jobs: new ArrayField(new StringField({blank: false}), {required: true, initial: []}),
        plateless: B(), flats: N({min: 0, max: 4}), systems: H()
      }),
      biography: H()
    };
  }
  prepareDerivedData() {
    const v = this.vehicle;
    v.wrecked = Number(v.body.value) <= 0;
    v.damaged = Number(v.body.value) < Number(v.body.max) / 2;
  }
}

class ItemBase extends foundry.abstract.TypeDataModel {
  static defineSchema() { return {description: H(), value: N({min: 0}), quantity: N({min: 0, initial: 1})}; }
}
export class WeaponData extends ItemBase {
  static defineSchema() {
    return {...super.defineSchema(), stat: S('aim'), impact: N({min: 0, initial: 2}), range: S('Near'), ammo: res(0), loud: B(true),
            concealable: B(true), kind: S('melee'), crime: S('assault'), equipped: B(true),
            category: S('melee'),          // melee, pistol, smg, shotgun, rifle, throwable, police, heavy
            ammoType: S(), burst: B(), thrown: B(), twoHanded: B(),
            effect: S(),                    // '', stun, gas, fire, bleed, area, smoke
            restricted: B()};               // police / military: never sold
  }
}
export class AmmoData extends ItemBase {
  static defineSchema() { return {...super.defineSchema(), ammoType: S('9mm'), perBox: N({min: 1, initial: 50})}; }
}
export class DrugData extends ItemBase {
  static defineSchema() {
    return {...super.defineSchema(), high: S(), comedown: S(), minutes: N({min: 1, initial: 20}), street: N({min: 0}),
            heat: N({min: 0}), crime: S('possession'), unit: S('bag')};
  }
}
export class ConsumableData extends ItemBase {
  static defineSchema() { return {...super.defineSchema(), heal: N({min: 0}), removes: S(), grants: S(), minutes: N({min: 0, initial: 30}), kind: S('food')}; }
}
export class OutfitData extends ItemBase {
  static defineSchema() { return {...super.defineSchema(), worn: B(), disguise: S(), heatDrop: N({min: 0, initial: 1}), stat: S(), when: S()}; }
}
export class ArmourData extends ItemBase {
  static defineSchema() { return {...super.defineSchema(), guard: N(), reduction: N({min: 0}), equipped: B(true)}; }
}
export class GearData extends ItemBase {
  static defineSchema() { return {...super.defineSchema(), uses: S(), tool: S(), stat: S(), bonus: N()}; }
}
export class ConditionData extends foundry.abstract.TypeDataModel {
  static defineSchema() { return {category: S('physical'), severity: N({min: 0, initial: 1}), stacks:N({min:0}), description: H(), removal: S()}; }
}
export class PerkData extends foundry.abstract.TypeDataModel {
  static defineSchema() { return {stat: S(), description: H(), when: S(), hustleCost: N({min: 0})}; }
}
