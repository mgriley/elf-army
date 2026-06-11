# Testing Strategy

To be able to test this, I want to make a suite of "sample app" tests where goblin is started up, then
receives a whole sequence of admin instructions on how to design the app.

Each test should give the instructions then gradually test the capability of the created server.

To really flexibly test goblin, the tester should itself be an agent that A. construct a transcript
of what test it will perform, then B. the agent follows the transcript and performs the test.
Also C. While the test is ongoing, the agent performs the test but also watches the output (via
the inspector to judge it for correctness).

## Test 1 - Chat App

The goblin should be asked to create an online chat app.

It should act as the backend and serve the frontend as a webapp.

The tester should ask for the base plan, test it, then gradually add new features in
a continual back-and-forth flow of increasing complexity.

## Test 2 - Notes App

The goblin should be asked to create a note-taking app for personal notes.

It should act as the backend and serve the frontend as a webapp.

The tester should ask for the base plan, test it, then gradually add new features in
a continual back-and-forth flow of increasing complexity.
