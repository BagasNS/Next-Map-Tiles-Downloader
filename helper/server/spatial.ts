import { Worker } from "worker_threads";
import path from "path";
import { prisma } from "@/helper/server/prisma";
import { randomUUID } from "crypto";
import { readJSONFile, saveJSONFile } from "@/helper/server/file";

// @ts-ignore
import { feature, Feature, featureCollection, FeatureCollection, polygon, Polygon } from "@turf/helpers";
// @ts-ignore
import { lat2tile, long2tile } from "@/helper/spatial";
// @ts-ignore
import BBOX from "@turf/bbox";
// @ts-ignore
import { centerOfMass, distance, multiPolygon } from "@turf/turf"


type GridTileType = {
  x: number,
  y: number,
  z: number,
  rect: Polygon
}

// Main function to generate grid tiles using worker threads
export async function generateGridTilesMultiThread(numThreads: number, selectedRegion: Feature | FeatureCollection, zoomLevel: number): Promise<Array<GridTileType>> {
  // Split calculation for multiple polygons and/or multi polygon for better performance
  if (zoomLevel <= 11) {
    return _generateGridTilesMultiThread(numThreads, selectedRegion, zoomLevel)
  }

  // zoom level more than 11, tile rects are smaller, using group by distance get better result on calculation time
  // Destructing Multi Polygon into Polygon
  const polygons = selectedRegion.features.flatMap((feature: Feature) => {
    if (feature.geometry.type === 'MultiPolygon') {
      return feature.geometry.coordinates.map((_polygon: Feature) => {
        return polygon(_polygon)
      })
    } else {
      return polygon(feature.geometry.coordinates)
    }
  })


  const maxDistanceThresholdKM = 1000;
  const minDistanceThresholdKM = 100;
  let distanceThresholdKM = Math.max(
    minDistanceThresholdKM,
    Math.min(maxDistanceThresholdKM, 1000 / (zoomLevel / 3))
  );

  const distanceThreshold = distanceThresholdKM * 1000;  // in meters

  // Group features into multipolygons based on the distance threshold
  const groupedFeatures = [];

  // Iterate through each feature and group them
  for (const feature of polygons) {
    let grouped = false;

    // Calculate the bbox of the feature
    const featureBbox = BBOX(feature.geometry);

    // Check if the feature can be grouped with an existing multipolygon
    for (const group of groupedFeatures) {
      // Calculate the bbox of the group
      const groupBbox = BBOX(group);

      // Measure the distance between the bboxes
      const _distance = distance(featureBbox, groupBbox, { units: 'meters' });

      if (_distance <= distanceThreshold) {
        // Add the feature to the existing multipolygon
        group.geometry.coordinates.push(feature.geometry.coordinates);
        grouped = true;
        break;
      }
    }

    // If not grouped with any existing multipolygon, create a new one
    if (!grouped) {
      groupedFeatures.push(multiPolygon([feature.geometry.coordinates]));
    }
  }

  // Great way to destroy ur pc :)
  const tiles = await Promise.all(groupedFeatures.map((feature: Feature) => {
    return _generateGridTilesMultiThread(numThreads, feature, zoomLevel);
  }))
  return tiles.flat()

  const allTiles = [];
  for (let feature of groupedFeatures) {
    const tiles = await _generateGridTilesMultiThread(numThreads, feature, zoomLevel);
    allTiles.push(...tiles)
  }

  return allTiles;
}

export async function _generateGridTilesMultiThread(numThreads: number, selectedRegion: Feature | FeatureCollection, zoomLevel: number, saveCache: boolean = true): Promise<Array<GridTileType>> {
  // Find Calculation Cache Start
  const dbCache = await prisma.calculationGridTileCache.findFirst({
    where: {
      region: JSON.stringify(selectedRegion),
      zoomLevel
    }
  });

  if (dbCache) {
    // Read Cache File
    let cacheContent: Array<GridTileType> = [];
    try {
      // return result from cache
      cacheContent = await readJSONFile(dbCache.resultFile);
    } catch (e) {
      // silent error
    }

    if (cacheContent.length > 0) {
      return cacheContent
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
    await sleep(1)
  }


  // Save Result to Cache Start
  if (saveCache) {
    const cacheFilename = randomUUID() + '.json';
    const cacheDir = path.resolve('./', 'cache/grid-tile-calculation');

    const saveJSONFilePromise = saveJSONFile(cacheDir, cacheFilename, allGridTiles);
    const upsertPromise = prisma.calculationGridTileCache.upsert({
      where: {
        region_zoomLevel: {
          region: JSON.stringify(selectedRegion),
          zoomLevel
        }
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
    });

    await Promise.all([saveJSONFilePromise, upsertPromise]).catch((e) => {
      // Handle errors
      console.error('Failed Save Grid Tiles Calculation Cache', e);
    });
  }

  return allGridTiles
}

const sleep = (ms: number) => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  })
}
