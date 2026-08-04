# Agent Conference Example

This application demonstrates a use-case using Jambonz API, where an incoming call is placed into a queue using the `enqueue` verb. The application then triggers two outbound calls to different callees and merges them into the same conference.

## Prerequisites

- Node.js and npm installed
- A Jambonz account
- Publicly accessible web server to host this application (e.g., AWS, Google Cloud, Heroku)
- Two callee numbers for testing

## Setup

1. Clone this repository:
```bash
git clone https://github.com/jambonz/agent-conference-example.git
```

2. Install dependencies:
```bash
cd agent-conference-example
npm install
```

3. update a `config/default.json` file and populate it with the necessary variables

4. Start the application:
```bash
npm start
```

The application will be running at http://localhost:3000 or your specified port.

## Usage

Upon receiving an incoming call, the application will place the caller into a queue using the `enqueue` verb. In parallel, it initiates two outbound calls to the numbers specified in the config/default.json

Once these outbound calls are answered, they join the same conference call. The original caller can then be dequeued and added to the same conference, forming a three-way conversation.

## Testing

You can test this application by dialing into your Jambonz number that is associated with this application's webhook. You should be placed in a queue, and the two specified callee numbers will receive calls. Once they are answered, you can join them in the conference call.

---

## GPT Live test route (`/gptlive`)

An OpenAI **GPT Live** (limited-access alpha) speech-to-speech agent, added as an
extra route on this same app: `lib/routes/gptlive.js`, served at `ws://<host>/gptlive`.

GPT Live is **not** the OpenAI Realtime API. `llmOptions` carries only
`session_update` (there is no `response_create` — the model drives the
conversation itself), the model rides in the connection URL rather than the
session object, and everything the model wants from outside the audio
conversation arrives as a *delegation*.

### Run it

```bash
GPTLIVE_API_KEY=sk-... npm start
```

Then point a jambonz application's calling webhook at `ws://<your-host>/gptlive`
(WebSocket transport) and call the number attached to it.

The key must be an OpenAI key **enrolled in the GPT Live Early Access Program**.
An ordinary OpenAI key completes the websocket handshake and is then refused with
`Voice session access denied`, which surfaces as
`completionReason: 'server error'` on the action hook.

### Environment variables

| Variable            | Default                    | Description |
|---------------------|----------------------------|-------------|
| `GPTLIVE_API_KEY`   | — (required)               | OpenAI key enrolled in the GPT Live alpha |
| `GPTLIVE_MODEL`     | `gpt-live-1-boulder-alpha` | GPT Live voice model; rides in the connection URL |
| `GPTLIVE_DELEGATION_MODE`  | `responses`         | `responses` (function calling) or `client` (text context) |
| `GPTLIVE_DELEGATION_MODEL` | `gpt-5.5`           | Responses-side model for delegated turns |
| `GPTLIVE_VOICE`     | `marin`                    | GPT Live output voice |
| `LOGLEVEL`          | `debug`                    | set to `info` for just conversation turns |

### The two delegation modes

**`responses`** (default) — the model runs a Responses API turn that can call
functions. The nested `responses` object is required and its `model` is
mandatory; tools go at `delegation.responses.tools`, **not** `delegation.tools`
(the server rejects that with `Missing required parameter:
'delegation.responses'`). This route declares a real `get_weather` tool answered
from Open-Meteo, and returns the result in GPT Live's own envelope,
`delegation.function_call_output.create` — not the Realtime API's
`conversation.item.create`. This is also the only mode where jambonz's built-in
`handoff` / `hangup` tools work.

Try it: call in and ask *"what's the weather in Chicago?"*

**`client`** — the model asks this app for free-form text context instead,
emitting `delegation.created` with `item.target === 'client'`; the route answers
with a `delegation.context.append` (one `input_text` part, max 500 tokens). No
function calling exists in this mode.

Try it: `GPTLIVE_DELEGATION_MODE=client GPTLIVE_API_KEY=sk-... npm start`, call in, ask
something about your account, and watch the exchange in the logs.
