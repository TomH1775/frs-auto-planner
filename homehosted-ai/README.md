# FRS Auto key service

Run on the Ubuntu machine with Ollama and the Cloudflare Tunnel. Start with
`FRS_AI_MODEL=qwen3.5:9b python3 server.py` from this directory. The tunnel for
auto-ai.tomh1.dev should forward to http://127.0.0.1:8765.

On a new installation, run `python3 accounts.py USERNAME` in this directory and
enter a password when prompted. Use the same command to add another user or reset
a password. A reset revokes that user's keys. Back up the local `accounts.sqlite3`
database to preserve accounts and keys across deployments.

Sign in at https://auto-ai.tomh1.dev to generate a personal API key. Paste the
key under Home hosted AI connection in the planner. Leaving it blank uses built-in
commands.

The API permits http://localhost:5173 and https://maxthecobbler.github.io by default.
Override FRS_AI_ALLOWED_ORIGINS with comma-separated origins for another site.
Cloudflare must forward OPTIONS and POST /generate to this service without
an interactive login redirect; the application verifies a bearer key on every generation.

## Strategy lookup

Set `TAVILY_API_KEY` on the Ubuntu server for Tavily basic search, or set
`BRAVE_SEARCH_API_KEY` for Brave. Tavily takes precedence when both are set.
Each lookup sends the first 340 characters of the instructions with FRC context
to the provider and returns up to five excerpts to Ollama.
