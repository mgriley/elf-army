THESE ARE OUT OF DATE, PLEASE IGNORE

# Brainstorming

Each Actor:

Inbox:
- Has a message inbox + router

Some messages should go to agent (add to its queue) and some should go directly
to its its message-handling endpoints.
- It should be able to register message-handling endpoints at runtime, like a kind of mini-server.

Messenging:
- Can receive messages via:
-- IPC (Node processes)
-- From CLI (for the root)
-- Possibly from other sources, as well?

Does this have to be runtime flexible? 

- Runs agent loop (that's the brain)
-- The agent loop sequentially processes inbox messages as they arrive

- Some messages should just go to the k

Goal:
Node starts up:
It can receive instructions from its parent => Go to the agent (runs tools)
Can receive info from its children => Go to the agent (runs tools)
Notice of children died => Go to the agent (runs tools)
Root gets cli messages => Go to the agent (runs tools)

Okay, let's say I instruct it to create a chat server.
- Maybe it develops + spawns an express server in its workspace and runs it via npm.
- How are the endpoints actually exposed?
-- It should probably have the ability to do this.
-- It can do this right now, actually.

I want a parent to be able to route requests to one of its children, though. How to do this? Seems
like I want some sort of IPC-esque router.

Okay, so can go a couple directions here, I think:
A: Each goblin can execute subprocesses / interpreted scripts to handle requests. Can register the handlers
using a tool-call API.

How to allow flexible route handling?

Really, want a really flexible inbox class.

Each message =>
Identity of the sender + payload.
Payload is some generic message that gets converted to a runtime type using zod, behind the scenes.
When registering a handler => You register it by name, route, the schema, and the target endpoint.

Target endpoint can be =>
- Agent message (internal)
- Dispatch to endpoint

Issue though: 
How can I code something like:
- When I get the 'add-user' message from my parent, I either need to delegate it to my  
child or do some more complex handling logic. 

Okay, what about this -> Each Goblin can register handlers for routes, which are some javascript

Okay, I think let's try this, to start:

- Each Goblin is just an actor with a built-in router+agent.

-- All incoming messages are handled by the route handler.
-- You can register dynamic handlers by hot-loading javascript modules.
-- Have tool-calls to list modules, create/destroy modules, then register/unregister handlers.

Core handlers:
- Messages from parents+children. 
