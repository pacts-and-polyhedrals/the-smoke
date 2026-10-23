// Graffiti characters (0.5.26): hand-drawn vector cartoon figures in the classic piece style — heavy outline, flat
// colour, one shade tone, white shine — that stand beside the letters. Each is drawn facing right in its own box
// and coloured from the piece's palette: o outline, p clothing (fill 2), s second colour (accent), a third colour
// (fill), k skin. Pure strings, no Foundry APIs.

const shade = (hex, amt) => {
  const s = String(hex || '').replace('#', ''); if (!/^[0-9a-f]{6}$/i.test(s)) return hex;
  const c = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)), f = Math.max(-1, Math.min(1, amt));
  return '#' + c.map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)).toString(16).padStart(2, '0')).join('');
};
const LW = 8;   // outline width in character units
// filled + outlined; plain fill (shade/shine); line only
const F = (o, d, fill, w = LW) => `<path d="${d}" fill="${fill}" stroke="${o}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
const N = (d, fill, op = 1) => `<path d="${d}" fill="${fill}"${op < 1 ? ` opacity="${op}"` : ''}/>`;
const Ln = (o, d, w = 6) => `<path d="${d}" fill="none" stroke="${o}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
const C = (o, cx, cy, r, fill, w = LW) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${o}" stroke-width="${w}"/>`;
const E = (o, cx, cy, rx, ry, fill, w = LW, rot = 0) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${o}" stroke-width="${w}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''}/>`;
const shine = (x, y, s = 1) => `<path d="M${x} ${y + 18 * s}Q${x + 2 * s} ${y + 2 * s} ${x + 20 * s} ${y}" fill="none" stroke="#fffdf4" stroke-width="${7 * s}" stroke-linecap="round" opacity=".9"/><circle cx="${x + 30 * s}" cy="${y - 1 * s}" r="${3.6 * s}" fill="#fffdf4" opacity=".9"/>`;

/** Cool half-lidded eyes looking right. lid = the colour of the eyelid (skin, fur, metal). */
function eyes(o, cx, cy, gap, r, lid, {look = 0.35, lidCut = 0.1, brow = true, angry = false} = {}) {
  let out = '';
  for (const [i, ex] of [cx - gap / 2, cx + gap / 2].entries()) {
    const rx = r * 0.82, ry = r, px = ex + rx * look, py = cy + ry * 0.2;
    out += E(o, ex, cy, rx, ry, '#fffdf4', 6);
    out += `<circle cx="${px}" cy="${py}" r="${r * 0.42}" fill="${o}"/><circle cx="${px + r * 0.14}" cy="${py - r * 0.16}" r="${r * 0.13}" fill="#fff"/>`;
    const yl = cy - ry * lidCut + (angry ? (i ? -1 : 1) * r * 0.18 : 0), yr = cy - ry * lidCut + (angry ? (i ? 1 : -1) * r * 0.18 : 0);
    const kx = rx * Math.sqrt(1 - Math.min(0.95, (lidCut) ** 2));
    out += `<path d="M${ex - kx} ${yl}A${rx} ${ry} 0 0 1 ${ex + kx} ${yr}Q${ex} ${(yl + yr) / 2 + r * 0.12} ${ex - kx} ${yl}Z" fill="${lid}" stroke="${o}" stroke-width="6" stroke-linejoin="round"/>`;
    if (brow) out += Ln(o, `M${ex - rx * 1.05} ${cy - ry * 1.15 + (angry ? (i ? -6 : 8) : 0)}Q${ex} ${cy - ry * 1.55} ${ex + rx * 1.1} ${cy - ry * 1.2 + (angry ? (i ? 8 : -6) : 0)}`, 7);
  }
  return out;
}
/** A big cheeky grin with teeth and tongue. */
function grin(o, cx, cy, w, h, tilt = 0) {
  const l = cx - w / 2, r = cx + w / 2;
  return `<g transform="rotate(${tilt} ${cx} ${cy})">${F(o, `M${l} ${cy}Q${cx} ${cy + h * 1.25} ${r} ${cy - h * 0.25}Q${cx + w * 0.1} ${cy + h * 0.22} ${l} ${cy}Z`, '#3a0f17', 6)}`
    + N(`M${l + w * 0.12} ${cy + h * 0.1}Q${cx} ${cy + h * 0.42} ${r - w * 0.1} ${cy - h * 0.12}Q${cx + w * 0.1} ${cy + h * 0.2} ${l + w * 0.12} ${cy + h * 0.1}Z`, '#fffdf4')
    + N(`M${cx - w * 0.12} ${cy + h * 0.8}Q${cx + w * 0.08} ${cy + h * 0.55} ${cx + w * 0.26} ${cy + h * 0.62}Q${cx + w * 0.12} ${cy + h * 0.92} ${cx - w * 0.12} ${cy + h * 0.8}Z`, '#e8607a')
    + Ln(o, `M${l - 4} ${cy - 6}Q${l - 1} ${cy + 2} ${l + 4} ${cy + 4}`, 5) + `</g>`;
}
/** A spray can at (x, y) — the bottom centre — tilted `ang` degrees, with a puff of paint off the nozzle. */
function can(o, x, y, ang, body, puff) {
  return `<g transform="translate(${x} ${y}) rotate(${ang})">`
    + `<g opacity=".95">${C(o, 4, -132, 13, puff, 0)}<circle cx="22" cy="-146" r="9" fill="${puff}"/><circle cx="-10" cy="-150" r="7" fill="${puff}" opacity=".8"/><circle cx="12" cy="-166" r="5" fill="${puff}" opacity=".7"/><circle cx="34" cy="-128" r="4" fill="${puff}" opacity=".7"/><circle cx="-4" cy="-176" r="3.5" fill="${puff}" opacity=".6"/></g>`
    + F(o, 'M-24 -6V-70Q-24 -90 0 -94Q24 -90 24 -70V-6Q24 4 0 4Q-24 4 -24 -6Z', body)
    + N('M8 -86Q22 -82 22 -66V-8Q22 0 10 2Z', shade(body, -0.28))
    + F(o, 'M-24 -56H24V-34H-24Z', '#fffdf4', 5)
    + F(o, 'M-9 -94V-108H9V-94Z', '#d9dde3', 6) + F(o, 'M-4 -108V-116H6V-108Z', '#fffdf4', 5)
    + Ln('#fffdf4', 'M-14 -78V-66', 6) + `</g>`;
}
/** A fist gripping something, knuckles to the right. */
const fist = (o, x, y, skin, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${F(o, 'M-26 -20Q-30 -2 -24 16Q-10 28 14 24Q32 18 30 0Q30 -22 12 -26Q-12 -32 -26 -20Z', skin)}`
  + Ln(o, 'M4 -24Q10 -8 4 8', 5) + Ln(o, 'M16 -20Q22 -6 16 10', 5) + N('M-18 -16Q-10 -24 4 -24', shade(skin, 0.35), 0.8) + `</g>`;
/** A white cartoon glove, thumb up. */
const glove = (o, x, y, s = 1, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${F(o, 'M-24 -10Q-30 18 -10 28Q14 34 28 22Q36 6 26 -8Q14 -10 6 -12L8 -40Q6 -52 -4 -48Q-12 -44 -12 -28Q-18 -22 -24 -10Z', '#fbfbf7')}`
  + Ln(o, 'M-4 0Q10 -2 26 4', 4.5) + Ln(o, 'M-6 12Q10 10 26 14', 4.5) + F(o, 'M-30 22Q-34 30 -26 38H-4Q2 32 -4 24Z', '#fbfbf7', 6) + `</g>`;
/** Sneakers for full-body characters. */
const sneaker = (o, x, y, main, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${F(o, 'M-30 0Q-32 -22 -14 -26Q0 -26 6 -16Q26 -14 34 -2Q38 8 30 10H-26Q-32 8 -30 0Z', main)}`
  + F(o, 'M-30 2H34Q36 10 30 12H-26Q-32 10 -30 2Z', '#fffdf4', 5) + Ln(o, 'M-4 -18L4 -10M4 -20L12 -12', 4) + `</g>`;
/** A torso (hoodie/jacket shoulders) filling the bottom of the box. */
const torso = (o, cx, top, w, bottom, col) => F(o, `M${cx - w / 2} ${bottom}Q${cx - w / 2 - 6} ${top + 36} ${cx - w * 0.22} ${top + 6}Q${cx} ${top - 6} ${cx + w * 0.22} ${top + 6}Q${cx + w / 2 + 6} ${top + 36} ${cx + w / 2} ${bottom}Z`, col)
  + N(`M${cx + w * 0.18} ${top + 10}Q${cx + w / 2} ${top + 40} ${cx + w / 2 - 2} ${bottom - 2}H${cx + w * 0.22}Q${cx + w * 0.3} ${top + 60} ${cx + w * 0.18} ${top + 10}Z`, shade(col, -0.28));

/* ------------------------------------------------------------------ the characters (w × h boxes, facing right) */
const DEF = {};
// 1 · B-boy: backwards cap, hoodie, chain, can up
DEF.bboy = {label: 'B-boy · cap and can', w: 330, h: 380, draw: ({o, p, s, a, k}) =>
  torso(o, 140, 262, 230, 384, p)
  + Ln(o, 'M118 270Q114 300 120 318', 6) + Ln(o, 'M160 270Q164 300 158 318', 6) + C(o, 120, 322, 6, '#fffdf4', 5) + C(o, 158, 322, 6, '#fffdf4', 5)
  + Ln('#f2c14e', 'M100 262Q140 300 186 262', 9) + Ln(o, 'M100 262Q140 300 186 262', 3)
  + F(o, 'M96 214Q86 262 140 272Q192 270 188 214Z', shade(k, -0.22))
  + F(o, 'M58 150Q52 82 120 64Q196 52 222 116Q236 168 210 212Q180 250 128 246Q70 236 58 150Z', k)
  + N('M180 70Q232 100 226 160Q220 206 192 232Q214 180 204 132Q196 96 180 70Z', shade(k, -0.18))
  + F(o, 'M52 150Q40 150 40 170Q42 192 62 190', k, 7) + Ln(o, 'M50 164Q56 168 52 178', 4)
  + F(o, 'M56 128Q48 70 108 50Q178 34 214 84Q224 102 222 118Q160 96 56 128Z', a) + N('M150 46Q206 52 220 108Q190 70 150 46Z', shade(a, -0.25))
  + F(o, 'M58 126Q20 128 10 112Q16 98 60 102Z', a, 7) + F(o, 'M120 56Q128 44 140 52', 'none', 6) + C(o, 132, 46, 7, s, 5)
  + shine(84, 74, 1)
  + eyes(o, 170, 150, 50, 20, k, {look: 0.45, lidCut: 0.12})
  + Ln(o, 'M214 166Q226 182 212 194', 6)
  + grin(o, 178, 206, 58, 24, -6)
  + can(o, 246, 300, 20, s, a) + fist(o, 238, 276, k, 1.05)
};
// 2 · B-girl: two puffs, big hoops, bomber
DEF.bgirl = {label: 'B-girl · puffs and hoops', w: 330, h: 380, draw: ({o, p, s, a, k}) =>
  torso(o, 140, 266, 228, 384, p)
  + F(o, 'M70 268Q140 310 214 268L204 300Q140 330 80 300Z', s) + Ln(o, 'M140 286V384', 5) + C(o, 140, 330, 6, '#f2c14e', 4) + C(o, 140, 356, 6, '#f2c14e', 4)
  + F(o, 'M100 218Q90 262 140 272Q190 268 186 218Z', shade(k, -0.22))
  + C(o, 70, 70, 50, '#2a1a14') + C(o, 206, 52, 50, '#2a1a14') + N('M44 52Q58 30 84 30', '#5a3a2a') + N('M182 34Q196 14 222 16', '#5a3a2a')
  + F(o, 'M64 156Q56 88 124 70Q196 60 220 120Q234 172 208 214Q178 250 128 246Q74 236 64 156Z', k)
  + N('M184 76Q232 106 224 164Q218 206 190 232Q212 182 204 136Q196 100 184 76Z', shade(k, -0.18))
  + F(o, 'M62 140Q54 84 112 66Q182 52 218 112Q194 94 160 98Q150 82 130 96Q100 92 62 140Z', '#2a1a14')
  + C(o, 66, 196, 22, 'none', 7) + C('#f2c14e', 66, 196, 22, 'none', 4) + F(o, 'M58 158Q44 158 46 176Q50 192 66 188', k, 7)
  + eyes(o, 172, 152, 52, 20, k, {look: 0.45, lidCut: 0.05})
  + Ln(o, 'M144 132L136 122M154 128L150 118M194 128L198 118M206 134L214 126', 4.5)
  + F(o, 'M150 206Q176 222 204 200Q188 232 168 232Q150 228 150 206Z', '#c2185b', 6) + N('M158 210Q176 218 196 206Q182 214 158 210Z', '#fffdf4', 0.9)
  + Ln(o, 'M210 166Q222 180 210 192', 6)
  + shine(96, 84)
  + can(o, 250, 300, 24, a, s) + fist(o, 240, 276, k, 1.05)
};
// 3 · Hooded writer: hood up, bandana over the mouth
DEF.hooded = {label: 'Hooded writer · mask up', w: 330, h: 380, draw: ({o, p, s, a, k}) =>
  torso(o, 140, 258, 236, 384, p)
  + F(o, 'M42 200Q30 84 120 50Q214 26 242 120Q258 196 220 262Q140 300 66 262Q46 236 42 200Z', p)
  + N('M188 44Q250 80 246 160Q242 220 220 262Q236 190 224 130Q214 80 188 44Z', shade(p, -0.3))
  + F(o, 'M78 196Q70 116 136 98Q204 90 220 150Q228 204 196 236Q140 256 96 236Q80 222 78 196Z', shade(k, -0.35))
  + eyes(o, 160, 162, 48, 18, shade(k, -0.35), {look: 0.5, lidCut: 0.28, angry: true})
  + F(o, 'M80 196Q140 178 224 186Q226 226 196 250Q140 270 98 248Q80 228 80 196Z', s)
  + `<g fill="#fffdf4" opacity=".85"><circle cx="112" cy="214" r="5"/><circle cx="142" cy="230" r="4"/><circle cx="170" cy="210" r="5"/><circle cx="198" cy="226" r="4"/><circle cx="128" cy="246" r="3.5"/></g>`
  + F(o, 'M210 236L238 268L218 272L204 248Z', s, 6)
  + Ln(o, 'M118 262Q116 300 122 330', 6) + Ln(o, 'M164 262Q166 300 160 330', 6)
  + shine(70, 104)
  + can(o, 252, 302, 28, a, s) + fist(o, 242, 278, shade(k, -0.1), 1.05)
};
// 4 · The can: a spray can with a face, gloves and trainers
DEF.canman = {label: 'Can man · the spray can', w: 300, h: 380, draw: ({o, p, s, a, k}) =>
  sneaker(o, 104, 370, p) + sneaker(o, 196, 370, p)
  + Ln(o, 'M110 340V356M190 340V356', 10)
  + `<g opacity=".95"><circle cx="196" cy="22" r="14" fill="${a}"/><circle cx="222" cy="14" r="9" fill="${a}"/><circle cx="214" cy="38" r="7" fill="${a}" opacity=".8"/><circle cx="240" cy="30" r="5" fill="${a}" opacity=".7"/></g>`
  + F(o, 'M76 342V112Q76 70 150 62Q224 70 224 112V342Q224 356 150 358Q76 356 76 342Z', s)
  + N('M180 70Q222 80 222 116V338Q222 352 196 356Q206 230 180 70Z', shade(s, -0.3))
  + F(o, 'M76 160H224V272H76Z', p, 7) + N('M188 160H224V272H196Z', shade(p, -0.28))
  + F(o, 'M126 62V36H174V62Z', '#d9dde3', 7) + F(o, 'M142 36V20H164V36Z', '#fffdf4', 6) + C(o, 172, 26, 5, '#333', 4)
  + eyes(o, 154, 200, 52, 20, p, {look: 0.4, lidCut: 0.15})
  + grin(o, 160, 238, 56, 22, -5)
  + Ln('#fffdf4', 'M96 96V140M96 290V320', 10)
  + glove(o, 52, 218, 1, -20) + glove(o, 256, 168, 1, 18)
  + Ln(o, 'M70 222Q60 222 64 214', 0.1)
};
// 5 · London pigeon: one of the locals, cap on, can in wing
DEF.pigeon = {label: 'Pigeon · Hackney local', w: 330, h: 380, draw: ({o, p, s, a}) =>
  F(o, 'M120 352L112 378M120 352L128 378M120 352L120 380M176 352L168 378M176 352L184 378M176 352L176 380', 'none', 7)
  + Ln('#f08a4b', 'M120 352L112 378M120 352L128 378M120 352L120 380M176 352L168 378M176 352L184 378M176 352L176 380', 4)
  + F(o, 'M52 270Q40 170 128 150Q232 140 250 240Q262 330 168 356Q74 362 52 270Z', '#9aa3b5')
  + N('M196 154Q256 190 252 260Q244 330 190 352Q226 290 220 236Q214 186 196 154Z', '#7d869a')
  + F(o, 'M70 254Q50 290 74 330Q110 350 146 330Q120 300 120 264Q110 236 70 254Z', '#8790a4', 7) + Ln(o, 'M84 300Q100 312 118 308M80 318Q98 330 120 326', 4)
  + F(o, 'M100 196Q96 128 150 108Q206 98 222 150Q232 196 196 226Q150 244 112 226Z', '#4f8f7a')
  + N('M112 210Q140 236 190 222Q214 210 220 176Q216 214 176 230Q132 240 112 210Z', '#8b5fb0', 0.85)
  + F(o, 'M108 132Q100 70 156 58Q214 52 230 104Q236 142 214 160Q170 176 132 166Q110 156 108 132Z', '#a9b1c2')
  + F(o, 'M106 104Q100 56 154 46Q210 42 228 94Q170 80 106 104Z', p) + F(o, 'M108 102Q72 104 62 92Q68 78 110 84Z', p, 7)
  + F(o, 'M224 120Q258 124 262 136Q250 148 222 142Z', '#f2c14e', 6) + C(o, 222, 116, 6, '#efe9da', 4)
  + C(o, 186, 118, 15, '#f08a4b', 6) + `<circle cx="191" cy="119" r="7" fill="${o}"/><circle cx="194" cy="116" r="2.4" fill="#fff"/>`
  + `<path d="M170 101L204 105" stroke="${o}" stroke-width="7" stroke-linecap="round"/>`
  + shine(122, 72)
  + can(o, 252, 286, 32, s, a) + F(o, 'M206 236Q248 222 262 262Q248 286 218 278Z', '#8790a4', 7)
};
// 6 · Urban fox: sly grin, hoodie
DEF.fox = {label: 'Urban fox · sly', w: 330, h: 380, draw: ({o, p, s, a}) =>
  torso(o, 140, 266, 230, 384, p) + F(o, 'M100 270Q140 300 180 270L176 296Q140 316 104 296Z', shade(p, -0.25), 6)
  + F(o, 'M54 70L70 180L130 120Z', '#e2703a') + N('M66 90L76 158L112 124Z', '#3a1d14')
  + F(o, 'M192 34L222 150L148 110Z', '#e2703a') + N('M194 58L210 132L166 108Z', '#3a1d14')
  + F(o, 'M50 176Q48 104 136 96Q228 92 248 170L292 196Q296 214 276 220L224 236Q170 270 112 256Q56 236 50 176Z', '#e2703a')
  + N('M196 104Q242 128 250 172L222 186Q216 140 196 104Z', shade('#e2703a', -0.22))
  + F(o, 'M150 198Q200 196 230 214L276 220Q240 250 200 256Q160 260 132 236Q136 210 150 198Z', '#fffdf4')
  + F(o, 'M278 196Q298 198 296 212Q292 222 278 220Q270 208 278 196Z', o, 0)
  + F(o, 'M48 186Q30 220 64 248Q84 262 112 256Q76 230 76 196Z', '#fffdf4', 7)
  + eyes(o, 178, 160, 48, 17, '#e2703a', {look: 0.55, lidCut: 0.3, angry: true})
  + Ln(o, 'M196 232Q222 244 252 234', 6) + Ln(o, 'M238 238L242 248M226 240L228 250', 4)
  + shine(86, 124)
  + can(o, 250, 312, 22, s, a) + F(o, 'M214 290Q246 264 270 296Q262 326 228 322Z', '#2a1a14', 7)
};
// 7 · Skull with a crown
DEF.skull = {label: 'Crowned skull', w: 300, h: 380, draw: ({o, p, s, a}) =>
  F(o, 'M40 330L120 250M260 330L180 250', 'none', 26) + Ln('#efe6cf', 'M40 330L120 250M260 330L180 250', 14)
  + C(o, 34, 318, 14, '#efe6cf', 6) + C(o, 48, 340, 14, '#efe6cf', 6) + C(o, 266, 318, 14, '#efe6cf', 6) + C(o, 252, 340, 14, '#efe6cf', 6)
  + F(o, 'M56 168Q52 72 150 64Q248 72 244 168Q244 214 214 236V270Q214 290 190 292H110Q86 290 86 270V236Q56 214 56 168Z', '#efe6cf')
  + N('M196 74Q246 100 244 168Q242 214 212 238V272Q212 288 196 290Q200 220 214 180Q220 110 196 74Z', '#cfc4a8')
  + F(o, 'M84 172Q86 132 126 134Q150 142 142 180Q132 208 104 206Q82 200 84 172Z', s, 7) + F(o, 'M162 180Q156 140 192 134Q222 136 218 172Q214 204 188 206Q164 204 162 180Z', s, 7)
  + `<circle cx="120" cy="170" r="9" fill="#fffdf4"/><circle cx="196" cy="168" r="9" fill="#fffdf4"/>`
  + F(o, 'M140 214L152 196L164 214Q152 222 140 214Z', '#3a2a1a', 6)
  + Ln(o, 'M108 246V286M128 248V290M150 248V292M172 248V290M192 246V286', 5) + Ln(o, 'M100 246H200', 6)
  + Ln(o, 'M96 92L114 114L104 126', 5)
  + F(o, 'M78 82L68 22L112 52L150 6L188 52L232 22L222 82Q150 64 78 82Z', a) + N('M150 6L188 52L232 22L222 82Q190 72 160 70Z', shade(a, -0.25))
  + C(o, 150, 14, 9, s, 5) + C(o, 68, 24, 7, s, 5) + C(o, 232, 24, 7, s, 5) + C(o, 150, 56, 8, p, 5)
  + shine(84, 100)
};
// 8 · The d20 — Asmo's die: a twenty-sider with a face, gloves and a can
DEF.d20 = {label: 'The d20 · natural twenty', w: 330, h: 380, draw: ({o, p, s, a, flip}) => {
  const top = shade(p, 0.25), side = shade(p, -0.28), dark = shade(p, -0.45);
  return sneaker(o, 106, 370, s) + sneaker(o, 194, 370, s) + Ln(o, 'M112 330V354M188 330V354', 10)
    + F(o, 'M150 28L262 96V244L150 334L38 244V96Z', p)
    + N('M150 28L262 96L210 128L150 120Z', top) + N('M150 28L90 128L38 96Z', shade(p, 0.12))
    + N('M262 96V244L210 128Z', side) + N('M262 244L150 334L210 268Z', dark) + N('M38 244L90 128L38 96Z', shade(p, -0.12)) + N('M38 244L150 334L90 268Z', side)
    + Ln(o, 'M150 28L90 128L210 128L150 28M38 96L90 128M262 96L210 128M90 128L90 268L210 268L210 128M38 244L90 268M262 244L210 268M90 268L150 334L210 268', 5.5)
    + F(o, 'M150 28L262 96V244L150 334L38 244V96Z', 'none')
    // "20" on the top face, drawn as strokes; kept readable when the character is turned to face left
    + `<g${flip ? ' transform="translate(300 0) scale(-1 1)"' : ''}>` + Ln('#fffdf4', 'M128 90Q134 80 142 84Q148 92 136 104L128 112H146M158 84Q168 80 172 92V102Q168 114 158 110Q152 104 154 92Q156 84 162 84', 6) + `</g>`
    + eyes(o, 150, 176, 56, 20, p, {look: 0.4, lidCut: 0.1})
    + grin(o, 156, 222, 64, 24, -4)
    + glove(o, 30, 214, 1, -30) + can(o, 268, 214, 26, s, a) + glove(o, 268, 196, 0.95, 70)
    + shine(118, 52);
}};

/** A gear outline (n teeth) as a path. */
function gear(cx, cy, r0, r1, n) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = i * 2 * Math.PI / n, h = Math.PI / n, pts = [[r0, a - h * 0.62], [r1, a - h * 0.38], [r1, a + h * 0.38], [r0, a + h * 0.62]];
    for (const [j, [r, t]] of pts.entries()) d += `${i === 0 && j === 0 ? 'M' : 'L'}${(cx + Math.cos(t) * r).toFixed(1)} ${(cy + Math.sin(t) * r).toFixed(1)}`;
  }
  return d + 'Z';
}
const sparkleAt = (o, x, y, r) => `<path d="M${x} ${y - r}Q${x + r * 0.2} ${y - r * 0.2} ${x + r} ${y}Q${x + r * 0.2} ${y + r * 0.2} ${x} ${y + r}Q${x - r * 0.2} ${y + r * 0.2} ${x - r} ${y}Q${x - r * 0.2} ${y - r * 0.2} ${x} ${y - r}Z" fill="#fffdf4" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>`;

/* ---- the factions' own ---- */
// The Chainring: a chainring for a head, hoodie, can
DEF.cog = {label: 'Chainring · the cog', w: 330, h: 380, draw: ({o, p, s, a, k}) =>
  torso(o, 150, 280, 230, 384, p) + Ln(o, 'M126 290Q122 320 128 340M172 290Q176 320 170 340', 6)
  + F(o, gear(150, 160, 112, 132, 18), a) + N('M232 70Q282 120 276 190Q262 250 216 276Q256 210 250 160Q246 110 232 70Z', shade(a, -0.28))
  + F(o, 'M150 64A96 96 0 1 1 149.9 64Z', shade(a, 0.18), 7)
  + [0, 1, 2, 3, 4].map(i => { const t = -Math.PI / 2 + i * 2 * Math.PI / 5; return C(o, (150 + Math.cos(t) * 80).toFixed(1), (160 + Math.sin(t) * 80).toFixed(1), 9, shade(a, -0.35), 5); }).join('')
  + F(o, 'M150 92A68 68 0 1 1 149.9 92Z', k, 7) + N('M196 108Q224 146 212 196Q200 220 176 228Q208 190 196 108Z', shade(k, -0.18))
  + eyes(o, 160, 150, 46, 17, k, {look: 0.45, lidCut: 0.12})
  + grin(o, 164, 190, 50, 20, -6)
  + shine(96, 74)
  + can(o, 270, 318, 20, s, a) + fist(o, 262, 294, k, 1.05)
};
// Dead Air Collective: a boombox with speaker eyes
DEF.boombox = {label: 'Dead Air · the boombox', w: 340, h: 380, draw: ({o, p, s, a}) =>
  Ln(o, 'M232 120L292 18', 9) + Ln('#d9dde3', 'M232 120L292 18', 4) + C(o, 294, 14, 9, s, 5)
  + F(o, 'M84 120Q84 70 160 70Q236 70 236 120', 'none', 14) + Ln(p, 'M84 120Q84 70 160 70Q236 70 236 120', 6)
  + F(o, 'M26 132Q26 112 46 112H274Q294 112 294 132V312Q294 332 274 332H46Q26 332 26 312Z', p)
  + N('M250 112H274Q294 112 294 132V312Q294 332 274 332H250Z', shade(p, -0.3))
  + F(o, 'M26 132Q26 112 46 112H274Q294 112 294 132V146H26Z', shade(p, 0.25), 6)
  + [52, 76, 100].map(x => F(o, `M${x} 120H${x + 16}V112H${x}Z`, s, 4)).join('')
  + C(o, 92, 226, 56, '#2a2d33') + C(o, 92, 226, 40, '#4b5059', 6) + C(o, 228, 226, 56, '#2a2d33') + C(o, 228, 226, 40, '#4b5059', 6)
  + `<circle cx="104" cy="230" r="18" fill="${s}" stroke="${o}" stroke-width="5"/><circle cx="240" cy="230" r="18" fill="${s}" stroke="${o}" stroke-width="5"/><circle cx="110" cy="224" r="5" fill="#fff"/><circle cx="246" cy="224" r="5" fill="#fff"/>`
  + `<path d="M40 190A56 56 0 0 1 148 196Q94 186 40 190Z" fill="${p}" stroke="${o}" stroke-width="6"/><path d="M176 196A56 56 0 0 1 282 190Q228 186 176 196Z" fill="${p}" stroke="${o}" stroke-width="6"/>`
  + F(o, 'M126 290Q160 316 202 288Q196 312 164 316Q132 314 126 290Z', '#3a0f17', 6) + N('M136 294Q164 306 192 292Q180 300 136 294Z', '#fffdf4')
  + F(o, 'M140 152H180V176H140Z', '#d9dde3', 5) + Ln(o, 'M150 164H170', 4)
  + glove(o, 26, 268, 1, -24) + can(o, 318, 252, 22, a, s) + glove(o, 312, 236, 0.95, 64)
  + shine(48, 134, 0.9)
};
// The Lea Boys: a staffy in a studded collar
DEF.staffy = {label: 'Lea Boys · the staffy', w: 330, h: 380, draw: ({o, p, s, a}) => {
  const fur = '#b07a52', white = '#f3ead8';
  return torso(o, 150, 280, 240, 384, p)
    + F(o, 'M70 300Q150 330 232 300L236 270Q150 300 66 270Z', s, 7) + [90, 122, 154, 186, 214].map(x => F(o, `M${x} ${292 - (x - 150) ** 2 / 400}l7 -16l7 16z`, '#d9dde3', 4)).join('')
    + F(o, 'M44 176Q36 76 146 62Q254 58 270 154Q276 196 262 226Q230 286 150 290Q66 286 48 230Q42 204 44 176Z', fur)
    + N('M214 72Q266 104 270 160Q272 204 256 232Q246 180 240 144Q234 100 214 72Z', shade(fur, -0.25))
    + F(o, 'M62 92Q30 70 26 104Q30 128 60 128Z', shade(fur, -0.3), 7) + F(o, 'M206 64Q226 30 250 50Q254 76 232 86Z', shade(fur, -0.3), 7)
    + N('M140 66Q164 62 176 70Q168 120 172 160Q150 164 140 158Q144 110 140 66Z', white)
    + F(o, 'M122 190Q132 150 206 150Q292 154 304 214Q310 262 262 286Q196 304 150 284Q114 260 122 190Z', white)
    + N('M248 160Q300 182 304 218Q306 256 270 280Q288 236 280 206Q272 178 248 160Z', shade(white, -0.15))
    + F(o, 'M250 180Q274 166 298 178Q306 196 290 206Q268 214 250 202Q242 190 250 180Z', '#1d1d1d', 6) + N('M262 180Q272 176 282 178', '#fff', 0.7)
    + Ln(o, 'M274 210V226', 5)
    + F(o, 'M150 236Q210 262 300 228Q292 280 240 288Q182 292 150 236Z', '#3a0f17', 6) + N('M160 240Q214 260 290 234Q262 252 166 248Z', '#fffdf4')
    + N('M196 270Q222 258 246 272Q228 288 196 270Z', '#e8607a')
    + F(o, 'M166 242L172 256L178 244Z', '#fffdf4', 3) + F(o, 'M280 236L286 250L292 236Z', '#fffdf4', 3)
    + eyes(o, 178, 132, 58, 15, fur, {look: 0.5, lidCut: 0.38, angry: true})
    + Ln(o, 'M164 106Q178 98 192 106M170 94Q178 90 186 94', 4)
    + shine(70, 90)
    + can(o, 30, 330, -18, a, s) + fist(o, 40, 306, fur, 1.05);
}};
// The Velvet Circuit: comedy mask over tragedy, velvet drape
DEF.mask = {label: 'Velvet Circuit · the masks', w: 330, h: 380, draw: ({o, p, s, a}) =>
  F(o, 'M10 384Q20 300 60 286Q90 330 120 290Q150 330 180 290Q210 330 240 290Q270 330 300 286Q320 310 324 384Z', p) + Ln(shade(p, -0.35), 'M60 300V384M120 304V384M180 304V384M240 304V384', 8)
  + `<g transform="rotate(-14 110 150)">` + F(o, 'M40 90Q40 40 110 40Q180 40 180 90Q182 170 110 222Q38 170 40 90Z', shade(s, -0.2))
  + F(o, 'M70 104Q84 92 98 104Q84 120 70 104Z', '#1d1d1d', 5) + F(o, 'M122 104Q136 92 150 104Q136 120 122 104Z', '#1d1d1d', 5) + F(o, 'M84 176Q110 150 136 176Q110 168 84 176Z', '#1d1d1d', 5) + `</g>`
  + `<g transform="rotate(10 200 160)">` + F(o, 'M120 92Q120 36 200 36Q280 36 280 92Q282 182 200 236Q118 182 120 92Z', a)
  + N('M240 44Q282 60 280 100Q278 170 220 222Q262 160 258 110Q256 70 240 44Z', shade(a, -0.25))
  + F(o, 'M146 104Q164 84 182 104Q164 110 146 104Z', '#1d1d1d', 5) + F(o, 'M214 104Q232 84 250 104Q232 110 214 104Z', '#1d1d1d', 5)
  + F(o, 'M156 156Q200 206 246 156Q200 176 156 156Z', '#3a0f17', 6) + Ln(o, 'M150 152Q146 146 152 140M252 152Q256 146 250 140', 4)
  + N('M150 84Q156 60 180 56', '#fffdf4', 0) + shine(144, 58) + `</g>`
  + Ln(s, 'M120 92Q60 80 30 120Q20 150 34 170', 7) + Ln(s, 'M280 92Q318 100 316 140', 7)
  + sparkleAt(o, 300, 40, 16) + sparkleAt(o, 34, 40, 11)
};
// The Towpath Union: canal duck in a courier cap
DEF.duck = {label: 'Towpath Union · canal duck', w: 330, h: 380, draw: ({o, p, s, a}) =>
  F(o, 'M40 290Q30 200 130 196Q250 192 282 270Q300 330 220 356Q110 372 60 340Q42 320 40 290Z', '#8b5e3c')
  + N('M220 200Q286 230 284 290Q280 340 222 356Q262 300 250 260Q240 222 220 200Z', shade('#8b5e3c', -0.25))
  + F(o, 'M60 262Q40 300 70 334Q120 352 170 336Q130 300 136 262Q110 236 60 262Z', '#a8a29a', 7) + Ln(o, 'M80 300Q110 314 140 310M80 318Q110 332 146 326', 4)
  + F(o, 'M120 206Q150 220 206 210Q190 236 150 238Q124 232 120 206Z', '#fffdf4', 6)
  + F(o, 'M96 130Q90 60 160 50Q232 46 244 112Q250 170 210 200Q150 220 112 196Q98 172 96 130Z', '#1f7a4d')
  + N('M196 56Q248 76 246 124Q244 174 212 198Q232 150 226 116Q220 80 196 56Z', shade('#1f7a4d', -0.3))
  + N('M108 120Q120 80 160 70Q130 96 120 140Z', '#36b37e', 0.7)
  + F(o, 'M238 132Q300 124 314 150Q300 170 240 164Z', '#f2b134') + Ln(o, 'M244 150Q276 152 306 150', 4) + C(o, 292, 140, 3, o, 0)
  + C(o, 196, 112, 15, '#fffdf4', 6) + `<circle cx="202" cy="114" r="7" fill="${o}"/><circle cx="205" cy="110" r="2.4" fill="#fff"/>` + Ln(o, 'M178 92L214 96', 7)
  + F(o, 'M94 96Q92 40 156 34Q222 32 238 86Q170 70 94 96Z', s) + F(o, 'M236 84Q278 82 290 96Q270 108 234 100Z', s, 7)
  + Ln(o, 'M100 214L230 330', 12) + Ln(p, 'M100 214L230 330', 6) + F(o, 'M200 300H262V350H200Z', p, 7) + Ln(o, 'M200 316H262', 4)
  + shine(112, 64)
  + can(o, 24, 316, -16, a, s) + F(o, 'M30 286Q14 250 52 236Q82 254 70 290Z', '#a8a29a', 7)
};
// The Glasshouse Exchange: cat burglar with the diamond
DEF.burglar = {label: 'Glasshouse · cat burglar', w: 330, h: 380, draw: ({o, p, s, a}) => {
  const fur = '#2b2d36';
  return F(o, 'M36 384Q30 300 80 276Q150 256 222 276Q270 300 262 384Z', '#f3ead8') + `<g fill="${fur}">` + [292, 324, 356].map(y => `<path d="M${46 - (y - 292) / 6} ${y}H${254 + (y - 292) / 12}V${y + 14}H${44 - (y - 292) / 6}Z"/>`).join('') + `</g>`
    + F(o, 'M36 384Q30 300 80 276Q150 256 222 276Q270 300 262 384Z', 'none')
    + F(o, 'M52 96L58 20L118 68Z', fur) + N('M64 46L68 72L92 66Z', '#e86a8a') + F(o, 'M184 66L240 14L248 96Z', fur) + N('M222 40L232 76L210 66Z', '#e86a8a')
    + F(o, 'M44 170Q40 70 150 62Q262 66 258 170Q256 236 220 262Q150 292 82 262Q46 234 44 170Z', fur)
    + N('M208 74Q262 110 256 176Q252 232 218 262Q242 200 236 160Q230 108 208 74Z', shade(fur, 0.15))
    + F(o, 'M40 150Q150 116 262 150L256 196Q150 168 46 196Z', s, 7)
    + E(o, 108, 172, 26, 22, '#f5d547', 6) + E(o, 198, 172, 26, 22, '#f5d547', 6) + `<ellipse cx="116" cy="174" rx="7" ry="17" fill="${o}"/><ellipse cx="206" cy="174" rx="7" ry="17" fill="${o}"/><circle cx="120" cy="166" r="3.5" fill="#fff"/><circle cx="210" cy="166" r="3.5" fill="#fff"/>`
    + F(o, 'M146 208L160 200L174 208L160 218Z', '#e86a8a', 5) + Ln(o, 'M160 218Q150 236 134 228M160 218Q176 240 196 226', 5)
    + Ln('#e9e3d2', 'M128 214L66 204M128 222L64 230M196 214L262 204M196 222L262 230', 3.5)
    + shine(82, 86)
    + `<g transform="translate(268 272) rotate(12)">` + F(o, 'M-34 -16L-20 -36H20L34 -16L0 30Z', '#9fe8ff') + Ln(o, 'M-34 -16H34M-20 -36L-8 -16L0 30M20 -36L8 -16L0 30M-8 -16L0 -36L8 -16', 4) + N('M-20 -32H-6L-14 -18Z', '#fff', 0.9) + `</g>`
    + sparkleAt(o, 306, 222, 13) + fist(o, 262, 314, fur, 1.05);
}};
// The Backroom Bookmakers: the ace in a pork-pie hat
DEF.ace = {label: 'Backroom · the ace', w: 330, h: 380, draw: ({o, p, s, a}) =>
  sneaker(o, 116, 372, p) + sneaker(o, 204, 372, p) + Ln(o, 'M122 336V356M198 336V356', 10)
  + `<g transform="rotate(-6 160 210)">` + F(o, 'M62 86Q62 66 82 66H238Q258 66 258 86V330Q258 350 238 350H82Q62 350 62 330Z', '#fbf7ee')
  + N('M226 66H238Q258 66 258 86V330Q258 350 238 350H232Z', '#ddd6c5')
  + Ln(s, 'M84 92Q84 108 92 116M84 104L96 104', 0) + Ln(o, 'M80 116L90 86L100 116M84 106H96', 5) + Ln(o, 'M240 300L230 330L220 300M224 310H236', 5)
  + F(o, 'M160 240Q120 270 128 296Q140 312 156 296L150 324H170L164 296Q180 312 192 296Q200 270 160 240Z', '#1d1d1d', 5)
  + eyes(o, 160, 160, 54, 18, '#fbf7ee', {look: 0.45, lidCut: 0.32})
  + grin(o, 166, 204, 56, 20, -4) + Ln(o, 'M190 208L232 196', 5) + `</g>`
  + F(o, 'M62 78Q60 44 160 40Q260 44 258 78Q300 84 296 98Q160 118 24 98Q20 84 62 78Z', '#3a3a44')
  + F(o, 'M70 78Q160 92 250 78L248 62Q160 74 72 62Z', s, 5) + N('M200 44Q254 50 256 76Q232 60 200 44Z', shade('#3a3a44', 0.2))
  + glove(o, 36, 236, 1, -24)
  + `<g transform="translate(282 236) rotate(16)">` + F(o, 'M-24 -40H24V40H-24Z', '#fff7d6', 6) + Ln(o, 'M-14 -22H14M-14 -8H10M-14 6H14M-14 20H4', 3.5) + `</g>` + glove(o, 278, 262, 0.95, 40)
};
// The Night Market: a paper lantern under the moon
DEF.lantern = {label: 'Night Market · the lantern', w: 330, h: 380, draw: ({o, p, s, a}) =>
  `<circle cx="160" cy="200" r="150" fill="${a}" opacity=".18"/>`
  + F(o, 'M246 36A56 56 0 1 0 300 104A44 44 0 1 1 246 36Z', '#ffe58a', 7)
  + Ln(o, 'M160 0V40', 6) + F(o, 'M120 40H200V64H120Z', '#c0392b', 7) + F(o, 'M126 300H194V326H126Z', '#c0392b', 7)
  + F(o, 'M160 60Q40 64 40 180Q40 296 160 304Q280 296 280 180Q280 64 160 60Z', a)
  + N('M222 70Q280 100 280 180Q278 270 214 298Q250 240 250 180Q250 110 222 70Z', shade(a, -0.25))
  + Ln(shade(a, -0.4), 'M100 70Q76 180 100 296M220 70Q244 180 220 296M160 62V302', 5)
  + Ln(o, 'M160 60Q40 64 40 180Q40 296 160 304Q280 296 280 180Q280 64 160 60Z', LW)
  + F(o, 'M150 326H170L176 368H144Z', '#f2c14e', 6) + Ln(o, 'M150 340L146 372M160 340V376M170 340L174 372', 4)
  + eyes(o, 160, 168, 56, 20, a, {look: 0.4, lidCut: 0.1})
  + grin(o, 166, 214, 62, 24, -5)
  + `<circle cx="104" cy="222" r="10" fill="#ff8aa0" opacity=".6"/><circle cx="226" cy="218" r="10" fill="#ff8aa0" opacity=".6"/>`
  + shine(78, 96) + sparkleAt(o, 40, 320, 12)
};
// Borough Mutual: the teapot — kettle's on
DEF.teapot = {label: 'Borough Mutual · the teapot', w: 340, h: 380, draw: ({o, p, s, a}) =>
  Ln(o, 'M108 40Q90 20 110 6M150 34Q132 10 156 -4', 8) + Ln('#fffdf4', 'M108 40Q90 20 110 6M150 34Q132 10 156 -4', 4)
  + F(o, 'M262 216Q300 196 312 150Q326 140 334 150Q330 210 282 262Z', p) + F(o, 'M50 180Q0 180 6 236Q14 286 62 282', 'none', 22) + Ln(p, 'M50 180Q0 180 6 236Q14 286 62 282', 12)
  + F(o, 'M56 300Q34 260 40 210Q50 120 160 112Q270 120 280 210Q286 260 264 300Q250 330 160 334Q70 330 56 300Z', p)
  + N('M222 122Q280 150 280 214Q280 286 250 318Q262 260 254 214Q248 158 222 122Z', shade(p, -0.28))
  + F(o, 'M44 236Q160 262 276 236L272 268Q160 294 48 268Z', s, 6) + [74, 116, 160, 204, 246].map(x => C(o, x, 252 + (x === 160 ? 14 : x === 116 || x === 204 ? 10 : 2), 6, '#fffdf4', 3.5)).join('')
  + F(o, 'M88 124Q160 92 232 124Q160 140 88 124Z', shade(p, 0.25), 7) + C(o, 160, 96, 14, s, 6)
  + F(o, 'M40 330Q160 352 280 330V344Q160 366 40 344Z', '#fffdf4', 6)
  + eyes(o, 158, 176, 56, 19, p, {look: 0.4, lidCut: 0.08})
  + grin(o, 164, 214, 58, 20, -4)
  + `<circle cx="100" cy="212" r="10" fill="#ff8aa0" opacity=".55"/><circle cx="224" cy="210" r="10" fill="#ff8aa0" opacity=".55"/>`
  + shine(80, 150)
};
// The Lantern Desk: the night owl with a lamp
DEF.owl = {label: 'Lantern Desk · night owl', w: 330, h: 380, draw: ({o, p, s, a}) => {
  const f = '#6f7f99';
  return F(o, 'M50 220Q40 90 160 74Q280 90 270 220Q264 340 160 360Q56 340 50 220Z', f)
    + N('M220 92Q276 130 270 220Q262 320 196 352Q246 280 244 210Q240 130 220 92Z', shade(f, -0.25))
    + F(o, 'M60 110L46 30L120 82Z', f) + F(o, 'M260 110L274 30L200 82Z', f)
    + F(o, 'M96 236Q160 210 224 236Q232 300 160 334Q88 300 96 236Z', '#d9cdb5', 6) + Ln(shade('#d9cdb5', -0.3), 'M130 262L140 272L150 262M170 262L180 272L190 262M140 292L150 302L160 292M160 292L170 302L180 292', 4)
    + C(o, 112, 158, 44, '#efe9da') + C(o, 208, 158, 44, '#efe9da') + C(o, 118, 160, 26, a, 6) + C(o, 214, 160, 26, a, 6)
    + `<circle cx="124" cy="162" r="12" fill="${o}"/><circle cx="220" cy="162" r="12" fill="${o}"/><circle cx="128" cy="156" r="4" fill="#fff"/><circle cx="224" cy="156" r="4" fill="#fff"/>`
    + F(o, 'M74 126Q112 106 150 128Q112 120 74 126Z', f, 5) + F(o, 'M170 128Q208 106 246 126Q208 120 170 128Z', f, 5)
    + F(o, 'M150 196L170 196L160 226Z', '#f2b134', 6)
    + F(o, 'M50 220Q20 260 46 310Q80 320 96 290Q80 250 50 220Z', shade(f, -0.15), 7)
    + `<circle cx="282" cy="270" r="44" fill="${a}" opacity=".3"/>` + Ln(o, 'M282 200V226', 5) + F(o, 'M262 226H302V236H262Z', '#3a3a44', 5)
    + F(o, 'M266 236Q256 270 268 300H296Q308 270 298 236Z', '#ffe58a', 6) + N('M282 246Q292 262 282 286Q272 262 282 246Z', '#ff9f1a') + F(o, 'M262 300H302V312H262Z', '#3a3a44', 5)
    + F(o, 'M270 220Q300 230 296 250Q270 260 250 246Z', shade(f, -0.15), 6)
    + shine(84, 110);
}};
// Meridian Renewal: the fat cat in a suit
DEF.fatcat = {label: 'Meridian · fat cat', w: 330, h: 380, draw: ({o, p, s, a}) => {
  const fur = '#b8bcc6';
  return F(o, 'M30 384Q24 300 84 278Q160 262 236 278Q296 300 290 384Z', '#2e323b')
    + F(o, 'M120 274L160 330L200 274Z', '#fbf7ee', 6) + F(o, 'M152 286H168L176 360L160 376L144 360Z', '#e9c46a', 5)
    + F(o, 'M84 278L132 300L118 384H84Z', '#3a3f4a', 6) + F(o, 'M236 278L188 300L202 384H236Z', '#3a3f4a', 6)
    + F(o, 'M210 300H232V316H210Z', '#e9c46a', 4)
    + F(o, 'M56 96L64 24L122 72Z', fur) + F(o, 'M198 72L256 24L264 96Z', fur)
    + F(o, 'M44 176Q40 70 160 64Q280 70 276 176Q274 246 230 270Q160 296 90 270Q46 246 44 176Z', fur)
    + N('M222 76Q280 110 274 180Q270 236 230 268Q254 210 250 168Q246 112 222 76Z', shade(fur, -0.25))
    + F(o, 'M110 196Q160 174 210 196Q220 240 160 252Q100 240 110 196Z', '#f3ead8', 6)
    + eyes(o, 160, 160, 62, 19, fur, {look: 0.3, lidCut: 0.45})
    + F(o, 'M150 196L170 196L160 208Z', '#e86a8a', 5) + Ln(o, 'M160 208Q150 226 132 220M160 208Q172 228 192 218', 5)
    + Ln('#fbf7ee', 'M120 206L60 196M120 214L58 222M200 206L262 196M200 214L262 222', 3.5)
    + F(o, 'M120 44Q160 30 200 44L196 70Q160 60 124 70Z', '#1d1d1d', 6)
    + shine(78, 92)
    + `<g transform="translate(284 232) rotate(-8)">` + F(o, 'M-10 40V-6H-24L0 -40L24 -6H10V40Z', '#e9c46a') + `</g>` + fist(o, 276, 270, fur, 1);
}};
// The Red Thread: a spider on its line
DEF.spider = {label: 'Red Thread · the spider', w: 330, h: 380, draw: ({o, p, s, a}) => {
  const b = '#b3263b';
  const legs = [[[110, 210], [50, 150], [24, 196]], [[104, 236], [34, 230], [14, 284]], [[112, 262], [52, 304], [44, 362]], [[136, 280], [110, 340], [124, 378]],
    [[210, 210], [270, 150], [296, 196]], [[216, 236], [286, 230], [306, 284]], [[208, 262], [268, 304], [276, 362]], [[184, 280], [210, 340], [196, 378]]];
  return Ln('#e2364f', 'M160 0V120', 5) + Ln(o, 'M160 0V120', 1.5)
    + legs.map(l => Ln(o, `M${l[0][0]} ${l[0][1]}L${l[1][0]} ${l[1][1]}L${l[2][0]} ${l[2][1]}`, 14) + Ln(shade(b, -0.25), `M${l[0][0]} ${l[0][1]}L${l[1][0]} ${l[1][1]}L${l[2][0]} ${l[2][1]}`, 7)).join('')
    + F(o, 'M90 230Q90 150 160 146Q230 150 230 230Q230 310 160 314Q90 310 90 230Z', b)
    + N('M196 156Q232 178 230 232Q228 296 190 310Q214 260 210 220Q208 180 196 156Z', shade(b, -0.3))
    + F(o, 'M128 260Q160 240 192 260L184 290Q160 278 136 290Z', '#f3ead8', 5)
    + F(o, 'M100 140Q100 90 160 86Q220 90 220 140Q218 182 160 186Q102 182 100 140Z', shade(b, 0.1))
    + eyes(o, 162, 132, 50, 16, shade(b, 0.1), {look: 0.4, lidCut: 0.2, brow: false})
    + `<g fill="${o}"><circle cx="128" cy="104" r="5"/><circle cx="196" cy="104" r="5"/><circle cx="146" cy="98" r="4"/><circle cx="178" cy="98" r="4"/></g>`
    + grin(o, 166, 160, 44, 16, -4)
    + Ln('#e2364f', 'M234 248Q290 230 300 270Q300 310 256 300Q230 280 266 266', 5)
    + F(o, 'M290 300L324 236L330 240L298 304Z', '#d9dde3', 4)
    + shine(118, 102, 0.8);
}};
/* ---- radio ---- */
// The mic, on the air
DEF.mic = {label: 'Radio · the mic', w: 330, h: 380, draw: ({o, p, s, a}) =>
  sneaker(o, 120, 372, p) + sneaker(o, 200, 372, p) + Ln(o, 'M126 316V356M194 316V356', 10)
  + F(o, 'M110 236H210L196 320H124Z', '#3a3a44') + Ln(o, 'M160 320V340', 8)
  + F(o, 'M70 140Q70 40 160 40Q250 40 250 140Q250 240 160 244Q70 240 70 140Z', '#c9ced6')
  + N('M208 50Q250 80 250 140Q250 220 196 240Q224 190 222 140Q220 86 208 50Z', '#9aa1ac')
  + Ln('#7c838e', 'M100 70V214M130 50V236M160 44V242M190 50V236M220 70V214M76 110H244M72 150H248M78 190H242', 3)
  + F(o, 'M70 140Q70 40 160 40Q250 40 250 140Q250 240 160 244Q70 240 70 140Z', 'none')
  + F(o, 'M96 120Q160 100 226 120V184Q160 214 96 184Z', s, 7)
  + eyes(o, 160, 146, 50, 17, s, {look: 0.4, lidCut: 0.12, brow: false})
  + grin(o, 166, 184, 44, 15, -4)
  + `<g transform="translate(250 60)">` + C(o, 0, 0, 22, '#e2364f', 6) + N('M-10 -8Q-4 -14 4 -12', '#fff', 0.8) + Ln('#e2364f', 'M30 -18Q40 0 30 18M44 -28Q60 0 44 28', 6) + `</g>`
  + glove(o, 40, 236, 1, -30) + glove(o, 280, 230, 1, 30)
  + shine(96, 66)
};
// The record, spinning
DEF.vinyl = {label: 'Radio · the record', w: 330, h: 380, draw: ({o, p, s, a}) =>
  sneaker(o, 120, 372, p) + sneaker(o, 200, 372, p) + Ln(o, 'M126 300V356M194 300V356', 10)
  + Ln(o, 'M40 60Q20 90 26 130M284 300Q304 270 300 230', 6)
  + C(o, 160, 170, 140, '#1c1d22') + [124, 108, 92].map(r => `<circle cx="160" cy="170" r="${r}" fill="none" stroke="#33353d" stroke-width="3"/>`).join('')
  + N('M70 90Q110 50 160 44Q100 70 80 120Z', '#fff', 0.25) + N('M250 250Q210 290 160 296Q220 270 240 220Z', '#fff', 0.15)
  + C(o, 160, 170, 64, s, 7) + N('M196 116Q224 150 212 196Q204 214 190 222Q210 180 196 116Z', shade(s, -0.25))
  + eyes(o, 160, 160, 44, 15, s, {look: 0.4, lidCut: 0.15, brow: false})
  + grin(o, 164, 194, 40, 14, -4) + C(o, 160, 170, 4, '#1c1d22', 0)
  + glove(o, 22, 240, 1, -30) + glove(o, 300, 160, 1, 40)
};
// The selector: headphones and shades
DEF.selector = {label: 'Radio · the selector', w: 330, h: 380, draw: ({o, p, s, a, k}) =>
  torso(o, 140, 262, 230, 384, p) + F(o, 'M96 214Q86 262 140 272Q192 270 188 214Z', shade(k, -0.22))
  + F(o, 'M58 150Q52 82 120 64Q196 52 222 116Q236 168 210 212Q180 250 128 246Q70 236 58 150Z', k)
  + N('M180 70Q232 100 226 160Q220 206 192 232Q214 180 204 132Q196 96 180 70Z', shade(k, -0.18))
  + F(o, 'M60 130Q56 80 116 62Q190 50 220 110Q200 84 160 82Q140 72 120 86Q90 84 60 130Z', '#1d1d1d')
  + Ln(o, 'M70 140Q60 40 150 34Q240 34 236 130', 22) + Ln(s, 'M70 140Q60 40 150 34Q240 34 236 130', 12)
  + F(o, 'M36 132Q36 110 62 112Q88 116 86 150Q86 184 60 184Q36 182 36 160Z', s) + C(o, 60, 148, 14, shade(s, -0.35), 5)
  + F(o, 'M118 136H162Q166 164 146 168Q122 168 118 136Z', '#1d1d1d', 6) + F(o, 'M174 134H218Q222 160 204 166Q180 166 174 134Z', '#1d1d1d', 6) + Ln(o, 'M162 138H174', 6)
  + N('M126 142L140 142L128 156Z', '#fff', 0.7) + N('M182 140L196 140L184 154Z', '#fff', 0.7)
  + grin(o, 180, 202, 52, 20, -6)
  + Ln(o, 'M214 166Q226 182 212 194', 6)
  + `<g transform="translate(262 300) rotate(-20)">` + F(o, 'M-30 -20H30V20H-30Z', '#1c1d22') + C(o, 0, 0, 12, a, 4) + `</g>` + fist(o, 250, 296, k, 1.05)
  + shine(94, 82)
};
export const CHARACTERS = Object.freeze(Object.fromEntries(Object.entries(DEF).map(([k, v]) => [k, Object.freeze({label: v.label, w: v.w, h: v.h})])));
export const CHARACTER_GROUPS = Object.freeze({Writers: ['bboy', 'bgirl', 'hooded', 'canman', 'pigeon', 'fox', 'skull', 'd20'],
  Factions: ['cog', 'boombox', 'staffy', 'mask', 'duck', 'burglar', 'ace', 'lantern', 'teapot', 'owl', 'fatcat', 'spider'], Radio: ['mic', 'vinyl', 'selector', 'boombox']});
/** The character as SVG markup in its own box (0..w, 0..h), facing right. */
export function drawCharacter(key, pal = {}) {
  const def = DEF[key]; if (!def) return '';
  const p = {o: pal.o || '#111111', p: pal.p || '#2f6fd6', s: pal.s || '#ff4f9a', a: pal.a || '#ffd23f', k: pal.k || '#8d5a3b', flip: Boolean(pal.flip)};
  return `<g stroke-linejoin="round" stroke-linecap="round">${def.draw(p)}</g>`;
}
