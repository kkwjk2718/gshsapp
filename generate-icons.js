const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const sourcePath = path.join(__dirname, 'public', 'icons', 'icon-source.png');
const outputDir = path.join(__dirname, 'public', 'icons');
const appDir = path.join(__dirname, 'src', 'app');

function buildIcon(sourceBuffer, size) {
    return sharp(sourceBuffer)
        .trim({ threshold: 8 })
        .extend({
            top: 32,
            bottom: 32,
            left: 32,
            right: 32,
            background: '#ffffff',
        })
        .resize(size, size)
        .png();
}

async function generateIcons() {
    const sourceBuffer = await fs.readFile(sourcePath);

    for (const size of sizes) {
        await buildIcon(sourceBuffer, size)
            .toFile(path.join(outputDir, `icon-${size}x${size}.png`));

        console.log(`Generated icon-${size}x${size}.png`);
    }

    await buildIcon(sourceBuffer, 512)
        .toFile(path.join(appDir, 'icon.png'));

    await buildIcon(sourceBuffer, 180)
        .toFile(path.join(appDir, 'apple-icon.png'));

    console.log('Generated app icon.png and apple-icon.png');
    console.log('If you replace the source image, also regenerate src/app/favicon.ico from the same asset.');
}

generateIcons().catch(console.error);
