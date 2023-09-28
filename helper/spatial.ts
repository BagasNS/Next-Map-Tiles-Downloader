// @ts-ignore
import { Feature, featureCollection, point } from "@turf/helpers";
// @ts-ignore
import BBOX from '@turf/bbox'
// @ts-ignore
import booleanOverlap from '@turf/boolean-overlap';
// @ts-ignore
import union from "@turf/union";
// @ts-ignore
import bboxPolygon from "@turf/bbox-polygon";

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
  var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

export function _getTileRect(x: number, y: number, zoom: number) {
  const c1 = point([tile2long(x, zoom), tile2lat(y, zoom)]);
  const c2 = point([tile2long(x + 1, zoom), tile2lat(y + 1, zoom)]);
  return bboxPolygon(BBOX(featureCollection([c1, c2])));
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
