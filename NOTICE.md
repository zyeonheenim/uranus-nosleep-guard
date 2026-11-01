# NOTICE — 归属与许可边界

## 上游

本仓库是 **[Uranus iMessage](https://github.com/nikonotnicotine/Uranus_Imessage)** 的
补丁合集，不是它的分支，也不包含它的源码。

- 上游作者：**Niki**（[@nikonotnicotine](https://github.com/nikonotnicotine)）
- 上游版权：`Copyright (c) 2026 Niki`
- 上游许可：**Uranus iMessage License v1.0 — 非商业使用许可**
  全文见 <https://github.com/nikonotnicotine/Uranus_Imessage/blob/master/LICENSE>

`patches/` 下的 `.patch` 文件里含有上游源码的片段（上下文行 + 增删行），
它们是上游代码的**衍生物**，因此同样受上游非商业许可约束，不受本仓库 MIT 许可的授权。

## 本仓库

以下部分由 **zyeonheenim** 编写，采用 MIT：

- `install.mjs`、`uninstall.mjs`、`setup.mjs`、`tests/smoke.mjs`
- `patches/01-nosleep-guard/` 下的脚本（`uranus-wake-restart.sh`、安装/卸载脚本）
- 所有 Markdown 文档

见 [LICENSE](LICENSE)。

## 使用边界（照抄上游许可的核心几条）

- ✅ 自己学习、研究、个人娱乐：可以装、可以改、可以自己玩
- ✅ 原样、不收费地转给同样只用于个人学习的人：可以，但要**一并附上上游许可全文**
- ❌ 卖钱，或作为任何付费产品/服务的一部分
- ❌ 包装成 SaaS、代运营、收费陪聊、付费机器人
- ❌ 二次修改后对外分发
- ❌ 以本项目为基础提供收费的部署、定制、代搭建、技术支持

**如果你不同意以上任何一条，请立即删除本仓库及其衍生的一切副本。**

## 不含什么

本仓库**不含**：角色卡、世界书、记忆库、对话记录、API 密钥、任何个人设定。
只有机制。
