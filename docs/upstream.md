# 上游项目、版本与许可

这个仓库里**没有** Uranus 的源码。它只是一组补丁 —— 给已经装好的 Uranus 打的那种。

## 上游是谁

| 项 | 值 |
|---|---|
| 项目 | **Uranus iMessage** — 自建的 iMessage 角色扮演客户端（Node + React） |
| 仓库 | <https://github.com/nikonotnicotine/Uranus_Imessage> |
| 作者 | [@nikonotnicotine](https://github.com/nikonotnicotine)（Niki） |
| 本仓库补丁基线 | **v1.22.3**（`git clone --branch v1.22.3`） |
| 上游许可 | 自定义**非商业**许可，见 [LICENSE](https://github.com/nikonotnicotine/Uranus_Imessage/blob/master/LICENSE) |

Uranus 本体能做什么、怎么装、怎么配线路和角色卡，**都在上游的 README 里**，这里不重复。

## 为什么仓库里不塞一份源码

上游许可写得很明确，两条和「分发」有关的：

> 第一条 2. 阅读、修改源代码，改动后仍然**只在**上述非商业的个人范围内自用；
> 第一条 3. 在**不加修改、不收费**的前提下，把本项目**原样**分享给同样只用于个人学习的人，并且必须**一并附上本条款全文**。

也就是说：**原样转发可以，改过再发不行。** 而补丁打上去的结果就是「改过的版本」。
所以这里只放**补丁片段**（机制），不放打完补丁的源码，也不放上游源码副本：

- 想拿到干净的 1.22.3：用下面的 `setup.mjs` 从官方仓库直接拉，链路是「你 ↔ 上游」；
- 想打补丁：`install.mjs` 在你自己的机器上改你自己的那份，改完的东西不离开你的电脑；
- 本仓库的任何补丁目录里都没有角色卡、世界书、记忆库、API 密钥。

## 手上还没有 Uranus：一条命令搞定

```bash
node setup.mjs                       # 预览：拉哪个 tag、拉到哪、装什么
node setup.mjs --run                 # 只拉源码到 ./Uranus_Imessage
node setup.mjs --run --install       # 拉源码 + 装全部补丁
```

常用参数：

| 参数 | 作用 |
|---|---|
| `--dir <路径>` | 拉到哪个目录（默认 `./Uranus_Imessage`） |
| `--tag <v1.22.3>` | 拉哪个版本（默认 `v1.22.3`，与补丁基线一致） |
| `--use-existing` | 不下载，直接对已有目录装补丁 |
| `--no-git` | 不走 `git clone`，改用官方 tarball（没装 git 时用） |
| `--run` | 真的执行（不加只预览） |

两种拉法（git / tarball）拿到的树是一样的 —— 实测同为 282 个文件、逐字节无差异。
已经有 Uranus 的人**不用**跑这个脚本，直接 `node install.mjs` 即可（它会自己找目录）。

## 版本对应关系

补丁是按 tag 里的源码**逐行**对上的，所以版本很要紧：

| 你的 Uranus | 本仓库 | 说明 |
|---|---|---|
| 1.22.3 | ✅ 精确匹配 | 唯一保证「逐字节和参考实现一致」的版本 |
| 1.22.4 | ⚠️ 多半能装 | 上下文没动就能过；对不上会**整体拒绝**，不会改坏 |
| 更旧 / 更新 | ❌ 会拦下 | `--force` 可强装，但后果自负 |

拦截不是「挑刺」：补丁引擎是「整份对得上才写盘」，一处对不上就什么都不改，
所以装不上时你的文件是**原封不动**的，不会出现半个文件被改的情况。

## 上游升级了怎么办

```bash
cd uranus_patches_awesome && git pull
node install.mjs --list       # 看哪些补丁变成「待重装」
node install.mjs --all --run  # 重新打一遍
```

大版本升级（1.23+）后大概率对不上，那就在 issue 里贴一下 `package.json` 的版本号，
我按新版本重出补丁。

## 许可怎么算

| 对象 | 许可 |
|---|---|
| 本仓库自己的脚本（`install.mjs` / `uninstall.mjs` / `setup.mjs` / `tests/` / 文档） | MIT，见 [LICENSE](LICENSE) |
| `patches/*/**.patch` 里的代码片段 | **上游代码的衍生物**，跟着上游的非商业许可走 |
| 打完补丁之后的 Uranus | 仍然是上游的作品，仍然受上游许可约束 |

一句话：**这东西只许自己玩、自己学。不许卖、不许当付费服务、不许拿它做代搭建收费。**
详见 [NOTICE.md](NOTICE.md)。
