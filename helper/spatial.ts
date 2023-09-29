// @ts-ignore
import { Feature, featureCollection, GeometryTypes } from "@turf/helpers";
// @ts-ignore
import booleanOverlap from '@turf/boolean-overlap';
// @ts-ignore
import union from "@turf/union";


export function long2tile(lon: number, zoom: number) {
  return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
}

export function lat2tile(lat: number, zoom: number) {
  return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
}

export function tile2long(x: number, z: number) {
  return (x / Math.pow(2, z) * 360 - 180);
}

export function tile2lat(y: number, z: number) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

export function joinIntersectingPolygons(polygons: Feature) {
  // Initialize an empty feature collection to store the result
  let resultFeatures = [];

  // Iterate through each polygon
  for (let i = 0; i < polygons.length; i++) {
    let currentPolygon = polygons[i];
    let joined = false;

    // Check if the current polygon intersects with any of the previous polygons
    for (let j = 0; j < resultFeatures.length; j++) {
      let previousPolygon = resultFeatures[j];

      // If there is an intersection, union the polygons
      if (booleanOverlap(currentPolygon, previousPolygon)) {
        currentPolygon = union(currentPolygon, previousPolygon);
        resultFeatures[j] = currentPolygon;
        joined = true;
        break;
      }
    }

    // If the current polygon didn't intersect with any previous polygons, add it to the result
    if (!joined) {
      resultFeatures.push(currentPolygon);
    }
  }

  // Convert the feature collection to a GeoJSON object
  return featureCollection(resultFeatures);
}

export function isValidGeoJSON(json: JSON | string, geometryType?: GeometryTypes | Array<GeometryTypes>) {
  try {
    // Try to parse the JSON string
    let obj;
    if (typeof json === 'string') {
      obj = JSON.parse(json as string);
    } else {
      obj = json
    }

    // Check for GeoJSON properties and structure
    if (
      obj &&
      obj.type &&
      typeof obj.type === 'string' &&
      obj.features &&
      Array.isArray(obj.features)
    ) {
      for (const feature of obj.features) {
        if (!feature.geometry || typeof feature.geometry !== 'object') {
          return false;
        }

        if (geometryType) {
          if (Array.isArray(geometryType)) {
            if (!geometryType.includes(feature.geometry.type)) {
              return false;
            }
          } else {
            if (!feature.geometry.type !== geometryType) {
              return false;
            }
          }
        }
      }

      // If all checks pass, it's a valid GeoJSON
      return true;
    }

    // If any of the checks fail, it's not a valid GeoJSON
    return false;
  } catch (error) {
    // JSON parsing error
    return false;
  }
}
