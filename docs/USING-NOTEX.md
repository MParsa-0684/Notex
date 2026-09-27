# Using Notex

## Your first workspace

1. Open your Notex URL. Try **Take a look around** without creating an account, or create the owner account using the server setup token supplied privately by your administrator.
2. Create a notepad with the **+** beside Notepads. Select its tab, then **New note**.
3. Enter a title and write. Use **Save** in the top-right after making changes. Saved changes are stored on the server; unsaved changes are only in this browser tab.
4. On a phone, the bottom bar provides the note list, new note, notepads, agent and account settings.

## Writing and page appearance

The toolbar provides headings, font size, bold/italic/underline, bullets, numbered lists, alignment, tables, links, images and undo/redo. Table controls appear when the cursor is inside a table. Paste an image or use the image picker; PNG, JPEG, GIF and WebP are accepted up to 2 MB per image.

Automatic direction follows each paragraph's text, so English and Persian can coexist. Select RTL or LTR to force the note direction. The three paper swatches change only the note page; the moon/sun changes the app appearance.

**Save explicitly.** Switching to another note warns about unsaved edits. Changes from another session produce a conflict instead of silently overwriting that session's work. Keep an export before resolving a conflict if you need both versions.

## Whiteboard

Switch from **Write** to **Whiteboard** within the same note. Text and drawing are both retained when you save.

- Choose pen, pencil, marker or highlighter and select color/width.
- Draw a line, rectangle or ellipse by dragging. Text prompts for a label.
- Use the hand to pan; scroll to travel and pinch or Ctrl/Command-scroll to zoom.
- **Fit drawing to view** recovers marks drawn far from the origin.
- Eraser removes a whole stroke when tapped near its sampled points; it is not pixel erasing. Undo/redo controls apply to strokes.
- This is a very large bounded canvas (coordinates ±100,000), not an infinite document. Normal zoom controls range from 10–500%; fit can zoom further out for distant drawings. Viewport/undo history do not persist, but saved marks do.

## Link a PlanNet action

1. Select **↗ PlanNet** in the writing toolbar.
2. Check the API and website addresses. Defaults are `https://api.plannet.arani-tech.com` and `https://plannet.arani-tech.com`.
3. Sign in using your **PlanNet** account, load your actions, search and select one.
4. Save the note. Opening the link opens the action editor in PlanNet after its normal authentication and device-lock checks.

The picker connects from your browser directly to PlanNet. Notex saves the URL and action title, not your PlanNet password or session. The accounts are separate, not single sign-on. The PlanNet API must allow the Notex website origin; the VPS guide explains the one-line change.

## Protect a note

Open **Note options → Protect with a passphrase**, then set a separate strong passphrase (12+ characters). The note body and whiteboard are additionally encrypted using that passphrase. The note title remains visible in your authenticated note list; use a neutral title for sensitive subjects.

Opening the note requires its passphrase. Access closes after ten minutes or when the tab becomes hidden. **Save before switching apps/tabs:** the privacy close intentionally discards unsaved protected edits. Opening another note or signing out also closes access.

There is no forgotten-note-passphrase recovery. An account password reset would not unlock it. To remove protection, unlock the note and use its options. Only then can the agent access it in a future request.

## Ask the agent

Your administrator must configure Ollama first. Open **A little help thinking**, explicitly permit sharing unlocked note context, and describe the task. Examples:

- “Create a bilingual research checklist in My notes.”
- “Turn this outline into an English/Persian table.”
- “Draft a weekly review template and use pale-blue paper.”
- “Draw three labeled boxes for this idea on my whiteboard.”

Read the reply and proposed operations, then **approve** or discard. Nothing changes merely because the model proposed it. Proposals expire after ten minutes. If a note changes or is locked after a proposal, application is rejected and you must ask again.

The agent may create/rename notepads, create/edit notes, add simple strokes and move notes to trash. It has no shell, arbitrary network, account administration, lock/unlock or password tools. It cannot read existing drawings visually or embedded images; its current context is text from up to 50 unlocked, non-trashed notes. Long notes are truncated, and oversized context is rejected. Model output may still be wrong; review before approval.

## Organize, export and restore

Use Note options to move a note to another pad or to Recently deleted. Restore it there; protected notes still require unlocking for changes. There is no automatic trash expiry in this release.

Export downloads one `.notex.json` file. **Exports are plaintext**, including exports from an unlocked protected note. Keep them private. Import from account settings creates a new unprotected note; it does not replace an existing note. Use the encrypted server backup for a complete migration including accounts, keys and protected notes.

Owner settings can create additional accounts. Each account has its own workspace. Limits per account: 500 notes, 50 pads, approximately 40 MB serialized workspace; per note: 8 million HTML characters, 3,000 strokes and 10,000 points per stroke. These limits suit a small personal VPS; they are not a large media storage service.
