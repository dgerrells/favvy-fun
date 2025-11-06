async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function downsampleImageData(imageData, scale) {
  const width = Math.floor(imageData.width * scale);
  const height = Math.floor(imageData.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  const tempContext = tempCanvas.getContext("2d");

  if (tempContext === null || context === null) {
    throw "failed to create context";
  }

  tempContext.putImageData(imageData, 0, 0);

  context.imageSmoothingEnabled = false;
  context.drawImage(tempCanvas, 0, 0, width, height);

  return context.getImageData(0, 0, width, height);
}

function colorSim(rgbColor, compareColor) {
  let i;
  let max;
  let d = 0;
  for (i = 0, max = rgbColor.length; i < max; i++) {
    d += (rgbColor[i] - compareColor[i]) * (rgbColor[i] - compareColor[i]);
  }
  return Math.sqrt(d);
}

function similarColor(actualColor, palette) {
  let selectedColor = [];
  let currentSim = colorSim(actualColor, palette[0]);
  let nextColor;
  palette.forEach((color) => {
    nextColor = colorSim(actualColor, color);
    if (nextColor <= currentSim) {
      selectedColor = color;
      currentSim = nextColor;
    }
  });
  return selectedColor;
}

function convertColorRange(pixels, palette) {
  for (var y = 0; y < pixels.height; y++) {
    for (var x = 0; x < pixels.width; x++) {
      var i = y * 4 * pixels.width + x * 4;
      const finalcolor = similarColor(
        [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]],
        palette
      );
      pixels.data[i] = finalcolor[0];
      pixels.data[i + 1] = finalcolor[1];
      pixels.data[i + 2] = finalcolor[2];
    }
  }
}

async function processImage(imagePath, targetWidth, colors = [
    [13, 43, 69],
    [32, 60, 86],
    [84, 78, 104],
    [141, 105, 122],
    [208, 129, 89],
    [255, 170, 94],
    [255, 212, 163],
    [255, 236, 214],
  ]) {
  const img = await loadImage(imagePath);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw "failed creating image context";
  }

  context.drawImage(img, 0, 0);
  const scaleFactor = Math.min(1, targetWidth / img.width);
  const originalImageData = context.getImageData(0, 0, img.width, img.height);
  const downsampledImageData = downsampleImageData(
    originalImageData,
    scaleFactor
  );
  convertColorRange(downsampledImageData, colors);
  const meshData = greedyMesh(downsampledImageData, 1);
  const finalW = Math.floor(img.width * scaleFactor);
  const finalH = Math.floor(img.height * scaleFactor);

  return { meshData, width: finalW, height: finalH };
}
