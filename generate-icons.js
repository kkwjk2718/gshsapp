const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svgPath = path.join(__dirname, 'public', 'icons', 'icon.svg');
const outputDir = path.join(__dirname, 'public', 'icons');

async function generateIcons() {
    const svgBuffer = await fs.readFile(svgPath);

    for (const size of sizes) {
        await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(path.join(outputDir, `icon-${size}x${size}.png`));

        console.log(`Generated icon-${size}x${size}.png`);
    }

    console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
