# Images

Drop files here with these exact names and the site picks them up automatically.
Nothing breaks if they're missing — the page falls back to initials / a placeholder.

| File            | Where it shows       | Suggested size          |
| --------------- | -------------------- | ----------------------- |
| `nate.jpg`      | Profile avatar       | 600×600 square is ideal |
| `nate-about.jpg`| "Hey, I'm Nate" card | 800×1000, portrait-ish  |
| `og.jpg`        | Link preview in DMs  | 1200×630                |

## Cropping the avatar

The avatar frame is square. A tall portrait dropped in as-is gets
center-cropped, which on a full-body shot lands on the chest and cuts the head
off. Two ways to handle it:

1. **Best:** crop to a square around the face before saving. Then nothing else
   to do.
2. **Or:** save the full portrait and adjust `--avatar-focus` in
   `src/styles/components.css` (under `.avatar`). It's currently `50% 26%`,
   tuned for a face in the upper third. Lower the second number to show more
   forehead, raise it to show more chest.

Size is `--avatar-size` right above it — currently `clamp(132px, 34vw, 172px)`.

`og.jpg` is what people see when the link gets shared in an Instagram DM or a
text message. Worth getting right — put his face and the name on it.
