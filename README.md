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
