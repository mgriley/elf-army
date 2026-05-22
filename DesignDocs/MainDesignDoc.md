# ElfArmy Runtime Architecture

## Overview

ElfArmy is a hierarchical autonomous runtime system built in Node.js.

The system is composed of many small autonomous workers called **elves**. Each elf is an isolated process with its own workspace, state, and execution context. Elves can recursively spawn sub-elves to delegate tasks, forming a tree-like hierarchy of autonomous workers.

The overall philosophy is:

> Many small intelligent workers cooperating through structured messaging.

The architecture intentionally resembles:

* actor systems
* distributed runtimes
* recursive supervisors
* autonomous coding agents
* microservice orchestration systems

However, ElfArmy aims to remain lightweight and developer-friendly.

---

# High-Level Goals

## Primary Goals

* Autonomous task delegation
* Recursive worker spawning
* Process isolation
* Workspace isolation
* Fault containment
* Message-driven coordination
* Simplicity of implementation
* Extensibility toward distributed execution later

## Non-Goals (Initially)

* Full security sandboxing
* Kubernetes-scale orchestration
* Distributed consensus
* Massive horizontal scaling
* Container orchestration
* Multi-tenant isolation

The first versions should optimize for:

* developer ergonomics
* architectural clarity
* rapid experimentation
* autonomous coding workflows

---

# Core Concept: The Elf

An elf is fundamentally:

> An autonomous workspace-owning agent process.

Each elf:

* runs as an independent Node.js process
* owns an isolated directory
* communicates via IPC messages
* may spawn child elves
* maintains its own state
* performs tasks autonomously

An elf is NOT fundamentally:

* an HTTP server
* a REST service
* a container
* merely a task

The process itself represents an autonomous agent identity.

---

# Architectural Model

## Hierarchical Supervision Tree

ElfArmy uses a recursive parent-child model.

Example:

```text
Master Runtime
 └── Architect Elf
      ├── Backend Elf
      │    ├── API Elf
      │    └── Database Elf
      ├── Frontend Elf
      └── Testing Elf
```

Each parent:

* supervises child lifecycles
* routes messages
* delegates tasks
* aggregates results
* enforces permissions/policies

This model is inspired by:

* Erlang/OTP supervisors
* actor systems
* operating system process trees

---

# Process Model

## Node.js Controllers

Each elf runs as a Node.js controller process.

Elf controllers are launched using:

```js
child_process.fork()
```

This creates:

* a dedicated Node.js subprocess
* an automatic IPC channel
* isolated execution state
* independent event loops

---

# IPC Architecture

## IPC Strategy

ElfArmy uses:

* `process.send()`
* `process.on("message")`

for all internal communication.

Messages are:

* asynchronous
* structured
* ordered per connection
* local-machine only

Internally, Node.js implements this using:

* Unix domain sockets / pipes on Unix systems
* named pipes on Windows

---

# Why IPC Instead of HTTP

HTTP servers per elf were intentionally rejected.

Reasons:

* unnecessary resource overhead
* port management complexity
* excessive middleware duplication
* coupling communication to networking
* poor fit for actor-style systems

Instead:

* IPC is the primary communication layer
* HTTP may optionally exist at boundaries/debug interfaces

ElfArmy is fundamentally:

> a message-driven process system

not:

> a collection of REST services

---

# Messaging Philosophy

Elf communication should behave like actor mailboxes.

Messages are:

* explicit
* typed
* asynchronous
* isolated

Recommended structure:

```ts
interface ElfMessage {
  id?: string;
  type: string;
  from: string;
  to: string;
  payload: any;
  replyTo?: string;
}
```

Example:

```ts
{
  type: "task",
  from: "architect-elf",
  to: "backend-elf",
  payload: {
    objective: "Implement authentication"
  }
}
```

---

# Communication Topology

## Parent-Routed Messaging

Initial versions should NOT allow arbitrary direct elf-to-elf communication.

Instead:

```text
Child A -> Parent -> Child B
```

NOT:

```text
Child A -> Child B directly
```

Reasons:

* simpler routing
* easier observability
* lifecycle clarity
* supervision enforcement
* reduced topology complexity
* easier debugging
* centralized logging

The parent acts as:

* supervisor
* router
* coordinator

This preserves a clean hierarchical model.

---

# Workspace Isolation

Every elf owns its own isolated directory.

Example structure:

```text
elf-army/
  runtime/
  elves/
    elf-001/
      workspace/
      state/
      logs/
      config.json
    elf-002/
```

## Workspace Contains

* generated code
* repositories
* temporary files
* outputs
* artifacts
* local caches

## Benefits

* ownership clarity
* reproducibility
* fault isolation
* safer autonomous code generation
* easier cleanup/reset
* independent git repos
* easier debugging

---

# State Separation

A very important design principle:

## Controller State

Controller state includes:

* child relationships
* permissions
* task queues
* runtime metadata
* health information
* orchestration state

## Workspace State

Workspace state includes:

* source code
* generated files
* repositories
* build outputs
* temporary artifacts

These should remain logically separate.

This separation prevents:

* tangled orchestration logic
* corrupted runtime state
* difficult resets
* unclear ownership

---

# Fault Isolation

Subprocess isolation is a major architectural advantage.

Benefits:

* crashes remain localized
* memory leaks remain localized
* runaway agents can be terminated
* hot reloads become easier
* supervisors can restart children

Compared to a single monolithic runtime:

* failures become contained
* debugging becomes easier
* experimentation becomes safer

---

# Lifecycle Management

Every elf should have:

* a unique ID
* a parent ID
* creation metadata
* health state
* lifecycle status

Example states:

```text
spawning
idle
working
waiting
failed
terminated
```

Parents are responsible for:

* child cleanup
* orphan prevention
* termination policies
* restart policies

---

# Recommended Runtime Abstractions

## Elf Class

Suggested conceptual abstraction:

```ts
class Elf {
  id: string;
  parent?: Elf;
  children: Elf[];
  workspacePath: string;

  send(message): void;
  request(type, payload): Promise<any>;
  spawn(spec): Promise<Elf>;
  kill(): Promise<void>;
}
```

The runtime should expose clean abstractions rather than raw process primitives.

---

# IPC Abstraction Layer

Raw `process.send()` calls should NOT be spread throughout the codebase.

Instead, implement a thin messaging layer.

Example:

```ts
class ElfProcess {
  send(type, payload) {}
  request(type, payload) {}
  on(type, handler) {}
}
```

Benefits:

* protocol consistency
* request correlation
* timeout handling
* structured logging
* easier debugging
* centralized serialization
* future transport replacement

---

# RPC-Style Requests

The runtime should support async request/response semantics.

Example:

```ts
await elf.request("task", {
  objective: "Write tests"
});
```

Internally this should use:

* message IDs
* promises
* correlation IDs
* timeout handling

This avoids deeply nested callback/message code.

---

# Example Spawn Flow

## Step 1

Architect elf receives a high-level objective.

## Step 2

Architect elf spawns specialized children:

* backend elf
* frontend elf
* testing elf

## Step 3

Each child operates independently within its workspace.

## Step 4

Children report results upward.

## Step 5

Architect elf aggregates outputs.

---

# Future Evolution Path

The architecture is intentionally designed to evolve gradually.

## V1

Local subprocess hierarchy.

Features:

* local-only execution
* IPC messaging
* isolated workspaces
* recursive spawning

## V2

Persistent runtime state.

Possible additions:

* sqlite
* task recovery
* snapshots
* resumable workflows

## V3

Containerized elves.

Possible additions:

* Docker
* namespaces
* permission isolation
* resource quotas

## V4

Distributed execution.

Possible additions:

* remote elf nodes
* distributed routing
* remote supervisors
* cluster coordination

## V5

Self-organizing autonomous infrastructure.

Possible additions:

* self-optimization
* autonomous specialization
* recursive planning
* long-lived collaborative systems

---

# Important Constraints

## Avoid Premature Complexity

Do NOT initially add:

* Kubernetes
* distributed consensus
* service meshes
* complex networking
* full security sandboxing
* microVMs
* distributed databases

The architecture already contains significant complexity.

The initial focus should remain:

* elegant process orchestration
* clean abstractions
* stable messaging
* recursive delegation

---

# Recommended Technology Stack

## Runtime

* Node.js
* TypeScript

## Process Management

* `child_process.fork()`
* built-in IPC channels

## Communication

* `process.send()`
* structured JSON messages

## Persistence (initially optional)

* filesystem-based state
* JSON metadata
* local logs

## Future Candidates

* sqlite
* Redis
* NATS
* Unix sockets
* Docker

---

# Design Philosophy

ElfArmy should feel like:

* a living workshop
* a colony of autonomous builders
* a recursive software factory
* a hierarchy of cooperative workers

The system should prioritize:

* composability
* delegation
* isolation
* autonomy
* observability
* simplicity

The central idea is:

> Many small minds cooperating through structured messaging.

---

# Summary

ElfArmy is a hierarchical autonomous runtime composed of isolated Node.js subprocesses called elves.

Each elf:

* owns a workspace
* communicates through IPC
* may spawn children
* acts autonomously
* participates in a supervision hierarchy

The architecture emphasizes:

* recursive delegation
* process isolation
* actor-style messaging
* workspace ownership
* fault containment

The initial implementation intentionally remains lightweight:

* local execution only
* Node.js subprocesses
* IPC messaging
* filesystem isolation

while preserving a clean path toward:

* distributed execution
* containerization
* autonomous orchestration
* large-scale recursive systems.
