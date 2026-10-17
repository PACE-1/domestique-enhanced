# assets/

App icons in the three platform formats Shepherd ships.

| File | Format | Used by |
|---|---|---|
| `icon.png` | 256×256 PNG | Source-of-truth icon. Read by `build_dmg.sh` and pulled into the DMG background; copied into `static/` and served at `/static/icon.png` for the in-app `<link rel="icon">`. |
| `icon.icns` | macOS bundle icon | `shepherd.spec` `BUNDLE(icon='assets/icon.icns', ...)` — embedded in `dist/Shepherd.app/Contents/Resources/`. |
| `icon.ico` | Windows | `shepherd.spec` `EXE(icon='assets/icon.ico', ...)` — embedded in `dist/Shepherd/Shepherd.exe`. |
| `icon.iconset/` | Build-time staging | iconset folder used to regenerate `icon.icns`. Excluded from git via `.gitignore`. |

The whole `assets/` folder is shipped into the PyInstaller bundle via
`("assets","assets")` in `shepherd.spec` `datas=`, so the runtime
app can also read `icon.png` directly if needed.
