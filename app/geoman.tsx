import { useEffect } from "react";
import { useLeafletContext } from "@react-leaflet/core";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import L, { Layer, Map } from "leaflet";
import { joinIntersectingPolygons } from "@/helper/spatial";
import { GeoJSON } from "geojson";
// @ts-ignore
import { ControlledLayer } from "@react-leaflet/core/lib/context";
// @ts-ignore
import dissolve from "@turf/dissolve";


type GeomanProps = {
  previewLayer?: Layer,
  onChange?: (geojson: GeoJSON) => void,
  onReady?: (leafletContainer: ControlledLayer | Map) => void
}

const Geoman = (props: GeomanProps) => {
  const context = useLeafletContext();
  useEffect(() => {
    const leafletContainer: ControlledLayer | Map = context.layerContainer || context.map;
    props.onReady?.(leafletContainer);

    const handleChange = (e: any) => {
      if (e.layer && e.layer.pm) {
        let joinedPoly = joinIntersectingPolygons(leafletContainer.pm.getGeomanLayers(true).toGeoJSON().features);
        try {
          joinedPoly = dissolve(joinedPoly)
        } catch (e) {
          // silent error
        }

        leafletContainer.pm.getGeomanLayers(true).eachLayer((layer: Layer) => {
          // @ts-ignore
          if (layer.pm) {
            // @ts-ignore
            layer.pm.remove();
          }

          layer.remove();
        })

        leafletContainer.addLayer(L.geoJSON(joinedPoly), { pmIgnore: true });
        props.onChange?.(joinedPoly);
      }
    }

    leafletContainer.pm.addControls({
      position: 'topright',
      drawMarker: false,
      drawCircle: false,
      drawPolyline: false,
      drawCircleMarker: false,
      drawText: false,
      drawRectangle: false
    });

    leafletContainer.pm.setGlobalOptions({ pmIgnore: false });

    leafletContainer.on("pm:create", handleChange);
    leafletContainer.on("pm:edit", handleChange);

    return () => {
      leafletContainer.pm.removeControls();
      leafletContainer.pm.setGlobalOptions({ pmIgnore: true });
    };
  }, [context]);

  return null;
}

export default Geoman;
