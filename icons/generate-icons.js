const fs = require('fs');
const zlib = require('zlib');

// Create PNG buffer from RGBA pixel data
function createPNG(width, height, getPixel) {
  const rowSize = width * 4;
  const rawData = Buffer.alloc(height * (rowSize + 1));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(calculateCRC(typeAndData), 0);

    return Buffer.concat([len, typeAndData, crc]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = makeChunk('IHDR', ihdrData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Standard CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function calculateCRC(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Icon design: Modern purple circular badge with media music note + 3 equalizer lines
function renderIcon(x, y, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const r = width / 2 - 1;

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background circle with gradient
  if (dist > r) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  // Antialiasing on edge
  const edgeAlpha = Math.min(1, Math.max(0, r - dist));

  // Purple / Violet gradient
  const t = (y / height);
  const bgR = Math.round(108 + t * 30); // 108 -> 138
  const bgG = Math.round(74 + t * 20);   // 74 -> 94
  const bgB = Math.round(182 + t * 40);  // 182 -> 222
  let [fr, fg, fb, fa] = [bgR, bgG, bgB, edgeAlpha * 255];

  // Normalized coordinates: -1 to 1
  const nx = (x - cx) / (width / 2);
  const ny = (y - cy) / (height / 2);

  // Icon drawing: Chromium-style Global Media Control icon:
  // Music note on left + 3 horizontal bars on right
  // Bars on right:
  const inBarsX = nx >= -0.15 && nx <= 0.65;
  const bar1 = inBarsX && Math.abs(ny - (-0.4)) <= 0.08;
  const bar2 = inBarsX && Math.abs(ny - (0.0)) <= 0.08;
  const bar3 = inBarsX && Math.abs(ny - (0.4)) <= 0.08;

  // Music note on left:
  // Note stem: vertical line around nx = -0.35, ny from -0.4 to 0.2
  const stem = Math.abs(nx - (-0.35)) <= 0.07 && (ny >= -0.4 && ny <= 0.25);
  // Note notehead: circle at nx = -0.5, ny = 0.25
  const noteHeadDist = Math.sqrt(Math.pow((nx - (-0.48)), 2) + Math.pow((ny - 0.25), 2));
  const noteHead = noteHeadDist <= 0.18;
  // Note flag/beam: connects to right bar or flag
  const flag = (nx >= -0.35 && nx <= -0.15) && Math.abs(ny - (-0.4)) <= 0.08;

  if (bar1 || bar2 || bar3 || stem || noteHead || flag) {
    // White foreground
    return [255, 255, 255, Math.round(edgeAlpha * 255)];
  }

  return [fr, fg, fb, Math.round(fa)];
}

[16, 32, 48, 128].forEach(size => {
  const buf = createPNG(size, size, renderIcon);
  fs.writeFileSync(`icons/icon-${size}.png`, buf);
  console.log(`Generated icons/icon-${size}.png (${size}x${size})`);
});
