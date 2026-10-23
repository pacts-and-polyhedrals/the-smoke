// Graffiti presets (0.5.26): ready-made pieces for the Tag Studio — ASMO and 2CB in every style, each faction's
// pieces in its colours with its character, shout-outs for the stations on the dial, and street pieces.
// A preset is only a design (text, style, colours, fill, character); the art is drawn by the piece engine, so a
// painted preset is still regenerated on the GM from trusted data. `pack` is the faction tag identity the preset
// suits; the Tag Studio only uses it when the character has unlocked that pack.

// palettes: fill, fill2, outline, shadow (3D), accent (cloud / glow / sparkles)
const P = (fill, fill2, outline, shadow, accent) => ({fill, fill2, outline, shadow, accent});
const PAL = {
  signature: P('#f2c14e', '#b3122e', '#120a0a', '#5c0a18', '#ffe9a8'),   // gold and crimson
  cold:      P('#7fd4ff', '#3a5bd6', '#0e0f1c', '#3a1d6b', '#c77dff'),
  toxic:     P('#a8ff3e', '#2ea84a', '#0c140c', '#3d1d5c', '#ff4fd8'),
  fire:      P('#ffd23f', '#ff4e1a', '#140c08', '#7b1b10', '#3fd0ff'),
  chrome:    P('#eef3f8', '#9aa7b8', '#12151a', '#3a4250', '#ff3f6c'),
  sickly:    P('#d6a6ff', '#7b3fc4', '#120a1c', '#2a6b4a', '#b6ff6a'),
  blood:     P('#e0233f', '#7a0a18', '#100606', '#3a0610', '#f2c14e'),
  acid:      P('#9cff3a', '#24a34a', '#0b120b', '#4a1f6b', '#ff3fa4'),   // 2CB's signature: acid green and purple
  ultra:     P('#ff5fd2', '#8a2be2', '#120818', '#1b2a6b', '#5ef0ff'),
  sunset:    P('#ffb347', '#ff3f6c', '#160a10', '#5a1a5e', '#ffe58a'),
  ice:       P('#e6fbff', '#6fd3ff', '#0c1620', '#1d4a7a', '#b6ff6a'),
  mono:      P('#f3f0e6', '#b9b4a6', '#101010', '#2a2a2a', '#f2c14e')
};
const STYLE_ORDER = ['tagline', 'marker', 'throwup', 'bubble', 'oldskool', 'blockbuster', 'deep3d', 'newskool', 'burner', 'wildstyle', 'semiwild', 'beastly', 'stencil', 'wetpaint', 'fatcap', 'straight'];
const NICE = {tagline: 'Tag', marker: 'Marker tag', throwup: 'Throw-up', bubble: 'Bubble', oldskool: 'Old skool', blockbuster: 'Blockbuster', deep3d: '3D', newskool: 'New skool', burner: 'Burner',
  wildstyle: 'Wildstyle', semiwild: 'Semi-wild', beastly: 'Spikes', stencil: 'Stencil', wetpaint: 'Drip', fatcap: 'Fat cap', straight: 'Straight letter'};
const make = (group, id, label, text, style, pal, more = {}) => Object.freeze({id, group, label, pack: more.pack ?? null,
  design: Object.freeze({text, style, ...pal, fillMode: more.fill ?? '', character: more.char ?? '', charSide: more.side === 'left' ? 'left' : 'right', skin: more.skin ?? '#8d5a3b',
    extras: Object.freeze({underline: false, arrow: false, drips: false, spark: false, halo: false, crown: false, ...(more.extras || {})})})});

const out = [];
// ASMO — every style, mostly the gold-and-crimson signature, with the d20
const ASMO = {tagline: ['signature'], marker: ['chrome'], throwup: ['signature', 'd20'], bubble: ['cold', 'd20', 'left'], oldskool: ['fire', 'bboy', 'left'], blockbuster: ['chrome'],
  deep3d: ['signature', 'skull'], newskool: ['toxic', 'd20'], burner: ['signature', 'd20', 'right', 'flames'], wildstyle: ['sickly', 'hooded', 'left'], semiwild: ['fire'], beastly: ['toxic', 'skull'],
  stencil: ['mono'], wetpaint: ['blood'], fatcap: ['cold'], straight: ['fire', 'canman']};
for (const style of STYLE_ORDER) { const [pal, char, side, fill] = ASMO[style]; out.push(make('ASMO', `asmo-${style}`, `ASMO · ${NICE[style]}`, 'ASMO', style, PAL[pal], {char, side, fill, extras: style === 'tagline' ? {underline: true} : {}})); }
// 2CB — every style, acid green and purple
const TCB = {tagline: ['acid'], marker: ['ultra'], throwup: ['acid', 'canman'], bubble: ['ultra', 'bgirl', 'left'], oldskool: ['acid', 'selector'], blockbuster: ['sunset'],
  deep3d: ['acid', 'fox'], newskool: ['ultra', 'pigeon'], burner: ['acid', 'bgirl', 'right', 'stars'], wildstyle: ['acid', 'fox', 'left'], semiwild: ['ice'], beastly: ['sickly'],
  stencil: ['acid'], wetpaint: ['toxic'], fatcap: ['sunset'], straight: ['ice', 'pigeon']};
for (const style of STYLE_ORDER) { const [pal, char, side, fill] = TCB[style]; out.push(make('2CB', `2cb-${style}`, `2CB · ${NICE[style]}`, '2CB', style, PAL[pal], {char, side, fill, skin: '#e0ac85', extras: style === 'tagline' ? {underline: true} : {}})); }

// The factions: a full piece with the faction's character, a throw-up and a tag, in its colours
const FACTIONS = [
  ['CH', 'The Chainring', P('#ff8a3d', '#c4451c', '#1b1b1f', '#3b3f47', '#ff7fb0'), 'cog', [['CHAIN RING', 'oldskool'], ['RING', 'throwup'], ['CHAINRING', 'marker']]],
  ['AD', 'Dead Air Collective', P('#78ecf3', '#1f9fb0', '#101418', '#1d2b4a', '#f3ead8'), 'boombox', [['DEAD AIR', 'newskool'], ['DEAD AIR', 'throwup'], ['DAC', 'tagline']]],
  ['LB', 'The Lea Boys', P('#2fbf71', '#146b3e', '#0b0b0b', '#1a1a1a', '#ff5a6e'), 'staffy', [['LEA BOYS', 'wildstyle'], ['LEA', 'throwup'], ['LEA BOYS', 'marker']]],
  ['VC', 'The Velvet Circuit', P('#b9a2ff', '#6a3fc4', '#170f26', '#8a4a1a', '#e8a26a'), 'mask', [['VELVET', 'burner'], ['VC', 'bubble'], ['VELVET', 'tagline']]],
  ['TU', 'The Towpath Union', P('#5ef0c4', '#1b9c85', '#0f1a1a', '#a8462a', '#e07a3a'), 'duck', [['TOWPATH', 'straight'], ['TOW', 'throwup'], ['TPU', 'stencil']]],
  ['GE', 'The Glasshouse Exchange', P('#f6f0de', '#d4af37', '#1d1b16', '#8a6d1d', '#9fe8ff'), 'burglar', [['GLASS HOUSE', 'deep3d'], ['GLASS', 'semiwild'], ['GE', 'stencil']]],
  ['BB', 'The Backroom Bookmakers', P('#f3d98b', '#c9a24a', '#120709', '#6d1430', '#ffc467'), 'ace', [['BACK ROOM', 'blockbuster'], ['ODDS', 'throwup'], ['BB', 'marker']]],
  ['NM', 'The Night Market', P('#ffb347', '#ff7b1a', '#0d1330', '#1b2a6b', '#ffe58a'), 'lantern', [['NIGHT MARKET', 'newskool'], ['MARKET', 'bubble'], ['NM', 'tagline']]],
  ['BM', 'Borough Mutual', P('#5b8def', '#2f5fb8', '#0f1626', '#c98a1a', '#8be6b0'), 'teapot', [['MUTUAL', 'throwup'], ['BOROUGH', 'straight'], ['BM', 'tagline']]],
  ['LD', 'The Lantern Desk', P('#9fb3c8', '#5d7088', '#121820', '#2c3a4d', '#ffc46b'), 'owl', [['LANTERN', 'semiwild'], ['DESK', 'stencil'], ['LD', 'marker']]],
  ['MR', 'Meridian Renewal', P('#e9c46a', '#b8902f', '#16181c', '#2e323b', '#c9d4e0'), 'fatcat', [['MERIDIAN', 'blockbuster'], ['RENEWAL', 'deep3d'], ['MR', 'stencil']]],
  ['RT', 'The Red Thread', P('#f3ead8', '#d9cbb0', '#1a0d0f', '#8c2a2a', '#e2364f'), 'spider', [['RED THREAD', 'wildstyle'], ['THREAD', 'throwup'], ['RT', 'tagline']]]
];
for (const [code, name, pal, char, pieces] of FACTIONS) {
  pieces.forEach(([text, style], i) => out.push(make(name, `${code.toLowerCase()}-${i + 1}`, `${text} · ${NICE[style]}`, text, style, pal,
    {pack: `TAG-${code}`, char: i === 0 ? char : i === 1 && ['throwup', 'bubble'].includes(style) ? char : '', side: i === 1 ? 'left' : 'right'})));
}

// The stations on the dial — shout-outs in our own lettering (no station logos) — and the rival crew
const STATIONS = [
  ['point-blank', 'Point Blank FM', [['POINT BLANK', 'burner', 'vinyl', P('#ffd23f', '#ff7b1a', '#120c06', '#5a1a5e', '#ff5fd2')], ['PBFM', 'throwup', '', P('#ff5fd2', '#8a2be2', '#120818', '#1b2a6b', '#ffd23f')]]],
  ['rude-fm', 'Rude FM', [['RUDE FM', 'wildstyle', 'selector', P('#9cff3a', '#24a34a', '#0b120b', '#1b1b1b', '#ff3f3f')], ['RUDE', 'throwup', '', P('#ff3f3f', '#a8121e', '#100606', '#1b1b1b', '#9cff3a')]]],
  ['vision-radio', 'Vision Radio UK', [['VISION', 'newskool', 'mic', P('#7fd4ff', '#3a5bd6', '#0e0f1c', '#3a1d6b', '#ffd23f')], ['VISION', 'bubble', '', P('#e6fbff', '#6fd3ff', '#0c1620', '#1d4a7a', '#ff5fd2')]]],
  ['flex-fm', 'Flex FM', [['FLEX FM', 'semiwild', 'boombox', P('#ff5fd2', '#c4206e', '#14070f', '#2a1d6b', '#5ef0ff')], ['FLEX', 'throwup', '', P('#5ef0ff', '#1f9fb0', '#0b1418', '#1d2b4a', '#ff5fd2')]]],
  ['supreme-fm', 'Supreme FM', [['SUPREME', 'oldskool', 'vinyl', P('#ffd23f', '#2fbf71', '#100c06', '#a8121e', '#ff9f1a')], ['SUPREME', 'tagline', '', P('#2fbf71', '#146b3e', '#0b0b0b', '#1a1a1a', '#ffd23f')]]],
  ['radio-caroline', 'Radio Caroline UK', [['CAROLINE', 'straight', 'mic', P('#f3f0e6', '#e0233f', '#101010', '#1d2b4a', '#7fd4ff')], ['CAROLINE', 'stencil', '', P('#e0233f', '#7a0a18', '#100606', '#3a0610', '#f3f0e6')]]],
  ['static-kings', 'The Static Kings (rivals)', [['STATIC KINGS', 'beastly', 'skull', P('#c9d4e0', '#6f7f99', '#0c0f14', '#2a2a2a', '#ff3f3f')], ['SK', 'throwup', '', P('#2a2d33', '#101114', '#f3f0e6', '#4b5059', '#ff3f3f')]]]
];
for (const [key, name, pieces] of STATIONS) pieces.forEach(([text, style, char, pal], i) => out.push(make(`Radio · ${name}`, `${key}-${i + 1}`, `${text} · ${NICE[style]}`, text, style, pal, {char, side: 'right'})));

// Street: pieces for anyone, no faction
const STREET = [
  ['THE SMOKE', 'burner', PAL.sunset, 'canman', 'right', 'drops'], ['HACKNEY', 'oldskool', PAL.fire, 'pigeon', 'right'], ['E8', 'bubble', PAL.ultra, '', ''], ['BOW', 'throwup', PAL.cold, 'fox', 'left'],
  ['LONDON', 'wildstyle', PAL.blood, 'hooded', 'right'], ['NO COMMENT', 'semiwild', PAL.chrome, '', ''], ['LEGIT', 'fatcap', PAL.toxic, '', ''], ['KING', 'deep3d', PAL.signature, 'skull', 'right']
];
STREET.forEach(([text, style, pal, char, side, fill], i) => out.push(make('Street', `street-${i + 1}`, `${text} · ${NICE[style]}`, text, style, pal, {char, side, fill})));

export const GRAFFITI_PRESETS = Object.freeze(out);
export const PRESET_GROUPS = Object.freeze([...new Set(out.map(p => p.group))]);
export const presetById = id => GRAFFITI_PRESETS.find(p => p.id === id) ?? null;
/** Where a preset's ready-made art is shipped. */
export const presetArt = id => `assets/graffiti/presets/${id}.svg`;
