export const notesAppTest = {
  name: "notes_app",
  description: `
You are testing the goblin's ability to build a personal notes application.

Steps:
1. Call start_goblin to get the goblin running.
2. Ask the goblin to build a notes app: a backend with functions to create, read, list, and delete notes, and a frontend webpage served on an HTTP port.
3. Wait for the goblin to finish building (watch the output — it may take several turns of tool use).
4. List the goblin's files to understand what was created.
5. Find the HTTP port the goblin opened (ask the goblin directly or read the ports config from its files).
6. Make an HTTP request to the frontend page and verify it returns HTML.
7. Test the notes API via HTTP: create a note, retrieve it by ID, list all notes, then delete it. Verify each operation returns the expected result.
8. Ask the goblin to add a feature (e.g. note tags, search, or markdown support) and re-test the affected endpoints.
9. Repeat step 8 for at least one more feature.
10. Call stop_goblin when done.

At the end, report a clear PASS or FAIL with specific evidence of what worked and what didn't.
`.trim(),
};
