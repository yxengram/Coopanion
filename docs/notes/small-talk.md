# 主动闲聊：什么时候叫醒 bot，怎么限频

上游 issue #210 提的需求（上游没有实现）：用户在电脑前、却有一阵没和桌宠说话时，桌宠可以自己开口说一两句。这里记录本 fork 的做法。

## 开关与设置

`worlds.desktop-pet.smallTalk`（`packages/cortico-world-desktop-pet/src/config.ts`，都可热改，显示在「习惯」页的「主动闲聊」卡片）：

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | 默认关，用户自己打开 |
| `frequency` | `mid` | `low` / `mid` / `high`（少 / 中 / 多）= 两次尝试之间、离上次聊天至少 2 h / 1 h / 30 min（`SMALLTALK_GAP_MS`） |
| `quietFrom` / `quietTo` | `23:00` / `08:00` | 免打扰，本地时间，可跨午夜；两个时间相同表示不设 |

`pet_set` 改不了这几项；用户改了以后 `coopanion` World 会用 `[设置变化]` 告诉 bot（`core/notice.ts` 的 `WATCHED`）。

## 由 World 驱动的唤醒

desktop-pet World 每 30 秒看一次（`SMALLTALK_TICK_MS`，`DesktopPetWorld.lookForSmallTalk`）。所有门都放行时，用 `host.pushDeferred` 推一条 `desktop-pet.smalltalk`（`origin: internal`，`trigger: flush`）。正文在投递时才渲染（`smallTalkText`），例如：

```
[10-17 周六 15:00] [闲聊] 伙伴在电脑前,你们已经 75 分钟没说话了。现在是下午。伙伴上次说的是(80 分钟前):「明天要交报告」。
想的话可以主动搭一句:打个招呼、聊聊这个时间、接着之前的话题,或者温和地提醒一下(喝水、活动活动、该休息了)。一两句就好,别追问。
没什么想说的,或者觉得对方在忙,就什么也不做,不用回应这条。
```

刚回到电脑前的一次是「伙伴离开电脑大约 40 分钟,刚回来。」，提示里多一个「欢迎回来」。说不说由 bot 自己决定；两份环境提示词（`ENV_PROMPT.md`、`ENV_PROMPT_DECIDER.md`）的「收到的事件」里都写了 `[闲聊]`，而事件正文本身也说清了可以不回应，所以改过环境提示词的部署照样能用。这一行对没开主动闲聊的人也在（多几个 token），之前跑完的 `scratch/combo2/eval/run.ts` 记下的提示词源哈希因此对不上了，发版说明里要提一句。这条事件不进对话页（`chat.ts` 的 `CHAT_TYPES` 不含它）。

投递时再判断一次：用户在这期间说过话或互动过、等了超过 10 分钟（暂停、没有密钥时事件会被扣住）、或者开关已经关掉，就渲染成空，什么都不送。同一时间最多一条在等。

## 门（`src/smalltalk.ts` 的 `SmallTalk.decide`，按顺序）

1. 开关关着。
2. 没有在场信息（见下），或在场信息超过 2 分钟没更新。
3. 锁屏，或 5 分钟（`PRESENT_IDLE_S`）没有键盘鼠标输入：人不在，不对着空屋子说话。
4. 桌宠页面没连上或窗口被隐藏（菜单、托盘、全屏时自动隐藏）。
5. 有全屏窗口盖住桌宠所在的屏幕（只有 Windows 判得出：窗口进程不管「全屏时自动隐藏」开没开都把它报给页面，`pet:fullscreen`）。macOS 和 Linux 判不出别的程序全屏；看全屏视频时多半没有输入，会落到第 3 条。
6. 暂停（菜单的暂停，或没有密钥时 Core 扣住事件）。
7. `pet_quiet` 正生效。
8. 桌宠睡着了（页面报的姿势是 `sleep`）。
9. 免打扰时段。
10. 正忙：打字框开着、在听用户说话（按着说话键或有句子在识别）、有 `pet_ask` 没答（30 分钟内）、引导等对话框或确认气泡开着、用户的消息还没送到、正在走、bot 正在跑一轮。
11. 它给自己设的唤醒器（`alarm_set`）15 分钟内要到：到时它反正会说话（Core 借给 World 的 `nextAlarmAt`）。
12. 离上次尝试不够一个间隔。World 启动也算一次尝试，所以重启后不会马上开口。**投递出去就算一次，不管 bot 有没有说话**，所以 bot 拒绝了也不会每 30 秒被叫一次。
13. 刚回到电脑前（离开至少 15 分钟，`AWAY_IDLE_S`；锁屏或睡眠也要连同锁之前没动的时间一共够 15 分钟，短暂锁一下屏、合一下盖子不算，回来后 5 分钟内，`BACK_WINDOW_MS`），而回来以后还没聊过：这时不看第 14 条，算「回来」。
14. 离上次聊天不够一个间隔。「聊天」是用户打字、说话、回答、互动、换形象，以及 bot 跑过的任何一轮（唤醒器、应用通知叫醒它的那轮也算）。

## 在场信息

只有 Electron 进程拿得到系统空闲时间。`app/presence.cjs` 的 `startPresence`（`app/main.cjs` 启动它）每 30 秒用 `powerMonitor.getSystemIdleTime()` / `getSystemIdleState()` 读一次，锁屏、解锁、睡眠、唤醒时立刻读一次，以 `companion:presence { idleSec, locked }` 发给 Core 子进程；`core/companion.ts` 记下最后一次和收到的时刻，经 `desktopPetDefinition({ presence })` 借给 World。原始的空闲秒数和锁屏状态只留在本机，不进遥测；但每条 `[闲聊]` 事件会把大致情况写给模型（多久没碰键盘鼠标、离开了大约多久、多久没说话、现在是一天里的什么时候），和别的事件一样发给模型服务商。单独运行的桌宠（没有 Coopanion 应用）没有这个信息，主动闲聊就不会开始；「习惯」页会写明这一点（`pet.state` 的 `smallTalk.presence`：没借、或最后一次报告超过 2 分钟，都算没有）。

页面经 `focus { shown, fullscreen, typing }` 报给 World 窗口是否显示、是否有全屏窗口、打字框是否开着（`web/pet-app.js` 的 `reportFocus`，连上时和每次变化时发）。

## 测试

- `packages/cortico-world-desktop-pet/tests/smalltalk.test.ts`：每一道门、三档频率的间隔、拒绝也计数、启动算一次、离开和回来、免打扰跨午夜、事件文字。
- `packages/cortico-world-desktop-pet/tests/world-smalltalk.test.ts`：假定时器下 World 的整条路径：启动后等满一个间隔、一次只推一条、投递时渲染、期间用户说话就作废、页面报的隐藏 / 全屏 / 打字、离开和锁屏、暂停、`pet_quiet`、唤醒器快到、免打扰、没有在场信息或没有页面。
- `tests/pet-host-platform.test.js`：Windows 上不管设置开没开，全屏窗口的出现和消失都告诉页面，重新加载的页面也会再听到。
- `tests/presence.test.ts`：应用的 powerMonitor 报告（就绪、定时、锁屏 / 解锁 / 睡眠 / 唤醒，读不到时不发）、Core 对 `companion:presence` 的解析，以及经 `desktopPetDefinition({ presence })` 到 World 的整条路径（报告停了 2 分钟就当没有）。
- `tests/alarms.test.ts`（`nextAt`）、`tests/notice.test.ts`（设置变化的说法）。
