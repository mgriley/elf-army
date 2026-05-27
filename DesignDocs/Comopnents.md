# Actor Components
05/27/2026

Each actor should have these set of components. By using these components alone, each actor should be powerful enough
to accomplish the purpose assigned by its parent (likely some generic web-server tasks, like a slice of app functionality).

Major system components:

- RouteManager
- FunctionManager
- PeerManager
- SpawnManager

## RouteManager (maybe call RpcManager or InterfaceManager?)
Handles inbound messages. Mental model is that we have a list of RPC-like "routes", like a webserver/micro-service.
We group these routes into interfaces (which are just lists of routes). Each peer gets exposed an interface.

AddRoute(name, schemas, "endpoint")
RemoteRoute(name)
UpdateRoute(name, newArgs)

AddInterface(interfaceName)
SetInterfaceRoutes(interfaceName, routeNames)

GetInterface(interfaceName)
- Should return the schemas of all routes of the interface

HandleMessage(routeName, msg: string): string
- Called when we receive a message
- Should validate against the schemas

## FunctionManager
A way for each actor to create internal functions, which will be executed by dynamically importing the given typescript text and 
executing the exported "handle" function. Mental model is that actor creates its mini library of self-contained micro-functions
for servicing the routes that it wants to make available.

CreateFunc(name, code)
RemoveFunc(name)
ModifyFunc(name, newCode)
ExecuteFunc(name, inputData: string): string

## PeerManager
PeerManager manages the edges in/out of this node. A node can communicate with its connected peers. Each connected peer is
an assigned an interface (see RouteManager), and peers can only call functions in their assigned interface.

Each "peer" must derive an abstract/interface "AbstractPeer" class. For now, just has a single function "handleSend(funcName, inData)"
that must be implemented. Also takes a "PeerCallbacks" object in the ctor that should call into for things like when a message is
received from the peer (which hooks into the RouteManager => HandleMessage function).

AddPeer(name, PeerObj)
SetPeerInterface(peerName, interfaceName)
RemovePeer(name)
GetPeers(name)

## SpawnManager
To start, the only peers are the processes in our process hierarchy. We can communicate with our parent proc by IPC and with our
child procs by IPC. The SpawnManager handles the details of spawning sub-proces and calling PeerManager funcs to setup a peer
for each spawned actor.

SpawnActor(name, purpose)
RemoveActor(name)

SpawnAllExisting()
- Spawns actors by reading disk and seeing where we left off. Called only on startup.