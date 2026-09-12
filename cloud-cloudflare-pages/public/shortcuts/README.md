# Ready-made "Open garage door" Shortcut

Drop the exported Apple Shortcut here as **`Open_garage_door.shortcut`** and it is served at
`/shortcuts/Open_garage_door.shortcut`. The Siri setup modal checks for the file automatically
and shows a **Download Shortcut** button when it exists — no code change needed.

## Export it correctly (important)

The `.shortcut` file is Apple-signed and cannot be edited after export, and it embeds whatever
URL is in the *Get Contents of URL* action. **Never export it with a real Siri link inside** —
anyone who downloads it could open the door.

1. In the Shortcuts app open *Open garage door*.
2. In **Get Contents of URL**, set the URL to the placeholder
   `https://garage.onyachamp.com/api/siri/trigger?key=PASTE-YOUR-LINK-HERE`
   (or delete it and leave it blank).
3. Tap **ⓘ → Share → Save to Files** (or AirDrop it to your computer).
4. Rename to `Open_garage_door.shortcut`, put it in this folder, deploy.
5. If you ever exported a copy containing your real link, tap **Regenerate link** in the app.

Users import it, open the *Get Contents of URL* action, paste their own private link from the
app, and say **"Hey Siri, open garage door."**
