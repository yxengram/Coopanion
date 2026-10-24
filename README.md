<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner.svg" alt="Coopanion" width="806">
  </picture>
</p>

<p align="center">
  English ｜
  <a href="README_zh.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/yxengram/Coopanion/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/yxengram/Coopanion?color=00a870"></a>
  <a href="https://github.com/yxengram/Coopanion/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/yxengram/Coopanion/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10 / 11" src="https://img.shields.io/badge/Windows-10%20%2F%2011-1f6feb">
  <img alt="macOS 13+" src="https://img.shields.io/badge/macOS-13%2B-1f6feb">
  <img alt="Linux x64" src="https://img.shields.io/badge/Linux-x64-1f6feb">
  <a href="LICENSE"><img alt="AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-8b8b8f"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ｜
  <a href="#getting-started">Getting Started</a> ｜
  <a href="#everyday-use">Everyday Use</a> ｜
  <a href="#faq">FAQ</a> ｜
  <a href="https://github.com/yxengram/Coopanion/releases">Changelog</a> ｜
  <a href="docs/DEVELOPMENT.md">Development</a>
</p>

Coopanion is a desktop pet. **Coo** lives on the bottom edge of your screen: it chats with you in speech bubbles, listens when you talk, walks along the edge, and with your permission can use your computer. It runs on Windows, macOS and Linux.

The app is in Chinese and English. A new install starts in your system's language: Chinese on a Chinese system (Simplified or Traditional), English on any other. On a system that isn't Chinese, voice input also listens for the system's language (English, Japanese or Korean; other languages are detected automatically), and Coo calls you "Pal" until you give it a name. Installs from before keep Chinese, also when you had switched only the console to another language under Settings → Language: that choice used to change only how the console looked, so after the update the console shows Chinese again until you choose a language once more, which now switches the whole app. Switching between Chinese and another language also switches the name Coo calls you and the voice input language (with the conversion to Simplified Chinese) to the new language's, but only while they are still the defaults (「伙伴」 or "Pal", and the old language's speech settings); a name or speech setting you chose stays. A name you typed that happens to be 「伙伴」 or "Pal" counts as the default and changes too. To switch, use Language on the Habits page (Chinese or English), or Settings → Language in advanced mode, which lists nine more languages. With one of those, the pages that come from Cortico use their own translation, while Coopanion's own text (the guide, Coo's bubbles and menu, the tray, and the Start, Habits, Dress up, Voice input, Computer use and Chat pages) shows English, or Simplified Chinese for Traditional Chinese. A guide bubble that is open when you switch says the same step again in the new language, keeping what you typed or the card you picked. When the language isn't Chinese, Coo talks to you in it, whatever the model. The macOS permission prompts and the Windows one-line installer follow the system's language instead: Chinese on a Chinese system, English on any other.

![1790222143546](image/README/1790222143546.png)

## Features

- **Many model services**: DeepSeek, Qwen, Kimi, Zhipu GLM, Doubao, Baidu Qianfan, MiniMax, StepFun, OpenRouter, OpenAI, Anthropic, Gemini and xAI. Pick one and paste an API key. Or skip the key and sign in with a ChatGPT account to use your ChatGPT plan (testing).
- **Chat**: hold the talk key and speak, or type; Coo answers in a bubble. Speech is recognized on your machine with FunASR.
- **Memory**: Coo remembers what you talked about, and knows when you poke it or pat its head.
- **Computer use**: clicking buttons, typing, switching windows. Coo asks before it acts.
- **Six figures**: Coo, the **DeepSeek Whale**, a fully animated whale girl with eight vendor color schemes and two outfits (a maid dress and a winter outfit), **Claude-chan**, a front-facing chibi girl with long orange hair and a book, **GPT-chan**, a cool, quiet little white dragon girl with horns, wings and a tail, **Gemini-chan**, a lively cat girl with blue-violet hair, cat ears and a fluffy tail, or **Grok-chan**, a playful little vampire princess with long golden twin-tails, a small gear crown and little bat wings on her bows.
- **Dress up**: Coo's colors, hats, earrings, glasses and neckwear, plus its size and how often it walks. The DeepSeek Whale has two rows on the Dress up page: her colors and her outfit (the maid dress or the winter outfit). The winter outfit is a whale hood (a spout on top, a fin on each side), a fur-trimmed cape and a striped scarf, with pompoms on the hood ties and scarf ends that swing. Every hand gesture has its own winter drawing, with fluffy fur cuffs and little blue bows (a wave, a cheer, a heart, a clap, praying, a stretch, a cup, a book, a tray, her chin on her hand, a fist, a notebook, fingertips…), and so is every whole-body pose: kneeling (with her arms posed over the kneeling drawing), lying on her front (kicking her feet), her back for turning round and away, and curled up in a ball for a roll, each in all eight color schemes and with her live face when kneeling or lying. Claude-chan, GPT-chan, Gemini-chan and Grok-chan have an outfit row too: their classic clothes or a winter outfit. Claude-chan's is a cream wool dress with a fur-edged capelet, knit sleeves with fur cuffs, cream tights and fur-trimmed boots; GPT-chan's a quilted qipao-style padded dress with a fur collar and frog buttons, her wings and tail left free; Gemini-chan's a closed navy top, a little lilac scarf with white stars and navy tights; Grok-chan's a black velvet coat-dress with crimson fur on the collar, cuffs, hem and boots. Every hand gesture and whole-body pose of theirs (sitting, kneeling, with arms posed while kneeling, lying, the back, the roll) has its own winter drawing. Switching outfits is an instant cut, in whatever pose she is in.
- **Extensions**: install Worlds such as a QQ bot, a drawing room and small games from the Extensions page.

What changed in each version is in [Releases](https://github.com/yxengram/Coopanion/releases).

## Install

You need one of:

- Windows 10 / 11 (64-bit)
- macOS 13 or later (Apple silicon or Intel)
- A 64-bit Linux desktop (X11, or XWayland under Wayland)

You also need an API key from one model service. [DeepSeek](https://platform.deepseek.com/) is the default; it bills by usage (see [Cost and privacy](#cost-and-privacy)). Installing does not need administrator rights.

### Windows: installer

1. Open the [latest release](https://github.com/yxengram/Coopanion/releases/latest) and download `Coopanion-Setup-<version>.exe`.
2. Run it. The installer is not code-signed, so Windows may show "Windows protected your PC": click **More info** → **Run anyway**.
3. Pick a folder (default `C:\Users\<you>\Coopanion`) and install. Coopanion starts when done, and a desktop icon is added.

> [!NOTE]
> The program and all its data stay in the install folder, so it has no Start menu entry. Open it from the desktop icon. The one file outside it is a small note of where the data is (see [Data and uninstalling](#data-and-uninstalling)).
> It always installs for you alone, never for all users: Coopanion keeps its data beside the program, which a folder like Program Files does not allow. If it finds it cannot write its data folder, it says so and quits; run the installer again and pick a folder of your own.

### Windows: one command

Open PowerShell, paste this line and press Enter:

```powershell
irm https://raw.githubusercontent.com/yxengram/Coopanion/main/installer/install.ps1 | iex
```

It downloads the latest installer, runs it, and deletes the download afterwards.

### Windows: portable

To run Coopanion without installing it, from a removable drive, or as several pets at once, use the portable version:

1. Download `Coopanion-<version>-win-x64-portable.zip` from the [latest release](https://github.com/yxengram/Coopanion/releases/latest) and unpack it into any folder you can write to (not Program Files).
2. Run `Coopanion.exe` in that folder. Like the installer, it is not code-signed, so Windows may ask once more (**More info** → **Run anyway**).

The portable version keeps its data in the folder's `data` and writes nothing else to the system, apart from the login item when you turn on Start at login; it keeps no note of where its data is. A copy of the whole folder is another pet with its own memory and settings, and each copy has its own Start at login. Up to 5 can run at once (installed and portable together); one more says that the ports are all taken. Extensions installed in a portable copy are stored so that they still work after the folder is copied or moved. A ChatGPT plan sign-in does not move with it: in a copied, moved or upgraded folder, sign in to ChatGPT again (see [Using a ChatGPT plan](#using-a-chatgpt-plan-testing)).

The portable version does not update itself; the settings window shows a download link under the version when a new one is out. To upgrade, unpack the new version into a new folder and copy the old folder's `data` into it.

### macOS

1. Open the [latest release](https://github.com/yxengram/Coopanion/releases/latest). On Apple silicon download `Coopanion-<version>-mac-arm64.dmg`; on Intel download `…-mac-x64.dmg`.
   Not sure which you have: Apple menu → About This Mac. If "Chip" says Apple M-something, it is Apple silicon.
2. Open the dmg and drag Coopanion into Applications.
3. The app has no Apple developer signature, so macOS blocks the first open. Open it once and click Done on the warning, then go to System Settings → Privacy & Security, click **Open Anyway** at the bottom and confirm with your password. It opens normally after that.
4. Coopanion lives in the menu bar at the top of the screen. It shows in the Dock only while the settings window is open.

> [!NOTE]
> Data is in `~/Library/Application Support/Coopanion`. macOS asks separately for Microphone (voice input), Input Monitoring (talk key), and Screen & System Audio Recording plus Accessibility (computer use) the first time each is needed. To keep Coo off your computer, deny the last two. Restart Coopanion after changing Input Monitoring, Accessibility or Screen Recording.

### Linux

1. Open the [latest release](https://github.com/yxengram/Coopanion/releases/latest) and download `Coopanion-<version>-linux-x64.deb` (Debian / Ubuntu) or `Coopanion-<version>-linux-x64.AppImage` (other distributions).
2. deb: `sudo apt install ./Coopanion-<version>-linux-x64.deb`, then open Coopanion from the app menu.
   AppImage: `chmod +x Coopanion-*.AppImage` and run it. Ubuntu 22.04 and later need `libfuse2` first (`sudo apt install libfuse2t64`).
3. The pet is a transparent always-on-top window, so the desktop needs compositing (on by default in GNOME and KDE). Under Wayland it runs through XWayland.

> [!NOTE]
> Data is in `~/.config/Coopanion`. The tray icon needs status icon support (GNOME needs the AppIndicator extension); without a tray, right-click Coo to reach the settings.
> Computer use needs `xdotool` and `zenity`, which the deb installs. Screenshots under Wayland also need one of `grim`, `spectacle`, `scrot` or ImageMagick.

## Getting started

1. **Start**: Coo drops to the bottom of the screen and an icon appears in the tray (menu bar on Mac, status bar on Linux). No window opens.
2. **Guide**: on first start Coo walks you through setup in its bubbles; you pick or type the answers right there:
   1. what Coo should call you;
   2. a figure: Coo, the DeepSeek Whale, Claude-chan, GPT-chan, Gemini-chan or Grok-chan, each card with a small picture (new installs start as Coo, which stays if you skip or close the bubble; asked only in the first guide), then how much it walks around: stay put / now and then / often;
   3. which model service to use (DeepSeek, listed first, if unsure), then paste the API key and test the connection; for OpenAI, Coo asks once more: an API key, or sign in with a ChatGPT account (testing, see [Using a ChatGPT plan](#using-a-chatgpt-plan-testing));
   4. download the speech model (FunASR, about 230 MB, from ModelScope), then how to talk to Coo;
   5. where the buttons, menu and settings are, and that the persona is on the System prompt page of the settings window.

   After the guide you can talk Coo through its personality, way of speaking and what you call each other; it can write the persona into its prompt itself.

   The × at the top right of the bubble ends the guide at any time. Run it again from **Guide** on the Start page. If you chose to enter the key later, Coo asks again after a while.
3. **Say hello**: tap **Left Alt** (**Left Option** on Mac), then press and hold it, say "hello", and release to send. Allow microphone access when asked.

<details>
<summary><b>Getting an API key</b></summary>

For DeepSeek:

1. Open the [DeepSeek platform](https://platform.deepseek.com/api_keys), sign up and log in;
2. Top up your balance (billed by usage);
3. API Keys → Create API key, copy the string that starts with `sk-`, and paste it into Coo's bubble or the Start page.

For the others, select the service in the bubble or on the Start page and use its "get a key" link:

| Service                  | Get a key                                                                                          | Default model                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| DeepSeek                 | [platform.deepseek.com](https://platform.deepseek.com/api_keys)                                    | `deepseek-flash`                                                           |
| Qwen (Alibaba Bailian)   | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key) | `qwen3.8-flash`                                                            |
| Kimi (Moonshot)          | [platform.kimi.com](https://platform.kimi.com/console/api-keys)                                    | `kimi-k3`                                                                  |
| Zhipu GLM                | [bigmodel.cn](https://bigmodel.cn/usercenter/proj-mgmt/apikeys)                                    | `glm-5.3-flash` (switch to `glm-5.3` if it fails to connect)               |
| Doubao (Volcengine Ark)  | [ark.volcengine.com](https://ark.volcengine.com/region:cn-beijing/apikey)                          | `doubao-seed-2-1-lite-260915` (enable it in the Ark console first)         |
| Baidu Qianfan            | [console.bce.baidu.com](https://console.bce.baidu.com/iam/#/iam/apikey/list)                       | `glm-5.1` (Qianfan's Responses API has no ERNIE and no vision model)       |
| MiniMax                  | [platform.minimax.cn](https://platform.minimax.cn/user-center/basic-information/interface-key)     | `MiniMax-M3`                                                               |
| StepFun                  | [platform.stepfun.com](https://platform.stepfun.com/interface-key)                                 | `step-3.7-flash`                                                           |
| OpenRouter               | [openrouter.ai](https://openrouter.ai/settings/keys)                                               | `deepseek/deepseek-v4.1-flash`                                             |
| OpenAI                   | [platform.openai.com](https://platform.openai.com/settings/organization/api-keys)                  | `gpt-6-luna`                                                               |
| Anthropic                | [platform.claude.com](https://platform.claude.com/settings/keys)                                   | `claude-haiku-5-5` (over the Messages API, not an OpenAI-compatible one)   |
| Gemini (Google AI Studio) | [aistudio.google.com](https://aistudio.google.com/apikey)                                          | `gemini-3.5-flash-lite` (over the Gemini API, not an OpenAI-compatible one) |
| xAI                      | [console.x.ai](https://console.x.ai/team/default/api-keys)                                         | `grok-4.3`                                                                 |

OpenAI, Anthropic, Gemini and xAI usually need a proxy from mainland China, and some of them do not serve it at all; see "I need a proxy" below.

Each default is the cheap, vision-capable tier of that vendor. To use another model, change the name in the guide or in the Model field on the Start page.

Services other than DeepSeek follow their documentation and have not each been tested with a real key. If one fails, please open an issue.

</details>

## Everyday use

### Talking to Coo

| How           | What to do                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Voice         | **Tap Left Alt, then press and hold it** (Left Option on Mac) and speak; releasing ends the sentence. Recognized text shows in a grey bubble above Coo; click **Cancel** in it to drop the sentence. |
| Typing        | Rest the pointer on Coo and click the bubble button beside it. With "Double-click Coo to open the typing box" on in Habits, double-clicking works too. The box grows with the text up to six lines; Enter sends, Shift+Enter starts a new line, and Enter that confirms an input method's candidate sends nothing. |
| Mic button    | Appears when the pointer rests on Coo and turns voice input on or off. Its corner shows the talk key (`ALT×2` by default) while listening on the key, AUTO while always listening. Long-press it while listening to send the sentence at once. |
| Answering     | When Coo offers choices, click one or press 1–3; if none fits, write your own in the last box.                                         |

What you type, say or send from the Chat page stacks above Coo in grey bubbles, the newest at the bottom (over Coo's own bubble while Coo speaks): a microphone marks speech, two arrows a message from the Chat page (with the number of images it carries). The bubbles fade a second after Coo's reply closes, or 8 seconds after you said them when Coo does not reply (while Coo is still thinking they stay); at most 3 stay, 6 lines in all, and past that the oldest fades first. Click a bubble to close it. With **Show what you said above Coo** off on the Habits page they are not kept, and speech shows only while it is being recognized. The size of all bubbles and of their text is set under **Bubble size** and **Text size** on the Habits page (80%–160%), and how fast Coo's bubbles type out and how long they stay under **Bubble speed** (50%–200%; a setting for you only, Coo cannot change it).

With **Read bubbles aloud** on under Speech on the Habits page (off by default), Coo reads each bubble out as it types, one short syllable at a time in the manner of Animal Crossing's villagers, in place of the typing babble, whichever figure is on screen. Chinese is read by its pinyin, English by a pronouncing dictionary, and a sentence with kana as Japanese (kanji by a reading dictionary); digits are read as their Chinese names. Pitch (low, medium, high: 300, 400, 500 Hz, or custom 200–700 Hz) and speed (at most 10, 13 or 16 syllables a second, or custom 6–20) are picked there; when the voice is slower than the text it finishes after the text, and while it is on, bubbles pause longer at the end of a sentence and letters type faster, so the voice keeps up. It follows the sound switches: silent with sounds off, with the Talking kind off, or while Coo is hidden.

A web address Coo writes out in full (`http://` or `https://`) becomes a link once it has typed out, in the bubble and on the Chat page; it opens in your browser. A bubble with a link stays up while the pointer is on it.

Talk key, microphone and listening mode (hold to talk / press to toggle / always listen) are on the Voice input page. Click the talk key button and press a single key, a combination such as `Ctrl + Space`, or a mouse side button; beside it, choose **Double-tap, then hold** (the default) or **Just hold**. When the talk key is unavailable (on a Mac, usually because Input Monitoring is not allowed), speech is not recognized; the guide and the Voice input page say why. If a headset, such as a Bluetooth one, switches to call mode and plays no sound while the microphone is open, turn on **Mic only while held** on the Voice input page (hold mode only): the microphone then opens when you press the talk key and closes half a second after you let go, so wait a moment after pressing before you speak.

Speech is recognized on your machine by **FunASR** (the SenseVoiceSmall model) and audio is never uploaded. The model is about 230 MB and is downloaded once, from the guide or the Voice input page. On Windows you can use the built-in recognizer instead, which needs no download but is less accurate.

Turning voice input off also unloads the recognition model, or ends the Windows recognition helper, and greys out **Start** on the Voice input page; turning it on loads the engine again.

Coo reads the time and sets its reminders in your computer's time zone (earlier versions always used Beijing time; reminders already set keep their moment). To use another zone, write `"timezone": "Asia/Shanghai"` (or any IANA zone) into `home/companion/config.json` in the data directory and restart Coopanion.

### Playing with Coo

- **Click** to poke it, **move back and forth over its head** to pat it, **press and drag** to pick it up; let go mid-swing to throw it. A poke makes Coo respond. Pats and pick-ups are passed on the next time it wakes. To have every touch wake it, set the desktop pet World's touch wake option to `all` in advanced mode.
- **Expressions and motions**: Coo pairs what it says with a face and a motion, and the DeepSeek Whale knows the same words and eighteen more (Claude-chan, GPT-chan, Gemini-chan and Grok-chan all of them but spout, and seventeen more; GPT-chan also wags her tail and beats her wings, Gemini-chan also wags her tail and has three words for her ears, Grok-chan also beats her little wings). Faces: happy, wink, love, shy (ducks away, then sneaks a peek), surprised, angry, sad (looks at the floor), sleepy, thinking, smug, pout, worried, determined, flustered, scared, excited (starry eyes), crying, confused, disgusted, nervous, gentle, awkward (a strained smile), giggle, moved (happy tears), petrify (turned to stone, cracking), coax (sweet-talking, with a cat's ω mouth), tongue (a cheeky wink with the tip of her tongue out), eye-roll (eyes rolled up under flat lids, only the whites showing), shocked (white eyes with pinpoint pupils, a 「!」 and three gloom lines, frozen stiff and trembling; stronger than surprised), dead-fish eyes (flat lids over a dull, blank stare held on you), drooling (dreamy half-shut eyes and a drop of drool at the corner of the mouth; the whale and the four girls draw their own eyes for the first three and their own drooling mouth, Coo draws them with its ring eyes; each of the four has a sound of its own: a dry "tsk" and a sulky rising "ugh", a sharp stop and a trembling note, a flat "hm", a slurp and a drip), and 30 faces that put the eyes of one face with the mouth of another: smirk, sly, blissful, lol, laughing till she cries, bashful, smitten, heart-fluttering, wow, crave, dreamy, eager, innocent, huff, frantic, crying with rage, sulk, whimper, a brave smile, comfort (open eyes on you, brows drawn up a little, a soft smile and a slow nod; gentle is her own soft smile), pained, doubtful, blank and meh, and six with a mark of their own by the head: fuming (steam puffing off both sides of the head), heartbroken (a heart that cracks and falls apart in two), celebrate (a handful of confetti thrown up), gloomy (a little rain cloud), speechless (「……」 a dot at a time) and seeing stars (little stars circling her head). Motions include nod, shake, look around, turn, spin, jump, cheer, heart hands, sit, lie down (on her front, chin on her hands, kicking her feet now and then; she can doze off like that too), sleep, wave, bow, shiver, flap, dance, flinch, peek, turn away (her back to you in a huff for a few seconds; Coo just hides her face), roll (a forward roll and back on her feet), sip, read, spout (a whale's spout of water from the top of the head), sigh, tilt (a curious tilt of the head to one side, held a moment), and for the whale and the four girls: droop (the head dropped, looking down, held a moment), three quick blinks, lean in toward you, lean back (a laugh, or taken aback), sway from side to side and stamp a foot, a wag of the tail (the whale, GPT-chan and Gemini-chan; a fast, wide wag past any mood's, then the tail goes back to the mood's own; GPT-chan's and Gemini-chan's tails move in their seated, kneeling and lying drawings too; seated, GPT-chan's coiled tail rocks on the floor and Gemini-chan lifts the end of hers), beating the wings (GPT-chan and Grok-chan; she stays where she is, unlike flap), flicking the ears, pricking them up tall and laying them down flat (Gemini-chan), pray (hands pressed together), scratch (a sheepish scratch at the head), idea (a bulb lights up), hands on hips, hug, song, serve tea, salute, V sign, point, giggle behind her hand, arms crossed, stretch, curtsy, mulling it over with her hand at her chin, a fist raised to cheer you on, jotting in a notebook and fingertips pressed together bashfully (the whale and the four girls; the girls' thinking, excited, listening and shy faces already had these arms, now words of their own that go with any face, and the whale has them drawn too, kneeling and seated as well), and for the whale and the four girls clap (two drawings of her hands, together and apart, cut between for four claps), shrug (palms up), holding her head in both hands, raising a hand high, a thumbs up, shush (a finger to her lips) and wiping the sweat from her brow (each with a face of its own, and done kneeling too), kneel (seiza, kept through faces, nods, shakes, sighs, tilts, drooping the head, blinking and the moves of a tail, ears or wings; the DeepSeek Whale and the four girls also wave, make a heart, do the other hands-only gestures and sing while kneeling (the whale also leans in, leans back and sways kneeling), and only a gesture that needs them standing or seated still (cheer, bow, turn and the like) or a whole-body motion gets them up, while Coo sits up for an arm gesture too). That is 107 words for Coo, 125 for the whale, 123 for Claude-chan, 125 for GPT-chan, 127 for Gemini-chan and 124 for Grok-chan, and many of them also go by a few common Chinese alternatives (挥手 for wave, 眯眼笑 for happy, 微笑 for gentle, 没事的 for comfort, 汗颜 for awkward, 好奇 for tilt, 连连点头 for nod, 使劲摇头 for shake; for the whale and the four girls 握拳 is the fist, for Coo determined). Words joined with + happen at once, such as sit+happy+wave or nod+wave, with at most one face, one head move, one arm gesture and one posture or move in a group (a tail, ears and wings count as parts of their own, so a wag goes with a nod and a wave); words that need the same part are done one after another, except that two faces in one group that go together on the figure, such as happy+surprised, show as one face, the eyes of one with the mouth of the other (a pair that already is one of the faces above shows as that face, smug+happy as smirk); the four girls know 136 such pairs, the whale 122 and Coo 24, and other faces in one group are still done one after another. A face asked for lasts through the motions that follow (petrify excepted), and in a group at least until the group's gestures end, and a nod, shake, sigh or tilt plays alongside an arm gesture. As the DeepSeek Whale, a nod really dips the head and a shake turns the face, a wave raises the arm nearer you and waves an open hand, a cheer throws both hands up beside her head, a heart is made with both hands in front of her chest, a sip comes from a steaming cup held in both hands, reading she holds a book open and looks down at it, a roll curls her into a ball, she presses her hands together to plead, scratches her head, raises a finger for an idea, puts her hands on her hips and opens her arms for a hug, coaxing she rocks side to side with a cat's mouth, singing she shuts her eyes while rings of sound spread out and her fins beat time, she offers you a steaming cup of tea on a tray, snaps a salute to her brow and makes a V sign beside her cheek, points ahead, giggles behind her hand, folds her arms, stretches with her hands clasped above her head and curtsies holding out her skirt, kneels in a drawing of her own (for an arm gesture while kneeling, her live upper body over the drawing's skirt and legs; the four girls too), has a mouth of her own drawn for shocked (a tall gasp), smug (a lopsided smirk), giggle (a toothy grin), crying (a wide wail), scared, determined and flustered, and eyes of her own for determined and crying, changes the shape of her mouth from one character to the next as she talks, and kneeling or lying down her eyes and mouth are as live as standing (every expression's eyes and mouth, blinks and talking mouths; the brows are the drawing's own, so worried and determined, which she shows mostly with her brows, look nearly plain there), a bow or a peek tips the upper body forward, turning round or spinning shows her back halfway, turning away (standing) shows her back for a few seconds while seated she only looks away, her hair, skirt and tail swing when she dances, thinking, she rests her chin on her hand, and other faces pose her arms too (hands on her hips when determined or angry, a fist up when excited, fingertips together when shy or flustered, a hand at her head when awkward, arms crossed when pouting or disgusted, hands pressed together when pleading or singing, jotting in her notebook when listening; standing, seated and kneeling, though not singing or listening while kneeling, and an arm gesture of her own takes over while it plays), and lying down switches to a drawing of her own that blinks, nods, kicks her feet and wags her tail. The four girls' faces are as live kneeling and lying down as standing too (every expression and two-face mix, blinks and talking mouths, drawn onto the kneeling and lying drawings; the brows stay the drawing's own). As Claude-chan, she holds her book in both hands, sits hugging it on her spread skirt, bends right over with her head down to bow, lies on her front reading it with her feet kicking in the air, puts it aside to kneel, curls into a ball to roll, and shows her back when she turns round or turns away. As GPT-chan, her arms simply hang while she stands, her pale lavender dragon wings spread when she is glad, flap in bursts when she is excited and fold in when she is low or asleep, and her scaled tail swishes lazily, wags when she is happy, curls up when she is excited and droops when she is sad; she sits on her spread skirt with her tail curled in front of her, lies on her front reading a book, kneels, curls into a ball to roll, and shows her back when she turns round or turns away. As Gemini-chan, her cat ears stand up when she is glad or listening, lie flat out to the sides when she is low, scared or cross, droop when she is sleepy, flick now and then on their own and twitch when something happens to her, and her fluffy tail swishes in a slow S at rest, wags fast when she is happy, puffs up when she is startled and droops when she is sad; she sits on the floor with her tail curled round, lies on her front, kneels, curls into a ball to roll, and shows her back when she turns round or turns away. As Grok-chan, the little bat wings behind her bows lift and spread when she is glad, startled or listening, fold flat back when she is scared or cross, droop when she is sad or sleepy, flutter now and then on their own and twitch when something happens to her, and her long golden twin-tails sway slowly at rest, swing livelier when she is happy, fly out when she spins and draw in close when she is low; she sits on her spread skirt, lies on her front reading a book, kneels, curls into a ball to roll, and shows her back when she turns round or turns away.
- **Expression decisions (off by default; needs an OpenRouter key)**: once you switch on Expression decisions on the Habits page, with OpenRouter connected on the Start page or an OpenRouter key typed into that card, Coo no longer picks its faces and motions from a list of over a hundred words itself. With each line it says it writes only how it feels or what it is thinking (any way it likes; you never see it), and a decision model on OpenRouter (by default `typesafe/jev-1.14`, about 0.5 s and about $0.0003 a time; `perplexity/pplx-decider-v1.2` takes about 0.8 s for about $0.0001) reads that line and the moment (what Coo is saying, what you just said, its posture and place, what it did lately) and picks one face, one head move, one arm gesture and one posture or whole-body move (and a move of the tail, ears or wings where the figure has them), done together as one group; most of the time only one or two parts move (a tail, ears or wings move besides them), and none when nothing fits. Sitting, kneeling, lying down and sleeping are picked the same way; when Coo only wants to change posture without saying anything (going to sleep, lying down), the posture comes first and is not crowded out by a face or gesture picked with it. Coo decides its walks itself, left or right by so many pixels, or over to your mouse pointer (stopping beside it) or away from it: it always knows where it stands on the screen, which way it faces and whether it is standing or sitting, a walk stops at the screen's edge and says where, and a walk to or from the pointer says where the pointer was (with the switch off Coo can walk to or away from the pointer too). The word list leaves the prompt (it is about half as long), new faces and motions need no prompt change, and a third-party figure's own words just work. Coo does not wait for the decision model to speak: the bubble goes up at once and the face and motion follow as soon as they are picked. The card lets you pick the decision model from those OpenRouter offers now (with the price per million input tokens and the context length; models whose context cannot take a request are left out, and only the models we know are listed when OpenRouter cannot be reached), or type an id. When OpenRouter says it no longer has the model you picked, that line is asked of the default once more, the default is used for the rest of the run, and the card says so (and says it too if the default itself is gone, when lines get only the faces their feelings name, as below); a saved setting that still names the default up to v0.10.0, `perplexity/pplx-decider-v1.1-27b`, which OpenRouter removed, becomes the new default when the app starts, and a model you typed yourself stays. When a decision fails or times out, that line gets at most a face and a head move its feeling names outright (a feeling that says 开心 gets the happy face, one that says 不开心 does not), or a nod when the feeling clearly agrees, or nothing, never a posture or gesture, and the next line goes on as usual; without a key, or with the switch off, Coo writes its own faces and motions as before. The key stays where the OpenRouter endpoint already keeps its key, is written nowhere else, and the chat model you use does not change. Note that while it is on, every line sends OpenRouter (and the decision model's provider behind it) what Coo is saying, the feeling it wrote, the last thing you said, its posture and place and the time; it is off by default, nothing is sent until you switch it on, and saving a key does not switch it on.
- **Right-click** for the menu: pause / resume, settings, quit, plus typing, voice input, walking, night mode, sounds, dress up and hide. While hidden (by hand or during full screen) it makes no sound; shown again, a built-in figure is already in the posture it reached meanwhile (lying, kneeling, seated or asleep) instead of going through the change then.
- **Hover buttons**: the buttons beside Coo while the pointer rests on it. Typing and voice by default; pick up to six in Habits.
- **Remember where Coo stands**: turn it on in Habits and Coo returns to the same spot across the screen on the next start.
- **Small talk (off by default)**: switch on "Let Coo start a chat now and then" on the Habits page and, when you are at the computer but haven't talked to Coo for a while, or have just come back after being away, Coo may say a line or two on its own: a hello, something about the time of day, a follow-up on what you said earlier, a nudge to drink water or take a break. It may also decide it has nothing to say and stay quiet; either way it counts. How often: rarely / sometimes / often, at least 2 hours / 1 hour / 30 minutes apart and since you last talked (a hello when you come back skips the second rule). Never while Coo is hidden, paused, keeping quiet or asleep, while a window is full screen (Windows), while you are typing to it or a question is waiting, shortly before a reminder it set for itself, or in quiet hours (23:00–08:00 unless you change them). Whether you are at the computer comes from the system's idle time and screen lock (no input for 5 minutes is away; 15 minutes without input, a lock or sleep included, counts as having left, so locking the screen for a moment does not). The raw idle time and lock state stay on the computer, but each small-talk event tells the model roughly how long you have been idle or away, how long since you last talked and the time of day. Each attempt is one model call, even one where Coo stays quiet.
- **Several displays**: Coo starts on the main display. Carry it to another display and let go to move it there. If that display is unplugged, Coo returns to the main one.

### Letting Coo use your computer

Computer use is on by default, but each turn Coo asks before it first looks at the screen or uses the mouse and keyboard. It acts only after you say yes.

- Loosen this under **When to ask you** on the Computer use page, from strictest to loosest:
  - `ask-each-turn`: ask every turn (default);
  - `ask-before-acting`: looking is not asked; ask every turn before using the mouse and keyboard;
  - `ask-once`: looking is not asked; ask once before acting, then not again for the time set in **A yes lasts** (30 minutes by default);
  - `never-ask`: never ask.
- When you touch the mouse or keyboard, Coo stops and waits for you.
- Logins, passwords and payments are left to you.
- One wake makes at most 40 model requests; at the limit the turn ends and you can tell Coo to continue. The limit is on the Cormini page in advanced mode and applies after a restart.

To keep Coo off your computer, untick **Let Coo use this computer** on the Computer use page. Ticking it again the first time asks first: a dialog says what computer use risks (screenshots go to your model service, Coo can click or type wrong, keep payments and passwords to yourself), and computer use turns on only after **Turn on**. Computer use is on from the start, so when you open the Computer use page while it is on, the same notice shows, with **Keep it on** and **Turn it off**, until you pick one (Esc or closing it leaves computer use on and shows the notice again next time; turning it off this way asks again the next time you turn it on). Once confirmed, the settings window does not ask again; the power button on the Computer use card of the World page in advanced mode asks the same until then.

If saving a computer-use change fails, the page says so and shows the settings as Coo runs with them then. (The settings API applies a change before writing `config.json`, so after a failed write Coo may run the new value until the app restarts.)

### Tray / menu bar

Coopanion keeps running in the background. Closing the settings window does not quit it, and opening the program again only brings Coo back.

The tray icon (menu bar on Mac, status bar on Linux) has a menu to open the settings, show the pet, start at login, restart and quit. On Windows, left-clicking the icon opens the settings.

Restart and quit give Core 12 seconds to stop, then force it to end and wait up to 5 more seconds for it to exit. The final statistics upload waits at most 5 seconds. If saving a data-folder choice fails, the app shows the filesystem error and exits. Restarting for an update from Coo's bubble quits normally first: Core stops and the tray icon goes away, then the update installs and the new version starts.

## Settings window

Click the tray icon, or right-click Coo and click the gear. The window opens in **normal mode**, which shows only the pages about the pet:

| Page          | What is there                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Start         | Connect a model, see whether Coo is awake, show the pet, rerun the guide. Pause / resume is at the bottom left.   |
| Habits        | What to call you, Coo's name, walking, colors, size, bubble size, text size, bubble speed, remembering the position, hover buttons, double-click typing, showing what you said above Coo, sounds (each kind can be muted), speech (bubbles read out syllable by syllable in place of the typing babble; pitch and speed by step or custom), 60 fps lock, hiding during full screen (Windows), letting Coo change settings, small talk (how often, quiet hours), anonymous usage statistics |
| Dress up      | Figure (Coo, the DeepSeek Whale, Claude-chan, GPT-chan, Gemini-chan, Grok-chan or an installed figure pack), colors, outfits (the DeepSeek Whale and the four girls) and accessories; changes apply at once, and the picked cards, step dots and buttons in Coo's bubble take the figure's color too (the DeepSeek Whale's follows her color scheme, each of the four girls has her own, the same as the settings window's accent); **Import** at the end of the figure row installs a figure pack: pick its zip or folder, or drop it on the page, and the folders with a figure.json up to 3 levels down are listed with picture, version, author and credits; the ticked ones go into `figures/` in the data folder (replacing an installed pack with the same id asks first and lists the packs it would replace; the older version is replaced only once the new one is copied in; a folder of that name holding another pack is left alone; built-in ids and their exported copies are refused). An imported pack can be uninstalled: hover its card, click the trash button in its corner and confirm; the whole pack is deleted, and if the pet was wearing it, it changes back to Coo. Parts of a pack this version does not know (a new kind of expression, motion or sound, an audio format it cannot play) are skipped and the pack still loads; if the figure changes while running, expressions and motions follow the new figure's words right away (with Expression decisions off, Coo is also told which words it lost or gained) |
| Voice input   | On/off, recognizer, model download, talk key, microphone, listening mode, opening the microphone only while the talk key is held |
| Computer use  | On/off, mouse and keyboard permission, when to ask you, how long a yes lasts                                      |
| System prompt | Coo's system prompt; the persona is the CONSTITUTION section. Edit the sections in place (with undo), save with Ctrl+S and apply with **Reload system prefix**; **Clear and restart** drops the current conversation; the whole prompt as sent is previewed at the bottom |
| Usage & cost  | Tokens used and money spent: an overview, a Token activity grid (one cell per day, with about a year before the range shown faded for comparison), and usage over time (with Auto granularity, the one in use is named next to it; split by type, purpose or model) |
| Chat          | The current conversation; you can also talk to Coo from here. Web addresses in Coo's words are links. The ring in the input box is the context in use: it is full where the earlier conversation is tidied up (the handoff), and spins while that happens; hover it for the token count, the limit and when it last happened. Text you typed and did not send is still there when you come back to the page or reopen the window (attached images are not kept) |

**Coo's name** on the Habits page renames Coo: the sidebar, the Start page's heading, the pet's menu, the Chat page and the permission question in the bubble follow at once, without a restart; cleared, the name is Coo again. Renaming in the sidebar itself writes the same name. Coo's persona (the CONSTITUTION section) still introduces itself as Coo, so tell Coo about the new name or edit the system prompt too.

The current version is shown at the top left. The Windows installed build and the AppImage download new versions in the background and show how far they got below the version (downloading in the background, downloaded and installing when you quit); Coo then asks in its bubble whether to restart and update, or the update installs the next time you quit. On Windows an update always goes into the folder of the copy that is running, so the data beside it stays with it. While it downloads, the bubble no longer sends you to download by hand: its second button reads **Having trouble?** and shows **Download from GitHub** only while you point at it; only a failed download links to GitHub outright, below the version and in the bubble. On Mac, with the deb and with the Windows portable version, download new versions by hand: a download link appears below the version when a newer release is out. After an update, Coo tells you what the new version brings; when you change what it calls you, its dress, walking, computer use or similar settings here, it hears about it and responds.

**Advanced mode** at the bottom left shows every page (Worlds, models, extensions, memory, diagnostics); **Back to normal mode** hides them again.

### Changing the model

Under **Connect a model** on the Start page, pick a service, fill in the model name (a default is filled in) and the key. Each service keeps its own key, so switching back needs no re-entry.

The default is DeepSeek's `deepseek-flash`. Computer use needs a model that can read images; every service's default can, except Qianfan's. The Model page in advanced mode also lets you:

- change the model and the reasoning effort;
- add an "OpenAI Responses Compatible" connection for any other service that speaks the Responses API;
- enter prices for services without built-in ones (all but DeepSeek, OpenAI, Anthropic, Gemini and xAI) so Usage & cost can show spending.

### Using a ChatGPT plan (testing)

With a ChatGPT plan you can skip the API key and sign in with your ChatGPT account (OpenAI's "Sign in with ChatGPT"); requests count toward that account's plan. This is ported from upstream Coopanion and **still in testing**: neither upstream nor this fork has tried it end to end with a real plan account yet. If it fails, please open an issue.

- **Where to sign in**: on the Start page, under **Connect a model**, the ChatGPT card next to OpenAI's. Picking it hides the model and key boxes; click **Continue with ChatGPT**, sign in and allow access in your browser, and the app is connected when you come back (if the plan does not list the connection's model, it switches to the first model the plan lists). In the guide, and in the bubble where Coo asks for a key, pick OpenAI and then **Continue with ChatGPT**; while the browser is out the bubble shows a progress bar, and closing it stops waiting. In advanced mode, a ChatGPT connection's editor on the Model page has a **ChatGPT account** section to sign in and out.
- **Signing out**: while ChatGPT is connected, the Start page's line has **Sign out**, which removes the sign-in from this computer and asks OpenAI to revoke it. Sign out before deleting the connection: deleting it on the Model page does not tell OpenAI.
- **Quota**: usage shares the plan's quota with ChatGPT and Codex. At the limit Coo reports no error; it tries again every 5 minutes and notes it in the log. The Start page's **Test** reports the 429 directly.
- **Where the sign-in is kept**: the tokens are stored on this computer in the connection's `.env` (`home/providers/chatgpt/.env` in the data folder, next to the other services' API keys) and are only sent to `https://api.openai.com/v1`. The tokens record which folder they were written for: a connection copied or renamed on the Model page, or a whole data folder copied or moved (including the copy made when upgrading), does not take the sign-in along and has to sign in again. A copied connection gets no `.env` at all; in a renamed connection or a copied data folder the tokens are removed from the file the first time they are read. So two places never share one set of rotating tokens.

### Installing extensions

The Extensions page in advanced mode lists Worlds on npm with the `cortico-world` keyword, for example:

- QQ bot (`cortico-world-qq-better`)
- Drawing room and Pictionary (`cortico-world-canvas`)
- Plants vs. Zombies (`cortico-world-pvz`)
- Slay the Spire (`cortico-world-sts-1`)

Packages in the official index ([Pal-AI-Lab/cortico-extensions](https://github.com/Pal-AI-Lab/cortico-extensions)) also show tags, badges, votes, comments and downloads; filter by tag, or sort by rating or downloads. Voting and commenting need a GitHub sign-in with a one-time code; the sign-in is kept in the extensions folder.

For your own extension, use **Choose folder** under **From a local directory** and pick the folder that holds its package.json. Market cards show about how many tokens an extension's prefix and tool definitions take. After installing, click **Restart process** and enable it in **World Overview**. Reinstalling the app keeps your extensions. If npm is slow or blocked where you are, open **npm registry** under the search box in the **Extension market** section (next to **Advanced search**) and enter a mirror; updates, search and installs use it right away, and saving it empty restores the default.

## Cost and privacy

- **Cost**: Coopanion is free. The model service you choose bills you for usage; see the Usage & cost page (built-in prices exist for DeepSeek, OpenAI, Anthropic, Gemini and xAI). Signed in with a ChatGPT plan, requests count toward the plan instead.
- **Sent to the model service**: what you say and type, your interactions with Coo, and screenshots during computer use. Only the service you configured receives them.
- **Kept on your machine**: API keys, ChatGPT sign-in tokens, memory, conversation history, settings and logs. Speech is recognized locally and only the text is sent.
- **Model service addresses**: a Coo connection to a remote address must use https, since over http the API key and the conversation would travel in plain text. Plain http is accepted only for this computer and the local network (for example `http://localhost:11434`, `http://192.168.1.20:8000`, a `.local` name or a Tailscale address); saving any other http address is refused, and a connection saved with one before this rule stays listed but each request fails before anything is sent. A chat request, or any request to Anthropic or Gemini, that the service redirects elsewhere fails, so the key never follows the redirect; for the other services' model lists, the key is not carried to another site either.
- **Local pet service**: browser writes and WebSocket connections are accepted only from the pet service's own address, port included, so a page on another local port cannot change the pet's look or install figure packs. The desktop window proves itself with a random credential its process gets at startup. A figure pack's own web pages, opened on their own, run sandboxed with no network.
- **Settings window**: its pages run only scripts served by Coopanion's own Core. A link opens as a window of the app only for the settings themselves and the pet's pages; any other http or https link opens in your browser, and links of other kinds (`file:` and the like) are ignored. The window does not navigate away from the settings.
- **Usage statistics**: none. This build sends no usage statistics and keeps no install ID.
- **Other network access**: a check for new releases on GitHub when the settings window opens; npm and the official extension index on GitHub on the Extensions page, and GitHub for votes and comments; ModelScope (or Hugging Face as a fallback) when downloading the speech model; `auth.openai.com` when signing in with a ChatGPT account (the sign-in page in your browser, getting and refreshing the tokens, revoking them on sign-out).

## Data and uninstalling

| System  | Data folder                               | Uninstall                                                   |
| ------- | ----------------------------------------- | ----------------------------------------------------------- |
| Windows | `data` inside the install folder; for the portable version, inside its folder | Settings → Apps; for the portable version, turn off Start at login, then delete the folder |
| macOS   | `~/Library/Application Support/Coopanion` | Drag Coopanion from Applications to the Trash               |
| Linux   | `~/.config/Coopanion`                     | deb: `sudo apt remove coopanion`; AppImage: delete the file |

Uninstalling keeps the data, so memory and settings are still there after a reinstall. To remove everything, delete the data folder by hand (on Windows, the whole install folder).

On Windows, when the installed program has moved (for example reinstalled into another folder) and finds no data beside it, Coopanion asks at start whether to inherit the data used before or start a new one; the data from before is never moved or deleted. When that data is gone too (an unplugged drive, a moved folder), it offers Retry, Choose folder, Start a new one or Quit. Where the data used before is, is noted in `%LOCALAPPDATA%\Coopanion\data-location.json`. Data beside the program always wins, so a folder copied whole keeps its own data. The portable version never asks and keeps no such note: its data is always the `data` in its own folder.

If `home/companion/notice.json` or `alarms.json` is damaged (or `telemetry.json`, which only a build with a statistics server writes), Coopanion keeps it as `<name>.bad` and starts that state anew. When only some records in `alarms.json` are not wake-ups, just those are dropped and Coo's other wake-ups stay. After `notice.json` is rebuilt, Coo may hear the current version's release notes once more. A wake-up that falls due is still delivered when it cannot be saved; after a restart it may be delivered again.

Inside the data folder, `home` holds memory, conversations, settings and API keys, `extensions` the extensions, `logs` the logs, and `home/models` the speech model.

## FAQ

<details>
<summary><b>The pet is gone</b></summary>

Right-click the tray icon → Show pet. If the tray icon is hidden, click `^` at the bottom right of the taskbar. Opening the program again also works. On Mac, click the menu bar icon → Show pet.

</details>

<details>
<summary><b>Coo does not answer</b></summary>

Check the status next to the title on the Start page:

- **No model connected**: check that the API key is complete and the account has balance, then click **Test**. Doubao needs the default model enabled in the Ark console first.
- **Paused**: click resume at the bottom of the left bar.

After 5 failed model requests in a row, Coo says the error in a bubble (unknown model name, invalid key, no balance, …); click **Open settings** to fix it. When the service wants the thinking sent back before every tool call and Coopanion has that turned off for it (only OpenRouter, for now), the bubble asks you to report it to the developers instead: no setting fixes it.

If Coo never appears right after an update, Coopanion keeps retrying quietly for a few minutes (an update may still be putting its files in place) and then says it could not start. Quit from the tray and open Coopanion again; opening it again also starts it over after such a failure.

When every port the console tries (5 from 17788) is taken, Coopanion no longer restarts over and over but says which ports they are: a few copies of Coopanion may already be running, or other programs hold them. Quit one of them, then choose **Restart** in the tray menu.

</details>

<details>
<summary><b>Coo cannot hear me</b></summary>

- Check that the mic button beside Coo is not crossed out;
- Tap Left Alt first, then press and hold it (two presses too far apart do not count);
- The Voice input page shows the recognizer as ready; if the model is missing, click Download. The level meter moves while you speak;
- Windows: Settings → Privacy & security → Microphone, allow desktop apps to use the microphone;
- Mac: in System Settings → Privacy & Security, turn on Microphone and Input Monitoring for Coopanion, then restart it.

If the Windows recognizer reports no speech recognizer, install speech recognition for Chinese under Settings → Time & language → Language, or switch back to FunASR.

</details>

<details>
<summary><b>I need a proxy</b></summary>

Coopanion uses the system proxy (an HTTP or HTTPS proxy; a SOCKS proxy is not used) as it is at the moment of each request, so turning a proxy app on or off takes effect without restarting Coopanion, and a PAC script decides per site. `HTTP_PROXY` / `HTTPS_PROXY` set in the environment Coopanion starts from take its place. Local traffic bypasses the proxy. Certificates installed in the system (a company network's or an antivirus program's) are trusted as well. See the [development guide](docs/DEVELOPMENT.md).

</details>

<details>
<summary><b>What is it thinking?</b></summary>

The Chat page has the full record. If something goes wrong, click **Export diagnostics** there and attach the file to an [issue](https://github.com/yxengram/Coopanion/issues).

</details>

<details>
<summary><b>On Linux, Coo leaves square traces where it has been</b></summary>

With Intel graphics (Mesa's iris driver), fast clear leaves old frames in the transparent window. Start Coopanion with `INTEL_DEBUG=nofc` set to turn it off, for example `INTEL_DEBUG=nofc coopanion` for the deb; rendering on a discrete GPU also avoids it.

</details>

## Feedback and contributing

- Report problems and ideas in [Issues](https://github.com/yxengram/Coopanion/issues) with your OS version, Coopanion version and steps to reproduce.
- To build from source or change the code, see the [development guide](docs/DEVELOPMENT.md).

## Acknowledgements

Coopanion is assembled from [Cortico](https://github.com/Pal-AI-Lab/Cortico): Cortico Core + Cormini Persona + the [desktop pet World](packages/cortico-world-desktop-pet) + the [computer use World](packages/cortico-world-cua).

## License

[AGPL-3.0-or-later](LICENSE). Releases up to and including 0.1.10 are MIT. The Cortico framework is MIT and ships as a submodule. To open a PR see [CONTRIBUTING.md](CONTRIBUTING.md); contributions are released under AGPL-3.0-or-later, no contributor agreement to sign.

The DeepSeek Whale artwork (the textures under `packages/cortico-world-desktop-pet/web/whale/`) is not covered by the AGPL; its origin is described in the [desktop pet World's third-party notices](packages/cortico-world-desktop-pet/THIRD_PARTY_NOTICES.md). Nor is the Claude-chan artwork (the textures and thumbnail under `packages/cortico-world-desktop-pet/web/claude-chan/`): she is the Claude fan character designed by ZipZipPipe（Bilibili）, whose design is free for non-commercial use only; this figure's art was generated with GPT image models after that design, then cut into layers by this project, and is likewise for non-commercial use only. Nor is the GPT-chan artwork (the textures and thumbnail under `packages/cortico-world-desktop-pet/web/gpt-chan/`): she is the GPT fan character designed by ZipZipPipe（Bilibili）, whose design is free for non-commercial use only; this figure's art was generated with GPT image models after that design, then cut into layers by this project, and is likewise for non-commercial use only. Nor is the Gemini-chan artwork (the textures and thumbnail under `packages/cortico-world-desktop-pet/web/gemini-chan/`): she is the Gemini fan character designed by ZipZipPipe（Bilibili）, whose design is free for non-commercial use only; this figure's art was generated with GPT image models after that design, then cut into layers by this project, and is likewise for non-commercial use only. Nor is the Grok-chan artwork (the textures and thumbnail under `packages/cortico-world-desktop-pet/web/grok-chan/`): she is the Grok fan character designed by ZipZipPipe（Bilibili）, whose design is free for non-commercial use only; this figure's art was generated with GPT image models after that design, then cut into layers by this project, and is likewise for non-commercial use only. The speech's syllable bank (`packages/cortico-world-desktop-pet/web/speech/`) was spoken syllable by syllable by Microsoft Edge's read-aloud service with the `zh-CN-XiaoyiNeural` voice and, not having been authored by this project, is not covered by the AGPL; its pronouncing data are the CMU Pronouncing Dictionary (BSD-style licence), mecab-ipadic (its own permissive licence, NAIST), the Unicode Unihan database (Unicode License v3), pypinyin and pinyin-data (MIT), and the jukujikun of the Jōyō kanji table's appendix (a Japanese government notice, not under copyright); the speech code and data come from upstream Coopanion (v0.2.7, #263 and #265), and details and licence texts are in the desktop pet World's third-party notices. Third-party components shipped or downloaded at runtime: Electron (MIT), Cortico (MIT), sherpa-onnx (Apache-2.0), FunASR's SenseVoiceSmall model ([FunASR model license](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE), downloaded on use), koffi (MIT), jpeg-js (BSD-3-Clause), pnpm (MIT); model service logos come from [lobe-icons](https://github.com/lobehub/lobe-icons) (MIT; each logo belongs to its company and only identifies the service).
