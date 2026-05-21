# App Icons

Place your app icons here before building:

- `icon.ico`  — Windows (256x256, .ico format)
- `icon.icns` — macOS (.icns format)  
- `icon.png`  — Linux (512x512 PNG)

You can generate all three from a single PNG using:
  https://www.icoconverter.com  (for .ico)
  https://cloudconvert.com      (for .icns)

Or use the electron-builder icon generator:
  npx electron-icon-builder --input=./assets/source.png --output=./assets
