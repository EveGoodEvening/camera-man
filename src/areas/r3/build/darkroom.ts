// owner: R3
// 暗房（x -3~0，z -11~-14）：黑墙、北墙工作台（白瓷缺口盘 | 黄搪瓷方盘 | 红双喜脸盆 | 水池）、晾片绳（5 个夹子）、
// 灯绳、同一盏灯白/红两用（GDD §4.4：白 #FFF2DC，红 #B3001B，暗房只有这 1 盏点光）、药水瓶、放大机。
// 底片（挂上晾片绳后出现）：负片在 world 层；伙计的眼睛看到的是正片——正片叠在 faded_text 层（只在取景器常光下渲染）。

import * as THREE from 'three';
import type { AreaContext } from '../../../core/area';
import { MATERIALS } from '../../../fx/materials';
import { paintTexture } from '../../../kit/canvas';
import { kitMat } from '../../../kit/geom';
import { designLight } from '../../../kit/lamps';
import { PROPS } from '../../../kit/props';
import { rng, range } from '../../../kit/rng';
import { BASIN_XI, BENCH, DARK, DARK_LAMP, DRYING, FILM, FILM_X, LAMP_CORD, PLATE_CHIPPED, SHOP, SINK, TRAY_SQUARE } from '../layout';
import { Batch, contactShadows } from './util';
import { filmStrip } from './textures';
import { LAYER } from '../../../core/layers';

export interface DarkroomRig {
  light: THREE.PointLight;
  bulb: THREE.MeshStandardMaterial;
  cordKnob: THREE.Object3D;
  tray: THREE.Group;
  basin: THREE.Group;
  plate: THREE.Group;
  sink: THREE.Group;
  line: THREE.Group;
  /** 底片（挂上之前隐藏） */
  film: THREE.Group;
  frames: THREE.Group[];
  /** 晾片绳的拾取代理（细长不渲染的盒子；绳子本身是 LineSegments，拿来做射线太粗） */
  lineProxy: THREE.Mesh;
}

/** 暗房白灯与红灯（同一盏灯；ARCH §10.3 的设计强度）。距离 ≤ 4：光照不出暗房多远（点光不投影，墙挡不住）。 */
export const DARK_LIGHT = {
  white: { color: '#FFF2DC', design: 1.5, distance: 4.0, glow: 6 },
  red: { color: '#B3001B', design: 0.8, distance: 3.5, glow: 3 },
} as const;

/** 工作台台面：墨绿小方砖（带贴图，所以不并进色板）。 */
function benchTopMat(ctx: AreaContext): THREE.MeshStandardMaterial {
  const tex = ctx.track(paintTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#1c1f1b';
    g.fillRect(0, 0, w, h);
    const r = rng(17);
    const n = 16, m = 4, cw = w / n, ch = h / m;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const k = range(r, 0.85, 1.1);
        g.fillStyle = `rgb(${Math.round(38 * k)},${Math.round(62 * k)},${Math.round(52 * k)})`;
        g.fillRect(i * cw + 1, j * ch + 1, cw - 2, ch - 2);
      }
    }
  }));
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0 });
  m.name = 'r3.benchTop';
  return m;
}

export function buildDarkroom(ctx: AreaContext, B: Batch): DarkroomRig {
  const black = kitMat('r3.darkWall', { color: '#2b2927', roughness: 0.95 });
  const metal = MATERIALS.metal();
  const darkWood = kitMat('r3.darkWood', { color: '#3a2618', roughness: 0.7 });
  const { x0, x1, z0, z1 } = DARK;
  const ceil = SHOP.darkCeil;

  // 地面（湿水泥）、墙、顶
  B.aabb(kitMat('r3.darkFloor', { color: '#34322f', roughness: 0.55 }), x0, -0.02, z1, x1, 0.002, z0 - 0.075);
  B.aabb(black, SHOP.x0, 0, SHOP.back, x0, ceil, z0 - 0.075);
  B.aabb(black, x1, 0, SHOP.back, x1 + 0.15, ceil, z0 - 0.075);
  B.aabb(black, x0, 0, SHOP.back, x1, ceil, z1);
  B.aabb(black, SHOP.x0, ceil, SHOP.back, x1 + 0.15, ceil + 0.1, z0 - 0.075);
  // 暗房以东的储藏间是封死的实心块（从影棚看是墙，从外面看不见）
  B.aabb(black, x1 + 0.15, 0, SHOP.back, SHOP.x1, SHOP.studioCeil, z0 - 0.075);
  ctx.collider.box([(SHOP.x0 + x0) / 2, 1.5, (z0 + SHOP.back) / 2], [x0 - SHOP.x0, 3, z0 - SHOP.back]);
  ctx.collider.box([(x1 + SHOP.x1) / 2, 1.5, (z0 + SHOP.back) / 2], [SHOP.x1 - x1, 3, z0 - SHOP.back]);
  ctx.collider.box([(x0 + x1) / 2, 1.5, (z1 + SHOP.back) / 2], [x1 - x0, 3, z1 - SHOP.back]);

  // 北墙工作台：木柜身 + 白瓷砖台面（水池那段是独立的水泥池）
  const bz1 = BENCH.z + BENCH.depth / 2;
  const benchX1 = SINK[0] - 0.32;
  B.aabb(darkWood, BENCH.x0, 0, z1, benchX1, BENCH.top - 0.04, bz1);
  // 台面：墨绿的小方砖（湿漉漉的），白瓷盘、黄搪瓷盘、红脸盆在上面才分得清
  B.aabb(benchTopMat(ctx), BENCH.x0, BENCH.top - 0.04, z1, benchX1, BENCH.top, bz1 + 0.02);
  B.aabb(black, BENCH.x0, 0, bz1, benchX1, 0.12, bz1 + 0.02);
  ctx.collider.box([(BENCH.x0 + x1) / 2, BENCH.top / 2, (z1 + bz1) / 2], [x1 - BENCH.x0, BENCH.top, bz1 - z1]);

  // 三件容器（GDD §4.4 的轮廓；角标只按形状叫，颜色要趁白灯记住）
  const plate = PROPS.tray('plate_chipped');
  plate.position.set(...PLATE_CHIPPED);
  plate.rotation.y = 0.5;
  ctx.add(plate);
  const tray = PROPS.tray('square');
  tray.position.set(...TRAY_SQUARE);
  tray.rotation.y = 0.08;
  ctx.add(tray);
  const basin = PROPS.tray('basin_xi');
  basin.position.set(...BASIN_XI);
  ctx.add(basin);
  // 药水：盘里一层暗色的液面（挂在容器组下，准星打在液面上也算对准了容器）
  const liquid = kitMat('r3:chem', { color: '#1a1814', roughness: 0.05, metalness: 0.3 });
  const trayLiquid = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.004, 0.25), liquid);
  trayLiquid.position.set(0, 0.035, 0);
  tray.add(trayLiquid);
  const basinLiquid = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.004, 20), liquid);
  basinLiquid.position.set(0, 0.08, 0);
  basin.add(basinLiquid);
  ctx.track(trayLiquid.geometry);
  ctx.track(basinLiquid.geometry);
  // 水池（龙头从北墙伸出来）
  const sink = PROPS.sink();
  sink.position.set(...SINK);
  sink.rotation.y = Math.PI;
  ctx.add(sink);
  // 药水瓶、量杯、定时钟（西墙搁板）
  for (const y of [1.35, 1.8]) B.aabb(darkWood, x0, y, -13.3, x0 + 0.3, y + 0.03, -11.8);
  const brown = kitMat('r3:bottle', { color: '#3a1a08', roughness: 0.15, metalness: 0.1 });
  const r = rng(71);
  for (let i = 0; i < 9; i++) {
    const y = i < 5 ? 1.38 : 1.83;
    const z = -13.15 + (i % 5) * 0.3 + range(r, -0.04, 0.04);
    const h = range(r, 0.18, 0.28);
    B.cyl(brown, 0.045, 0.05, h, [x0 + 0.13, y + h / 2, z], 10);
    B.cyl(kitMat('r3.bottleCap', { color: '#1a1a1a', roughness: 0.6 }), 0.02, 0.02, 0.04, [x0 + 0.13, y + h + 0.02, z], 8);
  }
  B.cyl(kitMat('r3:timer', { color: '#e8e4d8', roughness: 0.4 }), 0.07, 0.07, 0.04, [x0 + 0.12, 1.87, -12.0], 16).rotation.z = Math.PI / 2;
  // 工作台下的备用盘子、水桶；墙上的毛巾与定时钟
  for (let i = 0; i < 3; i++) B.sbox(['#c8c0b0', '#6a8a9a', '#c8b060'][i]!, 0.4, 0.05, 0.32, [-2.3, 0.1 + i * 0.06, -13.62], i * 6);
  B.scyl('#4a6a8a', 0.16, 0.13, 0.32, [-1.2, 0.16, -13.55], 14, true);
  B.scyl('#2a3a4a', 0.165, 0.165, 0.02, [-1.2, 0.33, -13.55], 14, true);
  B.sbox('#d8d0bc', 0.34, 0.5, 0.01, [x0 + 0.02, 1.15, -12.3], 90);
  B.sbox('#e8e4d8', 0.02, 0.22, 0.22, [x1 - 0.02, 1.9, -13.2], 0, true);
  B.sbox('#1a1a1a', 0.01, 0.16, 0.16, [x1 - 0.035, 1.9, -13.2], 0);
  // 放大机（东墙边的小桌上）
  const tableX = -0.38, tableZ = -12.45;
  B.aabb(darkWood, tableX - 0.3, 0.72, tableZ - 0.28, tableX + 0.3, 0.76, tableZ + 0.28);
  for (const [dx, dz] of [[-0.26, -0.24], [0.22, -0.24], [-0.26, 0.2], [0.22, 0.2]] as const) B.aabb(darkWood, tableX + dx, 0, tableZ + dz, tableX + dx + 0.04, 0.72, tableZ + dz + 0.04);
  B.aabb(kitMat('r3.enlargerBase', { color: '#e8e6de', roughness: 0.5 }), tableX - 0.2, 0.76, tableZ - 0.18, tableX + 0.2, 0.79, tableZ + 0.2);
  B.cyl(metal, 0.025, 0.025, 0.95, [tableX + 0.12, 1.25, tableZ], 10);
  B.aabb(kitMat('r3.enlargerHead', { color: '#2a2a2c', roughness: 0.5, metalness: 0.4 }), tableX - 0.12, 1.35, tableZ - 0.1, tableX + 0.1, 1.55, tableZ + 0.1);
  B.cyl(metal, 0.035, 0.04, 0.12, [tableX - 0.01, 1.28, tableZ], 12);
  ctx.collider.box([tableX, 0.5, tableZ], [0.6, 1.0, 0.6]);

  // 晾片绳（GDD：z=-12，高 1.9m，5 个夹子）；两头钉在墙上的钩子
  const line = PROPS.dryingLine(DRYING.x1 - DRYING.x0, DRYING.clips);
  line.position.set(DRYING.x0, DRYING.y, DRYING.z);
  // 晾片绳是不受光的线段：原色太白，在暗房里像一道激光，压成旧棉绳的灰
  const wire = line.getObjectByName('dryingWire') as THREE.LineSegments | undefined;
  if (wire) (wire.material as THREE.LineBasicMaterial).color.set('#5a554c');
  ctx.add(line);
  B.rod(metal, [x0, DRYING.y, DRYING.z], [DRYING.x0, DRYING.y, DRYING.z], 0.004);
  B.rod(metal, [DRYING.x1, DRYING.y, DRYING.z], [x1, DRYING.y, DRYING.z], 0.004);
  const lineProxy = new THREE.Mesh(new THREE.BoxGeometry(DRYING.x1 - DRYING.x0, 0.12, 0.08), MATERIALS.hitProxy());
  lineProxy.position.set((DRYING.x0 + DRYING.x1) / 2, DRYING.y - 0.04, DRYING.z);
  lineProxy.name = 'r3.dryingLineProxy';
  ctx.add(lineProxy, { occlude: false });

  // 灯：同一盏灯白/红两用（从顶棚吊下来的灯头 + 罩子）
  const cordMat = kitMat('r3:cord', { color: '#1a1a1a', roughness: 0.8 });
  B.rod(cordMat, [DARK_LAMP[0], ceil, DARK_LAMP[2]], [DARK_LAMP[0], DARK_LAMP[1] + 0.12, DARK_LAMP[2]], 0.006);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 16, 1, true), kitMat('r3.darkShade', { color: '#2a1a1a', roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  shade.position.set(DARK_LAMP[0], DARK_LAMP[1] + 0.06, DARK_LAMP[2]);
  B.add(shade);
  const bulb = new THREE.MeshStandardMaterial({ color: '#40302a', emissive: DARK_LIGHT.white.color, emissiveIntensity: DARK_LIGHT.white.glow, roughness: 0.4 });
  bulb.name = 'r3.darkBulb';
  bulb.userData.tempC = 60;
  const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), bulb);
  bulbMesh.position.set(DARK_LAMP[0], DARK_LAMP[1], DARK_LAMP[2]);
  ctx.add(bulbMesh);
  const light = designLight('point', DARK_LIGHT.white.color, DARK_LIGHT.white.design, DARK_LIGHT.white.distance) as THREE.PointLight;
  light.name = 'r3.darkLight';
  light.position.set(DARK_LAMP[0], DARK_LAMP[1] - 0.08, DARK_LAMP[2]);
  ctx.light(light);
  // 灯绳（GDD：(-0.3, 1.8, -11.4)）
  B.rod(cordMat, [LAMP_CORD[0], ceil, LAMP_CORD[2]], [LAMP_CORD[0], LAMP_CORD[1] + 0.03, LAMP_CORD[2]], 0.003);
  const cordKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.06, 10), kitMat('r3.cordKnob', { color: '#c8b27a', roughness: 0.6 }));
  cordKnob.position.set(...LAMP_CORD);
  ctx.add(cordKnob);

  // 底片（挂上之前隐藏）：片头 + 1–4 格（各自一个组，拍照主体 r3.film_frame1–4）+ 5–12 格
  const H = FILM.leader + 12 * (FILM.frame + FILM.gap);
  const negTex = ctx.track(paintTexture(128, 1536, filmStrip(false)));
  const posTex = ctx.track(paintTexture(128, 1536, filmStrip(true)));
  const negMat = new THREE.MeshStandardMaterial({ map: negTex, roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide });
  negMat.name = 'r3.filmNeg';
  // 正片像一张透光的幻灯片：不吃灯（底色黑），只靠自发光；雪地、白墙不至于烧成一团
  const posMat = new THREE.MeshStandardMaterial({ color: '#000000', map: posTex, emissive: '#ffffff', emissiveMap: posTex, emissiveIntensity: 0.95, roughness: 0.6 });
  posMat.name = 'r3.filmPos';
  const film = new THREE.Group();
  film.name = 'r3:film';
  const top = DRYING.y - 0.02;
  /** 片段 [a, b)（从顶往下的米数）的负片 + 正片两张四边形。 */
  const piece = (a: number, b: number, parent: THREE.Object3D) => {
    for (const [mat, dz, layer] of [[negMat, 0, 'world'], [posMat, -0.0025, 'faded_text']] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(FILM.width, b - a), mat);
      const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (a + (1 - uv.getY(i)) * (b - a)) / H);
      // 面朝北（玩家站在绳与工作台之间往南看）
      m.rotation.y = Math.PI;
      m.position.set(FILM_X, top - (a + b) / 2, DRYING.z + dz);
      m.name = layer === 'world' ? 'r3.filmNeg' : 'r3.filmPos';
      m.userData.filmLayer = layer;
      parent.add(m);
    }
  };
  piece(0, FILM.leader, film);
  const frames: THREE.Group[] = [];
  for (let i = 1; i <= 4; i++) {
    const g = new THREE.Group();
    g.name = `r3.filmFrame${i}`;
    const a = FILM.leader + (i - 1) * (FILM.frame + FILM.gap);
    piece(a, a + FILM.frame + FILM.gap, g);
    film.add(g);
    frames.push(g);
  }
  piece(FILM.leader + 4 * (FILM.frame + FILM.gap), H, film);
  // 底片下端的重物夹
  const weight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.012), kitMat('clip.wood', { color: '#C9A878', roughness: 0.8 }));
  weight.position.set(FILM_X, top - H - 0.01, DRYING.z);
  film.add(weight);
  film.visible = false;
  ctx.add(film, { occlude: false });
  // 正片只在取景器常光下渲染（layer.faded_text）；负片在 world 层
  film.traverse(o => {
    if (o.userData.filmLayer === 'faded_text') o.layers.set(LAYER.faded_text);
  });

  contactShadows(ctx, [{ x: (BENCH.x0 + x1) / 2, z: BENCH.z, rx: 1.6, rz: 0.5, a: 0.8 }, { x: tableX, z: tableZ, rx: 0.38, rz: 0.38, a: 0.8 }]);
  return { light, bulb, cordKnob, tray, basin, plate, sink, line, film, frames, lineProxy };
}
