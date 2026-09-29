// owner: R1-finale
// 终章的全部过场（ARCH §6.14；GDD §2.5、P14、§8.8、§8.9、§2.6）。过场一律用监控固定机位（CH1 门楣、CH2 屋角半球机位），带 OSD 与桶形畸变。
//   cs.r1.fin_wonton  吃馄饨（CH2）→ 老周讲那一夜（对话）→ 戴上帽子站到门口、画粉笔叉（CH1）
//   cs.r1.fin_soul    三脚架合影之后：身子一点点空下去，光点流回老周身上；他回屋趴在桌上（CH1 → CH2）
//   cs.r1.dawn        （id 固定，读档异常时引擎直接播它）CH1 的 OSD 从 04:58 加速走到 05:12，“天亮了。”，等快门
//   cs.r1.fin_ending  叫醒：老周伸懒腰、走到院门口回头摆手；土地领着街坊们的光出院门，《送别》；尾声；黑场 REC；片尾照片；E.ending('main')
//   cs.r1.fin_nanke   （r1.nanke）拆迁工人阳台的视角，变焦到 6× 看蚁穴里的小槐安里；E.ending('nanke')
// 结局全程不可跳过（skippable:'never'），不落盘（三脚架 enter 时引擎已 hold('ending')）。

import * as THREE from 'three';
import type { AreaContext } from '../../../core/area';
import type { CameraPose, V3 } from '../../../core/types';
import type { CutStep, CutsceneDef } from '../../../game/cutscene';
import type { GameApi } from '../../../game/effects';
import type { CutsceneId } from '../../../data/ids';
import { F, NPC, PH, SPK } from '../../../data/ids';
import { E } from '../../../game/effects';
import { DAWN_CLOCK, GAME_DATE, OSD_FIXED } from '../../../data/time';
import { LOOK } from '../../../data/render';
import { PALETTE, GHOST_LU } from '../../../data/palette';
import { formatTc, parseTc, yawToRotY, yawTowards } from '../../../core/math';
import { R1 } from '../layout';
import { ENDING, NANKE, P13, P14, ZHOU } from './text';
import { D } from './dialogue';
import { CH1_POSE, CH2_POSE, LU_AT, PORTRAIT_AT, PORTRAIT_SIZE, ZHOU_CHAIR, ZHOU_DOOR, arcPath, rt } from './stage';
import type { FinaleRt } from './stage';
import { CREDIT_PHOTOS, CREDITS_CAM, EPILOGUE_CAM, NANKE_CAM, WORKER_FOOT, WORKER_ON_LADDER, buildCredits, buildEpilogue, buildNanke } from './ending';
import type { CreditsStage, EpilogueSet, NankeSet } from './ending';

export const CS = {
  /** M4：补上脸，遗像特写 + 陆师傅道别 */
  PORTRAIT: 'cs.r1.fin_portrait',
  /** M4：照妖镜拍中，老周在屋角 CH2 的画面里显形 */
  ZHOU_APPEAR: 'cs.r1.fin_zhou_appear',
  WONTON: 'cs.r1.fin_wonton',
  SOUL: 'cs.r1.fin_soul',
  DAWN: 'cs.r1.dawn',
  ENDING: 'cs.r1.fin_ending',
  NANKE: 'cs.r1.fin_nanke',
} as const satisfies Record<string, CutsceneId>;

/** 过场用的后期层 key（GameApi.post 推的，区域卸载时引擎自动弹掉） */
const POST = { predawn: 'fin.predawn', morning: 'fin.morning', mao: 'fin.mao' } as const;
/** 天亮以后的曝光（M4：“天亮了。”那一刻前景不再一片黑；cs.r1.dawn 推、尾声弹掉） */
export const MAO_POST = { key: POST.mao, params: { exposure: LOOK.exposure + 0.2 } } as const;
/** R1-world 的 r1Ambience 读的区域临时状态：天亮过场的最后四分之一远处鸡鸣淡进来（M4：魂归时天还黑，不该先叫） */
const TEMP_ROOSTER = 'fin_rooster';
/** 结局里土地领着光出了院门（R1-world 的 tudiPlacement 读它，返回不在场，跟随的灯笼红光熄掉；两边各写一份字面量） */
const TEMP_TUDI_GONE = 'fin_tudi_gone';
/** 桶形畸变（GDD §9.2：CH1 与过场 0.08） */
const BARREL = 0.08;

// ==================================================================== 小工具

const osdAt = (ch: 1 | 2, from: string, rate = 1, stop?: string) => (t: number): string => {
  const a = parseTc(from);
  const b = stop ? parseTc(stop) : Infinity;
  return `CH${ch} ${GAME_DATE.after} ${formatTc(Math.min(b, a + t * rate))}`;
};
/**
 * 从当前钟点起走的 OSD（GameApi.shichen.clock，与 HUD 同源；M3 补的接口，docs/requests/r1-finale.md #2）：
 * 每次播到这个 osd 步骤（t 从 0 重新算）时取一次钟点，之后按 1 秒/秒走（监控 OSD 是真实秒）。
 * cap：起点不晚于它（cs.r1.fin_soul 之后的 cs.r1.dawn 从 04:58:00 走起，OSD 不能倒走）。
 */
const osdLive = (ch: 1 | 2, cap?: string) => {
  let from = 0;
  let last = Infinity;
  return (t: number): string => {
    if (t < last) {
      const c = rt()?.ctx.game.shichen.clock();
      from = c ? parseTc(c) : parseTc(cap ?? '04:30:00');
      if (cap) from = Math.min(from, parseTc(cap));
    }
    last = t;
    return `CH${ch} ${GAME_DATE.after} ${formatTc(from + t)}`;
  };
};

function withRt(fn: (r: FinaleRt, g: GameApi, ctx: AreaContext) => void): (g: GameApi, ctx: AreaContext) => void {
  return (g, ctx) => {
    const r = rt();
    if (r) fn(r, g, ctx);
  };
}

/** 固定机位：pose + 桶形畸变；ch1 = 切到 ch1 角色（不含 self_head：头就装在这个位置上）。 */
function cam(pose: CameraPose, o?: { ch1?: boolean; yin?: boolean }): CutStep[] {
  const steps: CutStep[] = [{ cam: pose, barrel: BARREL, ...(o?.yin && !o.ch1 ? { layers: ['yin'] as const } : {}) }];
  if (o?.ch1) steps.push({ cam: 'ch1', ...(o.yin ? { layers: ['yin'] as const } : {}) });
  return steps;
}

/** 沿折线按弧长走完一段（老周的根节点；姿势 walk 由 zhouOverride 给，腿由 rig.update 摆）。 */
function walkZhou(points: readonly V3[]): (g: GameApi, t01: number, dt: number) => void {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    segs.push(d);
    total += d;
  }
  let lastT = 0;
  return (_g, t01, dt) => {
    const r = rt();
    if (!r?.zhouNpc || !r.zhou) return;
    let s = Math.min(1, Math.max(0, t01)) * total;
    let i = 0;
    while (i < segs.length - 1 && s > segs[i]!) {
      s -= segs[i]!;
      i++;
    }
    const a = points[i]!, b = points[i + 1]!;
    const u = segs[i]! > 0 ? Math.min(1, s / segs[i]!) : 1;
    const root = r.zhouNpc.root;
    root.position.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
    root.rotation.y = yawToRotY(yawTowards(a, b));
    const speed = dt > 0 ? (Math.abs(t01 - lastT) * total) / dt : 0;
    lastT = t01;
    r.zhou.update(dt, t01 >= 1 - 1e-3 ? 0 : Math.max(0.6, Math.min(1.6, speed)));
  };
}

/** 让老周转过来看着某一点。 */
function zhouFace(p: V3): (g: GameApi, ctx: AreaContext) => void {
  return withRt(r => r.zhouNpc?.lookAt(p));
}

function setZhou(look: FinaleRt['zhouOverride']): (g: GameApi, ctx: AreaContext) => void {
  return withRt(r => {
    r.zhouOverride = look;
  });
}

/** 老周胸口的世界坐标（光点的落点）。 */
function zhouChest(): V3 {
  const r = rt();
  const p = r?.zhou?.anchors.chest.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(...ZHOU_DOOR).setY(1.2);
  return [p.x, p.y, p.z];
}

// ==================================================================== cs.r1.fin_wonton：吃馄饨、讲那一夜、画叉

/** 馄饨碗上的热气（几缕淡白的光点慢慢往上飘）。 */
function steam(r: FinaleRt): void {
  const b = r.bowl.position;
  for (let i = 0; i < 12; i++) {
    const x = b.x + ((i % 3) - 1) * 0.03, z = b.z + ((i % 4) - 1.5) * 0.02;
    r.motes.spawn(() => [x, b.y + 0.08, z], (u, f) => [f[0] + Math.sin(u * 5 + i) * 0.03, f[1] + u * 0.45, f[2] + Math.cos(u * 4 + i) * 0.02], {
      dur: 2.4, delay: i * 0.45, color: '#E8E2D6', hdr: 0.7,
    });
  }
}

/** 吃：右臂一下一下往嘴边送（在 NPC 的姿势之后覆盖关节，区域 update 在 npc.update 之后）。 */
function eatTick(_g: GameApi, t01: number): void {
  const z = rt()?.zhou;
  if (!z) return;
  const k = Math.max(0, Math.sin(t01 * Math.PI * 7));
  z.joints.shoulderR.rotation.x = 0.3 + 0.55 * k;
  z.joints.elbowR.rotation.x = 1.15 + 0.8 * k;
  z.joints.neck.rotation.x = 0.12 * k;
}

const WONTON: CutsceneDef = {
  id: CS.WONTON,
  skippable: 'rewatch',
  steps: [
    ...cam(CH2_POSE),
    { osd: osdLive(2) },
    { run: setZhou({ pose: 'sit', variant: 'slump' }) },
    { wait: 1.6 },
    // 他抬起头（摘了帽子，端起碗）
    { run: withRt(r => { r.zhouOverride = { pose: 'sit', variant: 'nocap' }; r.bowlEaten = false; steam(r); }) },
    { music: 'erhu_dea' },
    { wait: 0.8 },
    // 三年没吃口热乎的：一勺一勺地吃（右手端着缸子往嘴边送），碗里冒着热气
    { during: 4.2, tick: eatTick },
    { run: withRt(r => { r.bowlEaten = true; }) },
    { wait: 0.9 },
    { dialogue: D.ZHOU_WONTON },
    { run: withRt(r => { r.bowlEaten = null; }) },
    // 对话结束已设 r1.zhou_fed：老周（NpcDef.onPlaced 淡出淡入）挪到门口；这边黑一下切到门楣
    { fade: 'out', dur: 0.7 },
    ...cam(CH1_POSE, { ch1: true }),
    { osd: osdLive(1) },
    { run: withRt(r => { r.zhouOverride = { pose: 'crouch', variant: 'cap' }; r.chalkReveal = 0; }) },
    { wait: 0.7 },
    { fade: 'in', dur: 0.7 },
    // 戴上帽子，用粉笔在身边地上画了个叉
    { during: 2.4, tick: (_g, t01) => { const r = rt(); if (r) r.chalkReveal = Math.min(1, 0.1 + t01); } },
    { run: withRt(r => { r.chalkReveal = null; r.zhouOverride = { pose: 'stand', variant: 'cap' }; r.zhouNpc?.lookAt(CH1_POSE.pos); }) },
    { wait: 1.8 },
    { run: setZhou(null) },
    // 画完叉，二胡淡出（M4：原来一直循环到天亮；门口说话时 dlg.r1.fin_zhou_door 再起一次）
    { music: 'stop' },
  ],
};

// ==================================================================== cs.r1.fin_portrait：补上脸（M4）

/** 遗像特写：桌前、比遗像高一点，两支蜡烛在画面下缘左右（shot.r1.fin_portrait 同一个方向，站在椅子与桌子之间） */
const PORTRAIT_CAM: CameraPose = {
  pos: [PORTRAIT_AT[0], 1.2, 20.98],
  target: [PORTRAIT_AT[0], PORTRAIT_AT[1] + PORTRAIT_SIZE.h * 0.5, PORTRAIT_AT[2]],
  fov: 36,
};
const PORTRAIT: CutsceneDef = {
  id: CS.PORTRAIT,
  skippable: 'rewatch',
  steps: [
    { cam: PORTRAIT_CAM, blend: 0.6, barrel: BARREL },
    // 只看补好的脸：主动机（GDD §9.5）
    { music: 'motif_dea' },
    { wait: 1.6 },
    { dialogue: D.LU_FAREWELL },
    { cam: 'player', blend: 0.6 },
    { wait: 0.6 },
  ],
};

// ==================================================================== cs.r1.fin_zhou_appear：照妖镜拍中，老周显形（M4）

/**
 * 显形时玩家退到椅子东北边一步、朝着椅子：关掉监控台以后不站在趴着的老周身上（离椅子 1.1m，离桌子 < 2m，视频线不会拔出）。
 * 背后（东北）是屋里的空地、再往后是东墙门洞北边的实墙：第三人称相机有地方放（原来退到门里 (-5.7,20.4) 朝西，
 * 相机从门洞里退到了门框上，满屏一片红）。
 */
const APPEAR_PLAYER: V3 = [-5.85, 0, 19.95];
/** 正对椅子是 218°；往南偏 18°：第三人称相机在右肩后，他落在自己脑袋右边、准星附近，不被自己的摄像头脑袋挡住 */
const APPEAR_YAW = 200;
/**
 * 照妖镜拍中、玩家关掉监控台以后播（photo.ts appearAfterPanel）：栈上已经没有面板。
 * 屋角的 CH2 里，桌前椅子上的他一点点显出来（1.2 秒），站在一旁的自己也在画里；旁白字幕不挡着过场（回到第三人称以后接着显示）。
 * 整段约 3.5 秒游戏时间（调试 API 的 console('exit') 要一直推到它播完才 settle，太长会在高负载下撞上 60 秒的真实时间上限）。
 */
const ZHOU_APPEAR: CutsceneDef = {
  id: CS.ZHOU_APPEAR,
  skippable: 'rewatch',
  steps: [
    { run: withRt(r => { r.zhouReveal = 0; r.zhou?.setOpacity(0); }) },
    { run: g => g.player.teleport(APPEAR_PLAYER, APPEAR_YAW, 0) },
    // 屋角的 CH2：桌前的椅子、趴着的他，和站在门里的自己
    ...cam(CH2_POSE),
    { osd: osdLive(2) },
    { wait: 0.4 },
    { during: 1.2, tick: (_g, t01) => { const r = rt(); if (r) r.zhouReveal = t01 * t01 * (3 - 2 * t01); } },
    { run: withRt(r => { r.zhouReveal = null; r.zhouPanelFade = 0; r.zhou?.setOpacity(1); }) },
    { effects: g => { g.say(P13.zhouAppear, undefined, 4.2); } },
    { wait: 1.4 },
    { osd: null },
    { cam: 'player', blend: 0.8 },
    { wait: 0.5 },
  ],
};
// ==================================================================== cs.r1.fin_soul：身子空下去，魂回到老周身上，他回屋趴下

const DOOR_IN: V3 = [-5.5, 0, 20.22];
const SOUL: CutsceneDef = {
  id: CS.SOUL,
  skippable: 'never',
  steps: [
    ...cam(CH1_POSE, { ch1: true }),
    { osd: osdLive(1, '04:57:31') },
    {
      run: withRt((r, g) => {
        // 寅时的夜：先压住卯时的后期与灯（天亮在 cs.r1.dawn 里慢慢放开）
        r.env.mode = 'night';
        r.env.t01 = 0;
        r.env.hideFollowers(true, false);
        g.post.push(POST.predawn, { tintAmt: 0, grain: 0.06, exposure: LOOK.exposure - 0.15 });
        r.zhouOverride = { pose: 'stand', variant: 'cap' };
      }),
    },
    { wait: 0.1 },
    // 合影：这是老周一辈子第二张照片，也是伙计第一次进了画（缩略图就从 CH1 这一帧拍）
    { effects: g => { g.photo.award(PH.FINAL, { thumb: 'render' }); } },
    { sfx: 'shutter' },
    { fade: 'white', dur: 0.12 },
    { wait: 1.4 },
    { run: (g, _ctx) => { const r = rt(); const p = g.player.position; r?.zhouNpc?.lookAt([p.x, 0, p.z]); } },
    { say: ZHOU.done, who: NPC.ZHOU, dur: 2.4 },
    { say: ZHOU.headless, who: NPC.ZHOU, dur: 4.4 },
    // 快门合上，你的身子一点点空下去，那一块魂回到老周身上
    {
      run: withRt((r, g) => {
        g.player.model.setBodyOpacity(0, 4);
        const pos = g.player.position;
        for (let i = 0; i < 16; i++) {
          const from = (): V3 => [pos.x + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.9, pos.z + (Math.random() - 0.5) * 0.3];
          const to = zhouChest();
          r.motes.spawn(from, arcPath([(pos.x + to[0]) / 2, 2.0 + (i % 3) * 0.2, (pos.z + to[2]) / 2 + 0.2], to, 0.12), { dur: 2.2, delay: i * 0.2, color: PALETTE.GHOST, hdr: 3.2 });
        }
      }),
    },
    { wait: 4.6 },
    { run: g => g.player.model.setVisible(false) },
    { wait: 0.8 },
    { run: zhouFace(DOOR_IN) },
    { run: setZhou({ pose: 'walk', variant: 'cap' }) },
    { during: 4.2, tick: walkZhou([ZHOU_DOOR, [-4.3, 0, 20.75], [-4.95, 0, 20.3], DOOR_IN]) },
    // 回屋：切到屋角的 CH2
    ...cam(CH2_POSE),
    { osd: osdAt(2, '04:57:48') },
    { during: 2.4, tick: walkZhou([DOOR_IN, [-6.1, 0, 20.5], ZHOU_CHAIR]) },
    {
      run: withRt((r, _g, ctx) => {
        r.zhouOverride = { pose: 'sit', variant: 'cap' };
        r.zhouNpc?.root.rotation.set(0, yawToRotY(180), 0);
        // 交还站位：r1.soul_returned 的站位是椅子（他已经走到了，onPlaced 只对齐不淡出）
        ctx.setTemp('fin_zhou_out', false);
      }),
    },
    { wait: 1.2 },
    { say: ZHOU.nap, who: NPC.ZHOU, dur: 4.4 },
    { run: setZhou({ pose: 'sit', variant: 'slump' }) },
    { wait: 2.2 },
    { effects: [E.cutscene(CS.DAWN)] },
  ],
};

// ==================================================================== cs.r1.dawn：天亮了，叫我

const DAWN: CutsceneDef = {
  id: CS.DAWN,
  skippable: 'never',
  steps: [
    {
      run: withRt((r, g) => {
        // 读档异常（soul_returned 而没叫醒）时引擎直接播这一段：身子不见，头留在门楣上
        g.player.model.setVisible(false);
        r.zhouOverride = null;
        r.env.mode = 'dawn';
        r.env.t01 = 0;
        r.env.hideFollowers(true, false);
        g.post.push(POST.predawn, { tintAmt: 0, grain: 0.06, exposure: LOOK.exposure - 0.15 });
      }),
    },
    ...cam(CH1_POSE, { ch1: true }),
    { osd: osdAt(1, DAWN_CLOCK.from, DAWN_CLOCK.rate, DAWN_CLOCK.to) },
    {
      effects: g => {
        g.shichen.override(DAWN_CLOCK.from, DAWN_CLOCK.rate);
        g.post.pop(POST.predawn, DAWN_CLOCK.realSec);
        // 天亮以后提一点曝光（M4：黎明粉，前景不再一片黑）；尾声弹掉
        g.post.push(MAO_POST.key, MAO_POST.params, DAWN_CLOCK.realSec);
      },
    },
    // 东边发白（12 秒加速钟，GDD §3.10）；最后四分之一远处的鸡鸣淡进来（R1-world 的环境声读 temp(fin_rooster)）
    {
      during: DAWN_CLOCK.realSec,
      tick: (_g, t01, _dt, ctx) => {
        const r = rt();
        if (r) r.env.t01 = t01;
        if (t01 >= 0.75) ctx.setTemp(TEMP_ROOSTER, true);
      },
    },
    { effects: g => { g.say(P14.dawn, undefined, 10); } },
    { await: 'shutter', prompt: P14.prompt, early: P14.early },
    { sfx: 'shutter' },
    { fade: 'white', dur: 0.12 },
    { effects: [E.flag(F.R1_CALLED_AT_DAWN), E.cutscene(CS.ENDING)] },
  ],
};

// ==================================================================== cs.r1.fin_ending：听见了。走了啊，伙计。

const GATE: V3 = [0.1, 0, 23.35];
const OUT: V3 = [0.2, 0, 27.2];
/** CH1 机位往镜头前方挪 0.3m（出了头壳）：推近那一拍用固定机位角色（画自己的头），机位不能在头里 */
const CH1_AHEAD: V3 = (() => {
  const p = new THREE.Vector3(...CH1_POSE.pos), d = new THREE.Vector3(...CH1_POSE.target).sub(p).normalize();
  p.addScaledVector(d, 0.3);
  return [p.x, p.y, p.z];
})();
const TUDI_DOOR: V3 = R1.npcSpots.tudiBoothDoor as V3;

/** 土地（R1-world 的 NPC）领着光走：只挪他的根节点（他不在场/被藏起来就不动），手里的灯笼跟着走。 */
function tudiWalk(from: V3, to: V3, fade = false): (g: GameApi, t01: number, dt: number, ctx: AreaContext) => void {
  let root: THREE.Object3D | undefined;
  return (_g, t01, _dt, ctx) => {
    root ??= ctx.getRef(NPC.TUDI);
    if (root && root.visible) {
      const u = t01 * t01 * (3 - 2 * t01);
      root.position.set(from[0] + (to[0] - from[0]) * u, from[1] + Math.abs(Math.sin(t01 * 24)) * 0.02, from[2] + (to[2] - from[2]) * u);
      root.rotation.y = yawToRotY(yawTowards(from, to));
      if (fade) root.scale.setScalar(Math.max(0.001, 1 - Math.max(0, t01 - 0.7) / 0.3));
    }
    // 淡没了：土地不在场，跟随的灯笼红光随之熄掉（M4：尾声里院门外人行道上不再留一个红点）。取不到根节点也照样写。
    // 最后一帧的 t01 不一定正好是 1（during 按 t ≥ total − 1e-6 收尾，1/30 秒累加 225 次差一点点），留个余量
    if (fade && t01 >= 1 - 1e-3) ctx.setTemp(TEMP_TUDI_GONE, true);
  };
}

/**
 * 街坊们的光（M4 重做）：原来 16 个起点多在院子北半边、CH1 镜头的身后，同一时刻画面里只有四五个暗点。
 * 现在从 CH1 画面里与画面左右两边的地面、墙根冒出来（贴地 0.2–0.5m），一路升到一人高，汇到土地走的那条路上，出院门以后在门外聚成一串；
 * 32 粒、每 0.3 秒放一粒、各走 10–12 秒，盖住土地说两句话的十几秒。另有两颗更亮的领头光紧跟在土地的灯笼后面：
 * 王奶奶（灶火的青，PALETTE.STOVE）和陆师傅（偏暖的白，GHOST_LU）。
 */
function neighbourLights(r: FinaleRt, ctx: AreaContext): void {
  const P = r.procession;
  // 起点：画面左缘（东北，院门北边的院子）、画面中间的地面、画面右缘（院门西边、小区简介牌一带）、院墙根
  const starts: V3[] = [];
  for (let i = 0; i < 32; i++) {
    const k = i % 4, j = Math.floor(i / 4), f = ((i * 37) % 11) / 10;
    let s: V3;
    if (k === 0) s = [-1.5 + j * 0.85 + f * 0.4, 0.25 + f * 0.25, 18.4 + f * 1.3];
    else if (k === 1) s = [-0.5 + j * 0.9, 0.2 + f * 0.2, 20.4 + f * 2.2];
    else if (k === 2) s = [-3.6 + f * 1.8, 0.3 + f * 0.3, 21.6 + j * 0.25];
    else s = [1.0 + j * 0.9, 0.3 + f * 0.2, 23.65];
    starts.push(s);
  }
  starts.forEach((s, i) => {
    const warm = i % 3 === 0;
    const ctrl: V3 = [-0.6 + ((i % 5) - 2) * 0.35, 1.4 + (i % 4) * 0.12, 22.4 + (i % 3) * 0.3];
    const end: V3 = [OUT[0] + ((i % 7) - 3) * 0.28, 1.35 + (i % 5) * 0.12, OUT[2] + 1.2 + (i % 6) * 0.35];
    P.spawn(() => s, arcPath(ctrl, end, 0.18), {
      dur: 10 + (i % 5) * 0.5, delay: i * 0.3, color: warm ? '#FFD9A0' : PALETTE.GHOST, hdr: 3.6 + (i % 3) * 0.2,
    });
  });
  // 领头的两颗：跟着土地的灯笼（他的根节点由 tudiWalk 挪；拿不到就原地）
  const tudiPos = new THREE.Vector3(...TUDI_DOOR);
  const follow = (dx: number, dz: number, bob: number): ((u: number, from: V3) => V3) => (u, _from) => {
    const root = ctx.getRef(NPC.TUDI);
    if (root && root.visible) tudiPos.copy(root.position);
    return [tudiPos.x + dx, 1.25 + Math.sin(u * 30 + bob) * 0.06, tudiPos.z + dz];
  };
  const lead = 1.5 + 5.2 + 7.5;
  P.spawn(() => [TUDI_DOOR[0], 1.2, TUDI_DOOR[2]], follow(-0.45, -0.35, 0), { dur: lead, color: PALETTE.STOVE, hdr: 6 });
  P.spawn(() => [TUDI_DOOR[0], 1.2, TUDI_DOOR[2]], follow(0.4, -0.55, 1.7), { dur: lead, color: GHOST_LU, hdr: 6 });
}

const WALK_OUT = walkZhou([GATE, OUT]);

/** 结局里老周的魂影慢慢淡掉。 */
function zhouFade(t01: number): void {
  const r = rt();
  r?.zhou?.setOpacity(Math.max(0, 1 - t01));
}

const ENDING_STEPS: CutStep[] = [
  // 叫醒：CH2 里他抬起头，伸了个懒腰
  ...cam(CH2_POSE),
  { osd: osdAt(2, DAWN_CLOCK.to) },
  { run: setZhou({ pose: 'sit', variant: 'slump' }) },
  { wait: 1.0 },
  { run: setZhou({ pose: 'sit', variant: 'nocap' }) },
  { wait: 1.3 },
  { run: setZhou({ pose: 'stand', variant: 'nocap' }) },
  // 叫醒他：主动机（D–E–A）
  { music: 'motif_dea' },
  {
    during: 2.4,
    tick: (_g, t01) => {
      const z = rt()?.zhou;
      if (!z) return;
      const a = Math.sin(Math.min(1, t01 * 1.4) * Math.PI) * 2.7;
      z.joints.shoulderL.rotation.x = a;
      z.joints.shoulderR.rotation.x = a;
      z.joints.shoulderL.rotation.z = -0.25 * a / 2.7;
      z.joints.shoulderR.rotation.z = 0.25 * a / 2.7;
      z.joints.spine.rotation.x = 0.12 * a / 2.7;
    },
  },
  { run: setZhou({ pose: 'walk', variant: 'cap' }) },
  { during: 2.6, tick: walkZhou([ZHOU_CHAIR, [-6.1, 0, 20.45], DOOR_IN]) },
  // 门楣 CH1：他走到院门口，回头冲你摆手
  ...cam(CH1_POSE, { ch1: true }),
  { osd: osdAt(1, '05:12:08') },
  { during: 6.4, tick: walkZhou([DOOR_IN, [-4.9, 0, 20.3], [-3.6, 0, 21.1], [-1.4, 0, 22.5], GATE]) },
  { run: zhouFace(CH1_POSE.pos) },
  { run: setZhou({ pose: 'raise_arm', variant: 'cap' }) },
  // 摆手（在区域 update 里逐帧摆，对话等玩家按键期间也在摆）
  { run: withRt(r => { r.waving = 1; if (r.zhouSmile) r.zhouSmile.visible = true; }) },
  // 伙计这只眼睛自己拉近看他（M4：原来他在 6 米外只有一百来像素高，脸上没有五官，“他冲着你笑”没演出来）。
  // 机位往前挪出头壳 0.3m（固定机位角色画自己的头），推完再退回 CH1、换回 ch1 角色
  { sfx: 'zoom_motor' },
  { cam: { pos: CH1_AHEAD, target: [GATE[0], 1.47, GATE[2]], fov: 11 }, blend: 1.6, barrel: BARREL },
  { dialogue: D.ZHOU_BYE },
  { effects: g => { g.say(ENDING.smile, undefined, 6); } },
  { wait: 6 },
  { sfx: 'zoom_motor' },
  { cam: { pos: CH1_AHEAD, target: CH1_POSE.target, fov: CH1_POSE.fov }, blend: 1.2, barrel: BARREL },
  { wait: 1.25 },
  // 拉回来以后就在这个位姿上换回 ch1 角色（不画自己的头；与 CH1 只差镜头前 0.3m，不再跳一下）
  { cam: 'ch1' },
  { run: withRt(r => { r.waving = 0; if (r.zhouSmile) r.zhouSmile.visible = false; }) },
  { run: zhouFace(OUT) },
  { run: setZhou({ pose: 'walk', variant: 'cap' }) },
  { during: 3.2, tick: (g, t01, dt) => { WALK_OUT(g, t01, dt); zhouFade(Math.max(0, (t01 - 0.35) / 0.65)); } },
  // 土地提着灯笼领着街坊们的光出了院门，八音盒奏起《送别》
  { music: 'songbie' },
  { run: withRt((r, _g, ctx) => neighbourLights(r, ctx)) },
  { wait: 1.5 },
  { effects: g => { g.say(ENDING.tudi[0], NPC.TUDI, 4.6); } },
  { during: 5.2, tick: tudiWalk(TUDI_DOOR, [-1.0, 0, 22.2]) },
  { effects: g => { g.say(ENDING.tudi[1], NPC.TUDI, 7.5); } },
  { during: 7.5, tick: tudiWalk([-1.0, 0, 22.2], [OUT[0], 0, OUT[2] + 1.2], true) },
  { wait: 1.2 },
  { fade: 'out', dur: 2.6 },
  // —— 尾声：8 月 28 日上午，挖掘机的剪影下 ——
  {
    run: (g, ctx) => {
      const r = rt();
      if (!r) return;
      r.env.mode = 'morning';
      g.post.pop(POST.predawn);
      g.post.pop(POST.mao);
      g.post.push(POST.morning, { exposure: LOOK.exposure + 0.05, tint: [0.96, 0.9, 0.84], tintAmt: 0.18, grain: 0.05, vignette: 0.45 });
      g.player.model.setVisible(false);
      r.zhou?.setOpacity(0);
      r.motes.clear();
      r.procession.clear();
      // 进区域时已经藏着建好了就只切可见（index.ts prebuildEnding），否则现建
      const e = (r.sets.epilogue as EpilogueSet | undefined) ?? buildEpilogue(ctx);
      e.group.visible = true;
      r.sets.epilogue = e;
      ctx.ambience([{ preset: 'rooster', gain: -18 }, { preset: 'traffic', gain: -30 }], 2);
    },
  },
  ...cam(EPILOGUE_CAM, { ch1: true }),
  { osd: osdAt(1, OSD_FIXED.epilogue.slice(-8)) },
  { fade: 'in', dur: 2.2 },
  { during: 6.5, tick: epilogueTick('drive') },
  { during: 3.8, tick: epilogueTick('climb') },
  { effects: g => { g.say(ENDING.worker[0], SPK.WORKER, 4.4); } },
  { during: 4.4, tick: epilogueTick('look') },
  { during: 2.6, tick: epilogueTick('wipe') },
  { effects: g => { g.say(ENDING.worker[1], SPK.WORKER, 4); } },
  { during: 4.0, tick: epilogueTick('reach') },
  { cam: { pos: [-4.83, 2.62, 20.25], target: [-3.9, 1.1, 21.6], fov: 60, roll: 14 }, blend: 1.2, barrel: BARREL },
  { wait: 1.0 },
  { fade: 'out', dur: 1.2 },
  // —— 黑屏，REC 红点一闪一闪。标题 ——
  {
    run: (g, ctx) => {
      const r = rt();
      if (!r) return;
      r.env.mode = 'far';
      r.env.hideFollowers(true, true);
      g.post.pop(POST.morning);
      const c = (r.sets.credits as CreditsStage | undefined) ?? buildCredits(ctx, g);
      c.group.visible = true;
      // 合影 ph.final 是在 cs.r1.fin_soul 里才拍的：预建的卡片这时补贴缩略图
      c.refreshThumbs(g);
      r.sets.credits = c;
      // 黑场与片尾照片里不再是鸡叫和车流（M4）
      ctx.ambience([], 1.5);
    },
  },
  ...cam(CREDITS_CAM, { ch1: true }),
  // 片尾不是监控画面：不挂 REC（M4：原来写的 '' 不等于 null，片名与五张照片上一直挂着“● REC”）
  { osd: null },
  { fade: 'in', dur: 0.3 },
  { wait: 2.6 },
  { title: ENDING.title, dur: 5.2 },
  { wait: 2.4 },
  // 片尾照片配《送别》（M4：土地出门时起的那一遍约 55 秒，放到这里正好收尾；照片段再从头奏一遍，一直奏到回标题。
  // 引擎若加了带尾奏的长版（docs/requests/r1-finale.md），这里改成不重起）
  { music: 'songbie' },
  // 片尾照片（GDD §8.9）
  ...CREDIT_PHOTOS.map((_, i): CutStep => ({
    during: 4.2,
    tick: (_g, t01) => {
      const c = rt()?.sets.credits as CreditsStage | undefined;
      const a = Math.min(1, t01 / 0.2) * Math.min(1, (1 - t01) / 0.2);
      c?.show(i, a, t01);
    },
  })),
  { during: 0.6, tick: () => (rt()?.sets.credits as CreditsStage | undefined)?.show(null, 0, 0) },
  { osd: null },
  // 主结局播完；交齐了旧照（r1.nanke）的，片尾之后接着播南柯（通关标记等 'nanke' 再写，ARCH §6.4）
  {
    effects: async g => {
      g.endingDone('main');
      if (g.state.flag(F.R1_NANKE)) await g.cutscene(CS.NANKE);
    },
  },
];

const ENDING_DEF: CutsceneDef = { id: CS.ENDING, skippable: 'never', steps: ENDING_STEPS };

/** 尾声的逐帧动作（挖掘机开过去、工人爬梯子、看、擦镜头、伸手摘）。 */
function epilogueTick(phase: 'drive' | 'climb' | 'look' | 'wipe' | 'reach'): (g: GameApi, t01: number, dt: number) => void {
  const camPos = new THREE.Vector3(...EPILOGUE_CAM.pos);
  const fwd = new THREE.Vector3(...EPILOGUE_CAM.target).sub(camPos).normalize();
  const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, fwd).normalize();
  const foot = new THREE.Vector3(...WORKER_FOOT);
  const onLadder = new THREE.Vector3(...WORKER_ON_LADDER);
  const workerYaw = yawTowards(onLadder, camPos);
  return (_g, t01, dt) => {
    const e = rt()?.sets.epilogue as EpilogueSet | undefined;
    if (!e) return;
    // 挖掘机一直在院墙外往西开
    const exT = phase === 'drive' ? t01 * 0.45 : phase === 'climb' ? 0.45 + t01 * 0.2 : phase === 'look' ? 0.65 + t01 * 0.15 : phase === 'wipe' ? 0.8 + t01 * 0.08 : 0.88 + t01 * 0.12;
    e.excavator.position.x = 16 - exT * 30;
    const w = e.worker;
    if (phase === 'drive') {
      w.root.visible = false;
      return;
    }
    w.root.visible = true;
    if (phase === 'climb') {
      w.setPose('walk', 0);
      w.root.position.lerpVectors(foot, onLadder, t01);
      w.root.rotation.y = yawToRotY(workerYaw);
      w.update(dt, 0.8);
      return;
    }
    w.root.position.copy(onLadder);
    w.root.rotation.y = yawToRotY(workerYaw);
    if (phase === 'look') {
      w.setPose('look_up', 0.3);
      w.update(dt, 0);
      return;
    }
    if (phase === 'wipe') {
      w.setPose('raise_arm', 0.2);
      w.update(dt, 0);
      e.sleeve.visible = t01 > 0.05 && t01 < 0.95;
      const u = t01 * Math.PI * 4;
      e.sleeve.position.copy(camPos).addScaledVector(fwd, 0.14).addScaledVector(side, Math.sin(u) * 0.09).addScaledVector(up, -0.02 + Math.cos(u * 0.5) * 0.03);
      e.sleeve.lookAt(camPos);
      e.sleeve.rotateZ(0.5 + Math.sin(u * 0.5) * 0.3);
      return;
    }
    e.sleeve.visible = false;
    w.setPose('raise_arm', 0.3);
    w.update(dt, 0);
  };
}

// ==================================================================== cs.r1.fin_nanke：南柯

const NANKE_DEF: CutsceneDef = {
  id: CS.NANKE,
  skippable: 'never',
  steps: [
    { fade: 'out', dur: 0.4 },
    {
      run: (_g, ctx) => {
        const r = rt();
        if (!r) return;
        r.env.mode = 'far';
        r.env.hideFollowers(true, true);
        const n = (r.sets.nanke as NankeSet | undefined) ?? buildNanke(ctx);
        n.group.visible = true;
        r.sets.nanke = n;
        // 小老周冲镜头摆手（每帧）
        let t = 0;
        r.anims.push(dt => {
          t += dt;
          n.miniZhou.update(dt, 0);
          n.miniZhou.joints.shoulderR.rotation.z = 0.15 + Math.sin(t * 5.5) * 0.4;
          n.lamp.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
          n.ants.update(dt);
          // 彩灯一明一暗（整串一起呼吸，逐个错开一点）
          const k = 0.75 + 0.25 * Math.sin(t * 2.2);
          n.festoon.scale.setScalar(0.9 + 0.1 * k);
          return true;
        });
      },
    },
    ...cam(NANKE_CAM, { ch1: true }),
    { osd: OSD_FIXED.nanke },
    { fade: 'in', dur: 2 },
    { wait: 1.5 },
    { effects: g => { g.say(NANKE.zoomHint, undefined, 6); } },
    { await: 'zoom', zoom: 6 },
    // 看见小槐安里：八音盒的主动机（M4）
    { music: 'motif_dea' },
    { wait: 2 },
    { say: NANKE.tudi, who: NPC.TUDI, dur: 8.5 },
    // 题名是字幕“南柯”（GDD §2.6、§11 步骤 58：zoom(6) → 字幕“南柯”，walkthrough 按字幕断言）；M4 拉长到 4.5 秒、前面垫了主动机。
    // 改成主结局那样的大字卡要先改 GDD 与 walkthrough（见交付说明）
    { say: NANKE.title, who: '', dur: 4.5 },
    { wait: 1.5 },
    { fade: 'out', dur: 2 },
    { effects: [E.ending('nanke')] },
  ],
};

export const CUTSCENES: readonly CutsceneDef[] = [PORTRAIT, ZHOU_APPEAR, WONTON, SOUL, DAWN, ENDING_DEF, NANKE_DEF];

/** 陆师傅化成一点光：从他胸口飘出门、往槐树那边去（logic.ts 在道别对话之后调用）。 */
export function luLightPath(r: FinaleRt): void {
  const chest: V3 = [LU_AT[0], 1.35, LU_AT[2]];
  for (let i = 0; i < 5; i++) {
    r.motes.spawn(() => [chest[0] + (i - 2) * 0.05, chest[1] + (i % 2) * 0.1, chest[2]], arcPath([-5.2, 2.2, 20.2], [0.5, 5.5, 0.5], 0.1), {
      dur: 4.5 + i * 0.3, delay: 0.4 + i * 0.25, color: GHOST_LU, hdr: 3.2,
    });
  }
}
