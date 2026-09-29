// owner: R1-finale
// 门岗残影点 rp.r1_booth 与片段 seg.booth_2023（GDD §13.6、P12 第 5 步）：
// 2023-08-30 03:12，老周扶着门框走出来，在门前站住、抬头冲门楣上的伙计说话（录像机录不下的声音），再回屋。
// 片段里老周的脸照例是一团雪花（character:'zhou' 的回放人影一律 faceMask，ARCH §6.9）。锁定直到 r1.tape_watched。

import type { ReplayPointDef, ReplaySegmentDef } from '../../../game/replay';
import type { V3 } from '../../../core/types';
import { F, GHOST, NPC, RP, SEG } from '../../../data/ids';
import { E } from '../../../game/effects';
import { R1 } from '../layout';
import { P12 } from './text';

const DOOR_IN: V3 = [-5.55, 0, 20.25];
const DOOR: V3 = [-5.02, 0, 20.3];
const FRONT: V3 = [R1.npcSpots.zhouDoor[0], 0, R1.npcSpots.zhouDoor[2]];
/** 抬头看门楣（CH1 支架）的朝向 */
const UP_YAW = 310;

export const REPLAY_POINTS: readonly ReplayPointDef[] = [
  { id: RP.R1_BOOTH, at: R1.replay.booth, segments: [SEG.BOOTH_2023] },
];

export const SEGMENTS: readonly ReplaySegmentDef[] = [
  {
    id: SEG.BOOTH_2023, point: RP.R1_BOOTH, order: 1, osd: '2023-08-30 03:12', dur: 24, loop: true,
    actors: [
      {
        id: GHOST.ZHOU_2023, rig: 'mannequin', character: 'zhou', characterOpts: { variant: 'cap', seed: 1960 },
        keys: [
          { t: 0, pos: DOOR_IN, yaw: 90, pose: 'walk' },
          { t: 2.5, pos: DOOR, yaw: 95, pose: 'stand' },          // 扶着门框
          { t: 4.5, pos: DOOR, yaw: 110, pose: 'stand' },
          { t: 7.5, pos: FRONT, yaw: 140, pose: 'walk' },
          { t: 8.5, pos: FRONT, yaw: 150, pose: 'stand' },        // 站住，低着头
          { t: 9.5, pos: FRONT, yaw: UP_YAW, pose: 'look_up' },   // 抬头冲上面说话
          { t: 19, pos: FRONT, yaw: UP_YAW, pose: 'look_up' },
          { t: 20, pos: FRONT, yaw: 250, pose: 'stand' },
          { t: 23, pos: DOOR, yaw: 280, pose: 'walk' },
          { t: 24, pos: DOOR_IN, yaw: 270, pose: 'walk' },
        ],
      },
    ],
    subs: [
      { t: 10.5, dur: 4, speaker: NPC.ZHOU, text: P12.voice[0] },
      { t: 15, dur: 4, speaker: NPC.ZHOU, text: P12.voice[1] },
    ],
    locked: `!${F.R1_TAPE_WATCHED}`,
    lockedText: P12.boothLocked,
    // 看完（播放头第一次越过终点，含 seek）：r1.heard_voice，旁白（GDD §8.9）
    onComplete: [E.flag(F.R1_HEARD_VOICE), E.say(P12.heardVoice)],
  },
];
