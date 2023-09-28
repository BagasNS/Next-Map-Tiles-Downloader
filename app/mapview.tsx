"use client"

import { MapContainer, TileLayer } from 'react-leaflet'
import L, { Map } from 'leaflet';
import Geoman from "@/app/geoman";
// @ts-ignore
import { ControlledLayer } from "@react-leaflet/core/lib/context";

import 'leaflet/dist/leaflet.css';

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/images/marker-icon-2x.png',
  iconUrl: '/images/marker-icon.png',
  shadowUrl: '/images/marker-shadow.png'
});

type MapviewProps = {
  onEditorReady?: (leafletContainer: ControlledLayer | Map) => void,
}

export default function Mapview(props: MapviewProps) {
  return (
    <MapContainer
      center={[0.4174767746707514, 116.98037278187925]}
      zoom={5}
      scrollWheelZoom={true}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Geoman
        onReady={(leafletContainer) => props.onEditorReady?.(leafletContainer)}
      />
    </MapContainer>
  )
}
