# 天亮了，叫我 · 槐安里·七月半

一款在浏览器里玩的 3D 都市志怪解谜游戏。

你是槐安里老小区门岗上那台看了二十二年大门的监控摄像头。拆迁前最后一个七月半的夜里，你借了老周的一块魂，长出了人的身子，脖子上却还是那颗摄像头。天亮以前，你要把回家的街坊一个个送走，最后把那一块魂还回去。

- 非战斗：探索、找线索、解谜、和人（或不是人）说话。
- 主角的头就是玩法：取景器能看见肉眼看不见的东西，快门能拍下证据，倒带能看见并拍下此地的过去，红外能照出冷热，还有录像机、监控台和镜子。
- 4 个区域：槐安里、三号楼（含 502）、老街长明照相馆、人民路地下通道鬼市。14 个谜题，一个主结局，一个隐藏结局“南柯”。
- 首次通关大约 40–55 分钟（估算，尚未用真人计时）。
- 零外部资源：模型全部程序化生成，贴图用 Canvas 画，声音用 WebAudio 实时合成。

## 运行

需要 Node.js 20.19+ 或 22.12+（Vite 8 的要求），以及支持 WebGL 2 的桌面浏览器（Chrome、Edge 或 Firefox），用键盘和鼠标操作。

```bash
npm install
npm run dev        # 打开终端里显示的地址（默认 http://localhost:5173）
```

或者构建后预览：

```bash
npm run build
npm run preview
```

第一次点击画面时会锁定鼠标并开启声音。进度会自动存到浏览器的 localStorage。

## 在线试玩

GitHub Pages：<https://evegoodevening.github.io/camera-man/>。首次启用时，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；推送到 `main` 后，`.github/workflows/pages.yml` 会安装锁定依赖、以 `/camera-man/` 为资源根路径构建，并部署 `dist/`。也可在 Actions 中手动运行。

存档保存在当前站点的浏览器 localStorage；换设备、浏览器或站点地址不会自动迁移。

## 操作

| 键 | 作用 |
|---|---|
| WASD / 鼠标 | 移动 / 转视角（Shift 快走） |
| E | 交互（交谈、查看、出示、使用） |
| 右键 | 进入 / 退出取景器（用“伙计”的眼睛看） |
| 左键 | 取景器里按快门拍照 |
| 滚轮 | 取景器里变焦（1×–6×） |
| Q | 取景器里切换常光 / 红外（拿到“火眼”之后） |
| R / F | 在残影旁倒带 / 回到现在（回放中：空格播放暂停，Z/C 前后 5 秒） |
| Tab | 相册与物品 |
| J | 巡夜本（线索、称呼） |
| H | 提示（分三级） |
| Esc | 暂停菜单、设置 |

录像机面板：空格播放 / 暂停，按住 Z/C 倒退 / 快进，逗号 / 句号逐秒，[ ] 跳索引点。监控台：1–5 切频道。完整按键表见 `docs/GDD.md` §10.1。

设置里可以调：
- 音量、画质、字幕字号
- 鼠标灵敏度、Y 轴反转、取景器“切换 / 按住”
- 颗粒与色差强度、减少闪光、色彩辅助
- 提示无冷却
- 镜面和照妖镜的实时 / 预制模式（机器吃力时用“预制”）

## 开发

| 命令 | 作用 |
|---|---|
| `npm run build` | 类型检查（`tsc --noEmit`）并构建到 `dist/` |
| `npm run check` | 静态检查：id 注册、区域之间不互相 import、禁用 API |
| `npm run smoke` | 冒烟测试：启动游戏，确认无报错且 WebGL 2 可用 |
| `npm run test:core` | 引擎自测（无头 Chromium） |
| `npm run test:walk` | 自动通关（GDD §11 的 58 步；另有 `--main`、`--reload`、`--yin --hints` 变体） |
| `npm run shots` | 各区域截图，并做亮度与性能预算验收 |

测试针对已构建的 `dist/`，请先运行 `npm run build`。测试用 Playwright 驱动无头 Chromium（SwiftShader 软件渲染），每个浏览器约占 3–4 GB 内存，`scripts/lib/browserSlots.mjs` 把同时运行的浏览器限制在 2 个以内。

代码结构：

```
src/core    主循环、区域加载、输入与模式栈、相机、碰撞、玩家
src/game    玩法系统：状态与存档、交互、拍照、倒带、录像机、监控台、镜子、对话、过场、提示……
src/ui      DOM 界面（HUD、取景器、相册、巡夜本、各面板、菜单）
src/fx      后期（监控画面质感、红外、CRT）、共享材质
src/rigs    主角与 NPC 的程序化模型
src/kit     程序化建造工具（建筑、门窗、灯、雨、文字贴图……）
src/audio   WebAudio 合成的音效、环境声与音乐
src/areas   各区域：r1 槐安里（含 finale/ 终章）、r2 三号楼、r2_502、r3 照相馆、r4 鬼市、dev 引擎沙盒
scripts     测试与工具脚本
docs        GDD.md（游戏设计）、ARCH.md（技术架构）、requests/（开发过程中的需求记录）
```

技术栈：three.js 0.186 + TypeScript 7 + Vite 8。开发约定与踩坑记录见 `AGENTS.md`。
