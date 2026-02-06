# PWA Icon Generation

The PWA requires icons in multiple sizes. Currently using a temporary SVG placeholder.

## Required Icon Sizes:
- 72x72
- 96x96
- 128x128
- 144x144
- 152x152
- 192x192
- 384x384
- 512x512

## To Generate PNG Icons:

You can use an online tool or command-line tool to convert the SVG to PNG at different sizes:

### Option 1: Using an online tool
1. Upload `public/icons/icon.svg` to https://realfavicongenerator.net/
2. Download the generated icons
3. Place them in `public/icons/`

### Option 2: Using sharp (Node.js)
```bash
npm install sharp
node generate-icons.js
```

### Option 3: Manual replacement
Replace `icon.svg` with your actual GSHS logo and regenerate the PNGs.

## Current Icon:
A temporary gradient icon with "GSHS" text in white on an indigo-to-purple gradient background.
