import { NextRequest, NextResponse } from "next/server";
import { array, number, object, string, ValidationError } from "yup";
import { generateGridTilesMultiThread } from "@/helper/server/spatial";
import { cpus } from "os";

// Define a Yup schema for a single GeoJSON Feature
const featureSchema = object().shape({
  type: string().required().strict().oneOf(['Feature']),
  geometry: object().shape({
    type: string().required().strict().oneOf(['Polygon', 'MultiPolygon']),
    coordinates: array().of(array().of(number())).required()
  }).required(),
  properties: object()
});

// Define a Yup schema for a GeoJSON FeatureCollection
const featureCollectionSchema = object().shape({
  type: string().required().strict().oneOf(['FeatureCollection']),
  features: array().of(featureSchema).required()
});

const postSchema = object({
  zoom: number().min(1).required(),
  region: featureCollectionSchema
})

export async function POST(req: NextRequest) {
  const res = NextResponse;

  let requestData;
  try {
    requestData = await req.json();
  } catch (e) {
    return res.json({
      status: 'error',
      code: 400,
      message: 'bad request',
      errors: []
    }, { status: 400 })
  }

  // validate request
  let validatedData;
  try {
    validatedData = await postSchema.validate(requestData, { abortEarly: false })
  } catch (e: any) {
    const errors = e.errors as ValidationError
    return res.json({
      status: 'error',
      code: 400,
      message: 'bad request',
      errors
    }, { status: 400 })
  }

  let tiles;
  try {
    tiles = await generateGridTilesMultiThread(cpus().length, requestData.region, validatedData.zoom);
  } catch (e) {
    return res.json({
      status: 'error',
      code: 400,
      message: 'internal server error',
      error: e
    }, { status: 400 })
  }

  const previewFeature = tiles.map(tile => tile.rect);

  // possible failed send response due to data is exceeding JSON size limit
  try {
    return res.json({
      status: 'success',
      code: 200,
      data: previewFeature
    })
  } catch (e) {
    console.error(e);
    return res.json({
      status: 'error',
      code: 500,
      message: 'data is too large to serve via JSON response'
    }, { status: 500 })
  }
}
