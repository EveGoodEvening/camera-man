// owner: R4
// R4 的拍照目标（GDD §7.3 与 H 表）。读字目标 rd.huang_breath 要跟着黄三爷的嘴走（函数 at），在 logic.ts 的 build 里用 ctx.readTarget 登记。

import type { PhotoTargetDef } from '../../game/photo';
import { F, GHOST, NPC, OBJ, PT, SEG } from '../../data/ids';
import { TEXT } from './text';

/** 黄三爷的拍照锚点：站位上方 1.1m（胸口，高过摊桌上的货，从过道拍不会被桌上的东西挡住）。 */
const HUANG_ANCHOR = [0, 1.1, 0] as const;

export const PHOTO_TARGETS: readonly PhotoTargetDef[] = [
  {
    // 揭面具后常光拍到的是黄鼠狼（P11 的误导项）
    id: PT.HUANG_NORMAL,
    subjects: [{ ref: NPC.HUANG, anchor: HUANG_ANCHOR }],
    maxDist: 5, minZoom: 1, lens: 'normal', context: { kind: 'live' },
    when: F.R4_FOUND_HUANG,
  },
  {
    // P10：回放里黄三爷的影子与樟木箱同框（带子正被塞进箱子的第 10–18 秒）
    id: PT.HUANG_HIDES,
    subjects: [{ ref: GHOST.HUANG_2023 }, { ref: OBJ.R4_CAMPHOR_CHEST }],
    maxDist: 6, minZoom: 1, lens: 'normal',
    context: { kind: 'replay', segment: SEG.STALL_2023, t: [10, 18] },
    captions: { too_early: TEXT.cap.hidesEarly },
  },
  {
    // P11：红外 4m 内拍黄三爷（全场唯一的暖色）
    id: PT.HUANG_IR,
    subjects: [{ ref: NPC.HUANG, anchor: HUANG_ANCHOR }],
    maxDist: 4, minZoom: 1, lens: 'ir', context: { kind: 'live' },
    when: F.R4_HUANG_ADMITS,
  },
  {
    // 旧照六：1997 年开通剪彩的街坊（H 表：回放、常光、maxDist 8、minZoom 1、时间窗 4–14）
    id: PT.OLD_6,
    subjects: [{ ref: GHOST.CROWD_1997 }],
    maxDist: 8, minZoom: 1, lens: 'normal',
    context: { kind: 'replay', segment: SEG.MID_1997, t: [4, 14] },
  },
];
