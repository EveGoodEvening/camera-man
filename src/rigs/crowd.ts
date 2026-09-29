// owner: WP2
// 实例化人群（ARCH §5.4）：1984 合影、2008 门厅、1997 剪彩。
// 一个合并的低模人形（腿、躯干、胳膊、头）× 实例；排成 cols 列、前排在 z=0、往后每排 +spacing，后排略高（合影站台阶）；
// 人群面朝 -z，原点在第一排中间的地面。kidsFrontRow：第一排是这么多个小孩（缩小到 0.62）。

import * as THREE from 'three';
import { DEG2RAD } from '../core/math';
import { MATERIALS } from '../fx/materials';
import { rng, range } from '../kit/rng';

export interface CrowdOpts { count: number; cols: number; spacing: number; look: 'replay' | 'ghost' | 'silhouette'; seed?: number; kidsFrontRow?: number }

let personGeo: THREE.BufferGeometry | null = null;

/** 1.72m 的低模人形（原点在脚底中间，面朝 -z）。 */
function person(): THREE.BufferGeometry {
  if (personGeo) return personGeo;
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  add(new THREE.BoxGeometry(0.12, 0.84, 0.14), -0.085, 0.42, 0);
  add(new THREE.BoxGeometry(0.12, 0.84, 0.14), 0.085, 0.42, 0);
  const torso = new THREE.CylinderGeometry(0.19, 0.16, 0.62, 6, 1);
  torso.scale(1, 1, 0.62);
  add(torso, 0, 1.15, 0);
  add(new THREE.BoxGeometry(0.085, 0.6, 0.1), -0.225, 1.14, 0, -0.08);
  add(new THREE.BoxGeometry(0.085, 0.6, 0.1), 0.225, 1.14, 0, 0.08);
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 6), 0, 1.49, 0);
  const head = new THREE.SphereGeometry(0.105, 8, 6);
  head.scale(0.92, 1.1, 1);
  add(head, 0, 1.62, 0);
  // 只保留 position/normal（回放/魂影材质不用 uv），合并成一份
  let n = 0;
  for (const p of parts) n += p.attributes.position?.count ?? 0;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const P = p.attributes.position as THREE.BufferAttribute, N = p.attributes.normal as THREE.BufferAttribute;
    pos.set(P.array as Float32Array, o * 3);
    nor.set(N.array as Float32Array, o * 3);
    o += P.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.computeBoundingBox();
  personGeo = g;
  return g;
}

/** 合并的低模人形，实例化 */
export function createCrowd(o: CrowdOpts): { mesh: THREE.InstancedMesh; bounds: THREE.Box3; dispose(): void } {
  const geo = person();
  let mat: THREE.Material;
  let ownMat = false;
  if (o.look === 'replay') mat = MATERIALS.replay();
  else if (o.look === 'ghost') mat = MATERIALS.ghost();
  else {
    mat = new THREE.MeshBasicMaterial({ color: '#0b0d12' });
    ownMat = true;
  }
  const count = Math.max(0, Math.floor(o.count));
  const cols = Math.max(1, Math.floor(o.cols));
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  mesh.name = 'crowd';
  mesh.count = count;
  const r = rng(o.seed ?? 1984);
  const kids = Math.max(0, Math.min(cols, o.kidsFrontRow ?? 0));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const bounds = new THREE.Box3();
  const bb = new THREE.Box3();
  const base = geo.boundingBox as THREE.Box3;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols), col = i % cols;
    const inRow = Math.min(cols, count - row * cols);
    const isKid = row === 0 && col < kids;
    const k = isKid ? range(r, 0.58, 0.68) : range(r, 0.93, 1.06);
    // 每排居中、交错半个位，看得见后排的脸
    const x = (col - (inRow - 1) / 2) * o.spacing + (row % 2 ? o.spacing * 0.5 : 0) + range(r, -0.06, 0.06);
    const z = row * o.spacing * 0.85 + range(r, -0.05, 0.05);
    p.set(x, row * 0.15, z);
    q.setFromAxisAngle(up, range(r, -8, 8) * DEG2RAD);
    sc.set(k * range(r, 0.95, 1.08), k, k);
    m.compose(p, q, sc);
    mesh.setMatrixAt(i, m);
    bb.copy(base).applyMatrix4(m);
    bounds.union(bb);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  return {
    mesh,
    bounds,
    dispose() {
      // 共享的人形几何不释放（下一个人群还要用）；只释放自己的实例缓冲与私有材质
      mesh.dispose();
      if (ownMat) mat.dispose();
      mesh.removeFromParent();
    },
  };
}
