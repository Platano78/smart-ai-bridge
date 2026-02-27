# Council System

The council system enables multi-AI consensus by querying multiple backends and letting Claude synthesize their responses. It is useful for complex decisions, architecture reviews, security analysis, and any situation where multiple perspectives improve the outcome.

## Topics

Topics determine which backends participate in a council query:

| Topic | Description |
|-------|-------------|
| `coding` | Code generation, debugging, refactoring |
| `reasoning` | Complex logic and problem-solving |
| `architecture` | System design and architecture decisions |
| `general` | General knowledge queries |
| `creative` | Creative writing and brainstorming |
| `security` | Security analysis and vulnerability assessment |
| `performance` | Performance optimization |

## Strategies

Each topic has a configurable strategy that controls how backends are queried:

| Strategy | Behavior | Best For |
|----------|----------|----------|
| **parallel** | All backends respond simultaneously. Fastest execution. | General queries, speed-critical |
| **sequential** | Each backend sees prior responses and builds on them. | Deep reasoning, iterative refinement |
| **debate** | Multiple rounds of parallel responses, each round sees the prior round. | Thorough analysis, complex decisions |
| **fallback** | Try backends in order until 2+ succeed. | Maximum reliability |

## Configuration

Council config is stored in `config/council-config.json`:

```json
{
  "version": 1,
  "topics": {
    "coding": { "strategy": "parallel", "backends": ["nvidia_qwen", "nvidia_deepseek"] },
    "architecture": { "strategy": "debate", "backends": ["nvidia_deepseek", "nvidia_qwen", "gemini"] }
  },
  "defaults": ["local", "gemini"]
}
```

The `defaults` array specifies which backends are used when a topic is not explicitly configured.

## Dashboard Configuration

Visit `/council` on the dashboard to configure topics and strategies visually. Changes persist to `config/council-config.json` automatically. See [DASHBOARD.md](DASHBOARD.md) for details on starting the dashboard.

## Adding Custom Topics

Custom topics can be added by:

1. Updating the `VALID_TOPICS` array in `src/config/council-config-manager.js`
2. Adding the topic entry to `config/council-config.json` (or via the dashboard)

## How It Works

1. Claude calls the `council` tool with a prompt and topic
2. The handler reads the strategy for that topic from config
3. Backends are queried according to the strategy
4. All responses are returned to Claude for synthesis
5. Claude produces the final unified answer

The council tool does not pick a "winner" -- it presents all backend responses so Claude can weigh them and produce a single, well-reasoned answer that incorporates the best elements from each.
