# LLM Arena 客户端

给上一级 [game2](..) 后端的井字棋对战平台写的客户端脚本。支持 MiniMax / DeepSeek / OpenAI / Ollama 等模型接入，账号本地注册表管理，命令行跑 1v1 对抗并查看平台排行榜。

后端只负责棋局仲裁，不接入任何 LLM——本仓库的脚本负责：轮询对局状态 → 拼 prompt → 调用你指定的模型 → 提交落子。

## 目录结构

```
arena/
  client.py     平台 HTTP 客户端（register / match / state / move / debug / leaderboard）
  providers.py  模型调用层：openai / deepseek / minimax / ollama / random / probe（陪练用）
  registry.py   本地账号注册表，按名字复用，不重复向平台注册
  player.py     单个 agent 的对局循环
  config.py     配置加载（config.json > 环境变量 > 内置默认值）
  ui.py         终端上下键选择菜单（curses）
manage.py       账号管理 CLI
run_match.py    1v1 对抗入口
leaderboard.py  查平台排行榜
config.example.json
```

## 配置步骤

1. 确认后端在跑（默认 `http://localhost:4000`）：

   ```bash
   curl http://localhost:4000/games
   ```

2. 复制配置文件，填真实 API Key（`config.json` 已在 `.gitignore` 里，不会入库）：

   ```bash
   cp config.example.json config.json
   ```

   ```json
   {
     "arena_base": "http://localhost:4000",
     "game_type": "tic_tac_toe",
     "providers": {
       "openai":   { "api_key": "sk-xxx", "base_url": "https://api.openai.com/v1" },
       "deepseek": { "api_key": "sk-xxx", "base_url": "https://api.deepseek.com" },
       "minimax":  { "api_key": "xxx", "base_url": "https://api.minimax.chat" },
       "ollama":   { "base_url": "http://localhost:11434" }
     }
   }
   ```

   也可以不写文件，直接用环境变量（优先级：账号自己的配置 > 环境变量 > `config.json`）：

   ```bash
   export OPENAI_API_KEY=sk-xxx
   export DEEPSEEK_API_KEY=sk-xxx
   export MINIMAX_API_KEY=xxx
   export OLLAMA_BASE_URL=http://localhost:11434
   ```

3. 安装依赖：

   ```bash
   pip install requests
   ```

4. Ollama 用户需要本地起好服务并 `ollama pull <model>`（默认地址 `http://localhost:11434`）。

## 账号管理（`manage.py`）

账号（选手）存在本地注册表 `agents.json`（同样在 `.gitignore` 里），一个名字对应平台的 `agent_id` / `arena_api_key`（平台登录用，跟模型厂商的 key 是两回事，别搞混），以及你指定的 provider / model / prompt 模板。**同名再次 register 会直接复用本地记录，不会重复向平台注册**（平台的 key 只在注册时返回一次）。

```bash
# 交互向导：引导你选 provider、填/复用 API Key 和 URL（可存进 config.json）、选 model、起名字
python3 manage.py register

# 也可以命令行一把梭
python3 manage.py register --name DeepSeek-A --provider deepseek --model deepseek-chat
python3 manage.py register --name Local-Qwen --provider ollama   --model qwen2.5:7b
python3 manage.py register --name GPT-B      --provider openai   --model gpt-4o-mini

# 验证某个选手的 Key/URL/model 是否真的能用（实际调一次模型）
python3 manage.py ping --name DeepSeek-A

# 列出所有选手
python3 manage.py list

# 查看某个选手的完整配置（含 prompt 模板）
python3 manage.py show --name DeepSeek-A

# 改模型 / provider / temperature / base_url
python3 manage.py set --name DeepSeek-A --model deepseek-reasoner --temperature 0.7

# 编辑 prompt 模板：不传 --file 就打开 $EDITOR 交互编辑
python3 manage.py edit-prompt --name DeepSeek-A
python3 manage.py edit-prompt --name DeepSeek-A --file my_prompt.txt

# 本地移除（平台没有注销接口，这只是清掉本地记录，不影响平台上的 agent_id）
python3 manage.py remove --name DeepSeek-A
```

Prompt 模板里可以用这三个占位符：

- `{board}` — 当前棋盘（3x3，空格用 `.` 表示）
- `{mark}` — 你执的棋子（`X` 或 `O`）
- `{retry_hint}` — 上一步非法/解析失败时的提示语，正常轮次为空字符串

`provider` 支持：`openai` / `deepseek` / `minimax` / `ollama`，另外还有两个不调模型的陪练档 `random`（随机落子）/ `probe`（固定选第一个空格），方便打通链路或当基线。

## 跑 1v1 对抗（`run_match.py`）

```bash
# 命令行直接指定，打一局
python3 run_match.py --x DeepSeek-A --o Local-Qwen

# 不传 --x/--o 进交互模式：↑/↓（或 j/k）选人，回车确认，选完还能就地编辑 prompt 再开打
python3 run_match.py

# 连打 5 局（每局自动交替先后手），打完打印战绩 + 平台榜
python3 run_match.py --x DeepSeek-A --o Local-Qwen --rounds 5

# 其他可选参数
python3 run_match.py --x A --o B \
  --move-timeout-ms 60000   # 单步超时（毫秒），本地跑慢速模型可以调大
  --poll 1.0                # 轮询间隔（秒）
  --max-seconds 900         # 整局自保超时（秒）
```

每局产物落在 `output/<时间戳>/round<N>/`：双方进程日志 `player_X.log` / `player_O.log`，以及每步 trace `trace_X.jsonl` / `trace_O.jsonl`（该目录已在 `.gitignore` 里）。

对局过程中会实时打印双方模型的原始回复和每次调用耗时，方便判断卡住是没回应、超时、还是回复解析不出合法位置：

```
  [in_progress] 轮到 X(DeepSeek-A)  X...O....
    [X:DeepSeek-A][调用模型中]
    [X:DeepSeek-A][落子 pos=2] 2.3s 2
```

## 查排行榜（`leaderboard.py`）

```bash
python3 leaderboard.py
python3 leaderboard.py --game-type tic_tac_toe
```

排行榜由平台用 Elo 自动维护，每局结束自动更新，不需要单独提交结果。
