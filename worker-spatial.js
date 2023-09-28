const { parentPort, workerData } = require("worker_threads");
const turf = require('@turf/turf')

function tile2lat(y, z) {
  var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

function tile2long(x, z) {
  return (x / Math.pow(2, z) * 360 - 180);
}

function _getTileRect(x, y, zoom) {
  const c1 = turf.point([tile2long(x, zoom), tile2lat(y, zoom)]);
  const c2 = turf.point([tile2long(x + 1, zoom), tile2lat(y + 1, zoom)]);
  return turf.bboxPolygon(turf.bbox(turf.featureCollection([c1, c2])));
}

function generateGridTilesWorker(selectedRegion, zoomLevel, tileRange) {
  const gridTiles = [];

  for (let y = tileRange.startY; y <= tileRange.endY; y++) {
    for (let x = tileRange.startX; x <= tileRange.endX; x++) {
      // Generate grid tile and check for intersection
      const tileRect = _getTileRect(x, y, zoomLevel);
      if (turf.booleanIntersects(selectedRegion, tileRect)) {
        gridTiles.push({ x, y, z: zoomLevel, rect: tileRect });
      }
    }
  }

  return gridTiles;
}

parentPort?.once('message', () => {
  const { selectedRegion, zoomLevel, tileRange } = workerData;
  const result = generateGridTilesWorker(selectedRegion, zoomLevel, tileRange);
  parentPort?.postMessage(result);
});
