# Editing the user manuals

The manuals open from **User manual** in the app's footer. There's one manual for each role:

| File | Manual |
|---|---|
| `staff.md` | Staff (providers) |
| `reception.md` | Reception |
| `admin.md` | Admin |

Pages that every manual shares are in `shared/`, and the screenshots are in `img/`.

## Changing the text

1. Open the file in VS Code. To see it laid out as it will appear, press **Cmd+Shift+V** (Mac) or **Ctrl+Shift+V** (Windows).
2. Edit the text. It's plain Markdown:
   - `## Heading` starts a section. Every `##` heading also appears in the manual's Contents list.
   - `### Smaller heading` starts a sub-section.
   - `**bold**` makes text bold.
   - A line starting with `- ` is a bullet point, and `1. ` makes a numbered step.
   - A line starting with `> ` is a highlighted tip.
   - `![Description](img/file.png)` shows a picture. In files inside `shared/`, write `../img/file.png`.
3. Save, then commit and push. The manual updates when the site does.

## Sharing pages between manuals

A manual pulls in a shared page with a line like this:

```
<!-- include: shared/schedule.md -->
```

Change a shared page once, and every manual that includes it updates.

To show some text in only some manuals, wrap it like this:

```
<!-- only: reception, admin -->
This paragraph only appears in the Reception and Admin manuals.
<!-- end -->
```

These lines are hidden when the manual is shown in the app. VS Code's preview shows the text inside `only` blocks in every file.

## Screenshots

The screenshots were taken from a test copy of the app using made-up staff and patients, so no real patient information appears. To replace one, save a new picture over the file in `img/` with the same name. Or ask Claude to retake it.
