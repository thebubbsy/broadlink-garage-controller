# Ready-made "Open garage door" Shortcut

Drop the exported Apple Shortcut here as **`Open_garage_door.shortcut`**; `server.py` serves it at
`/shortcuts/Open_garage_door.shortcut` and the Siri setup modal shows a **Download Shortcut** button
automatically when the file exists.

Export it with a **placeholder** URL in the *Get Contents of URL* action — never your real Siri link,
the signed file cannot be edited afterwards and anyone who downloads it could open the door.
See `cloud-cloudflare-pages/public/shortcuts/README.md` for the exact steps.
