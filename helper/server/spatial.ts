import { Worker } from "worker_threads";
import path from "path";
import { prisma } from "@/helper/server/prisma";
import { randomUUID } from "crypto";
import { readJSONFile, saveJSONFile } from "@/helper/server/file";

// @ts-ignore
import { Feature, FeatureCollection, Polygon } from "@turf/helpers";
// @ts-ignore
import booleanIntersects from "@turf/boolean-intersects";
// @ts-ignore
import { _getTileRect, lat2tile, long2tile } from "@/helper/spatial";
// @ts-ignore
import BBOX from "@turf/bbox";


type GridTileType = {
  x: number,
  y: number,
  z: number,
  rect: Polygon
}

// Main function to generate grid tiles using worker threads
export async function generateGridTilesMultiThread(numThreads: number, selectedRegion: Feature | FeatureCollection, zoomLevel: number): Promise<Array<GridTileType>> {
  // Find Calculation Cache Start
  const dbCache = await prisma.calculationGridTileCache.findFirst({
    where: {
      region: JSON.stringify(selectedRegion),
      zoomLevel
    }
  });

  if (dbCache) {
    console.log('Calculation Cache Found!')
    // Read Cache File
    try {
      // return result from cache
      // const cacheContent = fs.readFileSync(dbCache.resultFile, 'utf-8');
      // return JSON.parse(cacheContent)
      return readJSONFile(dbCache.resultFile);
    } catch (e) {
      // silent error
    }
  }
  // Find Calculation Cache End
  const bbox = BBOX(selectedRegion); // Bounding box of the selected region
  const tileRanges = []; // Divide tile coordinates into ranges for each thread

  // Calculate start and end X and Y values for the tile range
  const startX = Math.max(0, long2tile(bbox[0], zoomLevel));
  const endX = Math.min(
    Math.pow(2, zoomLevel) - 1,
    long2tile(bbox[2], zoomLevel)
  );
  const startY = Math.max(0, lat2tile(bbox[3], zoomLevel));
  const endY = Math.min(
    Math.pow(2, zoomLevel) - 1,
    lat2tile(bbox[1], zoomLevel)
  );

  // Divide the tile coordinates into ranges for each thread
  for (let i = 0; i < numThreads; i++) {
    const rangeWidth = Math.ceil((endX - startX + 1) / numThreads);
    const rangeStartX = startX + i * rangeWidth;
    const rangeEndX = Math.min(rangeStartX + rangeWidth - 1, endX);

    tileRanges.push({
      startX: rangeStartX,
      endX: rangeEndX,
      startY,
      endY
    });
  }

  const workers = [];

  // Create worker threads
  for (const tileRange of tileRanges) {
    const worker = new Worker(path.resolve('./', 'worker-spatial.js'), {
      workerData: { selectedRegion, zoomLevel, tileRange }
    });
    workers.push(worker);
  }

  // Handle worker results and merge them into a single array
  const allGridTiles: Array<GridTileType> = [];
  let workersCompleted = 0;
  let isCompleted = false;

  for (const worker of workers) {
    worker.on('message', async (message: Array<GridTileType>) => {
      for (const tile of message) {
        allGridTiles.push(tile);
      }

      workersCompleted++;
      if (workersCompleted === numThreads) {
        // All workers have completed their tasks
        isCompleted = true
      }
    });

    // Start the worker
    worker.postMessage('start');
  }

  while (!isCompleted) {
    await sleep(100)
  }


  // Save Result to Cache Start
  const cacheFilename = randomUUID() + '.json';
  const cacheDir = path.resolve('./', 'cache/grid-tile-calculation');

  try {
    await saveJSONFile(cacheDir, cacheFilename, allGridTiles)

    await prisma.calculationGridTileCache.upsert({
      where: {
        region: JSON.stringify(selectedRegion),
        zoomLevel
      },
      update: {
        region: JSON.stringify(selectedRegion),
        zoomLevel

      },
      create: {
        region: JSON.stringify(selectedRegion),
        resultFile: `${cacheDir}/${cacheFilename}`,
        zoomLevel
      }
    })
  } catch (e) {
    // silent error
  }
  // Save Result to Cache End

  return allGridTiles
}

const sleep = (ms: number) => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  })
}
