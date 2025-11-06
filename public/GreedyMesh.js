function greedyMesh(imageData, scaleFactor) {
  const { width, height, data } = imageData;
  const visited = new Array(width * height).fill(false);
  const divData = [];

  function getColor(x, y) {
    const index = (y * width + x) * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3] / 255;
    return [r, g, b, a];
  }

  function colorsMatch(x1, y1, x2, y2) {
    const index1 = (y1 * width + x1) * 4;
    const index2 = (y2 * width + x2) * 4;
    for (let i = 0; i < 4; i++) {
      if (data[index1 + i] !== data[index2 + i]) return false;
    }
    return true;
  }

  let vId = 0;
  let maxIds = 32;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (visited[y * width + x]) continue;
      let maxX = x;
      let maxY = y;

      // Expand in x direction
      while (
        maxX + 1 < width &&
        !visited[y * width + maxX + 1] &&
        colorsMatch(x, y, maxX + 1, y)
      ) {
        maxX++;
      }

      // Expand in y direction
      let expandY = true;
      while (expandY && maxY + 1 < height) {
        for (let i = x; i <= maxX; i++) {
          if (
            visited[(maxY + 1) * width + i] ||
            !colorsMatch(x, y, i, maxY + 1)
          ) {
            expandY = false;
            break;
          }
        }
        if (expandY) maxY++;
      }

      // Mark visited
      for (let i = x; i <= maxX; i++) {
        for (let j = y; j <= maxY; j++) {
          visited[j * width + i] = true;
        }
      }
      divData.push({
        width: (maxX - x + 1) * scaleFactor,
        height: (maxY - y + 1) * scaleFactor,
        color: getColor(x, y),
        x: x * scaleFactor,
        y: y * scaleFactor,
        z: 0,
      });
    }
  }
  divData.sort((a, b) => b.width * b.height - a.width * a.height);

  return divData;
}
